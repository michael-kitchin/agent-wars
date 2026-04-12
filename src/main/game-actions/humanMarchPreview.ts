import { cellToLatLng, gridDisk } from 'h3-js';
import { buildLatLngCoordinateMap } from '../mapData';
import {
  getGameStateForPlayer,
  getHexController,
  getRes1InfrastructureForHex,
  isDbReady,
} from '../gameDb';
import { createPathfindingSession, executePlanRouteWithSession } from '../tools/tool1Pathfinding';
import { terrainIsPassableForDomain } from '../pathfinding';
import { buildNormalizedTerrainByH3 } from '../movementTerrain';
import { logDebug, logError, logTrace } from '../logger';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { AIR_FERRY_RANGE_HEXES, MOVEMENT_RANGE_BY_UNIT_TYPE, formatFerryOutOfRangeReason } from '../../shared/tacticalRanges';
import { isWithinGridRangeSafe } from './gridRange';
import { isEmbarkedLandUnitOnWater } from './sealift';
import {
  buildTerrainMapsFromHexRows,
  EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON,
  getLandMovementBlockReason,
  isLandUnitType,
} from './landMovementConstraints';
import type { PlanRouteError, PlanRouteOk } from '../tools/tool1Pathfinding';
import type { PathfindingSession } from '../tools/tool1Pathfinding';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  buildEnvironmentSignature,
  buildHoverSessionCacheKey,
  buildSelectedUnitPositionsSignature,
  buildSelectionSignature,
  createEmptyHumanMarchPreviewDiagnostics,
  type HumanMarchPreviewDiagnostics,
} from './humanMarchPreviewDiagnostics';
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
type PreviewComputationContext = {
    /**
   * Specifies the contract for the `state` member (state: GameStateSnapshot;).

   * Contract: Describes stable behavior for callers of `state` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
state: GameStateSnapshot;
    /**
   * Specifies the contract for the `latLngByH3` member (latLngByH3: Map<string, [number, number]>;).

   * Contract: Describes stable behavior for callers of `latLngByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
latLngByH3: Map<string, [number, number]>;
    /**
   * Specifies the contract for the `resolveToH3` member (resolveToH3: (lat: number, lng: number) => string | undefined;).

   * Contract: Describes stable behavior for callers of `resolveToH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resolveToH3: (lat: number, lng: number) => string | undefined;
    /**
   * Specifies the contract for the `passabilityByH3` member (passabilityByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `passabilityByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
passabilityByH3: Map<string, string>;
    /**
   * Specifies the contract for the `terrainByH3` member (terrainByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `terrainByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainByH3: Map<string, string>;
    /**
   * Specifies the contract for the `terrainKindByH3` member (terrainKindByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `terrainKindByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainKindByH3: Map<string, string>;
    /**
   * Specifies the contract for the `stateCacheKey` member (stateCacheKey: string;).

   * Contract: Describes stable behavior for callers of `stateCacheKey` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
stateCacheKey: string;
    /**
   * Specifies the contract for the `pathfindingSession` member (pathfindingSession: PathfindingSession;).

   * Contract: Describes stable behavior for callers of `pathfindingSession` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pathfindingSession: PathfindingSession;
};

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
 * Documents the module-scope binding `DEFAULT_MAX_PREVIEW_THROTTLE_ENTRIES` (DEFAULT_MAX_PREVIEW_THROTTLE_ENTRIES).

 * Purpose: Supports maintainability by documenting why `DEFAULT_MAX_PREVIEW_THROTTLE_ENTRIES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const DEFAULT_MAX_PREVIEW_THROTTLE_ENTRIES = 1024;
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
 * Documents the module-scope binding `maxPreviewThrottleEntries` (maxPreviewThrottleEntries).

 * Purpose: Supports maintainability by documenting why `maxPreviewThrottleEntries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let maxPreviewThrottleEntries = DEFAULT_MAX_PREVIEW_THROTTLE_ENTRIES;
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
 * Documents the module-scope binding `PREVIEW_THROTTLE_WINDOW_MS` (PREVIEW_THROTTLE_WINDOW_MS).

 * Purpose: Supports maintainability by documenting why `PREVIEW_THROTTLE_WINDOW_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PREVIEW_THROTTLE_WINDOW_MS = 20;

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
 * Documents the module-scope binding `previewThrottleCache` (previewThrottleCache).

 * Purpose: Supports maintainability by documenting why `previewThrottleCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const previewThrottleCache = new Map<
  string,
  { computedAtMs: number; hoveredH3Index: string; preview: HumanOrderPreviewResult }
>();
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
 * Defines the `logPreviewOutcome` function shape (function logPreviewOutcome( unitId: string, hoveredH3Index: string, preview: HumanOrderPreviewResult, source: 'computed' | 'result_cache' | 'throttl).

 * Purpose: Supports maintainability by documenting why `logPreviewOutcome` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function logPreviewOutcome(
  unitId: string,
  hoveredH3Index: string,
  preview: HumanOrderPreviewResult,
  source: 'computed' | 'result_cache' | 'throttle_reuse'
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
 * Defines the `cacheSetBounded` function shape (function cacheSetBounded<T>(cache: Map<string, T>, key: string, value: T, maxEntries: number): void).

 * Purpose: Supports maintainability by documenting why `cacheSetBounded` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function cacheSetBounded<T>(cache: Map<string, T>, key: string, value: T, maxEntries: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

/**
 * Defines the `buildStateCacheKey` function shape (function buildStateCacheKey(state: GameStateSnapshot): string).

 * Purpose: Supports maintainability by documenting why `buildStateCacheKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildStateCacheKey(state: GameStateSnapshot): string {
  const unitSignature = state.units
    .map((u) => `${u.id}:${u.h3Index}`)
    .sort()
    .join('|');
  return `u:${unitSignature}`;
}

/**
 * Defines the `buildPreviewContextFromState` function shape (function buildPreviewContextFromState(state: GameStateSnapshot): PreviewComputationContext).

 * Purpose: Supports maintainability by documenting why `buildPreviewContextFromState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildPreviewContextFromState(state: GameStateSnapshot): PreviewComputationContext {
  const hexList = state.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const { terrainByH3, terrainKindByH3 } = buildTerrainMapsFromHexRows(state.hexes);
  return {
    state,
    latLngByH3,
    resolveToH3,
    passabilityByH3: buildNormalizedTerrainByH3(state.hexes),
    terrainByH3,
    terrainKindByH3,
    stateCacheKey: buildStateCacheKey(state),
    pathfindingSession: createPathfindingSession(state, latLngByH3, resolveToH3),
  };
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
  const context = buildPreviewContextFromState(state);
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
 * Defines the `hexSupportsMixedLandAndNaval` function shape (function hexSupportsMixedLandAndNaval(hex:).

 * Purpose: Supports maintainability by documenting why `hexSupportsMixedLandAndNaval` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function hexSupportsMixedLandAndNaval(hex: { h3Index: string; terrain: string; terrainKind?: string }): boolean {
  const passabilityByH3 = buildNormalizedTerrainByH3([hex]);
  const passabilityTerrain = passabilityByH3.get(hex.h3Index) ?? 'land';
  return (
    terrainIsPassableForDomain(passabilityTerrain, 'land') &&
    terrainIsPassableForDomain(passabilityTerrain, 'water')
  );
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

 * Purpose: Supports maintainability by documenting why `buildHumanMarchPreviewForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildHumanMarchPreviewForUnit(
  context: PreviewComputationContext,
  unitId: string,
  hoveredH3Index: string
): HumanOrderPreviewResult {
  const throttleKey = `${context.stateCacheKey}|${unitId}`;
  const throttleEntry = previewThrottleCache.get(throttleKey);
  const nowMs = Date.now();
  if (throttleEntry) {
    const ageMs = nowMs - throttleEntry.computedAtMs;
    // Coalesce rapid hover updates by reusing the latest preview inside a short time window.
    if (throttleEntry.hoveredH3Index === hoveredH3Index || ageMs < PREVIEW_THROTTLE_WINDOW_MS) {
      if (throttleEntry.hoveredH3Index !== hoveredH3Index) {
        logDebug('gameActions previewHumanMarchOrder: throttle reuse', {
          unitId,
          requestedHoveredH3Index: hoveredH3Index,
          reusedFromHoveredH3Index: throttleEntry.hoveredH3Index,
          ageMs,
          throttleWindowMs: PREVIEW_THROTTLE_WINDOW_MS,
        });
      }
      logPreviewOutcome(unitId, hoveredH3Index, throttleEntry.preview, 'throttle_reuse');
      return throttleEntry.preview;
    }
  }
  const preview = computeHumanMarchPreviewForUnit(context, unitId, hoveredH3Index);
  cacheSetBounded(
    previewThrottleCache,
    throttleKey,
    { computedAtMs: nowMs, hoveredH3Index, preview },
    maxPreviewThrottleEntries
  );
  return preview;
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
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
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
    if (selectedUnits.length === 0) {
      return {
        validForAll: false,
        showInvalidMarker: false,
        invalidReason: 'No valid selected units',
        slowestMovementRange: 0,
        previews: [],
      };
    }
    const representativeUnitIdsByOrigin = new Map<string, string>();
    for (const unit of selectedUnits) {
      if (!representativeUnitIdsByOrigin.has(unit.h3Index)) representativeUnitIdsByOrigin.set(unit.h3Index, unit.id);
    }
    const previewUnitIds = Array.from(representativeUnitIdsByOrigin.values());
    logDebug('gameActions previewHumanMarchOrders: unique source/destination checks', {
      selectedUnits: selectedUnits.length,
      uniqueOrigins: previewUnitIds.length,
      hoveredH3Index,
    });
    const previews: HumanOrderGroupPreviewUnitResult[] = previewUnitIds.map((unitId) => ({
      unitId,
      preview: buildHumanMarchPreviewForUnit(context, unitId, hoveredH3Index),
    }));
    const invalid = previews.find((entry) => !entry.preview.valid);
    const hoveredHex = state.hexes.find((h) => h.h3Index === hoveredH3Index);
    const hasMixedSelection = selectionHasMixedLandAndNaval(selectedUnits);
    const slowestMovementRange =
      selectedUnits.length > 0
        ? Math.min(...selectedUnits.map((unit) => MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1))
        : 0;
    const sharedMixedTerrain = !!hoveredHex && hexSupportsMixedLandAndNaval(hoveredHex);
    if (hasMixedSelection && !sharedMixedTerrain) {
      const reason = 'Mixed land/naval stacks can only move to coastal hexes.';
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
    return {
      validForAll: invalid === undefined,
      showInvalidMarker: invalid !== undefined,
      invalidReason: invalid?.preview.invalidReason,
      slowestMovementRange,
      previews,
    };
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
 * Defines the `getHumanMarchPreviewDiagnostics` function shape (export function getHumanMarchPreviewDiagnostics(): HumanMarchPreviewDiagnostics & { routeCacheSize: number; resultCacheSize: number; throttleCacheSize:).

 * Purpose: Supports maintainability by documenting why `getHumanMarchPreviewDiagnostics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHumanMarchPreviewDiagnostics(): HumanMarchPreviewDiagnostics & {
  routeCacheSize: number;
  resultCacheSize: number;
  throttleCacheSize: number;
  activeSessionCount: number;
} {
  logTrace('gameActions getHumanMarchPreviewDiagnostics');
  return {
    ...previewDiagnostics,
    routeCacheSize: previewRouteCache.size,
    resultCacheSize: previewResultCache.size,
    throttleCacheSize: previewThrottleCache.size,
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
  previewThrottleCache.clear();
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
  throttle?: number;
}): void {
  logDebug('gameActions configureHumanMarchPreviewCacheLimitsForTests', { limits });
  maxPreviewRouteCacheEntries = limits?.route ?? DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES;
  maxPreviewResultCacheEntries = limits?.result ?? DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES;
  maxPreviewThrottleEntries = limits?.throttle ?? DEFAULT_MAX_PREVIEW_THROTTLE_ENTRIES;
}
