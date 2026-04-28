# Tactical res4 transport APIs (strict vs march)

Road/rail overlays use parallel `road_sides` / `rail_sides` boolean arrays indexed like `gridDisk(h, 1)` ring order. Two families of predicates exist:

| API | Meaning | Typical caller |
|-----|---------|----------------|
| `tacticalRes4TransportEdgeActive` | **Head-only:** `fromH3` marks the slot toward `toH3`. | Slot-aligned unit tests; diagnostics |
| `tacticalRes4TransportInteriorContinuityOnCurr` | **Strict corridor:** `curr` marks both slots toward `prev` and `next`. | Legacy strict continuity checks in tests |
| `tacticalRes4TransportMarchAdjacentPairAllowsStep` | **March:** ring-1 neighbors; **both** cells have valid masks with **any** road/rail bit set. | `transportFromTo`, land march, placement resolver |
| `tacticalRes4TransportMarchInteriorContinuity` | March interior: `pair(curr,prev) ∧ pair(curr,next)` using march pairs. | `tacticalRes4LandMarchContinuity` |
| `tacticalRes4TransportReciprocalBoundaryActive` | **Deprecated:** two `EdgeActive` directions; superseded by march pair. | Avoid new use |

Resolver construction:

- `buildRoadRailMapFromRes4RoadRailRecords` + `tacticalTerrainTransportResolverFnsFromRoadRailMap` in [`src/shared/tacticalTerrainMovement.ts`](../src/shared/tacticalTerrainMovement.ts) centralize snapshot/placement `transportFromTo` + `landTransportMarchContext`.

Footprint neighbors:

- `res4NeighborsInFootprint` in [`src/shared/tacticalRes4TransportLink.ts`](../src/shared/tacticalRes4TransportLink.ts) is the shared movement-graph neighbor list for tactical Dijkstra.

## Transport step MP bases (after march continuity authorizes the step)

- **Blocking** destinations (e.g. armor into mountain, infantry into water, when the cell is not urban/rubble flagged): fixed **1** (infantry) or **2** (armor) base MPs before dividing by the road (**2.0**) or rail (**3.0**) speed factor from [`tacticalRes4TransportStepSpeedMultiplier`](../src/shared/tacticalRes4TransportLink.ts).
- **Non-blocking** steps: base MPs come from the destination’s §12.4 [`tacticalEnterHexMovementCost`](../src/shared/tacticalTerrainMovement.ts) category (forests, wetlands, etc.) so rough terrain on a valid corridor costs more per step than open plains on the same link.
- **Urban** destination with transport pricing: use **plains-equivalent** base MPs for that non-blocking calculation so armor remains finite when `res4IsUrbanByH3` overlays harsh kinds (e.g. mountain-class).
- **Urban without** authorized transport (no corridor / masks): fixed **1 MP** enter per legacy urban rule.

Related tests: [`src/main/tacticalBattle/tacticalRes4TransportLink.test.ts`](../src/main/tacticalBattle/tacticalRes4TransportLink.test.ts), [`src/main/tacticalBattle/tacticalRes4MovementPlanner.test.ts`](../src/main/tacticalBattle/tacticalRes4MovementPlanner.test.ts).
