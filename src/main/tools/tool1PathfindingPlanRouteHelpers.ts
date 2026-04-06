import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { PassableDomain } from '../pathfinding';

type LatLng = [number, number];

type PlanRouteError = { status: 'error'; error: string };

type PlanRoutePathSegment = {
  turn: number;
  hexes: LatLng[];
  movementSpent: number;
  movementBudget: number;
  endHex: LatLng;
};

type PlanRouteOk = {
  status: 'ok';
  unitId: string;
  unitType: string;
  origin: LatLng;
  destination: LatLng;
  orderToXY: LatLng;
  orderToH3: string;
  suggestedDestinations?: LatLng[];
  hexDistance: number;
  turnsRequired: number;
  path: PlanRoutePathSegment[];
  warnings: string[];
  error?: null;
  reachable?: boolean;
};

export type ResolvedPlanRouteRequestContext = {
  state: GameStateSnapshot;
  unit: GameStateSnapshot['units'][number];
  originH3: string;
  destinationH3: string;
};

/**
 * Why this exists:
 *     Centralizes unit/destination resolution for plan_route so validation and error contracts stay consistent.
 * When to use:
 *     At the start of plan_route execution before any path search work.
 * What to expect:
 *     Returns resolved unit/origin/destination context or a spec-compatible error payload.
 */
export function resolvePlanRouteRequestContext(payload: {
  unitId: string;
  destination: LatLng;
  state: GameStateSnapshot;
  hexSet: Set<string>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  logUnitNotFound: (unitId: string) => void;
  logUnitOffMap: (unitId: string) => void;
}): ResolvedPlanRouteRequestContext | PlanRouteError {
  const unit = payload.state.units.find((u) => u.id === payload.unitId);
  if (!unit) {
    payload.logUnitNotFound(payload.unitId);
    return { status: 'error', error: `Unit not found: ${payload.unitId}` };
  }
  if (!payload.hexSet.has(unit.h3Index)) {
    payload.logUnitOffMap(payload.unitId);
    return { status: 'error', error: `Unit not found: ${payload.unitId}` };
  }
  const destinationH3 = payload.resolveToH3(payload.destination[0], payload.destination[1]);
  if (!destinationH3) {
    return { status: 'error', error: 'No path exists - destination could not be resolved to a map hex.' };
  }
  if (!payload.hexSet.has(destinationH3)) {
    return { status: 'error', error: 'No path exists - destination is not on the map.' };
  }
  return {
    state: payload.state,
    unit,
    originH3: unit.h3Index,
    destinationH3,
  };
}

/**
 * Why this exists:
 *     Produces a consistent success payload for already-at-destination cases while preserving helpful alternatives.
 * When to use:
 *     When path planning resolves destination to the current unit hex.
 * What to expect:
 *     Returns a valid `status: "ok"` route response with no movement and optional nearby suggestions.
 */
export function buildAlreadyAtDestinationResult(payload: {
  unitId: string;
  unitType: string;
  originH3: string;
  destinationH3: string;
  passableFor: PassableDomain;
  blocked?: Set<string>;
  warnings: string[];
  warningLandRedirect: string;
  warningAlreadyAtRedirectedHex: string;
  defaultAlreadyAtWarning: string;
  getReachableHexesForDomain: (originH3: string, passableFor: PassableDomain, blocked?: Set<string>) => Set<string>;
  h3ToLatLng: (h3: string) => LatLng;
}): PlanRouteOk {
  const originLl = payload.h3ToLatLng(payload.originH3);
  const nearbyAlternatives = Array.from(
    payload.getReachableHexesForDomain(payload.originH3, payload.passableFor, payload.blocked)
  )
    .filter((h3) => h3 !== payload.originH3)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 6)
    .map((h3) => payload.h3ToLatLng(h3));
  const warningsWhenAlreadyThere: string[] = payload.warnings.includes(payload.warningLandRedirect)
    ? [payload.warningAlreadyAtRedirectedHex]
    : [payload.defaultAlreadyAtWarning];
  return {
    status: 'ok',
    unitId: payload.unitId,
    unitType: payload.unitType,
    origin: originLl,
    destination: payload.h3ToLatLng(payload.destinationH3),
    orderToXY: originLl,
    orderToH3: payload.originH3,
    suggestedDestinations: nearbyAlternatives,
    hexDistance: 0,
    turnsRequired: 0,
    path: [],
    warnings: warningsWhenAlreadyThere,
  };
}

