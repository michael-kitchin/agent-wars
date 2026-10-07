/**
 * Contract tests for memoized pure H3 grid distance helpers.
 *
 * Purpose: Guards equivalence between cached and uncached `computeGridDistancePure` results.
 * When to use: Run via `npm test` after changes to `h3GridRangePure` memoization.
 * Expected outcome: Self-distance, in-range, and out-of-range pairs match direct H3 calls.
 * Exceptions: Skips sample pairs where H3 throws.
 */

import * as assert from 'assert';
import { cellToChildren, cellToParent, getPentagons, gridDistance, gridPathCells } from 'h3-js';
import {
  computeGridDistancePure,
  computeGridDistanceWithPathFallbackPure,
  computeGridPathCellsPure,
  isWithinGridRangePure,
} from '../shared/h3GridRangePure';

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
 * Finds two res-4 cells under one res-1 parent whose `gridPathCells` throws at an icosahedron face crossing.
 *
 * Purpose: The path fallback only matters for those pairs, and hard-coded H3 literals would stop demonstrating a
 * crossing if h3-js geometry shifted.
 * When to use: Path-fallback contract cases in this file.
 * Expected outcome: A pair where `gridPathCells` throws.
 * Exceptions: Fails the assertion when no such pair exists.
 */
function tacticalPairWhereGridPathCellsThrows(): [string, string] {
  for (const pentagon of getPentagons(4)) {
    const children = cellToChildren(cellToParent(pentagon, 1), 4);
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        try {
          gridPathCells(children[i]!, children[j]!);
        } catch {
          return [children[i]!, children[j]!];
        }
      }
    }
  }
  assert.fail('expected a res4 pair where gridPathCells throws');
}

/**
 * Verifies the BFS path fallback still returns a usable trace where H3's straight line fails.
 *
 * Purpose: Mountain line-of-sight and strategic move validation both scan this path; giving up on a crossing pair
 * rejected clear shots and legal moves.
 * When to use: After changing `computeGridPathCellsPure` or its depth cap.
 * Expected outcome: Straight-line pairs match `gridPathCells`; a throwing pair still yields an origin-to-destination
 * path of contiguous cells, and the derived distance agrees with its length.
 * Exceptions: None.
 */
function testComputeGridPathCellsPureCoversFaceCrossings(): void {
  const origin = '81283ffffffffff';
  assert.deepStrictEqual(computeGridPathCellsPure(origin, origin), [origin]);
  assert.strictEqual(computeGridDistanceWithPathFallbackPure(origin, origin), 0);

  const [crossFrom, crossTo] = tacticalPairWhereGridPathCellsThrows();
  assert.strictEqual(computeGridDistancePure(crossFrom, crossTo), null, 'fixture must be an unmeasurable pair');
  const path = computeGridPathCellsPure(crossFrom, crossTo);
  assert.ok(path !== null, 'face-crossing pair must still yield a path');
  assert.strictEqual(path![0], crossFrom);
  assert.strictEqual(path![path!.length - 1], crossTo);
  assert.strictEqual(
    computeGridDistanceWithPathFallbackPure(crossFrom, crossTo),
    path!.length - 1,
    'derived distance must match the returned path length'
  );
  assert.deepStrictEqual(computeGridPathCellsPure(crossFrom, crossTo), path, 'second call must hit the fallback memo');
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Declares the ordered test cases executed by this file's `run` entrypoint.
 * When to use: Extend when adding new grid-range memo contract assertions.
 * Expected outcome: Each entry has a `name` and zero-arg `fn`.
 * Exceptions: None.
 */
const tests = [
  { name: 'computeGridDistancePure memo matches direct H3', fn: testComputeGridDistancePureMatchesDirectH3 },
  { name: 'computeGridPathCellsPure covers face crossings', fn: testComputeGridPathCellsPureCoversFaceCrossings },
];

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
