/**
 * Strategic naval BFS over transit hexes with last-step berth and origin-only egress.
 *
 * Purpose: Reachable sets and routes that treat land seaports as occupy-only endpoints, not canals.
 * When to use: Click destinations, preview, human/AI commit, `plan_route`, and `check_distance` for naval units.
 * Expected outcome: Paths never use a land seaport as an intermediate node; callers pass their own `maxSteps`.
 * Exceptions: Returns null / empty when origin is not occupiable or no legal path exists within the cap.
 */

import { gridDisk } from 'h3-js';
import { logDebug, logError, logTrace } from './logger';
import { getCachedSeaportCountByRes1H3 } from './terrainClassificationCache';
import {
  estimateNavalStrategicTurns,
  isLandSeaportHex,
  navalMayOccupyHex,
  navalMayTraverseStrategicEdge,
  type NavalStrategicHexAttrs,
} from '../shared/navalStrategicEdges';

/**
 * Looks up native terrain and seaport flags for one hex.
 *
 * Purpose: Keeps this module free of database and snapshot types.
 * When to use: Pass a closure over the current hex table (and seaport counts).
 * Expected outcome: `undefined` means the hex is off-map / missing.
 * Exceptions: None.
 */
export type NavalStrategicHexLookup = (h3: string) => NavalStrategicHexAttrs | undefined;

/**
 * Optional adjacency override for tests and non-H3 graphs.
 *
 * Purpose: Production uses H3 `gridDisk`; tests inject a tiny topology without the world map.
 * When to use: Omit in game code; pass a map-backed function in unit tests.
 * Expected outcome: Must not include `h3` itself.
 * Exceptions: None.
 */
export type NavalStrategicNeighborsOf = (h3: string) => readonly string[];

/**
 * Named arguments for a same-turn naval path search.
 *
 * Purpose: Keeps the public path API under the method-argument limit while remaining explicit.
 * When to use: `findNavalStrategicPath`.
 * Expected outcome: `maxSteps` is the caller’s existing naval cap (not unified here).
 * Exceptions: None.
 */
export interface FindNavalStrategicPathArgs {
  /**
   * Hex the unit currently occupies.
   *
   * Contract: Must be occupiable (transit or land seaport) or the search returns null.
   * When to use: Always the unit’s current `h3Index`.
   * Expected outcome: Included as the first path node on success.
   * Exceptions: None.
   */
  originH3: string;
  /**
   * Requested destination hex.
   *
   * Contract: Must be occupiable; land without a seaport is never a naval destination.
   * When to use: Hover, `plan_route` dest, or commit dest.
   * Expected outcome: Last path node on success.
   * Exceptions: Same-hex returns `[originH3]` when occupiable.
   */
  destinationH3: string;
  /**
   * Maximum edges this caller allows this turn.
   *
   * Contract: Click/preview pass movement range; tools pass movement budget. Origin land seaport is clamped to 1.
   * When to use: Pass the cap that already applied at this call site.
   * Expected outcome: Paths longer than the effective cap are rejected.
   * Exceptions: Negative or zero (except same-hex) yields no move path.
   */
  maxSteps: number;
  /**
   * Native terrain + seaport lookup.
   *
   * Contract: Must not promote seaports to coastal.
   * When to use: Always.
   * Expected outcome: Missing hexes are treated as impassable.
   * Exceptions: None.
   */
  lookup: NavalStrategicHexLookup;
  /**
   * Optional neighbor function.
   *
   * Contract: Defaults to H3 ring-1 excluding self.
   * When to use: Tests; omit in production.
   * Expected outcome: Only listed neighbors are considered.
   * Exceptions: None.
   */
  neighborsOf?: NavalStrategicNeighborsOf;
  /**
   * Hexes that cannot be entered (combat blocks, etc.).
   *
   * Contract: Origin may still be listed; destination listed means unreachable.
   * When to use: When the caller already has a blocked set.
   * Expected outcome: Blocked hexes are skipped except as origin.
   * Exceptions: None.
   */
  blocked?: ReadonlySet<string>;
  /**
   * Whether a land-seaport origin is limited to one egress step.
   *
   * Contract: Same-turn click/commit/preview leave this true; multi-turn `plan_route` / `check_distance` pass false.
   * When to use: Omit for this-turn legality; set false only when partitioning a longer voyage after egress.
   * Expected outcome: True clamps `maxSteps` to 1 on land-seaport origins; false still forbids expanding berths as through-nodes.
   * Exceptions: None.
   */
  clampLandSeaportOriginToOneStep?: boolean;
}

