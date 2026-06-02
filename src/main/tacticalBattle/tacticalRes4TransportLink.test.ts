/**
 * Contract tests for tactical res4 transport neighbor indexing vs `gridDisk` ring order.
 * Run: `node dist/main/tacticalBattle/tacticalRes4TransportLink.test.js`
 */

import assert from 'node:assert/strict';
import { gridDisk } from 'h3-js';
import { test } from 'node:test';
import {
  buildRes4FootprintAdjacencyMap,
  neighborSlotIndex,
  res4GridDiskNeighborsOrdered,
  res4NeighborsInFootprint,
  TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER,
  TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER,
  tacticalRes4FootprintTransportOverlayRecords,
  tacticalRes4TransportEdgeActive,
  tacticalRes4TransportInteriorContinuityOnCurr,
  tacticalRes4TransportMarchAdjacentPairAllowsStep,
  tacticalRes4TransportMarchInteriorContinuity,
  tacticalRes4TransportStepSpeedMultiplier,
} from '../../shared/tacticalRes4TransportLink';
import { tacticalRes4Cell, firstRingCellDistinctFrom } from './testSupport/tacticalRes4HexFixtures';

/**
 * Verifies precomputed footprint adjacency matches live `res4NeighborsInFootprint` for every cell.
 *
 * Purpose: Regression guard for Phase 1 adjacency precompute used by the march session cache.
 * When to use: After changes to `buildRes4FootprintAdjacencyMap` or `res4NeighborsInFootprint`.
 * Expected outcome: Identical neighbor lists for each cell in a multi-cell res4 footprint sample.
 * Exceptions: None; uses a smaller two-cell footprint when `gridDisk(k=2)` throws on pentagon edges.
 */
test('buildRes4FootprintAdjacencyMap matches res4NeighborsInFootprint for every cell', () => {
  const center = tacticalRes4Cell(48, 58);
  let footprint: Set<string>;
  try {
    footprint = new Set([...gridDisk(center, 2)]);
  } catch {
    footprint = new Set([center, firstRingCellDistinctFrom(center)]);
  }
  const adj = buildRes4FootprintAdjacencyMap(footprint);
  for (const h of footprint) {
    assert.deepStrictEqual(adj.get(h) ?? [], res4NeighborsInFootprint(h, footprint));
  }
});

test('res4GridDiskNeighborsOrdered matches gridDisk ring cells excluding origin', () => {
  const center = tacticalRes4Cell(45, 55);
  const disk = [...gridDisk(center, 1)].filter((h) => h !== center);
  const ordered = res4GridDiskNeighborsOrdered(center);
  assert.deepStrictEqual(ordered, disk);
});

test('neighborSlotIndex agrees with ring ordering for a real res4 pair', () => {
  const from = tacticalRes4Cell(46, 56);
  const to = firstRingCellDistinctFrom(from);
  const ring = res4GridDiskNeighborsOrdered(from);
  const i = ring.indexOf(to);
  assert.ok(i >= 0);
  assert.strictEqual(neighborSlotIndex(from, to), i);
});

test('tacticalRes4TransportEdgeActive is true when only the head cell marks the shared edge', () => {
  const from = tacticalRes4Cell(47, 57);
  const to = firstRingCellDistinctFrom(from);
  const ringFrom = res4GridDiskNeighborsOrdered(from);
  const i = ringFrom.indexOf(to);
  assert.ok(i >= 0);
  const n = ringFrom.length;
  const roadSidesFrom = Array.from({ length: n }, (_, j) => j === i);
  const railSidesFrom = Array.from({ length: n }, () => false);
  const ringTo = res4GridDiskNeighborsOrdered(to);
  const roadSidesTo = Array.from({ length: ringTo.length }, () => false);
  const railSidesTo = Array.from({ length: ringTo.length }, () => false);
  const { roadRailByH3 } = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: new Set([from, to]),
    overlays: [
      { h3Index: from, roadSides: roadSidesFrom, railSides: railSidesFrom },
      { h3Index: to, roadSides: roadSidesTo, railSides: railSidesTo },
    ],
  });
  assert.equal(
    tacticalRes4TransportEdgeActive({
      fromH3: from,
      toH3: to,
      roadRailByH3,
    }),
    true
  );
});

