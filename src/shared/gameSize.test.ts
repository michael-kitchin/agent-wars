import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_UNITS_PER_TYPE } from './productionConfig';
import {
  GAME_SIZE_MULTIPLIER,
  GAME_SIZES,
  gameSizeCapPreviewRows,
  getMaxUnitsPerType,
  parseGameSize,
  type GameSize,
} from './gameSize';

describe('parseGameSize', () => {
  it('accepts exact and trimmed case-insensitive size strings', () => {
    assert.equal(parseGameSize('small'), 'small');
    assert.equal(parseGameSize('medium'), 'medium');
    assert.equal(parseGameSize('large'), 'large');
    assert.equal(parseGameSize(' Medium '), 'medium');
    assert.equal(parseGameSize('LARGE'), 'large');
  });

  it('returns small for missing or invalid values', () => {
    assert.equal(parseGameSize(undefined), 'small');
    assert.equal(parseGameSize(null), 'small');
    assert.equal(parseGameSize(''), 'small');
    assert.equal(parseGameSize('world'), 'small');
    assert.equal(parseGameSize('2'), 'small');
    assert.equal(parseGameSize(2), 'small');
  });
});

describe('getMaxUnitsPerType', () => {
  it('uses the small table as the 1x baseline, doubles for medium, and triples for large', () => {
    assert.deepEqual(GAME_SIZES, ['small', 'medium', 'large']);
    assert.deepEqual(GAME_SIZE_MULTIPLIER, { small: 1, medium: 2, large: 3 });
    assert.deepEqual(getMaxUnitsPerType('small'), MAX_UNITS_PER_TYPE);
    assert.deepEqual(getMaxUnitsPerType('medium'), {
      infantry: 24,
      armor: 16,
      naval: 16,
      air: 12,
      missile: 4,
    });
    assert.deepEqual(getMaxUnitsPerType('large'), {
      infantry: 36,
      armor: 24,
      naval: 24,
      air: 18,
      missile: 6,
    });
    assert.deepEqual(getMaxUnitsPerType('world' as GameSize), MAX_UNITS_PER_TYPE);
  });
});

describe('gameSizeCapPreviewRows', () => {
  it('lists infantry through air with capitalized names and selected-size caps', () => {
    assert.deepEqual(gameSizeCapPreviewRows('small'), [
      { unitType: 'infantry', displayName: 'Infantry', cap: 12 },
      { unitType: 'armor', displayName: 'Armor', cap: 8 },
      { unitType: 'naval', displayName: 'Naval', cap: 8 },
      { unitType: 'air', displayName: 'Air', cap: 6 },
      { unitType: 'missile', displayName: 'Missile', cap: 2 },
    ]);
    assert.equal(gameSizeCapPreviewRows('large')[0]?.cap, 36);
  });
});
