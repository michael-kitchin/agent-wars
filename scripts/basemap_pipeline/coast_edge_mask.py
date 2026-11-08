"""Vector land and water that cover the blurred edge of an over-zoomed tile."""

from __future__ import annotations

import logging
import math

from shapely import clip_by_rect
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.geometry.base import BaseGeometry

from scripts.basemap_pipeline.vector_encoding import cell_key, quantize_part
from scripts.basemap_pipeline.vector_settings import MASK_CELL_DEG, QUANTUM_DEG, VECTOR_SCHEMA_VERSION

LOGGER = logging.getLogger(__name__)

# A cell this full of water is left to the flat water color. The mask would add nothing.
_UNIFORM_WATER_FRACTION = 0.999999


def cell_mask_geometry(
    water_lonlat: BaseGeometry,
    west: float,
    south: float,
    east: float,
    north: float,
) -> tuple[BaseGeometry, BaseGeometry] | None:
    """
    Why this exists:
        The land fill and the water fill have to partition one cell, with no overlap and no gap.
    When to use:
        For each cell the water touches. The rectangle is the cell and nothing outside it.
    What to expect:
        ``(water, land)`` inside the rectangle. ``None`` when the cell is empty of water or
        more than 99.9999% water. Their areas sum to the rectangle.
    Exceptions:
        None.
    """

    rectangle = box(west, south, east, north)
    water_part = clip_by_rect(water_lonlat, west, south, east, north)
    if water_part.is_empty or water_part.area <= 0 or water_part.area > rectangle.area * _UNIFORM_WATER_FRACTION:
        return None
    return water_part, rectangle.difference(water_part)


def build_coast_edge_mask_document(water_lonlat: BaseGeometry) -> dict[str, object]:
    """
    Why this exists:
        Past the zoom the tiles were drawn at, the stretched coast is a soft edge. These polygons are sharp.
    When to use:
        With world water in longitude, latitude.
    What to expect:
        A mask document. Cells are 2° and meet on the shared edge. Uniform cells are omitted.
    Exceptions:
        None. Empty water returns a document with no cells.
    """

    LOGGER.debug("build_coast_edge_mask_document type=%s", water_lonlat.geom_type)
    cells: dict[str, dict[str, list[list[list[int]]]]] = {}
    if not water_lonlat.is_empty:
        min_lng, min_lat, max_lng, max_lat = water_lonlat.bounds
        for west, south, east, north in _cells_touching(min_lng, min_lat, max_lng, max_lat):
            pieces = cell_mask_geometry(water_lonlat, west, south, east, north)
            if pieces is None:
                continue
            water_part, land_part = pieces
            key = cell_key((south + north) / 2.0, (west + east) / 2.0, MASK_CELL_DEG)
            cells[key] = {
                "water": _encode_polygons(water_part),
                "land": _encode_polygons(land_part),
            }
    return {
        "schema_version": VECTOR_SCHEMA_VERSION,
        "kind": "coast_edge_mask",
        "quantum_deg": QUANTUM_DEG,
        "cell_deg": MASK_CELL_DEG,
        "cells": cells,
    }


def _cells_touching(
    min_lng: float,
    min_lat: float,
    max_lng: float,
    max_lat: float,
) -> list[tuple[float, float, float, float]]:
    """
    Why this exists:
        Cells the water does not touch are land, and the mask omits them.
    When to use:
        Before clipping water into 2° cells.
    What to expect:
        Rectangles of ``MASK_CELL_DEG``. A bound that lands on an edge does not open the next cell.
    Exceptions:
        None.
    """

    size = MASK_CELL_DEG
    first_col = math.floor((min_lng + 180.0) / size)
    last_col = math.floor((max_lng + 180.0) / size)
    first_row = math.floor((min_lat + 90.0) / size)
    last_row = math.floor((max_lat + 90.0) / size)
    if max_lng > min_lng and (max_lng + 180.0) % size == 0:
        last_col -= 1
    if max_lat > min_lat and (max_lat + 90.0) % size == 0:
        last_row -= 1
    cells: list[tuple[float, float, float, float]] = []
    for row in range(first_row, last_row + 1):
        south = -90.0 + row * size
        for col in range(first_col, last_col + 1):
            west = -180.0 + col * size
            cells.append((west, south, west + size, south + size))
    return cells


def _encode_polygons(geometry: BaseGeometry) -> list[list[list[int]]]:
    """
    Why this exists:
        A cell stores polygons, each an outer ring followed by its holes.
    When to use:
        After a cell's water and land have been clipped.
    What to expect:
        Quantized rings. A ring's closing point is not repeated. Empty rings are omitted.
    Exceptions:
        None.
    """

    polygons: list[list[list[int]]] = []
    parts = geometry.geoms if isinstance(geometry, MultiPolygon) else [geometry]
    for part in parts:
        if not isinstance(part, Polygon) or part.is_empty:
            continue
        rings = [_encode_ring(part.exterior.coords)]
        rings.extend(_encode_ring(hole.coords) for hole in part.interiors)
        rings = [ring for ring in rings if ring]
        if rings:
            polygons.append(rings)
    return polygons


def _encode_ring(coords: list[tuple[float, float]]) -> list[int]:
    """
    Why this exists:
        Rings use the same integer deltas as lines.
    When to use:
        For an exterior or a hole.
    What to expect:
        A quantized part. Fewer than two distinct points returns an empty list.
    Exceptions:
        None.
    """

    points = list(coords)
    if len(points) >= 2 and points[0] == points[-1]:
        points = points[:-1]
    return quantize_part(points)
