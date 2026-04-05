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
import { getOrderedHexList } from './mapData';
import {
  assertTerrainMetadataMatchesHexList,
} from './terrainMetadataLoad';
import {
  ensureTerrainClassificationCacheLoaded,
  getTerrainRes1KindsFromCache,
  getRes1ProductionContext,
  getRes4FeatureRowsForSeeding,
  getRes4TerrainOverridesForRenderer as getRes4TerrainOverridesFromCache,
} from './terrainClassificationCache';
import { pipelineTerrainToPassability } from './terrainPassability';
import { logDebug, logError, logTrace } from './logger';
import type { AirStrikeOrder, FerryOrder, GameStateSnapshot, MovementOrder, RangedAttackOrder } from '../shared/ipcTypes';
import type { BuildUnitType } from './productionRules';
import { seedUnits as seedUnitsFromModule } from './game-db/seeding/seedUnits';
import {
  recoverCorruptDatabaseUi as recoverCorruptDatabaseUiWithFs,
  silentRecoverCorruptDatabase as silentRecoverCorruptDatabaseWithFs,
} from './game-db/recovery/corruptRecovery';
import { getFullDdl } from './game-db/schema';
import {
  clearBuildQueueAndProgressForHex as clearBuildQueueAndProgressForHexFromModule,
  getBuildProgressPointsForHex as getBuildProgressPointsForHexFromModule,
  getHexController as getHexControllerFromModule,
  getRes1InfrastructureForHex as getRes1InfrastructureForHexFromModule,
  getRes4TerrainOverridesForRendererFromGame as getRes4TerrainOverridesForRendererFromGameFromModule,
  listAllHexControls as listAllHexControlsFromModule,
  listBuildQueueRowsForHex as listBuildQueueRowsForHexFromModule,
  listRes1InfrastructureRows as listRes1InfrastructureRowsFromModule,
  listRes4FeatureOverridesForGame as listRes4FeatureOverridesForGameFromModule,
  replaceBuildQueueForHex as replaceBuildQueueForHexFromModule,
  setBuildProgressPointsForHex as setBuildProgressPointsForHexFromModule,
  setHexController as setHexControllerFromModule,
  setRes1InfrastructureForHex as setRes1InfrastructureForHexFromModule,
  updateRes4FeatureOverrideRow as updateRes4FeatureOverrideRowFromModule,
  type BuildQueueRow,
  type HexControlRow,
  type Res1InfrastructureRow,
  type Res4FeatureOverrideRow,
} from './game-db/controlInfrastructure';
import {
  addAiLossEventsSinceConsultation as addAiLossEventsSinceConsultationFromModule,
  addOpponentCombatParticipants as addOpponentCombatParticipantsFromModule,
  clearAiLossEventsSinceConsultation as clearAiLossEventsSinceConsultationFromModule,
  clearAiPendingOrders as clearAiPendingOrdersFromModule,
  clearOpponentCombatSinceConsultation as clearOpponentCombatSinceConsultationFromModule,
  getAiLastConsultationTurn as getAiLastConsultationTurnFromModule,
  getAiLossEventsSinceConsultation as getAiLossEventsSinceConsultationFromModule,
  getAiPendingOrders as getAiPendingOrdersFromModule,
  getAndClearAiToolLimitExceededLastTurn as getAndClearAiToolLimitExceededLastTurnFromModule,
  getOpponentUnitsInCombatSinceConsultation as getOpponentUnitsInCombatSinceConsultationFromModule,
  setAiLastConsultationTurn as setAiLastConsultationTurnFromModule,
  setAiPendingOrders as setAiPendingOrdersFromModule,
  setAiToolLimitExceededLastTurn as setAiToolLimitExceededLastTurnFromModule,
  type AiLossEventSinceConsultation,
} from './game-db/aiState';
import {
  consumeFogNewContactsForPlayer as consumeFogNewContactsForPlayerFromModule,
  getGameStateSnapshot as getGameStateSnapshotFromModule,
  getGameStateForPlayer as getGameStateForPlayerFromModule,
  refreshFogOfWarIntelFromCurrentState as refreshFogOfWarIntelFromCurrentStateFromModule,
} from './game-db/fogState';
import { resetGameForNewMatch as resetGameForNewMatchFromModule } from './game-db/resetGame';

export type { GameStateSnapshot } from '../shared/ipcTypes';
export type { AiLossEventSinceConsultation } from './game-db/aiState';
export type { BuildQueueRow, HexControlRow, Res1InfrastructureRow, Res4FeatureOverrideRow } from './game-db/controlInfrastructure';

