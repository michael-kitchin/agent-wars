/**
 * Lists res4 cells a tactical sub-unit can fully reach this beat under terrain-weighted MP budgets.
 */

import { gridDisk } from 'h3-js';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import { planTacticalRes4March } from './tacticalRes4MovementPlanner';
import {
  buildRes4FootprintAdjacencyMap,
  res4FootprintNeighborLookupFromMap,
} from './tacticalRes4TransportLink';
import { buildTacticalTerrainKindResolverFromSnapshot } from './tacticalTerrainMovement';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from './tacticalTerrainCombatModifiers';

/**
 * Lists footprint cells the mover can occupy this beat via a legal tactical march (same planner as Ready commit).
 *
 * Purpose: Replaces strategic `getValidDestinations` (res1 land-mass) when Best Options / possible-actions tables run on a tactical planState.
 * When to use: `collectAggregatedPossibleActionRows` when `tacticalBattle` is set for non-air opponent sub-units.
 * Expected outcome: Hexes with `reachableThisTurn` under `planTacticalRes4March`, excluding the mover’s current cell; empty for air, embarked cargo, unknown ids, or zero budget.
 * Exceptions: Never throws; H3 disk failures fall back to scanning the full footprint set.
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
