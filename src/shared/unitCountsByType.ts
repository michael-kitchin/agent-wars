import type { BuildUnitType } from './ipc/productionTypes';
import { isBuildUnitType } from './ipc/productionTypes';

/**
 * Totals deployable units per `BuildUnitType` for a single player from a unit list.
 *
 * Purpose: Shared between main (`productionCaps`) and renderer production UI so cap math and filtering stay aligned.
 * When to use: Pass `GameStateSnapshot['units']` (or equivalent `{ player, unitType }[]`) plus `HUMAN_SEAT_ID` or the first AI seat.
 * Expected outcome: Five counts summing only recognized build types; unknown `unitType` strings contribute nothing.
 * Exceptions: None; empty input yields all zeros.
 */
export function getPlayerUnitCountsByType(
  units: Array<{ player: string; unitType: string }>,
  playerId: string
): Record<BuildUnitType, number> {
  const counts: Record<BuildUnitType, number> = { infantry: 0, armor: 0, naval: 0, air: 0, missile: 0 };
  for (const unit of units) {
    if (unit.player !== playerId) continue;
    if (!isBuildUnitType(unit.unitType)) continue;
    counts[unit.unitType] += 1;
  }
  return counts;
}
