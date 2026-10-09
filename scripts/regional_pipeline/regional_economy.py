"""Regional unit prices and side-group balance from urban-cell counts.

The formulas match the global gates with each map's own producing hexes.
This module does not open files. Callers pass the counts they already measured.
"""

from __future__ import annotations

import logging
import math
import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Final

LOGGER = logging.getLogger(__name__)

# Algorithm generation stored on each manifest. Bump it when the formulas change.
METHOD_VERSION: Final = 1
# A group's share may sit this far from an equal share, on either side.
BALANCE_TOLERANCE: Final = 0.25
# Fewer producing hexes than this cannot support the four gates.
MIN_PRODUCING_HEXES: Final = 5


@dataclass(frozen=True)
class GlobalEconomyBaseline:
    """
    Why this exists:
        Hold the global gates the regional scale is matched against.
    When to use:
        As the default baseline of ``compute_regional_economy``. Do not recompute these from the global pack.
    What to expect:
        The shares and geometric means measured on 7 October 2026 on the global res1/res4 data,
        with urban scalerank <= 5 and 264 producing hexes.
    """

    # Share of producing hexes with at least 2 urban cells. The armor gate.
    armor_gate_share: float
    # Share with at least 5 urban cells. The air gate.
    air_gate_share: float
    # Share with at least 10 urban cells. The naval gate.
    naval_gate_share: float
    # Share with at least 21 urban cells. The Advanced threshold.
    advanced_gate_share: float
    # Geometric-mean urban cells of hexes able to build infantry.
    infantry_geomean: float
    # Geometric-mean urban cells of hexes able to build armor.
    armor_geomean: float
    # Geometric-mean urban cells of hexes able to build air.
    air_geomean: float
    # Geometric-mean urban cells of hexes able to build naval.
    naval_geomean: float
    # Global infantry purchase cost.
    infantry_cost: int
    # Global urban cells removed by one strategic strike.
    strategic_strike_urban_cells: int


# Frozen global baseline. Measured 7 October 2026; not recomputed from the global pack.
GLOBAL_ECONOMY_BASELINE: Final = GlobalEconomyBaseline(
    armor_gate_share=0.894,
    air_gate_share=0.621,
    naval_gate_share=0.436,
    advanced_gate_share=0.235,
    infantry_geomean=7.75,
    armor_geomean=9.88,
    air_geomean=17.16,
    naval_geomean=25.43,
    infantry_cost=20,
    strategic_strike_urban_cells=9,
)


@dataclass(frozen=True)
class RegionalEconomy:
    """
    Why this exists:
        Carry one map's prices and build gates before they are written to the manifest.
    When to use:
        The return value of ``compute_regional_economy``, and the input to ``economy_to_json``.
    What to expect:
        ``scale`` is unrounded. Costs and minimums are positive integers.
    """

    # Land hexes with at least one urban cell.
    producing_hex_count: int
    # Sum of urban cells on those hexes.
    urban_cell_count: int
    # ``statistics.median`` of the producing counts. May end in ``.5``.
    median_urban_cells_per_producing_hex: float
    # Unrounded scale against the global baseline.
    scale: float
    # Infantry purchase cost.
    infantry_cost: int
    # Armor purchase cost. Twice infantry.
    armor_cost: int
    # Naval purchase cost. Five times infantry.
    naval_cost: int
    # Air purchase cost. Three times infantry.
    air_cost: int
    # Urban cells required before armor can be built.
    armor_min_urban_cells: int
    # Urban cells required before air can be built.
    air_min_urban_cells: int
    # Urban cells required before naval can be built.
    naval_min_urban_cells: int
    # Urban cells required for an Advanced unit.
    advanced_min_urban_cells: int
    # Urban cells removed by one strategic strike.
    strategic_strike_urban_cells: int


@dataclass(frozen=True)
class SideGroupShare:
    """
    Why this exists:
        Record one group's production share against an equal split.
    When to use:
        One entry of ``SideGroupBalance.groups``, in manifest order.
    What to expect:
        ``share`` and ``ratio_to_fair_share`` are unrounded. ``within_tolerance`` uses inclusive bounds.
    """

    # Manifest side-group id.
    group_id: str
    # Urban cells on that group's land hexes.
    urban_cell_count: int
    # Group urban cells divided by the map total.
    share: float
    # ``share`` divided by ``1 / number_of_groups``.
    ratio_to_fair_share: float
    # True when the ratio is inside the inclusive tolerance band.
    within_tolerance: bool


@dataclass(frozen=True)
class SideGroupBalance:
    """
    Why this exists:
        Hold every group's share so the pack check can fail a lopsided map.
    When to use:
        The return value of ``compute_side_group_balance``.
    What to expect:
        ``within_tolerance`` is true only when every group is inside the band.
    """

    # Groups in the order the caller supplied.
    groups: tuple[SideGroupShare, ...]
    # True when every group is inside the band.
    within_tolerance: bool


