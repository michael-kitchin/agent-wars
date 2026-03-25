
/**
 * Pathfinding over the hex map: BFS with domain (land/water) and optional blocked hexes.
 * Used by MCP Tool 1 (plan_route, check_distance). All coordinates are H3 indices internally.
 * `coastal` hexes are passable for both land and naval domains.
 */

import { gridDisk } from 'h3-js';
import { logDebug, logError, logTrace } from './logger';
import { getMovementBudget } from './combatConstants';

/** Domain for passability: land units use land + coastal; naval use water + coastal. */
export type PassableDomain = 'land' | 'water';

/**
 * Why this exists:
 *     Single rule for whether a hex `terrain` value is in the land domain (land + coastal) or water domain (water + coastal).
 * When to use:
 *     Pathfinding BFS, Tool 1/2/5, and any logic that must match movement domains.
 * What to expect:
 *     Unknown terrain defaults to `land` before evaluation; `coastal` is passable for both domains.
 */
export function terrainIsPassableForDomain(terrain: string | undefined, passableFor: PassableDomain): boolean {
  const t = terrain ?? 'land';
  if (passableFor === 'land') return t === 'land' || t === 'coastal';
  return t === 'water' || t === 'coastal';
}

/**
 * Returns the shortest path (ordered list of H3 indices from origin to destination) or null if no path.
 * BFS over map hexes; only hexes in hexSet with matching terrain are traversable.
 * Blocked hexes (e.g. enemy-occupied for avoidEnemies) are skipped when non-null.
 */
export function findPath(
  originH3: string,
  destinationH3: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  passableFor: PassableDomain,
  blocked?: Set<string>
): string[] | null {
  logDebug('pathfinding findPath', { passableFor, blockedCount: blocked?.size ?? 0 });
  if (originH3 === destinationH3) return [originH3];
  if (!hexSet.has(originH3) || !hexSet.has(destinationH3)) return null;
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
 * Returns the set of hexes reachable from origin by moving only over the given domain (land or water).
 * Used to find the nearest reachable water hex when redirecting naval routes to a land target.
 */
export function getReachableHexes(
  originH3: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  passableFor: PassableDomain,
  blocked?: Set<string>
): Set<string> {
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
 * Partitions a path into per-turn segments given a movement budget per turn.
 * Each segment starts with the unit's position at the beginning of the turn (the previous
 * segment's endHex) and includes each hex moved through. movementSpent is the number of
 * hexes entered (each costing 1 movement point with uniform terrain costs).
 * Used to build the plan_route response path array.
 */
export function partitionPathByTurn(
  pathH3: string[],
  movementBudget: number
): { turn: number; hexes: string[]; movementSpent: number; movementBudget: number; endHex: string }[] {
  logTrace('pathfinding partitionPathByTurn', { pathLength: pathH3.length, movementBudget });
  if (pathH3.length <= 1) return [];
  const segments: { turn: number; hexes: string[]; movementSpent: number; movementBudget: number; endHex: string }[] = [];
  let turn = 1;
  let i = 0;
  while (i < pathH3.length - 1) {
    let spent = 0;
    const hexes: string[] = [pathH3[i]!];
    while (i + 1 < pathH3.length && spent < movementBudget) {
      i++;
      hexes.push(pathH3[i]!);
      spent++;
    }
    segments.push({
      turn,
      hexes,
      movementSpent: spent,
      movementBudget: movementBudget,
      endHex: pathH3[i]!,
    });
    turn++;
  }
  return segments;
}

/**
 * Returns hex distance (path length) and estimated turns for a unit type, or null if unreachable.
 * Reuses findPath; does not return the path. Use for check_distance tool.
 */
export function getDistanceAndTurns(
  originH3: string,
  destinationH3: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  passableFor: PassableDomain,
  movementBudget: number,
  blocked?: Set<string>
): { hexDistance: number; estimatedTurns: number } | null {
  logTrace('pathfinding getDistanceAndTurns', { passableFor });
  const path = findPath(originH3, destinationH3, hexSet, terrainByH3, passableFor, blocked);
  if (!path || path.length === 0) return null;
  const hexDistance = path.length - 1; // steps between hexes
  if (hexDistance <= 0) return { hexDistance: 0, estimatedTurns: 0 };
  const estimatedTurns = Math.ceil(hexDistance / movementBudget);
  return { hexDistance, estimatedTurns };
}

/**
 * Returns movement budget for the given unit type. Delegates to combat constants.
 * Use when computing turns or partitioning paths.
 */
export function getMovementBudgetForUnit(unitType: string): number {
  logTrace('pathfinding getMovementBudgetForUnit', unitType);
  return getMovementBudget(unitType);
}
