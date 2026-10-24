/**
 * Tactical snapshot guard helpers shared by movement projection and composite order application.
 */

import { gridDisk } from 'h3-js';
import { strategicParentOf } from '../../shared/h3Resolutions';
import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import type { TacticalMarchPlanResult } from '../../shared/tacticalMovementPlanner';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  buildLandMarchStepLegalityDetailAlongPath,
  summarizeLandMarchStepLegalityAlongPath,
} from '../../shared/tacticalLandMarchContinuity';
import { planTacticalMarchWithSessionCache } from './tacticalMovementPlanningCache';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  tacticalMovementUnitTypeForPathfinding,
  type TacticalMovementCategory,
} from '../../shared/tacticalTerrainMovement';
import { terrainBonusMarchCategoryForMover } from '../../shared/terrainBonusMarch';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from '../../shared/tacticalTerrainCombatModifiers';
import { HUMAN_SEAT_ID, isNeutralOwnerId, type OwnerId } from '../../shared/seatIds';
import { opposingPartyIdOf } from './opposingParty';
import { tacticalLogError, tacticalLogMutate } from './tacticalLogging';
import { logDebug } from '../logger';

/**
 * Snapshot fields required to rebuild the tactical terrain resolver for march debug previews.
 *
 * Purpose: Keeps `tacticalCompute*MovementOrderOutcome` and `logTacticalMarchPlanOk` aligned with `planTacticalMarchWithSessionCache`.
 * When to use: Typing `battle` arguments that must support transport overlay reconstruction.
 * Expected outcome: Same shape as `buildTacticalTerrainKindResolverFromSnapshot` input.
 * Exceptions: None.
 */
type TacticalBattleSnapshotMarchTerrainPick = Pick<
  TacticalBattleSnapshot,
  | 'tacticalTerrainKindByH3'
  | 'strategicHexTerrain'
  | 'strategicHexTerrainKind'
  | 'tacticalIsSeaportByH3'
  | 'tacticalIsUrbanByH3'
  | 'tacticalIsRubbleByH3'
  | 'tacticalRoadSidesByH3'
  | 'tacticalRailSidesByH3'
>;

/** Snapshot slice passed into `planTacticalMarchWithSessionCache` from movement outcome helpers. */
type TacticalMarchPlanBattleArgs = Pick<
  TacticalBattleSnapshot,
  | 'battleId'
  | 'tacticalTurnNumber'
  | 'subUnits'
  | 'tacticalChildH3Indexes'
  | 'tacticalTerrainKindByH3'
  | 'strategicHexTerrain'
  | 'strategicHexTerrainKind'
  | 'tacticalIsSeaportByH3'
  | 'tacticalIsUrbanByH3'
  | 'tacticalIsRubbleByH3'
  | 'tacticalRoadSidesByH3'
  | 'tacticalRailSidesByH3'
  | 'weather'
  | 'weatherBonusEnabled'
  | 'weatherBonusLevel'
  | 'terrainBonusEnabled'
>;

/**
 * Lists tactical footprint neighbors of `fromH3` on the H3 grid (ring-1), excluding the origin cell.
 *
 * Purpose: Drives best-effort land march recovery when the continuity planner cannot route to the ordered hex but a
 * shorter goal (a neighbor as `toH3`) changes per-step transport rules so a one-step plan may still exist.
 * When to use: Only from `tacticalLandMarchBestEffortPlanTowardOrderedHex` after a `no_path` failure to the full goal.
 * Expected outcome: Only indexes present in `tacticalSet`; empty when `gridDisk` throws for malformed input.
 * Exceptions: None; failures degrade to an empty list.
 */
