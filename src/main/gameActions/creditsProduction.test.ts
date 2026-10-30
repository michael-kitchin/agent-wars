/**
 * A credits spend step buys only what the points and the remaining count allow.
 *
 * Purpose: A zero cost must not divide, and a partial remainder must not overspend.
 * When to use: After changing `creditsSpendStep`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creditsSpendStep } from './creditsProduction';

test('creditsSpendStep buys the lesser of the remaining count and what the points afford', () => {
  assert.equal(creditsSpendStep({ remainingCount: 3, points: 50, cost: 20 }), 2);
  assert.equal(creditsSpendStep({ remainingCount: 1, points: 50, cost: 20 }), 1);
  assert.equal(creditsSpendStep({ remainingCount: 2, points: 40, cost: 0 }), 0);
});
