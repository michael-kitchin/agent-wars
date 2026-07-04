"""
Classify terrain kinds from metadata JSON rows; mirrors ``terrainClassifierFromMetadata.ts``.
"""

from __future__ import annotations

from typing import Any, Literal

from .config import ClassifierThresholds

WaterRelationKind = Literal["in_water", "coastal_band", "wetlands_band", "no_water"]
TerrainKind = Literal["water", "coastal", "wetlands", "plains", "urban", "forest", "mountain", "desert", "arctic"]

URBAN_OVERLAY_MAX_SCALERANK = 5


def water_relation_from_mask_metrics(row: dict[str, Any]) -> WaterRelationKind:
    """
    Why this exists:
        Derive water-relation band from metadata mask fields the same way the TS classifier does.
    When to use:
        Before interior biome or water/coastal/wetlands assignment for a res4 metadata row.
    What to expect:
        One of ``in_water``, ``coastal_band``, ``wetlands_band``, ``no_water``.
    """
    if bool(row.get("all_water")):
        return "in_water"
    if not bool(row.get("intersects_water")):
        return "no_water"
    water_edges = int(row.get("water_edges") or 0)
    return "wetlands_band" if water_edges <= 2 else "coastal_band"


def _landcover_dict_non_empty(row: dict[str, Any]) -> bool:
    return (
        row.get("arctic_mean") is not None
        or row.get("forest_mean") is not None
        or row.get("desert_mean") is not None
    )


def classify_interior_biome_from_metadata(row: dict[str, Any], thresholds: ClassifierThresholds) -> str:
    """
    Why this exists:
        Assign arctic/forest/mountain/desert/plains from metadata means when the cell is dry land.
    When to use:
        From ``classify_metadata_row_without_urban`` when water relation is ``no_water``.
    What to expect:
        Lowercase terrain enum string excluding water/coastal/wetlands.
    """
    c10 = float(row.get("arctic_mean") or 0.0)
    forest = float(row.get("forest_mean") or 0.0)
    c11 = float(row.get("desert_mean") or 0.0)
    if c10 >= thresholds.arctic_dominant_min:
        return "arctic"
    if forest >= thresholds.forest_dominant_min:
        return "forest"
    tri_ok = row.get("tri_mean") is not None and float(row["tri_mean"]) >= thresholds.mountain_tri_mean_min
    slope_ok = row.get("slope_mean") is not None and float(row["slope_mean"]) >= thresholds.mountain_slope_mean_min
    elev_ok = (
        row.get("elevation_max") is not None
        and float(row["elevation_max"]) >= thresholds.mountain_elevation_max_min
    )
    if tri_ok or (slope_ok and elev_ok):
        return "mountain"
    if c11 >= thresholds.desert_barren_min:
        return "desert"
    return "plains"


def classify_metadata_row_without_urban(
    row: dict[str, Any],
    thresholds: ClassifierThresholds,
    nodata_fallback: str = "water",
) -> str:
    """
    Why this exists:
        Mirror ``classifyCellWithoutUrbanOverride`` for one metadata JSON row.
    When to use:
        Res4 child classification during landmass ``water_pct`` export.
    What to expect:
        Lowercase pipeline terrain kind before urban overlay.
    """
    if not _landcover_dict_non_empty(row):
        return nodata_fallback
    relation = water_relation_from_mask_metrics(row)
    if relation == "in_water":
        return "water"
    if relation == "wetlands_band":
        return "wetlands"
    if relation == "coastal_band":
        return "coastal"
    return classify_interior_biome_from_metadata(row, thresholds)


def is_res4_urban_overlay_row(row: dict[str, Any], max_scalerank: int = URBAN_OVERLAY_MAX_SCALERANK) -> bool:
    """
    Why this exists:
        Detect res4 urban overlay the same way ``isRes4UrbanOverlayHex`` does in TypeScript.
    When to use:
        After base metadata classification when urban mask fields are present on res4 rows.
    What to expect:
        True when any urban rank row intersects or fully covers the cell within scalerank cap.
    """
    for entry in row.get("urban_by_scalerank") or []:
        if not isinstance(entry, dict):
            continue
        scalerank = int(entry.get("scalerank", -1))
        if scalerank < 0 or scalerank > max_scalerank:
            continue
        if bool(entry.get("intersects_urban")) or bool(entry.get("all_urban")):
            return True
    return False


def classify_res4_metadata_row(
    row: dict[str, Any],
    thresholds: ClassifierThresholds,
    nodata_fallback: str = "water",
) -> str:
    """
    Why this exists:
        Produce final res4 terrain kind from metadata including urban overlay when applicable.
    When to use:
        Counting res4 ``water`` children for res1 ``water_pct``.
    What to expect:
        Urban replaces non-water kinds; water cells stay water.
    """
    terrain = classify_metadata_row_without_urban(row, thresholds, nodata_fallback=nodata_fallback)
    if terrain != "water" and is_res4_urban_overlay_row(row):
        return "urban"
    return terrain
