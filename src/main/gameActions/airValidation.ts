import {
  dbGetOne,
  getHexController,
  getMapHexSet,
  getStrategicInfrastructureForHex,
} from '../gameDb';
import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import { fallbackDisplayNameFromUnitId } from '../../shared/unitDisplayNames';
import { AIR_STRIKE_RANGE_HEXES, formatFerryOutOfRangeReason, formatTargetOutOfRangeReason } from '../../shared/tacticalRanges';
import { logTrace } from '../logger';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { isWithinAirFerryGridRange, isWithinAirStrikeGridRange } from './gridRange';
import { hasEnemyUnitsAtHex, loadOwnedStrategicUnit } from './ownedUnitGuards';
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
 * Checks whether one air unit may strike a strategic hex.
 *
 * Purpose: Single-unit strike gate shared by group targeting and order submit.
 * When to use: After the caller has a unit id, target hex, and strike target type.
 * Expected outcome: `{ valid: true }` or `{ valid: false, reason }` covering ownership, base airport, range, and the target type.
 * Exceptions: None. A closed database returns `{ valid: false, reason: 'Database not initialized' }`.
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
  const owned = loadOwnedStrategicUnit(unitId, { allowedPlayer, displayLabelForUnit: labelFor });
  if (!owned.ok) return owned.failure;
  const unit = owned.unit;
  if (unit.unit_type !== 'air') return { valid: false, reason: 'Only air units can execute strikes' };
  if (!getMapHexSet().has(targetH3Index)) return { valid: false, reason: 'Target hex not on map' };

  const withinStrikeRange = isWithinAirStrikeGridRange(unit.h3_index, targetH3Index, 'validateAirStrikeOrder');
  if (!withinStrikeRange) return { valid: false, reason: formatTargetOutOfRangeReason(unit.unit_type, AIR_STRIKE_RANGE_HEXES) };

  const baseInfrastructure = getStrategicInfrastructureForHex(unit.h3_index);
  if (isNeutralBorderHex(unit.h3_index) || baseInfrastructure.airportCount <= 0) {
    return { valid: false, reason: 'Air unit must be based at an intact airport to strike' };
  }

  if (targetType === 'units') {
    if (!hasEnemyUnitsAtHex(targetH3Index, unit.player)) return { valid: false, reason: 'Target hex has no enemy units' };
    return { valid: true };
  }

  const targetInfrastructure = getStrategicInfrastructureForHex(targetH3Index);
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
 * Checks whether one air unit may ferry to another controlled airport.
 *
 * Purpose: Single-unit ferry gate shared by group targeting and order submit.
 * When to use: After the caller has a unit id and a destination hex.
 * Expected outcome: `{ valid: true }` or `{ valid: false, reason }` covering ownership, range, and intact owned airports.
 * Exceptions: None. A closed database returns `{ valid: false, reason: 'Database not initialized' }`.
 */
export function validateFerryOrder(
  unitId: string,
  destinationH3Index: string,
  options?: { allowedPlayer?: string; displayLabelForUnit?: (id: string) => string }
): ValidationResult {
  logTrace('airValidation validateFerryOrder', { unitId, destinationH3Index, allowedPlayer: options?.allowedPlayer });
  const allowedPlayer = options?.allowedPlayer ?? 'human';
  const labelFor = options?.displayLabelForUnit ?? fallbackDisplayNameFromUnitId;
  const owned = loadOwnedStrategicUnit(unitId, { allowedPlayer, displayLabelForUnit: labelFor });
  if (!owned.ok) return owned.failure;
  const unit = owned.unit;
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
  const origin = getStrategicInfrastructureForHex(unit.h3_index);
  if (origin.airportCount <= 0) return { valid: false, reason: 'Origin airport is not intact' };
  const destination = getStrategicInfrastructureForHex(destinationH3Index);
  if (isNeutralBorderHex(destinationH3Index) || destination.airportCount <= 0) return { valid: false, reason: 'Destination airport is not intact' };
  const controller = getHexController(destinationH3Index);
  if (controller !== unit.player) return { valid: false, reason: 'Destination airport must be controlled by unit owner' };
  return { valid: true };
}
