/**
 * WEGO turn actions: validate movement orders, submit orders, and resolve the turn.
 * All logic runs in the main process and uses the game database.
 */

import {
  computeGridDistanceWithPathFallbackPure,
  computeGridPathCellsPure,
} from '../../shared/h3GridRangePure';
import {
  dbGetOne,
  dbRun,
  dbGetAll,
  isDbReady,
  getMapHexSet,
  getRes1InfrastructureForHex,
  getGameStateForPlayer,
  reconcileRes1InfrastructureCountsFromRes4Overrides,
} from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { getRange } from '../combatConstants';
import { logDebug, logError, logTrace } from '../logger';
import type {
  MovementOrder,
  RangedAttackOrder,
  SubmitOrdersPayload,
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  AirStrikeTargetType,
  TacticalCommitResolutionPlayback,
  TacticalOpponentPlanPayload,
  SealiftStackState,
  GameStateSnapshot,
} from '../../shared/ipcTypes';
import { emptySealiftStackState } from '../../shared/sealiftStackState';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { clipTacticalMarchPathToDestination } from '../../shared/tacticalMarchPlaybackPath.js';
import { filterTacticalMarchContinuationsToPresentSubUnits } from '../../shared/tacticalMarchContinuations';
import { committedOpponentTacticalDraftFieldAfterConsume } from '../../shared/ipc/tacticalOpponentPlanMerge';
import { executePlanRoute } from '../tools/pathfinding';
import { normalizeMovementTerrain, isLandSeaportSpawnHex } from '../movementTerrain';
import { getValidDestinations } from '../oneStepMoveDestinations';
import {
  NAVAL_DESTINATION_MUST_BE_WATER_COASTAL,
  NAVAL_SEAPORT_EGRESS_REQUIRED,
  NAVAL_START_MUST_BE_WATER_COASTAL,
} from '../navalMovementMessages';
import {
  assignHumanMarchStandingOrder,
  cancelHumanStandingOrder,
  holdFireUnitIdsForPlayer,
  queryHumanStandingOrders,
} from '../tools/standingOrders';
import {
  resolveTacticalRangedTargetForSubUnit,
  withTacticalTempoAttacks,
} from '../tacticalBattle/tacticalRangedTargetResolve';
import { validateHumanTacticalMarchOrders } from '../tacticalBattle/tacticalBattleSession';
import type {
  ApplyBuildQueueTemplateResult,
  BuildQueueTemplateEntry,
  SetHexesKeepBuildingResult,
} from '../../shared/ipcTypes';
import type { BuildUnitType } from '../productionRules';
import { MOVEMENT_RANGE_BY_UNIT_TYPE, formatTargetOutOfRangeReason } from '../../shared/tacticalRanges';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from '../../shared/tacticalTerrainCombatModifiers';
import { tacticalMovementUnitTypeForPathfinding } from '../../shared/tacticalTerrainMovement';
import {
  buildStrategicUnitDisplayLabelResolver,
  fallbackDisplayNameFromUnitId,
  tacticalSubUnitLabelForUserMessage,
} from '../../shared/unitDisplayNames';
import { validateTacticalGroupRangedTarget } from './tacticalGroupRangedTargetValidation';
import { validateAirStrikeOrder, validateFerryOrder } from './airValidation';
import { validateTacticalHumanAirStrikeGroup } from './tacticalHumanAirStrikeValidation';
import { isWithinGridRangeSafe } from './gridRange';
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
  getLandMovementBlockReason,
  isLandUnitType,
} from './landMovementConstraints';
import {
  getLandMassRouteBlockReason,
  landUnitCanOccupyHex,
  LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON,
} from '../../shared/landTraversalRes1';
import { getRes1LandMassByH3 } from '../terrainClassificationCache';
import { executeSubmitOrders } from './submitOrders';
import {
  ORDER_PLAN_SANITIZE_CONTEXT,
  logOrderPlanSanitizeDrop,
  logOrderPlanSanitizeSummary,
} from './orderPlanSanitize';
import {
  applyTacticalEmbarkCommittedOrdersToStrategicDb,
  readSealiftStackState,
  isEmbarkedLandUnit,
  isEmbarkedLandUnitOnWater,
  executeSealiftSlotUpdate,
} from './sealift';
import { getTacticalSealiftStackStateForHex } from '../tacticalBattle/tacticalSealiftStackState';
import { applyTacticalSealiftSlotChangeInSession } from '../tacticalBattle/tacticalSealiftSlotUpdate';
import {
  applyHumanTacticalDraftBeatInStrategicOrder,
  getActiveTacticalBattleSnapshot,
  isTacticalBattleActive,
} from '../tacticalBattle/tacticalBattleSession';
import { tacticalMarchFirstStopAlongPath } from '../tacticalBattle/tacticalRulesAdapter';
import { validateTacticalOpponentEmbarkOrder } from '../tacticalBattle/tacticalOpponentOrderValidation';
import { projectTacticalSnapshotAfterOpponentMovementOrders } from '../tacticalBattle/tacticalMovementApply';
import { tacticalComputeMovementOrderOutcome } from '../tacticalBattle/tacticalSnapshotGuards';
import { ready as readyImpl, resolveMeleeIntercept as resolveMeleeInterceptImpl } from './gameActionsReadyEntrypoints';
import { captureTurnLossNoteFromResolution } from './captureTurnLossNote';
import { validateHumanMarchOrdersWhenTacticalActive } from './tacticalMarchOrderGuards';

