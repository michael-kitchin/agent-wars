/**
 * WEGO turn actions: validate movement orders, submit orders, and resolve the turn.
 * All logic runs in the main process and uses the game database.
 */

import { gridDistance, gridPathCells } from 'h3-js';
import {
  dbGetOne,
  dbRun,
  dbGetAll,
  isDbReady,
  saveDatabase,
  getGameSeed,
  setGameOver,
  getMapHexSet,
  refreshFogOfWarIntelFromCurrentState,
  addAiLossEventsSinceConsultation,
  getHexController,
  listAllHexControls,
  listUnitsForSnapshot,
  getRes1InfrastructureForHex,
  getGameStateForPlayer,
  getScenarioHomeRegionHexes,
} from './gameDb';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from './game-db/scenarioState';
import { buildLatLngCoordinateMap, getOrderedHexList } from './mapData';
import { getRange } from './combatConstants';
import { runRangedPhase, runMeleePhase, createCombatRng, type CombatUnit } from './combatResolution';
import { logDebug, logError, logTrace } from './logger';
import type {
  MovementOrder,
  RangedAttackOrder,
  SubmitOrdersPayload,
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  AirStrikeTargetType,
  ReadyResult,
  FerryAnimationMove,
  SealiftStackState,
} from '../shared/ipcTypes';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { executePlanRoute } from './tools/tool1Pathfinding';
import { terrainIsPassableForDomain } from './pathfinding';
import { normalizeMovementTerrain, isLandSeaportSpawnHex } from './movementTerrain';
import {
  NAVAL_DESTINATION_MUST_BE_WATER_COASTAL,
  NAVAL_SEAPORT_EGRESS_REQUIRED,
  NAVAL_START_MUST_BE_WATER_COASTAL,
} from './navalMovementMessages';
import {
  assignHumanMarchStandingOrder,
  cancelHumanStandingOrder,
  generateOrdersForStandingOrders,
  queryHumanStandingOrders,
} from './tools/tool5StandingOrders';
import type { BuildUnitType } from './productionRules';
import {
  AIR_FERRY_RANGE_HEXES,
  MOVEMENT_RANGE_BY_UNIT_TYPE,
  formatTargetOutOfRangeReason,
} from '../shared/tacticalRanges';
import { validateAirStrikeOrder, validateFerryOrder } from './game-actions/airValidation';
import { isWithinGridRangeSafe } from './game-actions/gridRange';
import { resolveAirStrikePhase } from './game-actions/airStrikeResolution';
import {
  addHexBuildQueueEntryImpl,
  getHexBuildQueueImpl,
  removeHexBuildQueueEntryImpl,
  updateHexBuildQueueEntryImpl,
  type HexBuildQueueView,
} from './game-actions/buildQueue';
import {
  previewHumanMarchOrderImpl,
  previewHumanMarchOrdersImpl,
  type HumanOrderGroupPreviewResult,
  type HumanOrderPreviewResult,
} from './game-actions/humanMarchPreview';
import {
  getLandMovementBlockReason,
  isLandUnitType,
} from './game-actions/landMovementConstraints';
import {
  collectTraversedHexesByPlayer,
  processProductionAfterControlResolution,
  resolveRes1ControlAfterCombatAndMovement,
} from './game-actions/controlAndProduction';
import { submitOrdersImpl } from './game-actions/submitOrders';
import {
  applyTransportLossForRemovedNavalUnits,
  applyEmbarkOrdersForPlayer,
  autoDisembarkIndependentLandMoves,
  deleteTransportAssignmentsForRemovedUnits,
  getSealiftStackStateImpl,
  isEmbarkedLandUnitOnWater,
  syncEmbarkedLandUnitPositionsWithNaval,
  updateSealiftSlotImpl,
} from './game-actions/sealift';

