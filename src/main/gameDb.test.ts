/**
 * Contract tests for durable SQLite (better-sqlite3): user_version, persistence across reopen,
 * New Game clears standing_orders and ai_memory, regenerates terrain, corrupt/wrong-version recovery in test mode.
 * Fails fast when the native addon is missing so persistence coverage cannot be silently skipped.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cellToLatLng } from 'h3-js';

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
    gameDb.resetGameForNewMatch();
    gameDb.dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES ('opponent', 'opponent-armor-1', 'defend', '{}', NULL, 'holding', 1, '[]')`
    );
    gameDb.dbRun(
      `INSERT INTO ai_memory (player_id, key, content, tier, created_turn, tags) VALUES ('opponent', 'k', 'v', 'stored', 1, '[]')`
    );
    gameDb.resetGameForNewMatch();
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
    gameDb.resetGameForNewMatch();
    gameDb.dbRun("UPDATE hexes SET terrain = 'land'");
    gameDb.resetGameForNewMatch();
    const water = gameDb.dbGetOne<{ c: number }>("SELECT COUNT(*) AS c FROM hexes WHERE terrain = 'water'");
    assert.ok((water?.c ?? 0) > 0, 'expected resetGameForNewMatch to reseed terrain with water hexes');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testSeededUnitsUseRegionalSpawnContracts(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    const rows = gameDb.dbGetAll<{ h3Index: string; player: string; unitType: string; terrain: string }>(
      `SELECT u.h3_index AS h3Index, u.player AS player, u.unit_type AS unitType, h.terrain AS terrain
       FROM units u
       JOIN hexes h ON h.h3_index = u.h3_index`
    );
    assert.ok(rows.length > 0, 'expected resetGameForNewMatch to seed units');

    const inNortheastAsia = (lat: number, lng: number) =>
      (lat >= 35 && lat <= 78 && lng >= 95 && lng <= 180) ||
      (lat >= 30 && lat <= 80 && lng >= 80 && lng <= 180) ||
      (lat >= 20 && lat <= 82 && lng >= 60 && lng <= 180);
    const inSouthernAfrica = (lat: number, lng: number) =>
      (lat >= -38 && lat <= -22 && lng >= 10 && lng <= 42) ||
      (lat >= -42 && lat <= -18 && lng >= 5 && lng <= 45) ||
      (lat >= -45 && lat <= -12 && lng >= -5 && lng <= 50) ||
      (lat >= -50 && lat <= -5 && lng >= -20 && lng <= 55);
    const inPacific = (lat: number, lng: number) => lat >= -55 && lat <= 55 && (lng >= 120 || lng <= -90);
    const inAtlantic = (lat: number, lng: number) => lat >= -55 && lat <= 60 && lng >= -75 && lng <= 20;
    const inIndian = (lat: number, lng: number) => lat >= -50 && lat <= 30 && lng >= 20 && lng <= 120;
    let humanLandInAsia = 0;
    let humanLandInAfrica = 0;
    let opponentLandInAsia = 0;
    let opponentLandInAfrica = 0;

    for (const row of rows) {
      const [lat, lng] = cellToLatLng(row.h3Index);
      if (row.unitType === 'naval') {
        assert.ok(row.terrain === 'water', `expected naval unit ${row.h3Index} on water terrain`);
        assert.ok(
          inPacific(lat, lng) || inAtlantic(lat, lng) || inIndian(lat, lng),
          `expected naval unit at ${row.h3Index} in Pacific/Atlantic/Indian ocean`
        );
        continue;
      }
      assert.strictEqual(row.terrain, 'land', `expected land unit ${row.h3Index} on land terrain`);
      const isAsia = inNortheastAsia(lat, lng);
      const isAfrica = inSouthernAfrica(lat, lng);
      assert.ok(isAsia || isAfrica, `expected land unit at ${row.h3Index} in northeast Asia or southern Africa`);
      if (row.player === 'human') {
        if (isAsia) humanLandInAsia++;
        if (isAfrica) humanLandInAfrica++;
      } else {
        if (isAsia) opponentLandInAsia++;
        if (isAfrica) opponentLandInAfrica++;
      }
    }
    const humanAllInAsia = humanLandInAsia > 0 && humanLandInAfrica === 0;
    const humanAllInAfrica = humanLandInAfrica > 0 && humanLandInAsia === 0;
    const opponentAllInAsia = opponentLandInAsia > 0 && opponentLandInAfrica === 0;
    const opponentAllInAfrica = opponentLandInAfrica > 0 && opponentLandInAsia === 0;
    assert.ok(
      (humanAllInAsia && opponentAllInAfrica) || (humanAllInAfrica && opponentAllInAsia),
      `expected randomized side assignment (one side in Asia, other in Africa), got human asia=${humanLandInAsia} africa=${humanLandInAfrica}, opponent asia=${opponentLandInAsia} africa=${opponentLandInAfrica}`
    );
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testFogOfWarToggleVisibilityContract(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);

    // Fog disabled: human perspective should receive full-board visibility and full enemy roster.
    gameDb.resetGameForNewMatch({ fogOfWarEnabled: false });
    const fullState = gameDb.getGameState();
    const noFogHuman = gameDb.getGameStateForPlayer('human');
    assert.strictEqual(noFogHuman.hexes.length, fullState.hexes.length);
    assert.strictEqual(noFogHuman.units.length, fullState.units.length);
    assert.strictEqual(noFogHuman.visibleHexes?.length ?? -1, fullState.hexes.length);
    assert.strictEqual(noFogHuman.exploredHexes?.length ?? -1, fullState.hexes.length);
    assert.strictEqual(noFogHuman.staleHexes?.length ?? -1, 0);

    // Fog enabled: map should still load, but human perspective should not exceed full-map visibility contract.
    gameDb.resetGameForNewMatch({ fogOfWarEnabled: true });
    const fogFullState = gameDb.getGameState();
    const fogHuman = gameDb.getGameStateForPlayer('human');
    assert.strictEqual(fogHuman.hexes.length, fogFullState.hexes.length);
    assert.ok((fogHuman.visibleHexes?.length ?? 0) <= fogFullState.hexes.length);
    assert.ok((fogHuman.exploredHexes?.length ?? 0) <= fogFullState.hexes.length);
    assert.ok(fogHuman.units.length <= fogFullState.units.length);
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
  testSeededUnitsUseRegionalSpawnContracts(gameDb);
  testFogOfWarToggleVisibilityContract(gameDb);
  testWrongUserVersionRecovers(gameDb, Database);
  console.log('gameDb.test.ts passed');
}

run();
