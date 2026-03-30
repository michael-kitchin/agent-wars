# Multi-unit selection and group commanding — execution plan

This document defines a phased, reliability-first implementation plan for adding multi-unit selection and multi-unit command issuance to the map UI and game action contracts.

**Audience:** Coding agent or developer implementing the feature end-to-end.  
**Primary objective:** Maximum reliability, clarity, and independently verifiable increments with minimal regression risk.

---

## 1. Goal, scope, and done criteria

### 1.1 Goal

Implement reliable multi-unit selection and group commanding with these user-facing behaviors:

1. Ctrl + left-click supports additive/removal selection behavior.
2. Double-click move can issue the same movement destination to all selected units.
3. Hover/planned path preview is shown for all selected units with shared validity rules.
4. Group ranged command can be issued only when all selected units are eligible to fire on target.
5. Stack callout gains Add/Remove and Add All/Remove All/Select All controls depending on Ctrl state.
6. Releasing Ctrl returns to single-select click behavior without clearing current multi-selection.
7. Plain left-click empty hex deselects all selected units.

### 1.2 Explicitly out of scope

1. New combat rules, movement rules, or pathfinding algorithm changes.
2. New unit capability models beyond existing movement/ranged validation.
3. Input rebinding/settings work (Ctrl is fixed in this plan).
4. Multiplayer/network synchronization concerns (single local game context assumed).

### 1.3 Definition of done

1. All locked behaviors in Section 2 are implemented and pass phase-level verification.
2. Existing single-unit flows continue to work when only one unit is selected.
3. Group move and group ranged orders are rejected atomically when any selected unit is invalid.
4. Tests cover happy paths plus essential failure contracts only.
5. New/updated public backend methods include required logging and orienting comments.
6. No critical regressions in stack callout, hover previews, submit orders, or Ready resolution.

---

## 2. Locked behavior contract (from owner request)

1. **Ctrl + left-click unit selection**
   - Ctrl + left-click toggles a unit in the selected set.
2. **Group movement commit**
   - Double-click on a target hex issues move intent to all selected units.
3. **Planned path rendering**
   - Planned paths render for all selected units.
   - Solid path extent is capped by the slowest-moving selected unit.
   - If any selected unit cannot move to target, movement planning is not allowed.
4. **Group ranged fire**
   - Ranged command only allowed when all selected units have ranged capability.
   - If any selected unit cannot fire at target hex, ranged command is rejected.
5. **Ctrl + stack callout row buttons**
   - Label is `Add` for unselected units and `Remove` for already selected units.
6. **Stack callout header controls without Ctrl**
   - Show single top button: `Select All` (replaces prior selection with all human units in the stack).
7. **Stack callout header controls with Ctrl**
   - Show side-by-side top buttons: `Add All` and `Remove All` (human units only).
8. **Ctrl-release behavior**
   - Releasing Ctrl switches interaction mode back to single-select semantics and button labels.
   - Existing selected units remain selected.
9. **Empty-hex deselection**
   - When Ctrl is not held, left-click empty hex clears all current selections.
10. **Ctrl + empty-hex deselection**
   - Ctrl + left-click empty hex also clears all current selections.
11. **No-Ctrl row button style in stack callout**
   - Keep current row button style (`Select`) when Ctrl is not held.
12. **Invalid group-move preview behavior**
   - Show the same invalid behavior as current single-unit invalid preview (including X marker).
   - Valid-unit preview paths may still render as informational paths, but commit remains blocked until all selected units are valid.
13. **Group ranged pending list representation**
   - Keep one pending row per unit (no aggregation in this scope).
14. **Post-commit selection behavior**
   - Successful group movement or group ranged commit clears selection (matching current single-unit flow).
15. **Post-Ctrl-release single-click collapse**
   - After Ctrl is released while multiple units are selected, a non-Ctrl click on a unit collapses selection to that clicked unit.

---

## 3. Technical baseline and change strategy

Current renderer flow is centered on scalar state (`selectedUnitId`, `selectedUnitIdAtMouseDown`, scalar hover preview), while backend `submitOrders` already supports arrays and validates atomically.

Implementation strategy:

