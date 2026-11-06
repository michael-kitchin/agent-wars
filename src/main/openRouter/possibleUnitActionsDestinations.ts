/**
 * Destination discovery for possible-action collection: air ferry and strike hexes, and the per-request cache that
 * lets stacked units share destination lists.
 */

import { gridDisk } from 'h3-js';
import { findReachableAirportFerryDestinations } from '../../shared/airportFerryRoute';
import { computeGridDistancePure, isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import type { GameStateSnapshot } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { WeatherState } from '../../shared/weatherBonusTypes';
import {
  effectiveTacticalMovementPointBudgetForMarchLeg,
  tacticalMovementTerrainAnchorH3,
} from '../../shared/tacticalTerrainCombatModifiers';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { terrainBonusMarchCategoryForMover } from '../../shared/terrainBonusMarch';
import { isWithinAirStrikeGridRange } from '../gameActions/gridRange';
import { strategicFerryRangeOnState } from '../weather/weatherMatch';
import { logDebug, logInfo, logTrace } from '../logger';
import { logHexControllerParityMismatch } from '../snapshotDbParity';
import { airBaseHasIntactAirport, getInfra, type PossibleActionsIndexedState } from './possibleUnitActionsIndexedState';

/**
 * Lists friendly-controlled hexes with intact airports that a strategic air unit can ferry to.
 *
 * Purpose: Ferry rows must match the ferry orders validation accepts, including the shorter range into snow the unit
 *   lacks when the weather bonus is on.
 * When to use: From `collectAggregatedPossibleActionRows` for strategic air units.
 * Expected outcome: Hexes other than the base that a chain of the owner's intact airports can reach, one hop at a time.
 *   An unmeasured hop still counts when the disk fallback includes it. Callers must not re-apply range checks. Empty
 *   for non-air units and when the base airport is damaged.
 * Exceptions: None.
 */
export function collectLegalFerryDestinationHexes(
  unit: { id: string; h3Index: string; player: string; unitType: string; weatherTags?: readonly WeatherState[] },
  indexed: PossibleActionsIndexedState,
  state: GameStateSnapshot
): string[] {
  logTrace('possibleUnitActions collectLegalFerryDestinationHexes', { unitId: unit.id, h3Index: unit.h3Index });
  if (unit.unitType !== 'air') return [];
  if (!airBaseHasIntactAirport(indexed, unit.h3Index)) return [];
  const nodes = [...indexed.hexSet]
    .filter((h3) => getInfra(indexed, h3).airport > 0)
    .map((h3) => ({
      h3Index: h3,
      owner: indexed.controlByHex.get(h3) ?? '',
      intact: true,
      neutralBorder: isNeutralBorderHex(h3),
    }));
  const reachable = findReachableAirportFerryDestinations({
    originH3Index: unit.h3Index,
    owner: unit.player,
    nodes,
    gridDistance: computeGridDistancePure,
    unmeasuredHopWithinRange: isWithinGridRangePure,
    hopRangeHexes: (destinationH3Index) => strategicFerryRangeOnState(unit, destinationH3Index, state),
  });
  const out: string[] = [];
  for (const node of nodes) {
    if (node.h3Index === unit.h3Index || node.owner !== unit.player) continue;
    if (!reachable.has(node.h3Index)) continue;
    logHexControllerParityMismatch({
      h3Index: node.h3Index,
      snapshotController: node.owner,
      context: 'possibleUnitActions ferry destination',
      unitId: unit.id,
    });
    out.push(node.h3Index);
  }
  return out;
}

/**
 * Drops every cached ferry list without walking the WeakMap.
 *
 * Purpose: A snapshot object is the cache key. Tests that reuse one object after changing it need a fresh search.
 * When to use: `resetLegalFerryDestinationCacheForTests` only.
 * Expected outcome: The next lookup treats any existing bucket as empty.
 * Exceptions: None.
 */
let legalFerryDestinationGeneration = 0;

/**
 * Ferry lists keyed by the snapshot object, then by origin, owner, and weather tags.
 *
 * Purpose: One consult builds possible-action rows more than once from the same snapshot. Those builds share this search.
 * When to use: `collectLegalFerryDestinationHexesCached` only.
 * Expected outcome: A new `getGameState()` result or a new consult snapshot misses on its own. A caller that mutates a
 *   snapshot in place, or that passes an indexed view which disagrees with that snapshot, calls the test reset first.
 *   Every search input comes from the snapshot. The indexed view is derived from that same snapshot.
 * Exceptions: None.
 */
const legalFerryDestinationCache = new WeakMap<
  GameStateSnapshot,
  { generation: number; byKey: Map<string, string[]> }
>();

/**
 * Returns the ferry-list map for this snapshot, replacing it after a test reset.
 *
 * Purpose: Keeps generation checks in one place.
 * When to use: `collectLegalFerryDestinationHexesCached` only.
 * Expected outcome: A map whose entries belong to the current generation.
 * Exceptions: None.
 */
function legalFerryDestinationBucket(state: GameStateSnapshot): Map<string, string[]> {
  const existing = legalFerryDestinationCache.get(state);
  if (existing && existing.generation === legalFerryDestinationGeneration) return existing.byKey;
  const byKey = new Map<string, string[]>();
  legalFerryDestinationCache.set(state, { generation: legalFerryDestinationGeneration, byKey });
  return byKey;
}

/**
 * Names one strategic ferry search: origin, owner, and weather tags.
 *
 * Purpose: Units that share all three get the same ferry list, so the cache and the build's origin count use one key.
 * When to use: `collectLegalFerryDestinationHexesCached`, and when counting distinct ferry origins in one build.
 * Expected outcome: One string when the origin, owner, and weather tags match. The snapshot is a separate cache key.
 * Exceptions: None.
 */
export function legalFerryDestinationCacheKey(unit: {
  h3Index: string;
  player: string;
  weatherTags?: readonly WeatherState[];
}): string {
  logTrace('possibleUnitActions legalFerryDestinationCacheKey', { h3Index: unit.h3Index, player: unit.player });
  return `${unit.h3Index}|${unit.player}|${unit.weatherTags?.join(',') ?? ''}`;
}

/**
 * Returns the strategic ferry destinations for one air unit, reusing a previous search on the same snapshot.
 *
 * Purpose: The consult builds the same destinations two or three times. The rows themselves stay uncached because each
 *   build uses a different coordinate map.
 * When to use: The strategic air branch of `collectAggregatedPossibleActionRows`.
 * Expected outcome: The same hexes as `collectLegalFerryDestinationHexes`, in the same order. Each call returns a new
 *   array. Hit and miss both log at trace.
 * Exceptions: None. Errors from the search propagate and nothing is stored.
 */
export function collectLegalFerryDestinationHexesCached(
  unit: { id: string; h3Index: string; player: string; unitType: string; weatherTags?: readonly WeatherState[] },
  indexed: PossibleActionsIndexedState,
  state: GameStateSnapshot
): string[] {
  const key = legalFerryDestinationCacheKey(unit);
  const bucket = legalFerryDestinationBucket(state);
  const hit = bucket.get(key);
  if (hit) {
    logTrace('possibleUnitActions collectLegalFerryDestinationHexesCached hit', { unitId: unit.id, h3Index: unit.h3Index });
    return [...hit];
  }
  logTrace('possibleUnitActions collectLegalFerryDestinationHexesCached miss', { unitId: unit.id, h3Index: unit.h3Index });
  const computed = collectLegalFerryDestinationHexes(unit, indexed, state);
  const stored = [...computed];
  bucket.set(key, stored);
  return [...stored];
}

/**
 * Forgets cached strategic ferry destinations.
 *
 * Purpose: Isolates a test that mutates a snapshot, or that passes an indexed view which disagrees with it.
 * When to use: At the start of such a test. A new snapshot object does not need this.
 * Expected outcome: The next lookup misses. One debug line is logged.
 * Exceptions: None.
 */
export function resetLegalFerryDestinationCacheForTests(): void {
  logDebug('possibleUnitActions resetLegalFerryDestinationCacheForTests');
  legalFerryDestinationGeneration += 1;
}

/**
 * Lists map hexes within air-strike grid range of a base hex.
 *
 * Purpose: Candidate strike targets before the infrastructure and occupancy filters.
 * When to use: From `collectAggregatedPossibleActionRows` for strategic air units.
 * Expected outcome: Every returned hex is a known map hex within `AIR_STRIKE_RANGE_HEXES`, via `gridDisk` or a fallback
 *   scan; callers must not re-apply range checks. The base itself is included.
 * Exceptions: None; a failed disk is logged and handled by the fallback scan.
 */
export function collectStrikeHexesForAirUnit(airH3: string, indexed: PossibleActionsIndexedState): string[] {
  logTrace('possibleUnitActions collectStrikeHexesForAirUnit', airH3);
  try {
    const disk = gridDisk(airH3, AIR_STRIKE_RANGE_HEXES);
    return disk.filter((h3) => indexed.hexSet.has(h3));
  } catch (err) {
    logInfo('possibleUnitActions collectStrikeHexesForAirUnit: gridDisk failed, scanning all hexes', { airH3, err });
    const out: string[] = [];
    for (const h3 of indexed.hexSet) {
      if (isWithinAirStrikeGridRange(airH3, h3, 'possibleUnitActions strike scan')) out.push(h3);
    }
    return out;
  }
}

/**
 * Returns a cached hex list or computes and stores it.
 *
 * Purpose: Stacked same-origin units share ferry disks, land-mass BFS dests, and strike rings.
 * When to use: `collectAggregatedPossibleActionRows` destination collection, with one cache per kind of list.
 * Expected outcome: First call runs `compute`; later calls with the same key return a copy so callers cannot mutate
 *   the cache.
 * Exceptions: None; errors from `compute` propagate and nothing is cached.
 */
export function rememberComputedHexList(
  cache: Map<string, string[]>,
  key: string,
  compute: () => string[]
): string[] {
  const hit = cache.get(key);
  logTrace('possibleUnitActions rememberComputedHexList', { key, hit: hit !== undefined });
  if (hit) return [...hit];
  const value = [...compute()];
  cache.set(key, value);
  return [...value];
}

/**
 * Cache key for tactical MP reachability shared by stacked same-type sub-units.
 *
 * Purpose: Best Options was running one Dijkstra per opponent pawn; same origin, type, budget, weather tags, terrain-bonus
 * stop category, and embark state share dests, because tags change the weather open-ground cost and the category adds
 * birth-terrain stop cells.
 * When to use: `collectAggregatedPossibleActionRows` before `collectTacticalLegalMoveDestinationTacticalHexes`.
 * Expected outcome: Air units share one empty dest list; unknown ids get a unique key; embarked cargo shares one empty dest list.
 * Exceptions: None.
 */
export function tacticalLegalMoveDestCacheKey(
  battle: TacticalBattleSnapshot,
  moverSubUnitId: string
): string {
  logTrace('possibleUnitActions tacticalLegalMoveDestCacheKey', { moverSubUnitId });
  const u = battle.subUnits.find((s) => s.id === moverSubUnitId);
  if (!u || u.unitType === 'air') return !u ? `missing:${moverSubUnitId}` : 'air';
  if (u.embarkedOnSubUnitId) return 'embarked';
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(
    battle,
    u,
    battle.subUnits,
    u.unitType
  );
  const terrainBonusCategory = terrainBonusMarchCategoryForMover(battle, u, u.unitType);
  return `${u.h3Index}|${u.unitType}|b${budget}|${u.weatherTags?.join(',') ?? ''}${terrainBonusCategory ? `|tb:${terrainBonusCategory}` : ''}`;
}

/**
 * Cache key for tactical ranged target rings shared by stacked same-type attackers.
 *
 * Purpose: Ranged discovery scans the footprint per attacker; same anchor and type share legal hexes.
 * When to use: `collectAggregatedPossibleActionRows` before `collectTacticalLegalRangedTargetTacticalHexes`.
 * Expected outcome: Missing attackers get a unique empty key; embarked cargo uses the host hex as anchor.
 * Exceptions: None.
 */
export function tacticalRangedDestCacheKey(
  battle: TacticalBattleSnapshot,
  attackerSubUnitId: string
): string {
  logTrace('possibleUnitActions tacticalRangedDestCacheKey', { attackerSubUnitId });
  const u = battle.subUnits.find((s) => s.id === attackerSubUnitId);
  if (!u) return `missing:${attackerSubUnitId}`;
  const anchor = tacticalMovementTerrainAnchorH3(u, battle.subUnits);
  return `${anchor}|${u.unitType}`;
}
