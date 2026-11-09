# Stateful Pathfinding Session Execution Plan

## Goal

Implement stateful movement-path validation for land-unit route planning so movement is blocked only when the path violates accumulated movement state (starting with the selected rule: no consecutive movement across water/arctic-class hexes), while preserving responsiveness for hover preview and standing-order recomputation.

## Confirmed Decisions

- Stateful rule (first implementation): disallow transitions where both previous and next traversed hexes are water/arctic class.
- Route objective: shortest valid path by hex-step count.
- Initial scope: apply to both hover preview and standing-order recomputation.
- Rollout: direct cutover (no feature flag).
- Special class scope for v1: water/arctic only (no additional terrain kinds).
- Endpoint handling: consecutive-special rule applies uniformly to all transitions (no source/destination exemption).
- Dead-state cache scope for v1: destination-specific only.

## Why This Design (Recommended Changes)

The proposed path-prefix exclusion set (`id1|id2|id3`) is directionally correct but can grow rapidly and duplicate equivalent failures. The recommended implementation keeps the same behavior intent while improving reliability and performance:

1. Use **state-space search** (BFS over `(hexId, pathState)`), not plain hex-only BFS.
2. Use **dead-state memoization** keyed by compact state tuples (for example: `hexId + priorClass + destinationId`) instead of full ordered prefix strings.
3. Keep an optional bounded **dead-prefix cache** in session only for diagnostics and targeted pruning where it clearly helps.
4. Continue to reuse **per-player pathfinding sessions** so expensive setup work is not rebuilt for each mouse move.

This preserves shortest-path semantics and avoids DFS backtracking bias while still reusing failures across repeated hover checks.

## In Scope

- Stateful land-path search core integrated into `tool1Pathfinding` session-enabled APIs.
- Session-level memoization for failed state expansions and reusable blocked-set inputs.
- Integration into:
  - human hover preview route computation
  - standing-order route recomputation
- Debug diagnostics to explain route rejection reasons (especially Central Asia-style cases).
- Targeted tests for parity, correctness, and essential failure contracts.

## Out of Scope

- Changing naval-path rules unrelated to land-state accumulation.
- UI redesign beyond existing glyph behavior.
- New user-facing settings or toggles.
- Optimization that weakens path correctness guarantees.

## Design Overview

### 1) Stateful Node Model

Each queued BFS node represents:

- `hexId`: current location
- `distance`: steps from origin
- `prevClass`: movement class of previous traversed hex (`normal`, `special`)
- `parentRef`: predecessor pointer for path reconstruction

Where `special` currently means water/arctic class for land traversal constraints.

### 2) Transition Rule

For neighbor expansion from node `A` to `B`:

- derive `class(A)` and `class(B)` (or equivalent transition class)
- reject if transition violates stateful rule:
  - `class(A) == special && class(B) == special`

This enforces "no consecutive special-class movement" regardless of global blocked sets.

### 3) Memoization Model

Session stores bounded maps/sets:

- `deadStateSet`: states proven unable to reach destination under current environment/session assumptions
- `visitedStateBestDistance`: shortest discovered distance for `(hexId, prevClass)` for current query
- optional `deadPrefixSet`: compact prefix signatures for diagnostics and pruning only

Dead-state entries are invalidated whenever session environment signature changes.

Initial v1 limits:

- max destinations in `deadStateByDestination` per session: 64
- max memoized state keys per destination: 10,000
- eviction policy: LRU by destination, then drop oldest state-key partitions within a destination when needed

### 4) Session Cache Keys

For each player-scoped session:

- player identity and perspective
- selected-unit signature and selected positions
- environment signature (terrain, occupancy, relevant infra, fog/visibility epoch)
- destination-specific subkeys for dead-state reuse

Session invalidation triggers (v1):

- selected unit set changes
- selected unit positions change
- visible occupancy changes
- player perspective or fog snapshot changes
- terrain or infrastructure signature changes
- turn/phase transition

### 5) Correctness Priority

Search remains BFS by state, so the first found destination state is shortest by steps among valid stateful paths.

## Phase Plan

## Phase 0 - Baseline and Observability Lock-In

### Objective

Capture current behavior and establish diagnostics needed to validate migration.

### Work

- Add/confirm trace and debug counters for:
  - state expansions attempted
  - transitions rejected by stateful rule
  - dead-state hits/misses
  - final failure reason breakdown
