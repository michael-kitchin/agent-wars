# Tactical Best Options reachability — strategic parity + reuse

## Parity (intentional)

| Layer | Strategic | Tactical |
| --- | --- | --- |
| Destination collector | `getValidDestinations` → `getLandMassReachableHexes` (hop BFS) / naval disk | `collectTacticalLegalMoveDestinationRes4Hexes` → single-source MP reachability |
| Hex sets | Res1 land-mass | Res4 footprint + Ready enter costs |
| Best Options interest | Enemy ∪ uncontrolled interesting infra | Enemy (human) ∪ interesting infra (same predicate helper) |
| Empty interest | Empty rows for that unit | Approach fallback (tactical-only) |

Destination **sets** are not shared — different maps and cost models. Pipeline and interest **shape** are shared.

## Reuse

- Land: `collectInfantryArmorReachableWithinBudget` + shared `landStateKey` / `parseLandStateKey` / transit helpers from continuity.
- Naval: `collectSimpleEnterCostReachableWithinBudget` reuses planner `enterCostForHex` (one Dijkstra).
- Filters: `keepsBestOptionsThisTurnInterestHex` for strategic ground, tactical ground, and tactical ranged.

## Perf note

Replaces N per-destination Dijkstras that caused ~4.5 s `thisTurnOptionsFilterTotals` stalls after Ready.
