/**
 * Verification for partitionPathByTurn essential contracts.
 * Run with: node dist/pathfinding.test.js
 */

import * as assert from 'assert';
import { gridDisk, gridDistance, latLngToCell } from 'h3-js';
import { findPath, getReachableHexes, partitionPathByTurn } from './pathfinding';
import { findGeodesicLandMassChain } from './testSupport/strategicLandChainFixtures';
import { getStrategicLandMassByH3 } from './terrainClassificationCache';

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
 * Water-domain hex set where every cell is passable water.
 *
 * Purpose: Gives `findPath` and `getReachableHexes` a domain with no land-mass fixture.
 * When to use: Characterization tests for the shared breadth-first walk.
 * Expected outcome: A set and terrain map covering exactly `cells`.
 * Exceptions: None.
 */
function waterHexWorld(cells: readonly string[]): { hexSet: Set<string>; terrainByH3: Map<string, string> } {
  return {
    hexSet: new Set(cells),
    terrainByH3: new Map(cells.map((cell) => [cell, 'water'])),
  };
}

/**
 * A fully passable water disk yields a neighbor-by-neighbor path of length `gridDistance + 1`.
 *
 * Purpose: Locks the water `findPath` contract before the search is shared.
 * When to use: From `run`.
 * Expected outcome: Path starts at the origin, ends at the destination, and each step is a grid neighbor.
 * Exceptions: Throws when the assertion fails.
 */
function testFindPathOnPassableWaterDisk(): void {
  const origin = latLngToCell(10, 10, 1);
  const cells = gridDisk(origin, 2);
  const destination = cells.find((cell) => gridDistance(origin, cell) === 2);
  assert.ok(destination);
  const { hexSet, terrainByH3 } = waterHexWorld(cells);
  const path = findPath(origin, destination, hexSet, terrainByH3, 'water');
  assert.ok(path);
  assert.strictEqual(path[0], origin);
  assert.strictEqual(path[path.length - 1], destination);
  assert.strictEqual(path.length, gridDistance(origin, destination) + 1);
  for (let i = 1; i < path.length; i += 1) {
    assert.ok(gridDisk(path[i - 1]!, 1).includes(path[i]!));
  }
}

/**
 * A blocked or off-map destination is not a path.
 *
 * Purpose: Locks the water `findPath` failure contract.
 * When to use: From `run`.
 * Expected outcome: `null` for both cases.
 * Exceptions: Throws when the assertion fails.
 */
function testFindPathRejectsBlockedOrMissingDestination(): void {
  const origin = latLngToCell(10, 10, 1);
  const cells = gridDisk(origin, 2);
  const destination = cells.find((cell) => gridDistance(origin, cell) === 2);
  assert.ok(destination);
  const { hexSet, terrainByH3 } = waterHexWorld(cells);
  assert.strictEqual(findPath(origin, destination, hexSet, terrainByH3, 'water', new Set([destination])), null);
  const outside = gridDisk(origin, 3).find((cell) => !hexSet.has(cell));
  assert.ok(outside);
  assert.strictEqual(findPath(origin, outside, hexSet, terrainByH3, 'water'), null);
}

/**
 * A radius-2 water disk is fully reachable, and a blocked cell is left out.
 *
 * Purpose: Locks the water `getReachableHexes` contract.
 * When to use: From `run`.
 * Expected outcome: 19 cells when open; the blocked cell is absent and the rest remain.
 * Exceptions: Throws when the assertion fails.
 */
function testReachableWaterDiskExcludesBlockedCell(): void {
  const origin = latLngToCell(10, 10, 1);
  const cells = gridDisk(origin, 2);
  assert.strictEqual(cells.length, 19);
  const { hexSet, terrainByH3 } = waterHexWorld(cells);
  const open = getReachableHexes(origin, hexSet, terrainByH3, 'water');
  assert.strictEqual(open.size, 19);
  for (const cell of cells) assert.ok(open.has(cell));
  const blocked = cells.find((cell) => cell !== origin);
  assert.ok(blocked);
  const partial = getReachableHexes(origin, hexSet, terrainByH3, 'water', new Set([blocked]));
  assert.strictEqual(partial.has(blocked), false);
  assert.strictEqual(partial.size, 18);
}

