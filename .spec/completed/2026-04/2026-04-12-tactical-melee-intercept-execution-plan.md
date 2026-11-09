# Tactical Melee Intercept Execution Plan

*Execution plan for implementing tactical-melee interception with a pre-melee selection dialog, designed for reliable execution by a lower-capability coding agent.*

---

## 1. Goal and requested behavior

Implement a strategic-turn enhancement where, just before melee resolution:

1. The game identifies hexes that will have melee combat this turn.
2. If any exist, the renderer shows a modal with those hexes.
3. The modal rows include:
   - an exclusive selector (radio-style checkbox behavior),
   - hex description/features formatted exactly like current hex popup content,
   - human unit summary in form `"1 air, 3 armor, 2 infantry, 1 naval"`,
   - AI unit summary in the same format.
4. Buttons:
   - `Fight` (enabled only when one row is selected),
   - `Ignore`.
5. `Fight` behavior:
   - skip melee resolution in selected hex only for this turn,
   - resolve the rest of the strategic turn normally,
   - automatically start tactical battle in the selected hex after turn resolution.
6. `Ignore` behavior:
   - close modal and resolve melee normally everywhere.

---

## 2. Non-goals

1. No tactical combat redesign.
2. No ranged/air/ferry rule changes.
3. No DB schema changes unless strictly required.
4. No broad UI redesign outside this modal flow.

---

## 3. Reliability and coding guardrails

The implementing agent must follow these rules in every phase:

1. Keep phases isolated; do not mix incomplete work across phases.
2. Add orienting comments for all new/updated fields and non-overriding methods.
3. Logging policy:
   - debug-level log for new/updated public backend method invocations,
   - error-level log for every caught exception,
   - trace-level log for getter-style non-mutating methods.
4. Prefer reuse:
   - reuse existing hex-popup formatting logic instead of duplicating string builders,
   - reuse existing tactical start IPC flow (`startTacticalBattle`) instead of re-implementing.
5. Keep implementation contract-focused tests only (happy paths + essential failures).
6. After each phase: build/tests for touched areas + lint touched files.

---

## 4. Architecture outline (target design)

### 4.1 Main-process flow adjustment

In strategic `ready()`:

1. Keep existing ranged and movement ordering unchanged.
2. Before melee resolution:
   - compute melee candidate hexes from post-move, post-ranged unit state.
   - if no candidates, proceed with existing melee flow.
   - if candidates and user has not decided yet, return a new `ready` result state indicating `awaitingMeleeDecision` and candidate payload; do not advance turn yet.
3. On `Fight` decision:
   - run melee everywhere except selected hex,
   - finish turn resolution and return normal success payload + a flag carrying selected hex for tactical auto-start.
4. On `Ignore` decision:
   - run existing melee everywhere,
   - finish turn as normal.

### 4.2 Renderer flow adjustment

1. Ready click can now produce either:
   - normal resolved turn result, or
   - `awaitingMeleeDecision`.
2. For `awaitingMeleeDecision`, show modal and pause turn completion flow.
3. Modal submit sends decision via new IPC call.
4. On decision result success:
   - apply returned strategic snapshot updates exactly like normal ready flow,
   - if `Fight` selected, auto-invoke tactical start for that hex.

### 4.3 Data contract additions (shared IPC types)

Add explicit typed contracts for:

1. melee candidate row payload (h3 index, display text, feature text, unit summaries).
2. ready-awaiting-decision result shape.
3. resolve-melee-decision request/response IPC shapes.

---

## 5. Phase plan

## Phase A - Contract and type scaffolding

**Intent:** Introduce non-behavioral shared types and IPC contracts first.

**Files likely touched:**
- `src/shared/ipcTypes.ts`
- `src/main/preload.ts`
- `src/main/main.ts` (IPC registration only, stub handlers if needed)

**Tasks:**
1. Add typed structures for:
   - `MeleeCandidateRow`,
   - `ReadyAwaitingMeleeDecisionResult`,
   - melee decision request/response (`fight` + selected hex, `ignore`).
2. Extend game API typing in preload for new IPC method.
3. Keep runtime behavior unchanged in this phase.

**Verification:**
- `npm run build:main`
- `npm run build:renderer`
- lint touched files

**Exit criteria:**
- Build passes; no functional behavior change yet.

---

## Phase B - Main-process melee candidate detection and pause-point

**Intent:** Allow `ready()` path to stop at pre-melee decision when candidates exist.

**Files likely touched:**
- `src/main/gameActions.ts`
- `src/main/gameIpcHandlers.ts`
- possibly helper file under `src/main/game-actions/` for candidate extraction

**Tasks:**
1. Add helper to compute melee candidate hexes from current pre-melee combat unit set.
2. Build candidate row data including:
   - hex metadata source references for display,
   - human/opponent unit count summaries (`air/armor/infantry/naval` canonical order).
3. Add new backend state handling for pending melee decision for current turn (in-memory first; avoid DB migration unless required).
4. Update `handleGameReady` to return `awaitingMeleeDecision` result instead of proceeding immediately when candidates exist.
5. Add debug/error logging around decision creation and return path.

**Verification:**
- targeted tests for helper extraction and summary formatter
- `npm run build:main`
- existing ready-related tests still pass

**Exit criteria:**
- Ready can return a deterministic candidate list and pause before melee.

---

## Phase C - Renderer modal and decision wiring

