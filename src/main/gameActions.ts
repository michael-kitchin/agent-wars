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
  getMapHexSet,
  getRes1InfrastructureForHex,
  getGameStateForPlayer,
} from './gameDb';
import { buildLatLngCoordinateMap } from './mapData';
import { getRange } from './combatConstants';
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
  ResolveMeleeInterceptIpcPayload,
  SealiftStackState,
  GameStateSnapshot,
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
  queryHumanStandingOrders,
} from './tools/tool5StandingOrders';
import type { BuildUnitType } from './productionRules';
import { MOVEMENT_RANGE_BY_UNIT_TYPE, formatTargetOutOfRangeReason } from '../shared/tacticalRanges';
import { validateAirStrikeOrder, validateFerryOrder } from './game-actions/airValidation';
import { isWithinGridRangeSafe } from './game-actions/gridRange';
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
import { submitOrdersImpl } from './game-actions/submitOrders';
import {
  getSealiftStackStateImpl,
  isEmbarkedLandUnitOnWater,
  updateSealiftSlotImpl,
} from './game-actions/sealift';
import { isTacticalBattleActive } from './tacticalBattle/tacticalBattleSession';
import { executeResolveMeleeIntercept } from './game-actions/meleeInterceptStrategicResolve';
import { executeReadyStrategicTurn } from './game-actions/readyStrategicResolutionPipeline';
import {
  failIfDatabaseNotReady,
  failIfMeleeInterceptDecisionPending,
  failIfTacticalBattleActive,
} from './game-actions/readyStrategicGuards';

export { evaluateRegionControlWinnerAtEndOfTurn } from './game-actions/regionControlWinner';

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
 * Defines the `humanPerspectiveStateSnapshot` function shape (function humanPerspectiveStateSnapshot(): GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `humanPerspectiveStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function humanPerspectiveStateSnapshot(): GameStateSnapshot {
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
    if (isTacticalBattleActive()) return { success: false, reason: 'Movement orders are unavailable during a tactical battle.' };
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
    if (isTacticalBattleActive()) return { success: false, reason: 'Movement orders are unavailable during a tactical battle.' };
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
    if (isTacticalBattleActive()) return { success: false, reason: 'Standing orders cannot be cancelled during a tactical battle.' };
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
    const failDb = failIfDatabaseNotReady('ready');
    if (failDb) return failDb;
    const failTac = failIfTacticalBattleActive('ready');
    if (failTac) return failTac;
    const failMelee = failIfMeleeInterceptDecisionPending();
    if (failMelee) return failMelee;

    const turnRow = dbGetOne<{ phase: string; turn_number: number }>(
      'SELECT phase, turn_number FROM turn_state WHERE id = 1'
    );
    if (turnRow?.phase !== VALID_PHASE) {
      logError('ready: not in planning phase', turnRow?.phase);
      return { success: false, reason: 'Not in planning phase' };
    }

    return executeReadyStrategicTurn(
      aiOrders,
      aiRangedOrders,
      aiAirStrikeOrders,
      aiFerryOrders,
      aiEmbarkOrders,
      {
        humanPlayerId: HUMAN_PLAYER_ID,
        validPhase: VALID_PHASE,
        turnNumber: turnRow?.turn_number ?? 1,
      }
    );
  } catch (err) {
    logError('ready: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Resumes strategic turn resolution after the human submits Fight or Ignore for a paused pre-melee intercept.
 *
 * Purpose: Applies selective melee skips and reuses `finalizeReadyTurnAfterMelee` so dice and DB effects match stock ready.
 * When to use: Renderer IPC only after `ready` returned `awaitingMeleeDecision`.
 * Expected outcome: Full `ReadyResult` for a completed turn; Fight adds `tacticalAutoStartRes1H3Index`.
 * Exceptions: Invalid token, phase drift, or bad payload return `success: false` with a reason string.
 */
export function resolveMeleeIntercept(payload: ResolveMeleeInterceptIpcPayload): ReadyResult {
  try {
    return executeResolveMeleeIntercept(payload);
  } catch (err) {
    logError('resolveMeleeIntercept: exception', err);
    return { success: false, reason: String(err) };
  }
}
