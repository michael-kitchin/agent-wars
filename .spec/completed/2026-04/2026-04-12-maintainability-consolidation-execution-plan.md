# Maintainability Consolidation Execution Plan

*Execution plan to implement the most valuable maintainability refactors in clear, independently verifiable phases for a lower-quality coding agent.*

---

## 1. Goal

Improve maintainability, readability, and reliability by consolidating duplicated logic and decomposing oversized modules, while preserving runtime behavior.

This plan targets the highest-impact opportunities first and keeps each phase independently verifiable.

---

## 2. No-Behavior-Change Constraints

1. Preserve game rules and external behavior unless explicitly called out.
2. Preserve IPC channel names and payload wire contracts unless a compatibility shim exists.
3. Keep logs and orienting comments compliant with project rules:
   - debug for public backend method invocations,
   - error for caught exceptions,
   - trace for getter-style read-only methods.
4. Prefer extraction and delegation over rewrites.
5. Keep each PR/phase small and reversible.
6. Never commit or push changes.

---

## 3. Highest-Value Refactor Opportunities (8)

1. **Decompose `renderer.ts` tactical/tooltip/ready wiring**
   - Why: ~3700+ lines, high coupling, hardest place to make safe changes.
   - Target: `src/renderer/renderer.ts` plus extracted modules under `src/renderer/`.

2. **Split strategic `ready`/`resolveMeleeIntercept` orchestration in `gameActions.ts`**
   - Why: large mixed responsibilities (movement, ranged, melee pause, finalize).
   - Target: `src/main/gameActions.ts`, `src/main/game-actions/*`.

3. **Decompose `gameDb.ts` into focused adapters**
   - Why: ~1500+ lines; DB lifecycle, snapshot assembly, and config concerns mixed.
   - Target: `src/main/gameDb.ts`, new modules under `src/main/game-db/`.

4. **Modularize `ipcTypes.ts`**
   - Why: ~2600+ lines; difficult to safely evolve contracts and docs.
   - Target: `src/shared/ipcTypes.ts` split into feature contract files with barrel export.

5. **Consolidate OpenRouter orchestration boundaries**
   - Why: `openRouter.ts` and `requestOrdersFlow.ts` are very large and intertwined.
   - Target: `src/main/openrouter/openRouter.ts`, `requestOrdersFlow.ts`, new helper modules.

6. **Extract reusable IPC handler result-mapping helpers**
   - Why: `gameIpcHandlers.ts` has repeated payload mapping and consultation wrapping.
   - Target: `src/main/gameIpcHandlers.ts`, new helper modules under `src/main/ipc/`.

7. **Consolidate tactical session persistence lifecycle**
   - Why: persistence/ref/session responsibilities are now spread across multiple files.
   - Target: `src/main/tacticalBattle/tacticalBattleSession.ts`, `tacticalBattlePersistence.ts`, `activeTacticalBattleRef.ts`.

8. **Unify tactical/melee test fixtures and contract test patterns**
   - Why: repeated setup/teardown and contract scaffolding slows safe iteration.
   - Target: `src/main/tacticalBattle/testSupport/*`, melee-related tests, shared helpers.

---

## 4. Execution Phases

## Phase 0 - Baseline safety net and scope lock

**Intent:** Establish guardrails before structural refactors.

**Tasks:**
1. Capture baseline behavior with the current full test suite.
2. List exact symbols/files being moved per phase.
3. Add temporary compatibility exports where needed (barrel re-exports), then remove in later phases.

**Verification:**
- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `npm test`

**Exit criteria:**
- Baseline green and no unplanned behavior changes.

---

## Phase 1 - Renderer tactical/ready decomposition

**Intent:** Reduce risk in the largest frontend module first.

**Primary opportunities covered:** #1

**Tasks:**
1. Extract tactical entry/start/restore orchestration from `renderer.ts` into `src/renderer/tactical/` modules.
2. Extract melee-intercept-ready flow glue into `src/renderer/gameplay/` helpers.
3. Extract terrain/hex popup formatting helpers used by melee intercept into reusable module.
4. Keep `renderer.ts` as composition root only (wiring + imports + callbacks).

**Verification:**
- `npm run build:renderer`
- Targeted renderer-integration tests (existing consolidation tests)
- Manual sanity: Ready modal, Fight/Ignore, tactical auto-start

**Exit criteria:**
- `renderer.ts` materially smaller and behavior unchanged.

---

## Phase 2 - Strategic ready pipeline decomposition

**Intent:** Isolate pause/resume and combat resolution orchestration in main.

**Primary opportunities covered:** #2, partial #8

**Tasks:**
1. Split `gameActions.ts` ready logic into dedicated modules:
   - movement/ranged prep,
   - melee-candidate/pause decision,
   - resume/resolve decision,
   - finalize turn.
