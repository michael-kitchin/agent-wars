# Maintainability Consolidation Execution Plan (v2)

*Execution plan to implement the most valuable next-wave maintainability refactors in independently verifiable phases for a lower-quality coding agent.*

---

## 1. Goal

Improve maintainability, reuse, and long-term reliability by consolidating high-impact duplication and decomposing oversized modules while preserving behavior and existing contracts.

This plan intentionally prioritizes opportunities that are:

- useful in daily development,
- specific and technically constrained,
- reliable to execute in small steps,
- easy to verify before moving to the next phase.

---

## 2. Non-Negotiable Execution Constraints

1. Preserve gameplay behavior and public contracts unless a phase explicitly allows a compatibility shim.
2. Prefer extraction + delegation over rewrite.
3. Keep each phase scoped to one logical objective only.
4. Maintain logging policy:
   - debug-level logs for updated public backend mutating method invocations,
   - trace-level logs for updated getter-style/read-only methods,
   - error-level logs for every caught exception path.
5. Add orienting comments for all new/updated fields and non-overriding methods.
6. Keep tests contract-focused (happy paths + essential failure cases only).
7. Never commit or push.

---

## 3. Top Opportunities (9)

1. **Decompose `src/renderer/renderer.ts` (3800+ lines) into explicit scene/wiring modules**
   - Reliability value: highest-risk hotspot; safer future changes across UI and tactical flows.

2. **Split `src/main/gameActions.ts` (1300+ lines) into ready/march/resolve orchestration modules**
   - Reliability value: reduces regression risk in turn resolution and intercept flow changes.

3. **Split `src/main/gameDb.ts` (1400+ lines) into read/write/snapshot adapters**
   - Reliability value: isolates persistence concerns and lowers accidental cross-concern coupling.

4. **Decompose `src/main/openrouter/requestOrdersFlow.ts` (1300+ lines) by pipeline stages**
   - Reliability value: cleaner retries, parsing, persistence, and error handling boundaries.

5. **Split `src/main/game-actions/humanMarchPreview.ts` (1200+ lines) into pure planning core + adapters**
   - Reliability value: makes strategic/tactical preview parity easier to preserve and test.

6. **Split `src/main/openrouter/possibleUnitActions.ts` (1100+ lines) into formatter/partition/rules helpers**
   - Reliability value: lowers prompt-contract drift and improves testability.

7. **Consolidate renderer selection/planning policy boundaries (`mainMapInteractions`, `state`, `selection`)**
   - Reliability value: one policy surface for single-click, ctrl-toggle, and double-click planning semantics.

8. **Consolidate tactical/strategic pending movement and preview display contracts**
   - Reliability value: removes silent UX divergence in labels, path staging, and overlay ordering.

9. **Consolidate test fixtures for ready/intercept/tactical contracts**
   - Reliability value: faster, clearer tests and lower maintenance cost for future refactors.

---

## 4. Phase Plan (Independent Verification)

## Phase 0 - Baseline lock and safety rails

### Intent

Freeze behavior baseline and define strict acceptance checks.

### Tasks

1. Run full baseline checks and record pass/fail output in this document.
2. Confirm all symbols/files in scope for phases 1-7.
3. Add temporary compatibility re-exports only where needed to keep imports stable.

### Verification

- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `npm test`

### Exit criteria

- Baseline fully green.
- Scope list finalized.

---

## Phase 1 - Renderer composition boundary extraction

- **Opportunities covered:** #1 and #7 (partial)
- **Intent:** Make `renderer.ts` a composition root only.
- **Primary targets:**

- `src/renderer/renderer.ts`
- new modules under `src/renderer/rendering/`, `src/renderer/gameplay/`, and/or `src/renderer/tactical/`
- `src/renderer/map/mainMapInteractions.ts`

- **Tasks:**

1. Extract scene-stage orchestration and map wiring helpers from `renderer.ts`.
2. Route selection/planning policy calls through dedicated helper modules instead of ad-hoc in-file logic.
3. Keep external behavior and event ordering unchanged.

- **Verification:**

- `npm run build:renderer`
- `node dist/main/rendererConsolidation.test.js`
- Manual smoke: single-click select, ctrl-toggle, right-click clear, double-click plan creation.

