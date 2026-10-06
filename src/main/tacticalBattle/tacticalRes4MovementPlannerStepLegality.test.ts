/**
 * Tests tactical res4 march step classification and road, rail, and water link costs.
 * Run with: node dist/main/tacticalBattle/tacticalRes4MovementPlannerStepLegality.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planTacticalRes4March } from '../../shared/tacticalRes4MovementPlanner';
import {
  buildLandMarchStepLegalityDetailAlongPath,
  classifyLandInfantryArmorEnterStep,
  summarizeLandMarchStepLegalityAlongPath,
} from '../../shared/tacticalRes4LandMarchContinuity';
import { res4GridDiskNeighborsOrdered } from '../../shared/tacticalRes4TransportLink';
import { buildTacticalTerrainKindResolverFromSnapshot } from '../../shared/tacticalTerrainMovement';
import {
  firstRingCellDistinctFrom,
  pairedTransportSidesForAdjacentHexes,
  tacticalRes4Cell,
} from './testSupport/tacticalRes4HexFixtures';

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
  assert.equal(c.appliedCost, 0.5);
  assert.equal(c.transportEffectiveBudgetMultiplier, 2.0);
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
  const ringB = res4GridDiskNeighborsOrdered(b);
  const imb = ringB.indexOf(m);
  assert.ok(imb >= 0);
  const roadMB = Array.from({ length: ringB.length }, (_, j) => j === imb);
  const railMB = Array.from({ length: ringB.length }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM, [b]: roadMB },
    res4RailSidesByH3: { [p]: railP, [m]: railM, [b]: railMB },
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
  assert.equal(row.transportEffectiveBudgetMultiplier, 2.0);
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
  const ringB = res4GridDiskNeighborsOrdered(b);
  const imb = ringB.indexOf(w);
  assert.ok(imb >= 0);
  const roadB = Array.from({ length: ringB.length }, (_, j) => j === imb);
  const railB = Array.from({ length: ringB.length }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [w]: 'water', [b]: 'plains' },
    res4RoadSidesByH3: { [p]: roadP, [w]: roadW, [b]: roadB },
    res4RailSidesByH3: { [p]: railP, [w]: railW, [b]: railB },
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
  assert.equal(plan.totalCostToDestination, 1.0);
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
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('infantry urban neighbor uses road transport divisor on a road link when both cells carry march masks', () => {
  const a = tacticalRes4Cell(74, 84);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    res4IsUrbanByH3: { [b]: true },
    res4RoadSidesByH3: paired.res4RoadSidesByH3,
    res4RailSidesByH3: paired.res4RailSidesByH3,
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
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('infantry forest neighbor on a road costs the same as plains on a road', () => {
  const a = tacticalRes4Cell(75, 85);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'forest' },
    res4RoadSidesByH3: paired.res4RoadSidesByH3,
    res4RailSidesByH3: paired.res4RailSidesByH3,
  });
  const plan = planTacticalRes4March({
    fromH3: a,
    toH3: b,
    res4Set: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('infantry can cross one water road cell onto plains that has no road', () => {
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
  assert.equal(plan.reachable, true);
  assert.ok(
    Math.abs(plan.totalCostToDestination - 1.5) < 1e-9,
    `expected 1.5 MPs, got ${plan.totalCostToDestination}`
  );
});

test('armor on a mountain road cannot step onto a neighboring mountain with no road', () => {
  const p = tacticalRes4Cell(84, 94);
  const m = firstRingCellDistinctFrom(p);
  const ringM = res4GridDiskNeighborsOrdered(m);
  const ringP = new Set(res4GridDiskNeighborsOrdered(p));
  const n = ringM.find((h) => h !== p && !ringP.has(h));
  assert.ok(n);
  const ringPList = res4GridDiskNeighborsOrdered(p);
  const iPm = ringPList.indexOf(m);
  assert.ok(iPm >= 0);
  const roadP = Array.from({ length: ringPList.length }, (_, j) => j === iPm);
  const railP = Array.from({ length: ringPList.length }, () => false);
  const ip = ringM.indexOf(p);
  assert.ok(ip >= 0);
  const roadM = Array.from({ length: ringM.length }, (_, j) => j === ip);
  const railM = Array.from({ length: ringM.length }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [n]: 'mountain' },
    res4RoadSidesByH3: { [p]: roadP, [m]: roadM },
    res4RailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalRes4March({
    fromH3: p,
    toH3: n,
    res4Set: new Set([p, m, n]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 8,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('infantry plains neighbor uses road transport divisor on a road-only link', () => {
  const a = tacticalRes4Cell(71, 81);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    res4RoadSidesByH3: paired.res4RoadSidesByH3,
    res4RailSidesByH3: paired.res4RailSidesByH3,
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
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('infantry plains neighbor uses rail transport divisor on a rail-only link', () => {
  const a = tacticalRes4Cell(72, 82);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'rail');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    res4RoadSidesByH3: paired.res4RoadSidesByH3,
    res4RailSidesByH3: paired.res4RailSidesByH3,
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
  assert.equal(plan.totalCostToDestination, 1 / 3.0);
});

test('rubble plains with a road costs one point for infantry and armor', () => {
  const a = tacticalRes4Cell(80, 90);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    res4IsRubbleByH3: { [b]: true },
    res4RoadSidesByH3: paired.res4RoadSidesByH3,
    res4RailSidesByH3: paired.res4RailSidesByH3,
  });
  for (const unitTypeForMovement of ['infantry', 'armor'] as const) {
    const plan = planTacticalRes4March({
      fromH3: a,
      toH3: b,
      res4Set: new Set([a, b]),
      unitTypeForMovement,
      movementPointBudget: 4,
      terrain,
    });
    assert.equal(plan.reachable, true);
    assert.equal(plan.totalCostToDestination, 1);
  }
});

test('infantry rubble on a mountain road costs one point', () => {
  const a = tacticalRes4Cell(81, 91);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
    res4IsRubbleByH3: { [b]: true },
    res4RoadSidesByH3: paired.res4RoadSidesByH3,
    res4RailSidesByH3: paired.res4RailSidesByH3,
  });
  const plan = planTacticalRes4March({
    fromH3: a,
    toH3: b,
    res4Set: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('armor cannot enter rubble mountains with or without a road', () => {
  const a = tacticalRes4Cell(82, 92);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const withoutRoad = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
    res4IsRubbleByH3: { [b]: true },
  });
  const withRoad = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
    res4IsRubbleByH3: { [b]: true },
    res4RoadSidesByH3: paired.res4RoadSidesByH3,
    res4RailSidesByH3: paired.res4RailSidesByH3,
  });
  for (const terrain of [withoutRoad, withRoad]) {
    const plan = planTacticalRes4March({
      fromH3: a,
      toH3: b,
      res4Set: new Set([a, b]),
      unitTypeForMovement: 'armor',
      movementPointBudget: 8,
      terrain,
    });
    assert.equal(plan.reachable, false);
  }
});

test('infantry cannot enter rubble water with or without a road', () => {
  const a = tacticalRes4Cell(83, 93);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const withoutRoad = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'water' },
    res4IsRubbleByH3: { [b]: true },
  });
  const withRoad = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'water' },
    res4IsRubbleByH3: { [b]: true },
    res4RoadSidesByH3: paired.res4RoadSidesByH3,
    res4RailSidesByH3: paired.res4RailSidesByH3,
  });
  for (const terrain of [withoutRoad, withRoad]) {
    const plan = planTacticalRes4March({
      fromH3: a,
      toH3: b,
      res4Set: new Set([a, b]),
      unitTypeForMovement: 'infantry',
      movementPointBudget: 8,
      terrain,
    });
    assert.equal(plan.reachable, false);
  }
});

test('infantry plains link uses rail multiplier when both road and rail mark the traversed edge', () => {
  const a = tacticalRes4Cell(73, 83);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'both');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    res4RoadSidesByH3: paired.res4RoadSidesByH3,
    res4RailSidesByH3: paired.res4RailSidesByH3,
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
  assert.equal(plan.totalCostToDestination, 1 / 3.0);
});
