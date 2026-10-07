"""
Export per-hex terrain feature metadata (JSON) without final terrain classification.
"""

from __future__ import annotations

import logging
import math
from typing import List

import h3

from .config import PipelineConfig, build_default_config
from .metadata_export_core import (
    build_mask_contexts,
    build_metadata_rows,
    build_point_indexes,
    close_rasters,
    compose_forest_mean,
    load_metadata_mask_sources,
    open_metadata_rasters,
    write_metadata_file,
)
from .pipeline import TerrainPipeline
from .resolution_profile import strategic_profile, tactical_profile

LOGGER = logging.getLogger(__name__)


def _generate_cells_for_resolution(resolution: int) -> List[str]:
    cells: List[str] = []
    for res0 in h3.get_res0_cells():
        cells.extend(h3.cell_to_children(res0, resolution))
    return sorted(set(cells))


class TerrainMetadataExporter:
    """
    Why this exists:
        Run validation and emit full-world per-hex JSON metadata for res-1 and res-4.
    When to use:
        Invoked from ``metadata_cli`` after environment checks pass.
    What to expect:
        Writes two JSON files under ``config.output_dir``; does not modify terrain CSV outputs.
    """

    def __init__(self, config: PipelineConfig) -> None:
        self._config = config
        self._config.output_dir.mkdir(parents=True, exist_ok=True)

    def validate_environment(self) -> None:
        """
        Why this exists:
            Reuse phase-1 gates (DB extensions, rasters, shapefiles) before expensive metadata extraction.
        When to use:
            First step of ``run`` or standalone ``validate`` command.
        What to expect:
            Raises ``RuntimeError`` or driver errors when prerequisites are missing.
        """

        LOGGER.debug("Starting metadata pipeline environment validation.")
        self.validate_threshold_contract()
        TerrainPipeline(self._config).validate_phase_1_environment()
        LOGGER.info("Metadata pipeline environment validation passed.")

    def validate_threshold_contract(self) -> None:
        """
        Why this exists:
            Fail fast on invalid threshold payloads before expensive geometry/raster processing begins.
        When to use:
            Called by ``validate_environment`` and ``run`` for defensive contract checks.
        What to expect:
            Raises ``ValueError`` when a threshold is missing, non-numeric, or non-finite.
        """

        LOGGER.debug("Validating metadata threshold contract.")
        thresholds = self._config.thresholds.__dict__
        for key, value in thresholds.items():
            if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                raise ValueError(
                    f"Invalid threshold value for {key}: {value!r}. "
                    "Thresholds must be finite numeric values."
                )
        LOGGER.info("Metadata threshold contract validated.")

    def run(self, max_child_cells: int | None = None) -> None:
        """
        Why this exists:
            Produce ``terrain_res1_metadata.json`` and ``terrain_res4_metadata.json``.
        When to use:
            After ``validate_environment`` succeeds (or call ``run_all`` which validates first).
        What to expect:
            Deterministic ordering by H3 index; pretty-printed JSON; long CPU time for full global runs.
        """

        LOGGER.debug(
            "Starting terrain metadata export (max_child_cells=%s).",
            max_child_cells,
        )
        self.validate_threshold_contract()
        cfg = self._config
        strategic_cells = _generate_cells_for_resolution(cfg.res_parent)
        tactical_cells = _generate_cells_for_resolution(cfg.res_child)
        if max_child_cells is not None:
            tactical_cells = tactical_cells[: max(0, max_child_cells)]
        sources = load_metadata_mask_sources(cfg)
        points = build_point_indexes(cfg, (cfg.res_parent, cfg.res_child))
        rasters = open_metadata_rasters(cfg)
        try:
            strategic = strategic_profile(cfg.res_parent, cfg)
            strategic_rows = build_metadata_rows(
                strategic_cells,
                strategic,
                build_mask_contexts(sources, strategic, None),
                points,
                rasters,
            )
            write_metadata_file(cfg.output_dir / cfg.terrain_res1_metadata_filename, cfg.res_parent, strategic_rows)
            tactical = tactical_profile(cfg.res_child, cfg)
            tactical_rows = build_metadata_rows(
                tactical_cells,
                tactical,
                build_mask_contexts(sources, tactical, None),
                points,
                rasters,
            )
            write_metadata_file(cfg.output_dir / cfg.terrain_res4_metadata_filename, cfg.res_child, tactical_rows)
        finally:
            close_rasters(rasters)
        LOGGER.info("Terrain metadata export complete.")

    def run_all(self, max_child_cells: int | None = None) -> None:
        """
        Why this exists:
            One-shot entry that validates then exports metadata artifacts.
        When to use:
            Normal CLI ``run`` path.
        What to expect:
            Stops on first validation failure without writing partial outputs beyond semantics (none before validate).
        """

        LOGGER.debug("run_all: validate then export.")
        self.validate_environment()
        self.run(max_child_cells=max_child_cells)


def build_default_metadata_exporter() -> TerrainMetadataExporter:
    """
    Why this exists:
        Construct an exporter with the same default config as the main terrain pipeline.
    When to use:
        CLI bootstrap and focused tests that need a configured exporter.
    What to expect:
        Output directory is created eagerly under default ``PipelineConfig.output_dir``.
    """

    return TerrainMetadataExporter(build_default_config())
