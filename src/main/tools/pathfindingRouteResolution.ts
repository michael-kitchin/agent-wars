import { getReachableHexes, terrainIsPassableForDomain } from '../pathfinding';
import { strategicRangeOnState } from '../weather/weatherMatch';
import type { WeatherState } from '../../shared/weatherBonusTypes';
import type { PassableDomain } from '../pathfinding';
import { landUnitCanOccupyHex, type LandMassByH3 } from '../../shared/landTraversalStrategic';
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
  nearestReachableWaterHexTo,
} from './pathfindingDistanceHelpers';
import { findLandPathWithStatefulOptionalAvoidanceRetry, type StatefulSearchStats } from './pathfindingStateful';
import type { PathfindingSession, PlanRouteError } from './pathfinding';
import {
  findNavalStrategicPath,
  getNavalStrategicReachableHexes,
  navalLookupForHexState,
} from '../navalStrategicPath';
import { isLandSeaportHex, navalMayOccupyHex } from '../../shared/navalStrategicEdges';

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
    /**
     * First-turn step cap when it differs from `movementBudget` (land-seaport egress).
     *
     * Contract: Omit when every turn uses `movementBudget`. Partitioning uses this for turn 1 only.
     * When to use: Naval routes that start on a land seaport.
     * Expected outcome: First path segment is at most this many edges; later segments use `movementBudget`.
     * Exceptions: None.
     */
    firstTurnMovementBudget?: number;
};

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
    logDebug('pathfinding buildBlockedEnemySetForUnit: skipping enemy avoidance without perspective snapshot', {
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
  /**
   * Acclimation of the unit that is moving.
   *
   * Contract: Omitted when the caller has no snapshot row. Missing tags do not cancel a penalty.
   * When to use: `executePlanRoute` passes the unit's tags.
   * Expected outcome: A snow or rain tag keeps the printed budget in that weather.
   * Exceptions: None.
   */
  weatherTags?: readonly WeatherState[] | null;
}): ResolveRoutePathForUnitOk | PlanRouteError {
  if (payload.unitType === 'naval') {
    return resolveNavalStrategicRoutePath(payload);
  }
  const warnings: string[] = [];
  const destinationH3 = payload.destinationH3;
  if (payload.blocked) payload.blocked.delete(destinationH3);
  const stateful = findLandPathWithStatefulOptionalAvoidanceRetry({
    originH3: payload.originH3,
    destinationH3,
    session: payload.session,
    blocked: payload.blocked,
    warnings,
    blockedRetryWarning: 'Route passes through enemy-occupied hexes - avoidance was not possible.',
  });
  return {
    passableFor: 'land',
    destinationH3,
    path: stateful.path,
    movementBudget: strategicRangeOnState(
      { unitType: payload.unitType, h3Index: payload.originH3, weatherTags: payload.weatherTags },
      payload.session.state
    ),
    warnings,
    statefulStats: stateful.stats,
  };
}

/**
 * Plans a naval strategic route using berth/egress edges instead of water-passable BFS.
 *
 * Purpose: Land seaport destinations stay legal; land without a seaport still redirects to nearest transit.
 * When to use: `resolveRoutePathForUnit` naval branch only.
 * Expected outcome: Inclusive H3 path; origin land seaport uses first-turn budget 1 then the naval budget.
 * Exceptions: Returns plan_route error objects when origin is not occupiable or egress is impossible.
 */