/**
 * Memo for `landChainWorld` so the three land cases share one map scan.
 *
 * Purpose: `findGeodesicLandMassChain` walks the loaded world map.
 * When to use: Only inside `landChainWorld`.
 * Expected outcome: Undefined until the first land case; then the same chain for the rest of the run.
 * Exceptions: None.
 */
let cachedLandChain: { chain: string[]; hexSet: Set<string> } | undefined;

/**
 * One geodesic land chain, scanned once.
 *
 * Purpose: Land-domain cases share one chain so the world-map scan runs a single time.
 * When to use: From the land `findPath` and `getReachableHexes` cases.
 * Expected outcome: `chain[0]` can reach `chain[2]` across occupiable land.
 * Exceptions: Throws when the loaded map has no 2-hop geodesic land chain.
 */
function landChainWorld(): { chain: string[]; hexSet: Set<string> } {
  if (cachedLandChain) return cachedLandChain;
  const chain = findGeodesicLandMassChain(2);
  cachedLandChain = { chain, hexSet: new Set(chain) };
  return cachedLandChain;
}

/**
 * A land chain yields a neighbor-by-neighbor path of length `gridDistance + 1`.
 *
 * Purpose: Locks the land `findPath` contract on a real land-mass chain.
 * When to use: From `run`.
 * Expected outcome: Path starts at the chain origin, ends at the far hex, and each step is a grid neighbor.
 * Exceptions: Throws when the assertion fails or no land chain exists.
 */
function testFindPathOnLandChain(): void {
  const { chain, hexSet } = landChainWorld();
  const origin = chain[0]!;
  const destination = chain[2]!;
  const path = findPath(origin, destination, hexSet, new Map(), 'land', undefined, getStrategicLandMassByH3());
  assert.ok(path);
  assert.strictEqual(path[0], origin);
  assert.strictEqual(path[path.length - 1], destination);
  assert.strictEqual(path.length, gridDistance(origin, destination) + 1);
  for (let i = 1; i < path.length; i += 1) {
    assert.ok(gridDisk(path[i - 1]!, 1).includes(path[i]!));
  }
}

/**
 * A blocked land destination is not a path.
 *
 * Purpose: Locks the land `findPath` failure contract.
 * When to use: From `run`.
 * Expected outcome: `null` when the far hex is blocked.
 * Exceptions: Throws when the assertion fails or no land chain exists.
 */
function testFindPathLandRejectsBlockedDestination(): void {
  const { chain, hexSet } = landChainWorld();
  const path = findPath(
    chain[0]!,
    chain[2]!,
    hexSet,
    new Map(),
    'land',
    new Set([chain[2]!]),
    getStrategicLandMassByH3()
  );
  assert.strictEqual(path, null);
}

/**
 * Land reachability includes the chain and leaves out a blocked step.
 *
 * Purpose: Locks the land `getReachableHexes` contract on the same chain.
 * When to use: From `run`.
 * Expected outcome: The open set contains every chain hex. Blocking the middle step drops that step and the far hex, and keeps the origin.
 * Exceptions: Throws when the assertion fails or no land chain exists.
 */
function testReachableLandChainExcludesBlockedCell(): void {
  const { chain, hexSet } = landChainWorld();
  const landMass = getStrategicLandMassByH3();
  const open = getReachableHexes(chain[0]!, hexSet, new Map(), 'land', undefined, landMass);
  assert.strictEqual(open.size, chain.length);
  for (const cell of chain) assert.ok(open.has(cell));
  const blocked = chain[1]!;
  const partial = getReachableHexes(chain[0]!, hexSet, new Map(), 'land', new Set([blocked]), landMass);
  assert.ok(partial.has(chain[0]!));
  assert.strictEqual(partial.has(blocked), false);
  assert.strictEqual(partial.has(chain[2]!), false);
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
  testFindPathOnPassableWaterDisk();
  testFindPathRejectsBlockedOrMissingDestination();
  testReachableWaterDiskExcludesBlockedCell();
  testFindPathOnLandChain();
  testFindPathLandRejectsBlockedDestination();
  testReachableLandChainExcludesBlockedCell();
  console.log('pathfinding tests passed');
}

run();
