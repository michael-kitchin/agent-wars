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
import { getOrderedHexList, getWorldUnitCounts, LATLNG_DECIMAL_PLACES } from './mapData';
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
import { computeVisibleHexesForSide } from './visibility';
import type { BuildUnitType } from './productionRules';

export type { GameStateSnapshot } from '../shared/ipcTypes';

function withFogMetadata(snapshot: GameStateSnapshot, fogOfWarEnabled: boolean): GameStateSnapshot {
  return {
    ...snapshot,
    fogOfWarEnabled,
  };
}

/** Baseline schema version; bump when a future milestone adds migration chains. */
export const EXPECTED_USER_VERSION = 8;

/**
 * Baseline filename for world-map + fog-of-war + production schema (v8).
 */
export const GAME_DB_FILE_NAME = 'game-baseline-v8.sqlite';

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
  'ai_loss_events_since_consultation',
  'player_hex_intel',
  'player_unit_intel',
  'res1_control',
  'res1_build_queue',
  'res1_build_progress',
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

    CREATE TABLE IF NOT EXISTS ai_loss_events_since_consultation (
      player_id TEXT NOT NULL,
      turn_number INTEGER NOT NULL,
      victim_unit_id TEXT NOT NULL,
      victim_player TEXT NOT NULL,
      cause TEXT NOT NULL,
      killer_ids_json TEXT NOT NULL,
      PRIMARY KEY (player_id, turn_number, victim_unit_id)
    );

    CREATE TABLE IF NOT EXISTS player_hex_intel (
      player_id TEXT NOT NULL,
      h3_index TEXT NOT NULL,
      seen_state TEXT NOT NULL CHECK (seen_state IN ('visible', 'stale', 'unexplored')),
      last_seen_turn INTEGER,
      PRIMARY KEY (player_id, h3_index)
    );

    CREATE TABLE IF NOT EXISTS player_unit_intel (
      player_id TEXT NOT NULL,
      enemy_unit_id TEXT NOT NULL,
      last_known_h3_index TEXT NOT NULL,
      intel_state TEXT NOT NULL CHECK (intel_state IN ('current', 'stale')),
      last_seen_turn INTEGER NOT NULL,
      stale_until_turn INTEGER,
      PRIMARY KEY (player_id, enemy_unit_id)
    );

    CREATE TABLE IF NOT EXISTS res1_control (
      h3_index TEXT PRIMARY KEY,
      controller_player_id TEXT
    );

    CREATE TABLE IF NOT EXISTS res1_build_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      h3_index TEXT NOT NULL,
      queue_index INTEGER NOT NULL,
      unit_type TEXT NOT NULL CHECK (unit_type IN ('infantry', 'armor', 'naval')),
      remaining_count INTEGER NOT NULL CHECK (remaining_count > 0),
      UNIQUE (h3_index, queue_index)
    );

    CREATE TABLE IF NOT EXISTS res1_build_progress (
      h3_index TEXT PRIMARY KEY,
      stored_points INTEGER NOT NULL DEFAULT 0
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
  refreshFogOfWarIntelFromCurrentState();
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

const STALE_INTEL_TURNS = 2;
const FOG_PLAYERS = ['human', 'opponent'] as const;
const FOG_OF_WAR_ENABLED_KEY = 'fog_of_war_enabled';

function isFogOfWarEnabled(): boolean {
  const row = getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [FOG_OF_WAR_ENABLED_KEY]);
  if (!row?.value) return true;
  return row.value !== '0' && row.value.toLowerCase() !== 'false';
}

function getCurrentTurnNumberFromDb(): number {
  const turnRow = getOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1');
  return turnRow?.turnNumber ?? 1;
}

