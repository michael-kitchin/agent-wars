"""

Terrain classification from aggregated EarthEnv signals.

"""



from __future__ import annotations



from dataclasses import dataclass

from typing import Dict, Literal



from .config import ClassifierThresholds, TERRAIN_ENUM



WaterRelationKind = Literal["in_water", "coastal_band", "no_water"]

# Back-compat name for imports; values are water-mask relations, not terrain labels.
OceanRelationKind = WaterRelationKind





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





def raw_land_fraction_sum(features: CellFeatures) -> float:

    """

    Why this exists:

        Sum EarthEnv consensus class means 1–11 (all non-water classes) at sampled points.

    When to use:

        Interior biome logic and QA helpers.

    What to expect:

        Missing class keys or None values contribute 0. Not normalized; may exceed 100.

    """



    total = 0.0

    for cls in range(1, 12):

        v = features.landcover.get(cls)

        if v is not None:

            total += float(v)

    return total





def effective_land_fraction_pct(features: CellFeatures) -> float:

    """

    Why this exists:

        Clamp raw land sum to [0, 100] for documentation and tests.

    When to use:

        QA or future heuristics; not used for ocean/coastal (shapefile drives those).

    What to expect:

        Always in [0.0, 100.0].

    """



    s = raw_land_fraction_sum(features)

    return min(100.0, max(0.0, s))





def classify_interior_biome(features: CellFeatures, t: ClassifierThresholds) -> str:

    """

    Why this exists:

        Biome stack for cells that do not intersect the ocean mask (or intersect only for coastal/ocean, which

        are handled before this runs).

    When to use:

        From classify_cell when ``water_relation`` is ``no_water``.

    What to expect:

        One of ``arctic``, ``forest``, ``mountain``, ``desert``, ``plains``. Caller must ensure landcover is non-empty.

    """



    c = {k: float(v) for k, v in features.landcover.items() if v is not None}

    c10 = c.get(10, 0.0)

    forest = c.get(1, 0.0) + c.get(2, 0.0) + c.get(3, 0.0) + c.get(4, 0.0)

    c11 = c.get(11, 0.0)



    if c10 >= t.arctic_dominant_min:

        return "arctic"



    if forest >= t.forest_dominant_min:

        return "forest"



    tri_ok = features.tri_mean is not None and features.tri_mean >= t.mountain_tri_mean_min

    slope_ok = features.slope_mean is not None and features.slope_mean >= t.mountain_slope_mean_min

    elev_ok = features.elevation_max is not None and features.elevation_max >= t.mountain_elevation_max_min

    if tri_ok or (slope_ok and elev_ok):

        return "mountain"



    if c11 >= t.desert_barren_min:

        return "desert"



    return "plains"





def classify_cell(

    features: CellFeatures,

    t: ClassifierThresholds,

    nodata_fallback: str,

    *,

    water_relation: WaterRelationKind,

) -> str:

    """

    Why this exists:

        Implement one auditable decision path for all terrain classifications.

    When to use:

        During res-1 and res-4 terrain generation.

    What to expect:

        Water mask: fully inside water, or intersecting with **all** boundary sides fully within water →

        ``water``; intersects water but not those cases → ``coastal``;

        no intersection → interior biomes from land-cover/topo only. Empty landcover → ``nodata_fallback``.

        Returns a lowercase terrain enum and never returns unknown strings.

    """



    if nodata_fallback not in TERRAIN_ENUM:

        raise ValueError(f"Invalid nodata fallback terrain: {nodata_fallback}")



    c = {k: float(v) for k, v in features.landcover.items() if v is not None}

    if not c:

        return nodata_fallback



    if water_relation == "in_water":

        return "water"

    if water_relation == "coastal_band":

        return "coastal"

    return classify_interior_biome(features, t)


