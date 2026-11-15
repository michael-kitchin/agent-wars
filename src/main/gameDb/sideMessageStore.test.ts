/**
 * Stored messages and stances.
 *
 * Purpose: The two tables keep one staged draft per pair, a thread in write order, and a stance only when it changes.
 * When to use: `npm run build:main`, then `node dist/main/gameDb/sideMessageStore.test.js`.
 * Expected outcome: The cases below. A new match clears both tables.
 * Exceptions: None. The temporary directory is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strategicStep } from '../../shared/matchRecording';
import { resetGameForNewMatch } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { gameDbOps } from './dbConnection';
import { ensureSideMessageTables } from './sideMessageTables';
import {
  deleteStagedSideMessage,
  insertSentSideMessage,
  listSideMessageThread,
  listSideStances,
  listStagedSideMessages,
  listUnseenInboundSideMessages,
  markSideMessagesSeen,
  replaceStagedSideMessage,
  sendStagedSideMessages,
  upsertSideStance,
} from './sideMessageStore';

test('threads, unseen messages, and staged drafts follow the store rules', () => {
  withTempGameDb('aw-side-messages-', () => {
    const step = strategicStep(2);
    const older = insertSentSideMessage(gameDbOps, { fromSeatId: 'opponent', toSeatId: 'human', body: 'older', step });
    insertSentSideMessage(gameDbOps, { fromSeatId: 'human', toSeatId: 'opponent', body: 'newer', step: strategicStep(3) });
    insertSentSideMessage(gameDbOps, { fromSeatId: 'opponent', toSeatId: 'opponent2', body: 'other', step });
    const thread = listSideMessageThread(gameDbOps, 'opponent', 'human', 8);
    assert.deepEqual(thread.map((row) => row.body), ['older', 'newer']);
    assert.deepEqual(listSideMessageThread(gameDbOps, 'opponent', 'human', 1).map((row) => row.body), ['newer']);

    assert.deepEqual(listUnseenInboundSideMessages(gameDbOps, 'human').map((row) => row.messageId), [older]);
    markSideMessagesSeen(gameDbOps, [older]);
    assert.deepEqual(listUnseenInboundSideMessages(gameDbOps, 'human'), []);
    markSideMessagesSeen(gameDbOps, []);

    replaceStagedSideMessage(gameDbOps, { fromSeatId: 'human', toSeatId: 'opponent', body: 'first', step });
    replaceStagedSideMessage(gameDbOps, { fromSeatId: 'human', toSeatId: 'opponent', body: 'second', step });
    replaceStagedSideMessage(gameDbOps, { fromSeatId: 'human', toSeatId: 'opponent2', body: 'third', step });
    assert.equal(listStagedSideMessages(gameDbOps, 'human').length, 2);
    deleteStagedSideMessage(gameDbOps, 'human', 'opponent2');
    const sent = sendStagedSideMessages(gameDbOps, 'human', strategicStep(4));
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.body, 'second');
    assert.equal(sent[0]?.step.turnNumber, 4);
    assert.equal(listStagedSideMessages(gameDbOps, 'human').length, 0);
  });
});

test('a stance is written only when it changes, and a seat cannot message itself', () => {
  withTempGameDb('aw-side-stances-', () => {
    const first = upsertSideStance(gameDbOps, {
      seatId: 'opponent',
      towardSeatId: 'human',
      stance: 'wary',
      reason: 'massing',
      turnNumber: 1,
    });
    assert.deepEqual(first, { changed: true, previousStance: null });
    const same = upsertSideStance(gameDbOps, {
      seatId: 'opponent',
      towardSeatId: 'human',
      stance: 'wary',
      reason: 'massing',
      turnNumber: 2,
    });
    assert.equal(same.changed, false);
    const changed = upsertSideStance(gameDbOps, {
      seatId: 'opponent',
      towardSeatId: 'human',
      stance: 'hostile',
      reason: 'crossed',
      turnNumber: 3,
    });
    assert.deepEqual(changed, { changed: true, previousStance: 'wary' });
    assert.equal(listSideStances(gameDbOps, 'opponent')[0]?.stance, 'hostile');

    assert.throws(() =>
      insertSentSideMessage(gameDbOps, { fromSeatId: 'opponent', toSeatId: 'opponent', body: 'self', step: strategicStep(1) })
    );
  });
});

test('a new match clears both tables, and opening creates them again', () => {
  withTempGameDb('aw-side-reset-', () => {
    insertSentSideMessage(gameDbOps, { fromSeatId: 'opponent', toSeatId: 'human', body: 'keep', step: strategicStep(1) });
    upsertSideStance(gameDbOps, { seatId: 'opponent', towardSeatId: 'human', stance: 'neutral', reason: '', turnNumber: 1 });
    resetGameForNewMatch();
    assert.equal(gameDbOps.getOne<{ n: number }>('SELECT COUNT(*) AS n FROM side_messages')?.n, 0);
    assert.equal(gameDbOps.getOne<{ n: number }>('SELECT COUNT(*) AS n FROM side_stances')?.n, 0);
    gameDbOps.run('DROP TABLE side_messages');
    gameDbOps.run('DROP TABLE side_stances');
    ensureSideMessageTables((sql) => gameDbOps.run(sql));
    assert.equal(gameDbOps.getAll('PRAGMA table_info(side_messages)').length > 0, true);
    assert.equal(gameDbOps.getAll('PRAGMA table_info(side_stances)').length > 0, true);
  });
});
