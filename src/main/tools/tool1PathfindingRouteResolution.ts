import { getReachableHexes, getMovementBudgetForUnit, terrainIsPassableForDomain } from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { isLandSeaportSpawnHex } from '../movementTerrain';
import { logDebug } from '../logger';
import {
  PLAN_ROUTE_ERR_NAVAL_START,
  PLAN_ROUTE_ERR_SEAPORT_EGRESS,
  PLAN_ROUTE_HINT_DESTINATION_LAND,
  PLAN_ROUTE_HINT_NO_PATH_WATER_COASTAL,
  PLAN_ROUTE_WARNING_LAND_REDIRECT,
  PLAN_ROUTE_WARNING_SEAPORT_EGRESS,
  PLAN_ROUTE_WARNING_WATER_BODY_FALLBACK,
} from '../navalMovementMessages';
import {
  findPathWithOptionalAvoidanceRetry,
  nearestAdjacentWaterOrCoastalHex,
  nearestReachableWaterHexTo,
  prependSeaportEgressStep,
} from './tool1PathfindingDistanceHelpers';
import { findLandPathWithStatefulOptionalAvoidanceRetry, type StatefulSearchStats } from './tool1PathfindingStateful';
import type { PathfindingSession, PlanRouteError } from './tool1Pathfinding';

