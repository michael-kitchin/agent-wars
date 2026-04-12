/**
 * Tactical exit, advance-turn, and annihilation-driven teardown flows extracted from the renderer entry module.
 */

import {
  tacticalBoundaryPlanningAdvanceAllowed,
  tacticalBoundaryPlanningExitAllowed,
} from '../../shared/tacticalStateAssertions';
import { shouldEndTacticalBattleForAnnihilation } from '../../shared/tacticalAnnihilation';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  TACTICAL_ADVANCE_BACKGROUND_AI_POLL_MS,
  TACTICAL_ADVANCE_BACKGROUND_AI_TIMEOUT_MS,
} from '../core/constants';
import { exitTacticalMapView } from '../map/tacticalMapView';
import { hideTacticalEntryLayer } from '../map/tacticalEntryLayer';
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
 * IO surface for tactical advance-turn including optional background AI wait loop controls.
 *
 * Contract: `advanceTacticalTurn` IPC must exist before calling; renderer should preflight availability separately and provide background-request state polling.
 * When to use: `tacticalPerformAdvanceTurn` from tactical advance button handler.
 * Expected outcome: Snapshot increments on success; planning phase restores on failure or completion.
 * Exceptions: IPC errors restore planning phase and toast.
 */
export type TacticalAdvanceTurnIo = {
  advanceTacticalTurn: () => Promise<{
    success: boolean;
    battle?: TacticalBattleSnapshot;
    reason?: string;
  }>;
  showMapToast: (message: string, options: { isError?: boolean }) => void;
  redraw: () => void;
  startBackgroundRequestIfAllowed: () => void;
  isBackgroundRequestInFlight: () => boolean;
  scheduleAnnihilationExit: () => void;
};

let tacticalAnnihilationExitInFlight = false;

/**
 * Schedules Ready-equivalent tactical exit when the roster shows annihilation (one side has zero sub-units).
 *
 * Contract: No-op unless planning phase is active and snapshot indicates annihilation.
 * When to use: Tactical draw paths after snapshot updates that may eliminate the last sub-units on a side.
 * Expected outcome: One toast plus one exit attempt per guard window.
 * Exceptions: Swallowed errors still clear the in-flight guard via `finally`.
 */
export function tacticalMaybeScheduleAnnihilationExit(session: TacticalExitSessionAccessor, io: TacticalBattleExitIo): void {
  if (tacticalAnnihilationExitInFlight) return;
  const snap = session.getBattleSnapshot();
  if (!snap || !session.getPhasePlanning()) return;
  if (!shouldEndTacticalBattleForAnnihilation(snap.subUnits)) return;
  tacticalAnnihilationExitInFlight = true;
  void (async () => {
    try {
      io.showMapToast('Tactical battle ended — one side has no remaining sub-units.', {});
      await tacticalPerformBattleExit(session, io);
    } finally {
      tacticalAnnihilationExitInFlight = false;
    }
  })();
}

/**
 * Ends the main-process tactical session, restores strategic map chrome, then runs Ready-equivalent flow.
 *
 * Contract: Early return when boundary check fails; does not throw on IPC errors (toast + return).
 * When to use: Tactical exit button and annihilation-driven auto exit.
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
  session.setPhasePlanning(true);
  exitTacticalMapView();
  tacticalApplyStrategicSidebarForTacticalMode(false);
  const tel = document.getElementById('tactical-entry-layer');
  if (tel) hideTacticalEntryLayer(tel, false);
  tacticalUpdateExitButtonVisibility();
  io.redraw();
  await io.runReadyAfterExit();
}

/**
 * Advances the main-process tactical turn and optionally waits for background AI planning to settle.
 *
 * Contract: Restores `tacticalPhasePlanning` on all failure paths and after the background wait loop completes.
 * When to use: Tactical advance button during milestone-2.1 tactical WEGO beats.
 * Expected outcome: Snapshot updates on success; controls re-enable after AI wait or timeout toast.
 * Exceptions: IPC errors restore planning and toast.
 */
export async function tacticalPerformAdvanceTurn(
  session: TacticalExitSessionAccessor,
  io: TacticalAdvanceTurnIo
): Promise<void> {
  const boundary = tacticalBoundaryPlanningAdvanceAllowed(session.getBattleSnapshot(), session.getPhasePlanning());
  if (!boundary.ok) return;
  session.setPhasePlanning(false);
  tacticalUpdateExitButtonVisibility();
  io.redraw();
  try {
    const result = await io.advanceTacticalTurn();
    if (!result.success || !result.battle) {
      io.showMapToast(result.reason ?? 'Could not advance tactical turn.', { isError: true });
      session.setPhasePlanning(true);
      tacticalUpdateExitButtonVisibility();
      io.redraw();
      return;
    }
    session.setBattleSnapshot(result.battle);
    tacticalUpdateExitButtonVisibility();
    io.redraw();

    io.startBackgroundRequestIfAllowed();
    await new Promise<void>((resolve) => {
      queueMicrotask(() => resolve());
    });
    const deadline = Date.now() + TACTICAL_ADVANCE_BACKGROUND_AI_TIMEOUT_MS;
    while (io.isBackgroundRequestInFlight() && Date.now() < deadline) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, TACTICAL_ADVANCE_BACKGROUND_AI_POLL_MS);
      });
    }
    if (io.isBackgroundRequestInFlight()) {
      io.showMapToast('Tactical AI planning is still running; controls unlocked.', {});
    }

    session.setPhasePlanning(true);
    tacticalUpdateExitButtonVisibility();
    io.scheduleAnnihilationExit();
    io.redraw();
  } catch (err) {
    console.error('advanceTacticalTurn failed:', err);
    io.showMapToast('Could not advance tactical turn.', { isError: true });
    session.setPhasePlanning(true);
    tacticalUpdateExitButtonVisibility();
    io.redraw();
  }
}
