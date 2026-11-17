/**
 * The replay panel at the map's bottom-left.
 *
 * Purpose: The panel shows which turn replay is on and steps, jumps, or types to another turn. Every rule it applies comes from `replayNavigation.ts`.
 * When to use: `wireReplayPanel` once at startup. The panel redraws itself through `onReplayChange`.
 * Expected outcome: The panel shows while replay is on and hides otherwise. Collapsed, it shows the label and three buttons. Expanded, it adds the turn field and the slider above them.
 * Exceptions: None. Missing elements are skipped.
 */

import {
  canPlay,
  canSeek,
  canStepBack,
  canStepForward,
  parseTurnEntry,
  replayLabel,
  stepNumber,
  type ReplayPosition,
} from '../../shared/replayNavigation';
import { startPanelHeightSlide } from '../chrome/panelSlideHelpers';
import { showReplayStep } from './replayMode';
import { requestReplayPlaybackStop, startReplayPlayback } from './replayPlayback';
import { currentReplay, onReplayChange, type ReplayState } from './replayState';

/**
 * Tip and name of the expand control while the seek row is hidden.
 *
 * Purpose: The control says what its next click does.
 * When to use: `syncExpandControl`.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
const SHOW_SEEK_LABEL = 'Show the turn slider';

/**
 * Name of the expand control while the seek row is shown.
 *
 * Purpose: The control says what its next click does.
 * When to use: `syncExpandControl`.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
const HIDE_SEEK_LABEL = 'Hide the turn slider';

/**
 * Tip of the expand control while the seek row is shown.
 *
 * Purpose: The tip says what the next click does.
 * When to use: `syncExpandControl`.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
const HIDE_SEEK_TIP = 'Hide the slider and the turn field.';

/**
 * Tip of the expand control while the seek row is hidden.
 *
 * Purpose: The tip says what the next click does.
 * When to use: `syncExpandControl`.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
const SHOW_SEEK_TIP = 'Show the slider and the turn field.';

/**
 * Name of the Play button while playback is stopped.
 *
 * Purpose: The button says what its click does.
 * When to use: `syncPlayButton`.
 * Expected outcome: The exact word.
 * Exceptions: None.
 */
const PLAY_LABEL = 'Play';

/**
 * Tip of the Play button while playback is stopped.
 *
 * Purpose: The tip says what the click does.
 * When to use: `syncPlayButton`.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
const PLAY_TIP = 'Play the turns forward with their animations.';

/**
 * Name of the Play button while playback runs.
 *
 * Purpose: The button becomes Pause, and its name says so.
 * When to use: `syncPlayButton`.
 * Expected outcome: The exact word.
 * Exceptions: None.
 */
const PAUSE_LABEL = 'Pause';

/**
 * Tip of the Play button while playback runs.
 *
 * Purpose: The tip says that Pause waits for the turn in progress.
 * When to use: `syncPlayButton`.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
const PAUSE_TIP = 'Stop after this turn.';

/**
 * Outline of the play glyph.
 *
 * Purpose: The icon path shown while playback is stopped.
 * When to use: `syncPlayButton`.
 * Expected outcome: An SVG path in the 16 by 16 icon box.
 * Exceptions: None.
 */
const PLAY_GLYPH_PATH = 'M4 3l9 5-9 5z';

/**
 * Outline of the pause glyph.
 *
 * Purpose: The icon path shown while playback runs.
 * When to use: `syncPlayButton`.
 * Expected outcome: An SVG path in the 16 by 16 icon box.
 * Exceptions: None.
 */
const PAUSE_GLYPH_PATH = 'M4 3h3v10H4zM9 3h3v10H9z';

/**
 * Accessible name of the turn field and the slider in the strategic game.
 *
 * Purpose: Assistive technology names the controls by what they pick.
 * When to use: `renderReplayPanel`.
 * Expected outcome: The exact word.
 * Exceptions: None.
 */
const TURN_NOUN = 'Turn';

