/**
 * MCP Tool 1: Pathfinding and Movement Planning (plan_route, check_distance).
 * Implements the tool API per the MCP tools spec; uses pathfinding module and game state.
 * All hex positions in tool responses are returned as [lat, lng]; H3 indices are never exposed.
 */

import { cellToLatLng } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import {
  getReachableHexes,
  partitionPathByTurn,
  getDistanceAndTurns,
  getMovementBudgetForUnit,
} from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { logDebug, logError } from '../logger';
import { buildNormalizedTerrainByH3 } from '../movementTerrain';
import {
  buildTerrainMapsFromHexRows,
  getLandMovementBlockReason,
  LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON,
} from '../game-actions/landMovementConstraints';
import {
  PLAN_ROUTE_WARNING_ALREADY_AT_REDIRECTED_HEX,
  PLAN_ROUTE_WARNING_LAND_REDIRECT,
} from '../navalMovementMessages';
import {
  nearestWaterHexTo,
} from './tool1PathfindingDistanceHelpers';
import {
  countArcticBlockedHexes,
  type PathfindingSessionStatefulCache,
} from './tool1PathfindingStateful';
import {
  buildAlreadyAtDestinationResult,
  buildPlanRouteSuccessResult,
  resolvePlanRouteRequestContext,
} from './tool1PathfindingPlanRouteHelpers';
import {
  buildBlockedEnemySetForUnit,
  planRouteNoPathHint,
  resolveRoutePathForUnit,
} from './tool1PathfindingRouteResolution';

/**
 * Converts an H3 index to [lat, lng] for tool responses. Uses the coordinate map when present;
 * falls back to cellToLatLng so we never expose raw H3 strings to the LLM.
 */
function h3ToLatLng(h3: string, latLngByH3: Map<string, LatLng>): LatLng {
  const ll = latLngByH3.get(h3);
  if (ll) return ll;
  const [lat, lng] = cellToLatLng(h3);
  return [lat, lng];
}

/** Coordinate pair [lat, lng] at the tool boundary. */
export type LatLng = [number, number];

export interface PathfindingSession {
  state: GameStateSnapshot;
  latLngByH3: Map<string, LatLng>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  hexSet: Set<string>;
  terrainByH3: Map<string, string>;
  rawTerrainByH3: Map<string, string>;
  terrainKindByH3: Map<string, string>;
  statefulCache: PathfindingSessionStatefulCache;
}

/**
 * Why this exists:
 *     Builds reusable pathfinding state once so callers can plan multiple routes without re-deriving map indexes.
 * When to use:
 *     Hover preview and other repeated route checks against the same snapshot.
 * What to expect:
 *     Returns an immutable-by-convention session object; callers should treat contained maps/sets as read-only.
 */
