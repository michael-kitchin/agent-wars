/**
 * Lists res4 cells a tactical sub-unit can fully reach this beat under terrain-weighted MP budgets.
 *
 * Purpose: Tactical Best Options / possible-actions analogue of strategic `getValidDestinations` — one origin search for
 * legal destinations (land: MP Dijkstra; naval: enter-cost Dijkstra), not one plan per candidate hex.
 */

import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import { collectInfantryArmorReachableWithinBudget } from './tacticalRes4LandReachabilityWithinBudget';
import { collectSimpleEnterCostReachableWithinBudget, planTacticalRes4March } from './tacticalRes4MovementPlanner';
import {
  buildRes4FootprintAdjacencyMap,
  res4FootprintNeighborLookupFromMap,
} from './tacticalRes4TransportLink';
import { buildTacticalTerrainKindResolverFromSnapshot } from './tacticalTerrainMovement';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from './tacticalTerrainCombatModifiers';
import { gridDisk } from 'h3-js';

/**
 * Lists footprint cells the mover can occupy this beat via a legal tactical march (same planner rules as Ready commit).
 *
 * Purpose: Replaces strategic `getValidDestinations` (res1 land-mass / naval disk) when Best Options runs on a tactical planState.
 * When to use: `collectAggregatedPossibleActionRows` when `tacticalBattle` is set for non-air opponent sub-units.
 * Expected outcome: Hexes reachable this beat under MP budgets, excluding the mover’s current cell; empty for air, embarked cargo, unknown ids, or zero budget.
 * Exceptions: Never throws.
 */
export function collectTacticalLegalMoveDestinationRes4Hexes(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'res4ChildH3Indexes'
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
  moverSubUnitId: string
): string[] {
  const u = battle.subUnits.find((s) => s.id === moverSubUnitId);
  if (!u || u.unitType === 'air' || u.embarkedOnSubUnitId) return [];
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(
    battle,
    u,
    battle.subUnits,
    u.unitType
  );
  if (budget < 1) return [];
  const footprint = new Set(battle.res4ChildH3Indexes);
  if (!footprint.has(u.h3Index)) return [];
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprintNeighbors = res4FootprintNeighborLookupFromMap(
    buildRes4FootprintAdjacencyMap(footprint)
  );
  if (u.unitType === 'infantry' || u.unitType === 'armor') {
    return collectInfantryArmorReachableWithinBudget({
      fromH3: u.h3Index,
      res4Set: footprint,
      unitTypeForMovement: u.unitType,
      movementPointBudget: budget,
      terrain,
      footprintNeighbors,
    });
  }
  return collectSimpleEnterCostReachableWithinBudget({
    fromH3: u.h3Index,
    res4Set: footprint,
    unitTypeForMovement: u.unitType,
    movementPointBudget: budget,
    terrain,
    footprintNeighbors,
  });
}

/**
 * Reference implementation: one Dijkstra per disk candidate (equality tests only).
 *
 * Purpose: Locks single-source collector output against the historical per-destination algorithm on disk-radius candidates.
 * When to use: Unit tests comparing membership with `collectTacticalLegalMoveDestinationRes4Hexes`.
 * Expected outcome: Sorted membership matches the optimized collector for plains fixtures; forest/transport may differ when
 * fractional MP reaches beyond `gridDisk(budget)` (optimized is authoritative for Ready parity).
 * Exceptions: Never throws.
 */
export function collectTacticalLegalMoveDestinationRes4HexesBruteForceForTests(
  battle: Parameters<typeof collectTacticalLegalMoveDestinationRes4Hexes>[0],
  moverSubUnitId: string
): string[] {
  const u = battle.subUnits.find((s) => s.id === moverSubUnitId);
  if (!u || u.unitType === 'air' || u.embarkedOnSubUnitId) return [];
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(
    battle,
    u,
    battle.subUnits,
    u.unitType
  );
  if (budget < 1) return [];
  const footprint = new Set(battle.res4ChildH3Indexes);
  if (!footprint.has(u.h3Index)) return [];
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprintNeighbors = res4FootprintNeighborLookupFromMap(
    buildRes4FootprintAdjacencyMap(footprint)
  );
  let candidates: string[];
  try {
    candidates = [...gridDisk(u.h3Index, budget)].filter((h) => h !== u.h3Index && footprint.has(h));
  } catch {
    candidates = battle.res4ChildH3Indexes.filter((h) => h !== u.h3Index);
  }
  const out: string[] = [];
  for (const toH3 of candidates) {
    const plan = planTacticalRes4March({
      fromH3: u.h3Index,
      toH3,
      res4Set: footprint,
      unitTypeForMovement: u.unitType,
      movementPointBudget: budget,
      terrain,
      footprintNeighbors,
    });
    if (plan.reachableThisTurn) out.push(toH3);
  }
  return out;
}
