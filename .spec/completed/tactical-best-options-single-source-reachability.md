# Tactical Best Options reachability — strategic parity + reuse

## Parity (intentional)

| Layer | Strategic | Tactical |
| --- | --- | --- |
| Destination collector | `getValidDestinations` → `getLandMassReachableHexes` (hop BFS) / naval disk | `collectTacticalLegalMoveDestinationRes4Hexes` → single-source MP reachability |
| Hex sets | Res1 land-mass | Res4 footprint + Ready enter costs |
| Best Options interest | Enemy ∪ uncontrolled unoccupied interesting infra; infra-only does not suppress approach | Enemy (human) ∪ uncontrolled unoccupied interesting infra (same predicate helper); infra-only does not suppress approach |
| Empty / infra-only interest | Approach fallback (grid distance to nearest observed enemy); infra capture only when approach cannot run | Approach fallback (same helper); infra capture only when approach cannot run |
| Ranged Best Options | Enemy-occupied only | Human-occupied only (legal infra-only shots unchanged) |

Destination **sets** are not shared — different maps and cost models. Pipeline and interest **shape** are shared.

## Reuse

- Land: `collectInfantryArmorReachableWithinBudget` + shared `landStateKey` / `parseLandStateKey` / transit helpers from continuity.
- Naval: `collectSimpleEnterCostReachableWithinBudget` reuses planner `enterCostForHex` (one Dijkstra).
- Filters: `keepsBestOptionsThisTurnInterestHex` in `possibleUnitActionsBestOptionsInterest.ts` for strategic ground and tactical ground. Tactical ranged Best Options keeps human-occupied cells only.

## Perf note

Replaces N per-destination Dijkstras that caused ~4.5 s `thisTurnOptionsFilterTotals` stalls after Ready.
