import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPlaceOrdinal } from './placeOrdinal';

describe('formatPlaceOrdinal', () => {
  it('uses st, nd, and rd except for the teens', () => {
    assert.equal(formatPlaceOrdinal(1), '1st');
    assert.equal(formatPlaceOrdinal(2), '2nd');
    assert.equal(formatPlaceOrdinal(3), '3rd');
    assert.equal(formatPlaceOrdinal(4), '4th');
    assert.equal(formatPlaceOrdinal(11), '11th');
    assert.equal(formatPlaceOrdinal(12), '12th');
    assert.equal(formatPlaceOrdinal(13), '13th');
    assert.equal(formatPlaceOrdinal(21), '21st');
    assert.equal(formatPlaceOrdinal(22), '22nd');
    assert.equal(formatPlaceOrdinal(23), '23rd');
    assert.equal(formatPlaceOrdinal(111), '111th');
  });
});