/**
 * Why this exists:
 *     Consolidates standard and max-turn-truncated route response shaping to avoid drift across call paths.
 * When to use:
 *     After obtaining a concrete traversable path and movement budget.
 * What to expect:
 *     Returns an `ok` route payload; when `maxTurns` truncates, includes `reachable: false`.
 */
export function buildPlanRouteSuccessResult(payload: {
  unitId: string;
  unitType: string;
  originH3: string;
  destinationH3: string;
  path: string[];
  movementBudget: number;
  warnings: string[];
  maxTurns?: number;
  h3ToLatLng: (h3: string) => LatLng;
  partitionPathByTurn: (
    path: string[],
    movementBudget: number
  ) => Array<{
    turn: number;
    hexes: string[];
    movementSpent: number;
    movementBudget: number;
    endHex: string;
  }>;
}): PlanRouteOk {
  let turnsRequired = 0;
  const segments = payload.partitionPathByTurn(payload.path, payload.movementBudget);
  turnsRequired = segments.length;
  const maxTurns = payload.maxTurns;
  if (maxTurns != null && turnsRequired > maxTurns) {
    payload.warnings.push(`Route truncated at maxTurns limit - destination not reached in ${maxTurns} turns`);
    const stepsAllowed = maxTurns * payload.movementBudget;
    const truncatedPath = payload.path.slice(0, Math.min(payload.path.length, stepsAllowed + 1));
    const truncatedSegments = payload.partitionPathByTurn(truncatedPath, payload.movementBudget);
    turnsRequired = maxTurns;
    const pathForResponse = truncatedSegments.map((seg) => ({
      turn: seg.turn,
      hexes: seg.hexes.map((h) => payload.h3ToLatLng(h)),
      movementSpent: seg.movementSpent,
      movementBudget: seg.movementBudget,
      endHex: payload.h3ToLatLng(seg.endHex),
    }));
    const originLl = payload.h3ToLatLng(payload.originH3);
    const destLl = payload.h3ToLatLng(payload.destinationH3);
    const orderToXY = pathForResponse.length > 0 ? pathForResponse[0]!.endHex : originLl;
    return {
      status: 'ok',
      unitId: payload.unitId,
      unitType: payload.unitType,
      origin: originLl,
      destination: destLl,
      orderToXY,
      orderToH3: truncatedSegments.length > 0 ? truncatedSegments[0]!.endHex : payload.originH3,
      hexDistance: truncatedPath.length - 1,
      turnsRequired,
      path: pathForResponse,
      warnings: payload.warnings,
      error: null,
      reachable: false,
    };
  }
  const pathForResponse = segments.map((seg) => ({
    turn: seg.turn,
    hexes: seg.hexes.map((h) => payload.h3ToLatLng(h)),
    movementSpent: seg.movementSpent,
    movementBudget: seg.movementBudget,
    endHex: payload.h3ToLatLng(seg.endHex),
  }));
  const originLl = payload.h3ToLatLng(payload.originH3);
  const destLl = payload.h3ToLatLng(payload.destinationH3);
  const orderToXY = pathForResponse.length > 0 ? pathForResponse[0]!.endHex : originLl;
  return {
    status: 'ok',
    unitId: payload.unitId,
    unitType: payload.unitType,
    origin: originLl,
    destination: destLl,
    orderToXY,
    orderToH3: segments.length > 0 ? segments[0]!.endHex : payload.originH3,
    hexDistance: payload.path.length - 1,
    turnsRequired,
    path: pathForResponse,
    warnings: payload.warnings,
    error: null,
  };
}
