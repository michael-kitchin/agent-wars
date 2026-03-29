/**
 * Game state persistence in SQLite via better-sqlite3 (native). Single file under Electron userData;
 * durable across restarts (no wipe on launch). Schema: hexes, units, turn state, pending orders, AI tables.
 *
 * Legacy sql.js file `game.db` is not migrated; current baseline file is GAME_DB_FILE_NAME.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, dialog } from 'electron';
import Database from 'better-sqlite3';
import { cellToLatLng } from 'h3-js';
import { getOrderedHexList, getWorldUnitCounts } from './mapData';
import {
  assertTerrainMetadataMatchesHexList,
} from './terrainMetadataLoad';
import {
  ensureTerrainClassificationCacheLoaded,
  getTerrainRes1KindsFromCache,
} from './terrainClassificationCache';
import { pipelineTerrainToPassability } from './terrainPassability';
import { logDebug, logError, logTrace } from './logger';
import type { GameStateSnapshot } from '../shared/ipcTypes';

export type { GameStateSnapshot } from '../shared/ipcTypes';

/** Baseline schema version; bump when a future milestone adds migration chains. */
export const EXPECTED_USER_VERSION = 5;

/**
 * Baseline filename for world-map + terrain_kind schema (v5: adds wetlands passability + terrain kind).
 */
export const GAME_DB_FILE_NAME = 'game-baseline-v5.sqlite';

let db: InstanceType<typeof Database> | null = null;

const REQUIRED_TABLES = [
  'hexes',
  'units',
  'turn_state',
  'pending_orders',
  'pending_ranged_orders',
  'game_config',
  'ai_memory',
  'standing_orders',
  'ai_callback_subscriptions',
  'ai_pending_orders',
  'ai_combat_since_consultation',
] as const;

/**
 * Applies the 1.1 SQLite profile: in-memory rollback journal, foreign keys, deferred FK checks, synchronous OFF.
 * Favors performance over power-loss durability; see milestone plan Section 4 item 7.
 */
export function applyGameDbPragmas(database: InstanceType<typeof Database>): void {
  database.pragma('journal_mode = MEMORY');
  database.pragma('foreign_keys = ON');
  database.pragma('defer_foreign_keys = ON');
  database.pragma('synchronous = OFF');
}

function getFullDdl(): string {
  return `
    CREATE TABLE IF NOT EXISTS hexes (
      h3_index TEXT PRIMARY KEY,
      terrain TEXT NOT NULL CHECK (terrain IN ('land', 'water', 'coastal', 'wetlands')),
      terrain_kind TEXT NOT NULL CHECK (terrain_kind IN ('water', 'coastal', 'wetlands', 'plains', 'forest', 'mountain', 'desert', 'arctic'))
    );

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      player TEXT NOT NULL,
      unit_type TEXT NOT NULL CHECK (unit_type IN ('infantry', 'armor', 'naval')),
      h3_index TEXT NOT NULL,
      FOREIGN KEY (h3_index) REFERENCES hexes(h3_index)
    );

    CREATE TABLE IF NOT EXISTS turn_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      phase TEXT NOT NULL CHECK (phase IN ('planning', 'resolution')),
      turn_number INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_orders (
      unit_id TEXT NOT NULL,
      to_h3_index TEXT NOT NULL,
      PRIMARY KEY (unit_id)
    );

    CREATE TABLE IF NOT EXISTS pending_ranged_orders (
      unit_id TEXT PRIMARY KEY,
      target_h3_index TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_memory (
      player_id TEXT NOT NULL,
      key TEXT NOT NULL,
      content TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'stored',
      created_turn INTEGER NOT NULL,
      expires_turn INTEGER,
      recurring_interval INTEGER,
      next_trigger_turn INTEGER,
      last_triggered_turn INTEGER,
      tags TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (player_id, key)
    );

    CREATE TABLE IF NOT EXISTS standing_orders (
      player_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      order_type TEXT NOT NULL,
      params TEXT NOT NULL,
      computed_route TEXT,
      status TEXT NOT NULL,
      created_turn INTEGER NOT NULL,
      origin_hex TEXT NOT NULL,
      PRIMARY KEY (player_id, unit_id)
    );

    CREATE TABLE IF NOT EXISTS ai_callback_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      params TEXT NOT NULL,
      subscribed_turn INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_pending_orders (
      player_id TEXT PRIMARY KEY,
      movement_orders TEXT NOT NULL,
      ranged_orders TEXT NOT NULL,
      strategy_text TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_combat_since_consultation (
      player_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      PRIMARY KEY (player_id, unit_id)
    );
  `;
}

