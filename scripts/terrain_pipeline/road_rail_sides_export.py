"""Export road and rail side masks for one H3 resolution."""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from types import MappingProxyType
from typing import Any

import fiona
from shapely.geometry import LineString, Polygon

from .road_rail_sides import (
    DEFAULT_FAST_MODE,
    LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT,
    RESOLUTION,
    ROAD_RAIL_EXPORT_SCALERANK_MAX,
    ROAD_RAIL_EXPORT_SCALERANK_MIN,
    ROAD_RAIL_SIDES_SCHEMA_VERSION,
    SIDE_ORDERING_CONTRACT,
    _LINE_LENGTH_TOL,
    _LOG_TRACE,
    _feature_has_export_scalerank,
    _feature_transformer,
    _geometry_wgs84,
    _merge_bool_masks,
    _sha256_file,
    compare_linestring_cell_coverage_res4,
    feature_has_scalerank_in_range,
    h3_cells_for_linestring,
    iter_route_linestrings,
    ordered_cell_boundary_edges_for_cell,
    side_touch_mask_for_edges,
)
from .geometry_bounds import bounds_intersect
from .sampling import cell_polygon

LOGGER = logging.getLogger(__name__)

# Global scalerank range for both layers. Shared so scan options do not rebuild a dict per call.
GLOBAL_LAYER_RANGES = MappingProxyType({
    "road": (ROAD_RAIL_EXPORT_SCALERANK_MIN, ROAD_RAIL_EXPORT_SCALERANK_MAX),
    "rail": (ROAD_RAIL_EXPORT_SCALERANK_MIN, ROAD_RAIL_EXPORT_SCALERANK_MAX),
})


@dataclass(frozen=True)
class RoadRailScanOptions:
    """
    Why this exists:
        Carry the resolution, scalerank ranges, and optional geographic limits for one side-mask scan.
    When to use:
        Before scanning road and rail shapefiles, from the global exporter or a regional export.
    What to expect:
        Defaults match the global tactical export: resolution 4, scalerank 0–4 on both layers, no cell filter.
    """

    # H3 resolution written into candidate cells and the output envelope.
    resolution: int = RESOLUTION
    # Inclusive scalerank range per layer name. The global ranges are shared and immutable.
    scalerank_range_by_layer: Mapping[str, tuple[int, int]] = GLOBAL_LAYER_RANGES
    # Stop each layer after this many shapefile features, including features skipped by scalerank.
    max_features: int | None = None
    # Use segment grid paths when true, and arclength sampling when false.
    use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE
    # Skip a feature whose bounding box misses this box. None keeps every feature.
    feature_bounds: tuple[float, float, float, float] | None = None
    # Drop candidate cells outside this set. None keeps every candidate.
    cell_filter: frozenset[str] | None = None


