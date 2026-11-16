/**
 * Plays the recorded steps forward with their resolution animations.
 *
 * Purpose: Play shows each step with its dialogs for a moment, then runs the animation that led into the next step, the way the live turn ran it.
 * When to use: The replay panel's Play button starts it and its Pause button stops it.
 * Expected outcome: Steps are shown in order until the last one or a stop. Nothing is sent to the main process except reads of recorded steps, and no playback-complete notification is sent.
 * Exceptions: None. A failed step read ends playback with a sentence.
 */

import type { CommitHumanTacticalDraftOrdersIpcResult, ReadyResult } from '../../shared/ipcTypes';
import { REPLAY_PLAYBACK_DWELL_MS, nextPlaybackIndex, type ReplayPosition } from '../../shared/replayNavigation';
import type { ReplayStepView } from '../../shared/replayTypes';
import { ferriesHeldUntilMovementEnds, ordersHeldUntilMovementEnds } from '../../shared/ordersHeldForPlayback';
import { rendererMatchEpochCurrent } from '../core/matchEpoch';
import { rendererSharedState as S } from '../core/state';
import { buildStrategicResolutionAnimation, startResolutionAnimationFrames } from '../gameplay/resolutionAnimationStart';
import { planResolutionPlayback } from '../gameplay/resolutionPlaybackPlan';
import { buildTacticalResolutionAnimation, tacticalPlaybackNeeded } from '../gameplay/tacticalAnimationStart';
import {
  hasQueuedResolutionPlaybackCompleteNotify,
  waitForNextResolutionPlaybackFinished,
} from '../openRouter/resolutionPlaybackDeferral';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import { clearResolutionPlaybackAnimationState } from '../tactical/tacticalUiOrchestration';
import { REPLAY_STEP_FAILED_REASON, loadReplayStep, presentReplayStep, replayReadyDeps } from './replayMode';
import { currentReplay, setReplay, type ReplayState } from './replayState';

/**
 * Reads the replay state as the position the playback rules take.
 *
 * Purpose: The play loop asks `nextPlaybackIndex` with the same object the panel uses.
 * When to use: Each pass of the play loop.
 * Expected outcome: The step count, the index, and the flags.
 * Exceptions: None.
 */
function positionOf(state: ReplayState): ReplayPosition {
  return { stepCount: state.timeline.steps.length, index: state.index, busy: state.busy, playing: state.playing };
}

/**
 * Tells whether the loop that started in a given replay may keep going.
 *
 * Purpose: Leaving replay, entering it again, or starting a new match must end a loop that is waiting.
 * When to use: After every wait in the play loop.
 * Expected outcome: True only while the same entry into replay is on, in the same match, and playback is still marked as running.
 * Exceptions: None.
 */
function playbackContinues(session: number, matchEpoch: number): boolean {
  const state = currentReplay();
  return state !== null && state.session === session && state.playing && rendererMatchEpochCurrent(matchEpoch);
}

/**
 * Waits while the step on screen is held.
 *
 * Purpose: The step shows with its dialogs for `REPLAY_PLAYBACK_DWELL_MS` before the animations into the next step start. This is the loop's only timer.
 * When to use: Before each step is loaded.
 * Expected outcome: Resolves after the hold.
 * Exceptions: None.
 */
function holdReplayStep(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, REPLAY_PLAYBACK_DWELL_MS);
  });
}

/**
 * Builds the animation for a step that has a recorded strategic result.
 *
 * Purpose: Replay builds the same animation the live turn built, from the recorded result. A past turn's order arrows are not drawn, so the order lists are empty.
 * When to use: Before the step's snapshot is applied, so the animation starts from the positions before the turn.
 * Expected outcome: The animation state with its clock held, or null when the step has no result or the result shows nothing to animate.
 * Exceptions: None.
 */
function strategicAnimationFor(view: ReplayStepView): NonNullable<typeof S.resolutionMoveAnimation> | null {
  if (view.resolution === null) return null;
  const readyResult = view.resolution as ReadyResult;
  const humanMoves = readyResult.humanMoves ?? [];
  const visibleHexesBeforeTurn = new Set(view.visibleHexesBefore ?? []);
  const plan = planResolutionPlayback({
    readyResult,
    state: view.snapshot,
    humanMoves,
    visibleHexesBeforeTurn,
    deps: replayReadyDeps(),
  });
  if (!plan.needsAnimation) return null;
  return buildStrategicResolutionAnimation({
    plan,
    readyResult,
    visibleHexesBeforeTurn,
    marchArrowsUntilMovementEnds: ordersHeldUntilMovementEnds([], view.snapshot.units, humanMoves),
    ferryArrowsUntilMovementEnds: ferriesHeldUntilMovementEnds([], humanMoves),
  });
}

