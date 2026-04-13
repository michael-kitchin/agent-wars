/**
 * Consolidated handling for tactical battle IPC results in the renderer (start battle success path).
 */

import type { StartTacticalBattleIpcResult, TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { updateGameStateSidebar } from '../core/uiState';
import { rendererSharedState as S } from '../core/state';
import { stashStrategicOrderDraftsForTacticalSession } from './tacticalStrategicOrderUiStash';

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
};

/**
 * Applies `startTacticalBattle` IPC outcomes to renderer state and map chrome, including skipped-parent warnings.
 *
 * Contract: Mutates renderer only through `fx` callbacks; does not call IPC itself.
 * When to use: Tactical magnifier click handler after `window.gameApi.startTacticalBattle` resolves successfully.
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
  fx.setPhasePlanning(true);
  fx.enterRes4View(battle.res4ChildH3Indexes);
  fx.setStrategicSidebarTactical(true);
  fx.refreshTacticalExitHud();
  fx.scheduleAnnihilationExit();
  fx.refreshReadyButton();
  fx.syncTacticalEntryOverlay();
  fx.redraw();
  updateGameStateSidebar(S.gameState);
}
