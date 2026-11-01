/**
 * Contracts for resolution playback stage timing.
 * Run: `node dist/shared/resolutionPlaybackPhase.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getResolutionPlaybackPhase, type ResolutionPlaybackPhaseArgs } from './resolutionPlaybackPhase';

const fadeMs = 1000;
const lightningMs = 1000;

/**
 * Builds a timeline sample with every stage off unless the test turns one on.
 *
 * Purpose: Each case turns on only the stages it cares about, including sight cues.
 * When to use: Inside this file's tests.
 * Expected outcome: Unspecified flags are false and elapsed defaults to 0.
 * Exceptions: None.
 */
function phase(overrides: Partial<ResolutionPlaybackPhaseArgs>) {
  return getResolutionPlaybackPhase({
    elapsed: 0,
    fadeMs,
    lightningMs,
    hasAirStrikeOutbound: false,
    hasAirStrikeCombat: false,
    hasAirStrikeCasualties: false,
    hasAirStrikeReturn: false,
    hasRangedCombat: false,
    hasRangedCasualties: false,
    hasMoves: false,
    hasMeleeCombat: false,
    hasMeleeCasualties: false,
    hasSightCues: false,
    sightCueMs: 1500,
    ...overrides,
  });
}

describe('getResolutionPlaybackPhase movement duration', () => {
  it('keeps a fade-length movement stage when the resolution has moves', () => {
    const result = phase({ hasMoves: true });
    assert.equal(result.movementStart, 0);
    assert.equal(result.meleeCombatStart, result.movementStart + fadeMs);
    assert.equal(result.inMovement, true);
    assert.equal(result.moveProgress, 0);
  });

  it('skips movement when another stage is present and there are no moves', () => {
    const before = phase({ hasRangedCombat: true });
    assert.equal(before.movementStart, lightningMs);
    assert.equal(before.meleeCombatStart, before.movementStart);
    assert.equal(before.moveProgress, 0);
    assert.equal(before.inMovement, false);

    const atMovement = phase({ elapsed: before.movementStart, hasRangedCombat: true });
    assert.equal(atMovement.meleeCombatStart, atMovement.movementStart);
    assert.equal(atMovement.moveProgress, 1);
    assert.equal(atMovement.inMovement, false);
  });
});

describe('getResolutionPlaybackPhase sight cues', () => {
  it('plays sight cues before the outbound air leg and adds their duration', () => {
    const during = phase({ elapsed: 0, hasSightCues: true, hasAirStrikeOutbound: true });
    assert.equal(during.inSightCues, true);
    assert.equal(during.inAirStrikeOutbound, false);
    assert.equal(during.airStrikeOutboundStart, during.sightCueStart + 1500);
    const after = phase({ elapsed: 1500, hasSightCues: true, hasAirStrikeOutbound: true });
    assert.equal(after.inSightCues, false);
    assert.equal(after.inAirStrikeOutbound, true);
    assert.equal(after.totalMs, 1500 + fadeMs);
  });

  it('keeps the outbound air leg at 0 when there are no sight cues', () => {
    const result = phase({ hasAirStrikeOutbound: true });
    assert.equal(result.airStrikeOutboundStart, 0);
    assert.equal(result.inSightCues, false);
  });
});
