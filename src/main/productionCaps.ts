import type { BuildUnitType } from './productionRules';
import { ALL_BUILD_UNIT_TYPES } from '../shared/ipc/productionTypes';
import { MAX_UNITS_PER_TYPE } from '../shared/productionConfig';
import { getPlayerUnitCountsByType } from '../shared/unitCountsByType';

export { MAX_UNITS_PER_TYPE, getPlayerUnitCountsByType };

/**
 * Stable iteration order for deployment-cap checks and maxed-type lists (infantry → armor → naval → air).
 *
 * Purpose: Matches `ALL_BUILD_UNIT_TYPES` for consistency with production availability and UI summaries.
 * When to use: Filtering counts to types at cap; do not reorder without updating game design docs.
 * Expected outcome: Same order as canonical build-type ordering in `productionTypes`.
 * Exceptions: None.
 */
export const DEPLOYMENT_CAP_TYPE_ORDER: BuildUnitType[] = [...ALL_BUILD_UNIT_TYPES];

/**
 * Lists build unit types at or above the per-type deployment cap for the given player.
 *
 * Purpose: Briefing and Ready UI can warn when the human cannot spawn more of a type.
 * When to use: After reading units from snapshot or DB rows shaped like `{ player, unitType }`.
 * Expected outcome: Subset of `DEPLOYMENT_CAP_TYPE_ORDER`, only types where count ≥ `MAX_UNITS_PER_TYPE`.
 * Exceptions: None.
 */
export function getMaxedUnitTypesForPlayer(
  units: Array<{ player: string; unitType: string }>,
  playerId: string
): BuildUnitType[] {
  const counts = getPlayerUnitCountsByType(units, playerId);
  return DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => counts[unitType] >= MAX_UNITS_PER_TYPE[unitType]);
}
