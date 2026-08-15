import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldRefreshStackCalloutOnControlKeydown } from './stackCalloutCtrlKeydown';

describe('shouldRefreshStackCalloutOnControlKeydown', () => {
  it('refreshes stack chrome only when Control newly becomes active', () => {
    assert.equal(shouldRefreshStackCalloutOnControlKeydown(false), true);
  });

  it('does not rebuild an open stack popup on Control key repeat', () => {
    assert.equal(shouldRefreshStackCalloutOnControlKeydown(true), false);
  });
});
