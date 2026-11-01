import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sightCuesForRequest, sightCuesFromStored } from './sightCueSettings';

test('a start request with no value, or a non-boolean, stores on', () => {
  assert.equal(sightCuesForRequest(undefined), true);
  assert.equal(sightCuesForRequest('1'), true);
  assert.equal(sightCuesForRequest(false), false);
  assert.equal(sightCuesForRequest(true), true);
});

test('a stored 1 is on, and anything else is off', () => {
  assert.equal(sightCuesFromStored('1'), true);
  assert.equal(sightCuesFromStored('0'), false);
  assert.equal(sightCuesFromStored(undefined), false);
  assert.equal(sightCuesFromStored(null), false);
  assert.equal(sightCuesFromStored('yes'), false);
});