/** Baseline schema version; bump when a future milestone adds migration chains. */
export const EXPECTED_USER_VERSION = 10;

/**
 * Baseline filename for world-map + fog-of-war + production schema (v9).
 */
export const GAME_DB_FILE_NAME = 'game-baseline-v10.sqlite';

let db: InstanceType<typeof Database> | null = null;

const REQUIRED_TABLES = [
  'hexes',
  'units',
  'turn_state',
  'pending_orders',
  'pending_ranged_orders',
  'pending_air_orders',
  'pending_ferry_orders',
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
  'res1_infrastructure',
  'res4_feature_overrides',
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

interface DbUnitSnapshotRow extends Record<string, unknown> {
  id: string;
  player: string;
  unit_type: string;
  h3_index: string;
  display_order: number | null;
}

function mapDbUnitSnapshotRow(row: DbUnitSnapshotRow): GameStateSnapshot['units'][number] {
  return {
    id: row.id,
    player: row.player,
    unitType: row.unit_type,
    h3Index: row.h3_index,
    displayOrder: typeof row.display_order === 'number' ? row.display_order : undefined,
  };
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
  return silentRecoverCorruptDatabaseWithFs(canonicalPath, createFreshGameDatabaseAt);
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
    ensureTerrainClassificationCacheLoaded();
    backfillInfrastructureStateFromMetadataIfMissing();
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
    recoverCorruptDatabaseUiWithFs(canonicalPath, err, {
      closeDbHandle,
      createFreshDatabaseAt: createFreshGameDatabaseAt,
    });
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

function unitDisplaySequenceKey(unitType: BuildUnitType): string {
  return `unit_display_sequence_${unitType}`;
}

/**
 * Why this exists:
 *     Allocates the next non-repeating display number for one unit type within the current match.
 * When to use:
 *     Whenever a new unit row is inserted (initial seeding and production spawns).
 * What to expect:
 *     Returns 1-based sequence values that increase monotonically per unit type until next match reset.
 */
export function allocateNextUnitDisplayOrder(unitType: BuildUnitType): number {
  logDebug('gameDb allocateNextUnitDisplayOrder', { unitType });
  if (!db) return 1;
  const key = unitDisplaySequenceKey(unitType);
  const row = getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key]);
  const current = row ? Number.parseInt(row.value, 10) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [key, String(next)]);
  return next;
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

function seedInfrastructureStateFromMetadata(): void {
  logDebug('gameDb seedInfrastructureStateFromMetadata');
  if (db === null) return;
  run('DELETE FROM res1_infrastructure');
  run('DELETE FROM res4_feature_overrides');
  const { res1Rows, res4Rows } = getInfrastructureSeedRowsFromMetadata();
  for (const row of res1Rows) {
    insertRes1InfrastructureRow(row.h3Index, row.urbanHexCount, row.airportCount, row.seaportCount);
  }
  for (const row of res4Rows) {
    insertRes4FeatureOverrideSeedRow(row);
  }
}

function backfillInfrastructureStateFromMetadataIfMissing(): void {
  logDebug('gameDb backfillInfrastructureStateFromMetadataIfMissing');
  if (db === null) return;
  const hexRows = getAll<{ h3Index: string }>('SELECT h3_index AS h3Index FROM hexes');
  if (hexRows.length <= 0) return;

  const existingInfra = new Set(
    getAll<{ h3Index: string }>('SELECT h3_index AS h3Index FROM res1_infrastructure').map((r) => r.h3Index)
  );
  const existingRes4Overrides = new Set(
    getAll<{ h3Index: string }>('SELECT h3_index AS h3Index FROM res4_feature_overrides').map((r) => r.h3Index)
  );
  const { res1Rows, res4Rows } = getInfrastructureSeedRowsFromMetadata();
  let insertedInfra = 0;
  for (const row of res1Rows) {
    if (existingInfra.has(row.h3Index)) continue;
    insertRes1InfrastructureRow(row.h3Index, row.urbanHexCount, row.airportCount, row.seaportCount);
    insertedInfra += 1;
  }
  let insertedRes4 = 0;
  for (const row of res4Rows) {
    if (existingRes4Overrides.has(row.h3Index)) continue;
    insertRes4FeatureOverrideSeedRow(row);
    insertedRes4 += 1;
  }

  if (insertedInfra > 0 || insertedRes4 > 0) {
    logDebug('gameDb backfillInfrastructureStateFromMetadataIfMissing: inserted missing rows', {
      insertedInfra,
      insertedRes4,
    });
  }
}

