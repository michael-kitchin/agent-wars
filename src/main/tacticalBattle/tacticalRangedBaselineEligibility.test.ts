/**
 * Contract tests for `unitHasTacticalRangedBaseline`. Run with:
 * `node dist/main/tacticalBattle/tacticalRangedBaselineEligibility.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unitHasTacticalRangedBaseline } from '../../shared/tacticalRanges';

test('unitHasTacticalRangedBaseline matches prior renderer predicate for known types', () => {
  assert.equal(unitHasTacticalRangedBaseline('infantry'), true);
  assert.equal(unitHasTacticalRangedBaseline('armor'), true);
  assert.equal(unitHasTacticalRangedBaseline('naval'), true);
  assert.equal(unitHasTacticalRangedBaseline('air'), true);
});

test('unitHasTacticalRangedBaseline is false for unknown types', () => {
  assert.equal(unitHasTacticalRangedBaseline('unknown-unit-type'), false);
  assert.equal(unitHasTacticalRangedBaseline(''), false);
});
