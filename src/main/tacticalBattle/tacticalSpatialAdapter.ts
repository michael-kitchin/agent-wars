import { gridDistance } from 'h3-js';
import { isTacticalCell } from '../../shared/h3Resolutions';
import { tacticalLogError, tacticalLogQuery } from './tacticalLogging';

/**
 * Returns the H3 grid distance between two tactical cells for tactical range math (milestone-2.1 adapter seed).
 *
 * Purpose: Centralizes tactical-only distance so future tactical movement/combat can share one definition with strategic rules wrappers.
 * When to use: Any tactical path or range check that must count hex steps at resolution 4.
 * Expected outcome: Non-negative integer distance; same cell yields `0`.
 * Exceptions: Propagates H3 errors when indexes are missing or not at resolution 4.
 */
export function tacticalGridDistance(h3IndexA: string, h3IndexB: string): number {
  tacticalLogQuery('tacticalGridDistance', { h3IndexA, h3IndexB });
  try {
    if (!isTacticalCell(h3IndexA) || !isTacticalCell(h3IndexB)) {
      throw new Error('tacticalRes4GridDistance requires resolution-4 indexes');
    }
    const d = gridDistance(h3IndexA, h3IndexB);
    tacticalLogQuery('tacticalRes4GridDistance result', { h3IndexA, h3IndexB, d });
    return d;
  } catch (err) {
    tacticalLogError('tacticalRes4GridDistance failed', { h3IndexA, h3IndexB, err });
    throw err;
  }
}