function landTacticalFootprintRing1Neighbors(fromH3: string, tacticalSet: ReadonlySet<string>): string[] {
  const out: string[] = [];
  try {
    for (const n of gridDisk(fromH3, 1)) {
      if (n !== fromH3 && tacticalSet.has(n)) out.push(n);
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * When marching to the ordered tactical hex is `no_path`, searches one-step destinations (each ring-1 neighbor as a
 * mini-goal) and returns the cheapest plan whose first leg strictly reduces H3 grid distance to `orderedToH3`.
 *
 * Purpose: `planInfantryArmorLandContinuityMarch` depends on `marchGoalH3` for transport-aware edge costs; the model
 * may supply a valid `orderToHexCode` that is unreachable as a **full** goal while a neighbor remains a legal first hop
 * that advances toward that code on the H3 grid (matches user expectation when “too far” / continuity mismatch).
 * When to use: Opponent/human `tacticalCompute*MovementOrderOutcome` and the battle `plan_route` tool, only after the
 * primary plan to the ordered hex fails, for infantry/armor with a positive MP budget, when grid distance from origin to
 * the ordered hex is at least two (adjacent failures stay authoritative).
 * Expected outcome: `null` when no neighbor yields a reachable one-beat plan that strictly approaches `orderedToH3`.
 * Exceptions: None; distances come from the shared BFS fallback, so a tactical pair spanning an icosahedron face crossing
 * still yields a candidate instead of disabling recovery for the whole beat. Friendly-occupied neighbors stay
 * eligible so units may stack.
 */
export function tacticalLandMarchBestEffortPlanTowardOrderedHex(args: {
  battle: TacticalMarchPlanBattleArgs;
  fromH3: string;
  orderedToH3: string;
  tacticalSet: ReadonlySet<string>;
  moveType: string;
  movementPointBudget: number;
  weatherTags?: readonly import('../../shared/weatherBonusTypes').WeatherState[] | null;
  /** From `terrainBonusMarchCategoryForMover` for the moving sub-unit; null or omitted means no terrain-bonus stops. */
  terrainBonusCategory?: TacticalMovementCategory | null;
}): TacticalMarchPlanResult | null {
  logDebug('tacticalSnapshotGuards tacticalLandMarchBestEffortPlanTowardOrderedHex', {
    battleId: args.battle.battleId,
    fromH3: args.fromH3,
    orderedToH3: args.orderedToH3,
    moveType: args.moveType,
    movementPointBudget: args.movementPointBudget,
    terrainBonusCategory: args.terrainBonusCategory ?? null,
  });
  if (args.movementPointBudget < 1) return null;
  if (args.moveType !== 'infantry' && args.moveType !== 'armor') return null;
  const d0 = computeGridDistanceWithPathFallbackPure(args.fromH3, args.orderedToH3);
  if (d0 === null || d0 <= 1) return null;
  const neighbors = landTacticalFootprintRing1Neighbors(args.fromH3, args.tacticalSet);
  let best: TacticalMarchPlanResult | null = null;
  let bestRank = Infinity;
  for (const n of neighbors) {
    const p = planTacticalMarchWithSessionCache(args.battle, {
      fromH3: args.fromH3,
      toH3: n,
      tacticalSet: args.tacticalSet,
      unitTypeForMovement: args.moveType,
      movementPointBudget: Math.max(0, args.movementPointBudget),
      weatherEnabled: args.battle.weatherBonusEnabled === true,
      weather: args.battle.weather,
      weatherTags: args.weatherTags,
      terrainBonusCategory: args.terrainBonusCategory,
    });
    if (!p.reachable) continue;
    const applied = p.firstStopWithinBudget.stopH3;
    if (applied === args.fromH3) continue;
    const d1 = computeGridDistanceWithPathFallbackPure(applied, args.orderedToH3);
    if (d1 === null || d1 >= d0) continue;
    const cost = Number.isFinite(p.totalCostToDestination) ? p.totalCostToDestination : Number.POSITIVE_INFINITY;
    const rank = d1 * 1e9 + cost;
    if (rank < bestRank) {
      bestRank = rank;
      best = p;
    }
  }
  return best;
}

/**
 * Builds a compact comma-separated list of effective tactical terrain kind strings along a planned path for debug triage.
 *
 * Purpose: Correlates accepted tactical routes with snapshot `tacticalTerrainKindByH3` (and parent kind fallback) without dumping full H3 lists.
 * When to use: Only from debug logging after a successful `planTacticalMarchWithSessionCache` result.
 * Expected outcome: Short string for typical paths; middle elided when the path is long.
 * Exceptions: None.
 */
function tacticalKindPreviewAlongPath(
  battle: Pick<TacticalBattleSnapshot, 'tacticalTerrainKindByH3' | 'strategicHexTerrainKind'>,
  path: readonly string[] | null
): string | null {
  if (!path?.length) return null;
  const row = (h: string): string => {
    const raw = battle.tacticalTerrainKindByH3?.[h];
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
 * When to use: After `planTacticalMarchWithSessionCache` returns `reachable: true` inside movement outcome helpers.
 * Expected outcome: One line per validated order with path head/tail, costs, and terrain kind preview.
 * Exceptions: None.
 */
function logTacticalMarchPlanOk(args: {
  player: OwnerId;
  battle: Pick<
    TacticalBattleSnapshot,
    'battleId' | 'tacticalTurnNumber' | 'tacticalTerrainKindByH3' | 'strategicHexTerrainKind'
  > &
    TacticalBattleSnapshotMarchTerrainPick;
  unitId: string;
  subUnitType: string;
  moveType: string;
  fromH3: string;
  toH3: string;
  budget: number;
  plan: TacticalMarchPlanResult;
  tacticalSet: ReadonlySet<string>;
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
          tacticalSet: args.tacticalSet,
        })
      : null;
  const landMarchDetail =
    terrain != null ? buildLandMarchStepLegalityDetailAlongPath({
      path,
      unitTypeForMovement: args.moveType,
      terrain,
      marchGoalH3: args.toH3,
      tacticalSet: args.tacticalSet,
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
    usesTerrainBonus: args.plan.usesTerrainBonus === true,
    pathLen: path?.length ?? 0,
    pathHead: path?.slice(0, 4) ?? [],
    pathTail: path?.slice(-3) ?? [],
    terrainKindsAlongPath: tacticalKindPreviewAlongPath(args.battle, path),
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
  | 'air_no_march'
  | 'embarked_cargo';

/**
 * Snapshot fields and lookup tables needed to project one tactical march order.
 *
 * Purpose: Names the march-planner input shared by the human and opponent public helpers.
 * When to use: Arguments to `tacticalComputeMovementOrderOutcome` and `tacticalComputeHumanMovementOrderOutcome`.
 * Expected outcome: `battle` carries the footprint, terrain, and transport maps the planner reads; `byId`/`sub`/`order` identify the actor and destination.
 * Exceptions: None; this type does not validate H3 indexes.
 */
type TacticalMovementOrderOutcomeArgs = {
  byId: ReadonlyMap<string, number>;
  sub: readonly TacticalSubUnitSnapshot[];
  order: { unitId: string; toH3Index: string };
  tacticalSet: ReadonlySet<string>;
  battle: Pick<
    TacticalBattleSnapshot,
    | 'battleId'
    | 'tacticalTurnNumber'
    | 'subUnits'
    | 'tacticalChildH3Indexes'
    | 'tacticalTerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'tacticalIsSeaportByH3'
    | 'tacticalIsUrbanByH3'
    | 'tacticalIsRubbleByH3'
    | 'tacticalRoadSidesByH3'
    | 'tacticalRailSidesByH3'
    | 'weather'
    | 'weatherBonusEnabled'
    | 'weatherBonusLevel'
    | 'terrainBonusEnabled'
    | 'opposingPartyId'
  >;
};

/**
 * Success or diagnostic failure from projecting one tactical march order.
 *
 * Purpose: The projection contract returned to snapshot appliers: apply at `idx` or skip with a block reason.
 * When to use: Return type of `tacticalComputeMovementOrderOutcome` and `tacticalComputeHumanMovementOrderOutcome`.
 * Expected outcome: `ok: true` with index and applied hex, or `ok: false` with a block reason and diagnostic context.
 * Exceptions: None.
 */
type TacticalMovementOrderOutcome =
  | { ok: true; idx: number; appliedToH3Index: string }
  | { ok: false; reason: TacticalMovementBlockReason; context: Record<string, unknown> };

/**
 * Projects one tactical march order for a specific player.
 *
 * Purpose: Single implementation of opponent and human movement-order guards.
 * When to use: Only from the two public delegates in this module.
 * Expected outcome: Same success/failure shape as the public opponent and human helpers.
 * Exceptions: Invalid H3 indexes may yield `out_of_range` when the tactical march planner cannot find a finite-cost path, or when the planner cannot spend movement toward a different ordered cell this beat (`plannerReason: no_progress`). Friendly stacking on the applied cell is legal.
 */
function tacticalComputeMovementOrderOutcomeForPlayer(
  player: OwnerId,
  args: TacticalMovementOrderOutcomeArgs
): TacticalMovementOrderOutcome {
  const idx = args.byId.get(args.order.unitId);
  if (idx === undefined) {
    return { ok: false, reason: 'unknown_unit', context: { unitId: args.order.unitId } };
  }
  const u = args.sub[idx]!;
  if (u.player !== player) {
    return {
      ok: false,
      reason: player === HUMAN_SEAT_ID ? 'non_human' : 'non_opponent',
      context: { unitId: args.order.unitId },
    };
  }
  if (!args.tacticalSet.has(args.order.toH3Index)) {
    return {
      ok: false,
      reason: 'outside_footprint',
      context: { unitId: args.order.unitId, toH3Index: args.order.toH3Index },
    };
  }
  let pathfindUnit = u;
  if (player === HUMAN_SEAT_ID) {
    if (
      (u.unitType === 'infantry' || u.unitType === 'armor') &&
      u.embarkedOnSubUnitId &&
      args.order.toH3Index !== u.h3Index
    ) {
      return {
        ok: false,
        reason: 'embarked_cargo',
        context: { unitId: args.order.unitId, toH3Index: args.order.toH3Index },
      };
    }
  } else {
    const opponentDebarkingIndependently =
      (u.unitType === 'infantry' || u.unitType === 'armor') &&
      !!u.embarkedOnSubUnitId &&
      args.order.toH3Index !== u.h3Index;
    pathfindUnit = opponentDebarkingIndependently ? { ...u, embarkedOnSubUnitId: undefined } : u;
  }
  const moveType = tacticalMovementUnitTypeForPathfinding(pathfindUnit, args.order.toH3Index);
  if (moveType === 'air') {
    return { ok: false, reason: 'air_no_march', context: { unitId: args.order.unitId } };
  }
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(args.battle, pathfindUnit, args.sub, moveType);
  const terrainBonusCategory = terrainBonusMarchCategoryForMover(args.battle, pathfindUnit, moveType);
  let plan = planTacticalMarchWithSessionCache(args.battle, {
    fromH3: u.h3Index,
    toH3: args.order.toH3Index,
    tacticalSet: args.tacticalSet,
    unitTypeForMovement: moveType,
    movementPointBudget: Math.max(0, budget),
    weatherEnabled: args.battle.weatherBonusEnabled === true,
    weather: args.battle.weather,
    weatherTags: pathfindUnit.weatherTags,
    terrainBonusCategory,
  });
  if (!plan.reachable) {
    const bestEffortPlan =
      plan.failureReason === 'no_path'
        ? tacticalLandMarchBestEffortPlanTowardOrderedHex({
            battle: args.battle,
            fromH3: u.h3Index,
            orderedToH3: args.order.toH3Index,
            tacticalSet: args.tacticalSet,
            moveType,
            movementPointBudget: Math.max(0, budget),
            weatherTags: pathfindUnit.weatherTags,
            terrainBonusCategory,
          })
        : null;
    if (bestEffortPlan) {
      tacticalLogMutate('tacticalMarchPlan bestEffortNeighborTowardOrderedHex', {
        battleId: args.battle.battleId,
        tacticalTurnNumber: args.battle.tacticalTurnNumber,
        player,
        unitId: args.order.unitId,
        subUnitType: u.unitType,
        moveType,
        fromH3: u.h3Index,
        orderedToH3: args.order.toH3Index,
        firstLegStopH3: bestEffortPlan.firstStopWithinBudget.stopH3,
        primaryPlannerReason: plan.failureReason,
      });
      plan = bestEffortPlan;
    } else {
      tacticalLogMutate('tacticalMarchPlan unreachable', {
        battleId: args.battle.battleId,
        tacticalTurnNumber: args.battle.tacticalTurnNumber,
        player,
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
  }
  const appliedToH3Index = plan.firstStopWithinBudget.stopH3;
  if (appliedToH3Index === u.h3Index && args.order.toH3Index !== u.h3Index) {
    tacticalLogMutate('tacticalMarchPlan noProgress', {
      battleId: args.battle.battleId,
      tacticalTurnNumber: args.battle.tacticalTurnNumber,
      player,
      unitId: args.order.unitId,
      subUnitType: u.unitType,
      moveType,
      fromH3: u.h3Index,
      toH3: args.order.toH3Index,
      movementPointBudget: budget,
    });
    return {
      ok: false,
      reason: 'out_of_range',
      context: {
        unitId: args.order.unitId,
        from: u.h3Index,
        to: args.order.toH3Index,
        budget,
        plannerReason: 'no_progress',
      },
    };
  }
  logTacticalMarchPlanOk({
    player,
    battle: args.battle,
    unitId: args.order.unitId,
    subUnitType: u.unitType,
    moveType,
    fromH3: u.h3Index,
    toH3: args.order.toH3Index,
    budget,
    plan,
    tacticalSet: args.tacticalSet,
  });
  return { ok: true, idx, appliedToH3Index };
}

/**
 * Decides whether a single opponent movement order may mutate a tactical sub-unit row in the snapshot clone.
 *
 * Contract: Does not mutate arrays; uses §12.4 terrain-weighted reachability inside the tactical footprint. Emits debug logs for planner outcomes.
 * When to use: `projectTacticalSnapshotAfterOpponentMovementOrders` loop before applying `h3Index` updates. The opposing party comes from `opposingPartyIdOf`.
 * Expected outcome: Returns `ok: true` with `idx` into the mutable `sub` clone and `appliedToH3Index` (first leg toward
 * the ordered cell, matching `tacticalMarchFirstStopAlongPath` / human Ready), or `ok: false` with a reason and diagnostic context.
 * Exceptions: Invalid H3 indexes may yield `out_of_range` when the tactical march planner cannot find a finite-cost path, or when the planner cannot spend movement toward a different ordered cell this beat (`plannerReason: no_progress`). Friendly stacking on the applied cell is legal.
 */
export function tacticalComputeMovementOrderOutcome(
  args: TacticalMovementOrderOutcomeArgs
): TacticalMovementOrderOutcome {
  const party = opposingPartyIdOf(args.battle);
  if (isNeutralOwnerId(party)) {
    return { ok: false, reason: 'non_opponent', context: { unitId: args.order.unitId } };
  }
  return tacticalComputeMovementOrderOutcomeForPlayer(party, args);
}

/**
 * Decides whether a single human movement order may mutate a tactical sub-unit row in the snapshot clone.
 *
 * Purpose: Delegates to the shared player-parameterized projection requiring `player === HUMAN_SEAT_ID`.
 * When to use: `projectTacticalSnapshotAfterHumanMovementOrders` before applying `h3Index` updates for the human player.
 * Expected outcome: Same success/failure shape as the opponent helper with `non_human` instead of `non_opponent` and the same `appliedToH3Index` first-leg semantics. Emits debug logs when the planner finds a reachable path.
 * Exceptions: Invalid H3 indexes may yield `out_of_range` when the tactical march planner cannot find a finite-cost path, or when the planner cannot spend movement toward a different ordered cell this beat (`plannerReason: no_progress`). Friendly stacking on the applied cell is legal.
 */
export function tacticalComputeHumanMovementOrderOutcome(
  args: TacticalMovementOrderOutcomeArgs
): TacticalMovementOrderOutcome {
  return tacticalComputeMovementOrderOutcomeForPlayer(HUMAN_SEAT_ID, args);
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
 * Returns true when a tactical child hex id lies inside the tactical footprint set.
 *
 * Contract: Thin wrapper over `Set#has` to keep tactical footprint checks named consistently.
 * When to use: Ferry destination checks and any other tactical membership test against `tacticalChildH3Indexes`.
 * Expected outcome: True iff the tactical snapshot lists the cell.
 * Exceptions: None.
 */
export function tacticalFootprintContains(tacticalSet: ReadonlySet<string>, h3Index: string): boolean {
  return tacticalSet.has(h3Index);
}

/**
 * Returns whether an infrastructure strike may use this tactical cell.
 *
 * Purpose: A margin cell can hold a unit. Rubble, airports, and seaports stay on the enclosing hex's own children.
 * When to use: Air-strike validation after the target is already inside the playable footprint.
 * Expected outcome: True when the cell is in `coreChildH3Indexes`. When that list is absent, true only when the cell's geometric parent is the enclosing hex.
 * Exceptions: A malformed cell id returns false.
 */
export function tacticalInfrastructureStrikeStaysOnEnclosingHex(
  battle: Pick<TacticalBattleSnapshot, 'enclosingStrategicH3Index' | 'coreChildH3Indexes'>,
  targetH3Index: string
): boolean {
  if (battle.coreChildH3Indexes) return battle.coreChildH3Indexes.includes(targetH3Index);
  try {
    return strategicParentOf(targetH3Index) === battle.enclosingStrategicH3Index;
  } catch (err) {
    tacticalLogError('tacticalInfrastructureStrikeStaysOnEnclosingHex rejected a cell id', { targetH3Index, err });
    return false;
  }
}

/**
 * Returns true when the indexed sub-unit is an opponent air unit suitable for ferry mutation.
 *
 * Contract: Does not validate airport infrastructure or destination legality.
 * When to use: Composite ferry loop after `findIndex` succeeds.
 * Expected outcome: `expectedPlayer` is required. True only when the row is air and owned by that player.
 * Exceptions: None.
 */
export function tacticalGuardOpponentAirSubUnitForFerry(
  sub: readonly TacticalSubUnitSnapshot[],
  index: number,
  expectedPlayer: OwnerId
): boolean {
  const u = sub[index];
  return !!u && u.unitType === 'air' && u.player === expectedPlayer;
}
