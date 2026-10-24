/**
 * Turn notes stored per seat.
 * Run: `node dist/main/gameDb/turnNotesHistorySeats.test.js`
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import {
  clearTacticalTurnNotes,
  closeGameDatabaseForTests,
  getRecentTurnNotes,
  openGameDatabaseAtPathForTests,
  upsertTurnStrategyNote,
} from '../gameDb';

/**
 * Opens a temporary database for one notes check.
 *
 * Purpose: Two seats writing the same turn must not share a row with the developer's match.
 * When to use: The test in this file.
 * Expected outcome: `runCase` sees an empty game database. The directory is removed afterward.
 * Exceptions: Propagates `runCase` errors after closing the database.
 */
function withTempDb(runCase: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-notes-seats-'));
  openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
  try {
    runCase();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('two seats keep separate notes and a tactical clear leaves strategic notes', () => {
  withTempDb(() => {
    const first = AI_SEAT_IDS[0];
    const second = AI_SEAT_IDS[1];
    upsertTurnStrategyNote(first, 'strategic', '', 1, { strategyText: 'Hold', messageText: null });
    upsertTurnStrategyNote(second, 'strategic', '', 1, { strategyText: 'Push', messageText: null });
    upsertTurnStrategyNote(second, 'tactical', 'tb-1', 1, { strategyText: 'Flank', messageText: null });
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
