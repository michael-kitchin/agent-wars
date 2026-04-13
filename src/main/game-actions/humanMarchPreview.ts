import { cellToLatLng, gridDisk } from 'h3-js';
import {
  getGameStateForPlayer,
  getHexController,
  getRes1InfrastructureForHex,
  isDbReady,
} from '../gameDb';
import { executePlanRouteWithSession } from '../tools/tool1Pathfinding';
import { terrainIsPassableForDomain } from '../pathfinding';
import { logDebug, logError, logTrace } from '../logger';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { AIR_FERRY_RANGE_HEXES, MOVEMENT_RANGE_BY_UNIT_TYPE, formatFerryOutOfRangeReason } from '../../shared/tacticalRanges';
import {
  buildHumanOrderGroupPreviewEnvelope,
  minMovementRangeAmongUnitTypes,
  representativeMarchPreviewUnitIdsByOriginH3,
  uniqueStrategicMarchPreviewUnitIds,
} from '../../shared/humanMarchPreviewGroupAssembly';
import { isWithinGridRangeSafe } from './gridRange';
import { isEmbarkedLandUnitOnWater } from './sealift';
import {
  EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON,
  getLandMovementBlockReason,
  isLandUnitType,
} from './landMovementConstraints';
import type { PlanRouteError, PlanRouteOk } from '../tools/tool1Pathfinding';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  buildEnvironmentSignature,
  buildHoverSessionCacheKey,
  buildSelectedUnitPositionsSignature,
  buildSelectionSignature,
  createEmptyHumanMarchPreviewDiagnostics,
  type HumanMarchPreviewDiagnostics,
} from './humanMarchPreviewDiagnostics';
import type { HumanMarchPreviewComputationContext } from './humanMarchPreviewComputationContext';
import { buildHumanMarchPreviewComputationContextFromState } from './humanMarchPreviewComputationContext';
import { cacheSetBounded } from './humanMarchPreviewCache';
import { hexSupportsMixedLandAndNaval, selectionHasMixedLandAndNaval } from './humanMarchPreviewMixedSelection';
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
 * Specifies the contract for the `h3Index` member (h3Index: string;).

 * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
