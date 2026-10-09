"""Spatial index of Natural Earth land polygons, split so each island has its own area."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import fiona
from shapely import STRtree
from shapely.affinity import translate
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.validation import make_valid

from scripts.terrain_pipeline.geography_regions import area_km2_wgs84
from scripts.terrain_pipeline.sampling import cell_polygon

from .cell_land_overlap import overlap_km2

LOGGER = logging.getLogger(__name__)


def _polygon_parts(geom: BaseGeometry) -> list[BaseGeometry]:
    """
    Why this exists:
        A multipolygon's area is the sum of its parts. Each island needs its own area.
    When to use:
        While loading ``ne_10m_land.shp``.
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
            parts.extend(_polygon_parts(child))
        return parts
    return []


@dataclass(frozen=True, eq=False)
class LandmassIndex:
    """
    Why this exists:
        Tell a sea-ring cell whether its land belongs to a major landmass.
    When to use:
        Once per footprint run, then ``major_land_km2`` for each candidate.
    What to expect:
        ``major_land_km2`` sums overlap of polygons at or above the given area. Smaller polygons do not count.
    """

    geometries: tuple[BaseGeometry, ...]
    areas_km2: tuple[float, ...]
    tree: STRtree

    @staticmethod
    def from_shapefile(path: Path) -> LandmassIndex:
        """
        Why this exists:
            Load every land polygon before any region is measured.
        When to use:
            From ``load_footprint_inputs``.
        What to expect:
            One index. Logs the polygon count once.
        Exceptions:
            Re-raises file and geometry errors after logging them.
        """

        LOGGER.debug("LandmassIndex.from_shapefile path=%s.", path)
        geometries: list[BaseGeometry] = []
        areas: list[float] = []
        try:
            with fiona.open(path) as src:
                for feature in src:
                    raw = feature.get("geometry")
                    if raw is None:
                        continue
                    for part in _polygon_parts(make_valid(shape(raw))):
                        geometries.append(part)
                        areas.append(area_km2_wgs84(part))
        except Exception:
            LOGGER.error("Failed to load land polygons from %s.", path, exc_info=True)
            raise
        LOGGER.info("Landmass index ready: %d polygons.", len(geometries))
        return LandmassIndex(geometries=tuple(geometries), areas_km2=tuple(areas), tree=STRtree(geometries))

    def major_land_km2(self, cell: str, min_area_km2: float) -> float:
        """
        Why this exists:
            A cell covered only by a small island is not a major landmass.
        When to use:
            While building one footprint candidate.
        What to expect:
            Square kilometres of this cell covered by land polygons at least ``min_area_km2`` in size.
            An unwrapped antimeridian cell also tests the polygon shifted by 360 degrees, via ``overlap_km2``.
        """

        poly = cell_polygon(cell)
        hit_ids = {int(index) for index in self.tree.query(poly)}
        if poly.bounds[2] > 180:
            shifted = translate(poly, xoff=-360)
            hit_ids.update(int(index) for index in self.tree.query(shifted))
        return sum(
            overlap_km2(cell, self.geometries[index])
            for index in hit_ids
            if self.areas_km2[index] >= min_area_km2
        )