/**
 * Throws if the opened database is not the expected baseline (user_version and required tables).
 * Call after applyGameDbPragmas on an existing file.
 */
export function validateGameDatabaseOrThrow(database: InstanceType<typeof Database>): void {
  const uv = database.pragma('user_version', { simple: true }) as number;
  if (uv !== EXPECTED_USER_VERSION) {
    throw new Error(`Invalid user_version: expected ${EXPECTED_USER_VERSION}, got ${uv}`);
  }
  for (const t of REQUIRED_TABLES) {
    const row = database.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(t);
    if (!row) throw new Error(`Missing required table: ${t}`);
  }
}

function closeDbHandle(): void {
  if (db) {
    try {
      db.close();
    } catch (err) {
      logError('gameDb closeDbHandle: error closing database', err);
    }
    db = null;
  }
}

function run(sql: string, params: unknown[] = []): void {
  if (!db) return;
  db.prepare(sql).run(...(params as never[]));
}

function getOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  if (!db) return undefined;
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

function getAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  if (!db) return [];
  return db.prepare(sql).all(...(params as never[])) as T[];
}

function getCanonicalDbPath(): string {
  return path.join(app.getPath('userData'), GAME_DB_FILE_NAME);
}

function ensureTurnStateRow(): void {
  if (!db) return;
  const row = getOne('SELECT 1 FROM turn_state WHERE id = 1');
  if (!row) {
    run('INSERT INTO turn_state (id, phase, turn_number) VALUES (1, ?, ?)', ['planning', 1]);
  }
}

/**
 * Creates a new database at the given path: pragmas, DDL, user_version, turn row, optional seed.
 * Parent directories are created when missing. Caller must ensure the path is writable and not locked.
 */
export function createFreshGameDatabaseAt(canonicalPath: string): void {
  logDebug('gameDb createFreshGameDatabaseAt', { canonicalPath });
  closeDbHandle();
  const dir = path.dirname(canonicalPath);
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(canonicalPath);
  applyGameDbPragmas(db);
  db.exec(getFullDdl());
  ensureTurnStateRow();
  db.pragma(`user_version = ${EXPECTED_USER_VERSION}`);
  seedGameSeedIfMissing();
}

/**
 * Opens or creates the game database at the given absolute path (tests only). Uses silent recovery on validation
 * failure (rename corrupt set or delete, then recreate) — no dialogs. Does not use app.getPath.
 * Call closeGameDatabaseForTests when done to reset module state.
 */
export function openGameDatabaseAtPathForTests(absPath: string): void {
  logDebug('gameDb openGameDatabaseAtPathForTests', { absPath });
  closeDbHandle();
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(absPath)) {
    createFreshGameDatabaseAt(absPath);
    return;
  }

  let d: InstanceType<typeof Database> | null = null;
  try {
    d = new Database(absPath);
    applyGameDbPragmas(d);
    validateGameDatabaseOrThrow(d);
    db = d;
    d = null;
  } catch (err) {
    if (d) {
      try {
        d.close();
      } catch (closeErr) {
        logError('gameDb openGameDatabaseAtPathForTests: failed to close temp handle after validation error', closeErr);
      }
    }
    logError('gameDb openGameDatabaseAtPathForTests: open/validate failed, recovering', err);
    closeDbHandle();
    silentRecoverCorruptDatabase(absPath);
  }
}

/**
 * Closes the DB and clears test mode. Use after tests that called openGameDatabaseAtPathForTests.
 */
export function closeGameDatabaseForTests(): void {
  logDebug('gameDb closeGameDatabaseForTests');
  closeDbHandle();
}

function silentRecoverCorruptDatabase(canonicalPath: string): void {
  const renamed = tryRenameCorruptSet(canonicalPath);
  if (!renamed) {
    const deleted = tryDeleteCanonicalAndSidecars(canonicalPath);
    if (!deleted) {
      throw new Error('gameDb silentRecoverCorruptDatabase: could not rename or delete corrupt database');
    }
  }
  createFreshGameDatabaseAt(canonicalPath);
}