h3Index: string; /**
 * Specifies the contract for the `displayOrder` member (displayOrder?: number).

 * Contract: Describes stable behavior for callers of `displayOrder` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
displayOrder?: number };

/**
 * Documents the `PlanRouteResult` type alias (type PlanRouteResult).

 * Purpose: Supports maintainability by documenting why `PlanRouteResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type PlanRouteResult = PlanRouteOk | PlanRouteError;
/**
 * Documents the `PreviewComputationContext` type alias (type PreviewComputationContext).

 * Purpose: Supports maintainability by documenting why `PreviewComputationContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type PreviewComputationContext = HumanMarchPreviewComputationContext;

/**
 * Documents the `ActiveHoverPathfindingSession` interface as a named contract surface (interface ActiveHoverPathfindingSession).

 * Purpose: Supports maintainability by documenting why `ActiveHoverPathfindingSession` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ActiveHoverPathfindingSession {
    /**
   * Specifies the contract for the `playerId` member (playerId: 'human' | 'opponent';).

   * Contract: Describes stable behavior for callers of `playerId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
playerId: 'human' | 'opponent';
    /**
   * Specifies the contract for the `selectionSignature` member (selectionSignature: string;).

   * Contract: Describes stable behavior for callers of `selectionSignature` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
selectionSignature: string;
    /**
   * Specifies the contract for the `selectedPositionsSignature` member (selectedPositionsSignature: string;).

   * Contract: Describes stable behavior for callers of `selectedPositionsSignature` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
selectedPositionsSignature: string;
    /**
   * Specifies the contract for the `environmentSignature` member (environmentSignature: string;).

   * Contract: Describes stable behavior for callers of `environmentSignature` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
environmentSignature: string;
    /**
   * Specifies the contract for the `sessionCacheKey` member (sessionCacheKey: string;).

   * Contract: Describes stable behavior for callers of `sessionCacheKey` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
sessionCacheKey: string;
    /**
   * Specifies the contract for the `context` member (context: PreviewComputationContext;).

   * Contract: Describes stable behavior for callers of `context` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
context: PreviewComputationContext;
}

/**
 * Documents the module-scope binding `DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES` (DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES).

 * Purpose: Supports maintainability by documenting why `DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES = 2048;
/**
 * Documents the module-scope binding `DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES` (DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES).

 * Purpose: Supports maintainability by documenting why `DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES = 2048;
/**
 * Documents the module-scope binding `maxPreviewRouteCacheEntries` (maxPreviewRouteCacheEntries).

 * Purpose: Supports maintainability by documenting why `maxPreviewRouteCacheEntries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let maxPreviewRouteCacheEntries = DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES;
/**
 * Documents the module-scope binding `maxPreviewResultCacheEntries` (maxPreviewResultCacheEntries).

 * Purpose: Supports maintainability by documenting why `maxPreviewResultCacheEntries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let maxPreviewResultCacheEntries = DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES;
/**
 * Documents the module-scope binding `MAX_NEARBY_FALLBACK_ATTEMPTS` (MAX_NEARBY_FALLBACK_ATTEMPTS).

 * Purpose: Supports maintainability by documenting why `MAX_NEARBY_FALLBACK_ATTEMPTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const MAX_NEARBY_FALLBACK_ATTEMPTS = 16;
/**
 * Documents the module-scope binding `MAX_NEARBY_FALLBACK_RADIUS` (MAX_NEARBY_FALLBACK_RADIUS).

 * Purpose: Supports maintainability by documenting why `MAX_NEARBY_FALLBACK_RADIUS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const MAX_NEARBY_FALLBACK_RADIUS = 6;
/**
 * Documents the module-scope binding `MAX_NEARBY_FALLBACK_BUDGET_MS` (MAX_NEARBY_FALLBACK_BUDGET_MS).

 * Purpose: Supports maintainability by documenting why `MAX_NEARBY_FALLBACK_BUDGET_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const MAX_NEARBY_FALLBACK_BUDGET_MS = 20;

/**
 * Documents the module-scope binding `previewDiagnostics` (previewDiagnostics: HumanMarchPreviewDiagnostics).

 * Purpose: Supports maintainability by documenting why `previewDiagnostics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const previewDiagnostics: HumanMarchPreviewDiagnostics = createEmptyHumanMarchPreviewDiagnostics();

/**
 * Documents the module-scope binding `previewRouteCache` (previewRouteCache).

 * Purpose: Supports maintainability by documenting why `previewRouteCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const previewRouteCache = new Map<string, PlanRouteResult>();
/**
 * Documents the module-scope binding `previewResultCache` (previewResultCache).

 * Purpose: Supports maintainability by documenting why `previewResultCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const previewResultCache = new Map<string, HumanOrderPreviewResult>();
/**
 * Documents the module-scope binding `activeHoverPathfindingSessionByPlayer` (activeHoverPathfindingSessionByPlayer).

 * Purpose: Supports maintainability by documenting why `activeHoverPathfindingSessionByPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const activeHoverPathfindingSessionByPlayer = new Map<'human' | 'opponent', ActiveHoverPathfindingSession>();

/**
 * Documents the `HumanOrderPreviewSegment` interface as a named contract surface (export interface HumanOrderPreviewSegment).

 * Purpose: Supports maintainability by documenting why `HumanOrderPreviewSegment` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanOrderPreviewSegment {
    /**
   * Specifies the contract for the `turn` member (turn: number;).

   * Contract: Describes stable behavior for callers of `turn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turn: number;
    /**
   * Specifies the contract for the `hexes` member (hexes: [number, number][];).

   * Contract: Describes stable behavior for callers of `hexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexes: [number, number][];
}

/**
 * Documents the `HumanOrderPreviewResult` interface as a named contract surface (export interface HumanOrderPreviewResult).

 * Purpose: Supports maintainability by documenting why `HumanOrderPreviewResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanOrderPreviewResult {
    /**
   * Specifies the contract for the `valid` member (valid: boolean;).

   * Contract: Describes stable behavior for callers of `valid` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
valid: boolean;
    /**
   * Specifies the contract for the `showInvalidMarker` member (showInvalidMarker: boolean;).

   * Contract: Describes stable behavior for callers of `showInvalidMarker` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showInvalidMarker: boolean;
    /**
   * Specifies the contract for the `invalidReason` member (invalidReason?: string;).

   * Contract: Describes stable behavior for callers of `invalidReason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
invalidReason?: string;
    /**
   * Specifies the contract for the `arrowLatLng` member (arrowLatLng?: [number, number];).

   * Contract: Describes stable behavior for callers of `arrowLatLng` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
arrowLatLng?: [number, number];
    /**
   * Specifies the contract for the `segments` member (segments: HumanOrderPreviewSegment[];).

   * Contract: Describes stable behavior for callers of `segments` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
segments: HumanOrderPreviewSegment[];
}

/**
 * Documents the `HumanOrderGroupPreviewUnitResult` interface as a named contract surface (export interface HumanOrderGroupPreviewUnitResult).

 * Purpose: Supports maintainability by documenting why `HumanOrderGroupPreviewUnitResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanOrderGroupPreviewUnitResult {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `originH3Index` member (originH3Index?: string;).

   * Contract: Parity field with `HumanOrderGroupPreviewUnitResult` in `humanOrderPreviewTypes.ts` for support-targeting hover rows.
   * When to use: When this module emits grouped previews that include ranged/air stroke metadata.
   * Expected outcome: Optional; march-only rows omit it.
   * Exceptions: None.
   */
