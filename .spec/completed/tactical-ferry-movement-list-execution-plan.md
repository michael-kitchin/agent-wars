# Tactical Ferry Movement List Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During tactical planning, each queued ferry has a Movement orders row with select and cancel. Sealift embark rows are not on that list.

**Architecture:** `updatePendingOrdersSidebar` in `src/renderer/gameplay/sidebarSupport.ts` returns early when `S.tacticalBattleSnapshot` is set, and that branch never reads `S.pendingFerryOrders`. It does render `S.pendingEmbarkOrders`. The tactical branch should render ferries with the same row helper the strategic branch uses, and should stop rendering embark orders. Embark state and the stack-callout sealift editor stay.

**Tech Stack:** TypeScript, Electron renderer, existing source contract test in `src/main/rendererConsolidation.test.ts`.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages.
- Keep this exact call in the strategic branch: `formatPendingFerryOrderSidebarLabel(S.gameState, ferry)`. `src/main/rendererConsolidation.test.ts` asserts that string.
- Do not change `formatPendingMovementSidebarTargetLabel` or the `Nh (status)` ferry formatter. A separate decision keeps that label contract.
- New and updated functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws.
- Test happy paths and essential failure cases only.
- Do not add an IPC channel.

## Locked Behavior

When a battle snapshot is set:

- The list shows `None` only when `S.tacticalPendingMarches` and `S.pendingFerryOrders` are both empty. `S.pendingEmbarkOrders` does not count.
- March rows stay as they are.
- Each `S.pendingFerryOrders` row uses `createSidebarOrderRow`, `formatUnitArrowLabel`, and `formatPendingFerryOrderSidebarLabel(S.gameState, ferry, S.tacticalBattleSnapshot.subUnits)`. The third argument is the tactical origin lookup (`UnitH3PositionLookup`). Sub-units already have `id` and `h3Index`.
- Select calls `deps.applySelectionFromSidebarUnitButton(ferry.unitId, event)`.
- Cancel calls `deps.cancelFerryForUnit(ferry.unitId)`. Do not change `cancelFerryForUnit`. It already removes that ferry. During a battle it also removes a `pendingEmbarkOrders` row with the same unit id. Leave that.
- No row is built from `S.pendingEmbarkOrders`.

When no battle snapshot is set, the strategic march and ferry loops stay as they are, including the two-argument ferry label call.

## Decisions This Plan Does Not Code

**Selection toggle.** `doc/ux/stack-callout.md` says a human row's toggle adds or removes that unit. `doc/ux/right-panel-selection-and-orders.md` says the row select toggles and points at `doc/ux/selection-model.md`. The selection model says a plain map click replaces the selection and only Shift toggles. `applySelectionFromSidebarUnitButton` replaces on a plain click and toggles on Shift. `onStackSingleUnitToggleClick` removes the unit when it is already selected, replaces the selection when it is not, and toggles on Shift. Do not make the callout match the order-row control.

Recommended resolution: do not change either control. The two controls are not the same. In `doc/ux/right-panel-selection-and-orders.md`, say a plain click calls `replaceSelection` with that unit, and Shift toggles it. In `doc/ux/stack-callout.md`, say a plain click on an unselected human row replaces the selection with that unit and closes the callout, a plain click on a selected row removes that unit, and Shift toggles the unit and leaves the callout open. That is what `onStackSingleUnitToggleClick` and `applySelectionFromSidebarUnitButton` do today.

**Order row text.** The selection document says each row names the destination or target. `formatPendingMovementSidebarTargetLabel` and `src/main/pendingMovementSidebarLabels.test.ts` define `Nh (status)`. `formatPendingFerryOrderSidebarLabel` uses `Nh (ferry)`.

Recommended resolution: do not change the formatters. In `doc/ux/right-panel-selection-and-orders.md` Information Displayed, say each row names the unit and then shows the distance in hexes plus the status, target type, or `ferry`.

## Phase 1: Tactical Ferry Rows

**Files:**
- Modify: `src/renderer/gameplay/sidebarSupport.ts`
- Modify: `doc/ux/right-panel-selection-and-orders.md`
- Modify: `doc/ux/order-lifecycle.md`
- Modify: `doc/ux-specification.md`
- Modify: `doc/ux/stack-callout.md` (wording only, from the decision above)

- [x] **Step 1: Tactical branch**

In `updatePendingOrdersSidebar`, change the tactical empty check and add the ferry loop from Locked Behavior. Delete the `for (const emb of S.pendingEmbarkOrders)` loop. Leave march rows and the strategic branch untouched.

- [x] **Step 2: Docs**

Remove the tactical-ferry Known Deviations entry from `doc/ux/right-panel-selection-and-orders.md`. In `doc/ux/order-lifecycle.md`, delete the sentence that says the current code omits tactical ferries. Apply the two wording changes in Decisions. Rebuild the Known Deviations index in `doc/ux-specification.md` by reading the documents. Do not subtract from a remembered total.

- [x] **Step 3: Verify**

```text
npm run build:main
node --test dist/main/rendererConsolidation.test.js
npm run check:renderer-types
npm run build:renderer
```

Expected: the consolidation test PASS, then both builds exit 0.

Manual check: in a battle, queue a ferry and confirm a Movement orders row appears with select and cancel. Cancel removes that ferry. An embark changed from the stack callout does not add a Movement orders row.