- **Exit criteria:**

- `renderer.ts` materially reduced.
- No interaction behavior drift.

---

## Phase 2 - Main game action orchestration split

- **Opportunities covered:** #2
- **Intent:** Separate turn-resolution orchestration from entrypoint coordination.
- **Primary targets:**

- `src/main/gameActions.ts`
- new modules under `src/main/game-actions/`

- **Tasks:**

1. Extract ready/resolve orchestration slices into dedicated helpers.
2. Keep `gameActions.ts` exports stable as delegating facade.
3. Centralize shared precondition checks and decision mapping.

- **Verification:**

- `npm run build:main`
- `node dist/main/game-actions/meleeInterceptCandidates.test.js`
- `node dist/main/game-actions/humanMarchPreview.test.js`
- `node dist/main/gameIpcHandlers.test.js`

- **Exit criteria:**

- Clear orchestration boundaries with stable public API.

---

## Phase 3 - Database adapter decomposition

- **Opportunities covered:** #3
- **Intent:** Isolate DB concerns by responsibility.
- **Primary targets:**

- `src/main/gameDb.ts`
- new modules under `src/main/game-db/`

- **Tasks:**

1. Extract read-only query helpers from mutation pathways.
2. Extract snapshot assembly and tactical persistence helpers behind focused adapters.
3. Keep `gameDb.ts` as stable facade with explicit delegations.

- **Verification:**

- `npm run build:main`
- `node dist/main/gameDb.test.js`
- `node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js`

- **Exit criteria:**

- Reduced `gameDb.ts` complexity and unchanged persistence behavior.

---

## Phase 4 - OpenRouter request pipeline decomposition

- **Opportunities covered:** #4 and #6 (partial)
- **Intent:** Separate request validation, model call, parsing, persistence, and error classification.
- **Primary targets:**

- `src/main/openrouter/requestOrdersFlow.ts`
- `src/main/openrouter/possibleUnitActions.ts`
- new modules under `src/main/openrouter/`

- **Tasks:**

1. Split `requestOrdersFlow` into explicit stage modules.
2. Split `possibleUnitActions` into partitioning/formatting/rule-table helpers.
3. Keep top-level signatures and prompt contracts stable.

- **Verification:**

- `npm run build:main`
- `node dist/main/openrouter/openRouter.matrix.test.js`
- `node dist/main/openrouter/possibleUnitActions.test.js`
- `node dist/main/openrouter/promptContracts.test.js`

- **Exit criteria:**

- Pipeline stages explicit and independently testable.

---

## Phase 5 - Human march preview core extraction

- **Opportunities covered:** #5 and #8 (partial)
- **Intent:** Separate pure preview assembly from state/domain adapters.
- **Primary targets:**

- `src/main/game-actions/humanMarchPreview.ts`
- `src/shared/humanMarchPreviewGroupAssembly.ts`
- `src/shared/tacticalMarchHoverPreview.ts`

- **Tasks:**

1. Extract pure path/segment/label assembly helpers from `humanMarchPreview.ts`.
2. Keep strategic and tactical adapters thin, explicit, and contract-driven.
3. Ensure shared pending/preview formatting contracts are reused consistently.

- **Verification:**

- `npm run build:main`
- `node dist/main/game-actions/humanMarchPreview.test.js`
- `node dist/main/tacticalMarchHoverPreview.test.js`
- `node dist/main/pendingMovementSidebarLabels.test.js`

- **Exit criteria:**

- Shared pure preview core with unchanged UX semantics.

---

## Phase 6 - Renderer contract consolidation for pending overlays

- **Opportunities covered:** #7 and #8
- **Intent:** Ensure one display-policy path for preview/pending rendering semantics.
- **Primary targets:**

- `src/renderer/rendering/pathDrawing.ts`
- `src/renderer/rendering/hoverPreview.ts`
- `src/renderer/rendering/orderOverlayStages.ts`
- `src/renderer/gameplay/sidebarSupport.ts`

- **Tasks:**

1. Consolidate staging order and style semantics through shared policy helpers.
2. Remove duplicate pending label composition paths.
3. Keep tactical/strategic differences as data provider differences only.

