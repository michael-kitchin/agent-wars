import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCodeUnits } from './codeUnitOrder';

test('code units put the lesser string first', () => {
  assert.equal(compareCodeUnits('a', 'b'), -1);
  assert.equal(compareCodeUnits('b', 'a'), 1);
  assert.equal(compareCodeUnits('a', 'a'), 0);
});

test('uppercase code units sort before lowercase, unlike localeCompare', () => {
  assert.equal(compareCodeUnits('Z', 'a'), -1);
  assert.deepEqual(['b', 'B', 'a', 'A'].sort(compareCodeUnits), ['A', 'B', 'a', 'b']);
});
