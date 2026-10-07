/**
 * Tests tactical march planner terrain-kind reachability.
 * Run with: node dist/main/tacticalBattle/tacticalMovementPlanner.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planTacticalMarch, tacticalNavalHasMovableNeighborInFootprint } from '../../shared/tacticalMovementPlanner';
import { tacticalGridDiskNeighborsOrdered } from '../../shared/tacticalTransportLink';
import { buildTacticalTerrainKindResolverFromSnapshot } from '../../shared/tacticalTerrainMovement';
import {
  firstRingCellDistinctFrom,
  tacticalCell,
} from './testSupport/tacticalHexFixtures';

test('armor cannot enter a mountain neighbor', () => {
  const center = tacticalCell(40, 50);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [neighbor]: 'mountain' },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('infantry can enter mountain neighbor at increased movement cost', () => {
  const center = tacticalCell(41, 51);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [neighbor]: 'mountain' },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 2);
  assert.equal(plan.reachableThisTurn, true);
});

test('naval cannot leave water or coastal cells into plains', () => {
  const center = tacticalCell(42, 52);
  const plainsNeighbor = firstRingCellDistinctFrom(center);
  const tacticalSet = new Set([center, plainsNeighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: {
      [center]: 'water',
      [plainsNeighbor]: 'plains',
    },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: plainsNeighbor,
    tacticalSet,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval cannot march between non-water forest res4 cells under a water strategic parent', () => {
  const center = tacticalCell(43, 53);
  const neighbor = firstRingCellDistinctFrom(center);
  const tacticalSet = new Set([center, neighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: {
      [center]: 'forest',
      [neighbor]: 'forest',
    },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval can march between adjacent water res4 cells', () => {
  const center = tacticalCell(43, 53);
  const neighbor = firstRingCellDistinctFrom(center);
  const tacticalSet = new Set([center, neighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: {
      [center]: 'water',
      [neighbor]: 'water',
    },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('tacticalNavalHasMovableNeighborInFootprint is false when the only footprint neighbor is plains from forest under water', () => {
  const center = tacticalCell(44, 54);
  const plainsNeighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: {
      [center]: 'forest',
      [plainsNeighbor]: 'plains',
    },
  });
  assert.equal(
    tacticalNavalHasMovableNeighborInFootprint({
      fromH3: center,
      tacticalSet: new Set([center, plainsNeighbor]),
      terrain,
    }),
    false
  );
});

test('tacticalNavalHasMovableNeighborInFootprint is false between adjacent forest cells under water', () => {
  const center = tacticalCell(43, 53);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: {
      [center]: 'forest',
      [neighbor]: 'forest',
    },
  });
  assert.equal(
    tacticalNavalHasMovableNeighborInFootprint({
      fromH3: center,
      tacticalSet: new Set([center, neighbor]),
      terrain,
    }),
    false
  );
});

test('naval cannot move from coastal res4 into plains under water strategic parent', () => {
  const center = tacticalCell(44, 54);
  const plainsNeighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: {
      [center]: 'coastal',
      [plainsNeighbor]: 'plains',
    },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: plainsNeighbor,
    tacticalSet: new Set([center, plainsNeighbor]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval cannot march between plains-only res4 cells without seaport flags', () => {
  const center = tacticalCell(45, 55);
  const neighbor = firstRingCellDistinctFrom(center);
  const tacticalSet = new Set([center, neighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: {
      [center]: 'plains',
      [neighbor]: 'plains',
    },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval cannot march between plains res4 on strategic land even when res1 terrain_kind is coastal', () => {
  const center = tacticalCell(49, 59);
  const neighbor = firstRingCellDistinctFrom(center);
  const tacticalSet = new Set([center, neighbor]);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    tacticalTerrainKindByH3: {
      [center]: 'plains',
      [neighbor]: 'plains',
    },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet,
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval cannot march between plains res4 on inland strategic land (terrain_kind plains)', () => {
  const center = tacticalCell(50, 60);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [center]: 'plains', [neighbor]: 'plains' },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval cannot enter mountain res4 on coastal strategic land hex', () => {
  const center = tacticalCell(51, 61);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    tacticalTerrainKindByH3: { [center]: 'plains', [neighbor]: 'mountain' },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('naval can step between adjacent water cells even when both carry seaport DB flags (channel markers)', () => {
  const a = tacticalCell(42, 52);
  const b = firstRingCellDistinctFrom(a);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    tacticalTerrainKindByH3: { [a]: 'water', [b]: 'water' },
    tacticalIsSeaportByH3: { [a]: true, [b]: true },
  });
  const plan = planTacticalMarch({
    fromH3: a,
    toH3: b,
    tacticalSet: new Set([a, b]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('naval can enter a seaport res4 from water but not chain seaport to adjacent seaport', () => {
  const water = tacticalCell(46, 56);
  const port = firstRingCellDistinctFrom(water);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: {
      [water]: 'water',
      [port]: 'plains',
    },
    tacticalIsSeaportByH3: { [port]: true },
  });
  const wToP = planTacticalMarch({
    fromH3: water,
    toH3: port,
    tacticalSet: new Set([water, port]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(wToP.reachable, true);
  assert.equal(wToP.totalCostToDestination, 1);

  const portA = tacticalCell(47, 57);
  const portB = firstRingCellDistinctFrom(portA);
  const terrainPorts = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [portA]: 'plains', [portB]: 'plains' },
    tacticalIsSeaportByH3: { [portA]: true, [portB]: true },
  });
  const pToP = planTacticalMarch({
    fromH3: portA,
    toH3: portB,
    tacticalSet: new Set([portA, portB]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain: terrainPorts,
  });
  assert.equal(pToP.reachable, false);
});

test('naval can march between adjacent ocean-kind res4 cells on strategic water parent', () => {
  const a = tacticalCell(48, 58);
  const b = firstRingCellDistinctFrom(a);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: { [a]: 'ocean', [b]: 'ocean' },
  });
  const plan = planTacticalMarch({
    fromH3: a,
    toH3: b,
    tacticalSet: new Set([a, b]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('naval treats blank res4 terrain override as strategic terrain_kind fallback (matches spawn coalescing)', () => {
  const a = tacticalCell(50, 60);
  const b = firstRingCellDistinctFrom(a);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: { [a]: '   ', [b]: 'water' },
  });
  const plan = planTacticalMarch({
    fromH3: a,
    toH3: b,
    tacticalSet: new Set([a, b]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
});

test('infantry forced urban enter cost is 1 even when terrain kind is mountain', () => {
  const center = tacticalCell(51, 61);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [neighbor]: 'mountain' },
    tacticalIsUrbanByH3: { [neighbor]: true },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('infantry rubble neighbor costs 2 to enter', () => {
  const center = tacticalCell(52, 62);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [neighbor]: 'plains' },
    tacticalIsRubbleByH3: { [neighbor]: true },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 2);
});

test('naval cannot enter urban res4 cell from water', () => {
  const water = tacticalCell(53, 63);
  const urbanNeighbor = firstRingCellDistinctFrom(water);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: { [water]: 'water', [urbanNeighbor]: 'coastal' },
    tacticalIsUrbanByH3: { [urbanNeighbor]: true },
  });
  const plan = planTacticalMarch({
    fromH3: water,
    toH3: urbanNeighbor,
    tacticalSet: new Set([water, urbanNeighbor]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('armor cannot use transport plains cost for mountain goal with only a single marked edge on the origin', () => {
  const center = tacticalCell(54, 64);
  const neighbor = firstRingCellDistinctFrom(center);
  const ring = tacticalGridDiskNeighborsOrdered(center);
  const i = ring.indexOf(neighbor);
  assert.ok(i >= 0);
  const n = ring.length;
  const roadSides = Array.from({ length: n }, (_, j) => j === i);
  const railSides = Array.from({ length: n }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [center]: 'plains', [neighbor]: 'mountain' },
    tacticalRoadSidesByH3: { [center]: roadSides },
    tacticalRailSidesByH3: { [center]: railSides },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('armor reaches mountain goal at plains cost when the goal cell has a corridor witness (entry and exit sides)', () => {
  const p = tacticalCell(58, 68);
  const m = firstRingCellDistinctFrom(p);
  const ringM = tacticalGridDiskNeighborsOrdered(m);
  const w = ringM.find((h) => h !== p);
  assert.ok(w);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
  const iPm = ringP.indexOf(m);
  assert.ok(iPm >= 0);
  const nP = ringP.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPm);
  const railP = Array.from({ length: nP }, () => false);
  const ip = ringM.indexOf(p);
  const iw = ringM.indexOf(w);
  assert.ok(ip >= 0 && iw >= 0);
  const nM = ringM.length;
  const roadM = Array.from({ length: nM }, (_, j) => j === ip || j === iw);
  const railM = Array.from({ length: nM }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [w]: 'plains' },
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: m,
    tacticalSet: new Set([p, m, w]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('armor first stop advances one hex when budget is below first-step cost but path exists', () => {
  const p = tacticalCell(58, 68);
  const m = firstRingCellDistinctFrom(p);
  const ringM = tacticalGridDiskNeighborsOrdered(m);
  const w = ringM.find((h) => h !== p);
  assert.ok(w);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
  const iPm = ringP.indexOf(m);
  assert.ok(iPm >= 0);
  const nP = ringP.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPm);
  const railP = Array.from({ length: nP }, () => false);
  const ip = ringM.indexOf(p);
  const iw = ringM.indexOf(w);
  assert.ok(ip >= 0 && iw >= 0);
  const nM = ringM.length;
  const roadM = Array.from({ length: nM }, (_, j) => j === ip || j === iw);
  const railM = Array.from({ length: nM }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [w]: 'plains' },
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: m,
    tacticalSet: new Set([p, m, w]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 0.25,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.reachableThisTurn, false);
  assert.equal(plan.firstStopWithinBudget.stopH3, m);
  assert.equal(plan.firstStopWithinBudget.consumedFullPath, true);
});

test('infantry first stop stays at origin when movement budget is zero', () => {
  const center = tacticalCell(39, 49);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [center]: 'plains', [neighbor]: 'plains' },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 0,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.firstStopWithinBudget.stopH3, center);
  assert.equal(plan.firstStopWithinBudget.consumedFullPath, false);
});

test('armor enters a mountain road from plains that has no road of its own', () => {
  const p = tacticalCell(67, 77);
  const m = firstRingCellDistinctFrom(p);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
  const ringM = tacticalGridDiskNeighborsOrdered(m);
  const iPm = ringP.indexOf(m);
  assert.ok(iPm >= 0);
  const ip = ringM.indexOf(p);
  assert.ok(ip >= 0);
  const nP = ringP.length;
  const nM = ringM.length;
  const roadP = Array.from({ length: nP }, () => false);
  const railP = Array.from({ length: nP }, () => false);
  const roadM = Array.from({ length: nM }, (_, j) => j === ip);
  const railM = Array.from({ length: nM }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain' },
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: m,
    tacticalSet: new Set([p, m]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('armor reaches mountain goal at plains cost when reciprocal boundary is marked on both adjacent cells (no witness hex)', () => {
  const p = tacticalCell(68, 78);
  const m = firstRingCellDistinctFrom(p);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
  const ringM = tacticalGridDiskNeighborsOrdered(m);
  const iPm = ringP.indexOf(m);
  assert.ok(iPm >= 0);
  const ip = ringM.indexOf(p);
  assert.ok(ip >= 0);
  const nP = ringP.length;
  const nM = ringM.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPm);
  const railP = Array.from({ length: nP }, () => false);
  const roadM = Array.from({ length: nM }, (_, j) => j === ip);
  const railM = Array.from({ length: nM }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain' },
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: m,
    tacticalSet: new Set([p, m]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('armor cannot use a road link into mountain when the head cell is rubble', () => {
  const center = tacticalCell(55, 65);
  const neighbor = firstRingCellDistinctFrom(center);
  const ring = tacticalGridDiskNeighborsOrdered(center);
  const i = ring.indexOf(neighbor);
  assert.ok(i >= 0);
  const n = ring.length;
  const roadSides = Array.from({ length: n }, (_, j) => j === i);
  const railSides = Array.from({ length: n }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [center]: 'plains', [neighbor]: 'mountain' },
    tacticalRoadSidesByH3: { [center]: roadSides },
    tacticalRailSidesByH3: { [center]: railSides },
    tacticalIsRubbleByH3: { [center]: true },
  });
  const plan = planTacticalMarch({
    fromH3: center,
    toH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('armor can leave a mountain road onto plains that has no road', () => {
  const p = tacticalCell(56, 66);
  const m = firstRingCellDistinctFrom(p);
  const ringM = tacticalGridDiskNeighborsOrdered(m);
  const ringPNeighbors = tacticalGridDiskNeighborsOrdered(p);
  const ringPSet = new Set(ringPNeighbors);
  const b = ringM.find((h) => h !== p && !ringPSet.has(h));
  assert.ok(b);
  const iPm = ringPNeighbors.indexOf(m);
  assert.ok(iPm >= 0);
  const nP = ringPNeighbors.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPm);
  const railP = Array.from({ length: nP }, () => false);
  const ip = ringM.indexOf(p);
  assert.ok(ip >= 0);
  const nM = ringM.length;
  const roadM = Array.from({ length: nM }, (_, j) => j === ip);
  const railM = Array.from({ length: nM }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: b,
    tacticalSet: new Set([p, m, b]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 6,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.ok(
    Math.abs(plan.totalCostToDestination - 1.5) < 1e-9,
    `expected 1.5 MPs, got ${plan.totalCostToDestination}`
  );
});

test('armor can march through mountain when the corridor marks both entry and exit on the mountain cell', () => {
  const p = tacticalCell(57, 67);
  const m = firstRingCellDistinctFrom(p);
  const ringM = tacticalGridDiskNeighborsOrdered(m);
  const ringPNeighbors = new Set(tacticalGridDiskNeighborsOrdered(p));
  const b = ringM.find((h) => h !== p && !ringPNeighbors.has(h));
  assert.ok(b);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
  const iPm = ringP.indexOf(m);
  assert.ok(iPm >= 0);
  const nP = ringP.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPm);
  const railP = Array.from({ length: nP }, () => false);
  const ip = ringM.indexOf(p);
  const ib = ringM.indexOf(b);
  assert.ok(ip >= 0 && ib >= 0);
  const nM = ringM.length;
  const roadM = Array.from({ length: nM }, (_, j) => j === ip || j === ib);
  const railM = Array.from({ length: nM }, () => false);
  const ringB = tacticalGridDiskNeighborsOrdered(b);
  const imb = ringB.indexOf(m);
  assert.ok(imb >= 0);
  const roadBFix = Array.from({ length: ringB.length }, (_, j) => j === imb);
  const railBFix = Array.from({ length: ringB.length }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM, [b]: roadBFix },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM, [b]: railBFix },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: b,
    tacticalSet: new Set([p, m, b]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 6,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.ok(
    Math.abs(plan.totalCostToDestination - 1) < 1e-9,
    `expected 1 MP, got ${plan.totalCostToDestination}`
  );
});

test('armor routes from off-road neighbor through mountain when approach marks road only toward mountain', () => {
  const p = tacticalCell(75, 85);
  const m = firstRingCellDistinctFrom(p);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
  const x = ringP.find((h) => h !== m);
  assert.ok(x);
  const ringM = tacticalGridDiskNeighborsOrdered(m);
  const ringPNeighbors = new Set(ringP);
  const b = ringM.find((h) => h !== p && !ringPNeighbors.has(h));
  assert.ok(b);
  const iPm = ringP.indexOf(m);
  assert.ok(iPm >= 0);
  const nP = ringP.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPm);
  const railP = Array.from({ length: nP }, () => false);
  const ip = ringM.indexOf(p);
  const ib = ringM.indexOf(b);
  assert.ok(ip >= 0 && ib >= 0);
  const nM = ringM.length;
  const roadM = Array.from({ length: nM }, (_, j) => j === ip || j === ib);
  const railM = Array.from({ length: nM }, () => false);
  const ringB = tacticalGridDiskNeighborsOrdered(b);
  const imb = ringB.indexOf(m);
  assert.ok(imb >= 0);
  const roadBx = Array.from({ length: ringB.length }, (_, j) => j === imb);
  const railBx = Array.from({ length: ringB.length }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [x]: 'plains', [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM, [b]: roadBx },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM, [b]: railBx },
  });
  const plan = planTacticalMarch({
    fromH3: x,
    toH3: b,
    tacticalSet: new Set([x, p, m, b]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 8,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.ok(plan.pathToDestination?.includes(m));
});
