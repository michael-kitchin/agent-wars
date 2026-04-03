import * as assert from 'assert';
import {
  applyProduction,
  getAvailableBuildUnitTypes,
  isValidBuildCount,
} from './productionRules';
import { MAX_UNITS_PER_TYPE as MAX_UNITS_PER_TYPE_MAIN } from './productionCaps';
import {
  estimateTurnsToNextSpawn,
  MAX_UNITS_PER_TYPE as MAX_UNITS_PER_TYPE_SHARED,
} from '../shared/productionConfig';

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

function testBuildCountValidationBounds(): void {
  assert.strictEqual(isValidBuildCount(0), false);
  assert.strictEqual(isValidBuildCount(1), true);
  assert.strictEqual(isValidBuildCount(99), true);
  assert.strictEqual(isValidBuildCount(100), false);
  assert.strictEqual(isValidBuildCount(3.5), false);
}

function testProductionExamplesFromSpec(): void {
  // 2 urban -> one infantry (cost 10) in 5 turns.
  let points = 0;
  let spawnedTotal = 0;
  for (let t = 0; t < 5; t++) {
    const result = applyProduction([{ id: 1, queueIndex: 0, unitType: 'infantry', remainingCount: 1 }], points, 2);
    points = result.storedPoints;
    spawnedTotal += result.spawnedUnitTypes.length;
  }
  assert.strictEqual(spawnedTotal, 1);

  // 10 urban -> one naval (cost 50) in 5 turns.
  points = 0;
  spawnedTotal = 0;
  for (let t = 0; t < 5; t++) {
    const result = applyProduction([{ id: 2, queueIndex: 0, unitType: 'naval', remainingCount: 1 }], points, 10);
    points = result.storedPoints;
    spawnedTotal += result.spawnedUnitTypes.length;
  }
  assert.strictEqual(spawnedTotal, 1);

  // 100 urban -> up to 5 armor (cost 20) in one turn when queued.
  const high = applyProduction([{ id: 3, queueIndex: 0, unitType: 'armor', remainingCount: 10 }], 0, 100);
  assert.strictEqual(high.spawnedUnitTypes.length, 5);
  assert.strictEqual(high.updatedEntries[0]?.remainingCount, 5);
}

function testTurnsToNextSpawnEstimateUsesNextUnitOnly(): void {
  // Queue count does not matter for "next spawn" timing. At 5c/turn and infantry cost 10, first spawn is 2 turns away.
  assert.strictEqual(estimateTurnsToNextSpawn('infantry', 0, 5), 2);
  // Stored overflow should allow immediate next-turn spawn.
  assert.strictEqual(estimateTurnsToNextSpawn('infantry', 10, 5), 1);
  // Non-positive capacity cannot produce a valid ETA.
  assert.strictEqual(estimateTurnsToNextSpawn('armor', 0, 0), null);
}

function testDeploymentCapsMatchMilestone14Values(): void {
  assert.deepStrictEqual(MAX_UNITS_PER_TYPE_SHARED, {
    infantry: 6,
    armor: 4,
    naval: 4,
    air: 3,
  });
  assert.deepStrictEqual(MAX_UNITS_PER_TYPE_MAIN, MAX_UNITS_PER_TYPE_SHARED);
}

function run(): void {
  testBuildTypeAvailabilityGates();
  testBuildCountValidationBounds();
  testProductionExamplesFromSpec();
  testTurnsToNextSpawnEstimateUsesNextUnitOnly();
  testDeploymentCapsMatchMilestone14Values();
  // eslint-disable-next-line no-console
  console.log('productionRules.test.ts passed');
}

run();
