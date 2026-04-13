# Maintainability Consolidation Execution Plan (v3)

*Execution plan for implementing the highest-value next 8 maintainability refactors in reliable, independently verifiable phases suitable for a lower-quality coding agent.*

---

## 1. Goal

Improve maintainability and future change safety by consolidating duplicated logic, strengthening reuse boundaries, and decomposing high-risk hotspots without changing gameplay behavior or public contracts.

This plan prioritizes opportunities that are:

1. specific and low-ambiguity,
2. high-impact in day-to-day development,
3. safe to execute incrementally,
4. easy to verify before progressing.

---

## 2. Non-Negotiable Execution Rules

1. Preserve runtime behavior and public APIs unless this plan explicitly allows a compatibility shim.
2. Prefer extraction plus delegation over rewrites.
3. Keep each phase small and independently verifiable.
4. Logging policy for all new or updated backend methods:
   - debug level for public mutating method invocations,
   - trace level for getter-style read-only methods,
   - error level for every caught exception path with troubleshooting context.
5. Add orienting comments for all new or updated fields and non-overriding methods.
6. Keep tests contract-focused: happy paths and essential failure cases only.
7. Never commit or push as part of this plan's execution.
8. IPC channel migration in this plan uses hard cutover renames with no compatibility aliases.
9. Behavior-risk reduction is prioritized over meeting arbitrary per-phase file-size targets.
10. When sequencing alternatives exist, choose the most reliable path (not the fastest path).
11. Prompt-related decomposition may include formatting churn when it improves clarity and does not break contracts.

---

## 3. Top Opportunities (8)

1. **Centralize IPC channel constants**
   - Target: `src/main/main.ts`, `src/main/preload.ts`, `src/main/gameIpcHandlers.test.ts`, new shared channels module.
   - Value: prevents string drift and typo-based regressions across process boundaries.

2. **Extract tactical commit payload parsing from IPC handler**
   - Target: `game:commitHumanTacticalDraftOrders` handling in `src/main/main.ts`, extraction to `src/main/ipcPayloadGuards.ts`.
   - Value: improves reliability and testability of `unknown` payload normalization.

3. **Consolidate duplicated Ready/melee intercept dependency wiring**
   - Target: `registerIpcHandlers` in `src/main/main.ts`, related types in `src/main/gameIpcHandlers.ts`.
   - Value: one source of truth for shared dependency wiring, less drift risk.

4. **Further decompose renderer composition root**
   - Target: `src/renderer/renderer.ts` and existing extracted renderer modules.
   - Value: reduces high-risk monolith pressure and simplifies UI change safety.

5. **Continue splitting `gameActions` into focused orchestration modules**
   - Target: `src/main/gameActions.ts` and `src/main/game-actions/*`.
   - Value: clearer ownership, less merge conflict surface, easier review.

6. **Split `gameDb` by concern with stable facade**
   - Target: `src/main/gameDb.ts` and `src/main/game-db/*`.
   - Value: isolates persistence domains and reduces accidental coupling.

7. **Further decompose human march preview computation**
   - Target: `src/main/game-actions/humanMarchPreview.ts` and supporting helpers.
   - Value: improves deterministic testing of planning logic and cache behavior.

8. **Further decompose possible unit action assembly**
   - Target: `src/main/openrouter/possibleUnitActions.ts` and related partition/formatter helpers.
   - Value: reduces prompt-contract fragility and formatter duplication.

---

## 4. Phase Plan (independently verifiable)

## Phase 0 - Baseline lock and scope freeze

### Intent

Capture current safety baseline and lock exact phase scope before edits.

### Tasks

1. Run baseline checks.
2. Confirm files and symbols in scope for phases 1-6.
3. Record any pre-existing failures to avoid false attribution.

### Verification

- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `npm test`

### Exit Criteria

- Baseline recorded and understood.
- Scope list frozen for the remaining phases.

---

## Phase 1 - IPC contract hardening and payload parsing extraction

- **Opportunities covered:** 1, 2, 3
- **Intent:** stabilize high-frequency IPC boundaries with low-risk, high-confidence refactors.

### Tasks

1. Introduce a shared IPC channel constant module and replace duplicated string literals in `main`, `preload`, and relevant tests.
2. Extract `game:commitHumanTacticalDraftOrders` payload parsing/normalization from `main.ts` into typed guards in `ipcPayloadGuards.ts`.
3. Extract duplicated Ready/melee intercept dependency wiring into one helper/factory used by both paths.
4. Use hard cutover channel renames where required by the consolidation; execute in one or more sequential batches, and each batch must update all of its affected call sites atomically with no compatibility aliases.

### Verification

