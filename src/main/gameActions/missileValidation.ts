/**
 * Checks one missile launch before it is stored or resolved.
 *
 * Purpose: Submit and Ready share one gate, so a stored launch is rejected again if the world changed.
 * When to use: Group targeting, order submit, and launch resolution.
 * Expected outcome: `{ valid: true }` or the first failing reason, in the order below.
 * Exceptions: None. A closed database fails inside `loadOwnedStrategicUnit`.
 */

import {
  isMissileUnitType,
  MISSILE_TARGET_OFF_MAP_REASON,
  MISSILE_TARGET_UNEXPLORED_REASON,
  missileTargetOutOfRangeReason,
  ONLY_MISSILES_CAN_LAUNCH_REASON,
} from '../../shared/missileRules';
import { missileRangeHexes } from '../../shared/gameRules';
import { fallbackDisplayNameFromUnitId } from '../../shared/unitDisplayNames';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { getMapHexSet } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { isHexExploredForPlayer } from '../gameDb/fogState';
import { logTrace } from '../logger';
import type { ValidationResult } from './airValidation';
import { isWithinMissileRange } from './missileReach';
import { loadOwnedStrategicUnit } from './ownedUnitGuards';

/**
 * Checks whether one unit may launch at one strategic hex.
 *
 * Purpose: Single-unit gate shared by group targeting, submit, and resolution.
 * When to use: After the caller has a unit id and a target hex.
 * Expected outcome: `{ valid: true }` or `{ valid: false, reason }` for ownership, type, map, range, then explored.
 * Exceptions: None.
 */
export function validateMissileLaunchOrder(
  unitId: string,
  targetH3Index: string,
  options?: { readonly allowedPlayer?: string; readonly displayLabelForUnit?: (id: string) => string }
): ValidationResult {
  logTrace('missileValidation validateMissileLaunchOrder', {
    unitId,
    targetH3Index,
    allowedPlayer: options?.allowedPlayer,
  });
  const owned = loadOwnedStrategicUnit(unitId, {
    allowedPlayer: options?.allowedPlayer ?? HUMAN_SEAT_ID,
    displayLabelForUnit: options?.displayLabelForUnit ?? fallbackDisplayNameFromUnitId,
  });
  if (!owned.ok) return owned.failure;
  if (!isMissileUnitType(owned.unit.unit_type)) {
    return { valid: false, reason: ONLY_MISSILES_CAN_LAUNCH_REASON };
  }
  if (!getMapHexSet().has(targetH3Index)) {
    return { valid: false, reason: MISSILE_TARGET_OFF_MAP_REASON };
  }
  if (!isWithinMissileRange(owned.unit.h3_index, targetH3Index)) {
    return { valid: false, reason: missileTargetOutOfRangeReason(missileRangeHexes()) };
  }
  if (!isHexExploredForPlayer(gameDbOps, owned.unit.player, targetH3Index)) {
    return { valid: false, reason: MISSILE_TARGET_UNEXPLORED_REASON };
  }
  return { valid: true };
}