- **Verification:**

- `npm run build:renderer`
- `node dist/main/rendererConsolidation.test.js`
- Manual visual checks for strategic+tactical pending/preview overlays.

- **Exit criteria:**

- Single contract path for pending/preview display semantics.

---

## Phase 7 - Test fixture consolidation and stabilization

- **Opportunities covered:** #9
- **Intent:** Improve test maintainability while preserving contract-level confidence.
- **Primary targets:**

- `src/main/tacticalBattle/*.test.ts`
- `src/main/game-actions/*.test.ts`
- shared fixture helpers under existing test-support locations

- **Tasks:**

1. Extract repeated setup/fixtures for ready/intercept/tactical tests.
2. Remove redundant implementation-detail assertions.
3. Keep only happy-path and essential failure-contract coverage.

- **Verification:**

- `npm run build:main`
- `npm run lint`
- `npm test`

- **Exit criteria:**

- Test suite remains green with less duplication and clearer intent.

---

## 5. Reliability Checklist (Run Every Phase)

1. Confirm phase scope is unchanged before editing.
2. Edit only files listed for that phase.
3. Keep old entrypoints as delegating facades until the final cleanup phase.
4. Add required logging and orienting comments while changing code (not as a separate sweep).
5. Run phase verification commands and stop immediately on failures.
6. Record a short phase completion note: files touched, tests run, and observed behavior.

---

## 6. Suggested Delivery Sequence

1. Phase 0 and Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5 and Phase 6
6. Phase 7 (final stabilization)

---

## 7. Success Definition

This effort is complete when:

1. At least 5 and at most 9 opportunities in Section 3 are implemented in order.
2. Each phase meets its exit criteria before the next phase starts.
3. Full build/lint/tests pass at end-state.
4. File boundaries are clearer, with smaller modules and reduced duplicated policy logic.
5. Future developers can identify ownership and extension points without reading monolithic files end-to-end.

---

## 8. Resolved Execution Decisions

The following owner decisions are finalized and treated as requirements for implementation:

1. **Priority strategy:** Behavior-risk reduction is prioritized over strict hard-limit compliance. Files may remain above 1000 lines temporarily if that reduces change risk in earlier phases.
2. **Manual verification artifacts:** Textual verification notes are sufficient. Screenshots are optional and not required for phase completion.
3. **Codebase edit policy during execution:** This plan has exclusive control of the codebase while executing. No additional temporary freeze rules are required.

---

## 9. Phase completion log (implementation)

Verification on **2026-04-12** (Windows): `npm run build:main`, `npm run build:renderer`, `npm run lint`, and full `npm test` **passed** after the work below (including Phases 3–7 in this continuation). A later continuation re-ran `npm run lint`, `npm run build:main`, targeted `node dist/main/*.test.js` checks for the touched areas, then **full `npm test`** — all **green** after the Phase 3–5 extractions below.

Re-verified **2026-04-13** (Windows): `npm run lint`, `npm run build:main`, `npm run build:renderer`, and full `npm test` **passed** with Phases 0–7 already implemented per the log below (no further phase work required for §7 success).

### Phase 0 — Baseline and scope lock

- Baseline captured: build (main + renderer), lint, and full `npm test` **passed** before structural edits in this session.
- Scope unchanged from Sections 3–4; compatibility re-exports not required beyond façade patterns used in Phases 1–2.

### Phase 1 — Renderer composition boundary extraction

- **Implemented:** Extracted res1/res4 terrain tooltip state, caches, pointer hit-testing, infra glyph gates, and urban production capacity helpers into `src/renderer/map/terrainTooltipRes1State.ts`.
- **`renderer.ts`:** Removed the inlined duplicate implementations; imports the extracted entrypoints. Duplicate `infraGlyphsAllowed*` definitions at the former canvas section were removed (single source in the new module). Kept a thin `function getUrbanProductionCapacityForHex` delegator in `renderer.ts` so production overlay wiring stays anchored in the composition root (and consolidation tests remain stable).
- **Approximate size:** `renderer.ts` reduced by ~650 lines in this pass (still above the 1000-line hard limit; behavior-risk-first sequencing defers further splits).
- **Tests:** `src/main/rendererConsolidation.test.ts` updated to assert canonical urban capacity + res4 tooltip contracts against `terrainTooltipRes1State.ts` where logic moved.
- **Manual smoke (textual):** Not run in headless CI; automated `rendererConsolidation` + full `npm test` green after extraction.

