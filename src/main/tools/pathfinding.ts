/**
 * Pathfinding and movement planning (`plan_route`, `check_distance`).
 * Implements the tool API per the MCP tools spec; uses pathfinding module and game state.
 * Internal geometry uses lat/lng tuples after the OpenRouter layer decodes briefing hex codes; outbound tool payloads to the model are rewritten to hex codes by `encodeOpenRouterToolResultForLlm`.
 */

import type { GameStateSnapshot } from '../gameDb';
import {
  getNavalStrategicDistanceAndTurns,
  navalLookupForHexState,
} from '../navalStrategicPath';
import { navalMayOccupyHex } from '../../shared/navalStrategicEdges';
import {
  getReachableHexes,
  partitionPathByTurn,
  getDistanceAndTurns,
} from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { logDebug, logError } from '../logger';
import { strategicRangeOnState } from '../weather/weatherMatch';
import { buildNormalizedTerrainByH3 } from '../movementTerrain';
import {
  buildTerrainMapsFromHexRows,
} from '../gameActions/landMovementConstraints';
import {
  PLAN_ROUTE_WARNING_ALREADY_AT_REDIRECTED_HEX,
  PLAN_ROUTE_WARNING_LAND_REDIRECT,
} from '../navalMovementMessages';
import { getRes1LandMassByH3 } from '../terrainClassificationCache';
import type { LandMassByH3 } from '../../shared/landTraversalRes1';
import {
  nearestWaterHexTo,
} from './pathfindingDistanceHelpers';
import {
  type PathfindingSessionStatefulCache,
} from './pathfindingStateful';
import {
  buildAlreadyAtDestinationResult,
  buildPlanRouteSuccessResult,
  resolvePlanRouteRequestContext,
} from './pathfindingPlanRouteHelpers';
import {
  buildBlockedEnemySetForUnit,
  planRouteNoPathHint,
  resolveRoutePathForUnit,
} from './pathfindingRouteResolution';
import { executeTacticalCheckDistance, executeTacticalPlanRoute } from './tacticalPathfinding';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { h3ToLatLng, type LatLng } from './h3LatLng';
import {
  rememberPlanningPhaseSession,
  reusePlanningPhaseSession,
} from './pathfindingSessionCache';

/**
 * Re-exports shared lat/lng tuple type for existing pathfinding LatLng importers.
 *
 * Purpose: Preserves the historical import path after `LatLng` moved to `h3LatLng.ts`.
 * When to use: Prefer the h3LatLng module for new code; keep this re-export for downstream tools.
 * Expected outcome: Same `LatLng` alias as `h3LatLng`.
 * Exceptions: None.
 */
export type { LatLng } from './h3LatLng';

/**
 * Documents the `PathfindingSession` interface as a named contract surface (export interface PathfindingSession).

 * Purpose: Supports maintainability by documenting why `PathfindingSession` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PathfindingSession {
    /**
   * Specifies the contract for the `state` member (state: GameStateSnapshot;).

   * Contract: Describes stable behavior for callers of `state` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
state: GameStateSnapshot;
    /**
   * Specifies the contract for the `latLngByH3` member (latLngByH3: Map<string, LatLng>;).

   * Contract: Describes stable behavior for callers of `latLngByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
latLngByH3: Map<string, LatLng>;
    /**
   * Specifies the contract for the `resolveToH3` member (resolveToH3: (lat: number, lng: number) => string | undefined;).

   * Contract: Describes stable behavior for callers of `resolveToH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resolveToH3: (lat: number, lng: number) => string | undefined;
    /**
   * Specifies the contract for the `hexSet` member (hexSet: Set<string>;).

   * Contract: Describes stable behavior for callers of `hexSet` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexSet: Set<string>;
    /**
   * Specifies the contract for the `terrainByH3` member (terrainByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `terrainByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainByH3: Map<string, string>;
    /**
   * Specifies the contract for the `rawTerrainByH3` member (rawTerrainByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `rawTerrainByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rawTerrainByH3: Map<string, string>;
    /**
   * Specifies the contract for the `terrainKindByH3` member (terrainKindByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `terrainKindByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainKindByH3: Map<string, string>;
    /**
   * Specifies the contract for the `landMass` member (landMass: LandMassByH3;).

   * Contract: Precomputed res-1 continent/island membership for land-unit routing in this session.
   * When to use: Land-domain pathfinding and reachability in Tool 1 and human march preview.
   * Expected outcome: Complete map keyed by res-1 h3 index, loaded from terrain cache at session creation.
   * Exceptions: None.
   */
