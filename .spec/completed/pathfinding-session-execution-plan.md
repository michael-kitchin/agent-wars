# Pathfinding Session Capability - Execution Plan

## Goal

Introduce a reusable "pathfinding session" capability that allows expensive route-planning setup to be constructed once and reused across hover updates and related planning calls, while preserving existing behavior, movement-rule correctness, and reliability.

This plan is organized into independently verifiable phases for maximum clarity and safe rollout.

## Scope

In scope:

- Main-process route planning and hover-preview planning flows.
- Session-aware APIs that reuse derived planning state.
- Backward-compatible default APIs.
- Tests, diagnostics, and documentation needed to keep behavior understandable for future developers.

Out of scope (initial implementation):

- Rewriting core pathfinding algorithms.
- Gameplay rule changes.
- Renderer-side architectural rewrites outside minimal integration points.
- Mandatory standing-order sessionization in first delivery (unless introduced as a low-risk follow-on).

## Confirmed Decisions (User-Approved)

1. Renderer-visible session handles:
   - Use only if needed to prevent accidental discard/rebuild during hover preview.
   - Otherwise keep session ownership internal to main process.
2. `avoidEnemies` behavior for human systems:
   - Default `avoidEnemies` to `false` for human hover preview.
   - Default `avoidEnemies` to `false` for human standing-order route recomputation.
3. Visibility-aware enemy avoidance:
   - Enemy avoidance must not consider enemies the acting side cannot currently see (human or AI).
   - Human and AI visibility quality must be symmetric; each side uses its own subjective battlefield view.
4. First implementation scope:
   - Prioritize hover-preview pathfinding session capability.
   - Standing orders are optional follow-on unless a major implementation synergy makes inclusion low-risk and high-value.
5. Invalidation strictness:
   - Treat both selection/order changes and game-state visibility/infrastructure changes as invalidation triggers.
6. Session cardinality:
   - Use one active hover pathfinding session per player, with bounded cache sizes.

## Design Principles

- Reliability first: no behavior changes without explicit tests.
- Backward compatible: keep current call patterns working.
- Explicit invalidation: session state must not outlive relevant game/selection state.
- Bounded memory: all session caches and maps must have safe limits.
- Understandability: small, named types and orienting comments on new public non-overriding methods.

## Proposed Session Model

Introduce a new main-process session object (example name: `PathfindingSession`) that precomputes and owns reusable state:

- `state` snapshot and `hexSet`.
- `unitById` map.
- `latLngByH3` and `resolveToH3`.
- `passabilityByH3`, `terrainByH3`, `terrainKindByH3`.
- Optional precomputed blocked sets by perspective (for `avoidEnemies` true/false paths).
- Bounded per-session route/preview caches.
- Session metadata for invalidation checks (turn number, state signature, selected unit signature, createdAt).

Default overloads keep existing behavior by creating an ephemeral session internally.

## Phases

### Phase 1 - Baseline and safety rails

Purpose:

- Freeze current behavior and performance signatures before refactor.

Tasks:

- Add focused debug counters around hover planning:
  - request count,
  - `executePlanRoute` count,
  - fallback attempts,
  - cache hit/miss stats.
- Add/refresh tests for current expected behavior:
  - land/arctic/water movement constraints,
  - multi-select unique-origin dedupe behavior,
  - hover preview invalid marker and valid path behavior.

Verification:

- `npm run build:main`
- Existing movement/path tests pass.
- Manual log capture shows baseline counts in known repro path (southern Africa -> central Asia hover).

Exit criteria:

- Baseline metrics captured and committed to plan notes.

---

### Phase 2 - Session core extraction (no behavior change)

Purpose:

- Extract reusable planning state without changing outputs.

Tasks:

- Create `PathfindingSession` type and builder (example: `createPathfindingSession(state, options)`).
- Move repeated setup logic into session creation:
  - maps, sets, coordinate resolver, unit index.
- Introduce default wrappers:
  - current methods call into session-aware variants using an ephemeral session.
- Add orienting comments for new public methods.

Verification:

- Unit tests for session construction (map sizes, key lookups, deterministic signatures).
- Existing route planning tests unchanged and passing.
- Output parity checks: selected representative scenarios produce identical route results pre/post extraction.

Exit criteria:

- Session-aware and default code paths both green with parity confidence.

---

### Phase 3 - Hover preview integration with explicit lifecycle

Purpose:

- Use long-lived session state for hover planning to reduce repeated setup cost.

Tasks:

- Introduce hover planning session lifecycle in main/renderer integration:
  - create on selection start/change,
  - reuse on mouse move,
  - invalidate on selection change, turn/state mutation, or commit/cancel.
- Route hover preview computations through session-aware APIs.
- Default hover preview route calls to `avoidEnemies: false`.
- Ensure `avoidEnemies: true` (when explicitly requested) filters enemies by acting-side visibility.
- Keep throttle/coalescing and bounded fallback guards active.
- Ensure one active compute at a time for hover request stream (coalesced in-flight behavior).

Verification:

- Manual stress test: rapid mouse movement should not crash.
- Logs show significant reduction in repeated setup work per hover event.
- Functional checks:
  - legal long routes (southern Africa -> central Asia) still preview,
  - illegal routes still show invalid marker.

