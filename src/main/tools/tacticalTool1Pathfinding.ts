/**
 * Tactical Tool 1 pathfinding: plan_route / check_distance via res4 march planner (not strategic land-mass).
 */

import { gridDisk, gridDistance } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { planTacticalRes4MarchWithSessionCache } from '../tacticalBattle/tacticalMovementPlanningCache';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from '../../shared/tacticalTerrainCombatModifiers';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  isNavalRes4TacticalCellNavigable,
} from '../../shared/tacticalTerrainMovement';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logError } from '../logger';
import { h3ToLatLng, type LatLng } from './h3LatLng';

/** Minimal plan_route options used by the tactical Tool1 branch (mirrors strategic `PlanRouteOptions`). */
type TacticalPlanRouteOptions = { avoidEnemies?: boolean; maxTurns?: number };

type PlanRouteOk = {
  status: 'ok';
  unitId: string;
  unitType: string;
  origin: LatLng;
  destination: LatLng;
  orderToXY: LatLng;
  orderToH3: string;
  hexDistance: number;
  turnsRequired: number;
  path: Array<{
    turn: number;
    hexes: LatLng[];
    movementSpent: number;
    movementBudget: number;
    endHex: LatLng;
  }>;
  warnings: string[];
  error?: null;
  reachable?: boolean;
};

type PlanRouteError = { status: 'error'; error: string };

type CheckDistanceOk = {
  status: 'ok';
  from: LatLng;
  to: LatLng;
  hexDistance: number;
  estimatedTurns: number;
  reachable: boolean;
};

type CheckDistanceError = { status: 'error'; error: string };

/**
 * Builds the res4 footprint set for a tactical plan_route, optionally excluding other-player hexes.
 *
 * Purpose: Mirrors strategic avoidEnemies by removing enemy-occupied cells while keeping origin and destination.
 * When to use: Before `planTacticalRes4MarchWithSessionCache` when the model requests (or defaults to) avoidance.
 * Expected outcome: Subset of `battle.res4ChildH3Indexes`; destination always retained when inside the footprint.
 * Exceptions: None.
 */
function buildTacticalRouteRes4Set(
  battle: TacticalBattleSnapshot,
  originH3: string,
  destinationH3: string,
  avoidEnemies: boolean,
  moverPlayer: string
): Set<string> {
  const base = new Set(battle.res4ChildH3Indexes);
  if (!avoidEnemies) return base;
  const enemyOccupied = new Set<string>();
  for (const u of battle.subUnits) {
    if (u.player === moverPlayer) continue;
    if (u.embarkedOnSubUnitId) continue;
    enemyOccupied.add(u.h3Index);
  }
  const out = new Set<string>();
  for (const h3 of base) {
    if (h3 === originH3 || h3 === destinationH3) {
      out.add(h3);
      continue;
    }
    if (enemyOccupied.has(h3)) continue;
    out.add(h3);
  }
  return out;
}

/**
 * Estimates tactical beats to destination from total MP cost and per-beat budget.
 *
 * Purpose: check_distance / plan_route turnsRequired without strategic step-based partitioning.
 * When to use: After a successful `planTacticalRes4March` with finite total cost.
 * Expected outcome: At least 1 when a multi-cell path exists; 0 when already at destination.
 * Exceptions: None.
 */
function estimateTacticalTurnsRequired(totalCost: number, budget: number, pathLen: number): number {
  if (pathLen <= 1) return 0;
  if (!(budget > 0) || !Number.isFinite(totalCost)) return pathLen - 1;
  return Math.max(1, Math.ceil(totalCost / budget));
}

/**
 * Picks the nearest naval-navigable res4 cell to a land reference hex inside the battle footprint.
 *
 * Purpose: Mirrors strategic plan_route land→water redirect so naval units can route toward land targets.
 * When to use: Before tactical naval plan_route / check_distance when the requested destination is not navigable for naval.
 * Expected outcome: Closest navigable footprint cell by H3 distance, or undefined when none exist.
 * Exceptions: None; gridDistance failures skip that candidate.
 */
