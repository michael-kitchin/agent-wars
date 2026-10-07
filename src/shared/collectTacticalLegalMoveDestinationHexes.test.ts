/**
 * Equality / membership tests for single-source tactical legal-move collection.
 * Run with: node dist/shared/collectTacticalLegalMoveDestinationTacticalHexes.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToChildren, cellToParent, gridDisk, gridDistance, latLngToCell } from 'h3-js';
import {
  collectTacticalLegalMoveDestinationHexes,
  collectTacticalLegalMoveDestinationHexesBruteForceForTests,
} from './collectTacticalLegalMoveDestinationHexes';
import { planTacticalMarch } from './tacticalMovementPlanner';
import {
  buildTacticalFootprintAdjacencyMap,
  tacticalFootprintNeighborLookupFromMap,
} from './tacticalTransportLink';
import { buildTacticalTerrainKindResolverFromSnapshot } from './tacticalTerrainMovement';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from './tacticalTerrainCombatModifiers';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';

/**
 * Builds a plains footprint battle with one armor sub-unit for collector equality checks.
 *
 * Purpose: Avoids fractional transport edge cases so brute-force disk membership matches single-source.
 * When to use: `collectTacticalLegalMoveDestinationTacticalHexes` regression tests.
 * Expected outcome: Snapshot with plains terrain on every footprint cell.
 * Exceptions: None.
 */
function plainsArmorBattle(): { battle: TacticalBattleSnapshot; moverId: string } {
  const strategic = latLngToCell(12, 34, 1);
  const from = latLngToCell(12.01, 34.01, 4);
  assert.equal(cellToParent(from, 1), strategic);
  const footprint = [...cellToChildren(strategic, 4)];
  const terrain: Record<string, string> = {};
  for (const h of footprint) terrain[h] = 'plains';
  const moverId = 'opp-arm:01';
  const battle: TacticalBattleSnapshot = {
    battleId: 'collect-legal-move-eq',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    subUnits: [
      {
        id: moverId,
        parentUnitId: 'opp-arm',
        player: 'opponent',
        unitType: 'armor',
        h3Index: from,
        displayName: 'Armor',
      },
    ],
  };
  return { battle, moverId };
}

test('single-source legal moves match brute-force disk membership on plains', () => {
  const { battle, moverId } = plainsArmorBattle();
  const optimized = new Set(collectTacticalLegalMoveDestinationHexes(battle, moverId));
  const brute = new Set(collectTacticalLegalMoveDestinationHexesBruteForceForTests(battle, moverId));
  assert.deepEqual([...optimized].sort(), [...brute].sort());
  assert.ok(optimized.size >= 1, 'armor on plains should reach at least one neighbor this beat');
});

test('every single-source hex is reachableThisTurn under planTacticalRes4March', () => {
  const { battle, moverId } = plainsArmorBattle();
  const u = battle.subUnits[0]!;
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(battle, u, battle.subUnits, u.unitType);
  const footprint = new Set(battle.tacticalChildH3Indexes);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprintNeighbors = tacticalFootprintNeighborLookupFromMap(buildTacticalFootprintAdjacencyMap(footprint));
  const optimized = collectTacticalLegalMoveDestinationHexes(battle, moverId);
  for (const toH3 of optimized) {
    const plan = planTacticalMarch({
      fromH3: u.h3Index,
      toH3,
      tacticalSet: footprint,
      unitTypeForMovement: u.unitType,
      movementPointBudget: budget,
      terrain,
      footprintNeighbors,
    });
    assert.equal(plan.reachableThisTurn, true, `expected reachableThisTurn for ${toH3}`);
  }
});

test('snow on plains holds untagged infantry to one cell, matching the planner, while snow-tagged infantry reach two', () => {
  const { battle: plains } = plainsArmorBattle();
  const mover = { ...plains.subUnits[0]!, unitType: 'infantry' as const };
  const snowy = (weatherTags?: ('snow' | 'rain' | 'heat')[]): TacticalBattleSnapshot => ({
    ...plains,
    weather: 'snow',
    weatherBonusEnabled: true,
    weatherBonusLevel: 'low',
    subUnits: [{ ...mover, ...(weatherTags ? { weatherTags } : {}) }],
  });
  const farthest = (battle: TacticalBattleSnapshot): number =>
    Math.max(...collectTacticalLegalMoveDestinationHexes(battle, mover.id).map((h) => gridDistance(mover.h3Index, h)));
  const untagged = snowy();
  assert.equal(farthest(untagged), 1);
  assert.deepEqual(
    collectTacticalLegalMoveDestinationHexes(untagged, mover.id).sort(),
    collectTacticalLegalMoveDestinationHexesBruteForceForTests(untagged, mover.id).sort()
  );
  assert.equal(farthest(snowy(['snow'])), 2);
});

test('adjacent plains neighbor remains collectable', () => {
  const from = latLngToCell(40, 50, 4);
  const neighbor = [...gridDisk(from, 1)].find((h) => h !== from);
  assert.ok(neighbor);
  assert.equal(gridDistance(from, neighbor!), 1);
  const strategic = cellToParent(from, 1);
  const battle: TacticalBattleSnapshot = {
    battleId: 'collect-adj',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [from, neighbor!],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [from]: 'plains', [neighbor!]: 'plains' },
    subUnits: [
      {
        id: 'opp:01',
        parentUnitId: 'opp',
        player: 'opponent',
        unitType: 'armor',
        h3Index: from,
        displayName: 'Opp',
      },
    ],
  };
  const hexes = collectTacticalLegalMoveDestinationHexes(battle, 'opp:01');
  assert.ok(hexes.includes(neighbor!), 'adjacent plains hex must be this-beat reachable');
});