/**
 * Named arguments for a same-turn naval reachable-set search.
 *
 * Purpose: Same graph as `findNavalStrategicPath` without a single destination.
 * When to use: `getValidDestinations` and AI validation.
 * Expected outcome: Includes origin; land seaports appear only as berth endpoints.
 * Exceptions: Empty set when origin is not occupiable.
 */
export interface GetNavalStrategicReachableHexesArgs {
  /**
   * Hex the unit currently occupies.
   *
   * Contract: Same occupiability rule as path search.
   * When to use: Always the unit’s current hex.
   * Expected outcome: Always included when the origin is occupiable.
   * Exceptions: None.
   */
  originH3: string;
  /**
   * Maximum edges this caller allows this turn.
   *
   * Contract: Origin land seaport is clamped to 1 (egress only).
   * When to use: Pass the same cap the matching path search would use.
   * Expected outcome: Reachable hexes are at most that many legal edges away.
   * Exceptions: None.
   */
  maxSteps: number;
  /**
   * Native terrain + seaport lookup.
   *
   * Contract: Must not promote seaports to coastal.
   * When to use: Always.
   * Expected outcome: Missing hexes are skipped.
   * Exceptions: None.
   */
  lookup: NavalStrategicHexLookup;
  /**
   * Optional neighbor function (defaults to H3 ring-1).
   *
   * Contract: Same as path search.
   * When to use: Tests; omit in production.
   * Expected outcome: Only listed neighbors are considered.
   * Exceptions: None.
   */
  neighborsOf?: NavalStrategicNeighborsOf;
  /**
   * Hexes that cannot be entered.
   *
   * Contract: Same as path search.
   * When to use: When the caller already has a blocked set.
   * Expected outcome: Blocked hexes are omitted from the result (except origin).
   * Exceptions: None.
   */
  blocked?: ReadonlySet<string>;
  /**
   * Whether a land-seaport origin is limited to one egress step.
   *
   * Contract: Same as `FindNavalStrategicPathArgs.clampLandSeaportOriginToOneStep`.
   * When to use: Same-turn reachable sets omit this (default true).
   * Expected outcome: False allows a multi-turn voyage after the first egress edge.
   * Exceptions: None.
   */
  clampLandSeaportOriginToOneStep?: boolean;
}

/**
 * Builds a naval hex lookup from snapshot hex rows and seaport counts.
 *
 * Purpose: Production callers share one construction path that never promotes seaports to coastal.
 * When to use: `getValidDestinations`, `plan_route`, preview, and AI validation.
 * Expected outcome: Missing hexes yield `undefined`; `hasSeaport` is true when the count is positive.
 * Exceptions: None.
 */
export function createNavalStrategicHexLookup(
  hexes: ReadonlyArray<{ h3Index: string; terrain: string; terrainKind?: string }>,
  seaportCountByH3: ReadonlyMap<string, number>
): NavalStrategicHexLookup {
  const byH3 = new Map(hexes.map((hex) => [hex.h3Index, hex] as const));
  return (h3) => {
    const hex = byH3.get(h3);
    if (!hex) return undefined;
    return {
      nativeTerrain: hex.terrain,
      terrainKind: hex.terrainKind,
      hasSeaport: (seaportCountByH3.get(h3) ?? 0) > 0,
    };
  };
}

/**
 * Indexes seaport counts from a game-state infrastructure list.
 *
 * Purpose: Avoid repeating Map construction at every naval call site.
 * When to use: Pass `state.res1Infrastructure` (or an empty array when absent).
 * Expected outcome: Hexes omitted from the list have count 0 via `Map.get` defaulting in the lookup.
 * Exceptions: None.
 */
export function seaportCountByH3FromInfra(
  infra: ReadonlyArray<{ h3Index: string; seaportCount: number }> | undefined
): Map<string, number> {
  return new Map((infra ?? []).map((row) => [row.h3Index, row.seaportCount] as const));
}

/**
 * Fills seaport counts from the classification cache only for hexes the snapshot omitted.
 *
 * Purpose: World-map ports still appear when `res1_infrastructure` is sparse, without restoring a
 * destroyed port whose snapshot row is present with count 0.
 * When to use: `seaportCountByH3ForNavalLookup` after indexing snapshot infra.
 * Expected outcome: Existing snapshot keys are unchanged (including explicit zeros); missing keys
 * with a positive cache count are added. Returns the same map instance.
 * Exceptions: None.
 */
