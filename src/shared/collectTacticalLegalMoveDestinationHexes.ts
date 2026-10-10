/**
 * Lists tactical cells a tactical sub-unit can fully reach this beat under terrain-weighted MP budgets.
 *
 * Purpose: Tactical Best Options / possible-actions analogue of strategic `getValidDestinations` — one origin search for
 * legal destinations (land: MP Dijkstra; naval: enter-cost Dijkstra), not one plan per candidate hex.
 */

import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import { collectInfantryArmorReachableWithinBudget } from './tacticalLandReachabilityWithinBudget';
import { collectSimpleEnterCostReachableWithinBudget, planTacticalMarch } from './tacticalMovementPlanner';
import {
  buildTacticalFootprintAdjacencyMap,
  tacticalFootprintNeighborLookupFromMap,
} from './tacticalTransportLink';
import { buildTacticalTerrainKindResolverFromSnapshot } from './tacticalTerrainMovement';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from './tacticalTerrainCombatModifiers';
import { terrainBonusMarchCategoryForMover } from './terrainBonusMarch';
import { gridDisk } from 'h3-js';

/**
 * Lists footprint cells the mover can occupy this beat via a legal tactical march (same planner rules as Ready commit).
 *
 * Purpose: Replaces strategic `getValidDestinations` (strategic land-mass / naval disk) when Best Options runs on a tactical planState.
 * When to use: `collectAggregatedPossibleActionRows` when `tacticalBattle` is set for non-air opponent sub-units.
 * Expected outcome: Hexes reachable this beat under MP budgets and the battle's weather enter costs, excluding the mover’s
 * current cell; empty for air, embarked cargo, unknown ids, or zero budget.
 * Exceptions: Never throws.
 */
export function collectTacticalLegalMoveDestinationHexes(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'tacticalChildH3Indexes'
    | 'subUnits'
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
  const footprint = new Set(battle.tacticalChildH3Indexes);
  if (!footprint.has(u.h3Index)) return [];
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprintNeighbors = tacticalFootprintNeighborLookupFromMap(
    buildTacticalFootprintAdjacencyMap(footprint)
  );
  const terrainBonusCategory = terrainBonusMarchCategoryForMover(battle, u, u.unitType);
  if (u.unitType === 'infantry' || u.unitType === 'armor') {
    return collectInfantryArmorReachableWithinBudget({
      fromH3: u.h3Index,
      tacticalSet: footprint,
      unitTypeForMovement: u.unitType,
      movementPointBudget: budget,
      terrain,
      footprintNeighbors,
      weatherEnabled: battle.weatherBonusEnabled === true,
      weather: battle.weather,
      weatherTags: u.weatherTags,
      terrainBonusCategory,
    });
  }
  return collectSimpleEnterCostReachableWithinBudget({
    fromH3: u.h3Index,
    tacticalSet: footprint,
    unitTypeForMovement: u.unitType,
    movementPointBudget: budget,
    terrain,
    footprintNeighbors,
    terrainBonusCategory,
  });
}

/**
 * Reference implementation: one Dijkstra per disk candidate (equality tests only).
 *
 * Purpose: Locks single-source collector output against the historical per-destination algorithm on disk-radius candidates.
 * When to use: Unit tests comparing membership with `collectTacticalLegalMoveDestinationTacticalHexes`.
 * Expected outcome: Sorted membership matches the optimized collector for plains fixtures; forest/transport may differ when
 * fractional MP reaches beyond `gridDisk(budget)` (optimized is authoritative for Ready parity).
 * Exceptions: Never throws.
 */
export function collectTacticalLegalMoveDestinationHexesBruteForceForTests(
  battle: Parameters<typeof collectTacticalLegalMoveDestinationHexes>[0],
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
  const footprint = new Set(battle.tacticalChildH3Indexes);
  if (!footprint.has(u.h3Index)) return [];
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprintNeighbors = tacticalFootprintNeighborLookupFromMap(
    buildTacticalFootprintAdjacencyMap(footprint)
  );
  let candidates: string[];
  try {
    candidates = [...gridDisk(u.h3Index, budget)].filter((h) => h !== u.h3Index && footprint.has(h));
  } catch {
    candidates = battle.tacticalChildH3Indexes.filter((h) => h !== u.h3Index);
  }
  const out: string[] = [];
  for (const toH3 of candidates) {
    const plan = planTacticalMarch({
      fromH3: u.h3Index,
      toH3,
      tacticalSet: footprint,
      unitTypeForMovement: u.unitType,
      movementPointBudget: budget,
      terrain,
      footprintNeighbors,
      weatherEnabled: battle.weatherBonusEnabled === true,
      weather: battle.weather,
      weatherTags: u.weatherTags,
      terrainBonusCategory: terrainBonusMarchCategoryForMover(battle, u, u.unitType),
    });
    if (plan.reachableThisTurn) out.push(toH3);
  }
  return out;
}
