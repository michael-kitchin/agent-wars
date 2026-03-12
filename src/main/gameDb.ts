/**
 * Game state persistence in SQLite. Schema: hexes (with terrain), units, turn state, pending orders.
 * All access runs in the main process. Uses sql.js (WASM) so no native build is required.
 * The DB file lives in Electron userData directory; we load/save it manually.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getOrderedHexList } from './mapData';
import { logTrace } from './logger';

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
 * Seeds the hexes table with the ordered map hexes and terrain (land/water).
 * Uses a simple rule: every 4th hex is water so both terrain types appear. Idempotent if hexes already exist.
 */
function seedHexesIfEmpty(): void {
  if (db === null) return;
  const count = getOne<{ c: number }>('SELECT COUNT(*) AS c FROM hexes');
  if (count && count.c > 0) return;

  const hexes = getOrderedHexList();
  for (let i = 0; i < hexes.length; i++) {
    const terrain = i % 4 === 0 ? 'water' : 'land';
    run('INSERT INTO hexes (h3_index, terrain) VALUES (?, ?)', [hexes[i], terrain]);
  }
}

/**
 * Seeds the units table with 3–5 units per side (human and opponent) when empty.
 * Human units on land hexes (and one naval on water); opponent on the opposite side. Idempotent.
 */
function seedUnitsIfEmpty(): void {
  if (db === null) return;
  const count = getOne<{ c: number }>('SELECT COUNT(*) AS c FROM units');
  if (count && count.c > 0) return;

  const hexes = getOrderedHexList();
  const landIndices: number[] = [];
  const waterIndices: number[] = [];
  for (let i = 0; i < hexes.length; i++) {
    if (i % 4 === 0) waterIndices.push(i);
    else landIndices.push(i);
  }

  const humanLand = landIndices.slice(0, 4);
  const humanWater = waterIndices[0];
  const opponentLand = landIndices.slice(-4);
  const opponentWater = waterIndices[waterIndices.length - 1];

  const humanUnits: [string, string, string][] = [
    ['human-infantry-1', 'infantry', hexes[humanLand[0]!]!],
    ['human-armor-1', 'armor', hexes[humanLand[1]!]!],
    ['human-infantry-2', 'infantry', hexes[humanLand[2]!]!],
    ['human-armor-2', 'armor', hexes[humanLand[3]!]!],
    ['human-naval-1', 'naval', hexes[humanWater]!],
  ];
  for (const [id, unitType, h3Index] of humanUnits) {
    run('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, 'human', unitType, h3Index]);
  }

  const opponentUnits: [string, string, string][] = [
    ['opponent-infantry-1', 'infantry', hexes[opponentLand[0]!]!],
    ['opponent-armor-1', 'armor', hexes[opponentLand[1]!]!],
    ['opponent-infantry-2', 'infantry', hexes[opponentLand[2]!]!],
    ['opponent-armor-2', 'armor', hexes[opponentLand[3]!]!],
    ['opponent-naval-1', 'naval', hexes[opponentWater]!],
  ];
  for (const [id, unitType, h3Index] of opponentUnits) {
    run('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, 'opponent', unitType, h3Index]);
  }
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
 * Creates or loads the database and tables. Idempotent. Async because sql.js loads WASM.
 * Call once when the main process is ready (e.g. in app.whenReady()).
 */
export async function initDatabase(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  dbPath = getDbPath();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    db = new SQL.Database();
  }

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
  `);

  const row = getOne('SELECT 1 FROM turn_state WHERE id = 1');
  if (!row) {
    run('INSERT INTO turn_state (id, phase, turn_number) VALUES (1, ?, ?)', ['planning', 1]);
  }

  seedHexesIfEmpty();
  seedUnitsIfEmpty();
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

  const ordered = getOrderedHexList();
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

  return {
    hexes: hexRows,
    units: unitRows,
    phase: turnRow?.phase ?? 'planning',
    turnNumber: turnRow?.turnNumber ?? 1,
    pendingOrders: orderRows,
  };
}

/** Snapshot of game state sent to the renderer (camelCase for JSON). */
export interface GameStateSnapshot {
  hexes: { h3Index: string; terrain: string }[];
  units: { id: string; player: string; unitType: string; h3Index: string }[];
  phase: string;
  turnNumber: number;
  pendingOrders: { unitId: string; toH3Index: string }[];
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
