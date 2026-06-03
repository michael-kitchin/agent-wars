/**
 * Tests for shared march path tail resolution. Run with: node dist/main/marchPathUtils.test.js
 */

import assert from 'node:assert/strict';
import { findPathTailFromCurrentPosition } from '../shared/marchPathUtils';

/**
 * Verifies that a current cell matching the path head returns the full stored path.
 *
 * Purpose: Guards the common case where the unit has not yet moved along a committed route.
 * When to use: Run after changing `findPathTailFromCurrentPosition` tail resolution logic.
 * Expected outcome: The returned array is identical to the stored path reference content.
 * Exceptions: None.
 */
function testHeadMatchReturnsFullPath(): void {
  const path = ['a', 'b', 'c'];
  assert.deepStrictEqual(findPathTailFromCurrentPosition(path, 'a'), path);
}

/**
 * Verifies that a current cell mid-path returns the suffix starting at that cell.
 *
 * Purpose: Protects beat-to-beat tactical march overlay reuse after partial movement.
 * When to use: Run after changing path-tail lookup or continuation row construction.
 * Expected outcome: Returns `['c', 'd']` when current cell is `'c'` in `['a','b','c','d']`.
 * Exceptions: None.
 */
function testMidPathMatchReturnsTail(): void {
  const path = ['a', 'b', 'c', 'd'];
  assert.deepStrictEqual(findPathTailFromCurrentPosition(path, 'c'), ['c', 'd']);
}

/**
 * Verifies that a current cell not on the stored path yields null.
 *
 * Purpose: Ensures off-path units fall back to fresh route planning instead of stale overlays.
 * When to use: Run after changing path validation for strategic or tactical cache reuse.
 * Expected outcome: Returns `null` when the current H3 is absent from the stored path.
 * Exceptions: None.
 */
function testOffPathReturnsNull(): void {
  assert.strictEqual(findPathTailFromCurrentPosition(['a', 'b'], 'z'), null);
}

/**
 * Verifies that an empty stored path yields null regardless of current cell.
 *
 * Purpose: Prevents accidental reuse of degenerate path data in renderer and IPC layers.
 * When to use: Run after changing callers that may pass optional or cleared path arrays.
 * Expected outcome: Returns `null` for any current H3 when the stored path length is zero.
 * Exceptions: None.
 */
function testEmptyPathReturnsNull(): void {
  assert.strictEqual(findPathTailFromCurrentPosition([], 'a'), null);
}

/**
 * Runs all march path utility tests in declaration order.
 *
 * Purpose: Single entrypoint for the Node test runner manifest.
 * When to use: Invoked at module load by `node dist/main/marchPathUtils.test.js`.
 * Expected outcome: Throws on first assertion failure; logs pass message when all cases succeed.
 * Exceptions: Propagates assertion errors from individual test cases.
 */
function run(): void {
  testHeadMatchReturnsFullPath();
  testMidPathMatchReturnsTail();
  testOffPathReturnsNull();
  testEmptyPathReturnsNull();
  console.log('marchPathUtils.test.ts passed');
}

run();
