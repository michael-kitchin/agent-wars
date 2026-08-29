import { gridDisk } from 'h3-js';
import {
  canLandUnitTraverseEdge,
  landUnitCanOccupyHex,
  type LandMassByH3,
} from '../../shared/landTraversalRes1';
import { logError } from '../logger';

/**
 * Documents the module-scope binding `STATEFUL_MAX_DESTINATIONS_PER_SESSION` (STATEFUL_MAX_DESTINATIONS_PER_SESSION).

 * Purpose: Supports maintainability by documenting why `STATEFUL_MAX_DESTINATIONS_PER_SESSION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const STATEFUL_MAX_DESTINATIONS_PER_SESSION = 64;
/**
 * Documents the module-scope binding `STATEFUL_MAX_DEAD_STATES_PER_DESTINATION` (STATEFUL_MAX_DEAD_STATES_PER_DESTINATION).

 * Purpose: Supports maintainability by documenting why `STATEFUL_MAX_DEAD_STATES_PER_DESTINATION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const STATEFUL_MAX_DEAD_STATES_PER_DESTINATION = 10_000;

/**
 * Documents the `StatefulDestinationCache` interface as a named contract surface (export interface StatefulDestinationCache).

 * Purpose: Supports maintainability by documenting why `StatefulDestinationCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface StatefulDestinationCache {
    /**
   * Specifies the contract for the `deadStateSet` member (deadStateSet: Set<string>;).

   * Contract: Describes stable behavior for callers of `deadStateSet` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
deadStateSet: Set<string>;
    /**
   * Specifies the contract for the `lastTouchedAtMs` member (lastTouchedAtMs: number;).

   * Contract: Describes stable behavior for callers of `lastTouchedAtMs` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lastTouchedAtMs: number;
}

/**
 * Documents the `PathfindingSessionStatefulCache` interface as a named contract surface (export interface PathfindingSessionStatefulCache).

 * Purpose: Supports maintainability by documenting why `PathfindingSessionStatefulCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PathfindingSessionStatefulCache {
    /**
   * Specifies the contract for the `deadStateByDestination` member (deadStateByDestination: Map<string, StatefulDestinationCache>;).

   * Contract: Describes stable behavior for callers of `deadStateByDestination` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
deadStateByDestination: Map<string, StatefulDestinationCache>;
}

/**
 * Documents the `StatefulSearchStats` interface as a named contract surface (export interface StatefulSearchStats).

 * Purpose: Supports maintainability by documenting why `StatefulSearchStats` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface StatefulSearchStats {
    /**
   * Specifies the contract for the `expandedStateCount` member (expandedStateCount: number;).

   * Contract: Describes stable behavior for callers of `expandedStateCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
expandedStateCount: number;
    /**
   * Specifies the contract for the `deadStateCacheHitCount` member (deadStateCacheHitCount: number;).

   * Contract: Describes stable behavior for callers of `deadStateCacheHitCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
deadStateCacheHitCount: number;
}

/**
 * Documents the `StatefulLandSearchSessionData` interface as a named contract surface (export interface StatefulLandSearchSessionData).

 * Purpose: Supports maintainability by documenting why `StatefulLandSearchSessionData` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface StatefulLandSearchSessionData {
    /**
   * Specifies the contract for the `hexSet` member (hexSet: Set<string>;).

   * Contract: Describes stable behavior for callers of `hexSet` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexSet: Set<string>;
    /**
   * Specifies the contract for the `landMass` member (landMass: LandMassByH3;).

   * Contract: Precomputed res-1 continent/island membership used for land-unit edge validation.
   * When to use: Every land BFS expansion in this module.
   * Expected outcome: Complete map keyed by res-1 h3 index.
   * Exceptions: None.
   */
