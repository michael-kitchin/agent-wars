/**
 * Destination discovery for possible-action collection: air ferry and strike hexes, and the per-request cache that
 * lets stacked units share destination lists.
 */

import { gridDisk } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { WeatherState } from '../../shared/weatherBonusTypes';
import {
  effectiveTacticalMovementPointBudgetForMarchLeg,
  tacticalMovementTerrainAnchorH3,
} from '../../shared/tacticalTerrainCombatModifiers';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { isWithinAirFerryGridRange, isWithinAirStrikeGridRange } from '../gameActions/gridRange';
import { strategicFerryRangeOnState } from '../weather/weatherMatch';
import { logInfo, logTrace } from '../logger';
import { logHexControllerParityMismatch } from '../snapshotDbParity';
import { airBaseHasIntactAirport, getInfra, type PossibleActionsIndexedState } from './possibleUnitActionsIndexedState';

/**
 * Lists friendly-controlled hexes with intact airports that a strategic air unit can ferry to.
 *
 * Purpose: Ferry rows must match the ferry orders validation accepts, including the shorter range into snow the unit
 *   lacks when the weather bonus is on.
 * When to use: From `collectAggregatedPossibleActionRows` for strategic air units.
 * Expected outcome: Hexes other than the base that the unit's player controls, that have an airport, and that are
 *   within that unit's ferry range of the base. Callers must not re-apply range checks. Empty for non-air units and
 *   when the base airport is damaged. Falls back to scanning every known hex when the ferry disk cannot be built.
 * Exceptions: None; a failed disk is logged and handled by the fallback scan.
 */
export function collectLegalFerryDestinationHexes(
  unit: { id: string; h3Index: string; player: string; unitType: string; weatherTags?: readonly WeatherState[] },
  indexed: PossibleActionsIndexedState,
  state: GameStateSnapshot
): string[] {
  logTrace('possibleUnitActions collectLegalFerryDestinationHexes', { unitId: unit.id, h3Index: unit.h3Index });
  if (unit.unitType !== 'air') return [];
  if (!airBaseHasIntactAirport(indexed, unit.h3Index)) return [];
  let candidates: string[];
  try {
    candidates = gridDisk(unit.h3Index, AIR_FERRY_RANGE_HEXES).filter((h3) => indexed.hexSet.has(h3) && h3 !== unit.h3Index);
  } catch (err) {
    logInfo('possibleUnitActions collectLegalFerryDestinationHexes: gridDisk failed, scanning all hexes', {
      unitId: unit.id,
      h3Index: unit.h3Index,
      err,
    });
    candidates = [];
    for (const h3 of indexed.hexSet) {
      if (h3 === unit.h3Index) continue;
      if (isWithinAirFerryGridRange(unit.h3Index, h3, 'possibleUnitActions ferry disk fallback', strategicFerryRangeOnState(unit, h3, state))) {
        candidates.push(h3);
      }
    }
  }
  const out = new Set<string>();
  for (const h3 of candidates) {
    if (!isWithinAirFerryGridRange(unit.h3Index, h3, 'possibleUnitActions ferry', strategicFerryRangeOnState(unit, h3, state))) continue;
    if (getInfra(indexed, h3).airport <= 0) continue;
    const snapshotController = indexed.controlByHex.get(h3) ?? null;
    if (snapshotController !== unit.player) continue;
    logHexControllerParityMismatch({
      h3Index: h3,
      snapshotController,
      context: 'possibleUnitActions ferry destination',
      unitId: unit.id,
    });
    out.add(h3);
  }
  return [...out];
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
 * Purpose: Best Options was running one Dijkstra per opponent pawn; same origin, type, budget, weather tags, and embark
 * state share dests, because tags change the weather open-ground cost.
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
  return `${u.h3Index}|${u.unitType}|b${budget}|${u.weatherTags?.join(',') ?? ''}`;
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
