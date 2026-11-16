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
import { ensureSideMessageTables, ensureSideStanceScoreColumns } from './sideMessageTables';
import {
  deleteStagedSideMessage,
  insertSentSideMessage,
  listSideMessageThread,
  listAllSideStances,
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
      trust: null,
      threat: null,
      turnNumber: 1,
    });
    assert.deepEqual(first, { changed: true, previousStance: null });
    const same = upsertSideStance(gameDbOps, {
      seatId: 'opponent',
      towardSeatId: 'human',
      stance: 'wary',
      reason: 'massing',
      trust: null,
      threat: null,
      turnNumber: 2,
    });
    assert.equal(same.changed, false);
    const changed = upsertSideStance(gameDbOps, {
      seatId: 'opponent',
      towardSeatId: 'human',
      stance: 'hostile',
      reason: 'crossed',
      trust: null,
      threat: null,
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
    upsertSideStance(gameDbOps, { seatId: 'opponent', towardSeatId: 'human', stance: 'neutral', reason: '', trust: null, threat: null, turnNumber: 1 });
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

test('trust and threat are stored, change the row, and are added to an older table', () => {
  withTempGameDb('aw-side-scores-', () => {
    const base = { seatId: 'opponent', towardSeatId: 'human', stance: 'wary' as const, reason: 'massing', turnNumber: 1 };
    upsertSideStance(gameDbOps, { ...base, trust: 1, threat: 3 });
    const stored = listSideStances(gameDbOps, 'opponent')[0];
    assert.deepEqual([stored?.trust, stored?.threat], [1, 3]);
    assert.equal(upsertSideStance(gameDbOps, { ...base, trust: 1, threat: 3 }).changed, false);
    assert.equal(upsertSideStance(gameDbOps, { ...base, trust: 2, threat: 3 }).changed, true);
    assert.equal(upsertSideStance(gameDbOps, { ...base, trust: 2, threat: null }).changed, true);

    upsertSideStance(gameDbOps, { ...base, seatId: 'opponent2', trust: null, threat: null });
    assert.deepEqual(
      listAllSideStances(gameDbOps).map((row) => row.seatId),
      ['opponent', 'opponent2']
    );

    gameDbOps.run('DROP TABLE side_stances');
    gameDbOps.run(`CREATE TABLE side_stances (
      seat_id TEXT NOT NULL,
      toward_seat_id TEXT NOT NULL,
      stance TEXT NOT NULL,
      reason TEXT NOT NULL,
      updated_turn INTEGER NOT NULL,
      PRIMARY KEY (seat_id, toward_seat_id)
    )`);
    ensureSideStanceScoreColumns(gameDbOps);
    ensureSideStanceScoreColumns(gameDbOps);
    const columns = gameDbOps.getAll<{ name: string }>('PRAGMA table_info(side_stances)').map((column) => column.name);
    assert.deepEqual(columns.filter((name) => name === 'trust' || name === 'threat').sort(), ['threat', 'trust']);
  });
});