test('tacticalRes4TransportEdgeActive is false when only the to cell marks the reciprocal edge (reciprocal-only)', () => {
  const from = tacticalRes4Cell(48, 58);
  const to = firstRingCellDistinctFrom(from);
  const ringFrom = res4GridDiskNeighborsOrdered(from);
  const i = ringFrom.indexOf(to);
  assert.ok(i >= 0);
  const n = ringFrom.length;
  const roadSidesFrom = Array.from({ length: n }, () => false);
  const railSidesFrom = Array.from({ length: n }, () => false);
  const ringTo = res4GridDiskNeighborsOrdered(to);
  const j = ringTo.indexOf(from);
  assert.ok(j >= 0);
  const roadSidesTo = Array.from({ length: ringTo.length }, (_, k) => k === j);
  const railSidesTo = Array.from({ length: ringTo.length }, () => false);
  const { roadRailByH3 } = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: new Set([from, to]),
    overlays: [
      { h3Index: from, roadSides: roadSidesFrom, railSides: railSidesFrom },
      { h3Index: to, roadSides: roadSidesTo, railSides: railSidesTo },
    ],
  });
  assert.equal(
    tacticalRes4TransportEdgeActive({
      fromH3: from,
      toH3: to,
      roadRailByH3,
    }),
    false
  );
});

test('tacticalRes4TransportEdgeActive is false when from-cell mask length does not match gridDisk ring length', () => {
  const from = tacticalRes4Cell(49, 59);
  const to = firstRingCellDistinctFrom(from);
  const ringFrom = res4GridDiskNeighborsOrdered(from);
  const i = ringFrom.indexOf(to);
  assert.ok(i >= 0);
  const wrongLen = Math.max(1, ringFrom.length - 1);
  const roadSidesWrong = Array.from({ length: wrongLen }, (_, k) => k === Math.min(i, wrongLen - 1));
  const railSidesWrong = Array.from({ length: wrongLen }, () => false);
  assert.notStrictEqual(wrongLen, ringFrom.length);
  const roadRailByH3 = new Map<string, { roadSides: boolean[]; railSides: boolean[] }>([
    [from, { roadSides: roadSidesWrong, railSides: railSidesWrong }],
  ]);
  assert.equal(
    tacticalRes4TransportEdgeActive({
      fromH3: from,
      toH3: to,
      roadRailByH3,
    }),
    false
  );
});

test('tacticalRes4TransportInteriorContinuityOnCurr is true when the middle cell marks both corridor sides', () => {
  const prev = tacticalRes4Cell(50, 60);
  const curr = firstRingCellDistinctFrom(prev);
  const ringCurr = res4GridDiskNeighborsOrdered(curr);
  const next = ringCurr.find((h) => h !== prev);
  assert.ok(next);
  const ip = ringCurr.indexOf(prev);
  const inext = ringCurr.indexOf(next);
  assert.ok(ip >= 0 && inext >= 0);
  const n = ringCurr.length;
  const roadCurr = Array.from({ length: n }, (_, j) => j === ip || j === inext);
  const railCurr = Array.from({ length: n }, () => false);
  const { roadRailByH3 } = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: new Set([prev, curr, next]),
    overlays: [{ h3Index: curr, roadSides: roadCurr, railSides: railCurr }],
  });
  assert.equal(
    tacticalRes4TransportInteriorContinuityOnCurr({
      prevH3: prev,
      currH3: curr,
      nextH3: next,
      roadRailByH3,
    }),
    true
  );
});

test('tacticalRes4TransportInteriorContinuityOnCurr is false when the middle cell marks only the inbound side', () => {
  const prev = tacticalRes4Cell(51, 61);
  const curr = firstRingCellDistinctFrom(prev);
  const ringCurr = res4GridDiskNeighborsOrdered(curr);
  const next = ringCurr.find((h) => h !== prev);
  assert.ok(next);
  const ip = ringCurr.indexOf(prev);
  const n = ringCurr.length;
  const roadCurr = Array.from({ length: n }, (_, j) => j === ip);
  const railCurr = Array.from({ length: n }, () => false);
  const { roadRailByH3 } = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: new Set([prev, curr, next]),
    overlays: [{ h3Index: curr, roadSides: roadCurr, railSides: railCurr }],
  });
  assert.equal(
    tacticalRes4TransportInteriorContinuityOnCurr({
      prevH3: prev,
      currH3: curr,
      nextH3: next,
      roadRailByH3,
    }),
    false
  );
});

