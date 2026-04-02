import type { BuildUnitType } from './productionRules';
import { MAX_UNITS_PER_TYPE as SHARED_MAX_UNITS_PER_TYPE } from '../shared/productionConfig';

/**
 * Why this exists:
 *     Centralizes per-side deployment caps by unit type so production spawn, UI updates, and AI briefings
 *     use the same limits.
 */
export const MAX_UNITS_PER_TYPE: Record<BuildUnitType, number> = {
  infantry: SHARED_MAX_UNITS_PER_TYPE.infantry,
  armor: SHARED_MAX_UNITS_PER_TYPE.armor,
  naval: SHARED_MAX_UNITS_PER_TYPE.naval,
};

/** Stable unit-type order for UI/prompt messaging about cap state. */
export const DEPLOYMENT_CAP_TYPE_ORDER: BuildUnitType[] = ['infantry', 'armor', 'naval'];

/**
 * Why this exists:
 *     Returns current counts for one player's unit roster by capped type, for cap checks and messaging.
 */
export function getPlayerUnitCountsByType(
  units: Array<{ player: string; unitType: string }>,
  playerId: string
): Record<BuildUnitType, number> {
  const counts: Record<BuildUnitType, number> = { infantry: 0, armor: 0, naval: 0 };
  for (const unit of units) {
    if (unit.player !== playerId) continue;
    if (unit.unitType !== 'infantry' && unit.unitType !== 'armor' && unit.unitType !== 'naval') continue;
    counts[unit.unitType] += 1;
  }
  return counts;
}

/**
 * Why this exists:
 *     Returns the list of unit types currently at (or above) deployment cap for one player.
 */
export function getMaxedUnitTypesForPlayer(
  units: Array<{ player: string; unitType: string }>,
  playerId: string
): BuildUnitType[] {
  const counts = getPlayerUnitCountsByType(units, playerId);
  return DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => counts[unitType] >= MAX_UNITS_PER_TYPE[unitType]);
}
