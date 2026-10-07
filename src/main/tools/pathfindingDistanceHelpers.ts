import { gridDisk } from 'h3-js';
import {
  computeGridDistancePure,
  computeGridDistanceWithPathFallbackPure,
} from '../../shared/h3GridRangePure';
import { findPath } from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import type { LandMassByH3 } from '../../shared/landTraversalStrategic';
import { terrainIsPassableForDomain } from '../pathfinding';
import { logDebug, logError, logTrace } from '../logger';

/**
 * Documents the `GridDistanceFailureSample` interface as a named contract surface (interface GridDistanceFailureSample).

 * Purpose: Supports maintainability by documenting why `GridDistanceFailureSample` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface GridDistanceFailureSample {
    /**
   * Specifies the contract for the `candidateH3` member (candidateH3: string;).

   * Contract: Describes stable behavior for callers of `candidateH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
candidateH3: string;
    /**
   * Specifies the contract for the `error` member (error: string;).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error: string;
}

/**
 * Returns the grid-step distance between two cells, reporting whether the BFS fallback was needed.
 *
 * Purpose: The "nearest water hex" scans rank candidates by this number, so every candidate has to be measured in the
 * same unit. An earlier version returned great-circle **kilometres** when H3 threw, which made a face-crossing
 * candidate score in the hundreds against neighbours scoring single digits — the genuinely closest cell could never
 * win. Hex steps throughout removes that bias.
 * When to use: Only from the nearest-hex scans in this module; `usedFallback` feeds their telemetry counters.
 * Expected outcome: Non-negative hex-step count; `usedFallback` true only when the straight-line APIs failed.
 * Exceptions: None; an underivable pair returns `ok: false` so the caller can count and skip it.
 */
function tryDistanceWithFallback(
  referenceH3: string,
  candidateH3: string
): { ok: true; distance: number; usedFallback: boolean } | { ok: false; error: string } {
  const direct = computeGridDistancePure(referenceH3, candidateH3);
  if (direct !== null) return { ok: true, distance: direct, usedFallback: false };
  const derived = computeGridDistanceWithPathFallbackPure(referenceH3, candidateH3);
  if (derived !== null) return { ok: true, distance: derived, usedFallback: true };
  return { ok: false, error: 'no derivable grid distance for pair' };
}

/**
 * Defines the `logGridDistanceFailureSummary` function shape (function logGridDistanceFailureSummary(payload: { context: string; referenceH3: string; failureCount: number; fallbackCount?: number; samples: Gr).

 * Purpose: Supports maintainability by documenting why `logGridDistanceFailureSummary` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `nearestReachableWaterHexTo` function shape (export function nearestReachableWaterHexTo( originH3: string, refLandH3: string, hexSet: Set<string>, terrainByH3: Map<string, string>, getReacha).

 * Purpose: Supports maintainability by documenting why `nearestReachableWaterHexTo` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    context: 'pathfinding nearestReachableWaterHexTo',
    referenceH3: refLandH3,
    failureCount,
    fallbackCount,
    samples: failureSamples,
  });
  return best;
}

/**
 * Defines the `nearestWaterHexTo` function shape (export function nearestWaterHexTo(refH3: string, hexSet: Set<string>, terrainByH3: Map<string, string>): string | undefined).

 * Purpose: Supports maintainability by documenting why `nearestWaterHexTo` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    context: 'pathfinding nearestWaterHexTo',
    referenceH3: refH3,
    failureCount,
    fallbackCount,
    samples: failureSamples,
  });
  return best;
}

/**
 * Defines the `nearestAdjacentWaterOrCoastalHex` function shape (export function nearestAdjacentWaterOrCoastalHex( originH3: string, refTargetH3: string, hexSet: Set<string>, terrainByH3: Map<string, string>, b).

 * Purpose: Supports maintainability by documenting why `nearestAdjacentWaterOrCoastalHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    logError('pathfinding nearestAdjacentWaterOrCoastalHex: gridDisk threw', {
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
    context: 'pathfinding nearestAdjacentWaterOrCoastalHex',
    referenceH3: refTargetH3,
    failureCount,
    fallbackCount,
    samples: failureSamples,
  });
  return best;
}

/**
 * Defines the `prependSeaportEgressStep` function shape (export function prependSeaportEgressStep(path: string[] | null, originH3: string, seaportEgressHex?: string): string[] | null).

 * Purpose: Supports maintainability by documenting why `prependSeaportEgressStep` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function prependSeaportEgressStep(path: string[] | null, originH3: string, seaportEgressHex?: string): string[] | null {
  if (!path) return null;
  if (!seaportEgressHex || path[0] !== seaportEgressHex) return path;
  return [originH3, ...path];
}

/**
 * Defines the `findPathWithOptionalAvoidanceRetry` function shape (export function findPathWithOptionalAvoidanceRetry(payload: { routeOriginH3: string; destinationH3: string; hexSet: Set<string>; terrainByH3: Map<st).

 * Purpose: Supports maintainability by documenting why `findPathWithOptionalAvoidanceRetry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * A `land` search additionally requires `landMass`; omitting it makes every land route fail.
 * Exceptions: None.
 */
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
  landMass?: LandMassByH3;
}): string[] | null {
  const first = prependSeaportEgressStep(
    findPath(
      payload.routeOriginH3,
      payload.destinationH3,
      payload.hexSet,
      payload.terrainByH3,
      payload.passableFor,
      payload.blocked,
      payload.landMass
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
      undefined,
      payload.landMass
    ),
    payload.originH3,
    payload.seaportEgressHex
  );
  if (retried && payload.blockedRetryWarning && payload.warnings) {
    payload.warnings.push(payload.blockedRetryWarning);
  }
  return retried;
}

/** Player id of the AI commander, whose own units supply `check_distance` weather tags first. */
const CHECK_DISTANCE_AI_PLAYER_ID = 'opponent';

/**
 * Picks the unit whose weather tags `check_distance` uses for one start cell.
 *
 * Purpose: `check_distance` names a unit type rather than a unit, but weather budgets and enter costs depend on the
 * mover's tags. The AI is asking about its own forces, so its unit wins when both sides share the cell.
 * When to use: Strategic and battle `check_distance`, before computing the movement budget.
 * Expected outcome: The first AI unit of that type on the cell, else the first unit of that type from any player, else
 * undefined, which callers treat as an untagged mover.
 * Exceptions: None.
 */
export function checkDistanceTagSourceUnit<
  T extends { readonly player: string; readonly h3Index: string; readonly unitType: string },
>(units: readonly T[], fromH3: string, unitType: string): T | undefined {
  const here = units.filter((u) => u.h3Index === fromH3 && u.unitType === unitType);
  const picked = here.find((u) => u.player === CHECK_DISTANCE_AI_PLAYER_ID) ?? here[0];
  logTrace('pathfindingDistanceHelpers checkDistanceTagSourceUnit', {
    fromH3,
    unitType,
    candidateCount: here.length,
    pickedPlayer: picked?.player ?? null,
  });
  return picked;
}