landMass: LandMassByH3;
    /**
   * Specifies the contract for the `statefulCache` member (statefulCache: PathfindingSessionStatefulCache;).

   * Contract: Describes stable behavior for callers of `statefulCache` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
statefulCache: PathfindingSessionStatefulCache;
}

/**
 * Defines the `buildBlockedSetSignature` function shape (function buildBlockedSetSignature(blocked: Set<string> | undefined): string).

 * Purpose: Supports maintainability by documenting why `buildBlockedSetSignature` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildBlockedSetSignature(blocked: Set<string> | undefined): string {
  if (!blocked) return 'none';
  if (blocked.size === 0) return 'empty';
  return [...blocked].sort().join(',');
}

/**
 * Defines the `buildDestinationCacheKey` function shape (function buildDestinationCacheKey(originH3: string, destinationH3: string, blocked: Set<string> | undefined): string).

 * Purpose: Supports maintainability by documenting why `buildDestinationCacheKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildDestinationCacheKey(originH3: string, destinationH3: string, blocked: Set<string> | undefined): string {
  return `${originH3}->${destinationH3}|blocked:${buildBlockedSetSignature(blocked)}`;
}

/**
 * Defines the `getOrCreateStatefulDestinationCache` function shape (function getOrCreateStatefulDestinationCache( session: StatefulLandSearchSessionData, originH3: string, destinationH3: string, blocked: Set<string>).

 * Purpose: Supports maintainability by documenting why `getOrCreateStatefulDestinationCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getOrCreateStatefulDestinationCache(
  session: StatefulLandSearchSessionData,
  originH3: string,
  destinationH3: string,
  blocked: Set<string> | undefined
): StatefulDestinationCache {
  const byDestination = session.statefulCache.deadStateByDestination;
  const destinationCacheKey = buildDestinationCacheKey(originH3, destinationH3, blocked);
  const existing = byDestination.get(destinationCacheKey);
  const now = Date.now();
  if (existing) {
    existing.lastTouchedAtMs = now;
    byDestination.delete(destinationCacheKey);
    byDestination.set(destinationCacheKey, existing);
    return existing;
  }
  const created: StatefulDestinationCache = { deadStateSet: new Set<string>(), lastTouchedAtMs: now };
  byDestination.set(destinationCacheKey, created);
  while (byDestination.size > STATEFUL_MAX_DESTINATIONS_PER_SESSION) {
    const oldestDestination = byDestination.keys().next().value;
    if (!oldestDestination) break;
    byDestination.delete(oldestDestination);
  }
  return created;
}

/**
 * Defines the `addDeadStatesBounded` function shape (function addDeadStatesBounded(deadStateSet: Set<string>, states: Iterable<string>): void).

 * Purpose: Supports maintainability by documenting why `addDeadStatesBounded` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function addDeadStatesBounded(deadStateSet: Set<string>, states: Iterable<string>): void {
  for (const stateKey of states) {
    deadStateSet.add(stateKey);
  }
  while (deadStateSet.size > STATEFUL_MAX_DEAD_STATES_PER_DESTINATION) {
    const oldestState = deadStateSet.keys().next().value;
    if (!oldestState) break;
    deadStateSet.delete(oldestState);
  }
}

/**
 * Defines the `findLandPathWithLandMassRule` function shape (function findLandPathWithLandMassRule(payload:).

 * Purpose: Supports maintainability by documenting why `findLandPathWithLandMassRule` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function findLandPathWithLandMassRule(payload: {
  originH3: string;
  destinationH3: string;
  session: StatefulLandSearchSessionData;
  blocked?: Set<string>;
}): { path: string[] | null; stats: StatefulSearchStats } {
  const stats: StatefulSearchStats = {
    expandedStateCount: 0,
    deadStateCacheHitCount: 0,
  };
  if (payload.originH3 === payload.destinationH3) return { path: [payload.originH3], stats };
  if (!payload.session.hexSet.has(payload.originH3) || !payload.session.hexSet.has(payload.destinationH3)) {
    return { path: null, stats };
  }
  if (payload.blocked?.has(payload.originH3) || payload.blocked?.has(payload.destinationH3)) {
    return { path: null, stats };
  }
  if (!landUnitCanOccupyHex(payload.destinationH3, payload.session.landMass)) {
    return { path: null, stats };
  }

  const destinationCache = getOrCreateStatefulDestinationCache(
    payload.session,
    payload.originH3,
    payload.destinationH3,
    payload.blocked
  );
  const deadStateSet = destinationCache.deadStateSet;

  const queue: string[] = [payload.originH3];
  const parentByH3 = new Map<string, string>();
  parentByH3.set(payload.originH3, payload.originH3);
  const exploredH3 = new Set<string>([payload.originH3]);

  let queueIndex = 0;
  let foundH3: string | null = null;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex]!;
    queueIndex += 1;
    stats.expandedStateCount += 1;
    if (current === payload.destinationH3) {
      foundH3 = current;
      break;
    }
    let neighbors: string[] = [];
    try {
      neighbors = gridDisk(current, 1);
    } catch (err) {
      logError('pathfinding findLandPathWithLandMassRule: gridDisk threw', {
        currentH3: current,
        error: String(err),
      });
      continue;
    }
    for (const neighborH3 of neighbors) {
      if (neighborH3 === current) continue;
      if (!payload.session.hexSet.has(neighborH3)) continue;
      if (payload.blocked?.has(neighborH3)) continue;
      if (parentByH3.has(neighborH3)) continue;
      if (!canLandUnitTraverseEdge(current, neighborH3, payload.session.landMass)) continue;
      if (deadStateSet.has(neighborH3)) {
        stats.deadStateCacheHitCount += 1;
        continue;
      }
      parentByH3.set(neighborH3, current);
      exploredH3.add(neighborH3);
      queue.push(neighborH3);
    }
  }

  if (!foundH3) {
    addDeadStatesBounded(deadStateSet, exploredH3);
    return { path: null, stats };
  }

  const path: string[] = [];
  let cursor: string | undefined = foundH3;
  while (cursor) {
    path.unshift(cursor);
    const previous = parentByH3.get(cursor);
    if (!previous || previous === cursor) break;
    cursor = previous;
  }
  return { path, stats };
}

/**
 * Defines the `findLandPathWithStatefulOptionalAvoidanceRetry` function shape (export function findLandPathWithStatefulOptionalAvoidanceRetry(payload:).

 * Purpose: Supports maintainability by documenting why `findLandPathWithStatefulOptionalAvoidanceRetry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function findLandPathWithStatefulOptionalAvoidanceRetry(payload: {
  originH3: string;
  destinationH3: string;
  session: StatefulLandSearchSessionData;
  blocked?: Set<string>;
  warnings?: string[];
  blockedRetryWarning?: string;
}): { path: string[] | null; stats: StatefulSearchStats } {
  const firstAttempt = findLandPathWithLandMassRule({
    originH3: payload.originH3,
    destinationH3: payload.destinationH3,
    session: payload.session,
    blocked: payload.blocked,
  });
  if (firstAttempt.path || !payload.blocked) return firstAttempt;
  const retryAttempt = findLandPathWithLandMassRule({
    originH3: payload.originH3,
    destinationH3: payload.destinationH3,
    session: payload.session,
    blocked: undefined,
  });
  if (retryAttempt.path && payload.blockedRetryWarning && payload.warnings) {
    payload.warnings.push(payload.blockedRetryWarning);
  }
  return {
    path: retryAttempt.path,
    stats: {
      expandedStateCount: firstAttempt.stats.expandedStateCount + retryAttempt.stats.expandedStateCount,
      deadStateCacheHitCount: firstAttempt.stats.deadStateCacheHitCount + retryAttempt.stats.deadStateCacheHitCount,
    },
  };
}