function nearestNavigableNavalRes4To(
  battle: TacticalBattleSnapshot,
  landRefH3: string,
  res4Set: ReadonlySet<string>
): string | undefined {
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
  let best: string | undefined;
  let bestD = Infinity;
  for (const h3 of res4Set) {
    const resolved = terrain.effectiveKindForRes4Hex(h3);
    if (
      !isNavalRes4TacticalCellNavigable({
        resolvedKindForCell: resolved,
        parentTerrain: terrain.parentTerrain,
        parentTerrainKind: terrain.parentTerrainKind,
        isSeaportCell: terrain.isSeaportRes4?.(h3) === true,
      })
    ) {
      continue;
    }
    try {
      const d = gridDistance(h3, landRefH3);
      if (d < bestD) {
        bestD = d;
        best = h3;
      }
    } catch {
      /* skip */
    }
  }
  return best;
}

/**
 * Plans a tactical land/naval march and builds a Tool1 plan_route success payload truncated to the first Ready leg.
 *
 * Purpose: Fixes tactical AI plan_route when strategic res1 land-mass rejects every res4 cell.
 * When to use: `executeTool1` when `tacticalBattle` is set for `plan_route`.
 * Expected outcome: `orderToH3` = `firstStopWithinBudget.stopH3` (same truncation as human Ready); avoidEnemies honored with unblock retry.
 * Exceptions: Returns PlanRouteError for air, unknown units, off-footprint cells, or unreachable destinations.
 */
