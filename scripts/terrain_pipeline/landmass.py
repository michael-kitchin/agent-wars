"""
Export per-res1-hex land-mass membership and water fraction for strategic land-unit pathfinding.

Data sources: ``ne_10m_geography_regions_polys.shp`` (continent/island ids) and res4 metadata
terrain classification (``water_pct``). See ``.spec/res1-landmass-data-sources-execution-plan.md``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Sequence

import h3
from pyproj import CRS, Transformer
from shapely.ops import transform
from shapely.strtree import STRtree

from .config import PipelineConfig, build_default_config
from .geography_regions import RegionFeature, load_geography_region_features
from .metadata_io import write_json_document
from .res1_water_pct import (
    assert_corridor_water_pct_below_threshold,
    compute_water_pct_from_children,
    load_metadata_rows_by_h3,
    res4_metadata_path,
)
from .sampling import cell_polygon, _ensure_proj_data_env

LOGGER = logging.getLogger(__name__)

LANDMASS_SCHEMA_VERSION = "2.0.0"
INTERSECTION_AREA_EPSILON_M2 = 1.0

LANDMASS_SPOT_CHECK_HEXES: dict[str, str] = {
    "GK": "813e7ffffffffff",
    "GT": "81533ffffffffff",
    "FF": "812dbffffffffff",
    "H6": "81523ffffffffff",
    "IG": "81527ffffffffff",
    "JC": "8152bffffffffff",
    "JG": "8152fffffffffff",
    "HZ": "8153bffffffffff",
    "I8": "8167bffffffffff",
}


@dataclass(frozen=True)
class LandMassRecord:
    """
    Why this exists:
        Hold continent, island, and water-fraction metrics for one strategic cell.
    When to use:
        Inside landmass export, before serializing a JSON row.
    What to expect:
        ``water_pct`` is 0–100. Id tuples are sorted and may be empty.
    """

    # Strategic H3 index this row describes.
    h3_index: str
    # Percent of tactical children classified as water.
    water_pct: float
    # Natural Earth ids of overlapping continent-tier polygons.
    continent_ids: tuple[int, ...]
    # Natural Earth ids of overlapping islands that pass the area floor.
    island_ids: tuple[int, ...]


@dataclass(frozen=True)
class GeographyIndex:
    """
    Why this exists:
        Keep continent and island polygons together with the spatial index used to query them.
    When to use:
        Pass one index into ``build_landmass_records``.
    What to expect:
        ``island_tree`` is ``None`` when no island passed the area floor.
    """

    # Continent and isthmus polygons.
    continent_tier: tuple[RegionFeature, ...]
    # Islands at or above the area floor used to build this index.
    islands: tuple[RegionFeature, ...]
    # Spatial index over island polygons, or None when ``islands`` is empty.
    island_tree: STRtree | None


def _generate_cells_for_resolution(resolution: int) -> list[str]:
    cells: list[str] = []
    for res0 in h3.get_res0_cells():
        cells.extend(h3.cell_to_children(res0, resolution))
    return sorted(set(cells))


def _geography_regions_path(config: PipelineConfig) -> Path:
    return config.input_rasters.root / config.input_rasters.geography_regions_shapefile_name


def load_geography_index(config: PipelineConfig, island_min_area_km2: float) -> GeographyIndex:
    """
    Why this exists:
        Load continent and island polygons at the island floor a pack requires.
    When to use:
        Once per landmass export. Pass the global 2000 km² floor for the global pack.
    What to expect:
        Raises when the geography shapefile is missing or invalid. A smaller floor keeps more islands.
    """

    LOGGER.debug("Loading geography index (island_min_area_km2=%s).", island_min_area_km2)
    geo_path = _geography_regions_path(config)
    continent_tier, islands = load_geography_region_features(geo_path, island_min_area_km2)
    island_geoms = [island.geometry_wgs84 for island in islands]
    island_tree = STRtree(island_geoms) if island_geoms else None
    return GeographyIndex(tuple(continent_tier), tuple(islands), island_tree)


def _laea_transformer(lon: float, lat: float) -> Transformer:
    """Build a WGS84 -> Lambert Azimuthal Equal-Area transformer centered on ``(lon, lat)``."""
    _ensure_proj_data_env()
    aea = CRS.from_proj4(f"+proj=laea +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m +no_defs")
    return Transformer.from_crs(CRS.from_epsg(4326), aea, always_xy=True)


def _to_aea(geom_wgs84: Any, transformer: Transformer) -> Any:
    return transform(transformer.transform, geom_wgs84)


def _make_valid(geom: Any) -> Any:
    if geom.is_empty:
        return geom
    if geom.is_valid:
        return geom
    return geom.buffer(0)


def _safe_intersection(a: Any, b: Any) -> Any:
    if a is None or b is None or a.is_empty or b.is_empty:
        from shapely.geometry import Polygon

        return Polygon()
    left = _make_valid(a)
    right = _make_valid(b)
    if not left.intersects(right):
        from shapely.geometry import Polygon

        return Polygon()
    try:
        return left.intersection(right)
    except Exception:
        return left.buffer(0).intersection(right.buffer(0))


def _intersection_area_m2(cell_aea: Any, land_aea: Any) -> float:
    inter = _safe_intersection(cell_aea, land_aea)
    if inter.is_empty:
        return 0.0
    return float(inter.area)


def compute_res1_region_membership(
    h3_index: str,
    continent_tier: Sequence[RegionFeature],
    island_tree: STRtree | None,
    island_features: Sequence[RegionFeature],
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    """
    Why this exists:
        Derive continent-tier and island ``NE_ID`` membership for one res-1 cell.
    When to use:
        Once per res-1 H3 index during landmass JSON export.
    What to expect:
        Sorted deduplicated id tuples; empty when no polygon overlap exceeds epsilon area.
    """
    cell_wgs = cell_polygon(h3_index)
    if cell_wgs.is_empty:
        return (), ()

    centroid = cell_wgs.centroid
    transformer = _laea_transformer(centroid.x, centroid.y)
    cell_aea = _to_aea(cell_wgs, transformer)

    continent_ids: list[int] = []
    island_ids: list[int] = []
    seen_continent: set[int] = set()
    seen_island: set[int] = set()

    for region in continent_tier:
        if not cell_wgs.intersects(region.geometry_wgs84):
            continue
        part_aea = _to_aea(region.geometry_wgs84, transformer)
        area = _intersection_area_m2(cell_aea, part_aea)
        if area > INTERSECTION_AREA_EPSILON_M2 and region.region_id not in seen_continent:
            seen_continent.add(region.region_id)
            continent_ids.append(region.region_id)

    if island_tree is not None and island_features:
        candidate_indices = island_tree.query(cell_wgs)
        for idx in candidate_indices:
            island = island_features[int(idx)]
            if island.region_id in seen_island:
                continue
            if not cell_wgs.intersects(island.geometry_wgs84):
                continue
            part_aea = _to_aea(island.geometry_wgs84, transformer)
            area = _intersection_area_m2(cell_aea, part_aea)
            if area > INTERSECTION_AREA_EPSILON_M2:
                seen_island.add(island.region_id)
                island_ids.append(island.region_id)

    return tuple(sorted(continent_ids)), tuple(sorted(island_ids))


def compute_res1_landmass_record(
    h3_index: str,
    continent_tier: Sequence[RegionFeature],
    island_tree: STRtree | None,
    island_features: Sequence[RegionFeature],
    res4_metadata_by_h3: dict[str, dict[str, Any]],
    config: PipelineConfig,
    *,
    child_resolution: int = 4,
) -> LandMassRecord:
    """
    Why this exists:
        Assemble one landmass row from geography region membership and res4-derived water fraction.
    When to use:
        Per res-1 cell inside ``LandMassExporter.run``.
    What to expect:
        ``water_pct`` from res4 child classification; ids from NE geography polygons.
    """
    continent_ids, island_ids = compute_res1_region_membership(
        h3_index,
        continent_tier,
        island_tree,
        island_features,
    )
    water_pct = compute_water_pct_from_children(
        h3_index,
        res4_metadata_by_h3,
        config.thresholds,
        child_resolution=child_resolution,
        nodata_fallback=config.nodata_fallback_terrain,
    )
    return LandMassRecord(
        h3_index=h3_index,
        water_pct=water_pct,
        continent_ids=continent_ids,
        island_ids=island_ids,
    )


def record_to_json_dict(record: LandMassRecord) -> dict[str, Any]:
    """Serialize one landmass row with stable key order."""
    return {
        "h3_index": record.h3_index,
        "water_pct": record.water_pct,
        "continent_ids": list(record.continent_ids),
        "island_ids": list(record.island_ids),
    }


def build_landmass_records(
    cells: Sequence[str],
    geography: GeographyIndex,
    child_rows_by_h3: dict[str, dict[str, Any]],
    config: PipelineConfig,
    *,
    child_resolution: int,
) -> list[LandMassRecord]:
    """
    Why this exists:
        Compute landmass rows for an explicit strategic cell list.
    When to use:
        After the geography index and tactical metadata rows are loaded.
    What to expect:
        One record per cell, in input order. Logs progress every 100 cells.
    """

    LOGGER.debug("Building landmass records for %d cells (child_resolution=%d).", len(cells), child_resolution)
    records: list[LandMassRecord] = []
    for idx, h3_index in enumerate(cells):
        if idx == 0 or (idx + 1) % 100 == 0:
            LOGGER.debug("Computing landmass metrics: %d / %d cells.", idx + 1, len(cells))
        records.append(
            compute_res1_landmass_record(
                h3_index,
                geography.continent_tier,
                geography.island_tree,
                geography.islands,
                child_rows_by_h3,
                config,
                child_resolution=child_resolution,
            )
        )
    return records


def build_landmass_envelope(
    *,
    records: Sequence[dict[str, Any]],
    island_min_area_km2: float,
    resolution: int = 1,
    water_pct_method: str = "res4_child_water_terrain_fraction",
    water_pct_requires: tuple[str, ...] = ("terrain_res4_metadata.json",),
) -> dict[str, Any]:
    """
    Why this exists:
        Wrap landmass rows in the envelope the global file already uses.
    When to use:
        Immediately before writing the landmass JSON.
    What to expect:
        Defaults reproduce the global resolution-1 envelope, including the water-percent method string.
    """

    LOGGER.debug("Building landmass envelope for %d records at resolution %d.", len(records), resolution)
    return {
        "schema_version": LANDMASS_SCHEMA_VERSION,
        "resolution": resolution,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "record_count": len(records),
        "polygon_source": {
            "shapefile": "ne_10m_geography_regions_polys.shp",
            "continent_featurecla": ["Continent", "Isthmus"],
            "island_featurecla": "Island",
            "id_property": "NE_ID",
            "island_min_area_km2": island_min_area_km2,
        },
        "water_pct_source": {
            "method": water_pct_method,
            "requires": list(water_pct_requires),
        },
        "records": list(records),
    }


def build_qa_summary(records: Sequence[LandMassRecord]) -> dict[str, Any]:
    """Aggregate counts and named spot-check rows for manual review."""
    with_continents = sum(1 for r in records if r.continent_ids)
    with_islands = sum(1 for r in records if r.island_ids)
    fully_unassigned = sum(
        1 for r in records if r.water_pct >= 99.9 and not r.continent_ids and not r.island_ids
    )
    by_h3 = {r.h3_index: r for r in records}
    spot_checks = {
        code: record_to_json_dict(by_h3[h3_index])
        for code, h3_index in LANDMASS_SPOT_CHECK_HEXES.items()
        if h3_index in by_h3
    }
    island_only_samples = [r for r in records if r.island_ids and not r.continent_ids][:5]
    return {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "record_count": len(records),
        "hexes_with_continents": with_continents,
        "hexes_with_islands": with_islands,
        "hexes_fully_unassigned_high_water": fully_unassigned,
        "spot_checks": spot_checks,
        "island_only_samples": [record_to_json_dict(r) for r in island_only_samples],
    }


class LandMassExporter:
    """
    Why this exists:
        Orchestrate res-1 landmass JSON export from NE geography regions and res4 metadata.
    When to use:
        CLI ``run`` after res4 metadata exists under ``data/generated``.
    What to expect:
        Writes ``terrain_res1_landmass.json`` and QA summary under ``data/generated/qa``.
    """

    def __init__(self, config: PipelineConfig | None = None) -> None:
        self.config = config or build_default_config()

    def run(self) -> Path:
        LOGGER.debug("LandMassExporter.run starting.")
        cfg = self.config
        geography = load_geography_index(cfg, cfg.island_min_area_km2)
        child_rows = load_metadata_rows_by_h3(res4_metadata_path(cfg))
        cells = _generate_cells_for_resolution(cfg.res_parent)
        records = build_landmass_records(
            cells,
            geography,
            child_rows,
            cfg,
            child_resolution=cfg.res_child,
        )

        json_records = [record_to_json_dict(r) for r in records]
        assert_corridor_water_pct_below_threshold(
            {row["h3_index"]: row for row in json_records},
            threshold=cfg.land_water_threshold_pct,
        )
        out_path = cfg.output_dir / cfg.terrain_res1_landmass_filename
        write_json_document(
            out_path,
            build_landmass_envelope(
                records=json_records,
                island_min_area_km2=cfg.island_min_area_km2,
            ),
        )
        qa_path = cfg.qa_dir / "terrain_res1_landmass_qa.json"
        write_json_document(qa_path, build_qa_summary(records))
        LOGGER.info("Wrote %d landmass records to %s", len(records), out_path)
        return out_path


def export_res1_landmass(config: PipelineConfig | None = None) -> Path:
    """Convenience entry for tests and scripts."""
    return LandMassExporter(config).run()
