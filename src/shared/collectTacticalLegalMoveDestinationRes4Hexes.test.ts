/**
 * Equality / membership tests for single-source tactical legal-move collection.
 * Run with: node dist/shared/collectTacticalLegalMoveDestinationRes4Hexes.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToChildren, cellToParent, gridDisk, gridDistance, latLngToCell } from 'h3-js';
import {
  collectTacticalLegalMoveDestinationRes4Hexes,
  collectTacticalLegalMoveDestinationRes4HexesBruteForceForTests,
} from './collectTacticalLegalMoveDestinationRes4Hexes';
import { planTacticalRes4March } from './tacticalRes4MovementPlanner';
import {
  buildRes4FootprintAdjacencyMap,
  res4FootprintNeighborLookupFromMap,
} from './tacticalRes4TransportLink';
import { buildTacticalTerrainKindResolverFromSnapshot } from './tacticalTerrainMovement';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from './tacticalTerrainCombatModifiers';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';

/**
 * Builds a plains footprint battle with one armor sub-unit for collector equality checks.
 *
 * Purpose: Avoids fractional transport edge cases so brute-force disk membership matches single-source.
 * When to use: `collectTacticalLegalMoveDestinationRes4Hexes` regression tests.
 * Expected outcome: Snapshot with plains terrain on every footprint cell.
 * Exceptions: None.
 */
function plainsArmorBattle(): { battle: TacticalBattleSnapshot; moverId: string } {
  const res1 = latLngToCell(12, 34, 1);
  const from = latLngToCell(12.01, 34.01, 4);
  assert.equal(cellToParent(from, 1), res1);
  const footprint = [...cellToChildren(res1, 4)];
  const terrain: Record<string, string> = {};
  for (const h of footprint) terrain[h] = 'plains';
  const moverId = 'opp-arm:01';
  const battle: TacticalBattleSnapshot = {
    battleId: 'collect-legal-move-eq',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
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
  const optimized = new Set(collectTacticalLegalMoveDestinationRes4Hexes(battle, moverId));
  const brute = new Set(collectTacticalLegalMoveDestinationRes4HexesBruteForceForTests(battle, moverId));
  assert.deepEqual([...optimized].sort(), [...brute].sort());
  assert.ok(optimized.size >= 1, 'armor on plains should reach at least one neighbor this beat');
});

test('every single-source hex is reachableThisTurn under planTacticalRes4March', () => {
  const { battle, moverId } = plainsArmorBattle();
  const u = battle.subUnits[0]!;
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(battle, u, battle.subUnits, u.unitType);
  const footprint = new Set(battle.res4ChildH3Indexes);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprintNeighbors = res4FootprintNeighborLookupFromMap(buildRes4FootprintAdjacencyMap(footprint));
  const optimized = collectTacticalLegalMoveDestinationRes4Hexes(battle, moverId);
  for (const toH3 of optimized) {
    const plan = planTacticalRes4March({
      fromH3: u.h3Index,
      toH3,
      res4Set: footprint,
      unitTypeForMovement: u.unitType,
      movementPointBudget: budget,
      terrain,
      footprintNeighbors,
    });
    assert.equal(plan.reachableThisTurn, true, `expected reachableThisTurn for ${toH3}`);
  }
});

test('adjacent plains neighbor remains collectable', () => {
  const from = latLngToCell(40, 50, 4);
  const neighbor = [...gridDisk(from, 1)].find((h) => h !== from);
  assert.ok(neighbor);
  assert.equal(gridDistance(from, neighbor!), 1);
  const res1 = cellToParent(from, 1);
  const battle: TacticalBattleSnapshot = {
    battleId: 'collect-adj',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [from, neighbor!],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [from]: 'plains', [neighbor!]: 'plains' },
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
  const hexes = collectTacticalLegalMoveDestinationRes4Hexes(battle, 'opp:01');
  assert.ok(hexes.includes(neighbor!), 'adjacent plains hex must be this-beat reachable');
});