export function executeTacticalPlanRoute(
  unitId: string,
  destination: LatLng,
  options: TacticalPlanRouteOptions | undefined,
  battle: TacticalBattleSnapshot,
  planState: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): PlanRouteOk | PlanRouteError {
  logDebug('tacticalTool1Pathfinding executeTacticalPlanRoute', {
    battleId: battle.battleId,
    unitId,
    destination: destination.join(','),
    avoidEnemies: options?.avoidEnemies ?? null,
  });
  try {
    const unit = planState.units.find((u) => u.id === unitId);
    if (!unit) {
      return { status: 'error', error: `Unit not found: ${unitId}` };
    }
    if (unit.unitType === 'air') {
      return {
        status: 'error',
        error: 'Air units use air strikes, not hex movement. Use the air_strike order instead of plan_route.',
      };
    }
    const sub = battle.subUnits.find((s) => s.id === unitId);
    if (sub?.embarkedOnSubUnitId) {
      return {
        status: 'error',
        error:
          'Unit is embarked cargo and cannot plan_route until disembarked; issue disembark (or explicit_move) to clear cargo and march.',
      };
    }
    let destH3 = resolveToH3(destination[0], destination[1]);
    if (!destH3) {
      return { status: 'error', error: 'Invalid destination hex' };
    }
    const originH3 = unit.h3Index;
    const footprint = new Set(battle.res4ChildH3Indexes);
    if (!footprint.has(originH3) || !footprint.has(destH3)) {
      return { status: 'error', error: 'Origin or destination is outside the tactical battle footprint.' };
    }
    const warnings: string[] = [];
    if (unit.unitType === 'naval') {
      const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
      const destNavigable = isNavalRes4TacticalCellNavigable({
        resolvedKindForCell: terrain.effectiveKindForRes4Hex(destH3),
        parentTerrain: terrain.parentTerrain,
        parentTerrainKind: terrain.parentTerrainKind,
        isSeaportCell: terrain.isSeaportRes4?.(destH3) === true,
      });
      if (!destNavigable) {
        const waterHex = nearestNavigableNavalRes4To(battle, destH3, footprint);
        if (waterHex) {
          destH3 = waterHex;
          warnings.push('Naval destination redirected to nearest water/coastal/seaport hex in the tactical footprint.');
        }
      }
    }
    if (originH3 === destH3) {
      const ll = h3ToLatLng(originH3, latLngByH3, 'origin');
      return {
        status: 'ok',
        unitId,
        unitType: unit.unitType,
        origin: ll,
        destination: ll,
        orderToXY: ll,
        orderToH3: originH3,
        hexDistance: 0,
        turnsRequired: 0,
        path: [],
        warnings: [
          ...warnings,
          "Destination resolves to the unit's current hex at map resolution; choose a more distant coordinate to move.",
        ],
        error: null,
      };
    }

    const budget = effectiveTacticalMovementPointBudgetForMarchLeg(
      battle,
      sub ?? { unitType: unit.unitType, h3Index: originH3 },
      battle.subUnits,
      unit.unitType
    );
    const avoidEnemies = options?.avoidEnemies !== false;

    const tryPlan = (res4Set: Set<string>) =>
      planTacticalRes4MarchWithSessionCache(battle, {
        fromH3: originH3,
        toH3: destH3,
        res4Set,
        unitTypeForMovement: unit.unitType,
        movementPointBudget: Math.max(0, budget),
      });

    let plan = tryPlan(buildTacticalRouteRes4Set(battle, originH3, destH3, avoidEnemies, unit.player));
    if (!plan.reachable && avoidEnemies) {
      plan = tryPlan(footprint);
      if (plan.reachable) {
        warnings.push('Route passes through enemy-occupied hexes - avoidance was not possible.');
      }
    }

    if (!plan.reachable && (unit.unitType === 'infantry' || unit.unitType === 'armor') && budget >= 1) {
      const bestEffort = tacticalBestEffortNeighborPlan({
        battle,
        fromH3: originH3,
        orderedToH3: destH3,
        res4Set: footprint,
        moveType: unit.unitType,
        movementPointBudget: budget,
      });
      if (bestEffort) {
        plan = bestEffort;
        warnings.push(
          'Full destination had no continuous path; orderToHexCode is a one-step approach toward that hex (same best-effort as Ready).'
        );
      }
    }

    if (!plan.reachable || !plan.pathToDestination || plan.pathToDestination.length < 2) {
      logDebug('tacticalTool1Pathfinding executeTacticalPlanRoute: no path', {
        battleId: battle.battleId,
        unitId,
        originH3,
        destinationH3: destH3,
        failureReason: plan.failureReason ?? null,
        avoidEnemies,
      });
      return {
        status: 'error',
        error:
          'No path exists - destination is impassable for this unit type or unreachable under tactical terrain rules.',
      };
    }

    const firstStop = plan.firstStopWithinBudget.stopH3;
    const path = plan.pathToDestination;
    const firstIdx = Math.max(1, path.indexOf(firstStop));
    const firstLegHexes = path.slice(0, firstIdx + 1);
    const turnsRequired = estimateTacticalTurnsRequired(plan.totalCostToDestination, budget, path.length);
    const originLl = h3ToLatLng(originH3, latLngByH3, 'origin');
    const destLl = h3ToLatLng(destH3, latLngByH3, 'origin');
    const orderLl = h3ToLatLng(firstStop, latLngByH3, 'origin');

    logDebug('tacticalTool1Pathfinding executeTacticalPlanRoute: ok', {
      battleId: battle.battleId,
      unitId,
      originH3,
      destinationH3: destH3,
      orderToH3: firstStop,
      reachableThisTurn: plan.reachableThisTurn,
      totalCostToDestination: plan.totalCostToDestination,
      turnsRequired,
      budget,
    });

    return {
      status: 'ok',
      unitId,
      unitType: unit.unitType,
      origin: originLl,
      destination: destLl,
      orderToXY: orderLl,
      orderToH3: firstStop,
      hexDistance: path.length - 1,
      turnsRequired,
      path: [
        {
          turn: 1,
          hexes: firstLegHexes.map((h) => h3ToLatLng(h, latLngByH3, 'origin')),
          movementSpent: Math.min(budget, plan.totalCostToDestination),
          movementBudget: budget,
          endHex: orderLl,
        },
      ],
      warnings,
      error: null,
      reachable: plan.reachableThisTurn,
    };
  } catch (err) {
    logError('tacticalTool1Pathfinding executeTacticalPlanRoute: exception', { unitId, error: String(err) });
    return { status: 'error', error: 'Route planning failed due to an internal error. Please retry.' };
  }
}

/**
 * One-step best-effort approach when the full destination has no continuous tactical path (mirrors Ready recovery).
 *
 * Purpose: Supplies a usable orderToHexCode when continuity planning fails for the full goal but a neighbor advances.
 * When to use: After primary plan_route to the ordered hex fails with no path for infantry/armor.
 * Expected outcome: Cheapest one-beat plan whose first stop strictly reduces H3 distance to the ordered hex, or null.
 * Exceptions: None.
 */
