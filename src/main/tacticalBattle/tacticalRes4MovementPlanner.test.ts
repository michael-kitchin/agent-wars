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

test('naval can march between littoral land-ish res4 cells under a water strategic parent (forest child kinds)', () => {
  const center = tacticalRes4Cell(43, 53);
  const neighbor = firstRingCellDistinctFrom(center);
  const res4Set = new Set([center, neighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: {
      [center]: 'forest',
      [neighbor]: 'forest',
    },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('naval can march between adjacent water res4 cells', () => {
  const center = tacticalRes4Cell(43, 53);
  const neighbor = firstRingCellDistinctFrom(center);
  const res4Set = new Set([center, neighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: {
      [center]: 'water',
      [neighbor]: 'water',
    },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('naval cannot move from coastal res4 into plains under water strategic parent', () => {
  const center = tacticalRes4Cell(44, 54);
  const plainsNeighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: {
      [center]: 'coastal',
      [plainsNeighbor]: 'plains',
    },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: plainsNeighbor,
    res4Set: new Set([center, plainsNeighbor]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval cannot march between plains-only res4 cells without seaport flags', () => {
  const center = tacticalRes4Cell(45, 55);
  const neighbor = firstRingCellDistinctFrom(center);
  const res4Set = new Set([center, neighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: {
      [center]: 'plains',
      [neighbor]: 'plains',
    },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval can march between plains res4 on strategic land when res1 terrain_kind is coastal', () => {
  const center = tacticalRes4Cell(49, 59);
  const neighbor = firstRingCellDistinctFrom(center);
  const res4Set = new Set([center, neighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    res4TerrainKindByH3: {
      [center]: 'plains',
      [neighbor]: 'plains',
    },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('naval cannot march between plains res4 on inland strategic land (terrain_kind plains)', () => {
  const center = tacticalRes4Cell(50, 60);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [center]: 'plains', [neighbor]: 'plains' },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set: new Set([center, neighbor]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval cannot enter mountain res4 on coastal strategic land hex', () => {
  const center = tacticalRes4Cell(51, 61);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    res4TerrainKindByH3: { [center]: 'plains', [neighbor]: 'mountain' },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set: new Set([center, neighbor]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval can enter a seaport res4 from water but not chain seaport to adjacent seaport', () => {
  const water = tacticalRes4Cell(46, 56);
  const port = firstRingCellDistinctFrom(water);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: {
      [water]: 'water',
      [port]: 'plains',
    },
    res4IsSeaportByH3: { [port]: true },
  });
  const wToP = planTacticalRes4March({
    fromH3: water,
    toH3: port,
    res4Set: new Set([water, port]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(wToP.reachable, true);
  assert.equal(wToP.totalCostToDestination, 1);

  const portA = tacticalRes4Cell(47, 57);
  const portB = firstRingCellDistinctFrom(portA);
  const terrainPorts = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [portA]: 'plains', [portB]: 'plains' },
    res4IsSeaportByH3: { [portA]: true, [portB]: true },
  });
  const pToP = planTacticalRes4March({
    fromH3: portA,
    toH3: portB,
    res4Set: new Set([portA, portB]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain: terrainPorts,
  });
  assert.equal(pToP.reachable, false);
});
