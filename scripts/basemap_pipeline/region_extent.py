"""Camera boxes for a regional pack, including maps that cross 180 degrees."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

import h3

from scripts.basemap_pipeline.web_mercator import MAX_MERCATOR_LAT_DEG, LonLatBox
from scripts.terrain_pipeline.logging_utils import TRACE_LEVEL

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class LongitudeInterval:
    """
    Why this exists:
        Hold the short longitude span of a set of hex centers.
    When to use:
        Before expanding that span to hex vertices.
    What to expect:
        ``east`` may be above 180 and ``west`` below -180 when the span crosses the antimeridian.
    """

    # Western edge of the unwrapped span, in degrees.
    west: float
    # Eastern edge of the unwrapped span, in degrees.
    east: float
    # Midpoint of the unwrapped span, in degrees.
    reference_lng: float
    # True when the span leaves the -180 to 180 window.
    crosses_antimeridian: bool


def align_longitude_to_reference(lng: float, reference_lng: float) -> float:
    """
    Why this exists:
        Keep a vertex next to the map instead of a world away.
    When to use:
        While expanding hex vertices into the camera box.
    What to expect:
        ``lng`` shifted by whole turns of 360 until it is within 180 degrees of the reference.
    """

    shifted = lng
    while shifted - reference_lng > 180.0:
        shifted -= 360.0
    while reference_lng - shifted > 180.0:
        shifted += 360.0
    LOGGER.log(TRACE_LEVEL, "align_longitude_to_reference lng=%s reference=%s.", lng, reference_lng)
    return shifted


def longitude_interval_from_centers(longitudes: list[float]) -> LongitudeInterval | None:
    """
    Why this exists:
        Pick the short way around the world for a regional map.
    When to use:
        With the center longitude of every strategic hex.
    What to expect:
        170 and -170 span about 20 degrees and cross 180. 10 and 30 span 20 degrees and do not.
        Empty input returns None.
    """

    finite = sorted(lng for lng in longitudes if math.isfinite(lng))
    LOGGER.log(TRACE_LEVEL, "longitude_interval_from_centers count=%s.", len(finite))
    if not finite:
        return None
    largest_gap = finite[0] + 360.0 - finite[-1]
    west = finite[0]
    east = finite[-1]
    for index in range(len(finite) - 1):
        gap = finite[index + 1] - finite[index]
        if gap > largest_gap:
            largest_gap = gap
            west = finite[index + 1]
            east = finite[index] + 360.0
    return LongitudeInterval(west, east, (west + east) / 2.0, east > 180.0 or west < -180.0)


def map_extent_box_for_hexes(cell_indexes: list[str]) -> LonLatBox | None:
    """
    Why this exists:
        Bound the camera the way the running map does, vertices included.
    When to use:
        When choosing the tiles a regional pack must cover.
    What to expect:
        A box in the unwrapped frame. None when ``cell_indexes`` is empty.
    Exceptions:
        The H3 library's error when an index is not a cell.
    """

    LOGGER.debug("map_extent_box_for_hexes cells=%s.", len(cell_indexes))
    if not cell_indexes:
        return None
    centers = [h3.cell_to_latlng(cell)[1] for cell in cell_indexes]
    interval = longitude_interval_from_centers(centers)
    if interval is None:
        return None
    south = 90.0
    north = -90.0
    west = interval.west
    east = interval.east
    for cell in cell_indexes:
        center_lng = h3.cell_to_latlng(cell)[1]
        for lat, lng in h3.cell_to_boundary(cell):
            aligned_to_cell = align_longitude_to_reference(lng, center_lng)
            aligned = align_longitude_to_reference(aligned_to_cell, interval.reference_lng)
            clamped = max(-MAX_MERCATOR_LAT_DEG, min(MAX_MERCATOR_LAT_DEG, lat))
            south = min(south, clamped)
            north = max(north, clamped)
            west = min(west, aligned)
            east = max(east, aligned)
    if south > north:
        south = -MAX_MERCATOR_LAT_DEG
        north = MAX_MERCATOR_LAT_DEG
    return LonLatBox(west, south, east, north)


def boxes_within_world(box: LonLatBox) -> list[LonLatBox]:
    """
    Why this exists:
        Give ``tile_range_for_box`` pieces that do not cross 180 degrees.
    When to use:
        After ``map_extent_box_for_hexes``.
    What to expect:
        One box when the span is already inside -180 to 180. Two boxes when it crosses.
        A part whose west is not less than its east is dropped.
    """

    LOGGER.log(TRACE_LEVEL, "boxes_within_world west=%s east=%s.", box.west, box.east)
    if box.east <= 180.0 and box.west >= -180.0:
        return [box]
    parts: list[LonLatBox] = []
    if box.west < -180.0:
        parts.append(LonLatBox(box.west + 360.0, box.south, 180.0, box.north))
        parts.append(LonLatBox(-180.0, box.south, min(180.0, box.east), box.north))
    elif box.east > 180.0:
        parts.append(LonLatBox(max(-180.0, box.west), box.south, 180.0, box.north))
        parts.append(LonLatBox(-180.0, box.south, box.east - 360.0, box.north))
    return [part for part in parts if part.west < part.east]