- Add orienting comments for new/updated public non-overriding methods.
- Ensure updated public backend method invocations emit debug logs; caught exceptions emit error logs; getter-style methods emit trace logs.

### Verification

- Existing tests pass unchanged.
- New diagnostics compile and appear in debug logs during hover route checks.
- No behavioral change yet.
- Explicit limits and invalidation trigger constants are defined and unit-tested for wiring.

## Phase 1 - Stateful Core Search Engine (Isolated)

### Objective

Implement a standalone stateful path planner function with no call-site wiring changes.

### Work

- Introduce internal stateful BFS helper in pathfinding module.
- Implement state tuple construction, transition validation, and path reconstruction.
- Keep existing legacy planner callable for temporary parity tests.
- Add robust error handling around malformed inputs and session mismatches.
- Implement crash-safe runtime failure handling: catch planner exceptions, emit error logs with context, and return no-path result.

### Verification

- Unit tests for:
  - finds route when valid non-consecutive-special path exists
  - rejects when all paths require consecutive special transitions
  - preserves shortest-step behavior among valid routes
  - handles origin/destination edge contracts (same hex, unreachable)
- Logging confirms rejection cause counts are non-zero in expected failure tests.
- Exception-path test confirms no throw propagation to hover/standing-order callers and valid no-path fallback behavior.

## Phase 2 - Session Integration and Dead-State Reuse

### Objective

Attach stateful planner to `PathfindingSession` and enable cross-hover reuse safely.

### Work

- Extend session model with:
  - dead-state cache structures
  - bounded eviction strategy (size/time budget)
  - destination-scoped invalidation hooks
- Integrate precomputed static maps/block sets so they are built once per session environment signature.
- Ensure visibility-aware enemy avoidance remains perspective-correct and reused safely.

### Verification

- Tests assert session planner parity with non-session planner for same inputs.
- Tests assert cache invalidates on selection/environment signature change.
- Diagnostics show dead-state hit growth across repeated hover checks without stale-result regressions.

## Phase 3 - Hover Preview Cutover

### Objective

Replace hover preview planner path with session-backed stateful planner.

### Work

- Wire stateful session planner into hover preview flow.
- Keep existing throttling/caching controls; tune only if metrics require.
- Preserve current glyph contract: show `X` when no valid path.
- Expand debug lines for multi-unit unique source/destination accounting and per-destination planner outcomes.

### Verification

- Existing hover preview tests pass.
- Add/adjust tests for:
  - blocked Central Asia scenario explained by diagnostics (not silent failure)
  - no-crash regression for long-distance hover sweeps
  - multi-unit unique pair processing contract remains true
- Manual verification in game map scenarios used in recent bug reports.

## Phase 4 - Standing Orders Cutover

### Objective

Use same stateful session capability for standing-order recomputation to keep behavior consistent.

### Work

- Route standing-order recomputation through session-aware stateful planner.
- Preserve defaults (`avoidEnemies: false` for human standing orders) and visibility restrictions.
- Ensure no omniscient enemy-avoidance behavior for either player perspective.

### Verification

- Standing-order tests pass and include essential failure-case coverage.
- Parity checks for avoidEnemies visibility behavior across human/AI perspectives.
- Logs provide route-failure reason summaries when standing-order recompute fails.

## Phase 5 - Consolidation, Limits, and Documentation

### Objective

Harden maintainability and operational clarity after cutover.

### Work

- Remove obsolete legacy planner branches if no longer needed.
- Ensure source file size/complexity limits remain compliant (decompose if approaching thresholds).
- Refine orienting comments and method contracts.
- Update/append completion notes in this plan document once implementation lands.

### Verification

- Full test suite sections relevant to pathfinding/preview/standing orders pass.
- Lint checks for edited files pass.
- Debug log review confirms stable, explainable behavior under heavy hover movement.

## Data Structures (Initial Proposal)

- `StatefulTraversalClass`: enum-like classification (`normal`, `special`)
- `StatefulNode`: queued BFS state node
- `StateKey`: compact string or tuple serializer for `(hexId, prevClass[, destinationId])`
- `PathfindingSessionStatefulCache`:
  - `deadStateByDestination`
  - `plannerStatsByDestination`
  - bounded eviction metadata

