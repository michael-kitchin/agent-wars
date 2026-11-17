/**
 * Turn notes stored per seat.
 * Run: `node dist/main/gameDb/turnNotesHistorySeats.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { clearTacticalTurnNotes, getRecentTurnNotes, upsertTurnStrategyNote } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';

/**
 * Opens a temporary database for one notes check.
 *
 * Purpose: Two seats writing the same turn must not share a row with the developer's match.
 * When to use: The test in this file.
 * Expected outcome: `runCase` sees an empty game database. The directory is removed afterward.
 * Exceptions: Propagates `runCase` errors after closing the database.
 */
function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-notes-seats-', runCase, { reset: false });
}

test('two seats keep separate notes and a tactical clear leaves strategic notes', () => {
  withTempDb(() => {
    const first = AI_SEAT_IDS[0];
    const second = AI_SEAT_IDS[1];
    upsertTurnStrategyNote(first, 'strategic', '', 1, { strategyText: 'Hold' });
    upsertTurnStrategyNote(second, 'strategic', '', 1, { strategyText: 'Push' });
    upsertTurnStrategyNote(second, 'tactical', 'tb-1', 1, { strategyText: 'Flank' });
    const firstNotes = getRecentTurnNotes(first, 'strategic', '', 2, 3);
    const secondNotes = getRecentTurnNotes(second, 'strategic', '', 2, 3);
    assert.equal(firstNotes.length, 1);
    assert.equal(firstNotes[0]?.strategyText, 'Hold');
    assert.equal(secondNotes.length, 1);
    assert.equal(secondNotes[0]?.strategyText, 'Push');
    clearTacticalTurnNotes('tb-1');
    assert.equal(getRecentTurnNotes(second, 'tactical', 'tb-1', 2, 3).length, 0);
    assert.equal(getRecentTurnNotes(second, 'strategic', '', 2, 3)[0]?.strategyText, 'Push');
    assert.equal(getRecentTurnNotes(first, 'strategic', '', 2, 3)[0]?.strategyText, 'Hold');
  });
});
