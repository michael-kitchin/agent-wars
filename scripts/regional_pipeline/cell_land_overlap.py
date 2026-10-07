"""Estimate how many square kilometres of a polygon lie inside one H3 cell."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import h3
from shapely import STRtree
from shapely.affinity import translate
from shapely.geometry.base import BaseGeometry

from scripts.terrain_pipeline.sampling import cell_polygon

from .member_geometry import AdminLayers

LOGGER = logging.getLogger(__name__)


def overlap_km2(cell: str, geometry: BaseGeometry) -> float:
    """
    Why this exists:
        Estimate polygon area inside one H3 cell without projecting every cell.
    When to use:
        For country land and member land while building footprint candidates.
    What to expect:
        ``h3.cell_area`` times the share of the cell polygon covered by ``geometry``.
        An unwrapped antimeridian cell also tests the geometry shifted by 360 degrees.
        A polygon that misses the cell returns 0.
    """

    LOGGER.debug("overlap_km2 cell=%s.", cell)
    poly = cell_polygon(cell)
    if poly.is_empty or poly.area == 0:
        return 0.0
    covered = poly.intersection(geometry).area
    if poly.bounds[2] > 180:
        covered += poly.intersection(translate(geometry, xoff=360)).area
    return h3.cell_area(cell, unit="km^2") * covered / poly.area


@dataclass(frozen=True, eq=False)
class CountryLandIndex:
    """
    Why this exists:
        Find which admin-0 polygons meet a cell without testing every country.
    When to use:
        While measuring ``land_km2`` for footprint candidates.
    What to expect:
        ``land_km2`` sums overlap over the tree hits. It does not include ocean.
    """

    # Admin-0 polygons in the same order as the spatial index.
    geometries: tuple[BaseGeometry, ...]
    # Spatial index over ``geometries``.
    tree: STRtree

    @staticmethod
    def from_layers(layers: AdminLayers) -> CountryLandIndex:
        """
        Why this exists:
            Build the spatial index from loaded admin-0 polygons.
        When to use:
            Once per process, after admin layers load.
        What to expect:
            An index over every admin-0 geometry.
        """

        LOGGER.debug("CountryLandIndex.from_layers countries=%d.", len(layers.admin0_by_code))
        geometries = tuple(layers.admin0_by_code.values())
        return CountryLandIndex(geometries=geometries, tree=STRtree(geometries))

    def land_km2(self, cell: str) -> float:
        """
        Why this exists:
            Sum country overlap inside one strategic cell.
        When to use:
            For every footprint candidate.
        What to expect:
            Square kilometres of admin-0 land. Unwrapped cells also query the polygon shifted west by 360 degrees.
        """

        LOGGER.debug("CountryLandIndex.land_km2 cell=%s.", cell)
        poly = cell_polygon(cell)
        hit_ids = set(int(index) for index in self.tree.query(poly))
        if poly.bounds[2] > 180:
            shifted = translate(poly, xoff=-360)
            hit_ids.update(int(index) for index in self.tree.query(shifted))
        return sum(overlap_km2(cell, self.geometries[index]) for index in hit_ids)
