/**
 * Additive schema migrations that run whenever a game database opens.
 *
 * Purpose: A fresh database and an existing file must both end up with every table and column the on-open migrations add.
 * When to use: After adding or changing a migration in `applyAdditiveSchemaMigrations`.
 * Expected outcome: The cases below. Each case removes its temporary directory.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { closeGameDatabaseForTests, openGameDatabaseAtPathForTests } from '../gameDb';
import { getDbHandle } from './dbConnection';

/**
 * The tables the on-open migrations create.
 *
 * Purpose: One list drives both the fresh-open and the reopen assertions.
 * When to use: `assertMigratedSchema` and the drop step in the reopen case.
 * Expected outcome: Four table names.
 * Exceptions: None.
 */
const MIGRATED_TABLES = ['pending_air_drop_orders', 'match_records', 'side_messages', 'side_stances'] as const;

/**
 * The columns the on-open migrations add to existing tables, keyed by table.
 *
 * Purpose: Proves the column migrations ran on the open database.
 * When to use: `assertMigratedSchema`.
 * Expected outcome: Table name to the column names that must exist.
 * Exceptions: None.
 */
const MIGRATED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  res_s_hire_orders: ['reserved_credits'],
  seats: ['nickname', 'provider_sort', 'think_time_ms'],
  side_stances: ['trust', 'threat'],
};

/**
 * Asserts that every migrated table and column exists on the open database.
 *
 * Purpose: The shared check for both open paths.
 * When to use: After each open in the cases below.
 * Expected outcome: Returns when the schema is complete; throws an assertion error naming the missing item otherwise.
 * Exceptions: Throws `AssertionError` when a table or column is missing.
 */
function assertMigratedSchema(): void {
  const db = getDbHandle();
  assert.ok(db, 'database is open');
  for (const table of MIGRATED_TABLES) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    assert.ok(row, `table ${table} exists`);
  }
  for (const [table, columns] of Object.entries(MIGRATED_COLUMNS)) {
    const names = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
    for (const column of columns) assert.ok(names.has(column), `${table}.${column} exists`);
  }
}

test('a fresh database and a reopened file both carry every on-open migration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-migrations-'));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    assertMigratedSchema();
    const db = getDbHandle();
    assert.ok(db);
    for (const table of MIGRATED_TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
    closeGameDatabaseForTests();
    openGameDatabaseAtPathForTests(dbPath);
    assertMigratedSchema();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
