/**
 * Tool-group counts for the consult wave that is current.
 *
 * Purpose: A parallel consult starts at zero, then each seat that returns counts is added in.
 * When to use: The commander pool, when a launch batch starts and when a seat settles.
 * Expected outcome: The snapshot sum matches the seats launched in this wave. A late seat from an older wave is ignored.
 * Exceptions: None.
 */

import type { AiSeatId } from '../../shared/seatIds';
import { sumCommanderToolCounts } from '../../shared/commanderToolCounts';
import { logDebug, logTrace } from '../logger';

/**
 * Seats that have reported counts for the current wave.
 *
 * Purpose: A seat still planning is absent, so it does not change the total yet.
 * When to use: `recordCommanderToolCounts` and `commanderToolCountSum`.
 * Expected outcome: Empty after a wave begins or the pool is reset.
 * Exceptions: None.
 */
const countsBySeat = new Map<AiSeatId, Readonly<Record<string, number>>>();

/**
 * Identifies the wave a launch belongs to.
 *
 * Purpose: A seat that finishes after the next consult has started must not add its old counts.
 * When to use: `beginCommanderToolCountWave`, `resetCommanderToolCounts`, and each launch.
 * Expected outcome: Increases when a wave begins and when the pool is reset.
 * Exceptions: None.
 */
let waveId = 0;

/**
 * Drops every stored count and starts a new wave.
 *
 * Purpose: The Commanders tab goes back to zero at the beginning of a parallel consult.
 * When to use: Once, before the first successful launch in a batch.
 * Expected outcome: The sum is empty until a seat in this wave reports.
 * Exceptions: None.
 */
export function beginCommanderToolCountWave(): void {
  waveId += 1;
  countsBySeat.clear();
  logDebug('commanderToolCounts beginCommanderToolCountWave', { waveId });
}

/**
 * The wave id a launch should store.
 *
 * Purpose: Settlement compares it with the wave that is current.
 * When to use: `launch`, after a wave has been begun for that batch.
 * Expected outcome: The id of the latest begin or reset. Zero before either.
 * Exceptions: None.
 */
export function currentCommanderToolCountWaveId(): number {
  logTrace('commanderToolCounts currentCommanderToolCountWaveId', { waveId });
  return waveId;
}

/**
 * Stores one seat's counts when they belong to the current wave.
 *
 * Purpose: Finished, unfinished, and timed-out consults can all have used tools.
 * When to use: After a consult result is accepted for the launch that produced it.
 * Expected outcome: That seat replaces its own map with a copy. A missing map, or a map from an older wave, leaves the sum unchanged.
 * Exceptions: None.
 */
export function recordCommanderToolCounts(
  seatId: AiSeatId,
  waveIdAtLaunch: number,
  counts: Readonly<Record<string, number>> | undefined
): void {
  logDebug('commanderToolCounts recordCommanderToolCounts', {
    seatId,
    waveIdAtLaunch,
    waveId,
    hasCounts: counts != null,
  });
  if (waveIdAtLaunch !== waveId || counts == null) return;
  countsBySeat.set(seatId, { ...counts });
}

/**
 * The total for the current wave.
 *
 * Purpose: The pool snapshot is what the Commanders tab displays.
 * When to use: `readCommanderPoolSnapshot`.
 * Expected outcome: The sum of the maps stored for this wave. An empty object when none are stored.
 * Exceptions: None.
 */
export function commanderToolCountSum(): Record<string, number> {
  const sum = sumCommanderToolCounts([...countsBySeat.values()]);
  logTrace('commanderToolCounts commanderToolCountSum', {
    seatCount: countsBySeat.size,
    groupCount: Object.keys(sum).length,
  });
  return sum;
}

/**
 * Forgets every count and invalidates launches from the previous match.
 *
 * Purpose: A new match must not keep the previous match's tool totals.
 * When to use: `resetCommanderPool`.
 * Expected outcome: The sum is empty, and a late record from the old wave is ignored.
 * Exceptions: None.
 */
export function resetCommanderToolCounts(): void {
  waveId += 1;
  countsBySeat.clear();
  logDebug('commanderToolCounts resetCommanderToolCounts', { waveId });
}
