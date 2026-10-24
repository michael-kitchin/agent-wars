/**
 * In-memory record of each unit's last strategic h3 index before its current position.
 * Used for tactical entry-edge placement; cleared on new game. Not persisted in SQLite.
 */

import { logDebug, logTrace } from './logger';

const previousStrategicH3ByUnitId = new Map<string, string>();

/**
 * Clears all remembered previous strategic hexes (e.g. on new game).
 *
 * Contract: Drops every entry from the in-memory map; tactical placement then behaves as if no entry edge was recorded.
 * When to use: Database reset / new match initialization and tests that need isolated placement behavior.
 * Expected outcome: `getPreviousStrategicH3IndexForUnit` returns undefined for all units until new moves are recorded.
 * Exceptions: None.
 */
export function clearStrategicPreviousHexMemory(): void {
  logDebug('clearStrategicPreviousHexMemory', { sizeBefore: previousStrategicH3ByUnitId.size });
  previousStrategicH3ByUnitId.clear();
}

/**
 * Remembers the hex a unit is leaving when it moves to a different strategic h3 index.
 *
 * Contract: Stores `fromH3Index` keyed by `unitId` when the move crosses hex ids; no-op for same-hex or empty ids.
 * When to use: Strategic movement apply path immediately before updating unit position in SQLite.
 * Expected outcome: Latest crossing overwrites prior memory for that `unitId`.
 * Exceptions: None.
 */
export function rememberStrategicHexBeforeMove(unitId: string, fromH3Index: string, toH3Index: string): void {
  if (!fromH3Index || !toH3Index || fromH3Index === toH3Index) return;
  logDebug('rememberStrategicHexBeforeMove', { unitId, fromH3Index, toH3Index });
  previousStrategicH3ByUnitId.set(unitId, fromH3Index);
}

/**
 * Returns the last remembered strategic hex for a unit, if any.
 *
 * Contract: Read-only lookup; does not mutate the map.
 * When to use: `computeTacticalBattleSnapshot` to bias tactical placement toward the recorded approach direction.
 * Expected outcome: Undefined when unknown or after `clearStrategicPreviousHexMemory`.
 * Exceptions: None.
 */
export function getPreviousStrategicH3IndexForUnit(unitId: string): string | undefined {
  logTrace('getPreviousStrategicH3IndexForUnit', { unitId, hit: previousStrategicH3ByUnitId.has(unitId) });
  return previousStrategicH3ByUnitId.get(unitId);
}
