import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldRefreshStackCalloutOnShiftKeydown } from './stackCalloutShiftKeydown';

describe('shouldRefreshStackCalloutOnShiftKeydown', () => {
  it('refreshes stack chrome only when Shift newly becomes active', () => {
    assert.equal(shouldRefreshStackCalloutOnShiftKeydown(false), true);
  });

  it('does not rebuild an open stack popup on Shift key repeat', () => {
    assert.equal(shouldRefreshStackCalloutOnShiftKeydown(true), false);
  });
});
