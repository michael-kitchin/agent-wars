/**
 * Contract tests for the fire-risk projection and its knockout decision.
 * Run: `npm run build:main` then `node dist/main/gameActions/mercenaryFireRisk.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import {
  controlAfterNeutralTakeover,
  fireWouldKnockOut,
  projectedCityHexCount,
  projectedHomeLoss,
  type FireRiskInputs,
} from './mercenaryFireRisk';

/** The side whose knockout is projected. */
const OWNER = AI_SEAT_IDS[0];

/** A side that holds some of the owner's home. */
const OTHER = AI_SEAT_IDS[1];

/** Three home hexes of the owner. */
const [A, B, C] = ['hexA', 'hexB', 'hexC'] as const;

/** A city hex of the owner outside its home. */
const D = 'hexD';

/**
 * Inputs for the owner's three home hexes of 10 baseline cells each, and one outside city hex.
 *
 * Purpose: Every case starts from the same side and changes only what it is about.
 * When to use: Each case, with the overrides it needs.
 * Expected outcome: The owner holds A, B, C, and D. Share 0.5, so 15 of 30 home cells knock it out.
 * Exceptions: None.
 */
function inputsWith(overrides: Partial<FireRiskInputs> = {}): FireRiskInputs {
  return {
    ownerSeatId: OWNER,
    homeHexes: [A, B, C],
    controlByHex: new Map<string, string | null>([[A, OWNER], [B, OWNER], [C, OWNER], [D, OWNER]]),
    fortifiedByHex: new Map<string, number>(),
    urbanByHex: new Map<string, number>([[A, 10], [B, 10], [C, 10], [D, 5]]),
    neutralHexes: new Set<string>(),
    baselineUrbanCellsForHex: () => 10,
    minUrbanShare: 0.5,
    ...overrides,
  };
}

/**
 * A control map where the owner holds some hexes and another seat holds the rest.
 *
 * Purpose: Cases hand chosen home hexes to another seat.
 * When to use: The `controlByHex` override.
 * Expected outcome: Each listed hex is held by the other seat. D stays the owner's.
 * Exceptions: None.
 */
function heldByOther(...hexes: string[]): Map<string, string | null> {
  const control = new Map<string, string | null>([[A, OWNER], [B, OWNER], [C, OWNER], [D, OWNER]]);
  for (const hex of hexes) control.set(hex, OTHER);
  return control;
}

test('firing in an owned unfortified home hex that reaches the share knocks out', () => {
  const inputs = inputsWith({ controlByHex: heldByOther(A) });
  assert.equal(fireWouldKnockOut(inputs, B), true);
});

test('a fortified hex, or a hex the side does not hold, never knocks out', () => {
  const fortified = inputsWith({ controlByHex: heldByOther(A), fortifiedByHex: new Map([[B, 1]]) });
  assert.equal(fireWouldKnockOut(fortified, B), false);
  const lost = inputsWith({ controlByHex: heldByOther(A) });
  assert.equal(fireWouldKnockOut(lost, A), false);
});

test('a Neutral unit already in a home hex counts before the fire', () => {
  const inputs = inputsWith({ controlByHex: heldByOther(A), neutralHexes: new Set([B]) });
  assert.equal(projectedHomeLoss(inputs, new Set()).lostUrbanCells, 20);
  assert.equal(fireWouldKnockOut(inputs, C), false);
});

test('the every-hex rule needs every home hex', () => {
  const nearlyLost = inputsWith({ controlByHex: heldByOther(A, B), minUrbanShare: null });
  assert.equal(fireWouldKnockOut(nearlyLost, C), true);
  const safe = inputsWith({ controlByHex: heldByOther(A), minUrbanShare: null });
  assert.equal(fireWouldKnockOut(safe, C), false);
});

test('firing in the last city hex knocks out', () => {
  const rubble = inputsWith({ urbanByHex: new Map([[A, 0], [B, 0], [C, 0], [D, 5]]) });
  assert.equal(projectedCityHexCount(rubble, new Set()), 1);
  assert.equal(fireWouldKnockOut(rubble, D), true);
  assert.equal(fireWouldKnockOut(rubble, B), false);
});

test('the inputs are not mutated', () => {
  const control = heldByOther(A);
  const neutral = new Set([B]);
  const fortified = new Map([[C, 1]]);
  const inputs = inputsWith({ controlByHex: control, neutralHexes: neutral, fortifiedByHex: fortified });
  const takeover = controlAfterNeutralTakeover(inputs, new Set([D]));
  fireWouldKnockOut(inputs, D);
  assert.equal(takeover.get(B), NEUTRAL_OWNER_ID);
  assert.equal(takeover.get(D), NEUTRAL_OWNER_ID);
  assert.deepEqual([...control.entries()], [...heldByOther(A).entries()]);
  assert.deepEqual([...neutral], [B]);
  assert.deepEqual([...fortified.entries()], [[C, 1]]);
});
