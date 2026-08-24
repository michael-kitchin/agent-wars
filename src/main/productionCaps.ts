import type { BuildUnitType } from './productionRules';
import { ALL_BUILD_UNIT_TYPES } from '../shared/ipc/productionTypes';
import { MAX_UNITS_PER_TYPE } from '../shared/productionConfig';
import { getPlayerUnitCountsByType } from '../shared/unitCountsByType';
import type { GameSize } from '../shared/gameSize';
import { getMaxUnitsPerType, parseGameSize } from '../shared/gameSize';
import { logTrace } from './logger';

export { MAX_UNITS_PER_TYPE, getPlayerUnitCountsByType, getMaxUnitsPerType, parseGameSize };
export type { GameSize };

/**
 * Marker appended to a briefing available-types cell when every type that hex can build is at the deployment cap.
 *
 * Purpose: `filterQueueableUnitTypes` falls back to listing capped types so pre-queueing stays possible, which otherwise
 * reads as "these are buildable" and invites the model to swap in a type the hex cannot build at all.
 * When to use: Production briefing available-type cells, and any prompt copy that must refer to that marker by name.
 * Expected outcome: Verbatim inclusion so `PRODUCTION_CAP_QUEUE_GUIDANCE` and the table agree on one spelling.
 * Exceptions: None.
 */
export const ALL_AVAILABLE_TYPES_AT_CAP_NOTE = 'all at cap';

/**
 * Prompt and briefing copy for AI production when a type is at the per-side deployment cap.
 *
 * Purpose: One sentence shared by tool guidance, submit clauses, and the production briefing so the model is not told conflicting cap rules.
 * When to use: Strategic production prompt surfaces and the Production Status block when any type is maxed.
 * Expected outcome: Verbatim inclusion; does not itself reject queues (engine uses `shouldRejectCappedQueueType`).
 * Exceptions: None.
 */
export const PRODUCTION_CAP_QUEUE_GUIDANCE =
  'Do not queue types at maximum while other types can still be built; replace blocked queues with a still-available type. ' +
  `A hex whose available types are marked "${ALL_AVAILABLE_TYPES_AT_CAP_NOTE}" has no alternative — leave that queue as it is so it resumes when the cap frees up.`;

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
 * Expected outcome: Subset of `DEPLOYMENT_CAP_TYPE_ORDER`, only types where count ≥ `getMaxUnitsPerType(gameSize)`.
 * Exceptions: None.
 */
export function getMaxedUnitTypesForPlayer(
  units: Array<{ player: string; unitType: string }>,
  playerId: string,
  gameSize: GameSize
): BuildUnitType[] {
  logTrace('productionCaps getMaxedUnitTypesForPlayer', { playerId, gameSize, unitCount: units.length });
  const counts = getPlayerUnitCountsByType(units, playerId);
  const caps = getMaxUnitsPerType(gameSize);
  return DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => counts[unitType] >= caps[unitType]);
}

/**
 * Omits types at deployment cap from an available-type list unless every available type is at cap.
 *
 * Purpose: AI briefing and query_production should not advertise capped types when another type can still spawn; a hex that can only build the capped type still lists it so pre-queue remains possible.
 * When to use: Production briefing available-type cells and opponent `query_production` summaries.
 * Expected outcome: Non-maxed types when any exist; otherwise a copy of `available` (possibly empty).
 * Exceptions: None.
 */
export function filterQueueableUnitTypes(
  available: readonly string[],
  maxedTypes: ReadonlySet<string>
): string[] {
  logTrace('productionCaps filterQueueableUnitTypes', {
    availableCount: available.length,
    maxedCount: maxedTypes.size,
  });
  const unmaxed = available.filter((unitType) => !maxedTypes.has(unitType));
  return unmaxed.length > 0 ? unmaxed : [...available];
}

/**
 * True when a hex can still build something but every one of those types is at the deployment cap.
 *
 * Purpose: Distinguishes "pick a different type here" from "nothing can spawn here until a unit dies", which
 * `filterQueueableUnitTypes` alone cannot express because its fallback returns the capped list unchanged.
 * When to use: Before rendering an available-types cell, or anywhere that must decide whether swapping the queued
 * type could help.
 * Expected outcome: False for an empty list and for any list containing at least one non-maxed type.
 * Exceptions: None.
 */
export function isEveryAvailableTypeAtCap(
  available: readonly string[],
  maxedTypes: ReadonlySet<string>
): boolean {
  logTrace('productionCaps isEveryAvailableTypeAtCap', {
    availableCount: available.length,
    maxedCount: maxedTypes.size,
  });
  return available.length > 0 && available.every((unitType) => maxedTypes.has(unitType));
}

/**
 * True when a requested queue type is at cap and the hex can still build a non-maxed type.
 *
 * Purpose: Opponent `set_build_queue` / productionOrders must reject armor-at-cap when infantry/air/naval remain available.
 * When to use: After confirming the type is in `available` for the hex.
 * Expected outcome: True only when `requested` is maxed and `available` contains at least one non-maxed type.
 * Exceptions: None.
 */
export function shouldRejectCappedQueueType(
  requested: string,
  available: readonly string[],
  maxedTypes: ReadonlySet<string>
): boolean {
  logTrace('productionCaps shouldRejectCappedQueueType', { requested, availableCount: available.length });
  if (!maxedTypes.has(requested)) return false;
  return available.some((unitType) => !maxedTypes.has(unitType));
}
