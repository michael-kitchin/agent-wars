/**
 * Contract tests for memoized pure H3 grid distance helpers.
 *
 * Purpose: Guards equivalence between cached and uncached `computeGridDistancePure` results.
 * When to use: Run via `npm test` after changes to `h3GridRangePure` memoization.
 * Expected outcome: Self-distance, in-range, and out-of-range pairs match direct H3 calls.
 * Exceptions: Skips sample pairs where H3 throws.
 */

import * as assert from 'assert';
import { gridDistance } from 'h3-js';
import { computeGridDistancePure, isWithinGridRangePure } from '../shared/h3GridRangePure';

/**
 * Defines the `testComputeGridDistancePureMatchesDirectH3` function shape (function testComputeGridDistancePureMatchesDirectH3(): void).

 * Purpose: Ensures memoized distance results match uncached H3 for representative pairs.
 * When to use: After changes to `computeGridDistancePure` caching.
 * Expected outcome: Self-distance is 0; in-range and out-of-range pairs match direct `gridDistance`.
 * Exceptions: Skips pairs where H3 throws (pentagon edge cases).
 */
function testComputeGridDistancePureMatchesDirectH3(): void {
  const origin = '81283ffffffffff';
  assert.strictEqual(computeGridDistancePure(origin, origin), 0);
  assert.strictEqual(isWithinGridRangePure(origin, origin, 3), true);

  const samples = ['81293ffffffffff', '8128bffffffffff', '81297ffffffffff'];
  for (const dest of samples) {
    let expected: number;
    try {
      expected = gridDistance(origin, dest);
    } catch {
      continue;
    }
    assert.strictEqual(computeGridDistancePure(origin, dest), expected);
    assert.strictEqual(computeGridDistancePure(origin, dest), expected, 'second call must hit memo');
    assert.strictEqual(isWithinGridRangePure(origin, dest, expected), true);
    assert.strictEqual(isWithinGridRangePure(origin, dest, Math.max(0, expected - 1)), expected <= 0);
  }
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Declares the ordered test cases executed by this file's `run` entrypoint.
 * When to use: Extend when adding new grid-range memo contract assertions.
 * Expected outcome: Each entry has a `name` and zero-arg `fn`.
 * Exceptions: None.
 */
const tests = [{ name: 'computeGridDistancePure memo matches direct H3', fn: testComputeGridDistancePureMatchesDirectH3 }];

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Executes this module's tests in declaration order for Node's direct execution model.
 * When to use: Default entry when running `node dist/main/h3GridRangePure.test.js`.
 * Expected outcome: All tests pass and print OK lines.
 * Exceptions: Sets `process.exitCode` on failure.
 */
function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exitCode = 1;
    }
  }
}

run();
