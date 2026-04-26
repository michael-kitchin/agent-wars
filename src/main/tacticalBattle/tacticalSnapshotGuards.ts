/**
 * Tactical snapshot guard helpers shared by movement projection and composite order application.
 */

import type { TacticalMarchPlanResult } from '../../shared/tacticalRes4MovementPlanner';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  buildLandMarchStepLegalityDetailAlongPath,
  summarizeLandMarchStepLegalityAlongPath,
} from '../../shared/tacticalRes4LandMarchContinuity';
import { planTacticalRes4MarchWithSessionCache } from './tacticalMovementPlanningCache';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  tacticalMovementUnitTypeForPathfinding,
} from '../../shared/tacticalTerrainMovement';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from '../../shared/tacticalTerrainCombatModifiers';
import { tacticalLogMutate } from './tacticalLogging';

/**
 * Snapshot fields required to rebuild the tactical terrain resolver for march debug previews.
 *
 * Purpose: Keeps `tacticalCompute*MovementOrderOutcome` and `logTacticalMarchPlanOk` aligned with `planTacticalRes4MarchWithSessionCache`.
 * When to use: Typing `battle` arguments that must support transport overlay reconstruction.
 * Expected outcome: Same shape as `buildTacticalTerrainKindResolverFromSnapshot` input.
 * Exceptions: None.
 */
type TacticalBattleSnapshotMarchTerrainPick = Pick<
  TacticalBattleSnapshot,
  | 'res4TerrainKindByH3'
  | 'strategicHexTerrain'
  | 'strategicHexTerrainKind'
  | 'res4IsSeaportByH3'
  | 'res4IsUrbanByH3'
  | 'res4IsRubbleByH3'
  | 'res4RoadSidesByH3'
  | 'res4RailSidesByH3'
>;

/**
 * Builds a compact comma-separated list of effective res4 terrain kind strings along a planned path for debug triage.
 *
 * Purpose: Correlates accepted tactical routes with snapshot `res4TerrainKindByH3` (and parent kind fallback) without dumping full H3 lists.
 * When to use: Only from debug logging after a successful `planTacticalRes4MarchWithSessionCache` result.
 * Expected outcome: Short string for typical paths; middle elided when the path is long.
 * Exceptions: None.
 */
function res4KindPreviewAlongPath(
  battle: Pick<TacticalBattleSnapshot, 'res4TerrainKindByH3' | 'strategicHexTerrainKind'>,
  path: readonly string[] | null
): string | null {
  if (!path?.length) return null;
  const row = (h: string): string => {
    const raw = battle.res4TerrainKindByH3?.[h];
    if (raw != null && String(raw).trim().length > 0) return String(raw).trim();
    return battle.strategicHexTerrainKind ?? 'plains';
  };
  const rows = path.map(row);
  if (rows.length <= 14) return rows.join(',');
  return `${rows.slice(0, 7).join(',')}…${rows.slice(-6).join(',')}`;
}

/**
 * Emits debug-level structured context for a reachable tactical march plan (human or opponent).
 *
 * Purpose: Makes `debug.log` useful at default debug settings when investigating mountain vs transport and multi-turn reachability.
 * When to use: After `planTacticalRes4MarchWithSessionCache` returns `reachable: true` inside movement outcome helpers.
 * Expected outcome: One line per validated order with path head/tail, costs, and terrain kind preview.
 * Exceptions: None.
 */
function logTacticalMarchPlanOk(args: {
  player: 'human' | 'opponent';
  battle: Pick<
    TacticalBattleSnapshot,
    'battleId' | 'tacticalTurnNumber' | 'res4TerrainKindByH3' | 'strategicHexTerrainKind'
  > &
    TacticalBattleSnapshotMarchTerrainPick;
  unitId: string;
  subUnitType: string;
  moveType: string;
  fromH3: string;
  toH3: string;
  budget: number;
  plan: TacticalMarchPlanResult;
  res4Set: ReadonlySet<string>;
}): void {
  const path = args.plan.pathToDestination;
  const terrain =
    args.moveType === 'infantry' || args.moveType === 'armor'
      ? buildTacticalTerrainKindResolverFromSnapshot(args.battle)
      : null;
  const landMarch =
    terrain != null
      ? summarizeLandMarchStepLegalityAlongPath({
          path,
          unitTypeForMovement: args.moveType,
          terrain,
          marchGoalH3: args.toH3,
          res4Set: args.res4Set,
        })
      : null;
  const landMarchDetail =
    terrain != null ? buildLandMarchStepLegalityDetailAlongPath({
      path,
      unitTypeForMovement: args.moveType,
      terrain,
      marchGoalH3: args.toH3,
      res4Set: args.res4Set,
    }) : null;
  const stepLegalityDetailPayload =
    landMarchDetail == null
      ? {}
      : landMarchDetail.length <= 10
        ? { stepLegalityDetail: landMarchDetail }
        : {
            stepLegalityDetailHead: landMarchDetail.slice(0, 4),
            stepLegalityDetailTail: landMarchDetail.slice(-3),
          };
  tacticalLogMutate('tacticalMarchPlan ok', {
    battleId: args.battle.battleId,
    tacticalTurnNumber: args.battle.tacticalTurnNumber,
    player: args.player,
    unitId: args.unitId,
    subUnitType: args.subUnitType,
    moveType: args.moveType,
    fromH3: args.fromH3,
    toH3: args.toH3,
    movementPointBudget: args.budget,
    totalCostToDestination: args.plan.totalCostToDestination,
    reachableThisTurn: args.plan.reachableThisTurn,
    firstStopH3: args.plan.firstStopWithinBudget.stopH3,
    firstStopConsumedFullPath: args.plan.firstStopWithinBudget.consumedFullPath,
    pathLen: path?.length ?? 0,
    pathHead: path?.slice(0, 4) ?? [],
    pathTail: path?.slice(-3) ?? [],
    terrainKindsAlongPath: res4KindPreviewAlongPath(args.battle, path),
    stepLegalityAlongPath: landMarch,
    ...stepLegalityDetailPayload,
  });
}

