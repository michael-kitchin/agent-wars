# Strategic/Tactical Parity Maintainability Execution Plan

*Execution plan to implement high-value strategic/tactical consolidations in reliable, independently verifiable phases for a lower-capability coding agent.*

---

## 1. Goal

Improve maintainability by consolidating duplicated strategic/tactical behavior into shared, testable helpers while preserving gameplay behavior and UI contracts.

This plan prioritizes the most useful and reliable consolidation opportunities observed in recent parity work (selection, planning previews, pending-order display, and tactical-ready flow).

---

## 2. Strict constraints (no behavior drift)

1. Preserve existing strategic behavior exactly unless a phase explicitly states tactical parity correction.
2. Preserve IPC channel names and payload contracts unless a compatibility shim is added.
3. Preserve user-facing wording unless correcting obvious typo/inconsistency.
4. Keep logs policy-compliant:
   - debug: public backend mutating entrypoints,
   - trace: read-only/getter-style methods,
   - error: every caught exception path.
5. Prefer extraction and delegation over rewrites.
6. Keep all new/updated fields and non-overriding methods documented with orienting comments.
7. Never commit or push.

---

## 3. Highest-value consolidations (8)

1. **Shared human march preview builder for strategic + tactical**
   - Consolidate path preview shape construction (`HumanOrderGroupPreviewResult`) into reusable helpers.
   - Tactical should use the same segment semantics as strategic (solid current turn, dashed continuation).

2. **Shared pending movement label formatter**
   - Unify tactical/strategic label contracts (`Nh (status)` style) and avoid divergent ad-hoc formatting.

3. **Shared renderer order-overlay pipeline**
   - Consolidate draw ordering rules (committed lines, preview lines, pending ranged/air/ferry, units) so tactical and strategic cannot diverge silently.

4. **Shared click-selection policy**
   - Centralize single-click, ctrl-click, timeout behavior, right-click clearing, and double-click planning behavior.

5. **Draft-vs-committed tactical position boundary helper**
   - Replace scattered tactical “effective position” decisions with explicit APIs:
     - committed position (for selection/planning),
     - draft destination (for pending order display only).

6. **Shared tactical/strategic movement validation adapter**
   - Consolidate “can plan route to destination” checks and shared rejection reason mapping while preserving per-mode geometry (res1/res4).

7. **Shared parity contract tests**
   - Add tests that assert tactical mirrors strategic contracts for:
     - preview shape,
     - selection and double-click semantics,
     - pending list formatting,
     - overlay draw ordering.

8. **Shared parity diagnostics hooks**
   - Add lightweight trace/debug instrumentation around parity-sensitive boundaries to simplify future regressions.

---

## 4. Execution phases

## Phase 0 - Baseline and scope lock

**Intent:** Establish a hard baseline before further consolidation.

**Tasks**
1. Capture current behavior with build, lint, and full tests.
2. Enumerate every parity-sensitive function touched by this plan.
3. Freeze expected tactical-vs-strategic contracts in a short checklist embedded in this file.

**Verification**
- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `npm test`

**Exit criteria**
- Baseline green and parity checklist approved.

---

## Phase 1 - Consolidate shared movement preview construction

**Consolidations covered:** #1, #6 (partial)

**Intent:** Move preview construction into shared pure helpers, with mode-specific adapters for geometry/range.

**Primary targets**
- `src/shared/ipc/humanOrderPreviewTypes.ts`
- `src/shared/tacticalMarchHoverPreview.ts`
- `src/main/game-actions/humanMarchPreview.ts`
- new shared module(s) under `src/shared/` (for reusable preview assembly primitives)

**Tasks**
1. Extract common preview assembly primitives:
   - representative-by-origin collapse,
   - segment/arrow shape formatting,
   - invalid reason projection.
2. Keep strategic adapter authoritative for strategic behavior.
3. Keep tactical adapter authoritative for res4 legality and footprint checks.
4. Ensure both adapters output identical shape semantics.

**Verification**
- `node dist/main/game-actions/humanMarchPreview.test.js`
- `node dist/main/gameActionsMultiSelect.test.js`
- `node dist/main/tacticalMarchHoverPreview.test.js`

**Exit criteria**
- Strategic/tactical preview assembly shares core primitives.
- No behavior regressions in preview tests.

---

## Phase 2 - Consolidate pending-order label formatting

**Consolidations covered:** #2

**Intent:** Eliminate divergent tactical/strategic pending movement label logic.