function tacticalBestEffortNeighborPlan(args: {
  battle: TacticalBattleSnapshot;
  fromH3: string;
  orderedToH3: string;
  res4Set: ReadonlySet<string>;
  moveType: string;
  movementPointBudget: number;
}): ReturnType<typeof planTacticalRes4MarchWithSessionCache> | null {
  let d0: number;
  try {
    d0 = gridDistance(args.fromH3, args.orderedToH3);
  } catch {
    return null;
  }
  if (d0 <= 1) return null;
  const neighbors: string[] = [];
  try {
    for (const n of gridDisk(args.fromH3, 1)) {
      if (n !== args.fromH3 && args.res4Set.has(n)) neighbors.push(n);
    }
  } catch {
    return null;
  }
  let best: ReturnType<typeof planTacticalRes4MarchWithSessionCache> | null = null;
  let bestRank = Infinity;
  for (const n of neighbors) {
    const p = planTacticalRes4MarchWithSessionCache(args.battle, {
      fromH3: args.fromH3,
      toH3: n,
      res4Set: args.res4Set,
      unitTypeForMovement: args.moveType,
      movementPointBudget: Math.max(0, args.movementPointBudget),
    });
    if (!p.reachable) continue;
    const applied = p.firstStopWithinBudget.stopH3;
    if (applied === args.fromH3) continue;
    let d1: number;
    try {
      d1 = gridDistance(applied, args.orderedToH3);
    } catch {
      continue;
    }
    if (d1 >= d0) continue;
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
 * Tactical check_distance using res4 march cost/path instead of strategic land-mass BFS.
 *
 * Purpose: Lets the model compare approach options inside a battle without false “unreachable” from res1 land-mass.
 * When to use: `executeTool1` when `tacticalBattle` is set for `check_distance`.
 * Expected outcome: hexDistance from path length; estimatedTurns from MP cost / budget; reachable when a finite path exists.
 * Exceptions: Returns error for invalid hexes; air unitType yields unreachable ok with zero distances.
 */
export function executeTacticalCheckDistance(
  from: LatLng,
  to: LatLng,
  unitType: string,
  battle: TacticalBattleSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): CheckDistanceOk | CheckDistanceError {
  logDebug('tacticalTool1Pathfinding executeTacticalCheckDistance', {
    battleId: battle.battleId,
    from: from.join(','),
    to: to.join(','),
    unitType,
  });
  const fromH3 = resolveToH3(from[0], from[1]);
  const toH3 = resolveToH3(to[0], to[1]);
  const footprint = new Set(battle.res4ChildH3Indexes);
  if (!fromH3 || !toH3 || !footprint.has(fromH3) || !footprint.has(toH3)) {
    return { status: 'error', error: 'Invalid hex position' };
  }
  const fromLl = h3ToLatLng(fromH3, latLngByH3, 'origin');
  const toLl = h3ToLatLng(toH3, latLngByH3, 'origin');
  if (unitType === 'air') {
    return { status: 'ok', from: fromLl, to: toLl, hexDistance: 0, estimatedTurns: 0, reachable: false };
  }
  let toH3Resolved = toH3;
  if (unitType === 'naval') {
    const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
    const destNavigable = isNavalRes4TacticalCellNavigable({
      resolvedKindForCell: terrain.effectiveKindForRes4Hex(toH3Resolved),
      parentTerrain: terrain.parentTerrain,
      parentTerrainKind: terrain.parentTerrainKind,
      isSeaportCell: terrain.isSeaportRes4?.(toH3Resolved) === true,
    });
    if (!destNavigable) {
      const waterHex = nearestNavigableNavalRes4To(battle, toH3Resolved, footprint);
      if (waterHex) toH3Resolved = waterHex;
    }
  }
  if (fromH3 === toH3Resolved) {
    return { status: 'ok', from: fromLl, to: h3ToLatLng(toH3Resolved, latLngByH3, 'origin'), hexDistance: 0, estimatedTurns: 0, reachable: true };
  }
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(
    battle,
    { unitType, h3Index: fromH3 },
    battle.subUnits,
    unitType
  );
  const plan = planTacticalRes4MarchWithSessionCache(battle, {
    fromH3,
    toH3: toH3Resolved,
    res4Set: footprint,
    unitTypeForMovement: unitType,
    movementPointBudget: Math.max(0, budget),
  });
  if (!plan.reachable || !plan.pathToDestination) {
    return { status: 'ok', from: fromLl, to: h3ToLatLng(toH3Resolved, latLngByH3, 'origin'), hexDistance: 0, estimatedTurns: 0, reachable: false };
  }
  const pathLen = plan.pathToDestination.length;
  return {
    status: 'ok',
    from: fromLl,
    to: h3ToLatLng(toH3Resolved, latLngByH3, 'origin'),
    hexDistance: Math.max(0, pathLen - 1),
    estimatedTurns: estimateTacticalTurnsRequired(plan.totalCostToDestination, budget, pathLen),
    reachable: true,
  };
}