/**
 * Accessible name of the turn field and the slider inside a battle.
 *
 * Purpose: Inside a battle the controls pick a beat, not a turn.
 * When to use: `renderReplayPanel`.
 * Expected outcome: The exact word.
 * Exceptions: None.
 */
const BEAT_NOUN = 'Beat';

/**
 * Whether the player last chose the expanded state.
 *
 * Purpose: The choice lasts while replay is left and entered again.
 * When to use: Read and written only in this module.
 * Expected outcome: False when the app opens. Not saved.
 * Exceptions: None.
 */
let expanded = false;

/**
 * The slide in progress, if any.
 *
 * Purpose: A click during a slide starts the next slide from where this one is.
 * When to use: Set when a slide starts. Cleared when it ends or is cancelled.
 * Expected outcome: Null while the panel is settled.
 * Exceptions: None.
 */
let slide: Animation | null = null;

/**
 * Looks up an element by id.
 *
 * Purpose: The panel's controls are found the same way everywhere.
 * When to use: Any read of the panel's markup.
 * Expected outcome: The element, or null when the page lacks it.
 * Exceptions: None.
 */
function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/**
 * Sets the expand control's state, name, and tip from the player's choice.
 *
 * Purpose: Assistive technology and the tip must say what the next click does.
 * When to use: After the choice changes, and once at startup.
 * Expected outcome: `aria-expanded`, `aria-label`, and `data-control-tooltip` match `expanded`.
 * Exceptions: None.
 */
function syncExpandControl(button: HTMLElement): void {
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', expanded ? HIDE_SEEK_LABEL : SHOW_SEEK_LABEL);
  button.setAttribute('data-control-tooltip', expanded ? HIDE_SEEK_TIP : SHOW_SEEK_TIP);
}

/**
 * Ends the panel in the state the player chose, with no slide running.
 *
 * Purpose: One place that leaves the panel settled, after a slide or without one.
 * When to use: When a slide finishes, and when the panel is wired.
 * Expected outcome: `data-state` is `expanded` or `compact`.
 * Exceptions: None.
 */
function settlePanel(panel: HTMLElement): void {
  slide?.cancel();
  slide = null;
  panel.dataset.state = expanded ? 'expanded' : 'compact';
}

/**
 * Slides the panel's height from `from` to `to`, then settles it.
 *
 * Purpose: The panel's bottom edge stays put, so a changing height moves the bar up or down.
 * When to use: From `toggleExpanded`, after `data-state` shows the seek row.
 * Expected outcome: The panel settles at once when the slide cannot run. A slide that a later click replaced does not settle the panel.
 * Exceptions: None.
 */
function slidePanel(panel: HTMLElement, from: number, to: number): void {
  slide = startPanelHeightSlide(panel, from, to, (finished) => {
    if (slide === finished) settlePanel(panel);
  });
  if (!slide) settlePanel(panel);
}

/**
 * Switches the panel between compact and expanded.
 *
 * Purpose: The expand control's single action.
 * When to use: On a click on `#replay-panel-expand`.
 * Expected outcome: The choice flips at once. Expanding shows the seek row and grows the panel. Collapsing shrinks it to the bar.
 * Exceptions: None.
 */
function toggleExpanded(panel: HTMLElement, bar: HTMLElement, button: HTMLElement): void {
  const from = panel.getBoundingClientRect().height;
  slide?.cancel();
  slide = null;
  expanded = !expanded;
  syncExpandControl(button);
  if (expanded) {
    panel.dataset.state = 'expanding';
    slidePanel(panel, from, panel.getBoundingClientRect().height);
    return;
  }
  panel.dataset.state = 'collapsing';
  const borders = panel.offsetHeight - panel.clientHeight;
  slidePanel(panel, from, bar.offsetHeight + borders);
}

/**
 * Reads where replay is as a position the button rules take.
 *
 * Purpose: The three button rules read one object.
 * When to use: Drawing the panel.
 * Expected outcome: The step count, the index, and the busy flag, or null when replay is off.
 * Exceptions: None.
 */