/**
 * Defines the `evaluateRegionControlWinnerAtEndOfTurn` function shape (export function evaluateRegionControlWinnerAtEndOfTurn(): 'human' | 'opponent' | null { logTrace('gameActions evaluateRegionControlWinnerAtEndOfTurn'); co).

 * Purpose: Supports maintainability by documenting why `evaluateRegionControlWinnerAtEndOfTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function evaluateRegionControlWinnerAtEndOfTurn(): 'human' | 'opponent' | null {
  logTrace('gameActions evaluateRegionControlWinnerAtEndOfTurn');
  const scenario = loadScenarioState({ getOne: dbGetOne });
  if (scenario.scenarioId !== REGION_VS_REGION_SCENARIO_ID) return null;
  const humanHomeRegion = scenario.humanHomeRegion;
  const aiHomeRegion = scenario.aiHomeRegion;
  const humanRegionHexes = getScenarioHomeRegionHexes(humanHomeRegion);
  const aiRegionHexes = getScenarioHomeRegionHexes(aiHomeRegion);
  if (humanRegionHexes.length <= 0 || aiRegionHexes.length <= 0) return null;
  const controlByHex = new Map(listAllHexControls().map((row) => [row.h3Index, row.controllerPlayerId]));
  const humanControlsAiRegion = aiRegionHexes.every((h3Index) => controlByHex.get(h3Index) === 'human');
  const aiControlsHumanRegion = humanRegionHexes.every((h3Index) => controlByHex.get(h3Index) === 'opponent');
  if (humanControlsAiRegion && !aiControlsHumanRegion) return 'human';
  if (aiControlsHumanRegion && !humanControlsAiRegion) return 'opponent';
  return null;
}

export type { MovementOrder, RangedAttackOrder, SubmitOrdersPayload };
export type { HexBuildQueueEntryView, HexBuildQueueView } from './game-actions/buildQueue';
export type {
  HumanOrderPreviewSegment,
  HumanOrderPreviewResult,
  HumanOrderGroupPreviewUnitResult,
  HumanOrderGroupPreviewResult,
} from './game-actions/humanMarchPreview';
/**
 * Documents the `SubmitOrdersResult` interface as a named contract surface (export interface SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `SubmitOrdersResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SubmitOrdersResult {
    /**
   * Specifies the contract for the `success` member (success: boolean;).

   * Contract: Describes stable behavior for callers of `success` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
success: boolean;
    /**
   * Specifies the contract for the `reason` member (reason?: string;).

   * Contract: Describes stable behavior for callers of `reason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reason?: string;
}

/**
 * Documents the `HumanStandingOrderView` interface as a named contract surface (export interface HumanStandingOrderView).

 * Purpose: Supports maintainability by documenting why `HumanStandingOrderView` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanStandingOrderView {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `status` member (status: string;).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: string;
    /**
   * Specifies the contract for the `destinationH3Index` member (destinationH3Index: string | null;).

   * Contract: Describes stable behavior for callers of `destinationH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destinationH3Index: string | null;
    /**
   * Specifies the contract for the `turnsRemaining` member (turnsRemaining: number;).

   * Contract: Describes stable behavior for callers of `turnsRemaining` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnsRemaining: number;
    /**
   * Specifies the contract for the `nextMoveH3Index` member (nextMoveH3Index: string | null;).

   * Contract: Describes stable behavior for callers of `nextMoveH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
nextMoveH3Index: string | null;
    /**
   * Specifies the contract for the `routeSegments` member (routeSegments?: { turn: number; hexes: [number, number][] }[];).

   * Contract: Describes stable behavior for callers of `routeSegments` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
routeSegments?: { turn: number; hexes: [number, number][] }[];
}

/**
 * Defines the `effectiveHexPassabilityTerrain` function shape (function effectiveHexPassabilityTerrain(hex:).

 * Purpose: Supports maintainability by documenting why `effectiveHexPassabilityTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function effectiveHexPassabilityTerrain(hex: { h3Index: string; terrain: string; terrainKind?: string }): string {
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
 * Defines the `getTerrainMapsForH3Indexes` function shape (function getTerrainMapsForH3Indexes(h3Indexes: readonly string[]):).

 * Purpose: Supports maintainability by documenting why `getTerrainMapsForH3Indexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getTerrainMapsForH3Indexes(h3Indexes: readonly string[]): {
  terrainByH3: Map<string, string>;
  terrainKindByH3: Map<string, string>;
} {
  if (h3Indexes.length === 0) {
    return { terrainByH3: new Map<string, string>(), terrainKindByH3: new Map<string, string>() };
  }
  const placeholders = h3Indexes.map(() => '?').join(', ');
  const rows = dbGetAll<{ h3Index: string; terrain: string | null; terrainKind: string | null }>(
    `SELECT h3_index AS h3Index, terrain, terrain_kind AS terrainKind FROM hexes WHERE h3_index IN (${placeholders})`,
    [...h3Indexes]
  );
  const terrainByH3 = new Map<string, string>();
  const terrainKindByH3 = new Map<string, string>();
  for (const row of rows) {
    terrainByH3.set(row.h3Index, row.terrain ?? '');
    terrainKindByH3.set(row.h3Index, row.terrainKind ?? '');
  }
  return { terrainByH3, terrainKindByH3 };
}

/**
 * Documents the module-scope binding `VALID_PHASE` (VALID_PHASE).

 * Purpose: Supports maintainability by documenting why `VALID_PHASE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const VALID_PHASE = 'planning';
/**
 * Documents the module-scope binding `HUMAN_PLAYER_ID` (HUMAN_PLAYER_ID).

 * Purpose: Supports maintainability by documenting why `HUMAN_PLAYER_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const HUMAN_PLAYER_ID = 'human';
/**
 * Documents the module-scope binding `MIXED_STACK_COASTAL_ONLY_REASON` (MIXED_STACK_COASTAL_ONLY_REASON).

 * Purpose: Supports maintainability by documenting why `MIXED_STACK_COASTAL_ONLY_REASON` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const MIXED_STACK_COASTAL_ONLY_REASON = 'Mixed land/naval stacks can only move to coastal hexes.';
/**
 * Documents the module-scope binding `AIR_UNITS_CANNOT_MARCH_REASON` (AIR_UNITS_CANNOT_MARCH_REASON).

 * Purpose: Supports maintainability by documenting why `AIR_UNITS_CANNOT_MARCH_REASON` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AIR_UNITS_CANNOT_MARCH_REASON = 'Air units cannot use march orders; use Strike or Ferry.';
/**
 * Documents the `HumanOwnedUnit` type alias (type HumanOwnedUnit).

 * Purpose: Supports maintainability by documenting why `HumanOwnedUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type HumanOwnedUnit = { /**
 * Specifies the contract for the `id` member (id: string;).

 * Contract: Describes stable behavior for callers of `id` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
id: string; /**
 * Specifies the contract for the `player` member (player: string;).

 * Contract: Describes stable behavior for callers of `player` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
player: string; /**
 * Specifies the contract for the `unitType` member (unitType: string;).

 * Contract: Describes stable behavior for callers of `unitType` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
unitType: string; /**
 * Specifies the contract for the `h3Index` member (h3Index: string).

 * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
h3Index: string };

/**
 * Defines the `getUniqueNonEmptyIds` function shape (function getUniqueNonEmptyIds(ids: string[]): string[]).

 * Purpose: Supports maintainability by documenting why `getUniqueNonEmptyIds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getUniqueNonEmptyIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

/**
 * Defines the `selectionHasMixedLandAndNaval` function shape (function selectionHasMixedLandAndNaval(units: HumanOwnedUnit[]): boolean).

 * Purpose: Supports maintainability by documenting why `selectionHasMixedLandAndNaval` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function selectionHasMixedLandAndNaval(units: HumanOwnedUnit[]): boolean {
  const hasNaval = units.some((unit) => unit.unitType === 'naval');
  const hasLand = units.some((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor');
  return hasNaval && hasLand;
}

/**
 * Defines the `hexSupportsMixedLandAndNaval` function shape (function hexSupportsMixedLandAndNaval(hex:).

 * Purpose: Supports maintainability by documenting why `hexSupportsMixedLandAndNaval` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function hexSupportsMixedLandAndNaval(hex: { h3Index: string; terrain: string; terrainKind?: string }): boolean {
  const passabilityTerrain = effectiveHexPassabilityTerrain(hex);
  return (
    terrainIsPassableForDomain(passabilityTerrain, 'land') &&
    terrainIsPassableForDomain(passabilityTerrain, 'water')
  );
}

/**
 * Defines the `dbBackedStateSnapshot` function shape (function dbBackedStateSnapshot()).

 * Purpose: Supports maintainability by documenting why `dbBackedStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function dbBackedStateSnapshot() {
  return {
    hexes: dbGetAll<{ h3Index: string; terrain: string; terrainKind: string }>(
      'SELECT h3_index AS h3Index, terrain, terrain_kind AS terrainKind FROM hexes'
    ),
    units: dbGetAll<{ id: string; player: string; unitType: string; h3Index: string }>(
      'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units'
    ),
    phase: dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning',
    turnNumber: dbGetOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1')?.turnNumber ?? 1,
    pendingOrders: dbGetAll<{ unitId: string; toH3Index: string }>(
      'SELECT unit_id AS unitId, to_h3_index AS toH3Index FROM pending_orders'
    ),
  };
}

/**
 * Defines the `humanPerspectiveStateSnapshot` function shape (function humanPerspectiveStateSnapshot(): ReturnType<typeof dbBackedStateSnapshot>).

 * Purpose: Supports maintainability by documenting why `humanPerspectiveStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function humanPerspectiveStateSnapshot(): ReturnType<typeof dbBackedStateSnapshot> {
  return getGameStateForPlayer(HUMAN_PLAYER_ID, { maskUnexploredTerrain: false });
}

/**
 * Defines the `validateOrder` function shape (function validateOrder().

 * Purpose: Supports maintainability by documenting why `validateOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function validateOrder(
  unitId: string,
  toH3Index: string
): { valid: true } | { valid: false; reason: string } {
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };

  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== 'human') return { valid: false, reason: 'Only human units can receive orders' };

  const mapHexes = getMapHexSet();
  if (!mapHexes.has(toH3Index)) return { valid: false, reason: 'Destination not on map' };
  if (!mapHexes.has(unit.h3_index)) {
    return { valid: false, reason: 'Unit is on an invalid or outdated hex; start a new game.' };
  }

  let dist: number;
  try {
    dist = gridDistance(unit.h3_index, toH3Index);
  } catch {
    return { valid: false, reason: 'Invalid hex or distance; try starting a new game.' };
  }
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unit_type] ?? 1;
  if (dist > range) return { valid: false, reason: `${unit.unit_type} can move at most ${range} hex(es)` };
  /* dist === 0 (same hex) is allowed: "hold" / no move is valid. */

  const originTerrain = getMovementTerrainForH3(unit.h3_index);
  const destinationTerrain = getMovementTerrainForH3(toH3Index);
  if (unit.unit_type === 'naval' && !passabilityAllowsNavalUnit(destinationTerrain)) {
    return { valid: false, reason: NAVAL_DESTINATION_MUST_BE_WATER_COASTAL };
  }
  if (unit.unit_type === 'naval' && !passabilityAllowsNavalUnit(originTerrain)) {
    const seaportSpawnHex = isLandSeaportSpawnHex({
      h3Index: unit.h3_index,
      normalizedTerrain: originTerrain,
    });
    if (!seaportSpawnHex) {
      return { valid: false, reason: NAVAL_START_MUST_BE_WATER_COASTAL };
    }
    if (dist !== 1 || !passabilityAllowsNavalUnit(destinationTerrain)) {
      return { valid: false, reason: NAVAL_SEAPORT_EGRESS_REQUIRED };
    }
  }
  if ((unit.unit_type === 'infantry' || unit.unit_type === 'armor') && !passabilityAllowsLandUnit(destinationTerrain)) {
    return { valid: false, reason: 'Land units must move to land, coastal, or wetlands hexes' };
  }
  if (isLandUnitType(unit.unit_type)) {
    const embarkedAtSeaWithoutCoastalOrigin =
      isEmbarkedLandUnitOnWater(unitId) && originTerrain !== 'coastal';
    const traversedH3: string[] = [];
    if (dist > 1) {
      try {
        traversedH3.push(...gridPathCells(unit.h3_index, toH3Index));
      } catch {
        return { valid: false, reason: 'Invalid hex or path; try starting a new game.' };
      }
    }
    const { terrainByH3, terrainKindByH3 } = getTerrainMapsForH3Indexes([unit.h3_index, toH3Index, ...traversedH3]);
    const blockReason = getLandMovementBlockReason({
      unitType: unit.unit_type,
      originH3Index: unit.h3_index,
      destinationH3Index: toH3Index,
      terrainByH3,
      terrainKindByH3,
      traversedH3Indices: traversedH3,
      isEmbarkedAtSea: embarkedAtSeaWithoutCoastalOrigin,
    });
    if (blockReason) return { valid: false, reason: blockReason };
  }

  return { valid: true };
}