originH3Index?: string;
    /**
   * Specifies the contract for the `preview` member (preview: HumanOrderPreviewResult;).

   * Contract: Describes stable behavior for callers of `preview` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
preview: HumanOrderPreviewResult;
}

/**
 * Documents the `HumanOrderGroupPreviewResult` interface as a named contract surface (export interface HumanOrderGroupPreviewResult).

 * Purpose: Supports maintainability by documenting why `HumanOrderGroupPreviewResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanOrderGroupPreviewResult {
    /**
   * Specifies the contract for the `validForAll` member (validForAll: boolean;).

   * Contract: Describes stable behavior for callers of `validForAll` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validForAll: boolean;
    /**
   * Specifies the contract for the `showInvalidMarker` member (showInvalidMarker: boolean;).

   * Contract: Describes stable behavior for callers of `showInvalidMarker` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showInvalidMarker: boolean;
    /**
   * Specifies the contract for the `invalidReason` member (invalidReason?: string;).

   * Contract: Describes stable behavior for callers of `invalidReason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
invalidReason?: string;
    /**
   * Specifies the contract for the `slowestMovementRange` member (slowestMovementRange: number;).

   * Contract: Describes stable behavior for callers of `slowestMovementRange` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
slowestMovementRange: number;
    /**
   * Specifies the contract for the `previews` member (previews: HumanOrderGroupPreviewUnitResult[];).

   * Contract: Describes stable behavior for callers of `previews` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
previews: HumanOrderGroupPreviewUnitResult[];
}

/**
 * Defines the `logPreviewOutcome` function shape (function logPreviewOutcome( unitId: string, hoveredH3Index: string, preview: HumanOrderPreviewResult, source: 'computed' | 'result_cache').

 * Purpose: Supports maintainability by documenting why `logPreviewOutcome` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function logPreviewOutcome(
  unitId: string,
  hoveredH3Index: string,
  preview: HumanOrderPreviewResult,
  source: 'computed' | 'result_cache'
): void {
  logDebug('gameActions previewHumanMarchOrder: outcome', {
    unitId,
    hoveredH3Index,
    source,
    valid: preview.valid,
    showInvalidMarker: preview.showInvalidMarker,
    invalidReason: preview.invalidReason ?? null,
    segmentCount: preview.segments.length,
  });
}

/**
 * Defines the `snapshotStateForPlayer` function shape (function snapshotStateForPlayer(playerId: 'human' | 'opponent'): GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `snapshotStateForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function snapshotStateForPlayer(playerId: 'human' | 'opponent'): GameStateSnapshot {
  return getGameStateForPlayer(playerId, { maskUnexploredTerrain: false });
}

/**
 * Defines the `getOrCreateHoverSessionContext` function shape (function getOrCreateHoverSessionContext().

 * Purpose: Supports maintainability by documenting why `getOrCreateHoverSessionContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getOrCreateHoverSessionContext(
  playerId: 'human' | 'opponent',
  selectedUnitIds: readonly string[]
): PreviewComputationContext {
  const selectionSignature = buildSelectionSignature(selectedUnitIds);
  const selectedPositionsSignature = buildSelectedUnitPositionsSignature(selectedUnitIds);
  const environmentSignature = buildEnvironmentSignature(playerId);
  const sessionCacheKey = buildHoverSessionCacheKey({ playerId, selectionSignature, selectedPositionsSignature, environmentSignature });
  const active = activeHoverPathfindingSessionByPlayer.get(playerId);
  if (
    active &&
    active.selectionSignature === selectionSignature &&
    active.selectedPositionsSignature === selectedPositionsSignature &&
    active.environmentSignature === environmentSignature &&
    active.sessionCacheKey === sessionCacheKey
  ) {
    previewDiagnostics.sessionReuseCount += 1;
    logDebug('gameActions hoverPathfindingSession: reuse', {
      playerId,
      selectedCount: selectedUnitIds.length,
      selectionSignatureLength: selectionSignature.length,
      selectedPositionsSignatureLength: selectedPositionsSignature.length,
    });
    return active.context;
  }
  if (active) {
    previewDiagnostics.sessionInvalidateCount += 1;
    logDebug('gameActions hoverPathfindingSession: invalidate', {
      playerId,
      priorSelectionSignatureLength: active.selectionSignature.length,
      selectionSignatureLength: selectionSignature.length,
      priorSelectedPositionsSignatureLength: active.selectedPositionsSignature.length,
      selectedPositionsSignatureLength: selectedPositionsSignature.length,
      priorEnvironmentSignatureLength: active.environmentSignature.length,
      environmentSignatureLength: environmentSignature.length,
      priorSessionCacheKey: active.sessionCacheKey,
      nextSessionCacheKey: sessionCacheKey,
    });
  }
  const state = snapshotStateForPlayer(playerId);
  const context = buildHumanMarchPreviewComputationContextFromState(state);
  activeHoverPathfindingSessionByPlayer.set(playerId, {
    playerId,
    selectionSignature,
    selectedPositionsSignature,
    environmentSignature,
    sessionCacheKey,
    context,
  });
  previewDiagnostics.sessionCreateCount += 1;
  logDebug('gameActions hoverPathfindingSession: create', {
    playerId,
    selectedCount: selectedUnitIds.length,
    selectionSignatureLength: selectionSignature.length,
    selectedPositionsSignatureLength: selectedPositionsSignature.length,
    environmentSignatureLength: environmentSignature.length,
    sessionCacheKey,
  });
  return context;
}

/**
 * Defines the `executePlanRouteCached` function shape (function executePlanRouteCached(context: PreviewComputationContext, unitId: string, destinationH3Index: string): PlanRouteResult).

 * Purpose: Supports maintainability by documenting why `executePlanRouteCached` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function executePlanRouteCached(context: PreviewComputationContext, unitId: string, destinationH3Index: string): PlanRouteResult {
  const cacheKey = `${context.stateCacheKey}|${unitId}|${destinationH3Index}`;
  previewDiagnostics.routePlanCalls += 1;
  const cached = previewRouteCache.get(cacheKey);
  if (cached) {
    previewDiagnostics.routeCacheHitCount += 1;
    return cached;
  }
  previewDiagnostics.routeCacheMissCount += 1;
  const destinationLatLng = context.latLngByH3.get(destinationH3Index) ?? cellToLatLng(destinationH3Index);
  const planned = executePlanRouteWithSession(
    unitId,
    [destinationLatLng[0], destinationLatLng[1]],
    { avoidEnemies: false },
    context.pathfindingSession
  );
  cacheSetBounded(previewRouteCache, cacheKey, planned, maxPreviewRouteCacheEntries);
  return planned;
}

/**
 * Defines the `findNearbyReachablePreview` function shape (function findNearbyReachablePreview( context: PreviewComputationContext, unit: HumanOwnedUnit, hoveredH3Index: string, passableFor: 'land' | 'water').

 * Purpose: Supports maintainability by documenting why `findNearbyReachablePreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function findNearbyReachablePreview(
  context: PreviewComputationContext,
  unit: HumanOwnedUnit,
  hoveredH3Index: string,
  passableFor: 'land' | 'water'
): HumanOrderPreviewResult | null {
  const startedAtMs = Date.now();
  let attempts = 0;
  const seen = new Set<string>([hoveredH3Index]);
  for (let radius = 1; radius <= MAX_NEARBY_FALLBACK_RADIUS; radius++) {
    if (Date.now() - startedAtMs >= MAX_NEARBY_FALLBACK_BUDGET_MS) {
      previewDiagnostics.fallbackBudgetAbortCount += 1;
      return null;
    }
    let ring: string[] = [];
    try {
      ring = gridDisk(hoveredH3Index, radius);
    } catch {
      break;
    }
    for (const candidateH3 of ring) {
      if (Date.now() - startedAtMs >= MAX_NEARBY_FALLBACK_BUDGET_MS) {
        previewDiagnostics.fallbackBudgetAbortCount += 1;
        return null;
      }
      if (attempts >= MAX_NEARBY_FALLBACK_ATTEMPTS) return null;
      if (seen.has(candidateH3)) continue;
      seen.add(candidateH3);
      const passabilityTerrain = context.passabilityByH3.get(candidateH3) ?? 'land';
      if (!terrainIsPassableForDomain(passabilityTerrain, passableFor)) continue;
      if (isLandUnitType(unit.unitType) && candidateH3 !== unit.h3Index) {
        const blockReason = getLandMovementBlockReason({
          unitType: unit.unitType,
          originH3Index: unit.h3Index,
          destinationH3Index: candidateH3,
          terrainByH3: context.terrainByH3,
          terrainKindByH3: context.terrainKindByH3,
          isEmbarkedAtSea: false,
        });
        if (blockReason) continue;
      }
      attempts += 1;
      previewDiagnostics.fallbackAttemptCount += 1;
      const planned = executePlanRouteCached(context, unit.id, candidateH3);
      if (planned.status !== 'ok') continue;
      return {
        valid: true,
        showInvalidMarker: false,
        arrowLatLng: planned.destination,
        segments: planned.path.map((seg) => ({ turn: seg.turn, hexes: seg.hexes })),
      };
    }
  }
  return null;
}

/**
 * Defines the `computeHumanMarchPreviewForUnit` function shape (function computeHumanMarchPreviewForUnit().

 * Purpose: Supports maintainability by documenting why `computeHumanMarchPreviewForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function computeHumanMarchPreviewForUnit(
  context: PreviewComputationContext,
  unitId: string,
  hoveredH3Index: string
): HumanOrderPreviewResult {
  const cacheKey = `${context.stateCacheKey}|${unitId}|${hoveredH3Index}`;
  const cached = previewResultCache.get(cacheKey);
  if (cached) {
    logPreviewOutcome(unitId, hoveredH3Index, cached, 'result_cache');
    return cached;
  }
  const unit = context.state.units.find((u) => u.id === unitId && u.player === 'human');
  if (!unit) return { valid: false, showInvalidMarker: false, invalidReason: 'Unit not found', segments: [] };
  const hoveredHex = context.state.hexes.find((h) => h.h3Index === hoveredH3Index);
  if (!hoveredHex) return { valid: false, showInvalidMarker: false, segments: [] };
  let result: HumanOrderPreviewResult;
  if (unit.unitType === 'air') {
    const controller = getHexController(hoveredH3Index);
    if (controller !== 'human') {
      return {
        valid: false,
        showInvalidMarker: true,
        invalidReason: 'Ferry destination must be a human-controlled airport hex.',
        segments: [],
      };
    }
    const destinationInfra = getRes1InfrastructureForHex(hoveredH3Index);
    if (destinationInfra.airportCount <= 0) {
      return {
        valid: false,
        showInvalidMarker: true,
        invalidReason: 'Ferry destination must have an intact airport.',
        segments: [],
      };
    }
    const withinFerryRange = isWithinGridRangeSafe(unit.h3Index, hoveredH3Index, AIR_FERRY_RANGE_HEXES, 'preview ferry');
    if (!withinFerryRange) {
      return {
        valid: false,
        showInvalidMarker: true,
        invalidReason: `${formatFerryOutOfRangeReason(AIR_FERRY_RANGE_HEXES)}.`,
        segments: [],
      };
    }
    const originLatLng = context.latLngByH3.get(unit.h3Index) ?? cellToLatLng(unit.h3Index);
    const destinationLatLng = context.latLngByH3.get(hoveredH3Index) ?? cellToLatLng(hoveredH3Index);
    result = {
      valid: true,
      showInvalidMarker: false,
      arrowLatLng: [destinationLatLng[0], destinationLatLng[1]],
      segments: [
        {
          turn: 1,
          hexes: [
            [originLatLng[0], originLatLng[1]],
            [destinationLatLng[0], destinationLatLng[1]],
          ],
        },
      ],
    };
    cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
    logPreviewOutcome(unitId, hoveredH3Index, result, 'computed');
    return result;
  }

  const unitIsLand = isLandUnitType(unit.unitType);
  const embarkedOnWater = unitIsLand && isEmbarkedLandUnitOnWater(unit.id);
  const originPassabilityTerrain = context.passabilityByH3.get(unit.h3Index) ?? 'land';
  const embarkedAtSeaWithoutCoastalOrigin = embarkedOnWater && originPassabilityTerrain !== 'coastal';
  if (embarkedOnWater) {
    const hoveredPassabilityTerrain = context.passabilityByH3.get(hoveredH3Index) ?? 'land';
    const hoveredSeaportCount = getRes1InfrastructureForHex(hoveredH3Index).seaportCount;
    const originSeaportCount = getRes1InfrastructureForHex(unit.h3Index).seaportCount;
    logDebug('gameActions previewHumanMarchOrder: embarked terrain classification', {
      unitId: unit.id,
      originH3Index: unit.h3Index,
      originTerrainRaw: context.terrainByH3.get(unit.h3Index) ?? null,
      originTerrainKind: context.terrainKindByH3.get(unit.h3Index) ?? null,
      originNormalizedTerrain: originPassabilityTerrain,
      originSeaportCount,
      hoveredH3Index,
      hoveredTerrainRaw: context.terrainByH3.get(hoveredH3Index) ?? null,
      hoveredTerrainKind: context.terrainKindByH3.get(hoveredH3Index) ?? null,
      hoveredNormalizedTerrain: hoveredPassabilityTerrain,
      hoveredSeaportCount,
      embarkedAtSeaWithoutCoastalOrigin,
    });
  }
  if (embarkedAtSeaWithoutCoastalOrigin) {
    result = {
      valid: false,
      showInvalidMarker: true,
      invalidReason: getLandMovementBlockReason({
        unitType: unit.unitType,
        originH3Index: unit.h3Index,
        destinationH3Index: unit.h3Index,
        terrainByH3: context.terrainByH3,
        terrainKindByH3: context.terrainKindByH3,
        isEmbarkedAtSea: true,
      }) ?? EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON,
      segments: [],
    };
    cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
    logPreviewOutcome(unitId, hoveredH3Index, result, 'computed');
    return result;
  }
  if (unitIsLand && hoveredH3Index !== unit.h3Index) {
    const blockReason = getLandMovementBlockReason({
      unitType: unit.unitType,
      originH3Index: unit.h3Index,
      destinationH3Index: hoveredH3Index,
      terrainByH3: context.terrainByH3,
      terrainKindByH3: context.terrainKindByH3,
      isEmbarkedAtSea: embarkedAtSeaWithoutCoastalOrigin,
    });
    if (blockReason) {
      result = {
        valid: false,
        showInvalidMarker: true,
        invalidReason: blockReason,
        segments: [],
      };
      cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
      logPreviewOutcome(unitId, hoveredH3Index, result, 'computed');
      return result;
    }
  }

  const passableFor = unit.unitType === 'naval' ? 'water' : 'land';
  const hoveredPassabilityTerrain = context.passabilityByH3.get(hoveredHex.h3Index) ?? 'land';
  const hoveredPassable = terrainIsPassableForDomain(hoveredPassabilityTerrain, passableFor);
  const direct = hoveredPassable ? executePlanRouteCached(context, unitId, hoveredH3Index) : undefined;
  if (hoveredPassable && direct?.status === 'ok') {
    result = {
      valid: true,
      showInvalidMarker: false,
      arrowLatLng: direct.destination,
      segments: direct.path.map((seg) => ({ turn: seg.turn, hexes: seg.hexes })),
    };
    cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
    logPreviewOutcome(unitId, hoveredH3Index, result, 'computed');
    return result;
  }

  // Nearby fallback is only useful for passable hover hexes whose direct route failed.
  // Skips expensive probing for obviously invalid terrain (e.g., land unit over open water).
  const nearby = hoveredPassable ? findNearbyReachablePreview(context, unit, hoveredH3Index, passableFor) : null;
  if (nearby) {
    cacheSetBounded(previewResultCache, cacheKey, nearby, maxPreviewResultCacheEntries);
    logPreviewOutcome(unitId, hoveredH3Index, nearby, 'computed');
    return nearby;
  }

  result = {
    valid: false,
    showInvalidMarker: true,
    invalidReason: 'Destination is invalid for this unit type or unreachable.',
    segments: [],
  };
  cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
  logPreviewOutcome(unitId, hoveredH3Index, result, 'computed');
  return result;
}

/**
 * Defines the `buildHumanMarchPreviewForUnit` function shape (function buildHumanMarchPreviewForUnit().

 * Purpose: Thin wrapper so single-unit and grouped preview callers share one entry point into `computeHumanMarchPreviewForUnit` (route/result caches only; no time-based reuse of stale hovers).
 * When to use: From `previewHumanMarchOrderImpl` and grouped preview assembly after session/context validation.
 * Expected outcome: Always reflects the requested `hoveredH3Index` for the given `unitId`.
 * Exceptions: None.
 */
