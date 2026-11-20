/**
 * The replay panel's turn slider.
 *
 * Purpose: Dragging the slider previews the turn under the thumb without its dialogs, and letting go shows the released turn in full.
 * When to use: `wireReplaySlider` once from `wireReplayPanel`. `renderReplayPanel` asks `sliderThumbPinned` before it writes the slider or the turn field.
 * Expected outcome: The slider follows `replayPanel.ts`'s draw except while a drag or a release owns the thumb.
 * Exceptions: None. Failures are logged with `console.error`.
 */

import { stepNumber } from '../../shared/replayNavigation';
import { REPLAY_SLIDER_PREVIEW_INTERVAL_MS, createSliderPreviewScheduler, type SliderPreviewScheduler } from '../../shared/replaySliderPreview';
import { hideAiStrategyToast, hideMapToast } from '../chrome/mapToasts';
import { previewReplayStep, showReleasedReplayStep } from './replayStepPreview';
import { currentReplay } from './replayState';

/**
 * Whether the slider's thumb is held by a pointer.
 *
 * Purpose: Each preview redraws the panel, and a redraw that wrote the shown step into the slider would snap the thumb back under the pointer.
 * When to use: Set on `pointerdown` on the slider. Cleared on `change`, on a pointer release or cancel, and when replay ends.
 * Expected outcome: False except during a pointer drag. Keyboard steps never set it.
 * Exceptions: None.
 */
let sliderDragging = false;

/**
 * Whether the drag in progress has moved the thumb and closed the dialogs.
 *
 * Purpose: A drag that ends without a `change`, back on the turn it started from, must open that turn's dialogs again and show its own map, not the last preview's.
 * When to use: Set by the first `input` of a pointer drag. Cleared on `pointerdown`, on `change`, and by `endSliderDrag`.
 * Expected outcome: False except between a drag's first movement and its end.
 * Exceptions: None.
 */
let dragMoved = false;

/**
 * How many slider releases are still showing their step.
 *
 * Purpose: Each replay change during a release redraws the panel, and a redraw that wrote the last preview's step into the slider would jump the thumb back until the released step shows.
 * When to use: Raised on `change`, lowered when that release's step has shown or failed.
 * Expected outcome: Zero except while a released step loads.
 * Exceptions: None.
 */
let pendingSliderReleases = 0;

/**
 * The slider's preview scheduler.
 *
 * Purpose: The replay-change listener cancels it when replay ends, so no preview starts after that.
 * When to use: Built once by `wireReplaySlider`.
 * Expected outcome: Null until the slider is wired.
 * Exceptions: None.
 */
let sliderPreview: SliderPreviewScheduler | null = null;

/**
 * Reports whether a redraw must leave the slider and the turn field alone.
 *
 * Purpose: A drag and a release that is still loading both own the thumb.
 * When to use: `renderReplayPanel`.
 * Expected outcome: True while the thumb is held or a released step is still loading.
 * Exceptions: None.
 */
export function sliderThumbPinned(): boolean {
  return sliderDragging || pendingSliderReleases > 0;
}

/**
 * Shows a step in full from the slider, keeping the thumb pinned until it has shown.
 *
 * Purpose: A release, and a moved drag that ended where it began, both show their step with its dialogs.
 * When to use: From the slider's `change` and from `endSliderDrag`.
 * Expected outcome: The previews settle, then the step shows through `showReleasedReplayStep`. The panel is redrawn once the last pending release has shown or failed.
 * Exceptions: None. A failure is logged.
 */
function showFromSlider(index: number, scheduler: SliderPreviewScheduler, redraw: () => void): void {
  pendingSliderReleases += 1;
  void showReleasedReplayStep(index, () => scheduler.settle())
    .catch((error: unknown) => {
      console.error('replay slider release failed', error);
    })
    .finally(() => {
      pendingSliderReleases -= 1;
      if (pendingSliderReleases === 0) redraw();
    });
}

/**
 * Ends a pointer drag of the slider that no `change` ended.
 *
 * Purpose: A drag released where it began, or cancelled, fires no `change`, so the thumb must return to the step on screen. When the drag had moved, its previews changed the map and closed the dialogs, so the slider's step is shown again in full.
 * When to use: On `pointercancel`, and just after a pointer release.
 * Expected outcome: When the drag was still marked, it is cleared. A moved drag shows the slider's step with its dialogs. Either way the panel is redrawn. Nothing happens otherwise.
 * Exceptions: None.
 */
