/**
 * Tests for ranged resolution shot-line builders. Run with: node dist/main/rangedResolutionShotLines.test.js
 */

import assert from 'node:assert/strict';
import { gridDisk, gridDistance } from 'h3-js';
import {
  dedupeRangedResolutionShotLines,
  directShotLinesFromOrders,
  filterShotLinesByVisibleEndpoints,
  returnFireShotLinesForEngagement,
} from '../shared/rangedResolutionShotLines';

/**
 * Verifies one order produces one direct-fire edge from the shooter’s hex.
 *
 * Purpose: Guards the happy path for submitted ranged orders including misses.
 * When to use: After changing `directShotLinesFromOrders`.
 * Expected outcome: Single ranged-style pair matching unit hex → target.
 * Exceptions: None.
 */
function testDirectOrderProducesOneEdge(): void {
  const unitById = new Map([['a1', { h3Index: 'from' }]]);
  assert.deepStrictEqual(
    directShotLinesFromOrders([{ unitId: 'a1', targetH3Index: 'to' }], unitById),
    [{ fromH3Index: 'from', toH3Index: 'to', lineStyle: 'ranged' }]
  );
}

/**
 * Verifies duplicate directed pairs collapse and mixed styles prefer ranged.
 *
 * Purpose: Overlapping orders must not draw stacked identical strokes; air+ground return fire picks ranged.
 * When to use: After changing `dedupeRangedResolutionShotLines`.
 * Expected outcome: Unique geometry rows; mixed style becomes ranged.
 * Exceptions: None.
 */
function testDedupeCollapsesIdenticalPairs(): void {
  const lines = [
    { fromH3Index: 'a', toH3Index: 'b', lineStyle: 'airStrike' as const },
    { fromH3Index: 'a', toH3Index: 'b', lineStyle: 'ranged' as const },
    { fromH3Index: 'c', toH3Index: 'd', lineStyle: 'ranged' as const },
  ];
  assert.deepStrictEqual(dedupeRangedResolutionShotLines(lines), [
    { fromH3Index: 'a', toH3Index: 'b', lineStyle: 'ranged' },
    { fromH3Index: 'c', toH3Index: 'd', lineStyle: 'ranged' },
  ]);
}

/**
 * Verifies return-fire edges for an in-range defender even when the roll would miss.
 *
 * Purpose: Return-fire connectors are eligibility-based, not kill-based.
 * When to use: After changing `returnFireShotLinesForEngagement` range checks.
 * Expected outcome: Defender hex → each in-range attacker hex with ranged style for ground.
 * Exceptions: None.
 */
function testReturnFireEligibleEmitsEdgesWithoutKill(): void {
  const origin = '89283082807ffff';
  const ring = gridDisk(origin, 1).filter((h) => h !== origin);
  assert.ok(ring.length > 0, 'need a neighbor hex');
  const attackerHex = ring[0]!;
  const lines = returnFireShotLinesForEngagement({
    defenderHex: origin,
    attackerHexes: [attackerHex],
    defenderUnits: [{ unitType: 'armor', h3Index: origin }],
    returnFireContext: { theater: 'strategic' },
  });
  assert.deepStrictEqual(lines, [
    { fromH3Index: origin, toH3Index: attackerHex, lineStyle: 'ranged' },
  ]);
}

/**
 * Verifies air-only return fire uses air-strike stroke style when airport allows.
 *
 * Purpose: Matches planned air-strike line styling for air return fire.
 * When to use: After changing return-fire lineStyle selection.
 * Expected outcome: One airStrike-styled edge.
 * Exceptions: None.
 */
function testAirOnlyReturnFireUsesAirStrikeStyle(): void {
  const origin = '89283082807ffff';
  const ring = gridDisk(origin, 1).filter((h) => h !== origin);
  assert.ok(ring.length > 0, 'need a neighbor hex');
  const lines = returnFireShotLinesForEngagement({
    defenderHex: origin,
    attackerHexes: [ring[0]!],
    defenderUnits: [{ unitType: 'air', h3Index: origin }],
    returnFireContext: { theater: 'strategic', hasIntactAirportAtAirBase: () => true },
  });
  assert.deepStrictEqual(lines, [
    { fromH3Index: origin, toH3Index: ring[0]!, lineStyle: 'airStrike' },
  ]);
}

/**
 * Verifies mixed air+ground return fire prefers ranged stroke on the shared edge.
 *
 * Purpose: Product rule when both defender types can return fire to the same attacker hex.
 * When to use: After changing mixed-stack lineStyle selection.
 * Expected outcome: Single ranged-styled edge.
 * Exceptions: None.
 */
function testMixedAirGroundReturnFirePrefersRangedStyle(): void {
  const origin = '89283082807ffff';
  const ring = gridDisk(origin, 1).filter((h) => h !== origin);
  assert.ok(ring.length > 0, 'need a neighbor hex');
  const lines = returnFireShotLinesForEngagement({
    defenderHex: origin,
    attackerHexes: [ring[0]!],
    defenderUnits: [
      { unitType: 'air', h3Index: origin },
      { unitType: 'armor', h3Index: origin },
    ],
    returnFireContext: { theater: 'strategic', hasIntactAirportAtAirBase: () => true },
  });
  assert.deepStrictEqual(lines, [
    { fromH3Index: origin, toH3Index: ring[0]!, lineStyle: 'ranged' },
  ]);
}

