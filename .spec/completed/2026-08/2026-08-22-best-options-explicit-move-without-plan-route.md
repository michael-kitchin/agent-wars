# Best Options dests without per-unit plan_route

When **Best Options This Turn** lists Target Hexes, those codes are already this-turn legal destinations. The AI may copy them into `explicit_move.destination` without calling `plan_route`. `plan_route` is only for dests not listed for that unit.

**Audience:** Maintainers of OpenRouter tactical/strategic prompt copy.  
Do not copy this document’s internal labels into product code, comments, configuration, or other version-controlled artifacts.

---

## Locked decisions

1. Tactical prompts tell the model to copy Best Options Target Hexes into `explicit_move` for every sub-unit with a Best Options approach or move/melee row (standing orders do not move units in battle; Unit Status “Action needed: no” does not mean idle).
2. Strategic prompts use the same dest-copy rule **only when issuing `explicit_move`** (a one-step override). Units with standing orders do not need `explicit_move` unless the model intends to override the current mission.
3. Do not require `plan_route` for every unit that needs a move.
4. `plan_route` remains available for dests not in that unit’s Best Options rows; copy `orderToHexCode` in that case.
5. Legal dest collectors and pathfinding are unchanged.
6. `assign_order` place fields (`destination`, `defendHex`, `waypoints`) are operational-map briefing hex codes and may be multi-turn goals. They are not `plan_route` `orderToHexCode`. Best Options Target Hexes are this-turn dests only.
7. Fog-off strategic Unit Status honesty copy matches dest-copy (grid hops are not march paths; Best Options dests are this-turn legal).

## Out of scope

- Changing `plan_route` truncation, validation, or land-mass / res4 planners.
- Changing Best Options interest/approach row generation.