def round_half_up(value: float) -> int:
    """
    Why this exists:
        Prices and stored decimals must not use banker's rounding.
    When to use:
        Any half that should become the next integer away from zero for non-negative inputs.
    What to expect:
        ``math.floor(value + 0.5)``. ``2.5`` becomes ``3``.
    Exceptions:
        None. A non-finite value follows ``math.floor``.
    """

    LOGGER.debug("round_half_up value=%s.", value)
    return math.floor(value + 0.5)


def round_half_up_decimal(value: float, places: int = 3) -> float:
    """
    Why this exists:
        Manifest shares and the scale are stored at a fixed number of decimals.
    When to use:
        ``economy_to_json`` and ``balance_to_json`` only. Prices stay on the unrounded scale.
    What to expect:
        Half-up at ``places`` decimals. ``places`` is 3 for the manifest.
    Exceptions:
        ``ValueError`` when ``places`` is negative.
    """

    LOGGER.debug("round_half_up_decimal value=%s places=%s.", value, places)
    if places < 0:
        raise ValueError(f"places must be >= 0, got {places}.")
    factor = 10**places
    return round_half_up(value * factor) / factor


def geometric_mean(values: Sequence[float]) -> float:
    """
    Why this exists:
        The scale is a geometric mean, so one huge hex cannot dominate an arithmetic mean.
    When to use:
        On a non-empty list of positive urban counts or positive ratios.
    What to expect:
        ``exp(mean(log(x)))``.
    Exceptions:
        ``ValueError`` when ``values`` is empty or any value is <= 0.
    """

    LOGGER.debug("geometric_mean count=%s.", len(values))
    if len(values) == 0:
        raise ValueError("geometric mean requires at least one value.")
    if any(value <= 0 for value in values):
        raise ValueError("geometric mean requires every value to be > 0.")
    return math.exp(sum(math.log(value) for value in values) / len(values))


def share_matched_threshold(values: Sequence[int], target_share: float) -> int:
    """
    Why this exists:
        Pick the urban-cell gate whose producing-hex share is closest to a global gate.
    When to use:
        Once per gate, with the sorted producing counts.
    What to expect:
        The smallest integer ``t`` in ``1 .. max(values)`` whose share of values ``>= t`` is closest to ``target_share``.
        A tie keeps the smaller ``t``.
    Exceptions:
        ``ValueError`` when ``values`` is empty.
    """

    LOGGER.debug("share_matched_threshold count=%s target=%s.", len(values), target_share)
    if len(values) == 0:
        raise ValueError("share-matched threshold requires at least one value.")
    best_t = 1
    best_diff: float | None = None
    total = len(values)
    for threshold in range(1, max(values) + 1):
        share = sum(1 for value in values if value >= threshold) / total
        difference = abs(share - target_share)
        if best_diff is None or difference < best_diff:
            best_t = threshold
            best_diff = difference
    return best_t


def infantry_cost_from_raw(raw: float) -> int:
    """
    Why this exists:
        Snap the scaled infantry price onto the global step of 5 once it reaches the global cost.
    When to use:
        From ``compute_regional_economy`` after ``20 * scale``.
    What to expect:
        A positive integer. ``22.5`` becomes ``25``. Below 20, half-up with a floor of 1.
    Exceptions:
        None.
    """

    LOGGER.debug("infantry_cost_from_raw raw=%s.", raw)
    if raw >= 20:
        return 5 * round_half_up(raw / 5)
    return max(1, round_half_up(raw))


def compute_regional_economy(
    producing_values: Sequence[int],
    baseline: GlobalEconomyBaseline = GLOBAL_ECONOMY_BASELINE,
) -> RegionalEconomy:
    """
    Why this exists:
        Turn one map's producing urban counts into the prices and gates the match will use.
    When to use:
        After counting urban cells on land hexes. Values below 1 are ignored.
    What to expect:
        A ``RegionalEconomy`` whose armor, naval, and air costs are 2, 5, and 3 times infantry.
    Exceptions:
        ``ValueError`` when fewer than ``MIN_PRODUCING_HEXES`` values remain.
    """

    LOGGER.debug("compute_regional_economy input_count=%s.", len(producing_values))
    values = tuple(sorted(value for value in producing_values if value >= 1))
    if len(values) < MIN_PRODUCING_HEXES:
        raise ValueError(
            f"regional economy needs at least {MIN_PRODUCING_HEXES} producing hexes, got {len(values)}."
        )
    armor_min = share_matched_threshold(values, baseline.armor_gate_share)
    air_min = share_matched_threshold(values, baseline.air_gate_share)
    naval_min = share_matched_threshold(values, baseline.naval_gate_share)
    advanced_min = share_matched_threshold(values, baseline.advanced_gate_share)
    ratio_infantry = geometric_mean(values) / baseline.infantry_geomean
    ratio_armor = geometric_mean([value for value in values if value >= armor_min]) / baseline.armor_geomean
    ratio_air = geometric_mean([value for value in values if value >= air_min]) / baseline.air_geomean
    ratio_naval = geometric_mean([value for value in values if value >= naval_min]) / baseline.naval_geomean
    scale = geometric_mean([ratio_infantry, ratio_armor, ratio_air, ratio_naval])
    infantry = infantry_cost_from_raw(baseline.infantry_cost * scale)
    strike = max(1, round_half_up(baseline.strategic_strike_urban_cells * scale))
    economy = RegionalEconomy(
        producing_hex_count=len(values),
        urban_cell_count=sum(values),
        median_urban_cells_per_producing_hex=float(statistics.median(values)),
        scale=scale,
        infantry_cost=infantry,
        armor_cost=2 * infantry,
        naval_cost=5 * infantry,
        air_cost=3 * infantry,
        armor_min_urban_cells=armor_min,
        air_min_urban_cells=air_min,
        naval_min_urban_cells=naval_min,
        advanced_min_urban_cells=advanced_min,
        strategic_strike_urban_cells=strike,
    )
    LOGGER.debug(
        "compute_regional_economy producing=%s scale=%s infantry=%s.",
        economy.producing_hex_count,
        economy.scale,
        economy.infantry_cost,
    )
    return economy


