/**
 * WEGO turn actions: validate movement orders, submit orders, and resolve the turn.
 * All logic runs in the main process and uses the game database.
 */

import {
  dbGetOne,
  dbRun,
  isDbReady,
  getStrategicInfrastructureForHex,
} from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { logDebug, logError, logTrace } from '../logger';
import type {
  MovementOrder,
  RangedAttackOrder,
  SubmitOrdersPayload,
  SealiftStackState,
} from '../../shared/ipcTypes';
import { emptySealiftStackState } from '../../shared/sealiftStackState';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { executePlanRoute } from '../tools/pathfinding';
import {
  assignHumanMarchStandingOrder,
  cancelHumanStandingOrder,
  queryHumanStandingOrders,
} from '../tools/standingOrders';
import type {
  ApplyBuildQueueTemplateResult,
  BuildQueueTemplateEntry,
  SetHexesKeepBuildingResult,
} from '../../shared/ipcTypes';
import type { BuildUnitType } from '../productionRules';
import { buildStrategicUnitDisplayLabelResolver } from '../../shared/unitDisplayNames';
import {
  executeAddHexBuildQueueEntry,
  executeApplyBuildQueueTemplateToHexes,
  readHexBuildQueue,
  executeRemoveHexBuildQueueEntry,
  executeSetHexesKeepBuilding,
  executeUpdateHexBuildQueueEntry,
  type HexBuildQueueView,
} from './buildQueue';
import {
  resolveHumanMarchOrderPreview,
  resolveHumanMarchOrderPreviews,
  type HumanOrderGroupPreviewResult,
  type HumanOrderPreviewResult,
} from './humanMarchPreview';
import { hexSupportsMixedLandAndNaval, selectionHasMixedLandAndNaval } from './humanMarchPreviewMixedSelection';
import {
  EMBARKED_LAND_UNIT_MOVEMENT_BLOCK_REASON,
  isLandUnitType,
} from './landMovementConstraints';
import { executeSubmitOrders } from './submitOrders';
import {
  readSealiftStackState,
  isEmbarkedLandUnit,
  executeSealiftSlotUpdate,
} from './sealift';
import { getTacticalSealiftStackStateForHex } from '../tacticalBattle/tacticalSealiftStackState';
import { applyTacticalSealiftSlotChangeInSession } from '../tacticalBattle/tacticalSealiftSlotUpdate';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { ready as readyImpl, resolveMeleeIntercept as resolveMeleeInterceptImpl } from './gameActionsReadyEntrypoints';
import { validateHumanMarchOrdersWhenTacticalActive } from './tacticalMarchOrderGuards';
import type { HumanStandingOrderView, SubmitOrdersResult } from './gameActionsTypes';
import {
  HUMAN_PLAYER_ID,
  effectiveHexPassabilityTerrain,
  getUniqueNonEmptyIds,
  humanPerspectiveStateSnapshot,
  validateOrder,
  validateRangedAttack,
} from './strategicOrderValidation';

export type { MovementOrder, RangedAttackOrder, SubmitOrdersPayload };
export type { HexBuildQueueEntryView, HexBuildQueueView } from './buildQueue';
export type {
  HumanOrderPreviewSegment,
  HumanOrderPreviewResult,
  HumanOrderGroupPreviewUnitResult,
  HumanOrderGroupPreviewResult,
} from './humanMarchPreview';
export type { HumanStandingOrderView, SubmitOrdersResult } from './gameActionsTypes';
export {
  validateGroupAirStrikeTarget,
  validateGroupFerryTarget,
  validateGroupRangedTarget,
  validateRangedAttack,
} from './strategicOrderValidation';
export {
  commitHumanTacticalDraftOrders,
  sanitizeOpponentTacticalDraftForReadyCommit,
} from './humanTacticalDraftCommit';


