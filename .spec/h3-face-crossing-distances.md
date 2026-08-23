# H3 distances across icosahedron face crossings

H3's fast distance APIs (`gridDistance`, `gridPathCells`) throw for some cell pairs whose local IJK coordinates span an icosahedron face boundary. Code that swallowed those throws reported nearby units as far away, absent, or unreachable. This document records which pairs are affected, the shared helper that measures them, and which surfaces still fail closed.

**Audience:** Maintainers of Commander briefing assessments, Best Options, and tactical target selection.

## Where the throws are

- **Strategic (resolution 1):** scattered global pairs throw. A unit can be a few hexes from an enemy and still have no `gridDistance`.
- **Tactical (resolution 4):** throws are confined to the **twelve** res1 parents that contain a res4 pentagon. Every other parent's children measure cleanly. Inside those twelve, an exhaustive sweep of all res4 child pairs found 194,940 throwing pairs, and the closest are only **2** hops apart.

The tactical case matters because a battle footprint is the res4 children of one res1 hex. A battle fought in one of those twelve hexes hits throwing pairs at melee and ranged distances; a battle anywhere else never does. That is why the problem is invisible in most captured prompts.

## The shared helpers

All of this lives in `src/shared/h3GridRangePure.ts` so both the main process and the renderer-visible shared layer use one implementation. `src/shared` must not import from `src/main`, so the fallback BFS has to live here, not in a main-process module.

- **`computeGridPathCellsPure(origin, dest)`** — tries `gridPathCells`, then reconstructs a shortest path from a depth-capped neighbor BFS. This is the only BFS in the codebase for this purpose.
- **`computeGridDistanceWithPathFallbackPure(origin, dest)`** — `computeGridDistancePure` (which is `gridDistance`, then `gridPathCells`), then the path helper's length minus one.
- **`isWithinGridRangePure(origin, dest, maxRange)`** — unchanged; falls back to a single `gridDisk(origin, maxRange)` membership test.

`gridHopDistanceBetween` in `src/main/tools/assessUnitProximity.ts` is a thin logging wrapper over `computeGridDistanceWithPathFallbackPure`, so the two layers cannot drift. Prefer `gridHopDistancesFrom` when scoring many targets from one origin; use `gridHopDistanceBetween` for single pairs.

None of these throw. They return `null` only when no path can be derived at all — an invalid cell, or a pair beyond the depth cap.

Only the BFS fallback is memoized. Successful `gridPathCells` results are deliberately not cached: they are the common case and each entry is a whole array, so caching them would cost far more memory than the H3 call saves.

The two fallback caches are sized differently on purpose. Derived **paths** are arrays, so that cache stays small. Derived **distances** get their own integer cache at the normal capacity, because the scan-heavy callers — ranged-target enumeration and the nearest-hex searches — measure far more distinct pairs than the path cache holds. Without the separate integer cache those scans thrash the path cache and re-run a search they only need a number from. A cold BFS at resolution 1 costs roughly 5 ms, so repeated pairs must stay cached.

## Surfaces that use it

| Surface | Behavior on an unmeasurable pair |
| --- | --- |
| `assess_unit` / `assess_hex` distances | Resolved by BFS; no placeholder distance |
| Best Options approach rows (both modes) | Hex is skipped only when BFS also fails |
| Tactical Unit Status nearest enemy | Enemy is **omitted** rather than given a placeholder |
| Tactical DEFEND ranged target choice | Legal cell ranks **last** rather than being dropped |
| `estimate_combat` ranged attacker filter | Attacker stays in range when BFS measures it |
| Callback threat evaluation (`canHitNow`) | Resolved by BFS before the range comparison |
| Tactical mountain line-of-sight trace | Path reconstructed by BFS; blocked only by an actual mountain |
| Strategic move validation (`validateMoveOrder`) | Move stays legal; rejection is logged and reserved for a genuinely underivable pair |
| Territory credited along a march | Whole path is credited, not just the two endpoints |
| DEFEND / PURSUE / PATROL / march standing-order auto-fire | Target is measured by BFS; the air branch keeps a gate-approved target and ranks it last |
| Strategic Best Options ranged rows | Legal target is listed; the row no longer disappears from the table the model acts on |
| Tactical one-step best-effort march recovery | Neighbor candidates keep their distances, so recovery still runs inside a pentagon parent |
| Nearest-water / nearest-navigable-cell scans | Candidates are ranked in hex steps throughout |

Two conventions govern the fallback behavior, and they differ on purpose:

- **Where the number is the claim** (Unit Status distance, threat severity, in-range flags), an unmeasurable pair is omitted. A fabricated distance is worse than a missing row: the old tactical code substituted `99`, which turned an enemy two hexes away into severity `low` with both range flags false.
- **Where legality was already decided elsewhere** (tactical ranged targets), the cell is kept and ranked last. Dropping it would forfeit a legal shot for a ranking detail.

## Range legality

Range legality across a face crossing was never broken: `isWithinGridRangePure` has always fallen back to `gridDisk` membership. Do not route range checks through the path helper; the disk test is cheaper and is the established contract.