export function mergeCachedSeaportsIntoInfraMap(
  infraMap: Map<string, number>,
  cachedSeaports: ReadonlyMap<string, number> | null
): Map<string, number> {
  logDebug('navalStrategicPath mergeCachedSeaportsIntoInfraMap', {
    infraHexes: infraMap.size,
    cachedEntries: cachedSeaports?.size ?? 0,
  });
  if (!cachedSeaports) return infraMap;
  for (const [h3Index, seaportCount] of cachedSeaports) {
    if (seaportCount <= 0 || infraMap.has(h3Index)) continue;
    infraMap.set(h3Index, seaportCount);
  }
  return infraMap;
}

/**
 * Builds seaport counts from snapshot infrastructure plus the classification-cache map.
 *
 * Purpose: Classification-cache seaports must participate in berth lookup when `res1_infrastructure` is sparse,
 * without a per-hex live DB probe and without treating destroyed ports as berths.
 * When to use: Production naval lookups over a real game snapshot.
 * Expected outcome: Snapshot rows win, including `seaportCount === 0`. Cache only fills omitted hexes.
 * Exceptions: `hexes` is unused for counting; kept so existing callers stay stable.
 */
export function seaportCountByH3ForNavalLookup(
  hexes: ReadonlyArray<{ h3Index: string }>,
  infra: ReadonlyArray<{ h3Index: string; seaportCount: number }> | undefined
): Map<string, number> {
  const cachedSeaports = getCachedSeaportCountByRes1H3();
  const map = mergeCachedSeaportsIntoInfraMap(seaportCountByH3FromInfra(infra), cachedSeaports);
  logDebug('navalStrategicPath seaportCountByH3ForNavalLookup', {
    hexCount: hexes.length,
    infraRows: infra?.length ?? 0,
    seaportHexes: map.size,
    mergedCachedSeaports: cachedSeaports !== null,
  });
  return map;
}

/**
 * Session-scoped naval hex lookup cache. Weak so lookups die with the pathfinding session.
 *
 * Purpose: Session and snapshot objects keep one lookup so hover, destinations, and tools do not rebuild it.
 * When to use: `navalLookupForHexState` only.
 * Expected outcome: One lookup per session object.
 * Exceptions: None.
 */
const navalLookupBySession = new WeakMap<object, NavalStrategicHexLookup>();

/**
 * Returns a naval hex lookup cached on `sessionKey` (typically a `PathfindingSession`).
 *
 * Purpose: Preview, destinations, `plan_route`, `check_distance`, and `assess_*` share one lookup
 * for the same session or snapshot object.
 * When to use: Naval occupancy checks, `plan_route`, `check_distance`, destinations, and `assess_*`
 * that already have a pathfinding session or a stable snapshot object.
 * Expected outcome: First call builds the lookup; later calls with the same object reuse it.
 * Exceptions: None.
 */
export function navalLookupForHexState(
  sessionKey: object,
  hexes: ReadonlyArray<{ h3Index: string; terrain: string; terrainKind?: string }>,
  infra: ReadonlyArray<{ h3Index: string; seaportCount: number }> | undefined
): NavalStrategicHexLookup {
  const cached = navalLookupBySession.get(sessionKey);
  logDebug('navalStrategicPath navalLookupForHexState', {
    hexCount: hexes.length,
    reused: Boolean(cached),
  });
  if (cached) return cached;
  const lookup = createNavalStrategicHexLookup(hexes, seaportCountByH3ForNavalLookup(hexes, infra));
  navalLookupBySession.set(sessionKey, lookup);
  return lookup;
}

/**
 * Returns H3 ring-1 neighbors excluding the cell itself.
 *
 * Purpose: Production adjacency for naval BFS.
 * When to use: Default when callers omit `neighborsOf`.
 * Expected outcome: Empty array if `gridDisk` throws.
 * Exceptions: Logs and returns [] on H3 errors.
 */
function defaultNeighborsOf(h3: string): string[] {
  try {
    return gridDisk(h3, 1).filter((n) => n !== h3);
  } catch (err) {
    logError('navalStrategicPath defaultNeighborsOf: gridDisk threw', err);
    return [];
  }
}

/**
 * Clamps `maxSteps` to 1 when the origin is a land seaport (egress-only).
 *
 * Purpose: A berth origin cannot march inland or chain ports even if the caller cap is 2 or 3.
 * When to use: Both path and reachable searches.
 * Expected outcome: Transit origins keep the caller cap; land-seaport origins use min(cap, 1).
 * Exceptions: Non-positive caps stay non-positive.
 */
