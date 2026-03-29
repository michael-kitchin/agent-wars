"""
Export per-hex terrain feature metadata (JSON) without final terrain classification.
"""

from __future__ import annotations

import logging
import math
from dataclasses import asdict
from pathlib import Path
from typing import Any, List, Sequence

import h3
import rasterio
from shapely.ops import unary_union

from .config import PipelineConfig, build_default_config
from .metadata_io import (
    build_metadata_envelope,
    record_res1_to_json_dict,
    record_res4_to_json_dict,
    write_json_document,
)
from .metadata_models import HexMetadataRecordRes1, HexMetadataRecordRes4, UrbanRankMaskEntry
from .point_features import PointCountIndex, build_pair_indexes
from .urban_scalerank import load_urban_contexts_by_scalerank
from .ocean_mask import (
    OceanPredicateContext,
    build_ocean_predicate_context,
    load_ocean_union_wgs84,
    mask_metrics_for_cell_polygon,
)
from .pipeline import TerrainPipeline
from .sampling import (
    _ensure_proj_data_env,
    cell_polygon,
    deterministic_points_within_polygon,
    sample_many_rasters,
)

LOGGER = logging.getLogger(__name__)


def compose_forest_mean(sampled: dict[str, float | None]) -> float | None:
    """
    Why this exists:
        Match classifier interior logic: forest signal is the sum of class 1–4 prevalence means.
    When to use:
        After ``sample_many_rasters`` for land-cover layers.
    What to expect:
        Returns ``None`` only when all four class means are missing; partial coverage sums available classes.
    """

    vals = [sampled.get(f"class_{i}") for i in range(1, 5)]
    if all(v is None for v in vals):
        return None
    return float(sum(v for v in vals if v is not None))


def _generate_cells_for_resolution(resolution: int) -> List[str]:
    cells: List[str] = []
    for res0 in h3.get_res0_cells():
        cells.extend(h3.cell_to_children(res0, resolution))
    return sorted(set(cells))


def _ocean_path(config: PipelineConfig) -> Path:
    r = config.input_rasters
    return r.root / r.ocean_shapefile_name


def _lake_path(config: PipelineConfig) -> Path:
    r = config.input_rasters
    return r.root / r.lake_shapefile_name


def _urban_path(config: PipelineConfig) -> Path:
    r = config.input_rasters
    return r.root / r.urban_shapefile_name


def _water_context_for_resolution(config: PipelineConfig, resolution: int) -> OceanPredicateContext:
    """
    Why this exists:
        Mirror classification water masks: ocean-only at res parent, ocean∪lakes at res child.
    When to use:
        Before iterating cells for a given resolution.
    What to expect:
        First call may be CPU-heavy while building prepared Web Mercator geometry.
    """

    LOGGER.debug(
        "Building water predicate context for resolution %d (res_parent=%d).",
        resolution,
        config.res_parent,
    )
    if resolution == config.res_parent:
        return build_ocean_predicate_context(load_ocean_union_wgs84(_ocean_path(config)))
    ocean_wgs84 = load_ocean_union_wgs84(_ocean_path(config))
    lake_wgs84 = load_ocean_union_wgs84(_lake_path(config))
    return build_ocean_predicate_context(unary_union((ocean_wgs84, lake_wgs84)))


def _open_required_rasters(config: PipelineConfig) -> dict[str, rasterio.DatasetReader]:
    _ensure_proj_data_env()
    datasets: dict[str, rasterio.DatasetReader] = {}
    r = config.input_rasters
    try:
        for cls, filename in sorted(r.landcover_by_class.items()):
            datasets[f"class_{cls}"] = rasterio.open(r.root / filename)
        for filename in r.topo_files:
            key = filename.replace(".tif", "")
            datasets[key] = rasterio.open(r.root / filename)
        return datasets
    except Exception as exc:
        LOGGER.error(
            "Failed to open required rasters from %s while building metadata inputs.",
            r.root,
            exc_info=True,
        )
        for ds in datasets.values():
            ds.close()
        raise


def _topo_keys_for_resolution(config: PipelineConfig, resolution: int) -> tuple[str, str, str]:
    if resolution == config.res_parent:
        return (
            "tri_50KMmn_GMTEDmd",
            "slope_50KMmn_GMTEDmd",
            "elevation_50KMma_GMTEDma",
        )
    return (
        "tri_5KMmn_GMTEDmd",
        "slope_5KMmn_GMTEDmd",
        "elevation_5KMma_GMTEDma",
    )


