import { gridDistance } from 'h3-js';
import { logDebug } from '../logger';
import type { GameStateSnapshot } from '../gameDb';

const GRID_DISTANCE_ERROR_LOG_LIMIT = 24;
const GRID_DISTANCE_ERROR_PAIR_CAP = 5000;
const gridDistanceErrorPairs = new Set<string>();
let gridDistanceSuppressedCount = 0;

function getGridDistancePairKey(aH3: string, bH3: string): string {
  return aH3 <= bH3 ? `${aH3}|${bH3}` : `${bH3}|${aH3}`;
}

function safeGridDistance(aH3: string, bH3: string): number | null {
  try {
    return gridDistance(aH3, bH3);
  } catch (err) {
    const pairKey = getGridDistancePairKey(aH3, bH3);
    if (!gridDistanceErrorPairs.has(pairKey)) {
      gridDistanceErrorPairs.add(pairKey);
      if (gridDistanceErrorPairs.size > GRID_DISTANCE_ERROR_PAIR_CAP) {
        gridDistanceErrorPairs.clear();
        gridDistanceSuppressedCount = 0;
        logDebug('openRouter safeGridDistance: reset error pair cache at cap', {
          pairCap: GRID_DISTANCE_ERROR_PAIR_CAP,
        });
      }
      if (gridDistanceErrorPairs.size <= GRID_DISTANCE_ERROR_LOG_LIMIT) {
        logDebug('openRouter safeGridDistance: gridDistance unavailable for pair', {
          aH3,
          bH3,
          code: (err as { code?: unknown } | null | undefined)?.code ?? null,
        });
      } else {
        gridDistanceSuppressedCount += 1;
        if (gridDistanceSuppressedCount === 1 || gridDistanceSuppressedCount % 500 === 0) {
          logDebug('openRouter safeGridDistance: suppressing repetitive pair errors', {
            distinctPairCount: gridDistanceErrorPairs.size,
            suppressedCount: gridDistanceSuppressedCount,
          });
        }
      }
    }
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
