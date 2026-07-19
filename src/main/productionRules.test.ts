import * as assert from 'assert';
import {
  applyProduction,
  computeKeepBuildingRefillCount,
  getAvailableBuildUnitTypes,
  isValidBuildCount,
} from './productionRules';
import { MAX_UNITS_PER_TYPE as MAX_UNITS_PER_TYPE_MAIN } from './productionCaps';
import {
  estimateTurnsToCompleteQueuedProduction,
  estimateTurnsToNextSpawn,
  MAX_UNITS_PER_TYPE as MAX_UNITS_PER_TYPE_SHARED,
  sumQueuedProductionCost,
} from '../shared/productionConfig';

/**
 * Defines the `testBuildTypeAvailabilityGates` function shape (function testBuildTypeAvailabilityGates(): void).

 * Purpose: Supports maintainability by documenting why `testBuildTypeAvailabilityGates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testBuildTypeAvailabilityGates(): void {
  assert.deepStrictEqual(getAvailableBuildUnitTypes(0, 0, 0), []);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(1, 0, 0), ['infantry']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(2, 0, 0), ['infantry', 'armor']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(5, 0, 0), ['infantry', 'armor']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(0, 1, 0), []);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(1, 1, 0), ['infantry']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(5, 1, 0), ['infantry', 'armor']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(10, 1, 0), ['infantry', 'armor', 'naval']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(0, 0, 1), []);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(1, 0, 1), ['infantry']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(5, 0, 1), ['infantry', 'armor', 'air']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(5, 1, 1), ['infantry', 'armor', 'air']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(10, 1, 1), ['infantry', 'armor', 'naval', 'air']);
}

/**
 * Defines the `testBuildCountValidationBounds` function shape (function testBuildCountValidationBounds(): void).

 * Purpose: Supports maintainability by documenting why `testBuildCountValidationBounds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testBuildCountValidationBounds(): void {
  assert.strictEqual(isValidBuildCount(0), false);
  assert.strictEqual(isValidBuildCount(1), true);
  assert.strictEqual(isValidBuildCount(99), true);
  assert.strictEqual(isValidBuildCount(100), false);
  assert.strictEqual(isValidBuildCount(3.5), false);
}

/**
 * Defines the `testProductionExamplesFromSpec` function shape (function testProductionExamplesFromSpec(): void).

 * Purpose: Supports maintainability by documenting why `testProductionExamplesFromSpec` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testProductionExamplesFromSpec(): void {
  // 2 urban -> one infantry (cost 20) in 10 turns.
  let points = 0;
  let spawnedTotal = 0;
  for (let t = 0; t < 10; t++) {
    const result = applyProduction([{ id: 1, queueIndex: 0, unitType: 'infantry', remainingCount: 1 }], points, 2);
    points = result.storedPoints;
    spawnedTotal += result.spawnedUnitTypes.length;
  }
  assert.strictEqual(spawnedTotal, 1);

  // 10 urban -> one naval (cost 100) in 10 turns.
  points = 0;
  spawnedTotal = 0;
  for (let t = 0; t < 10; t++) {
    const result = applyProduction([{ id: 2, queueIndex: 0, unitType: 'naval', remainingCount: 1 }], points, 10);
    points = result.storedPoints;
    spawnedTotal += result.spawnedUnitTypes.length;
  }
  assert.strictEqual(spawnedTotal, 1);

  // 100 urban -> up to 2 armor (cost 40) in one turn when queued.
  const high = applyProduction([{ id: 3, queueIndex: 0, unitType: 'armor', remainingCount: 10 }], 0, 100);
  assert.strictEqual(high.spawnedUnitTypes.length, 2);
  assert.strictEqual(high.updatedEntries[0]?.remainingCount, 8);
}

/**
 * Defines the `testTurnsToNextSpawnEstimateUsesNextUnitOnly` function shape (function testTurnsToNextSpawnEstimateUsesNextUnitOnly(): void).

 * Purpose: Supports maintainability by documenting why `testTurnsToNextSpawnEstimateUsesNextUnitOnly` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testTurnsToNextSpawnEstimateUsesNextUnitOnly(): void {
  // Queue count does not matter for "next spawn" timing. At 5c/turn and infantry cost 20, first spawn is 4 turns away.
  assert.strictEqual(estimateTurnsToNextSpawn('infantry', 0, 5), 4);
  // Stored progress shortens the ETA (deficit 10 → 2 turns at 5c/turn).
  assert.strictEqual(estimateTurnsToNextSpawn('infantry', 10, 5), 2);
  // Non-positive capacity cannot produce a valid ETA.
  assert.strictEqual(estimateTurnsToNextSpawn('armor', 0, 0), null);
}

/**
 * Defines the `testDeploymentCapsMatchMilestone14Values` function shape (function testDeploymentCapsMatchMilestone14Values(): void).

 * Purpose: Supports maintainability by documenting why `testDeploymentCapsMatchMilestone14Values` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testDeploymentCapsMatchMilestone14Values(): void {
  assert.deepStrictEqual(MAX_UNITS_PER_TYPE_SHARED, {
    infantry: 12,
    armor: 8,
    naval: 8,
    air: 6,
  });
  assert.deepStrictEqual(MAX_UNITS_PER_TYPE_MAIN, MAX_UNITS_PER_TYPE_SHARED);
}

/**
 * Defines the `testQueuedCostAndCompletionTurnEstimates` function shape (function testQueuedCostAndCompletionTurnEstimates(): void).

 * Purpose: Locks shared helpers used by the build popup for queue cost totals and simulated drain turns.
 * When to use: Regression coverage when production pacing or costs change.
 * Expected outcome: Empty queues cost zero and complete in zero turns; simple queues match small hand-simulations; zero capacity yields `null` when work remains.
 * Exceptions: None.
 */
