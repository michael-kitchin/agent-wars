
/**
 * Pathfinding over the hex map: BFS with domain (land/water) and optional blocked hexes.
 * Used by MCP Tool 1 (plan_route, check_distance). All coordinates are H3 indices internally.
 * `coastal` hexes are passable for both land and naval domains.
 */

import { gridDisk } from 'h3-js';
import { logDebug, logError, logTrace } from './logger';
import { getMovementBudget } from './combatConstants';
import type { BonusLevel } from '../shared/bonusLevel';
import { strategicMovementHexesFor } from '../shared/weatherBonusRules';
import type { WeatherState } from '../shared/weatherBonusTypes';
import {
  canLandUnitTraverseEdge,
  landUnitCanOccupyHex,
  type LandMassByH3,
} from '../shared/landTraversalRes1';

/**
 * Documents the `PassableDomain` type alias (export type PassableDomain).

 * Purpose: Supports maintainability by documenting why `PassableDomain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type PassableDomain = 'land' | 'water';

/**
 * Documents the module-scope binding `FIND_PATH_DEBUG_SAMPLE_EVERY` (FIND_PATH_DEBUG_SAMPLE_EVERY).

 * Purpose: Supports maintainability by documenting why `FIND_PATH_DEBUG_SAMPLE_EVERY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const FIND_PATH_DEBUG_SAMPLE_EVERY = 250;
/**
 * Documents the module-scope binding `findPathInvocationCount` (findPathInvocationCount).

 * Purpose: Supports maintainability by documenting why `findPathInvocationCount` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let findPathInvocationCount = 0;

/**
 * Defines the `terrainIsPassableForDomain` function shape (export function terrainIsPassableForDomain(terrain: string | undefined, passableFor: PassableDomain): boolean).

 * Purpose: Supports maintainability by documenting why `terrainIsPassableForDomain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function terrainIsPassableForDomain(terrain: string | undefined, passableFor: PassableDomain): boolean {
  const t = terrain ?? 'land';
  if (passableFor === 'land') return t === 'land' || t === 'coastal' || t === 'wetlands';
  return t === 'water' || t === 'coastal';
}

/**
 * Defines the `findPath` function shape (export function findPath( originH3: string, destinationH3: string, hexSet: Set<string>, terrainByH3: Map<string, string>, passableFor: PassableDo).

 * Purpose: Supports maintainability by documenting why `findPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function findPath(
  originH3: string,
  destinationH3: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  passableFor: PassableDomain,
  blocked?: Set<string>,
  landMass?: LandMassByH3
): string[] | null {
  findPathInvocationCount += 1;
  logTrace('pathfinding findPath', {
    passableFor,
    blockedCount: blocked?.size ?? 0,
    invocation: findPathInvocationCount,
  });
  if (findPathInvocationCount === 1 || findPathInvocationCount % FIND_PATH_DEBUG_SAMPLE_EVERY === 0) {
    logDebug('pathfinding findPath sampled', {
      invocation: findPathInvocationCount,
      passableFor,
      blockedCount: blocked?.size ?? 0,
      sampleEvery: FIND_PATH_DEBUG_SAMPLE_EVERY,
    });
  }
  if (originH3 === destinationH3) return [originH3];
  if (!hexSet.has(originH3) || !hexSet.has(destinationH3)) return null;

  if (passableFor === 'land') {
    if (!landMass) {
      logError('pathfinding findPath: land domain requires landMass map', new Error('missing landMass'));
      return null;
    }
    if (blocked?.has(originH3) || blocked?.has(destinationH3)) return null;
    if (!landUnitCanOccupyHex(destinationH3, landMass)) return null;

    const queue: string[] = [originH3];
    const parent = new Map<string, string>();
    parent.set(originH3, originH3);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === destinationH3) {
        const path: string[] = [];
        let p: string = destinationH3;
        while (true) {
          path.unshift(p);
          const prev = parent.get(p);
          if (prev === undefined || prev === p) break;
          p = prev;
        }
        return path;
      }
      let neighbors: string[];
      try {
        neighbors = gridDisk(current, 1);
      } catch (err) {
        logError('pathfinding findPath: gridDisk threw', err);
        continue;
      }
      for (const n of neighbors) {
        if (n === current) continue;
        if (parent.has(n)) continue;
        if (!hexSet.has(n)) continue;
        if (blocked?.has(n)) continue;
        if (!canLandUnitTraverseEdge(current, n, landMass)) continue;
        parent.set(n, current);
        queue.push(n);
      }
    }
    return null;
  }

  const passable = (h3: string) => {
    if (!hexSet.has(h3)) return false;
    if (blocked?.has(h3)) return false;
    const terrain = terrainByH3.get(h3) ?? 'land';
    return terrainIsPassableForDomain(terrain, passableFor);
  };
  if (!passable(originH3) || !passable(destinationH3)) return null;

  const queue: string[] = [originH3];
  const parent = new Map<string, string>();
  parent.set(originH3, originH3);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === destinationH3) {
      const path: string[] = [];
      let p: string = destinationH3;
      while (true) {
        path.unshift(p);
        const prev = parent.get(p);
        if (prev === undefined || prev === p) break;
        p = prev;
      }
      return path;
    }
    let neighbors: string[];
    try {
      neighbors = gridDisk(current, 1);
    } catch (err) {
      logError('pathfinding findPath: gridDisk threw', err);
      continue;
    }
    for (const n of neighbors) {
      if (n === current) continue;
      if (parent.has(n)) continue;
      if (!passable(n)) continue;
      parent.set(n, current);
      queue.push(n);
    }
  }
  return null;
}

/**
 * Defines the `getReachableHexes` function shape (export function getReachableHexes( originH3: string, hexSet: Set<string>, terrainByH3: Map<string, string>, passableFor: PassableDomain, blocked?).

 * Purpose: Supports maintainability by documenting why `getReachableHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getReachableHexes(
  originH3: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  passableFor: PassableDomain,
  blocked?: Set<string>,
  landMass?: LandMassByH3
): Set<string> {
  if (passableFor === 'land') {
    if (!landMass) {
      logError('pathfinding getReachableHexes: land domain requires landMass map', new Error('missing landMass'));
      return new Set();
    }
    if (!hexSet.has(originH3) || blocked?.has(originH3)) return new Set();
    const reachable = new Set<string>([originH3]);
    const queue: string[] = [originH3];
    while (queue.length > 0) {
      const current = queue.shift()!;
      let neighbors: string[];
      try {
        neighbors = gridDisk(current, 1);
      } catch {
        continue;
      }
      for (const n of neighbors) {
        if (n === current || !hexSet.has(n) || reachable.has(n)) continue;
        if (blocked?.has(n)) continue;
        if (!canLandUnitTraverseEdge(current, n, landMass)) continue;
        reachable.add(n);
        queue.push(n);
      }
    }
    return reachable;
  }

  const passable = (h3: string) => {
    if (!hexSet.has(h3)) return false;
    if (blocked?.has(h3)) return false;
    const terrain = terrainByH3.get(h3) ?? 'land';
    return terrainIsPassableForDomain(terrain, passableFor);
  };
  if (!passable(originH3)) return new Set();
  const reachable = new Set<string>([originH3]);
  const queue: string[] = [originH3];
  while (queue.length > 0) {
    const current = queue.shift()!;
    let neighbors: string[];
    try {
      neighbors = gridDisk(current, 1);
    } catch {
      continue;
    }
    for (const n of neighbors) {
      if (n === current || reachable.has(n) || !passable(n)) continue;
      reachable.add(n);
      queue.push(n);
    }
  }
  return reachable;
}

/**
 * Splits an inclusive H3 path into per-turn segments using a movement budget.
 *
 * Purpose: `plan_route` and standing-order overlays need one segment per turn, with land-seaport
 * egress using a smaller first-turn budget than later sailing turns.
 * When to use: After a full path is known; pass `firstTurnMovementBudget` only when turn 1 differs.
 * Expected outcome: Empty when the path has fewer than two hexes or a budget is not positive; otherwise
 * turn 1 uses `firstTurnMovementBudget` (or `movementBudget` if omitted) and later turns use `movementBudget`.
 * Exceptions: None.
 */
