import * as assert from 'assert';
import {
  applyProduction,
  getAvailableBuildUnitTypes,
  isValidBuildCount,
} from './productionRules';

function testBuildTypeAvailabilityGates(): void {
  assert.deepStrictEqual(getAvailableBuildUnitTypes(0, 0), []);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(1, 0), ['infantry']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(2, 0), ['infantry', 'armor']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(5, 0), ['infantry', 'armor']);
  assert.deepStrictEqual(getAvailableBuildUnitTypes(5, 1), ['infantry', 'armor', 'naval']);
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

function run(): void {
  testBuildTypeAvailabilityGates();
  testBuildCountValidationBounds();
  testProductionExamplesFromSpec();
  // eslint-disable-next-line no-console
  console.log('productionRules.test.ts passed');
}

run();
