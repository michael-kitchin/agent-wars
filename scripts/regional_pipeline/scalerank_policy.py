"""Scalerank ceilings for each tactical H3 resolution."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Final

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScalerankPolicy:
    """
    Why this exists:
        Record the maximum Natural Earth scalerank kept for each overlay at one tactical resolution.
    When to use:
        When writing a regional manifest and when filtering roads, rail, urban areas, ports, and city labels.
    What to expect:
        Higher maxima keep more, smaller features. The steps follow about 1.4 scalerank steps per H3
        resolution step from the global tactical resolution. Roads and rail use the wide end of that
        range because a tactical battle covers a much smaller strategic hex. Urban polygons stay near
        the narrow end because large polygons already cover a similar share of cells. Airports and
        seaports use the wider range because the count per battle falls with area. City labels skip
        rank 5, which contains only two places, so the label ceiling jumps with the next rank that
        actually adds cities.

        Minimum rank is always ``SCALERANK_MIN``.
    """

    # Highest road scalerank kept when the file is written.
    road_max: int
    # Highest rail scalerank kept when the file is written.
    rail_max: int
    # Highest urban scalerank a later loader should treat as urban. The JSON still stores every rank.
    urban_overlay_max: int
    # Highest airport scalerank a later loader should treat as major.
    major_airport_max: int
    # Highest seaport scalerank a later loader should treat as major.
    major_seaport_max: int
    # Highest populated-place scalerank a later loader should draw as a city label.
    city_label_max: int


# Lowest scalerank considered for every layer.
SCALERANK_MIN: Final = 0

# Policy for the global tactical resolution.
GLOBAL_TACTICAL_POLICY: Final = ScalerankPolicy(4, 4, 5, 5, 5, 4)

# One policy per tactical resolution used by the global game and the regional maps.
POLICY_BY_TACTICAL_RESOLUTION: Final = MappingProxyType({
    4: GLOBAL_TACTICAL_POLICY,
    5: ScalerankPolicy(6, 6, 6, 6, 6, 6),
    6: ScalerankPolicy(8, 8, 7, 8, 8, 7),
})


def policy_for_tactical_resolution(resolution: int) -> ScalerankPolicy:
    """
    Why this exists:
        Look up the overlay ceilings for a tactical resolution.
    When to use:
        When building a manifest or a regional road and rail export.
    What to expect:
        Returns the policy for resolutions 4, 5, and 6.
    Exceptions:
        ``ValueError`` when the resolution has no policy.
    """

    LOGGER.debug("policy_for_tactical_resolution resolution=%s.", resolution)
    try:
        return POLICY_BY_TACTICAL_RESOLUTION[resolution]
    except KeyError as exc:
        LOGGER.error("No scalerank policy for tactical resolution %s.", resolution, exc_info=True)
        raise ValueError(f"No scalerank policy for tactical resolution {resolution}.") from exc


def policy_to_json(policy: ScalerankPolicy) -> dict[str, int]:
    """
    Why this exists:
        Write a policy into a manifest with the shared minimum rank.
    When to use:
        While building a manifest document.
    What to expect:
        A dict of integer ceilings plus ``scalerank_min``. Key order is stable.
    """

    LOGGER.debug("policy_to_json road_max=%s city_label_max=%s.", policy.road_max, policy.city_label_max)
    document: dict[str, Any] = {
        "scalerank_min": SCALERANK_MIN,
        "road_max": policy.road_max,
        "rail_max": policy.rail_max,
        "urban_overlay_max": policy.urban_overlay_max,
        "major_airport_max": policy.major_airport_max,
        "major_seaport_max": policy.major_seaport_max,
        "city_label_max": policy.city_label_max,
    }
    return {key: int(value) for key, value in document.items()}
