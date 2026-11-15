/**
 * A successful orders consult marks the unread messages it showed.
 *
 * Purpose: A message stays unread until the consult that displayed it finishes on the same match.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/requestOrdersConsultationMarks.test.js`.
 * Expected outcome: The passed id is seen and the other stays unread. The generation case is last.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { strategicStep } from '../../shared/matchRecording';
import { getGameState } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { insertSentSideMessage, listUnseenInboundSideMessages } from '../gameDb/sideMessageStore';
import { advanceMatchGeneration, getMatchGeneration } from '../matchGeneration';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { consultStillOnOpenMatch, markSuccessfulConsultation } from './requestOrdersConsultationMarks';

test('a missing config table reports that the consult is not on the open match', () => {
  withTempGameDb('aw-consult-open-', () => {
    gameDbOps.run('DROP TABLE game_config');
    assert.equal(consultStillOnOpenMatch('match', getMatchGeneration()), false);
  });
});

test('only the ids passed to a successful consult become seen', () => {
  withTempGameDb('aw-seen-messages-', () => {
    const shown = insertSentSideMessage(gameDbOps, {
      fromSeatId: HUMAN_SEAT_ID,
      toSeatId: AI_SEAT_IDS[0],
      body: 'shown',
      step: strategicStep(1),
    });
    const held = insertSentSideMessage(gameDbOps, {
      fromSeatId: HUMAN_SEAT_ID,
      toSeatId: AI_SEAT_IDS[0],
      body: 'held',
      step: strategicStep(1),
    });
    markSuccessfulConsultation({
      seatId: AI_SEAT_IDS[0],
      turnNumber: getGameState().turnNumber,
      tacticalBattle: undefined,
      seenMessageIds: [shown],
    });
    const unseen = listUnseenInboundSideMessages(gameDbOps, AI_SEAT_IDS[0]).map((row) => row.messageId);
    assert.deepEqual(unseen, [held]);
  });
});

test('a consult that finishes after the match is replaced does not mark messages seen', () => {
  withTempGameDb('aw-seen-generation-', () => {
    const shown = insertSentSideMessage(gameDbOps, {
      fromSeatId: HUMAN_SEAT_ID,
      toSeatId: AI_SEAT_IDS[0],
      body: 'late',
      step: strategicStep(1),
    });
    const generationAtStart = getMatchGeneration();
    advanceMatchGeneration('new_game');
    markSuccessfulConsultation({
      seatId: AI_SEAT_IDS[0],
      turnNumber: getGameState().turnNumber,
      tacticalBattle: undefined,
      matchIdAtStart: null,
      generationAtStart,
      seenMessageIds: [shown],
    });
    const unseen = listUnseenInboundSideMessages(gameDbOps, AI_SEAT_IDS[0]).map((row) => row.messageId);
    assert.deepEqual(unseen, [shown]);
  });
});
