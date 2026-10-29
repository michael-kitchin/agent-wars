/**
 * Tracks a Ready click that has not finished.
 *
 * Purpose: A load during that wait would swap the database under the turn that is still resolving.
 * When to use: Around the Ready and melee-intercept handlers, and before a save or load dialog.
 * Expected outcome: `isReadyInFlight` is true only while a wrapped call is running.
 * Exceptions: None.
 */

import { logDebug, logTrace } from '../logger';

/** How many Ready or melee-intercept handlers are inside their work right now. */
let readyInFlightCount = 0;

/**
 * Runs `work` while Ready counts as in flight.
 *
 * Purpose: Save and load can refuse that window, including the wait before the handler resolves.
 * When to use: The bodies of `game:ready` and `game:resolveMeleeIntercept`, inside the auto-save wrapper.
 * Expected outcome: The count is one higher during `work` and returns to its previous value afterward, including when `work` throws.
 * Exceptions: Propagates whatever `work` throws, after decrementing the count.
 */
export async function runWithReadyInFlight<T>(work: () => Promise<T>): Promise<T> {
  readyInFlightCount += 1;
  logDebug('readyInFlight runWithReadyInFlight', { readyInFlightCount });
  try {
    return await work();
  } finally {
    readyInFlightCount -= 1;
  }
}

/**
 * Reports whether a Ready or melee-intercept handler is still running.
 *
 * Purpose: Save and load stay closed until that handler returns.
 * When to use: Before showing a save or load dialog, and again after the dialog closes.
 * Expected outcome: True when the count is above zero.
 * Exceptions: None.
 */
export function isReadyInFlight(): boolean {
  logTrace('readyInFlight isReadyInFlight', { readyInFlightCount });
  return readyInFlightCount > 0;
}
