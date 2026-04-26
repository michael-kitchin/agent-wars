/**
 * Tests tactical res4 march planner (§12.4 terrain costs). Run with: node dist/main/tacticalBattle/tacticalRes4MovementPlanner.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planTacticalRes4March, tacticalNavalHasMovableNeighborInFootprint } from '../../shared/tacticalRes4MovementPlanner';
import {
  buildLandMarchStepLegalityDetailAlongPath,
  classifyLandInfantryArmorEnterStep,
  summarizeLandMarchStepLegalityAlongPath,
} from '../../shared/tacticalRes4LandMarchContinuity';
import { res4GridDiskNeighborsOrdered } from '../../shared/tacticalRes4TransportLink';
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

test('naval cannot march between non-water forest res4 cells under a water strategic parent', () => {
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
  assert.equal(plan.reachable, false);
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

test('tacticalNavalHasMovableNeighborInFootprint is false when the only footprint neighbor is plains from forest under water', () => {
  const center = tacticalRes4Cell(44, 54);
  const plainsNeighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: {
      [center]: 'forest',
      [plainsNeighbor]: 'plains',
    },
  });
  assert.equal(
    tacticalNavalHasMovableNeighborInFootprint({
      fromH3: center,
      res4Set: new Set([center, plainsNeighbor]),
      terrain,
    }),
    false
  );
});

test('tacticalNavalHasMovableNeighborInFootprint is false between adjacent forest cells under water', () => {
  const center = tacticalRes4Cell(43, 53);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: {
      [center]: 'forest',
      [neighbor]: 'forest',
    },
  });
  assert.equal(
    tacticalNavalHasMovableNeighborInFootprint({
      fromH3: center,
      res4Set: new Set([center, neighbor]),
      terrain,
    }),
    false
  );
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

test('naval cannot march between plains res4 on strategic land even when res1 terrain_kind is coastal', () => {
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
  assert.equal(plan.reachable, false);
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

test('naval can step between adjacent water cells even when both carry seaport DB flags (channel markers)', () => {
  const a = tacticalRes4Cell(42, 52);
  const b = firstRingCellDistinctFrom(a);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    res4TerrainKindByH3: { [a]: 'water', [b]: 'water' },
    res4IsSeaportByH3: { [a]: true, [b]: true },
  });
  const plan = planTacticalRes4March({
    fromH3: a,
    toH3: b,
    res4Set: new Set([a, b]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
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

test('naval can march between adjacent ocean-kind res4 cells on strategic water parent', () => {
  const a = tacticalRes4Cell(48, 58);
  const b = firstRingCellDistinctFrom(a);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: { [a]: 'ocean', [b]: 'ocean' },
  });
  const plan = planTacticalRes4March({
    fromH3: a,
    toH3: b,
    res4Set: new Set([a, b]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('naval treats blank res4 terrain override as strategic terrain_kind fallback (matches spawn coalescing)', () => {
  const a = tacticalRes4Cell(50, 60);
  const b = firstRingCellDistinctFrom(a);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: { [a]: '   ', [b]: 'water' },
  });
  const plan = planTacticalRes4March({
    fromH3: a,
    toH3: b,
    res4Set: new Set([a, b]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, true);
});

test('infantry forced urban enter cost is 1 even when terrain kind is mountain', () => {
  const center = tacticalRes4Cell(51, 61);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [neighbor]: 'mountain' },
    res4IsUrbanByH3: { [neighbor]: true },
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
  assert.equal(plan.totalCostToDestination, 1);
});

test('infantry rubble neighbor costs 2 to enter', () => {
  const center = tacticalRes4Cell(52, 62);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [neighbor]: 'plains' },
    res4IsRubbleByH3: { [neighbor]: true },
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
});

test('naval cannot enter urban res4 cell from water', () => {
  const water = tacticalRes4Cell(53, 63);
  const urbanNeighbor = firstRingCellDistinctFrom(water);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: { [water]: 'water', [urbanNeighbor]: 'coastal' },
    res4IsUrbanByH3: { [urbanNeighbor]: true },
  });
  const plan = planTacticalRes4March({
    fromH3: water,
    toH3: urbanNeighbor,
    res4Set: new Set([water, urbanNeighbor]),
    unitTypeForMovement: 'naval',
    movementPointBudget: 3,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('armor cannot use transport plains cost for mountain goal with only a single marked edge on the origin', () => {
  const center = tacticalRes4Cell(54, 64);
  const neighbor = firstRingCellDistinctFrom(center);
  const ring = res4GridDiskNeighborsOrdered(center);
  const i = ring.indexOf(neighbor);
  assert.ok(i >= 0);
  const n = ring.length;
  const roadSides = Array.from({ length: n }, (_, j) => j === i);
  const railSides = Array.from({ length: n }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [center]: 'plains', [neighbor]: 'mountain' },
    res4RoadSidesByH3: { [center]: roadSides },
    res4RailSidesByH3: { [center]: railSides },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set: new Set([center, neighbor]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('armor reaches mountain goal at plains cost when the goal cell has a corridor witness (entry and exit sides)', () => {
  const p = tacticalRes4Cell(58, 68);
  const m = firstRingCellDistinctFrom(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
  const w = ringM.find((h) => h !== p);
  assert.ok(w);
  const ringP = res4GridDiskNeighborsOrdered(p);
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
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [w]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: m,
    res4Set: new Set([p, m, w]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1.6);
});

test('armor first stop advances one hex when budget is below first-step cost but path exists', () => {
  const p = tacticalRes4Cell(58, 68);
  const m = firstRingCellDistinctFrom(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
  const w = ringM.find((h) => h !== p);
  assert.ok(w);
  const ringP = res4GridDiskNeighborsOrdered(p);
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
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [w]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: m,
    res4Set: new Set([p, m, w]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 1,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.reachableThisTurn, false);
  assert.equal(plan.firstStopWithinBudget.stopH3, m);
  assert.equal(plan.firstStopWithinBudget.consumedFullPath, true);
});

test('infantry first stop stays at origin when movement budget is zero', () => {
  const center = tacticalRes4Cell(39, 49);
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
    unitTypeForMovement: 'infantry',
    movementPointBudget: 0,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.firstStopWithinBudget.stopH3, center);
  assert.equal(plan.firstStopWithinBudget.consumedFullPath, false);
});

test('armor cannot enter mountain goal when only the blocked cell marks the shared boundary (plains lacks head edge toward mountain)', () => {
  const p = tacticalRes4Cell(67, 77);
  const m = firstRingCellDistinctFrom(p);
  const ringP = res4GridDiskNeighborsOrdered(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
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
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: m,
    res4Set: new Set([p, m]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('armor reaches mountain goal at plains cost when reciprocal boundary is marked on both adjacent cells (no witness hex)', () => {
  const p = tacticalRes4Cell(68, 78);
  const m = firstRingCellDistinctFrom(p);
  const ringP = res4GridDiskNeighborsOrdered(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
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
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: m,
    res4Set: new Set([p, m]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1.6);
});

test('armor cannot use a road link into mountain when the head cell is rubble', () => {
  const center = tacticalRes4Cell(55, 65);
  const neighbor = firstRingCellDistinctFrom(center);
  const ring = res4GridDiskNeighborsOrdered(center);
  const i = ring.indexOf(neighbor);
  assert.ok(i >= 0);
  const n = ring.length;
  const roadSides = Array.from({ length: n }, (_, j) => j === i);
  const railSides = Array.from({ length: n }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [center]: 'plains', [neighbor]: 'mountain' },
    res4RoadSidesByH3: { [center]: roadSides },
    res4RailSidesByH3: { [center]: railSides },
    res4IsRubbleByH3: { [center]: true },
  });
  const plan = planTacticalRes4March({
    fromH3: center,
    toH3: neighbor,
    res4Set: new Set([center, neighbor]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('armor cannot cross a dead-end road into mountain to exit cheaply on the far side (transport continuity)', () => {
  const p = tacticalRes4Cell(56, 66);
  const m = firstRingCellDistinctFrom(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
  const ringPNeighbors = res4GridDiskNeighborsOrdered(p);
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
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: b,
    res4Set: new Set([p, m, b]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 6,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('armor can march through mountain when the corridor marks both entry and exit on the mountain cell', () => {
  const p = tacticalRes4Cell(57, 67);
  const m = firstRingCellDistinctFrom(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
  const ringPNeighbors = new Set(res4GridDiskNeighborsOrdered(p));
  const b = ringM.find((h) => h !== p && !ringPNeighbors.has(h));
  assert.ok(b);
  const ringP = res4GridDiskNeighborsOrdered(p);
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
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: b,
    res4Set: new Set([p, m, b]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 6,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.ok(
    Math.abs(plan.totalCostToDestination - 2.4) < 1e-9,
    `expected ~2.4 MPs, got ${plan.totalCostToDestination}`
  );
});

test('armor routes from off-road neighbor through mountain when approach marks road only toward mountain', () => {
  const p = tacticalRes4Cell(75, 85);
  const m = firstRingCellDistinctFrom(p);
  const ringP = res4GridDiskNeighborsOrdered(p);
  const x = ringP.find((h) => h !== m);
  assert.ok(x);
  const ringM = res4GridDiskNeighborsOrdered(m);
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
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [x]: 'plains', [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalRes4March({
    fromH3: x,
    toH3: b,
    res4Set: new Set([x, p, m, b]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 8,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.ok(plan.pathToDestination?.includes(m));
});

test('classifyLandInfantryArmorEnterStep: armor into mountain without transport is base (infinite cost)', () => {
  const center = tacticalRes4Cell(59, 69);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [neighbor]: 'mountain' },
  });
  const res4Set = new Set([center, neighbor]);
  const c = classifyLandInfantryArmorEnterStep({
    toH3: neighbor,
    unitTypeForMovement: 'armor',
    terrain,
    fromH3: center,
    prevOfFrom: null,
    marchGoalH3: neighbor,
    res4Set,
  });
  assert.equal(c.appliedReason, 'base');
  assert.equal(c.tacticalCategory, 'mountains');
  assert.ok(!Number.isFinite(c.appliedCost));
});

test('classifyLandInfantryArmorEnterStep: armor into urban mountain uses urban override', () => {
  const center = tacticalRes4Cell(60, 70);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [neighbor]: 'mountain' },
    res4IsUrbanByH3: { [neighbor]: true },
  });
  const c = classifyLandInfantryArmorEnterStep({
    toH3: neighbor,
    unitTypeForMovement: 'armor',
    terrain,
    fromH3: center,
    prevOfFrom: null,
    marchGoalH3: neighbor,
    res4Set: new Set([center, neighbor]),
  });
  assert.equal(c.appliedReason, 'urban');
  assert.equal(c.appliedCost, 1);
  assert.equal(c.tacticalCategory, 'mountains');
});

test('classifyLandInfantryArmorEnterStep: armor into mountain goal uses transport_blocking with corridor witness', () => {
  const p = tacticalRes4Cell(61, 71);
  const m = firstRingCellDistinctFrom(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
  const w = ringM.find((h) => h !== p);
  assert.ok(w);
  const ringP = res4GridDiskNeighborsOrdered(p);
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
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [w]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const res4Set = new Set([p, m, w]);
  const c = classifyLandInfantryArmorEnterStep({
    toH3: m,
    unitTypeForMovement: 'armor',
    terrain,
    fromH3: p,
    prevOfFrom: null,
    marchGoalH3: m,
    res4Set,
  });
  assert.equal(c.appliedReason, 'transport_blocking');
  assert.equal(c.appliedCost, 1.6);
  assert.equal(c.transportEffectiveBudgetMultiplier, 1.25);
  assert.equal(c.transportEdgeActive, true);
  assert.equal(c.transportContinuityAllowed, true);
});

test('summarizeLandMarchStepLegalityAlongPath lists transport_blocking then transport_plains for armor corridor through mountain', () => {
  const p = tacticalRes4Cell(62, 72);
  const m = firstRingCellDistinctFrom(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
  const ringPNeighbors = new Set(res4GridDiskNeighborsOrdered(p));
  const b = ringM.find((h) => h !== p && !ringPNeighbors.has(h));
  assert.ok(b);
  const ringP = res4GridDiskNeighborsOrdered(p);
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
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const res4Set = new Set([p, m, b]);
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: b,
    res4Set,
    unitTypeForMovement: 'armor',
    movementPointBudget: 6,
    terrain,
  });
  assert.equal(plan.reachable, true);
  const summary = summarizeLandMarchStepLegalityAlongPath({
    path: plan.pathToDestination,
    unitTypeForMovement: 'armor',
    terrain,
    marchGoalH3: b,
    res4Set,
  });
  assert.ok(summary);
  assert.match(summary!, /mountains→transport_blocking/);
  assert.match(summary!, /plains→transport_plains/);
});

test('buildLandMarchStepLegalityDetailAlongPath includes toH3 and transport flags for mountain transport steps', () => {
  const p = tacticalRes4Cell(63, 73);
  const m = firstRingCellDistinctFrom(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
  const w = ringM.find((h) => h !== p);
  assert.ok(w);
  const ringP = res4GridDiskNeighborsOrdered(p);
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
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [w]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const res4Set = new Set([p, m, w]);
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: m,
    res4Set,
    unitTypeForMovement: 'armor',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  const details = buildLandMarchStepLegalityDetailAlongPath({
    path: plan.pathToDestination,
    unitTypeForMovement: 'armor',
    terrain,
    marchGoalH3: m,
    res4Set,
  });
  assert.ok(details);
  assert.equal(details!.length, 1);
  const row = details![0]!;
  assert.equal(row.toH3, m);
  assert.equal(row.appliedReason, 'transport_blocking');
  assert.equal(row.transportEffectiveBudgetMultiplier, 1.25);
  assert.equal(row.transportEdgeActive, true);
  assert.equal(row.transportContinuityAllowed, true);
});

test('armor cannot transit blocked mountain when the mountain hex has no transport mask row (only predecessor marks approach)', () => {
  const p = tacticalRes4Cell(64, 74);
  const m = firstRingCellDistinctFrom(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
  const ringPNeighbors = new Set(res4GridDiskNeighborsOrdered(p));
  const b = ringM.find((h) => h !== p && !ringPNeighbors.has(h));
  assert.ok(b);
  const ringP = res4GridDiskNeighborsOrdered(p);
  const iPm = ringP.indexOf(m);
  assert.ok(iPm >= 0);
  const nP = ringP.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPm);
  const railP = Array.from({ length: nP }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP },
    res4RailSidesByH3: { [p]: railP },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: b,
    res4Set: new Set([p, m, b]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 8,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('infantry can transit water when the water hex marks both entry and exit transport sides', () => {
  const p = tacticalRes4Cell(65, 75);
  const w = firstRingCellDistinctFrom(p);
  const ringW = res4GridDiskNeighborsOrdered(w);
  const ringPNeighbors = new Set(res4GridDiskNeighborsOrdered(p));
  const b = ringW.find((h) => h !== p && !ringPNeighbors.has(h));
  assert.ok(b);
  const ringP = res4GridDiskNeighborsOrdered(p);
  const iPw = ringP.indexOf(w);
  assert.ok(iPw >= 0);
  const nP = ringP.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPw);
  const railP = Array.from({ length: nP }, () => false);
  const ip = ringW.indexOf(p);
  const ib = ringW.indexOf(b);
  assert.ok(ip >= 0 && ib >= 0);
  const nW = ringW.length;
  const roadW = Array.from({ length: nW }, (_, j) => j === ip || j === ib);
  const railW = Array.from({ length: nW }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [w]: 'water', [b]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [w]: roadW },
    res4RailSidesByH3: { [p]: railP, [w]: railW },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: b,
    res4Set: new Set([p, w, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 8,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1.6);
});

test('infantry cannot enter water goal when only plains marks the shared boundary (water lacks head edge toward plains)', () => {
  const p = tacticalRes4Cell(69, 79);
  const w = firstRingCellDistinctFrom(p);
  const ringP = res4GridDiskNeighborsOrdered(p);
  const ringW = res4GridDiskNeighborsOrdered(w);
  const iPw = ringP.indexOf(w);
  assert.ok(iPw >= 0);
  const ip = ringW.indexOf(p);
  assert.ok(ip >= 0);
  const nP = ringP.length;
  const nW = ringW.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPw);
  const railP = Array.from({ length: nP }, () => false);
  const roadW = Array.from({ length: nW }, () => false);
  const railW = Array.from({ length: nW }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [w]: 'water' },
    res4RoadSidesByH3: { [p]: roadP, [w]: roadW },
    res4RailSidesByH3: { [p]: railP, [w]: railW },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: w,
    res4Set: new Set([p, w]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('infantry reaches water goal at plains cost when reciprocal boundary is marked on both adjacent cells', () => {
  const p = tacticalRes4Cell(70, 80);
  const w = firstRingCellDistinctFrom(p);
  const ringP = res4GridDiskNeighborsOrdered(p);
  const ringW = res4GridDiskNeighborsOrdered(w);
  const iPw = ringP.indexOf(w);
  assert.ok(iPw >= 0);
  const ip = ringW.indexOf(p);
  assert.ok(ip >= 0);
  const nP = ringP.length;
  const nW = ringW.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPw);
  const railP = Array.from({ length: nP }, () => false);
  const roadW = Array.from({ length: nW }, (_, j) => j === ip);
  const railW = Array.from({ length: nW }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [w]: 'water' },
    res4RoadSidesByH3: { [p]: roadP, [w]: roadW },
    res4RailSidesByH3: { [p]: railP, [w]: railW },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: w,
    res4Set: new Set([p, w]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.8);
});

test('infantry cannot transit water when the water hex only marks entry (dead-end corridor)', () => {
  const p = tacticalRes4Cell(66, 76);
  const w = firstRingCellDistinctFrom(p);
  const ringW = res4GridDiskNeighborsOrdered(w);
  const ringPNeighbors = res4GridDiskNeighborsOrdered(p);
  const ringPSet = new Set(ringPNeighbors);
  const b = ringW.find((h) => h !== p && !ringPSet.has(h));
  assert.ok(b);
  const iPw = ringPNeighbors.indexOf(w);
  assert.ok(iPw >= 0);
  const nP = ringPNeighbors.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPw);
  const railP = Array.from({ length: nP }, () => false);
  const ip = ringW.indexOf(p);
  assert.ok(ip >= 0);
  const nW = ringW.length;
  const roadW = Array.from({ length: nW }, (_, j) => j === ip);
  const railW = Array.from({ length: nW }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [w]: 'water', [b]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [w]: roadW },
    res4RailSidesByH3: { [p]: railP, [w]: railW },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: b,
    res4Set: new Set([p, w, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 8,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('infantry plains neighbor costs 1/1.25 MPs on a road-only link', () => {
  const a = tacticalRes4Cell(71, 81);
  const b = firstRingCellDistinctFrom(a);
  const ringA = res4GridDiskNeighborsOrdered(a);
  const ringB = res4GridDiskNeighborsOrdered(b);
  const i = ringA.indexOf(b);
  assert.ok(i >= 0);
  const nA = ringA.length;
  const nB = ringB.length;
  const roadA = Array.from({ length: nA }, (_, j) => j === i);
  const railA = Array.from({ length: nA }, () => false);
  const roadB = Array.from({ length: nB }, () => false);
  const railB = Array.from({ length: nB }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    res4RoadSidesByH3: { [a]: roadA, [b]: roadB },
    res4RailSidesByH3: { [a]: railA, [b]: railB },
  });
  const plan = planTacticalRes4March({
    fromH3: a,
    toH3: b,
    res4Set: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.8);
});

test('infantry plains neighbor costs 1/1.5 MPs on a rail-only link', () => {
  const a = tacticalRes4Cell(72, 82);
  const b = firstRingCellDistinctFrom(a);
  const ringA = res4GridDiskNeighborsOrdered(a);
  const ringB = res4GridDiskNeighborsOrdered(b);
  const i = ringA.indexOf(b);
  assert.ok(i >= 0);
  const nA = ringA.length;
  const nB = ringB.length;
  const roadA = Array.from({ length: nA }, () => false);
  const railA = Array.from({ length: nA }, (_, j) => j === i);
  const roadB = Array.from({ length: nB }, () => false);
  const railB = Array.from({ length: nB }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    res4RoadSidesByH3: { [a]: roadA, [b]: roadB },
    res4RailSidesByH3: { [a]: railA, [b]: railB },
  });
  const plan = planTacticalRes4March({
    fromH3: a,
    toH3: b,
    res4Set: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1 / 1.5);
});

test('infantry plains link uses rail multiplier when both road and rail mark the traversed edge', () => {
  const a = tacticalRes4Cell(73, 83);
  const b = firstRingCellDistinctFrom(a);
  const ringA = res4GridDiskNeighborsOrdered(a);
  const ringB = res4GridDiskNeighborsOrdered(b);
  const i = ringA.indexOf(b);
  assert.ok(i >= 0);
  const nA = ringA.length;
  const nB = ringB.length;
  const roadA = Array.from({ length: nA }, (_, j) => j === i);
  const railA = Array.from({ length: nA }, (_, j) => j === i);
  const roadB = Array.from({ length: nB }, () => false);
  const railB = Array.from({ length: nB }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    res4RoadSidesByH3: { [a]: roadA, [b]: roadB },
    res4RailSidesByH3: { [a]: railA, [b]: railB },
  });
  const plan = planTacticalRes4March({
    fromH3: a,
    toH3: b,
    res4Set: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1 / 1.5);
});