1. Introduce a **selection-set model** in renderer while preserving a derived primary selection for backward-compatible UI surfaces.
2. Add **batch-capable preview and commit contracts** in IPC/main process for group validity checks and preview payloads.
3. Keep core validation logic centralized in backend (`gameActions`) so renderer remains a consumer of authoritative validity.
4. Land changes in phases that are independently testable and reversible.

---

## 4. Reliability and coding standards (mandatory)

1. **Logging**
   - New/updated public backend methods log invocations at debug level.
   - Caught exceptions log at error level.
   - Getter-style non-mutating methods log at trace level.
2. **Orienting comments**
   - Add orienting comments to all new/updated public, non-overriding backend methods.
3. **Testing scope**
   - Cover happy paths and essential failure contracts only.
   - Avoid implementation-detail assertions and avoid boilerplate delegation tests.
4. **Readability**
   - Prefer composable helper functions over large event-handler branches.
   - Keep selection reconciliation logic and command validity logic in dedicated functions.
5. **Scope discipline**
   - Do not aggregate grouped ranged rows yet; keep one row per unit for this iteration.
6. **Reusable and modern implementation**
   - Prefer reusable abstractions (selection helpers, grouped validation helpers, shared preview mappers) where this does not increase risk.
   - Use modern TypeScript patterns and concise language features where they improve readability and reliability.
7. **Boilerplate reduction**
   - Prefer existing utility/helper layers over duplicated inline logic when integrating grouped selection and command flows.

---

## 5. Phased execution plan

Each phase has a clear objective, implementation tasks, verification, and exit criteria. Later phases depend only on completed earlier phases.

### Phase 0 — Contracts and interaction-state freeze

**Objective:** Freeze data/interaction contracts before UI behavior changes.

**Tasks:**

1. Define renderer selection state shape:
   - `selectedUnitIds: string[]`
   - `primarySelectedUnitId: string | null` (for existing sidebar text/controls)
   - `ctrlKeyActive: boolean`
2. Define new IPC contract types for group preview and group command validation:
   - `previewHumanMarchOrders(payload: { unitIds: string[]; hoveredH3Index: string })`
   - `assignHumanMarchOrders(payload: { unitIds: string[]; destinationH3Index: string })`
   - optional: `validateGroupRangedTarget(payload: { unitIds: string[]; targetH3Index: string })`
3. Define group preview response model:
   - per-unit segments + per-unit validity reason
   - aggregate `validForAll`
   - metadata needed to render "solid-to-slowest" cutoff.
4. Decide and document deterministic unit ordering for group operations (selection order vs sorted by ID).

**Verification:**

- Typecheck/build passes with no behavior changes.
- Existing gameplay behavior unchanged.

**Exit criteria:**

- No unresolved contract ambiguity remains for phases 1+.

---

### Phase 1 — Backend group movement/ranged validation APIs

**Objective:** Add authoritative backend support for group validity and atomic acceptance/rejection.

**Tasks:**

1. Implement group movement preview/assign methods in `gameActions` using existing route logic:
   - For each unit, compute preview validity and segments.
   - Aggregate to `validForAll`; when false, return reasons and reject commit.
2. Implement group movement assign method:
   - If any unit invalid for destination, reject entire batch with clear reason.
   - If all valid, assign/update all standing orders.
3. Implement grouped ranged validation helper:
   - All selected units must have ranged capability.
   - All selected units must be in-range and have enemy target at target hex.
   - Any invalid unit rejects group ranged command.
4. Add or update public backend method comments and logging.

**Verification:**

- Unit tests: all-valid group movement preview and assign.
- Essential failures:
  - mixed land/naval destination incompatibility,
  - one out-of-range ranged unit blocks group fire,
  - empty selection and duplicate IDs handled safely.
- Existing single-unit preview/assign tests remain green.

**Exit criteria:**

- Backend can authoritatively preview/assign group movement and validate group ranged constraints.

---

### Phase 2 — Renderer selection-set core and Ctrl interaction model

**Objective:** Replace scalar selection with a robust selection set and key-modifier aware click behavior.

**Tasks:**

