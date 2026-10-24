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
 * One cell whose grid distance could not be measured.
 *
 * Purpose: The nearest-hex scans log a few of these instead of one line per cell.
 * When to use: The `samples` list of `logGridDistanceFailureSummary`.
 * Expected outcome: The cell id and the reason `tryDistanceWithFallback` gave.
 * Exceptions: None.
 */
interface GridDistanceFailureSample {
    /**
   * The cell that could not be measured.
   *
   * Contract: An H3 index from the scan.
   * When to use: The log's sample list.
   * Expected outcome: The candidate that failed.
   * Exceptions: None.
   */
candidateH3: string;
    /**
   * Why the distance could not be derived.
   *
   * Contract: The `error` string from `tryDistanceWithFallback`.
   * When to use: The log's sample list.
   * Expected outcome: A short reason, not a thrown exception.
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
 * Logs a scan's fallback count and a sample of cells whose distance could not be measured.
 *
 * Purpose: A nearest-hex scan can fail on many cells. One summary is enough to see that.
 * When to use: After `nearestReachableWaterHexTo`, `nearestWaterHexTo`, or `nearestAdjacentWaterOrCoastalHex`.
 * Expected outcome: A debug line when any candidate used the path fallback. An error line when any candidate had no distance, with at most the samples the caller kept.
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
 * The reachable water cell closest to a land reference.
 *
 * Purpose: A naval route that starts inland needs a water cell the ship can actually reach.
 * When to use: When the caller already has a reachability function for the water domain.
 * Expected outcome: The reachable water cell with the smallest grid distance to `refLandH3`, or undefined when none is reachable. Failures are logged and skipped.
 * Exceptions: None. `getReachableHexes` may throw; this function does not catch that.
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
 * The water cell in the set closest to a reference cell.
 *
 * Purpose: Callers that do not need reachability still need the nearest water cell by grid steps.
 * When to use: A scan of `hexSet` for passable water.
 * Expected outcome: The passable water cell with the smallest grid distance to `refH3`, or undefined when the set has none. Failures are logged and skipped.
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
 * The neighboring water cell closest to a target.
 *
 * Purpose: A one-step egress into water should be the neighbor nearest the route's target.
 * When to use: When the mover is on land and the next cell must be water or coast.
 * Expected outcome: The passable water neighbor of `originH3` closest to `refTargetH3`, skipping blocked cells, or undefined when none qualifies. A bad origin logs and returns undefined.
 * Exceptions: None. `gridDisk` errors are logged.
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
 * Puts the land origin in front of a path that starts at the seaport's water cell.
 *
 * Purpose: Pathfinding starts on water. The player still needs to see the step off the land hex.
 * When to use: After `findPath` when a seaport egress cell was used as the route origin.
 * Expected outcome: Null when `path` is null. The path unchanged when it does not start at `seaportEgressHex`. Otherwise `originH3` followed by the path.
 * Exceptions: None.
 */
export function prependSeaportEgressStep(path: string[] | null, originH3: string, seaportEgressHex?: string): string[] | null {
  if (!path) return null;
  if (!seaportEgressHex || path[0] !== seaportEgressHex) return path;
  return [originH3, ...path];
}

/**
 * Finds a path, and tries once more without the blocked set when the first search fails.
 *
 * Purpose: A blocked cell should not hide the only route. The retry says so in `warnings`.
 * When to use: Route preview and order paths that may avoid enemy or occupied cells.
 * Expected outcome: The first path, including a seaport egress step when one applies. When that fails and `blocked` was set, the same search without `blocked`, and `blockedRetryWarning` pushed onto `warnings` when both are set. A `land` search additionally requires `landMass`; omitting it makes every land route fail.
 * Exceptions: None. `findPath` failures come back as null.
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

/**
 * Picks the unit whose weather tags `check_distance` uses for one start cell.
 *
 * Purpose: `check_distance` names a unit type rather than a unit, but weather budgets and enter costs depend on the
 * mover's tags. The AI is asking about its own forces, so its unit wins when both sides share the cell.
 * When to use: Strategic and battle `check_distance`, before computing the movement budget.
 * Expected outcome: `ownPlayerId` is required. The first unit of that player and type on the cell, else the first unit of that type from any player, else
 * undefined, which callers treat as an untagged mover.
 * Exceptions: None.
 */
export function checkDistanceTagSourceUnit<
  T extends { readonly player: string; readonly h3Index: string; readonly unitType: string },
>(
  units: readonly T[],
  fromH3: string,
  unitType: string,
  ownPlayerId: string
): T | undefined {
  const here = units.filter((u) => u.h3Index === fromH3 && u.unitType === unitType);
  const picked = here.find((u) => u.player === ownPlayerId) ?? here[0];
  logTrace('pathfindingDistanceHelpers checkDistanceTagSourceUnit', {
    fromH3,
    unitType,
    candidateCount: here.length,
    pickedPlayer: picked?.player ?? null,
  });
  return picked;
}
