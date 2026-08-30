/**
 * Stay-put occupancy contracts for WEGO approach dests.
 * Run: `npm run build:main` then `node dist/main/tools/stayPutFriendlyOccupancy.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stayPutFriendlyOccupiedHexes, friendlyOccupantsFromHexIndex } from './stayPutFriendlyOccupancy';

test('stayPutFriendlyOccupiedHexes treats units without a this-period dest as stay-put', () => {
  const stay = stayPutFriendlyOccupiedHexes(
    [
      { id: 'a', h3Index: 'hex-a' },
      { id: 'b', h3Index: 'hex-b' },
    ],
    new Map()
  );
  assert.equal(stay.has('hex-a'), true);
  assert.equal(stay.has('hex-b'), true);
});

test('stayPutFriendlyOccupiedHexes omits a leaver origin and does not occupy their dest', () => {
  const stay = stayPutFriendlyOccupiedHexes(
    [
      { id: 'leaver', h3Index: 'hex-origin' },
      { id: 'sitter', h3Index: 'hex-sit' },
    ],
    new Map([['leaver', 'hex-dest']])
  );
  assert.equal(stay.has('hex-origin'), false);
  assert.equal(stay.has('hex-sit'), true);
  assert.equal(stay.has('hex-dest'), false);
});

test('stayPutFriendlyOccupiedHexes keeps a dest occupied when another friendly is staying there', () => {
  const stay = stayPutFriendlyOccupiedHexes(
    [
      { id: 'leaver', h3Index: 'hex-origin' },
      { id: 'sitter', h3Index: 'hex-dest' },
    ],
    new Map([['leaver', 'hex-dest']])
  );
  assert.equal(stay.has('hex-origin'), false);
  assert.equal(stay.has('hex-dest'), true);
});

test('friendlyOccupantsFromHexIndex emits one row per occupant', () => {
  const rows = friendlyOccupantsFromHexIndex(
    new Map([
      ['hex-a', [{ id: 'a' }, { id: 'b' }]],
      ['hex-b', [{ id: 'c' }]],
    ])
  );
  assert.equal(rows.length, 3);
  assert.ok(rows.some((r) => r.id === 'a' && r.h3Index === 'hex-a'));
  assert.ok(rows.some((r) => r.id === 'c' && r.h3Index === 'hex-b'));
});
