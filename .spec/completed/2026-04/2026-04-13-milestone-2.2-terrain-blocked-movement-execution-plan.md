# Milestone 2.2 — Terrain-Blocked Tactical Movement Execution Plan

*Execution plan for implementing tactical terrain-blocked movement with planning-session caching, structured for reliable execution by a lower-capability coding agent.*

---

## 1. Goal, non-goals, and success criteria

### 1.1 Goal

Implement tactical movement pathfinding that enforces terrain-based traversal rules and movement-cost budgets at `res4` scale, while reusing a strategic-style planning-session cache model adapted to tactical constraints and turn flow.

### 1.2 Non-goals

1. Any LLM prompt or tool-call behavior changes (this milestone has no LLM call work).
2. Net-new tactical ranged-combat mechanics (line-of-sight remains out of scope).
3. Balance retuning of combat dice values, unit attack ranges, or casualty priority.
4. UI redesign beyond movement-preview and order-validation accuracy.

### 1.3 Success criteria (binary)

1. Tactical movement validation uses the terrain-cost matrix from combat rules §12.4 for infantry, armor, and naval.
2. Blocked terrain (`∞`) is consistently enforced in preview, order validation, and committed movement.
3. Movement budget spending is path-aware and deterministic for a given tactical snapshot.
4. Tactical planning sessions cache reusable movement-planning state and are reused during repeated planning interactions.
5. Cache invalidation prevents stale movement outputs when tactical state changes.
6. Human and opponent tactical movement paths follow the same terrain/blocking contracts.
7. No prompt files, prompt schemas, or tactical prompt projection logic are modified.
8. Tests cover happy paths and essential failure contracts only.
9. Tactical ranged attack ranges remain tactical-specific per unit type (including infantry) and are not regressed by this movement-focused change.

---

## 2. Locked implementation rules

1. **Rules source of truth:** Tactical movement behavior must match combat rules §12.4 terrain table and per-unit movement budgets.
2. **Single planner contract:** One tactical movement planner path should serve hover preview, order validation, and movement commit truncation.
3. **Session model parity:** Reuse the strategic pathfinding-session pattern conceptually (precomputed maps + bounded caches + explicit invalidation), but with tactical-specific keys and limits.
4. **No omniscience expansion:** Movement logic may use tactical universal visibility as currently defined, but must not add new cross-mode visibility behavior.
5. **No prompt work:** Do not edit tactical/strategic prompts in this milestone.
6. **Reliability-first fallback:** Caught planner exceptions must produce safe no-path/no-move outcomes and error logs rather than crashes.
7. **Determinism:** Given identical tactical snapshot, unit, and destination, planner result must be stable.
8. **Far-destination contract:** Tactical movement orders continue allowing destinations beyond per-turn budget; execution advances to the planner-derived first legal stop for the turn.
9. **Shared occupancy contract:** Shared occupancy and movement through shared hexes are allowed in tactical movement logic for both traversal and destination endpoints.
10. **Embarked movement contract:** When a land unit is embarked on naval transport, only naval carrier movement restrictions apply.
11. **Session granularity contract:** Tactical planning-session granularity should match strategic game behavior (no stricter per-selected-unit split for this milestone).
12. **Strategic/tactical parity contract:** Strategic and tactical movement/combat logic should remain aligned except where tactical rules intentionally differ (terrain blocking/movement ranges and tactical ranged ranges by unit type).
13. **Session reuse parity contract:** Tactical movement caching must be reused in the same way as strategic for both hover preview and committed order validation.

---

## 3. Tactical session cache design (milestone 2.2 variant)

This milestone intentionally mirrors strategic session-based caching, but with different state dimensions.

### 3.1 Tactical planning session scope

Create tactical planning sessions with the same granularity pattern used by strategic pathfinding sessions: one active planning session per acting player within an active tactical battle, reused across repeated planning interactions and invalidated on the same classes of state changes.

### 3.2 Session contents

1. `res4Set` and tactical adjacency index restricted to enclosing `res1`.
2. Terrain kind lookup per `res4` hex for tactical footprint.
3. Unit occupancy snapshot relevant to tactical movement blocking.
4. Movement-rule lookup tables:
   - per-unit-type terrain costs,
   - blocked terrain predicates,
   - per-turn movement budgets.
5. Bounded planner memoization:
   - destination/path-state memo entries,
   - optional dead-state memo entries for unreachable destinations under current constraints.

### 3.3 Invalidation triggers

Invalidate session when any of the following changes:

1. `battleId` changes or tactical mode exits.
2. `tacticalTurnNumber` increments.
3. Selected-unit signature changes (match strategic-session invalidation behavior).
4. Tactical snapshot unit positions/occupancy change.
5. Terrain metadata or tactical footprint set changes.
6. Acting player perspective changes.
7. Tactical phase transitions out of planning.