function buildHumanMarchPreviewForUnit(
  context: PreviewComputationContext,
  unitId: string,
  hoveredH3Index: string
): HumanOrderPreviewResult {
  return computeHumanMarchPreviewForUnit(context, unitId, hoveredH3Index);
}

/**
 * Defines the `previewHumanMarchOrderImpl` function shape (export function previewHumanMarchOrderImpl(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult).

 * Purpose: Supports maintainability by documenting why `previewHumanMarchOrderImpl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function previewHumanMarchOrderImpl(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult {
  logTrace('gameActions previewHumanMarchOrder', { unitId, hoveredH3Index });
  try {
    previewDiagnostics.requestCount += 1;
    if (!isDbReady()) return { valid: false, showInvalidMarker: false, invalidReason: 'Database not initialized', segments: [] };
    if (isTacticalBattleActive()) {
      return { valid: false, showInvalidMarker: false, invalidReason: 'March preview is unavailable during a tactical battle.', segments: [] };
    }
    const context = getOrCreateHoverSessionContext('human', [unitId]);
    return buildHumanMarchPreviewForUnit(context, unitId, hoveredH3Index);
  } catch (err) {
    logError('previewHumanMarchOrder: exception', err);
    return { valid: false, showInvalidMarker: false, invalidReason: String(err), segments: [] };
  }
}

/**
 * Defines the `previewHumanMarchOrdersImpl` function shape (export function previewHumanMarchOrdersImpl(unitIds: string[], hoveredH3Index: string): HumanOrderGroupPreviewResult).

 * Purpose: Supports maintainability by documenting why `previewHumanMarchOrdersImpl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function previewHumanMarchOrdersImpl(unitIds: string[], hoveredH3Index: string): HumanOrderGroupPreviewResult {
  logTrace('gameActions previewHumanMarchOrders', { unitCount: unitIds.length, hoveredH3Index });
  try {
    previewDiagnostics.requestCount += 1;
    if (!isDbReady()) {
      return {
        validForAll: false,
        showInvalidMarker: false,
        invalidReason: 'Database not initialized',
        slowestMovementRange: 0,
        previews: [],
      };
    }
    if (isTacticalBattleActive()) {
      return {
        validForAll: false,
        showInvalidMarker: false,
        invalidReason: 'March preview is unavailable during a tactical battle.',
        slowestMovementRange: 0,
        previews: [],
      };
    }
    const uniqueUnitIds = uniqueStrategicMarchPreviewUnitIds(unitIds);
    if (uniqueUnitIds.length === 0) {
      if (activeHoverPathfindingSessionByPlayer.has('human')) {
        previewDiagnostics.sessionInvalidateCount += 1;
        activeHoverPathfindingSessionByPlayer.delete('human');
      }
      return {
        validForAll: false,
        showInvalidMarker: false,
        invalidReason: 'No selected units',
        slowestMovementRange: 0,
        previews: [],
      };
    }
    const context = getOrCreateHoverSessionContext('human', uniqueUnitIds);
    const state = context.state;
    const selectedUnits = uniqueUnitIds
      .map((unitId) => state.units.find((u) => u.id === unitId && u.player === 'human'))
      .filter((unit): unit is HumanOwnedUnit => !!unit);
    logDebug('gameActions parity previewBuild: strategic request', {
      requestedUnitCount: unitIds.length,
      uniqueUnitCount: uniqueUnitIds.length,
      selectedHumanUnitCount: selectedUnits.length,
      hoveredH3Index,
    });
    if (selectedUnits.length === 0) {
      return {
        validForAll: false,
        showInvalidMarker: false,
        invalidReason: 'No valid selected units',
        slowestMovementRange: 0,
        previews: [],
      };
    }
    const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
      selectedUnits.map((unit) => ({ unitId: unit.id, originH3: unit.h3Index }))
    );
    logDebug('gameActions previewHumanMarchOrders: unique source/destination checks', {
      selectedUnits: selectedUnits.length,
      uniqueOrigins: previewUnitIds.length,
      hoveredH3Index,
    });
    const previews: HumanOrderGroupPreviewUnitResult[] = previewUnitIds.map((unitId) => ({
      unitId,
      preview: buildHumanMarchPreviewForUnit(context, unitId, hoveredH3Index),
    }));
    const hoveredHex = state.hexes.find((h) => h.h3Index === hoveredH3Index);
    const hasMixedSelection = selectionHasMixedLandAndNaval(selectedUnits);
    const slowestMovementRange = minMovementRangeAmongUnitTypes(
      selectedUnits.map((unit) => unit.unitType),
      MOVEMENT_RANGE_BY_UNIT_TYPE,
      1
    );
    const sharedMixedTerrain = !!hoveredHex && hexSupportsMixedLandAndNaval(hoveredHex);
    if (hasMixedSelection && !sharedMixedTerrain) {
      const reason = 'Mixed land/naval stacks can only move to coastal hexes.';
      logDebug('gameActions parity previewBuild: mixed-domain rejection', {
        selectedHumanUnitCount: selectedUnits.length,
        representativeOriginCount: previewUnitIds.length,
        hoveredH3Index,
        invalidReason: reason,
      });
      return {
        validForAll: false,
        showInvalidMarker: true,
        invalidReason: reason,
        slowestMovementRange,
        previews: previews.map((entry) => ({
          unitId: entry.unitId,
          preview: {
            valid: false,
            showInvalidMarker: true,
            invalidReason: reason,
            segments: [],
          },
        })),
      };
    }
    const groupPreview = buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange });
    logDebug('gameActions parity previewBuild: strategic outcome', {
      selectedHumanUnitCount: selectedUnits.length,
      representativeOriginCount: previewUnitIds.length,
      hoveredH3Index,
      validForAll: groupPreview.validForAll,
      showInvalidMarker: groupPreview.showInvalidMarker,
      invalidReason: groupPreview.invalidReason ?? null,
    });
    return groupPreview;
  } catch (err) {
    logError('previewHumanMarchOrders: exception', err);
    return {
      validForAll: false,
      showInvalidMarker: false,
      invalidReason: String(err),
      slowestMovementRange: 0,
      previews: [],
    };
  }
}

/**
 * Defines the `getHumanMarchPreviewDiagnostics` function shape (export function getHumanMarchPreviewDiagnostics(): HumanMarchPreviewDiagnostics & { routeCacheSize: number; resultCacheSize: number; activeSessionCount:).

 * Purpose: Supports maintainability by documenting why `getHumanMarchPreviewDiagnostics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHumanMarchPreviewDiagnostics(): HumanMarchPreviewDiagnostics & {
  routeCacheSize: number;
  resultCacheSize: number;
  activeSessionCount: number;
} {
  logTrace('gameActions getHumanMarchPreviewDiagnostics');
  return {
    ...previewDiagnostics,
    routeCacheSize: previewRouteCache.size,
    resultCacheSize: previewResultCache.size,
    activeSessionCount: activeHoverPathfindingSessionByPlayer.size,
  };
}

/**
 * Defines the `resetHumanMarchPreviewDiagnosticsForTests` function shape (export function resetHumanMarchPreviewDiagnosticsForTests(): void).

 * Purpose: Supports maintainability by documenting why `resetHumanMarchPreviewDiagnosticsForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resetHumanMarchPreviewDiagnosticsForTests(): void {
  logDebug('gameActions resetHumanMarchPreviewDiagnosticsForTests');
  previewRouteCache.clear();
  previewResultCache.clear();
  activeHoverPathfindingSessionByPlayer.clear();
  Object.assign(previewDiagnostics, createEmptyHumanMarchPreviewDiagnostics());
}

/**
 * Defines the `configureHumanMarchPreviewCacheLimitsForTests` function shape (export function configureHumanMarchPreviewCacheLimitsForTests(limits?:).

 * Purpose: Supports maintainability by documenting why `configureHumanMarchPreviewCacheLimitsForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function configureHumanMarchPreviewCacheLimitsForTests(limits?: {
  route?: number;
  result?: number;
}): void {
  logDebug('gameActions configureHumanMarchPreviewCacheLimitsForTests', { limits });
  maxPreviewRouteCacheEntries = limits?.route ?? DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES;
  maxPreviewResultCacheEntries = limits?.result ?? DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES;
}
