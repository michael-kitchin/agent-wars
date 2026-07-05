/**
 * Res1 land-unit traversal rules based on continent/island membership and water fraction.
 * Shared between main-process pathfinding, order validation, and AI helpers.
 */

import { gridDisk } from 'h3-js';

/**
 * Documents the module-scope binding `RES1_LAND_MAX_WATER_PCT` (RES1_LAND_MAX_WATER_PCT).

 * Purpose: Supports maintainability by documenting why `RES1_LAND_MAX_WATER_PCT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const RES1_LAND_MAX_WATER_PCT = 85;

/**
 * Documents the `Res1LandMassRecord` interface as a named contract surface (export interface Res1LandMassRecord).

 * Purpose: Supports maintainability by documenting why `Res1LandMassRecord` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface Res1LandMassRecord {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `waterPct` member (waterPct: number;).

   * Contract: Describes stable behavior for callers of `waterPct` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
waterPct: number;
    /**
   * Specifies the contract for the `continentIds` member (continentIds: readonly number[];).

   * Contract: Describes stable behavior for callers of `continentIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
continentIds: readonly number[];
    /**
   * Specifies the contract for the `islandIds` member (islandIds: readonly number[];).

   * Contract: Describes stable behavior for callers of `islandIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
islandIds: readonly number[];
}

/**
 * Documents the `LandMassByH3` type alias (export type LandMassByH3).

 * Purpose: Supports maintainability by documenting why `LandMassByH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type LandMassByH3 = ReadonlyMap<string, Res1LandMassRecord>;

/**
 * Defines the `idsIntersect` function shape (function idsIntersect(a: readonly number[], b: readonly number[]): boolean).

 * Purpose: Supports maintainability by documenting why `idsIntersect` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function idsIntersect(a: readonly number[], b: readonly number[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b);
  for (const id of a) {
    if (setB.has(id)) return true;
  }
  return false;
}

/**
 * Defines the `landUnitCanOccupyHex` function shape (export function landUnitCanOccupyHex(h3: string, data: LandMassByH3): boolean).

 * Purpose: Supports maintainability by documenting why `landUnitCanOccupyHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function landUnitCanOccupyHex(h3: string, data: LandMassByH3): boolean {
  const record = data.get(h3);
  if (!record) return false;
  return record.continentIds.length > 0 || record.islandIds.length > 0;
}

/**
 * Defines whether a land unit may traverse a single ring-1 step between two res1 hexes.

 * Purpose: Single source of truth for land-mass edge legality (continent/island overlap plus water cap).
 * When to use: Pathfinding neighbor expansion, route validation, AI destination filtering, and march preview pre-checks.
 * Expected outcome: True when the destination is below 85% water and shares at least one continent id or island id with the origin; false when records are missing or overlap/water checks fail.
 * Exceptions: None.
 */
export function canLandUnitTraverseEdge(fromH3: string, toH3: string, data: LandMassByH3): boolean {
  const from = data.get(fromH3);
  const to = data.get(toH3);
  if (!from || !to) return false;

  if (to.waterPct >= RES1_LAND_MAX_WATER_PCT) {
    return false;
  }

  return (
    idsIntersect(from.continentIds, to.continentIds) ||
    idsIntersect(from.islandIds, to.islandIds)
  );
}

/**
 * Defines the `getLandMassRouteBlockReason` function shape (export function getLandMassRouteBlockReason(routeH3: readonly string[], data: LandMassByH3): string | null).

 * Purpose: Reports the first land-mass step that blocks a proposed land-unit route.
 * When to use: Order validation after assembling a grid path.
 * Expected outcome: Null when every checked step passes `canLandUnitTraverseEdge`; otherwise a stable human-facing reason string.
 * Exceptions: None.
 */
export function getLandMassRouteBlockReason(routeH3: readonly string[], data: LandMassByH3): string | null {
  if (routeH3.length < 2) return null;
  for (let i = 1; i < routeH3.length; i++) {
    const from = routeH3[i - 1]!;
    const to = routeH3[i]!;
    if (!canLandUnitTraverseEdge(from, to, data)) {
      return LAND_UNIT_ROUTE_STEP_BLOCKED_REASON;
    }
  }
  return null;
}

/**
 * Documents the module-scope binding `LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON` (LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON).

 * Purpose: Supports maintainability by documenting why `LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON =
  'Land units must move to a hex that overlaps a continent or large island.';

/**
 * Documents the module-scope binding `LAND_UNIT_ROUTE_STEP_BLOCKED_REASON` (LAND_UNIT_ROUTE_STEP_BLOCKED_REASON).

 * Purpose: Supports maintainability by documenting why `LAND_UNIT_ROUTE_STEP_BLOCKED_REASON` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const LAND_UNIT_ROUTE_STEP_BLOCKED_REASON =
  'Land units cannot traverse that route step (different land mass or destination is at least 85% water terrain).';

/**
 * Defines the `getLandMassReachableHexes` function shape (export function getLandMassReachableHexes(args:).

 * Purpose: Supports maintainability by documenting why `getLandMassReachableHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getLandMassReachableHexes(args: {
  originH3: string;
  hexSet: ReadonlySet<string>;
  data: LandMassByH3;
  maxDepth: number;
  blocked?: ReadonlySet<string>;
}): Set<string> {
  const { originH3, hexSet, data, maxDepth, blocked } = args;
  const reachable = new Set<string>();
  if (!hexSet.has(originH3)) return reachable;
  if (blocked?.has(originH3)) return reachable;

  const depthByH3 = new Map<string, number>([[originH3, 0]]);
  const queue: string[] = [originH3];
  reachable.add(originH3);

  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex]!;
    queueIndex += 1;
    const depth = depthByH3.get(current) ?? 0;
    if (depth >= maxDepth) continue;

    let neighbors: string[];
    try {
      neighbors = gridDisk(current, 1);
    } catch {
      continue;
    }

    for (const neighbor of neighbors) {
      if (neighbor === current || !hexSet.has(neighbor)) continue;
      if (blocked?.has(neighbor)) continue;
      if (reachable.has(neighbor)) continue;
      if (!canLandUnitTraverseEdge(current, neighbor, data)) continue;
      const nextDepth = depth + 1;
      if (nextDepth > maxDepth) continue;
      depthByH3.set(neighbor, nextDepth);
      reachable.add(neighbor);
      queue.push(neighbor);
    }
  }
  return reachable;
}
