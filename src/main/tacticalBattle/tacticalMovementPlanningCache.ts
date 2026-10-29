/**
 * Bounded memoization for tactical march planning keyed by battle terrain.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { planTacticalMarch, type TacticalMarchPlanResult } from '../../shared/tacticalMovementPlanner';
import {
  buildTacticalFootprintAdjacencyMap,
  tacticalFootprintNeighborLookupFromMap,
  tacticalNeighborsInFootprint,
  type TacticalFootprintNeighborLookup,
} from '../../shared/tacticalTransportLink';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  tacticalTerrainLayerSignature,
  type TacticalTerrainKindResolver,
} from '../../shared/tacticalTerrainMovement';
import { logDebug } from '../logger';
import { tacticalLogError, tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';

/** Bounded memo entries per tactical planning session (LRU eviction). */
const MAX_PLAN_MEMO_ENTRIES = 64;

/**
 * Object references for terrain layers used to detect unchanged terrain without recomputing signatures.
 *
 * Purpose: Beat-application clones use `{ ...battle, subUnits }`, so layer maps keep stable references when only units move.
 * When to use: `resolveTerrainIdentity` fast path before calling `tacticalTerrainLayerSignature`.
 * Expected outcome: Reference-equal pairs skip full signature rebuild on repeated plans within one beat.
 * Exceptions: None.
 */
type TerrainLayerRefs = {
  tacticalTerrainKindByH3: object | undefined;
  tacticalIsSeaportByH3: object | undefined;
  tacticalIsUrbanByH3: object | undefined;
  tacticalIsRubbleByH3: object | undefined;
  tacticalRoadSidesByH3: object | undefined;
  tacticalRailSidesByH3: object | undefined;
  strategicHexTerrain: string | undefined;
  strategicHexTerrainKind: string | undefined;
};

let cachedTerrainKey = '';
let cachedTerrainContext = '';
let cachedTerrainSignature = '';
let cachedLayerRefs: TerrainLayerRefs | null = null;
let cachedTerrain: TacticalTerrainKindResolver | null = null;
let cachedFootprintAdjacency: Map<string, string[]> | null = null;
let cachedFootprintNeighbors: TacticalFootprintNeighborLookup | null = null;
/** Cell count of the adjacency map’s source set (full battle footprint when `tacticalChildH3Indexes` is present). */
let cachedFullFootprintSize = 0;
const planMemo = new Map<string, TacticalMarchPlanResult>();

/**
 * Extracts terrain-layer object references from a battle snapshot for identity comparison.
 *
 * Purpose: Supports O(1) terrain-unchanged detection in `resolveTerrainIdentity`.
 * When to use: Before deciding whether to recompute `tacticalTerrainLayerSignature`.
 * Expected outcome: Stable refs for the same snapshot clone path that only mutates `subUnits`.
 * Exceptions: None.
 */
function extractTerrainLayerRefs(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'tacticalTerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'tacticalIsSeaportByH3'
    | 'tacticalIsUrbanByH3'
    | 'tacticalIsRubbleByH3'
    | 'tacticalRoadSidesByH3'
    | 'tacticalRailSidesByH3'
  >
): TerrainLayerRefs {
  return {
    tacticalTerrainKindByH3: battle.tacticalTerrainKindByH3,
    tacticalIsSeaportByH3: battle.tacticalIsSeaportByH3,
    tacticalIsUrbanByH3: battle.tacticalIsUrbanByH3,
    tacticalIsRubbleByH3: battle.tacticalIsRubbleByH3,
    tacticalRoadSidesByH3: battle.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: battle.tacticalRailSidesByH3,
    strategicHexTerrain: battle.strategicHexTerrain,
    strategicHexTerrainKind: battle.strategicHexTerrainKind,
  };
}

/**
 * Returns true when two terrain-layer reference bundles refer to the same underlying maps and parent fields.
 *
 * Purpose: Fast terrain identity check for session-cache hits without sorting override entries.
 * When to use: `resolveTerrainIdentity` only.
 * Expected outcome: True when every layer reference and parent terrain string matches.
 * Exceptions: None.
 */
