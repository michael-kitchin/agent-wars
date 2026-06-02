/**
 * Bounded memoization for tactical res4 march planning keyed by battle terrain (milestone 2.2).
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { planTacticalRes4March, type TacticalMarchPlanResult } from '../../shared/tacticalRes4MovementPlanner';
import {
  buildRes4FootprintAdjacencyMap,
  res4FootprintNeighborLookupFromMap,
  type Res4FootprintNeighborLookup,
} from '../../shared/tacticalRes4TransportLink';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  tacticalTerrainLayerSignature,
  type TacticalTerrainKindResolver,
} from '../../shared/tacticalTerrainMovement';
import { logDebug } from '../logger';
import { tacticalLogError, tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';

/** Milestone 2.2 §3.4: bounded memo entries per tactical planning session (LRU eviction). */
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
  res4TerrainKindByH3: object | undefined;
  res4IsSeaportByH3: object | undefined;
  res4IsUrbanByH3: object | undefined;
  res4IsRubbleByH3: object | undefined;
  res4RoadSidesByH3: object | undefined;
  res4RailSidesByH3: object | undefined;
  strategicHexTerrain: string | undefined;
  strategicHexTerrainKind: string | undefined;
};

let cachedTerrainKey = '';
let cachedTerrainContext = '';
let cachedTerrainSignature = '';
let cachedLayerRefs: TerrainLayerRefs | null = null;
let cachedTerrain: TacticalTerrainKindResolver | null = null;
let cachedFootprintAdjacency: Map<string, string[]> | null = null;
let cachedFootprintNeighbors: Res4FootprintNeighborLookup | null = null;
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
    | 'res4TerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'res4IsSeaportByH3'
    | 'res4IsUrbanByH3'
    | 'res4IsRubbleByH3'
    | 'res4RoadSidesByH3'
    | 'res4RailSidesByH3'
  >
): TerrainLayerRefs {
  return {
    res4TerrainKindByH3: battle.res4TerrainKindByH3,
    res4IsSeaportByH3: battle.res4IsSeaportByH3,
    res4IsUrbanByH3: battle.res4IsUrbanByH3,
    res4IsRubbleByH3: battle.res4IsRubbleByH3,
    res4RoadSidesByH3: battle.res4RoadSidesByH3,
    res4RailSidesByH3: battle.res4RailSidesByH3,
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
    a.res4TerrainKindByH3 === b.res4TerrainKindByH3 &&
    a.res4IsSeaportByH3 === b.res4IsSeaportByH3 &&
    a.res4IsUrbanByH3 === b.res4IsUrbanByH3 &&
    a.res4IsRubbleByH3 === b.res4IsRubbleByH3 &&
    a.res4RoadSidesByH3 === b.res4RoadSidesByH3 &&
    a.res4RailSidesByH3 === b.res4RailSidesByH3 &&
    a.strategicHexTerrain === b.strategicHexTerrain &&
    a.strategicHexTerrainKind === b.strategicHexTerrainKind
  );
}

/**
 * Resolves the terrain-only session key and signature, recomputing the signature only when layer refs change.
 *
 * Purpose: Plan results depend on terrain, not sub-unit placement; this key drives resolver/adjacency/memo invalidation.
 * When to use: Start of every `planTacticalRes4MarchWithSessionCache` call.
 * Expected outcome: Stable `terrainKey` across unit moves within one beat when terrain layers are unchanged.
 * Exceptions: None.
 */
