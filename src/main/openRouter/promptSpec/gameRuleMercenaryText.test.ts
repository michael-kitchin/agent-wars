/**
 * Mercenary prompt sentences use the global upkeep table and the active credits price.
 *
 * Purpose: A regional map must not change the upkeep the model is told.
 * When to use: After changing the mercenary rule text.
 * Expected outcome: The credits sentence and the upkeep list below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCreditsProductionRulePart, buildMercenaryRule } from './gameRuleMercenaryText';

test('the credits rule names the global item price and the credits it adds', () => {
  assert.ok(buildCreditsProductionRulePart().includes('costs 20 production points and adds 20 credits'));
});

test('the mercenary rule lists basic and Advanced upkeep', () => {
  assert.ok(buildMercenaryRule().includes('infantry 3 (Advanced 5), armor 5 (10), naval 13 (25), air 8 (15)'));
});
