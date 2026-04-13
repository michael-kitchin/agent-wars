/**
 * Bounded memoization for tactical res4 march planning keyed by battle environment (milestone 2.2).
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { planTacticalRes4March, type TacticalMarchPlanResult } from '../../shared/tacticalRes4MovementPlanner';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  tacticalTerrainLayerSignature,
  type TacticalTerrainKindResolver,
} from '../../shared/tacticalTerrainMovement';
import { tacticalLogError, tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';

/** Milestone 2.2 §3.4: bounded memo entries per tactical planning session (LRU eviction). */
const MAX_PLAN_MEMO_ENTRIES = 64;

/**
 * Stable fingerprint of sub-unit positions for tactical planning cache invalidation.
 *
 * Purpose: Changes when any `id` or `h3Index` pair changes on the tactical snapshot.
 * When to use: Building the environment key for `planTacticalRes4MarchWithSessionCache`.
 * Expected outcome: Deterministic string for a given `subUnits` array.
 * Exceptions: None.
 */
function tacticalSubUnitPlacementSignature(subUnits: readonly { id: string; h3Index: string }[]): string {
  return [...subUnits]
    .map((u) => `${u.id}:${u.h3Index}`)
    .sort()
    .join('|');
}

let cachedEnvKey = '';
let cachedTerrain: TacticalTerrainKindResolver | null = null;
const planMemo = new Map<string, TacticalMarchPlanResult>();

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
  cachedEnvKey = '';
  cachedTerrain = null;
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
 * Returns a tactical march plan, reusing terrain context and bounded memoization across repeated queries in one battle state.
 *
 * Purpose: Mirrors strategic hover/session reuse so repeated validation and preview calls avoid rebuilding terrain resolvers.
 * When to use: Tactical march validation and any hot path that replans the same `(from,to,type,budget)` pairs within a stable battle.
 * Expected outcome: Identical results to calling `planTacticalRes4March` directly; memo resets when battle id, turn, or positions change.
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
  >,
  args: {
    fromH3: string;
    toH3: string;
    res4Set: ReadonlySet<string>;
    unitTypeForMovement: string;
    movementPointBudget: number;
  }
): TacticalMarchPlanResult {
  const envKey = `${battle.battleId}|${battle.tacticalTurnNumber}|${tacticalSubUnitPlacementSignature(battle.subUnits)}|${tacticalTerrainLayerSignature(battle)}`;
  if (envKey !== cachedEnvKey) {
    tacticalLogQuery('planTacticalRes4MarchWithSessionCache reset', { envKey });
    cachedEnvKey = envKey;
    cachedTerrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
    planMemo.clear();
  }
  const terrain = cachedTerrain ?? buildTacticalTerrainKindResolverFromSnapshot(battle);
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
  try {
    const fresh = planTacticalRes4March({
      ...args,
      terrain,
    });
    evictOldestPlanMemoIfFull();
    planMemo.set(qk, fresh);
    tacticalLogQuery('planTacticalRes4MarchWithSessionCache miss', { qk, memoSize: planMemo.size });
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