function isoTimestampForFilename(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

function tryRenameCorruptSet(canonicalPath: string): boolean {
  const parsed = path.parse(canonicalPath);
  const backupMain = path.join(parsed.dir, `${parsed.name}.corrupt.${isoTimestampForFilename()}${parsed.ext}`);
  const oldWal = `${canonicalPath}-wal`;
  const oldShm = `${canonicalPath}-shm`;
  const newWal = `${backupMain}-wal`;
  const newShm = `${backupMain}-shm`;
  try {
    fs.renameSync(canonicalPath, backupMain);
    if (fs.existsSync(oldWal)) fs.renameSync(oldWal, newWal);
    if (fs.existsSync(oldShm)) fs.renameSync(oldShm, newShm);
    logDebug('gameDb tryRenameCorruptSet: success', { backupMain });
    return true;
  } catch (err) {
    logError('gameDb tryRenameCorruptSet: failed', err);
    return false;
  }
}

function tryDeleteCanonicalAndSidecars(canonicalPath: string): boolean {
  const paths = [`${canonicalPath}-wal`, `${canonicalPath}-shm`, canonicalPath];
  try {
    for (const p of paths) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    logDebug('gameDb tryDeleteCanonicalAndSidecars: success');
    return true;
  } catch (err) {
    logError('gameDb tryDeleteCanonicalAndSidecars: failed', err);
    return false;
  }
}

function recoverCorruptDatabaseUi(canonicalPath: string, cause: unknown): void {
  closeDbHandle();
  dialog.showErrorBox(
    'Database problem',
    'The game database file is invalid or incompatible with this version of Agent Wars.\n\n' +
      'The app will try to rename the existing file (one attempt) and create a new empty database.\n' +
      'After that, use New game from the menu to start playing.'
  );
  logError('gameDb recoverCorruptDatabaseUi: starting recovery', cause);

  const renamed = tryRenameCorruptSet(canonicalPath);
  if (!renamed) {
    logError('gameDb recoverCorruptDatabaseUi: rename failed, attempting delete', cause);
    const deleted = tryDeleteCanonicalAndSidecars(canonicalPath);
    if (!deleted) {
      logError('gameDb recoverCorruptDatabaseUi: delete failed, exiting', cause);
      dialog.showErrorBox(
        'Database recovery failed',
        'The game could not rename or remove the damaged database file.\n\n' +
          'Please remove or move the database file manually (and any .sqlite-wal / .sqlite-shm files next to it), then restart the application.'
      );
      app.exit(1);
      return;
    }
    logDebug('gameDb recoverCorruptDatabaseUi: path cleared after failed rename');
  } else {
    logDebug('gameDb recoverCorruptDatabaseUi: corrupt file renamed; creating fresh DB');
  }

  try {
    createFreshGameDatabaseAt(canonicalPath);
  } catch (err) {
    logError('gameDb recoverCorruptDatabaseUi: createFreshGameDatabaseAt failed', err);
    dialog.showErrorBox('Database error', 'Could not create a new game database. See logs for details.');
    app.exit(1);
  }
}

/**
 * Initializes the game database for the Electron app: durable file under userData, pragmas, user_version hook,
 * and recovery UI on corrupt/incompatible files (Section 4 item 5). Call once when the app is ready.
 */
export async function initDatabase(): Promise<void> {
  logDebug('gameDb initDatabase');
  const canonicalPath = getCanonicalDbPath();
  fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });

  if (!fs.existsSync(canonicalPath)) {
    createFreshGameDatabaseAt(canonicalPath);
    ensureTerrainClassificationCacheLoaded();
    return;
  }

  let d: InstanceType<typeof Database> | null = null;
  try {
    d = new Database(canonicalPath);
    applyGameDbPragmas(d);
    validateGameDatabaseOrThrow(d);
    db = d;
    d = null;
    ensureTurnStateRow();
    seedGameSeedIfMissing();
    logDebug('gameDb initDatabase: opened existing', { canonicalPath });
  } catch (err) {
    if (d) {
      try {
        d.close();
      } catch (closeErr) {
        logError('gameDb initDatabase: failed to close temp handle after validation error', closeErr);
      }
    }
    logError('gameDb initDatabase: validation/open failed', err);
    recoverCorruptDatabaseUi(canonicalPath, err);
  }

  // Keep terrain metadata failures distinct from DB recovery.
  ensureTerrainClassificationCacheLoaded();
}