/**
 * Documents the module-scope binding `VALID_PHASE` (VALID_PHASE).

 * Purpose: Supports maintainability by documenting why `VALID_PHASE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const VALID_PHASE = 'planning';
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
        cachedOriginH3?: string;
        cachedRouteSegments?: { turn: number; hexes: [number, number][] }[];
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
        const unit = state.units.find((u) => u.id === unitId);
        const currentUnitH3 = unit?.h3Index ?? null;
        const destinationH3Index =
          Array.isArray(o.destination) && o.destination.length >= 2
            ? resolveToH3(Number(o.destination[0]), Number(o.destination[1])) ?? null
            : null;
        let routeSegments: { turn: number; hexes: [number, number][] }[] | undefined;
        const cacheHit =
          typeof o.cachedOriginH3 === 'string' &&
          currentUnitH3 === o.cachedOriginH3 &&
          Array.isArray(o.cachedRouteSegments) &&
          o.cachedRouteSegments.length > 0;
        if (cacheHit) {
          routeSegments = o.cachedRouteSegments;
          logTrace('gameActions listHumanStandingOrders: reused cached route segments', {
            unitId,
            cachedOriginH3: o.cachedOriginH3,
          });
        } else if (Array.isArray(o.destination) && o.destination.length >= 2) {
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
 * Clears human march standing orders and pending orders for one strategic parent `units.id`.
 *
 * Purpose: Shared implementation for strategic sealift embark and tactical immediate sealift embark so movement drafts do not survive boarding.
 * When to use: `updateSealiftSlot` after a successful embark, and `updateTacticalSealiftSlot` after a successful tactical embark with a non-null land sub-unit id.
 * Expected outcome: No `standing_orders` march row and no `pending_orders` rows remain for that unit id for the human player.
 * Exceptions: None; SQLite failures surface via `dbRun` behavior.
 */
function cancelHumanStrategicMarchOrdersForParentUnit(unitId: string): void {
  logDebug('gameActions cancelHumanStrategicMarchOrdersForParentUnit', { unitId });
  dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ? AND order_type = ?', [
    HUMAN_PLAYER_ID,
    unitId,
    'march',
  ]);
  dbRun('DELETE FROM pending_orders WHERE unit_id = ?', [unitId]);
}

/**
 * Defines the `cancelHumanMovementOrdersForUnit` function shape (function cancelHumanMovementOrdersForUnit(unitId: string): void).

 * Purpose: Supports maintainability by documenting why `cancelHumanMovementOrdersForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function cancelHumanMovementOrdersForUnit(unitId: string): void {
  cancelHumanStrategicMarchOrdersForParentUnit(unitId);
}

/**

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
    if (isTacticalBattleActive()) return validateHumanMarchOrdersWhenTacticalActive([unitId], destinationH3Index);
    const state = humanPerspectiveStateSnapshot();
    const turnRow = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1');
    if (turnRow?.phase !== VALID_PHASE) return { success: false, reason: 'Not in planning phase' };
    const unitRow = state.units.find((unit) => unit.id === unitId && unit.player === HUMAN_PLAYER_ID);
    if (!unitRow) return { success: false, reason: 'Unit not found or not human-controlled' };
    if (unitRow.unitType === 'air') return { success: false, reason: AIR_UNITS_CANNOT_MARCH_REASON };
    if (isLandUnitType(unitRow.unitType) && isEmbarkedLandUnit(unitId) && destinationH3Index !== unitRow.h3Index) {
      return { success: false, reason: EMBARKED_LAND_UNIT_MOVEMENT_BLOCK_REASON };
    }
    const destinationHex = state.hexes.find((hex) => hex.h3Index === destinationH3Index);
    if (!destinationHex) return { success: false, reason: 'Destination not on map' };
    const destinationTerrain = effectiveHexPassabilityTerrain(destinationHex);
    const destinationSeaportCount = getStrategicInfrastructureForHex(destinationH3Index).seaportCount;
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
    if (isTacticalBattleActive()) return validateHumanMarchOrdersWhenTacticalActive(uniqueUnitIds, destinationH3Index);
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
    const destinationSeaportCount = getStrategicInfrastructureForHex(destinationH3Index).seaportCount;
    const sharedMixedTerrain = hexSupportsMixedLandAndNaval({
      ...destinationHex,
      hasSeaport: destinationSeaportCount > 0,
    });
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
        return {
          success: false,
          reason:
            result.reason ??
            `Failed to assign movement order for ${buildStrategicUnitDisplayLabelResolver(state.units)(unitId)}`,
        };
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
 * Defines the `getHexBuildQueue` function shape (export function getHexBuildQueue(h3Index: string, requestingPlayerId: string = HUMAN_PLAYER_ID): HexBuildQueueView).

 * Purpose: Supports maintainability by documenting why `getHexBuildQueue` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHexBuildQueue(h3Index: string, requestingPlayerId: string = HUMAN_PLAYER_ID): HexBuildQueueView {
  return readHexBuildQueue(h3Index, requestingPlayerId);
}

/**
 * Defines the `addHexBuildQueueEntry` function shape (export function addHexBuildQueueEntry(h3Index: string, requestingPlayerId: string = HUMAN_PLAYER_ID): { success: boolean; reason?: string; queue?: HexBuildQueu).

 * Purpose: Supports maintainability by documenting why `addHexBuildQueueEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addHexBuildQueueEntry(h3Index: string, requestingPlayerId: string = HUMAN_PLAYER_ID): {
  success: boolean;
  reason?: string;
  queue?: HexBuildQueueView;
} {
  return executeAddHexBuildQueueEntry(h3Index, requestingPlayerId);
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
  requestingPlayerId: string = HUMAN_PLAYER_ID
): { success: boolean; reason?: string; queue?: HexBuildQueueView } {
  return executeUpdateHexBuildQueueEntry(h3Index, entryId, unitType, count, requestingPlayerId);
}

/**
 * Defines the `removeHexBuildQueueEntry` function shape (export function removeHexBuildQueueEntry( h3Index: string, entryId: number, requestingPlayerId: string = HUMAN_PLAYER_ID ): { success: boolean; reason?: strin).

 * Purpose: Supports maintainability by documenting why `removeHexBuildQueueEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function removeHexBuildQueueEntry(
  h3Index: string,
  entryId: number,
  requestingPlayerId: string = HUMAN_PLAYER_ID
): { success: boolean; reason?: string; queue?: HexBuildQueueView } {
  return executeRemoveHexBuildQueueEntry(h3Index, entryId, requestingPlayerId);
}

/**
 * Applies a shared ordered build queue template to multiple controlled production hexes.
 *
 * Purpose: Exposes the best-effort multi-hex production write through the public gameActions facade.
 * When to use: Renderer synchronization after build-hex selection joins or shared template edits.
 * Expected outcome: Successful, skipped, and failed hex/type details from the authoritative backend.
 * Exceptions: Implementation exceptions are captured and reported by the delegated action.
 */
