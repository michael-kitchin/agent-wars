"""Resolution-dependent constants shared by regional land, weather, and sampling."""

from __future__ import annotations

import logging
import math

import h3

LOGGER = logging.getLogger(__name__)


def center_spacing_km(resolution: int) -> float:
    """
    Why this exists:
        Convert a reach in kilometres into an H3 ring depth.
    When to use:
        When expanding member cells out to the farthest sea, neutral, or trim reach.
    What to expect:
        The average distance between hex centers at ``resolution``, in kilometres.
    """

    LOGGER.debug("center_spacing_km resolution=%s.", resolution)
    return h3.average_hexagon_edge_length(resolution, unit="km") * math.sqrt(3)


def island_min_area_km2_for(strategic_resolution: int, global_min_km2: float = 2000.0) -> float:
    """
    Why this exists:
        Scale the global island floor so a finer strategic resolution still drops tiny islands.
    When to use:
        When a regional landmass export chooses its island floor.
    What to expect:
        ``global_min_km2`` at resolution 1, and the same share of a hex at finer resolutions.
    """

    LOGGER.debug(
        "island_min_area_km2_for strategic_resolution=%s global_min_km2=%s.",
        strategic_resolution,
        global_min_km2,
    )
    area = h3.average_hexagon_area(strategic_resolution, unit="km^2")
    area_at_one = h3.average_hexagon_area(1, unit="km^2")
    return global_min_km2 * area / area_at_one


def weather_water_land_steps_for(strategic_resolution: int, global_steps: int = 2) -> int:
    """
    Why this exists:
        Scale how far a sea hex searches for a land hex when copying weather.
    When to use:
        When a regional weather export sets its water-to-land search.
    What to expect:
        At least ``global_steps``. Finer strategic resolutions search more rings so the distance stays similar.
    """

    LOGGER.debug(
        "weather_water_land_steps_for strategic_resolution=%s global_steps=%s.",
        strategic_resolution,
        global_steps,
    )
    edge = h3.average_hexagon_edge_length(strategic_resolution, unit="km")
    edge_at_one = h3.average_hexagon_edge_length(1, unit="km")
    return max(global_steps, round(global_steps * edge_at_one / edge))