interface InfrastructureSeedRes1Row {
  h3Index: string;
  urbanHexCount: number;
  airportCount: number;
  seaportCount: number;
}

interface InfrastructureSeedRows {
  res1Rows: InfrastructureSeedRes1Row[];
  res4Rows: ReturnType<typeof getRes4FeatureRowsForSeeding>;
}

function getInfrastructureSeedRowsFromMetadata(): InfrastructureSeedRows {
  const res1Rows: InfrastructureSeedRes1Row[] = getOrderedHexList().map((h3Index) => {
    const ctx = getRes1ProductionContext({ h3Index });
    return {
      h3Index,
      urbanHexCount: ctx.urbanHexCount,
      airportCount: ctx.airportCount,
      seaportCount: ctx.seaportCount,
    };
  });
  const res4Rows = getRes4FeatureRowsForSeeding().filter((row) => row.isUrban || row.isAirport || row.isSeaport);
  return { res1Rows, res4Rows };
}

function insertRes1InfrastructureRow(
  h3Index: string,
  urbanHexCount: number,
  airportCount: number,
  seaportCount: number
): void {
  run(
    `INSERT INTO res1_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, ?, ?, ?)`,
    [h3Index, urbanHexCount, airportCount, seaportCount]
  );
}

function insertRes4FeatureOverrideSeedRow(row: ReturnType<typeof getRes4FeatureRowsForSeeding>[number]): void {
  run(
    `INSERT INTO res4_feature_overrides (
       h3_index, parent_h3_index, terrain_kind, is_urban, is_airport, is_seaport, is_rubble
     ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [row.h3Index, row.parentH3Index, row.terrainKind, row.isUrban ? 1 : 0, row.isAirport ? 1 : 0, row.isSeaport ? 1 : 0]
  );
}

function seedUnits(): void {
  seedUnitsFromModule({
    run,
    getAll,
    allocateNextUnitDisplayOrder,
    hasDb: () => db !== null,
  });
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

const FOG_OF_WAR_ENABLED_KEY = 'fog_of_war_enabled';

function getFogDeps() {
  return {
    ops: {
      hasDb: () => db !== null,
      run,
      getOne,
      getAll,
    },
    listUnitsForSnapshot,
    listRes1InfrastructureRows,
  };
}

/**
 * Recomputes persisted fog-of-war intel rows from current board state for both sides.
 * Use after any resolution/new-game state changes so side-subjective snapshots remain deterministic.
 */
export function refreshFogOfWarIntelFromCurrentState(options?: {
  traversedHexesByPlayer?: Partial<Record<'human' | 'opponent', string[]>>;
}): void {
  refreshFogOfWarIntelFromCurrentStateFromModule(getFogDeps(), options);
}

/**
 * Returns and clears newly discovered enemy unit ids for the given side (computed during latest fog refresh).
 */
export function consumeFogNewContactsForPlayer(playerId: 'human' | 'opponent'): string[] {
  return consumeFogNewContactsForPlayerFromModule(
    { hasDb: () => db !== null, run, getOne, getAll },
    playerId
  );
}

export function getGameState(): GameStateSnapshot {
  return getGameStateSnapshotFromModule(getFogDeps());
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
  return getGameStateForPlayerFromModule(getFogDeps(), playerId, options);
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
 * Why this exists:
 *     Centralizes unit-row projection for gameplay snapshots so all callers receive identical unit fields.
 * When to use:
 *     Any main-process read path that needs current units in `GameStateSnapshot` shape.
 * What to expect:
 *     Returns one row per unit including optional `displayOrder` for stable player-facing naming.
 */
export function listUnitsForSnapshot(): GameStateSnapshot['units'] {
  logTrace('gameDb listUnitsForSnapshot');
  const rows = getAll<DbUnitSnapshotRow>(
    'SELECT id, player, unit_type, h3_index, display_order FROM units'
  );
  return rows.map(mapDbUnitSnapshotRow);
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
  return getHexControllerFromModule({ run, getOne, getAll }, h3Index);
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
  setHexControllerFromModule({ run, getOne, getAll }, h3Index, controllerPlayerId);
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
  return listAllHexControlsFromModule({ run, getOne, getAll });
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
  return listBuildQueueRowsForHexFromModule({ run, getOne, getAll }, h3Index);
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
  return getBuildProgressPointsForHexFromModule({ run, getOne, getAll }, h3Index);
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
  setBuildProgressPointsForHexFromModule({ run, getOne, getAll }, h3Index, storedPoints);
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
  clearBuildQueueAndProgressForHexFromModule({ run, getOne, getAll }, h3Index);
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
  replaceBuildQueueForHexFromModule({ run, getOne, getAll }, h3Index, entries);
}

/**
 * Why this exists:
 *     Returns production/air-target infrastructure counts for one res-1 hex from mutable game state.
 * When to use:
 *     Queue gating, air-strike validation, and infrastructure-destruction effects.
 * What to expect:
 *     Returns zeros when no row exists (defensive default).
 */
export function getRes1InfrastructureForHex(h3Index: string): Res1InfrastructureRow {
  return getRes1InfrastructureForHexFromModule({ run, getOne, getAll }, h3Index);
}

/**
 * Why this exists:
 *     Returns all mutable infrastructure rows for renderer snapshots and integration checks.
 * When to use:
 *     Game-state snapshot assembly and tests.
 * What to expect:
 *     Stable h3-sorted list.
 */
export function listRes1InfrastructureRows(): Res1InfrastructureRow[] {
  return listRes1InfrastructureRowsFromModule({ run, getOne, getAll });
}

/**
 * Why this exists:
 *     Persists one res-1 infrastructure row after destruction effects mutate counts.
 * When to use:
 *     Air-strike resolution and infrastructure synchronization flows.
 * What to expect:
 *     Upserts non-negative values.
 */
export function setRes1InfrastructureForHex(
  h3Index: string,
  counts: { urbanHexCount: number; airportCount: number; seaportCount: number }
): void {
  setRes1InfrastructureForHexFromModule({ run, getOne, getAll }, h3Index, counts);
}

/**
 * Why this exists:
 *     Lists mutable res-4 feature rows (urban/airport/seaport/rubble flags) for renderer overlays and random replacement.
 * When to use:
 *     Infrastructure destruction effects and renderer overlay IPC.
 * What to expect:
 *     Stable h3-sorted rows.
 */
export function listRes4FeatureOverridesForGame(): Res4FeatureOverrideRow[] {
  return listRes4FeatureOverridesForGameFromModule({ run, getOne, getAll });
}

/**
 * Why this exists:
 *     Updates feature flags for one res-4 row after randomized infrastructure-to-rubble replacement.
 * When to use:
 *     Air-strike infrastructure destruction effect application.
 * What to expect:
 *     No-op when row is missing.
 */
export function updateRes4FeatureOverrideRow(
  h3Index: string,
  patch: Partial<Pick<Res4FeatureOverrideRow, 'isUrban' | 'isAirport' | 'isSeaport' | 'isRubble'>>
): void {
  updateRes4FeatureOverrideRowFromModule({ run, getOne, getAll }, h3Index, patch);
}

/**
 * Why this exists:
 *     Produces renderer res-4 override rows by overlaying mutable feature/rubble state on metadata-derived terrain rows.
 * When to use:
 *     IPC `game:getRes4TerrainOverrides` handler.
 * What to expect:
 *     Returns stable row list where `isUrban` reflects live state and `isRubble` marks rubble replacements.
 */
export function getRes4TerrainOverridesForRendererFromGame(): Array<{
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
}> {
  return getRes4TerrainOverridesForRendererFromGameFromModule({ run, getOne, getAll });
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

function getAiStateDbOps() {
  return {
    hasDb: () => db !== null,
    run,
    getOne,
    getAll,
  };
}

/**
 * Records that the AI exceeded the tool-call cap last turn so the next prompt can show a one-time warning. Call from
 * the OpenRouter loop when the cap is hit.
 */
export function setAiToolLimitExceededLastTurn(): void {
  setAiToolLimitExceededLastTurnFromModule(getAiStateDbOps());
}

/**
 * Returns whether the tool-limit flag was set, then deletes that flag. Call once per opponent turn when building the
 * system prompt so the warning shows at most once.
 */
export function getAndClearAiToolLimitExceededLastTurn(): boolean {
  return getAndClearAiToolLimitExceededLastTurnFromModule(getAiStateDbOps());
}

/**
 * Returns the turn number of the last AI consultation (event-driven flow), or 0 if unset. Use to avoid duplicate
 * first_consultation triggers and similar turn-gated logic.
 */
export function getAiLastConsultationTurn(): number {
  return getAiLastConsultationTurnFromModule(getAiStateDbOps());
}

/**
 * Persists the turn number after a consultation so later evaluation can tell whether this turn already consulted. Call
 * when applying AI orders from LLM or pending buffer.
 */
export function setAiLastConsultationTurn(turn: number): void {
  setAiLastConsultationTurnFromModule(getAiStateDbOps(), turn);
}

/**
 * Lists opponent unit ids that entered combat since the last consultation. Use to decide whether to re-prompt the AI
 * under event-driven rules; empty when the DB is closed or the set is empty.
 */
export function getOpponentUnitsInCombatSinceConsultation(): string[] {
  return getOpponentUnitsInCombatSinceConsultationFromModule(getAiStateDbOps());
}

/**
 * Records opponent units involved in combat this turn for event-driven re-consultation. Call from resolution when
 * opponent units fight; duplicates are ignored (INSERT OR IGNORE).
 */
export function addOpponentCombatParticipants(unitIds: string[]): void {
  addOpponentCombatParticipantsFromModule(getAiStateDbOps(), unitIds);
}

/**
 * Clears the combat-since-consultation set after a new AI consultation. Call when starting a fresh planning window.
 */
export function clearOpponentCombatSinceConsultation(): void {
  clearOpponentCombatSinceConsultationFromModule(getAiStateDbOps());
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
  addAiLossEventsSinceConsultationFromModule(
    getAiStateDbOps(),
    playerId,
    turnNumber,
    removedUnits,
    kills,
    killsByDirectFire,
    killsByReturnFire
  );
}

/**
 * Returns unresolved loss events captured since the last successful LLM consultation for the given player.
 * Use this to build an explicit "losses since last call" briefing block.
 */
export function getAiLossEventsSinceConsultation(playerId: string): AiLossEventSinceConsultation[] {
  return getAiLossEventsSinceConsultationFromModule(getAiStateDbOps(), playerId);
}

/**
 * Clears accumulated loss events after a successful LLM consultation so the next briefing window starts fresh.
 */
export function clearAiLossEventsSinceConsultation(playerId: string): void {
  clearAiLossEventsSinceConsultationFromModule(getAiStateDbOps(), playerId);
}

/**
 * Loads AI movement and ranged orders staged for the next apply (e.g. event-driven path). Returns null if missing,
 * unparsable JSON, or DB closed. Does not clear the row; use clearAiPendingOrders after consumption.
 */
export function getAiPendingOrders(playerId: string): {
  movementOrders: MovementOrder[];
  rangedOrders: RangedAttackOrder[];
  airStrikeOrders: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
} | null {
  return getAiPendingOrdersFromModule(getAiStateDbOps(), playerId);
}

/**
 * Persists movement and ranged orders for a player until the game loop applies them. Use when the LLM defers orders
 * across turns or the pipeline buffers opponent orders before Ready.
 */
export function setAiPendingOrders(
  playerId: string,
  movementOrders: MovementOrder[],
  rangedOrders: RangedAttackOrder[],
  airStrikeOrders: AirStrikeOrder[] = [],
  ferryOrders: FerryOrder[] = []
): void {
  setAiPendingOrdersFromModule(getAiStateDbOps(), playerId, movementOrders, rangedOrders, airStrikeOrders, ferryOrders);
}

/**
 * Deletes staged AI orders for a player after they have been applied or superseded. Use paired with getAiPendingOrders.
 */
export function clearAiPendingOrders(playerId: string): void {
  clearAiPendingOrdersFromModule(getAiStateDbOps(), playerId);
}

/**
 * Re-initializes the game for a new match: world map from terrain metadata classification, fresh seed, hexes/units, turn state,
 * pending orders, callbacks, AI memory, and standing orders cleared so no prior-match AI state leaks.
 * Optionally disables fog of war for the new match so both sides always receive full-map/full-unit snapshots.
 */
export function resetGameForNewMatch(options?: { fogOfWarEnabled?: boolean }): void {
  resetGameForNewMatchFromModule(
    {
      hasDb: () => db !== null,
      run,
      getAll,
      clearGameOver,
      seedGameSeedIfMissing,
      seedHexesFromTerrainMetadata,
      seedInfrastructureStateFromMetadata,
      seedUnits,
      refreshFogOfWarIntelFromCurrentState: () => refreshFogOfWarIntelFromCurrentState(),
      saveDatabase,
    },
    options
  );
}
