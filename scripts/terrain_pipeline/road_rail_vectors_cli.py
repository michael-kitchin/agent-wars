"""
CLI entrypoint for optional display-only road/rail vector export (Leaflet overlay, non-gameplay).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import fiona
import h3

from .logging_utils import configure_logging
from .road_rail_sides import (
    ROAD_RAIL_EXPORT_SCALERANK_MAX,
    ROAD_RAIL_EXPORT_SCALERANK_MIN,
    _feature_transformer,
    _geometry_wgs84,
    feature_has_scalerank_in_range,
    iter_route_linestrings,
)

LOGGER = logging.getLogger(__name__)
VECTORS_SCHEMA_VERSION = "0.1.0"


@dataclass(frozen=True)
class VectorExportOptions:
    """
    Why this exists:
        Carry simplify tolerance, scalerank limits, and an optional cell filter for one vector export.
    When to use:
        Before collecting road and rail display lines, from the global CLI or a regional export.
    What to expect:
        Defaults match the global export: scalerank 0–4 and no cell filter, so every kept line is written.
    """

    # Douglas-Peucker tolerance in degrees. Zero keeps the source vertices.
    simplify_deg: float = 2.5e-5
    # Stop each layer after this many shapefile features, including features skipped by scalerank.
    max_features: int | None = None
    # Inclusive road scalerank bounds.
    road_min: int = ROAD_RAIL_EXPORT_SCALERANK_MIN
    road_max: int = ROAD_RAIL_EXPORT_SCALERANK_MAX
    # Inclusive rail scalerank bounds.
    rail_min: int = ROAD_RAIL_EXPORT_SCALERANK_MIN
    rail_max: int = ROAD_RAIL_EXPORT_SCALERANK_MAX
    # H3 resolution used when ``point_cells`` is set. Ignored when the cell set is None.
    point_resolution: int | None = None
    # Keep a line when any vertex falls in this set. None keeps every line that passed the other filters.
    point_cells: frozenset[str] | None = None


def build_parser() -> argparse.ArgumentParser:
    """
    Why this exists:
        Define validate/run commands for the optional Leaflet road/rail display-vector artifact.
    When to use:
        At CLI startup before parsing arguments.
    What to expect:
        Writes `terrain_res4_road_rail_vectors.json` in `data/generated` by default.
    """

    parser = argparse.ArgumentParser(
        description="Export display-only road/rail vectors for Leaflet transport overlays.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    validate_p = sub.add_parser("validate", help="Validate required road/rail shapefiles exist and open.")
    validate_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    validate_p.add_argument("--data-root", type=str, default="F:/Data", help="Directory containing NE shapefiles.")

    run_p = sub.add_parser("run", help="Write terrain_res4_road_rail_vectors.json")
    run_p.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    run_p.add_argument("--data-root", type=str, default="F:/Data", help="Directory containing NE shapefiles.")
    run_p.add_argument("--output-dir", type=str, default="data/generated")
    run_p.add_argument(
        "--output-filename",
        type=str,
        default="terrain_res4_road_rail_vectors.json",
    )
    run_p.add_argument(
        "--simplify-deg",
        type=float,
        default=2.5e-5,
        help="Douglas-Peucker tolerance in WGS84 degrees (default: 2.5e-5).",
    )
    run_p.add_argument(
        "--max-features",
        type=int,
        default=None,
        help="Optional cap per layer for bounded local runs.",
    )
    return parser


def _validate_inputs(data_root: Path) -> tuple[Path, Path]:
    road = data_root / "ne_10m_roads.shp"
    rail = data_root / "ne_10m_railroads.shp"
    for label, p in (("road", road), ("rail", rail)):
        if not p.is_file():
            raise FileNotFoundError(f"Missing {label} shapefile: {p}")
        with fiona.open(p) as src:
            _ = src.schema
    LOGGER.info("road_rail_vectors: input validation passed.")
    return road, rail


def _line_points_latlng(line: Any) -> list[list[float]]:
    coords = list(line.coords)
    out: list[list[float]] = []
    prev: tuple[float, float] | None = None
    for lon, lat in coords:
        cur = (float(lat), float(lon))
        if prev is not None and abs(cur[0] - prev[0]) <= 1e-12 and abs(cur[1] - prev[1]) <= 1e-12:
            continue
        out.append([cur[0], cur[1]])
        prev = cur
    return out


def _line_hits_point_cells(points: list[list[float]], options: VectorExportOptions) -> bool:
    """
    Why this exists:
        Drop display lines that never enter the caller's cell set.
    When to use:
        After a line has been simplified and turned into latitude/longitude pairs.
    What to expect:
        True when ``point_cells`` is None, or when any vertex falls in that set at ``point_resolution``.
    """

    if options.point_cells is None or options.point_resolution is None:
        return True
    return any(
        h3.latlng_to_cell(lat, lng, options.point_resolution) in options.point_cells
        for lat, lng in points
    )


def collect_vector_rows(
    *,
    kind: str,
    shapefile_path: Path,
    options: VectorExportOptions,
) -> list[dict[str, object]]:
    """
    Why this exists:
        Read one road or rail shapefile into display rows for the vector payload.
    When to use:
        Once per layer during a global or regional vector export.
    What to expect:
        Returns rows shaped ``{"kind", "points"}`` with points stored as ``[lat, lng]``.
        ``max_features`` counts features as they are read, including scalerank skips.
    """

    LOGGER.debug(
        "collect_vector_rows kind=%s path=%s simplify_deg=%s max_features=%s point_cells=%s.",
        kind,
        shapefile_path,
        options.simplify_deg,
        options.max_features,
        None if options.point_cells is None else len(options.point_cells),
    )
    rank_min = options.road_min if kind == "road" else options.rail_min
    rank_max = options.road_max if kind == "road" else options.rail_max
    rows: list[dict[str, object]] = []
    processed = 0
    skipped_scalerank = 0
    with fiona.open(shapefile_path) as src:
        xy_transform = _feature_transformer(src)
        for feature in src:
            if options.max_features is not None and processed >= options.max_features:
                break
            processed += 1
            raw_props = feature.get("properties")
            props = raw_props if isinstance(raw_props, Mapping) else None
            if not feature_has_scalerank_in_range(props, rank_min, rank_max):
                skipped_scalerank += 1
                continue
            geom = _geometry_wgs84(feature.get("geometry"), xy_transform)
            if geom is None:
                continue
            if options.simplify_deg > 0:
                geom = geom.simplify(options.simplify_deg, preserve_topology=False)
            for line in iter_route_linestrings(geom):
                points = _line_points_latlng(line)
                if len(points) < 2 or not _line_hits_point_cells(points, options):
                    continue
                rows.append({"kind": kind, "points": points})
    LOGGER.info(
        "road_rail_vectors: %s rows=%d processed=%d skipped_scalerank=%d simplify_deg=%s scalerank_range=%d..%d",
        kind,
        len(rows),
        processed,
        skipped_scalerank,
        options.simplify_deg,
        rank_min,
        rank_max,
    )
    return rows


def build_vectors_payload(
    *,
    rows: list[dict[str, object]],
    road_path: Path,
    rail_path: Path,
    simplify_deg: float,
    max_features: int | None,
) -> dict[str, Any]:
    """
    Why this exists:
        Assemble the compact vector document from collected display rows.
    When to use:
        After both layers have been scanned.
    What to expect:
        Returns the historical global key order. ``generated_at_utc`` changes on every call.
    """

    LOGGER.debug("build_vectors_payload rows=%d simplify_deg=%s max_features=%s.", len(rows), simplify_deg, max_features)
    return {
        "schema_version": VECTORS_SCHEMA_VERSION,
        "generated_at_utc": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "record_count": len(rows),
        "rows": rows,
        "inputs": {
            "road_shapefile": str(road_path),
            "rail_shapefile": str(rail_path),
            "simplify_deg": simplify_deg,
            "max_features": max_features,
        },
    }


def run_export(
    *,
    data_root: Path,
    output_dir: Path,
    output_filename: str,
    simplify_deg: float,
    max_features: int | None,
) -> Path:
    road_path, rail_path = _validate_inputs(data_root)
    options = VectorExportOptions(simplify_deg=simplify_deg, max_features=max_features)
    rows: list[dict[str, object]] = []
    rows.extend(collect_vector_rows(kind="road", shapefile_path=road_path, options=options))
    rows.extend(collect_vector_rows(kind="rail", shapefile_path=rail_path, options=options))
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / output_filename
    payload = build_vectors_payload(
        rows=rows,
        road_path=road_path,
        rail_path=rail_path,
        simplify_deg=simplify_deg,
        max_features=max_features,
    )
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    LOGGER.info("road_rail_vectors: global export wrote %s rows=%d", out_path, len(rows))
    return out_path


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Provide `python -m scripts.terrain_pipeline.road_rail_vectors_cli` entrypoint.
    When to use:
        Local generation of display-only transport vectors for Leaflet overlays.
    What to expect:
        Returns zero on success and non-zero on validation/export failure.
    """

    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(verbose=getattr(args, "verbose", False))
    data_root = Path(args.data_root)
    try:
        if args.command == "validate":
            _validate_inputs(data_root)
            LOGGER.info("Road/rail vectors validation succeeded.")
            return 0
        if args.command == "run":
            run_export(
                data_root=data_root,
                output_dir=Path(args.output_dir),
                output_filename=args.output_filename,
                simplify_deg=float(args.simplify_deg),
                max_features=args.max_features,
            )
            LOGGER.info("Road/rail vectors export succeeded.")
            return 0
        parser.error(f"Unknown command: {args.command}")
        return 2
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("Road/rail vectors CLI failed: %s", exc, exc_info=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