1. Introduce selection helpers:
   - `addToSelection`, `removeFromSelection`, `toggleSelection`, `clearSelection`.
2. Track Ctrl state from keydown/keyup and update click semantics:
   - Ctrl + left-click on unit toggles membership.
   - Non-Ctrl left-click preserves existing single-select behavior.
   - Ctrl release does not clear set, only changes click semantics/labels.
3. Update empty-hex click behavior:
   - Non-Ctrl left-click empty hex clears all selected units.
4. Keep a deterministic primary selected unit for existing sidebar/ranged button compatibility.

**Verification:**

- Manual interaction smoke:
  - Ctrl add/remove across different hexes,
  - Ctrl release retains selected set,
  - non-Ctrl empty-hex click clears selection.
- Existing single-selection behavior still works when only one unit selected.

**Exit criteria:**

- Selection model is stable and no longer relies on single `selectedUnitId` assumptions.

---

### Phase 3 — Stack callout multi-select controls and labels

**Objective:** Implement stack popup behaviors for Add/Remove/Select All/Add All/Remove All.

**Tasks:**

1. Refactor `showStackCallout` to receive selection state + Ctrl state.
2. Row button labels:
   - Ctrl held: `Add`/`Remove` based on membership.
   - Ctrl not held: retain single-select mode semantics for row action label (confirm exact wording in open questions).
3. Header controls:
   - no Ctrl: show `Select All` (replaces current selection with all human units from stack),
   - Ctrl held: show `Add All` and `Remove All`.
4. Ensure callout updates labels immediately when Ctrl is pressed/released while popup is open.

**Verification:**

- Manual stack scenarios (mixed human/opponent stack, pure human stack).
- Header/row controls mutate selection set exactly as expected.
- No regression: stack callout still appears for stacks and lone AI unit as before.

**Exit criteria:**

- Stack callout provides complete multi-selection controls with correct mode-aware labeling.

---

### Phase 4 — Multi-unit hover preview and double-click movement commit

**Objective:** Render planned paths for all selected units and enforce group movement validity contract.

**Tasks:**

1. Replace scalar hover preview state with per-unit preview collection.
2. On hovered-hex change, request group preview from backend for current selection.
3. Rendering rules:
   - draw planned path for each selected unit,
   - compute slowest unit allowed segment and cap solid segment there,
   - preserve dashed beyond solid as applicable.
4. Invalid group destination handling:
   - if any selected unit invalid, do not allow planning commit.
   - render the same invalid behavior as current single-unit flow, including X marker.
   - retain valid-unit preview paths as informational where available, while commit remains blocked.
5. Double-click behavior:
   - when selection size > 0 and preview is valid-for-all, commit order for all selected units.
   - preserve single-unit double-click behavior when one unit selected.

**Verification:**

- Manual:
  - homogeneous group valid target,
  - mixed land/naval invalid target,
  - slowest-unit solid-segment cutoff visually correct.
- Essential failure: any invalid unit blocks commit.
- Existing per-unit committed standing-order lines still update correctly.

**Exit criteria:**

- Group movement planning and commit are reliable and match lock contract.

---

### Phase 5 — Multi-unit ranged command integration

**Objective:** Make ranged command flow selection-set aware with all-or-nothing validity.

**Tasks:**

1. Update ranged mode activation logic to support selected set:
   - only enable ranged mode when all selected units can perform ranged attacks.
2. On target click in ranged mode:
   - validate target for all selected units via backend contract.
   - if any invalid, reject entire group ranged command with clear reason.
   - if valid, enqueue ranged orders for all selected units.
3. Update ranged sidebar list actions (`Select`, `Cancel`) for multi-unit context:
   - keep one row per unit in pending ranged list (current behavior).
   - keep row actions compatible with post-commit selection clearing.

**Verification:**

- Happy path: all selected ranged-capable units in range can issue group fire.
- Essential failures:
  - one selected melee-only unit blocks,
  - one selected ranged unit out of range blocks.
- `submitOrders` still accepts and resolves grouped ranged orders correctly.

**Exit criteria:**

- Group ranged fire rules are enforced consistently with movement rules.

---

### Phase 6 — Regression sweep, UX polish, and acceptance checks

