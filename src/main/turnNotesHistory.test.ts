/**
 * Tests for turn_notes_history persistence. Run with: node dist/main/turnNotesHistory.test.js
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Verifies strategy and loss upserts merge into one row and recent query ordering.
 *
 * Purpose: Guards DB API contracts for prompt history.
 * When to use: After changing `turnNotesHistory.ts` SQL.
 * Expected outcome: Strategy-only then loss upsert preserves both; recent query returns ascending window.
 * Exceptions: None.
 */
async function testUpsertMergeAndRecentWindow(): Promise<void> {
  const gameDb = await import('./gameDb');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-turn-notes-'));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(dbPath);
    gameDb.upsertTurnStrategyNote('strategic', '', 1, 'Hold the line');
    gameDb.upsertTurnLossNote('strategic', '', 1, '{"ranged":[],"melee":[],"returnFire":[],"airStrike":[],"other":[]}', '{"ranged":[{"unitType":"armor","displayName":"A"}],"melee":[],"returnFire":[],"airStrike":[],"other":[]}');
    gameDb.upsertTurnStrategyNote('strategic', '', 2, 'Advance east');
    const recent = gameDb.getRecentTurnNotes('strategic', '', 3, 3);
    assert.strictEqual(recent.length, 2);
    assert.strictEqual(recent[0]?.turnNumber, 1);
    assert.strictEqual(recent[1]?.turnNumber, 2);
    assert.strictEqual(recent[0]?.strategyText, 'Hold the line');
    assert.ok(recent[0]?.aiLossJson?.includes('A'));
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Verifies tactical clear removes tactical rows but not strategic rows.
 *
 * Purpose: Guards per-battle tactical history reset.
 * When to use: After changing `clearTacticalTurnNotes`.
 * Expected outcome: Strategic row remains; tactical row deleted.
 * Exceptions: None.
 */
async function testTacticalClearIsolation(): Promise<void> {
  const gameDb = await import('./gameDb');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-turn-notes-'));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(dbPath);
    gameDb.upsertTurnStrategyNote('strategic', '', 1, 'Strategic plan');
    gameDb.upsertTurnStrategyNote('tactical', 'tb-1', 1, 'Beat plan');
    gameDb.clearTacticalTurnNotes();
    assert.strictEqual(gameDb.getRecentTurnNotes('tactical', 'tb-1', 2, 3).length, 0);
    assert.strictEqual(gameDb.getRecentTurnNotes('strategic', '', 2, 3).length, 1);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function run(): Promise<void> {
  await testUpsertMergeAndRecentWindow();
  await testTacticalClearIsolation();
  console.log('turnNotesHistory.test.ts passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