export function createPathfindingSession(
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): PathfindingSession {
  logDebug('tool1Pathfinding createPathfindingSession', {
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
  return {
    state,
    latLngByH3,
    resolveToH3,
    hexSet,
    terrainByH3,
    rawTerrainByH3,
    terrainKindByH3,
    statefulCache: {
      deadStateByDestination: new Map(),
    },
  };
}


/** Options for plan_route. */
export interface PlanRouteOptions {
  avoidEnemies?: boolean;
  maxTurns?: number;
}

/** Plan-route response (ok). When maxTurns truncates, reachable is false. */
export interface PlanRouteOk {
  status: 'ok';
  unitId: string;
  unitType: string;
  origin: LatLng;
  destination: LatLng;
  /** Exact [lat, lng] to use for this turn's movement order (path[0] end hex, or origin if already there). Copy into toXY. */
  orderToXY: LatLng;
  /** Exact H3 index for this turn's move (path[0] end hex, or origin if already there). */
  orderToH3: string;
  /**
   * Optional nearby alternatives when destination resolves to the current hex.
   * Helps callers retry with coordinates that produce movement at map resolution.
   */
  suggestedDestinations?: LatLng[];
  hexDistance: number;
  turnsRequired: number;
  path: {
    turn: number;
    hexes: LatLng[];
    movementSpent: number;
    movementBudget: number;
    endHex: LatLng;
  }[];
  warnings: string[];
  error?: null;
  reachable?: boolean;
}

/** Plan-route response (error). */
export interface PlanRouteError {
  status: 'error';
  error: string;
}

/** Check-distance response (ok). */
export interface CheckDistanceOk {
  status: 'ok';
  from: LatLng;
  to: LatLng;
  hexDistance: number;
  estimatedTurns: number;
  reachable: boolean;
}

/** Check-distance response (error). */
export interface CheckDistanceError {
  status: 'error';
  error: string;
}

/**
 * Returns a short hint (including a leading space) to append to the standard plan_route "no path"
 * error when destination terrain is known. Enables the LLM to retry with a valid destination
 * (e.g. land unit to land hex, naval to water). Returns the empty string if terrain is unknown.
 */
/**
 * Executes plan_route: returns optimal path for a unit to a destination, with per-turn segments.
 * Call with game state and coordinate map; snaps destination to nearest map hex.
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
 * Why this exists:
 *     Reuses precomputed pathfinding session data to reduce repeated setup overhead across many route calculations.
 * When to use:
 *     Hover preview and other batch planning flows that execute multiple route checks over the same snapshot.
 * What to expect:
 *     Returns the same route contract as `executePlanRoute`, using the provided session context.
 */
export function executePlanRouteWithSession(
  unitId: string,
  destination: LatLng,
  options: PlanRouteOptions | undefined,
  session: PathfindingSession
): PlanRouteOk | PlanRouteError {
  logDebug('tool1Pathfinding executePlanRouteWithSession', { unitId, destination: destination.join(','), options });
  try {
  const resolvedContext = resolvePlanRouteRequestContext({
    unitId,
    destination,
    state: session.state,
    hexSet: session.hexSet,
    resolveToH3: session.resolveToH3,
    logUnitNotFound: (missingUnitId) => {
      logError('tool1Pathfinding executePlanRoute: unit not found', missingUnitId);
    },
    logUnitOffMap: (offMapUnitId) => {
      logError('tool1Pathfinding executePlanRoute: unit not on map', offMapUnitId);
    },
  });
  if ('status' in resolvedContext) return resolvedContext;
  const { state, unit, originH3 } = resolvedContext;
  let destH3 = resolvedContext.destinationH3;
  const avoidEnemies = options?.avoidEnemies !== false;
  const blockedEnemySet = buildBlockedEnemySetForUnit(unit, session, avoidEnemies);
  const blockedEnemyCount = blockedEnemySet?.size ?? 0;
  const blocked = blockedEnemySet;
  const blockedArcticCount = countArcticBlockedHexes(blocked, session);
  const blockedTotalCount = blocked?.size ?? 0;
  logDebug('tool1Pathfinding executePlanRouteWithSession: blocking summary', {
    unitId,
    unitType: unit.unitType,
    unitPlayer: unit.player,
    originH3,
    destinationH3: destH3,
    avoidEnemiesRequested: options?.avoidEnemies ?? null,
    avoidEnemiesEffective: avoidEnemies,
    blockedEnemyCount,
    blockedArcticCount,
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
  });
  if ('status' in routeResolution) return routeResolution;
  const { passableFor, destinationH3, path, movementBudget, warnings, statefulStats } = routeResolution;
  destH3 = destinationH3;
  if (statefulStats && (unit.unitType === 'infantry' || unit.unitType === 'armor')) {
    logDebug('tool1Pathfinding executePlanRouteWithSession: stateful search summary', {
      unitId,
      originH3,
      destinationH3: destH3,
      expandedStateCount: statefulStats.expandedStateCount,
      rejectedConsecutiveSpecialCount: statefulStats.rejectedConsecutiveSpecialCount,
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
        getReachableHexes(origin, session.hexSet, session.terrainByH3, domain, localBlocked),
      h3ToLatLng: (h3) => h3ToLatLng(h3, session.latLngByH3),
    });
  }

  if (!path) {
    if (
      (unit.unitType === 'infantry' || unit.unitType === 'armor') &&
      (statefulStats?.rejectedConsecutiveSpecialCount ?? 0) > 0
    ) {
      return { status: 'error', error: LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON };
    }
    const destTerrainAtError = session.terrainByH3.get(destH3) ?? 'land';
    const hint = planRouteNoPathHint(passableFor, destTerrainAtError);
    logDebug('tool1Pathfinding executePlanRouteWithSession: no path', {
      unitId,
      unitType: unit.unitType,
      originH3,
      destinationH3: destH3,
      destinationTerrain: destTerrainAtError,
      passableFor,
      avoidEnemiesRequested: options?.avoidEnemies ?? null,
      avoidEnemiesEffective: avoidEnemies,
      blockedEnemyCount,
      blockedArcticCount,
      blockedTotalCount,
      statefulExpandedStateCount: statefulStats?.expandedStateCount ?? 0,
      statefulRejectedConsecutiveSpecialCount: statefulStats?.rejectedConsecutiveSpecialCount ?? 0,
      statefulDeadStateCacheHitCount: statefulStats?.deadStateCacheHitCount ?? 0,
      hint,
    });
    return { status: 'error', error: `No path exists - destination is impassable for this unit type or unreachable.${hint}` };
  }
  if (unit.unitType === 'infantry' || unit.unitType === 'armor') {
    const routeBlockReason = getLandMovementBlockReason({
      unitType: unit.unitType,
      originH3Index: originH3,
      destinationH3Index: destH3,
      terrainByH3: session.rawTerrainByH3,
      terrainKindByH3: session.terrainKindByH3,
      traversedH3Indices: path,
      isEmbarkedAtSea: false,
    });
    if (routeBlockReason) {
      return { status: 'error', error: routeBlockReason };
    }
  }

  return buildPlanRouteSuccessResult({
    unitId,
    unitType: unit.unitType,
    originH3,
    destinationH3: destH3,
    path,
    movementBudget,
    warnings,
    maxTurns: options?.maxTurns,
    h3ToLatLng: (h3) => h3ToLatLng(h3, session.latLngByH3),
    partitionPathByTurn,
  });
  } catch (err) {
    logError('tool1Pathfinding executePlanRoute: exception', {
      unitId,
      destination,
      error: String(err),
    });
    return { status: 'error', error: 'Route planning failed due to an internal error. Please retry.' };
  }
}

/**
 * Executes check_distance: returns hex distance and estimated turns between two hexes for a unit type.
 */
export function executeCheckDistance(
  from: LatLng,
  to: LatLng,
  unitType: string,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): CheckDistanceOk | CheckDistanceError {
  logDebug('tool1Pathfinding executeCheckDistance', { from: from.join(','), to: to.join(','), unitType });
  const hexList = state.hexes.map((h) => h.h3Index);
  const hexSet = new Set(hexList);
  const terrainByH3 = buildNormalizedTerrainByH3(state.hexes);

  const fromH3 = resolveToH3(from[0], from[1]);
  let toH3 = resolveToH3(to[0], to[1]);
  if (!fromH3 || !hexSet.has(fromH3) || !toH3 || !hexSet.has(toH3)) {
    return { status: 'error', error: 'Invalid hex position' };
  }

  const passableFor: PassableDomain = unitType === 'naval' ? 'water' : 'land';
  const movementBudget = getMovementBudgetForUnit(unitType);
  const toTerrain = terrainByH3.get(toH3) ?? 'land';
  if (unitType === 'naval' && toTerrain === 'land') {
    const waterHex = nearestWaterHexTo(toH3, hexSet, terrainByH3);
    if (waterHex) toH3 = waterHex;
  }

  const result = getDistanceAndTurns(fromH3, toH3, hexSet, terrainByH3, passableFor, movementBudget, undefined);
  if (!result) {
    return {
      status: 'ok',
      from: h3ToLatLng(fromH3, latLngByH3),
      to: h3ToLatLng(toH3, latLngByH3),
      hexDistance: 0,
      estimatedTurns: 0,
      reachable: false,
    };
  }

  const fromLl = h3ToLatLng(fromH3, latLngByH3);
  const toLl = h3ToLatLng(toH3, latLngByH3);
  return {
    status: 'ok',
    from: fromLl,
    to: toLl,
    hexDistance: result.hexDistance,
    estimatedTurns: result.estimatedTurns,
    reachable: true,
  };
}

/** Tool names for Tool 1. */
export const TOOL1_NAMES = ['plan_route', 'check_distance'] as const;

/**
 * Dispatcher: given tool name and parsed arguments, runs the corresponding tool and returns a JSON-serializable response.
 * Used by the OpenRouter tool-calling loop. Every response has status and error (null when ok).
 */
export function executeTool1(
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('tool1Pathfinding executeTool1', { toolName, stateTurn: state.turnNumber });
  try {
    if (toolName === 'plan_route') {
      const a = args as { unitId?: string; destination?: unknown; options?: PlanRouteOptions };
      if (typeof a?.unitId !== 'string') {
        return { status: 'error', error: 'plan_route requires unitId (string)' };
      }
      const dest = Array.isArray(a.destination) && a.destination.length >= 2 && a.destination.every((n) => typeof n === 'number')
        ? [Number(a.destination[0]), Number(a.destination[1])] as LatLng
        : undefined;
      if (!dest) {
        return { status: 'error', error: 'plan_route requires destination as [lat, lng]' };
      }
      const result = executePlanRoute(a.unitId, dest, a.options, state, latLngByH3, resolveToH3);
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
        return { status: 'error', error: 'check_distance requires from [lat,lng], to [lat,lng], and unitType (string)' };
      }
      const result = executeCheckDistance(from, to, a.unitType, state, latLngByH3, resolveToH3);
      return result as unknown as Record<string, unknown>;
    }
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  } catch (err) {
    logError('tool1Pathfinding executeTool1: exception', toolName, err);
    return { status: 'error', error: String(err) };
  }
}