function refreshFogOfWarIntelForPlayer(
  state: GameStateSnapshot,
  playerId: string,
  currentTurn: number,
  traversedHexes: Set<string> | undefined
): void {
  logDebug('gameDb refreshFogOfWarIntelForPlayer', { playerId, currentTurn });
  const mapHexSet = new Set(state.hexes.map((h) => h.h3Index));
  const visibleHexes = computeVisibleHexesForSide(state, playerId, mapHexSet);
  const ownOccupiedHexes = new Set(
    state.units.filter((u) => u.player === playerId).map((u) => u.h3Index)
  );

  for (const h3 of ownOccupiedHexes) {
    run(
      `INSERT OR IGNORE INTO player_hex_intel (player_id, h3_index, seen_state, last_seen_turn) VALUES (?, ?, 'visible', ?)`,
      [playerId, h3, currentTurn]
    );
  }
  for (const h3 of traversedHexes ?? []) {
    if (!mapHexSet.has(h3)) continue;
    run(
      `INSERT OR IGNORE INTO player_hex_intel (player_id, h3_index, seen_state, last_seen_turn) VALUES (?, ?, 'visible', ?)`,
      [playerId, h3, currentTurn]
    );
    run(
      `UPDATE player_hex_intel SET seen_state = 'visible', last_seen_turn = ? WHERE player_id = ? AND h3_index = ?`,
      [currentTurn, playerId, h3]
    );
  }

  const exploredRows = getAll<{ h3_index: string; last_seen_turn: number | null }>(
    'SELECT h3_index, last_seen_turn FROM player_hex_intel WHERE player_id = ?',
    [playerId]
  );
  for (const row of exploredRows) {
    if (visibleHexes.has(row.h3_index)) {
      run(
        `UPDATE player_hex_intel SET seen_state = 'visible', last_seen_turn = ? WHERE player_id = ? AND h3_index = ?`,
        [currentTurn, playerId, row.h3_index]
      );
    } else {
      run(
        `UPDATE player_hex_intel SET seen_state = 'stale' WHERE player_id = ? AND h3_index = ?`,
        [playerId, row.h3_index]
      );
    }
  }

  const enemyUnits = state.units.filter((u) => u.player !== playerId);
  const enemyById = new Map(enemyUnits.map((u) => [u.id, u]));
  const existingIntelRows = getAll<{ enemy_unit_id: string }>(
    'SELECT enemy_unit_id FROM player_unit_intel WHERE player_id = ?',
    [playerId]
  );
  const existingIntelIds = new Set(existingIntelRows.map((r) => r.enemy_unit_id));
  const newContactIds: string[] = [];
  const currentEnemyHexes = new Set<string>();
  for (const enemy of enemyUnits) {
    if (!visibleHexes.has(enemy.h3Index)) continue;
    if (!existingIntelIds.has(enemy.id)) newContactIds.push(enemy.id);
    currentEnemyHexes.add(enemy.h3Index);
    run(
      `INSERT INTO player_unit_intel (player_id, enemy_unit_id, last_known_h3_index, intel_state, last_seen_turn, stale_until_turn)
       VALUES (?, ?, ?, 'current', ?, ?)
       ON CONFLICT(player_id, enemy_unit_id) DO UPDATE SET
         last_known_h3_index = excluded.last_known_h3_index,
         intel_state = 'current',
         last_seen_turn = excluded.last_seen_turn,
         stale_until_turn = excluded.stale_until_turn`,
      [playerId, enemy.id, enemy.h3Index, currentTurn, currentTurn + STALE_INTEL_TURNS]
    );
  }

  const intelRows = getAll<{
    enemy_unit_id: string;
    last_known_h3_index: string;
    intel_state: 'current' | 'stale';
    stale_until_turn: number | null;
  }>(
    'SELECT enemy_unit_id, last_known_h3_index, intel_state, stale_until_turn FROM player_unit_intel WHERE player_id = ?',
    [playerId]
  );
  for (const row of intelRows) {
    const enemy = enemyById.get(row.enemy_unit_id);
    if (enemy && visibleHexes.has(enemy.h3Index)) continue;
    if (currentEnemyHexes.has(row.last_known_h3_index)) {
      run('DELETE FROM player_unit_intel WHERE player_id = ? AND enemy_unit_id = ?', [playerId, row.enemy_unit_id]);
      continue;
    }
    if (visibleHexes.has(row.last_known_h3_index) && (!enemy || enemy.h3Index !== row.last_known_h3_index)) {
      run('DELETE FROM player_unit_intel WHERE player_id = ? AND enemy_unit_id = ?', [playerId, row.enemy_unit_id]);
      continue;
    }
    const staleUntil = row.stale_until_turn ?? Number.MIN_SAFE_INTEGER;
    if (currentTurn > staleUntil) {
      run('DELETE FROM player_unit_intel WHERE player_id = ? AND enemy_unit_id = ?', [playerId, row.enemy_unit_id]);
      continue;
    }
    run(`UPDATE player_unit_intel SET intel_state = 'stale' WHERE player_id = ? AND enemy_unit_id = ?`, [
      playerId,
      row.enemy_unit_id,
    ]);
  }
  run(
    `INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)`,
    [`fog_new_contacts_${playerId}`, JSON.stringify(newContactIds)]
  );
}