export function partitionPathByTurn(
  pathH3: string[],
  movementBudget: number,
  /**
   * Optional first-turn step cap (land-seaport egress).
   *
   * Contract: Defaults to `movementBudget`.
   * When to use: Pass 1 when the voyage starts on a land seaport.
   * Expected outcome: Turn 1 spends at most this many edges; later turns use `movementBudget`.
   * Exceptions: Values below 1 yield no segments.
   */
  firstTurnMovementBudget?: number
): { turn: number; hexes: string[]; movementSpent: number; movementBudget: number; endHex: string }[] {
  logTrace('pathfinding partitionPathByTurn', { pathLength: pathH3.length, movementBudget, firstTurnMovementBudget });
  if (pathH3.length <= 1) return [];
  if (movementBudget <= 0) return [];
  const firstBudget = firstTurnMovementBudget ?? movementBudget;
  if (firstBudget <= 0) return [];
  const segments: { turn: number; hexes: string[]; movementSpent: number; movementBudget: number; endHex: string }[] = [];
  let turn = 1;
  let i = 0;
  while (i < pathH3.length - 1) {
    const turnBudget = turn === 1 ? firstBudget : movementBudget;
    let spent = 0;
    const hexes: string[] = [pathH3[i]!];
    while (i + 1 < pathH3.length && spent < turnBudget) {
      i++;
      hexes.push(pathH3[i]!);
      spent++;
    }
    segments.push({
      turn,
      hexes,
      movementSpent: spent,
      movementBudget: turnBudget,
      endHex: pathH3[i]!,
    });
    turn++;
  }
  return segments;
}

