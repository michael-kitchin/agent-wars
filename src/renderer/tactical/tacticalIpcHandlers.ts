/**
 * Consolidated handling for tactical battle IPC results in the renderer (start battle success path).
 */

import type { StartTacticalBattleIpcResult, TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { reconcileSelectionToCurrentState } from '../core/selection';
import { updateGameStateSidebar } from '../core/uiState';
import { rendererSharedState as S } from '../core/state';
import { flushResolutionPlaybackCompleteNotifyCallbacks } from '../openRouter/resolutionPlaybackDeferral';
import { stashStrategicOrderDraftsForTacticalSession } from './tacticalStrategicOrderUiStash';

/**
 * Clears strategic selection/hover chrome and any overlapping strategic resolution playback after the tactical snapshot is assigned.
 *
 * Purpose: Fight → tactical can activate while strategic Ready still holds parent-unit selection ids and a hover route
 * preview; `isHoverOrderPlanningActive` then blocks selecting tactical sub-units for the whole battle until that chrome clears.
 * When to use: Immediately after `assignBattleSnapshot` on tactical IPC start and restored-session activation.
 * Expected outcome: Selection reconciled to living tactical humans (usually empty); hover preview and hex hover cleared;
 * in-flight strategic resolution RAF cancelled. Playback-complete notifies flush only when playback was interrupted so
 * deferred consult still runs; magnifier/restore with no animation do not fire a stray notify.
 * Exceptions: None.
 */
function clearStrategicPlanningChromeAfterTacticalSnapshotAssigned(): void {
  const interruptedStrategicPlayback =
    S.resolutionMoveAnimation !== null || S.resolutionMoveAnimationFrameId !== null;
  if (S.resolutionMoveAnimationFrameId !== null) {
    cancelAnimationFrame(S.resolutionMoveAnimationFrameId);
  }
  S.resolutionMoveAnimationFrameId = null;
  S.resolutionMoveAnimation = null;
  if (interruptedStrategicPlayback) {
    flushResolutionPlaybackCompleteNotifyCallbacks();
  }
  reconcileSelectionToCurrentState();
  S.hoverRoutePreview = null;
  S.hoverPreviewRequestSeq++;
  S.hoveredHexH3 = null;
  S.hoveredDetailHexH3 = null;
  S.selectedUnitIdsAtMouseDown = [];
  S.gestureSelectionSnapshotAtMs = 0;
  S.hideCommittedOrderLinesAfterReady = false;
}

/**
 * Side-effect surface used after a successful `startTacticalBattle` IPC call to update renderer DOM and shared state.
 *
 * Contract: Implementations close over `rendererSharedState` and renderer-only helpers without importing `renderer.ts`; callers hide build UI before IPC when appropriate.
 * When to use: `tryHandleTacticalEntryAtClientXY` after the main process returns a tactical snapshot.
 * Expected outcome: Tactical res4 view becomes active; skipped-parent toasts preserve milestone-2.1 UX.
 * Exceptions: None; IPC failures are handled before this helper runs.
 */
export type TacticalRendererStartBattleSideEffects = {
  showMapToast: (message: string, options: { isError?: boolean }) => void;
  assignBattleSnapshot: (battle: TacticalBattleSnapshot) => void;
  setPhasePlanning: (planning: boolean) => void;
  enterRes4View: (childRes4H3Indexes: string[]) => void;
  setStrategicSidebarTactical: (tactical: boolean) => void;
  refreshTacticalExitHud: () => void;
  scheduleAnnihilationExit: () => void;
  refreshReadyButton: () => void;
  syncTacticalEntryOverlay: () => void;
  redraw: () => void;
  /**
   * Rebuilds pending-movement, ranged/air, and selected-unit sidebars immediately after stash clears strategic drafts so the DOM matches tactical mode.
   *
   * Purpose: `updateGameStateSidebar` only updates phase/turn lines; `#pending-orders-list` would otherwise keep stale strategic rows until the next unrelated refresh.
   * When to use: Wired from the renderer after successful tactical IPC / restore activation (typically closes the stack callout then refreshes the three order panels).
   * Expected outcome: Tactical pending-order UI or empty placeholders replace strategic standing-order rows right away.
   * Exceptions: Optional when tests stub minimal side effects.
   */
  refreshOrderSidebars?: () => void;
};

/**
 * Applies `startTacticalBattle` IPC outcomes to renderer state and map chrome, including skipped-parent warnings.
 *
 * Contract: Mutates renderer only through `fx` callbacks; does not call IPC itself.
 * When to use: Tactical magnifier click handler and melee Fight auto-start after `window.gameApi.startTacticalBattle` resolves successfully.
 * Expected outcome: Same toast, map, sidebar, and redraw sequencing as the pre-refactor inline implementation.
 * Exceptions: None.
 */
export function tacticalRendererApplyStartBattleIpcResult(
  result: StartTacticalBattleIpcResult,
  fx: TacticalRendererStartBattleSideEffects
): void {
  if (!result.success || !result.battle) {
    fx.showMapToast(result.reason ?? 'Could not start tactical battle.', { isError: true });
    return;
  }
  stashStrategicOrderDraftsForTacticalSession();
  fx.assignBattleSnapshot(result.battle);
  clearStrategicPlanningChromeAfterTacticalSnapshotAssigned();
  fx.setPhasePlanning(true);
  const skipped = result.skippedParentDisplayNames;
  if (skipped && skipped.length > 0) {
    fx.showMapToast(`Some units could not be placed tactically: ${skipped.join(', ')}.`, { isError: true });
  }
  fx.enterRes4View(result.battle.res4ChildH3Indexes);
  fx.setStrategicSidebarTactical(true);
  fx.refreshTacticalExitHud();
  fx.scheduleAnnihilationExit();
  fx.refreshReadyButton();
  fx.syncTacticalEntryOverlay();
  fx.redraw();
  updateGameStateSidebar(S.gameState);
  fx.refreshOrderSidebars?.();
}

/**
 * Enters tactical res4 mode from a snapshot supplied by strategic `getGameState` (e.g. after app restart).
 *
 * Purpose: Reuses the same renderer sequencing as `tacticalRendererApplyStartBattleIpcResult` without an IPC round-trip.
 * When to use: `applyGameStateSnapshot` when `nextState.tacticalBattleSession` is present and differs from local state.
 * Expected outcome: Tactical HUD, sidebar suppression, and map bounds match a freshly started tactical session.
 * Exceptions: None; assumes `battle` was validated in the main process before attachment.
 */
export function tacticalRendererActivateRestoredBattleSnapshot(
  battle: TacticalBattleSnapshot,
  fx: TacticalRendererStartBattleSideEffects
): void {
  stashStrategicOrderDraftsForTacticalSession();
  fx.assignBattleSnapshot(battle);
  clearStrategicPlanningChromeAfterTacticalSnapshotAssigned();
  fx.setPhasePlanning(true);
  fx.enterRes4View(battle.res4ChildH3Indexes);
  fx.setStrategicSidebarTactical(true);
  fx.refreshTacticalExitHud();
  fx.scheduleAnnihilationExit();
  fx.refreshReadyButton();
  fx.syncTacticalEntryOverlay();
  fx.redraw();
  updateGameStateSidebar(S.gameState);
  fx.refreshOrderSidebars?.();
}