/**
 * Recomputes persisted fog-of-war intel rows from current board state for both sides.
 * Use after any resolution/new-game state changes so side-subjective snapshots remain deterministic.
 */
export function refreshFogOfWarIntelFromCurrentState(options?: {
  traversedHexesByPlayer?: Partial<Record<'human' | 'opponent', string[]>>;
}): void {
  logDebug('gameDb refreshFogOfWarIntelFromCurrentState', {
    humanTraversed: options?.traversedHexesByPlayer?.human?.length ?? 0,
    opponentTraversed: options?.traversedHexesByPlayer?.opponent?.length ?? 0,
  });
  if (!db) return;
  if (!isFogOfWarEnabled()) {
    run('DELETE FROM player_hex_intel');
    run('DELETE FROM player_unit_intel');
    run("DELETE FROM game_config WHERE key IN ('fog_new_contacts_human', 'fog_new_contacts_opponent')");
    return;
  }
  const state = getGameState();
  const currentTurn = getCurrentTurnNumberFromDb();
  for (const playerId of FOG_PLAYERS) {
    const traversed = new Set(options?.traversedHexesByPlayer?.[playerId] ?? []);
    refreshFogOfWarIntelForPlayer(state, playerId, currentTurn, traversed);
  }
}

/**
 * Returns and clears newly discovered enemy unit ids for the given side (computed during latest fog refresh).
 */
export function consumeFogNewContactsForPlayer(playerId: 'human' | 'opponent'): string[] {
  logDebug('gameDb consumeFogNewContactsForPlayer', { playerId });
  if (!db) return [];
  const key = `fog_new_contacts_${playerId}`;
  const row = getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key]);
  run('DELETE FROM game_config WHERE key = ?', [key]);
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
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
  const controlRows = getAll<{ h3Index: string; controllerPlayerId: string | null }>(
    'SELECT h3_index AS h3Index, controller_player_id AS controllerPlayerId FROM res1_control'
  );
  const queueTotalRows = getAll<{
    h3Index: string;
    queuedUnits: number;
    nextUnitType: BuildUnitType | null;
    nextRemainingCount: number | null;
    storedPoints: number;
  }>(
    `SELECT q.h3_index AS h3Index,
            COALESCE(SUM(q.remaining_count), 0) AS queuedUnits,
            (
              SELECT qh.unit_type
              FROM res1_build_queue qh
              WHERE qh.h3_index = q.h3_index
              ORDER BY qh.queue_index ASC, qh.id ASC
              LIMIT 1
            ) AS nextUnitType,
            (
              SELECT qh.remaining_count
              FROM res1_build_queue qh
              WHERE qh.h3_index = q.h3_index
              ORDER BY qh.queue_index ASC, qh.id ASC
              LIMIT 1
            ) AS nextRemainingCount,
            COALESCE(
              (
                SELECT p.stored_points
                FROM res1_build_progress p
                WHERE p.h3_index = q.h3_index
              ),
              0
            ) AS storedPoints
     FROM res1_build_queue q
     GROUP BY q.h3_index`
  );
  const gameOver = gameOverRow?.value === '1';
  const winner = winnerRow?.value ?? undefined;

  return withFogMetadata({
    hexes: hexRows,
    units: unitRows,
    phase: turnRow?.phase ?? 'planning',
    turnNumber: turnRow?.turnNumber ?? 1,
    pendingOrders: orderRows,
    res1Control: controlRows,
    res1BuildQueueTotals: queueTotalRows,
    gameOver: gameOver || undefined,
    winner,
  }, isFogOfWarEnabled());
}

