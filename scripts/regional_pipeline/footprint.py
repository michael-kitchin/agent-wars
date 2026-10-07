"""Classify strategic cells into land, sea, and neutral-border roles."""

from __future__ import annotations

import logging
import math
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Final

import h3

from .region_models import FootprintCounts, HexRole, RegionDefinition, RegionFootprint

LOGGER = logging.getLogger(__name__)

# A cell with less land than this is water.
MIN_LAND_KM2: Final = 1.0
# Member land must be at least this share of the cell's land.
MEMBER_SHARE_MIN: Final = 0.5
# A member cell with less than this share of its area in land counts as settled coast or river.
SETTLED_LAND_SHARE_MAX: Final = 0.95


@dataclass(frozen=True)
class CandidateCell:
    """
    Why this exists:
        Hold the measurements classification needs for one strategic cell.
    When to use:
        After geometry has been measured and before ``classify_footprint``.
    What to expect:
        Distances use ``lat`` and ``lng``. ``in_box`` is false for cells outside the centroid window.
    """

    # Strategic H3 index.
    h3_index: str
    # Centroid latitude.
    lat: float
    # Centroid longitude.
    lng: float
    # True when the centroid is inside the region's window.
    in_box: bool
    # Land area inside the cell, square kilometres.
    land_km2: float
    # Land area that also lies in a member country, square kilometres.
    member_km2: float
    # Full H3 cell area, square kilometres.
    cell_area_km2: float
    # True when the cell contains a populated place, overlaps urban land, or is not almost entirely land.
    settled: bool


def _nearest_km(origin: CandidateCell, others: Sequence[CandidateCell]) -> float:
    """
    Why this exists:
        Measure how far a cell is from the nearest cell in another set.
    When to use:
        Sea, neutral, and desert-trim tests.
    What to expect:
        Kilometres between centroids. ``math.inf`` when ``others`` is empty.
    """

    if not others:
        return math.inf
    origin_ll = (origin.lat, origin.lng)
    return min(
        h3.great_circle_distance(origin_ll, (other.lat, other.lng), unit="km")
        for other in others
    )


def classify_footprint(definition: RegionDefinition, candidates: Sequence[CandidateCell]) -> RegionFootprint:
    """
    Why this exists:
        Turn measured cells into the land, sea, and neutral roles for one region.
    When to use:
        After candidates have been measured, including during reach sweeps.
    What to expect:
        Only in-box cells receive a role. Sea and neutral roles require a positive reach.
    Exceptions:
        ``ValueError`` when no member land remains.
    """

    LOGGER.debug(
        "classify_footprint region=%s candidates=%d sea_reach=%s neutral_reach=%s trim=%s.",
        definition.region_id,
        len(candidates),
        definition.sea_reach_km,
        definition.neutral_reach_km,
        definition.desert_trim_reach_km,
    )
    in_box = [cell for cell in candidates if cell.in_box]
    member = [
        cell
        for cell in in_box
        if cell.land_km2 >= MIN_LAND_KM2 and cell.member_km2 >= MEMBER_SHARE_MIN * cell.land_km2
    ]
    member_ids = {cell.h3_index for cell in member}
    other_land = [
        cell
        for cell in in_box
        if cell.land_km2 >= MIN_LAND_KM2 and cell.h3_index not in member_ids
    ]
    water = [cell for cell in in_box if cell.land_km2 < MIN_LAND_KM2]
    if definition.desert_trim_reach_km is not None:
        settled = [cell for cell in member if cell.settled]
        member = [cell for cell in member if _nearest_km(cell, settled) <= definition.desert_trim_reach_km]
    if not member:
        raise ValueError(f"Region {definition.region_id} has no member land cells.")
    roles = {cell.h3_index: HexRole.LAND for cell in member}
    if definition.sea_reach_km > 0:
        roles.update(
            {
                cell.h3_index: HexRole.SEA
                for cell in water
                if _nearest_km(cell, member) <= definition.sea_reach_km
            }
        )
    if definition.neutral_reach_km > 0:
        roles.update(
            {
                cell.h3_index: HexRole.NEUTRAL_BORDER
                for cell in other_land
                if _nearest_km(cell, member) <= definition.neutral_reach_km
            }
        )
    return RegionFootprint(
        region_id=definition.region_id,
        strategic_resolution=definition.strategic_resolution,
        tactical_resolution=definition.tactical_resolution,
        roles=roles,
    )


def sweep_footprint_counts(
    definition: RegionDefinition,
    candidates: Sequence[CandidateCell],
    axis: str,
    reaches_km: Sequence[float],
) -> list[tuple[float, FootprintCounts]]:
    """
    Why this exists:
        Show how land, sea, or neutral counts change across a reach.
    When to use:
        While tuning one region's sea, neutral, or desert-trim reach.
    What to expect:
        One ``(reach, FootprintCounts)`` pair per reach, in the given order.
    Exceptions:
        ``ValueError`` when ``axis`` is not ``trim``, ``sea``, or ``neutral``, or when a reach leaves no member land.
    """

    LOGGER.debug("sweep_footprint_counts region=%s axis=%s steps=%d.", definition.region_id, axis, len(reaches_km))
    field_by_axis = {
        "trim": "desert_trim_reach_km",
        "sea": "sea_reach_km",
        "neutral": "neutral_reach_km",
    }
    try:
        field_name = field_by_axis[axis]
    except KeyError as exc:
        LOGGER.error("Unknown footprint sweep axis %s.", axis, exc_info=True)
        raise ValueError(f"Unknown footprint sweep axis {axis!r}.") from exc
    results: list[tuple[float, FootprintCounts]] = []
    for reach in reaches_km:
        updated = replace(definition, **{field_name: reach})
        results.append((float(reach), classify_footprint(updated, candidates).counts()))
    return results
