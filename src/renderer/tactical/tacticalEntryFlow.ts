/**
 * Tactical battle entry from strategic magnifier clicks, restored main snapshots, exit/advance IPC wiring.
 *
 * Purpose: Keeps `renderer.ts` as composition while preserving milestone-2.1 tactical activation sequencing.
 * When to use: Renderer bootstraps these helpers with renderer-local overlays (build popup, Ready pipeline).
 * Expected outcome: Same toasts, map mode transitions, and HUD updates as the pre-extraction inline paths.
 * Exceptions: IPC failures surface through injected `showMapToast` contracts from tactical exit helpers.
 */

import type { GameApi } from '../../shared/ipcTypes';
import type { StartTacticalBattleIpcResult, TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { rendererSharedState as S } from '../core/state';
import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import { enterTacticalMapView } from '../map/tacticalMapView';
import {
  tacticalPerformBattleExit,
  type TacticalBattleExitIo,
  type TacticalExitSessionAccessor,
} from './tacticalExitFlow';
import {
  tacticalRendererActivateRestoredBattleSnapshot,
  tacticalRendererApplyStartBattleIpcResult,
  type TacticalRendererStartBattleSideEffects,
} from './tacticalIpcHandlers';
import {
  tacticalApplyStrategicSidebarForTacticalMode,
  tacticalUpdateExitButtonVisibility,
} from './tacticalUiOrchestration';

/**
 * Renderer-owned controls that still vary per bootstrap (overlay sync, redraw, Ready label, annihilation hook).
 *
 * Contract: All callbacks must be safe to invoke immediately after a successful tactical IPC or restore.
 * When to use: Passed to `buildDefaultTacticalBattleActivationSideEffects` from `renderer.ts` closures.
 * Expected outcome: `TacticalRendererStartBattleSideEffects` suitable for start and restore activation paths.
 * Exceptions: None; `scheduleAnnihilationExit` must tolerate being invoked when roster is not annihilated.
 */
export type TacticalBattleActivationBindings = {
  showMapToast: TacticalRendererStartBattleSideEffects['showMapToast'];
  syncTacticalEntryOverlay: TacticalRendererStartBattleSideEffects['syncTacticalEntryOverlay'];
  redraw: TacticalRendererStartBattleSideEffects['redraw'];
  refreshReadyButton: TacticalRendererStartBattleSideEffects['refreshReadyButton'];
  scheduleAnnihilationExit: TacticalRendererStartBattleSideEffects['scheduleAnnihilationExit'];
  /**
   * Rebuilds unit display-name lookup after `S.tacticalBattleSnapshot` changes so sidebar and tooltips resolve tactical ids.
   *
   * Contract: Safe to omit when tests inject minimal side effects; renderer supplies a real implementation in production.
   * When to use: Immediately after `assignBattleSnapshot` during tactical activation.
   * Expected outcome: `S.unitDisplayNameById` includes tactical sub-unit labels.
   * Exceptions: None.
   */
  rebuildUnitDisplayNameLookup?: () => void;
  /**
   * Syncs pending-order, ranged, and unit sidebars after stash removes strategic drafts so `#pending-orders-list` matches tactical mode immediately.
   *
   * Contract: Safe to omit in tests that only validate IPC callbacks.
   * When to use: Wired from the renderer as `refreshStrategicOrderSidebars` alongside tactical activation.
   * Expected outcome: Pass-through to `fx.refreshOrderSidebars` in `buildDefaultTacticalBattleActivationSideEffects`.
   * Exceptions: None.
   */
  refreshOrderSidebars?: () => void;
};

/**
 * Builds the shared side-effect bundle for tactical battle activation (IPC start success and snapshot restore).
 *
 * Contract: Mutates `S.tacticalBattleSnapshot` / `S.tacticalPhasePlanning` and drives tactical map entry.
 * When to use: Whenever `tacticalRendererApplyStartBattleIpcResult` or `tacticalRendererActivateRestoredBattleSnapshot` runs.
 * Expected outcome: One object identity pattern shared by magnifier entry and `applyGameStateSnapshot` restore.
 * Exceptions: None; invalid IPC outcomes never reach this helper.
 */
export function buildDefaultTacticalBattleActivationSideEffects(
  bindings: TacticalBattleActivationBindings
): TacticalRendererStartBattleSideEffects {
  return {
    showMapToast: bindings.showMapToast,
    assignBattleSnapshot: (battle) => {
      S.tacticalBattleSnapshot = battle;
      bindings.rebuildUnitDisplayNameLookup?.();
    },
    setPhasePlanning: (planning) => {
      S.tacticalPhasePlanning = planning;
    },
    enterTacticalView: enterTacticalMapView,
    setStrategicSidebarTactical: tacticalApplyStrategicSidebarForTacticalMode,
    refreshTacticalExitHud: tacticalUpdateExitButtonVisibility,
    scheduleAnnihilationExit: bindings.scheduleAnnihilationExit,
    refreshReadyButton: bindings.refreshReadyButton,
    syncTacticalEntryOverlay: bindings.syncTacticalEntryOverlay,
    redraw: bindings.redraw,
    refreshOrderSidebars: bindings.refreshOrderSidebars,
  };
}

/**
 * Dependency bundle for `startTacticalBattleFromEntryHex` so parameter parsing tools see a single function-body `{`.
 *
 * Contract: Mirrors the renderer bootstrap wiring for magnifier-driven tactical IPC without importing `renderer.ts`.
 * When to use: Passed from `renderer.ts` when launching tactical battles from contested strategic hexes.
 * Expected outcome: IPC availability, popup suppression, and activation side-effect factory are all explicit.
 * Exceptions: None.
 */
export type StartTacticalBattleFromEntryHexDeps = {
  hideBuildPopup: () => void;
  invokeStartTacticalBattle?: GameApi['startTacticalBattle'];
  getActivationSideEffects: () => TacticalRendererStartBattleSideEffects;
  onMissingStartTacticalBattleIpc: () => void;
  /**
   * Runs immediately before tactical activation so magnifier entry matches the melee-intercept Fight → `tacticalAutoStartStrategicH3Index` path (clear drafts, reload standing orders from main, refresh strategic sidebars).
   *
   * Purpose: Keeps the right-hand orders panel aligned with main state and emptied for tactical drafts once `stashStrategicOrderDraftsForTacticalSession` runs inside activation.
   * When to use: Wired from the renderer; omit only in tests that stub tactical IPC without strategic UI.
   * Expected outcome: `S.humanStandingOrders` reflects `listHumanStandingOrders` before stash captures or clears them.
   * Exceptions: None when omitted (backward-compatible tests).
   */
  prepareStrategicUiBeforeTacticalStart?: () => Promise<void>;
};

/**
 * IPC + UI preflight for starting tactical battle from a contested strategic magnifier target.
 *
 * Contract: Invokes `tacticalRendererApplyStartBattleIpcResult` with fresh activation side effects.
 * When to use: Map hit-testing and direct `.tactical-entry-btn` clicks after `hideBuildPopup` is appropriate.
 * Expected outcome: Tactical tactical mode on success; error toasts preserve milestone-2.1 messaging.
 * Exceptions: None; missing IPC short-circuits through `onMissingStartTacticalBattleIpc`.
 */
export async function startTacticalBattleFromEntryHex(
  enclosingStrategicH3Index: string,
  deps: StartTacticalBattleFromEntryHexDeps
): Promise<void> {
  const matchEpoch = currentRendererMatchEpoch();
  if (deps.prepareStrategicUiBeforeTacticalStart) {
    await deps.prepareStrategicUiBeforeTacticalStart();
  }
  if (!rendererMatchEpochCurrent(matchEpoch)) return;
  const resumedSession =
    S.gameState?.tacticalBattleSession &&
    S.gameState.tacticalBattleSession.enclosingStrategicH3Index === enclosingStrategicH3Index &&
    !S.tacticalBattleSnapshot
      ? S.gameState.tacticalBattleSession
      : null;
  if (resumedSession) {
    deps.hideBuildPopup();
    activateRestoredTacticalBattleFromMainSnapshot(resumedSession, deps.getActivationSideEffects());
    return;
  }
  const ipc = deps.invokeStartTacticalBattle;
  if (!ipc) {
    deps.onMissingStartTacticalBattleIpc();
    return;
  }
  deps.hideBuildPopup();
  const result: StartTacticalBattleIpcResult = await ipc({ enclosingStrategicH3Index });
  if (!rendererMatchEpochCurrent(matchEpoch)) return;
  tacticalRendererApplyStartBattleIpcResult(result, deps.getActivationSideEffects());
}

/**
 * Applies a main-process restored tactical snapshot using the same activation side effects as magnifier entry.
 *
 * Contract: Does not perform IPC; assumes strategic `getGameState` already validated the snapshot.
 * When to use: `applyGameStateSnapshot` when `nextState.tacticalBattleSession` attaches a battle the renderer lacked.
 * Expected outcome: Tactical HUD and tactical bounds match a freshly started tactical session.
 * Exceptions: None.
 */
export function activateRestoredTacticalBattleFromMainSnapshot(
  battle: TacticalBattleSnapshot,
  getActivationSideEffects: () => TacticalRendererStartBattleSideEffects
): void {
  tacticalRendererActivateRestoredBattleSnapshot(battle, getActivationSideEffects());
}

/**
 * Ends the tactical session in the main process then resumes strategic Ready handling.
 *
 * Contract: Spreads caller IO and injects current `window.gameApi.endTacticalBattle` after the spread so IPC always wins.
 * When to use: Tactical HUD exit button and annihilation modal `Exit Battle` confirmation.
 * Expected outcome: Clears renderer tactical snapshot, applies post-exit strategic state, restores living-unit stash drafts, refreshes order sidebars, then invokes Ready pipeline on success.
 * Exceptions: Surfaces toasts when IPC fails per `tacticalPerformBattleExit` contract.
 */
export async function performTacticalBattleExitWithGameApi(
  session: TacticalExitSessionAccessor,
  io: Omit<TacticalBattleExitIo, 'endTacticalBattle'>
): Promise<void> {
  await tacticalPerformBattleExit(session, {
    ...io,
    endTacticalBattle: window.gameApi?.endTacticalBattle,
  });
}