/**
 * Verifies out-of-range defenders emit no return-fire lines.
 *
 * Purpose: Matches `resolveOneRangedEngagement` skipping non-eligible defenders.
 * When to use: After changing range eligibility in return-fire builders.
 * Expected outcome: Empty array.
 * Exceptions: None.
 */
function testOutOfRangeDefenderEmitsNoReturnFire(): void {
  const origin = '89283082807ffff';
  const far = gridDisk(origin, 3).find((h) => {
    try {
      return gridDistance(origin, h) > 1;
    } catch {
      return false;
    }
  });
  assert.ok(far, 'need a far hex');
  const lines = returnFireShotLinesForEngagement({
    defenderHex: origin,
    attackerHexes: [far!],
    defenderUnits: [{ unitType: 'infantry', h3Index: origin }],
    returnFireContext: { theater: 'strategic' },
  });
  assert.deepStrictEqual(lines, []);
}

/**
 * Verifies empty attacker hex list yields no return-fire lines.
 *
 * Purpose: Degenerate engagement guard.
 * When to use: After changing empty-input handling.
 * Expected outcome: Empty array.
 * Exceptions: None.
 */
function testEmptyAttackerHexesYieldNoReturnFire(): void {
  assert.deepStrictEqual(
    returnFireShotLinesForEngagement({
      defenderHex: 'h',
      attackerHexes: [],
      defenderUnits: [{ unitType: 'infantry', h3Index: 'h' }],
      returnFireContext: { theater: 'strategic' },
    }),
    []
  );
}

/**
 * Verifies air without airport emits no return-fire shot lines.
 *
 * Purpose: Planning-parity fail-closed for air strike base gate.
 * When to use: After changing return-fire eligibility wiring in shot lines.
 * Expected outcome: Empty array.
 * Exceptions: None.
 */
function testAirWithoutAirportEmitsNoReturnFire(): void {
  const origin = '89283082807ffff';
  const ring = gridDisk(origin, 1).filter((h) => h !== origin);
  assert.ok(ring.length > 0, 'need a neighbor hex');
  const lines = returnFireShotLinesForEngagement({
    defenderHex: origin,
    attackerHexes: [ring[0]!],
    defenderUnits: [{ unitType: 'air', h3Index: origin }],
    returnFireContext: { theater: 'strategic', hasIntactAirportAtAirBase: () => false },
  });
  assert.deepStrictEqual(lines, []);
}

/**
 * Verifies fog filter keeps only fully visible endpoints.
 *
 * Purpose: Strategic fog must hide connectors that would reveal a hidden hex.
 * When to use: After changing `filterShotLinesByVisibleEndpoints`.
 * Expected outcome: Only the fully visible pair remains.
 * Exceptions: None.
 */
function testFogFilterRequiresBothEndpoints(): void {
  const lines = [
    { fromH3Index: 'a', toH3Index: 'b', lineStyle: 'ranged' as const },
    { fromH3Index: 'a', toH3Index: 'hidden', lineStyle: 'airStrike' as const },
  ];
  assert.deepStrictEqual(filterShotLinesByVisibleEndpoints(lines, new Set(['a', 'b'])), [
    { fromH3Index: 'a', toH3Index: 'b', lineStyle: 'ranged' },
  ]);
}

/**
 * Verifies null/undefined visibility means no fog filtering (tactical resolution redraw passes null).
 *
 * Purpose: Regression for TypeError when `drawRangedResolutionShotLines` passes null visible set.
 * When to use: After changing `filterShotLinesByVisibleEndpoints` null handling.
 * Expected outcome: Input lines returned unchanged for null and undefined.
 * Exceptions: None.
 */
function testFogFilterNullOrUndefinedReturnsAllLines(): void {
  const lines = [
    { fromH3Index: 'a', toH3Index: 'b', lineStyle: 'ranged' as const },
    { fromH3Index: 'a', toH3Index: 'hidden', lineStyle: 'airStrike' as const },
  ];
  assert.deepStrictEqual(filterShotLinesByVisibleEndpoints(lines, null), lines);
  assert.deepStrictEqual(filterShotLinesByVisibleEndpoints(lines, undefined), lines);
}

/**
 * Runs all shot-line builder tests.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/rangedResolutionShotLines.test.js`.
 * Expected outcome: Throws on first failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testDirectOrderProducesOneEdge();
  testDedupeCollapsesIdenticalPairs();
  testReturnFireEligibleEmitsEdgesWithoutKill();
  testAirOnlyReturnFireUsesAirStrikeStyle();
  testMixedAirGroundReturnFirePrefersRangedStyle();
  testOutOfRangeDefenderEmitsNoReturnFire();
  testEmptyAttackerHexesYieldNoReturnFire();
  testAirWithoutAirportEmitsNoReturnFire();
  testFogFilterRequiresBothEndpoints();
  testFogFilterNullOrUndefinedReturnsAllLines();
  console.log('rangedResolutionShotLines.test.ts passed');
}

run();
