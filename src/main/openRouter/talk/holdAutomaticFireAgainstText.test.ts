/**
 * The briefing text about the sides a commander holds automatic fire against.
 *
 * Purpose: Both prompts of both theaters print this text, so it is checked exactly.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/holdAutomaticFireAgainstText.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHoldAutomaticFireAgainstText, type HoldAutomaticFireAgainstSide } from './holdAutomaticFireAgainstText';

/**
 * One listed side with nothing recorded against it.
 *
 * Purpose: Each case overrides only what it checks.
 * When to use: Every case.
 * Expected outcome: A side with no attack turn and no beat count.
 * Exceptions: None.
 */
function side(overrides: Partial<HoldAutomaticFireAgainstSide> = {}): HoldAutomaticFireAgainstSide {
  return { label: 'Iberia', code: 'a2', struckSinceListedTurn: null, shotsLastBeat: null, ...overrides };
}

const TAIL = 'They still return fire, and an attack you order against a listed side still fires. Change the list with "holdAutomaticFireAgainst" in your orders reply.';

test('an empty list has no text', () => {
  assert.equal(buildHoldAutomaticFireAgainstText([]), null);
});

test('one quiet side prints the first line only', () => {
  assert.equal(
    buildHoldAutomaticFireAgainstText([side()]),
    `Holding automatic fire: your units do not fire on their own at Iberia (a2). ${TAIL}`,
  );
});

test('two sides are joined in the order given', () => {
  const text = buildHoldAutomaticFireAgainstText([side({ label: 'France', code: 'h1' }), side()]);
  assert.equal(text, `Holding automatic fire: your units do not fire on their own at France (h1), Iberia (a2). ${TAIL}`);
});

test('shots counted last beat add a line, and a count of zero adds none', () => {
  const fired = buildHoldAutomaticFireAgainstText([side({ shotsLastBeat: 3 })]) ?? '';
  assert.equal(fired.split('\n')[1], 'Iberia (a2) is on this list. Attack shots the game counted from it last beat: 3.');
  assert.equal((buildHoldAutomaticFireAgainstText([side({ shotsLastBeat: 0 })]) ?? '').split('\n').length, 1);
});

test('an attack since the side was listed adds the turn line after the shot lines, with no trailing newline', () => {
  const text = buildHoldAutomaticFireAgainstText([
    side({ label: 'France', code: 'h1', struckSinceListedTurn: 7 }),
    side({ shotsLastBeat: 1 }),
  ]) ?? '';
  assert.deepEqual(text.split('\n').slice(1), [
    'Iberia (a2) is on this list. Attack shots the game counted from it last beat: 1.',
    "France (h1) is on this list, and the game's record shows its ranged, air, or missile attacks destroyed units of yours since you listed it, last on turn 7.",
  ]);
  assert.equal(text.endsWith('\n'), false);
});
