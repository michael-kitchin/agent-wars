import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatOriginPlaceLabel, majorityOriginId, originFlagAssetPath } from './originArea';

describe('origin areas', () => {
  it('breaks a majority tie by id ascending', () => {
    const counts = new Map<string, number>([
      ['US-NY', 2],
      ['US-CA', 2],
    ]);
    assert.equal(majorityOriginId(counts), 'US-CA');
    assert.equal(majorityOriginId(new Map([['US-NY', 3], ['US-CA', 1]])), 'US-NY');
  });

  it('uses a subdivision flag, then the national flag, then the placeholder', () => {
    assert.equal(originFlagAssetPath({ subdivisionCode: 'US-CA', countryCode: 'US' }), 'flags/subdivisions/us-ca.svg');
    assert.equal(originFlagAssetPath({ subdivisionCode: 'US-ZZ', countryCode: 'US' }), 'flags/us.svg');
    assert.equal(originFlagAssetPath({ subdivisionCode: null, countryCode: 'ZZ' }), 'flag-unknown.svg');
  });

  it('shows a subdivision as its brief name and its country', () => {
    assert.equal(
      formatOriginPlaceLabel({
        areaName: 'Colorado',
        countryName: 'United States of America',
        hasSubdivision: true,
      }),
      'Colorado, United States of America'
    );
  });

  it('shows a country-level origin once', () => {
    assert.equal(
      formatOriginPlaceLabel({ areaName: 'French Republic', countryName: 'France', hasSubdivision: false }),
      'France'
    );
    assert.equal(
      formatOriginPlaceLabel({ areaName: 'France', countryName: 'France', hasSubdivision: true }),
      'France'
    );
    assert.equal(formatOriginPlaceLabel({ areaName: 'Colorado', countryName: null, hasSubdivision: true }), 'Colorado');
    assert.equal(formatOriginPlaceLabel({ areaName: '  ', countryName: null, hasSubdivision: false }), '');
  });
});
