# Immediate Strategic Order Sidebar Reset After Tactical Exit — Execution Plan

This document defines a phased, reliability-first implementation so that when the player wins or leaves a tactical battle, the pending-orders, ranged/air, and selected-unit sidebars show the pre-tactical strategic drafts immediately (from the in-memory stash), without waiting for the next successful Ready / turn resolution.

**Audience:** Coding agent or developer implementing the feature end-to-end.  
**Primary objective:** Maximum reliability, clarity, and independently verifiable increments.  
**Do not** put this document’s internal section or checklist labels into product code, comments, configuration, or other version-controlled artifacts.

---

## 1. Goal, scope, and done criteria

### 1.1 Goal

1. On win or leave from a tactical battle, as soon as the strategic map is restored, the right-hand pending-orders list, ranged/air panel, and selected-unit panel show the same strategic drafts the player had when they entered (the in-memory stash), except drafts whose unit is no longer in the post-exit strategic snapshot (parents deleted during the battle or on voluntary-exit bailout).
2. Auto-Ready after exit stays unchanged. A later Ready may still reload standing orders from the database (already working).

### 1.2 Explicitly out of scope

1. Reloading standing orders from the database at exit time.
2. Changing auto-Ready after tactical exit (`runReadyAfterExit` / `handleReadyButtonClick`).
3. Changing main-process / DB / IPC contracts. Calling existing `getGameState` after `endTacticalBattle` is in scope.
4. New renderer DOM test harness (renderer is not compiled or executed by `npm test`; use source-text contract tests).
5. Changing `tacticalReconcileBattleAfterStrategicSnapshot` and `applyGameStateSnapshot` selection-UI refresh behavior. Exit may call `applyGameStateSnapshot` with standing-order refresh left off.
6. `tacticalReleaseRendererSessionForNewStrategicMatch` / new-game teardown (already refresh sidebars).
7. `maybeScheduleTacticalAnnihilationExit` (opens overlay only; confirm uses the shared exit path).
8. Making `refreshSidebarAfterTacticalDraftTeardown` or `refreshStrategicSnapshotAfterExit` required on `TacticalBattleExitIo`.
9. Hand-editing `static/renderer.js` (`npm run build:renderer` updates it).

### 1.3 Definition of done

1. Win or leave returns to strategic view with pre-tactical standing/ranged/air/ferry drafts in the sidebars immediately, not after the next successful Ready.
2. Wrapper cannot silently drop future `TacticalBattleExitIo` fields (`...io`, with `endTacticalBattle` after the spread).
3. Contract tests guard map-exit-then-post-exit-snapshot-then-restore-then-sidebar-refresh-then-Ready ordering, renderer callback wiring (`getGameState` with standing-order refresh off), wrapper spread, and restore filtering against the current strategic snapshot.
4. No increment labels in product code.
5. `applyGameStateSnapshot`, reconcile, new-game teardown, and the annihilation scheduler implementations are unchanged.
6. Restoring the stash must not reintroduce standing/ranged/air/ferry drafts for units missing from the post-exit snapshot. This is a renderer-side filter of the stash, not a database reload of standing orders.

---

## 2. Locked behavior contract

### 2.1 Root cause

State restore already happens. DOM refresh is already designed. `performTacticalBattleExitWithGameApi` dropped `refreshSidebarAfterTacticalDraftTeardown` when forwarding IO to `tacticalPerformBattleExit`.

Win and leave share one path: `#tactical-exit-btn` and `#tactical-annihilation-exit-btn` both call `performTacticalBattleExit()` → `performTacticalBattleExitWithGameApi`.

### 2.2 Exit sequence (must not reorder)

On the success path of `tacticalPerformBattleExit`:

1. `tacticalBattleExitTeardownTransientRendererState()` (clears shared ranged/air/ferry via `clearPendingTacticalOrders`).
2. Clear tactical snapshot / exit map view / related chrome.
3. `io.refreshStrategicSnapshotAfterExit?.()` (`getGameState` + `applyGameStateSnapshot` with standing-order refresh off).
4. `restoreStrategicOrderDraftsAfterTacticalSession()`.
5. `io.refreshSidebarAfterTacticalDraftTeardown?.()`.
6. `io.redraw()`.
7. `await io.runReadyAfterExit()`.

