# Tactical March Planner Performance — Post-Implementation Verification

Status: Awaiting manual session (2026-06-02)
Related plan: `tactical-march-planner-performance-execution-plan.md`

## Implemented

- **Phase 1:** `buildRes4FootprintAdjacencyMap` + session-cached adjacency passed into `planTacticalRes4March`.
- **Phase 2:** Terrain identity via layer-reference equality; full `tacticalTerrainLayerSignature` only when refs change.
- **Phase 3:** Placement removed from cache key; invariance tests pass (infantry + naval).
- **Phase 4:** Hoisted `listRes4FeatureOverridesForGame` filter and human-occupancy set in tactical options collection.
- **Phase 7:** Debug timing on plan cache misses (`elapsedMs`) and options filter totals (`elapsedMs`).
- **Deferred:** Phases 5–6 (single-source reuse, per-cell enter-cost memo).

## What to check in the next `debug.log`

After replaying a tactical beat comparable to the 2026-06-02 session:

| Signal | Before (approx.) | Target |
| --- | --- | --- |
| `planTacticalRes4MarchWithSessionCache miss` `elapsedMs` | ~250–315 ms | tens of ms |
| Warm plans (hits, no miss log) | ~16–23 ms gap between `tacticalMarchPlan ok` lines | near-zero |
| `validateHumanMarchOrdersWhenTacticalActive` window | ~280–355 ms | < ~50 ms |
| `thisTurnOptionsFilterTotals` `elapsedMs` | ~120–167 ms | meaningfully lower |
| Beat apply burst (consecutive `tacticalMarchPlan ok` during `applyHumanTacticalDraftBeatInStrategicOrder`) | ~280 ms spacing | ~16–23 ms or less |

## Automated tests run

- `tacticalMovementPlanningCache.test.js` — 4/4 pass (includes placement invariance).
- `tacticalRes4TransportLink.test.js` — 11/11 pass (includes adjacency precompute).
- `tacticalRes4MovementPlanner.test.js` — 44/44 pass.
