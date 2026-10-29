"""Read one region's pack and write its economy and side-group balance."""

from __future__ import annotations

import dataclasses
import json
import logging
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any

import h3

from scripts.terrain_pipeline.metadata_classifier import is_res4_urban_overlay_row
from scripts.terrain_pipeline.metadata_io import write_json_document

from .region_manifest import ECONOMY_MANIFEST_SCHEMA_VERSION
from .region_paths import REGIONS_ROOT, RegionPaths
from .missile_reach import compute_missile_range_hexes
from .regional_economy import (
    RegionalEconomy,
    SideGroupBalance,
    balance_to_json,
    compute_regional_economy,
    compute_side_group_balance,
    economy_to_json,
    round_half_up_decimal,
)

LOGGER = logging.getLogger(__name__)

_READABLE_SCHEMAS = frozenset({"1.1.0", "1.2.0"})


def count_urban_cells_by_strategic_hex(
    tactical_records: Iterable[Mapping[str, Any]],
    strategic_resolution: int,
    urban_overlay_max: int,
) -> dict[str, int]:
    """
    Why this exists:
        Count generated urban tactical cells under each strategic hex.
    When to use:
        While measuring a region's economy. Records that are not urban are ignored.
    What to expect:
        A map of strategic H3 index to a positive count. Hexes with no urban cells are omitted.
    Exceptions:
        None. A record without ``h3_index`` is skipped.
    """

    LOGGER.debug(
        "count_urban_cells_by_strategic_hex resolution=%s urban_overlay_max=%s.",
        strategic_resolution,
        urban_overlay_max,
    )
    counts: dict[str, int] = {}
    for record in tactical_records:
        if not is_res4_urban_overlay_row(dict(record), urban_overlay_max):
            continue
        cell = record.get("h3_index")
        if not isinstance(cell, str) or cell == "":
            continue
        parent = h3.cell_to_parent(cell, strategic_resolution)
        counts[parent] = counts.get(parent, 0) + 1
    return counts


def measure_region_economy(
    region_id: str,
    root: Path = REGIONS_ROOT,
) -> tuple[RegionalEconomy, SideGroupBalance, dict[str, Any]]:
    """
    Why this exists:
        Compute the economy and balance from the files on disk without writing them.
    When to use:
        Before assigning a manifest, and from the pack check. It does not call ``read_manifest``.
    What to expect:
        The economy, the balance, and the loaded manifest document.
    Exceptions:
        ``ValueError`` when the schema is not 1.1.0 or 1.2.0, ``side_groups`` is missing,
        the tactical file is missing, a land hex has no known group, or the economy formulas raise.
    """

    LOGGER.debug("measure_region_economy region=%s root=%s.", region_id, root)
    paths = RegionPaths.for_region(region_id, root)
    if not paths.manifest.is_file():
        raise ValueError(f"{paths.manifest} is missing.")
    document = json.loads(paths.manifest.read_text(encoding="utf-8"))
    schema = document.get("schema_version")
    if schema not in _READABLE_SCHEMAS:
        raise ValueError(f"{paths.manifest}: schema_version must be 1.1.0 or 1.2.0.")
    side_groups = document.get("side_groups")
    if not isinstance(side_groups, list):
        raise ValueError(f"{paths.manifest}: side_groups is missing.")
    if not paths.metadata_t.is_file():
        raise ValueError(f"{paths.metadata_t} is missing.")
    tactical = json.loads(paths.metadata_t.read_text(encoding="utf-8"))
    records = tactical.get("records", [])
    if not isinstance(records, list):
        raise ValueError(f"{paths.metadata_t}: records must be a list.")
    policy = document.get("scalerank_policy")
    if not isinstance(policy, dict) or "urban_overlay_max" not in policy:
        raise ValueError(f"{paths.manifest}: scalerank_policy.urban_overlay_max is missing.")
    urban_by_hex = count_urban_cells_by_strategic_hex(
        records,
        int(document["res_s"]),
        int(policy["urban_overlay_max"]),
    )
    group_order = [str(group["id"]) for group in side_groups]
    known_groups = set(group_order)
    urban_by_group = {group_id: 0 for group_id in group_order}
    producing: list[int] = []
    land_hexes: list[str] = []
    for entry in document.get("hexes", []):
        if entry.get("role") != "land":
            continue
        land_hexes.append(str(entry["h3_index"]))
        group_id = entry.get("side_group_id")
        if group_id not in known_groups:
            raise ValueError(f"{paths.manifest}: land hex {entry.get('h3_index')} has no known side group.")
        count = urban_by_hex.get(str(entry["h3_index"]), 0)
        urban_by_group[str(group_id)] += count
        if count >= 1:
            producing.append(count)
    economy = compute_regional_economy(producing)
    range_hexes = compute_missile_range_hexes(land_hexes, urban_by_hex, economy.advanced_min_urban_cells)
    economy = dataclasses.replace(economy, missile_range_hexes=range_hexes)
    balance = compute_side_group_balance(urban_by_group, group_order)
    return economy, balance, document


