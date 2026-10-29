/**
 * Tactical pathfinding: plan_route / check_distance via tactical march planner (not strategic land-mass).
 */

import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { MISSILE_CANNOT_MOVE_REASON, isMissileUnitType } from '../../shared/missileRules';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { planTacticalMarchWithSessionCache } from '../tacticalBattle/tacticalMovementPlanningCache';
import { tacticalLandMarchBestEffortPlanTowardOrderedHex } from '../tacticalBattle/tacticalSnapshotGuards';
import { briefingSeatForBattle } from '../briefing/briefingPerspective';
import { checkDistanceTagSourceUnit } from './pathfindingDistanceHelpers';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from '../../shared/tacticalTerrainCombatModifiers';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  isNavalTacticalCellNavigable,
  type TacticalMovementCategory,
} from '../../shared/tacticalTerrainMovement';
import { cellAllowsTerrainBonusStop } from '../../shared/tacticalMarchStepCost';
import { terrainBonusMarchCategoryForMover } from '../../shared/terrainBonusMarch';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logError } from '../logger';
import { h3ToLatLng, type LatLng } from './h3LatLng';
import { estimateTacticalMarch, estimateTacticalTurnsRequired } from './tacticalMarchEstimate';

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
 * Builds the tactical footprint set for a tactical plan_route, optionally excluding other-player hexes.
 *
 * Purpose: Mirrors strategic avoidEnemies by removing enemy-occupied cells while keeping origin and destination.
 * When to use: Before `planTacticalMarchWithSessionCache` when the model requests (or defaults to) avoidance.
 * Expected outcome: Subset of `battle.tacticalChildH3Indexes`; destination always retained when inside the footprint.
 * Exceptions: None.
 */