**Intent:** Implement user decision UI with strict enable/disable semantics.

**Files likely touched:**
- `src/renderer/gameplay/readyHandler.ts`
- new modal module under `src/renderer/tactical/` or `src/renderer/gameplay/`
- renderer bootstrap wiring in `src/renderer/renderer.ts`

**Tasks:**
1. Add modal UI component with:
   - single-selection rows (radio semantics),
   - four columns requested by spec,
   - `Fight` disabled until selection,
   - `Ignore` always enabled.
2. Reuse existing hex popup formatting helpers for exact feature formatting.
3. On `Ignore`, call new decision IPC and continue standard post-ready rendering flow.
4. On `Fight`, call decision IPC and continue standard flow with tactical auto-start deferred to Phase D.
5. Add robust close/escape behavior per project modal conventions without allowing accidental invalid submit.

**Verification:**
- renderer build
- manual check: modal appears only when candidates exist, button states correct
- lint touched files

**Exit criteria:**
- Modal flow works and returns decisions to backend reliably.

---

## Phase D - Selective melee bypass + tactical auto-start integration

**Intent:** Complete game behavior for `Fight` and `Ignore`.

**Files likely touched:**
- `src/main/gameActions.ts`
- `src/main/gameIpcHandlers.ts`
- tactical start integration path in renderer (`renderer.ts` / ready handler)

**Tasks:**
1. Implement `Fight` decision behavior:
   - skip melee in selected hex only,
   - execute all other turn-resolution steps unchanged.
2. Implement `Ignore` behavior:
   - no melee bypass.
3. Return selected tactical-start hex in decision result for `Fight`.
4. Renderer auto-starts tactical battle at returned hex after strategic resolution completes.
5. Ensure tactical-start failure path reports clear toast but does not corrupt strategic turn state.

**Verification:**
- targeted main tests for melee bypass semantics
- manual flow:
  - choose `Fight` -> selected hex excluded from melee casualties + tactical starts
  - choose `Ignore` -> normal melee everywhere
- `npm run build:main && npm run build:renderer`

**Exit criteria:**
- Requested behavior complete and stable.

---

## Phase E - Test hardening and regression checks

**Intent:** Lock behavior with essential contract tests only.

**Files likely touched:**
- ready handler tests
- game IPC handler tests
- gameActions tests (melee resolution branch)

**Minimum required tests:**
1. Candidate extraction returns expected rows and summaries for mixed unit compositions.
2. Ready returns `awaitingMeleeDecision` when melee candidates exist.
3. `Fight` skips selected hex melee only.
4. `Ignore` performs normal melee.
5. Tactical auto-start is requested only on `Fight`.
6. No-candidate turns bypass modal flow entirely.

**Verification:**
- run all touched targeted tests
- run full `npm test` once at phase end

**Exit criteria:**
- Full test suite passes; no known regressions.

---

## 6. Required implementation details for clarity

1. **Unit summary order must be stable:** `air, armor, infantry, naval`.
   - Render only non-zero categories in this order (for example: `3 armor, 2 infantry`).
2. **Row selector behavior:** exclusive; use radio or managed single-checkbox state.
3. **Hex formatting source:** do not duplicate formatting strings; call shared formatter used by hex popup.
4. **Decision idempotency:** backend must reject stale/duplicate decisions cleanly with clear reason.
5. **Turn integrity:** turn number/phase advances only once per resolved decision.
6. **Visibility contract for listed melee hexes:** every hex shown in the melee-intercept modal is treated as visible to the human for that decision flow. If a listed hex is not currently visible under fog-of-war rules, the decision flow must reveal enough data for that row to render with the required popup-equivalent formatting.
7. **Single intercept per turn:** exactly one melee hex may be selected for tactical intercept in a strategic turn.

---

## 7. Manual verification checklist

1. Enter a turn where melee will occur in >=1 hex.
2. Click Ready and verify modal appears with correct row columns.
3. Verify `Fight` disabled until one row selected.
4. Select row + click `Fight`:
   - strategic resolution completes,
   - selected hex melee is skipped,
   - tactical battle auto-starts in selected hex.
5. Repeat with `Ignore`:
   - no tactical auto-start,
   - melee resolves normally.
6. Verify no modal appears when no melee hexes are expected.
7. Verify logs include new debug/error/trace entries per policy.

---

## 8. Resolved decisions

1. **Candidate list scope:** include the hexes where melee combat will take place for this turn.
2. **Visibility policy:** presence in the modal implies visibility; listed hexes must be rendered as visible for this flow.
3. **Selection cardinality:** exactly one tactical intercept hex may be selected per strategic turn.
4. **Popup-format fidelity:** row formatting follows the existing hex popup format, with visibility guaranteed by decision #2.
5. **No-melee race expectation:** by design this prompt appears immediately before melee resolution; eligibility should remain stable across the decision round-trip. If future async behavior introduces drift, handle as a defensive error path with clear logs and a user-facing retry message.
6. **Unit summary zero suppression:** omit categories with zero counts from both human and AI summary columns.
7. **Selector control acceptability:** radio-style control is acceptable as the implementation of the exclusive checkbox requirement.

---

## 9. Suggested implementation order summary

1. Phase A contracts
2. Phase B backend pause-point
3. Phase C modal
4. Phase D selective bypass + tactical auto-start
5. Phase E regression tests

This order minimizes risk and keeps each phase independently verifiable.

