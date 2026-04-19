/**
 * Unit tests for res4 transport chord inference (`src/shared/res4TransportChordGeometry.ts`).
 */

import * as assert from 'assert';
import {
  buildTransportChordSegments,
  pairTransportMaskSides,
  ringStepDistanceBetweenSlots,
  transportActiveSideIndices,
} from '../shared/res4TransportChordGeometry';

/** Full circle radians for synthetic pentagon vertex layout in `testBuildPentagonMask`. */
const TWO_PI = Math.PI * 2;

/**
 * Defines the `testRingStepDistance` function shape (function testRingStepDistance(): void).

 * Purpose: Locks shortest ring distance used for farthest-side pairing on a hex.
 * When to use: `npm test` after `tsc -p tsconfig.main.json`.
 * Expected outcome: Opposite slots on n=6 report distance 3; adjacent report 1.
 * Exceptions: None.
 */
function testRingStepDistance(): void {
  assert.strictEqual(ringStepDistanceBetweenSlots(0, 3, 6), 3);
  assert.strictEqual(ringStepDistanceBetweenSlots(0, 1, 6), 1);
  assert.strictEqual(ringStepDistanceBetweenSlots(5, 0, 6), 1);
}

/**
 * Defines the `testPairThreeActives` function shape (function testPairThreeActives(): void).

 * Purpose: Validates one chord + one leftover for three active sides on a hex.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Pair maximizes ring distance; leftover is the unpaired slot.
 * Exceptions: None.
 */
function testPairThreeActives(): void {
  const { pairs, leftover } = pairTransportMaskSides([0, 1, 2], 6);
  assert.strictEqual(pairs.length, 1);
  assert.deepStrictEqual(pairs[0], [0, 2]);
  assert.strictEqual(leftover, 1);
}

/**
 * Defines the `testPairFourActives` function shape (function testPairFourActives(): void).

 * Purpose: Two disjoint chords when four sides are active.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Two pairs, no leftover.
 * Exceptions: None.
 */
function testPairFourActives(): void {
  const { pairs, leftover } = pairTransportMaskSides([0, 1, 2, 3], 6);
  assert.strictEqual(pairs.length, 2);
  assert.strictEqual(leftover, null);
  const flat = pairs.flat().sort((a, b) => a - b);
  assert.deepStrictEqual(flat, [0, 1, 2, 3]);
}

/**
 * Defines the `testBuildEmptyMask` function shape (function testBuildEmptyMask(): void).

 * Purpose: Essential guard when no transport touches a hex edge in the mask.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Empty segment list.
 * Exceptions: None.
 */
function testBuildEmptyMask(): void {
  const n = 6;
  const order = [0, 1, 2, 3, 4, 5];
  const pts = Array.from({ length: n }, (_, i) => ({
    x: 10 * Math.cos((i * Math.PI) / 3),
    y: 10 * Math.sin((i * Math.PI) / 3),
  }));
  const centroid = { x: 0, y: 0 };
  const segs = buildTransportChordSegments([false, false, false, false, false, false], order, pts, centroid);
  assert.strictEqual(segs.length, 0);
}

/**
 * Defines the `testBuildSingleSpur` function shape (function testBuildSingleSpur(): void).

 * Purpose: One active side yields a short inward spur, not a chord.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Single segment with `isSpur` true.
 * Exceptions: None.
 */
function testBuildSingleSpur(): void {
  const n = 6;
  const order = [0, 1, 2, 3, 4, 5];
  const pts = Array.from({ length: n }, (_, i) => ({
    x: 10 * Math.cos((i * Math.PI) / 3),
    y: 10 * Math.sin((i * Math.PI) / 3),
  }));
  const centroid = { x: 0, y: 0 };
  const mask = [true, false, false, false, false, false];
  const segs = buildTransportChordSegments(mask, order, pts, centroid);
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segs[0]!.isSpur, true);
}

/**
 * Defines the `testTransportActiveSideIndices` function shape (function testTransportActiveSideIndices(): void).

 * Purpose: Stable ascending slot list for pairing.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Only true slots appear, sorted ascending.
 * Exceptions: None.
 */
function testTransportActiveSideIndices(): void {
  assert.deepStrictEqual(transportActiveSideIndices([true, false, true, false, false, false]), [0, 2]);
}