def assign_region_economy(
    region_id: str,
    root: Path = REGIONS_ROOT,
) -> tuple[RegionalEconomy, SideGroupBalance]:
    """
    Why this exists:
        Store the measured economy and balance on the manifest.
    When to use:
        After origins have written side groups. Safe to repeat.
    What to expect:
        Schema ``1.2.0`` and the two blocks. Every other key is left as it was.
    Exceptions:
        ``ValueError`` from ``measure_region_economy``.
    """

    LOGGER.debug("assign_region_economy region=%s root=%s.", region_id, root)
    paths = RegionPaths.for_region(region_id, root)
    economy, balance, document = measure_region_economy(region_id, root)
    policy = document["scalerank_policy"]
    document["schema_version"] = ECONOMY_MANIFEST_SCHEMA_VERSION
    document["economy"] = economy_to_json(economy, int(policy["urban_overlay_max"]))
    document["side_group_balance"] = balance_to_json(balance, 0.25)
    write_json_document(paths.manifest, document)
    LOGGER.info(
        "Wrote economy for %s infantry=%s balance=%s.",
        region_id,
        economy.infantry_cost,
        "PASS" if balance.within_tolerance else "FAIL",
    )
    return economy, balance


def format_economy_line(region_id: str, economy: RegionalEconomy, balance: SideGroupBalance) -> str:
    """
    Why this exists:
        Print one map's prices on a single line the operator can compare to the expected table.
    When to use:
        From the economy command after a successful assign.
    What to expect:
        Scale at 3 decimals, then costs, gates, strike size, and PASS or FAIL.
    Exceptions:
        None.
    """

    LOGGER.debug("format_economy_line region=%s.", region_id)
    status = "PASS" if balance.within_tolerance else "FAIL"
    scale = f"{round_half_up_decimal(economy.scale):.3f}"
    return (
        f"{region_id} urban={economy.urban_cell_count} producing={economy.producing_hex_count} "
        f"scale={scale} infantry={economy.infantry_cost} armor={economy.armor_cost} "
        f"naval={economy.naval_cost} air={economy.air_cost} "
        f"missile={economy.missile_cost} range={economy.missile_range_hexes} "
        f"mins={economy.armor_min_urban_cells}/{economy.air_min_urban_cells}/{economy.naval_min_urban_cells} "
        f"advanced={economy.advanced_min_urban_cells} strike={economy.strategic_strike_urban_cells} "
        f"balance={status}"
    )


def format_failure_lines(balance: SideGroupBalance) -> list[str]:
    """
    Why this exists:
        Name the groups that sit outside the balance band.
    When to use:
        After ``format_economy_line`` when balance failed.
    What to expect:
        One indented line per failing group. An empty list when every group passed.
    Exceptions:
        None.
    """

    LOGGER.debug("format_failure_lines failing=%s.", sum(1 for group in balance.groups if not group.within_tolerance))
    lines: list[str] = []
    for group in balance.groups:
        if group.within_tolerance:
            continue
        lines.append(
            f"  FAIL {group.group_id} share={group.share * 100:.1f}% ratio={group.ratio_to_fair_share:.3f}"
        )
    return lines


def format_economy_markdown(rows: Sequence[tuple[str, RegionalEconomy]]) -> str:
    """
    Why this exists:
        Print the price table the region summary is copied from.
    When to use:
        The economy command with ``--markdown``, after every region has been assigned.
    What to expect:
        A Markdown table. Scale is printed at 3 decimals.
    Exceptions:
        None.
    """

    LOGGER.debug("format_economy_markdown rows=%s.", len(rows))
    lines = [
        "| Map | Infantry | Armor | Naval | Air | Missile | Minimums | Advanced | Strike | Range | Scale |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for region_id, economy in rows:
        minimums = (
            f"{economy.armor_min_urban_cells}/{economy.air_min_urban_cells}/{economy.naval_min_urban_cells}"
        )
        lines.append(
            f"| {region_id} | {economy.infantry_cost} | {economy.armor_cost} | {economy.naval_cost} | "
            f"{economy.air_cost} | {economy.missile_cost} | {minimums} | {economy.advanced_min_urban_cells} | "
            f"{economy.strategic_strike_urban_cells} | {economy.missile_range_hexes} | {economy.scale:.3f} |"
        )
    return "\n".join(lines)


def format_balance_markdown(documents: Sequence[tuple[str, Mapping[str, Any]]]) -> str:
    """
    Why this exists:
        Print each group's share and land-hex count for the region summary.
    When to use:
        The economy command with ``--markdown``.
    What to expect:
        One row per map. Each group is ``display name share% (land hexes)``.
    Exceptions:
        None. A document without ``side_group_balance`` contributes an empty group list.
    """

    LOGGER.debug("format_balance_markdown rows=%s.", len(documents))
    lines = ["| Map | Groups |", "|---|---|"]
    for region_id, document in documents:
        names = {
            str(group["id"]): (str(group.get("display_name", group["id"])), int(group.get("land_hex_count", 0)))
            for group in document.get("side_groups", [])
        }
        parts: list[str] = []
        balance = document.get("side_group_balance", {})
        for group in balance.get("groups", []):
            display_name, land_hexes = names.get(str(group["id"]), (str(group["id"]), 0))
            parts.append(f"{display_name} {float(group['share']) * 100:.1f}% ({land_hexes})")
        lines.append(f"| {region_id} | {', '.join(parts)} |")
    return "\n".join(lines)