/**
 * Returns a side-subjective game-state snapshot.
 * When fog is enabled: own units are always visible, enemies only when currently visible.
 * When fog is disabled: all hexes and all units are visible to both sides.
 */
export function getGameStateForPlayer(
  playerId: 'human' | 'opponent',
  options?: { maskUnexploredTerrain?: boolean }
): GameStateSnapshot {
  logTrace('gameDb getGameStateForPlayer', { playerId });
  const state = getGameState();
  const fogEnabled = isFogOfWarEnabled();
  if (!db) return withFogMetadata({ ...state, playerPerspective: playerId }, fogEnabled);
  if (!fogEnabled) {
    const allHexes = state.hexes.map((h) => h.h3Index);
    const enemyIntel = state.units
      .filter((u) => u.player !== playerId)
      .map((u) => {
        const [lat, lng] = cellToLatLng(u.h3Index);
        return {
          unitId: u.id,
          lastKnownH3Index: u.h3Index,
          lastKnownLatLng: [Number(lat.toFixed(LATLNG_DECIMAL_PLACES)), Number(lng.toFixed(LATLNG_DECIMAL_PLACES))] as [number, number],
          intelState: 'current' as const,
          lastSeenTurn: state.turnNumber,
          staleUntilTurn: state.turnNumber + STALE_INTEL_TURNS,
        };
      });
    return withFogMetadata({
      ...state,
      visibleHexes: allHexes,
      exploredHexes: allHexes,
      staleHexes: [],
      enemyIntel,
      playerPerspective: playerId,
    }, false);
  }

  const mapHexSet = new Set(state.hexes.map((h) => h.h3Index));
  const visibleHexes = computeVisibleHexesForSide(state, playerId, mapHexSet);
  const visibleHexList = state.hexes.map((h) => h.h3Index).filter((h3) => visibleHexes.has(h3));
  const exploredRows = getAll<{ h3_index: string }>(
    'SELECT h3_index FROM player_hex_intel WHERE player_id = ?',
    [playerId]
  );
  const exploredHexes = new Set(exploredRows.map((r) => r.h3_index));
  const staleHexes = [...exploredHexes].filter((h3) => !visibleHexes.has(h3));

  const filteredHexes = options?.maskUnexploredTerrain === false
    ? state.hexes
    : state.hexes.map((h) => {
      if (exploredHexes.has(h.h3Index)) return h;
      return { ...h, terrain: 'unknown', terrainKind: 'unknown' };
    });

  const filteredUnits = state.units.filter((u) => u.player === playerId || visibleHexes.has(u.h3Index));
  const intelRows = getAll<{
    enemy_unit_id: string;
    last_known_h3_index: string;
    intel_state: 'current' | 'stale';
    last_seen_turn: number;
    stale_until_turn: number;
  }>(
    `SELECT enemy_unit_id, last_known_h3_index, intel_state, last_seen_turn, stale_until_turn
     FROM player_unit_intel WHERE player_id = ? ORDER BY enemy_unit_id`,
    [playerId]
  );
  const enemyIntel = intelRows.map((row) => {
    const [lat, lng] = cellToLatLng(row.last_known_h3_index);
    return {
      unitId: row.enemy_unit_id,
      lastKnownH3Index: row.last_known_h3_index,
      lastKnownLatLng: [Number(lat.toFixed(LATLNG_DECIMAL_PLACES)), Number(lng.toFixed(LATLNG_DECIMAL_PLACES))] as [number, number],
      intelState: row.intel_state,
      lastSeenTurn: row.last_seen_turn,
      staleUntilTurn: row.stale_until_turn,
    };
  });

  return withFogMetadata({
    ...state,
    hexes: filteredHexes,
    units: filteredUnits,
    visibleHexes: visibleHexList,
    exploredHexes: [...exploredHexes],
    staleHexes,
    enemyIntel,
    playerPerspective: playerId,
  }, true);
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

export interface HexControlRow {
  h3Index: string;
  controllerPlayerId: string | null;
}

export interface BuildQueueRow {
  id: number;
  h3Index: string;
  queueIndex: number;
  unitType: BuildUnitType;
  remainingCount: number;
}

/**
 * Why this exists:
 *     Reads the persisted controller for one res-1 hex.
 * When to use:
 *     Queue authorization, tooltip rendering, and control transition checks.
 * What to expect:
 *     Returns null when a hex is currently uncontrolled or missing a row.
 */
export function getHexController(h3Index: string): string | null {
  logTrace('gameDb getHexController', { h3Index });
  const row = getOne<{ controllerPlayerId: string | null }>(
    'SELECT controller_player_id AS controllerPlayerId FROM res1_control WHERE h3_index = ?',
    [h3Index]
  );
  return row?.controllerPlayerId ?? null;
}

/**
 * Why this exists:
 *     Upserts one res-1 control row as the single source of truth for ownership.
 * When to use:
 *     Post-combat control resolution when occupancy changes ownership.
 * What to expect:
 *     Persists null for uncontrolled or a player id for controlled.
 */
export function setHexController(h3Index: string, controllerPlayerId: string | null): void {
  logDebug('gameDb setHexController', { h3Index, controllerPlayerId });
  run(
    `INSERT INTO res1_control (h3_index, controller_player_id)
     VALUES (?, ?)
     ON CONFLICT(h3_index) DO UPDATE SET controller_player_id = excluded.controller_player_id`,
    [h3Index, controllerPlayerId]
  );
}

/**
 * Why this exists:
 *     Returns all persisted res-1 control rows for deterministic control resolution loops.
 * When to use:
 *     Turn resolution and test verification.
 * What to expect:
 *     Sorted by h3 index for stable iteration.
 */
export function listAllHexControls(): HexControlRow[] {
  logTrace('gameDb listAllHexControls');
  const rows = getAll<{ h3Index: string; controllerPlayerId: string | null }>(
    `SELECT h3_index AS h3Index, controller_player_id AS controllerPlayerId
     FROM res1_control
     ORDER BY h3_index ASC`
  );
  return rows.map((row) => ({ h3Index: row.h3Index, controllerPlayerId: row.controllerPlayerId }));
}

/**
 * Why this exists:
 *     Returns one hex build queue ordered front-to-back for deterministic processing.
 * When to use:
 *     Tooltip rendering and per-turn production application.
 * What to expect:
 *     Empty list when no queued entries exist.
 */
export function listBuildQueueRowsForHex(h3Index: string): BuildQueueRow[] {
  logTrace('gameDb listBuildQueueRowsForHex', { h3Index });
  const rows = getAll<{
    id: number;
    h3Index: string;
    queueIndex: number;
    unitType: BuildUnitType;
    remainingCount: number;
  }>(
    `SELECT id, h3_index AS h3Index, queue_index AS queueIndex, unit_type AS unitType, remaining_count AS remainingCount
     FROM res1_build_queue
     WHERE h3_index = ?
     ORDER BY queue_index ASC, id ASC`,
    [h3Index]
  );
  return rows.map((row) => ({
    id: row.id,
    h3Index: row.h3Index,
    queueIndex: row.queueIndex,
    unitType: row.unitType,
    remainingCount: row.remainingCount,
  }));
}

/**
 * Why this exists:
 *     Returns persisted partial production points for one hex queue head.
 * When to use:
 *     Per-turn production calculator input.
 * What to expect:
 *     Defaults to zero when no row exists.
 */
export function getBuildProgressPointsForHex(h3Index: string): number {
  logTrace('gameDb getBuildProgressPointsForHex', { h3Index });
  const row = getOne<{ storedPoints: number }>(
    'SELECT stored_points AS storedPoints FROM res1_build_progress WHERE h3_index = ?',
    [h3Index]
  );
  return Math.max(0, row?.storedPoints ?? 0);
}

/**
 * Why this exists:
 *     Persists queue-head partial production points after one turn of processing.
 * When to use:
 *     End of per-turn production for each controlled hex.
 * What to expect:
 *     Stores non-negative points and upserts existing row.
 */
export function setBuildProgressPointsForHex(h3Index: string, storedPoints: number): void {
  const safePoints = Math.max(0, Math.trunc(storedPoints));
  logDebug('gameDb setBuildProgressPointsForHex', { h3Index, storedPoints: safePoints });
  run(
    `INSERT INTO res1_build_progress (h3_index, stored_points)
     VALUES (?, ?)
     ON CONFLICT(h3_index) DO UPDATE SET stored_points = excluded.stored_points`,
    [h3Index, safePoints]
  );
}

/**
 * Why this exists:
 *     Clears all queue entries and partial progress for one hex.
 * When to use:
 *     Ownership takeover rule and explicit queue reset operations.
 * What to expect:
 *     Idempotent clear; safe to call when rows are already absent.
 */
export function clearBuildQueueAndProgressForHex(h3Index: string): void {
  logDebug('gameDb clearBuildQueueAndProgressForHex', { h3Index });
  run('DELETE FROM res1_build_queue WHERE h3_index = ?', [h3Index]);
  run('DELETE FROM res1_build_progress WHERE h3_index = ?', [h3Index]);
}

/**
 * Why this exists:
 *     Replaces one hex queue atomically after deterministic in-memory transformations.
 * When to use:
 *     Production phase and queue mutation handlers that reindex rows.
 * What to expect:
 *     Drops old rows then writes normalized `queueIndex` order.
 */
export function replaceBuildQueueForHex(h3Index: string, entries: Array<{ unitType: BuildUnitType; remainingCount: number }>): void {
  logDebug('gameDb replaceBuildQueueForHex', { h3Index, entryCount: entries.length });
  run('DELETE FROM res1_build_queue WHERE h3_index = ?', [h3Index]);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    run(
      `INSERT INTO res1_build_queue (h3_index, queue_index, unit_type, remaining_count)
       VALUES (?, ?, ?, ?)`,
      [h3Index, i, entry.unitType, Math.max(1, Math.trunc(entry.remainingCount))]
    );
  }
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
  if (!db) return;
  const existing = getAiLastConsultationTurn();
  if (existing === turn) {
    logTrace('gameDb setAiLastConsultationTurn: unchanged', { turn });
    return;
  }
  logDebug('gameDb setAiLastConsultationTurn', { turn });
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

export interface AiLossEventSinceConsultation {
  turnNumber: number;
  victimUnitId: string;
  victimPlayer: string;
  cause: 'direct_fire' | 'return_fire' | 'melee_or_other';
  killerIds: string[];
}

/**
 * Appends per-turn loss events that occurred this resolution for the given AI player perspective.
 * Call after resolution so the next LLM consultation can see what was lost and when.
 */
export function addAiLossEventsSinceConsultation(
  playerId: string,
  turnNumber: number,
  removedUnits: { id: string; player: string }[],
  kills: { victimId: string; killerIds: string[] }[],
  killsByDirectFire?: { victimId: string; killerIds: string[] }[],
  killsByReturnFire?: { victimId: string; killerIds: string[] }[]
): void {
  if (!db) return;
  if (removedUnits.length === 0 || kills.length === 0) {
    logTrace('gameDb addAiLossEventsSinceConsultation: no losses to record', {
      playerId,
      turnNumber,
      removedCount: removedUnits.length,
      killCount: kills.length,
    });
    return;
  }

  const removedById = new Map(removedUnits.map((u) => [u.id, u]));
  const directVictims = new Set((killsByDirectFire ?? []).map((k) => k.victimId));
  const returnVictims = new Set((killsByReturnFire ?? []).map((k) => k.victimId));
  let recordedCount = 0;
  for (const kill of kills) {
    const victim = removedById.get(kill.victimId);
    if (!victim) continue;
    const cause: AiLossEventSinceConsultation['cause'] = directVictims.has(kill.victimId)
      ? 'direct_fire'
      : returnVictims.has(kill.victimId)
        ? 'return_fire'
        : 'melee_or_other';
    run(
      `INSERT OR REPLACE INTO ai_loss_events_since_consultation
       (player_id, turn_number, victim_unit_id, victim_player, cause, killer_ids_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [playerId, turnNumber, kill.victimId, victim.player, cause, JSON.stringify(kill.killerIds ?? [])]
    );
    recordedCount++;
  }
  logDebug('gameDb addAiLossEventsSinceConsultation', {
    playerId,
    turnNumber,
    removedCount: removedUnits.length,
    killCount: kills.length,
    recordedCount,
  });
}

/**
 * Returns unresolved loss events captured since the last successful LLM consultation for the given player.
 * Use this to build an explicit "losses since last call" briefing block.
 */
export function getAiLossEventsSinceConsultation(playerId: string): AiLossEventSinceConsultation[] {
  logTrace('gameDb getAiLossEventsSinceConsultation', { playerId });
  if (!db) return [];
  const rows = getAll<{
    turn_number: number;
    victim_unit_id: string;
    victim_player: string;
    cause: AiLossEventSinceConsultation['cause'];
    killer_ids_json: string;
  }>(
    `SELECT turn_number, victim_unit_id, victim_player, cause, killer_ids_json
     FROM ai_loss_events_since_consultation
     WHERE player_id = ?
     ORDER BY turn_number ASC, victim_unit_id ASC`,
    [playerId]
  );
  return rows.map((row) => {
    let killerIds: string[] = [];
    try {
      const parsed = JSON.parse(row.killer_ids_json) as unknown;
      if (Array.isArray(parsed)) killerIds = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      killerIds = [];
    }
    return {
      turnNumber: row.turn_number,
      victimUnitId: row.victim_unit_id,
      victimPlayer: row.victim_player,
      cause: row.cause,
      killerIds,
    };
  });
}

/**
 * Clears accumulated loss events after a successful LLM consultation so the next briefing window starts fresh.
 */
export function clearAiLossEventsSinceConsultation(playerId: string): void {
  logDebug('gameDb clearAiLossEventsSinceConsultation', { playerId });
  if (!db) return;
  run('DELETE FROM ai_loss_events_since_consultation WHERE player_id = ?', [playerId]);
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

function seedInitialHexControlFromUnitOccupancy(): void {
  logDebug('gameDb seedInitialHexControlFromUnitOccupancy');
  if (!db) return;
  run('DELETE FROM res1_control');
  const rows = getAll<{ h3Index: string; distinctPlayers: number; solePlayer: string | null }>(
    `SELECT h3_index AS h3Index,
            COUNT(DISTINCT player) AS distinctPlayers,
            CASE WHEN COUNT(DISTINCT player) = 1 THEN MIN(player) ELSE NULL END AS solePlayer
     FROM units
     GROUP BY h3_index`
  );
  for (const row of rows) {
    if (row.distinctPlayers === 1 && row.solePlayer) {
      run('INSERT INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [row.h3Index, row.solePlayer]);
    }
  }
}

/**
 * Re-initializes the game for a new match: world map from terrain metadata classification, fresh seed, hexes/units, turn state,
 * pending orders, callbacks, AI memory, and standing orders cleared so no prior-match AI state leaks.
 * Optionally disables fog of war for the new match so both sides always receive full-map/full-unit snapshots.
 */
export function resetGameForNewMatch(options?: { fogOfWarEnabled?: boolean }): void {
  const fogOfWarEnabled = options?.fogOfWarEnabled !== false;
  logDebug('gameDb resetGameForNewMatch', { fogOfWarEnabled });
  if (!db) return;
  run('DELETE FROM units');
  run('DELETE FROM hexes');
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('map_size', 'world')");
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [FOG_OF_WAR_ENABLED_KEY, fogOfWarEnabled ? '1' : '0']);
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
  run('DELETE FROM ai_loss_events_since_consultation');
  run("DELETE FROM game_config WHERE key = 'ai_last_consultation_turn'");
  run("DELETE FROM game_config WHERE key IN ('fog_new_contacts_human', 'fog_new_contacts_opponent')");
  run('DELETE FROM standing_orders');
  run('DELETE FROM ai_memory');
  run('DELETE FROM player_hex_intel');
  run('DELETE FROM player_unit_intel');
  run('DELETE FROM res1_control');
  run('DELETE FROM res1_build_queue');
  run('DELETE FROM res1_build_progress');
  seedInitialHexControlFromUnitOccupancy();
  refreshFogOfWarIntelFromCurrentState();
  saveDatabase();
}
