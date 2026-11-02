/**
 * Standings text for a seat's accumulated think time.
 *
 * Purpose: The result row shows how long that commander's settled consults took.
 * When to use: `buildStandings` for an AI seat.
 * Expected outcome: `m:ss thinking` under one hour, and `h:mm:ss thinking` from one hour up.
 * Exceptions: None. A negative or non-finite value is `0:00 thinking`.
 */

import { formatCommanderClock } from './commanderCardState';

/**
 * One hour, in milliseconds.
 *
 * Purpose: The clock gains an hour field at this duration.
 * When to use: `formatThinkTimeLabel`.
 * Expected outcome: 3,600,000.
 * Exceptions: None.
 */
const THINK_TIME_HOUR_MS = 3_600_000;

/**
 * Formats accumulated think time for a standings row.
 *
 * Purpose: Timed-out and failed consults are in this total. The consultation count is a different number.
 * When to use: An AI seat's result row. A human seat does not call it.
 * Expected outcome: `0:00 thinking` at zero. `1:30 thinking` at 90 seconds. `1:01:00 thinking` at 3,660,000 ms.
 * Exceptions: None. A negative or non-finite value returns `0:00 thinking`. This module does not import the main logger; the result row runs in the renderer.
 */
export function formatThinkTimeLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00 thinking';
  if (ms < THINK_TIME_HOUR_MS) return `${formatCommanderClock(ms)} thinking`;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} thinking`;
}
