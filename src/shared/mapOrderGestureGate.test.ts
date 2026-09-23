import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolutionPlaybackBlocksMapOrders, tacticalHitIsInsideBattle } from './mapOrderGestureGate';

describe('resolutionPlaybackBlocksMapOrders', () => {
  it('blocks while an animation is present and allows a null animation', () => {
    assert.equal(resolutionPlaybackBlocksMapOrders({ startedAtMs: 1 }), true);
    assert.equal(resolutionPlaybackBlocksMapOrders(null), false);
  });
});

describe('tacticalHitIsInsideBattle', () => {
  it('accepts a null hit when no battle is active', () => {
    assert.equal(tacticalHitIsInsideBattle(false, null, false), true);
  });

  it('rejects a null hit during a battle', () => {
    assert.equal(tacticalHitIsInsideBattle(true, null, true), false);
  });

  it('follows the footprint when a battle hit is a hex', () => {
    assert.equal(tacticalHitIsInsideBattle(true, 'hex-in', true), true);
    assert.equal(tacticalHitIsInsideBattle(true, 'hex-out', false), false);
  });
});
