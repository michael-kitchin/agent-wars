# Tactical/Renderer Maintainability Consolidation Execution Plan

*Execution plan for reliable, phased refactoring of tactical and adjacent modules, designed for a lower-capability coding agent with strong guardrails and explicit verification.*

---

## 1. Goal, scope, and success criteria

### 1.1 Goal

Improve maintainability and reliability through targeted consolidation/refactoring across tactical battle, renderer tactical mode, and supporting test utilities without changing gameplay behavior.

### 1.2 Scope

This plan covers 8 specific opportunities (within requested 5-10 range):

1. Consolidate tactical logger semantics into stable helper wrappers.
2. Consolidate tactical order-validation result patterns.
3. Consolidate tactical snapshot mutation guard patterns.
4. Consolidate renderer tactical-mode gate checks.
5. Consolidate tactical IPC result handling in renderer.
6. Consolidate tactical DB test setup fixtures.
7. Decompose large tactical UI flow blocks in `renderer.ts` into focused module(s).
8. Add tactical state-boundary assertions utility reused by main/renderer paths.

### 1.3 Non-goals

1. No gameplay rule changes.
2. No balance changes.
3. No migration of persistent DB schema.
4. No redesign of prompt content or tactical AI behavior.

### 1.4 Success criteria (binary)

1. Existing full test suite remains green (`npm test`).
2. New/updated code paths keep current behavior but reduce duplication and improve readability.
3. Refactored functions have orienting comments consistent with project conventions.
4. Logging policy remains strict: debug for mutators, trace for getters/non-mutators, error for caught exceptions.
5. Each phase can be verified independently, or with previously completed phases only.

---

## 2. Reliability rules for the implementing agent

1. Refactor in small, reviewable batches in the working tree.
2. Never commit or push changes.
3. Do not mix multiple phases in one edit pass.
4. After each phase:
   - run targeted tests first,
   - run lint for touched files,
   - run full `npm test` at phase boundaries called out below.
5. Avoid behavior changes; use extraction/wrapping/decomposition patterns.
6. Prefer pure helpers for shared logic and keep function argument count <= 6 when feasible.
7. Maintain test scope discipline: cover happy paths and essential failures only; avoid tests that lock implementation details.
8. Add or update orienting comments for all new/updated fields and non-overriding methods.
9. If behavior uncertainty appears, stop and ask for clarification before proceeding.

---

## 3. Phase plan

### Phase A - Tactical logging wrapper consolidation

**Opportunity addressed:** #1

**Intent:** Eliminate repeated ad-hoc logger call naming/shape across tactical modules.

**Target files (expected):**
- `src/main/tacticalBattle/tacticalBattleSession.ts`
- `src/main/tacticalBattle/tacticalMovementApply.ts`
- `src/main/tacticalBattle/tacticalCompositeOrdersApply.ts`
- `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts`
- `src/main/tacticalBattle/tacticalRulesAdapter.ts`
- new helper: `src/main/tacticalBattle/tacticalLogging.ts`

**Work:**
1. Add small wrappers like `logTacticalMutate`, `logTacticalQuery`, `logTacticalError` that delegate to existing logger API.
2. Migrate tactical modules to use wrappers.
3. Preserve existing message payload detail.

**Verification:**
- Typecheck/build main.
- Run tactical unit tests:
  - `node dist/main/tacticalBattle/tacticalMovementApply.test.js`
  - `node dist/main/tacticalBattle/tacticalCompositeOrdersApply.test.js`
  - `node dist/main/tacticalBattle/tacticalBattleSession.test.js`

**Exit criteria:** No behavior changes; fewer direct `logDebug/logTrace` imports in tactical modules.

---

### Phase B - Validation-result and rejection-path consolidation

**Opportunity addressed:** #2

**Intent:** Remove repeated `{ valid: false, reason }` boilerplate and improve consistency.

