/**
 * Contract tests for final JSON prompt helpers.
 */

import * as assert from 'assert';
import { getFinalJsonOrdersExampleBlock } from './promptContracts';

function testExampleBlockParsesWithParser(): void {
  const block = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: false, includeProductionOrders: false });
  const jsonMatch = block.match(/```json\s*([\s\S]*?)```/);
  assert.ok(jsonMatch, 'example should be fenced json');
  const parsed = JSON.parse(jsonMatch[1]!.trim()) as { strategy?: string; orders?: unknown[] };
  assert.strictEqual(typeof parsed.strategy, 'string');
  assert.ok(Array.isArray(parsed.orders));
  assert.ok(parsed.orders!.length >= 3);
}

function testExampleBlockIncludesOptionalTails(): void {
  const block = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: true, includeProductionOrders: true });
  assert.ok(block.includes('"memoryUpdates"'));
  assert.ok(block.includes('"productionOrders"'));
  assert.ok(block.includes('set_build_queue'));
}

const tests = [
  { name: 'getFinalJsonOrdersExampleBlock contains parseable JSON', fn: testExampleBlockParsesWithParser },
  { name: 'getFinalJsonOrdersExampleBlock optional tails', fn: testExampleBlockIncludesOptionalTails },
];

function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
