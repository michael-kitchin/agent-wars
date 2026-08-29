/**
 * Suggested march destinations for units the AI has left without a standing order.
 *
 * Purpose: The Standing Order Status "units without orders" table used to name only the unit and its type, so the model
 * had to join it against Unit Status and Best Options by id across a very large prompt to find anywhere to send the unit.
 * Weaker models skipped that join and marched units to their own hex, which is dropped as already-arrived — leaving the
 * unit orderless again next turn, permanently idle. Putting a legal destination beside the question breaks that loop.
 * When to use: Strategic `getInjectionText` only, for the ids it is about to list as having no standing order.
 * Expected outcome: A suggestion per unit that closes on the nearest enemy and is never the unit's current hex; units
 * with nowhere useful to go are simply absent from the map so the caller can render an em dash.
 * Exceptions: None; this is advisory briefing content and never constrains what the model may actually order.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { logDebug, logTrace } from '../logger';
import { getValidDestinationsUnoccupied } from '../oneStepMoveDestinations';
import {
  gridHopDistanceBetween,
  pickApproachHexesTowardNearestEnemy,
} from './assessUnitProximity';
import { canAssignStandingOrderType } from './standingOrdersShared';

/**
 * Collects enemy-occupied hexes from the same snapshot Best Options reads.
 *
 * Purpose: Suggestions must be drawn from the identical enemy set Best Options uses, or the briefing would recommend a
 * hex that the Best Options table does not list as legal and the model would rightly distrust both.
 * When to use: Once per `suggestApproachDestinationsForOrderlessUnits` call, before the per-unit scan.
 * Expected outcome: Hexes holding at least one unit not owned by `playerId`.
 * Exceptions: None.
 */
function enemyOccupiedHexes(state: GameStateSnapshot, playerId: string): ReadonlySet<string> {
  const occupied = new Set<string>();
  for (const unit of state.units) {
    if (unit.player !== playerId) occupied.add(unit.h3Index);
  }
  return occupied;
}

/**
 * Chooses the single closing destination to show for one unit.
 *
 * Purpose: Best Options lists every closing hex, but a suggestion column has room for one, so it must be the same
 * first approach dest Best Options would keep after ranking (unit-to-dest hop, then hex id).
 * When to use: Per orderless unit, with that unit's already-legal unoccupied one-step destinations.
 * Expected outcome: The closest legal closing dest to the unit; null when no candidate closes the distance.
 * Exceptions: None.
 */
function bestClosingDestination(
  unitH3: string,
  candidates: readonly string[],
  enemyOccupiedH3: ReadonlySet<string>
): string | null {
  const closing = pickApproachHexesTowardNearestEnemy(unitH3, candidates, enemyOccupiedH3);
  if (closing.length === 0) return null;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const h3 of closing) {
    const distance = gridHopDistanceBetween(unitH3, h3);
    if (distance === null) continue;
    if (distance < bestDistance || (distance === bestDistance && best !== null && h3 < best)) {
      best = h3;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Maps each orderless unit to a legal one-step destination that closes on the nearest enemy.
 *
 * Purpose: Gives the Standing Order Status table something concrete to offer for every unit it asks the model to order.
 * When to use: Strategic briefing assembly, passing only the ids being listed as orderless — this runs a destination
 * search per distinct unit hex and type, so do not call it for the whole roster.
 * Expected outcome: `unitId -> destination h3`, omitting units that are missing from the snapshot, cannot take a march
 * order at all, have no legal unoccupied one-step destination, or cannot close on any enemy. Suggestions never equal
 * the unit's own hex.
 * Exceptions: Never throws; a unit that cannot be scored is omitted rather than given a fabricated destination.
 */
export function suggestApproachDestinationsForOrderlessUnits(
  playerId: string,
  state: GameStateSnapshot,
  unitIds: readonly string[]
): ReadonlyMap<string, string> {
  const suggestions = new Map<string, string>();
  if (unitIds.length === 0) return suggestions;
  const enemyOccupiedH3 = enemyOccupiedHexes(state, playerId);
  const unitsById = new Map(state.units.map((u) => [u.id, u]));
  for (const unitId of unitIds) {
    const unit = unitsById.get(unitId);
    if (!unit) continue;
    // Air units reposition by ferry, so offering them a march destination would invite an order assignOrder rejects.
    if (!canAssignStandingOrderType(unit.unitType, 'march')) continue;
    const candidates = getValidDestinationsUnoccupied(unit, state).filter((h3) => h3 !== unit.h3Index);
    const destination = bestClosingDestination(unit.h3Index, candidates, enemyOccupiedH3);
    if (destination !== null) suggestions.set(unitId, destination);
    logTrace('orderlessUnitSuggestions suggestApproachDestinationsForOrderlessUnits: unit', {
      unitId,
      unitType: unit.unitType,
      originH3: unit.h3Index,
      candidateCount: candidates.length,
      destination,
    });
  }
  logDebug('orderlessUnitSuggestions suggestApproachDestinationsForOrderlessUnits', {
    playerId,
    turnNumber: state.turnNumber,
    requestedCount: unitIds.length,
    enemyOccupiedCount: enemyOccupiedH3.size,
    suggestedCount: suggestions.size,
  });
  return suggestions;
}
