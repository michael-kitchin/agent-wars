/**
 * Whether one air unit may drop its infantry on a strategic hex.
 *
 * Purpose: Planning and resolution share one gate. An enemy on the hex does not close it.
 * When to use: Submit, the map hover, and `resolveAirDropPhase` before each order.
 * Expected outcome: Valid when the air unit is based, carries exactly one infantry unit, and the target is land within strike range.
 * Exceptions: None. A closed database returns a reason.
 */

import { getMapHexSet, getStrategicInfrastructureForHex } from '../gameDb';
import { dbGetAll } from '../gameDb';
import { getActiveTacticalBattleSnapshot, isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { validateTacticalAirDropGroup } from '../tacticalBattle/tacticalAirDrop';
import { logDebug } from '../logger';
import type { SubmitOrdersResult } from './gameActionsTypes';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON, landUnitCanOccupyHex } from '../../shared/landTraversalStrategic';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { AIR_STRIKE_RANGE_HEXES, formatTargetOutOfRangeReason } from '../../shared/tacticalRanges';
import { getStrategicLandMassByH3 } from '../terrainClassificationCache';
import { logTrace } from '../logger';
import { isWithinAirStrikeGridRange } from './gridRange';
import { loadOwnedStrategicUnit } from './ownedUnitGuards';

/**
 * A drop is legal, or the first reason it is not.
 *
 * Purpose: Callers show `reason` and skip the order.
 * When to use: The result of `validateAirDropOrder`.
 * Expected outcome: `valid` is true only when every check passed.
 * Exceptions: None.
 */
export type AirDropValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * Checks one strategic air drop.
 *
 * Purpose: The air unit must be on an intact airport that is not a neutral border, with one infantry unit aboard.
 * When to use: Before storing a drop and again when the turn resolves.
 * Expected outcome: `{ valid: true }`, or one reason. A fortification, a friendly unit, and an enemy unit do not fail the order.
 * Exceptions: None.
 */
export function validateAirDropOrder(
  unitId: string,
  targetH3Index: string,
  options?: { allowedPlayer?: string; displayLabelForUnit?: (id: string) => string }
): AirDropValidationResult {
  logTrace('airDropValidation validateAirDropOrder', {
    unitId,
    targetH3Index,
    allowedPlayer: options?.allowedPlayer,
  });
  const allowedPlayer = options?.allowedPlayer ?? HUMAN_SEAT_ID;
  const owned = loadOwnedStrategicUnit(unitId, {
    allowedPlayer,
    displayLabelForUnit: options?.displayLabelForUnit ?? ((id) => id),
  });
  if (!owned.ok) return owned.failure;
  const unit = owned.unit;
  if (unit.unit_type !== 'air') return { valid: false, reason: 'Only air units can air drop' };
  const base = getStrategicInfrastructureForHex(unit.h3_index);
  if (isNeutralBorderHex(unit.h3_index) || base.airportCount <= 0) {
    return { valid: false, reason: 'Air unit must be based at an intact airport to drop' };
  }
  const cargo = dbGetAll<{ unitType: string }>(
    `SELECT lu.unit_type AS unitType
     FROM unit_transport_assignments uta
     JOIN units lu ON lu.id = uta.land_unit_id
     WHERE uta.naval_unit_id = ?`,
    [unitId]
  );
  if (cargo.length !== 1 || cargo[0]?.unitType !== 'infantry') {
    return { valid: false, reason: 'Air drop needs exactly one infantry unit aboard.' };
  }
  if (!getMapHexSet().has(targetH3Index)) return { valid: false, reason: 'Target hex not on map' };
  if (targetH3Index === unit.h3_index) return { valid: false, reason: 'Air drop cannot target the air unit\'s own hex.' };
  if (!landUnitCanOccupyHex(targetH3Index, getStrategicLandMassByH3())) {
    return { valid: false, reason: LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON };
  }
  if (!isWithinAirStrikeGridRange(unit.h3_index, targetH3Index, 'validateAirDropOrder')) {
    return { valid: false, reason: formatTargetOutOfRangeReason(unit.unit_type, AIR_STRIKE_RANGE_HEXES) };
  }
  return { valid: true };
}

/**
 * Validates one air-drop target for every selected air unit.
 *
 * Purpose: One illegal unit queues nothing, on the world map or in a battle.
 * When to use: The group air-drop IPC.
 * Expected outcome: `{ success: true }` when every unit can drop on that hex or cell. Otherwise the first reason.
 * Exceptions: None. A closed database returns a reason.
 */
export function validateGroupAirDropTarget(unitIds: readonly string[], targetH3Index: string): SubmitOrdersResult {
  logDebug('airDropValidation validateGroupAirDropTarget', { unitCount: unitIds.length, targetH3Index });
  if (isTacticalBattleActive()) {
    const battle = getActiveTacticalBattleSnapshot();
    if (!battle) return { success: false, reason: 'No tactical battle is active.' };
    return validateTacticalAirDropGroup(battle, unitIds, targetH3Index, HUMAN_SEAT_ID);
  }
  const unique = [...new Set(unitIds.filter((id) => id.trim() !== ''))];
  if (unique.length === 0) return { success: false, reason: 'No selected units for air drop' };
  for (const unitId of unique) {
    const result = validateAirDropOrder(unitId, targetH3Index);
    if (!result.valid) return { success: false, reason: result.reason };
  }
  return { success: true };
}
