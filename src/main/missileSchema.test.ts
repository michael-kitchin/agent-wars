/**
 * Schema contracts for the missile unit type and its launch table.
 *
 * Purpose: A fresh database must accept a missile row and must contain the launch table.
 * When to use: After changing the unit-type check or `pending_missile_launches`.
 * Expected outcome: The insert succeeds and the table is present.
 * Exceptions: None. The temporary file is removed afterward.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { closeGameDatabaseForTests, createFreshGameDatabaseAt, dbGetOne, dbRun } from './gameDb';

test('a fresh database accepts a missile unit and has the launch table', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-missile-schema-'));
  const databasePath = path.join(dir, 'game.sqlite');
  try {
    createFreshGameDatabaseAt(databasePath);
    dbRun(
      `INSERT INTO hexes (h3_index, terrain, terrain_kind) VALUES (?, 'land', 'plains')`,
      ['hex']
    );
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, 'human', 'missile', ?)`,
      ['h1-m1', 'hex']
    );
    const stored = dbGetOne<{ unit_type: string }>(
      'SELECT unit_type FROM units WHERE id = ?',
      ['h1-m1']
    );
    const table = dbGetOne<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pending_missile_launches'`
    );
    assert.equal(stored?.unit_type, 'missile');
    assert.equal(table?.name, 'pending_missile_launches');
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