/**
 * Enumerates why an opponent tactical march order may be ignored during snapshot projection.
 *
 * Contract: Used only for diagnostics; does not imply user-facing wording.
 * When to use: Interpreting `tacticalComputeMovementOrderOutcome` failures before logging skip traces.
 * Expected outcome: Stable string union for switch/if diagnostics.
 * Exceptions: None.
 */
export type TacticalMovementBlockReason =
  | 'unknown_unit'
  | 'non_opponent'
  | 'non_human'
  | 'outside_footprint'
  | 'out_of_range'
  | 'air_no_march';

/**
 * Decides whether a single opponent movement order may mutate a tactical sub-unit row in the snapshot clone.
 *
 * Contract: Does not mutate arrays; uses §12.4 terrain-weighted reachability inside the tactical footprint. Emits debug logs for planner outcomes.
 * When to use: `projectTacticalSnapshotAfterOpponentMovementOrders` loop before applying `h3Index` updates.
 * Expected outcome: Returns `ok: true` with `idx` into the mutable `sub` clone, or `ok: false` with a reason and diagnostic context.
 * Exceptions: Invalid H3 indexes may yield `out_of_range` when the tactical march planner cannot find a finite-cost path.
 */
export function tacticalComputeMovementOrderOutcome(args: {
  byId: ReadonlyMap<string, number>;
  sub: readonly TacticalSubUnitSnapshot[];
  order: { unitId: string; toH3Index: string };
  res4Set: ReadonlySet<string>;
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
  >;
}):
  | { ok: true; idx: number }
  | { ok: false; reason: TacticalMovementBlockReason; context: Record<string, unknown> } {
  const idx = args.byId.get(args.order.unitId);
  if (idx === undefined) {
    return { ok: false, reason: 'unknown_unit', context: { unitId: args.order.unitId } };
  }
  const u = args.sub[idx]!;
  if (u.player !== 'opponent') {
    return { ok: false, reason: 'non_opponent', context: { unitId: args.order.unitId } };
  }
  if (!args.res4Set.has(args.order.toH3Index)) {
    return {
      ok: false,
      reason: 'outside_footprint',
      context: { unitId: args.order.unitId, toH3Index: args.order.toH3Index },
    };
  }
  const moveType = tacticalMovementUnitTypeForPathfinding(u, args.order.toH3Index);
  if (moveType === 'air') {
    return { ok: false, reason: 'air_no_march', context: { unitId: args.order.unitId } };
  }
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(args.battle, u, args.sub, moveType);
  const plan = planTacticalRes4MarchWithSessionCache(args.battle, {
    fromH3: u.h3Index,
    toH3: args.order.toH3Index,
    res4Set: args.res4Set,
    unitTypeForMovement: moveType,
    movementPointBudget: Math.max(0, budget),
  });
  if (!plan.reachable) {
    tacticalLogMutate('tacticalMarchPlan unreachable', {
      battleId: args.battle.battleId,
      tacticalTurnNumber: args.battle.tacticalTurnNumber,
      player: 'opponent',
      unitId: args.order.unitId,
      subUnitType: u.unitType,
      moveType,
      fromH3: u.h3Index,
      toH3: args.order.toH3Index,
      movementPointBudget: budget,
      plannerReason: plan.failureReason,
    });
    return {
      ok: false,
      reason: 'out_of_range',
      context: {
        unitId: args.order.unitId,
        from: u.h3Index,
        to: args.order.toH3Index,
        budget,
        plannerReason: plan.failureReason,
      },
    };
  }
  logTacticalMarchPlanOk({
    player: 'opponent',
    battle: args.battle,
    unitId: args.order.unitId,
    subUnitType: u.unitType,
    moveType,
    fromH3: u.h3Index,
    toH3: args.order.toH3Index,
    budget,
    plan,
    res4Set: args.res4Set,
  });
  return { ok: true, idx };
}