function effectiveNavalMaxSteps(
  originAttrs: NavalStrategicHexAttrs,
  maxSteps: number,
  clampLandSeaportOriginToOneStep: boolean
): number {
  if (clampLandSeaportOriginToOneStep && isLandSeaportHex(originAttrs)) return Math.min(maxSteps, 1);
  return maxSteps;
}

/**
 * Walks legal naval edges up to `maxSteps` and records parent pointers.
 *
 * Purpose: Shared BFS for path reconstruction and reachable-set collection.
 * When to use: Internal to this module only.
 * Expected outcome: Parent map always contains origin; land seaports are not expanded except as origin.
 * Exceptions: None.
 */
function walkNavalStrategicGraph(
  originH3: string,
  maxSteps: number,
  lookup: NavalStrategicHexLookup,
  neighborsOf: NavalStrategicNeighborsOf,
  blocked: ReadonlySet<string> | undefined,
  clampLandSeaportOriginToOneStep: boolean
): Map<string, string> {
  const parent = new Map<string, string>();
  const originAttrs = lookup(originH3);
  if (!originAttrs || !navalMayOccupyHex(originAttrs)) return parent;
  parent.set(originH3, originH3);
  const cap = effectiveNavalMaxSteps(originAttrs, maxSteps, clampLandSeaportOriginToOneStep);
  if (cap <= 0) return parent;

  const depth = new Map<string, number>();
  depth.set(originH3, 0);
  const queue: string[] = [originH3];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depth.get(current) ?? 0;
    if (currentDepth >= cap) continue;
    const currentAttrs = lookup(current);
    if (!currentAttrs) continue;
    // Land seaports are occupy-only: expand them solely when they are the origin (egress).
    if (isLandSeaportHex(currentAttrs) && current !== originH3) continue;

    for (const neighbor of neighborsOf(current)) {
      if (parent.has(neighbor)) continue;
      if (blocked?.has(neighbor)) continue;
      const neighborAttrs = lookup(neighbor);
      if (!neighborAttrs) continue;
      if (!navalMayOccupyHex(neighborAttrs)) continue;
      if (!navalMayTraverseStrategicEdge(currentAttrs, neighborAttrs)) continue;
      parent.set(neighbor, current);
      depth.set(neighbor, currentDepth + 1);
      queue.push(neighbor);
    }
  }
  return parent;
}

/**
 * Reconstructs origin→destination from a BFS parent map.
 *
 * Purpose: Shared path unwind for `findNavalStrategicPath`.
 * When to use: After a successful walk that contains `destinationH3`.
 * Expected outcome: Inclusive path from origin to destination.
 * Exceptions: Returns null if the destination is missing.
 */
function reconstructPath(parent: Map<string, string>, originH3: string, destinationH3: string): string[] | null {
  if (!parent.has(destinationH3)) return null;
  const path: string[] = [];
  let cursor = destinationH3;
  while (true) {
    path.unshift(cursor);
    const prev = parent.get(cursor);
    if (prev === undefined || prev === cursor) break;
    cursor = prev;
  }
  if (path[0] !== originH3) return null;
  return path;
}

/**
 * Finds a same-turn naval path that respects berth/egress edges and the caller’s step cap.
 *
 * Purpose: `plan_route` / `check_distance` / preview must not treat land seaports as water nodes.
 * When to use: Any naval route whose destination may be a land seaport or wet hex.
 * Expected outcome: Inclusive H3 path, or null when unreachable this turn.
 * Exceptions: Logs and returns null if lookup/neighbors throw unexpectedly.
 */
export function findNavalStrategicPath(args: FindNavalStrategicPathArgs): string[] | null {
  logDebug('navalStrategicPath findNavalStrategicPath', {
    originH3: args.originH3,
    destinationH3: args.destinationH3,
    maxSteps: args.maxSteps,
  });
  try {
    const originAttrs = args.lookup(args.originH3);
    if (!originAttrs || !navalMayOccupyHex(originAttrs)) return null;
    if (args.originH3 === args.destinationH3) return [args.originH3];
    const destAttrs = args.lookup(args.destinationH3);
    if (!destAttrs || !navalMayOccupyHex(destAttrs)) return null;
    if (args.blocked?.has(args.destinationH3)) return null;
    const neighborsOf = args.neighborsOf ?? defaultNeighborsOf;
    const parent = walkNavalStrategicGraph(
      args.originH3,
      args.maxSteps,
      args.lookup,
      neighborsOf,
      args.blocked,
      args.clampLandSeaportOriginToOneStep !== false
    );
    return reconstructPath(parent, args.originH3, args.destinationH3);
  } catch (err) {
    logError('navalStrategicPath findNavalStrategicPath failed', err);
    return null;
  }
}

