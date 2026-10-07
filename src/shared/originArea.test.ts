import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { majorityOriginId, originFlagAssetPath } from './originArea';

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
});
