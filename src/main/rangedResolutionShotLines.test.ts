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
 * Expected outcome: Single pair matching unit hex → target.
 * Exceptions: None.
 */
function testDirectOrderProducesOneEdge(): void {
  const unitById = new Map([['a1', { h3Index: 'from' }]]);
  assert.deepStrictEqual(
    directShotLinesFromOrders([{ unitId: 'a1', targetH3Index: 'to' }], unitById),
    [{ fromH3Index: 'from', toH3Index: 'to' }]
  );
}

/**
 * Verifies duplicate directed pairs collapse.
 *
 * Purpose: Overlapping orders must not draw stacked identical strokes.
 * When to use: After changing `dedupeRangedResolutionShotLines`.
 * Expected outcome: One row remains.
 * Exceptions: None.
 */
function testDedupeCollapsesIdenticalPairs(): void {
  const lines = [
    { fromH3Index: 'a', toH3Index: 'b' },
    { fromH3Index: 'a', toH3Index: 'b' },
    { fromH3Index: 'c', toH3Index: 'd' },
  ];
  assert.deepStrictEqual(dedupeRangedResolutionShotLines(lines), [
    { fromH3Index: 'a', toH3Index: 'b' },
    { fromH3Index: 'c', toH3Index: 'd' },
  ]);
}

/**
 * Verifies return-fire edges for an in-range defender even when the roll would miss.
 *
 * Purpose: Return-fire connectors are eligibility-based, not kill-based.
 * When to use: After changing `returnFireShotLinesForEngagement` range checks.
 * Expected outcome: Defender hex → each in-range attacker hex.
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
    defenderUnits: [{ unitType: 'infantry' }],
    getRange: () => 1,
  });
  assert.deepStrictEqual(lines, [{ fromH3Index: origin, toH3Index: attackerHex }]);
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
    defenderUnits: [{ unitType: 'infantry' }],
    getRange: () => 1,
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
      defenderUnits: [{ unitType: 'infantry' }],
      getRange: () => 2,
    }),
    []
  );
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
    { fromH3Index: 'a', toH3Index: 'b' },
    { fromH3Index: 'a', toH3Index: 'hidden' },
  ];
  assert.deepStrictEqual(filterShotLinesByVisibleEndpoints(lines, new Set(['a', 'b'])), [
    { fromH3Index: 'a', toH3Index: 'b' },
  ]);
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
  testOutOfRangeDefenderEmitsNoReturnFire();
  testEmptyAttackerHexesYieldNoReturnFire();
  testFogFilterRequiresBothEndpoints();
  console.log('rangedResolutionShotLines.test.ts passed');
}

run();
