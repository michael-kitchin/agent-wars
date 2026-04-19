"""
CLI entrypoint for optional display-only road/rail vector export (Leaflet overlay, non-gameplay).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import fiona

from .logging_utils import configure_logging
from .road_rail_sides import (
    ROAD_RAIL_EXPORT_SCALERANK_MAX,
    ROAD_RAIL_EXPORT_SCALERANK_MIN,
    _feature_has_export_scalerank,
    _feature_transformer,
    _geometry_wgs84,
    iter_route_linestrings,
)

LOGGER = logging.getLogger(__name__)
VECTORS_SCHEMA_VERSION = "0.1.0"


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


def _collect_rows_for_layer(
    *,
    kind: str,
    shapefile_path: Path,
    simplify_deg: float,
    max_features: int | None,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    processed = 0
    skipped_scalerank = 0
    with fiona.open(shapefile_path) as src:
        xy_transform = _feature_transformer(src)
        for feature in src:
            if max_features is not None and processed >= max_features:
                break
            processed += 1
            raw_props = feature.get("properties")
            props = raw_props if isinstance(raw_props, Mapping) else None
            if not _feature_has_export_scalerank(props):
                skipped_scalerank += 1
                continue
            geom = _geometry_wgs84(feature.get("geometry"), xy_transform)
            if geom is None:
                continue
            if simplify_deg > 0:
                geom = geom.simplify(simplify_deg, preserve_topology=False)
            for line in iter_route_linestrings(geom):
                points = _line_points_latlng(line)
                if len(points) < 2:
                    continue
                rows.append({"kind": kind, "points": points})
    LOGGER.info(
        "road_rail_vectors: %s rows=%d processed=%d skipped_scalerank=%d simplify_deg=%s scalerank_range=%d..%d",
        kind,
        len(rows),
        processed,
        skipped_scalerank,
        simplify_deg,
        ROAD_RAIL_EXPORT_SCALERANK_MIN,
        ROAD_RAIL_EXPORT_SCALERANK_MAX,
    )
    return rows


def run_export(
    *,
    data_root: Path,
    output_dir: Path,
    output_filename: str,
    simplify_deg: float,
    max_features: int | None,
) -> Path:
    road_path, rail_path = _validate_inputs(data_root)
    rows: list[dict[str, object]] = []
    rows.extend(
        _collect_rows_for_layer(
            kind="road",
            shapefile_path=road_path,
            simplify_deg=simplify_deg,
            max_features=max_features,
        )
    )
    rows.extend(
        _collect_rows_for_layer(
            kind="rail",
            shapefile_path=rail_path,
            simplify_deg=simplify_deg,
            max_features=max_features,
        )
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / output_filename
    payload = {
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
