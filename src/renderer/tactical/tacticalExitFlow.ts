/**
 * Tactical exit, advance-turn, and annihilation-driven teardown flows extracted from the renderer entry module.
 */

import {
  tacticalBoundaryPlanningExitAllowed,
} from '../../shared/tacticalStateAssertions';
import { getTacticalAnnihilationOutcome, getTwoPartyAnnihilationOutcome } from '../../shared/tacticalAnnihilation';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { rendererSharedState as S } from '../core/state';
import { updateGameStateSidebar } from '../core/uiState';
import { exitTacticalMapView } from '../map/tacticalMapView';
import { clearAutomaticBattleFrameMemory, frameAutomaticStrategicUnits } from '../map/unitFrameCamera';
import type { DestroyedBattleParent } from '../../shared/destroyedBattleParent';
import { attachDestroyedBattleParents, waitingHeldBattleTurnUpdateId } from '../gameplay/heldBattleTurnUpdate';
import { showHeldBattleTurnUpdate } from '../gameplay/readyResolutionAnnouncements';
import { hideTacticalEntryLayer } from '../map/tacticalEntryLayer';
import { closeTacticalAnnihilationOutcomeDialog, openAiOnlyBattleResultDialog, openTacticalAnnihilationOutcomeDialog } from './tacticalAnnihilationDialog';
import { maybeObserveAutoAdvance } from '../gameplay/observeChrome';
import { restoreStrategicOrderDraftsAfterTacticalSession } from './tacticalStrategicOrderUiStash';
import { invalidateBackgroundAiRequest } from '../openRouter/openRouterRuntime';
import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import {
  tacticalApplyStrategicSidebarForTacticalMode,
  tacticalBattleExitTeardownTransientRendererState,
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
 * Expected outcome: Main tactical session clears, post-exit strategic state applies, living-unit stash restores, then Ready-equivalent continuation.
 * Exceptions: `endTacticalBattle` errors are logged to console and toast; caller returns early without clearing local snapshot.
 */
export type TacticalBattleExitIo = {
  endTacticalBattle?: () => Promise<unknown>;
  showMapToast: (message: string, options: { isError?: boolean }) => void;
  redraw: () => void;
  runReadyAfterExit: () => Promise<void>;
  /**
   * Syncs DOM sidebars after living-unit strategic drafts are restored so the right-hand panel does not keep tactical rows or omit restored standing orders until the next redraw.
   *
   * Purpose: Teardown clears shared ranged/air/ferry arrays; restore then refills living-unit strategic drafts; pending-orders and ranged sidebar nodes must refresh before `runReadyAfterExit`.
   * When to use: Wired from the renderer with `hideStackCallout`, `updatePendingOrdersSidebar`, `updateRangedSidebar`, and `updateSidebar`.
   * Expected outcome: DOM pending/ranged/unit panels match restored living-unit strategic drafts; stack callout closed if it referenced tactical-only selection.
   * Exceptions: None when omitted (optional).
   */
  refreshSidebarAfterTacticalDraftTeardown?: () => void;
  /**
   * Reloads strategic game state after main-process exit so stash restore can drop orders for parents eliminated on bailout.
   *
   * Purpose: `endTacticalBattle` may delete strategic parents after the last renderer snapshot; restore filters against `S.gameState.units`.
   * When to use: After local snapshot and map teardown, before `restoreStrategicOrderDraftsAfterTacticalSession`.
   * Expected outcome: `S.gameState` matches the post-exit roster; standing-order lists are not reloaded from the database.
   * Exceptions: Optional; caller swallows failures so exit still restores against the last-beat snapshot.
   */
  refreshStrategicSnapshotAfterExit?: () => Promise<void>;
};

/**
 * True after an automatic AI-only exit has already started for the current end.
 *
 * Purpose: The battle map redraws many times while the end IPC is in flight. Each redraw would leave again.
 * When to use: Set when the observe checkbox starts the exit. Cleared when a later beat has no end reason.
 * Expected outcome: One exit attempt per finished battle. A failed exit does not repeat on the next frame.
 * Exceptions: None.
 */
let aiOnlyExitStarted = false;

/**
 * Opens the annihilation win/loss modal when the roster is terminal; exit IPC runs only after the player confirms.
 *
 * Contract: No-op unless planning phase is active, snapshot exists, dialog not already open, and outcome is terminal.
 * When to use: Tactical draw paths after snapshot updates that may eliminate the last sub-units on a side.
 * Expected outcome: At most one modal per annihilation beat; `io.redraw` refreshes whether Exit Battle shows.
 * Exceptions: None.
 */
export function tacticalMaybeScheduleAnnihilationExit(session: TacticalExitSessionAccessor, io: TacticalBattleExitIo): void {
  if (S.tacticalAnnihilationOutcomeDialog != null || S.aiOnlyBattleResultSentence != null) return;
  const snap = session.getBattleSnapshot();
  if (!snap || !session.getPhasePlanning()) return;
  if (snap.leadPartyId != null) {
    if (snap.aiOnlyEndReason == null) {
      aiOnlyExitStarted = false;
      return;
    }
    if (S.resolutionMoveAnimation) return;
    const sentence = aiOnlyResultSentence(snap);
    if (sentence == null) return;
    if (S.autoAdvance) {
      if (aiOnlyExitStarted) return;
      aiOnlyExitStarted = true;
      void leaveAiOnlyBattle(session, io, true);
      return;
    }
    openAiOnlyBattleResultDialog(sentence);
    io.redraw();
    return;
  }
  const outcome = getTacticalAnnihilationOutcome(snap.subUnits);
  if (outcome === null) return;
  openTacticalAnnihilationOutcomeDialog(outcome);
  io.redraw();
}

/**
 * The result sentence for an AI-only battle that has already decided to end.
 *
 * Purpose: The overlay shows this text. A missing home name uses the seat id.
 * When to use: After playback, and not for the header Exit Battle control.
 * Expected outcome: Null while the battle continues.
 * Exceptions: None.
 */
function aiOnlyResultSentence(snap: TacticalBattleSnapshot): string | null {
  if (snap.aiOnlyEndReason == null || snap.leadPartyId == null || snap.opposingPartyId == null) return null;
  if (snap.aiOnlyEndReason === 'mutual') return 'All units destroyed.';
  if (snap.aiOnlyEndReason === 'exit') return 'The commanders left the battle.';
  if (snap.aiOnlyEndReason === 'idle') return 'The battle ended with no orders left to carry out.';
  const winner = getTwoPartyAnnihilationOutcome(snap.subUnits, snap.leadPartyId, snap.opposingPartyId);
  if (winner == null || winner === 'mutual') return 'All units destroyed.';
  const home = S.gameState?.seats?.find((seat) => seat.seatId === winner)?.homeRegion;
  return `${home && home.length > 0 ? home : winner} wins the battle.`;
}

/**
 * Leaves an AI-only battle without starting the next strategic turn inside the exit itself.
 *
 * Purpose: `tacticalPerformBattleExit` always presses Ready. That plus auto-advance would skip a turn.
 * When to use: A finished beat, Ok, and the header control while the observe checkbox is on.
 * Expected outcome: The session ends. Auto-advance presses Ready once after the snapshot is gone. A manual Ok does not. The update that was waiting before that Ready is shown. An update that Ready stashed for a new battle keeps waiting.
 * Exceptions: IPC failures toast and keep the snapshot, matching the human exit.
 */
export async function leaveAiOnlyBattle(
  session: TacticalExitSessionAccessor,
  io: TacticalBattleExitIo,
  autoAdvance: boolean,
): Promise<void> {
  await tacticalPerformBattleExit(session, { ...io, runReadyAfterExit: async () => {} });
  if (session.getBattleSnapshot() != null) return;
  S.aiOnlyBattleResultSentence = null;
  const waitingHoldId = waitingHeldBattleTurnUpdateId();
  if (autoAdvance) await maybeObserveAutoAdvance();
  if (waitingHoldId != null && waitingHeldBattleTurnUpdateId() === waitingHoldId) {
    await showHeldBattleTurnUpdate(true);
  }
}

/**
 * Ends the main-process tactical session, restores strategic map chrome, then runs Ready-equivalent flow.
 *
 * Contract: Early return when boundary check fails; does not throw on IPC errors (toast + return).
 * When to use: Tactical exit button and annihilation modal confirmation.
 * Expected outcome: In-flight Run-mode AI canceled, tactical drafts cleared, post-exit strategic snapshot applied, living-unit stash restored, sidebar DOM refreshed, Ready pipeline invoked on success path.
 * Exceptions: `endTacticalBattle` failures keep the renderer snapshot unchanged after a toast, unless a newer match has already started. Post-exit `getGameState` failures log and continue with the last-beat snapshot.
 */
export async function tacticalPerformBattleExit(session: TacticalExitSessionAccessor, io: TacticalBattleExitIo): Promise<void> {
  const boundary = tacticalBoundaryPlanningExitAllowed(session.getBattleSnapshot(), session.getPhasePlanning());
  if (!boundary.ok) return;
  const matchEpoch = currentRendererMatchEpoch();
  invalidateBackgroundAiRequest();
  try {
    if (io.endTacticalBattle) {
      const ended = await io.endTacticalBattle();
      attachDestroyedBattleParents(destroyedParentsFromEnd(ended));
    }
  } catch (err) {
    console.error('endTacticalBattle failed:', err);
    if (!rendererMatchEpochCurrent(matchEpoch)) return;
    io.showMapToast('Could not exit tactical battle.', { isError: true });
    return;
  }
  if (!rendererMatchEpochCurrent(matchEpoch)) return;
  tacticalBattleExitTeardownTransientRendererState();
  session.setBattleSnapshot(null);
  clearAutomaticBattleFrameMemory();
  closeTacticalAnnihilationOutcomeDialog();
  session.setPhasePlanning(true);
  exitTacticalMapView();
  tacticalApplyStrategicSidebarForTacticalMode(false);
  const tel = document.getElementById('tactical-entry-layer');
  if (tel) hideTacticalEntryLayer(tel, false);
  tacticalUpdateExitButtonVisibility();
  try {
    await io.refreshStrategicSnapshotAfterExit?.();
  } catch (err) {
    console.error('refreshStrategicSnapshotAfterExit failed:', err);
  }
  if (!rendererMatchEpochCurrent(matchEpoch)) return;
  updateGameStateSidebar(S.gameState);
  restoreStrategicOrderDraftsAfterTacticalSession();
  io.refreshSidebarAfterTacticalDraftTeardown?.();
  io.redraw();
  if (!rendererMatchEpochCurrent(matchEpoch)) return;
  frameAutomaticStrategicUnits();
  await io.runReadyAfterExit();
}

/**
 * Reads the parent list from an end-battle reply.
 *
 * Purpose: The reply is typed as unknown because several callers share the exit function.
 * When to use: Immediately after `endTacticalBattle` resolves.
 * Expected outcome: The array when the reply carries one, otherwise empty.
 * Exceptions: None.
 */
function destroyedParentsFromEnd(ended: unknown): readonly DestroyedBattleParent[] {
  if (!ended || typeof ended !== 'object' || !('destroyedParents' in ended)) return [];
  const parents = (ended as { destroyedParents?: unknown }).destroyedParents;
  return Array.isArray(parents) ? (parents as DestroyedBattleParent[]) : [];
}

