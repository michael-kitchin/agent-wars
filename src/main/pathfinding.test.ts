/**
 * Verification for partitionPathByTurn essential contracts.
 * Run with: node dist/pathfinding.test.js
 */

import * as assert from 'assert';
import { partitionPathByTurn } from './pathfinding';

/** Single-turn path: infantry (budget 1) moving 1 hex produces one segment. */
function testSingleStepInfantry(): void {
  const path = ['A', 'B'];
  const segments = partitionPathByTurn(path, 1);
  assert.strictEqual(segments.length, 1, 'should be exactly 1 turn');
  assert.deepStrictEqual(segments[0]!.hexes, ['A', 'B']);
  assert.strictEqual(segments[0]!.movementSpent, 1);
  assert.strictEqual(segments[0]!.endHex, 'B');
  assert.strictEqual(segments[0]!.turn, 1);
}

/** Multi-turn path: infantry (budget 1) over 4 hexes needs 3 turns (3 edges). */
function testMultiTurnInfantry(): void {
  const path = ['A', 'B', 'C', 'D'];
  const segments = partitionPathByTurn(path, 1);
  assert.strictEqual(segments.length, 3, 'infantry should need 3 turns for 3 edges');
  assert.deepStrictEqual(segments[0]!.hexes, ['A', 'B']);
  assert.deepStrictEqual(segments[1]!.hexes, ['B', 'C']);
  assert.deepStrictEqual(segments[2]!.hexes, ['C', 'D']);
  assert.strictEqual(segments[0]!.endHex, 'B');
  assert.strictEqual(segments[1]!.endHex, 'C');
  assert.strictEqual(segments[2]!.endHex, 'D');
}

/** Multi-turn path: armor (budget 2) over 5 hexes needs 2 turns. */
function testMultiTurnArmor(): void {
  const path = ['A', 'B', 'C', 'D', 'E'];
  const segments = partitionPathByTurn(path, 2);
  assert.strictEqual(segments.length, 2, 'armor should need 2 turns for 4 edges with budget 2');
  assert.deepStrictEqual(segments[0]!.hexes, ['A', 'B', 'C']);
  assert.strictEqual(segments[0]!.movementSpent, 2);
  assert.deepStrictEqual(segments[1]!.hexes, ['C', 'D', 'E']);
  assert.strictEqual(segments[1]!.movementSpent, 2);
}

/** Hex continuity: each turn starts where the previous turn ended. */
function testHexContinuity(): void {
  const path = ['A', 'B', 'C', 'D', 'E', 'F'];
  const segments = partitionPathByTurn(path, 2);
  for (let i = 1; i < segments.length; i++) {
    assert.strictEqual(
      segments[i]!.hexes[0],
      segments[i - 1]!.endHex,
      `turn ${i + 1} should start at turn ${i}'s endHex`
    );
  }
}

/** Edge case: path with only the origin (length 1) returns no segments. */
function testSingleHexReturnsEmpty(): void {
  assert.deepStrictEqual(partitionPathByTurn(['A'], 2), []);
}

/** Edge case: empty path returns no segments. */
function testEmptyPathReturnsEmpty(): void {
  assert.deepStrictEqual(partitionPathByTurn([], 2), []);
}

/** No zero-movement segments: every segment should have movementSpent > 0. */
function testNoZeroMovementSegments(): void {
  const path = ['A', 'B', 'C', 'D'];
  const segments = partitionPathByTurn(path, 1);
  for (const seg of segments) {
    assert.ok(seg.movementSpent > 0, `turn ${seg.turn} should not have zero movementSpent`);
  }
}

/** Armor with exact budget match: 3 edges with budget 3 = 1 turn. */
function testExactBudgetMatch(): void {
  const path = ['A', 'B', 'C', 'D'];
  const segments = partitionPathByTurn(path, 3);
  assert.strictEqual(segments.length, 1, 'should complete in exactly 1 turn');
  assert.deepStrictEqual(segments[0]!.hexes, ['A', 'B', 'C', 'D']);
  assert.strictEqual(segments[0]!.movementSpent, 3);
}

function run(): void {
  testSingleStepInfantry();
  testMultiTurnInfantry();
  testMultiTurnArmor();
  testHexContinuity();
  testSingleHexReturnsEmpty();
  testEmptyPathReturnsEmpty();
  testNoZeroMovementSegments();
  testExactBudgetMatch();
  console.log('pathfinding tests passed');
}

run();
