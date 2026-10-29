"""Missile range for one regional map, measured as a share of that map's land.

The global ICBM range of 12 hexes covers 0.5532 of the global map's land on average
from an Advanced hex. That was measured on 29 October 2026 on the res1 hexes whose
metadata has ``all_water`` false (450 hexes), from the 70 hexes with at least 21 urban
res4 cells at urban scalerank 5 or less. ``GLOBAL_MISSILE_COVERAGE_SHARE`` is that
value rounded to 3 decimals. It is frozen like ``GLOBAL_ECONOMY_BASELINE``, and
nothing recomputes it.
"""

from __future__ import annotations

import logging
import statistics
from collections.abc import Collection, Mapping, Sequence
from typing import Final

import h3

LOGGER = logging.getLogger(__name__)

# Global ICBM range in hex steps. The coverage share below was measured at this range.
GLOBAL_MISSILE_RANGE_HEXES: Final = 12
# Frozen average land share covered from an Advanced hex at the global range.
GLOBAL_MISSILE_COVERAGE_SHARE: Final = 0.553
# Largest range the search will try. A map that covers its land sooner stops early.
MAX_MISSILE_RANGE_HEXES: Final = 40
# Missile price is this many times the map's infantry price.
MISSILE_COST_MULTIPLIER: Final = 10


def missile_coverage_share(
    launch_hexes: Sequence[str],
    land_hexes: Collection[str],
    range_hexes: int,
) -> float:
    """
    Why this exists:
        Measure how much of a map's land a missile range covers from its launch hexes.
    When to use:
        From ``compute_missile_range_hexes`` for one candidate range. Callers pass the same land set each time.
    What to expect:
        The mean, over ``launch_hexes``, of the share of ``land_hexes`` inside ``h3.grid_disk``. The disk includes the launch hex.
    Exceptions:
        ``ValueError`` when ``launch_hexes`` or ``land_hexes`` is empty.
    """

    LOGGER.debug(
        "missile_coverage_share launches=%s land=%s range=%s.",
        len(launch_hexes),
        len(land_hexes),
        range_hexes,
    )
    if len(launch_hexes) == 0 or len(land_hexes) == 0:
        raise ValueError("missile coverage needs at least one launch hex and one land hex.")
    land_set = frozenset(land_hexes)
    land_count = len(land_set)
    shares = [
        len(set(h3.grid_disk(hex_index, range_hexes)) & land_set) / land_count
        for hex_index in launch_hexes
    ]
    return float(statistics.mean(shares))


def compute_missile_range_hexes(
    land_hexes: Sequence[str],
    urban_by_hex: Mapping[str, int],
    advanced_min_urban_cells: int,
    target_share: float = GLOBAL_MISSILE_COVERAGE_SHARE,
) -> int:
    """
    Why this exists:
        Pick the hex range whose Advanced-hex coverage is closest to the frozen global share.
    When to use:
        After ``compute_regional_economy``, with that map's land hexes and urban counts.
    What to expect:
        A positive integer. A tie keeps the smaller range. The search stops once a range covers at least 0.999 of the land.
    Exceptions:
        ``ValueError`` from ``missile_coverage_share`` when a non-empty launch set is paired with an empty land set. The empty-map case returns 1 instead.
    """

    LOGGER.debug(
        "compute_missile_range_hexes land=%s advanced_min=%s target=%s.",
        len(land_hexes),
        advanced_min_urban_cells,
        target_share,
    )
    land = list(land_hexes)
    launch = sorted(hex_index for hex_index in land if urban_by_hex.get(hex_index, 0) >= advanced_min_urban_cells)
    # A map with no land or no Advanced hex cannot build missiles. The manifest still needs a positive integer.
    if len(land) == 0 or len(launch) == 0:
        LOGGER.debug("compute_missile_range_hexes empty launch or land; range=1.")
        return 1
    best_range = 1
    best_gap = float("inf")
    for range_hexes in range(1, MAX_MISSILE_RANGE_HEXES + 1):
        share = missile_coverage_share(launch, land, range_hexes)
        gap = abs(share - target_share)
        if gap < best_gap:
            best_gap = gap
            best_range = range_hexes
        if share >= 0.999:
            break
    LOGGER.debug("compute_missile_range_hexes range=%s gap=%s.", best_range, best_gap)
    return best_range
