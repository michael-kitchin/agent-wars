import { gridDisk } from 'h3-js';
import { terrainIsPassableForDomain } from '../pathfinding';
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
   * Specifies the contract for the `rejectedConsecutiveSpecialCount` member (rejectedConsecutiveSpecialCount: number;).

   * Contract: Describes stable behavior for callers of `rejectedConsecutiveSpecialCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rejectedConsecutiveSpecialCount: number;
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
   * Specifies the contract for the `terrainByH3` member (terrainByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `terrainByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainByH3: Map<string, string>;
    /**
   * Specifies the contract for the `rawTerrainByH3` member (rawTerrainByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `rawTerrainByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rawTerrainByH3: Map<string, string>;
    /**
   * Specifies the contract for the `terrainKindByH3` member (terrainKindByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `terrainKindByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainKindByH3: Map<string, string>;
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
 * Defines the `isSpecialWaterOrArcticHex` function shape (function isSpecialWaterOrArcticHex(h3Index: string, session: StatefulLandSearchSessionData): boolean).

 * Purpose: Supports maintainability by documenting why `isSpecialWaterOrArcticHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isSpecialWaterOrArcticHex(h3Index: string, session: StatefulLandSearchSessionData): boolean {
  const terrainKind = session.terrainKindByH3.get(h3Index) ?? '';
  if (terrainKind === 'water' || terrainKind === 'arctic') return true;
  const terrain = session.rawTerrainByH3.get(h3Index) ?? '';
  return terrain === 'water' || terrain === 'arctic';
}

/**
 * Defines the `buildStateKey` function shape (function buildStateKey(hexId: string, prevSpecial: boolean): string).

 * Purpose: Supports maintainability by documenting why `buildStateKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildStateKey(hexId: string, prevSpecial: boolean): string {
  return `${hexId}|${prevSpecial ? '1' : '0'}`;
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
 * Defines the `findLandPathWithStatefulRule` function shape (function findLandPathWithStatefulRule(payload: { originH3: string; destinationH3: string; session: StatefulLandSearchSessionData; blocked?: Set<stri).

 * Purpose: Supports maintainability by documenting why `findLandPathWithStatefulRule` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function findLandPathWithStatefulRule(payload: {
  originH3: string;
  destinationH3: string;
  session: StatefulLandSearchSessionData;
  blocked?: Set<string>;
}): { path: string[] | null; stats: StatefulSearchStats } {
  const stats: StatefulSearchStats = {
    expandedStateCount: 0,
    rejectedConsecutiveSpecialCount: 0,
    deadStateCacheHitCount: 0,
  };
  if (payload.originH3 === payload.destinationH3) return { path: [payload.originH3], stats };
  if (!payload.session.hexSet.has(payload.originH3) || !payload.session.hexSet.has(payload.destinationH3)) {
    return { path: null, stats };
  }
  const passable = (h3: string) => {
    if (!payload.session.hexSet.has(h3)) return false;
    if (payload.blocked?.has(h3)) return false;
    const terrain = payload.session.terrainByH3.get(h3) ?? 'land';
    return terrainIsPassableForDomain(terrain, 'land');
  };
  if (!passable(payload.originH3) || !passable(payload.destinationH3)) return { path: null, stats };
  const destinationCache = getOrCreateStatefulDestinationCache(
    payload.session,
    payload.originH3,
    payload.destinationH3,
    payload.blocked
  );
  const deadStateSet = destinationCache.deadStateSet;

  const queue: Array<{ stateKey: string; h3: string; prevSpecial: boolean }> = [];
  const parentByStateKey = new Map<string, string>();
  const visitedDistanceByStateKey = new Map<string, number>();
  const exploredStateKeys = new Set<string>();

  const originSpecial = isSpecialWaterOrArcticHex(payload.originH3, payload.session);
  const originStateKey = buildStateKey(payload.originH3, originSpecial);
  queue.push({ stateKey: originStateKey, h3: payload.originH3, prevSpecial: originSpecial });
  parentByStateKey.set(originStateKey, originStateKey);
  visitedDistanceByStateKey.set(originStateKey, 0);
  exploredStateKeys.add(originStateKey);

  let queueIndex = 0;
  let foundStateKey: string | null = null;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex]!;
    queueIndex += 1;
    stats.expandedStateCount += 1;
    if (current.h3 === payload.destinationH3) {
      foundStateKey = current.stateKey;
      break;
    }
    let neighbors: string[] = [];
    try {
      neighbors = gridDisk(current.h3, 1);
    } catch (err) {
      logError('tool1Pathfinding findLandPathWithStatefulRule: gridDisk threw', {
        currentH3: current.h3,
        error: String(err),
      });
      continue;
    }
    const currentDistance = visitedDistanceByStateKey.get(current.stateKey) ?? 0;
    for (const neighborH3 of neighbors) {
      if (neighborH3 === current.h3) continue;
      if (!passable(neighborH3)) continue;
      const nextSpecial = isSpecialWaterOrArcticHex(neighborH3, payload.session);
      if (current.prevSpecial && nextSpecial) {
        stats.rejectedConsecutiveSpecialCount += 1;
        continue;
      }
      const nextStateKey = buildStateKey(neighborH3, nextSpecial);
      if (deadStateSet.has(nextStateKey)) {
        stats.deadStateCacheHitCount += 1;
        continue;
      }
      const nextDistance = currentDistance + 1;
      const knownDistance = visitedDistanceByStateKey.get(nextStateKey);
      if (knownDistance != null && knownDistance <= nextDistance) continue;
      visitedDistanceByStateKey.set(nextStateKey, nextDistance);
      parentByStateKey.set(nextStateKey, current.stateKey);
      exploredStateKeys.add(nextStateKey);
      queue.push({ stateKey: nextStateKey, h3: neighborH3, prevSpecial: nextSpecial });
    }
  }

  if (!foundStateKey) {
    addDeadStatesBounded(deadStateSet, exploredStateKeys);
    return { path: null, stats };
  }

  const path: string[] = [];
  let cursor: string | undefined = foundStateKey;
  while (cursor) {
    const [cursorHex] = cursor.split('|');
    if (cursorHex) path.unshift(cursorHex);
    const previous = parentByStateKey.get(cursor);
    if (!previous || previous === cursor) break;
    cursor = previous;
  }
  return { path, stats };
}

/**
 * Defines the `findLandPathWithStatefulOptionalAvoidanceRetry` function shape (export function findLandPathWithStatefulOptionalAvoidanceRetry(payload: { originH3: string; destinationH3: string; session: StatefulLandSearchSessionDa).

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
  const firstAttempt = findLandPathWithStatefulRule({
    originH3: payload.originH3,
    destinationH3: payload.destinationH3,
    session: payload.session,
    blocked: payload.blocked,
  });
  if (firstAttempt.path || !payload.blocked) return firstAttempt;
  const retryAttempt = findLandPathWithStatefulRule({
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
      rejectedConsecutiveSpecialCount:
        firstAttempt.stats.rejectedConsecutiveSpecialCount + retryAttempt.stats.rejectedConsecutiveSpecialCount,
      deadStateCacheHitCount: firstAttempt.stats.deadStateCacheHitCount + retryAttempt.stats.deadStateCacheHitCount,
    },
  };
}

/**
 * Defines the `countArcticBlockedHexes` function shape (export function countArcticBlockedHexes( blocked: Set<string> | undefined, session: Pick<StatefulLandSearchSessionData, 'terrainKindByH3' | 'rawTerrainByH).

 * Purpose: Supports maintainability by documenting why `countArcticBlockedHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function countArcticBlockedHexes(
  blocked: Set<string> | undefined,
  session: Pick<StatefulLandSearchSessionData, 'terrainKindByH3' | 'rawTerrainByH3'>
): number {
  if (!blocked) return 0;
  let count = 0;
  for (const h3 of blocked) {
    const terrainKind = session.terrainKindByH3.get(h3) ?? '';
    const terrain = session.rawTerrainByH3.get(h3) ?? '';
    if (terrainKind === 'arctic' || terrain === 'arctic') count += 1;
  }
  return count;
}
