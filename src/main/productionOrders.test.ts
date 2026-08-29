/**
 * Contract tests for productionOrders normalization (happy paths + essential failure drops).
 */

import * as assert from 'assert';
import type { CoordinateContext } from './briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized, listStrategicRes1H3Indexes } from './briefing/map/hexCoordinates';
import { h3ToCode } from './briefing/map/hexCodeTranslator';
import { normalizeProductionOrders } from './productionOrders';

const strategicCtx: CoordinateContext = { mode: 'strategic' };

/**
 * Resolves two distinct strategic briefing codes for deterministic tests.
 *
 * Purpose: `normalizeProductionOrders` validates codes against the live strategic registry.
 * When to use: Once per test file after `ensureStrategicCoordinateRegistryInitialized`.
 * Expected outcome: Two uppercase two-character codes.
 * Exceptions: Throws if the registry is unexpectedly small (build misconfiguration).
 */
function twoSampleStrategicHexCodes(): [string, string] {
  ensureStrategicCoordinateRegistryInitialized();
  const cells = listStrategicRes1H3Indexes();
  if (cells.length < 2) throw new Error('productionOrders.test: expected at least two strategic res1 cells');
  const a = h3ToCode(cells[0]!, strategicCtx);
  const b = h3ToCode(cells[1]!, strategicCtx);
  return [a, b];
}

/**
 * Defines the `testNormalizeProductionOrdersHappyPath` function shape (function testNormalizeProductionOrdersHappyPath(): void).

 * Purpose: Supports maintainability by documenting why `testNormalizeProductionOrdersHappyPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNormalizeProductionOrdersHappyPath(): void {
  const [hx0, hx1] = twoSampleStrategicHexCodes();
  const parsed = normalizeProductionOrders(
    [
      { action: 'set_build_queue', hex: hx0, unitType: 'infantry', count: 3 },
      { action: 'set_build_queue', hex: hx1, unitType: 'air', count: 2 },
    ],
    strategicCtx
  );
  assert.strictEqual(parsed.validOrders.length, 2);
  assert.strictEqual(parsed.droppedReasons.length, 0);
}

/**
 * Defines the `testNormalizeProductionOrdersDropsMalformedEntriesButKeepsValid` function shape (function testNormalizeProductionOrdersDropsMalformedEntriesButKeepsValid(): void).

 * Purpose: Supports maintainability by documenting why `testNormalizeProductionOrdersDropsMalformedEntriesButKeepsValid` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNormalizeProductionOrdersDropsMalformedEntriesButKeepsValid(): void {
  const [hx0] = twoSampleStrategicHexCodes();
  const parsed = normalizeProductionOrders(
    [
      { action: 'set_build_queue', hex: hx0, unitType: 'infantry', count: 1 },
      { action: 'set_build_queue', hex: hx0, count: 1 },
      { action: 'unknown_build_action', hex: hx0, entryId: 0 },
      'not-an-object',
    ],
    strategicCtx
  );
  assert.strictEqual(parsed.validOrders.length, 1);
  assert.ok(parsed.droppedReasons.length >= 3);
}

/**
 * Defines the `testNormalizeProductionOrdersRejectsOutOfBoundsCount` function shape (function testNormalizeProductionOrdersRejectsOutOfBoundsCount(): void).

 * Purpose: Supports maintainability by documenting why `testNormalizeProductionOrdersRejectsOutOfBoundsCount` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNormalizeProductionOrdersRejectsOutOfBoundsCount(): void {
  const [hx0] = twoSampleStrategicHexCodes();
  const parsed = normalizeProductionOrders(
    [
      { action: 'set_build_queue', hex: hx0, unitType: 'infantry', count: 0 },
      { action: 'set_build_queue', hex: hx0, unitType: 'naval', count: 100 },
    ],
    strategicCtx
  );
  assert.strictEqual(parsed.validOrders.length, 0);
  assert.strictEqual(parsed.droppedReasons.length, 2);
}

/**
 * Defines the `testNormalizeProductionOrdersRequiresArrayWhenPresent` function shape (function testNormalizeProductionOrdersRequiresArrayWhenPresent(): void).

 * Purpose: Supports maintainability by documenting why `testNormalizeProductionOrdersRequiresArrayWhenPresent` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNormalizeProductionOrdersRequiresArrayWhenPresent(): void {
  const parsed = normalizeProductionOrders({ action: 'set_build_queue' }, strategicCtx);
  assert.strictEqual(parsed.validOrders.length, 0);
  assert.strictEqual(parsed.droppedReasons.length, 1);
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  const tests = [
    { name: 'happy path', fn: testNormalizeProductionOrdersHappyPath },
    { name: 'mixed validity partial keep', fn: testNormalizeProductionOrdersDropsMalformedEntriesButKeepsValid },
    { name: 'count bounds', fn: testNormalizeProductionOrdersRejectsOutOfBoundsCount },
    { name: 'array contract', fn: testNormalizeProductionOrdersRequiresArrayWhenPresent },
  ];
  for (const test of tests) {
    try {
      test.fn();
      console.log(`OK ${test.name}`);
    } catch (err) {
      console.error(`FAIL ${test.name}`, err);
      process.exit(1);
    }
  }
  console.log(`All ${tests.length} productionOrders tests passed.`);
}

run();
