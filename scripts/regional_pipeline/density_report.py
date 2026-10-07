"""Compare overlay density in a regional pack with the global pack."""

from __future__ import annotations

import json
import logging
import math
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from scripts.terrain_pipeline.config import build_default_config
from scripts.terrain_pipeline.metadata_classifier import classify_res4_metadata_row, is_res4_urban_overlay_row

from .region_manifest import read_manifest
from .region_paths import REGIONS_ROOT, RegionPaths
from .scalerank_policy import GLOBAL_TACTICAL_POLICY, SCALERANK_MIN, ScalerankPolicy

LOGGER = logging.getLogger(__name__)

# Share and per-hex metrics that are compared with the global pack.
_RATIO_KEYS = (
    "urban_share",
    "road_share",
    "rail_share",
    "airports_per_100_land_hexes",
    "seaports_per_100_land_hexes",
    "city_labels_per_land_hex",
)


def nearest_rank_percentile(values: Sequence[int], percentile: float) -> int:
    """
    Why this exists:
        Summarize how many urban tactical cells sit in one strategic hex.
    When to use:
        On the list of urban-cell counts for producing hexes.
    What to expect:
        The nearest-rank value. For ``[1, 2, 3, 4, 10]``, the median is 3 and the 90th percentile is 10.
    Exceptions:
        ``ValueError`` when ``values`` is empty.
    """

    LOGGER.debug("nearest_rank_percentile count=%d percentile=%s.", len(values), percentile)
    if not values:
        raise ValueError("nearest_rank_percentile requires at least one value.")
    ordered = sorted(values)
    index = max(0, math.ceil(percentile * len(ordered)) - 1)
    return ordered[index]


def count_matching_cities(cities: Sequence[Mapping[str, Any]], maximum: int) -> int:
    """
    Why this exists:
        Count city labels a later loader would draw at one scalerank ceiling.
    When to use:
        While measuring city labels per strategic land hex.
    What to expect:
        The number of cities whose scalerank is from 0 through ``maximum`` inclusive.
    """

    LOGGER.debug("count_matching_cities cities=%d maximum=%s.", len(cities), maximum)
    return sum(
        1
        for city in cities
        if SCALERANK_MIN <= int(city.get("scalerank", -1)) <= maximum
    )


def _rank_count(entries: Sequence[Mapping[str, Any]] | None, maximum: int) -> int:
    """
    Why this exists:
        Sum airport or seaport counts at or below a scalerank ceiling.
    When to use:
        While measuring ports per 100 strategic land hexes.
    What to expect:
        Zero when the list is missing. Counts with a scalerank above ``maximum`` are skipped.
    """

    total = 0
    for entry in entries or []:
        rank = int(entry.get("scalerank", -1))
        count = int(entry.get("count", 0))
        if count > 0 and SCALERANK_MIN <= rank <= maximum:
            total += count
    return total


def _parent(cell: str, strategic_resolution: int) -> str:
    """
    Why this exists:
        Map a tactical cell back to the strategic hex that contains it.
    When to use:
        When a metric is limited to children of strategic land hexes.
    What to expect:
        The parent cell id at ``strategic_resolution``.
    """

    import h3

    return h3.cell_to_parent(cell, strategic_resolution)