/**
 * Defines the `getDistanceAndTurns` function shape (export function getDistanceAndTurns( originH3: string, destinationH3: string, hexSet: Set<string>, terrainByH3: Map<string, string>, passableFor:).

 * Purpose: Supports maintainability by documenting why `getDistanceAndTurns` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getDistanceAndTurns(
  originH3: string,
  destinationH3: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  passableFor: PassableDomain,
  movementBudget: number,
  blocked?: Set<string>,
  landMass?: LandMassByH3
): { hexDistance: number; estimatedTurns: number } | null {
  logTrace('pathfinding getDistanceAndTurns', { passableFor });
  const path = findPath(originH3, destinationH3, hexSet, terrainByH3, passableFor, blocked, landMass);
  if (!path || path.length === 0) return null;
  const hexDistance = path.length - 1; // steps between hexes
  if (hexDistance <= 0) return { hexDistance: 0, estimatedTurns: 0 };
  const estimatedTurns = Math.ceil(hexDistance / movementBudget);
  return { hexDistance, estimatedTurns };
}

/**
 * Defines the `getMovementBudgetForUnit` function shape (export function getMovementBudgetForUnit(unitType: string): number).

 * Purpose: Printed strategic hexes, or the weather-reduced count when the caller has this turn's weather.
 * When to use: Route ETAs and assess_unit. Omit `weather` when the weather bonus is off or the caller has no hex.
 * Expected outcome: Infantry 1, armor 2, naval 2, air 0, unless untagged armor or naval is slowed at the given level.
 * Exceptions: None.
 */
export function getMovementBudgetForUnit(
  unitType: string,
  weather?: {
    readonly level: BonusLevel;
    readonly weather: WeatherState | null | undefined;
    readonly tags: readonly WeatherState[] | null | undefined;
  }
): number {
  logTrace('pathfinding getMovementBudgetForUnit', { unitType, level: weather?.level ?? 'off' });
  if (!weather) return getMovementBudget(unitType);
  return strategicMovementHexesFor({
    unitType,
    weather: weather.weather,
    tags: weather.tags,
    level: weather.level,
  });
}