test('tacticalRes4TransportStepSpeedMultiplier matches road vs rail vs combined-edge preference', () => {
  const from = tacticalRes4Cell(52, 62);
  const to = firstRingCellDistinctFrom(from);
  const ringFrom = res4GridDiskNeighborsOrdered(from);
  const i = ringFrom.indexOf(to);
  assert.ok(i >= 0);
  const n = ringFrom.length;
  const ringTo = res4GridDiskNeighborsOrdered(to);
  const jFromOnTo = ringTo.indexOf(from);
  assert.ok(jFromOnTo >= 0);
  const roadSidesTo = Array.from({ length: ringTo.length }, (_, j) => j === jFromOnTo);
  const railSidesTo = Array.from({ length: ringTo.length }, () => false);

  const roadOnlyFrom = Array.from({ length: n }, (_, j) => j === i);
  const railOffFrom = Array.from({ length: n }, () => false);
  const { roadRailByH3: roadMap } = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: new Set([from, to]),
    overlays: [
      { h3Index: from, roadSides: roadOnlyFrom, railSides: railOffFrom },
      { h3Index: to, roadSides: roadSidesTo, railSides: railSidesTo },
    ],
  });
  assert.equal(
    tacticalRes4TransportStepSpeedMultiplier({ fromH3: from, toH3: to, roadRailByH3: roadMap }),
    TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER
  );

  const railOnlyFrom = Array.from({ length: n }, (_, j) => j === i);
  const roadOffFrom = Array.from({ length: n }, () => false);
  const { roadRailByH3: railMap } = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: new Set([from, to]),
    overlays: [
      { h3Index: from, roadSides: roadOffFrom, railSides: railOnlyFrom },
      { h3Index: to, roadSides: roadSidesTo, railSides: railSidesTo },
    ],
  });
  assert.equal(
    tacticalRes4TransportStepSpeedMultiplier({ fromH3: from, toH3: to, roadRailByH3: railMap }),
    TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER
  );

  const bothFrom = Array.from({ length: n }, (_, j) => j === i);
  const { roadRailByH3: bothMap } = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: new Set([from, to]),
    overlays: [
      { h3Index: from, roadSides: bothFrom, railSides: bothFrom },
      { h3Index: to, roadSides: roadSidesTo, railSides: railSidesTo },
    ],
  });
  assert.equal(
    tacticalRes4TransportStepSpeedMultiplier({ fromH3: from, toH3: to, roadRailByH3: bothMap }),
    TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER
  );
});

test('tacticalRes4TransportMarchAdjacentPairAllowsStep is true when shared boundary is unmarked but both cells have any road/rail', () => {
  const from = tacticalRes4Cell(74, 84);
  const to = firstRingCellDistinctFrom(from);
  const ringFrom = res4GridDiskNeighborsOrdered(from);
  const i = ringFrom.indexOf(to);
  assert.ok(i >= 0);
  const n = ringFrom.length;
  const roadSidesFrom = Array.from({ length: n }, (_, j) => j === (i + 1) % n);
  const railSidesFrom = Array.from({ length: n }, () => false);
  const ringTo = res4GridDiskNeighborsOrdered(to);
  const j = ringTo.indexOf(from);
  assert.ok(j >= 0);
  const roadSidesTo = Array.from({ length: ringTo.length }, (_, k) => k === j);
  const railSidesTo = Array.from({ length: ringTo.length }, () => false);
  const { roadRailByH3 } = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: new Set([from, to]),
    overlays: [
      { h3Index: from, roadSides: roadSidesFrom, railSides: railSidesFrom },
      { h3Index: to, roadSides: roadSidesTo, railSides: railSidesTo },
    ],
  });
  assert.equal(tacticalRes4TransportEdgeActive({ fromH3: from, toH3: to, roadRailByH3 }), false);
  assert.equal(
    tacticalRes4TransportMarchAdjacentPairAllowsStep({ fromH3: from, toH3: to, roadRailByH3 }),
    true
  );
});

test('tacticalRes4TransportMarchInteriorContinuity does not require middle cell to mark both corridor slots', () => {
  const prev = tacticalRes4Cell(75, 85);
  const curr = firstRingCellDistinctFrom(prev);
  const ringCurr = res4GridDiskNeighborsOrdered(curr);
  const next = ringCurr.find((h) => h !== prev);
  assert.ok(next);
  const ringPrev = res4GridDiskNeighborsOrdered(prev);
  const ringNext = res4GridDiskNeighborsOrdered(next);
  const nP = ringPrev.length;
  const nC = ringCurr.length;
  const nN = ringNext.length;
  const roadPrev = Array.from({ length: nP }, (_, j) => j === ringPrev.indexOf(curr));
  const railPrev = Array.from({ length: nP }, () => false);
  const ip = ringCurr.indexOf(prev);
  const roadCurr = Array.from({ length: nC }, (_, j) => j === ip);
  const railCurr = Array.from({ length: nC }, () => false);
  const roadNext = Array.from({ length: nN }, (_, j) => j === ringNext.indexOf(curr));
  const railNext = Array.from({ length: nN }, () => false);
  const { roadRailByH3 } = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: new Set([prev, curr, next]),
    overlays: [
      { h3Index: prev, roadSides: roadPrev, railSides: railPrev },
      { h3Index: curr, roadSides: roadCurr, railSides: railCurr },
      { h3Index: next, roadSides: roadNext, railSides: railNext },
    ],
  });
  assert.equal(
    tacticalRes4TransportInteriorContinuityOnCurr({
      prevH3: prev,
      currH3: curr,
      nextH3: next,
      roadRailByH3,
    }),
    false
  );
  assert.equal(
    tacticalRes4TransportMarchInteriorContinuity({
      prevH3: prev,
      currH3: curr,
      nextH3: next,
      roadRailByH3,
    }),
    true
  );
});
