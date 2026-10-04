/**
 * One-step legal move destinations for AI order validation and prompt precomputation.
 * Land units use res-1 land-mass edge reachability; naval units use berth/egress strategic edges.
 */

import { gridDisk, gridDistance } from 'h3-js';
import { isDbReady, type GameStateSnapshot } from './gameDb';
import { logDebug, logTrace } from './logger';
import { passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import {
  getLandMassReachableHexes,
} from '../shared/landTraversalRes1';
import { strategicRangeOnState } from './weather/weatherMatch';
import { getRes1LandMassByH3 } from './terrainClassificationCache';
import { isEmbarkedLandUnit } from './gameActions/sealift';
import {
  getNavalStrategicReachableHexes,
  navalLookupForHexState,
} from './navalStrategicPath';

/**
 * Returns native movement terrain for a hex without promoting seaports to coastal.
 *
 * Purpose: Remaining call sites that still need a terrain string must not treat inland ports as water.
 * When to use: Pass any hex row; seaport counts are ignored for classification.
 * Expected outcome: The hex's own `terrain`, or `'land'` when the hex is missing.
 * Exceptions: None.
 */
export function resolveMovementTerrainForHex(
  hex: { h3Index: string; terrain: string } | undefined
): string {
  if (!hex) return 'land';
  return hex.terrain;
}

/**
 * Generation token so tests can drop dest-list entries without iterating a WeakMap.
 *
 * Purpose: `destCacheByState` is keyed by snapshot identity; bumping this invalidates every bucket.
 * When to use: `resetValidDestinationsCacheForTests` only.
 * Expected outcome: Later lookups treat any existing bucket as empty.
 * Exceptions: None.
 */
let destCacheGeneration = 0;

/**
 * Counts land/naval/air dest searches that actually ran (cache misses).
 *
 * Purpose: Contract tests assert stacked same-origin reuse without inspecting the WeakMap.
 * When to use: Reset via `resetValidDestinationsCacheForTests` before assertions.
 * Expected outcome: Increments once per unique cache key per snapshot until reset.
 * Exceptions: None.
 */
let destComputeCountForTests = 0;

/**
 * Dest lists keyed by game snapshot, then by origin/type/embark/debark.
 *
 * Purpose: Best Options already reused dests per collect call; order validation still called `getValidDestinations`
 * once per stacked unit. Same snapshot object + same reachability key share one search. Production snapshots are
 * new objects per `getGameState`; callers that mutate a snapshot in place must call `resetValidDestinationsCacheForTests`.
 * When to use: `getValidDestinations` only.
 * Expected outcome: Stored arrays are never returned by reference; callers get copies.
 * Exceptions: None.
 */
const destCacheByState = new WeakMap<
  GameStateSnapshot,
  { generation: number; byKey: Map<string, string[]> }
>();

/**
 * Cache key for one-step dest reuse across stacked units on the same snapshot.
 *
 * Purpose: Embarked cargo and assume-debarked validation must not share a slot with unembarked march dests.
 * Naval and air never embark, so they omit the DB lookup. Matches Best Options (`isDbReady` + land only).
 * When to use: `getValidDestinations` before looking up `destCacheByState`.
 * Expected outcome: Stable string; missing ids, non-land types, and a closed DB are treated as unembarked.
 * Exceptions: None.
 */
function validDestinationsCacheKey(
  unit: { id?: string; h3Index: string; unitType: string; weatherTags?: GameStateSnapshot['units'][number]['weatherTags'] },
  state: GameStateSnapshot,
  options?: { assumeDebarkedForReachability?: boolean }
): string {
  logTrace('oneStepMoveDestinations validDestinationsCacheKey', {
    unitId: unit.id,
    originH3: unit.h3Index,
    unitType: unit.unitType,
  });
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  const embarked = Boolean(wantLand && unit.id && isDbReady() && isEmbarkedLandUnit(unit.id));
  const debark = options?.assumeDebarkedForReachability ? '1' : '0';
  const row = unit.id ? state.units.find((candidate) => candidate.id === unit.id) : undefined;
  const range = strategicRangeOnState(
    { unitType: unit.unitType, h3Index: unit.h3Index, weatherTags: unit.weatherTags ?? row?.weatherTags },
    state
  );
  return `${unit.h3Index}|${unit.unitType}|range:${range}|emb:${embarked ? '1' : '0'}|debark:${debark}`;
}

/**
 * Clears dest-list reuse and the test compute counter.
 *
 * Purpose: Isolates dest-cache contract tests from earlier calls in the same process.
 * When to use: Start of tests that assert `getValidDestinationsComputeCountForTests`.
 * Expected outcome: Next lookup misses even when the snapshot object was used before the reset.
 * Exceptions: None.
 */
export function resetValidDestinationsCacheForTests(): void {
  logDebug('oneStepMoveDestinations resetValidDestinationsCacheForTests');
  destCacheGeneration += 1;
  destComputeCountForTests = 0;
}

/**
 * Returns how many dest searches ran since the last test reset.
 *
 * Purpose: Contract test for stacked-origin reuse without asserting WeakMap internals.
 * When to use: After calling `getValidDestinations` in dest-cache tests.
 * Expected outcome: 1 after two stacked same-hex same-type calls; 2 after a different origin.
 * Exceptions: None.
 */
export function getValidDestinationsComputeCountForTests(): number {
  logTrace('oneStepMoveDestinations getValidDestinationsComputeCountForTests', {
    destComputeCountForTests,
  });
  return destComputeCountForTests;
}

/**
 * Returns the dest-list bucket for `state`, creating or replacing it after a test reset.
 *
 * Purpose: WeakMap entries survive reset; the generation stamp drops stale maps.
 * When to use: `getValidDestinations` cache lookup.
 * Expected outcome: A map that only contains entries stored since the current `destCacheGeneration`.
 * Exceptions: None.
 */
function destCacheBucketForState(
  state: GameStateSnapshot
): Map<string, string[]> {
  const existing = destCacheByState.get(state);
  if (existing && existing.generation === destCacheGeneration) return existing.byKey;
  const byKey = new Map<string, string[]>();
  destCacheByState.set(state, { generation: destCacheGeneration, byKey });
  return byKey;
}

/**
 * Returns all legal destinations for a unit within movement range (including its current hex when occupiable).
 *
 * Purpose: Single source of truth for AI order generation and order validation movement legality on the strategic map.
 * When to use: Pass the acting unit and the current game snapshot; set `assumeDebarkedForReachability` when validating opponent movement that will auto-debark before marching.
 * Expected outcome: Land units: hexes reachable via land-mass edges within range. Naval: berth/egress BFS within range. Cache hit and miss both log at TRACE.
 * Exceptions: Never throws; pentagon edges fall through to a legacy scan for non-naval water-like types only.
 *
 * Tactical Best Options uses `collectTacticalLegalMoveDestinationRes4Hexes` instead (res4 MP reachability with the same
 * “one origin search → list destinations” shape as `getLandMassReachableHexes` here).
 */
export function getValidDestinations(
  unit: { id?: string; h3Index: string; unitType: string },
  state: GameStateSnapshot,
  options?: { assumeDebarkedForReachability?: boolean }
): string[] {
  const key = validDestinationsCacheKey(unit, state, options);
  const bucket = destCacheBucketForState(state);
  const hit = bucket.get(key);
  if (hit) {
    logTrace('oneStepMoveDestinations getValidDestinations cache hit', {
      unitId: unit.id,
      unitType: unit.unitType,
      originH3: unit.h3Index,
    });
    return [...hit];
  }
  logTrace('oneStepMoveDestinations getValidDestinations cache miss', {
    unitId: unit.id,
    unitType: unit.unitType,
    originH3: unit.h3Index,
  });
  destComputeCountForTests += 1;
  const computed = computeValidDestinations(unit, state, options);
  bucket.set(key, [...computed]);
  return computed;
}

/**
 * Runs one land-mass / naval / disk dest search with no dest-list cache.
 *
 * Purpose: Kept separate so `getValidDestinations` can record a miss, store a copy, and return without aliasing.
 * When to use: Cache miss in `getValidDestinations` only.
 * Expected outcome: Same dest contract as the public function; land embarked-without-debark returns only the origin.
 * Exceptions: Never throws; pentagon edges fall through to a legacy scan for non-naval water-like types only.
 */
function computeValidDestinations(
  unit: { id?: string; h3Index: string; unitType: string },
  state: GameStateSnapshot,
  options?: { assumeDebarkedForReachability?: boolean }
): string[] {
  const row = unit.id ? state.units.find((candidate) => candidate.id === unit.id) : undefined;
  const range = strategicRangeOnState(
    { unitType: unit.unitType, h3Index: unit.h3Index, weatherTags: row?.weatherTags },
    state
  );
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  const hexSet = new Set(state.hexes.map((h) => h.h3Index));

  if (wantLand) {
    if (unit.id && isDbReady() && isEmbarkedLandUnit(unit.id) && !options?.assumeDebarkedForReachability) {
      return [unit.h3Index];
    }
    return [...getLandMassReachableHexes({
      originH3: unit.h3Index,
      hexSet,
      data: getRes1LandMassByH3(),
      maxDepth: range,
    })];
  }

  if (unit.unitType === 'naval') {
    const lookup = navalLookupForHexState(state, state.hexes, state.res1Infrastructure);
    return [...getNavalStrategicReachableHexes({
      originH3: unit.h3Index,
      maxSteps: range,
      lookup,
    })];
  }

  const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
  const valid: string[] = [unit.h3Index];

  const applyNavalFilter = (h3Index: string): boolean => {
    const hex = hexByH3.get(h3Index);
    return passabilityAllowsNavalUnit(resolveMovementTerrainForHex(hex));
  };

  try {
    const candidates = gridDisk(unit.h3Index, range);
    for (const h3 of candidates) {
      if (h3 === unit.h3Index || !hexSet.has(h3)) continue;
      if (!applyNavalFilter(h3)) continue;
      valid.push(h3);
    }
    return valid;
  } catch {
    /* pentagon edge — fall back to legacy full scan */
  }

  for (const h of state.hexes) {
    if (h.h3Index === unit.h3Index) continue;
    let dist: number;
    try {
      dist = gridDistance(unit.h3Index, h.h3Index);
    } catch {
      continue;
    }
    if (dist < 1 || dist > range) continue;
    if (!applyNavalFilter(h.h3Index)) continue;
    valid.push(h.h3Index);
  }
  return valid;
}

/**
 * Returns legal one-step destinations filtered to hexes not currently occupied by any unit.
 *
 * Purpose: Suggestion helper for orderless/adjacent-cell listings that prefer empty closing hexes. Friendly
 * stacking is legal; `getValidDestinations` (order validation) does not apply this filter.
 * When to use: Use instead of `getValidDestinations` when the caller wants empty dests for briefing suggestions.
 * Expected outcome: Subset of `getValidDestinations` with hexes currently holding any unit removed.
 * Exceptions: Never throws.
 */
export function getValidDestinationsUnoccupied(
  unit: { id?: string; h3Index: string; unitType: string },
  state: GameStateSnapshot,
  options?: { assumeDebarkedForReachability?: boolean }
): string[] {
  const occupied = new Set(state.units.map((u) => u.h3Index));
  return getValidDestinations(unit, state, options).filter((h3) => !occupied.has(h3));
}