export { evaluateRegionControlWinnerAtEndOfTurn } from './regionControlWinner';

export type { MovementOrder, RangedAttackOrder, SubmitOrdersPayload };
export type { HexBuildQueueEntryView, HexBuildQueueView } from './buildQueue';
export type {
  HumanOrderPreviewSegment,
  HumanOrderPreviewResult,
  HumanOrderGroupPreviewUnitResult,
  HumanOrderGroupPreviewResult,
} from './humanMarchPreview';
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
  /**
   * Specifies the contract for the `tacticalBattle` member (tacticalBattle?: TacticalBattleSnapshot;).

   * Contract: Present only after a successful tactical human march mutation so the renderer can refresh res4 state without an extra round-trip.
   * When to use: Consumers of `commitHumanTacticalDraftOrders` after tactical Ready; not used for draft validation IPC.
   * Expected outcome: Deep snapshot suitable for JSON IPC when set.
   * Exceptions: None.
   */
  tacticalBattle?: TacticalBattleSnapshot;
  /**
   * Specifies the contract for the `tacticalResolutionPlayback` member (tacticalResolutionPlayback?: TacticalCommitResolutionPlayback;).

   * Contract: Present after successful tactical Ready commit when the renderer should play movement/combat overlays before the next interaction frame.
   * When to use: `commitHumanTacticalDraftOrders` success only; ignored for other `SubmitOrdersResult` producers.
   * Expected outcome: Structured deltas compatible with `S.resolutionMoveAnimation` population in the renderer.
   * Exceptions: None.
   */
  tacticalResolutionPlayback?: TacticalCommitResolutionPlayback;
  /**
   * Specifies the contract for the `tacticalMarchContinuations` member (tacticalMarchContinuations?: { subUnitId: string; destinationH3Index: string }[];).

   * Contract: Present when human march drafts were truncated to per-turn range; renderer re-queues these as pending marches for later tactical turns. Rows are limited to sub-units still on the post-beat roster (combat removals in the same beat are omitted).
   * When to use: Successful `commitHumanTacticalDraftOrders` only, alongside `tacticalBattle` refresh.
   * Expected outcome: Each row is a living human sub-unit id plus the original ordered destination still to reach.
   * Exceptions: None; omit when every march completed in one apply step or every continuing marcher was removed.
   */
  tacticalMarchContinuations?: { subUnitId: string; destinationH3Index: string }[];
  /**
   * Buffered opponent tactical rows produced after an event-driven post-beat consultation.
   *
   * Contract: When present, matches the tactical-only plan shape returned by `afterTacticalBeatResolution` for renderer-side draft hydration.
   * When to use: `commitHumanTacticalDraftOrders` success path after main attached post-beat consultation results.
   * Expected outcome: Renderer can populate `tacticalOpponentDraft` without a second model round-trip.
   * Exceptions: Omitted when no post-beat consultation ran; explicit `null` after consultation when the model returned no tactical plan (renderer clears buffer).
   */
  tacticalOpponentPlan?: TacticalOpponentPlanPayload | null;
  /**
   * Per-tool call counts from the tactical consultation pass that produced `tacticalOpponentPlan`, if any.
   *
   * Contract: Keys are tool names; values are non-negative integers counting invocations in that pass only.
   * When to use: Telemetry and debugging for tactical AI tool usage alongside `tacticalOpponentPlan`.
   * Expected outcome: Undefined when no tactical consultation ran or counts were not collected.
   * Exceptions: None.
   */
  toolInvocationCounts?: Record<string, number>;
  /**
   * Free-text opponent strategy from the post–tactical-beat LLM pass (IPC merge only).
   *
   * Contract: Populated by `game:commitHumanTacticalDraftOrders` in the main process after `runEventDrivenAfterTacticalBeatConsultation` when event-driven Run mode is on; never set by `commitHumanTacticalDraftOrders` inside `gameActions`.
   * When to use: Renderer shows the AI strategy toast after a tactical Ready beat, mirroring strategic `ReadyResult.aiStrategy`.
   * Expected outcome: Omitted when consultation is skipped or the model returns no strategy field.
   * Exceptions: None.
   */
  aiStrategy?: string;
  /**
   * Player-facing taunt/threat from the post–tactical-beat LLM pass (IPC merge only).
   *
   * Contract: Populated by `game:commitHumanTacticalDraftOrders` in the main process after consultation, mirroring `aiStrategy`.
   * When to use: Renderer Message toast section after a tactical Ready beat.
   * Expected outcome: Omitted when consultation is skipped or the model returns no message field.
   * Exceptions: None.
   */
  aiMessage?: string;
  /**
   * Sentinel that the incoming opponent tactical draft was consumed on this Ready.
   *
   * Contract: Present only when the renderer sent `opponentTacticalDraft`; always `null` after consume so the renderer does not resend the same marches next beat.
   * When to use: Renderer clears `S.tacticalOpponentDraft` when no fresh `tacticalOpponentPlan` merge runs (post-beat consult may refill afterward).
   * Expected outcome: Omitted when there was no incoming opponent draft; never echoes applied/sanitized rows back into the buffer.
   * Exceptions: None.
   */
  committedOpponentTacticalDraft?: TacticalOpponentPlanPayload | null;
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
  toH3Index: string,
  displayLabelForUnit: (id: string) => string
): { valid: true } | { valid: false; reason: string } {
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };

  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${displayLabelForUnit(unitId)}` };
  if (unit.player !== 'human') return { valid: false, reason: 'Only human units can receive orders' };

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
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unit_type] ?? 1;
  if (dist > range) return { valid: false, reason: `${unit.unit_type} can move at most ${range} hex(es)` };
  /* dist === 0 (same hex) is allowed: "hold" / no move is valid. */

  if (unit.unit_type === 'naval') {
    const navalDests = getValidDestinations(
      { id: unitId, h3Index: unit.h3_index, unitType: 'naval' },
      humanPerspectiveStateSnapshot()
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
 * Defines the `validateRangedAttack` function shape (export function validateRangedAttack().

 * Purpose: Supports maintainability by documenting why `validateRangedAttack` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function validateRangedAttack(
  unitId: string,
  targetH3Index: string,
  options?: { allowedPlayer?: string; displayLabelForUnit?: (id: string) => string }
): { valid: true } | { valid: false; reason: string } {
  logDebug('gameActions validateRangedAttack', { unitId, targetH3Index, allowedPlayer: options?.allowedPlayer });
  const allowedPlayer = options?.allowedPlayer ?? 'human';
  const labelFor = options?.displayLabelForUnit ?? fallbackDisplayNameFromUnitId;
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };

  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${labelFor(unitId)}` };
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
          logDebug('gameActions listHumanStandingOrders: reused cached route segments', {
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
export function cancelHumanStrategicMarchOrdersForParentUnit(unitId: string): void {
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
 * Drops opponent tactical draft rows that no longer pass footprint / strike / embark rules so Ready can complete with the remaining valid rows.
 *
 * Purpose: Buffered AI plans can go stale (e.g. ranged target hex cleared of enemies) before the human clicks Ready; failing the whole beat was too strict. No-op marches (destination equals current hex) are dropped as a belt-and-suspenders guard; the primary anti-stagger fix is clearing `committedOpponentTacticalDraft` after Ready consume so applied rows are not recycled.
 * When to use: `commitHumanTacticalDraftOrders` after resolving `preBattle` and before `applyHumanTacticalDraftBeatInStrategicOrder`.
 * Expected outcome: Returns a subset plan or `undefined` when nothing remains; each dropped row is logged at debug with reason; a single info summary when any row was dropped.
 * Exceptions: None; never throws.
 */
export function sanitizeOpponentTacticalDraftForReadyCommit(
  preBattle: TacticalBattleSnapshot,
  draft: TacticalOpponentPlanPayload | undefined
): TacticalOpponentPlanPayload | undefined {
  logDebug('gameActions sanitizeOpponentTacticalDraftForReadyCommit', {
    movementCount: draft?.movementOrders.length ?? 0,
    rangedCount: draft?.rangedAttacks.length ?? 0,
    airCount: draft?.airStrikes.length ?? 0,
    ferryCount: draft?.ferryOrders.length ?? 0,
    embarkCount: draft?.embarkOrders.length ?? 0,
  });
  if (!draft) return undefined;
  const res4Set = new Set(preBattle.res4ChildH3Indexes);
  const sub = [...preBattle.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  let dropped = 0;
  const sanitizeCtx = ORDER_PLAN_SANITIZE_CONTEXT.opponentTacticalDraft;

  const movementOrders: TacticalOpponentPlanPayload['movementOrders'] = [];
  for (const o of draft.movementOrders) {
    const outcome = tacticalComputeMovementOrderOutcome({
      byId,
      sub,
      order: o,
      res4Set,
      battle: preBattle,
    });
    if (!outcome.ok) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'march', {
        unitId: o.unitId,
        toH3Index: o.toH3Index,
        reason: outcome.reason,
      });
      continue;
    }
    if (outcome.appliedToH3Index === sub[outcome.idx]!.h3Index) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'march', {
        unitId: o.unitId,
        toH3Index: o.toH3Index,
        reason: 'already_at_destination',
      });
      continue;
    }
    movementOrders.push(o);
  }

  const rangedAttacks: TacticalOpponentPlanPayload['rangedAttacks'] = [];
  for (const r of draft.rangedAttacks) {
    let targetH3Index = r.targetH3Index;
    let checked = validateGroupRangedTarget([r.unitId], targetH3Index, { tacticalAttackerPlayer: 'opponent' });
    if (!checked.success) {
      const retarget = resolveTacticalRangedTargetForSubUnit(preBattle, r.unitId, r.targetH3Index);
      if (retarget) {
        targetH3Index = retarget;
        checked = validateGroupRangedTarget([r.unitId], targetH3Index, { tacticalAttackerPlayer: 'opponent' });
        if (checked.success) {
          logDebug('gameActions sanitizeOpponentTacticalDraftForReadyCommit: retargeted ranged', {
            unitId: r.unitId,
            fromTargetH3Index: r.targetH3Index,
            toTargetH3Index: targetH3Index,
          });
        }
      }
    }
    if (!checked.success) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'ranged', {
        unitId: r.unitId,
        targetH3Index: r.targetH3Index,
        reason: checked.reason,
      });
      continue;
    }
    rangedAttacks.push({ unitId: r.unitId, targetH3Index });
  }

  const airStrikes: TacticalOpponentPlanPayload['airStrikes'] = [];
  for (const a of draft.airStrikes) {
    const checked = validateGroupAirStrikeTarget([a.unitId], a.targetH3Index, a.targetType, {
      tacticalAttackerPlayer: 'opponent',
    });
    if (!checked.success) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'airStrike', {
        unitId: a.unitId,
        targetH3Index: a.targetH3Index,
        targetType: a.targetType,
        reason: checked.reason,
      });
      continue;
    }
    airStrikes.push(a);
  }

  const strikeUnitIds = new Set(airStrikes.map((a) => a.unitId));
  const ferryOrders: TacticalOpponentPlanPayload['ferryOrders'] = [];
  for (const f of draft.ferryOrders) {
    if (strikeUnitIds.has(f.unitId)) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'ferry', {
        unitId: f.unitId,
        reason: 'strike_same_unit',
      });
      continue;
    }
    const checked = validateGroupFerryTarget([f.unitId], f.destinationH3Index, { tacticalAttackerPlayer: 'opponent' });
    if (!checked.success) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'ferry', {
        unitId: f.unitId,
        destinationH3Index: f.destinationH3Index,
        reason: checked.reason,
      });
      continue;
    }
    ferryOrders.push(f);
  }

  const projected =
    movementOrders.length > 0
      ? projectTacticalSnapshotAfterOpponentMovementOrders(preBattle, movementOrders)
      : preBattle;
  const embarkOrders: TacticalOpponentPlanPayload['embarkOrders'] = [];
  for (const e of draft.embarkOrders) {
    const er = validateTacticalOpponentEmbarkOrder(e, projected.subUnits);
    if (!er.valid) {
      dropped += 1;
      logOrderPlanSanitizeDrop(sanitizeCtx, 'embark', {
        unitId: e.unitId,
        reason: er.reason,
      });
      continue;
    }
    embarkOrders.push(e);
  }

  const kept =
    movementOrders.length +
    rangedAttacks.length +
    airStrikes.length +
    ferryOrders.length +
    embarkOrders.length;
  if (dropped > 0) {
    logOrderPlanSanitizeSummary(sanitizeCtx, dropped, {
      keptTotal: kept,
      movements: movementOrders.length,
      ranged: rangedAttacks.length,
      airStrikes: airStrikes.length,
      ferry: ferryOrders.length,
      embark: embarkOrders.length,
    });
  }
  if (kept === 0) return undefined;
  return {
    movementOrders,
    rangedAttacks,
    airStrikes,
    ferryOrders,
    embarkOrders,
  };
}