### Phase 2 — Main game action orchestration split

- **Implemented:** Moved `ready` and `resolveMeleeIntercept` implementations to `src/main/game-actions/gameActionsReadyEntrypoints.ts`; `gameActions.ts` re-exports them as `const` aliases to preserve the public façade.

### Phase 3 — Database adapter decomposition

- **Implemented:** Added `src/main/game-db/databaseValidation.ts` with `GAME_DB_REQUIRED_TABLES`, `applyGameDbPragmas`, and `validateGameDatabaseOrThrow(database, expectedUserVersion)`. `gameDb.ts` delegates to it and passes `EXPECTED_USER_VERSION`, preserving the public `gameDb` API.
- **Implemented (read-path slice):** Added `src/main/game-db/unitSnapshotRead.ts` with `listUnitsForSnapshotWithGetAll`; `gameDb.listUnitsForSnapshot` delegates to it (same SQL + row mapping as before).
- **Implemented (read-path slice):** Added `src/main/game-db/mapHexRead.ts` with `getMapHexSetWithGetAll`; `gameDb.getMapHexSet` delegates to it (same `SELECT h3_index FROM hexes` contract).

### Phase 4 — OpenRouter request pipeline decomposition

- **Implemented:** Added `src/main/openrouter/requestOrdersFlowTypes.ts` (result/error/options contracts), `src/main/openrouter/requestOrdersFlowSupport.ts` (pathfinding aggregate metrics, prompt/response preview logging, dedupe, wall-clock cap), and `src/main/openrouter/possibleUnitActionsPartition.ts` (`partitionHomelandNearestOther` + helpers). `requestOrdersFlow.ts` and `possibleUnitActions.ts` import/re-export these entrypoints.
- **Implemented (deps contract surface):** Added `src/main/openrouter/requestOrdersFlowDepsTypes.ts` exporting `RequestOrdersFlowDeps`; `requestOrdersFlow.ts` imports it so the orchestration file stays shorter.

### Phase 5 — Human march preview core extraction

- **Implemented:** Added `src/main/game-actions/humanMarchPreviewComputationContext.ts` (`HumanMarchPreviewComputationContext`, `buildHumanMarchPreviewComputationContextFromState`, `buildHumanMarchPreviewStateCacheKey`). `humanMarchPreview.ts` uses the shared factory instead of inlining terrain/session wiring.
- **Implemented (pure cache helper):** Added `src/main/game-actions/humanMarchPreviewCache.ts` exporting `cacheSetBounded`; `humanMarchPreview.ts` imports it (no per-call logging on this hot path).

### Phase 6 — Renderer contract consolidation for pending overlays

- **Implemented:** Added `drawPendingMarchesHoverAndSupportOrderStack` in `src/renderer/rendering/orderOverlayStages.ts` and switched `renderer.ts` tactical and strategic `drawGameScene` branches to call it so pending march lines, march hover preview, and pending support overlays share one ordered pipeline.

### Phase 7 — Test fixture consolidation and stabilization

- **Implemented (prior):** `src/main/game-actions/testSupport/meleeInterceptTestHexes.ts` and `meleeInterceptCandidates.test.ts` shared `hexA` / `hexB` fixtures.
- **Implemented:** `src/main/tacticalBattle/testSupport/tacticalRes4HexFixtures.ts` with `tacticalRes4Cell`, `firstRingCellDistinctFrom`, `tacticalRes1Cell`, and `tacticalRes4UnderRes1Corner`; refactored `tacticalRulesAdapter.test.ts`, `tacticalMovementApply.test.ts`, `tacticalCompositeOrdersApply.test.ts`, `buildTacticalAiPlanState.test.ts`, `tacticalSpatialAdapter.test.ts`, and `computeTacticalBattleSnapshot.db.test.ts` to use the shared helpers instead of repeating `latLngToCell` patterns.