**Objective:** Ensure no regressions and validate final user-facing behavior matrix.

**Tasks:**

1. Execute focused automated tests for touched modules:
   - renderer interaction helpers,
   - `gameActions` group preview/assign/validation,
   - IPC contract compatibility.
2. Run manual acceptance matrix:
   - Ctrl toggle selection,
   - stack popup all button modes,
   - empty-hex deselection,
   - multi-preview and multi-commit move,
   - multi-ranged validity all-or-nothing.
3. Validate logs/comments standards on touched backend public methods.
4. Verify no behavioral drift in Ready resolution, committed line rendering, and cancel interactions.

**Exit criteria:**

- Acceptance matrix passes and no blocking regressions remain.

---

## 6. Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scalar-selection assumptions spread across renderer | High | Introduce centralized selection helpers and migrate all accesses through them. |
| Group preview mismatch between renderer and backend | High | Keep backend as route/validity source of truth; renderer only draws returned model. |
| Ambiguous Ctrl-release + popup-label behavior | Medium | Lock UX decisions in Section 8 before coding Phase 3/4. |
| Double-click race with deferred single-click timer | Medium | Rework click/dblclick sequencing tests and clear pending timers deterministically. |
| Excessive preview IPC calls with many selected units | Medium | Keep hex-change guard and async sequence guards; batch in single preview call. |
| Group ranged flow conflicts with existing single-unit sidebar actions | Medium | Add explicit multi-selection interaction contract and test row-action behavior. |

---

## 7. Acceptance checklist (manual)

- [ ] Ctrl + left-click toggles selection membership per unit.
- [ ] Releasing Ctrl preserves selected set and changes interaction labels/mode only.
- [ ] Non-Ctrl click on empty hex clears all selected units.
- [ ] Ctrl + click on empty hex clears all selected units.
- [ ] Stack popup shows `Select All` without Ctrl.
- [ ] Stack popup shows `Add All` + `Remove All` with Ctrl.
- [ ] Stack row buttons show `Add`/`Remove` correctly with Ctrl held.
- [ ] No-Ctrl stack row buttons remain `Select` (current style).
- [ ] `Select All` without Ctrl replaces current selection with the stack's human units.
- [ ] Group move double-click issues orders for all selected units when all valid.
- [ ] Group move is blocked when any selected unit cannot reach destination.
- [ ] Planned path is displayed for all selected units.
- [ ] Solid planned path extent is capped by slowest selected unit.
- [ ] Invalid group destination uses current invalid-preview style including X marker.
- [ ] Group ranged command allowed only when all selected units can fire at target.
- [ ] Group ranged command rejected when any selected unit cannot fire at target.
- [ ] Pending ranged list remains one row per unit.
- [ ] Successful group commit clears selection.
- [ ] Single-unit interaction remains intact when one unit is selected.

---

## 8. Resolved product decisions

1. Keep no-Ctrl stack row button style as current `Select`.
2. No-Ctrl `Select All` replaces any prior selection with the stack's full human-unit set.
3. Invalid group movement keeps current invalid-preview style, including X marker.
4. Valid-unit informational paths can still render during invalid group preview, but commit is blocked.
5. Slowest-unit solid-segment rule is confirmed as documented.
6. Pending ranged list remains one row per unit.
7. Successful group movement/ranged commit clears selection.
8. `Select All` / `Add All` / `Remove All` apply only to human units.
9. Ctrl semantics do not alter enemy/lone-AI stack behavior beyond human-unit multi-select controls.
10. Ctrl + left-click on empty hex clears the selected set.
11. After Ctrl-release with multiple units selected, a non-Ctrl click on a unit collapses selection to that clicked unit.

---

## 9. Suggested implementation order in one coding session

1. Phase 0 contract/type freeze.
2. Phase 1 backend group APIs and tests.
3. Phase 2 selection-state migration.
4. Phase 3 stack callout controls.
5. Phase 4 group movement preview/commit.
6. Phase 5 group ranged integration.
7. Phase 6 regression and acceptance sweep.

This order minimizes event-handling thrash and keeps backend correctness ahead of UI complexity.

---

*End of plan.*