/**
 * Returns hexes a naval unit can occupy this turn, including origin and berth endpoints.
 *
 * Purpose: Replaces disk+promoted-coastal destination lists for click, preview, and AI validation.
 * When to use: Pass the same `maxSteps` the matching path search would use.
 * Expected outcome: Set always contains origin when occupiable; inland ports with no wet last step are absent.
 * Exceptions: Logs and returns empty set on unexpected errors.
 */
export function getNavalStrategicReachableHexes(args: GetNavalStrategicReachableHexesArgs): Set<string> {
  logDebug('navalStrategicPath getNavalStrategicReachableHexes', {
    originH3: args.originH3,
    maxSteps: args.maxSteps,
  });
  try {
    const neighborsOf = args.neighborsOf ?? defaultNeighborsOf;
    const parent = walkNavalStrategicGraph(
      args.originH3,
      args.maxSteps,
      args.lookup,
      neighborsOf,
      args.blocked,
      args.clampLandSeaportOriginToOneStep !== false
    );
    return new Set(parent.keys());
  } catch (err) {
    logError('navalStrategicPath getNavalStrategicReachableHexes failed', err);
    return new Set();
  }
}

/**
 * Trace-level occupancy probe for a single hex (no graph walk).
 *
 * Purpose: Lets preview/commit log whether a hovered hex is occupiable without implying reachability.
 * When to use: Hover filtering before calling reachable-set BFS.
 * Expected outcome: True for transit and land seaports present in `lookup`.
 * Exceptions: False when lookup misses the hex.
 */
export function navalStrategicHexIsOccupiable(h3: string, lookup: NavalStrategicHexLookup): boolean {
  logTrace('navalStrategicPath navalStrategicHexIsOccupiable', { h3 });
  const attrs = lookup(h3);
  return Boolean(attrs && navalMayOccupyHex(attrs));
}

/**
 * Returns hex distance and estimated turns along a naval berth/egress path.
 *
 * Purpose: `check_distance` and `assess_unit` must treat a land seaport as a finite destination when a berth path exists.
 * When to use: Naval-only distance queries; pass the same movement budget the caller already uses.
 * Expected outcome: Null when no path exists; otherwise `hexDistance` is path edges and `estimatedTurns`
 * includes a one-step first turn when the origin is a land seaport.
 * Exceptions: Same-hex occupiable origin returns distance 0 and 0 turns.
 */
export function getNavalStrategicDistanceAndTurns(args: {
  originH3: string;
  destinationH3: string;
  lookup: NavalStrategicHexLookup;
  movementBudget: number;
  blocked?: ReadonlySet<string>;
  maxSteps?: number;
  /**
   * Optional neighbor function for non-H3 graphs.
   *
   * Contract: Same as `findNavalStrategicPath`.
   * When to use: Tests; omit in production.
   * Expected outcome: Injected adjacency is used instead of H3 rings.
   * Exceptions: None.
   */
  neighborsOf?: NavalStrategicNeighborsOf;
}): { hexDistance: number; estimatedTurns: number } | null {
  const originAttrs = args.lookup(args.originH3);
  const originIsLandSeaport = Boolean(originAttrs && isLandSeaportHex(originAttrs));
  const path = findNavalStrategicPath({
    originH3: args.originH3,
    destinationH3: args.destinationH3,
    maxSteps: args.maxSteps ?? Number.MAX_SAFE_INTEGER,
    lookup: args.lookup,
    blocked: args.blocked,
    neighborsOf: args.neighborsOf,
    clampLandSeaportOriginToOneStep: false,
  });
  if (!path) {
    logDebug('navalStrategicPath getNavalStrategicDistanceAndTurns', {
      originH3: args.originH3,
      destinationH3: args.destinationH3,
      movementBudget: args.movementBudget,
      originIsLandSeaport,
      reachable: false,
    });
    return null;
  }
  const hexDistance = Math.max(0, path.length - 1);
  const estimatedTurns = estimateNavalStrategicTurns(hexDistance, args.movementBudget, originIsLandSeaport);
  logDebug('navalStrategicPath getNavalStrategicDistanceAndTurns', {
    originH3: args.originH3,
    destinationH3: args.destinationH3,
    movementBudget: args.movementBudget,
    originIsLandSeaport,
    hexDistance,
    estimatedTurns,
    reachable: true,
  });
  return { hexDistance, estimatedTurns };
}
