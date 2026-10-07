"""Run regional export steps in a fixed order."""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Final

from scripts.terrain_pipeline.config import build_default_config

from .region_catalog import region_by_id
from .region_manifest import read_manifest
from .region_paths import RegionPaths
from .regional_landmass import export_region_landmass
from .regional_metadata import close_shared_metadata_inputs, export_region_metadata, open_shared_metadata_inputs
from .regional_naming import export_region_naming
from .regional_road_rail import export_region_road_rail_sides, export_region_road_rail_vectors
from .regional_weather import export_region_weather

LOGGER = logging.getLogger(__name__)

# Export order. Later steps read files written by earlier steps.
STEP_ORDER: Final = (
    "metadata",
    "naming",
    "landmass",
    "weather",
    "road-rail-sides",
    "road-rail-vectors",
)


@dataclass(frozen=True)
class RunOptions:
    """
    Why this exists:
        Carry the step list, data root, and resume flags for one regional run.
    When to use:
        The run command, before ``run_region_steps``.
    What to expect:
        ``steps`` is a subset of ``STEP_ORDER``. ``max_tactical_cells`` limits only the tactical metadata smoke test.
    """

    # Steps to run, in the caller's order. Execution still follows ``STEP_ORDER``.
    steps: tuple[str, ...]
    # Directory containing Natural Earth shapefiles and rasters.
    data_root: Path
    # Skip a step whose outputs are already complete.
    skip_existing: bool
    # Write only this many tactical metadata rows. None writes every tactical cell.
    max_tactical_cells: int | None


def _step_paths(paths: RegionPaths, step: str) -> tuple[Path, ...]:
    """
    Why this exists:
        Name the files a step must have written before it can be skipped.
    When to use:
        From the skip-existing check.
    What to expect:
        One or more paths. Unknown steps raise ``KeyError``.
    """

    outputs = {
        "metadata": (paths.metadata_s, paths.metadata_t),
        "naming": (paths.naming_s, paths.naming_t),
        "landmass": (paths.landmass_s, paths.landmass_qa),
        "weather": (paths.weather_s,),
        "road-rail-sides": (paths.road_rail_sides_t,),
        "road-rail-vectors": (paths.road_rail_vectors_t,),
    }
    return outputs[step]


def _metadata_is_complete(paths: RegionPaths, tactical_count: int) -> bool:
    """
    Why this exists:
        Treat a smoke-test tactical file as incomplete so the full export replaces it.
    When to use:
        When skip-existing considers the metadata step.
    What to expect:
        True only when both metadata files exist and the tactical record count matches the full child set.
    """

    if not paths.metadata_s.is_file() or not paths.metadata_t.is_file():
        return False
    document = json.loads(paths.metadata_t.read_text(encoding="utf-8"))
    return document.get("record_count") == tactical_count


def run_region_steps(region_ids: Sequence[str], options: RunOptions) -> None:
    """
    Why this exists:
        Export the requested steps for each region that already has a manifest.
    When to use:
        The run command.
    What to expect:
        Opens rasters once when metadata is requested and closes them afterward.
        Skips a complete step when ``skip_existing`` is set.
    Exceptions:
        ``NotImplementedError`` for steps that are not wired yet.
        ``FileNotFoundError`` or ``ValueError`` when a manifest is missing or invalid.
    """

    LOGGER.debug(
        "run_region_steps regions=%s steps=%s skip_existing=%s max_tactical_cells=%s.",
        list(region_ids),
        options.steps,
        options.skip_existing,
        options.max_tactical_cells,
    )
    unknown = [step for step in options.steps if step not in STEP_ORDER]
    if unknown:
        raise ValueError(f"Unknown steps: {', '.join(unknown)}")
    config = build_default_config()
    config = replace(config, input_rasters=replace(config.input_rasters, root=options.data_root))
    shared = None
    try:
        if "metadata" in options.steps:
            shared = open_shared_metadata_inputs(config)
        for region_id in region_ids:
            region_by_id(region_id)
            paths = RegionPaths.for_region(region_id)
            manifest = read_manifest(paths.manifest)
            for step in STEP_ORDER:
                if step not in options.steps:
                    continue
                if options.skip_existing and step == "metadata" and _metadata_is_complete(
                    paths, len(manifest.footprint.tactical_cells())
                ):
                    LOGGER.info("Skipping complete metadata for %s.", region_id)
                    continue
                if options.skip_existing and step != "metadata" and all(
                    path.is_file() for path in _step_paths(paths, step)
                ):
                    LOGGER.info("Skipping existing %s for %s.", step, region_id)
                    continue
                if step == "metadata":
                    if shared is None:
                        raise RuntimeError("Metadata inputs were not opened.")
                    export_region_metadata(
                        manifest,
                        paths,
                        shared,
                        max_tactical_cells=options.max_tactical_cells,
                    )
                elif step == "naming":
                    export_region_naming(manifest, paths, options.data_root)
                elif step == "landmass":
                    export_region_landmass(manifest, paths, config)
                elif step == "weather":
                    export_region_weather(manifest, paths)
                elif step == "road-rail-sides":
                    export_region_road_rail_sides(manifest, paths, options.data_root)
                elif step == "road-rail-vectors":
                    export_region_road_rail_vectors(manifest, paths, options.data_root)
                else:
                    raise NotImplementedError(f"Regional step {step} is not wired yet.")
    except Exception:
        LOGGER.error("Regional steps failed.", exc_info=True)
        raise
    finally:
        if shared is not None:
            close_shared_metadata_inputs(shared)
