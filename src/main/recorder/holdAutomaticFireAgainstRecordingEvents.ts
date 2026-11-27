/**
 * The recorder event for a change to a commander's automatic-fire list.
 *
 * Purpose: The stored row keeps only the current list. The recording keeps each change.
 * When to use: When an orders reply changes the list.
 * Expected outcome: One event visible only to the commander that owns the list, with no display text.
 * Exceptions: None. `recordMatchEvent` swallows its own failure.
 */

import { logDebug } from '../logger';
import { stepKeyText, type StepKey } from '../../shared/matchRecording';
import { recordMatchEvent } from './matchRecorder';

/**
 * Records one change to a commander's list.
 *
 * Purpose: Keeps the list before and after the change.
 * When to use: After `writeHoldAutomaticFireAgainstSeatIds` stores a different list.
 * Expected outcome: One `hold_automatic_fire_against_changed` event visible only to `seatId`.
 * Exceptions: None. `recordMatchEvent` swallows its own failure.
 */
export function recordHoldAutomaticFireAgainstChanged(args: {
  /**
   * The step of the consult that changed the list.
   *
   * Contract: A strategic turn or a battle beat.
   * When to use: Placing the event in the recording.
   * Expected outcome: Replay shows the change on that step.
   * Exceptions: None.
   */
  readonly step: StepKey;
  /**
   * The commander that owns the list.
   *
   * Contract: A seat id.
   * When to use: Choosing who may see the event.
   * Expected outcome: Only this seat sees it.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The list after the change.
   *
   * Contract: Sorted seat ids, empty after a clear.
   * When to use: The event payload.
   * Expected outcome: The new list.
   * Exceptions: None.
   */
  readonly sparedSeatIds: readonly string[];
  /**
   * The list before the change.
   *
   * Contract: Sorted seat ids.
   * When to use: The event payload.
   * Expected outcome: The old list.
   * Exceptions: None.
   */
  readonly previousSeatIds: readonly string[];
}): void {
  const { step, seatId, sparedSeatIds, previousSeatIds } = args;
  logDebug('holdAutomaticFireAgainstRecordingEvents recordHoldAutomaticFireAgainstChanged', {
    step: stepKeyText(step),
    seatId,
    sparedCount: sparedSeatIds.length,
    previousCount: previousSeatIds.length,
  });
  recordMatchEvent({
    type: 'hold_automatic_fire_against_changed',
    step,
    visibility: { seats: [seatId] },
    payload: { seatId, sparedSeatIds, previousSeatIds },
  });
}
