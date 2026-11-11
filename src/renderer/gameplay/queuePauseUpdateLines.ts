/**
 * Updates sentences for queues that paused this turn, naming hexes by code.
 *
 * Purpose: The toast builder receives finished sentences and does not look up hex codes.
 * When to use: Strategic Ready, from the turn-update announcement.
 * Expected outcome: One sentence per reason set, or no lines when nothing paused this turn.
 * Exceptions: None.
 */

import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import type { ReadyResult } from '../../shared/ipcTypes';
import { formatQueuePausedLines } from '../../shared/queuePauseReasons';

/**
 * Finished pause sentences for the human seat's new pauses.
 *
 * Purpose: The toast builder receives finished sentences and does not look up hex codes.
 * When to use: Strategic Ready, when building the Updates section.
 * Expected outcome: One sentence per reason set for the queues that paused this turn, or no lines when none did.
 * Exceptions: None.
 */
export function queuePauseUpdateLinesFor(readySlice: ReadyResult): string[] {
  const pauses = readySlice.humanNewlyPausedQueues ?? [];
  return formatQueuePausedLines(
    pauses.map((pause) => ({ hexCode: orderTargetHexCode(pause.h3Index, null), reasons: pause.reasons }))
  );
}
