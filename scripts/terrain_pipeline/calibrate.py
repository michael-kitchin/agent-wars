"""
Threshold calibration helper for Earth-like terrain distribution.

Targets are heuristic; refresh `coastal` / `ocean` from QA CSV after a full generate (see plan §2.2).
"""

from __future__ import annotations

import argparse
import json
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, List, Tuple

import h3
import rasterio

from .classifier import CellFeatures, OceanRelationKind, classify_cell
from .config import ClassifierThresholds, TERRAIN_ENUM, build_default_config
from .ocean_mask import (
    build_ocean_predicate_context,
    load_ocean_union_wgs84,
    ocean_relation_for_cell_polygons,
)
from .sampling import cell_polygon, deterministic_points_within_polygon, sample_many_rasters


# Heuristic targets (sums to 100); tune from data/generated/qa/terrain_counts_res1.csv after threshold changes.
TARGET_GLOBAL_PCT = {
    "ocean": 56.0,
    "coastal": 14.0,
    "arctic": 2.0,
    "forest": 9.0,
    "mountain": 7.0,
    "desert": 5.0,
    "land": 7.0,
}


def _generate_res1_cells() -> List[str]:
    cells: List[str] = []
    for res0 in h3.get_res0_cells():
        cells.extend(h3.cell_to_children(res0, 1))
    return sorted(set(cells))


def _extract_res1_features_and_ocean_relation(
    sample_count: int,
) -> List[tuple[CellFeatures, OceanRelationKind]]:
    """
    Why this exists:
        Match pipeline inputs: interior land-cover/topo means plus ocean-mask relation per cell.
    When to use:
        Calibration scoring over the global res-1 grid.
    What to expect:
        One row per res-1 cell; requires local rasters and ocean shapefile under ``InputRasterSet.root``.
    """

    cfg = build_default_config()
    root = cfg.input_rasters.root
    ocean_path = root / cfg.input_rasters.ocean_shapefile_name
    ocean_ctx = build_ocean_predicate_context(load_ocean_union_wgs84(ocean_path))

    needed_classes = tuple(range(1, 13))
    files = {f"class_{c}": root / cfg.input_rasters.landcover_by_class[c] for c in needed_classes}
    files["tri"] = root / "tri_50KMmn_GMTEDmd.tif"
    files["slope"] = root / "slope_50KMmn_GMTEDmd.tif"
    files["elev"] = root / "elevation_50KMma_GMTEDma.tif"
    datasets: Dict[str, rasterio.DatasetReader] = {}
    try:
        for k, p in files.items():
            datasets[k] = rasterio.open(p)
        raster_pairs = list(datasets.items())
        rows: List[tuple[CellFeatures, OceanRelationKind]] = []
        for cell in _generate_res1_cells():
            poly = cell_polygon(cell)
            relation = ocean_relation_for_cell_polygons(poly, ocean_ctx)
            points = deterministic_points_within_polygon(poly, sample_count)
            sampled = sample_many_rasters(raster_pairs, points)
            lc = {c: sampled.get(f"class_{c}") for c in needed_classes}
            features = CellFeatures(
                landcover=lc,
                tri_mean=sampled.get("tri"),
                slope_mean=sampled.get("slope"),
                elevation_max=sampled.get("elev"),
            )
            rows.append((features, relation))
        return rows
    finally:
        for ds in datasets.values():
            ds.close()


def _distribution_from_rows(
    rows: List[tuple[CellFeatures, OceanRelationKind]], t: ClassifierThresholds
) -> Dict[str, float]:
    counts = {k: 0 for k in TERRAIN_ENUM}
    for f, relation in rows:
        terrain = classify_cell(f, t, nodata_fallback="ocean", ocean_relation=relation)
        counts[terrain] += 1
    total = max(1, len(rows))
    return {k: counts[k] * 100.0 / total for k in TERRAIN_ENUM}


def _score_distribution(dist: Dict[str, float]) -> float:
    weights = {
        "ocean": 1.4,
        "coastal": 1.0,
        "arctic": 1.1,
        "forest": 1.0,
        "mountain": 1.2,
        "desert": 1.0,
        "land": 1.0,
    }
    score = 0.0
    for k, target in TARGET_GLOBAL_PCT.items():
        score += weights[k] * abs(dist[k] - target)
    if dist["ocean"] > 75.0:
        score += (dist["ocean"] - 75.0) * 2.0
    if dist["coastal"] > 25.0:
        score += (dist["coastal"] - 25.0) * 1.5
    return score


def calibrate(sample_count: int) -> Tuple[ClassifierThresholds, Dict[str, float], float]:
    rows = _extract_res1_features_and_ocean_relation(sample_count=sample_count)

    arctic_vals = [18.0, 22.0, 26.0, 30.0]
    forest_vals = [30.0, 34.0, 38.0, 42.0]
    desert_vals = [28.0, 34.0, 40.0, 46.0]
    tri_vals = [24.0, 30.0, 36.0, 42.0]
    slope_vals = [5.0, 7.0, 9.0]
    elev_vals = [700.0, 900.0, 1100.0, 1300.0]

    base = ClassifierThresholds()
    best_t = base
    best_dist = _distribution_from_rows(rows, base)
    best_score = _score_distribution(best_dist)

    for a in arctic_vals:
        for f in forest_vals:
            for d in desert_vals:
                for tri in tri_vals:
                    for sl in slope_vals:
                        for el in elev_vals:
                            t = replace(
                                base,
                                arctic_dominant_min=a,
                                forest_dominant_min=f,
                                desert_barren_min=d,
                                mountain_tri_mean_min=tri,
                                mountain_slope_mean_min=sl,
                                mountain_elevation_max_min=el,
                            )
                            dist = _distribution_from_rows(rows, t)
                            s = _score_distribution(dist)
                            if s < best_score:
                                best_score = s
                                best_t = t
                                best_dist = dist
    return best_t, best_dist, best_score


def main() -> int:
    parser = argparse.ArgumentParser(description="Calibrate terrain thresholds toward Earth-like distribution.")
    parser.add_argument("--sample-count", type=int, default=25, help="Res-1 per-cell sample count used during calibration.")
    parser.add_argument(
        "--out",
        type=str,
        default="data/generated/qa/calibration_result.json",
        help="Output file path for calibration result JSON.",
    )
    args = parser.parse_args()

    best_t, best_dist, best_score = calibrate(sample_count=args.sample_count)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "target_global_pct": TARGET_GLOBAL_PCT,
        "best_score": best_score,
        "best_thresholds": best_t.__dict__,
        "best_distribution_pct": best_dist,
        "sample_count": args.sample_count,
        "note": "TARGET_GLOBAL_PCT is heuristic; refresh ocean/coastal from terrain_counts_res1.csv after full pipeline run.",
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