**Target files:**
- `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts`
- new helper: `src/main/tacticalBattle/tacticalValidationResult.ts`

**Work:**
1. Introduce helpers `validResult()`, `invalidResult(reason)` and shared type alias.
2. Replace inline object literals in tactical validation functions.
3. Keep error messages exactly equivalent unless obviously inconsistent/typo-level.

**Verification:**
- `node dist/main/tacticalBattle/tacticalCompositeOrdersApply.test.js`
- `node dist/main/openrouter/tacticalPromptProjection.test.js`
- lint touched files.

**Exit criteria:** No duplicated validation result construction patterns remain in target file.

---

### Phase C - Tactical snapshot mutation guard extraction

**Opportunity addressed:** #3

**Intent:** Centralize repeated guard logic for unknown IDs, off-footprint targets, and ownership checks.

**Target files:**
- `src/main/tacticalBattle/tacticalMovementApply.ts`
- `src/main/tacticalBattle/tacticalCompositeOrdersApply.ts`
- new helper: `src/main/tacticalBattle/tacticalSnapshotGuards.ts`

**Work:**
1. Extract pure helper guards used by both movement and composite apply flows.
2. Keep movement/range semantics unchanged.
3. Keep deterministic ordering and casualty behavior unchanged.

**Verification:**
- `node dist/main/tacticalBattle/tacticalMovementApply.test.js`
- `node dist/main/tacticalBattle/tacticalCompositeOrdersApply.test.js`
- `node dist/main/tacticalBattle/tacticalRulesAdapter.test.js`

**Exit criteria:** Guard duplication reduced; snapshot mutation behavior unchanged.

---

### Phase D - Renderer tactical gate consolidation

**Opportunity addressed:** #4

**Intent:** Consolidate repeated tactical-mode checks and make UI gating easier to reason about.

**Target files:**
- `src/renderer/renderer.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/map/mainMapInteractions.ts`
- new helper: `src/renderer/tactical/tacticalUiGuards.ts`

**Work:**
1. Extract helpers such as `isTacticalModeActive(state)` and `canIssueStrategicAction(state)`.
2. Replace inline checks where tactical mode disables strategic controls.
3. Preserve current tactical disablement behavior exactly.

**Verification:**
- `node dist/main/rendererConsolidation.test.js`
- `node dist/main/gameActionsMultiSelect.test.js`

**Exit criteria:** Central helper used in all key strategic-action gates touched by tactical mode.

---

### Phase E - Tactical IPC handling consolidation in renderer

**Opportunity addressed:** #5

**Intent:** Reduce repeated result-shape handling and error-toast paths for tactical IPC calls.

**Target files:**
- `src/renderer/renderer.ts`
- optional helper: `src/renderer/tactical/tacticalIpcHandlers.ts`

**Work:**
1. Extract handler functions for:
   - start tactical,
   - end tactical,
   - advance tactical turn,
   - tactical AI order apply response usage.
2. Ensure toasts/messages preserve existing semantics.

**Verification:**
- `node dist/main/rendererConsolidation.test.js`
- `node dist/main/gameIpcHandlers.test.js`

**Exit criteria:** Tactical IPC branches in `renderer.ts` are shorter and read as orchestrations.

---

### Phase F - Tactical DB test fixture consolidation

**Opportunity addressed:** #6

**Intent:** Stabilize and simplify tactical DB-backed tests with reusable setup helpers.

**Target files:**
- `src/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.ts`
- `src/main/tacticalBattle/tacticalBattleSession.test.ts`
- new helper: `src/main/tacticalBattle/testSupport/tacticalDbFixture.ts`

**Work:**
1. Add fixture helpers for contested-res1 setup, phase setup, and tactical teardown.
2. Remove duplicate test setup SQL blocks.
3. Keep tests focused on contracts (happy path + essential failures).

