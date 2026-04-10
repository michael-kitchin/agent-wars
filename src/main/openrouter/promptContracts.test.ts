/**
 * Contract tests for final JSON prompt helpers.
 */

import * as assert from 'assert';
import { getFinalJsonOrdersExampleBlock } from './promptContracts';

/**
 * Defines the `testExampleBlockParsesWithParser` function shape (function testExampleBlockParsesWithParser(): void).

 * Purpose: Supports maintainability by documenting why `testExampleBlockParsesWithParser` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testExampleBlockParsesWithParser(): void {
  const block = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: false, includeProductionOrders: false });
  const jsonMatch = block.match(/```json\s*([\s\S]*?)```/);
  assert.ok(jsonMatch, 'example should be fenced json');
  const parsed = JSON.parse(jsonMatch[1]!.trim()) as { strategy?: string; orders?: unknown[] };
  assert.strictEqual(typeof parsed.strategy, 'string');
  assert.ok(Array.isArray(parsed.orders));
  assert.ok(parsed.orders!.length >= 3);
}

/**
 * Defines the `testExampleBlockIncludesOptionalTails` function shape (function testExampleBlockIncludesOptionalTails(): void).

 * Purpose: Supports maintainability by documenting why `testExampleBlockIncludesOptionalTails` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testExampleBlockIncludesOptionalTails(): void {
  const block = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: true, includeProductionOrders: true });
  assert.ok(block.includes('"memoryUpdates"'));
  assert.ok(block.includes('"productionOrders"'));
  assert.ok(block.includes('set_build_queue'));
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Supports maintainability by documenting why `tests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const tests = [
  { name: 'getFinalJsonOrdersExampleBlock contains parseable JSON', fn: testExampleBlockParsesWithParser },
  { name: 'getFinalJsonOrdersExampleBlock optional tails', fn: testExampleBlockIncludesOptionalTails },
];

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