The two agree, which is what lets Best Options advertise a shot that order validation will accept. Best Options ranks by derived distance while `validateRangedAttack` tests `gridDisk` membership, and a sweep of 4,000 unmeasurable resolution-1 pairs across ranges 1–3 found zero disagreements. Keep that property in mind before changing either side.

## Line of sight is an approximation across crossings

`tacticalMountainLosBlockedState` scans `computeGridPathCellsPure`, so mountains still block and clear terrain no longer fails closed. Only a pair with no derivable path at all still counts as `traceFailed` and blocked.

Be aware of the trade-off. For a crossing pair the fallback returns *a* shortest path rather than H3's straight line, because H3 cannot express a line across those pairs. If a mountain sits on the straight line but an equal-length detour avoids it, the shot now reads as clear. That is a deliberate, accepted loosening: before the fallback existed those pairs were blocked unconditionally, so air, armor, and naval ranged fire was rejected even over flat plains while infantry — exempt from the mountain rule — could shoot freely. Trading a rare permissive case for that asymmetry is the better outcome. Blocking whenever a mountain lies on *any* shortest path was considered and rejected as more expensive than the precision is worth.

## Known surfaces that still fail closed

These were audited and deliberately left unchanged:

- **`tacticalRes4GridDistance`** (`src/main/tacticalBattle/tacticalSpatialAdapter.ts`) rethrows, and `tacticalMarchReachableAlongRes4Footprint` propagates that. This one is a hard legality primitive whose throw is load-bearing for callers that must refuse to guess; the recovery paths that used to die with it no longer do.
- **`minDistanceToHomeland`** (`src/main/openrouter/possibleUnitActionsPartition.ts`) may bucket a hex as farther from homeland than it is. No hex is dropped, and running BFS across every homeland cell for every legal hex would cost more than the bucketing is worth.
- **`getValidDestinations`** (`src/main/oneStepMoveDestinations.ts`) has a legacy full-scan branch that skips throwing pairs, but it only runs when the primary `gridDisk` enumeration itself fails, and the disk already handles crossings.

## Is tactical affected the same way?

Not by the auto-fire defect. The tactical equivalent of `appendDefendStandingOrderEngagement` is `generateTacticalDefendEngagementForPlayer`, and its target choice already ranks an unmeasurable cell last rather than dropping it, while the tactical range gate (`isWithinGridRangePure`) and mountain LOS both use fallbacks. The gate and the ranking step agree, which is exactly what the strategic air branch got wrong.

What tactical did share was the **movement recovery** path. Two near-duplicate helpers — `tacticalLandMarchBestEffortPlanTowardOrderedHex` and `tacticalBestEffortNeighborPlan` — returned `null` the moment a distance threw, so inside the twelve pentagon parents a unit ordered to a hex it could not fully reach silently lost its one-step approach. Both now use the shared fallback.

## Compare candidates in one unit

`tool1PathfindingDistanceHelpers.tryDistanceWithFallback` used to return hex steps normally and great-circle **kilometres** when H3 threw, and all three nearest-water scans fed both into the same running minimum. A crossing candidate scoring in the hundreds could never beat a neighbour scoring single digits, so the genuinely closest cell was passed over and naval staging drifted away from crossings. It now returns hex steps in both cases. When adding a fallback, make sure it produces the same unit as the value it replaces.

## Why standing-order auto-fire was the costliest instance

`appendDefendStandingOrderEngagement` was originally left alone as rules-layer code. A captured turn 17 disproved that call: a DEFEND air unit three hexes from the enemy stack had its range gate return true (the gate uses the `gridDisk` fallback) and `validateAirStrikeOrder` pass, and then lost the strike anyway because the *nearest-target* comparison called raw `gridDistance` and threw. Fourteen of the sixteen origins the turn evaluated against that enemy hex threw.

The unit is invisible in the briefing while this happens: Unit Status reports it as covered by a standing order, so `Action needed` reads `no`, and the model never orders the strike by hand even though Best Options lists it. The gate and the ranking step disagreeing is a defect, not a rule, so all six `gridDistance` sites in that file now use the shared fallback.

Auditing those sites turned up an unrelated defect in the same function. The march branch's engage-en-route test fired only at distance exactly 1, while its pursue and defend siblings both compare against `getRange`. Naval (range 2) and air (range 3) therefore marched past legal shots. That branch now uses the unit's own weapon range and picks the nearest target, matching its siblings. The parameter is not currently exposed in the tool catalog, so the model cannot set it and the defect was latent.

## Test fixtures

Both fixtures **discover** a throwing pair rather than hard-coding H3 literals, so they keep demonstrating a real crossing if h3-js geometry shifts:

- `tacticalRes4PentagonCrossingPair` (`src/main/tacticalBattle/testSupport/tacticalRes4HexFixtures.ts`) returns a close pair plus the enclosing parent and its full child footprint, ready to drop into a battle snapshot. Tests assert against the discovered hop distance.
- `res4PairWhereGridPathCellsThrows` (`src/main/h3GridRangePure.test.ts`) is the minimal equivalent for the pure path-helper contract tests.
