import {
  dbGetAll,
  dbGetOne,
  getHexController,
  getMapHexSet,
  getRes1InfrastructureForHex,
  isDbReady,
} from '../gameDb';
import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES, formatFerryOutOfRangeReason, formatTargetOutOfRangeReason } from '../../shared/tacticalRanges';
import { logTrace } from '../logger';
import { isWithinGridRangeSafe } from './gridRange';

export type ValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * Why this exists:
 *     Centralizes air-strike legality checks so grouped validation and turn-resolution paths use the same rule contract.
 * When to use:
 *     Before accepting or resolving one air strike order.
 * What to expect:
 *     Returns the first contractual failure reason (ownership, range, base integrity, or target validity) or valid=true.
 */
export function validateAirStrikeOrder(
  unitId: string,
  targetH3Index: string,
  targetType: AirStrikeTargetType,
  options?: { allowedPlayer?: string }
): ValidationResult {
  logTrace('airValidation validateAirStrikeOrder', { unitId, targetH3Index, targetType, allowedPlayer: options?.allowedPlayer });
  const allowedPlayer = options?.allowedPlayer ?? 'human';
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };
  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== allowedPlayer) return { valid: false, reason: `Unit must belong to ${allowedPlayer}` };
  if (unit.unit_type !== 'air') return { valid: false, reason: 'Only air units can execute strikes' };
  if (!getMapHexSet().has(targetH3Index)) return { valid: false, reason: 'Target hex not on map' };

  const withinStrikeRange = isWithinGridRangeSafe(unit.h3_index, targetH3Index, AIR_STRIKE_RANGE_HEXES, 'validateAirStrikeOrder');
  if (!withinStrikeRange) return { valid: false, reason: formatTargetOutOfRangeReason(unit.unit_type, AIR_STRIKE_RANGE_HEXES) };

  const baseInfrastructure = getRes1InfrastructureForHex(unit.h3_index);
  if (baseInfrastructure.airportCount <= 0) {
    return { valid: false, reason: 'Air unit must be based at an intact airport to strike' };
  }

  if (targetType === 'units') {
    const enemiesAtTarget = dbGetAll<{ player: string }>(
      'SELECT player FROM units WHERE h3_index = ? AND player != ?',
      [targetH3Index, unit.player]
    );
    if (enemiesAtTarget.length === 0) return { valid: false, reason: 'Target hex has no enemy units' };
    return { valid: true };
  }

  const targetInfrastructure = getRes1InfrastructureForHex(targetH3Index);
  if (targetType === 'urban' && targetInfrastructure.urbanHexCount <= 0) {
    return { valid: false, reason: 'Target hex has no urban infrastructure' };
  }
  if (targetType === 'airport' && targetInfrastructure.airportCount <= 0) {
    return { valid: false, reason: 'Target hex has no airport' };
  }
  if (targetType === 'seaport' && targetInfrastructure.seaportCount <= 0) {
    return { valid: false, reason: 'Target hex has no seaport' };
  }
  return { valid: true };
}

/**
 * Why this exists:
 *     Centralizes ferry legality checks so grouped ferry UI validation and turn resolution share one contract.
 * When to use:
 *     Before accepting or resolving one ferry order.
 * What to expect:
 *     Returns specific failure reasons for ownership, range, intact-airport prerequisites, and destination control.
 */
export function validateFerryOrder(
  unitId: string,
  destinationH3Index: string,
  options?: { allowedPlayer?: string }
): ValidationResult {
  logTrace('airValidation validateFerryOrder', { unitId, destinationH3Index, allowedPlayer: options?.allowedPlayer });
  const allowedPlayer = options?.allowedPlayer ?? 'human';
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };
  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== allowedPlayer) return { valid: false, reason: `Unit must belong to ${allowedPlayer}` };
  if (unit.unit_type !== 'air') return { valid: false, reason: 'Only air units can ferry' };
  if (!getMapHexSet().has(destinationH3Index)) return { valid: false, reason: 'Destination hex not on map' };
  const withinFerryRange = isWithinGridRangeSafe(unit.h3_index, destinationH3Index, AIR_FERRY_RANGE_HEXES, 'validateFerryOrder');
  if (!withinFerryRange) return { valid: false, reason: formatFerryOutOfRangeReason(AIR_FERRY_RANGE_HEXES) };
  const origin = getRes1InfrastructureForHex(unit.h3_index);
  if (origin.airportCount <= 0) return { valid: false, reason: 'Origin airport is not intact' };
  const destination = getRes1InfrastructureForHex(destinationH3Index);
  if (destination.airportCount <= 0) return { valid: false, reason: 'Destination airport is not intact' };
  const controller = getHexController(destinationH3Index);
  if (controller !== unit.player) return { valid: false, reason: 'Destination airport must be controlled by unit owner' };
  return { valid: true };
}
