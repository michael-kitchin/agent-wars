/**
 * Contract tests for union hex perimeter loop construction.
 */

import * as assert from 'assert';
import { gridDisk } from 'h3-js';
import { computeUnionPerimeterLoops } from '../shared/rangePerimeterGeometry';

const ORIGIN = '81283ffffffffff';

/**
 * Defines the `testEmptySetReturnsNoLoops` function shape (function testEmptySetReturnsNoLoops(): void).
 *
 * Purpose: Guards empty-input behavior for perimeter loop construction.
 * When to use: Regression test for `computeUnionPerimeterLoops`.
 * Expected outcome: Returns an empty array.
 * Exceptions: None.
 */
function testEmptySetReturnsNoLoops(): void {
  assert.deepStrictEqual(computeUnionPerimeterLoops(new Set()), []);
}

/**
 * Defines the `testSingleHexProducesOneLoop` function shape (function testSingleHexProducesOneLoop(): void).
 *
 * Purpose: Verifies a lone hex yields one closed perimeter loop.
 * When to use: Regression test for `computeUnionPerimeterLoops`.
 * Expected outcome: Exactly one loop with at least six vertices.
 * Exceptions: None.
 */
function testSingleHexProducesOneLoop(): void {
  const loops = computeUnionPerimeterLoops(new Set([ORIGIN]));
  assert.strictEqual(loops.length, 1);
  assert.ok(loops[0]!.length >= 6);
}

/**
 * Defines the `testAdjacentHexesMergeToOneLoop` function shape (function testAdjacentHexesMergeToOneLoop(): void).
 *
 * Purpose: Verifies shared interior edges are omitted so neighbors merge into one outline.
 * When to use: Regression test for `computeUnionPerimeterLoops`.
 * Expected outcome: One loop for two adjacent cells in a `gridDisk` of radius 1.
 * Exceptions: None.
 */
function testAdjacentHexesMergeToOneLoop(): void {
  const disk1 = [...gridDisk(ORIGIN, 1)];
  const neighbor = disk1.find((h) => h !== ORIGIN);
  assert.ok(neighbor);
  const loops = computeUnionPerimeterLoops(new Set([ORIGIN, neighbor!]));
  assert.strictEqual(loops.length, 1);
  assert.ok(loops[0]!.length >= 6);
}

/**
 * Defines the `testDisjointHexesProduceTwoLoops` function shape (function testDisjointHexesProduceTwoLoops(): void).
 *
 * Purpose: Verifies disconnected hex sets produce separate perimeter loops.
 * When to use: Regression test for `computeUnionPerimeterLoops`.
 * Expected outcome: Two loops when two cells are five grid steps apart.
 * Exceptions: None.
 */
function testDisjointHexesProduceTwoLoops(): void {
  const disk = [...gridDisk(ORIGIN, 5)];
  const far = disk[disk.length - 1]!;
  assert.notStrictEqual(far, ORIGIN);
  const loops = computeUnionPerimeterLoops(new Set([ORIGIN, far]));
  assert.strictEqual(loops.length, 2);
}

/**
 * Documents the module-scope binding `tests` (tests).
 *
 * Purpose: Ordered test cases for `computeUnionPerimeterLoops` contract checks.
 * When to use: This file's `run` entrypoint.
 * Expected outcome: Each entry has a `name` and zero-arg `fn`.
 * Exceptions: None.
 */
const tests = [
  { name: 'empty set returns no loops', fn: testEmptySetReturnsNoLoops },
  { name: 'single hex produces one loop', fn: testSingleHexProducesOneLoop },
  { name: 'adjacent hexes merge to one loop', fn: testAdjacentHexesMergeToOneLoop },
  { name: 'disjoint hexes produce two loops', fn: testDisjointHexesProduceTwoLoops },
];

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
