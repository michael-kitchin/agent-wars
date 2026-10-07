"""Export strategic and tactical terrain metadata for one region."""

from __future__ import annotations

import logging
import time
from collections.abc import Mapping
from dataclasses import dataclass

import rasterio

from scripts.terrain_pipeline.config import PipelineConfig
from scripts.terrain_pipeline.geometry_bounds import bounds_for_cells
from scripts.terrain_pipeline.metadata_export_core import (
    MetadataMaskSources,
    build_mask_contexts,
    build_metadata_rows,
    build_point_indexes,
    close_rasters,
    load_metadata_mask_sources,
    open_metadata_rasters,
    write_metadata_file,
)
from scripts.terrain_pipeline.resolution_profile import strategic_profile, tactical_profile

from .region_manifest import RegionManifest
from .region_paths import RegionPaths

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, eq=False)
class SharedMetadataInputs:
    """
    Why this exists:
        Open mask sources and rasters once when several regions are exported together.
    When to use:
        Around a loop of ``export_region_metadata`` calls.
    What to expect:
        Rasters stay open until ``close_shared_metadata_inputs``.
    """

    # Pipeline paths and sample counts.
    config: PipelineConfig
    # Ocean, lake, and urban geometries.
    sources: MetadataMaskSources
    # Open land-cover and topography readers, keyed by raster name.
    rasters: Mapping[str, rasterio.DatasetReader]


def open_shared_metadata_inputs(config: PipelineConfig) -> SharedMetadataInputs:
    """
    Why this exists:
        Load geometries and rasters before the first region's cell loop.
    When to use:
        Once per process that exports metadata.
    What to expect:
        Raises when a shapefile or raster is missing. Call ``close_shared_metadata_inputs`` when finished.
    """

    LOGGER.debug("open_shared_metadata_inputs root=%s.", config.input_rasters.root)
    sources = load_metadata_mask_sources(config)
    rasters = open_metadata_rasters(config)
    return SharedMetadataInputs(config=config, sources=sources, rasters=rasters)


def close_shared_metadata_inputs(shared: SharedMetadataInputs) -> None:
    """
    Why this exists:
        Release raster handles opened for a regional metadata run.
    When to use:
        In a ``finally`` block after the last region.
    What to expect:
        Closes every reader in ``shared.rasters``.
    """

    LOGGER.debug("close_shared_metadata_inputs rasters=%d.", len(shared.rasters))
    close_rasters(shared.rasters)


def export_region_metadata(
    manifest: RegionManifest,
    paths: RegionPaths,
    shared: SharedMetadataInputs,
    *,
    max_tactical_cells: int | None = None,
) -> None:
    """
    Why this exists:
        Write strategic and tactical metadata for the cells in one manifest.
    When to use:
        After the manifest exists. ``max_tactical_cells`` is only for a short smoke test.
    What to expect:
        Writes both metadata files. A ``None`` clip bound means the pass does not clip.
        Logs the wall time of each pass.
    """

    LOGGER.debug(
        "export_region_metadata region=%s max_tactical_cells=%s.",
        manifest.region_id,
        max_tactical_cells,
    )
    strategic_cells = manifest.footprint.strategic_cells()
    tactical_cells = manifest.footprint.tactical_cells()
    if max_tactical_cells is not None:
        tactical_cells = tactical_cells[:max_tactical_cells]
    clip_bounds = bounds_for_cells(strategic_cells)
    points = build_point_indexes(
        shared.config,
        (manifest.footprint.strategic_resolution, manifest.footprint.tactical_resolution),
    )
    paths.folder.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    strategic = strategic_profile(manifest.footprint.strategic_resolution, shared.config)
    strategic_rows = build_metadata_rows(
        strategic_cells,
        strategic,
        build_mask_contexts(shared.sources, strategic, clip_bounds),
        points,
        shared.rasters,
        clip_bounds=clip_bounds,
    )
    write_metadata_file(paths.metadata_s, strategic.resolution, strategic_rows)
    LOGGER.info(
        "Strategic metadata for %s wrote %d rows in %.1fs.",
        manifest.region_id,
        len(strategic_rows),
        time.perf_counter() - started,
    )
    started = time.perf_counter()
    tactical = tactical_profile(manifest.footprint.tactical_resolution, shared.config)
    tactical_rows = build_metadata_rows(
        tactical_cells,
        tactical,
        build_mask_contexts(shared.sources, tactical, clip_bounds),
        points,
        shared.rasters,
        clip_bounds=clip_bounds,
    )
    write_metadata_file(paths.metadata_t, tactical.resolution, tactical_rows)
    LOGGER.info(
        "Tactical metadata for %s wrote %d rows in %.1fs.",
        manifest.region_id,
        len(tactical_rows),
        time.perf_counter() - started,
    )