function terrainLayerRefsEqual(a: TerrainLayerRefs, b: TerrainLayerRefs): boolean {
  return (
    a.tacticalTerrainKindByH3 === b.tacticalTerrainKindByH3 &&
    a.tacticalIsSeaportByH3 === b.tacticalIsSeaportByH3 &&
    a.tacticalIsUrbanByH3 === b.tacticalIsUrbanByH3 &&
    a.tacticalIsRubbleByH3 === b.tacticalIsRubbleByH3 &&
    a.tacticalRoadSidesByH3 === b.tacticalRoadSidesByH3 &&
    a.tacticalRailSidesByH3 === b.tacticalRailSidesByH3 &&
    a.strategicHexTerrain === b.strategicHexTerrain &&
    a.strategicHexTerrainKind === b.strategicHexTerrainKind
  );
}

/**
 * Resolves the terrain-only session key and signature, recomputing the signature only when layer refs change.
 *
 * Purpose: Plan results depend on terrain, not sub-unit placement; this key drives resolver/adjacency/memo invalidation.
 * When to use: Start of every `planTacticalMarchWithSessionCache` call.
 * Expected outcome: Stable `terrainKey` across unit moves within one beat when terrain layers are unchanged.
 * Exceptions: None.
 */
function resolveTerrainIdentity(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'battleId'
    | 'tacticalTurnNumber'
    | 'tacticalTerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'tacticalIsSeaportByH3'
    | 'tacticalIsUrbanByH3'
    | 'tacticalIsRubbleByH3'
    | 'tacticalRoadSidesByH3'
    | 'tacticalRailSidesByH3'
  >
): string {
  const context = `${battle.battleId}|${battle.tacticalTurnNumber}`;
  const refs = extractTerrainLayerRefs(battle);
  if (
    cachedTerrainContext === context &&
    cachedLayerRefs !== null &&
    terrainLayerRefsEqual(cachedLayerRefs, refs) &&
    cachedTerrainSignature.length > 0
  ) {
    return `${context}|${cachedTerrainSignature}`;
  }
  const signature = tacticalTerrainLayerSignature(battle);
  cachedTerrainContext = context;
  cachedLayerRefs = refs;
  cachedTerrainSignature = signature;
  return `${context}|${signature}`;
}

/**
 * Clears the in-memory tactical march memo.
 *
 * Purpose: Battle ids can repeat between saves of the same match, so a loaded battle must not reuse the previous battle's memo.
 * When to use: From `releaseTacticalBattleMemory`. Tests call `resetTacticalMovementPlanningCacheForTests`.
 * Expected outcome: The next planning call rebuilds terrain from the snapshot it is given.
 * Exceptions: None.
 */
export function clearTacticalMovementPlanningCache(): void {
  logDebug('tacticalMovementPlanningCache clearTacticalMovementPlanningCache');
  cachedTerrainKey = '';
  cachedTerrainContext = '';
  cachedTerrainSignature = '';
  cachedLayerRefs = null;
  cachedTerrain = null;
  cachedFootprintAdjacency = null;
  cachedFootprintNeighbors = null;
  cachedFullFootprintSize = 0;
  planMemo.clear();
}

/**
 * Clears module-level tactical march memo state so tests and dev reloads do not leak across scenarios.
 *
 * Purpose: `planTacticalMarchWithSessionCache` keeps process-global terrain + memo; tests need a clean slate.
 * When to use: Start of tactical cache unit tests and any harness that swaps synthetic battles under duplicate ids.
 * Expected outcome: Next planning call rebuilds terrain from the passed snapshot.
 * Exceptions: None.
 */
export function resetTacticalMovementPlanningCacheForTests(): void {
  tacticalLogMutate('resetTacticalMovementPlanningCacheForTests');
  clearTacticalMovementPlanningCache();
}

/**
 * Evicts the oldest memo entry when at capacity so new `(from,to,type,budget)` keys stay bounded (Map insertion order LRU).
 *
 * Purpose: Implements bounded caching without dropping the entire session on pressure spikes.
 * When to use: Before inserting a fresh memo entry after a cache miss.
 * Expected outcome: `planMemo.size` remains at most `MAX_PLAN_MEMO_ENTRIES` after insertion.
 * Exceptions: None.
 */
function evictOldestPlanMemoIfFull(): void {
  while (planMemo.size >= MAX_PLAN_MEMO_ENTRIES) {
    const oldest = planMemo.keys().next().value;
    if (oldest === undefined) break;
    planMemo.delete(oldest);
  }
}

