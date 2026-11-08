"""Grid, simplify, and quantize line geometry for the vector documents."""

from __future__ import annotations

import logging
import math
from collections.abc import Iterable, Sequence

from pyproj import Transformer
from shapely import clip_by_rect
from shapely.geometry import LineString
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform, unary_union

from scripts.basemap_pipeline.vector_encoding import cell_key, quantize_part
from scripts.basemap_pipeline.vector_settings import (
    COARSE_SPLIT_DEG,
    METERS_PER_PIXEL_Z0,
    MIN_PART_EXTENT_PX,
    SIMPLIFY_TOLERANCE_PX,
    CoastLod,
)
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)

_TO_LONLAT = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
_TO_MERCATOR = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


def meters_per_pixel(zoom: float) -> float:
    """
    Why this exists:
        Simplify tolerances are given in screen pixels and applied in metres.
    When to use:
        Before simplifying a level of detail.
    What to expect:
        Metres per pixel at that zoom on a 256-pixel Web Mercator tile.
    Exceptions:
        None.
    """

    LOGGER.log(TRACE_LEVEL, "meters_per_pixel zoom=%s", zoom)
    return METERS_PER_PIXEL_Z0 / (2.0 ** zoom)


def to_lonlat(geometry: BaseGeometry) -> BaseGeometry:
    """
    Why this exists:
        Cells and stored coordinates are degrees. Simplifying is done in metres.
    When to use:
        After simplifying a part in EPSG:3857.
    What to expect:
        The same shape in longitude, latitude order.
    Exceptions:
        None.
    """

    return transform(_TO_LONLAT.transform, geometry)


def to_mercator(geometry: BaseGeometry) -> BaseGeometry:
    """
    Why this exists:
        Borders are read in degrees and simplified in metres, same as the coastline.
    When to use:
        Before ``encode_lods``.
    What to expect:
        The same shape in EPSG:3857.
    Exceptions:
        None.
    """

    return transform(_TO_MERCATOR.transform, geometry)


def split_by_grid(geometry: BaseGeometry, cell_deg: float) -> dict[str, BaseGeometry]:
    """
    Why this exists:
        A document stores each piece under the cell that contains it.
    When to use:
        On degree geometry. Clip coarse blocks first; do not clip the whole shape once per cell.
    What to expect:
        A map of ``"<row>:<col>"`` to the piece inside that cell. A cell of 360° or more
        returns ``{"0:0": geometry}``. Empty pieces are omitted. Adjacent cells meet on
        the shared edge.
    Exceptions:
        None.
    """

    LOGGER.log(TRACE_LEVEL, "split_by_grid cell_deg=%s type=%s", cell_deg, geometry.geom_type)
    if geometry.is_empty:
        return {}
    if cell_deg >= 360.0:
        return {"0:0": geometry}
    collected: dict[str, list[BaseGeometry]] = {}
    min_lng, min_lat, max_lng, max_lat = geometry.bounds
    for block in _rectangles(min_lng, min_lat, max_lng, max_lat, COARSE_SPLIT_DEG):
        blocked = clip_by_rect(geometry, *block)
        if blocked.is_empty:
            continue
        piece_lng0, piece_lat0, piece_lng1, piece_lat1 = blocked.bounds
        for rect in _rectangles(piece_lng0, piece_lat0, piece_lng1, piece_lat1, cell_deg):
            clipped = clip_by_rect(blocked, *rect)
            if clipped.is_empty or clipped.length == 0:
                continue
            west, south, _, _ = rect
            key = cell_key((south + rect[3]) / 2.0, (west + rect[2]) / 2.0, cell_deg)
            collected.setdefault(key, []).append(clipped)
    return {key: unary_union(pieces) for key, pieces in collected.items()}


