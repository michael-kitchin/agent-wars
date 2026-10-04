import { computeGridDistanceWithPathFallbackPure, computeGridPathCellsPure } from '../../shared/h3GridRangePure';
import type { AirStrikeTargetType, GameStateSnapshot } from '../../shared/ipcTypes';
import {
  LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON,
  getLandMassRouteBlockReason,
  landUnitCanOccupyHex,
} from '../../shared/landTraversalRes1';
import { formatTargetOutOfRangeReason } from '../../shared/tacticalRanges';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildStrategicUnitDisplayLabelResolver, fallbackDisplayNameFromUnitId } from '../../shared/unitDisplayNames';
import { getRange } from '../combatConstants';
import { dbGetOne, getGameStateForPlayer, getMapHexSet, isDbReady } from '../gameDb';
import { logDebug, logError } from '../logger';
import { isLandSeaportSpawnHex, normalizeMovementTerrain } from '../movementTerrain';
import {
  NAVAL_DESTINATION_MUST_BE_WATER_COASTAL,
  NAVAL_SEAPORT_EGRESS_REQUIRED,
  NAVAL_START_MUST_BE_WATER_COASTAL,
} from '../navalMovementMessages';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { getActiveTacticalBattleSnapshot, isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { validateTacticalGroupFerryTarget } from '../tacticalBattle/tacticalFerryAirportGuards';
import { getRes1LandMassByH3 } from '../terrainClassificationCache';
import { strategicRangeOnState } from '../weather/weatherMatch';
import { validateAirStrikeOrder, validateFerryOrder } from './airValidation';
import type { SubmitOrdersResult } from './gameActionsTypes';
import { isWithinGridRangeSafe } from './gridRange';
import { getLandMovementBlockReason, isLandUnitType } from './landMovementConstraints';
import { hasEnemyUnitsAtHex, loadOwnedStrategicUnit } from './ownedUnitGuards';
import { isEmbarkedLandUnit, isEmbarkedLandUnitOnWater } from './sealift';
import { validateTacticalGroupRangedTarget } from './tacticalGroupRangedTargetValidation';
import { validateTacticalHumanAirStrikeGroup } from './tacticalHumanAirStrikeValidation';

/**
 * Defines the `effectiveHexPassabilityTerrain` function shape (function effectiveHexPassabilityTerrain(hex:).

 * Purpose: Supports maintainability by documenting why `effectiveHexPassabilityTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function effectiveHexPassabilityTerrain(hex: { h3Index: string; terrain: string; terrainKind?: string }): string {
  return normalizeMovementTerrain({ h3Index: hex.h3Index, terrain: hex.terrain, terrainKind: hex.terrainKind });
}

/**
 * Defines the `getMovementTerrainForH3` function shape (function getMovementTerrainForH3(h3Index: string): string).

 * Purpose: Supports maintainability by documenting why `getMovementTerrainForH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getMovementTerrainForH3(h3Index: string): string {
  const terrainRow = dbGetOne<{ terrain: string; terrainKind: string }>(
    'SELECT terrain, terrain_kind AS terrainKind FROM hexes WHERE h3_index = ?',
    [h3Index]
  );
  return effectiveHexPassabilityTerrain({
    h3Index,
    terrain: terrainRow?.terrain ?? 'land',
    terrainKind: terrainRow?.terrainKind,
  });
}

/**
 * Documents the module-scope binding `HUMAN_PLAYER_ID` (HUMAN_PLAYER_ID).

 * Purpose: Supports maintainability by documenting why `HUMAN_PLAYER_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const HUMAN_PLAYER_ID = 'human';

/**
 * Defines the `getUniqueNonEmptyIds` function shape (function getUniqueNonEmptyIds(ids: string[]): string[]).

 * Purpose: Supports maintainability by documenting why `getUniqueNonEmptyIds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getUniqueNonEmptyIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

/**
 * Defines the `humanPerspectiveStateSnapshot` function shape (function humanPerspectiveStateSnapshot(): GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `humanPerspectiveStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function humanPerspectiveStateSnapshot(): GameStateSnapshot {
  return getGameStateForPlayer(HUMAN_PLAYER_ID, { maskUnexploredTerrain: false });
}

/**
 * Checks whether a human unit may be ordered to a strategic hex.
 *
 * Purpose: Movement-order gate used by submit-orders before a standing march is stored.
 * When to use: From `submitOrders` with a display-label callback for missing-unit text.
 * Expected outcome: `{ valid: true }` or `{ valid: false, reason }` with the same reason strings as the previous inline ownership checks.
 * Exceptions: Logs at error and returns a reason when hex distance or a route cannot be derived; does not throw.
 */
export function validateOrder(
  unitId: string,
  toH3Index: string,
  displayLabelForUnit: (id: string) => string
): { valid: true } | { valid: false; reason: string } {
  const owned = loadOwnedStrategicUnit(unitId, {
    allowedPlayer: 'human',
    displayLabelForUnit,
    wrongOwnerReason: 'Only human units can receive orders',
  });
  if (!owned.ok) return owned.failure;
  const unit = owned.unit;

  const mapHexes = getMapHexSet();
  if (!mapHexes.has(toH3Index)) return { valid: false, reason: 'Destination not on map' };
  if (!mapHexes.has(unit.h3_index)) {
    return { valid: false, reason: 'Unit is on an invalid or outdated hex; start a new game.' };
  }

  const dist = computeGridDistanceWithPathFallbackPure(unit.h3_index, toH3Index);
  if (dist === null) {
    logError('gameActionsCore validateMoveOrder: no derivable distance between hexes', {
      unitId,
      fromH3Index: unit.h3_index,
      toH3Index,
    });
    return { valid: false, reason: 'Invalid hex or distance; try starting a new game.' };
  }
  const perspective = humanPerspectiveStateSnapshot();
  const snapUnit = perspective.units.find((candidate) => candidate.id === unitId);
  const range = strategicRangeOnState(
    { unitType: unit.unit_type, h3Index: unit.h3_index, weatherTags: snapUnit?.weatherTags },
    perspective
  );
  if (dist > range) return { valid: false, reason: `${unit.unit_type} can move at most ${range} hex(es)` };
  /* dist === 0 (same hex) is allowed: "hold" / no move is valid. */

  if (unit.unit_type === 'naval') {
    const navalDests = getValidDestinations(
      { id: unitId, h3Index: unit.h3_index, unitType: 'naval' },
      perspective
    );
    if (!navalDests.includes(toH3Index)) {
      const originTerrain = getMovementTerrainForH3(unit.h3_index);
      const seaportSpawnHex = isLandSeaportSpawnHex({
        h3Index: unit.h3_index,
        normalizedTerrain: originTerrain,
      });
      if (seaportSpawnHex) {
        return { valid: false, reason: NAVAL_SEAPORT_EGRESS_REQUIRED };
      }
      if (dist === 0) {
        return { valid: false, reason: NAVAL_START_MUST_BE_WATER_COASTAL };
      }
      return { valid: false, reason: NAVAL_DESTINATION_MUST_BE_WATER_COASTAL };
    }
  }
  if ((unit.unit_type === 'infantry' || unit.unit_type === 'armor') && !landUnitCanOccupyHex(toH3Index, getRes1LandMassByH3())) {
    return { valid: false, reason: LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON };
  }
  if (isLandUnitType(unit.unit_type)) {
    if (isEmbarkedLandUnit(unitId) && toH3Index !== unit.h3_index) {
      const blockReason = getLandMovementBlockReason({
        unitType: unit.unit_type,
        isEmbarked: true,
      });
      if (blockReason) return { valid: false, reason: blockReason };
    }
    const routeH3: string[] = [unit.h3_index];
    const traversedH3: string[] = [];
    if (dist > 1) {
      const path = computeGridPathCellsPure(unit.h3_index, toH3Index);
      if (path === null) {
        logError('gameActionsCore validateMoveOrder: no derivable route between hexes', {
          unitId,
          fromH3Index: unit.h3_index,
          toH3Index,
        });
        return { valid: false, reason: 'Invalid hex or path; try starting a new game.' };
      }
      traversedH3.push(...path);
    }
    for (const h3 of traversedH3) {
      if (routeH3[routeH3.length - 1] !== h3) routeH3.push(h3);
    }
    if (routeH3[routeH3.length - 1] !== toH3Index) routeH3.push(toH3Index);
    const landMassBlock = getLandMassRouteBlockReason(routeH3, getRes1LandMassByH3());
    if (landMassBlock) return { valid: false, reason: landMassBlock };
  }

  return { valid: true };
}

/**
 * Checks whether one unit may make a strategic ranged attack against a hex.
 *
 * Purpose: Single-unit ranged gate shared by group targeting and submit-orders.
 * When to use: After the caller has a unit id and target hex; pass `allowedPlayer` for opponent checks.
 * Expected outcome: `{ valid: true }` or `{ valid: false, reason }` covering ownership, range, embark, map, and enemy presence.
 * Exceptions: None. A closed database returns `{ valid: false, reason: 'Database not initialized' }`.
 */
export function validateRangedAttack(
  unitId: string,
  targetH3Index: string,
  options?: { allowedPlayer?: string; displayLabelForUnit?: (id: string) => string }
): { valid: true } | { valid: false; reason: string } {
  logDebug('gameActions validateRangedAttack', { unitId, targetH3Index, allowedPlayer: options?.allowedPlayer });
  const allowedPlayer = options?.allowedPlayer ?? 'human';
  const labelFor = options?.displayLabelForUnit ?? fallbackDisplayNameFromUnitId;
  const owned = loadOwnedStrategicUnit(unitId, { allowedPlayer, displayLabelForUnit: labelFor });
  if (!owned.ok) return owned.failure;
  const unit = owned.unit;

  const range = getRange(unit.unit_type);
  if (unit.unit_type === 'air') return { valid: false, reason: 'Air units use Strike mode, not ranged attack mode' };
  if (range < 1) return { valid: false, reason: `${unit.unit_type} has no ranged attack (melee only)` };
  if ((unit.unit_type === 'infantry' || unit.unit_type === 'armor') && isEmbarkedLandUnitOnWater(unitId)) {
    return { valid: false, reason: 'Embarked land units cannot attack while at sea.' };
  }

  if (!getMapHexSet().has(targetH3Index)) return { valid: false, reason: 'Target hex not on map' };

  const withinRange = isWithinGridRangeSafe(unit.h3_index, targetH3Index, range, 'validateRangedAttack');
  if (!withinRange) return { valid: false, reason: formatTargetOutOfRangeReason(unit.unit_type, range) };

  if (!hasEnemyUnitsAtHex(targetH3Index, unit.player)) {
    return { valid: false, reason: 'Target hex has no enemy units' };
  }

  return { valid: true };
}

/**
 * Runs the shared group-target preamble, then the tactical or per-unit strategic check.
 *
 * Purpose: Keeps ranged, strike, and ferry group validators on one failure shape without merging their log lines.
 * When to use: From each public group validator after that validator's own log line.
 * Expected outcome: `{ success: true }` or `{ success: false, reason }` from the empty selection, the tactical callback, or the first failing unit.
 * Exceptions: Caught and logged as `${logName}: exception`; returns `{ success: false, reason: String(err) }`.
 */
function validateGroupTarget(args: {
  logName: string;
  unitIds: string[];
  emptySelectionReason: string;
  validateTactical: (snap: TacticalBattleSnapshot, uniqueUnitIds: string[]) => SubmitOrdersResult;
  validateStrategicUnit: (unitId: string, strategicLabel: (id: string) => string) => { valid: boolean; reason?: string };
}): SubmitOrdersResult {
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(args.unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: args.emptySelectionReason };
    if (isTacticalBattleActive()) {
      const snap = getActiveTacticalBattleSnapshot();
      if (!snap) return { success: false, reason: 'No tactical battle is active.' };
      return args.validateTactical(snap, uniqueUnitIds);
    }
    const strategicLabel = buildStrategicUnitDisplayLabelResolver(humanPerspectiveStateSnapshot().units);
    for (const unitId of uniqueUnitIds) {
      const result = args.validateStrategicUnit(unitId, strategicLabel);
      if (!result.valid) {
        return { success: false, reason: `${strategicLabel(unitId)}: ${result.reason}` };
      }
    }
    return { success: true };
  } catch (err) {
    logError(`${args.logName}: exception`, err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Validates one ranged target for every selected unit, or the tactical group when a battle is active.
 *
 * Purpose: Shared entry for group ranged targeting so each selected unit keeps the same reason prefix as a single-unit check.
 * When to use: Group ranged IPC and opponent tactical draft sanitizing.
 * Expected outcome: `{ success: true }` when every unit can fire at the hex, or `{ success: false, reason }` for the first failure.
 * Exceptions: Logged as `validateGroupRangedTarget: exception` and returned as `{ success: false, reason }`.
 */
export function validateGroupRangedTarget(
  unitIds: string[],
  targetH3Index: string,
  opts?: { tacticalAttackerPlayer?: 'human' | 'opponent' }
): SubmitOrdersResult {
  const tacticalAttackerPlayer = opts?.tacticalAttackerPlayer ?? 'human';
  logDebug('gameActions validateGroupRangedTarget', {
    unitCount: unitIds.length,
    targetH3Index,
    tacticalAttackerPlayer,
  });
  return validateGroupTarget({
    logName: 'validateGroupRangedTarget',
    unitIds,
    emptySelectionReason: 'No selected units for ranged targeting',
    validateTactical: (snap, uniqueUnitIds) =>
      validateTacticalGroupRangedTarget({
        snap,
        uniqueUnitIds,
        targetH3Index,
        tacticalAttackerPlayer,
      }) as SubmitOrdersResult,
    validateStrategicUnit: (unitId, strategicLabel) =>
      validateRangedAttack(unitId, targetH3Index, {
        allowedPlayer: HUMAN_PLAYER_ID,
        displayLabelForUnit: strategicLabel,
      }),
  });
}

/**
 * Validates one air-strike target for every selected unit, or the tactical group when a battle is active.
 *
 * Purpose: Shared entry for group strike targeting so each selected air unit keeps the same reason prefix.
 * When to use: Group strike IPC and opponent tactical draft sanitizing.
 * Expected outcome: `{ success: true }` when every unit can strike the hex, or `{ success: false, reason }` for the first failure.
 * Exceptions: Logged as `validateGroupAirStrikeTarget: exception` and returned as `{ success: false, reason }`.
 */
export function validateGroupAirStrikeTarget(
  unitIds: string[],
  targetH3Index: string,
  targetType: AirStrikeTargetType,
  opts?: { tacticalAttackerPlayer?: 'human' | 'opponent' }
): SubmitOrdersResult {
  const tacticalAttackerPlayer = opts?.tacticalAttackerPlayer ?? 'human';
  logDebug('gameActions validateGroupAirStrikeTarget', {
    unitCount: unitIds.length,
    targetH3Index,
    targetType,
    tacticalAttackerPlayer,
  });
  return validateGroupTarget({
    logName: 'validateGroupAirStrikeTarget',
    unitIds,
    emptySelectionReason: 'No selected units for strike targeting',
    validateTactical: (snap, uniqueUnitIds) => {
      const check = validateTacticalHumanAirStrikeGroup(
        snap,
        uniqueUnitIds,
        targetH3Index,
        targetType,
        tacticalAttackerPlayer
      );
      return check.success ? { success: true } : check;
    },
    validateStrategicUnit: (unitId, strategicLabel) =>
      validateAirStrikeOrder(unitId, targetH3Index, targetType, {
        allowedPlayer: HUMAN_PLAYER_ID,
        displayLabelForUnit: strategicLabel,
      }),
  });
}

/**
 * Validates one ferry destination for every selected unit, or the tactical group when a battle is active.
 *
 * Purpose: Shared entry for group ferry targeting so each selected air unit keeps the same reason prefix.
 * When to use: Group ferry IPC and opponent tactical draft sanitizing.
 * Expected outcome: `{ success: true }` when every unit can ferry to the hex, or `{ success: false, reason }` for the first failure.
 * Exceptions: Logged as `validateGroupFerryTarget: exception` and returned as `{ success: false, reason }`.
 */
export function validateGroupFerryTarget(
  unitIds: string[],
  destinationH3Index: string,
  opts?: { tacticalAttackerPlayer?: 'human' | 'opponent' }
): SubmitOrdersResult {
  const tacticalAttackerPlayer = opts?.tacticalAttackerPlayer ?? 'human';
  logDebug('gameActions validateGroupFerryTarget', {
    unitCount: unitIds.length,
    destinationH3Index,
    tacticalAttackerPlayer,
  });
  return validateGroupTarget({
    logName: 'validateGroupFerryTarget',
    unitIds,
    emptySelectionReason: 'No selected units for ferry targeting',
    validateTactical: (snap, uniqueUnitIds) =>
      validateTacticalGroupFerryTarget(snap, uniqueUnitIds, destinationH3Index, tacticalAttackerPlayer),
    validateStrategicUnit: (unitId, strategicLabel) =>
      validateFerryOrder(unitId, destinationH3Index, {
        allowedPlayer: HUMAN_PLAYER_ID,
        displayLabelForUnit: strategicLabel,
      }),
  });
}
