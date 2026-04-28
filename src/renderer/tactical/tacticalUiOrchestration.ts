/**
 * DOM and renderer-state orchestration for tactical battle HUD, sidebar suppression, and entry-layer sync.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';
import { closeTacticalAnnihilationOutcomeDialog } from './tacticalAnnihilationDialog';
import { syncTacticalExitButtonElementVisibility } from './tacticalExitButtonDom';
import { exitTacticalMapView } from '../map/tacticalMapView';
import { hideTacticalEntryLayer, syncTacticalEntryButton } from '../map/tacticalEntryLayer';
import { updateGameStateSidebar } from '../core/uiState';
import { restoreStrategicOrderDraftsAfterTacticalSession } from './tacticalStrategicOrderUiStash';
import { cancelTacticalScopedBackgroundPrefetchForSessionTeardown } from '../openRouter/openRouterRuntime';

/**
 * Clears renderer tactical mode and map constraints when the main process has no tactical session (e.g. new game).
 *
 * Purpose: `newGame` IPC clears the active battle in main but does not run tactical exit UI; this mirrors that teardown on the renderer.
 * When to use: After a fresh `GameStateSnapshot` with no `tacticalBattleSession`, including `newGame` and any `getGameState` apply where main dropped the session.
 * Expected outcome: Tactical HUD hidden, res4 map bounds released, resolution animation cancelled, `S.tacticalBattleSnapshot` null; sidebar turn uses `nextState`.
 * Exceptions: None; safe when already strategic (no-op aside from `exitTacticalMapView` if pre-tactical zoom was captured).
 */
export function tacticalReleaseRendererSessionForNewStrategicMatch(nextState: GameStateSnapshot): void {
  closeTacticalAnnihilationOutcomeDialog();
  if (S.resolutionMoveAnimationFrameId !== null) {
    cancelAnimationFrame(S.resolutionMoveAnimationFrameId);
  }
  S.resolutionMoveAnimationFrameId = null;
  S.resolutionMoveAnimation = null;
  cancelTacticalScopedBackgroundPrefetchForSessionTeardown();
  S.pendingDeferredTacticalPostBeatConsult = false;
  S.tacticalBattleSnapshot = null;
  S.tacticalOpponentDraft = null;
  S.tacticalPhasePlanning = true;
  // No `withTacticalHumanDraftPrefetchInvalidation`: session teardown, not an in-beat human edit. Any tactical-scoped
  // background `requestAiOrders` was cancelled above while `tacticalBattleSnapshot` was still set for fingerprint bookkeeping.
  S.tacticalPendingMarches = [];
  S.pendingEmbarkOrders = [];
  S.hideCommittedOrderLinesAfterReady = false;
  exitTacticalMapView();
  tacticalApplyStrategicSidebarForTacticalMode(false);
  const el = document.getElementById('tactical-entry-layer');
  if (el) hideTacticalEntryLayer(el, true);
  tacticalUpdateExitButtonVisibility();
  updateGameStateSidebar(nextState);
}

/**
 * Keeps the strategic sidebar visible during tactical play; legacy hook remains for callers that toggled suppression.
 *
 * Contract: Always removes `tactical-strategic-suppress` so Ready, pending orders, and LLM panels stay usable in res4 mode.
 * When to use: Tactical entry success and tactical exit / reconciliation teardown (parameter ignored for compatibility).
 * Expected outcome: Full `#sidebar` visibility regardless of tactical flag.
 * Exceptions: None when `#sidebar` is missing (no-op).
 */
export function tacticalApplyStrategicSidebarForTacticalMode(tactical: boolean): void {
  void tactical;
  document.getElementById('sidebar')?.classList.remove('tactical-strategic-suppress');
}

/**
 * Updates tactical HUD visibility and exit button disabled state from renderer shared state.
 *
 * Contract: Reads `S.tacticalBattleSnapshot` and `S.tacticalPhasePlanning` only; mutates DOM button disabled flags.
 * When to use: After tactical snapshot changes, phase flips, and redraw passes that affect tactical controls.
 * Expected outcome: Exit button disabled whenever not in tactical planning or no snapshot.
 * Exceptions: None.
 */
export function tacticalUpdateExitButtonVisibility(): void {
  syncTacticalExitButtonElementVisibility();
}

/**
 * Clears tactical renderer state when the latest strategic snapshot no longer matches the tactical session anchor.
 *
 * Contract: Clears `S.tacticalBattleSnapshot` when strategic phase/turn diverges from the tactical snapshot anchor.
 * When to use: `applyGameStateSnapshot` dependency hook after strategic state replacement.
 * Expected outcome: Tactical res4 view tears down and entry layer hides when reconciliation triggers.
 * Exceptions: None.
 */
export function tacticalReconcileBattleAfterStrategicSnapshot(nextState: GameStateSnapshot): void {
  const snap = S.tacticalBattleSnapshot;
  if (!snap) return;
  if (nextState.phase !== 'planning' || nextState.turnNumber !== snap.strategicTurnNumber) {
    closeTacticalAnnihilationOutcomeDialog();
    cancelTacticalScopedBackgroundPrefetchForSessionTeardown();
    S.tacticalBattleSnapshot = null;
    S.tacticalOpponentDraft = null;
    S.tacticalPhasePlanning = true;
    // No `withTacticalHumanDraftPrefetchInvalidation`: same rationale as `tacticalReleaseRendererSessionForNewStrategicMatch`.
    S.tacticalPendingMarches = [];
    S.pendingEmbarkOrders = [];
    exitTacticalMapView();
    tacticalApplyStrategicSidebarForTacticalMode(false);
    restoreStrategicOrderDraftsAfterTacticalSession();
    const el = document.getElementById('tactical-entry-layer');
    if (el) hideTacticalEntryLayer(el, true);
    tacticalUpdateExitButtonVisibility();
    updateGameStateSidebar(nextState);
  }
}

/**
 * Resynchronizes tactical-entry magnifier controls for contested res1 hexes during strategic planning.
 *
 * Contract: Delegates to `syncTacticalEntryButton` with the same dependency injection shape as the strategic renderer.
 * When to use: Canvas redraw paths that already refresh build-entry controls.
 * Expected outcome: Tactical magnifiers match contested explored res1 cells at eligible zoom levels.
 * Exceptions: None.
 */
export function tacticalSyncTacticalEntryButtonOverlay(deps: {
  isHexExploredByPlayer: (h3: string) => boolean;
  hasRes1OverlayOffsetFeatures: (h3Index: string, visibleUnitHexes: Set<string>) => boolean;
}): void {
  syncTacticalEntryButton(deps);
}