landMass: LandMassByH3;
    /**
   * Specifies the contract for the `statefulCache` member (statefulCache: PathfindingSessionStatefulCache;).

   * Contract: Describes stable behavior for callers of `statefulCache` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
statefulCache: PathfindingSessionStatefulCache;
}

/**
 * Defines the `createPathfindingSession` function shape (export function createPathfindingSession( state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: number, lng: number) => string).

 * Purpose: Builds hex/terrain maps once per planning-phase perspective when the board is unchanged.
 * When to use: Tool 1, standing-order assign, and human march preview.
 * Expected outcome: New session, or the cached planning-phase session for human/opponent when no land-mass override is passed.
 * Exceptions: None.
 */
export function createPathfindingSession(
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  landMassOverride?: LandMassByH3
): PathfindingSession {
  if (landMassOverride === undefined) {
    const reused = reusePlanningPhaseSession<PathfindingSession>(state);
    if (reused) return reused;
  }
  logDebug('pathfinding createPathfindingSession', {
    turnNumber: state.turnNumber,
    hexCount: state.hexes.length,
    unitCount: state.units.length,
    playerPerspective: state.playerPerspective ?? null,
    fogOfWarEnabled: state.fogOfWarEnabled ?? null,
  });
  const hexList = state.hexes.map((h) => h.h3Index);
  const hexSet = new Set(hexList);
  const terrainByH3 = buildNormalizedTerrainByH3(state.hexes);
  const { terrainByH3: rawTerrainByH3, terrainKindByH3 } = buildTerrainMapsFromHexRows(state.hexes);
  const landMass = landMassOverride ?? getRes1LandMassByH3();
  const session: PathfindingSession = {
    state,
    latLngByH3,
    resolveToH3,
    hexSet,
    terrainByH3,
    rawTerrainByH3,
    terrainKindByH3,
    landMass,
    statefulCache: {
      deadStateByDestination: new Map(),
    },
  };
  if (landMassOverride === undefined) {
    rememberPlanningPhaseSession(state, session);
  }
  return session;
}