/**
 * Snapshot fields required to identity terrain and rebuild the full-footprint adjacency cache.
 *
 * Purpose: Keeps `ensureTerrainAndFootprintCache` / `planTacticalMarchWithSessionCache` aligned on battle identity
 * without requiring callers to pass every tactical snapshot field.
 * When to use: Typing the `battle` argument for session-cached march planning.
 * Expected outcome: Same shape as terrain identity plus optional `tacticalChildH3Indexes` for full-footprint adjacency.
 * Exceptions: None.
 */
type TacticalMarchSessionCacheBattle = Pick<
  TacticalBattleSnapshot,
  | 'battleId'
  | 'tacticalTurnNumber'
  | 'subUnits'
  | 'tacticalTerrainKindByH3'
  | 'strategicHexTerrain'
  | 'strategicHexTerrainKind'
  | 'tacticalIsSeaportByH3'
  | 'tacticalIsUrbanByH3'
  | 'tacticalIsRubbleByH3'
  | 'tacticalRoadSidesByH3'
  | 'tacticalRailSidesByH3'
> &
  Partial<Pick<TacticalBattleSnapshot, 'tacticalChildH3Indexes'>>;

/**
 * Builds a stable memo tag so avoid-enemies subsets cannot reuse full-footprint plan rows (and vice versa).
 *
 * Purpose: Plan memo keys omit the full H3 list for speed; this tag distinguishes the battle footprint from Tool1
 * filtered sets that remove enemy-occupied cells.
 * When to use: Building `qk` inside `planTacticalMarchWithSessionCache`.
 * Expected outcome: `'F'` when `tacticalSet` matches the full battle footprint size; otherwise a size+hash tag.
 * Exceptions: None.
 */
