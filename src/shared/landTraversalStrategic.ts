/**
 * Strategic land-unit traversal rules based on continent/island membership and water fraction.
 * Shared between main-process pathfinding, order validation, and AI helpers.
 */

import { gridDisk } from 'h3-js';
import { isOnMap } from './loadedStrategicFootprint';
import type { PipelineTerrainKind } from './pipelineTerrain';

/**
 * Documents the module-scope binding `STRATEGIC_LAND_MAX_WATER_PCT` (STRATEGIC_LAND_MAX_WATER_PCT).

 * Purpose: Supports maintainability by documenting why `STRATEGIC_LAND_MAX_WATER_PCT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const STRATEGIC_LAND_MAX_WATER_PCT = 85;

/**
 * Documents the `StrategicLandMassRecord` interface as a named contract surface (export interface StrategicLandMassRecord).

 * Purpose: Supports maintainability by documenting why `StrategicLandMassRecord` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface StrategicLandMassRecord {
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
export type LandMassByH3 = ReadonlyMap<string, StrategicLandMassRecord>;

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
 * Chooses the terrain kind written into `hexes` when a match is seeded.
 *
 * Purpose: A water-dominant hex that land units can already enter should be stored as coastal so the database, briefing map, and renderer agree.
 * When to use: Once per hex inside new-match seeding, after the classified kind and land-mass record are known. Do not call it to relabel an existing match.
 * Expected outcome: The classified kind unchanged, except `water` becomes `coastal` when the record is land-occupiable and `waterPct` is strictly below `STRATEGIC_LAND_MAX_WATER_PCT`. A null record, a hex with no continent or island id, or a hex at or above that cap stays `water`.
 * Exceptions: None.
 */
export function storedStrategicTerrainKind(
  classifiedKind: PipelineTerrainKind,
  record: StrategicLandMassRecord | null
): PipelineTerrainKind {
  if (classifiedKind !== 'water') return classifiedKind;
  if (!record) return 'water';
  const occupiable = landUnitCanOccupyHex(record.h3Index, new Map([[record.h3Index, record]]));
  if (!occupiable || record.waterPct >= STRATEGIC_LAND_MAX_WATER_PCT) return 'water';
  return 'coastal';
}

/**
 * Chooses the kind painted on a strategic hex polygon.
 *
 * Purpose: Seeding can store a water-dominant hex as coastal, so the child majority can be water while the stored kind is coastal. The polygon follows the stored kind in that case.
 * When to use: Strategic map fill only. Tactical cells keep their own classified kind.
 * Expected outcome: `coastal` when the stored kind is coastal. Otherwise the child-majority kind, which already matches every other stored kind.
 * Exceptions: None.
 */
export function strategicMapFillTerrainKind(storedKind: string, childDominantKind: string): string {
  return storedKind === 'coastal' ? 'coastal' : childDominantKind;
}

/**
 * Defines whether a land unit may traverse a single ring-1 step between two strategic hexes.

 * Purpose: Single source of truth for land-mass edge legality (continent/island overlap plus water cap).
 * When to use: Pathfinding neighbor expansion, route validation, AI destination filtering, and march preview pre-checks.
 * Expected outcome: True when the destination is below 85% water and shares at least one continent id or island id with the origin; false when records are missing or overlap/water checks fail.
 * Exceptions: None.
 */
export function canLandUnitTraverseEdge(fromH3: string, toH3: string, data: LandMassByH3): boolean {
  const from = data.get(fromH3);
  const to = data.get(toH3);
  if (!from || !to) return false;

  if (to.waterPct >= STRATEGIC_LAND_MAX_WATER_PCT) {
    return false;
  }

  return (
    idsIntersect(from.continentIds, to.continentIds) ||
    idsIntersect(from.islandIds, to.islandIds)
  );
}

/**
 * Reports whether two land-mass records can appear on the same land route.
 *
 * Purpose: A march between two hexes needs a shared continent or island id.
 * When to use: Blind-march checks and any caller that previously compared id lists by hand.
 * Expected outcome: True when the records share at least one continent id or one island id. An empty id list never matches.
 * Exceptions: None.
 */
export function landMassRecordsShareId(a: StrategicLandMassRecord, b: StrategicLandMassRecord): boolean {
  return idsIntersect(a.continentIds, b.continentIds) || idsIntersect(a.islandIds, b.islandIds);
}

/**
 * Land-step distances from a set of origins.
 *
 * Purpose: Campaign scoring needs land route length, not straight hops, because a target across water cannot be marched to.
 * When to use: From the campaign flow, with the snapshot hex set and the terrain cache. Armor's stop-on-entering rule is ignored; the count measures distance, not this turn's move.
 * Expected outcome: Every hex reachable by land within `maxDepth` steps of any origin, with its smallest step count. Origins are 0. Origins not in `hexSet` are skipped.
 * Exceptions: None. A cell `gridDisk` rejects is skipped.
 */
export function getLandStepDistances(args: {
  readonly originH3s: readonly string[];
  readonly hexSet: ReadonlySet<string>;
  readonly data: LandMassByH3;
  readonly maxDepth: number;
}): Map<string, number> {
  const steps = new Map<string, number>();
  const queue: string[] = [];
  for (const origin of args.originH3s) {
    if (!args.hexSet.has(origin) || steps.has(origin)) continue;
    steps.set(origin, 0);
    queue.push(origin);
  }
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    const depth = steps.get(current) ?? 0;
    if (depth >= args.maxDepth) continue;
    let neighbors: string[];
    try {
      neighbors = gridDisk(current, 1);
    } catch {
      continue;
    }
    for (const neighbor of neighbors) {
      if (neighbor === current || steps.has(neighbor)) continue;
      if (!args.hexSet.has(neighbor) || !isOnMap(neighbor)) continue;
      if (!canLandUnitTraverseEdge(current, neighbor, args.data)) continue;
      steps.set(neighbor, depth + 1);
      queue.push(neighbor);
    }
  }
  return steps;
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
  endMoveOnEnter?: (h3: string) => boolean;
}): Set<string> {
  const { originH3, hexSet, data, maxDepth, blocked, endMoveOnEnter } = args;
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
    if (current !== originH3 && endMoveOnEnter?.(current)) continue;

    let neighbors: string[];
    try {
      neighbors = gridDisk(current, 1);
    } catch {
      continue;
    }

    for (const neighbor of neighbors) {
      if (neighbor === current || !hexSet.has(neighbor) || !isOnMap(neighbor)) continue;
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