/**
 * Defines the `validateRangedAttack` function shape (export function validateRangedAttack( unitId: string, targetH3Index: string, options?: { allowedPlayer?: string } ): { valid: true } | { valid: false;).

 * Purpose: Supports maintainability by documenting why `validateRangedAttack` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function validateRangedAttack(
  unitId: string,
  targetH3Index: string,
  options?: { allowedPlayer?: string }
): { valid: true } | { valid: false; reason: string } {
  const allowedPlayer = options?.allowedPlayer ?? 'human';
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };

  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== allowedPlayer) {
    return { valid: false, reason: `Unit must belong to ${allowedPlayer}` };
  }

  const range = getRange(unit.unit_type);
  if (unit.unit_type === 'air') return { valid: false, reason: 'Air units use Strike mode, not ranged attack mode' };
  if (range < 1) return { valid: false, reason: `${unit.unit_type} has no ranged attack (melee only)` };
  if ((unit.unit_type === 'infantry' || unit.unit_type === 'armor') && isEmbarkedLandUnitOnWater(unitId)) {
    return { valid: false, reason: 'Embarked land units cannot attack while at sea.' };
  }

  if (!getMapHexSet().has(targetH3Index)) return { valid: false, reason: 'Target hex not on map' };

  const withinRange = isWithinGridRangeSafe(unit.h3_index, targetH3Index, range, 'validateRangedAttack');
  if (!withinRange) return { valid: false, reason: formatTargetOutOfRangeReason(unit.unit_type, range) };

  const enemiesAtTarget = dbGetAll<{ player: string }>(
    'SELECT player FROM units WHERE h3_index = ? AND player != ?',
    [targetH3Index, unit.player]
  );
  if (enemiesAtTarget.length === 0) {
    return { valid: false, reason: 'Target hex has no enemy units' };
  }

  return { valid: true };
}

/**
 * Defines the `listHumanStandingOrders` function shape (export function listHumanStandingOrders(): HumanStandingOrderView[]).

 * Purpose: Supports maintainability by documenting why `listHumanStandingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listHumanStandingOrders(): HumanStandingOrderView[] {
  logTrace('gameActions listHumanStandingOrders');
  try {
    if (!isDbReady()) return [];
    const state = humanPerspectiveStateSnapshot();
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const result = queryHumanStandingOrders(state, latLngByH3, resolveToH3) as {
      status: string;
      orders?: Array<{
        unitId?: string;
        type?: string;
        status?: string;
        turnsRemaining?: number;
        nextMoveHex?: [number, number];
        destination?: [number, number];
      }>;
    };
    if (result.status !== 'ok' || !Array.isArray(result.orders)) return [];
    const validHumanUnitIds = new Set(state.units.filter((u) => u.player === HUMAN_PLAYER_ID).map((u) => u.id));
    const marchOrders = result.orders.filter(
      (o) => o.type === 'march' && typeof o.unitId === 'string' && validHumanUnitIds.has(o.unitId)
    );
    if (marchOrders.length !== result.orders.length) {
      const staleUnitIds = result.orders
        .map((o) => o.unitId)
        .filter((unitId): unitId is string => typeof unitId === 'string' && !validHumanUnitIds.has(unitId));
      for (const unitId of staleUnitIds) {
        dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [HUMAN_PLAYER_ID, unitId]);
      }
      logDebug('gameActions listHumanStandingOrders: skipped stale standing orders for missing units', {
        total: result.orders.length,
        kept: marchOrders.length,
        deleted: staleUnitIds.length,
      });
    }
    return marchOrders
      .map((o) => {
        const unitId = o.unitId as string;
        const destinationH3Index =
          Array.isArray(o.destination) && o.destination.length >= 2
            ? resolveToH3(Number(o.destination[0]), Number(o.destination[1])) ?? null
            : null;
        let routeSegments: { turn: number; hexes: [number, number][] }[] | undefined;
        if (Array.isArray(o.destination) && o.destination.length >= 2) {
          const planned = executePlanRoute(
            unitId,
            [Number(o.destination[0]), Number(o.destination[1])],
            { avoidEnemies: false },
            state,
            latLngByH3,
            resolveToH3
          );
          if (planned.status === 'ok') {
            routeSegments = planned.path.map((seg) => ({ turn: seg.turn, hexes: seg.hexes }));
          }
        }
        return {
          unitId,
          status: String(o.status ?? 'en_route'),
          destinationH3Index,
          turnsRemaining: Number(o.turnsRemaining ?? 0),
          nextMoveH3Index:
            Array.isArray(o.nextMoveHex) && o.nextMoveHex.length >= 2
              ? resolveToH3(Number(o.nextMoveHex[0]), Number(o.nextMoveHex[1])) ?? null
              : null,
          routeSegments,
        };
      })
      .sort((a, b) => a.unitId.localeCompare(b.unitId));
  } catch (err) {
    logError('listHumanStandingOrders: exception', err);
    return [];
  }
}

/**
 * Defines the `cancelHumanMovementOrdersForUnit` function shape (function cancelHumanMovementOrdersForUnit(unitId: string): void).

 * Purpose: Supports maintainability by documenting why `cancelHumanMovementOrdersForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function cancelHumanMovementOrdersForUnit(unitId: string): void {
  dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ? AND order_type = ?', [
    HUMAN_PLAYER_ID,
    unitId,
    'march',
  ]);
  dbRun('DELETE FROM pending_orders WHERE unit_id = ?', [unitId]);
}

/**
 * Defines the `clearEmbarkAssignmentForIndependentLandMove` function shape (function clearEmbarkAssignmentForIndependentLandMove(unitId: string, destinationH3Index: string): void).

 * Purpose: Supports maintainability by documenting why `clearEmbarkAssignmentForIndependentLandMove` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function clearEmbarkAssignmentForIndependentLandMove(unitId: string, destinationH3Index: string): void {
  const assignment = dbGetOne<{ navalUnitId: string; navalH3Index: string }>(
    `SELECT uta.naval_unit_id AS navalUnitId,
            nu.h3_index AS navalH3Index
     FROM unit_transport_assignments uta
     JOIN units nu ON nu.id = uta.naval_unit_id
     WHERE uta.land_unit_id = ?`,
    [unitId]
  );
  if (!assignment) return;
  if (destinationH3Index === assignment.navalH3Index) return;
  dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [unitId]);
  logDebug('gameActions assignHumanMarchOrder: auto-disembarked land unit for independent move', {
    unitId,
    destinationH3Index,
    navalUnitId: assignment.navalUnitId,
    navalH3Index: assignment.navalH3Index,
  });
}

/**
 * Defines the `assignHumanMarchOrder` function shape (export function assignHumanMarchOrder(unitId: string, destinationH3Index: string): SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `assignHumanMarchOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function assignHumanMarchOrder(unitId: string, destinationH3Index: string): SubmitOrdersResult {
  logDebug('gameActions assignHumanMarchOrder', { unitId, destinationH3Index });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const state = humanPerspectiveStateSnapshot();
    const turnRow = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1');
    if (turnRow?.phase !== VALID_PHASE) return { success: false, reason: 'Not in planning phase' };
    const unitRow = state.units.find((unit) => unit.id === unitId && unit.player === HUMAN_PLAYER_ID);
    if (!unitRow) return { success: false, reason: 'Unit not found or not human-controlled' };
    if (unitRow.unitType === 'air') return { success: false, reason: AIR_UNITS_CANNOT_MARCH_REASON };
    const destinationHex = state.hexes.find((hex) => hex.h3Index === destinationH3Index);
    if (!destinationHex) return { success: false, reason: 'Destination not on map' };
    const destinationTerrain = effectiveHexPassabilityTerrain(destinationHex);
    const destinationSeaportCount = getRes1InfrastructureForHex(destinationH3Index).seaportCount;
    logDebug('gameActions assignHumanMarchOrder: destination terrain classification', {
      unitId,
      destinationH3Index,
      destinationTerrain,
      destinationTerrainRaw: destinationHex.terrain,
      destinationTerrainKind: destinationHex.terrainKind,
      destinationSeaportCount,
    });
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const destinationLatLng = latLngByH3.get(destinationH3Index);
    if (!destinationLatLng) return { success: false, reason: 'Destination not on map' };
    const result = assignHumanMarchStandingOrder(unitId, destinationLatLng, state, latLngByH3, resolveToH3) as {
      status: string;
      error?: string;
    };
    if (result.status !== 'ok') {
      logDebug('gameActions assignHumanMarchOrder: standing-order assignment rejected', {
        unitId,
        destinationH3Index,
        error: result.error ?? 'Failed to assign order',
      });
      return { success: false, reason: result.error ?? 'Failed to assign order' };
    }
    clearEmbarkAssignmentForIndependentLandMove(unitId, destinationH3Index);
    return { success: true };
  } catch (err) {
    logError('assignHumanMarchOrder: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `assignHumanMarchOrders` function shape (export function assignHumanMarchOrders(unitIds: string[], destinationH3Index: string): SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `assignHumanMarchOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function assignHumanMarchOrders(unitIds: string[], destinationH3Index: string): SubmitOrdersResult {
  logDebug('gameActions assignHumanMarchOrders', { unitCount: unitIds.length, destinationH3Index });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units to assign' };
    const state = humanPerspectiveStateSnapshot();
    const destinationHex = state.hexes.find((h) => h.h3Index === destinationH3Index);
    if (!destinationHex) return { success: false, reason: 'Destination not on map' };
    const selectedUnits = uniqueUnitIds
      .map((unitId) => state.units.find((unit) => unit.id === unitId && unit.player === HUMAN_PLAYER_ID))
      .filter((unit): unit is HumanOwnedUnit => !!unit);
    if (selectedUnits.length !== uniqueUnitIds.length) {
      logDebug('gameActions assignHumanMarchOrders: invalid unit selection set', {
        requestedUnitCount: uniqueUnitIds.length,
        validHumanUnitCount: selectedUnits.length,
      });
      return { success: false, reason: 'At least one selected unit is invalid or not human-controlled.' };
    }
    const destinationTerrain = effectiveHexPassabilityTerrain(destinationHex);
    const destinationSeaportCount = getRes1InfrastructureForHex(destinationH3Index).seaportCount;
    const sharedMixedTerrain = hexSupportsMixedLandAndNaval(destinationHex);
    const hasMixedSelection = selectionHasMixedLandAndNaval(selectedUnits);
    logDebug('gameActions assignHumanMarchOrders: destination terrain classification', {
      destinationH3Index,
      destinationTerrain,
      destinationTerrainRaw: destinationHex.terrain,
      destinationTerrainKind: destinationHex.terrainKind,
      destinationSeaportCount,
      hasLand: selectedUnits.some((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor'),
      hasNaval: selectedUnits.some((unit) => unit.unitType === 'naval'),
      sharedMixedTerrain,
      selectedUnitTypes: selectedUnits.map((u) => u.unitType),
    });
    if (hasMixedSelection && !sharedMixedTerrain) {
      return { success: false, reason: MIXED_STACK_COASTAL_ONLY_REASON };
    }

    for (const unitId of uniqueUnitIds) {
      const result = assignHumanMarchOrder(unitId, destinationH3Index);
      if (!result.success) {
        logDebug('gameActions assignHumanMarchOrders: unit assignment failed', {
          unitId,
          destinationH3Index,
          reason: result.reason ?? `Failed to assign movement order for ${unitId}`,
        });
        return { success: false, reason: result.reason ?? `Failed to assign movement order for ${unitId}` };
      }
    }
    return { success: true };
  } catch (err) {
    logError('assignHumanMarchOrders: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `cancelHumanOrder` function shape (export function cancelHumanOrder(unitId: string): SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `cancelHumanOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function cancelHumanOrder(unitId: string): SubmitOrdersResult {
  logDebug('gameActions cancelHumanOrder', { unitId });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const state = humanPerspectiveStateSnapshot();
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const result = cancelHumanStandingOrder(unitId, state, latLngByH3, resolveToH3) as { status: string; error?: string };
    if (result.status !== 'ok') return { success: false, reason: result.error ?? 'Failed to cancel order' };
    return { success: true };
  } catch (err) {
    logError('cancelHumanOrder: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `validateGroupRangedTarget` function shape (export function validateGroupRangedTarget(unitIds: string[], targetH3Index: string): SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `validateGroupRangedTarget` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function validateGroupRangedTarget(unitIds: string[], targetH3Index: string): SubmitOrdersResult {
  logDebug('gameActions validateGroupRangedTarget', { unitCount: unitIds.length, targetH3Index });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units for ranged targeting' };
    for (const unitId of uniqueUnitIds) {
      const result = validateRangedAttack(unitId, targetH3Index, { allowedPlayer: HUMAN_PLAYER_ID });
      if (!result.valid) {
        return { success: false, reason: `${unitId}: ${result.reason}` };
      }
    }
    return { success: true };
  } catch (err) {
    logError('validateGroupRangedTarget: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `validateGroupAirStrikeTarget` function shape (export function validateGroupAirStrikeTarget().

 * Purpose: Supports maintainability by documenting why `validateGroupAirStrikeTarget` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function validateGroupAirStrikeTarget(
  unitIds: string[],
  targetH3Index: string,
  targetType: AirStrikeTargetType
): SubmitOrdersResult {
  logDebug('gameActions validateGroupAirStrikeTarget', { unitCount: unitIds.length, targetH3Index, targetType });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units for strike targeting' };
    for (const unitId of uniqueUnitIds) {
      const result = validateAirStrikeOrder(unitId, targetH3Index, targetType, { allowedPlayer: HUMAN_PLAYER_ID });
      if (!result.valid) return { success: false, reason: `${unitId}: ${result.reason}` };
    }
    return { success: true };
  } catch (err) {
    logError('validateGroupAirStrikeTarget: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `validateGroupFerryTarget` function shape (export function validateGroupFerryTarget(unitIds: string[], destinationH3Index: string): SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `validateGroupFerryTarget` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function validateGroupFerryTarget(unitIds: string[], destinationH3Index: string): SubmitOrdersResult {
  logDebug('gameActions validateGroupFerryTarget', { unitCount: unitIds.length, destinationH3Index });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units for ferry targeting' };
    for (const unitId of uniqueUnitIds) {
      const result = validateFerryOrder(unitId, destinationH3Index, { allowedPlayer: HUMAN_PLAYER_ID });
      if (!result.valid) return { success: false, reason: `${unitId}: ${result.reason}` };
    }
    return { success: true };
  } catch (err) {
    logError('validateGroupFerryTarget: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `destroyAirUnitsWithInvalidBase` function shape (function destroyAirUnitsWithInvalidBase(): CombatUnit[]).

 * Purpose: Supports maintainability by documenting why `destroyAirUnitsWithInvalidBase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function destroyAirUnitsWithInvalidBase(): CombatUnit[] {
  const rows = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
    'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE unit_type = ?',
    ['air']
  );
  const removed: CombatUnit[] = [];
  for (const row of rows) {
    const infra = getRes1InfrastructureForHex(row.h3_index);
    const controller = getHexController(row.h3_index);
    if (infra.airportCount > 0 && controller === row.player) continue;
    dbRun('DELETE FROM units WHERE id = ?', [row.id]);
    removed.push({
      id: row.id,
      player: row.player,
      unitType: row.unit_type,
      h3Index: row.h3_index,
      displayOrder: row.display_order ?? undefined,
    });
  }
  return removed;
}

/**
 * Defines the `getHexBuildQueue` function shape (export function getHexBuildQueue(h3Index: string, requestingPlayerId = HUMAN_PLAYER_ID): HexBuildQueueView).

 * Purpose: Supports maintainability by documenting why `getHexBuildQueue` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHexBuildQueue(h3Index: string, requestingPlayerId = HUMAN_PLAYER_ID): HexBuildQueueView {
  return getHexBuildQueueImpl(h3Index, requestingPlayerId);
}

/**
 * Defines the `addHexBuildQueueEntry` function shape (export function addHexBuildQueueEntry(h3Index: string, requestingPlayerId = HUMAN_PLAYER_ID): { success: boolean; reason?: string; queue?: HexBuildQueu).

 * Purpose: Supports maintainability by documenting why `addHexBuildQueueEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addHexBuildQueueEntry(h3Index: string, requestingPlayerId = HUMAN_PLAYER_ID): {
  success: boolean;
  reason?: string;
  queue?: HexBuildQueueView;
} {
  return addHexBuildQueueEntryImpl(h3Index, requestingPlayerId);
}

/**
 * Defines the `updateHexBuildQueueEntry` function shape (export function updateHexBuildQueueEntry( h3Index: string, entryId: number, unitType: BuildUnitType, count: number, requestingPlayerId = HUMAN_PL).

 * Purpose: Supports maintainability by documenting why `updateHexBuildQueueEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateHexBuildQueueEntry(
  h3Index: string,
  entryId: number,
  unitType: BuildUnitType,
  count: number,
  requestingPlayerId = HUMAN_PLAYER_ID
): { success: boolean; reason?: string; queue?: HexBuildQueueView } {
  return updateHexBuildQueueEntryImpl(h3Index, entryId, unitType, count, requestingPlayerId);
}

/**
 * Defines the `removeHexBuildQueueEntry` function shape (export function removeHexBuildQueueEntry( h3Index: string, entryId: number, requestingPlayerId = HUMAN_PLAYER_ID ): { success: boolean; reason?: strin).

 * Purpose: Supports maintainability by documenting why `removeHexBuildQueueEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function removeHexBuildQueueEntry(
  h3Index: string,
  entryId: number,
  requestingPlayerId = HUMAN_PLAYER_ID
): { success: boolean; reason?: string; queue?: HexBuildQueueView } {
  return removeHexBuildQueueEntryImpl(h3Index, entryId, requestingPlayerId);
}

/**
 * Defines the `previewHumanMarchOrder` function shape (export function previewHumanMarchOrder(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult).

 * Purpose: Supports maintainability by documenting why `previewHumanMarchOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function previewHumanMarchOrder(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult {
  return previewHumanMarchOrderImpl(unitId, hoveredH3Index);
}

/**
 * Defines the `previewHumanMarchOrders` function shape (export function previewHumanMarchOrders(unitIds: string[], hoveredH3Index: string): HumanOrderGroupPreviewResult).

 * Purpose: Supports maintainability by documenting why `previewHumanMarchOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function previewHumanMarchOrders(unitIds: string[], hoveredH3Index: string): HumanOrderGroupPreviewResult {
  return previewHumanMarchOrdersImpl(unitIds, hoveredH3Index);
}

/**
 * Defines the `getSealiftStackState` function shape (export function getSealiftStackState(h3Index: string): SealiftStackState).

 * Purpose: Supports maintainability by documenting why `getSealiftStackState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getSealiftStackState(h3Index: string): SealiftStackState {
  logTrace('gameActions getSealiftStackState');
  return getSealiftStackStateImpl(h3Index);
}

/**
 * Defines the `updateSealiftSlot` function shape (export function updateSealiftSlot( h3Index: string, navalUnitId: string, slotIndex: 1 | 2, landUnitId: string | null ): { success: boolean; reason?).

 * Purpose: Supports maintainability by documenting why `updateSealiftSlot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateSealiftSlot(
  h3Index: string,
  navalUnitId: string,
  slotIndex: 1 | 2,
  landUnitId: string | null
): { success: boolean; reason?: string; state?: SealiftStackState } {
  logDebug('gameActions updateSealiftSlot', { h3Index, navalUnitId, slotIndex, landUnitId });
  try {
    const result = updateSealiftSlotImpl({ h3Index, navalUnitId, slotIndex, landUnitId });
    if (result.success && landUnitId) {
      cancelHumanMovementOrdersForUnit(landUnitId);
      logDebug('gameActions updateSealiftSlot: cancelled land-unit movement orders after embark', {
        landUnitId,
      });
    }
    return result;
  } catch (err) {
    logError('updateSealiftSlot: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Defines the `submitOrders` function shape (export function submitOrders(payload: SubmitOrdersPayload): SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `submitOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function submitOrders(payload: SubmitOrdersPayload): SubmitOrdersResult {
  return submitOrdersImpl(payload, {
    validateOrder,
    validateRangedAttack,
    humanPlayerId: HUMAN_PLAYER_ID,
    validPhase: VALID_PHASE,
  });
}

/**
 * Defines the `ready` function shape (export function ready( aiOrders: MovementOrder[] = [], aiRangedOrders: RangedAttackOrder[] = [], aiAirStrikeOrders: AirStrikeOrder[] = [], aiFerryOr).

 * Purpose: Supports maintainability by documenting why `ready` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function ready(
  aiOrders: MovementOrder[] = [],
  aiRangedOrders: RangedAttackOrder[] = [],
  aiAirStrikeOrders: AirStrikeOrder[] = [],
  aiFerryOrders: FerryOrder[] = [],
  aiEmbarkOrders: EmbarkOrder[] = []
): ReadyResult {
  logDebug('ready', {
    aiOrderCount: aiOrders.length,
    aiRangedCount: aiRangedOrders.length,
    aiAirStrikeCount: aiAirStrikeOrders.length,
    aiFerryCount: aiFerryOrders.length,
    aiEmbarkCount: aiEmbarkOrders.length,
  });
  try {
    if (!isDbReady()) {
      logError('ready: database not initialized');
      return { success: false, reason: 'Database not initialized' };
    }

    const turnRow = dbGetOne<{ phase: string; turn_number: number }>(
      'SELECT phase, turn_number FROM turn_state WHERE id = 1'
    );
    if (turnRow?.phase !== VALID_PHASE) {
      logError('ready: not in planning phase', turnRow?.phase);
      return { success: false, reason: 'Not in planning phase' };
    }

    dbRun('UPDATE turn_state SET phase = ? WHERE id = 1', ['resolution']);

    const hexList = getOrderedHexList();
    const unitsBeforeMove = listUnitsForSnapshot();
    const combatUnitsBefore: CombatUnit[] = unitsBeforeMove.map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
      displayOrder: u.displayOrder,
    }));

    const humanRanged = dbGetAll<{ unit_id: string; target_h3_index: string }>(
      'SELECT unit_id, target_h3_index FROM pending_ranged_orders ORDER BY unit_id, target_h3_index'
    ).map((r) => ({ unitId: r.unit_id, targetH3Index: r.target_h3_index }));
    const humanAirStrikes = dbGetAll<{ unit_id: string; target_h3_index: string; target_type: AirStrikeTargetType }>(
      'SELECT unit_id, target_h3_index, target_type FROM pending_air_orders ORDER BY unit_id, target_h3_index'
    ).map((r) => ({ unitId: r.unit_id, targetH3Index: r.target_h3_index, targetType: r.target_type }));
    const humanFerryOrders = dbGetAll<{ unit_id: string; destination_h3_index: string }>(
      'SELECT unit_id, destination_h3_index FROM pending_ferry_orders ORDER BY unit_id, destination_h3_index'
    ).map((r) => ({ unitId: r.unit_id, destinationH3Index: r.destination_h3_index }));
    const allAirStrikes = [...humanAirStrikes, ...aiAirStrikeOrders];
    const allFerryOrders = [...humanFerryOrders, ...aiFerryOrders];
    applyEmbarkOrdersForPlayer(aiEmbarkOrders, 'opponent');
    const allRanged = [...humanRanged, ...aiRangedOrders];

    const turnNumber = turnRow?.turn_number ?? 1;
    const gameSeed = getGameSeed();
    // Per-turn seed so the same two units get different dice outcomes each turn; replay stays deterministic for same orders.
    const seed = (gameSeed + turnNumber * 7919) >>> 0;
    const next = createCombatRng(seed);
    logDebug('ready: combat resolution', { turnNumber, gameSeed, combatSeed: seed });
    const applyTransportOutcomeForPhase = (removedUnitIds: string[], removedUnits: CombatUnit[]): CombatUnit[] => {
      const transportLosses = applyTransportLossForRemovedNavalUnits(removedUnits);
      deleteTransportAssignmentsForRemovedUnits(removedUnitIds);
      if (transportLosses.length > 0) {
        deleteTransportAssignmentsForRemovedUnits(transportLosses.map((unit) => unit.id));
      }
      return transportLosses;
    };

    const airStrikeResult = resolveAirStrikePhase(allAirStrikes, next);
    const airStrikeTransportLosses = applyTransportOutcomeForPhase(airStrikeResult.removedUnitIds, airStrikeResult.removedUnits);
    const rangedInputUnits = listUnitsForSnapshot()
      .filter((u) => {
        if (u.unitType !== 'infantry' && u.unitType !== 'armor') return true;
        return !isEmbarkedLandUnitOnWater(u.id);
      })
      .map((u) => ({
        id: u.id,
        player: u.player,
        unitType: u.unitType,
        h3Index: u.h3Index,
        displayOrder: u.displayOrder,
      }));
    const rangedResult = runRangedPhase(rangedInputUnits, hexList, allRanged, next);
    for (const id of rangedResult.removedUnitIds) {
      dbRun('DELETE FROM units WHERE id = ?', [id]);
    }
    const rangedTransportLosses = applyTransportOutcomeForPhase(rangedResult.removedUnitIds, rangedResult.removedUnits);

    const humanOrders = dbGetAll<{ unit_id: string; to_h3_index: string }>('SELECT unit_id, to_h3_index FROM pending_orders');
    const preMoveState = dbBackedStateSnapshot();
    const preMoveHexList = preMoveState.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(preMoveHexList);
    const preMoveStateForHuman = getGameStateForPlayer(HUMAN_PLAYER_ID, { maskUnexploredTerrain: false });
    const generatedHuman = generateOrdersForStandingOrders(HUMAN_PLAYER_ID, preMoveStateForHuman, latLngByH3, resolveToH3);
    const mergedHuman = new Map<string, string>();
    for (const o of generatedHuman.movementOrders) mergedHuman.set(o.unitId, o.toH3Index);
    for (const o of humanOrders) mergedHuman.set(o.unit_id, o.to_h3_index);
    const humanMoves = Array.from(mergedHuman.entries())
      .map(([unitId, toH3Index]) => {
        const fromH3Index = unitsBeforeMove.find((u) => u.id === unitId)?.h3Index;
        if (!fromH3Index || fromH3Index === toH3Index) return null;
        return { unitId, fromH3Index, toH3Index };
      })
      .filter((m): m is { unitId: string; fromH3Index: string; toH3Index: string } => m !== null);
    const allOrders = [
      ...Array.from(mergedHuman.entries()).map(([unitId, toH3Index]) => ({ unitId, toH3Index })),
      ...aiOrders,
    ];
    autoDisembarkIndependentLandMoves(allOrders);
    const orderDestinationByUnitId = new Map(allOrders.map((order) => [order.unitId, order.toH3Index]));
    const movingNavalUnitIds = allOrders
      .filter((order) => unitsBeforeMove.find((unit) => unit.id === order.unitId)?.unitType === 'naval')
      .map((order) => order.unitId);
    const embarkedFollowMoves: Array<{ unitId: string; fromH3Index: string; toH3Index: string }> = [];
    if (movingNavalUnitIds.length > 0) {
      const placeholders = movingNavalUnitIds.map(() => '?').join(', ');
      const embarkedRows = dbGetAll<{ landUnitId: string; landH3Index: string; navalUnitId: string }>(
        `SELECT uta.land_unit_id AS landUnitId,
                lu.h3_index AS landH3Index,
                uta.naval_unit_id AS navalUnitId
         FROM unit_transport_assignments uta
         JOIN units lu ON lu.id = uta.land_unit_id
         WHERE uta.naval_unit_id IN (${placeholders})`,
        movingNavalUnitIds
      );
      for (const row of embarkedRows) {
        const destination = orderDestinationByUnitId.get(row.navalUnitId);
        if (!destination || destination === row.landH3Index) continue;
        embarkedFollowMoves.push({
          unitId: row.landUnitId,
          fromH3Index: row.landH3Index,
          toH3Index: destination,
        });
      }
    }
    const traversedHexesByPlayer = collectTraversedHexesByPlayer(
      allOrders,
      preMoveState.units.map((u) => ({ id: u.id, player: u.player, h3Index: u.h3Index, unitType: u.unitType }))
    );
    for (const order of allOrders) {
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [order.toH3Index, order.unitId]);
    }
    syncEmbarkedLandUnitPositionsWithNaval();

    const resolvedFerryMoves: FerryAnimationMove[] = [];
    for (const ferry of allFerryOrders) {
      const unit = dbGetOne<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
        'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE id = ?',
        [ferry.unitId]
      );
      if (!unit || unit.unit_type !== 'air') continue;
      const originH3Index = unit.h3_index;
      const withinFerryRange = isWithinGridRangeSafe(originH3Index, ferry.destinationH3Index, AIR_FERRY_RANGE_HEXES, 'ready ferry');
      if (!withinFerryRange) continue;
      const destinationInfra = getRes1InfrastructureForHex(ferry.destinationH3Index);
      const destinationController = getHexController(ferry.destinationH3Index);
      if (destinationInfra.airportCount > 0 && destinationController === unit.player) {
        dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [ferry.destinationH3Index, ferry.unitId]);
        resolvedFerryMoves.push({
          unitId: ferry.unitId,
          player: unit.player,
          fromH3Index: originH3Index,
          toH3Index: ferry.destinationH3Index,
        });
        continue;
      }
      const originInfra = getRes1InfrastructureForHex(originH3Index);
      const originController = getHexController(originH3Index);
      if (!(originInfra.airportCount > 0 && originController === unit.player)) {
        dbRun('DELETE FROM units WHERE id = ?', [ferry.unitId]);
      }
    }

    const unitsAfterMove = listUnitsForSnapshot();
    const rangedRemovedSet = new Set(rangedResult.removedUnitIds);
    // Melee must not see units removed in ranged phase; exclude them explicitly so attackers cannot engage dead defenders.
    const combatUnitsAfter: CombatUnit[] = unitsAfterMove
      .filter((u) => !rangedRemovedSet.has(u.id))
      .filter((u) => {
        if (u.unitType !== 'infantry' && u.unitType !== 'armor') return true;
        return !isEmbarkedLandUnitOnWater(u.id);
      })
      .map((u) => ({
        id: u.id,
        player: u.player,
        unitType: u.unitType,
        h3Index: u.h3Index,
        displayOrder: u.displayOrder,
      }));

    const meleeResult = runMeleePhase(combatUnitsAfter, hexList, next);
    for (const id of meleeResult.removedUnitIds) {
      dbRun('DELETE FROM units WHERE id = ?', [id]);
    }
    const meleeTransportLosses = applyTransportOutcomeForPhase(meleeResult.removedUnitIds, meleeResult.removedUnits);

    const controlTransitions = resolveRes1ControlAfterCombatAndMovement(traversedHexesByPlayer);
    const baseLossRemovedAir = destroyAirUnitsWithInvalidBase();
    const airStrikeDestroyedFeatures = { urban: 0, airport: 0, seaport: 0 };
    let airStrikeDestroyedBasedAirUnits = 0;
    for (const event of airStrikeResult.infrastructureDestroyedEvents) {
      airStrikeDestroyedFeatures[event.targetType] += 1;
      airStrikeDestroyedBasedAirUnits += event.destroyedAirUnitsCount ?? 0;
    }
    const airStrikeDestroyedUnitsByType = { infantry: 0, armor: 0, naval: 0, air: 0 };
    const airStrikeLostAirUnitIds: string[] = [];
    for (const removed of airStrikeResult.removedUnits) {
      if (removed.unitType === 'infantry') airStrikeDestroyedUnitsByType.infantry += 1;
      else if (removed.unitType === 'armor') airStrikeDestroyedUnitsByType.armor += 1;
      else if (removed.unitType === 'naval') airStrikeDestroyedUnitsByType.naval += 1;
      else if (removed.unitType === 'air') {
        airStrikeDestroyedUnitsByType.air += 1;
        airStrikeLostAirUnitIds.push(removed.id);
      }
    }
    if (airStrikeResult.attemptCount > 0 || baseLossRemovedAir.length > 0) {
      logDebug('ready: airStrikeSummary', {
        attemptCount: airStrikeResult.attemptCount,
        successfulCount: airStrikeResult.successfulCount,
        failedCount: airStrikeResult.failedCount,
        attackerLossCount: airStrikeResult.attackerLossCount,
        destroyedFeatures: airStrikeDestroyedFeatures,
        destroyedBasedAirUnits: airStrikeDestroyedBasedAirUnits,
        destroyedUnitsByType: airStrikeDestroyedUnitsByType,
        airLossUnitIds: [...new Set(airStrikeLostAirUnitIds)],
        strandedAirLossCount: baseLossRemovedAir.length,
        strandedAirLossUnitIds: baseLossRemovedAir.map((unit) => unit.id),
      });
    }
    const productionSummary = processProductionAfterControlResolution();
    const deployedUnitsByType = productionSummary.deployedByPlayer.human;
    const finalUnits = listUnitsForSnapshot();
    const humanHexesLost = controlTransitions.filter(
      (t) => t.fromControllerPlayerId === 'human' && t.toControllerPlayerId === 'opponent'
    );
    const controlLossLightningHexes = humanHexesLost
      .filter((t) => !finalUnits.some((u) => u.player === 'human' && u.h3Index === t.h3Index))
      .map((t) => t.h3Index);

    const humanCount = dbGetAll<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE player = ?', ['human'])[0]?.c ?? 0;
    const opponentCount = dbGetAll<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE player = ?', ['opponent'])[0]?.c ?? 0;
    const regionWinner = evaluateRegionControlWinnerAtEndOfTurn();
    if (regionWinner) setGameOver(regionWinner);
    else if (humanCount === 0 && opponentCount > 0) setGameOver('opponent');
    else if (opponentCount === 0 && humanCount > 0) setGameOver('human');

    dbRun('DELETE FROM pending_orders');
    dbRun('DELETE FROM pending_ranged_orders');
    dbRun('DELETE FROM pending_air_orders');
    dbRun('DELETE FROM pending_ferry_orders');
    dbRun('UPDATE turn_state SET phase = ?, turn_number = ? WHERE id = 1', [
      'planning',
      turnNumber + 1,
    ]);
    refreshFogOfWarIntelFromCurrentState({
      traversedHexesByPlayer: {
        human: [...traversedHexesByPlayer.human],
        opponent: [...traversedHexesByPlayer.opponent],
      },
    });

    saveDatabase();
    const allRemovedIds = [
      ...airStrikeResult.removedUnitIds,
      ...airStrikeTransportLosses.map((unit) => unit.id),
      ...rangedResult.removedUnitIds,
      ...rangedTransportLosses.map((unit) => unit.id),
      ...meleeResult.removedUnitIds,
      ...meleeTransportLosses.map((unit) => unit.id),
      ...baseLossRemovedAir.map((u) => u.id),
    ];
    const allRemovedUnits = [
      ...airStrikeResult.removedUnits,
      ...airStrikeTransportLosses,
      ...rangedResult.removedUnits,
      ...rangedTransportLosses,
      ...meleeResult.removedUnits,
      ...meleeTransportLosses,
      ...baseLossRemovedAir,
    ];
    const allKills = [...rangedResult.kills, ...meleeResult.kills];
    const allCombatHexes = [...rangedResult.combatHexes, ...meleeResult.combatHexes];
    const allCasualtyHexes = [
      ...airStrikeResult.casualtyHexes,
      ...rangedResult.casualtyHexes,
      ...meleeResult.casualtyHexes,
      ...baseLossRemovedAir.map((u) => u.h3Index),
    ];

    const opponentRangedAttackers = aiRangedOrders.map((o) => o.unitId);
    const defenderHexes = new Set(allRanged.map((o) => o.targetH3Index));
    const opponentRangedDefenders = combatUnitsBefore
      .filter((u) => u.player === 'opponent' && defenderHexes.has(u.h3Index))
      .map((u) => u.id);
    const meleeHexSet = new Set(meleeResult.combatHexes);
    const opponentMeleeParticipants = combatUnitsAfter
      .filter((u) => u.player === 'opponent' && meleeHexSet.has(u.h3Index))
      .map((u) => u.id);
    const opponentCombatParticipantUnitIds = [
      ...new Set([...opponentRangedAttackers, ...opponentRangedDefenders, ...opponentMeleeParticipants]),
    ];
    const removedOpponentUnitIds = allRemovedUnits.filter((u) => u.player === 'opponent').map((u) => u.id);
    addAiLossEventsSinceConsultation(
      'opponent',
      turnNumber,
      allRemovedUnits.map((u) => ({ id: u.id, player: u.player })),
      allKills,
      rangedResult.killsByDirectFire,
      rangedResult.killsByReturnFire
    );

    return {
      success: true,
      combatHexes: allCombatHexes.length > 0 ? allCombatHexes : undefined,
      removedUnitIds: allRemovedIds.length > 0 ? allRemovedIds : undefined,
      casualtyHexes: allCasualtyHexes.length > 0 ? allCasualtyHexes : undefined,
      removedUnits: allRemovedUnits.length > 0 ? allRemovedUnits : undefined,
      kills: allKills.length > 0 ? allKills : undefined,
      killsByDirectFire: rangedResult.killsByDirectFire?.length ? rangedResult.killsByDirectFire : undefined,
      killsByReturnFire: rangedResult.killsByReturnFire?.length ? rangedResult.killsByReturnFire : undefined,
      rangedCombatHexes: rangedResult.combatHexes.length > 0 ? rangedResult.combatHexes : undefined,
      rangedCasualtyHexes: rangedResult.casualtyHexes.length > 0 ? rangedResult.casualtyHexes : undefined,
      rangedRemovedUnits: rangedResult.removedUnits.length > 0 ? rangedResult.removedUnits : undefined,
      airStrikeHexes: airStrikeResult.strikeHexes.length > 0 ? airStrikeResult.strikeHexes : undefined,
      airStrikeCasualtyHexes: airStrikeResult.casualtyHexes.length > 0 ? airStrikeResult.casualtyHexes : undefined,
      airStrikeRemovedUnits: airStrikeResult.removedUnits.length > 0 ? airStrikeResult.removedUnits : undefined,
      airStrikeMoves: airStrikeResult.strikeMoves.length > 0 ? airStrikeResult.strikeMoves : undefined,
      airStrikeAttemptCount: airStrikeResult.attemptCount > 0 ? airStrikeResult.attemptCount : undefined,
      airStrikeSuccessfulCount: airStrikeResult.successfulCount > 0 ? airStrikeResult.successfulCount : undefined,
      airStrikeFailedCount: airStrikeResult.failedCount > 0 ? airStrikeResult.failedCount : undefined,
      airStrikeAttackerLossCount: airStrikeResult.attackerLossCount > 0 ? airStrikeResult.attackerLossCount : undefined,
      baseInvalidAirLossCount: baseLossRemovedAir.length > 0 ? baseLossRemovedAir.length : undefined,
      infrastructureDestroyedEvents:
        airStrikeResult.infrastructureDestroyedEvents.length > 0 ? airStrikeResult.infrastructureDestroyedEvents : undefined,
      resolvedFerryMoves: resolvedFerryMoves.length > 0 ? resolvedFerryMoves : undefined,
      meleeCombatHexes: meleeResult.combatHexes.length > 0 ? meleeResult.combatHexes : undefined,
      meleeCasualtyHexes: meleeResult.casualtyHexes.length > 0 ? meleeResult.casualtyHexes : undefined,
      meleeRemovedUnits: meleeResult.removedUnits.length > 0 ? meleeResult.removedUnits : undefined,
      humanMoves: humanMoves.length + embarkedFollowMoves.length > 0 ? [...humanMoves, ...embarkedFollowMoves] : undefined,
      deployedUnitsByType: Object.keys(deployedUnitsByType).length > 0 ? deployedUnitsByType : undefined,
      humanHexesLostCount: humanHexesLost.length > 0 ? humanHexesLost.length : undefined,
      controlLossLightningHexes: controlLossLightningHexes.length > 0 ? controlLossLightningHexes : undefined,
      humanDeploymentCapReachedUnitTypes:
        productionSummary.capReachedByPlayer.human.length > 0 ? productionSummary.capReachedByPlayer.human : undefined,
      opponentDeploymentCapReachedUnitTypes:
        productionSummary.capReachedByPlayer.opponent.length > 0 ? productionSummary.capReachedByPlayer.opponent : undefined,
      opponentCombatParticipantUnitIds,
      removedOpponentUnitIds,
    };
  } catch (err) {
    logError('ready: exception', err);
    return { success: false, reason: String(err) };
  }
}
