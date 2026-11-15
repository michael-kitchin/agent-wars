import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLandUnitType } from './landUnitType';

test('infantry and armor are land units', () => {
  assert.equal(isLandUnitType('infantry'), true);
  assert.equal(isLandUnitType('armor'), true);
});

test('other unit types and other spellings are not land units', () => {
  assert.equal(isLandUnitType('naval'), false);
  assert.equal(isLandUnitType('air'), false);
  assert.equal(isLandUnitType('missile'), false);
  assert.equal(isLandUnitType(''), false);
  assert.equal(isLandUnitType('Infantry'), false);
});
