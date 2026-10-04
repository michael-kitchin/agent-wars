import {
  dbGetAll,
  dbGetOne,
  getHexController,
  getMapHexSet,
  getRes1InfrastructureForHex,
  isDbReady,
} from '../gameDb';
import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import { fallbackDisplayNameFromUnitId } from '../../shared/unitDisplayNames';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES, formatFerryOutOfRangeReason, formatTargetOutOfRangeReason } from '../../shared/tacticalRanges';
import { logTrace } from '../logger';
import { isWithinAirFerryGridRange, isWithinAirStrikeGridRange } from './gridRange';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { strategicFerryRangeOnState } from '../weather/weatherMatch';
import { weatherTagsForBirthHex } from '../weather/weatherPackLoad';

/**
 * Documents the `ValidationResult` type alias (export type ValidationResult).

 * Purpose: Supports maintainability by documenting why `ValidationResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type ValidationResult = { /**
 * Specifies the contract for the `valid` member (valid: true).

 * Contract: Describes stable behavior for callers of `valid` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
valid: true } | { /**
 * Specifies the contract for the `valid` member (valid: false;).

 * Contract: Describes stable behavior for callers of `valid` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
valid: false; /**
 * Specifies the contract for the `reason` member (reason: string).

 * Contract: Describes stable behavior for callers of `reason` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
reason: string };

/**
 * Defines the `validateAirStrikeOrder` function shape (export function validateAirStrikeOrder( unitId: string, targetH3Index: string, targetType: AirStrikeTargetType, options?: { allowedPlayer?: string }).

 * Purpose: Supports maintainability by documenting why `validateAirStrikeOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function validateAirStrikeOrder(
  unitId: string,
  targetH3Index: string,
  targetType: AirStrikeTargetType,
  options?: { allowedPlayer?: string; displayLabelForUnit?: (id: string) => string }
): ValidationResult {
  logTrace('airValidation validateAirStrikeOrder', { unitId, targetH3Index, targetType, allowedPlayer: options?.allowedPlayer });
  const allowedPlayer = options?.allowedPlayer ?? 'human';
  const labelFor = options?.displayLabelForUnit ?? fallbackDisplayNameFromUnitId;
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };
  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${labelFor(unitId)}` };
  if (unit.player !== allowedPlayer) return { valid: false, reason: `Unit must belong to ${allowedPlayer}` };
  if (unit.unit_type !== 'air') return { valid: false, reason: 'Only air units can execute strikes' };
  if (!getMapHexSet().has(targetH3Index)) return { valid: false, reason: 'Target hex not on map' };

  const withinStrikeRange = isWithinAirStrikeGridRange(unit.h3_index, targetH3Index, 'validateAirStrikeOrder');
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
 * Defines the `validateFerryOrder` function shape (export function validateFerryOrder().

 * Purpose: Supports maintainability by documenting why `validateFerryOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function validateFerryOrder(
  unitId: string,
  destinationH3Index: string,
  options?: { allowedPlayer?: string; displayLabelForUnit?: (id: string) => string }
): ValidationResult {
  logTrace('airValidation validateFerryOrder', { unitId, destinationH3Index, allowedPlayer: options?.allowedPlayer });
  const allowedPlayer = options?.allowedPlayer ?? 'human';
  const labelFor = options?.displayLabelForUnit ?? fallbackDisplayNameFromUnitId;
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };
  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${labelFor(unitId)}` };
  if (unit.player !== allowedPlayer) return { valid: false, reason: `Unit must belong to ${allowedPlayer}` };
  if (unit.unit_type !== 'air') return { valid: false, reason: 'Only air units can ferry' };
  if (!getMapHexSet().has(destinationH3Index)) return { valid: false, reason: 'Destination hex not on map' };
  const weatherSettings = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: () => true });
  const turnNumber = dbGetOne<{ turn_number: number }>('SELECT turn_number FROM turn_state WHERE id = 1')?.turn_number ?? 1;
  const birth = dbGetOne<{ birth_h3_index: string | null }>('SELECT birth_h3_index FROM units WHERE id = ?', [unitId])?.birth_h3_index;
  const ferryRange = strategicFerryRangeOnState(
    { weatherTags: weatherTagsForBirthHex(birth) },
    destinationH3Index,
    { weatherBonusEnabled: weatherSettings.weatherBonusEnabled, turnNumber, startMonth: weatherSettings.startMonth }
  );
  const withinFerryRange = isWithinAirFerryGridRange(unit.h3_index, destinationH3Index, 'validateFerryOrder', ferryRange);
  if (!withinFerryRange) return { valid: false, reason: formatFerryOutOfRangeReason(ferryRange) };
  const origin = getRes1InfrastructureForHex(unit.h3_index);
  if (origin.airportCount <= 0) return { valid: false, reason: 'Origin airport is not intact' };
  const destination = getRes1InfrastructureForHex(destinationH3Index);
  if (destination.airportCount <= 0) return { valid: false, reason: 'Destination airport is not intact' };
  const controller = getHexController(destinationH3Index);
  if (controller !== unit.player) return { valid: false, reason: 'Destination airport must be controlled by unit owner' };
  return { valid: true };
}