Exit criteria:

- Crash repro no longer reproduces in stress pass.
- Responsiveness and correctness both acceptable.

---

### Phase 4 - Extended adoption (safe targets only)

Purpose:

- Reuse session-aware APIs in additional call sites where low risk and beneficial.

Candidate targets:

- grouped preview paths,
- standing-order recomputation loops (optional follow-on),
- list/inspection calls that repeatedly plan routes in one request.

Tasks:

- Swap safe call sites to session-aware methods.
- Keep fallback to default overloads where lifecycle or invalidation is unclear.

Verification:

- All relevant standing-order and planning tests pass.
- No regression in order generation correctness.

Exit criteria:

- Additional call sites improved with no behavior regressions.

---

### Phase 5 - Hardening, docs, and cleanup

Purpose:

- Ensure maintainability and future-safe operations.

Tasks:

- Add bounded cache eviction tests.
- Add invalidation tests (selection change, turn advance, unit position changes).
- Add developer docs section:
  - session lifecycle,
  - when to use session-aware vs default overload,
  - invalidation triggers.
- Remove obsolete duplicate setup code.

Verification:

- Full targeted test suite pass.
- Lint pass.
- Manual sanity pass in UI.

Exit criteria:

- Feature stable, documented, and understandable for future developers.

## Testing Strategy

- Happy paths:

  - valid long-distance preview and committed routing.
  - multi-select dedupe by unique origin.
- Essential failure cases:

  - blocked movement by land/arctic/water constraints.
  - stale session invalidation path.
  - bounded fallback stops under heavy hover churn.
- Non-goals:

  - no implementation-detail-only tests.
  - no redundant REST/delegation boilerplate tests.

## Observability and Logging Plan

- Debug-level logs on new public backend method invocations and session lifecycle events:

  - session create/reuse/invalidate reason,
  - per-request cache hit/miss counters,
  - fallback attempts/time-budget stops.
- Error-level logs on caught exceptions with enough context:

  - unit id,
  - hovered/destination hex,
  - session signature/version markers.
- Trace-level logs for getter-style non-mutating session accessors.

## Risks and Mitigations

- Risk: stale session state causes incorrect previews.

  - Mitigation: strict invalidation keys + tests around selection/turn/state changes.
- Risk: memory growth from session caches.

  - Mitigation: bounded caches with deterministic eviction.
- Risk: behavior drift during extraction.

  - Mitigation: phase-gated parity checks and default overload fallback.
- Risk: reduced preview quality from over-throttling.

  - Mitigation: keep throttle configurable, validate responsiveness manually.

## Rollback Strategy

- Keep default non-session overloads as fallback throughout rollout.
- Gate session integration behind a local feature flag if needed for staged enablement.
- If regression appears, route callers back to default overloads while preserving extracted code for iterative fixes.

## Deliverables

- New session module(s) and typed APIs.
- Updated hover/route integration using session lifecycle.
- Tests covering session construction, invalidation, and bounded caches.
- Updated developer guidance in `.spec`.

## Execution Notes (Completed)

### Implemented scope by phase

- Phase 1:

  - Added hover-preview diagnostics counters for request volume, route calls, route cache hit/miss, fallback attempts, fallback budget aborts, and session lifecycle create/reuse/invalidate events.
  - Added debug logging for session lifecycle events and diagnostics-oriented behavior.
- Phase 2:

  - Added `PathfindingSession` and `createPathfindingSession(...)`.
  - Added session-aware `executePlanRouteWithSession(...)` and preserved backward-compatible default wrapper behavior in `executePlanRoute(...)`.
  - Added output parity coverage between default and session-aware planning paths.
- Phase 3:

  - Integrated one active hover session per player with explicit create/reuse/invalidate lifecycle.
  - Enforced human hover default `avoidEnemies: false`.
  - Kept throttle/coalescing and bounded fallback guards active.
  - Added strict invalidation keys that include selection, selected-unit positions, and environment signatures covering turn/intel/infrastructure state.
- Phase 4:

  - Applied low-risk follow-on for human standing-order march defaults/recompute (`avoidEnemies: false`).
  - Preserved existing defaults for non-human flows unless explicitly overridden.
- Phase 5:

  - Added invalidation and cache-bound tests for hover session behavior.
  - Added plan-level completion evidence and retained focused logs for troubleshooting.

### Visibility-safe enemy avoidance

- Enemy-avoidance blocking now respects subjective snapshots:

  - when perspective-aware state is provided, only currently visible enemies can contribute to blocked hexes;
  - when fog is enabled but perspective metadata is unavailable, enemy blocking is skipped to avoid omniscient behavior.

- Human standing-order generation in Ready now uses human perspective state for route recomputation, preserving symmetric visibility quality.

### Verification evidence

Executed and passing:

- `npm run build:main`
- `node dist/main/game-actions/humanMarchPreview.test.js`
- `node dist/main/tools/tool5StandingOrders.test.js`
- `node dist/main/tools/tool1Pathfinding.test.js`
- `node dist/main/gameActionsMultiSelect.test.js`

No linter errors on touched files in this implementation pass.

## Open Questions Requiring Confirmation

None at this time. The plan is execution-ready.