def measure_pack(
    *,
    policy: ScalerankPolicy,
    strategic_resolution: int,
    tactical_rows: Sequence[Mapping[str, Any]],
    landmass_rows: Sequence[Mapping[str, Any]],
    naming_rows: Sequence[Mapping[str, Any]],
    side_rows: Sequence[Mapping[str, Any]],
    roles: Mapping[str, str] | None,
) -> dict[str, Any]:
    """
    Why this exists:
        Compute the same overlay densities for the global pack and for one region.
    When to use:
        After the metadata, landmass, naming, and side files for a pack are loaded.
    What to expect:
        Shares are fractions of tactical land cells. Port and city rates use strategic land hexes.
        ``roles`` limits a region to land-role hexes. None keeps every strategic land hex from landmass.
    """

    LOGGER.debug(
        "measure_pack tactical=%d landmass=%d roles=%s.",
        len(tactical_rows),
        len(landmass_rows),
        None if roles is None else len(roles),
    )
    thresholds = build_default_config().thresholds
    strategic_land = {
        str(row["h3_index"])
        for row in landmass_rows
        if float(row.get("water_pct", 100)) < 85
        and (roles is None or roles.get(str(row["h3_index"])) == "land")
    }
    tactical_land = [
        row
        for row in tactical_rows
        if classify_res4_metadata_row(dict(row), thresholds) != "water"
        and _parent(str(row["h3_index"]), strategic_resolution) in strategic_land
    ]
    land_count = len(tactical_land)
    strategic_count = len(strategic_land)

    def share(maximum: int) -> float:
        if land_count == 0:
            return 0.0
        hits = sum(1 for row in tactical_land if is_res4_urban_overlay_row(dict(row), maximum))
        return hits / land_count

    def per_hundred(field: str, maximum: int) -> float:
        if strategic_count == 0:
            return 0.0
        total = sum(_rank_count(row.get(field), maximum) for row in tactical_land)
        return total * 100 / strategic_count

    def city_rate(maximum: int) -> float:
        if strategic_count == 0:
            return 0.0
        labeled = 0
        for row in naming_rows:
            parent = _parent(str(row["h3_index"]), strategic_resolution)
            if parent not in strategic_land:
                continue
            if count_matching_cities(row.get("cities") or [], maximum) > 0:
                labeled += 1
        return labeled / strategic_count

    urban_by_parent: dict[str, int] = {}
    urban_by_parent_at_5: dict[str, int] = {}
    for row in tactical_land:
        parent = _parent(str(row["h3_index"]), strategic_resolution)
        if is_res4_urban_overlay_row(dict(row), policy.urban_overlay_max):
            urban_by_parent[parent] = urban_by_parent.get(parent, 0) + 1
        if is_res4_urban_overlay_row(dict(row), 5):
            urban_by_parent_at_5[parent] = urban_by_parent_at_5.get(parent, 0) + 1
    side_by_cell = {str(row["h3_index"]): row for row in side_rows}
    road_hits = sum(1 for row in tactical_land if any(side_by_cell.get(str(row["h3_index"]), {}).get("road_sides") or []))
    rail_hits = sum(1 for row in tactical_land if any(side_by_cell.get(str(row["h3_index"]), {}).get("rail_sides") or []))

    def percentiles(counts: dict[str, int]) -> dict[str, int | None]:
        values = list(counts.values())
        if not values:
            return {"median": None, "p75": None, "p90": None}
        return {
            "median": nearest_rank_percentile(values, 0.5),
            "p75": nearest_rank_percentile(values, 0.75),
            "p90": nearest_rank_percentile(values, 0.9),
        }

    return {
        "urban_share": share(policy.urban_overlay_max),
        "road_share": 0.0 if land_count == 0 else road_hits / land_count,
        "rail_share": 0.0 if land_count == 0 else rail_hits / land_count,
        "airports_per_100_land_hexes": per_hundred("airport_count_by_scalerank", policy.major_airport_max),
        "seaports_per_100_land_hexes": per_hundred("seaport_count_by_scalerank", policy.major_seaport_max),
        "city_labels_per_land_hex": city_rate(policy.city_label_max),
        "urban_cells_total": sum(urban_by_parent.values()),
        "producing_hexes": len(urban_by_parent),
        "urban_cells_per_producing_hex": percentiles(urban_by_parent),
        "urban_cells_per_producing_hex_at_5": percentiles(urban_by_parent_at_5),
        "sensitivity": {
            str(maximum): {
                "urban_share": share(maximum),
                "airports_per_100_land_hexes": per_hundred("airport_count_by_scalerank", maximum),
                "seaports_per_100_land_hexes": per_hundred("seaport_count_by_scalerank", maximum),
                "city_labels_per_land_hex": city_rate(maximum),
            }
            for maximum in (policy.urban_overlay_max - 1, policy.urban_overlay_max, policy.urban_overlay_max + 1)
        },
    }


