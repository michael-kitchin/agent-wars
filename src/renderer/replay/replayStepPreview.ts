/**
 * Shows replay steps while the slider is dragged, and the released step once it is let go.
 *
 * Purpose: A dragged slider moves the map, the top bar, and the panels to the step under the thumb without opening its dialogs. The step where the thumb is let go is then shown in full, dialogs included.
 * When to use: The replay panel's slider, through its preview scheduler.
 * Expected outcome: Previews never run while playback runs or replay is leaving, and the released step always opens its dialogs once.
 * Exceptions: None. Failures are logged with `console.error`.
 */

import { frameReplayStepIfFollowing } from './replayCamera';
import { loadReplayStep, presentReplayStep, replayIsLeaving, showReplayStep } from './replayMode';
import { currentReplay, replayActive, waitForStepToSettle } from './replayState';

/**
 * Tells whether a step may be shown from the slider now.
 *
 * Purpose: The slider must not compete with playback or with a leave for the screen.
 * When to use: Before and after loading a preview, and before showing the released step.
 * Expected outcome: True only while replay is on, not playing, and not leaving.
 * Exceptions: None.
 */
function sliderMayShowStep(): boolean {
  return replayActive() && currentReplay()?.playing !== true && !replayIsLeaving();
}

/**
 * Shows one step without its dialogs.
 *
 * Purpose: The slider's preview while the thumb moves.
 * When to use: As the `show` of the slider's preview scheduler.
 * Expected outcome: The map, the top bar, and the panels show the step, and it becomes the current step, so the panel label follows. With follow-units on, the camera then fits the step's units. Nothing happens when replay is off, playing, or leaving, or when another step is loading. A preview whose load ends after a leave began is not presented.
 * Exceptions: None. A failure is logged and the old step stays current.
 */
export async function previewReplayStep(index: number): Promise<void> {
  if (!sliderMayShowStep()) return;
  try {
    const view = await loadReplayStep(index);
    if (!view || !sliderMayShowStep()) return;
    await presentReplayStep(index, view, { forPlayback: false, showDialogs: false });
    frameReplayStepIfFollowing();
  } catch (error) {
    console.error('replay slider preview failed', error);
  }
}

/**
 * Shows the step where the slider was let go, with its dialogs.
 *
 * Purpose: The release must show its step in full even when the last preview showed the same index, and `loadReplayStep` refuses while a preview is still busy.
 * When to use: On the slider's `change` event, with the scheduler's `settle`.
 * Expected outcome: The running preview finishes, a waiting one is dropped, no step is busy, and then the step is shown through `showReplayStep`. Nothing is shown when replay ended or began leaving meanwhile.
 * Exceptions: None. A failure is logged and the old step stays current.
 */
export async function showReleasedReplayStep(index: number, settle: () => Promise<void>): Promise<void> {
  await settle();
  await waitForStepToSettle();
  if (!sliderMayShowStep()) return;
  try {
    await showReplayStep(index);
  } catch (error) {
    console.error('replay slider release could not show the step', error);
  }
}
