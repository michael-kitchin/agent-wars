"""Measure strategic cells that might belong to one region's footprint."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path

import fiona
import h3
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from shapely.validation import make_valid

from scripts.terrain_pipeline.geometry_bounds import bounds_intersect

from .cell_land_overlap import CountryLandIndex, overlap_km2
from .footprint import SETTLED_LAND_SHARE_MAX, CandidateCell
from .member_geometry import AdminLayers, build_member_geometry, load_admin_layers
from .region_models import RegionDefinition
from .regional_scaling import center_spacing_km

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, eq=False)
class FootprintInputs:
    """
    Why this exists:
        Hold the geometries shared by every region's footprint.
    When to use:
        Once per process, then pass the same object into each region's candidate builder.
    What to expect:
        Admin layers, a country land index, populated-place points as ``(lat, lng)``, and the urban union.
    """

    # Admin-0 and admin-1 polygons.
    layers: AdminLayers
    # Spatial index of admin-0 land.
    land_index: CountryLandIndex
    # Populated-place centroids as latitude, longitude.
    populated_points: tuple[tuple[float, float], ...]
    # Union of every urban polygon.
    urban_wgs84: BaseGeometry


def _polygonal_parts(geom: BaseGeometry) -> list[BaseGeometry]:
    """
    Why this exists:
        H3 polygon conversion accepts polygons, not lines or points.
    When to use:
        Before asking H3 which cells a member or urban geometry touches.
    What to expect:
        Polygon parts only. Empty input returns an empty list.
    """

    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if geom.geom_type in {"MultiPolygon", "GeometryCollection"}:
        parts: list[BaseGeometry] = []
        for child in geom.geoms:
            parts.extend(_polygonal_parts(child))
        return parts
    return []


def _load_points(path: Path) -> tuple[tuple[float, float], ...]:
    """
    Why this exists:
        Read populated-place locations for the settled-cell test.
    When to use:
        While loading footprint inputs.
    What to expect:
        One ``(lat, lng)`` pair per point or multipoint vertex.
    """

    LOGGER.debug("Loading populated points from %s.", path)
    points: list[tuple[float, float]] = []
    with fiona.open(path) as src:
        for feature in src:
            geom = feature.get("geometry")
            if geom is None:
                continue
            shapely_geom = shape(geom)
            if shapely_geom.geom_type == "Point":
                points.append((float(shapely_geom.y), float(shapely_geom.x)))
            elif shapely_geom.geom_type == "MultiPoint":
                points.extend((float(part.y), float(part.x)) for part in shapely_geom.geoms)
    return tuple(points)


def _load_urban_union(path: Path) -> BaseGeometry:
    """
    Why this exists:
        Treat any urban polygon as settled land.
    When to use:
        While loading footprint inputs.
    What to expect:
        One valid geometry covering every urban polygon in the shapefile.
    """

    LOGGER.debug("Loading urban union from %s.", path)
    parts: list[BaseGeometry] = []
    with fiona.open(path) as src:
        for feature in src:
            geom = feature.get("geometry")
            if geom is None:
                continue
            shapely_geom = make_valid(shape(geom))
            if not shapely_geom.is_empty:
                parts.append(shapely_geom)
    return unary_union(parts)


def load_footprint_inputs(data_root: Path) -> FootprintInputs:
    """
    Why this exists:
        Load every geometry the footprint builder shares across regions.
    When to use:
        Once before ``footprint --all`` or a single-region footprint.
    What to expect:
        Admin layers, the land index, populated points, and the urban union.
    Exceptions:
        Re-raises file and geometry errors after logging them.
    """

    LOGGER.debug("load_footprint_inputs data_root=%s.", data_root)
    try:
        layers = load_admin_layers(data_root)
        points = _load_points(data_root / "ne_10m_populated_places.shp")
        urban = _load_urban_union(data_root / "ne_10m_urban_areas.shp")
    except Exception:
        LOGGER.error("Failed to load footprint inputs from %s.", data_root, exc_info=True)
        raise
    LOGGER.info("Footprint inputs ready: %d populated points.", len(points))
    return FootprintInputs(
        layers=layers,
        land_index=CountryLandIndex.from_layers(layers),
        populated_points=points,
        urban_wgs84=urban,
    )


def _cells_touching(geom: BaseGeometry, resolution: int) -> set[str]:
    """
    Why this exists:
        Find strategic cells that overlap member land.
    When to use:
        Before expanding those cells by the reach ring.
    What to expect:
        Cell ids at ``resolution``. Non-polygon parts are ignored.
    """

    cells: set[str] = set()
    for part in _polygonal_parts(geom):
        h3shape = h3.geo_to_h3shape(part.__geo_interface__)
        cells.update(h3.h3shape_to_cells_experimental(h3shape, resolution, contain="overlap"))
    return cells


def _settled_urban_cells(urban: BaseGeometry, member: BaseGeometry, resolution: int) -> set[str]:
    """
    Why this exists:
        Mark strategic cells that overlap urban land near the member countries.
    When to use:
        While filling the settled flag.
    What to expect:
        Cells at ``resolution``. Urban parts whose bounds miss the member bounds are skipped.
    """

    member_bounds = member.bounds
    cells: set[str] = set()
    for part in _polygonal_parts(urban):
        if not bounds_intersect(part.bounds, member_bounds):
            continue
        h3shape = h3.geo_to_h3shape(part.__geo_interface__)
        cells.update(h3.h3shape_to_cells_experimental(h3shape, resolution, contain="overlap"))
    return cells


def build_footprint_candidates(
    definition: RegionDefinition,
    inputs: FootprintInputs,
    max_reach_km: float,
) -> list[CandidateCell]:
    """
    Why this exists:
        Measure every strategic cell that desert trim, sea, or a neutral border might keep.
    When to use:
        Before ``classify_footprint`` or a reach sweep.
    What to expect:
        One candidate per cell in the expanded ring around member land. Cells outside the centroid window are included with ``in_box`` false.
    """

    LOGGER.debug(
        "build_footprint_candidates region=%s max_reach_km=%s.",
        definition.region_id,
        max_reach_km,
    )
    resolution = definition.strategic_resolution
    member = build_member_geometry(definition, inputs.layers)
    touching = _cells_touching(member, resolution)
    spacing = center_spacing_km(resolution)
    ring_depth = math.ceil(max_reach_km / spacing) + 1
    candidate_ids: set[str] = set()
    for cell in touching:
        candidate_ids.update(h3.grid_disk(cell, ring_depth))
    populated_cells = {
        h3.latlng_to_cell(lat, lng, resolution)
        for lat, lng in inputs.populated_points
    }
    urban_cells = _settled_urban_cells(inputs.urban_wgs84, member, resolution)
    candidates: list[CandidateCell] = []
    for cell in sorted(candidate_ids):
        lat, lng = h3.cell_to_latlng(cell)
        land_km2 = inputs.land_index.land_km2(cell)
        area_km2 = h3.cell_area(cell, unit="km^2")
        settled = (
            cell in populated_cells
            or cell in urban_cells
            or land_km2 < SETTLED_LAND_SHARE_MAX * area_km2
        )
        candidates.append(
            CandidateCell(
                h3_index=cell,
                lat=lat,
                lng=lng,
                in_box=definition.centroid_box.contains(lat, lng),
                land_km2=land_km2,
                member_km2=overlap_km2(cell, member),
                cell_area_km2=area_km2,
                settled=settled,
            )
        )
    LOGGER.info(
        "Measured %d candidates for %s (touching=%d ring=%d).",
        len(candidates),
        definition.region_id,
        len(touching),
        ring_depth,
    )
    return candidates
