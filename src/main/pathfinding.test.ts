/**
 * Verification for partitionPathByTurn essential contracts.
 * Run with: node dist/pathfinding.test.js
 */

import * as assert from 'assert';
import { partitionPathByTurn } from './pathfinding';

/**
 * Defines the `testSingleStepInfantry` function shape (function testSingleStepInfantry(): void).

 * Purpose: Supports maintainability by documenting why `testSingleStepInfantry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSingleStepInfantry(): void {
  const path = ['A', 'B'];
  const segments = partitionPathByTurn(path, 1);
  assert.strictEqual(segments.length, 1, 'should be exactly 1 turn');
  assert.deepStrictEqual(segments[0]!.hexes, ['A', 'B']);
  assert.strictEqual(segments[0]!.movementSpent, 1);
  assert.strictEqual(segments[0]!.endHex, 'B');
  assert.strictEqual(segments[0]!.turn, 1);
}

/**
 * Defines the `testMultiTurnInfantry` function shape (function testMultiTurnInfantry(): void).

 * Purpose: Supports maintainability by documenting why `testMultiTurnInfantry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testMultiTurnArmor` function shape (function testMultiTurnArmor(): void).

 * Purpose: Supports maintainability by documenting why `testMultiTurnArmor` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testMultiTurnArmor(): void {
  const path = ['A', 'B', 'C', 'D', 'E'];
  const segments = partitionPathByTurn(path, 2);
  assert.strictEqual(segments.length, 2, 'armor should need 2 turns for 4 edges with budget 2');
  assert.deepStrictEqual(segments[0]!.hexes, ['A', 'B', 'C']);
  assert.strictEqual(segments[0]!.movementSpent, 2);
  assert.deepStrictEqual(segments[1]!.hexes, ['C', 'D', 'E']);
  assert.strictEqual(segments[1]!.movementSpent, 2);
}

/**
 * Defines the `testHexContinuity` function shape (function testHexContinuity(): void).

 * Purpose: Supports maintainability by documenting why `testHexContinuity` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testSingleHexReturnsEmpty` function shape (function testSingleHexReturnsEmpty(): void).

 * Purpose: Supports maintainability by documenting why `testSingleHexReturnsEmpty` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSingleHexReturnsEmpty(): void {
  assert.deepStrictEqual(partitionPathByTurn(['A'], 2), []);
}

/**
 * Defines the `testEmptyPathReturnsEmpty` function shape (function testEmptyPathReturnsEmpty(): void).

 * Purpose: Supports maintainability by documenting why `testEmptyPathReturnsEmpty` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testEmptyPathReturnsEmpty(): void {
  assert.deepStrictEqual(partitionPathByTurn([], 2), []);
}

/**
 * Defines the `testNoZeroMovementSegments` function shape (function testNoZeroMovementSegments(): void).

 * Purpose: Supports maintainability by documenting why `testNoZeroMovementSegments` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNoZeroMovementSegments(): void {
  const path = ['A', 'B', 'C', 'D'];
  const segments = partitionPathByTurn(path, 1);
  for (const seg of segments) {
    assert.ok(seg.movementSpent > 0, `turn ${seg.turn} should not have zero movementSpent`);
  }
}

/**
 * Defines the `testExactBudgetMatch` function shape (function testExactBudgetMatch(): void).

 * Purpose: Supports maintainability by documenting why `testExactBudgetMatch` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testExactBudgetMatch(): void {
  const path = ['A', 'B', 'C', 'D'];
  const segments = partitionPathByTurn(path, 3);
  assert.strictEqual(segments.length, 1, 'should complete in exactly 1 turn');
  assert.deepStrictEqual(segments[0]!.hexes, ['A', 'B', 'C', 'D']);
  assert.strictEqual(segments[0]!.movementSpent, 3);
}

/**
 * Guards first-turn egress then later sailing budget on a 4-edge path.
 *
 * Purpose: Land-seaport voyages must not treat every turn as a single step, and must not spend a full
 * naval budget on the egress turn.
 * When to use: After changes to `partitionPathByTurn`'s optional first-turn cap.
 * Expected outcome: 3 segments for 4 edges with first budget 1 and later budget 2: 1 + 2 + 1 steps.
 * Exceptions: None.
 */
function testFirstTurnEgressThenSailingBudget(): void {
  const path = ['PORT', 'W1', 'W2', 'W3', 'W4'];
  const segments = partitionPathByTurn(path, 2, 1);
  assert.strictEqual(segments.length, 3);
  assert.deepStrictEqual(segments[0]!.hexes, ['PORT', 'W1']);
  assert.strictEqual(segments[0]!.movementSpent, 1);
  assert.strictEqual(segments[0]!.movementBudget, 1);
  assert.deepStrictEqual(segments[1]!.hexes, ['W1', 'W2', 'W3']);
  assert.strictEqual(segments[1]!.movementSpent, 2);
  assert.strictEqual(segments[1]!.movementBudget, 2);
  assert.deepStrictEqual(segments[2]!.hexes, ['W3', 'W4']);
  assert.strictEqual(segments[2]!.movementSpent, 1);
  assert.strictEqual(segments[2]!.endHex, 'W4');
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testSingleStepInfantry();
  testMultiTurnInfantry();
  testMultiTurnArmor();
  testHexContinuity();
  testSingleHexReturnsEmpty();
  testEmptyPathReturnsEmpty();
  testNoZeroMovementSegments();
  testExactBudgetMatch();
  testFirstTurnEgressThenSailingBudget();
  console.log('pathfinding tests passed');
}

run();
