/**
 * Contract tests for durable SQLite (better-sqlite3): user_version, persistence across reopen,
 * New Game clears standing_orders and ai_memory, regenerates terrain, corrupt/wrong-version recovery in test mode.
 * Fails fast when the native addon is missing so persistence coverage cannot be silently skipped.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function betterSqliteNativeAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const d = new Database(':memory:');
    d.close();
    return true;
  } catch {
    return false;
  }
}

// Database constructor from better-sqlite3 (required dynamically after native check).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function testFreshFileUserVersion(gameDb: typeof import('./gameDb'), Database: any): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.createFreshGameDatabaseAt(p);
    const d = new Database(p);
    gameDb.applyGameDbPragmas(d);
    gameDb.validateGameDatabaseOrThrow(d);
    const uv = d.pragma('user_version', { simple: true }) as number;
    assert.strictEqual(uv, gameDb.EXPECTED_USER_VERSION);
    d.close();
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testPersistenceTwoOpens(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.dbRun("INSERT OR REPLACE INTO game_config (key, value) VALUES ('map_size', 'small')");
    gameDb.closeGameDatabaseForTests();
    gameDb.openGameDatabaseAtPathForTests(p);
    const row = gameDb.dbGetOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'map_size'");
    assert.strictEqual(row?.value, 'small');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testResetClearsStandingOrdersAndMemory(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch('small');
    gameDb.dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES ('opponent', 'opponent-armor-1', 'defend', '{}', NULL, 'holding', 1, '[]')`
    );
    gameDb.dbRun(
      `INSERT INTO ai_memory (player_id, key, content, tier, created_turn, tags) VALUES ('opponent', 'k', 'v', 'stored', 1, '[]')`
    );
    gameDb.resetGameForNewMatch('small');
    const so = gameDb.dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM standing_orders');
    const mem = gameDb.dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM ai_memory');
    assert.strictEqual(so?.c ?? -1, 0);
    assert.strictEqual(mem?.c ?? -1, 0);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testResetRegeneratesTerrain(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch('small');
    gameDb.dbRun("UPDATE hexes SET terrain = 'land'");
    gameDb.resetGameForNewMatch('small');
    const water = gameDb.dbGetOne<{ c: number }>("SELECT COUNT(*) AS c FROM hexes WHERE terrain = 'water'");
    assert.ok((water?.c ?? 0) > 0, 'expected resetGameForNewMatch to reseed terrain with water hexes');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function testWrongUserVersionRecovers(gameDb: typeof import('./gameDb'), Database: any): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.createFreshGameDatabaseAt(p);
    gameDb.closeGameDatabaseForTests();
    const d = new Database(p);
    d.pragma('user_version = 99');
    d.close();
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.closeGameDatabaseForTests();
    const d2 = new Database(p);
    const uv = d2.pragma('user_version', { simple: true }) as number;
    assert.strictEqual(uv, gameDb.EXPECTED_USER_VERSION);
    d2.close();
    const backups = fs.readdirSync(dir).filter((f) => f.includes('.corrupt.'));
    assert.ok(backups.length >= 1, 'expected corrupt backup file');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function run(): void {
  if (!betterSqliteNativeAvailable()) {
    throw new Error(
      'gameDb.test.ts failed: better-sqlite3 native module missing (run npm run rebuild:native or npm ci with build tools)'
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const gameDb = require('./gameDb') as typeof import('./gameDb');
  testFreshFileUserVersion(gameDb, Database);
  testPersistenceTwoOpens(gameDb);
  testResetClearsStandingOrdersAndMemory(gameDb);
  testResetRegeneratesTerrain(gameDb);
  testWrongUserVersionRecovers(gameDb, Database);
  console.log('gameDb.test.ts passed');
}

run();
