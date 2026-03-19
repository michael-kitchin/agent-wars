/**
 * Game state persistence in SQLite. Schema: hexes (with terrain), units, turn state, pending orders.
 * All access runs in the main process. Uses sql.js (WASM) so no native build is required.
 * The DB file lives in Electron userData directory; we load/save it manually.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { gridDistance } from 'h3-js';
import { getOrderedHexList, getUnitCountsForSize, type MapSize } from './mapData';
import { createSeededRng } from './seededRng';
import { logDebug, logError, logTrace } from './logger';

import type { Database } from 'sql.js';

let db: Database | null = null;
let dbPath: string = '';

/**
 * Runs a single SQL statement (INSERT/UPDATE/DELETE). No return value.
 */
function run(sql: string, params: unknown[] = []): void {
  if (!db) return;
  db.run(sql, params);
}

/**
 * Returns one row as a plain object, or undefined if no row.
 */
function getOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  if (!db) return undefined;
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? (stmt.getAsObject() as T) : undefined;
  stmt.free();
  return row;
}

/**
 * Returns all rows as plain objects.
 */
function getAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as T);
  stmt.free();
  return rows;
}

/**
 * Returns the path to the game database file (userData directory).
 * Call only after app is ready.
 */
function getDbPath(): string {
  return path.join(app.getPath('userData'), 'game.db');
}

/**
 * Seeds the game RNG seed in game_config when missing. Used for deterministic combat and participant IDs.
 * Seed is stored in game_config under key 'game_seed' as a string integer.
 */
function seedGameSeedIfMissing(): void {
  if (db === null) return;
  const row = getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_seed'");
  if (row) return;
  const seed = Math.floor(Math.random() * 2 ** 31);
  run("INSERT INTO game_config (key, value) VALUES ('game_seed', ?)", [String(seed)]);
}

/**
 * Returns the game seed for the current session. Used by combat resolution and participant ID assignment.
 * Seed is stored in game_config; same seed is used for the whole game until a new game is started.
 */