def _assert_edge_invariants(total: int, water_edges: int, urban_edges: int | None) -> None:
    if water_edges > total or (urban_edges is not None and urban_edges > total):
        raise RuntimeError(
            f"Invalid edge counts: total_edges={total} water_edges={water_edges} urban_edges={urban_edges}"
        )


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
        res1_cells = _generate_cells_for_resolution(cfg.res_parent)
        res4_cells = _generate_cells_for_resolution(cfg.res_child)
        if max_child_cells is not None:
            res4_cells = res4_cells[: max(0, max_child_cells)]

        LOGGER.debug(
            "Building airport/port H3 indexes for resolutions %s and %s.",
            cfg.res_parent,
            cfg.res_child,
        )
        air_idx, port_idx = build_pair_indexes(
            cfg.input_rasters.root,
            cfg.input_rasters.airport_shapefile_name,
            cfg.input_rasters.port_shapefile_name,
            (cfg.res_parent, cfg.res_child),
        )

        self._export_resolution(
            cells=res1_cells,
            resolution=cfg.res_parent,
            include_urban=False,
            out_path=cfg.output_dir / cfg.terrain_res1_metadata_filename,
            air_idx=air_idx,
            port_idx=port_idx,
        )
        self._export_resolution(
            cells=res4_cells,
            resolution=cfg.res_child,
            include_urban=True,
            out_path=cfg.output_dir / cfg.terrain_res4_metadata_filename,
            air_idx=air_idx,
            port_idx=port_idx,
        )
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


    def _export_resolution(
        self,
        *,
        cells: Sequence[str],
        resolution: int,
        include_urban: bool,
        out_path: Path,
        air_idx: PointCountIndex,
        port_idx: PointCountIndex,
    ) -> None:
        cfg = self._config
        water_ctx = _water_context_for_resolution(cfg, resolution)
        urban_aggregate_ctx: OceanPredicateContext | None = None
        urban_rank_ctxs: list[tuple[int, OceanPredicateContext]] = []
        if include_urban:
            urban_aggregate_ctx, urban_rank_ctxs = load_urban_contexts_by_scalerank(_urban_path(cfg))

        sample_count = (
            cfg.area_weighted_samples_per_cell_res1
            if resolution == cfg.res_parent
            else cfg.area_weighted_samples_per_cell_res4
        )
        topo_keys = _topo_keys_for_resolution(cfg, resolution)
        needed_landcover_classes = tuple(range(1, 13))
        needed_keys = {f"class_{c}" for c in needed_landcover_classes}
        needed_keys.update(topo_keys)

        datasets = _open_required_rasters(cfg)
        try:
            raster_pairs = [(k, v) for k, v in datasets.items() if k in needed_keys]
            json_rows: list[dict[str, Any]] = []
            for idx, cell in enumerate(cells, start=1):
                poly = cell_polygon(cell)
                wm = mask_metrics_for_cell_polygon(poly, water_ctx)
                all_water = wm.all_in_mask
                intersects_water = wm.intersects
                water_edges = wm.mask_edges
                total_edges = wm.total_edges

                if include_urban:
                    assert urban_aggregate_ctx is not None
                    um = mask_metrics_for_cell_polygon(poly, urban_aggregate_ctx)
                    all_urban = um.all_in_mask
                    intersects_urban = um.intersects
                    urban_edges = um.mask_edges
                    _assert_edge_invariants(total_edges, water_edges, urban_edges)
                    rank_entries: list[UrbanRankMaskEntry] = []
                    for sr, rctx in urban_rank_ctxs:
                        umr = mask_metrics_for_cell_polygon(poly, rctx)
                        if not umr.intersects and not umr.all_in_mask:
                            continue
                        rank_entries.append(
                            UrbanRankMaskEntry(
                                scalerank=sr,
                                all_urban=umr.all_in_mask,
                                intersects_urban=umr.intersects,
                                urban_edges=umr.mask_edges,
                            )
                        )
                else:
                    _assert_edge_invariants(total_edges, water_edges, None)
                    rank_entries = []

                airport_total, airport_sparse = air_idx.totals_for_cell(cell, resolution)
                port_total, port_sparse = port_idx.totals_for_cell(cell, resolution)

                points = deterministic_points_within_polygon(poly, sample_count)
                sampled = sample_many_rasters(raster_pairs, points)
                arctic_mean = sampled.get("class_10")
                desert_mean = sampled.get("class_11")
                forest_mean = compose_forest_mean(sampled)

                record_res1 = HexMetadataRecordRes1(
                    h3_index=cell,
                    total_edges=total_edges,
                    all_water=all_water,
                    intersects_water=intersects_water,
                    water_edges=water_edges,
                    arctic_mean=arctic_mean,
                    forest_mean=forest_mean,
                    desert_mean=desert_mean,
                    tri_mean=sampled.get(topo_keys[0]),
                    slope_mean=sampled.get(topo_keys[1]),
                    elevation_max=sampled.get(topo_keys[2]),
                    airport_count_total=airport_total,
                    airport_count_by_scalerank=tuple(airport_sparse),
                    port_count_total=port_total,
                    port_count_by_scalerank=tuple(port_sparse),
                )
                if include_urban:
                    rec4 = HexMetadataRecordRes4(
                        **asdict(record_res1),
                        all_urban=all_urban,
                        intersects_urban=intersects_urban,
                        urban_edges=urban_edges,
                        urban_by_scalerank=tuple(rank_entries),
                    )
                    json_rows.append(record_res4_to_json_dict(rec4))
                else:
                    json_rows.append(record_res1_to_json_dict(record_res1))

                if idx % 10000 == 0:
                    LOGGER.debug(
                        "Metadata export %d/%d cells at resolution %d.",
                        idx,
                        len(cells),
                        resolution,
                    )
        finally:
            for ds in datasets.values():
                ds.close()

        json_rows.sort(key=lambda row: row["h3_index"])
        envelope = build_metadata_envelope(resolution=resolution, records=json_rows)
        write_json_document(out_path, envelope)
        LOGGER.info(
            "Wrote %d metadata records (resolution %d) to %s",
            len(json_rows),
            resolution,
            out_path,
        )


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