- `npm run build:main`
- `npm run lint`
- `node dist/main/gameIpcHandlers.test.js`
- Focused tactical order commit tests (existing plus minimal new parser tests)

### Exit Criteria

- No bare duplicated IPC literals in touched handler paths.
- Tactical commit parsing is in a dedicated testable module.
- Ready/melee shared dependency wiring is single-sourced.

---

## Phase 2 - Renderer composition-root reduction

- **Opportunities covered:** 4
- **Intent:** keep `renderer.ts` as orchestrator/composition root, not logic warehouse.

### Tasks

1. Move one cohesive concern at a time out of `renderer.ts` (for example: draw-stage wiring, interaction policy blocks, or overlay assembly helpers).
2. Keep call ordering and externally visible behavior unchanged.
3. Expand consolidation tests only to lock behaviorally meaningful contracts.

### Verification

- `npm run build:renderer`
- `npm run lint`
- `node dist/main/rendererConsolidation.test.js`
- Manual UI smoke: selection, hover preview, tactical enter/exit, overlay rendering

### Exit Criteria

- `renderer.ts` reduced with clear ownership boundaries.
- Consolidation tests and smoke checks show no behavior drift.

---

## Phase 3 - Main orchestration decomposition (`gameActions`)

- **Opportunities covered:** 5
- **Intent:** reduce complexity by moving orchestration slices to existing `game-actions` modules.

### Tasks

1. Extract coherent action flows from `gameActions.ts` into dedicated modules.
2. Keep `gameActions.ts` as stable facade (delegation and exports).
3. Consolidate duplicated precondition checks and translation helpers where safely possible.

### Verification

- `npm run build:main`
- `npm run lint`
- `node dist/main/game-actions/humanMarchPreview.test.js`
- `node dist/main/gameIpcHandlers.test.js`

### Exit Criteria

- `gameActions.ts` shrinks and reads as a stable entrypoint facade.
- Behavior and exported contracts stay unchanged.

---

## Phase 4 - Database adapter decomposition (`gameDb`)

- **Opportunities covered:** 6
- **Intent:** split persistence concerns into focused adapters behind a stable facade.

### Tasks

1. Continue extracting read/query, write/mutation, and bootstrap/validation concerns from `gameDb.ts`.
2. Keep `gameDb.ts` as facade with explicit delegation.
3. Avoid SQL or data-shape behavior changes while moving code.

### Verification

- `npm run build:main`
- `npm run lint`
- `node dist/main/gameDb.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`

### Exit Criteria

- `gameDb.ts` reduced with clear submodule boundaries.
- Persistence contracts remain stable under existing tests.

---

## Phase 5 - Planning/prompt decomposition hardening

- **Opportunities covered:** 7, 8
- **Intent:** isolate pure computation and formatting policy from adapters and orchestration.

### Tasks

1. Extract pure march preview planning helpers from `humanMarchPreview.ts`.
2. Extract prompt-formatting and action-assembly helpers from `possibleUnitActions.ts`.
3. Keep top-level function signatures and prompt contracts stable.
4. Add orienting comments to all new/updated methods/fields.

### Verification

- `npm run build:main`
- `npm run lint`
- `node dist/main/game-actions/humanMarchPreview.test.js`
- `node dist/main/openrouter/possibleUnitActions.test.js`
- `node dist/main/openrouter/promptContracts.test.js`

### Exit Criteria

- Both modules have clearer pure-core plus adapter boundaries.
- Prompt and preview contracts remain unchanged.

---

## Phase 6 - Stabilization and cleanup gate

### Intent

Run final hardening checks and remove temporary scaffolding that is no longer needed.

### Tasks

1. Remove obsolete compatibility shims introduced during prior phases.
2. Ensure all touched code paths satisfy logging and orienting-comment policies.
3. Confirm file sizes trend downward and no new oversized hotspots are introduced.

### Verification

- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `npm test`

### Exit Criteria

- All checks green.
- No pending cleanup items remain from this plan.

---

## 5. Reliability Checklist (run in every phase)

1. Re-read phase scope before editing.
2. Edit only phase-targeted files.
3. Keep behavior-preserving delegation until cleanup phase.
4. Add required logs/comments as part of each edit, not as a separate sweep.
5. Stop on first unexpected failure and diagnose before continuing.
6. Record: files touched, verification commands run, and observed results.

---

## 6. Test Strategy

### 6.1 Happy Paths

1. Existing IPC flows (ready, intercept, tactical commit) still complete successfully.
2. Renderer interaction and overlay flows behave identically after module extraction.
3. Existing game action and DB flows pass under unchanged contracts.
4. Prompt contract output shape remains valid.

### 6.2 Essential Failure Cases

