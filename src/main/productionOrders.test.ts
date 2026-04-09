/**
 * Contract tests for productionOrders normalization (happy paths + essential failure drops).
 */

import * as assert from 'assert';
import { normalizeProductionOrders } from './productionOrders';

function testNormalizeProductionOrdersHappyPath(): void {
  const parsed = normalizeProductionOrders([
    { action: 'set_build_queue', hex: [12.34, 56.78], unitType: 'infantry', count: 3 },
    { action: 'set_build_queue', hex: [12.35, 56.79], unitType: 'air', count: 2 },
  ]);
  assert.strictEqual(parsed.validOrders.length, 2);
  assert.strictEqual(parsed.droppedReasons.length, 0);
}

function testNormalizeProductionOrdersDropsMalformedEntriesButKeepsValid(): void {
  const parsed = normalizeProductionOrders([
    { action: 'set_build_queue', hex: [12.34, 56.78], unitType: 'infantry', count: 1 },
    { action: 'set_build_queue', hex: [12.34, 56.78], count: 1 },
    { action: 'unknown_build_action', hex: [12.34, 56.78], entryId: 0 },
    'not-an-object',
  ]);
  assert.strictEqual(parsed.validOrders.length, 1);
  assert.ok(parsed.droppedReasons.length >= 3);
}

function testNormalizeProductionOrdersRejectsOutOfBoundsCount(): void {
  const parsed = normalizeProductionOrders([
    { action: 'set_build_queue', hex: [12.34, 56.78], unitType: 'infantry', count: 0 },
    { action: 'set_build_queue', hex: [12.34, 56.78], unitType: 'naval', count: 100 },
  ]);
  assert.strictEqual(parsed.validOrders.length, 0);
  assert.strictEqual(parsed.droppedReasons.length, 2);
}

function testNormalizeProductionOrdersRequiresArrayWhenPresent(): void {
  const parsed = normalizeProductionOrders({ action: 'set_build_queue' });
  assert.strictEqual(parsed.validOrders.length, 0);
  assert.strictEqual(parsed.droppedReasons.length, 1);
}

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
