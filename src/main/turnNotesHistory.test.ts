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
    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 1, { strategyText: 'Hold the line' });
    gameDb.upsertTurnLossNote('opponent', 'strategic', '', 1, '{"ranged":[{"unitType":"armor","displayName":"A"}],"melee":[],"returnFire":[],"airStrike":[],"other":[]}', '{"ranged":[],"melee":[],"returnFire":[],"airStrike":[],"other":[]}');
    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 2, { strategyText: 'Advance east' });
    const recent = gameDb.getRecentTurnNotes('opponent', 'strategic', '', 3, 3);
    assert.strictEqual(recent.length, 2);
    assert.strictEqual(recent[0]?.turnNumber, 1);
    assert.strictEqual(recent[1]?.turnNumber, 2);
    assert.strictEqual(recent[0]?.strategyText, 'Hold the line');
    assert.ok(recent[0]?.aiLossJson?.includes('A'));
    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 1, { strategyText: 'Revised hold' });
    const afterStrategyUpdate = gameDb.getRecentTurnNotes('opponent', 'strategic', '', 3, 3);
    assert.strictEqual(afterStrategyUpdate[0]?.strategyText, 'Revised hold');
    assert.ok(afterStrategyUpdate[0]?.aiLossJson?.includes('A'), 'strategy upsert preserves loss JSON');
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
    gameDb.upsertTurnStrategyNote('opponent', 'strategic', '', 1, { strategyText: 'Strategic plan' });
    gameDb.upsertTurnStrategyNote('opponent', 'tactical', 'tb-1', 1, { strategyText: 'Beat plan' });
    gameDb.clearTacticalTurnNotes();
    assert.strictEqual(gameDb.getRecentTurnNotes('opponent', 'tactical', 'tb-1', 2, 3).length, 0);
    assert.strictEqual(gameDb.getRecentTurnNotes('opponent', 'strategic', '', 2, 3).length, 1);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Verifies the single-row loss read returns the stored columns or null.
 *
 * Purpose: Guards `getTurnLossNoteColumns`, which the battle-loss writer merges into.
 * When to use: After changing `getTurnLossNoteColumns` SQL.
 * Expected outcome: Null for a missing key; the exact stored strings for an existing key.
 * Exceptions: None.
 */
async function testLossColumnsRead(): Promise<void> {
  const gameDb = await import('./gameDb');
  const { gameDbOps } = await import('./gameDb/dbConnection');
  const { getTurnLossNoteColumns } = await import('./gameDb/turnNotesHistory');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-turn-notes-'));
  try {
    gameDb.openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
    const key = { seatId: 'opponent', scope: 'strategic', battleId: 'tb-x', turnNumber: 3 } as const;
    assert.strictEqual(getTurnLossNoteColumns(gameDbOps, key), null);
    gameDb.upsertTurnLossNote('opponent', 'strategic', 'tb-x', 3, '{"a":1}', '{"b":2}');
    assert.deepStrictEqual(getTurnLossNoteColumns(gameDbOps, key), { ownLossJson: '{"a":1}', otherLossJson: '{"b":2}' });
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Verifies the battle-loss list returns only strategic battle rows for the seat and turns asked.
 *
 * Purpose: Guards `listStrategicBattleLossRows` filtering and order.
 * When to use: After changing `listStrategicBattleLossRows` SQL.
 * Expected outcome: Battle rows of turn 3 in battle-id order; no turn-own row, tactical row, other seat, or unasked turn; an empty turn list gives an empty list.
 * Exceptions: None.
 */
async function testStrategicBattleLossRows(): Promise<void> {
  const gameDb = await import('./gameDb');
  const { gameDbOps } = await import('./gameDb/dbConnection');
  const { listStrategicBattleLossRows } = await import('./gameDb/turnNotesHistory');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-turn-notes-'));
  try {
    gameDb.openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
    gameDb.upsertTurnLossNote('opponent', 'strategic', '', 3, '{"own":0}', '{"other":0}');
    gameDb.upsertTurnLossNote('opponent', 'strategic', 'tb-y', 3, '{"y":3}', '{"y":3}');
    gameDb.upsertTurnLossNote('opponent', 'strategic', 'tb-x', 3, '{"x":3}', '{"x":3}');
    gameDb.upsertTurnLossNote('opponent', 'strategic', 'tb-y', 5, '{"y":5}', '{"y":5}');
    gameDb.upsertTurnLossNote('opponent', 'tactical', 'tb-x', 3, '{"t":3}', '{"t":3}');
    gameDb.upsertTurnLossNote('opponent2', 'strategic', 'tb-x', 3, '{"z":3}', '{"z":3}');
    const rows = listStrategicBattleLossRows(gameDbOps, 'opponent', [3, 4]);
    assert.deepStrictEqual(rows.map((row) => [row.turnNumber, row.battleId]), [[3, 'tb-x'], [3, 'tb-y']]);
    assert.strictEqual(rows[0]?.ownLossJson, '{"x":3}');
    assert.deepStrictEqual(listStrategicBattleLossRows(gameDbOps, 'opponent', []), []);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function run(): Promise<void> {
  await testUpsertMergeAndRecentWindow();
  await testTacticalClearIsolation();
  await testLossColumnsRead();
  await testStrategicBattleLossRows();
  console.log('turnNotesHistory.test.ts passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