### 3.4 Cache limits (initial defaults)

1. Max cached destinations per session: `64`.
2. Max planner memo states per destination: `10,000`.
3. Eviction: LRU by destination, then oldest memo partitions inside destination.

---

## 4. Reliability and maintainability guardrails

1. Add orienting comments to all new/updated non-overriding methods and fields touched by this milestone.
2. New/updated public backend mutating methods must log at debug level with battle/unit/destination context.
3. Getter/query-style methods must log at trace level.
4. All caught exceptions must log at error level with enough context to reproduce (battle id, tactical turn, unit id, source/destination).
5. Keep module sizes manageable; split tactical planner/session internals if files approach preferred size limits.
6. Prefer pure helpers for terrain-cost lookup, state-key generation, and movement-budget accounting.

---

## 5. Phased execution plan (independently verifiable)

### Phase A — Contract lock and baseline capture

Work:

1. Freeze current tactical movement behavior with baseline tests/log counters.
2. Add explicit constants/types for tactical terrain movement costs and blocked rules.
3. Document current tactical movement call chain and identify insertion points for session reuse.

Verification:

1. Existing tactical movement tests still pass unchanged.
2. Build passes.
3. Baseline diagnostics show current call volume for repeated tactical planning interactions.

Dependencies: none.

---

### Phase B — Terrain-cost tactical planner core (isolated)

Work:

1. Implement a tactical path planner that computes least-cost reachable path under:
   - terrain costs by unit type,
   - blocked-terrain constraints,
   - per-turn movement budget.
2. Return rich planner result contracts:
   - reachable this turn,
   - best partial stop within budget,
   - blocked/unreachable reason code.
3. Keep old planner callable temporarily for parity and rollback during migration.

Verification:

1. Unit tests:
   - infantry can traverse mountain at increased cost,
   - armor blocked by mountain/arctic/wetlands,
   - naval restricted to water/coastal,
   - planner chooses valid in-budget path when available,
   - planner returns no-path when all routes violate terrain block rules.
2. Exception-path test verifies safe fallback with error logging.

Dependencies: Phase A.

---

### Phase C — Tactical planning-session integration

Work:

1. Introduce tactical planning session object and builder.
2. Store reusable tactical map/terrain/occupancy indexes.
3. Add bounded destination-state memoization and invalidation hooks.
4. Wire session lifecycle into tactical planning phase flows.

Verification:

1. Session construction tests validate deterministic signatures and cache bounds.
2. Invalidation tests fire on turn increment, occupancy change, and tactical exit.
3. Repeated preview queries show cache hit growth without stale-path regressions.

Dependencies: Phase B.

---

### Phase D — Hover preview cutover to session-backed planner

Work:

1. Route tactical hover movement preview through session-backed terrain-cost planner.
2. Ensure preview reflects blocked terrain and budget truncation accurately.
3. Preserve existing UX contracts for invalid destination feedback.

Verification:

1. Hover tests:
   - valid previews across mixed terrain,
   - blocked terrain returns invalid marker,
   - long-distance destination returns expected first-turn stop behavior.
2. Manual tactical hover stress pass confirms no crashes and stable responsiveness.

Dependencies: Phase C.

---

### Phase E — Order validation and commit-path cutover

Work:

1. Replace tactical movement order validation logic with session-backed planner outputs.
2. Use same planner for human and opponent tactical movement validation.
3. Ensure commit path consumes movement budget-consistent first stop and does not bypass blocked terrain.

Verification:

1. Integration tests:
   - valid orders commit to expected destination/first stop,
   - blocked orders are rejected with clear reason,
   - human/opponent parity on equivalent inputs.
2. Regression tests for embark/disembark interactions continue passing.

Dependencies: Phase D.

---

### Phase F — Hardening, cleanup, and docs

Work:

1. Remove obsolete tactical movement branches no longer required.
2. Tighten logs, orienting comments, and error context.
3. Update this plan document with execution notes and final constraints.
4. Confirm no prompt-related files changed.

Verification:

1. Build and targeted tactical test suite pass.
2. Lint clean for edited files.
3. Manual tactical battle smoke test passes for one representative map.

Dependencies: Phases A–E.

---

## 6. Test matrix (happy paths + essential failure cases)

### 6.1 Happy paths

1. Infantry route crosses mixed land terrain and respects movement budget.
2. Armor route avoids blocked mountain/arctic/wetland terrain when valid alternative exists.
3. Naval route uses only coastal/water path.
4. Session reuse improves repeated tactical preview checks for same battle/turn.
5. Committed tactical movement applies first legal stop when destination exceeds budget.

