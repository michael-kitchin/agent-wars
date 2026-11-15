import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNonArrayObject, isNonNullObject } from './objectGuards';

test('objects pass both guards', () => {
  assert.equal(isNonNullObject({}), true);
  assert.equal(isNonArrayObject({}), true);
  assert.equal(isNonNullObject({ a: 1 }), true);
  assert.equal(isNonArrayObject({ a: 1 }), true);
});

test('arrays pass only the non-null guard', () => {
  assert.equal(isNonNullObject([]), true);
  assert.equal(isNonArrayObject([]), false);
});

test('null and non-objects fail both guards', () => {
  assert.equal(isNonNullObject(null), false);
  assert.equal(isNonArrayObject(null), false);
  assert.equal(isNonNullObject(undefined), false);
  assert.equal(isNonArrayObject(undefined), false);
  assert.equal(isNonNullObject('x'), false);
  assert.equal(isNonArrayObject('x'), false);
  assert.equal(isNonNullObject(0), false);
  assert.equal(isNonArrayObject(0), false);
});
