/**
 * MCP Tool 1: Pathfinding and Movement Planning (plan_route, check_distance).
 * Implements the tool API per the MCP tools spec; uses pathfinding module and game state.
 * All hex positions in tool responses are returned as [lat, lng]; H3 indices are never exposed.
 */

import { cellToLatLng, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import {
  findPath,
  getReachableHexes,
  partitionPathByTurn,
  getDistanceAndTurns,
  getMovementBudgetForUnit,
  terrainIsPassableForDomain,
} from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { logDebug, logError } from '../logger';

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

/**
 * Returns the water hex reachable from originH3 that is closest to refLandH3 (by grid distance), or undefined if none.
 * Used so naval plan_route can redirect a land destination to the nearest reachable water for approach.
 */
function nearestReachableWaterHexTo(
  originH3: string,
  refLandH3: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  blocked?: Set<string>
): string | undefined {
  const reachableWater = getReachableHexes(originH3, hexSet, terrainByH3, 'water', blocked);
  let best: string | undefined;
  let bestDist = Infinity;
  for (const h3 of reachableWater) {
    try {
      const d = gridDistance(refLandH3, h3);
      if (d < bestDist) {
        bestDist = d;
        best = h3;
      }
    } catch {
      continue;
    }
  }
  return best;
}

/**
 * Returns the water hex on the map that is closest to refH3 (by grid distance), or undefined if none.
 * Used by check_distance for naval→land to report distance to nearest water to that position.
 */
function nearestWaterHexTo(refH3: string, hexSet: Set<string>, terrainByH3: Map<string, string>): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const h3 of hexSet) {
    if (!terrainIsPassableForDomain(terrainByH3.get(h3), 'water')) continue;
    try {
      const d = gridDistance(refH3, h3);
      if (d < bestDist) {
        bestDist = d;
        best = h3;
      }
    } catch {
      continue;
    }
  }
  return best;
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
function planRouteNoPathHint(passableFor: PassableDomain, destTerrain: string): string {
  if (passableFor === 'land' && destTerrain === 'water') {
    return ' Destination is water; land units cannot move there. Route this unit to a land or coastal hex (e.g. an enemy land unit\'s position).';
  }
  if (passableFor === 'land' && terrainIsPassableForDomain(destTerrain, 'land')) {
    return ' No path found (destination may be on a different land mass).';
  }
  if (passableFor === 'water' && destTerrain === 'land') {
    return ' Destination is land; naval units cannot move onto pure land. Use a land unit\'s position as destination to get a route to the nearest water or coastal hex.';
  }
  if (passableFor === 'water' && terrainIsPassableForDomain(destTerrain, 'water')) {
    return ' No path to that water/coastal hex (may be in a different water body).';
  }
  return '';
}

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
  logDebug('tool1Pathfinding executePlanRoute', { unitId, destination: destination.join(','), options });
  const hexList = state.hexes.map((h) => h.h3Index);
  const hexSet = new Set(hexList);
  const terrainByH3 = new Map(state.hexes.map((h) => [h.h3Index, h.terrain]));

  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) {
    logError('tool1Pathfinding executePlanRoute: unit not found', unitId);
    return { status: 'error', error: `Unit not found: ${unitId}` };
  }
  if (!hexSet.has(unit.h3Index)) {
    logError('tool1Pathfinding executePlanRoute: unit not on map', unitId);
    return { status: 'error', error: `Unit not found: ${unitId}` };
  }

  let destH3 = resolveToH3(destination[0], destination[1]);
  if (!destH3) {
    return { status: 'error', error: 'No path exists - destination could not be resolved to a map hex.' };
  }
  if (!hexSet.has(destH3)) {
    return { status: 'error', error: 'No path exists - destination is not on the map.' };
  }

  const originH3 = unit.h3Index;
  const passableFor: PassableDomain = unit.unitType === 'naval' ? 'water' : 'land';
  const avoidEnemies = options?.avoidEnemies !== false;
  let blocked: Set<string> | undefined;
  if (avoidEnemies) {
    blocked = new Set(state.units.filter((u) => u.player !== unit.player).map((u) => u.h3Index));
    blocked.delete(originH3);
  }
  const destTerrain = terrainByH3.get(destH3) ?? 'land';
  let navalRedirectedToWater = false;
  if (unit.unitType === 'naval' && destTerrain === 'land') {
    const waterHex = nearestReachableWaterHexTo(originH3, destH3, hexSet, terrainByH3, blocked);
    if (waterHex) {
      destH3 = waterHex;
      navalRedirectedToWater = true;
    }
  }
  if (blocked) blocked.delete(destH3);

  const movementBudget = getMovementBudgetForUnit(unit.unitType);

  if (originH3 === destH3) {
    const originLl = h3ToLatLng(originH3, latLngByH3);
    const nearbyAlternatives = Array.from(getReachableHexes(originH3, hexSet, terrainByH3, passableFor, blocked))
      .filter((h3) => h3 !== originH3)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 6)
      .map((h3) => h3ToLatLng(h3, latLngByH3));
    const warningsWhenAlreadyThere: string[] = navalRedirectedToWater
      ? ['Unit is already at the nearest water/coastal hex to that land position; no movement this turn.']
      : ['Destination resolves to the unit\'s current hex at map resolution; choose a more distant coordinate to move.'];
    return {
      status: 'ok',
      unitId,
      unitType: unit.unitType,
      origin: originLl,
      destination: h3ToLatLng(destH3, latLngByH3),
      orderToXY: originLl,
      orderToH3: originH3,
      suggestedDestinations: nearbyAlternatives,
      hexDistance: 0,
      turnsRequired: 0,
      path: [],
      warnings: warningsWhenAlreadyThere,
    };
  }

  let path = findPath(originH3, destH3, hexSet, terrainByH3, passableFor, blocked);
  const warnings: string[] = [];
  if (navalRedirectedToWater) {
    warnings.push(
      'Destination was land; route is to the nearest reachable water/coastal hex to that position (naval cannot move onto pure land).',
    );
  }
  if (!path && blocked) {
    path = findPath(originH3, destH3, hexSet, terrainByH3, passableFor, undefined);
    if (path) warnings.push('Route passes through enemy-occupied hexes - avoidance was not possible.');
  }
  if (!path && unit.unitType === 'naval') {
    const fallbackWater = nearestReachableWaterHexTo(originH3, destH3, hexSet, terrainByH3, blocked);
    if (fallbackWater && fallbackWater !== destH3) {
      destH3 = fallbackWater;
      path = findPath(originH3, destH3, hexSet, terrainByH3, passableFor, blocked);
      if (!path && blocked) path = findPath(originH3, destH3, hexSet, terrainByH3, passableFor, undefined);
      if (path) {
        warnings.push(
          'Requested destination is in a different water body; route is to the nearest reachable water/coastal hex toward it.',
        );
      }
    }
  }
  if (!path) {
    const destTerrainAtError = terrainByH3.get(destH3) ?? 'land';
    const hint = planRouteNoPathHint(passableFor, destTerrainAtError);
    return { status: 'error', error: `No path exists - destination is impassable for this unit type or unreachable.${hint}` };
  }

  let turnsRequired = 0;
  const segments = partitionPathByTurn(path, movementBudget);
  turnsRequired = segments.length;

  const maxTurns = options?.maxTurns;
  if (maxTurns != null && turnsRequired > maxTurns) {
    warnings.push(`Route truncated at maxTurns limit - destination not reached in ${maxTurns} turns`);
    const stepsAllowed = maxTurns * movementBudget;
    const truncatedPath = path.slice(0, Math.min(path.length, stepsAllowed + 1));
    const truncatedSegments = partitionPathByTurn(truncatedPath, movementBudget);
    turnsRequired = maxTurns;
    const pathForResponse = truncatedSegments.map((seg) => ({
      turn: seg.turn,
      hexes: seg.hexes.map((h) => h3ToLatLng(h, latLngByH3)),
      movementSpent: seg.movementSpent,
      movementBudget: seg.movementBudget,
      endHex: h3ToLatLng(seg.endHex, latLngByH3),
    }));
    const originLl = h3ToLatLng(originH3, latLngByH3);
    const destLl = h3ToLatLng(destH3, latLngByH3);
    const orderToXY = pathForResponse.length > 0 ? pathForResponse[0]!.endHex : originLl;
    return {
      status: 'ok',
      unitId,
      unitType: unit.unitType,
      origin: originLl,
      destination: destLl,
      orderToXY,
      orderToH3: truncatedSegments.length > 0 ? truncatedSegments[0]!.endHex : originH3,
      hexDistance: truncatedPath.length - 1,
      turnsRequired,
      path: pathForResponse,
      warnings,
      error: null,
      reachable: false,
    };
  }

  const pathForResponse = segments.map((seg) => ({
    turn: seg.turn,
    hexes: seg.hexes.map((h) => h3ToLatLng(h, latLngByH3)),
    movementSpent: seg.movementSpent,
    movementBudget: seg.movementBudget,
    endHex: h3ToLatLng(seg.endHex, latLngByH3),
  }));

  const originLl = h3ToLatLng(originH3, latLngByH3);
  const destLl = h3ToLatLng(destH3, latLngByH3);
  const orderToXY = pathForResponse.length > 0 ? pathForResponse[0]!.endHex : originLl;
  return {
    status: 'ok',
    unitId,
    unitType: unit.unitType,
    origin: originLl,
    destination: destLl,
    orderToXY,
    orderToH3: segments.length > 0 ? segments[0]!.endHex : originH3,
    hexDistance: path.length - 1,
    turnsRequired,
    path: pathForResponse,
    warnings,
    error: null,
  };
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
  const terrainByH3 = new Map(state.hexes.map((h) => [h.h3Index, h.terrain]));

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
