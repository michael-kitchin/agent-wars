import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashStringToUint32 } from './stableHash';

test('the empty string hashes to the FNV-1a offset basis', () => {
  assert.equal(hashStringToUint32(''), 2166136261);
});

test('known strings hash to the standard FNV-1a 32-bit values', () => {
  assert.equal(hashStringToUint32('a'), 3826002220);
  assert.equal(hashStringToUint32('foobar'), 3214735720);
  assert.equal(hashStringToUint32('a:x|b:y'), 6627761);
});