function tacticalSetMemoTag(tacticalSet: ReadonlySet<string>, fullFootprintSize: number): string {
  if (fullFootprintSize > 0 && tacticalSet.size === fullFootprintSize) return 'F';
  let h = 2166136261;
  for (const x of tacticalSet) {
    for (let i = 0; i < x.length; i++) {
      h ^= x.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return `S${tacticalSet.size}:${h >>> 0}`;
}

/**
 * Returns footprint neighbors restricted to the caller's active `tacticalSet` (full battle or avoid-enemies subset).
 *
 * Purpose: Session adjacency is always built from the full tactical footprint; Dijkstra must still honor per-call
 * exclusions (e.g. enemy-occupied cells) without permanently poisoning the adjacency cache.
 * When to use: Passed as `footprintNeighbors` into `planTacticalMarch` from the session cache.
 * Expected outcome: Only neighbors present in `tacticalSet`; empty when the origin has no footprint adjacency.
 * Exceptions: None.
 */
function footprintNeighborsRestrictedToSet(tacticalSet: ReadonlySet<string>): TacticalFootprintNeighborLookup {
  const full = cachedFootprintNeighbors;
  if (!full) {
    return (h: string) => tacticalNeighborsInFootprint(h, tacticalSet);
  }
  return (h: string) => {
    const nbs = full(h);
    if (nbs.length === 0) return nbs;
    return nbs.filter((n) => tacticalSet.has(n));
  };
}

/**
 * Ensures terrain resolver and footprint adjacency are cached for the current battle terrain.
 *
 * Purpose: Rebuilds resolver/adjacency only on terrain-key change. Adjacency is always built from the **full**
 * battle footprint (`tacticalChildH3Indexes` when present), never from a per-call avoid-enemies subset — otherwise the
 * first Tool1 `plan_route` permanently drops human-occupied cells from neighbor lists and human marches fail with
 * instant `no_path`.
 * When to use: From `planTacticalMarchWithSessionCache` before plan memo lookup.
 * Expected outcome: `cachedTerrain` and `cachedFootprintNeighbors` ready for `planTacticalMarch`.
 * Exceptions: None.
 */
function ensureTerrainAndFootprintCache(
  battle: TacticalMarchSessionCacheBattle,
  tacticalSet: ReadonlySet<string>
): void {
  const terrainKey = resolveTerrainIdentity(battle);
  if (terrainKey !== cachedTerrainKey) {
    tacticalLogQuery('planTacticalRes4MarchWithSessionCache terrain reset', { terrainKey });
    cachedTerrainKey = terrainKey;
    cachedTerrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
    planMemo.clear();
    cachedFootprintAdjacency = null;
    cachedFootprintNeighbors = null;
    cachedFullFootprintSize = 0;
  }
  if (cachedFootprintAdjacency === null) {
    const fullIndexes = battle.tacticalChildH3Indexes;
    const adjacencySource =
      fullIndexes != null && fullIndexes.length > 0 ? new Set(fullIndexes) : tacticalSet;
    cachedFullFootprintSize = adjacencySource.size;
    cachedFootprintAdjacency = buildTacticalFootprintAdjacencyMap(adjacencySource);
    cachedFootprintNeighbors = tacticalFootprintNeighborLookupFromMap(cachedFootprintAdjacency);
  }
}

/**
 * Returns a tactical march plan, reusing terrain context and bounded memoization across repeated queries in one battle state.
 *
 * Purpose: Mirrors strategic hover/session reuse so repeated validation and preview calls avoid rebuilding terrain resolvers.
 * When to use: Tactical march validation and any hot path that replans the same `(from,to,type,budget)` pairs within stable terrain.
 * Expected outcome: Identical results to calling `planTacticalMarch` directly; memo resets when battle id, turn, or terrain change.
 * Exceptions: Caught internal errors log at error and fall back to a fresh uncached plan attempt.
 */
export function planTacticalMarchWithSessionCache(
  battle: TacticalMarchSessionCacheBattle,
  args: {
    fromH3: string;
    toH3: string;
    tacticalSet: ReadonlySet<string>;
    unitTypeForMovement: string;
    movementPointBudget: number;
    weatherEnabled?: boolean;
    weather?: import('../../shared/weatherBonusTypes').WeatherState | null;
    weatherTags?: readonly import('../../shared/weatherBonusTypes').WeatherState[] | null;
    /** From `terrainBonusMarchCategoryForMover`; part of the memo key so units with different births never share a plan. */
    terrainBonusCategory?: import('../../shared/tacticalTerrainMovement').TacticalMovementCategory | null;
  }
): TacticalMarchPlanResult {
  ensureTerrainAndFootprintCache(battle, args.tacticalSet);
  const terrain = cachedTerrain ?? buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprintNeighbors = footprintNeighborsRestrictedToSet(args.tacticalSet);
  const setTag = tacticalSetMemoTag(args.tacticalSet, cachedFullFootprintSize);
  const tagKey = (args.weatherTags ?? []).join(',');
  const qk = `${args.fromH3}|${args.toH3}|${args.unitTypeForMovement}|${args.movementPointBudget}|${setTag}|${args.weatherEnabled ? args.weather ?? '' : ''}|${tagKey}|tb:${args.terrainBonusCategory ?? ''}`;
  const hit = planMemo.get(qk);
  if (hit) {
    tacticalLogQuery('planTacticalRes4MarchWithSessionCache hit', { qk });
    planMemo.delete(qk);
    planMemo.set(qk, hit);
    return hit;
  }
  const safeUnreachable = (): TacticalMarchPlanResult => ({
    reachable: false,
    reachableThisTurn: false,
    totalCostToDestination: Infinity,
    pathToDestination: null,
    firstStopWithinBudget: { stopH3: args.fromH3, consumedFullPath: false },
    failureReason: 'no_path',
  });
  const planStartedAt = performance.now();
  try {
    const fresh = planTacticalMarch({
      ...args,
      terrain,
      footprintNeighbors,
    });
    evictOldestPlanMemoIfFull();
    planMemo.set(qk, fresh);
    logDebug('planTacticalRes4MarchWithSessionCache miss', {
      battleId: battle.battleId,
      tacticalTurnNumber: battle.tacticalTurnNumber,
      qk,
      terrainBonusCategory: args.terrainBonusCategory ?? null,
      usesTerrainBonus: fresh.usesTerrainBonus === true,
      memoSize: planMemo.size,
      elapsedMs: Math.round(performance.now() - planStartedAt),
    });
    return fresh;
  } catch (err) {
    tacticalLogError('planTacticalRes4MarchWithSessionCache failed', {
      battleId: battle.battleId,
      tacticalTurnNumber: battle.tacticalTurnNumber,
      qk,
      err,
    });
    try {
      return planTacticalMarch({
        ...args,
        terrain,
        footprintNeighbors,
      });
    } catch (err2) {
      tacticalLogError('planTacticalRes4MarchWithSessionCache retry failed', {
        battleId: battle.battleId,
        tacticalTurnNumber: battle.tacticalTurnNumber,
        qk,
        err: err2,
      });
      return safeUnreachable();
    }
  }
}