/**
 * Defines the `testPairTieBreakLowerIndex` function shape (function testPairTieBreakLowerIndex(): void).

 * Purpose: When two candidates share the same ring distance from anchor `a`, the lower slot index wins.
 * When to use: `npm test` main-process suite.
 * Expected outcome: First pair uses the smallest eligible `b`.
 * Exceptions: None.
 */
function testPairTieBreakLowerIndex(): void {
  const { pairs, leftover } = pairTransportMaskSides([0, 2, 4], 6);
  assert.strictEqual(pairs.length, 1);
  assert.deepStrictEqual(pairs[0], [0, 2]);
  assert.strictEqual(leftover, 4);
}

/**
 * Defines the `testBuildTwoOppositeChords` function shape (function testBuildTwoOppositeChords(): void).

 * Purpose: Two active opposite sides yield one chord with no spur.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Single segment, `isSpur` false.
 * Exceptions: None.
 */
function testBuildTwoOppositeChords(): void {
  const n = 6;
  const order = [0, 1, 2, 3, 4, 5];
  const pts = Array.from({ length: n }, (_, i) => ({
    x: 10 * Math.cos((i * Math.PI) / 3),
    y: 10 * Math.sin((i * Math.PI) / 3),
  }));
  const centroid = { x: 0, y: 0 };
  const mask = [true, false, false, true, false, false];
  const segs = buildTransportChordSegments(mask, order, pts, centroid);
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segs[0]!.isSpur, false);
}

/**
 * Defines the `testBuildSixActivesThreeChords` function shape (function testBuildSixActivesThreeChords(): void).

 * Purpose: Full ring of active sides pairs into three disjoint chords with no spur.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Three segments, all non-spur.
 * Exceptions: None.
 */
function testBuildSixActivesThreeChords(): void {
  const n = 6;
  const order = [0, 1, 2, 3, 4, 5];
  const pts = Array.from({ length: n }, (_, i) => ({
    x: 10 * Math.cos((i * Math.PI) / 3),
    y: 10 * Math.sin((i * Math.PI) / 3),
  }));
  const centroid = { x: 0, y: 0 };
  const mask = [true, true, true, true, true, true];
  const segs = buildTransportChordSegments(mask, order, pts, centroid);
  assert.strictEqual(segs.length, 3);
  assert.strictEqual(segs.every((s) => !s.isSpur), true);
}

/**
 * Defines the `testBuildPentagonMask` function shape (function testBuildPentagonMask(): void).

 * Purpose: Confirms pairing works for res4 pentagon topology (`n === 5`) used by some cells.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Two opposite-ish pairings on five active sides yield two chords plus one spur.
 * Exceptions: None.
 */
function testBuildPentagonMask(): void {
  const n = 5;
  const order = [0, 1, 2, 3, 4];
  const pts = Array.from({ length: n }, (_, i) => ({
    x: 8 * Math.cos((i * TWO_PI) / n - Math.PI / 2),
    y: 8 * Math.sin((i * TWO_PI) / n - Math.PI / 2),
  }));
  const centroid = { x: 0, y: 0 };
  const mask = [true, true, true, true, true];
  const segs = buildTransportChordSegments(mask, order, pts, centroid);
  assert.strictEqual(segs.length, 3);
  assert.strictEqual(segs.filter((s) => s.isSpur).length, 1);
}

/**
 * Defines the `main` function shape (function main(): void).

 * Purpose: Runs chord geometry tests as a standalone Node entrypoint matching repo conventions.
 * When to use: Invoked from `npm test` after `tsc -p tsconfig.main.json`.
 * Expected outcome: Prints a success marker when every assertion passes.
 * Exceptions: Propagates assertion failures to the process exit code.
 */
function main(): void {
  testRingStepDistance();
  testPairThreeActives();
  testPairFourActives();
  testBuildEmptyMask();
  testBuildSingleSpur();
  testTransportActiveSideIndices();
  testPairTieBreakLowerIndex();
  testBuildTwoOppositeChords();
  testBuildSixActivesThreeChords();
  testBuildPentagonMask();
  console.log('res4TransportChordGeometry.test: ok');
}

main();
