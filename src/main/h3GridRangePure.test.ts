/**
 * Contract tests for memoized pure H3 grid distance helpers.
 *
 * Purpose: Guards equivalence between cached and uncached `computeGridDistancePure` results.
 * When to use: Run via `npm test` after changes to `h3GridRangePure` memoization.
 * Expected outcome: Self-distance, in-range, and out-of-range pairs match direct H3 calls.
 * Exceptions: Skips sample pairs where H3 throws.
 */

import * as assert from 'assert';
import { cellToChildren, cellToParent, getPentagons, getRes0Cells, gridDisk, gridDistance, gridPathCells } from 'h3-js';
import {
  clearGridFallbackSearchesForTests,
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
/**
 * Finds one resolution-1 origin with at least five destinations H3 cannot measure directly.
 *
 * Purpose: The distance search is what strategic scans use when `gridDistance` and `gridPathCells` both fail.
 * When to use: The query-order contract in this file.
 * Expected outcome: An origin and five destinations. Destinations come from other resolution-0 parents, and at most 200 are tried per origin.
 * Exceptions: Fails the assertion when no such origin exists.
 */
function strategicFaceCrossingSample(): { origin: string; destinations: string[] } {
  const byParent = getRes0Cells().map((parent) => cellToChildren(parent, 1));
  for (let parentIndex = 0; parentIndex < byParent.length; parentIndex += 1) {
    const others = byParent.filter((_, index) => index !== parentIndex).flat();
    for (const origin of byParent[parentIndex] ?? []) {
      const destinations: string[] = [];
      let checked = 0;
      for (const destination of others) {
        checked += 1;
        if (checked > 200) break;
        if (computeGridDistancePure(origin, destination) !== null) continue;
        destinations.push(destination);
        if (destinations.length >= 5) return { origin, destinations };
      }
    }
  }
  assert.fail('expected a resolution-1 origin with five unmeasurable destinations');
}

/**
 * The per-origin distance search matches an independent path, in either query order.
 *
 * Purpose: Resuming a search must not depend on which destination was asked first.
 * When to use: After changing `computeGridDistanceWithPathFallbackPure`.
 * Expected outcome: Nearest-first and farthest-first both equal the path length minus one.
 * Exceptions: None. A null path expects a null distance.
 */
function testFallbackDistanceAgreesAcrossQueryOrder(): void {
  const { origin, destinations } = strategicFaceCrossingSample();
  const oracle = destinations.map((destination) => {
    const path = computeGridPathCellsPure(origin, destination);
    return path === null ? null : path.length - 1;
  });
  const ordered = destinations
    .map((destination, index) => ({ destination, distance: oracle[index] ?? Number.MAX_SAFE_INTEGER }))
    .sort((left, right) => left.distance - right.distance || (left.destination < right.destination ? -1 : 1));
  const expected = ordered.map((row) => (row.distance === Number.MAX_SAFE_INTEGER ? null : row.distance));
  clearGridFallbackSearchesForTests();
  const nearestFirst = ordered.map((row) => computeGridDistanceWithPathFallbackPure(origin, row.destination));
  clearGridFallbackSearchesForTests();
  const farthestFirst = [...ordered]
    .reverse()
    .map((row) => computeGridDistanceWithPathFallbackPure(origin, row.destination))
    .reverse();
  assert.deepStrictEqual(nearestFirst, expected);
  assert.deepStrictEqual(farthestFirst, expected);
}

/**
 * The memoized disk fallback answers the same as a fresh `gridDisk` for pairs H3 cannot measure.
 *
 * Purpose: `isWithinGridRangePure` caches the fallback disk per origin and range, and a cached answer must never differ.
 * When to use: After changing the disk fallback in `isWithinGridRangePure`.
 * Expected outcome: A near face-crossing pair and far unmeasurable pairs match fresh `gridDisk` membership, on the first and the repeated call.
 * Exceptions: Skips a range whose fresh `gridDisk` throws.
 */
function testDiskFallbackMemoMatchesFreshDisk(): void {
  const [crossFrom, crossTo] = tacticalPairWhereGridPathCellsThrows();
  const path = computeGridPathCellsPure(crossFrom, crossTo);
  assert.ok(path !== null);
  const { origin, destinations } = strategicFaceCrossingSample();
  const cases: Array<[string, string, number]> = [
    [crossFrom, crossTo, path!.length - 1],
    [crossFrom, crossTo, 0],
    ...destinations.flatMap((destination): Array<[string, string, number]> => [[origin, destination, 3], [origin, destination, 4]]),
  ];
  for (const [from, to, range] of cases) {
    assert.strictEqual(computeGridDistancePure(from, to), null, 'fixture must be an unmeasurable pair');
    let fresh: boolean;
    try {
      fresh = gridDisk(from, range).includes(to);
    } catch {
      continue;
    }
    assert.strictEqual(isWithinGridRangePure(from, to, range), fresh);
    assert.strictEqual(isWithinGridRangePure(from, to, range), fresh, 'second call must hit the disk memo');
  }
}

/**
 * Answers stay correct after the disk fallback memo evicts for its cell budget.
 *
 * Purpose: Large disks force eviction, and a miscounted budget could keep a stale disk or drop the one just built.
 * When to use: After changing the fallback disk eviction in `h3GridRangePure`.
 * Expected outcome: Every unmeasurable resolution-1 pair tested at range 25 matches fresh `gridDisk` membership, including
 *   the earliest origins after later ones pushed the stored cells past the budget.
 * Exceptions: Skips an origin with no unmeasurable destination among the cells tried.
 */
function testDiskFallbackStaysCorrectAfterEviction(): void {
  const cells = getRes0Cells().flatMap((parent) => cellToChildren(parent, 1));
  const range = 25;
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < cells.length && pairs.length < 150; i += 5) {
    const origin = cells[i]!;
    const destination = cells.find((cell) => computeGridDistancePure(origin, cell) === null);
    if (destination !== undefined) pairs.push([origin, destination]);
  }
  assert.ok(pairs.length * gridDisk(pairs[0]![0], range).length > 200_000, 'the sample must exceed the cell budget');
  const expected = pairs.map(([origin, destination]) => gridDisk(origin, range).includes(destination));
  const first = pairs.map(([origin, destination]) => isWithinGridRangePure(origin, destination, range));
  const again = pairs.map(([origin, destination]) => isWithinGridRangePure(origin, destination, range));
  assert.deepStrictEqual(first, expected);
  assert.deepStrictEqual(again, expected);
}

const tests = [
  { name: 'computeGridDistancePure memo matches direct H3', fn: testComputeGridDistancePureMatchesDirectH3 },
  { name: 'the disk fallback memo matches a fresh gridDisk', fn: testDiskFallbackMemoMatchesFreshDisk },
  { name: 'the disk fallback stays correct after eviction', fn: testDiskFallbackStaysCorrectAfterEviction },
  { name: 'computeGridPathCellsPure covers face crossings', fn: testComputeGridPathCellsPureCoversFaceCrossings },
  { name: 'face-crossing distance agrees in either query order', fn: testFallbackDistanceAgreesAcrossQueryOrder },
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