function resolveTerrainIdentity(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'battleId'
    | 'tacticalTurnNumber'
    | 'res4TerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'res4IsSeaportByH3'
    | 'res4IsUrbanByH3'
    | 'res4IsRubbleByH3'
    | 'res4RoadSidesByH3'
    | 'res4RailSidesByH3'
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
 * Clears module-level tactical march memo state so tests and dev reloads do not leak across scenarios.
 *
 * Purpose: `planTacticalRes4MarchWithSessionCache` keeps process-global terrain + memo; tests need a clean slate.
 * When to use: Start of tactical cache unit tests and any harness that swaps synthetic battles under duplicate ids.
 * Expected outcome: Next planning call rebuilds terrain from the passed snapshot.
 * Exceptions: None.
 */
export function resetTacticalMovementPlanningCacheForTests(): void {
  tacticalLogMutate('resetTacticalMovementPlanningCacheForTests');
  cachedTerrainKey = '';
  cachedTerrainContext = '';
  cachedTerrainSignature = '';
  cachedLayerRefs = null;
  cachedTerrain = null;
  cachedFootprintAdjacency = null;
  cachedFootprintNeighbors = null;
  planMemo.clear();
}

/**
 * Evicts the oldest memo entry when at capacity so new `(from,to,type,budget)` keys stay bounded (Map insertion order LRU).
 *
 * Purpose: Implements milestone 2.2 bounded caching without dropping the entire session on pressure spikes.
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
 * Ensures terrain resolver and footprint adjacency are cached for the current battle terrain and footprint set.
 *
 * Purpose: Rebuilds resolver/adjacency only on terrain-key change; the footprint (`res4ChildH3Indexes`) is fixed for
 * a given battle so adjacency is built once per terrain-key and reused for all subsequent planning calls.
 * When to use: From `planTacticalRes4MarchWithSessionCache` before plan memo lookup.
 * Expected outcome: `cachedTerrain` and `cachedFootprintNeighbors` ready for `planTacticalRes4March`.
 * Exceptions: None.
 */
function ensureTerrainAndFootprintCache(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'battleId'
    | 'tacticalTurnNumber'
    | 'res4TerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'res4IsSeaportByH3'
    | 'res4IsUrbanByH3'
    | 'res4IsRubbleByH3'
    | 'res4RoadSidesByH3'
    | 'res4RailSidesByH3'
  >,
  res4Set: ReadonlySet<string>
): void {
  const terrainKey = resolveTerrainIdentity(battle);
  if (terrainKey !== cachedTerrainKey) {
    tacticalLogQuery('planTacticalRes4MarchWithSessionCache terrain reset', { terrainKey });
    cachedTerrainKey = terrainKey;
    cachedTerrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
    planMemo.clear();
    cachedFootprintAdjacency = null;
    cachedFootprintNeighbors = null;
  }
  if (cachedFootprintAdjacency === null) {
    cachedFootprintAdjacency = buildRes4FootprintAdjacencyMap(res4Set);
    cachedFootprintNeighbors = res4FootprintNeighborLookupFromMap(cachedFootprintAdjacency);
  }
}

/**
 * Returns a tactical march plan, reusing terrain context and bounded memoization across repeated queries in one battle state.
 *
 * Purpose: Mirrors strategic hover/session reuse so repeated validation and preview calls avoid rebuilding terrain resolvers.
 * When to use: Tactical march validation and any hot path that replans the same `(from,to,type,budget)` pairs within stable terrain.
 * Expected outcome: Identical results to calling `planTacticalRes4March` directly; memo resets when battle id, turn, or terrain change.
 * Exceptions: Caught internal errors log at error and fall back to a fresh uncached plan attempt.
 */
export function planTacticalRes4MarchWithSessionCache(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'battleId'
    | 'tacticalTurnNumber'
    | 'subUnits'
    | 'res4TerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'res4IsSeaportByH3'
    | 'res4IsUrbanByH3'
    | 'res4IsRubbleByH3'
    | 'res4RoadSidesByH3'
    | 'res4RailSidesByH3'
  >,
  args: {
    fromH3: string;
    toH3: string;
    res4Set: ReadonlySet<string>;
    unitTypeForMovement: string;
    movementPointBudget: number;
  }
): TacticalMarchPlanResult {
  ensureTerrainAndFootprintCache(battle, args.res4Set);
  const terrain = cachedTerrain ?? buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprintNeighbors = cachedFootprintNeighbors ?? undefined;
  const qk = `${args.fromH3}|${args.toH3}|${args.unitTypeForMovement}|${args.movementPointBudget}`;
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
    const fresh = planTacticalRes4March({
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
      return planTacticalRes4March({
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
