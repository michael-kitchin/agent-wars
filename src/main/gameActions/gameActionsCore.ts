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
import { readTurnPhase } from '../gameDb/turnStateReads';
import { buildLatLngCoordinateMap } from '../mapData';
import { logDebug, logError, logTrace } from '../logger';
import type {
  MovementOrder,
  RangedAttackOrder,
  SubmitOrdersPayload,
} from '../../shared/ipcTypes';
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
import type { BuildQueueItemType } from '../productionRules';
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
import { isEmbarkedLandUnit } from './sealift';
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

export { getSealiftStackState, getTacticalSealiftStackState, updateSealiftSlot, updateTacticalSealiftSlot } from './sealiftSlotActions';
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
export { validateGroupAirDropTarget } from './airDropValidation';
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
    if (readTurnPhase(dbGetOne) !== VALID_PHASE) return { success: false, reason: 'Not in planning phase' };
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
      hasLand: selectedUnits.some((unit) => isLandUnitType(unit.unitType)),
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
 * Defines the `getHexBuildQueue` function shape (export function getHexBuildQueue(h3Index: string, requestingPlayerId: string = HUMAN_PLAYER_ID, maxedUnitTypes?: ReadonlySet<string>): HexBuildQueueView).

 * Purpose: IPC handlers and production tools share one entry point for a hex's queue view.
 * When to use: After a queue edit, and from `query_production` when it already has the seat's cap set.
 * Expected outcome: The queue view from `readHexBuildQueue`, including a forwarded cap set.
 * Exceptions: Propagates a database error from the queue read.
 */
export function getHexBuildQueue(
  h3Index: string,
  requestingPlayerId: string = HUMAN_PLAYER_ID,
  maxedUnitTypes?: ReadonlySet<string>
): HexBuildQueueView {
  return readHexBuildQueue(h3Index, requestingPlayerId, maxedUnitTypes);
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
  unitType: BuildQueueItemType,
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