/**
 * Documents the `PlanRouteOptions` interface as a named contract surface (export interface PlanRouteOptions).

 * Purpose: Supports maintainability by documenting why `PlanRouteOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PlanRouteOptions {
    /**
   * Specifies the contract for the `avoidEnemies` member (avoidEnemies?: boolean;).

   * Contract: Describes stable behavior for callers of `avoidEnemies` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
avoidEnemies?: boolean;
    /**
   * Specifies the contract for the `maxTurns` member (maxTurns?: number;).

   * Contract: Describes stable behavior for callers of `maxTurns` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
maxTurns?: number;
}

/**
 * Documents the `PlanRouteOk` interface as a named contract surface (export interface PlanRouteOk).

 * Purpose: Supports maintainability by documenting why `PlanRouteOk` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PlanRouteOk {
    /**
   * Specifies the contract for the `status` member (status: 'ok';).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: 'ok';
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: string;
    /**
   * Specifies the contract for the `origin` member (origin: LatLng;).

   * Contract: Describes stable behavior for callers of `origin` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
origin: LatLng;
    /**
   * Specifies the contract for the `destination` member (destination: LatLng;).

   * Contract: Describes stable behavior for callers of `destination` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destination: LatLng;
    /**
   * Specifies the contract for the `orderToXY` member (orderToXY: LatLng;).

   * Contract: Describes stable behavior for callers of `orderToXY` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
orderToXY: LatLng;
    /**
   * Specifies the contract for the `orderToH3` member (orderToH3: string;).

   * Contract: Describes stable behavior for callers of `orderToH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
orderToH3: string;
    /**
   * Specifies the contract for the `suggestedDestinations` member (suggestedDestinations?: LatLng[];).

   * Contract: Describes stable behavior for callers of `suggestedDestinations` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
suggestedDestinations?: LatLng[];
    /**
   * Specifies the contract for the `hexDistance` member (hexDistance: number;).

   * Contract: Describes stable behavior for callers of `hexDistance` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexDistance: number;
    /**
   * Specifies the contract for the `turnsRequired` member (turnsRequired: number;).

   * Contract: Describes stable behavior for callers of `turnsRequired` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnsRequired: number;
    /**
   * Specifies the contract for the `path` member (path: { turn: number; hexes: LatLng[]; movementSpent: number; movementBudget: number; endHex: LatLng; }[];).

   * Contract: Describes stable behavior for callers of `path` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
path: {
    turn: number;
    hexes: LatLng[];
    movementSpent: number;
    movementBudget: number;
    endHex: LatLng;
  }[];
    /**
   * Specifies the contract for the `warnings` member (warnings: string[];).

   * Contract: Describes stable behavior for callers of `warnings` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
warnings: string[];
    /**
   * Specifies the contract for the `error` member (error?: null;).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error?: null;
    /**
   * Specifies the contract for the `reachable` member (reachable?: boolean;).

   * Contract: Describes stable behavior for callers of `reachable` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reachable?: boolean;
}

/**
 * Documents the `PlanRouteError` interface as a named contract surface (export interface PlanRouteError).

 * Purpose: Supports maintainability by documenting why `PlanRouteError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PlanRouteError {
    /**
   * Specifies the contract for the `status` member (status: 'error';).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: 'error';
    /**
   * Specifies the contract for the `error` member (error: string;).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error: string;
}

/**
 * Documents the `CheckDistanceOk` interface as a named contract surface (export interface CheckDistanceOk).

 * Purpose: Supports maintainability by documenting why `CheckDistanceOk` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface CheckDistanceOk {
    /**
   * Specifies the contract for the `status` member (status: 'ok';).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: 'ok';
    /**
   * Specifies the contract for the `from` member (from: LatLng;).

   * Contract: Describes stable behavior for callers of `from` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
from: LatLng;
    /**
   * Specifies the contract for the `to` member (to: LatLng;).

   * Contract: Describes stable behavior for callers of `to` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
to: LatLng;
    /**
   * Specifies the contract for the `hexDistance` member (hexDistance: number;).

   * Contract: Describes stable behavior for callers of `hexDistance` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexDistance: number;
    /**
   * Specifies the contract for the `estimatedTurns` member (estimatedTurns: number;).

   * Contract: Describes stable behavior for callers of `estimatedTurns` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
estimatedTurns: number;
    /**
   * Specifies the contract for the `reachable` member (reachable: boolean;).

   * Contract: Describes stable behavior for callers of `reachable` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reachable: boolean;
}

/**
 * Documents the `CheckDistanceError` interface as a named contract surface (export interface CheckDistanceError).

 * Purpose: Supports maintainability by documenting why `CheckDistanceError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface CheckDistanceError {
    /**
   * Specifies the contract for the `status` member (status: 'error';).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: 'error';
    /**
   * Specifies the contract for the `error` member (error: string;).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error: string;
}

/**
 * Defines the `executePlanRoute` function shape (export function executePlanRoute( unitId: string, destination: LatLng, options: PlanRouteOptions | undefined, state: GameStateSnapshot, latLngByH).

 * Purpose: Supports maintainability by documenting why `executePlanRoute` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executePlanRoute(
  unitId: string,
  destination: LatLng,
  options: PlanRouteOptions | undefined,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): PlanRouteOk | PlanRouteError {
  const session = createPathfindingSession(state, latLngByH3, resolveToH3);
  return executePlanRouteWithSession(unitId, destination, options, session);
}

/**
 * Defines the `executePlanRouteWithSession` function shape (export function executePlanRouteWithSession( unitId: string, destination: LatLng, options: PlanRouteOptions | undefined, session: PathfindingSession).

 * Purpose: Supports maintainability by documenting why `executePlanRouteWithSession` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executePlanRouteWithSession(
  unitId: string,
  destination: LatLng,
  options: PlanRouteOptions | undefined,
  session: PathfindingSession
): PlanRouteOk | PlanRouteError {
  logDebug('pathfinding executePlanRouteWithSession', { unitId, destination: destination.join(','), options });
  try {
  const resolvedContext = resolvePlanRouteRequestContext({
    unitId,
    destination,
    state: session.state,
    hexSet: session.hexSet,
    resolveToH3: session.resolveToH3,
    logUnitNotFound: (missingUnitId) => {
      logDebug('pathfinding executePlanRoute: unit not found (invalid id or not in snapshot)', { missingUnitId });
    },
    logUnitOffMap: (offMapUnitId) => {
      logError('pathfinding executePlanRoute: unit not on map', offMapUnitId);
    },
  });
  if ('status' in resolvedContext) return resolvedContext;
  const { state, unit, originH3 } = resolvedContext;
  let destH3 = resolvedContext.destinationH3;
  const avoidEnemies = options?.avoidEnemies !== false;
  const blockedEnemySet = buildBlockedEnemySetForUnit(unit, session, avoidEnemies);
  const blockedEnemyCount = blockedEnemySet?.size ?? 0;
  const blocked = blockedEnemySet;
  const blockedTotalCount = blocked?.size ?? 0;
  logDebug('pathfinding executePlanRouteWithSession: blocking summary', {
    unitId,
    unitType: unit.unitType,
    unitPlayer: unit.player,
    originH3,
    destinationH3: destH3,
    avoidEnemiesRequested: options?.avoidEnemies ?? null,
    avoidEnemiesEffective: avoidEnemies,
    blockedEnemyCount,
    blockedTotalCount,
    statefulDestinationCacheCount: session.statefulCache.deadStateByDestination.size,
    statePerspective: state.playerPerspective ?? null,
    fogOfWarEnabled: state.fogOfWarEnabled ?? null,
  });
  const routeResolution = resolveRoutePathForUnit({
    unitType: unit.unitType,
    originH3,
    destinationH3: destH3,
    hexSet: session.hexSet,
    terrainByH3: session.terrainByH3,
    session,
    blocked,
    weatherTags: unit.weatherTags,
  });
  if ('status' in routeResolution) return routeResolution;
  const { passableFor, destinationH3, path, movementBudget, firstTurnMovementBudget, warnings, statefulStats } =
    routeResolution;
  destH3 = destinationH3;
  if (statefulStats && (unit.unitType === 'infantry' || unit.unitType === 'armor')) {
    logDebug('pathfinding executePlanRouteWithSession: stateful search summary', {
      unitId,
      originH3,
      destinationH3: destH3,
      expandedStateCount: statefulStats.expandedStateCount,
      deadStateCacheHitCount: statefulStats.deadStateCacheHitCount,
      destinationCacheSize: session.statefulCache.deadStateByDestination.get(destH3)?.deadStateSet.size ?? 0,
      destinationCacheCount: session.statefulCache.deadStateByDestination.size,
    });
  }

  if (originH3 === destH3) {
    return buildAlreadyAtDestinationResult({
      unitId,
      unitType: unit.unitType,
      originH3,
      destinationH3: destH3,
      passableFor,
      blocked,
      warnings,
      warningLandRedirect: PLAN_ROUTE_WARNING_LAND_REDIRECT,
      warningAlreadyAtRedirectedHex: PLAN_ROUTE_WARNING_ALREADY_AT_REDIRECTED_HEX,
      defaultAlreadyAtWarning: 'Destination resolves to the unit\'s current hex at map resolution; choose a more distant coordinate to move.',
      getReachableHexesForDomain: (origin, domain, localBlocked) =>
        getReachableHexes(
          origin,
          session.hexSet,
          session.terrainByH3,
          domain,
          localBlocked,
          domain === 'land' ? session.landMass : undefined
        ),
      h3ToLatLng: (h3) => h3ToLatLng(h3, session.latLngByH3, 'cellCenter'),
    });
  }

  if (!path) {
    const hint = planRouteNoPathHint(passableFor, destH3, session.landMass, session.terrainByH3.get(destH3));
    logDebug('pathfinding executePlanRouteWithSession: no path', {
      unitId,
      unitType: unit.unitType,
      originH3,
      destinationH3: destH3,
      passableFor,
      avoidEnemiesRequested: options?.avoidEnemies ?? null,
      avoidEnemiesEffective: avoidEnemies,
      blockedEnemyCount,
      blockedTotalCount,
      statefulExpandedStateCount: statefulStats?.expandedStateCount ?? 0,
      statefulDeadStateCacheHitCount: statefulStats?.deadStateCacheHitCount ?? 0,
      hint,
    });
    return { status: 'error', error: `No path exists - destination is impassable for this unit type or unreachable.${hint}` };
  }

  return buildPlanRouteSuccessResult({
    unitId,
    unitType: unit.unitType,
    originH3,
    destinationH3: destH3,
    path,
    movementBudget,
    firstTurnMovementBudget,
    warnings,
    maxTurns: options?.maxTurns,
    h3ToLatLng: (h3) => h3ToLatLng(h3, session.latLngByH3, 'cellCenter'),
    partitionPathByTurn,
  });
  } catch (err) {
    logError('pathfinding executePlanRoute: exception', {
      unitId,
      destination,
      error: String(err),
    });
    return { status: 'error', error: 'Route planning failed due to an internal error. Please retry.' };
  }
}

/**
 * Defines the `executeCheckDistance` function shape (export function executeCheckDistance( from: LatLng, to: LatLng, unitType: string, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, r).

 * Purpose: Supports maintainability by documenting why `executeCheckDistance` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executeCheckDistance(
  from: LatLng,
  to: LatLng,
  unitType: string,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  pathfindingSession?: PathfindingSession
): CheckDistanceOk | CheckDistanceError {
  logDebug('pathfinding executeCheckDistance', {
    from: from.join(','),
    to: to.join(','),
    unitType,
    hasPathfindingSession: Boolean(pathfindingSession),
  });
  const hexList = state.hexes.map((h) => h.h3Index);
  const hexSet = new Set(hexList);
  const terrainByH3 = buildNormalizedTerrainByH3(state.hexes);

  const fromH3 = resolveToH3(from[0], from[1]);
  let toH3 = resolveToH3(to[0], to[1]);
  if (!fromH3 || !hexSet.has(fromH3) || !toH3 || !hexSet.has(toH3)) {
    return { status: 'error', error: 'Invalid hex position' };
  }

  const passableFor: PassableDomain = unitType === 'naval' ? 'water' : 'land';
  const occupant = state.units.find((unit) => unit.h3Index === fromH3 && unit.unitType === unitType);
  const movementBudget = strategicRangeOnState(
    { unitType, h3Index: fromH3, weatherTags: occupant?.weatherTags },
    state
  );
  const navalLookup =
    unitType === 'naval'
      ? navalLookupForHexState(
          pathfindingSession ?? state,
          state.hexes,
          state.res1Infrastructure
        )
      : undefined;
  if (unitType === 'naval' && navalLookup) {
    const destAttrs = navalLookup(toH3);
    if (destAttrs && !navalMayOccupyHex(destAttrs)) {
      const waterHex = nearestWaterHexTo(toH3, hexSet, terrainByH3);
      if (waterHex) toH3 = waterHex;
    }
    const navalDist = getNavalStrategicDistanceAndTurns({
      originH3: fromH3,
      destinationH3: toH3,
      lookup: navalLookup,
      movementBudget,
    });
    if (!navalDist) {
      return {
        status: 'ok',
        from: h3ToLatLng(fromH3, latLngByH3, 'cellCenter'),
        to: h3ToLatLng(toH3, latLngByH3, 'cellCenter'),
        hexDistance: 0,
        estimatedTurns: 0,
        reachable: false,
      };
    }
    return {
      status: 'ok',
      from: h3ToLatLng(fromH3, latLngByH3, 'cellCenter'),
      to: h3ToLatLng(toH3, latLngByH3, 'cellCenter'),
      hexDistance: navalDist.hexDistance,
      estimatedTurns: navalDist.estimatedTurns,
      reachable: true,
    };
  }

  const landMass = passableFor === 'land' ? getRes1LandMassByH3() : undefined;
  const result = getDistanceAndTurns(
    fromH3,
    toH3,
    hexSet,
    terrainByH3,
    passableFor,
    movementBudget,
    undefined,
    landMass
  );
  if (!result) {
    return {
      status: 'ok',
      from: h3ToLatLng(fromH3, latLngByH3, 'cellCenter'),
      to: h3ToLatLng(toH3, latLngByH3, 'cellCenter'),
      hexDistance: 0,
      estimatedTurns: 0,
      reachable: false,
    };
  }

  const fromLl = h3ToLatLng(fromH3, latLngByH3, 'cellCenter');
  const toLl = h3ToLatLng(toH3, latLngByH3, 'cellCenter');
  return {
    status: 'ok',
    from: fromLl,
    to: toLl,
    hexDistance: result.hexDistance,
    estimatedTurns: result.estimatedTurns,
    reachable: true,
  };
}

/**
 * Documents the module-scope binding `PATHFINDING_TOOL_NAMES` (PATHFINDING_TOOL_NAMES).

 * Purpose: Supports maintainability by documenting why `PATHFINDING_TOOL_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PATHFINDING_TOOL_NAMES = ['plan_route', 'check_distance'] as const;

/**
 * Defines the `executePathfinding` function shape (export function executePathfinding( toolName: string, args: unknown, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: numb).

 * Purpose: Supports maintainability by documenting why `executePathfinding` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executePathfinding(
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  pathfindingSession?: PathfindingSession,
  /**
   * When set, plan_route / check_distance use the tactical res4 march planner (Ready truncation) instead of strategic land-mass pathfinding.
   */
  tacticalBattle?: TacticalBattleSnapshot
): Record<string, unknown> {
  logDebug('pathfinding executePathfinding', {
    toolName,
    stateTurn: state.turnNumber,
    tactical: Boolean(tacticalBattle),
  });
  try {
    if (toolName === 'plan_route') {
      const a = args as { unitId?: string; destination?: unknown; options?: PlanRouteOptions };
      if (typeof a?.unitId !== 'string') {
        return { status: 'error', error: 'plan_route requires unitId (string)' };
      }
      const matchedUnit = state.units.find((u) => u.id === a.unitId);
      if (matchedUnit?.unitType === 'air') {
        return { status: 'error', error: 'Air units use air strikes, not hex movement. Use the air_strike order instead of plan_route.' };
      }
      const dest = Array.isArray(a.destination) && a.destination.length >= 2 && a.destination.every((n) => typeof n === 'number')
        ? [Number(a.destination[0]), Number(a.destination[1])] as LatLng
        : undefined;
      if (!dest) {
        return {
          status: 'error',
          error:
            'plan_route requires destination as a two-character briefing hex code from the operational map (see Available Tools schema); arguments are decoded before routing.',
        };
      }
      if (tacticalBattle) {
        return executeTacticalPlanRoute(
          a.unitId,
          dest,
          a.options,
          tacticalBattle,
          state,
          latLngByH3,
          resolveToH3
        ) as unknown as Record<string, unknown>;
      }
      const result = pathfindingSession
        ? executePlanRouteWithSession(a.unitId, dest, a.options, pathfindingSession)
        : executePlanRoute(a.unitId, dest, a.options, state, latLngByH3, resolveToH3);
      return result as unknown as Record<string, unknown>;
    }
    if (toolName === 'check_distance') {
      const a = args as { from?: unknown; to?: unknown; unitType?: string };
      const from = Array.isArray(a?.from) && a.from.length >= 2 && a.from.every((n) => typeof n === 'number')
        ? [Number(a.from[0]), Number(a.from[1])] as LatLng
        : undefined;
      const to = Array.isArray(a?.to) && a.to.length >= 2 && a.to.every((n) => typeof n === 'number')
        ? [Number(a.to[0]), Number(a.to[1])] as LatLng
        : undefined;
      if (!from || !to || typeof a?.unitType !== 'string') {
        return {
          status: 'error',
          error:
            'check_distance requires from, to, and unitType. from and to must each be a two-character briefing hex code (decoded to map cells before this tool runs).',
        };
      }
      if (tacticalBattle) {
        return executeTacticalCheckDistance(
          from,
          to,
          a.unitType,
          tacticalBattle,
          latLngByH3,
          resolveToH3
        ) as unknown as Record<string, unknown>;
      }
      const result = executeCheckDistance(
        from,
        to,
        a.unitType,
        state,
        latLngByH3,
        resolveToH3,
        pathfindingSession
      );
      return result as unknown as Record<string, unknown>;
    }
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  } catch (err) {
    logError('pathfinding executePathfinding: exception', toolName, err);
    return { status: 'error', error: String(err) };
  }
}