function endSliderDrag(slider: HTMLInputElement, scheduler: SliderPreviewScheduler, redraw: () => void): void {
  if (!sliderDragging) return;
  sliderDragging = false;
  const moved = dragMoved;
  dragMoved = false;
  if (moved && currentReplay() !== null) showFromSlider(Number(slider.value), scheduler, redraw);
  redraw();
}

/**
 * Writes the turn under the thumb into the field, and previews it during a pointer drag.
 *
 * Purpose: The field follows the thumb, and a drag moves the map without dialogs.
 * When to use: The slider's `input` event.
 * Expected outcome: The field holds the turn under the thumb. During a pointer drag the first movement closes the update dialog and the commanders' message dialog, and each movement asks for a preview.
 * Exceptions: None.
 */
function followThumb(slider: HTMLInputElement, scheduler: SliderPreviewScheduler): void {
  const state = currentReplay();
  const step = state?.timeline.steps[Number(slider.value)];
  const turn = state && step ? stepNumber(step, state.timeline.scope) : undefined;
  const field = document.getElementById('replay-turn-input') as HTMLInputElement | null;
  if (turn === undefined || !field) return;
  field.value = String(turn);
  field.removeAttribute('aria-invalid');
  // A key step fires change right after input and shows in full there, so only a pointer drag previews.
  if (!sliderDragging) return;
  if (!dragMoved) {
    // A preview opens no dialog, so the ones from the turn the drag left come down. The release opens the released turn's.
    dragMoved = true;
    hideMapToast();
    hideAiStrategyToast();
  }
  scheduler.request(Number(slider.value));
}

/**
 * Binds the slider.
 *
 * Purpose: Dragging previews the step under the thumb without its dialogs, through a scheduler that limits how often a step loads. Letting go shows the released step in full.
 * When to use: From `wireReplayPanel`, with `renderReplayPanel` as `redraw`.
 * Expected outcome: Input writes the turn under the thumb into the field, and during a pointer drag closes the dialogs once and asks for a preview. Change ends the drag, settles the previews, waits for the step on screen to settle, shows the released step with its dialogs, and redraws the panel. The thumb stays pinned until the last pending release has shown or failed, so the redraws in between do not move it. Keyboard steps fire input and change together and request no preview, so each key step is framed and applied once, by the full show with its dialogs. The slider stays enabled while a step loads, so it keeps focus, the arrow keys keep stepping it, and `p` and Escape still leave replay through the window key handler.
 * Exceptions: None.
 */
export function wireReplaySlider(slider: HTMLInputElement, redraw: () => void): void {
  const scheduler = createSliderPreviewScheduler({
    intervalMs: REPLAY_SLIDER_PREVIEW_INTERVAL_MS,
    show: previewReplayStep,
    now: () => performance.now(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (handle) => window.clearTimeout(handle as number),
  });
  sliderPreview = scheduler;
  const endDrag = (): void => endSliderDrag(slider, scheduler, redraw);
  slider.addEventListener('pointerdown', () => {
    sliderDragging = true;
    dragMoved = false;
  });
  slider.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointerup', () => {
    if (sliderDragging) window.setTimeout(endDrag, 0);
  });
  slider.addEventListener('input', () => followThumb(slider, scheduler));
  slider.addEventListener('change', () => {
    sliderDragging = false;
    dragMoved = false;
    showFromSlider(Number(slider.value), scheduler, redraw);
  });
}

/**
 * Forgets the slider's drag and previews when replay ends.
 *
 * Purpose: A preview must not start after replay is left, and the next replay's panel must follow its own step.
 * When to use: Subscribed with `onReplayChange` by `wireReplayPanel`.
 * Expected outcome: When replay is off, the scheduler is cancelled and the drag is cleared. Nothing happens while replay is on.
 * Exceptions: None.
 */
export function forgetSliderWhenReplayEnds(): void {
  if (currentReplay() !== null) return;
  sliderPreview?.cancel();
  sliderDragging = false;
  dragMoved = false;
}
