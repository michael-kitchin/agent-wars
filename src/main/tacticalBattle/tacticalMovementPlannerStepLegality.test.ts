/**
 * Tests tactical march step classification and road, rail, and water link costs.
 * Run with: node dist/main/tacticalBattle/tacticalMovementPlannerStepLegality.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planTacticalMarch } from '../../shared/tacticalMovementPlanner';
import {
  buildLandMarchStepLegalityDetailAlongPath,
  classifyLandInfantryArmorEnterStep,
  summarizeLandMarchStepLegalityAlongPath,
} from '../../shared/tacticalLandMarchContinuity';
import { tacticalGridDiskNeighborsOrdered } from '../../shared/tacticalTransportLink';
import { buildTacticalTerrainKindResolverFromSnapshot } from '../../shared/tacticalTerrainMovement';
import {
  firstRingCellDistinctFrom,
  pairedTransportSidesForAdjacentHexes,
  tacticalCell,
} from './testSupport/tacticalHexFixtures';

test('classifyLandInfantryArmorEnterStep: armor into mountain without transport is base (infinite cost)', () => {
  const center = tacticalCell(59, 69);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [neighbor]: 'mountain' },
  });
  const tacticalSet = new Set([center, neighbor]);
  const c = classifyLandInfantryArmorEnterStep({
    toH3: neighbor,
    unitTypeForMovement: 'armor',
    terrain,
    fromH3: center,
    prevOfFrom: null,
    marchGoalH3: neighbor,
    tacticalSet,
  });
  assert.equal(c.appliedReason, 'base');
  assert.equal(c.tacticalCategory, 'mountains');
  assert.ok(!Number.isFinite(c.appliedCost));
});

test('classifyLandInfantryArmorEnterStep: armor into urban mountain uses urban override', () => {
  const center = tacticalCell(60, 70);
  const neighbor = firstRingCellDistinctFrom(center);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [neighbor]: 'mountain' },
    tacticalIsUrbanByH3: { [neighbor]: true },
  });
  const c = classifyLandInfantryArmorEnterStep({
    toH3: neighbor,
    unitTypeForMovement: 'armor',
    terrain,
    fromH3: center,
    prevOfFrom: null,
    marchGoalH3: neighbor,
    tacticalSet: new Set([center, neighbor]),
  });
  assert.equal(c.appliedReason, 'urban');
  assert.equal(c.appliedCost, 1);
  assert.equal(c.tacticalCategory, 'mountains');
});

test('classifyLandInfantryArmorEnterStep: armor into mountain goal uses transport_blocking with corridor witness', () => {
  const p = tacticalCell(61, 71);
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
  const tacticalSet = new Set([p, m, w]);
  const c = classifyLandInfantryArmorEnterStep({
    toH3: m,
    unitTypeForMovement: 'armor',
    terrain,
    fromH3: p,
    prevOfFrom: null,
    marchGoalH3: m,
    tacticalSet,
  });
  assert.equal(c.appliedReason, 'transport_blocking');
  assert.equal(c.appliedCost, 0.5);
  assert.equal(c.transportEffectiveBudgetMultiplier, 2.0);
  assert.equal(c.transportEdgeActive, true);
  assert.equal(c.transportContinuityAllowed, true);
});

test('summarizeLandMarchStepLegalityAlongPath lists transport_blocking then transport_plains for armor corridor through mountain', () => {
  const p = tacticalCell(62, 72);
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
  const roadMB = Array.from({ length: ringB.length }, (_, j) => j === imb);
  const railMB = Array.from({ length: ringB.length }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM, [b]: roadMB },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM, [b]: railMB },
  });
  const tacticalSet = new Set([p, m, b]);
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: b,
    tacticalSet,
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
    tacticalSet,
  });
  assert.ok(summary);
  assert.match(summary!, /mountains→transport_blocking/);
  assert.match(summary!, /plains→transport_plains/);
});

test('buildLandMarchStepLegalityDetailAlongPath includes toH3 and transport flags for mountain transport steps', () => {
  const p = tacticalCell(63, 73);
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
  const tacticalSet = new Set([p, m, w]);
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: m,
    tacticalSet,
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
    tacticalSet,
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
  const p = tacticalCell(64, 74);
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
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [b]: 'plains' },
    tacticalRoadSidesByH3: { [p]: roadP },
    tacticalRailSidesByH3: { [p]: railP },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: b,
    tacticalSet: new Set([p, m, b]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 8,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('infantry can transit water when the water hex marks both entry and exit transport sides', () => {
  const p = tacticalCell(65, 75);
  const w = firstRingCellDistinctFrom(p);
  const ringW = tacticalGridDiskNeighborsOrdered(w);
  const ringPNeighbors = new Set(tacticalGridDiskNeighborsOrdered(p));
  const b = ringW.find((h) => h !== p && !ringPNeighbors.has(h));
  assert.ok(b);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
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
  const ringB = tacticalGridDiskNeighborsOrdered(b);
  const imb = ringB.indexOf(w);
  assert.ok(imb >= 0);
  const roadB = Array.from({ length: ringB.length }, (_, j) => j === imb);
  const railB = Array.from({ length: ringB.length }, () => false);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [p]: 'plains', [w]: 'water', [b]: 'plains' },
    tacticalRoadSidesByH3: { [p]: roadP, [w]: roadW, [b]: roadB },
    tacticalRailSidesByH3: { [p]: railP, [w]: railW, [b]: railB },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: b,
    tacticalSet: new Set([p, w, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 8,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1.0);
});

test('infantry cannot enter water goal when only plains marks the shared boundary (water lacks head edge toward plains)', () => {
  const p = tacticalCell(69, 79);
  const w = firstRingCellDistinctFrom(p);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
  const ringW = tacticalGridDiskNeighborsOrdered(w);
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
    tacticalTerrainKindByH3: { [p]: 'plains', [w]: 'water' },
    tacticalRoadSidesByH3: { [p]: roadP, [w]: roadW },
    tacticalRailSidesByH3: { [p]: railP, [w]: railW },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: w,
    tacticalSet: new Set([p, w]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('infantry reaches water goal at plains cost when reciprocal boundary is marked on both adjacent cells', () => {
  const p = tacticalCell(70, 80);
  const w = firstRingCellDistinctFrom(p);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
  const ringW = tacticalGridDiskNeighborsOrdered(w);
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
    tacticalTerrainKindByH3: { [p]: 'plains', [w]: 'water' },
    tacticalRoadSidesByH3: { [p]: roadP, [w]: roadW },
    tacticalRailSidesByH3: { [p]: railP, [w]: railW },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: w,
    tacticalSet: new Set([p, w]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('infantry urban neighbor uses road transport divisor on a road link when both cells carry march masks', () => {
  const a = tacticalCell(74, 84);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    tacticalIsUrbanByH3: { [b]: true },
    tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
  });
  const plan = planTacticalMarch({
    fromH3: a,
    toH3: b,
    tacticalSet: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('infantry forest neighbor on a road costs the same as plains on a road', () => {
  const a = tacticalCell(75, 85);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'forest' },
    tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
  });
  const plan = planTacticalMarch({
    fromH3: a,
    toH3: b,
    tacticalSet: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('infantry can cross one water road cell onto plains that has no road', () => {
  const p = tacticalCell(66, 76);
  const w = firstRingCellDistinctFrom(p);
  const ringW = tacticalGridDiskNeighborsOrdered(w);
  const ringPNeighbors = tacticalGridDiskNeighborsOrdered(p);
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
    tacticalTerrainKindByH3: { [p]: 'plains', [w]: 'water', [b]: 'plains' },
    tacticalRoadSidesByH3: { [p]: roadP, [w]: roadW },
    tacticalRailSidesByH3: { [p]: railP, [w]: railW },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: b,
    tacticalSet: new Set([p, w, b]),
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
  const p = tacticalCell(84, 94);
  const m = firstRingCellDistinctFrom(p);
  const ringM = tacticalGridDiskNeighborsOrdered(m);
  const ringP = new Set(tacticalGridDiskNeighborsOrdered(p));
  const n = ringM.find((h) => h !== p && !ringP.has(h));
  assert.ok(n);
  const ringPList = tacticalGridDiskNeighborsOrdered(p);
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
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [n]: 'mountain' },
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM },
  });
  const plan = planTacticalMarch({
    fromH3: p,
    toH3: n,
    tacticalSet: new Set([p, m, n]),
    unitTypeForMovement: 'armor',
    movementPointBudget: 8,
    terrain,
  });
  assert.equal(plan.reachable, false);
});

test('infantry plains neighbor uses road transport divisor on a road-only link', () => {
  const a = tacticalCell(71, 81);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
  });
  const plan = planTacticalMarch({
    fromH3: a,
    toH3: b,
    tacticalSet: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 0.5);
});

test('infantry plains neighbor uses rail transport divisor on a rail-only link', () => {
  const a = tacticalCell(72, 82);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'rail');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
  });
  const plan = planTacticalMarch({
    fromH3: a,
    toH3: b,
    tacticalSet: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1 / 3.0);
});

test('rubble plains with a road costs one point for infantry and armor', () => {
  const a = tacticalCell(80, 90);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    tacticalIsRubbleByH3: { [b]: true },
    tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
  });
  for (const unitTypeForMovement of ['infantry', 'armor'] as const) {
    const plan = planTacticalMarch({
      fromH3: a,
      toH3: b,
      tacticalSet: new Set([a, b]),
      unitTypeForMovement,
      movementPointBudget: 4,
      terrain,
    });
    assert.equal(plan.reachable, true);
    assert.equal(plan.totalCostToDestination, 1);
  }
});

test('infantry rubble on a mountain road costs one point', () => {
  const a = tacticalCell(81, 91);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
    tacticalIsRubbleByH3: { [b]: true },
    tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
  });
  const plan = planTacticalMarch({
    fromH3: a,
    toH3: b,
    tacticalSet: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 4,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1);
});

test('armor cannot enter rubble mountains with or without a road', () => {
  const a = tacticalCell(82, 92);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const withoutRoad = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
    tacticalIsRubbleByH3: { [b]: true },
  });
  const withRoad = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
    tacticalIsRubbleByH3: { [b]: true },
    tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
  });
  for (const terrain of [withoutRoad, withRoad]) {
    const plan = planTacticalMarch({
      fromH3: a,
      toH3: b,
      tacticalSet: new Set([a, b]),
      unitTypeForMovement: 'armor',
      movementPointBudget: 8,
      terrain,
    });
    assert.equal(plan.reachable, false);
  }
});

test('infantry cannot enter rubble water with or without a road', () => {
  const a = tacticalCell(83, 93);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'road');
  const withoutRoad = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'water' },
    tacticalIsRubbleByH3: { [b]: true },
  });
  const withRoad = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'water' },
    tacticalIsRubbleByH3: { [b]: true },
    tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
  });
  for (const terrain of [withoutRoad, withRoad]) {
    const plan = planTacticalMarch({
      fromH3: a,
      toH3: b,
      tacticalSet: new Set([a, b]),
      unitTypeForMovement: 'infantry',
      movementPointBudget: 8,
      terrain,
    });
    assert.equal(plan.reachable, false);
  }
});

test('infantry plains link uses rail multiplier when both road and rail mark the traversed edge', () => {
  const a = tacticalCell(73, 83);
  const b = firstRingCellDistinctFrom(a);
  const paired = pairedTransportSidesForAdjacentHexes(a, b, 'both');
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [a]: 'plains', [b]: 'plains' },
    tacticalRoadSidesByH3: paired.tacticalRoadSidesByH3,
    tacticalRailSidesByH3: paired.tacticalRailSidesByH3,
  });
  const plan = planTacticalMarch({
    fromH3: a,
    toH3: b,
    tacticalSet: new Set([a, b]),
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
    terrain,
  });
  assert.equal(plan.reachable, true);
  assert.equal(plan.totalCostToDestination, 1 / 3.0);
});