/**
 * Commits queued human tactical draft orders from the renderer into the active tactical snapshot.
 *
 * Purpose: Tactical parity with strategic Ready by applying all tactical draft types in one commit boundary.
 * When to use: `game:commitHumanTacticalDraftOrders` IPC with renderer draft lists at tactical Ready time.
 * Expected outcome: `success: true` with `tacticalBattle` snapshot for immediate redraw, or failure with reason. Human marches apply at most one range-limited leg per commit; any remaining distance returns as `tacticalMarchContinuations` for living sub-units only (combat removals in the same beat are omitted). Successful commits with `embarkOrders` also persist parent-level sealift rows in SQLite (same boundary as strategic Ready embark).
 * Exceptions: Caught and logged at error; returns `success: false` with stringified message.
 */
export function commitHumanTacticalDraftOrders(args: {
  movementOrders: readonly { unitId: string; toH3Index: string }[];
  rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
  airStrikes?: readonly AirStrikeOrder[];
  ferryOrders?: readonly FerryOrder[];
  embarkOrders?: readonly EmbarkOrder[];
  opponentTacticalDraft?: TacticalOpponentPlanPayload;
}): SubmitOrdersResult {
  logDebug('gameActions commitHumanTacticalDraftOrders', {
    movementCount: args.movementOrders.length,
    rangedCount: args.rangedAttacks?.length ?? 0,
    airCount: args.airStrikes?.length ?? 0,
    ferryCount: args.ferryOrders?.length ?? 0,
    embarkCount: args.embarkOrders?.length ?? 0,
    opponentMovementCount: args.opponentTacticalDraft?.movementOrders.length ?? 0,
    opponentRangedCount: args.opponentTacticalDraft?.rangedAttacks.length ?? 0,
  });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    if (!isTacticalBattleActive()) return { success: false, reason: 'No tactical battle is active.' };
    for (const r of args.rangedAttacks ?? []) {
      const checked = validateGroupRangedTarget([r.unitId], r.targetH3Index);
      if (!checked.success) return checked;
    }
    for (const a of args.airStrikes ?? []) {
      const checked = validateGroupAirStrikeTarget([a.unitId], a.targetH3Index, a.targetType);
      if (!checked.success) return checked;
    }
    for (const f of args.ferryOrders ?? []) {
      const checked = validateGroupFerryTarget([f.unitId], f.destinationH3Index);
      if (!checked.success) return checked;
    }
    const preBattle = getActiveTacticalBattleSnapshot();
    if (!preBattle) {
      return { success: false, reason: 'No tactical battle is active.' };
    }
    const opponentTacticalDraft = sanitizeOpponentTacticalDraftForReadyCommit(
      preBattle,
      withTacticalTempoAttacks(preBattle, args.opponentTacticalDraft, holdFireUnitIdsForPlayer('opponent'))
    );
    // The human's own slice stays explicit: strategic standing orders neither move nor fire their pawns in tactical.
    const effectiveHumanMarches = [...args.movementOrders];
    logDebug('gameActions commitHumanTacticalDraftOrders explicit marches only', {
      explicitMarchCount: effectiveHumanMarches.length,
    });
    const mergedMarchCheck = validateHumanTacticalMarchOrders(effectiveHumanMarches);
    if (!mergedMarchCheck.success) {
      logDebug('gameActions commitHumanTacticalDraftOrders rejected marches', { reason: mergedMarchCheck.reason });
      return mergedMarchCheck;
    }
    const explicitRanged = [...(args.rangedAttacks ?? [])];
    const explicitAir = [...(args.airStrikes ?? [])];
    logDebug('gameActions commitHumanTacticalDraftOrders explicit fire orders', {
      explicitRangedCount: explicitRanged.length,
      explicitAirCount: explicitAir.length,
    });
    const res4Set = new Set(preBattle.res4ChildH3Indexes);
    const terrainBattle = {
      battleId: preBattle.battleId,
      tacticalTurnNumber: preBattle.tacticalTurnNumber,
      subUnits: preBattle.subUnits,
      res4TerrainKindByH3: preBattle.res4TerrainKindByH3,
      strategicHexTerrain: preBattle.strategicHexTerrain,
      strategicHexTerrainKind: preBattle.strategicHexTerrainKind,
      ...(preBattle.res4IsSeaportByH3 ? { res4IsSeaportByH3: preBattle.res4IsSeaportByH3 } : {}),
      ...(preBattle.res4IsUrbanByH3 ? { res4IsUrbanByH3: preBattle.res4IsUrbanByH3 } : {}),
      ...(preBattle.res4IsRubbleByH3 ? { res4IsRubbleByH3: preBattle.res4IsRubbleByH3 } : {}),
      ...(preBattle.res4RoadSidesByH3 ? { res4RoadSidesByH3: preBattle.res4RoadSidesByH3 } : {}),
      ...(preBattle.res4RailSidesByH3 ? { res4RailSidesByH3: preBattle.res4RailSidesByH3 } : {}),
    };
    const appliedMovementOrders: { unitId: string; toH3Index: string }[] = [];
    const tacticalMarchContinuations: { subUnitId: string; destinationH3Index: string }[] = [];
    const humanMarchPlanByUnitId = new Map<
      string,
      { stopH3: string; consumedFullPath: boolean; pathH3Prefix?: string[] }
    >();
    for (const o of effectiveHumanMarches) {
      const sub = preBattle.subUnits.find((u) => u.id === o.unitId);
      if (!sub || sub.player !== 'human') continue;
      const from = sub.h3Index;
      if (from === o.toH3Index) continue;
      const moveType = tacticalMovementUnitTypeForPathfinding(sub, o.toH3Index);
      const maxEdges = effectiveTacticalMovementPointBudgetForMarchLeg(terrainBattle, sub, preBattle.subUnits, moveType);
      if (maxEdges <= 0) {
        appliedMovementOrders.push({ unitId: o.unitId, toH3Index: o.toH3Index });
        continue;
      }
      const marchPlan = tacticalMarchFirstStopAlongPath(
        from,
        o.toH3Index,
        maxEdges,
        res4Set,
        terrainBattle,
        moveType
      );
      humanMarchPlanByUnitId.set(o.unitId, marchPlan);
      const { stopH3, consumedFullPath } = marchPlan;
      if (stopH3 !== from) {
        appliedMovementOrders.push({ unitId: o.unitId, toH3Index: stopH3 });
      }
      if (!consumedFullPath && o.toH3Index !== stopH3) {
        tacticalMarchContinuations.push({ subUnitId: o.unitId, destinationH3Index: o.toH3Index });
      }
    }
    const beat = applyHumanTacticalDraftBeatInStrategicOrder({
      movementOrders: appliedMovementOrders,
      rangedAttacks: explicitRanged,
      airStrikes: explicitAir,
      ferryOrders: args.ferryOrders,
      embarkOrders: args.embarkOrders,
      opponentTacticalDraft,
    });
    if (!beat.success) {
      logDebug('gameActions commitHumanTacticalDraftOrders rejected beat', { reason: beat.reason });
      return { success: false, reason: beat.reason };
    }
    const support = beat;
    const postMovementBattle = beat.battleAfterMovementBeforeFerry;
    if ((support.infrastructureDestroyedEvents?.length ?? 0) > 0) {
      const { changedHexCount } = reconcileRes1InfrastructureCountsFromRes4Overrides();
      logDebug('gameActions commitHumanTacticalDraftOrders reconciled res1 infrastructure after tactical strikes', {
        changedHexCount,
        eventCount: support.infrastructureDestroyedEvents.length,
      });
    }
    const meleePack = beat.meleePack;
    const finalBattle = beat.battle;
    const humanMoves: TacticalCommitResolutionPlayback['humanMoves'] = [];
    for (const o of effectiveHumanMarches) {
      const sub = preBattle.subUnits.find((u) => u.id === o.unitId);
      if (!sub || sub.player !== 'human') continue;
      const from = sub.h3Index;
      if (from === o.toH3Index) continue;
      const moveType = tacticalMovementUnitTypeForPathfinding(sub, o.toH3Index);
      const maxEdges = effectiveTacticalMovementPointBudgetForMarchLeg(terrainBattle, sub, preBattle.subUnits, moveType);
      if (maxEdges <= 0) {
        humanMoves.push({ unitId: o.unitId, fromH3Index: from, toH3Index: o.toH3Index });
        continue;
      }
      const marchPlan = humanMarchPlanByUnitId.get(o.unitId);
      if (!marchPlan) continue;
      const { stopH3, pathH3Prefix } = marchPlan;
      if (stopH3 === from) continue;
      const pathForPlayback = clipTacticalMarchPathToDestination(stopH3, pathH3Prefix);
      humanMoves.push({
        unitId: o.unitId,
        fromH3Index: from,
        toH3Index: stopH3,
        ...(pathForPlayback ? { pathH3Indexes: pathForPlayback } : {}),
      });
    }
    for (const f of args.ferryOrders ?? []) {
      const u = postMovementBattle.subUnits.find((x) => x.id === f.unitId);
      if (!u || u.unitType !== 'air' || u.player !== 'human') continue;
      if (u.h3Index === f.destinationH3Index) continue;
      humanMoves.push({ unitId: f.unitId, fromH3Index: u.h3Index, toH3Index: f.destinationH3Index });
    }
    const od = opponentTacticalDraft;
    const opponentMoves: NonNullable<TacticalCommitResolutionPlayback['opponentMoves']> = [];
    if (od) {
      for (const o of od.movementOrders) {
        const su = preBattle.subUnits.find((u) => u.id === o.unitId);
        if (!su || su.player !== 'opponent') continue;
        const from = su.h3Index;
        if (from === o.toH3Index) continue;
        const after = postMovementBattle.subUnits.find((u) => u.id === o.unitId);
        const to = after?.h3Index ?? o.toH3Index;
        if (from === to) continue;
        const oppMoveType = tacticalMovementUnitTypeForPathfinding(su, o.toH3Index);
        const oppMaxEdges = effectiveTacticalMovementPointBudgetForMarchLeg(
          terrainBattle,
          su,
          preBattle.subUnits,
          oppMoveType
        );
        let pathH3Indexes: string[] | undefined;
        if (oppMaxEdges > 0) {
          const oppMarch = tacticalMarchFirstStopAlongPath(
            from,
            o.toH3Index,
            oppMaxEdges,
            res4Set,
            terrainBattle,
            oppMoveType
          );
          pathH3Indexes = clipTacticalMarchPathToDestination(to, oppMarch.pathH3Prefix);
        }
        opponentMoves.push({
          unitId: o.unitId,
          fromH3Index: from,
          toH3Index: to,
          ...(pathH3Indexes ? { pathH3Indexes } : {}),
        });
      }
      for (const f of od.ferryOrders) {
        const u = postMovementBattle.subUnits.find((x) => x.id === f.unitId);
        if (!u || u.unitType !== 'air' || u.player !== 'opponent') continue;
        if (u.h3Index === f.destinationH3Index) continue;
        opponentMoves.push({ unitId: f.unitId, fromH3Index: u.h3Index, toH3Index: f.destinationH3Index });
      }
    }
    const rangedRemovedUnits = support.removedUnits;
    const rangedCombatHexSet = new Set<string>();
    for (const r of explicitRanged) {
      rangedCombatHexSet.add(r.targetH3Index);
    }
    for (const r of od?.rangedAttacks ?? []) {
      rangedCombatHexSet.add(r.targetH3Index);
    }
    const rangedCombatHexes = [...rangedCombatHexSet];
    const casualtyHexSet = new Set(rangedRemovedUnits.map((v) => v.h3Index));
    const rangedCasualtyHexes = rangedCombatHexes.filter((h) => casualtyHexSet.has(h));
    const humanBeatHadSubmittedRangedOrAirOrders =
      explicitRanged.length > 0 || explicitAir.length > 0;
    const opponentBeatHadSubmittedRangedOrAirOrders =
      !!od && ((od.rangedAttacks?.length ?? 0) > 0 || (od.airStrikes?.length ?? 0) > 0);
    const tacticalResolutionPlayback: TacticalCommitResolutionPlayback = {
      humanMoves,
      ...(humanBeatHadSubmittedRangedOrAirOrders ? { humanBeatHadSubmittedRangedOrAirOrders: true } : {}),
      ...(opponentBeatHadSubmittedRangedOrAirOrders ? { opponentBeatHadSubmittedRangedOrAirOrders: true } : {}),
      opponentMoves: opponentMoves.length > 0 ? opponentMoves : undefined,
      rangedCombatHexes: rangedCombatHexes.length > 0 ? rangedCombatHexes : undefined,
      rangedCasualtyHexes: rangedCasualtyHexes.length > 0 ? rangedCasualtyHexes : undefined,
      rangedRemovedUnits: rangedRemovedUnits.length > 0 ? rangedRemovedUnits : undefined,
      rangedResolutionShotLines:
        support.rangedResolutionShotLines.length > 0 ? support.rangedResolutionShotLines : undefined,
      killsByDirectFire: support.killsByDirectFire.length > 0 ? support.killsByDirectFire : undefined,
      killsByReturnFire: support.killsByReturnFire.length > 0 ? support.killsByReturnFire : undefined,
      killsByAirStrike: support.killsByAirStrike.length > 0 ? support.killsByAirStrike : undefined,
      infrastructureDestroyedEvents:
        support.infrastructureDestroyedEvents.length > 0 ? support.infrastructureDestroyedEvents : undefined,
      airStrikeAttemptCount: support.airStrikeAttemptCount > 0 ? support.airStrikeAttemptCount : undefined,
      ...(support.airStrikePlaybackMoves.length > 0 ? { airStrikeMoves: support.airStrikePlaybackMoves } : {}),
      ...(support.airStrikePlaybackStrikeHexes.length > 0 ? { airStrikeHexes: support.airStrikePlaybackStrikeHexes } : {}),
      ...(support.airStrikePlaybackCasualtyHexes.length > 0
        ? { airStrikeCasualtyHexes: support.airStrikePlaybackCasualtyHexes }
        : {}),
      killsByMelee: meleePack.killsByMelee.length > 0 ? meleePack.killsByMelee : undefined,
      meleeCombatHexes: meleePack.meleeCombatHexes.length > 0 ? meleePack.meleeCombatHexes : undefined,
      meleeCasualtyHexes: meleePack.meleeCasualtyHexes.length > 0 ? meleePack.meleeCasualtyHexes : undefined,
      meleeRemovedUnits: meleePack.meleeRemovedUnits.length > 0 ? meleePack.meleeRemovedUnits : undefined,
    };
    const livingSubUnitIds = new Set(finalBattle.subUnits.map((u) => u.id));
    const livingMarchContinuations = filterTacticalMarchContinuationsToPresentSubUnits(
      tacticalMarchContinuations,
      livingSubUnitIds
    );
    if (livingMarchContinuations.length !== tacticalMarchContinuations.length) {
      logDebug('gameActions commitHumanTacticalDraftOrders dropped march continuations for removed sub-units', {
        beforeCount: tacticalMarchContinuations.length,
        afterCount: livingMarchContinuations.length,
        droppedSubUnitIds: tacticalMarchContinuations
          .filter((row) => !livingSubUnitIds.has(row.subUnitId))
          .map((row) => row.subUnitId),
      });
    }
    logDebug('gameActions commitHumanTacticalDraftOrders playback', {
      humanMoveCount: humanMoves.length,
      opponentMoveCount: opponentMoves.length,
      rangedCombatHexCount: rangedCombatHexes.length,
      airStrikePlaybackMoveCount: support.airStrikePlaybackMoves.length,
      airStrikePlaybackStrikeHexCount: support.airStrikePlaybackStrikeHexes.length,
      airStrikePlaybackCasualtyHexCount: support.airStrikePlaybackCasualtyHexes.length,
      rangedRemovedCount: rangedRemovedUnits.length,
      rangedKillEdgeCount: support.killsByDirectFire.length,
      returnFireKillEdgeCount: support.killsByReturnFire.length,
      airStrikeKillEdgeCount: support.killsByAirStrike.length,
      meleeKillEdgeCount: meleePack.killsByMelee.length,
      meleeRemovedCount: meleePack.meleeRemovedUnits.length,
      marchContinuationCount: livingMarchContinuations.length,
      shotLineCount: support.rangedResolutionShotLines.length,
    });
    /**
     * Persists human tactical embark onto strategic `unit_transport_assignments` after the beat succeeded.
     *
     * Purpose: Keeps Ready-time tactical embark aligned with strategic sealift persistence (cancel movement is handled in the renderer draft layer).
     * When to use: Only here, immediately before returning success, when `embarkOrders` were part of this commit.
     * Expected outcome: Parent ids resolved from `finalBattle.subUnits`; rows inserted or skipped per `applyTacticalEmbarkCommittedOrdersToStrategicDb` rules.
     * Exceptions: None; the helper logs and skips invalid rows without throwing.
     */
    if ((args.embarkOrders?.length ?? 0) > 0) {
      applyTacticalEmbarkCommittedOrdersToStrategicDb(args.embarkOrders!, (subId) => {
        const row = finalBattle.subUnits.find((u) => u.id === subId);
        return row?.parentUnitId ?? null;
      });
    }
    const tacticalRemovedById = new Map<string, (typeof rangedRemovedUnits)[number]>();
    for (const u of rangedRemovedUnits) tacticalRemovedById.set(u.id, u);
    for (const u of meleePack.meleeRemovedUnits ?? []) tacticalRemovedById.set(u.id, u);
    const tacticalRemovedAll = [...tacticalRemovedById.values()];
    const airStrikeVictimIds = new Set((support.killsByAirStrike ?? []).map((k) => k.victimId));
    const rangedVictimIds = new Set(support.killsByDirectFire.map((k) => k.victimId));
    const airStrikeRemovedUnits = tacticalRemovedAll.filter((u) => {
      if (airStrikeVictimIds.has(u.id)) return true;
      if (u.player === 'human' && u.unitType === 'air' && !rangedVictimIds.has(u.id)) return true;
      return false;
    });
    const beatNumberResolved = Math.max(1, finalBattle.tacticalTurnNumber - 1);
    captureTurnLossNoteFromResolution({
      scope: 'tactical',
      battleId: finalBattle.battleId,
      turnNumber: beatNumberResolved,
      killsByDirectFire: support.killsByDirectFire,
      killsByReturnFire: support.killsByReturnFire,
      killsByMelee: meleePack.killsByMelee,
      killsByAirStrike: support.killsByAirStrike,
      removedUnits: tacticalRemovedAll,
      airStrikeRemovedUnits,
      airStrikeMoves: support.airStrikePlaybackMoves,
    });
    return {
      success: true,
      tacticalBattle: finalBattle,
      tacticalResolutionPlayback,
      tacticalMarchContinuations:
        livingMarchContinuations.length > 0 ? livingMarchContinuations : undefined,
      ...committedOpponentTacticalDraftFieldAfterConsume(Boolean(args.opponentTacticalDraft)),
    };
  } catch (err) {
    logError('commitHumanTacticalDraftOrders: exception', err);
    return { success: false, reason: String(err) };
  }
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
    const destinationSeaportCount = getRes1InfrastructureForHex(destinationH3Index).seaportCount;
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
 * Defines the `validateGroupRangedTarget` function shape (export function validateGroupRangedTarget(unitIds: string[], targetH3Index: string): SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `validateGroupRangedTarget` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units for ranged targeting' };
    if (isTacticalBattleActive()) {
      const snap = getActiveTacticalBattleSnapshot();
      if (!snap) return { success: false, reason: 'No tactical battle is active.' };
      return validateTacticalGroupRangedTarget({
        snap,
        uniqueUnitIds,
        targetH3Index,
        tacticalAttackerPlayer,
      }) as SubmitOrdersResult;
    }
    const strategicLabel = buildStrategicUnitDisplayLabelResolver(humanPerspectiveStateSnapshot().units);
    for (const unitId of uniqueUnitIds) {
      const result = validateRangedAttack(unitId, targetH3Index, {
        allowedPlayer: HUMAN_PLAYER_ID,
        displayLabelForUnit: strategicLabel,
      });
      if (!result.valid) {
        return { success: false, reason: `${strategicLabel(unitId)}: ${result.reason}` };
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
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units for strike targeting' };
    if (isTacticalBattleActive()) {
      const snap = getActiveTacticalBattleSnapshot();
      if (!snap) return { success: false, reason: 'No tactical battle is active.' };
      const tacticalCheck = validateTacticalHumanAirStrikeGroup(
        snap,
        uniqueUnitIds,
        targetH3Index,
        targetType,
        tacticalAttackerPlayer
      );
      if (!tacticalCheck.success) return tacticalCheck;
      return { success: true };
    }
    const strategicAirLabel = buildStrategicUnitDisplayLabelResolver(humanPerspectiveStateSnapshot().units);
    for (const unitId of uniqueUnitIds) {
      const result = validateAirStrikeOrder(unitId, targetH3Index, targetType, {
        allowedPlayer: HUMAN_PLAYER_ID,
        displayLabelForUnit: strategicAirLabel,
      });
      if (!result.valid) return { success: false, reason: `${strategicAirLabel(unitId)}: ${result.reason}` };
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
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units for ferry targeting' };
    if (isTacticalBattleActive()) {
      const snap = getActiveTacticalBattleSnapshot();
      if (!snap) return { success: false, reason: 'No tactical battle is active.' };
      const footprint = new Set(snap.res4ChildH3Indexes);
      if (!footprint.has(destinationH3Index)) return { success: false, reason: 'Destination is outside the tactical battle.' };
      for (const unitId of uniqueUnitIds) {
        const label = tacticalSubUnitLabelForUserMessage(snap.subUnits, unitId);
        const unit = snap.subUnits.find((u) => u.id === unitId);
        if (!unit || unit.player !== tacticalAttackerPlayer) {
          return { success: false, reason: `${label}: Unit not in tactical battle.` };
        }
        if (unit.unitType !== 'air') return { success: false, reason: `${label}: Only air units can ferry.` };
      }
      return { success: true };
    }
    const strategicFerryLabel = buildStrategicUnitDisplayLabelResolver(humanPerspectiveStateSnapshot().units);
    for (const unitId of uniqueUnitIds) {
      const result = validateFerryOrder(unitId, destinationH3Index, {
        allowedPlayer: HUMAN_PLAYER_ID,
        displayLabelForUnit: strategicFerryLabel,
      });
      if (!result.valid) return { success: false, reason: `${strategicFerryLabel(unitId)}: ${result.reason}` };
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
  return readHexBuildQueue(h3Index, requestingPlayerId);
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
  requestingPlayerId = HUMAN_PLAYER_ID
): { success: boolean; reason?: string; queue?: HexBuildQueueView } {
  return executeUpdateHexBuildQueueEntry(h3Index, entryId, unitType, count, requestingPlayerId);
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
  return executeRemoveHexBuildQueueEntry(h3Index, entryId, requestingPlayerId);
}

/**
 * Applies a shared ordered build queue template to multiple controlled production hexes.
 *
 * Purpose: Exposes the best-effort multi-hex production write through the public game-actions facade.
 * When to use: Renderer synchronization after build-hex selection joins or shared template edits.
 * Expected outcome: Successful, skipped, and failed hex/type details from the authoritative backend.
 * Exceptions: Implementation exceptions are captured and reported by the delegated action.
 */
export function applyBuildQueueTemplateToHexes(
  h3Indexes: string[],
  entries: BuildQueueTemplateEntry[],
  requestingPlayerId = HUMAN_PLAYER_ID
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
  requestingPlayerId = HUMAN_PLAYER_ID
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
 * Returns sealift stack UI state for a tactical res4 hex using sub-unit ids from the active tactical snapshot.
 *
 * Purpose: Supports stack-callout sealift controls during tactical battles when strategic `getSealiftStackState` does not describe res4 sub-units.
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