def _load_records(path: Path) -> list[dict[str, Any]] | None:
    """
    Why this exists:
        Read the records array from one generated JSON file.
    When to use:
        While building a density report.
    What to expect:
        None when the file is missing.
    """

    if not path.is_file():
        return None
    document = json.loads(path.read_text(encoding="utf-8"))
    records = document.get("records", document.get("rows"))
    return list(records or [])


def _flags(region_metrics: Mapping[str, Any], global_metrics: Mapping[str, Any]) -> dict[str, Any]:
    """
    Why this exists:
        Mark regional densities that are far from the global pack.
    When to use:
        After both packs have been measured.
    What to expect:
        Ratios for each share or per-hex metric, and flag names where the ratio is below 0.5 or above 2.
    """

    ratios: dict[str, float | None] = {}
    flags: list[str] = []
    for key in _RATIO_KEYS:
        baseline = float(global_metrics.get(key) or 0)
        actual = float(region_metrics.get(key) or 0)
        ratio = None if baseline == 0 else actual / baseline
        ratios[key] = ratio
        if ratio is not None and (ratio < 0.5 or ratio > 2.0):
            flags.append(key)
    return {"ratio_to_global": ratios, "flags": flags}


def build_density_report(regions_root: Path, generated_dir: Path) -> dict[str, Any]:
    """
    Why this exists:
        Assemble global densities and one block per region that has the required files.
    When to use:
        The report command, after at least the global pack and the finished regions exist.
    What to expect:
        A ``global`` block and a ``regions`` object. A region missing metadata, landmass, naming, or sides is omitted.
    """

    LOGGER.debug("build_density_report regions_root=%s generated_dir=%s.", regions_root, generated_dir)
    global_metrics = measure_pack(
        policy=GLOBAL_TACTICAL_POLICY,
        strategic_resolution=1,
        tactical_rows=_load_records(generated_dir / "terrain_res4_metadata.json") or [],
        landmass_rows=_load_records(generated_dir / "terrain_res1_landmass.json") or [],
        naming_rows=_load_records(generated_dir / "terrain_res4_naming.json") or [],
        side_rows=_load_records(generated_dir / "terrain_res4_road_rail_sides.json") or [],
        roles=None,
    )
    regions: dict[str, Any] = {}
    if regions_root.is_dir():
        for folder in sorted(path for path in regions_root.iterdir() if path.is_dir() and path.name != "qa"):
            paths = RegionPaths.for_region(folder.name, regions_root)
            needed = (paths.metadata_t, paths.landmass_s, paths.naming_t, paths.road_rail_sides_t, paths.manifest)
            if not all(path.is_file() for path in needed):
                continue
            manifest = read_manifest(paths.manifest)
            roles = {cell: role.value for cell, role in manifest.footprint.roles.items()}
            metrics = measure_pack(
                policy=manifest.policy,
                strategic_resolution=manifest.footprint.strategic_resolution,
                tactical_rows=_load_records(paths.metadata_t) or [],
                landmass_rows=_load_records(paths.landmass_s) or [],
                naming_rows=_load_records(paths.naming_t) or [],
                side_rows=_load_records(paths.road_rail_sides_t) or [],
                roles=roles,
            )
            metrics.update(_flags(metrics, global_metrics))
            regions[folder.name] = metrics
    return {"global": global_metrics, "regions": regions}


def write_density_report(report: Mapping[str, Any], out_path: Path) -> None:
    """
    Why this exists:
        Save the density report for later comparison.
    When to use:
        After ``build_density_report``.
    What to expect:
        Pretty JSON at ``out_path``. Creates the parent folder.
    """

    LOGGER.debug("write_density_report path=%s regions=%d.", out_path, len(report.get("regions", {})))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    LOGGER.info("Wrote density report %s.", out_path)
