"""WGS84 bounds for a set of H3 cells, and clipping that respects the antimeridian."""

from __future__ import annotations

import logging
from collections.abc import Iterable

from shapely import make_valid
from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import clip_by_rect

from .logging_utils import TRACE_LEVEL
from .sampling import cell_polygon

LOGGER = logging.getLogger(__name__)


def bounds_for_cells(
    cells: Iterable[str],
    margin_deg: float = 1.0,
) -> tuple[float, float, float, float] | None:
    """
    Why this exists:
        Limit shapefile work to the map being exported.
    When to use:
        Before clipping ocean, lake, or urban polygons to a regional cell set.
    What to expect:
        ``(min_lon, min_lat, max_lon, max_lat)`` padded by ``margin_deg``, with latitude
        clamped to ±90. Returns ``None`` when the set is empty, any cell polygon reaches
        past ±180 longitude, or the padded width exceeds 180 degrees. ``None`` means the
        caller must not clip.
    """

    cell_list = list(cells)
    LOGGER.debug("Computing clip bounds for %d cells (margin_deg=%s).", len(cell_list), margin_deg)
    if not cell_list:
        return None
    min_lon = min_lat = float("inf")
    max_lon = max_lat = float("-inf")
    for cell in cell_list:
        west, south, east, north = cell_polygon(cell).bounds
        if west < -180.0 or east > 180.0:
            LOGGER.debug("Cell %s crosses the antimeridian; clip bounds are unset.", cell)
            return None
        min_lon = min(min_lon, west)
        min_lat = min(min_lat, south)
        max_lon = max(max_lon, east)
        max_lat = max(max_lat, north)
    min_lon -= margin_deg
    max_lon += margin_deg
    min_lat = max(-90.0, min_lat - margin_deg)
    max_lat = min(90.0, max_lat + margin_deg)
    if max_lon - min_lon > 180.0 or min_lon < -180.0 or max_lon > 180.0:
        LOGGER.debug("Padded bounds cross the antimeridian or exceed 180 degrees.")
        return None
    return (min_lon, min_lat, max_lon, max_lat)


def clip_polygonal_to_bounds(
    geom: BaseGeometry,
    bounds: tuple[float, float, float, float] | None,
) -> BaseGeometry:
    """
    Why this exists:
        Drop polygon area outside a regional map before building spatial indexes.
    When to use:
        When ``bounds_for_cells`` returned a box. Pass the geometry through when bounds are ``None``.
    What to expect:
        A polygon or multipolygon. Returns the input unchanged when ``bounds`` is ``None``.
        Returns an empty ``Polygon`` when the clip leaves nothing polygonal.
    """

    LOGGER.debug("Clipping polygonal geometry (bounds=%s).", bounds)
    if bounds is None:
        return geom
    clipped = make_valid(clip_by_rect(geom, *bounds))
    return _polygonal_parts(clipped)


def bounds_intersect(
    left: tuple[float, float, float, float],
    right: tuple[float, float, float, float],
) -> bool:
    """
    Why this exists:
        Skip features whose bounding boxes miss a regional clip.
    When to use:
        Before the more expensive polygon clip.
    What to expect:
        True when the boxes overlap, including edge contact. Does not change either box.
    """

    LOGGER.log(TRACE_LEVEL, "Testing bounds intersection (%s vs %s).", left, right)
    return left[0] <= right[2] and right[0] <= left[2] and left[1] <= right[3] and right[1] <= left[3]


def _polygonal_parts(geom: BaseGeometry) -> BaseGeometry:
    """
    Why this exists:
        A clip can leave lines and points, which mask code cannot use.
    When to use:
        After ``clip_by_rect`` and ``make_valid``.
    What to expect:
        A ``Polygon``, a ``MultiPolygon``, or an empty ``Polygon``.
    """

    if geom.is_empty:
        return Polygon()
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    parts = [part for part in getattr(geom, "geoms", ()) if isinstance(part, (Polygon, MultiPolygon)) and not part.is_empty]
    if not parts:
        return Polygon()
    if len(parts) == 1:
        return parts[0]
    polygons: list[Polygon] = []
    for part in parts:
        if isinstance(part, Polygon):
            polygons.append(part)
        else:
            polygons.extend(part.geoms)
    if not polygons:
        return Polygon()
    if len(polygons) == 1:
        return polygons[0]
    return MultiPolygon(polygons)