### 6.2 Essential failure contracts

1. Armor destination requires blocked terrain only -> order rejected.
2. Destination is outside tactical footprint -> rejected.
3. Session invalid after tactical turn advance -> stale cache not reused.
4. Planner internal exception -> error logged and safe no-move behavior returned.
5. Ranged-range regression guard: tactical unit ranges (including infantry) remain tactical values after movement-caching changes.

### 6.3 Explicit non-goals for tests

1. Do not test DTO accessors, trivial delegators, or styling internals.
2. Do not add tests for prompt content or LLM orchestration in this milestone.

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Terrain-cost planner introduces behavior drift across call sites | High | Single shared tactical planner contract + phased cutover with parity tests |
| Stale session cache produces wrong movement results | High | Strict invalidation keys + explicit invalidation tests |
| State-space growth hurts responsiveness | Medium | Bounded memo limits + LRU eviction + diagnostics counters |
| Lower-capability agent edits prompt flow unintentionally | Medium | Lock non-goal: no prompt file edits; add phase gate verification |
| File complexity grows too large in tactical modules | Medium | Early helper extraction and module split guardrail |

---

## 8. Acceptance checklist

- [x] Tactical movement uses §12.4 terrain costs and blocked rules by unit type.
- [x] Tactical planner is session-backed during planning phase.
- [x] Session invalidation covers battle, turn, occupancy, terrain, and phase transitions.
- [x] Hover preview and order validation use the same planner outputs.
- [x] Human and opponent tactical movement validation parity is verified.
- [x] Planner failures degrade safely with error logs (no UI or main-process crash).
- [x] Required debug/trace/error logging exists on new/updated methods.
- [x] Required orienting comments are present.
- [x] No prompt-related files changed.
- [x] Tactical ranged ranges remain unchanged and tactical-specific by unit type.
- [x] Build, targeted tests, and lint checks are green.

---

## 9. Open questions requiring confirmation before implementation

No remaining open questions. The following implementation decisions are confirmed:

1. Tactical movement orders continue allowing far destinations; per-turn execution applies first legal stop behavior.
2. Shared occupancy and movement through shared hexes are allowed for traversal and destination endpoints.
3. Embarked units use only naval-carrier movement restrictions while embarked.
4. Session granularity follows the same pattern used in strategic movement.
5. Movement-session caching reuse follows strategic behavior for both hover preview and committed validation.

---

## 10. Execution notes (completed implementation)

The following shipped in the codebase to satisfy Phases A–F:

1. **§12.4 terrain costs** live in `src/shared/tacticalTerrainMovement.ts` with `planTacticalRes4March` in `src/shared/tacticalRes4MovementPlanner.ts` (Dijkstra on the res4 footprint using enter-hex costs and movement-point budgets).
2. **`normalizeDbTerrainKindToTacticalCategory`** prefers explicit per-cell `terrain_kind` values so a parent res1 `water` aggregate does not mis-classify a child `plains` res4 cell as water for movement.
3. **`TacticalBattleSnapshot`** gains `strategicHexTerrain`, `strategicHexTerrainKind`, and `res4TerrainKindByH3` populated in `computeTacticalBattleSnapshot` so renderer hover and main validation share terrain without extra DB reads.
4. **Session-style memoization**: `src/main/tacticalBattle/tacticalMovementPlanningCache.ts` wraps march planning for validation; `src/shared/tacticalMarchHoverPreview.ts` keeps a renderer-local memo keyed by battle id, tactical turn, sub-unit positions, and `tacticalTerrainLayerSignature` (full res4 override content, not only map size). Bounded LRU: at most 64 memoized `(from,to,type,budget)` entries per session with refresh-on-hit; double planner throws return a safe unreachable plan after error logs.
5. **Embarked cargo**: `tacticalMovementUnitTypeForPathfinding` uses **naval** costs only while the ordered destination equals the current hex (aboard); a march to a **different** hex uses the land unit’s own type so disembark paths use infantry/armor costs.
6. **Movement budgets and tactical ranged ranges** in `src/shared/tacticalRanges.ts` match combat rules §12.4 / §12.5 (infantry 2/5, armor 4/10, naval 3/20, air strike preview cap 99).
7. **Tactical ranged validation** in `validateGroupRangedTarget` uses `RANGED_RANGE_BY_UNIT_TYPE` instead of strategic `getRange` when a tactical battle is active.
8. **Tests**: `tacticalRes4MovementPlanner.test.ts`, `tacticalMovementPlanningCache.test.ts` (terrain signature invalidation + turn reset), updated `tacticalMovementApply.test.ts` (coastal ring terrain helper), and the full `npm test` pipeline.

---

*End of plan.*