function resolveNavalStrategicRoutePath(payload: {
  originH3: string;
  destinationH3: string;
  hexSet: Set<string>;
  terrainByH3: Map<string, string>;
  session: PathfindingSession;
  blocked?: Set<string>;
  /**
   * Acclimation of the naval unit.
   *
   * Contract: Same field `resolveRoutePathForUnit` receives.
   * When to use: Forwarded from the public route resolver.
   * Expected outcome: Untagged naval in snow uses a one-hex budget for the rest of the route.
   * Exceptions: None.
   */
  weatherTags?: readonly WeatherState[] | null;
}): ResolveRoutePathForUnitOk | PlanRouteError {
  logDebug('pathfinding resolveNavalStrategicRoutePath', {
    originH3: payload.originH3,
    destinationH3: payload.destinationH3,
  });
  const lookup = navalLookupForHexState(
    payload.session,
    payload.session.state.hexes,
    payload.session.state.strategicInfrastructure
  );
  const originAttrs = lookup(payload.originH3);
  if (!originAttrs || !navalMayOccupyHex(originAttrs)) {
    return { status: 'error', error: PLAN_ROUTE_ERR_NAVAL_START };
  }
  const warnings: string[] = [];
  let destinationH3 = payload.destinationH3;
  let navalRedirectedToWater = false;
  const destAttrs = lookup(destinationH3);
  if (destAttrs && !navalMayOccupyHex(destAttrs)) {
    const waterHex = nearestReachableWaterHexTo(
      payload.originH3,
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

  if (isLandSeaportHex(originAttrs) && destinationH3 !== payload.originH3) {
    const egress = getNavalStrategicReachableHexes({
      originH3: payload.originH3,
      maxSteps: 1,
      lookup,
      blocked: payload.blocked,
    });
    if (egress.size <= 1) return { status: 'error', error: PLAN_ROUTE_ERR_SEAPORT_EGRESS };
  }

  const movementBudget = strategicRangeOnState(
    { unitType: 'naval', h3Index: payload.originH3, weatherTags: payload.weatherTags },
    payload.session.state
  );
  const firstTurnMovementBudget = isLandSeaportHex(originAttrs) ? 1 : undefined;
  let path = findNavalStrategicPath({
    originH3: payload.originH3,
    destinationH3,
    maxSteps: Math.max(payload.hexSet.size, 1),
    lookup,
    blocked: payload.blocked,
    clampLandSeaportOriginToOneStep: false,
  });
  if (isLandSeaportHex(originAttrs)) warnings.push(PLAN_ROUTE_WARNING_SEAPORT_EGRESS);
  if (navalRedirectedToWater) warnings.push(PLAN_ROUTE_WARNING_LAND_REDIRECT);
  const destAfterRoute = lookup(destinationH3);
  if (!path && !(destAfterRoute && isLandSeaportHex(destAfterRoute))) {
    const fallbackWater = nearestReachableWaterHexTo(
      payload.originH3,
      destinationH3,
      payload.hexSet,
      payload.terrainByH3,
      getReachableHexes,
      payload.blocked
    );
    if (fallbackWater && fallbackWater !== destinationH3) {
      destinationH3 = fallbackWater;
      path = findNavalStrategicPath({
        originH3: payload.originH3,
        destinationH3,
        maxSteps: Math.max(payload.hexSet.size, 1),
        lookup,
        blocked: payload.blocked,
        clampLandSeaportOriginToOneStep: false,
      });
      if (path) warnings.push(PLAN_ROUTE_WARNING_WATER_BODY_FALLBACK);
    }
  }
  return { passableFor: 'water', destinationH3, path, movementBudget, firstTurnMovementBudget, warnings };
}

/**
 * Defines the `planRouteNoPathHint` function shape (export function planRouteNoPathHint(passableFor: PassableDomain, destTerrain: string): string).

 * Purpose: Supports maintainability by documenting why `planRouteNoPathHint` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function planRouteNoPathHint(
  passableFor: PassableDomain,
  destH3: string,
  landMass?: LandMassByH3,
  destTerrain?: string
): string {
  if (passableFor === 'land' && landMass && !landUnitCanOccupyHex(destH3, landMass)) {
    return ' Destination has no continent or large-island land mass; land units cannot move there.';
  }
  if (passableFor === 'land' && landMass && landUnitCanOccupyHex(destH3, landMass)) {
    return ' No path found (destination may be on a different land mass).';
  }
  if (passableFor === 'land') {
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