def encode_lods(lines_3857: BaseGeometry | Sequence[BaseGeometry], lods: Sequence[CoastLod]) -> list[dict[str, object]]:
    """
    Why this exists:
        Coastlines and borders share one simplify, drop, project, split, and quantize path.
    When to use:
        With lines already in EPSG:3857. This does not remove the Mercator frame.
    What to expect:
        One lod dict per band: ``min_zoom``, ``max_zoom``, ``cell_deg``, and ``cells``.
        Parts smaller than one pixel are dropped, except on the last band. The last band
        is not simplified.
    Exceptions:
        None.
    """

    source = list(_lines_of(lines_3857))
    LOGGER.debug("encode_lods lines=%s bands=%s", len(source), len(lods))
    encoded_lods: list[dict[str, object]] = []
    for lod in lods:
        prepared = _prepare_band(source, lod)
        cells: dict[str, list[list[int]]] = {}
        for line in prepared:
            for key, piece in split_by_grid(to_lonlat(line), lod.cell_deg).items():
                for part in _lines_of(piece):
                    quantized = quantize_part(list(part.coords))
                    if quantized:
                        cells.setdefault(key, []).append(quantized)
        encoded_lods.append({
            "min_zoom": lod.min_zoom,
            "max_zoom": lod.max_zoom,
            "cell_deg": lod.cell_deg,
            "cells": cells,
        })
    return encoded_lods


def _prepare_band(lines: Sequence[LineString], lod: CoastLod) -> list[LineString]:
    """
    Why this exists:
        Coarse bands do not need every bend, and a speck is noise at that zoom.
    When to use:
        Inside ``encode_lods``, once per band.
    What to expect:
        Simplified lines, with parts smaller than one pixel removed. The last band
        is returned unchanged.
    Exceptions:
        None.
    """

    if lod.simplify_zoom is None:
        return list(lines)
    tolerance = SIMPLIFY_TOLERANCE_PX * meters_per_pixel(lod.simplify_zoom)
    minimum = MIN_PART_EXTENT_PX * meters_per_pixel(lod.simplify_zoom)
    prepared: list[LineString] = []
    for line in lines:
        simplified = line.simplify(tolerance, preserve_topology=False)
        for part in _lines_of(simplified):
            min_lng, min_lat, max_lng, max_lat = part.bounds
            if max(max_lng - min_lng, max_lat - min_lat) < minimum:
                continue
            prepared.append(part)
    return prepared


def _rectangles(
    min_lng: float,
    min_lat: float,
    max_lng: float,
    max_lat: float,
    size: float,
) -> Iterable[tuple[float, float, float, float]]:
    """
    Why this exists:
        Walking aligned rectangles keeps a seam on the shared edge instead of overlapping.
    When to use:
        For coarse blocks and for cells.
    What to expect:
        ``(west, south, east, north)`` rectangles of ``size`` degrees that meet the bounds.
        Longitude 180 stays in the first column's neighbor rather than a new column.
    Exceptions:
        None.
    """

    if size <= 0:
        return
    first_col = math.floor((min_lng + 180.0) / size)
    last_col = math.floor((max(max_lng, min_lng) + 180.0) / size)
    first_row = math.floor((min_lat + 90.0) / size)
    last_row = math.floor((max_lat + 90.0) / size)
    # A point on the eastern or northern edge belongs to the rectangle that ends there.
    if max_lng > min_lng and (min_lng + 180.0) / size != first_col and (max_lng + 180.0) % size == 0:
        last_col -= 1
    if max_lat > min_lat and (max_lat + 90.0) % size == 0:
        last_row -= 1
    for row in range(first_row, last_row + 1):
        south = -90.0 + row * size
        for col in range(first_col, last_col + 1):
            west = -180.0 + col * size
            yield (west, south, west + size, south + size)


def _lines_of(geometry: BaseGeometry | Sequence[BaseGeometry]) -> Iterable[LineString]:
    """
    Why this exists:
        Simplify and clip return lines, multilines, and collections.
    When to use:
        Whenever a result needs to be walked as individual lines.
    What to expect:
        LineStrings with at least two points. Points and empty pieces are skipped.
    Exceptions:
        None.
    """

    if isinstance(geometry, (list, tuple)):
        for item in geometry:
            yield from _lines_of(item)
        return
    if geometry.is_empty:
        return
    if isinstance(geometry, LineString):
        if len(geometry.coords) >= 2:
            yield geometry
        return
    if geometry.geom_type in {"MultiLineString", "GeometryCollection", "MultiPoint"}:
        for part in geometry.geoms:
            yield from _lines_of(part)
        return
    if geometry.geom_type in {"Polygon", "MultiPolygon"}:
        yield from _lines_of(geometry.boundary)
