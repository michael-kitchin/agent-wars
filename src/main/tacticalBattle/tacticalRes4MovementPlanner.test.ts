/**
 * Tests tactical res4 march planner (§12.4 terrain costs). Run with: node dist/main/tacticalBattle/tacticalRes4MovementPlanner.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planTacticalRes4March } from '../../shared/tacticalRes4MovementPlanner';
import { buildTacticalTerrainKindResolverFromSnapshot } from '../../shared/tacticalTerrainMovement';
import { firstRingCellDistinctFrom, tacticalRes4Cell } from './testSupport/tacticalRes4HexFixtures';

test('armor cannot enter a mountain neighbor', () => {
  const center = tacticalRes4Cell(40, 50);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [neighbor]: 'mountain' },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set: new Set([center, neighbor]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('infantry can enter mountain neighbor at increased movement cost', () => {
  const center = tacticalRes4Cell(41, 51);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [neighbor]: 'mountain' },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set: new Set([center, neighbor]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 2);
  assert.equal(plan.reachableThisTurn, true);
});

test('naval cannot leave water or coastal cells into plains', () => {
  const center = tacticalRes4Cell(42, 52);
  const plainsNeighbor = firstRingCellDistinctFrom(center);
  const res4Set = new Set([center, plainsNeighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: {
      [center]: 'water',
      [plainsNeighbor]: 'plains',
    },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: plainsNeighbor,
    res4Set,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});