export function getGameSeed(): number {
  logTrace('getGameSeed');
  if (db === null) return 0;
  const row = getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_seed'");
  if (!row) return 0;
  const n = parseInt(row.value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Target fraction of map hexes that are water (1/3) for all map sizes. */
const WATER_FRACTION = 1 / 3;
/** Number of water blobs: min and max (inclusive). Blob count is chosen randomly in this range per game. */
const WATER_BLOB_COUNT_MIN = 4;
const WATER_BLOB_COUNT_MAX = 6;

/**
 * Seeds the hexes table with the ordered map hexes and terrain (land/water) for the given map size.
 * Water is 4–6 blobs (seeded RNG): blob centers are chosen at random; radius is increased until the
 * union of blob disks nets out to 1/3 of total hexes. Call from resetGameForNewMatch(size) only.
 */
function seedHexes(size: MapSize): void {
  if (db === null) return;
  const hexes = getOrderedHexList(size);
  const seed = getGameSeed();
  const next = createSeededRng(seed);
  const targetWaterCount = Math.round(hexes.length * WATER_FRACTION);
  const numBlobs =
    WATER_BLOB_COUNT_MIN +
    Math.floor(next() * (WATER_BLOB_COUNT_MAX - WATER_BLOB_COUNT_MIN + 1));

  const centerIndices: number[] = [];
  while (centerIndices.length < numBlobs) {
    const idx = Math.floor(next() * hexes.length);
    if (!centerIndices.includes(idx)) centerIndices.push(idx);
  }
  const centerH3s = centerIndices.map((i) => hexes[i]!);

  let radius = 0;
  /** Cap radius search; at res 2 a blob of radius ~30 already covers thousands of hexes. */
  const maxRadius = 50;
  for (; radius <= maxRadius; radius++) {
    let waterCount = 0;
    for (let i = 0; i < hexes.length; i++) {
      let inBlob = false;
      for (const ch3 of centerH3s) {
        try {
          if (gridDistance(hexes[i]!, ch3) <= radius) {
            inBlob = true;
            break;
          }
        } catch {
          // ignore
        }
      }
      if (inBlob) waterCount++;
    }
    if (waterCount >= targetWaterCount) break;
  }
  if (radius > maxRadius) radius = maxRadius;

  for (let i = 0; i < hexes.length; i++) {
    let water = false;
    for (const ch3 of centerH3s) {
      try {
        if (gridDistance(hexes[i]!, ch3) <= radius) {
          water = true;
          break;
        }
      } catch {
        // ignore
      }
    }
    const terrain = water ? 'water' : 'land';
    run('INSERT INTO hexes (h3_index, terrain) VALUES (?, ?)', [hexes[i], terrain]);
  }
}

/**
 * Seeds the units table for the given map size. Counts per type from getUnitCountsForSize(size).
 * Land units (infantry, armor) only on land hexes; naval only on water hexes. Human on low indices, opponent on high.
 * Call from resetGameForNewMatch(size) only.
 */
function seedUnits(size: MapSize): void {
  if (db === null) return;
  const hexes = getOrderedHexList(size);
  const counts = getUnitCountsForSize(size);
  const landIndices: number[] = [];
  const waterIndices: number[] = [];
  for (let i = 0; i < hexes.length; i++) {
    const row = getOne<{ terrain: string }>('SELECT terrain FROM hexes WHERE h3_index = ?', [hexes[i]]);
    const terrain = row?.terrain ?? 'land';
    if (terrain === 'water') waterIndices.push(i);
    else landIndices.push(i);
  }

  /* Place human on “near” side (low indices), opponent on “far” side (high indices). */
  const landPerSide = counts.infantry + counts.armor;
  if (landIndices.length < landPerSide * 2) return;
  const humanLand = landIndices.slice(0, landPerSide);
  const opponentLand = landIndices.slice(-landPerSide);

  const humanUnits: [string, string, string][] = [];
  let idx = 0;
  for (let i = 0; i < counts.infantry; i++) {
    humanUnits.push([`human-infantry-${i + 1}`, 'infantry', hexes[humanLand[idx++]!]!]);
  }
  for (let i = 0; i < counts.armor; i++) {
    humanUnits.push([`human-armor-${i + 1}`, 'armor', hexes[humanLand[idx++]!]!]);
  }
  for (let i = 0; i < counts.naval && waterIndices.length > 0; i++) {
    humanUnits.push([`human-naval-${i + 1}`, 'naval', hexes[waterIndices[i]!]!]);
  }
  for (const [id, unitType, h3Index] of humanUnits) {
    run('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, 'human', unitType, h3Index]);
  }

  const opponentUnits: [string, string, string][] = [];
  idx = 0;
  for (let i = 0; i < counts.infantry; i++) {
    opponentUnits.push([`opponent-infantry-${i + 1}`, 'infantry', hexes[opponentLand[idx++]!]!]);
  }
  for (let i = 0; i < counts.armor; i++) {
    opponentUnits.push([`opponent-armor-${i + 1}`, 'armor', hexes[opponentLand[idx++]!]!]);
  }
  for (let i = 0; i < counts.naval && waterIndices.length > 0; i++) {
    opponentUnits.push([`opponent-naval-${i + 1}`, 'naval', hexes[waterIndices[waterIndices.length - 1 - i]!]!]);
  }
  for (const [id, unitType, h3Index] of opponentUnits) {
    run('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, 'opponent', unitType, h3Index]);
  }
}

/**
 * Returns the stored map size for the current game, or 'small' if none (e.g. before first new game).
 * Used by getGameState to order hexes and by callers that need the current size.
 */
export function getMapSize(): MapSize {
  logTrace('getMapSize');
  const row = getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'map_size'");
  if (!row || !row.value) return 'small';
  if (row.value === 'medium' || row.value === 'large') return row.value;
  return 'small';
}

/**
 * Returns the set of H3 indices that are on the current map. Used for order validation in gameActions.
 * Empty when no game has been started (hexes table empty).
 */
export function getMapHexSet(): Set<string> {
  logTrace('getMapHexSet');
  const rows = getAll<{ h3_index: string }>('SELECT h3_index FROM hexes');
  return new Set(rows.map((r) => r.h3_index));
}

/**
 * Persists the in-memory database to the file on disk. Call after mutations so data survives app restart.
 */
export function saveDatabase(): void {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('[agent-wars] saveDatabase failed:', err);
  }
}

/**
 * Creates a fresh game database and tables on every startup. Async because sql.js loads WASM.
 * Call once when the main process is ready (e.g. in app.whenReady()).
 */
export async function initDatabase(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  db = new SQL.Database();

  const database = db!;
  database.run(`
    CREATE TABLE IF NOT EXISTS hexes (
      h3_index TEXT PRIMARY KEY,
      terrain TEXT NOT NULL CHECK (terrain IN ('land', 'water'))
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
  `);

  const row = getOne('SELECT 1 FROM turn_state WHERE id = 1');
  if (!row) {
    run('INSERT INTO turn_state (id, phase, turn_number) VALUES (1, ?, ?)', ['planning', 1]);
  }

  seedGameSeedIfMissing();
  saveDatabase();
}

/**
 * Returns the current game state as a plain object for IPC. Empty arrays and default phase/turn if DB not initialized.
 * Use when the renderer or another consumer needs a read-only snapshot (e.g. after resolution or on load).
 */
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
  const ordered = hasHexes ? getOrderedHexList(getMapSize()) : [];
  const hexRows: { h3Index: string; terrain: string }[] = ordered.map((h3Index) => {
    const row = getOne<{ terrain: string }>('SELECT terrain FROM hexes WHERE h3_index = ?', [h3Index]);
    return { h3Index, terrain: row?.terrain ?? 'land' };
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

/** Snapshot of game state sent to the renderer (camelCase for JSON). */
export interface GameStateSnapshot {
  hexes: { h3Index: string; terrain: string }[];
  units: { id: string; player: string; unitType: string; h3Index: string }[];
  phase: string;
  turnNumber: number;
  pendingOrders: { unitId: string; toH3Index: string }[];
  gameOver?: boolean;
  winner?: string;
}

/**
 * Runs a single SQL statement. Exported for gameActions. Params as array.
 */
export function dbRun(sql: string, params: unknown[] = []): void {
  run(sql, params);
}

/**
 * Returns one row as plain object. Exported for gameActions.
 */
export function dbGetOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return getOne<T>(sql, params);
}

/**
 * Returns all rows as plain objects. Exported for gameActions.
 */
export function dbGetAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getAll<T>(sql, params);
}

/**
 * Returns whether the database is initialized. Used by gameActions instead of raw getDb.
 */
export function isDbReady(): boolean {
  return db !== null;
}

/**
 * Sets game-over state and winner. Called after combat when one side has no units left.
 * Stores in game_config: game_over=1, winner=<player id>.
 */
export function setGameOver(winner: string): void {
  if (!db) return;
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_over', '1')");
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('winner', ?)", [winner]);
}

/**
 * Clears game-over state and winner. Called when starting a new game.
 */
export function clearGameOver(): void {
  if (!db) return;
  run("DELETE FROM game_config WHERE key IN ('game_over', 'winner')");
}

const AI_TOOL_LIMIT_EXCEEDED_KEY = 'ai_tool_limit_exceeded_last_turn';
const AI_LAST_CONSULTATION_TURN_KEY = 'ai_last_consultation_turn';

/**
 * Sets the flag that the previous AI turn hit the tool-call iteration limit (10).
 * The next turn's system prompt should include a warning and then clear the flag.
 */
export function setAiToolLimitExceededLastTurn(): void {
  if (!db) return;
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES (?, '1')", [AI_TOOL_LIMIT_EXCEEDED_KEY]);
}

/**
 * Returns true if the AI tool limit was exceeded last turn, and clears the flag.
 * Call when building the system prompt so the warning is injected at most once.
 */
export function getAndClearAiToolLimitExceededLastTurn(): boolean {
  if (!db) return false;
  const row = getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  run('DELETE FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  return row?.value === '1';
}

/**
 * Returns the turn number at which the LLM was last consulted for the opponent (0 if never).
 * Used by callback evaluation for deadman and first-consultation overrides.
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
 * Stores the turn number at which the LLM was last consulted. Call after a successful consultation.
 */
export function setAiLastConsultationTurn(turn: number): void {
  logDebug('gameDb setAiLastConsultationTurn', { turn });
  if (!db) return;
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [AI_LAST_CONSULTATION_TURN_KEY, String(turn)]);
}

const OPPONENT_ID = 'opponent';

/**
 * Returns opponent unit IDs that have participated in combat since the last consultation.
 * Used to detect "first combat" mandatory override.
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
 * Adds opponent unit IDs that participated in combat this resolution. Call after each resolution.
 */
export function addOpponentCombatParticipants(unitIds: string[]): void {
  logDebug('gameDb addOpponentCombatParticipants', { count: unitIds.length });
  if (!db || unitIds.length === 0) return;
  for (const id of unitIds) {
    run('INSERT OR IGNORE INTO ai_combat_since_consultation (player_id, unit_id) VALUES (?, ?)', [OPPONENT_ID, id]);
  }
}

/**
 * Clears the set of opponent units in combat since consultation. Call when a consultation runs.
 */
export function clearOpponentCombatSinceConsultation(): void {
  logDebug('gameDb clearOpponentCombatSinceConsultation');
  if (!db) return;
  run('DELETE FROM ai_combat_since_consultation WHERE player_id = ?', [OPPONENT_ID]);
}

/**
 * Returns pending AI orders for the next turn (movement + ranged) if any. Used when event-driven consultation ran after last resolution.
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
 * Stores pending AI orders for the next turn. Call after a successful consultation in event-driven mode.
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
    [
      playerId,
      JSON.stringify(movementOrders),
      JSON.stringify(rangedOrders),
      null,
    ]
  );
}

/**
 * Clears pending AI orders for a player. Call after consuming them at Ready or on new game.
 */
export function clearAiPendingOrders(playerId: string): void {
  logDebug('gameDb clearAiPendingOrders', { playerId });
  if (!db) return;
  run('DELETE FROM ai_pending_orders WHERE player_id = ?', [playerId]);
}

/**
 * Re-initializes the game for a new match with the given map size: stores map_size, deletes units and hexes,
 * generates a new seed, re-seeds hexes and units for that size, clears game_over/winner, resets turn and phase,
 * clears pending orders. Call from newGame(size) IPC.
 */
export function resetGameForNewMatch(size: MapSize = 'small'): void {
  if (!db) return;
  run('DELETE FROM units');
  run('DELETE FROM hexes');
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('map_size', ?)", [size]);
  run("DELETE FROM game_config WHERE key = 'game_seed'");
  seedGameSeedIfMissing();
  seedHexes(size);
  seedUnits(size);
  run('DELETE FROM pending_orders');
  run('DELETE FROM pending_ranged_orders');
  run('UPDATE turn_state SET phase = ?, turn_number = 1 WHERE id = 1', ['planning']);
  clearGameOver();
  run('DELETE FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  run('DELETE FROM ai_callback_subscriptions');
  run('DELETE FROM ai_pending_orders');
  run('DELETE FROM ai_combat_since_consultation');
  run("DELETE FROM game_config WHERE key = 'ai_last_consultation_turn'");
  saveDatabase();
}
