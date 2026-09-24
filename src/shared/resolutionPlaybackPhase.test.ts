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
 * Purpose: The two cases below only need ranged combat, or movement, plus an elapsed time.
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