1. Invalid tactical commit payload rows are rejected/safely normalized with error logs.
2. Caught exception paths in updated modules emit error logs with context.
3. Missing or malformed IPC payload fields fail deterministically and safely.

### 6.3 Explicit Out-of-Scope Tests

1. No tests for trivial DTO/accessor/delegator behavior.
2. No broad end-to-end redesign tests unrelated to targeted consolidations.

---

## 7. Success Definition

This plan is complete when:

1. All 8 opportunities in Section 3 are implemented through phases 0-6.
2. Each phase exit criteria is met before advancing.
3. Full build/lint/tests are green at final gate.
4. Touched modules are clearer, smaller, and easier to reason about.
5. Future developers can locate ownership and extension points quickly without scanning monoliths.

---

## 8. Resolved Execution Decisions

The following owner decisions are finalized and are mandatory for execution:

1. **IPC migration policy:** hard cutover renames are required; no compatibility aliases. Renames may be delivered in multiple sequential batches, but each batch must be internally consistent (all affected call sites updated together).
2. **Renderer decomposition priority:** behavior-risk reduction is the primary goal; no hard per-phase file-size target is required.
3. **DB decomposition sequencing:** choose whichever extraction order yields the most reliable outcomes for each step.
4. **Prompt decomposition churn policy:** formatting churn is acceptable when useful; strict churn minimization is not required.

---

## 9. Phase completion log (2026-04-13)

Verification (Windows): `npm run build:main`, `npm run build:renderer`, `npm run lint`, and full `npm test` **passed** after the work below.

### Phase 0 — Baseline

- Baseline captured: build (main + renderer) and lint **green** before structural edits; full `npm test` run after all phases **green**.

### Phase 1 — IPC, tactical commit parsing, ready deps

- **IPC channels:** Added `src/shared/ipc/channels.ts` (`IPC_GAME`, `IPC_OPENROUTER`). Wired `src/main/main.ts`, `src/main/preload.ts`, and `requestOrdersWithLog` log send to use these constants (no wire-protocol string changes).
- **Tactical commit:** Added `parseHumanTacticalCommitPayload` in `src/main/ipcPayloadGuards.ts`; `main.ts` handler delegates to it. Added `src/main/ipcPayloadGuards.tacticalCommit.test.js` to `package.json` `test` script.
- **Ready / melee deps:** Introduced `buildSharedHumanReadyConsultationDeps` in `main.ts` and reused for `handleGameReady` and `handleResolveMeleeIntercept`.

### Phase 2 — Renderer composition

- Added `src/renderer/rendering/canvasPreviewPolicy.ts` with `shouldDrawCommittedOrderPaths`, `shouldDrawHoveredPathPreview`, and `getCommittedOrderUnitsHiddenDuringPreview`; `renderer.ts` imports these and drops duplicate local implementations.
- Updated `src/main/rendererConsolidation.test.ts` to read policy sources from the new module and to assert `unitsForOrderLines` in `orderOverlayStages` (aligned with current ferry overlay call).

### Phase 3 — `gameActions` decomposition

- Added `src/main/game-actions/tacticalMarchOrderGuards.ts` with `validateHumanMarchOrdersWhenTacticalActive`; removed the inlined copy from `gameActions.ts`.

### Phase 4 — `gameDb` decomposition

- Added `src/main/game-db/canonicalDbPath.ts` with `resolveGameDbFileUnderUserData` (trace log); `gameDb.getCanonicalDbPath` delegates to it. Removed unused `app` import from `gameDb.ts`.

### Phase 5 — Planning / prompt hardening

- **Possible unit actions:** Added `src/main/openrouter/possibleUnitActionsTableAssembly.ts` (row types, bucket labels, `aggregateRows`, markdown table helpers, per-unit row caps). `possibleUnitActions.ts` imports those helpers and keeps hex discovery / indexing only.
- **Mixed land + naval selection:** Added `src/main/game-actions/humanMarchPreviewMixedSelection.ts` with `selectionHasMixedLandAndNaval` and `hexSupportsMixedLandAndNaval` (normalized terrain via `normalizeMovementTerrain`). Wired from `humanMarchPreview.ts` and `gameActions.ts` to remove duplicate implementations.

### Phase 6 — Stabilization

- Fixed `testResolveOneRangedNoReturnFire` in `src/main/tools/tool3CombatEstimation.test.ts` to pass `{ skipReturnFire: true }`, matching the test name and avoiding ambiguous H3 placeholder behavior under `gridDistance`.
- Re-verified after Phase 5: `npm run build:main`, `npm run build:renderer`, `npm run lint`, and full `npm test` **green** (recorded at completion time for this log update).

---

*End of plan.*