**Verification:**
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`
- `node dist/main/tacticalBattle/tacticalBattleSession.test.js`

**Exit criteria:** Tactical DB tests share fixture setup and remain green.

---

### Phase G - Tactical UI orchestration decomposition

**Opportunity addressed:** #7

**Intent:** Reduce complexity in `renderer.ts` tactical sections by moving cohesive logic into focused module(s).

**Target files:**
- `src/renderer/renderer.ts`
- new module candidates:
  - `src/renderer/tactical/tacticalUiOrchestration.ts`
  - `src/renderer/tactical/tacticalExitFlow.ts`

**Work:**
1. Extract tactical enter/exit/advance orchestration functions.
2. Keep exported signatures narrow and explicit.
3. Keep shared state mutation points obvious and documented.

**Verification:**
- `node dist/main/rendererConsolidation.test.js`
- manual smoke: start tactical -> advance tactical turn -> exit tactical.

**Exit criteria:** `renderer.ts` tactical sections become coordination-only, with behavior preserved.

---

### Phase H - Tactical boundary assertion utility

**Opportunity addressed:** #8

**Intent:** Prevent tactical/strategic state leakage with explicit runtime assertions and consistent error context.

**Target files:**
- new helper: `src/shared/tacticalStateAssertions.ts`
- `src/main/tacticalBattle/tacticalBattleSession.ts`
- `src/main/gameIpcHandlers.ts`
- `src/renderer/renderer.ts`

**Work:**
1. Add non-throwing assertion helpers that return structured failure reasons (and optionally log).
2. Use them at boundary points:
   - tactical start/end,
   - tactical order apply,
   - tactical UI transitions.
3. Keep user-visible behavior unchanged (same failure pathways).

**Verification:**
- `node dist/main/gameIpcHandlers.test.js`
- `node dist/main/rendererConsolidation.test.js`
- full `npm test`.

**Exit criteria:** Boundary checks are centralized; no duplicated ad-hoc tactical boundary checks in touched areas.

---

## 4. Verification matrix by phase

1. **A-C complete:** all tactical unit tests green.
2. **D-E complete:** renderer consolidation + IPC handler tests green.
3. **F complete:** tactical DB tests green with fixture helper.
4. **G complete:** renderer consolidation tests + manual tactical smoke pass.
5. **H complete:** full `npm test` green.
6. **Final gate:** no new lints in touched files and no unresolved TODO markers introduced by refactor phases.

---

## 5. Implementation sequencing recommendation

For a lower-capability agent, execute in strict order: **A -> B -> C -> D -> E -> F -> G -> H**.

Rationale:
1. Start with low-risk extraction (logging/results/guards).
2. Move to renderer gating once tactical core is stable.
3. Consolidate tests before larger UI decomposition.
4. Add assertions last so they reflect final control flow.

---

## 6. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Behavior regression from over-eager extraction | High | One phase at a time, run targeted tests after each phase. |
| Logging-level drift from strict policy | Medium | Keep wrappers semantically named (`Mutate` vs `Query`) and map explicitly to debug/trace. |
| Renderer tactical flow breakage | High | Require `rendererConsolidation.test` pass after each renderer phase. |
| DB test brittleness | Medium | Use deterministic fixture helper and avoid random setup in tests. |
| File growth in helpers | Low | Keep each helper focused; split if >600 lines preferred limit. |

---

## 7. Deliverables

1. New helper modules introduced in phases A-H (as needed).
2. Reduced duplication in tactical and renderer tactical code paths.
3. Preserved behavior with passing tests.
4. Updated/added orienting comments on new/updated methods and fields.
5. This execution plan checked off phase-by-phase during implementation.

---

## 8. Confirmed execution decisions

1. **Consolidation depth:** prioritize deepest reasonable consolidation that preserves behavior and reliability constraints.
2. **Helper naming convention:** all newly extracted tactical helpers should use strict `tactical*` prefixes.
3. **Execution implication:** when choosing between shallow extraction and broader unification, prefer broader unification if tests and phase verification remain green.

---

*End of plan.*
