import { cellToLatLng, gridDistance, gridDisk } from 'h3-js';
import { findPath } from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { terrainIsPassableForDomain } from '../pathfinding';
import { logDebug, logError } from '../logger';

interface GridDistanceFailureSample {
  candidateH3: string;
  error: string;
}

function approximateDistanceKm(fromH3: string, toH3: string): number {
  const [fromLat, fromLng] = cellToLatLng(fromH3);
  const [toLat, toLng] = cellToLatLng(toH3);
  const toRad = Math.PI / 180;
  const dLat = (toLat - fromLat) * toRad;
  const dLng = (toLng - fromLng) * toRad;
  const lat1 = fromLat * toRad;
  const lat2 = toLat * toRad;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const EARTH_RADIUS_KM = 6371;
  return EARTH_RADIUS_KM * c;
}

function tryDistanceWithFallback(referenceH3: string, candidateH3: string): { ok: true; distance: number; usedFallback: boolean } | { ok: false; error: string } {
  try {
    return { ok: true, distance: gridDistance(referenceH3, candidateH3), usedFallback: false };
  } catch (gridErr) {
    try {
      return { ok: true, distance: approximateDistanceKm(referenceH3, candidateH3), usedFallback: true };
    } catch (fallbackErr) {
      return { ok: false, error: `${String(gridErr)} | fallback failed: ${String(fallbackErr)}` };
    }
  }
}

function logGridDistanceFailureSummary(payload: {
  context: string;
  referenceH3: string;
  failureCount: number;
  fallbackCount?: number;
  samples: GridDistanceFailureSample[];
}): void {
  if ((payload.fallbackCount ?? 0) > 0) {
    logDebug(`${payload.context}: used coordinate-distance fallback`, {
      referenceH3: payload.referenceH3,
      fallbackCount: payload.fallbackCount,
    });
  }
  if (payload.failureCount <= 0) return;
  logError(`${payload.context}: gridDistance threw for candidate set`, {
    referenceH3: payload.referenceH3,
    failureCount: payload.failureCount,
    sampleFailures: payload.samples,
  });
}

export function nearestReachableWaterHexTo(
  originH3: string,
  refLandH3: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  getReachableHexes: (
    origin: string,
    hs: Set<string>,
    tb: Map<string, string>,
    passableFor: PassableDomain,
    blocked?: Set<string>
  ) => Set<string>,
  blocked?: Set<string>
): string | undefined {
  const reachableWater = getReachableHexes(originH3, hexSet, terrainByH3, 'water', blocked);
  let best: string | undefined;
  let bestDist = Infinity;
  let failureCount = 0;
  let fallbackCount = 0;
  const failureSamples: GridDistanceFailureSample[] = [];
  for (const h3 of reachableWater) {
    const distance = tryDistanceWithFallback(refLandH3, h3);
    if (!distance.ok) {
      failureCount += 1;
      if (failureSamples.length < 5) {
        failureSamples.push({ candidateH3: h3, error: distance.error });
      }
      continue;
    }
    if (distance.usedFallback) fallbackCount += 1;
    if (distance.distance < bestDist) {
      bestDist = distance.distance;
      best = h3;
    }
  }
  logGridDistanceFailureSummary({
    context: 'tool1Pathfinding nearestReachableWaterHexTo',
    referenceH3: refLandH3,
    failureCount,
    fallbackCount,
    samples: failureSamples,
  });
  return best;
}

export function nearestWaterHexTo(refH3: string, hexSet: Set<string>, terrainByH3: Map<string, string>): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  let failureCount = 0;
  let fallbackCount = 0;
  const failureSamples: GridDistanceFailureSample[] = [];
  for (const h3 of hexSet) {
    if (!terrainIsPassableForDomain(terrainByH3.get(h3), 'water')) continue;
    const distance = tryDistanceWithFallback(refH3, h3);
    if (!distance.ok) {
      failureCount += 1;
      if (failureSamples.length < 5) {
        failureSamples.push({ candidateH3: h3, error: distance.error });
      }
      continue;
    }
    if (distance.usedFallback) fallbackCount += 1;
    if (distance.distance < bestDist) {
      bestDist = distance.distance;
      best = h3;
    }
  }
  logGridDistanceFailureSummary({
    context: 'tool1Pathfinding nearestWaterHexTo',
    referenceH3: refH3,
    failureCount,
    fallbackCount,
    samples: failureSamples,
  });
  return best;
}

export function nearestAdjacentWaterOrCoastalHex(
  originH3: string,
  refTargetH3: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  blocked?: Set<string>
): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  let neighbors: string[] = [];
  let failureCount = 0;
  let fallbackCount = 0;
  const failureSamples: GridDistanceFailureSample[] = [];
  try {
    neighbors = gridDisk(originH3, 1);
  } catch (err) {
    logError('tool1Pathfinding nearestAdjacentWaterOrCoastalHex: gridDisk threw', {
      originH3,
      error: String(err),
    });
    neighbors = [];
  }
  for (const candidate of neighbors) {
    if (candidate === originH3) continue;
    if (!hexSet.has(candidate)) continue;
    if (blocked?.has(candidate)) continue;
    const terrain = terrainByH3.get(candidate) ?? 'land';
    if (!terrainIsPassableForDomain(terrain, 'water')) continue;
    const distance = tryDistanceWithFallback(refTargetH3, candidate);
    if (!distance.ok) {
      failureCount += 1;
      if (failureSamples.length < 5) {
        failureSamples.push({ candidateH3: candidate, error: distance.error });
      }
      continue;
    }
    if (distance.usedFallback) fallbackCount += 1;
    if (distance.distance < bestDistance) {
      bestDistance = distance.distance;
      best = candidate;
    }
  }
  logGridDistanceFailureSummary({
    context: 'tool1Pathfinding nearestAdjacentWaterOrCoastalHex',
    referenceH3: refTargetH3,
    failureCount,
    fallbackCount,
    samples: failureSamples,
  });
  return best;
}

export function prependSeaportEgressStep(path: string[] | null, originH3: string, seaportEgressHex?: string): string[] | null {
  if (!path) return null;
  if (!seaportEgressHex || path[0] !== seaportEgressHex) return path;
  return [originH3, ...path];
}

export function findPathWithOptionalAvoidanceRetry(payload: {
  routeOriginH3: string;
  destinationH3: string;
  hexSet: Set<string>;
  terrainByH3: Map<string, string>;
  passableFor: PassableDomain;
  blocked?: Set<string>;
  originH3: string;
  seaportEgressHex?: string;
  warnings?: string[];
  blockedRetryWarning?: string;
}): string[] | null {
  const first = prependSeaportEgressStep(
    findPath(
      payload.routeOriginH3,
      payload.destinationH3,
      payload.hexSet,
      payload.terrainByH3,
      payload.passableFor,
      payload.blocked
    ),
    payload.originH3,
    payload.seaportEgressHex
  );
  if (first || !payload.blocked) return first;
  const retried = prependSeaportEgressStep(
    findPath(
      payload.routeOriginH3,
      payload.destinationH3,
      payload.hexSet,
      payload.terrainByH3,
      payload.passableFor,
      undefined
    ),
    payload.originH3,
    payload.seaportEgressHex
  );
  if (retried && payload.blockedRetryWarning && payload.warnings) {
    payload.warnings.push(payload.blockedRetryWarning);
  }
  return retried;
}