function currentPosition(): ReplayPosition | null {
  const state = currentReplay();
  return state
    ? { stepCount: state.timeline.steps.length, index: state.index, busy: state.busy, playing: state.playing }
    : null;
}

/**
 * Shows the Play button as Play or as Pause.
 *
 * Purpose: While playback runs the same button stops it, so its icon, name, and tip change.
 * When to use: Each time the panel is drawn.
 * Expected outcome: The glyph, `aria-label`, and `data-control-tooltip` match `playing`, and the button is enabled by `canPlay`.
 * Exceptions: None.
 */
function syncPlayButton(play: HTMLButtonElement, position: ReplayPosition): void {
  const playing = position.playing;
  play.setAttribute('aria-label', playing ? PAUSE_LABEL : PLAY_LABEL);
  play.setAttribute('data-control-tooltip', playing ? PAUSE_TIP : PLAY_TIP);
  play.querySelector('path')?.setAttribute('d', playing ? PAUSE_GLYPH_PATH : PLAY_GLYPH_PATH);
  play.disabled = !canPlay(position);
}

/**
 * Draws the panel from the replay state.
 *
 * Purpose: Every change to replay redraws the panel through one function.
 * When to use: Subscribed with `onReplayChange`, and called after a request that changed nothing.
 * Expected outcome: The panel shows while replay is on and hides otherwise. The label, the slider, the turn field, and the three buttons match the state. A field with focus keeps what the player typed.
 * Exceptions: None. Missing elements are skipped.
 */
export function renderReplayPanel(): void {
  const panel = byId('replay-panel');
  if (!panel) return;
  const state = currentReplay();
  const position = currentPosition();
  if (!state || !position) {
    panel.setAttribute('hidden', '');
    return;
  }
  panel.removeAttribute('hidden');
  const label = byId('replay-panel-label');
  if (label) label.textContent = replayLabel(state.timeline.steps, state.index, state.timeline.scope);
  const unit = state.timeline.scope === 'tactical' ? BEAT_NOUN : TURN_NOUN;
  const slider = byId<HTMLInputElement>('replay-slider');
  if (slider) {
    slider.setAttribute('aria-label', unit);
    slider.max = String(Math.max(0, position.stepCount - 1));
    slider.value = String(state.index);
    slider.disabled = !canSeek(position);
  }
  const field = byId<HTMLInputElement>('replay-turn-input');
  field?.setAttribute('aria-label', unit);
  if (field && document.activeElement !== field) {
    field.value = shownNumberText(state);
    field.removeAttribute('aria-invalid');
  }
  if (field) field.disabled = !canSeek(position);
  const back = byId<HTMLButtonElement>('replay-step-back');
  const forward = byId<HTMLButtonElement>('replay-step-forward');
  const play = byId<HTMLButtonElement>('replay-play');
  if (back) back.disabled = !canStepBack(position);
  if (forward) forward.disabled = !canStepForward(position);
  if (play) syncPlayButton(play, position);
}

/**
 * The number the turn field shows for the step on screen.
 *
 * Purpose: The field holds the turn in the strategic game and the beat inside a battle.
 * When to use: Drawing the panel and restoring the field.
 * Expected outcome: The shown step's number as text, or an empty string.
 * Exceptions: None.
 */
function shownNumberText(state: ReplayState): string {
  const step = state.timeline.steps[state.index];
  return step ? String(stepNumber(step, state.timeline.scope)) : '';
}

/**
 * Restores the turn field to the step on screen.
 *
 * Purpose: Escape in the field, and a slider that did not move, put the field back.
 * When to use: After an entry that is not acted on.
 * Expected outcome: The field shows the current turn and has no red border.
 * Exceptions: None.
 */
function restoreTurnField(field: HTMLInputElement): void {
  const state = currentReplay();
  field.value = state ? shownNumberText(state) : '';
  field.removeAttribute('aria-invalid');
}

