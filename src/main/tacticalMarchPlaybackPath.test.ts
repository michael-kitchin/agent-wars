/**
 * Tests tactical march playback path clipping and planner prefix shape.
 *
 * Purpose: Covers `clipTacticalMarchPathToDestination` and multi-vertex `pathH3Prefix` from `tacticalMarchFirstStopAlongPath`.
 * When to use: `npm test` after edits to tactical commit playback or shared march helpers.
 * Expected outcome: Clip obeys destination index; planner yields ≥3 vertices on a long footprint with a short MP budget.
 * Exceptions: Assertion failures if H3 fixtures or march costs drift.
 */

import assert from 'node:assert/strict';
import { gridDisk, gridPathCells } from 'h3-js';
import { clipTacticalMarchPathToDestination } from '../shared/tacticalMarchPlaybackPath.js';
import { tacticalMarchFirstStopAlongPath } from './tacticalBattle/tacticalRulesAdapter.js';
import { tacticalCell, firstRingCellDistinctFrom } from './tacticalBattle/testSupport/tacticalHexFixtures.js';

/**
 * Documents the function binding `testClipTruncatesToDestination` (testClipTruncatesToDestination).
 *
 * Purpose: Ensures playback paths end at the committed stop cell when the planner prefix runs past it.
 * When to use: Regression for `clipTacticalMarchPathToDestination`.
 * Expected outcome: Suffix after destination is removed.
 * Exceptions: None.
 */
function testClipTruncatesToDestination(): void {
  const clipped = clipTacticalMarchPathToDestination('c', ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(clipped, ['a', 'b', 'c']);
}

/**
 * Documents the function binding `testClipUndefinedWhenTooShort` (testClipUndefinedWhenTooShort).
 *
 * Purpose: Contract for unusable prefixes (too few vertices or missing input).
 * When to use: Same helper as `testClipTruncatesToDestination`.
 * Expected outcome: `undefined` when clip cannot form a valid polyline.
 * Exceptions: None.
 */
function testClipUndefinedWhenTooShort(): void {
  assert.strictEqual(clipTacticalMarchPathToDestination('x', ['a']), undefined);
  assert.strictEqual(clipTacticalMarchPathToDestination('x', undefined), undefined);
}

/**
 * Documents the function binding `testMarchFirstStopPrefixHasMultipleVertices` (testMarchFirstStopPrefixHasMultipleVertices).
 *
 * Purpose: Locks playback `pathH3Indexes` shape for bent tactical marches (not a single chord).
 * When to use: Regression after edits to march planning or commit playback assembly.
 * Expected outcome: `pathH3Prefix` length ≥ 3 when two budgeted steps lie on a ≥3-cell grid path inside the footprint.
 * Exceptions: Assertion failure if H3 geometry assumptions drift.
 */
function testMarchFirstStopPrefixHasMultipleVertices(): void {
  const a = tacticalCell(46, 58);
  const ring = [...gridDisk(a, 3)];
  let chain: string[] = [];
  for (const h of ring) {
    if (h === a) continue;
    try {
      const c = gridPathCells(a, h);
      if (c.length > chain.length) chain = c;
    } catch {
      /* skip invalid pairs */
    }
  }
  assert.ok(chain.length >= 4, `expected long enough test chain from gridDisk(3), got ${chain.length}`);
  const tacticalSet = new Set(chain);
  const goal = chain[chain.length - 1]!;
  const r = tacticalMarchFirstStopAlongPath(a, goal, 2, tacticalSet, undefined, 'infantry');
  assert.ok(r.pathH3Prefix && r.pathH3Prefix.length >= 3, `expected path prefix, got ${r.pathH3Prefix?.length}`);
  assert.strictEqual(r.pathH3Prefix![0], a);
  assert.ok(r.pathH3Prefix!.includes(r.stopH3));
  const playback = clipTacticalMarchPathToDestination(r.stopH3, r.pathH3Prefix);
  assert.ok(playback && playback.length >= 3);
}

/**
 * Documents the function binding `testTwoCellPrefixAfterClip` (testTwoCellPrefixAfterClip).
 *
 * Purpose: Happy path for minimal `pathH3Indexes` contract.
 * When to use: Same module as other tactical playback path tests.
 * Expected outcome: Two-cell prefix from center to ring-1 neighbor.
 * Exceptions: None.
 */
function testTwoCellPrefixAfterClip(): void {
  const center = tacticalCell(45, 57);
  const neighbor = firstRingCellDistinctFrom(center);
  const tacticalSet = new Set([center, neighbor]);
  const r = tacticalMarchFirstStopAlongPath(center, neighbor, 4, tacticalSet, undefined, 'infantry');
  const playback = clipTacticalMarchPathToDestination(r.stopH3, r.pathH3Prefix);
  assert.ok(playback && playback.length === 2);
  assert.strictEqual(playback![0], center);
  assert.strictEqual(playback![1], neighbor);
}

/**
 * Documents the function binding `main` (main).
 *
 * Purpose: Runs this file's tests when executed as a Node script.
 * When to use: `node dist/main/tacticalMarchPlaybackPath.test.js`.
 * Expected outcome: All assertions pass; prints success line.
 * Exceptions: Propagates assertion errors.
 */
function main(): void {
  testClipTruncatesToDestination();
  testClipUndefinedWhenTooShort();
  testMarchFirstStopPrefixHasMultipleVertices();
  testTwoCellPrefixAfterClip();
  console.log('tacticalMarchPlaybackPath tests passed');
}

main();