/**
 * Decides whether a single human movement order may mutate a tactical sub-unit row in the snapshot clone.
 *
 * Purpose: Mirrors `tacticalComputeMovementOrderOutcome` for opponent rows but requires `player === 'human'`.
 * When to use: `projectTacticalSnapshotAfterHumanMovementOrders` before applying `h3Index` updates for the human player.
 * Expected outcome: Same success/failure shape as the opponent helper with `non_human` instead of `non_opponent`. Emits debug logs when the planner finds a reachable path.
 * Exceptions: Invalid H3 indexes may yield `out_of_range` when the tactical march planner cannot find a finite-cost path.
 */
export function tacticalComputeHumanMovementOrderOutcome(args: {
  byId: ReadonlyMap<string, number>;
  sub: readonly TacticalSubUnitSnapshot[];
  order: { unitId: string; toH3Index: string };
  res4Set: ReadonlySet<string>;
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
  >;
}):
  | { ok: true; idx: number }
  | { ok: false; reason: TacticalMovementBlockReason; context: Record<string, unknown> } {
  const idx = args.byId.get(args.order.unitId);
  if (idx === undefined) {
    return { ok: false, reason: 'unknown_unit', context: { unitId: args.order.unitId } };
  }
  const u = args.sub[idx]!;
  if (u.player !== 'human') {
    return { ok: false, reason: 'non_human', context: { unitId: args.order.unitId } };
  }
  if (!args.res4Set.has(args.order.toH3Index)) {
    return {
      ok: false,
      reason: 'outside_footprint',
      context: { unitId: args.order.unitId, toH3Index: args.order.toH3Index },
    };
  }
  const moveType = tacticalMovementUnitTypeForPathfinding(u, args.order.toH3Index);
  if (moveType === 'air') {
    return { ok: false, reason: 'air_no_march', context: { unitId: args.order.unitId } };
  }
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(args.battle, u, args.sub, moveType);
  const plan = planTacticalRes4MarchWithSessionCache(args.battle, {
    fromH3: u.h3Index,
    toH3: args.order.toH3Index,
    res4Set: args.res4Set,
    unitTypeForMovement: moveType,
    movementPointBudget: Math.max(0, budget),
  });
  if (!plan.reachable) {
    tacticalLogMutate('tacticalMarchPlan unreachable', {
      battleId: args.battle.battleId,
      tacticalTurnNumber: args.battle.tacticalTurnNumber,
      player: 'human',
      unitId: args.order.unitId,
      subUnitType: u.unitType,
      moveType,
      fromH3: u.h3Index,
      toH3: args.order.toH3Index,
      movementPointBudget: budget,
      plannerReason: plan.failureReason,
    });
    return {
      ok: false,
      reason: 'out_of_range',
      context: {
        unitId: args.order.unitId,
        from: u.h3Index,
        to: args.order.toH3Index,
        budget,
        plannerReason: plan.failureReason,
      },
    };
  }
  logTacticalMarchPlanOk({
    player: 'human',
    battle: args.battle,
    unitId: args.order.unitId,
    subUnitType: u.unitType,
    moveType,
    fromH3: u.h3Index,
    toH3: args.order.toH3Index,
    budget,
    plan,
    res4Set: args.res4Set,
  });
  return { ok: true, idx };
}

/**
 * Returns the index of the first row whose `id` matches `unitId`, or `-1` when absent.
 *
 * Contract: Standard `Array#findIndex` semantics on a shallow snapshot row list.
 * When to use: Composite tactical order application for embark and ferry rows before guarded mutation.
 * Expected outcome: Non-negative index when the id exists.
 * Exceptions: None.
 */
export function tacticalFindSubUnitIndexById(subUnits: readonly { id: string }[], unitId: string): number {
  return subUnits.findIndex((u) => u.id === unitId);
}

/**
 * Returns true when a res4 child hex id lies inside the tactical footprint set.
 *
 * Contract: Thin wrapper over `Set#has` to keep tactical footprint checks named consistently.
 * When to use: Ferry destination checks and any other res4 membership test against `res4ChildH3Indexes`.
 * Expected outcome: True iff the tactical snapshot lists the cell.
 * Exceptions: None.
 */
export function tacticalRes4FootprintContains(res4Set: ReadonlySet<string>, h3Index: string): boolean {
  return res4Set.has(h3Index);
}

/**
 * Returns true when the indexed sub-unit is an opponent air unit suitable for ferry mutation.
 *
 * Contract: Does not validate airport infrastructure or destination legality.
 * When to use: Composite ferry loop after `findIndex` succeeds.
 * Expected outcome: True only for `player === 'opponent'` and `unitType === 'air'`.
 * Exceptions: None.
 */
export function tacticalGuardOpponentAirSubUnitForFerry(sub: readonly TacticalSubUnitSnapshot[], index: number): boolean {
  const u = sub[index];
  return !!u && u.unitType === 'air' && u.player === 'opponent';
}
