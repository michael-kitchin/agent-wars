"""
Terrain classification from aggregated EarthEnv signals.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from .config import ClassifierThresholds, TERRAIN_ENUM


@dataclass(frozen=True)
class CellFeatures:
    """
    Why this exists:
        Capture normalized per-cell inputs for deterministic terrain classification.
    When to use:
        Pass one cell's aggregated metrics into classify_cell().
    What to expect:
        Land-cover percentages and selected topographic metrics may be None for no-data cells.
    """

    landcover: Dict[int, float]
    tri_mean: float | None
    slope_mean: float | None
    elevation_max: float | None


def classify_cell(features: CellFeatures, t: ClassifierThresholds, nodata_fallback: str) -> str:
    """
    Why this exists:
        Implement one auditable decision path for all terrain classifications.
    When to use:
        During res-1 and res-4 terrain generation.
    What to expect:
        Returns a lowercase terrain enum and never returns unknown strings.
    """

    if nodata_fallback not in TERRAIN_ENUM:
        raise ValueError(f"Invalid nodata fallback terrain: {nodata_fallback}")

    c = {k: float(v) for k, v in features.landcover.items() if v is not None}
    if not c:
        return nodata_fallback

    c12 = c.get(12, 0.0)
    c10 = c.get(10, 0.0)
    forest = c.get(1, 0.0) + c.get(2, 0.0) + c.get(3, 0.0) + c.get(4, 0.0)
    c11 = c.get(11, 0.0)

    # 1) Ocean: liberal inland-water override and dominant-water gate.
    if c12 >= t.water_presence_override_min or c12 >= t.ocean_dominant_min:
        return "ocean"

    # 2) Arctic
    if c10 >= t.arctic_dominant_min:
        return "arctic"

    # 3) Forest
    if forest >= t.forest_dominant_min:
        return "forest"

    # 4) Mountain (liberal)
    tri_ok = features.tri_mean is not None and features.tri_mean >= t.mountain_tri_mean_min
    slope_ok = features.slope_mean is not None and features.slope_mean >= t.mountain_slope_mean_min
    elev_ok = features.elevation_max is not None and features.elevation_max >= t.mountain_elevation_max_min
    if tri_ok or (slope_ok and elev_ok):
        return "mountain"

    # 5) Desert
    if c11 >= t.desert_barren_min:
        return "desert"

    # 6) Land fallback
    return "land"