function buildTacticalRouteSet(
  battle: TacticalBattleSnapshot,
  originH3: string,
  destinationH3: string,
  avoidEnemies: boolean,
  moverPlayer: string
): Set<string> {
  const base = new Set(battle.tacticalChildH3Indexes);
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
 * Picks the nearest naval-navigable tactical cell to a land reference hex inside the battle footprint.
 *
 * Purpose: Mirrors strategic plan_route land→water redirect so naval units can route toward land targets.
 * When to use: Before tactical naval plan_route / check_distance when the requested destination is not navigable for naval.
 * Expected outcome: Closest navigable footprint cell by H3 distance, or undefined when none exist.
 * Exceptions: None; distances use the shared BFS fallback so a cell across a face crossing stays a candidate.
 */
function nearestNavigableNavalTacticalTo(
  battle: TacticalBattleSnapshot,
  landRefH3: string,
  tacticalSet: ReadonlySet<string>
): string | undefined {
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
  let best: string | undefined;
  let bestD = Infinity;
  for (const h3 of tacticalSet) {
    const resolved = terrain.effectiveKindForTacticalHex(h3);
    if (
      !isNavalTacticalCellNavigable({
        resolvedKindForCell: resolved,
        parentTerrain: terrain.parentTerrain,
        parentTerrainKind: terrain.parentTerrainKind,
        isSeaportCell: terrain.isSeaportTactical?.(h3) === true,
      })
    ) {
      continue;
    }
    const d = computeGridDistanceWithPathFallbackPure(h3, landRefH3);
    if (d !== null && d < bestD) {
      bestD = d;
      best = h3;
    }
  }
  return best;
}

/**
 * Resolves a naval destination for `plan_route` and `check_distance`.
 *
 * Purpose: A naval unit cannot end on most land cells, so a land destination is moved to the nearest navigable cell.
 * A naval unit born on wetlands may stop on a wetlands cell through the terrain bonus, so that destination is kept.
 * When to use: Before planning a naval march in either battle tool.
 * Expected outcome: The given cell when naval can enter it or stop on it, otherwise the nearest navigable footprint
 * cell with `redirected: true`. The given cell when no navigable cell exists.
 * Exceptions: None.
 */
function resolveNavalTacticalDestination(args: {
  battle: TacticalBattleSnapshot;
  destH3: string;
  footprint: ReadonlySet<string>;
  terrainBonusCategory: TacticalMovementCategory | null;
}): { destH3: string; redirected: boolean } {
  const { battle, destH3, footprint, terrainBonusCategory } = args;
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
  const navigable = isNavalTacticalCellNavigable({
    resolvedKindForCell: terrain.effectiveKindForTacticalHex(destH3),
    parentTerrain: terrain.parentTerrain,
    parentTerrainKind: terrain.parentTerrainKind,
    isSeaportCell: terrain.isSeaportTactical?.(destH3) === true,
  });
  if (navigable || cellAllowsTerrainBonusStop({ terrain, moveType: 'naval', terrainBonusCategory }, destH3)) {
    return { destH3, redirected: false };
  }
  const waterHex = nearestNavigableNavalTacticalTo(battle, destH3, footprint);
  return waterHex ? { destH3: waterHex, redirected: true } : { destH3, redirected: false };
}

/**
 * Plans a tactical land/naval march and builds a Tool1 plan_route success payload truncated to the first Ready leg.
 *
 * Purpose: Fixes tactical AI plan_route when strategic land-mass rejects every tactical cell.
 * When to use: `executePathfinding` when `tacticalBattle` is set for `plan_route`.
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
  logDebug('tacticalPathfinding executeTacticalPlanRoute', {
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
    if (isMissileUnitType(unit.unitType)) {
      return { status: 'error', error: MISSILE_CANNOT_MOVE_REASON };
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
    const footprint = new Set(battle.tacticalChildH3Indexes);
    if (!footprint.has(originH3) || !footprint.has(destH3)) {
      return { status: 'error', error: 'Origin or destination is outside the tactical battle footprint.' };
    }
    const warnings: string[] = [];
    const terrainBonusCategory = sub ? terrainBonusMarchCategoryForMover(battle, sub, unit.unitType) : null;
    if (unit.unitType === 'naval') {
      const resolved = resolveNavalTacticalDestination({ battle, destH3, footprint, terrainBonusCategory });
      if (resolved.redirected) {
        destH3 = resolved.destH3;
        warnings.push('Naval destination redirected to nearest water/coastal/seaport hex in the tactical footprint.');
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

    const tryPlan = (tacticalSet: Set<string>) =>
      planTacticalMarchWithSessionCache(battle, {
        fromH3: originH3,
        toH3: destH3,
        tacticalSet,
        unitTypeForMovement: unit.unitType,
        movementPointBudget: Math.max(0, budget),
        weatherEnabled: battle.weatherBonusEnabled === true,
        weather: battle.weather,
        weatherTags: sub?.weatherTags,
        terrainBonusCategory,
      });

    let plan = tryPlan(buildTacticalRouteSet(battle, originH3, destH3, avoidEnemies, unit.player));
    if (!plan.reachable && avoidEnemies) {
      plan = tryPlan(footprint);
      if (plan.reachable) {
        warnings.push('Route passes through enemy-occupied hexes - avoidance was not possible.');
      }
    }

    if (!plan.reachable && (unit.unitType === 'infantry' || unit.unitType === 'armor') && budget >= 1) {
      const bestEffort = tacticalLandMarchBestEffortPlanTowardOrderedHex({
        battle,
        fromH3: originH3,
        orderedToH3: destH3,
        tacticalSet: footprint,
        moveType: unit.unitType,
        movementPointBudget: budget,
        weatherTags: sub?.weatherTags,
        terrainBonusCategory,
      });
      if (bestEffort) {
        plan = bestEffort;
        warnings.push(
          'Full destination had no continuous path; orderToHexCode is a one-step approach toward that hex (same best-effort as Ready).'
        );
      }
    }

    if (!plan.reachable || !plan.pathToDestination || plan.pathToDestination.length < 2) {
      logDebug('tacticalPathfinding executeTacticalPlanRoute: no path', {
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

    logDebug('tacticalPathfinding executeTacticalPlanRoute: ok', {
      battleId: battle.battleId,
      unitId,
      originH3,
      destinationH3: destH3,
      orderToH3: firstStop,
      reachableThisTurn: plan.reachableThisTurn,
      totalCostToDestination: plan.totalCostToDestination,
      turnsRequired,
      budget,
      terrainBonusCategory,
      usesTerrainBonus: plan.usesTerrainBonus === true,
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
    logError('tacticalPathfinding executeTacticalPlanRoute: exception', { unitId, error: String(err) });
    return { status: 'error', error: 'Route planning failed due to an internal error. Please retry.' };
  }
}

/**
 * Tactical check_distance using tactical march cost/path instead of strategic land-mass BFS.
 *
 * Purpose: Lets the model compare approach options inside a battle without false “unreachable” from strategic land-mass.
 * When to use: `executePathfinding` when `tacticalBattle` is set for `check_distance`.
 * Expected outcome: hexDistance from path length; estimatedTurns from MP cost / budget; reachable when a finite path exists.
 * Weather budgets and enter costs use the tags of the sub-unit `checkDistanceTagSourceUnit` picks on the start cell, as
 * strategic `check_distance` does; an empty start cell means an untagged mover. Terrain-bonus stops use that same
 * sub-unit's birth terrain, so an empty start cell gets none.
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
  logDebug('tacticalPathfinding executeTacticalCheckDistance', {
    battleId: battle.battleId,
    from: from.join(','),
    to: to.join(','),
    unitType,
  });
  const fromH3 = resolveToH3(from[0], from[1]);
  const toH3 = resolveToH3(to[0], to[1]);
  const footprint = new Set(battle.tacticalChildH3Indexes);
  if (!fromH3 || !toH3 || !footprint.has(fromH3) || !footprint.has(toH3)) {
    return { status: 'error', error: 'Invalid hex position' };
  }
  const fromLl = h3ToLatLng(fromH3, latLngByH3, 'origin');
  const toLl = h3ToLatLng(toH3, latLngByH3, 'origin');
  if (isMissileUnitType(unitType) || unitType === 'air') {
    return { status: 'ok', from: fromLl, to: toLl, hexDistance: 0, estimatedTurns: 0, reachable: false };
  }
  const occupant = checkDistanceTagSourceUnit(battle.subUnits, fromH3, unitType, briefingSeatForBattle(battle));
  const mover = { unitType, h3Index: fromH3, weatherTags: occupant?.weatherTags, origin: occupant?.origin };
  const toH3Resolved =
    unitType === 'naval'
      ? resolveNavalTacticalDestination({
          battle,
          destH3: toH3,
          footprint,
          terrainBonusCategory: terrainBonusMarchCategoryForMover(battle, mover, unitType),
        }).destH3
      : toH3;
  if (fromH3 === toH3Resolved) {
    return { status: 'ok', from: fromLl, to: h3ToLatLng(toH3Resolved, latLngByH3, 'origin'), hexDistance: 0, estimatedTurns: 0, reachable: true };
  }
  const estimate = estimateTacticalMarch(battle, mover, toH3Resolved, footprint);
  return {
    status: 'ok',
    from: fromLl,
    to: h3ToLatLng(toH3Resolved, latLngByH3, 'origin'),
    hexDistance: estimate.pathStepCount,
    estimatedTurns: estimate.estimatedBeats,
    reachable: estimate.reachable,
  };
}
