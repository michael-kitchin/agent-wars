import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AI_SEAT_IDS,
  HUMAN_SEAT_ID,
  NEUTRAL_OWNER_ID,
  aiIndexForSeatId,
  aiSeatIdForIndex,
  isAiSeatId,
  isHumanSeatId,
  isNeutralOwnerId,
  isOwnerId,
  isSeatId,
} from './seatIds';

describe('ai seat index', () => {
  it('maps 1 to 4 and throws outside that range', () => {
    assert.equal(aiSeatIdForIndex(1), 'opponent');
    assert.equal(aiSeatIdForIndex(2), 'opponent2');
    assert.equal(aiSeatIdForIndex(3), 'opponent3');
    assert.equal(aiSeatIdForIndex(4), 'opponent4');
    assert.throws(() => aiSeatIdForIndex(0), RangeError);
    assert.throws(() => aiSeatIdForIndex(5), RangeError);
  });

  it('round-trips AI seat ids and rejects everything else', () => {
    for (const seatId of AI_SEAT_IDS) {
      const index = aiIndexForSeatId(seatId);
      assert.equal(index === null ? null : aiSeatIdForIndex(index), seatId);
    }
    assert.equal(aiIndexForSeatId(HUMAN_SEAT_ID), null);
    assert.equal(aiIndexForSeatId(NEUTRAL_OWNER_ID), null);
    assert.equal(aiIndexForSeatId('opponent5'), null);
  });
});

describe('seat id predicates', () => {
  it('accepts and rejects the right strings', () => {
    assert.equal(isHumanSeatId(HUMAN_SEAT_ID), true);
    assert.equal(isHumanSeatId('opponent'), false);
    assert.equal(isAiSeatId('opponent3'), true);
    assert.equal(isAiSeatId(HUMAN_SEAT_ID), false);
    assert.equal(isAiSeatId(NEUTRAL_OWNER_ID), false);
    assert.equal(isSeatId(HUMAN_SEAT_ID), true);
    assert.equal(isSeatId('opponent4'), true);
    assert.equal(isSeatId(NEUTRAL_OWNER_ID), false);
    assert.equal(isNeutralOwnerId(NEUTRAL_OWNER_ID), true);
    assert.equal(isNeutralOwnerId(HUMAN_SEAT_ID), false);
    assert.equal(isOwnerId(HUMAN_SEAT_ID), true);
    assert.equal(isOwnerId('opponent2'), true);
    assert.equal(isOwnerId(NEUTRAL_OWNER_ID), true);
    assert.equal(isOwnerId('other'), false);
  });
});
