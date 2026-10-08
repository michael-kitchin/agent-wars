import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { PassableDomain } from '../pathfinding';
import { logDebug } from '../logger';

/**
 * Documents the `LatLng` type alias (type LatLng).

 * Purpose: Supports maintainability by documenting why `LatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type LatLng = [number, number];

/**
 * Documents the `PlanRouteError` type alias (type PlanRouteError).

 * Purpose: Supports maintainability by documenting why `PlanRouteError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type PlanRouteError = { /**
 * Specifies the contract for the `status` member (status: 'error';).

 * Contract: Describes stable behavior for callers of `status` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
status: 'error'; /**
 * Specifies the contract for the `error` member (error: string).

 * Contract: Describes stable behavior for callers of `error` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
error: string };

/**
 * Documents the `PlanRoutePathSegment` type alias (type PlanRoutePathSegment).

 * Purpose: Supports maintainability by documenting why `PlanRoutePathSegment` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type PlanRoutePathSegment = {
    /**
   * Specifies the contract for the `turn` member (turn: number;).

   * Contract: Describes stable behavior for callers of `turn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turn: number;
    /**
   * Specifies the contract for the `hexes` member (hexes: LatLng[];).

   * Contract: Describes stable behavior for callers of `hexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexes: LatLng[];
    /**
   * Specifies the contract for the `movementSpent` member (movementSpent: number;).

   * Contract: Describes stable behavior for callers of `movementSpent` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
movementSpent: number;
    /**
   * Specifies the contract for the `movementBudget` member (movementBudget: number;).

   * Contract: Describes stable behavior for callers of `movementBudget` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
movementBudget: number;
    /**
   * Specifies the contract for the `endHex` member (endHex: LatLng;).

   * Contract: Describes stable behavior for callers of `endHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
endHex: LatLng;
};

/**
 * Documents the `PlanRouteOk` type alias (type PlanRouteOk).

 * Purpose: Supports maintainability by documenting why `PlanRouteOk` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type PlanRouteOk = {
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
   * Specifies the contract for the `path` member (path: PlanRoutePathSegment[];).

   * Contract: Describes stable behavior for callers of `path` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
path: PlanRoutePathSegment[];
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
};

/**
 * Documents the `ResolvedPlanRouteRequestContext` type alias (export type ResolvedPlanRouteRequestContext).

 * Purpose: Supports maintainability by documenting why `ResolvedPlanRouteRequestContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type ResolvedPlanRouteRequestContext = {
    /**
   * Specifies the contract for the `state` member (state: GameStateSnapshot;).

   * Contract: Describes stable behavior for callers of `state` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
state: GameStateSnapshot;
    /**
   * Specifies the contract for the `unit` member (unit: GameStateSnapshot['units'][number];).

   * Contract: Describes stable behavior for callers of `unit` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unit: GameStateSnapshot['units'][number];
    /**
   * Specifies the contract for the `originH3` member (originH3: string;).

   * Contract: Describes stable behavior for callers of `originH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
originH3: string;
    /**
   * Specifies the contract for the `destinationH3` member (destinationH3: string;).

   * Contract: Describes stable behavior for callers of `destinationH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destinationH3: string;
};

/**
 * Defines the `resolvePlanRouteRequestContext` function shape (export function resolvePlanRouteRequestContext(payload: { unitId: string; destination: LatLng; state: GameStateSnapshot; hexSet: Set<string>; res).

 * Purpose: Supports maintainability by documenting why `resolvePlanRouteRequestContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `buildAlreadyAtDestinationResult` function shape (export function buildAlreadyAtDestinationResult(payload: { unitId: string; unitType: string; originH3: string; destinationH3: string; passableFor).

 * Purpose: Supports maintainability by documenting why `buildAlreadyAtDestinationResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `buildPlanRouteSuccessResult` function shape (export function buildPlanRouteSuccessResult(payload: { unitId: string; unitType: string; originH3: string; destinationH3: string; path: string[];).

 * Purpose: Supports maintainability by documenting why `buildPlanRouteSuccessResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildPlanRouteSuccessResult(payload: {
  unitId: string;
  unitType: string;
  originH3: string;
  destinationH3: string;
  path: string[];
  movementBudget: number;
  /**
   * First-turn step cap when it differs from `movementBudget`.
   *
   * Contract: Omit when every turn uses `movementBudget`.
   * When to use: Naval land-seaport origins (egress is one step).
   * Expected outcome: Turn 1 of the returned path uses this cap; later turns use `movementBudget`.
   * Exceptions: None.
   */
  firstTurnMovementBudget?: number;
  warnings: string[];
  maxTurns?: number;
  h3ToLatLng: (h3: string) => LatLng;
  partitionPathByTurn: (
    path: string[],
    movementBudget: number,
    firstTurnMovementBudget?: number
  ) => Array<{
    turn: number;
    hexes: string[];
    movementSpent: number;
    movementBudget: number;
    endHex: string;
  }>;
}): PlanRouteOk {
  logDebug('pathfinding buildPlanRouteSuccessResult', {
    unitId: payload.unitId,
    unitType: payload.unitType,
    originH3: payload.originH3,
    destinationH3: payload.destinationH3,
    pathLength: payload.path.length,
    movementBudget: payload.movementBudget,
    firstTurnMovementBudget: payload.firstTurnMovementBudget ?? null,
    maxTurns: payload.maxTurns ?? null,
  });
  let turnsRequired = 0;
  const segments = payload.partitionPathByTurn(
    payload.path,
    payload.movementBudget,
    payload.firstTurnMovementBudget
  );
  turnsRequired = segments.length;
  const maxTurns = payload.maxTurns;
  if (maxTurns != null && turnsRequired > maxTurns) {
    payload.warnings.push(`Route truncated at maxTurns limit - destination not reached in ${maxTurns} turns`);
    const kept = maxTurns <= 0 ? [] : segments.slice(0, maxTurns);
    const hops = kept.reduce((sum, seg) => sum + seg.movementSpent, 0);
    turnsRequired = maxTurns;
    const pathForResponse = kept.map((seg) => ({
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
      orderToH3: kept.length > 0 ? kept[0]!.endHex : payload.originH3,
      hexDistance: hops,
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