2. Keep `ready()`/`resolveMeleeIntercept()` public signatures stable.
3. Centralize shared validation (token, turn-state drift, tactical-active guards).

**Verification:**
- `npm run build:main`
- `node dist/main/combatResolution.test.js`
- `node dist/main/game-actions/meleeInterceptCandidates.test.js`
- `node dist/main/gameIpcHandlers.test.js`

**Exit criteria:**
- `gameActions.ts` reduced and orchestration clearer with no behavior drift.

---

## Phase 3 - DB adapter consolidation

**Intent:** Separate DB lifecycle, snapshot assembly, and config persistence concerns.

**Primary opportunities covered:** #3, partial #7

**Tasks:**
1. Move tactical session merge/persistence DB helpers behind a dedicated adapter module.
2. Extract game-config read/write helpers used by multiple features.
3. Keep `gameDb.ts` public API stable; convert to delegating façade.

**Verification:**
- `npm run build:main`
- `node dist/main/gameDb.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`

**Exit criteria:**
- `gameDb.ts` complexity reduced and tactical persistence paths remain stable.

---

## Phase 4 - Shared IPC type modularization

**Intent:** Reduce risk and maintenance cost of monolithic contract file.

**Primary opportunities covered:** #4

**Tasks:**
1. Split `ipcTypes.ts` into domain files, e.g.:
   - `ipc/gameStateTypes.ts`
   - `ipc/readyTypes.ts`
   - `ipc/ordersTypes.ts`
   - `ipc/tacticalTypes.ts`
2. Export through a stable barrel so imports do not break all at once.
3. Preserve all orienting comments and symbol names.

**Verification:**
- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`

**Exit criteria:**
- No contract behavior changes; easier per-domain contract maintenance.

---

## Phase 5 - OpenRouter boundary refactor

**Intent:** Clarify request orchestration without changing model behavior.

**Primary opportunities covered:** #5

**Tasks:**
1. Extract reusable prompt assembly, tool-loop orchestration, and response parsing boundaries.
2. Consolidate shared validation/result mapping logic.
3. Keep top-level `requestOrders` entrypoint signature unchanged.

**Verification:**
- `npm run build:main`
- `node dist/main/openrouter/openRouter.matrix.test.js`
- `node dist/main/openrouter/promptContracts.test.js`
- `node dist/main/openrouter/possibleUnitActions.test.js`

**Exit criteria:**
- Large OpenRouter files reduced with equivalent behavior and test coverage.

---

## Phase 6 - IPC handler and tactical lifecycle consolidation

**Intent:** Remove repetition and strengthen reliability in critical boundaries.

**Primary opportunities covered:** #6, #7

**Tasks:**
1. Extract common Ready/Resolve result mapping helpers in `gameIpcHandlers`.
2. Consolidate tactical session commit/clear/restore lifecycle into explicit state transition helpers.
3. Ensure expected precondition misses log at debug, true exceptions log at error.

**Verification:**
- `npm run build:main`
- `node dist/main/gameIpcHandlers.test.js`
- `node dist/main/tacticalBattle/tacticalBattleSession.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`

**Exit criteria:**
- Less duplicated mapping code and cleaner tactical lifecycle boundaries.

---

## Phase 7 - Test fixture consolidation and final regression pass

**Intent:** Make future maintenance safer and cheaper.

**Primary opportunities covered:** #8

**Tasks:**
1. Consolidate repeated melee/tactical fixture setup into shared helpers.
2. Normalize contract-test style for ready/resolve/intercept behavior.
3. Remove temporary compatibility shims introduced in earlier phases (if safe).

**Verification:**
- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `npm test`

**Exit criteria:**
- Full suite green and reduced test duplication.

---

## 5. Reliability Checklist for Each Phase

For every phase, the implementing agent must:

1. Move one logical slice at a time; avoid mixed refactor + behavior edits.
2. Preserve imports/exports with transitional shims if needed.
3. Add or update orienting comments for all new/updated fields and non-overriding methods.
4. Keep logs aligned with policy (debug/error/trace as required).
5. Run phase-specific verification commands before proceeding.
6. If a phase fails, stop and fix before starting the next phase.

---

## 6. Suggested Delivery Cadence

1. Phase 0 + 1 in one iteration.
2. Phase 2 + 3 in one iteration.
3. Phase 4 standalone (contract risk isolation).
4. Phase 5 + 6 in one iteration.
5. Phase 7 as stabilization pass.

---

## 7. Success Definition

This consolidation effort is complete when:

1. The 8 opportunities above are implemented.
2. Each phase exit criteria is satisfied in order.
3. No feature regressions are observed in Ready/melee/tactical flows.
4. Full lint/build/tests pass.
5. The resulting code is easier to navigate, with smaller files and clearer boundaries for future developers.