/**
 * Documents the `ResolveRoutePathForUnitOk` type alias (export type ResolveRoutePathForUnitOk).

 * Purpose: Supports maintainability by documenting why `ResolveRoutePathForUnitOk` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type ResolveRoutePathForUnitOk = {
    /**
   * Specifies the contract for the `passableFor` member (passableFor: PassableDomain;).

   * Contract: Describes stable behavior for callers of `passableFor` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
passableFor: PassableDomain;
    /**
   * Specifies the contract for the `destinationH3` member (destinationH3: string;).

   * Contract: Describes stable behavior for callers of `destinationH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destinationH3: string;
    /**
   * Specifies the contract for the `path` member (path: string[] | null;).

   * Contract: Describes stable behavior for callers of `path` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
path: string[] | null;
    /**
   * Specifies the contract for the `movementBudget` member (movementBudget: number;).

   * Contract: Describes stable behavior for callers of `movementBudget` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
movementBudget: number;
    /**
   * Specifies the contract for the `warnings` member (warnings: string[];).

   * Contract: Describes stable behavior for callers of `warnings` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
warnings: string[];
    /**
   * Specifies the contract for the `statefulStats` member (statefulStats?: StatefulSearchStats;).

   * Contract: Describes stable behavior for callers of `statefulStats` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
statefulStats?: StatefulSearchStats;
};

/**
 * Defines the `resolveNavalOriginForRouting` function shape (function resolveNavalOriginForRouting(payload: { unitType: string; originH3: string; destinationH3: string; hexSet: Set<string>; terrainByH3: Map).

 * Purpose: Supports maintainability by documenting why `resolveNavalOriginForRouting` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resolveNavalOriginForRouting(payload: {
  unitType: string;
  originH3: string;
  destinationH3: string;
  hexSet: Set<string>;
  terrainByH3: Map<string, string>;
  blocked?: Set<string>;
}): { reachableOriginH3: string; seaportEgressHex?: string } | PlanRouteError {
  if (payload.unitType !== 'naval') return { reachableOriginH3: payload.originH3 };
  const originTerrain = payload.terrainByH3.get(payload.originH3) ?? 'land';
  if (terrainIsPassableForDomain(originTerrain, 'water')) return { reachableOriginH3: payload.originH3 };

  const seaportSpawnHex = isLandSeaportSpawnHex({
    h3Index: payload.originH3,
    normalizedTerrain: originTerrain,
  });
  if (!seaportSpawnHex) return { status: 'error', error: PLAN_ROUTE_ERR_NAVAL_START };

  let seaportEgressHex = nearestAdjacentWaterOrCoastalHex(
    payload.originH3,
    payload.destinationH3,
    payload.hexSet,
    payload.terrainByH3,
    payload.blocked
  );
  if (!seaportEgressHex && payload.blocked) {
    seaportEgressHex = nearestAdjacentWaterOrCoastalHex(
      payload.originH3,
      payload.destinationH3,
      payload.hexSet,
      payload.terrainByH3,
      undefined
    );
  }
  if (!seaportEgressHex) return { status: 'error', error: PLAN_ROUTE_ERR_SEAPORT_EGRESS };
  return { reachableOriginH3: seaportEgressHex, seaportEgressHex };
}

/**
 * Defines the `buildBlockedEnemySetForUnit` function shape (export function buildBlockedEnemySetForUnit( unit: PathfindingSession['state']['units'][number], session: PathfindingSession, avoidEnemies: boolean ):).

 * Purpose: Supports maintainability by documenting why `buildBlockedEnemySetForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildBlockedEnemySetForUnit(
  unit: PathfindingSession['state']['units'][number],
  session: PathfindingSession,
  avoidEnemies: boolean
): Set<string> | undefined {
  if (!avoidEnemies) return undefined;
  const state = session.state;
  if (state.fogOfWarEnabled && !state.playerPerspective) {
    logDebug('tool1Pathfinding buildBlockedEnemySetForUnit: skipping enemy avoidance without perspective snapshot', {
      unitId: unit.id,
      unitPlayer: unit.player,
    });
    return undefined;
  }
  const blocked = new Set(state.units.filter((u) => u.player !== unit.player).map((u) => u.h3Index));
  blocked.delete(unit.h3Index);
  return blocked;
}

/**
 * Defines the `resolveRoutePathForUnit` function shape (export function resolveRoutePathForUnit(payload: { unitType: string; originH3: string; destinationH3: string; hexSet: Set<string>; terrainByH3: M).

 * Purpose: Supports maintainability by documenting why `resolveRoutePathForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveRoutePathForUnit(payload: {
  unitType: string;
  originH3: string;
  destinationH3: string;
  hexSet: Set<string>;
  terrainByH3: Map<string, string>;
  session: PathfindingSession;
  blocked?: Set<string>;
}): ResolveRoutePathForUnitOk | PlanRouteError {
  const passableFor: PassableDomain = payload.unitType === 'naval' ? 'water' : 'land';
  const navalOriginResolution = resolveNavalOriginForRouting({
    unitType: payload.unitType,
    originH3: payload.originH3,
    destinationH3: payload.destinationH3,
    hexSet: payload.hexSet,
    terrainByH3: payload.terrainByH3,
    blocked: payload.blocked,
  });
  if ('status' in navalOriginResolution) return navalOriginResolution;
  const { reachableOriginH3: navalReachableOrigin, seaportEgressHex } = navalOriginResolution;
  const warnings: string[] = [];
  let destinationH3 = payload.destinationH3;
  let navalRedirectedToWater = false;
  const destinationTerrain = payload.terrainByH3.get(destinationH3) ?? 'land';
  if (payload.unitType === 'naval' && destinationTerrain === 'land') {
    const waterHex = nearestReachableWaterHexTo(
      navalReachableOrigin,
      destinationH3,
      payload.hexSet,
      payload.terrainByH3,
      getReachableHexes,
      payload.blocked
    );
    if (waterHex) {
      destinationH3 = waterHex;
      navalRedirectedToWater = true;
    }
  }
  if (payload.blocked) payload.blocked.delete(destinationH3);

  const movementBudget = seaportEgressHex ? 1 : getMovementBudgetForUnit(payload.unitType);
  let statefulStats: StatefulSearchStats | undefined;
  let path: string[] | null;
  if (payload.unitType === 'infantry' || payload.unitType === 'armor') {
    const stateful = findLandPathWithStatefulOptionalAvoidanceRetry({
      originH3: navalReachableOrigin,
      destinationH3,
      session: payload.session,
      blocked: payload.blocked,
      warnings,
      blockedRetryWarning: 'Route passes through enemy-occupied hexes - avoidance was not possible.',
    });
    path = prependSeaportEgressStep(stateful.path, payload.originH3, seaportEgressHex);
    statefulStats = stateful.stats;
  } else {
    path = findPathWithOptionalAvoidanceRetry({
      routeOriginH3: navalReachableOrigin,
      destinationH3,
      hexSet: payload.hexSet,
      terrainByH3: payload.terrainByH3,
      passableFor,
      blocked: payload.blocked,
      originH3: payload.originH3,
      seaportEgressHex,
      warnings,
      blockedRetryWarning: 'Route passes through enemy-occupied hexes - avoidance was not possible.',
    });
  }
  if (seaportEgressHex) warnings.push(PLAN_ROUTE_WARNING_SEAPORT_EGRESS);
  if (navalRedirectedToWater) warnings.push(PLAN_ROUTE_WARNING_LAND_REDIRECT);
  if (!path && payload.unitType === 'naval') {
    const fallbackWater = nearestReachableWaterHexTo(
      navalReachableOrigin,
      destinationH3,
      payload.hexSet,
      payload.terrainByH3,
      getReachableHexes,
      payload.blocked
    );
    if (fallbackWater && fallbackWater !== destinationH3) {
      destinationH3 = fallbackWater;
      path = findPathWithOptionalAvoidanceRetry({
        routeOriginH3: navalReachableOrigin,
        destinationH3,
        hexSet: payload.hexSet,
        terrainByH3: payload.terrainByH3,
        passableFor,
        blocked: payload.blocked,
        originH3: payload.originH3,
        seaportEgressHex,
      });
      if (path) warnings.push(PLAN_ROUTE_WARNING_WATER_BODY_FALLBACK);
    }
  }
  return { passableFor, destinationH3, path, movementBudget, warnings, statefulStats };
}

/**
 * Defines the `planRouteNoPathHint` function shape (export function planRouteNoPathHint(passableFor: PassableDomain, destTerrain: string): string).

 * Purpose: Supports maintainability by documenting why `planRouteNoPathHint` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function planRouteNoPathHint(passableFor: PassableDomain, destTerrain: string): string {
  if (passableFor === 'land' && destTerrain === 'water') {
    return ' Destination is water; land units cannot move there. Route this unit to a land or coastal hex (e.g. an enemy land unit\'s position).';
  }
  if (passableFor === 'land' && terrainIsPassableForDomain(destTerrain, 'land')) {
    return ' No path found (destination may be on a different land mass).';
  }
  if (passableFor === 'water' && destTerrain === 'land') {
    return PLAN_ROUTE_HINT_DESTINATION_LAND;
  }
  if (passableFor === 'water' && terrainIsPassableForDomain(destTerrain, 'water')) {
    return PLAN_ROUTE_HINT_NO_PATH_WATER_COASTAL;
  }
  return '';
}