function seedGameSeedIfMissing(): void {
  if (db === null) return;
  const row = getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_seed'");
  if (row) return;
  const seed = Math.floor(Math.random() * 2 ** 31);
  run("INSERT INTO game_config (key, value) VALUES ('game_seed', ?)", [String(seed)]);
}

/**
 * Returns the persisted RNG seed for map generation (game_config game_seed). Use for reproducibility and tests;
 * returns 0 if the DB is closed or the key is missing or invalid.
 */
export function getGameSeed(): number {
  logTrace('getGameSeed');
  if (db === null) return 0;
  const row = getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_seed'");
  if (!row) return 0;
  const n = parseInt(row.value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Seeds all world hexes from bundled `terrain_res1_metadata.json` via the in-memory classification cache:
 * `terrain` is passability (land / water / coastal / wetlands); `terrain_kind` preserves pipeline labels for the renderer.
 */
function seedHexesFromTerrainMetadata(): void {
  logDebug('gameDb seedHexesFromTerrainMetadata');
  if (db === null) return;
  ensureTerrainClassificationCacheLoaded();
  const hexes = getOrderedHexList();
  const byH3 = getTerrainRes1KindsFromCache();
  assertTerrainMetadataMatchesHexList(byH3, hexes);
  for (const h3 of hexes) {
    const kind = byH3.get(h3);
    if (!kind) {
      logError('gameDb seedHexesFromTerrainMetadata: missing row', new Error(`no classified kind for ${h3}`));
      throw new Error(`terrain metadata missing h3_index ${h3}`);
    }
    const terrain = pipelineTerrainToPassability(kind);
    run('INSERT INTO hexes (h3_index, terrain, terrain_kind) VALUES (?, ?, ?)', [h3, terrain, kind]);
  }
}

interface SpawnCandidate {
  h3: string;
  lat: number;
  lng: number;
  terrain: string;
}

function lngDistanceDegrees(a: number, b: number): number {
  const d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
}

function squaredGeoDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = aLat - bLat;
  const dLng = lngDistanceDegrees(aLng, bLng);
  return dLat * dLat + dLng * dLng;
}

function northeastAsiaLandRegionStages(): Array<(c: SpawnCandidate) => boolean> {
  return [
    (c) => c.terrain === 'land' && c.lat >= 35 && c.lat <= 78 && c.lng >= 95 && c.lng <= 180,
    (c) => c.terrain === 'land' && c.lat >= 30 && c.lat <= 80 && c.lng >= 80 && c.lng <= 180,
    (c) => c.terrain === 'land' && c.lat >= 20 && c.lat <= 82 && c.lng >= 60 && c.lng <= 180,
  ];
}

function southernAfricaLandRegionStages(): Array<(c: SpawnCandidate) => boolean> {
  return [
    (c) => c.terrain === 'land' && c.lat >= -38 && c.lat <= -22 && c.lng >= 10 && c.lng <= 42,
    (c) => c.terrain === 'land' && c.lat >= -42 && c.lat <= -18 && c.lng >= 5 && c.lng <= 45,
    (c) => c.terrain === 'land' && c.lat >= -45 && c.lat <= -12 && c.lng >= -5 && c.lng <= 50,
    (c) => c.terrain === 'land' && c.lat >= -50 && c.lat <= -5 && c.lng >= -20 && c.lng <= 55,
  ];
}

function isPacificOceanHex(c: SpawnCandidate): boolean {
  return c.terrain === 'water' && c.lat >= -55 && c.lat <= 55 && (c.lng >= 120 || c.lng <= -90);
}

function isAtlanticOceanHex(c: SpawnCandidate): boolean {
  return c.terrain === 'water' && c.lat >= -55 && c.lat <= 60 && c.lng >= -75 && c.lng <= 20;
}

function isIndianOceanHex(c: SpawnCandidate): boolean {
  return c.terrain === 'water' && c.lat >= -50 && c.lat <= 30 && c.lng >= 20 && c.lng <= 120;
}

function pickClosestSpawnCandidates(
  candidates: ReadonlyArray<SpawnCandidate>,
  count: number,
  usedH3: Set<string>,
  targetLat: number,
  targetLng: number
): SpawnCandidate[] {
  const ranked = candidates
    .filter((c) => !usedH3.has(c.h3))
    .map((c) => ({ c, d2: squaredGeoDistance(c.lat, c.lng, targetLat, targetLng) }))
    .sort((a, b) => a.d2 - b.d2);
  const picked: SpawnCandidate[] = [];
  for (const item of ranked) {
    if (picked.length >= count) break;
    if (usedH3.has(item.c.h3)) continue;
    picked.push(item.c);
    usedH3.add(item.c.h3);
  }
  return picked;
}

function selectRegionalLandCandidates(
  allCandidates: ReadonlyArray<SpawnCandidate>,
  requiredCount: number,
  regionName: string,
  stages: Array<(c: SpawnCandidate) => boolean>
): SpawnCandidate[] {
  let last: SpawnCandidate[] = [];
  for (let i = 0; i < stages.length; i++) {
    const stageCandidates = allCandidates.filter(stages[i]!);
    if (stageCandidates.length >= requiredCount) {
      if (i > 0) {
        logDebug('gameDb seedUnits: expanded regional land spawn search', {
          regionName,
          stage: i + 1,
          candidateCount: stageCandidates.length,
          requiredCount,
        });
      }
      return stageCandidates;
    }
    last = stageCandidates;
  }
  logError(
    'gameDb seedUnits: insufficient regional land spawn hexes after staged expansion',
    new Error(`${regionName}: required ${requiredCount}, got ${last.length}`)
  );
  throw new Error(`Could not find required ${regionName} land spawn hexes`);
}

function seedUnits(): void {
  logDebug('gameDb seedUnits');
  if (db === null) return;
  const hexes = getOrderedHexList();
  const counts = getWorldUnitCounts();
  const terrainRows = getAll<{ h3_index: string; terrain: string }>('SELECT h3_index, terrain FROM hexes');
  const terrainByH3 = new Map(terrainRows.map((r) => [r.h3_index, r.terrain]));
  const candidates: SpawnCandidate[] = hexes.map((h3) => {
    const [lat, lng] = cellToLatLng(h3);
    return { h3, lat, lng, terrain: terrainByH3.get(h3) ?? 'land' };
  });
  const landPerSide = counts.infantry + counts.armor;
  const usedH3 = new Set<string>();
  const asiaLandCandidates = selectRegionalLandCandidates(
    candidates,
    landPerSide,
    'northeast Asia',
    northeastAsiaLandRegionStages()
  );
  const africaLandCandidates = selectRegionalLandCandidates(
    candidates,
    landPerSide,
    'southern Africa',
    southernAfricaLandRegionStages()
  );
  const humanStartsInAsia = Math.random() < 0.5;
  logDebug('gameDb seedUnits: randomized land spawn region assignment', { humanStartsInAsia });
  const humanLand = humanStartsInAsia
    ? pickClosestSpawnCandidates(asiaLandCandidates, landPerSide, usedH3, 62, 145)
    : pickClosestSpawnCandidates(africaLandCandidates, landPerSide, usedH3, -34, 24);
  const opponentLand = humanStartsInAsia
    ? pickClosestSpawnCandidates(africaLandCandidates, landPerSide, usedH3, -34, 24)
    : pickClosestSpawnCandidates(asiaLandCandidates, landPerSide, usedH3, 62, 145);
  if (humanLand.length < landPerSide || opponentLand.length < landPerSide) {
    throw new Error('Could not allocate required regional land spawn hexes');
  }

  const humanUnits: [string, string, string][] = [];
  let idx = 0;
  for (let i = 0; i < counts.infantry; i++) {
    humanUnits.push([`human-infantry-${i + 1}`, 'infantry', humanLand[idx++]!.h3]);
  }
  for (let i = 0; i < counts.armor; i++) {
    humanUnits.push([`human-armor-${i + 1}`, 'armor', humanLand[idx++]!.h3]);
  }
  const pacificCandidates = candidates.filter(isPacificOceanHex);
  const atlanticCandidates = candidates.filter(isAtlanticOceanHex);
  const indianCandidates = candidates.filter(isIndianOceanHex);
  const humanNavalPools = [pacificCandidates, indianCandidates, atlanticCandidates];
  for (let i = 0; i < counts.naval; i++) {
    let spawn: SpawnCandidate | null = null;
    for (const pool of humanNavalPools) {
      const picked = pickClosestSpawnCandidates(pool, 1, usedH3, 10, -150);
      if (picked.length > 0) {
        spawn = picked[0]!;
        break;
      }
    }
    if (!spawn) throw new Error('Could not allocate required human naval spawn hex');
    humanUnits.push([`human-naval-${i + 1}`, 'naval', spawn.h3]);
  }
  for (const [id, unitType, h3Index] of humanUnits) {
    run('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, 'human', unitType, h3Index]);
  }

  const opponentUnits: [string, string, string][] = [];
  idx = 0;
  for (let i = 0; i < counts.infantry; i++) {
    opponentUnits.push([`opponent-infantry-${i + 1}`, 'infantry', opponentLand[idx++]!.h3]);
  }
  for (let i = 0; i < counts.armor; i++) {
    opponentUnits.push([`opponent-armor-${i + 1}`, 'armor', opponentLand[idx++]!.h3]);
  }
  const opponentNavalPools = [atlanticCandidates, indianCandidates, pacificCandidates];
  for (let i = 0; i < counts.naval; i++) {
    let spawn: SpawnCandidate | null = null;
    for (const pool of opponentNavalPools) {
      const picked = pickClosestSpawnCandidates(pool, 1, usedH3, 0, -25);
      if (picked.length > 0) {
        spawn = picked[0]!;
        break;
      }
    }
    if (!spawn) throw new Error('Could not allocate required opponent naval spawn hex');
    opponentUnits.push([`opponent-naval-${i + 1}`, 'naval', spawn.h3]);
  }
  for (const [id, unitType, h3Index] of opponentUnits) {
    run('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, 'opponent', unitType, h3Index]);
  }
}

/**
 * Returns the set of all H3 indices present in the hexes table. Use for pathfinding domain, validation, and
 * any "is this cell on the map?" check; empty set when the DB is empty or closed.
 */
export function getMapHexSet(): Set<string> {
  logTrace('getMapHexSet');
  const rows = getAll<{ h3_index: string }>('SELECT h3_index FROM hexes');
  return new Set(rows.map((r) => r.h3_index));
}

/**
 * No-op for 1.1: better-sqlite3 persists to the open file synchronously; kept so tool modules can keep calling it.
 */
export function saveDatabase(): void {
  logTrace('gameDb saveDatabase (no-op; file-backed auto-persist)');
}

export function getGameState(): GameStateSnapshot {
  logTrace('getGameState');
  if (db === null) {
    return {
      hexes: [],
      units: [],
      phase: 'planning',
      turnNumber: 1,
      pendingOrders: [],
    };
  }

  const hexCount = getOne<{ c: number }>('SELECT COUNT(*) AS c FROM hexes');
  const hasHexes = hexCount && hexCount.c > 0;
  const ordered = hasHexes ? getOrderedHexList() : [];
  const hexRows: { h3Index: string; terrain: string; terrainKind: string }[] = ordered.map((h3Index) => {
    const row = getOne<{ terrain: string; terrain_kind: string }>(
      'SELECT terrain, terrain_kind FROM hexes WHERE h3_index = ?',
      [h3Index]
    );
    return {
      h3Index,
      terrain: row?.terrain ?? 'land',
      terrainKind: row?.terrain_kind ?? 'plains',
    };
  });
  const unitRows = getAll<{ id: string; player: string; unitType: string; h3Index: string }>(
    'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units'
  );
  const turnRow = getOne<{ phase: string; turnNumber: number }>('SELECT phase, turn_number AS turnNumber FROM turn_state WHERE id = 1');
  const orderRows = getAll<{ unitId: string; toH3Index: string }>(
    'SELECT unit_id AS unitId, to_h3_index AS toH3Index FROM pending_orders'
  );
  const gameOverRow = getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_over'");
  const winnerRow = getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'winner'");
  const gameOver = gameOverRow?.value === '1';
  const winner = winnerRow?.value ?? undefined;

  return {
    hexes: hexRows,
    units: unitRows,
    phase: turnRow?.phase ?? 'planning',
    turnNumber: turnRow?.turnNumber ?? 1,
    pendingOrders: orderRows,
    gameOver: gameOver || undefined,
    winner,
  };
}

/**
 * Runs a SQL statement with bound parameters. Use from AI/tool modules for mutations; no-ops when the DB handle is null.
 */
export function dbRun(sql: string, params: unknown[] = []): void {
  run(sql, params);
}

/**
 * Returns the first row of a SELECT as a typed object, or undefined. Use for single-row reads; returns undefined when
 * the DB is closed or no row matches.
 */
export function dbGetOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return getOne<T>(sql, params);
}

/**
 * Returns all rows of a SELECT as typed objects. Use for list reads; returns an empty array when the DB is closed.
 */
export function dbGetAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getAll<T>(sql, params);
}

/**
 * True when initDatabase or test open has established a live better-sqlite3 handle. Use before operations that require persistence.
 */
export function isDbReady(): boolean {
  return db !== null;
}

/**
 * Marks the match ended and records the winning player id in game_config. Use when the last enemy unit is eliminated.
 */
export function setGameOver(winner: string): void {
  if (!db) return;
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_over', '1')");
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('winner', ?)", [winner]);
}

/**
 * Removes game_over and winner keys so a new round can proceed. Use when starting a new game from the menu.
 */
export function clearGameOver(): void {
  if (!db) return;
  run("DELETE FROM game_config WHERE key IN ('game_over', 'winner')");
}

const AI_TOOL_LIMIT_EXCEEDED_KEY = 'ai_tool_limit_exceeded_last_turn';
const AI_LAST_CONSULTATION_TURN_KEY = 'ai_last_consultation_turn';

/**
 * Records that the AI exceeded the tool-call cap last turn so the next prompt can show a one-time warning. Call from
 * the OpenRouter loop when the cap is hit.
 */
export function setAiToolLimitExceededLastTurn(): void {
  if (!db) return;
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES (?, '1')", [AI_TOOL_LIMIT_EXCEEDED_KEY]);
}

/**
 * Returns whether the tool-limit flag was set, then deletes that flag. Call once per opponent turn when building the
 * system prompt so the warning shows at most once.
 */
export function getAndClearAiToolLimitExceededLastTurn(): boolean {
  if (!db) return false;
  const row = getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  run('DELETE FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  return row?.value === '1';
}

/**
 * Returns the turn number of the last AI consultation (event-driven flow), or 0 if unset. Use to avoid duplicate
 * first_consultation triggers and similar turn-gated logic.
 */
export function getAiLastConsultationTurn(): number {
  logTrace('gameDb getAiLastConsultationTurn');
  if (!db) return 0;
  const row = getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [AI_LAST_CONSULTATION_TURN_KEY]);
  if (!row) return 0;
  const n = parseInt(row.value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Persists the turn number after a consultation so later evaluation can tell whether this turn already consulted. Call
 * when applying AI orders from LLM or pending buffer.
 */
export function setAiLastConsultationTurn(turn: number): void {
  logDebug('gameDb setAiLastConsultationTurn', { turn });
  if (!db) return;
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [AI_LAST_CONSULTATION_TURN_KEY, String(turn)]);
}

const OPPONENT_ID = 'opponent';

/**
 * Lists opponent unit ids that entered combat since the last consultation. Use to decide whether to re-prompt the AI
 * under event-driven rules; empty when the DB is closed or the set is empty.
 */
export function getOpponentUnitsInCombatSinceConsultation(): string[] {
  logTrace('gameDb getOpponentUnitsInCombatSinceConsultation');
  if (!db) return [];
  const rows = dbGetAll<{ unit_id: string }>(
    'SELECT unit_id FROM ai_combat_since_consultation WHERE player_id = ?',
    [OPPONENT_ID]
  );
  return rows.map((r) => r.unit_id);
}

/**
 * Records opponent units involved in combat this turn for event-driven re-consultation. Call from resolution when
 * opponent units fight; duplicates are ignored (INSERT OR IGNORE).
 */
export function addOpponentCombatParticipants(unitIds: string[]): void {
  logDebug('gameDb addOpponentCombatParticipants', { count: unitIds.length });
  if (!db || unitIds.length === 0) return;
  for (const id of unitIds) {
    run('INSERT OR IGNORE INTO ai_combat_since_consultation (player_id, unit_id) VALUES (?, ?)', [OPPONENT_ID, id]);
  }
}

/**
 * Clears the combat-since-consultation set after a new AI consultation. Call when starting a fresh planning window.
 */
export function clearOpponentCombatSinceConsultation(): void {
  logDebug('gameDb clearOpponentCombatSinceConsultation');
  if (!db) return;
  run('DELETE FROM ai_combat_since_consultation WHERE player_id = ?', [OPPONENT_ID]);
}

/**
 * Loads AI movement and ranged orders staged for the next apply (e.g. event-driven path). Returns null if missing,
 * unparsable JSON, or DB closed. Does not clear the row; use clearAiPendingOrders after consumption.
 */
export function getAiPendingOrders(playerId: string): {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedOrders: { unitId: string; targetH3Index: string }[];
} | null {
  logTrace('gameDb getAiPendingOrders', { playerId });
  if (!db) return null;
  const row = getOne<{ movement_orders: string; ranged_orders: string; strategy_text: string | null }>(
    'SELECT movement_orders, ranged_orders, strategy_text FROM ai_pending_orders WHERE player_id = ?',
    [playerId]
  );
  if (!row) return null;
  try {
    const movementOrders = JSON.parse(row.movement_orders) as { unitId: string; toH3Index: string }[];
    const rangedOrders = JSON.parse(row.ranged_orders) as { unitId: string; targetH3Index: string }[];
    return { movementOrders, rangedOrders };
  } catch (err) {
    logError('gameDb getAiPendingOrders: failed to parse stored orders', err);
    return null;
  }
}

/**
 * Persists movement and ranged orders for a player until the game loop applies them. Use when the LLM defers orders
 * across turns or the pipeline buffers opponent orders before Ready.
 */
export function setAiPendingOrders(
  playerId: string,
  movementOrders: { unitId: string; toH3Index: string }[],
  rangedOrders: { unitId: string; targetH3Index: string }[]
): void {
  logDebug('gameDb setAiPendingOrders', {
    playerId,
    movementCount: movementOrders.length,
    rangedCount: rangedOrders.length,
  });
  if (!db) return;
  run(
    'INSERT OR REPLACE INTO ai_pending_orders (player_id, movement_orders, ranged_orders, strategy_text) VALUES (?, ?, ?, ?)',
    [playerId, JSON.stringify(movementOrders), JSON.stringify(rangedOrders), null]
  );
}

/**
 * Deletes staged AI orders for a player after they have been applied or superseded. Use paired with getAiPendingOrders.
 */
export function clearAiPendingOrders(playerId: string): void {
  logDebug('gameDb clearAiPendingOrders', { playerId });
  if (!db) return;
  run('DELETE FROM ai_pending_orders WHERE player_id = ?', [playerId]);
}

/**
 * Re-initializes the game for a new match: world map from terrain metadata classification, fresh seed, hexes/units, turn state,
 * pending orders, callbacks, AI memory, and standing orders cleared so no prior-match AI state leaks.
 */
export function resetGameForNewMatch(): void {
  logDebug('gameDb resetGameForNewMatch');
  if (!db) return;
  run('DELETE FROM units');
  run('DELETE FROM hexes');
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('map_size', 'world')");
  run("DELETE FROM game_config WHERE key = 'game_seed'");
  seedGameSeedIfMissing();
  seedHexesFromTerrainMetadata();
  seedUnits();
  run('DELETE FROM pending_orders');
  run('DELETE FROM pending_ranged_orders');
  run('UPDATE turn_state SET phase = ?, turn_number = 1 WHERE id = 1', ['planning']);
  clearGameOver();
  run('DELETE FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  run('DELETE FROM ai_callback_subscriptions');
  run('DELETE FROM ai_pending_orders');
  run('DELETE FROM ai_combat_since_consultation');
  run("DELETE FROM game_config WHERE key = 'ai_last_consultation_turn'");
  run('DELETE FROM standing_orders');
  run('DELETE FROM ai_memory');
  saveDatabase();
}