export function applyBuildQueueTemplateToHexes(
  h3Indexes: string[],
  entries: BuildQueueTemplateEntry[],
  requestingPlayerId: string = HUMAN_PLAYER_ID
): ApplyBuildQueueTemplateResult {
  return executeApplyBuildQueueTemplateToHexes(h3Indexes, entries, requestingPlayerId);
}

/**
 * Arms or clears Keep building across selected production hexes.
 *
 * Purpose: Public facade for the Keep building checkbox IPC path.
 * When to use: Single- or multi-hex build popup toggles.
 * Expected outcome: Best-effort applied/failed details from the authoritative implementation.
 * Exceptions: Implementation exceptions are captured and reported by the delegated action.
 */
export function setHexesKeepBuilding(
  h3Indexes: string[],
  keepBuilding: boolean,
  requestingPlayerId: string = HUMAN_PLAYER_ID
): SetHexesKeepBuildingResult {
  return executeSetHexesKeepBuilding(h3Indexes, keepBuilding, requestingPlayerId);
}

/**
 * Defines the `previewHumanMarchOrder` function shape (export function previewHumanMarchOrder(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult).

 * Purpose: Supports maintainability by documenting why `previewHumanMarchOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function previewHumanMarchOrder(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult {
  return resolveHumanMarchOrderPreview(unitId, hoveredH3Index);
}

/**
 * Defines the `previewHumanMarchOrders` function shape (export function previewHumanMarchOrders(unitIds: string[], hoveredH3Index: string): HumanOrderGroupPreviewResult).

 * Purpose: Supports maintainability by documenting why `previewHumanMarchOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function previewHumanMarchOrders(unitIds: string[], hoveredH3Index: string): HumanOrderGroupPreviewResult {
  return resolveHumanMarchOrderPreviews(unitIds, hoveredH3Index);
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
  return readSealiftStackState(h3Index);
}

/**
 * Returns sealift stack UI state for a tactical hex using sub-unit ids from the active tactical snapshot.
 *
 * Purpose: Supports stack-callout sealift controls during tactical battles when strategic `getSealiftStackState` does not describe tactical sub-units.
 * When to use: Renderer invokes `game:getTacticalSealiftStackState` while `isTacticalBattleActive()` is true.
 * Expected outcome: Same `SealiftStackState` shape as strategic sealift with tactical sub-unit ids, or an empty section when inactive or outside the footprint.
 * Exceptions: None; delegates to `getTacticalSealiftStackStateForHex` without throwing.
 */
