/**
 * The text on one commander card.
 *
 * Purpose: The Commanders tab and its tests share one wording for each status.
 * When to use: While painting a card, and in tests.
 * Expected outcome: A chip, an optional line under the name, and whether the card is dimmed.
 * Exceptions: None.
 */

import { AI_CONSULTATION_WALL_CLOCK_MS } from './aiConsultationLimits';
import type { CommanderStatus } from './commanderStatus';

/**
 * What one card says about its commander.
 *
 * Purpose: The renderer paints this and does not choose the words.
 * When to use: Returned by `commanderCardPresentation`.
 * Expected outcome: `detail` is set only for a timed-out consult.
 * Exceptions: None.
 */
export interface CommanderCardPresentation {
  /**
   * The status chip.
   *
   * Contract: One of the five status phrases.
   * When to use: The chip on the card.
   * Expected outcome: "Planning" includes a clock. "Out" includes the turn when one is known.
   * Exceptions: None.
   */
  readonly chip: string;
  /**
   * The line under the name, or null.
   *
   * Contract: Null except after a timeout.
   * When to use: Under the side's name.
   * Expected outcome: The timeout sentence, including the turn.
   * Exceptions: None.
   */
  readonly detail: string | null;
  /**
   * True when the seat is knocked out.
   *
   * Contract: True only for status `out`.
   * When to use: Dimming the card.
   * Expected outcome: The summary button is disabled as well.
   * Exceptions: None.
   */
  readonly dimmed: boolean;
  /**
   * True when the summary button does nothing.
   *
   * Contract: True when `dimmed` is true.
   * When to use: The commander summary button.
   * Expected outcome: A knocked-out seat cannot be edited.
   * Exceptions: None.
   */
  readonly summaryDisabled: boolean;
}

/**
 * Formats a duration as m:ss.
 *
 * Purpose: Planning and the timeout sentence use one clock.
 * When to use: `commanderCardPresentation`.
 * Expected outcome: Seconds are two digits. Minutes are not padded.
 * Exceptions: None.
 */
export function formatCommanderClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The chip and extra line for one commander status.
 *
 * Purpose: Planning, ready, no model, timed out, and out each have fixed words.
 * When to use: Each card. Pass the seat's pool row, or `out` when the seat is knocked out.
 * Expected outcome: A timed-out card names the wait and the turn. An out card is dimmed.
 * Exceptions: None.
 */
export function commanderCardPresentation(input: {
  readonly status: CommanderStatus;
  readonly planningElapsedMs: number;
  readonly timedOutTurn: number | null;
  readonly outTurn: number | null;
}): CommanderCardPresentation {
  if (input.status === 'out' || input.outTurn !== null) {
    const turn = input.outTurn ?? input.timedOutTurn;
    return {
      chip: turn === null ? 'Out' : `Out, turn ${turn}`,
      detail: null,
      dimmed: true,
      summaryDisabled: true,
    };
  }
  if (input.status === 'planning') {
    return { chip: `Planning ${formatCommanderClock(input.planningElapsedMs)}`, detail: null, dimmed: false, summaryDisabled: false };
  }
  if (input.status === 'timed_out') {
    const waited = formatCommanderClock(input.planningElapsedMs || AI_CONSULTATION_WALL_CLOCK_MS);
    const cap = formatCommanderClock(AI_CONSULTATION_WALL_CLOCK_MS);
    const turn = input.timedOutTurn ?? 0;
    return {
      chip: 'Timed out',
      detail: `No reply in ${waited} of ${cap} on turn ${turn}. Its standing orders ran instead.`,
      dimmed: false,
      summaryDisabled: false,
    };
  }
  if (input.status === 'no_model') {
    return { chip: 'Standing orders', detail: null, dimmed: false, summaryDisabled: false };
  }
  return { chip: 'Ready', detail: null, dimmed: false, summaryDisabled: false };
}