@dataclass
class RoadRailSidesExporter:
    """
    Why this exists:
        Run validation and export res4 road/rail side masks into a single JSON artifact.
    When to use:
        Invoked from ``road_rail_sides_cli`` after arguments are parsed.
    What to expect:
        Writes ``terrain_res4_road_rail_sides.json`` under the configured output directory.
    """

    # Directory that contains the Natural Earth shapefiles.
    data_root: Path
    # Directory that receives the side-mask JSON.
    output_dir: Path
    # Road shapefile name inside ``data_root``.
    road_shapefile_name: str = "ne_10m_roads.shp"
    # Railroad shapefile name inside ``data_root``.
    rail_shapefile_name: str = "ne_10m_railroads.shp"
    # Side-mask filename inside ``output_dir``.
    output_filename: str = "terrain_res4_road_rail_sides.json"

    def road_path(self) -> Path:
        """
        Why this exists:
            Resolve the road shapefile path for validation and hashing.
        When to use:
            Before opening Natural Earth roads.
        What to expect:
            Returns ``data_root / road_shapefile_name``.
        """

        LOGGER.log(_LOG_TRACE, "road_path getter resolved for road_rail_sides exporter.")
        return self.data_root / self.road_shapefile_name

    def rail_path(self) -> Path:
        """
        Why this exists:
            Resolve the railroad shapefile path for validation and hashing.
        When to use:
            Before opening Natural Earth railroads.
        What to expect:
            Returns ``data_root / rail_shapefile_name``.
        """

        LOGGER.log(_LOG_TRACE, "rail_path getter resolved for road_rail_sides exporter.")
        return self.data_root / self.rail_shapefile_name

    def output_path(self) -> Path:
        """
        Why this exists:
            Resolve the JSON output path for writers and tests.
        When to use:
            After validation succeeds and before streaming records.
        What to expect:
            Returns ``output_dir / output_filename``.
        """

        LOGGER.log(_LOG_TRACE, "output_path getter resolved for road_rail_sides exporter.")
        return self.output_dir / self.output_filename

    def validate_inputs(self) -> None:
        """
        Why this exists:
            Fail fast when required Natural Earth inputs are missing or unreadable.
        When to use:
            First step of ``run_all`` or standalone ``validate`` CLI.
        What to expect:
            Raises ``FileNotFoundError`` when paths are missing; may raise driver errors for corrupt data.
        """

        LOGGER.debug("road_rail_sides: validating inputs at data_root=%s.", self.data_root)
        for label, path in (("road", self.road_path()), ("rail", self.rail_path())):
            if not path.is_file():
                raise FileNotFoundError(f"Missing {label} shapefile: {path}")
            with fiona.open(path) as src:
                _ = src.schema
        LOGGER.info("road_rail_sides: input validation passed (road and rail readable).")

    def run_export(
        self,
        *,
        max_features: int | None = None,
        use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE,
        scan: RoadRailScanOptions | None = None,
    ) -> None:
        """
        Why this exists:
            Scan road and rail shapefiles and write the merged touched-cell JSON export.
        When to use:
            After ``validate_inputs`` succeeds. Pass ``scan`` when the resolution or scalerank range differs from the global export.
        What to expect:
            Creates parent directories as needed and overwrites the output JSON atomically via write+replace.
            ``scan`` wins over ``max_features`` and ``use_fast_segment_grid_path`` when both are set.
        """

        LOGGER.debug(
            "road_rail_sides: starting export (max_features=%s, mode=%s).",
            max_features,
            "fast" if use_fast_segment_grid_path else "high-fidelity",
        )
        self.output_dir.mkdir(parents=True, exist_ok=True)
        options = scan if scan is not None else RoadRailScanOptions(
            max_features=max_features,
            use_fast_segment_grid_path=use_fast_segment_grid_path,
        )

        masks_by_cell: dict[str, tuple[list[bool], list[bool]]] = {}
        cell_polygon_cache: dict[str, Polygon] = {}
        cell_edges_cache: dict[str, list[LineString]] = {}

        def accumulate(layer: str, path: Path) -> None:
            LOGGER.debug("road_rail_sides: scanning %s layer at %s.", layer, path)
            processed = 0
            skipped_scalerank = 0
            with fiona.open(path) as src:
                xy_transform = _feature_transformer(src)
                for feature in src:
                    if max_features is not None and processed >= max_features:
                        LOGGER.debug(
                            "road_rail_sides: max_features=%d reached; stopping %s scan.",
                            max_features,
                            layer,
                        )
                        break
                    processed += 1
                    raw_props = feature.get("properties")
                    props = raw_props if isinstance(raw_props, Mapping) else None
                    rank_min, rank_max = options.scalerank_range_by_layer[layer]
                    if not feature_has_scalerank_in_range(props, rank_min, rank_max):
                        skipped_scalerank += 1
                        continue
                    geom = _geometry_wgs84(feature.get("geometry"), xy_transform)
                    if geom is None:
                        continue
                    if options.feature_bounds is not None and not bounds_intersect(geom.bounds, options.feature_bounds):
                        continue

                    for line in iter_route_linestrings(geom):
                        if line.is_empty or line.length <= _LINE_LENGTH_TOL:
                            continue
                        try:
                            cells = h3_cells_for_linestring(
                                line,
                                resolution=options.resolution,
                                use_fast_segment_grid_path=options.use_fast_segment_grid_path,
                            )
                            if options.cell_filter is not None:
                                cells = [cell for cell in cells if cell in options.cell_filter]
                        except Exception as exc:
                            LOGGER.error(
                                "road_rail_sides: H3 overlap failed for %s feature id=%s: %s",
                                layer,
                                feature.get("id"),
                                exc,
                                exc_info=True,
                            )
                            raise

                        for cell in cells:
                            poly = cell_polygon_cache.get(cell)
                            if poly is None:
                                poly = cell_polygon(cell)
                                cell_polygon_cache[cell] = poly
                            clipped = line.intersection(poly)
                            if clipped.is_empty:
                                continue
                            edges = cell_edges_cache.get(cell)
                            if edges is None:
                                edges = ordered_cell_boundary_edges_for_cell(cell)
                                cell_edges_cache[cell] = edges
                            mask = side_touch_mask_for_edges(edges, clipped)
                            if not any(mask):
                                continue

                            if cell not in masks_by_cell:
                                masks_by_cell[cell] = (
                                    [False] * len(mask),
                                    [False] * len(mask),
                                )

                            road_mask, rail_mask = masks_by_cell[cell]
                            if layer == "road":
                                road_mask = _merge_bool_masks(road_mask, mask)
                            else:
                                rail_mask = _merge_bool_masks(rail_mask, mask)

                            masks_by_cell[cell] = (road_mask, rail_mask)

                    if processed % 5000 == 0:
                        LOGGER.debug(
                            "road_rail_sides: processed %d features from %s.",
                            processed,
                            layer,
                        )

            LOGGER.info(
                "road_rail_sides: %s layer scalerank filter skipped %d of %d features (kept scalerank %d..%d).",
                layer,
                skipped_scalerank,
                processed,
                ROAD_RAIL_EXPORT_SCALERANK_MIN,
                ROAD_RAIL_EXPORT_SCALERANK_MAX,
            )

        accumulate("road", self.road_path())
        accumulate("rail", self.rail_path())
        LOGGER.info(
            "road_rail_sides: global road+rail scan complete; %d res4 cells indexed before merge/write (scalerank %d..%d).",
            len(masks_by_cell),
            ROAD_RAIL_EXPORT_SCALERANK_MIN,
            ROAD_RAIL_EXPORT_SCALERANK_MAX,
        )

        records: list[dict[str, Any]] = []
        for cell in sorted(masks_by_cell.keys()):
            road_mask, rail_mask = masks_by_cell[cell]
            if not any(road_mask) and not any(rail_mask):
                continue
            if len(road_mask) != len(rail_mask):
                raise RuntimeError(f"Inconsistent mask lengths for cell={cell}")
            records.append(
                {
                    "h3_index": cell,
                    "road_sides": road_mask,
                    "rail_sides": rail_mask,
                }
            )

        road_min, road_max = options.scalerank_range_by_layer["road"]
        rail_min, rail_max = options.scalerank_range_by_layer["rail"]
        envelope: dict[str, Any] = {
            "schema_version": ROAD_RAIL_SIDES_SCHEMA_VERSION,
            "resolution": options.resolution,
            "generated_at_utc": datetime.now(UTC).isoformat(),
            "record_count": len(records),
            "route_scalerank_filter": {
                "min": road_min,
                "max": road_max,
            },
        }
        if (rail_min, rail_max) != (road_min, road_max):
            envelope["rail_scalerank_filter"] = {"min": rail_min, "max": rail_max}
        envelope["side_ordering_contract"] = SIDE_ORDERING_CONTRACT
        envelope["inputs"] = [
            {"role": "road", "path": str(self.road_path()), "sha256": _sha256_file(self.road_path())},
            {"role": "rail", "path": str(self.rail_path()), "sha256": _sha256_file(self.rail_path())},
        ]
        envelope["records"] = records

        out_path = self.output_path()
        tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
        LOGGER.debug("road_rail_sides: writing %d records to %s.", len(records), out_path)
        with tmp_path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(envelope, f, indent=2, ensure_ascii=False)
            f.write("\n")
        tmp_path.replace(out_path)
        LOGGER.info("road_rail_sides: wrote %s (%d records).", out_path, len(records))
        if len(records) == 0:
            LOGGER.error(
                "road_rail_sides: export produced zero records; check scalerank filter vs shapefile attributes.",
            )

    def run_qa_line_cell_coverage(
        self,
        *,
        max_features: int | None = None,
        buffer_deg: float = LINE_COVERAGE_QA_BUFFER_DEGREES_DEFAULT,
        max_example_lines: int = 12,
        use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE,
    ) -> dict[str, Any]:
        """
        Why this exists:
            Compare densified line-to-res4 cell discovery (used in export) against a thin-buffer polygon
            overlap baseline so missed cells can be detected before relying on export output alone.
        When to use:
            From the ``qa-line-coverage`` CLI subcommand or ad-hoc validation after changing sampling constants.
        What to expect:
            Validates shapefile readability first, then scans each layer and returns summary counts plus a
            short list of example mismatches; logs an INFO summary.
        """

        LOGGER.debug(
            "road_rail_sides: QA line cell coverage (max_features=%s buffer_deg=%s max_example_lines=%d mode=%s).",
            max_features,
            buffer_deg,
            max_example_lines,
            "fast" if use_fast_segment_grid_path else "high-fidelity",
        )
        self.validate_inputs()

        lines_compared = 0
        lines_with_buffered_only = 0
        lines_with_dense_only = 0
        total_buffered_only_cells = 0
        total_dense_only_cells = 0
        examples: list[dict[str, Any]] = []

        def scan(layer: str, path: Path) -> None:
            nonlocal lines_compared, lines_with_buffered_only, lines_with_dense_only
            nonlocal total_buffered_only_cells, total_dense_only_cells

            processed = 0
            with fiona.open(path) as src:
                xy_transform = _feature_transformer(src)
                for feature in src:
                    if max_features is not None and processed >= max_features:
                        LOGGER.debug(
                            "road_rail_sides: QA max_features=%d reached for %s.",
                            max_features,
                            layer,
                        )
                        break
                    processed += 1
                    qa_props = feature.get("properties")
                    qa_props_map = qa_props if isinstance(qa_props, Mapping) else None
                    if not _feature_has_export_scalerank(qa_props_map):
                        continue
                    geom = _geometry_wgs84(feature.get("geometry"), xy_transform)
                    if geom is None:
                        continue

                    for line in iter_route_linestrings(geom):
                        if line.is_empty or line.length <= _LINE_LENGTH_TOL:
                            continue
                        cmp = compare_linestring_cell_coverage_res4(
                            line,
                            buffer_deg=buffer_deg,
                            use_fast_segment_grid_path=use_fast_segment_grid_path,
                        )
                        lines_compared += 1
                        ob = cmp["cells_only_in_buffered"]
                        od = cmp["cells_only_in_densified"]
                        if ob:
                            lines_with_buffered_only += 1
                            total_buffered_only_cells += len(ob)
                        if od:
                            lines_with_dense_only += 1
                            total_dense_only_cells += len(od)
                        if cmp["has_mismatch"] and len(examples) < max_example_lines:
                            examples.append(
                                {
                                    "layer": layer,
                                    "feature_id": feature.get("id"),
                                    "line_wkt_prefix": line.wkt[:240],
                                    "cells_only_in_buffered": ob,
                                    "cells_only_in_densified": od,
                                }
                            )

        scan("road", self.road_path())
        scan("rail", self.rail_path())

        summary: dict[str, Any] = {
            "mode": "fast" if use_fast_segment_grid_path else "high-fidelity",
            "buffer_deg": buffer_deg,
            "lines_compared": lines_compared,
            "lines_with_cells_only_in_buffered": lines_with_buffered_only,
            "lines_with_cells_only_in_densified": lines_with_dense_only,
            "total_cells_only_in_buffered": total_buffered_only_cells,
            "total_cells_only_in_densified": total_dense_only_cells,
            "example_mismatches": examples,
        }
        LOGGER.info(
            "road_rail_sides QA: compared %d line parts; "
            "lines_with_cells_only_in_buffered=%d (export would miss those cells); "
            "lines_with_cells_only_in_densified=%d; "
            "example rows=%d.",
            lines_compared,
            lines_with_buffered_only,
            lines_with_dense_only,
            len(examples),
        )
        if examples:
            LOGGER.info("road_rail_sides QA: first example mismatch detail: %s", examples[0])
        return summary

    def run_all(
        self,
        *,
        max_features: int | None = None,
        use_fast_segment_grid_path: bool = DEFAULT_FAST_MODE,
    ) -> None:
        """
        Why this exists:
            Validate inputs then perform export in one reliable entrypoint.
        When to use:
            Normal CLI ``run`` path.
        What to expect:
            Raises on validation failure before writing partial outputs.
        """

        LOGGER.debug("road_rail_sides: run_all starting.")
        self.validate_inputs()
        self.run_export(
            max_features=max_features,
            use_fast_segment_grid_path=use_fast_segment_grid_path,
        )
        LOGGER.info("road_rail_sides: run_all complete.")
