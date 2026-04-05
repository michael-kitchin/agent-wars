import { gridDistance } from 'h3-js';
import { logError } from '../logger';
import type { GameStateSnapshot } from '../gameDb';

function safeGridDistance(aH3: string, bH3: string): number | null {
  try {
    return gridDistance(aH3, bH3);
  } catch (err) {
    logError('openRouter safeGridDistance: gridDistance failed', { aH3, bH3, err });
    return null;
  }
}

export function isInRange(aH3: string, bH3: string, range: number): boolean {
  const dist = safeGridDistance(aH3, bH3);
  return dist != null && dist <= range;
}

/**
 * Why this exists:
 *     Centralizes repeated range counting for air-operation briefing summaries.
 * When to use:
 *     To count infrastructure rows in strike range from one base hex while applying caller-provided inclusion logic.
 * What to expect:
 *     Returns the count of rows that pass the filter and are within 3D H3 grid distance constraints.
 */
export function countRowsInStrikeRange(
  baseH3Index: string,
  rows: GameStateSnapshot['res1Infrastructure'],
  includeRow: (row: NonNullable<GameStateSnapshot['res1Infrastructure']>[number]) => boolean
): number {
  if (!rows || rows.length === 0) return 0;
  let count = 0;
  for (const row of rows) {
    if (!includeRow(row)) continue;
    if (!isInRange(baseH3Index, row.h3Index, 3)) continue;
    count++;
  }
  return count;
}