/**
 * Builds the animation for a battle beat that has a recorded result.
 *
 * Purpose: Replay builds the same animation the live beat built, from the recorded playback and the sub-units from before the beat.
 * When to use: Before the beat's snapshot is applied, so the animation starts from the positions before the beat.
 * Expected outcome: The animation state with its clock held, or null when the beat has no result or nothing to animate.
 * Exceptions: None.
 */
function tacticalAnimationFor(view: ReplayStepView): NonNullable<typeof S.resolutionMoveAnimation> | null {
  const playback = (view.resolution as CommitHumanTacticalDraftOrdersIpcResult | null)?.tacticalResolutionPlayback;
  if (!playback || !tacticalPlaybackNeeded(playback)) return null;
  return buildTacticalResolutionAnimation({ playback, subUnitsBefore: view.subUnitsBefore, deps: replayReadyDeps() });
}

/**
 * Shows one step during playback and waits for its animation to end.
 *
 * Purpose: One pass of the loop: apply the step, show its dialogs, then run the animation that led into it.
 * When to use: From the play loop, after the hold and the load.
 * Expected outcome: The step is on screen and its animation, if it had one, has finished or was cancelled.
 * Exceptions: Propagates a failure of the snapshot or the dialogs to the loop's catch.
 */
async function playReplayStep(index: number, view: ReplayStepView): Promise<void> {
  const animation = view.ref.scope === 'tactical' ? tacticalAnimationFor(view) : strategicAnimationFor(view);
  if (animation) S.resolutionMoveAnimation = animation;
  await presentReplayStep(index, view, { forPlayback: animation !== null });
  if (!animation) return;
  const finished = waitForNextResolutionPlaybackFinished();
  startResolutionAnimationFrames(replayReadyDeps().tickResolutionMoveAnimation);
  await finished;
}

/**
 * Plays the recorded steps forward from the one on screen.
 *
 * Purpose: The Play button's whole behavior, over the strategic turns or over a battle's beats. Each pass holds the step on screen, loads the next one, shows it with its dialogs, and runs its animation.
 * When to use: When Play is pressed while replay is on and a later step exists.
 * Expected outcome: Playback ends on the last step, after a stop request, when replay is left, or when a step cannot be loaded. Play is refused while a live turn's notification is still queued.
 * Exceptions: None. A failure is logged with `console.error`, shown as a sentence, and ends playback.
 */
export async function startReplayPlayback(): Promise<void> {
  const start = currentReplay();
  if (!start || start.playing || start.busy || hasQueuedResolutionPlaybackCompleteNotify()) return;
  const { session, matchEpoch } = start;
  if (nextPlaybackIndex({ ...positionOf(start), playing: true }, false) === null) return;
  setReplay({ ...start, playing: true, stopRequested: false });
  try {
    while (playbackContinues(session, matchEpoch)) {
      const state = currentReplay();
      if (!state || nextPlaybackIndex(positionOf(state), state.stopRequested) === null) break;
      await holdReplayStep();
      const holding = currentReplay();
      if (!playbackContinues(session, matchEpoch) || !holding) break;
      const index = nextPlaybackIndex(positionOf(holding), holding.stopRequested);
      if (index === null) break;
      const view = await loadReplayStep(index);
      if (!view || !playbackContinues(session, matchEpoch)) break;
      await playReplayStep(index, view);
    }
  } catch (error) {
    console.error('replay playback failed', error);
    clearResolutionPlaybackAnimationState();
    showMapToast(REPLAY_STEP_FAILED_REASON, { isError: false, skipReport: true });
  } finally {
    const end = currentReplay();
    if (end && end.session === session) setReplay({ ...end, playing: false, stopRequested: false });
  }
}

/**
 * Asks playback to stop after the turn that is animating.
 *
 * Purpose: The Pause button. The loop ends once the step in progress has finished.
 * When to use: When Pause is pressed while playback runs.
 * Expected outcome: The stop flag is set. Nothing happens when replay is off or not playing.
 * Exceptions: None.
 */
export function requestReplayPlaybackStop(): void {
  const state = currentReplay();
  if (state?.playing) setReplay({ ...state, stopRequested: true });
}