Snapshot refresh must run **after** local snapshot clear and map exit (so `applyGameStateSnapshot` does not re-enter tactical release/reconcile restore) and **before** stash restore. Restore must run **before** sidebar refresh. IPC and boundary failures return **before** teardown/restore/refresh. Snapshot-refresh failures log and continue.

### 2.3 Renderer callbacks

`performTacticalBattleExit` in `renderer.ts` passes:

1. `refreshSidebarAfterTacticalDraftTeardown` that calls `hideStackCallout()` then `refreshStrategicOrderSidebars()` (pending orders, ranged, unit).
2. `refreshStrategicSnapshotAfterExit` that calls `getGameState` then `applyGameStateSnapshot` with `refreshStandingOrders: false` and without selection/sidebar/redraw flags (exit already refreshes those after restore).

### 2.4 Wrapper fix

`performTacticalBattleExitWithGameApi` spreads caller IO and injects IPC after the spread:

```ts
await tacticalPerformBattleExit(session, {
  ...io,
  endTacticalBattle: window.gameApi?.endTacticalBattle,
});
```

### 2.5 Restored drafts omit eliminated units

`restoreStrategicOrderDraftsAfterTacticalSession` still copies the in-memory stash (not a database reload of standing orders). `endTacticalBattle` may delete strategic parents after the last renderer snapshot (voluntary-exit bailout), so exit must apply a post-exit `getGameState` snapshot before restore. Restore then drops stash rows whose `unitId` is missing from `S.gameState.units` via `filterOrdersToLivingUnitIds`. If `S.gameState` is absent, restore the stash unfiltered.

---

## 3. Implementation increments

### Increment A — Spec + lock the already-correct ends of the chain

1. This document.
2. `src/main/tacticalExitSidebarRefreshContract.test.ts` (source-text):
   - In `tacticalPerformBattleExit`, restore index &lt; refresh callback &lt; `runReadyAfterExit`.
   - In `renderer.ts` `performTacticalBattleExit`, the IO object includes `refreshSidebarAfterTacticalDraftTeardown` calling `hideStackCallout` and `refreshStrategicOrderSidebars`.
   - Do not yet assert wrapper forwarding.

**Verify:** `npm run build:main` then `node dist/main/tacticalExitSidebarRefreshContract.test.js`. No product behavior change.

### Increment B — Forward all exit IO

1. In `performTacticalBattleExitWithGameApi`, use `...io` then `endTacticalBattle: window.gameApi?.endTacticalBattle`.
2. Update the function’s orienting comment (stash restored and sidebar DOM refreshed before Ready-equivalent continuation).
3. Extend the contract test: extracted body contains `...io`, contains `endTacticalBattle: window.gameApi?.endTacticalBattle`, and `...io` appears before `endTacticalBattle`.

**Verify:**

- Contract test passes (including wrapper assertions).
- `npm run build:renderer` and `npm run lint`.
- Manual: strategic standing order visible → enter tactical → issue tactical march → Exit Battle and win→confirm. As soon as strategic map returns, pending orders show pre-tactical standing orders (even if Ready waits on AI). Ranged/air and unit panels match restored strategic state. Exit with no tactical drafts still restores standing orders. IPC/boundary failures leave the tactical list unchanged.

---

## 4. Guardrails

1. Never commit or push.
2. Do not put this document’s increment labels into product code, comments, tests, or other version-controlled artifacts.
3. Orienting comments on new/updated non-overriding methods. Renderer-only; no backend logging.
4. Do not restyle or rename `tacticalPerformBattleExit`. Keep restore after post-exit snapshot apply and before sidebar refresh.
5. Prefer spreading the exit IO object over listing fields.
6. Tests: happy-path wiring contract only. Do not assert optional-chaining spelling, comments, or line numbers.
