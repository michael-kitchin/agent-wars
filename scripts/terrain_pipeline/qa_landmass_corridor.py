#!/usr/bin/env python3
"""
Print landmass corridor spot-checks and verify BFS routes using export rules.
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import h3

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.terrain_pipeline.config import build_default_config  # noqa: E402
from scripts.terrain_pipeline.landmass import LANDMASS_SPOT_CHECK_HEXES  # noqa: E402

RES1_LAND_MAX_WATER_PCT = build_default_config().land_water_threshold_pct

ROUTE_PAIRS = (
    ("GK", "GT"),
    ("JC", "H6"),
)

NE_ID_NORTH_AMERICA = 1159104607
NE_ID_SOUTH_AMERICA = 1159104361
I8_CODE = "I8"
I8_ISTHMUS_MAX_HOPS_TO_CONTINENT = 3


def _ids_intersect(a: list[int], b: list[int]) -> bool:
    if not a or not b:
        return False
    set_b = set(b)
    return any(x in set_b for x in a)


def can_traverse(from_row: dict, to_row: dict) -> bool:
    if float(to_row["water_pct"]) >= RES1_LAND_MAX_WATER_PCT:
        return False
    return _ids_intersect(from_row["continent_ids"], to_row["continent_ids"]) or _ids_intersect(
        from_row["island_ids"], to_row["island_ids"]
    )


def bfs_to_predicate(
    by_h3: dict[str, dict],
    start: str,
    goal_predicate,
    max_depth: int = 40,
) -> list[str] | None:
    """Breadth-first search until ``goal_predicate(by_h3[hex])`` is true."""
    if start not in by_h3:
        return None
    if goal_predicate(by_h3[start]):
        return [start]
    queue: deque[list[str]] = deque([[start]])
    seen = {start}
    while queue:
        path = queue.popleft()
        current = path[-1]
        if len(path) > max_depth:
            continue
        for neighbor in h3.grid_disk(current, 1):
            if neighbor == current or neighbor in seen or neighbor not in by_h3:
                continue
            if not can_traverse(by_h3[current], by_h3[neighbor]):
                continue
            next_path = [*path, neighbor]
            if goal_predicate(by_h3[neighbor]):
                return next_path
            seen.add(neighbor)
            queue.append(next_path)
    return None


def bfs(by_h3: dict[str, dict], start: str, goal: str, max_depth: int = 40) -> list[str] | None:
    if start not in by_h3 or goal not in by_h3:
        return None
    queue: deque[list[str]] = deque([[start]])
    seen = {start}
    while queue:
        path = queue.popleft()
        current = path[-1]
        if current == goal:
            return path
        if len(path) > max_depth:
            continue
        for neighbor in h3.grid_disk(current, 1):
            if neighbor == current or neighbor in seen or neighbor not in by_h3:
                continue
            if not can_traverse(by_h3[current], by_h3[neighbor]):
                continue
            seen.add(neighbor)
            queue.append([*path, neighbor])
    return None


def main() -> int:
    landmass_path = ROOT / "data" / "generated" / "terrain_res1_landmass.json"
    if not landmass_path.is_file():
        print(f"Missing {landmass_path}", file=sys.stderr)
        return 1
    envelope = json.loads(landmass_path.read_text(encoding="utf-8"))
    records = envelope.get("records") or []
    by_h3 = {row["h3_index"]: row for row in records}
    code_to_h3 = {code: h3_index for code, h3_index in LANDMASS_SPOT_CHECK_HEXES.items()}

    print("code | water_pct | continent_ids | island_ids")
    for code in LANDMASS_SPOT_CHECK_HEXES:
        row = by_h3.get(code_to_h3[code])
        if not row:
            print(f"{code} | MISSING")
            continue
        print(
            f"{code} | {row['water_pct']} | {row['continent_ids']} | {row['island_ids']}"
        )

    failed = False
    for start_code, goal_code in ROUTE_PAIRS:
        start = code_to_h3[start_code]
        goal = code_to_h3[goal_code]
        path = bfs(by_h3, start, goal)
        if path is None:
            print(f"ROUTE FAIL: {start_code} -> {goal_code}")
            failed = True
        else:
            print(f"ROUTE OK: {start_code} -> {goal_code} ({len(path) - 1} hops)")

    i8_h3 = code_to_h3[I8_CODE]
    i8_row = by_h3.get(i8_h3)
    if not i8_row:
        print(f"I8 CHECK FAIL: missing row for {I8_CODE}")
        failed = True
    elif not i8_row["continent_ids"]:
        print(f"I8 CHECK FAIL: empty continent_ids for {I8_CODE}")
        failed = True
    else:
        i8_water = float(i8_row["water_pct"])
        high_water_note = (
            f" (occupiable isthmus; overland entry blocked at {RES1_LAND_MAX_WATER_PCT}% threshold)"
            if i8_water >= RES1_LAND_MAX_WATER_PCT
            else ""
        )
        print(
            f"I8 CHECK OK: water_pct={i8_water} continent_ids={i8_row['continent_ids']}{high_water_note}"
        )

        sa_path = bfs_to_predicate(
            by_h3,
            i8_h3,
            lambda row, continent_id=NE_ID_SOUTH_AMERICA: continent_id in row["continent_ids"],
            max_depth=I8_ISTHMUS_MAX_HOPS_TO_CONTINENT,
        )
        if sa_path is None:
            print("I8 PANAMA FAIL: no land route to South America within isthmus hop limit")
            failed = True
        else:
            print(
                f"I8 PANAMA OK: South America reachable in {len(sa_path) - 1} hops via isthmus overlap"
            )

        na_path = bfs_to_predicate(
            by_h3,
            i8_h3,
            lambda row, continent_id=NE_ID_NORTH_AMERICA: continent_id in row["continent_ids"],
            max_depth=I8_ISTHMUS_MAX_HOPS_TO_CONTINENT,
        )
        if na_path is None:
            print(
                f"I8 PANAMA FAIL: no land route to North America within "
                f"{I8_ISTHMUS_MAX_HOPS_TO_CONTINENT} hops"
            )
            failed = True
        else:
            print(
                f"I8 PANAMA OK: North America reachable in {len(na_path) - 1} hops via isthmus overlap"
            )

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