function testQueuedCostAndCompletionTurnEstimates(): void {
  assert.strictEqual(sumQueuedProductionCost([]), 0);
  assert.strictEqual(
    sumQueuedProductionCost([
      { unitType: 'infantry', count: 2 },
      { unitType: 'armor', count: 1 },
    ]),
    80
  );
  assert.strictEqual(estimateTurnsToCompleteQueuedProduction([], 0, 3), 0);
  assert.strictEqual(
    estimateTurnsToCompleteQueuedProduction([{ id: 1, queueIndex: 0, unitType: 'infantry', count: 1 }], 0, 2),
    10
  );
  assert.strictEqual(
    estimateTurnsToCompleteQueuedProduction([{ id: 1, queueIndex: 0, unitType: 'infantry', count: 1 }], 0, 0),
    null
  );
}

/**
 * Locks Keep-building refill sizing from available production points (min 1, clamp 99).
 *
 * Purpose: Prevents regressions in same-turn Keep-building refill counts used by the production engine.
 * When to use: After changing unit costs or Keep-building refill rules.
 * Expected outcome: Matches points-based sizing including enqueue-1 at 0 points.
 * Exceptions: None.
 */
function testKeepBuildingRefillCount(): void {
  assert.strictEqual(computeKeepBuildingRefillCount('infantry', 0), 1);
  assert.strictEqual(computeKeepBuildingRefillCount('infantry', 1), 1);
  assert.strictEqual(computeKeepBuildingRefillCount('infantry', 20), 1);
  assert.strictEqual(computeKeepBuildingRefillCount('armor', 100), 2);
  assert.strictEqual(computeKeepBuildingRefillCount('naval', 100), 1);
  assert.strictEqual(computeKeepBuildingRefillCount('infantry', 20 * 200), 99);
}

function run(): void {
  testBuildTypeAvailabilityGates();
  testBuildCountValidationBounds();
  testProductionExamplesFromSpec();
  testTurnsToNextSpawnEstimateUsesNextUnitOnly();
  testDeploymentCapsMatchMilestone14Values();
  testQueuedCostAndCompletionTurnEstimates();
  testKeepBuildingRefillCount();
  console.log('productionRules.test.ts passed');
}

run();
