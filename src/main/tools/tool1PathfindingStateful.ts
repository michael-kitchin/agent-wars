import { gridDisk } from 'h3-js';
import { terrainIsPassableForDomain } from '../pathfinding';
import { logError } from '../logger';

export const STATEFUL_MAX_DESTINATIONS_PER_SESSION = 64;
export const STATEFUL_MAX_DEAD_STATES_PER_DESTINATION = 10_000;

export interface StatefulDestinationCache {
  deadStateSet: Set<string>;
  lastTouchedAtMs: number;
}

export interface PathfindingSessionStatefulCache {
  deadStateByDestination: Map<string, StatefulDestinationCache>;
}

export interface StatefulSearchStats {
  expandedStateCount: number;
  rejectedConsecutiveSpecialCount: number;
  deadStateCacheHitCount: number;
}

export interface StatefulLandSearchSessionData {
  hexSet: Set<string>;
  terrainByH3: Map<string, string>;
  rawTerrainByH3: Map<string, string>;
  terrainKindByH3: Map<string, string>;
  statefulCache: PathfindingSessionStatefulCache;
}

function isSpecialWaterOrArcticHex(h3Index: string, session: StatefulLandSearchSessionData): boolean {
  const terrainKind = session.terrainKindByH3.get(h3Index) ?? '';
  if (terrainKind === 'water' || terrainKind === 'arctic') return true;
  const terrain = session.rawTerrainByH3.get(h3Index) ?? '';
  return terrain === 'water' || terrain === 'arctic';
}

function buildStateKey(hexId: string, prevSpecial: boolean): string {
  return `${hexId}|${prevSpecial ? '1' : '0'}`;
}

function getOrCreateStatefulDestinationCache(
  session: StatefulLandSearchSessionData,
  destinationH3: string
): StatefulDestinationCache {
  const byDestination = session.statefulCache.deadStateByDestination;
  const existing = byDestination.get(destinationH3);
  const now = Date.now();
  if (existing) {
    existing.lastTouchedAtMs = now;
    byDestination.delete(destinationH3);
    byDestination.set(destinationH3, existing);
    return existing;
  }
  const created: StatefulDestinationCache = { deadStateSet: new Set<string>(), lastTouchedAtMs: now };
  byDestination.set(destinationH3, created);
  while (byDestination.size > STATEFUL_MAX_DESTINATIONS_PER_SESSION) {
    const oldestDestination = byDestination.keys().next().value;
    if (!oldestDestination) break;
    byDestination.delete(oldestDestination);
  }
  return created;
}

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
  const destinationCache = getOrCreateStatefulDestinationCache(payload.session, payload.destinationH3);
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