**Primary targets**
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/gameplay/orderLabelFormatting.ts`
- `src/shared/tacticalMarchHoverPreview.ts` (or extracted shared label helper module)

**Tasks**
1. Create a single formatter contract for movement pending labels.
2. Keep tactical status wording intentionally mapped to strategic-style status tokens.
3. Remove direct ad-hoc tactical label string construction.

**Verification**
- Targeted unit tests for formatter outputs (happy + essential invalid inputs).
- `node dist/main/rendererConsolidation.test.js`

**Exit criteria**
- One movement-label formatter path for both modes.

---

## Phase 3 - Consolidate tactical committed-vs-draft position boundaries

**Consolidations covered:** #5

**Intent:** Prevent parity regressions by making tactical position semantics explicit and centralized.

**Primary targets**
- `src/renderer/tactical/tacticalDraftMarchOverlay.ts`
- `src/renderer/core/selection.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/renderer.ts`

**Tasks**
1. Provide explicit helper names for:
   - committed position lookup,
   - draft destination lookup,
   - display-only pending destination.
2. Replace mixed direct reads of `subUnits[].h3Index` and draft overlays with explicit helper calls.
3. Preserve intended behavior:
   - planning does not relocate committed units,
   - pending lines/labels reflect planned destinations.

**Verification**
- `node dist/main/rendererConsolidation.test.js`
- Manual tactical checks:
  - click selection and ctrl multi-select,
  - right-click clear,
  - double-click creates draft only.

**Exit criteria**
- No ambiguous “effective position” usage in renderer tactical planning paths.

---

## Phase 4 - Consolidate shared click and planning interaction policy

**Consolidations covered:** #4

**Intent:** Centralize interaction semantics so strategic and tactical cannot drift.

**Primary targets**
- `src/renderer/map/mainMapInteractions.ts`
- new module under `src/renderer/map/` or `src/renderer/core/` for shared interaction policy

**Tasks**
1. Extract shared handlers/policy helpers for:
   - single-click select timing,
   - ctrl toggle selection,
   - double-click planning intent,
   - context-menu clear behavior.
2. Keep mode-specific behaviors parameterized (res1 vs res4 hit-testing).
3. Ensure tactical double-click never implies committed movement before Ready.

**Verification**
- Add/extend focused tests covering tactical/strategic parity for click semantics.
- `node dist/main/rendererConsolidation.test.js`

**Exit criteria**
- Single policy module governs strategic+tactical click behavior with mode adapters.

---

## Phase 5 - Consolidate shared overlay draw pipeline

**Consolidations covered:** #3

**Intent:** Ensure overlay draw ordering is one composition pipeline with mode-specific data providers.

**Primary targets**
- `src/renderer/renderer.ts`
- `src/renderer/rendering/pathDrawing.ts`
- `src/renderer/rendering/hoverPreview.ts`
- `src/renderer/rendering/orderDrawing.ts`

**Tasks**
1. Extract shared overlay staging function(s):
   - committed lines stage,
   - hover preview stage,
   - pending support order stage,
   - unit stage.
2. Keep tactical and strategic differences only in data providers.
3. Preserve visual alpha and line-style contracts.

**Verification**
- `node dist/main/rendererConsolidation.test.js`
- Manual visual parity checks:
  - strategic preview,
  - tactical preview (near + far target),
  - pending march lines solid/dashed.

**Exit criteria**
- Tactical/strategic render flow shares a common overlay pipeline.

---

## Phase 6 - Consolidate parity contract test suite

**Consolidations covered:** #7

**Intent:** Add targeted parity contract tests to prevent regressions by lower-quality agents.

**Primary targets**
- `src/main/rendererConsolidation.test.ts`
- `src/main/tacticalMarchHoverPreview.test.ts`
- new parity-focused tests under `src/main/` if needed

**Tasks**
1. Add explicit tests for:
   - shared preview shape semantics,
   - tactical far-destination preview validity/segment continuation,
   - tactical pending labels using shared formatter contract,
   - tactical double-click creates draft only (no committed move).
2. Keep tests contract-level (no brittle implementation snapshots).

**Verification**
- `node dist/main/rendererConsolidation.test.js`
- `node dist/main/tacticalMarchHoverPreview.test.js`
- relevant tactical session tests if touched.

**Exit criteria**
- Parity regressions become test-detectable at contract boundaries.

---

## Phase 7 - Consolidate parity diagnostics and final regression

**Consolidations covered:** #8 and stabilization

**Intent:** Improve diagnosability and complete full-regression validation.

**Primary targets**
- tactical/renderer modules touched in phases 1-6

**Tasks**
1. Add/normalize trace/debug diagnostics around parity-sensitive decision points:
   - preview build mode and selected unit counts,
   - double-click planning path decisions,
   - tactical committed-vs-draft position source selection.
2. Ensure caught exceptions are error-logged with context.
3. Remove temporary compatibility helpers not needed after final consolidation.

**Verification**
- `npm run build:main`
- `npm run build:renderer`
- `npm run lint`
- `npm test`

**Exit criteria**
- Full suite green, no temporary shims left, diagnostics are clear and non-noisy.

---

## 5. Reliability checklist for each phase

For every phase, the implementing agent must:

1. Change one logical slice only; avoid mixed refactor + rule edits.
2. Keep public API contracts stable or add temporary shims.
3. Update orienting comments for new/updated fields and non-overriding methods.
4. Keep logging policy compliant.
5. Run only the phase’s verification commands before moving on.
6. Stop and fix failing checks before starting the next phase.
7. Record a short phase completion note in this file (date, files touched, verification outputs).

---

## 6. Tactical/strategic parity checklist (scope lock)

The following behaviors are treated as non-negotiable parity contracts:

1. Single-click selection behavior is consistent across modes.
2. Ctrl multi-select behavior is consistent across modes.
3. Right-click clears selection/preview consistently.
4. Double-click creates plans (not committed movement) in both modes.
5. Hover preview supports current+future turns with solid/dashed semantics.
6. Pending movement list uses the same distance/status style in both modes.
7. Tactical keeps res4/sub-unit geometry while matching strategic UX semantics.

---

## 7. Decision status

All previously open execution questions are resolved. Implementing agents must follow Section 8 and should not re-open these decisions unless new requirements are introduced by the project owner.

---

## 8. Resolved execution decisions

The following decisions are finalized by the project owner and should be treated as requirements:

1. **Tactical pending movement labels:** Tactical pending movement must match the strategic equivalent label contract, using res4-hex distances instead of res1 distances.
2. **Verification artifacts:** Textual verification notes are sufficient; screenshot artifacts are not required.
3. **Renaming policy:** Internal helper/module renames are allowed and encouraged when they improve maintainability, as long as public contracts and behavior remain stable.

---

## 9. Phase completion log (implementation)

Verification on **2026-04-12** (Windows): `npm run build:main`, `npm run build:renderer`, `npm run lint`, and full `npm test` all **passed** after the work below.

### Phase 0 — Baseline and scope lock

- Baseline re-validated at end of Phase 7 via full build, lint, and `npm test`.
- Parity checklist remains Section 6; resolved decisions remain Section 8.

### Phase 1 — Shared movement preview construction

- Added `src/shared/humanMarchPreviewGroupAssembly.ts`; strategic `humanMarchPreview.ts` and tactical `tacticalMarchHoverPreview.ts` delegate to shared assembly for envelope/segment semantics and unit-id collapse.

### Phase 2 — Pending-order label formatting

- Added `src/shared/pendingMovementSidebarLabels.ts` (`formatPendingMovementSidebarTargetLabel`, `formatTacticalDraftMarchPendingOrderTargetLabel`, `TACTICAL_DRAFT_MARCH_DISPLAY_STATUS` = `en_route` aligned with strategic default).
- Renderer `sidebarSupport.ts` uses shared formatters; tactical pending rows use res4 `gridDistance` via the shared tactical helper.

### Phase 3 — Tactical committed vs draft position boundaries

- `src/renderer/tactical/tacticalDraftMarchOverlay.ts` exposes explicit committed/draft/display helpers; call sites updated to use them instead of ad hoc `h3Index` reads.

### Phase 4 — Shared click / selection policy

- Added `src/renderer/map/mapClickSelectionPolicy.ts`; `mainMapInteractions.ts` delegates human unit icon selection and timer teardown to it (strategic + tactical paths).

### Phase 5 — Shared overlay draw pipeline

- Added `src/renderer/rendering/orderOverlayStages.ts` (`drawPendingSupportOrderOverlays`, `drawMarchHoverPreviewStageIfEnabled`); `renderer.ts` tactical and strategic `drawGameScene` branches both call these stages.
- `pathDrawing.ts` tactical pending march lines use shared movement-range helper where applicable.

### Phase 6 — Parity contract tests

- `src/main/tacticalMarchHoverPreview.test.ts` updated for shared pending label + `en_route` contract.
- New `src/main/pendingMovementSidebarLabels.test.js` (via `pendingMovementSidebarLabels.test.ts`) wired into `package.json` `test` script.
- `src/main/rendererConsolidation.test.ts` extended for overlay pipeline wiring, main-map selection policy delegation, ferry overlay routing through `orderOverlayStages`, and hover preview staging assertions.

### Phase 7 — Diagnostics and final regression

- **Diagnostics implemented:** Added opt-in parity breadcrumbs in renderer via `src/renderer/core/parityDiagnostics.ts` (enable with `localStorage['agentWarsParityDiagnostics']='1'`), wired at:
  - double-click planning decision boundaries (`mainMapInteractions.ts`),
  - deferred single-click / ctrl-toggle selection policy boundaries (`mapClickSelectionPolicy.ts`),
  - tactical draft-vs-committed position source selection (`tacticalDraftMarchOverlay.ts`).
- **Main-process diagnostics:** Added explicit strategic preview build debug summaries in `src/main/game-actions/humanMarchPreview.ts` (request, mixed-domain rejection, and outcome details).
- Full regression: same verification block as Phase 0; all green on 2026-04-12 and re-validated after Phase 7 diagnostics wiring.

