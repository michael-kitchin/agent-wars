# Tactical AI plan_route / Best Options approach

Fixes tactical AI no-movement when strategic land-mass pathfinding rejects res4 cells, and empty Best Options when enemies are beyond this-beat reach.

**Audience:** Maintainers of Tool1 / Best Options / tactical AI consultation.  
**Do not** put this document’s internal labels into product code, comments, configuration, or other version-controlled artifacts.

---

## Locked decisions

1. Tactical `plan_route` and `check_distance` use `planTacticalRes4MarchWithSessionCache` (res4 MP), not strategic res1 land-mass BFS.
2. `plan_route` `orderToH3` / `orderToHexCode` = `firstStopWithinBudget.stopH3` (same truncation as human Ready). Best-effort neighbor recovery matches Ready when the full destination has `no_path`.
3. `avoidEnemies` defaults to true when omitted; when true, enemy-occupied cells are removed from the route footprint (origin/destination kept). If that fails, retry without avoidance and warn (strategic parity).
4. Best Options this-turn ground moves: keep interest filter in `possibleUnitActionsBestOptionsInterest.ts` (human-occupied / uncontrolled infra the AI does not occupy). **When that filter is empty, or is infra-only (no human in this-turn dests)**, keep approach hexes that strictly reduce H3 distance to the nearest observed human(s). Per-unit row cap remains `selectTopRowsPerUnit` (5). Tactical ranged Best Options lists human-occupied cells only.

## Out of scope

- Changing strategic `plan_route` / land-mass behavior.
- Changing human Ready march application (already correct).
