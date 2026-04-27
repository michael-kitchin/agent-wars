/**
 * Tactical exit, advance-turn, and annihilation-driven teardown flows extracted from the renderer entry module.
 */

import {
  tacticalBoundaryPlanningExitAllowed,
} from '../../shared/tacticalStateAssertions';
import { getTacticalAnnihilationOutcome } from '../../shared/tacticalAnnihilation';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { rendererSharedState as S } from '../core/state';
import { updateGameStateSidebar } from '../core/uiState';
import { exitTacticalMapView } from '../map/tacticalMapView';
import { hideTacticalEntryLayer } from '../map/tacticalEntryLayer';
import { closeTacticalAnnihilationOutcomeDialog, openTacticalAnnihilationOutcomeDialog } from './tacticalAnnihilationDialog';
import { restoreStrategicOrderDraftsAfterTacticalSession } from './tacticalStrategicOrderUiStash';
import {
  tacticalApplyStrategicSidebarForTacticalMode,
  tacticalUpdateExitButtonVisibility,
} from './tacticalUiOrchestration';

/**
 * Mutable session accessors for tactical snapshot and planning phase without hard-binding `rendererSharedState` type shape.
 *
 * Contract: Implementations read/write the same fields previously mutated inline in `renderer.ts`.
 * When to use: Pass closures around `S.tacticalBattleSnapshot` / `S.tacticalPhasePlanning` from the renderer bootstrap.
 * Expected outcome: Tactical exit/advance flows remain testable with fake session objects.
 * Exceptions: None.
 */
export type TacticalExitSessionAccessor = {
  getBattleSnapshot: () => TacticalBattleSnapshot | null;
  getPhasePlanning: () => boolean;
  setBattleSnapshot: (next: TacticalBattleSnapshot | null) => void;
  setPhasePlanning: (next: boolean) => void;
};

/**
 * IO surface for tactical exit that still depends on browser globals (`window.gameApi`) and renderer toasts.
 *
 * Contract: `endTacticalBattle` IPC is optional; failures surface through `showMapToast` and swallow to preserve UX.
 * When to use: `tacticalPerformBattleExit` wiring from renderer click handlers.
 * Expected outcome: Main tactical session clears before Ready-equivalent continuation.
 * Exceptions: `endTacticalBattle` errors are logged to console and toast; caller returns early without clearing local snapshot.
 */
export type TacticalBattleExitIo = {
  endTacticalBattle?: () => Promise<unknown>;
  showMapToast: (message: string, options: { isError?: boolean }) => void;
  redraw: () => void;
  runReadyAfterExit: () => Promise<void>;
};

/**
 * Opens the annihilation win/loss modal when the roster is terminal; exit IPC runs only after the player confirms.
 *
 * Contract: No-op unless planning phase is active, snapshot exists, dialog not already open, and outcome is terminal.
 * When to use: Tactical draw paths after snapshot updates that may eliminate the last sub-units on a side.
 * Expected outcome: At most one modal per annihilation beat; `io.redraw` refreshes HUD exit visibility.
 * Exceptions: None.
 */
export function tacticalMaybeScheduleAnnihilationExit(session: TacticalExitSessionAccessor, io: TacticalBattleExitIo): void {
  if (S.tacticalAnnihilationOutcomeDialog != null) return;
  const snap = session.getBattleSnapshot();
  if (!snap || !session.getPhasePlanning()) return;
  const outcome = getTacticalAnnihilationOutcome(snap.subUnits);
  if (outcome === null) return;
  openTacticalAnnihilationOutcomeDialog(outcome);
  io.redraw();
}

/**
 * Ends the main-process tactical session, restores strategic map chrome, then runs Ready-equivalent flow.
 *
 * Contract: Early return when boundary check fails; does not throw on IPC errors (toast + return).
 * When to use: Tactical exit button and annihilation modal confirmation.
 * Expected outcome: Local snapshot cleared, Leaflet bounds restored, Ready pipeline invoked on success path.
 * Exceptions: `endTacticalBattle` failures keep renderer snapshot unchanged after toast.
 */
export async function tacticalPerformBattleExit(session: TacticalExitSessionAccessor, io: TacticalBattleExitIo): Promise<void> {
  const boundary = tacticalBoundaryPlanningExitAllowed(session.getBattleSnapshot(), session.getPhasePlanning());
  if (!boundary.ok) return;
  try {
    if (io.endTacticalBattle) {
      await io.endTacticalBattle();
    }
  } catch (err) {
    console.error('endTacticalBattle failed:', err);
    io.showMapToast('Could not exit tactical battle.', { isError: true });
    return;
  }
  session.setBattleSnapshot(null);
  closeTacticalAnnihilationOutcomeDialog();
  S.tacticalOpponentDraft = null;
  S.tacticalDeferredPostBeatConsultPending = false;
  session.setPhasePlanning(true);
  exitTacticalMapView();
  tacticalApplyStrategicSidebarForTacticalMode(false);
  const tel = document.getElementById('tactical-entry-layer');
  if (tel) hideTacticalEntryLayer(tel, false);
  tacticalUpdateExitButtonVisibility();
  updateGameStateSidebar(S.gameState);
  restoreStrategicOrderDraftsAfterTacticalSession();
  io.redraw();
  await io.runReadyAfterExit();
}