## Testing Strategy

Keep tests focused on happy paths and essential failure contracts:

- Happy path:
  - reachable long-distance route with intermittent normal hex breaks between special hexes
- Essential failures:
  - all feasible branches require consecutive special transitions
  - destination unreachable due to normal occupancy/block constraints
  - stale session invalidation after selection/environment changes
- Contract tests:
  - session and non-session planners return equivalent outcomes
  - hover and standing orders apply identical stateful validity rules

Avoid testing implementation details such as queue internals or cache container types.

## Logging Plan

For new/updated code:

- `debug`:
  - planner start/end summaries
  - state expansion counts and cache reuse counts
  - reasoned route rejection summaries
- `trace`:
  - getter-style accessors and low-level derived state reads
- `error`:
  - caught exceptions with player/session/context identifiers

Log messages should include enough context for troubleshooting (player, source, destination, session signatures, reason buckets).
On runtime planner/session exceptions, always emit an `error` log and degrade safely to no-path behavior rather than allowing UI-flow crashes.

## Risks and Mitigations

- **State explosion risk**
  - Mitigation: compact state model, bounded caches, strict eviction.
- **Incorrect pruning due to insufficient state key**
  - Mitigation: include all rule-relevant state dimensions in keys; add targeted regression tests.
- **Behavior drift between hover and standing orders**
  - Mitigation: single shared planner function and parity tests.
- **Performance regressions under rapid hover**
  - Mitigation: retain existing throttle/result caches and add state-expansion metrics.
- **Debug complexity**
  - Mitigation: structured reason counters and concise summary logs.

## Rollback Strategy

Even with direct cutover, maintain short-term rollback readiness:

1. Keep previous planner code path available until Phase 5 verification completes.
2. If critical regressions appear, temporarily route callers back to prior planner implementation while preserving new diagnostics.
3. Re-enable phased migration after root-cause fix and targeted test additions.

## Delivery Checklist

- [x] Phase 0 diagnostics and comments complete
- [x] Phase 1 stateful planner complete and tested
- [x] Phase 2 session integration complete and tested
- [x] Phase 3 hover preview cutover complete and tested
- [x] Phase 4 standing orders cutover complete and tested
- [x] Phase 5 cleanup/documentation complete
- [x] Lint and targeted test runs green
- [x] Plan document updated with execution notes

## Resolved Implementation Constraints

1. The stateful `special` class is limited to water/arctic in v1.
2. The consecutive-special transition rule applies uniformly, including endpoint transitions.
3. Dead-state memoization remains destination-specific in v1.
4. Session memoization limits: 64 destinations/session and 10,000 state keys/destination, with LRU-oriented eviction.
5. Invalidate sessions on all listed selection/position/occupancy/perspective/terrain/infra/turn-phase changes.
6. Runtime failures must degrade safely to no-path with error logging (no hover crash propagation).

## Execution Notes (Completed)

- Implemented stateful land-route search in `tool1Pathfinding` using BFS over `(hexId, prevSpecial)` with uniform consecutive special-transition rejection.
- Removed global arctic block injection from route planning and moved to path-state validation so routes are rejected only on rule-violating transitions.
- Added destination-scoped dead-state memoization to `PathfindingSession` with v1 bounds (64 destinations/session, 10,000 states/destination, LRU-style eviction).
- Added stateful diagnostics in planner logs: expanded states, rejected consecutive-special transitions, and dead-state cache hits.
- Strengthened hover-session invalidation inputs by expanding environment signature to include phase, terrain aggregates, and occupancy fingerprint.
- Updated standing-order route recomputation to reuse a shared `PathfindingSession` and `executePlanRouteWithSession`.
- Added/updated tests:
  - `tool1Pathfinding`: parity and separated-special happy path
  - `humanMarchPreview`: session invalidation on occupancy change
  - `gameActionsMultiSelect`: single-transition arctic move acceptance consistent with new stateful rule
- Verification executed successfully:
  - `npm run build:main`
  - `node dist/main/tools/tool1Pathfinding.test.js`
  - `node dist/main/game-actions/humanMarchPreview.test.js`
  - `node dist/main/gameActionsMultiSelect.test.js`
  - `node dist/main/tools/tool5StandingOrders.test.js`
  - `ReadLints` on edited files returned no diagnostics.
