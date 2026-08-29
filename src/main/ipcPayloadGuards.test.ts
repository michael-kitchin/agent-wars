import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGroupedDestinationPayload, parseGroupedTargetPayload } from './ipcPayloadGuards';

test('parseGroupedTargetPayload returns unitIds and targetH3Index', () => {
  assert.deepEqual(parseGroupedTargetPayload({ unitIds: ['u1', 'u2'], targetH3Index: 'abc' }), {
    unitIds: ['u1', 'u2'],
    targetH3Index: 'abc',
  });
});

test('parseGroupedTargetPayload returns null when H3 is missing or not a string', () => {
  assert.equal(parseGroupedTargetPayload({ unitIds: ['u1'] }), null);
  assert.equal(parseGroupedTargetPayload({ unitIds: ['u1'], targetH3Index: 3 }), null);
});

test('parseGroupedTargetPayload returns null when unitIds is not an array', () => {
  assert.equal(parseGroupedTargetPayload({ unitIds: 'u1', targetH3Index: 'abc' }), null);
});

test('parseGroupedDestinationPayload returns unitIds and destinationH3Index', () => {
  assert.deepEqual(parseGroupedDestinationPayload({ unitIds: ['u1'], destinationH3Index: 'dest' }), {
    unitIds: ['u1'],
    destinationH3Index: 'dest',
  });
});

test('parseGroupedDestinationPayload returns null when H3 is missing or not a string', () => {
  assert.equal(parseGroupedDestinationPayload({ unitIds: ['u1'] }), null);
  assert.equal(parseGroupedDestinationPayload({ unitIds: ['u1'], destinationH3Index: 1 }), null);
});

test('parseGroupedDestinationPayload returns null when unitIds is not an array', () => {
  assert.equal(parseGroupedDestinationPayload({ unitIds: null, destinationH3Index: 'dest' }), null);
});
