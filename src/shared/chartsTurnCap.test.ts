import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MatchChartsSnapshot } from './matchStatistics';
import { capChartsSnapshot } from './chartsTurnCap';

/**
 * Builds a snapshot with turns 1 through 5, a seat that left on turn 4, and two agreements.
 *
 * Purpose: Each case cuts the same match.
 * When to use: Every test below.
 * Expected outcome: A snapshot typed loosely, since the cap reads only turn numbers.
 * Exceptions: None.
 */
function sampleSnapshot(): MatchChartsSnapshot {
  const version = (turnNumber: number) => ({ turnNumber, endTurn: 9 });
  return {
    seats: [{ seatId: 'a', outTurn: 4 }, { seatId: 'b' }],
    turns: [1, 2, 3, 4, 5].map((turnNumber) => ({ turnNumber })),
    currentTurnNumber: 5,
    agreementHistory: {
      agreements: [
        { agreementId: 1, versions: [version(1), version(4)], decisions: [{ turnNumber: 2 }, { turnNumber: 4 }] },
        { agreementId: 2, versions: [version(4)], decisions: [] },
      ],
      attacks: [{ turnNumber: 2 }, { turnNumber: 5 }],
    },
  } as unknown as MatchChartsSnapshot;
}

test('turns after the cap are dropped and the cap becomes the current turn', () => {
  const capped = capChartsSnapshot(sampleSnapshot(), 3);
  assert.deepEqual(capped.turns.map((entry) => entry.turnNumber), [1, 2, 3]);
  assert.equal(capped.currentTurnNumber, 3);
});

test('a cap past the current turn leaves the current turn alone', () => {
  assert.equal(capChartsSnapshot(sampleSnapshot(), 9).currentTurnNumber, 5);
});

test('a seat that left after the cap is still in the match', () => {
  const [first, second] = capChartsSnapshot(sampleSnapshot(), 3).seats;
  assert.equal(first.outTurn, null);
  assert.equal(second.outTurn, undefined);
  assert.equal(capChartsSnapshot(sampleSnapshot(), 4).seats[0].outTurn, 4);
});

test('agreements made, decided, or attacked after the cap are dropped', () => {
  const history = capChartsSnapshot(sampleSnapshot(), 3).agreementHistory;
  assert.deepEqual(history?.agreements.map((entry) => entry.agreementId), [1]);
  assert.equal(history?.agreements[0].versions.length, 1);
  assert.equal(history?.agreements[0].decisions.length, 1);
  assert.equal(history?.attacks.length, 1);
});

test('a snapshot with no agreement history stays without one', () => {
  const bare = { ...sampleSnapshot(), agreementHistory: undefined } as MatchChartsSnapshot;
  assert.equal(capChartsSnapshot(bare, 3).agreementHistory, undefined);
});