/**
 * Checks the typed turn and marks the field.
 *
 * Purpose: An invalid entry gets a red border as it is typed.
 * When to use: On every input event in the turn field, and before a jump.
 * Expected outcome: `aria-invalid` is `true` for an invalid entry and absent otherwise. Returns the step index for a valid entry.
 * Exceptions: None.
 */
function validateTurnField(field: HTMLInputElement): number | null {
  const state = currentReplay();
  if (!state) return null;
  const parsed = parseTurnEntry(field.value, state.timeline.steps, state.timeline.scope);
  if ('error' in parsed) {
    field.setAttribute('aria-invalid', 'true');
    return null;
  }
  field.removeAttribute('aria-invalid');
  return parsed.index;
}

/**
 * Jumps to the typed turn when it is valid and is not already on screen.
 *
 * Purpose: Enter and leaving the field both commit an entry.
 * When to use: On Enter and on blur in the turn field.
 * Expected outcome: A valid other turn is shown. An invalid entry stays as typed with its red border, and nothing moves.
 * Exceptions: None.
 */
function commitTurnField(field: HTMLInputElement): void {
  const index = validateTurnField(field);
  const state = currentReplay();
  if (index === null || !state || index === state.index) return;
  void showReplayStep(index);
}

/**
 * Binds the turn field.
 *
 * Purpose: Typing, Enter, Escape, and blur are the field's whole behavior.
 * When to use: From `wireReplayPanel`.
 * Expected outcome: Input validates, Enter and blur commit, and Escape restores the number without leaving replay.
 * Exceptions: None.
 */
function wireTurnField(field: HTMLInputElement): void {
  field.addEventListener('input', () => {
    validateTurnField(field);
  });
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTurnField(field);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      restoreTurnField(field);
    }
  });
  field.addEventListener('blur', () => commitTurnField(field));
}

/**
 * Binds the slider.
 *
 * Purpose: Dragging only moves the thumb and the field. The map changes when the thumb is released.
 * When to use: From `wireReplayPanel`.
 * Expected outcome: Input writes the turn under the thumb into the field. Change shows that step and redraws the panel. The slider keeps focus, so the arrow keys keep stepping it, and `p` and Escape still leave replay through the window key handler.
 * Exceptions: None.
 */
function wireSlider(slider: HTMLInputElement): void {
  slider.addEventListener('input', () => {
    const state = currentReplay();
    const step = state?.timeline.steps[Number(slider.value)];
    const turn = state && step ? stepNumber(step, state.timeline.scope) : undefined;
    const field = byId<HTMLInputElement>('replay-turn-input');
    if (turn === undefined || !field) return;
    field.value = String(turn);
    field.removeAttribute('aria-invalid');
  });
  slider.addEventListener('change', () => {
    void showReplayStep(Number(slider.value)).then(() => {
      renderReplayPanel();
    });
  });
}

/**
 * Wires the panel and subscribes it to replay changes.
 *
 * Purpose: The panel's single setup point.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: The controls act, and the panel redraws after every change to replay.
 * Exceptions: None. Does nothing when the markup is missing.
 */
export function wireReplayPanel(): void {
  const panel = byId('replay-panel');
  const bar = byId('replay-panel-bar');
  const button = byId('replay-panel-expand');
  const field = byId<HTMLInputElement>('replay-turn-input');
  const slider = byId<HTMLInputElement>('replay-slider');
  if (!panel || !bar || !button || !field || !slider) return;
  settlePanel(panel);
  syncExpandControl(button);
  button.addEventListener('click', () => toggleExpanded(panel, bar, button));
  byId('replay-step-back')?.addEventListener('click', () => {
    const state = currentReplay();
    if (state) void showReplayStep(state.index - 1);
  });
  byId('replay-step-forward')?.addEventListener('click', () => {
    const state = currentReplay();
    if (state) void showReplayStep(state.index + 1);
  });
  byId('replay-play')?.addEventListener('click', () => {
    if (currentReplay()?.playing) requestReplayPlaybackStop();
    else void startReplayPlayback();
  });
  wireTurnField(field);
  wireSlider(slider);
  onReplayChange(renderReplayPanel);
}
