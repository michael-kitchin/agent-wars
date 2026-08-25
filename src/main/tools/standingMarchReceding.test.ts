/**
 * Contract tests for receding-march hop comparison.
 * Run: `npm run build:main` then `node dist/main/tools/standingMarchReceding.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { marchStepRecedesFromEnemy, nearestObservedEnemyH3 } from './standingMarchReceding';

const origin = latLngToCell(0, 0, 1);
const ring1 = gridDisk(origin, 1).filter((h) => h !== origin);
const neighbor = ring1[0]!;
const far = gridDisk(origin, 2).find((h) => h !== origin && !ring1.includes(h)) ?? ring1[1]!;

test('marchStepRecedesFromEnemy is true when the step increases hop distance', () => {
  assert.equal(marchStepRecedesFromEnemy(neighbor, far, origin), true);
});

test('marchStepRecedesFromEnemy is false when the step closes or holds distance', () => {
  assert.equal(marchStepRecedesFromEnemy(far, neighbor, origin), false);
  assert.equal(marchStepRecedesFromEnemy(neighbor, neighbor, origin), false);
});

test('nearestObservedEnemyH3 returns the closest measurable enemy hex', () => {
  assert.equal(nearestObservedEnemyH3(origin, [far, neighbor]), neighbor);
  assert.equal(nearestObservedEnemyH3(origin, []), null);
});