def compute_side_group_balance(
    urban_by_group: Mapping[str, int],
    group_order: Sequence[str],
    tolerance: float = BALANCE_TOLERANCE,
) -> SideGroupBalance:
    """
    Why this exists:
        Decide whether each side group's production is close to an equal share.
    When to use:
        With urban totals already summed by group id, in manifest order.
    What to expect:
        A group missing from ``urban_by_group`` counts as 0. Inclusive bounds are ``1 - tolerance`` and ``1 + tolerance``.
    Exceptions:
        ``ValueError`` when the total is 0 or ``group_order`` has fewer than 2 ids.
    """

    LOGGER.debug("compute_side_group_balance groups=%s tolerance=%s.", len(group_order), tolerance)
    if len(group_order) < 2:
        raise ValueError(f"side-group balance needs at least 2 groups, got {len(group_order)}.")
    counts = tuple(int(urban_by_group.get(group_id, 0)) for group_id in group_order)
    total = sum(counts)
    if total == 0:
        raise ValueError("side-group balance requires a positive urban-cell total.")
    fair = 1 / len(group_order)
    lower = 1 - tolerance
    upper = 1 + tolerance
    groups: list[SideGroupShare] = []
    for group_id, count in zip(group_order, counts, strict=True):
        share = count / total
        ratio = share / fair
        groups.append(
            SideGroupShare(
                group_id=group_id,
                urban_cell_count=count,
                share=share,
                ratio_to_fair_share=ratio,
                within_tolerance=lower <= ratio <= upper,
            )
        )
    balance = SideGroupBalance(groups=tuple(groups), within_tolerance=all(group.within_tolerance for group in groups))
    LOGGER.debug("compute_side_group_balance within_tolerance=%s.", balance.within_tolerance)
    return balance


def economy_to_json(economy: RegionalEconomy, urban_overlay_max: int) -> dict[str, Any]:
    """
    Why this exists:
        Write the economy block with stable key order and stored rounding.
    When to use:
        When assigning a manifest, and when the pack check rebuilds the block to compare.
    What to expect:
        The manifest key set. ``scale`` is half-up to 3 decimals. Costs stay integers.
    Exceptions:
        None.
    """

    LOGGER.debug("economy_to_json infantry=%s.", economy.infantry_cost)
    return {
        "method_version": METHOD_VERSION,
        "urban_overlay_max": urban_overlay_max,
        "producing_hex_count": economy.producing_hex_count,
        "urban_cell_count": economy.urban_cell_count,
        "median_urban_cells_per_producing_hex": economy.median_urban_cells_per_producing_hex,
        "scale": round_half_up_decimal(economy.scale),
        "infantry_cost": economy.infantry_cost,
        "armor_cost": economy.armor_cost,
        "naval_cost": economy.naval_cost,
        "air_cost": economy.air_cost,
        "armor_min_urban_cells": economy.armor_min_urban_cells,
        "air_min_urban_cells": economy.air_min_urban_cells,
        "naval_min_urban_cells": economy.naval_min_urban_cells,
        "advanced_min_urban_cells": economy.advanced_min_urban_cells,
        "strategic_strike_urban_cells": economy.strategic_strike_urban_cells,
    }


def balance_to_json(balance: SideGroupBalance, tolerance: float) -> dict[str, Any]:
    """
    Why this exists:
        Write the side-group balance block with stable key order and stored rounding.
    When to use:
        When assigning a manifest, and when the pack check rebuilds the block to compare.
    What to expect:
        ``share`` and ``ratio_to_fair_share`` are half-up to 3 decimals. Pass/fail uses the unrounded flags.
    Exceptions:
        None.
    """

    LOGGER.debug("balance_to_json groups=%s.", len(balance.groups))
    return {
        "tolerance": tolerance,
        "within_tolerance": balance.within_tolerance,
        "groups": [
            {
                "id": group.group_id,
                "urban_cell_count": group.urban_cell_count,
                "share": round_half_up_decimal(group.share),
                "ratio_to_fair_share": round_half_up_decimal(group.ratio_to_fair_share),
                "within_tolerance": group.within_tolerance,
            }
            for group in balance.groups
        ],
    }