export function getTacticalSealiftStackState(h3Index: string): SealiftStackState {
  logTrace('gameActions getTacticalSealiftStackState', { h3Index });
  if (!isTacticalBattleActive()) {
    return emptySealiftStackState(h3Index);
  }
  return getTacticalSealiftStackStateForHex(h3Index);
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
    if (isTacticalBattleActive()) {
      return { success: false, reason: 'Sealift cannot be changed during a tactical battle.' };
    }
    const result = executeSealiftSlotUpdate({ h3Index, navalUnitId, slotIndex, landUnitId });
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
 * Applies one tactical sealift slot change immediately (snapshot + optional parent-level SQLite), mirroring strategic `updateSealiftSlot` with sub-unit ids.
 *
 * Purpose: Lets the human debark, embark, or reassign sealift during an active tactical battle without waiting for Ready.
 * When to use: Renderer stack callout when `tacticalBattleSnapshot` covers the stack hex and `updateSealiftSlot` is blocked.
 * Expected outcome: `success: true` with refreshed `tacticalBattle` and `state` for the stack hex, or `success: false` with a human-readable `reason`.
 * Exceptions: Unexpected errors are caught, logged at error, and returned as `success: false`.
 */
export function updateTacticalSealiftSlot(
  h3Index: string,
  navalUnitId: string,
  slotIndex: 1 | 2,
  landUnitId: string | null
): {
  success: boolean;
  reason?: string;
  state?: SealiftStackState;
  tacticalBattle?: TacticalBattleSnapshot;
} {
  logDebug('gameActions updateTacticalSealiftSlot', { h3Index, navalUnitId, slotIndex, landUnitId });
  try {
    if (!isTacticalBattleActive()) {
      return { success: false, reason: 'No tactical battle is active.' };
    }
    const landKey = landUnitId?.trim() ?? '';
    const result = applyTacticalSealiftSlotChangeInSession({
      h3Index,
      navalUnitId,
      slotIndex,
      landUnitId: landKey.length > 0 ? landKey : null,
    });
    if (!result.success) return result;
    if (landKey.length > 0) {
      const sub = result.tacticalBattle.subUnits.find((u) => u.id === landKey);
      if (sub?.parentUnitId) {
        cancelHumanStrategicMarchOrdersForParentUnit(sub.parentUnitId);
        logDebug('gameActions updateTacticalSealiftSlot: cancelled land parent march orders after embark', {
          landSubUnitId: landKey,
          parentUnitId: sub.parentUnitId,
        });
      }
    }
    return {
      success: true,
      state: result.state,
      tacticalBattle: result.tacticalBattle,
    };
  } catch (err) {
    logError('updateTacticalSealiftSlot: exception', err);
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
  const displayLabelForUnit = buildStrategicUnitDisplayLabelResolver(humanPerspectiveStateSnapshot().units);
  return executeSubmitOrders(payload, {
    validateOrder: (unitId, toH3Index) => validateOrder(unitId, toH3Index, displayLabelForUnit),
    validateRangedAttack: (unitId, targetH3Index, options) =>
      validateRangedAttack(unitId, targetH3Index, { ...options, displayLabelForUnit }),
    displayLabelForUnit,
    humanPlayerId: HUMAN_PLAYER_ID,
    validPhase: VALID_PHASE,
  });
}

/**
 * Documents the module-scope binding `ready` (ready).

 * Purpose: Supports maintainability by documenting why `ready` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const ready = readyImpl;
/**
 * Documents the module-scope binding `resolveMeleeIntercept` (resolveMeleeIntercept).

 * Purpose: Supports maintainability by documenting why `resolveMeleeIntercept` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const resolveMeleeIntercept = resolveMeleeInterceptImpl;
