/**
 * Intact-airport checks for tactical air ferry (tactical cells), matching strategic airport-to-airport ferry.
 *
 * Purpose: Human hover/assign, apply-phase mutation, and opponent AI validation previously treated every footprint
 * cell as a legal ferry dest when the enclosing strategic had any airport. Strategic ferry requires an intact airport at
 * origin and dest; tactical ferry uses the same airport rule on tactical cells while remaining footprint-bounded.
 * When to use: Tactical ferry validation and apply after footprint and air-type checks.
 * Expected outcome: Origin and dest must each be a non-rubble airport cell on the battle snapshot.
 * Exceptions: Does not apply dest-hex ownership (tactical battles are often contested at the enclosing strategic).
 */

import type { TacticalBattlePlayerId, TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalSubUnitLabelForUserMessage } from '../../shared/unitDisplayNames';
import { tacticalLogQuery } from './tacticalLogging';

/**
 * Battle fields needed to decide whether a tactical cell is an intact airport.
 *
 * Contract: `tacticalIsAirportByH3` true means a live airport tile; rubble wins even if the airport flag is still set.
 * When to use: Airport helpers that should not require a full snapshot.
 * Expected outcome: Omitted keys mean the cell is not an airport.
 * Exceptions: None.
 */
export type TacticalFerryAirportBattle = Pick<TacticalBattleSnapshot, 'tacticalIsAirportByH3' | 'tacticalIsRubbleByH3'>;

/**
 * True when the cell is an intact (non-rubble) airport tile on the tactical snapshot.
 *
 * Purpose: Shared origin/dest airport test so hover validation, apply, and opponent AI cannot drift.
 * When to use: Before accepting a tactical ferry hop.
 * Expected outcome: True only when `tacticalIsAirportByH3[h3]` is true and the cell is not rubble.
 * Exceptions: Missing maps or omitted keys are not airports.
 */
export function tacticalCellHasIntactAirport(battle: TacticalFerryAirportBattle, h3: string): boolean {
  tacticalLogQuery('tacticalCellHasIntactAirport', { h3 });
  if (battle.tacticalIsRubbleByH3?.[h3] === true) return false;
  return battle.tacticalIsAirportByH3?.[h3] === true;
}

/**
 * Reason string when origin or dest fails the intact-airport rule, else null.
 *
 * Purpose: Same phrasing as strategic `validateFerryOrder` so hover blocking copy and drop logs stay aligned.
 * When to use: After footprint membership is already known.
 * Expected outcome: `'Origin airport is not intact'` or `'Destination airport is not intact'`, or null when both cells pass.
 * Exceptions: None.
 */
export function tacticalFerryAirportRejectionReason(
  battle: TacticalFerryAirportBattle,
  originH3: string,
  destH3: string
): string | null {
  tacticalLogQuery('tacticalFerryAirportRejectionReason', { originH3, destH3 });
  if (!tacticalCellHasIntactAirport(battle, originH3)) {
    return 'Origin airport is not intact';
  }
  if (!tacticalCellHasIntactAirport(battle, destH3)) {
    return 'Destination airport is not intact';
  }
  return null;
}

/**
 * Resolution outcome for one tactical ferry hop at apply time (after air/ranged may have wrecked airports).
 *
 * Purpose: Order-time validation requires an intact origin airport; apply-time dest success still relocates even if
 * the origin is now rubble (same as strategic). An illegal dest with a lost origin destroys the air unit.
 * When to use: `applyTacticalFerryPhaseOnBattle` after player and air-type checks.
 * Expected outcome: `'move'` when dest is an intact airport in the footprint; `'destroy'` when dest is illegal and
 * origin is not an intact airport; `'stay'` when dest is illegal but origin is still intact.
 * Exceptions: None.
 */
export function tacticalFerryApplyOutcome(
  battle: Pick<TacticalBattleSnapshot, 'tacticalChildH3Indexes' | 'tacticalIsAirportByH3' | 'tacticalIsRubbleByH3'>,
  originH3: string,
  destH3: string
): 'move' | 'stay' | 'destroy' {
  tacticalLogQuery('tacticalFerryApplyOutcome', { originH3, destH3 });
  const destLegal =
    battle.tacticalChildH3Indexes.includes(destH3) && tacticalCellHasIntactAirport(battle, destH3);
  if (destLegal) return 'move';
  if (!tacticalCellHasIntactAirport(battle, originH3)) return 'destroy';
  return 'stay';
}

/**
 * Intact airport cells in the footprint other than the unit's current cell.
 *
 * Purpose: Tactical Best Options ferry dests, matching order-time `validateTacticalGroupFerryTarget` dest legality.
 * When to use: After confirming the origin cell is an intact airport; empty when the unit cannot legally ferry.
 * Expected outcome: Every returned cell is a non-rubble airport in `tacticalChildH3Indexes`, never the origin.
 * Exceptions: None.
 */
export function collectTacticalLegalFerryDestinationHexes(
  battle: TacticalBattleSnapshot,
  originH3: string
): string[] {
  tacticalLogQuery('collectTacticalLegalFerryDestinationHexes', { originH3 });
  if (!tacticalCellHasIntactAirport(battle, originH3)) return [];
  return battle.tacticalChildH3Indexes.filter(
    (h3) => h3 !== originH3 && tacticalCellHasIntactAirport(battle, h3)
  );
}

/**
 * Validates a grouped tactical ferry target against footprint, air type, owner, and intact airports.
 *
 * Contract: Dest must be in `tacticalChildH3Indexes`; each listed sub-unit must be air owned by `attackerPlayer`; origin
 * and dest must be intact airport cells.
 * When to use: `validateGroupFerryTarget` while a battle is active, and unit tests without a live session.
 * Expected outcome: `{ success: true }` or a labeled `reason` suitable for toasts and hover.
 * Exceptions: None.
 */
export function validateTacticalGroupFerryTarget(
  battle: TacticalBattleSnapshot,
  unitIds: readonly string[],
  destinationH3Index: string,
  attackerPlayer: TacticalBattlePlayerId
): { success: true } | { success: false; reason: string } {
  tacticalLogQuery('validateTacticalGroupFerryTarget', {
    unitCount: unitIds.length,
    destinationH3Index,
    attackerPlayer,
  });
  const footprint = new Set(battle.tacticalChildH3Indexes);
  if (!footprint.has(destinationH3Index)) {
    return { success: false, reason: 'Destination is outside the tactical battle.' };
  }
  for (const unitId of unitIds) {
    const label = tacticalSubUnitLabelForUserMessage(battle.subUnits, unitId);
    const unit = battle.subUnits.find((u) => u.id === unitId);
    if (!unit || unit.player !== attackerPlayer) {
      return { success: false, reason: `${label}: Unit not in tactical battle.` };
    }
    if (unit.unitType !== 'air') {
      return { success: false, reason: `${label}: Only air units can ferry.` };
    }
    const airportReason = tacticalFerryAirportRejectionReason(battle, unit.h3Index, destinationH3Index);
    if (airportReason) {
      return { success: false, reason: `${label}: ${airportReason}` };
    }
  }
  return { success: true };
}
