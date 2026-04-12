/**
 * Game state persistence in SQLite via better-sqlite3 (native). Single file under Electron userData;
 * durable across restarts (no wipe on launch). Schema: hexes, units, turn state, pending orders, AI tables.
 *
 * Legacy sql.js file `game.db` is not migrated; current baseline file is GAME_DB_FILE_NAME.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
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
} from './terrainClassificationCache';
import { pipelineTerrainToPassability } from './terrainPassability';
import { logDebug, logError, logTrace } from './logger';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder, GameStateSnapshot, MovementOrder, RangedAttackOrder } from '../shared/ipcTypes';
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
  ensureRes1InfrastructureSyncTriggers as ensureRes1InfrastructureSyncTriggersFromModule,
  listAllHexControls as listAllHexControlsFromModule,
  listBuildQueueRowsForHex as listBuildQueueRowsForHexFromModule,
  listRes1InfrastructureRows as listRes1InfrastructureRowsFromModule,
  listRes4FeatureOverridesForGame as listRes4FeatureOverridesForGameFromModule,
  reconcileRes1InfrastructureCountsFromRes4Overrides as reconcileRes1InfrastructureCountsFromRes4OverridesFromModule,
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
import { mergeMeleeCandidateHexesIntoHumanFogSnapshot } from './game-actions/meleeInterceptPendingState';
import { mergeActiveTacticalSessionIntoGameStateSnapshot } from './game-db/attachTacticalSessionToGameState';
import {
  allocateNextUnitDisplayOrderWithOps,
  clearGameOverWithOps,
  getGameSeedWithOps,
  seedGameSeedIfMissingWithOps,
  setGameOverWithOps,
} from './game-db/gameConfigKv';
import { resetGameForNewMatch as resetGameForNewMatchFromModule } from './game-db/resetGame';
import {
  getScenarioHomeRegionHexes as getScenarioHomeRegionHexesFromModule,
  listScenarioHomeRegions as listScenarioHomeRegionsFromModule,
} from './regionScenario';

export type { GameStateSnapshot } from '../shared/ipcTypes';
export type { AiLossEventSinceConsultation } from './game-db/aiState';
export type { BuildQueueRow, HexControlRow, Res1InfrastructureRow, Res4FeatureOverrideRow } from './game-db/controlInfrastructure';

/**
 * Documents the module-scope binding `EXPECTED_USER_VERSION` (EXPECTED_USER_VERSION).

 * Purpose: Supports maintainability by documenting why `EXPECTED_USER_VERSION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const EXPECTED_USER_VERSION = 11;

/**
 * Documents the module-scope binding `GAME_DB_FILE_NAME` (GAME_DB_FILE_NAME).

 * Purpose: Supports maintainability by documenting why `GAME_DB_FILE_NAME` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const GAME_DB_FILE_NAME = 'game-baseline-v11.sqlite';

/**
 * Documents the module-scope binding `db` (db: InstanceType<typeof Database> | null).

 * Purpose: Supports maintainability by documenting why `db` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let db: InstanceType<typeof Database> | null = null;

/**
 * Documents the module-scope binding `REQUIRED_TABLES` (REQUIRED_TABLES).

 * Purpose: Supports maintainability by documenting why `REQUIRED_TABLES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const REQUIRED_TABLES = [
  'hexes',
  'units',
  'turn_state',
  'pending_orders',
  'pending_ranged_orders',
  'pending_air_orders',
  'pending_ferry_orders',
  'unit_transport_assignments',
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
 * Documents the module-scope binding `INFRASTRUCTURE_SYNC_TRIGGER_NAMES` (INFRASTRUCTURE_SYNC_TRIGGER_NAMES).

 * Purpose: Supports maintainability by documenting why `INFRASTRUCTURE_SYNC_TRIGGER_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const INFRASTRUCTURE_SYNC_TRIGGER_NAMES = [
  'res4_sync_res1_after_insert',
  'res4_sync_res1_after_delete',
  'res4_sync_res1_after_update',
] as const;

/**
 * Defines the `applyGameDbPragmas` function shape (export function applyGameDbPragmas(database: InstanceType<typeof Database>): void).

 * Purpose: Supports maintainability by documenting why `applyGameDbPragmas` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applyGameDbPragmas(database: InstanceType<typeof Database>): void {
  database.pragma('journal_mode = MEMORY');
  database.pragma('foreign_keys = ON');
  database.pragma('defer_foreign_keys = ON');
  database.pragma('synchronous = OFF');
}

/**
 * Defines the `validateGameDatabaseOrThrow` function shape (export function validateGameDatabaseOrThrow(database: InstanceType<typeof Database>): void).

 * Purpose: Supports maintainability by documenting why `validateGameDatabaseOrThrow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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

/**
 * Defines the `closeDbHandle` function shape (function closeDbHandle(): void).

 * Purpose: Supports maintainability by documenting why `closeDbHandle` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `run` function shape (function run(sql: string, params: unknown[] = []): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(sql: string, params: unknown[] = []): void {
  if (!db) return;
  db.prepare(sql).run(...(params as never[]));
}

/**
 * Defines the `getOne` function shape (function getOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined).

 * Purpose: Supports maintainability by documenting why `getOne` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  if (!db) return undefined;
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

/**
 * Defines the `getAll` function shape (function getAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[]).

 * Purpose: Supports maintainability by documenting why `getAll` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  if (!db) return [];
  return db.prepare(sql).all(...(params as never[])) as T[];
}

/**
 * Documents the `DbUnitSnapshotRow` interface as a named contract surface (interface DbUnitSnapshotRow extends Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `DbUnitSnapshotRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface DbUnitSnapshotRow extends Record<string, unknown> {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `player` member (player: string;).

   * Contract: Describes stable behavior for callers of `player` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
player: string;
    /**
   * Specifies the contract for the `unit_type` member (unit_type: string;).

   * Contract: Describes stable behavior for callers of `unit_type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unit_type: string;
    /**
   * Specifies the contract for the `h3_index` member (h3_index: string;).

   * Contract: Describes stable behavior for callers of `h3_index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3_index: string;
    /**
   * Specifies the contract for the `display_order` member (display_order: number | null;).

   * Contract: Describes stable behavior for callers of `display_order` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
display_order: number | null;
}

/**
 * Defines the `mapDbUnitSnapshotRow` function shape (function mapDbUnitSnapshotRow(row: DbUnitSnapshotRow): GameStateSnapshot['units'][number]).

 * Purpose: Supports maintainability by documenting why `mapDbUnitSnapshotRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function mapDbUnitSnapshotRow(row: DbUnitSnapshotRow): GameStateSnapshot['units'][number] {
  return {
    id: row.id,
    player: row.player,
    unitType: row.unit_type,
    h3Index: row.h3_index,
    displayOrder: typeof row.display_order === 'number' ? row.display_order : undefined,
  };
}

/**
 * Defines the `getCanonicalDbPath` function shape (function getCanonicalDbPath(): string).

 * Purpose: Supports maintainability by documenting why `getCanonicalDbPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getCanonicalDbPath(): string {
  return path.join(app.getPath('userData'), GAME_DB_FILE_NAME);
}

/**
 * Defines the `ensureTurnStateRow` function shape (function ensureTurnStateRow(): void).

 * Purpose: Supports maintainability by documenting why `ensureTurnStateRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function ensureTurnStateRow(): void {
  if (!db) return;
  const row = getOne('SELECT 1 FROM turn_state WHERE id = 1');
  if (!row) {
    run('INSERT INTO turn_state (id, phase, turn_number) VALUES (1, ?, ?)', ['planning', 1]);
  }
}

/**
 * Defines the `createFreshGameDatabaseAt` function shape (export function createFreshGameDatabaseAt(canonicalPath: string): void).

 * Purpose: Supports maintainability by documenting why `createFreshGameDatabaseAt` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function createFreshGameDatabaseAt(canonicalPath: string): void {
  logDebug('gameDb createFreshGameDatabaseAt', { canonicalPath });
  closeDbHandle();
  const dir = path.dirname(canonicalPath);
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(canonicalPath);
  applyGameDbPragmas(db);
  db.exec(getFullDdl());
  ensureRes1InfrastructureSyncTriggers();
  ensureTurnStateRow();
  db.pragma(`user_version = ${EXPECTED_USER_VERSION}`);
  seedGameSeedIfMissing();
}

/**
 * Defines the `openGameDatabaseAtPathForTests` function shape (export function openGameDatabaseAtPathForTests(absPath: string): void).

 * Purpose: Supports maintainability by documenting why `openGameDatabaseAtPathForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
    runInfrastructureStartupConsistencyPass();
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
 * Defines the `closeGameDatabaseForTests` function shape (export function closeGameDatabaseForTests(): void).

 * Purpose: Supports maintainability by documenting why `closeGameDatabaseForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function closeGameDatabaseForTests(): void {
  logDebug('gameDb closeGameDatabaseForTests');
  closeDbHandle();
}

/**
 * Defines the `silentRecoverCorruptDatabase` function shape (function silentRecoverCorruptDatabase(canonicalPath: string): void).

 * Purpose: Supports maintainability by documenting why `silentRecoverCorruptDatabase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function silentRecoverCorruptDatabase(canonicalPath: string): void {
  return silentRecoverCorruptDatabaseWithFs(canonicalPath, createFreshGameDatabaseAt);
}

/**
 * Defines the `initDatabase` function shape (export async function initDatabase(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `initDatabase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
    runInfrastructureStartupConsistencyPass({ includeReconciliation: false });
    ensureTurnStateRow();
    seedGameSeedIfMissing();
    ensureTerrainClassificationCacheLoaded();
    backfillInfrastructureStateFromMetadataIfMissing();
    reconcileRes1InfrastructureCountsFromRes4Overrides();
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

/**
 * Defines the `seedGameSeedIfMissing` function shape (function seedGameSeedIfMissing(): void).

 * Purpose: Supports maintainability by documenting why `seedGameSeedIfMissing` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function seedGameSeedIfMissing(): void {
  seedGameSeedIfMissingWithOps({ hasDb: () => db !== null, run, getOne });
}

/**
 * Defines the `allocateNextUnitDisplayOrder` function shape (export function allocateNextUnitDisplayOrder(unitType: BuildUnitType): number).

 * Purpose: Supports maintainability by documenting why `allocateNextUnitDisplayOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function allocateNextUnitDisplayOrder(unitType: BuildUnitType): number {
  return allocateNextUnitDisplayOrderWithOps({ hasDb: () => db !== null, run, getOne }, unitType);
}

/**
 * Defines the `getGameSeed` function shape (export function getGameSeed(): number).

 * Purpose: Supports maintainability by documenting why `getGameSeed` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getGameSeed(): number {
  return getGameSeedWithOps({ hasDb: () => db !== null, run, getOne });
}

/**
 * Defines the `listScenarioHomeRegions` function shape (export function listScenarioHomeRegions(): string[]).

 * Purpose: Supports maintainability by documenting why `listScenarioHomeRegions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listScenarioHomeRegions(): string[] {
  logTrace('gameDb listScenarioHomeRegions');
  return listScenarioHomeRegionsFromModule();
}

/**
 * Defines the `getScenarioHomeRegionHexes` function shape (export function getScenarioHomeRegionHexes(regionName: string): string[]).

 * Purpose: Supports maintainability by documenting why `getScenarioHomeRegionHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getScenarioHomeRegionHexes(regionName: string): string[] {
  logTrace('gameDb getScenarioHomeRegionHexes', { regionName });
  return getScenarioHomeRegionHexesFromModule(regionName);
}

/**
 * Defines the `seedHexesFromTerrainMetadata` function shape (function seedHexesFromTerrainMetadata(): void).

 * Purpose: Supports maintainability by documenting why `seedHexesFromTerrainMetadata` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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

/**
 * Defines the `seedInfrastructureStateFromMetadata` function shape (function seedInfrastructureStateFromMetadata(): void).

 * Purpose: Supports maintainability by documenting why `seedInfrastructureStateFromMetadata` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function seedInfrastructureStateFromMetadata(): void {
  logDebug('gameDb seedInfrastructureStateFromMetadata');
  if (db === null) return;
  for (const triggerName of INFRASTRUCTURE_SYNC_TRIGGER_NAMES) {
    run(`DROP TRIGGER IF EXISTS ${triggerName}`);
  }
  try {
    run('DELETE FROM res1_infrastructure');
    run('DELETE FROM res4_feature_overrides');
    const { res1Rows, res4Rows } = getInfrastructureSeedRowsFromMetadata();
    for (const row of res1Rows) {
      insertRes1InfrastructureRow(row.h3Index, row.urbanHexCount, row.airportCount, row.seaportCount);
    }
    for (const row of res4Rows) {
      insertRes4FeatureOverrideSeedRow(row);
    }
  } finally {
    // Bulk reseed already writes canonical res1 counts, so restoring triggers afterwards avoids N-per-row trigger overhead.
    ensureRes1InfrastructureSyncTriggers();
  }
  const { changedHexCount } = reconcileRes1InfrastructureCountsFromRes4Overrides();
  logDebug('gameDb seedInfrastructureStateFromMetadata: post-seed reconciliation complete', { changedHexCount });
}

/**
 * Defines the `backfillInfrastructureStateFromMetadataIfMissing` function shape (function backfillInfrastructureStateFromMetadataIfMissing(): void).

 * Purpose: Supports maintainability by documenting why `backfillInfrastructureStateFromMetadataIfMissing` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Documents the `InfrastructureSeedRes1Row` interface as a named contract surface (interface InfrastructureSeedRes1Row).

 * Purpose: Supports maintainability by documenting why `InfrastructureSeedRes1Row` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface InfrastructureSeedRes1Row {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: number;).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanHexCount: number;
    /**
   * Specifies the contract for the `airportCount` member (airportCount: number;).

   * Contract: Describes stable behavior for callers of `airportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airportCount: number;
    /**
   * Specifies the contract for the `seaportCount` member (seaportCount: number;).

   * Contract: Describes stable behavior for callers of `seaportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCount: number;
}

/**
 * Documents the `InfrastructureSeedRows` interface as a named contract surface (interface InfrastructureSeedRows).

 * Purpose: Supports maintainability by documenting why `InfrastructureSeedRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface InfrastructureSeedRows {
    /**
   * Specifies the contract for the `res1Rows` member (res1Rows: InfrastructureSeedRes1Row[];).

   * Contract: Describes stable behavior for callers of `res1Rows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res1Rows: InfrastructureSeedRes1Row[];
    /**
   * Specifies the contract for the `res4Rows` member (res4Rows: ReturnType<typeof getRes4FeatureRowsForSeeding>;).

   * Contract: Describes stable behavior for callers of `res4Rows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res4Rows: ReturnType<typeof getRes4FeatureRowsForSeeding>;
}

/**
 * Defines the `getInfrastructureSeedRowsFromMetadata` function shape (function getInfrastructureSeedRowsFromMetadata(): InfrastructureSeedRows).

 * Purpose: Supports maintainability by documenting why `getInfrastructureSeedRowsFromMetadata` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
  const res4Rows = getRes4FeatureRowsForSeeding()
    .filter((row) => row.isUrban || row.isAirport || row.isSeaport);
  return { res1Rows, res4Rows };
}

/**
 * Defines the `insertRes1InfrastructureRow` function shape (function insertRes1InfrastructureRow().

 * Purpose: Supports maintainability by documenting why `insertRes1InfrastructureRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `insertRes4FeatureOverrideSeedRow` function shape (function insertRes4FeatureOverrideSeedRow(row: ReturnType<typeof getRes4FeatureRowsForSeeding>[number]): void).

 * Purpose: Supports maintainability by documenting why `insertRes4FeatureOverrideSeedRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function insertRes4FeatureOverrideSeedRow(row: ReturnType<typeof getRes4FeatureRowsForSeeding>[number]): void {
  run(
    `INSERT INTO res4_feature_overrides (
       h3_index, parent_h3_index, terrain_kind, is_urban, is_airport, is_seaport, is_rubble
     ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [row.h3Index, row.parentH3Index, row.terrainKind, row.isUrban ? 1 : 0, row.isAirport ? 1 : 0, row.isSeaport ? 1 : 0]
  );
}

/**
 * Defines the `seedUnits` function shape (function seedUnits(): void).

 * Purpose: Supports maintainability by documenting why `seedUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function seedUnits(): void {
  seedUnitsFromModule({
    run,
    getOne,
    getAll,
    allocateNextUnitDisplayOrder,
    hasDb: () => db !== null,
  });
}

/**
 * Defines the `getMapHexSet` function shape (export function getMapHexSet(): Set<string>).

 * Purpose: Supports maintainability by documenting why `getMapHexSet` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getMapHexSet(): Set<string> {
  logTrace('getMapHexSet');
  const rows = getAll<{ h3_index: string }>('SELECT h3_index FROM hexes');
  return new Set(rows.map((r) => r.h3_index));
}

/**
 * Defines the `saveDatabase` function shape (export function saveDatabase(): void).

 * Purpose: Supports maintainability by documenting why `saveDatabase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function saveDatabase(): void {
  logTrace('gameDb saveDatabase (no-op; file-backed auto-persist)');
}

/**
 * Defines the `getFogDeps` function shape (function getFogDeps()).

 * Purpose: Supports maintainability by documenting why `getFogDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
 * Defines the `refreshFogOfWarIntelFromCurrentState` function shape (export function refreshFogOfWarIntelFromCurrentState(options?:).

 * Purpose: Supports maintainability by documenting why `refreshFogOfWarIntelFromCurrentState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function refreshFogOfWarIntelFromCurrentState(options?: {
  traversedHexesByPlayer?: Partial<Record<'human' | 'opponent', string[]>>;
}): void {
  refreshFogOfWarIntelFromCurrentStateFromModule(getFogDeps(), options);
}

/**
 * Defines the `consumeFogNewContactsForPlayer` function shape (export function consumeFogNewContactsForPlayer(playerId: 'human' | 'opponent'): string[]).

 * Purpose: Supports maintainability by documenting why `consumeFogNewContactsForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function consumeFogNewContactsForPlayer(playerId: 'human' | 'opponent'): string[] {
  return consumeFogNewContactsForPlayerFromModule(
    { hasDb: () => db !== null, run, getOne, getAll },
    playerId
  );
}

/**
 * Defines the `getGameState` function shape (export function getGameState(): GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `getGameState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getGameState(): GameStateSnapshot {
  const base = getGameStateSnapshotFromModule(getFogDeps());
  return mergeActiveTacticalSessionIntoGameStateSnapshot(base, { scope: 'getGameState' });
}

/**
 * Defines the `getGameStateForPlayer` function shape (export function getGameStateForPlayer().

 * Purpose: Supports maintainability by documenting why `getGameStateForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getGameStateForPlayer(
  playerId: 'human' | 'opponent',
  options?: { maskUnexploredTerrain?: boolean }
): GameStateSnapshot {
  let base = getGameStateForPlayerFromModule(getFogDeps(), playerId, options);
  if (playerId === 'human') {
    base = mergeMeleeCandidateHexesIntoHumanFogSnapshot(base);
  }
  return mergeActiveTacticalSessionIntoGameStateSnapshot(base, { scope: 'getGameStateForPlayer', playerId });
}

/**
 * Defines the `dbRun` function shape (export function dbRun(sql: string, params: unknown[] = []): void).

 * Purpose: Supports maintainability by documenting why `dbRun` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function dbRun(sql: string, params: unknown[] = []): void {
  run(sql, params);
}

/**
 * Defines the `dbGetOne` function shape (export function dbGetOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined).

 * Purpose: Supports maintainability by documenting why `dbGetOne` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function dbGetOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return getOne<T>(sql, params);
}

/**
 * Defines the `dbGetAll` function shape (export function dbGetAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[]).

 * Purpose: Supports maintainability by documenting why `dbGetAll` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function dbGetAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getAll<T>(sql, params);
}

/**
 * Defines the `listUnitsForSnapshot` function shape (export function listUnitsForSnapshot(): GameStateSnapshot['units']).

 * Purpose: Supports maintainability by documenting why `listUnitsForSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listUnitsForSnapshot(): GameStateSnapshot['units'] {
  logTrace('gameDb listUnitsForSnapshot');
  const rows = getAll<DbUnitSnapshotRow>(
    'SELECT id, player, unit_type, h3_index, display_order FROM units'
  );
  return rows.map(mapDbUnitSnapshotRow);
}

/**
 * Defines the `getHexController` function shape (export function getHexController(h3Index: string): string | null).

 * Purpose: Supports maintainability by documenting why `getHexController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHexController(h3Index: string): string | null {
  return getHexControllerFromModule({ run, getOne, getAll }, h3Index);
}

/**
 * Defines the `setHexController` function shape (export function setHexController(h3Index: string, controllerPlayerId: string | null): void).

 * Purpose: Supports maintainability by documenting why `setHexController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setHexController(h3Index: string, controllerPlayerId: string | null): void {
  setHexControllerFromModule({ run, getOne, getAll }, h3Index, controllerPlayerId);
}

/**
 * Defines the `listAllHexControls` function shape (export function listAllHexControls(): HexControlRow[]).

 * Purpose: Supports maintainability by documenting why `listAllHexControls` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listAllHexControls(): HexControlRow[] {
  return listAllHexControlsFromModule({ run, getOne, getAll });
}

/**
 * Defines the `listBuildQueueRowsForHex` function shape (export function listBuildQueueRowsForHex(h3Index: string): BuildQueueRow[]).

 * Purpose: Supports maintainability by documenting why `listBuildQueueRowsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listBuildQueueRowsForHex(h3Index: string): BuildQueueRow[] {
  return listBuildQueueRowsForHexFromModule({ run, getOne, getAll }, h3Index);
}

/**
 * Defines the `getBuildProgressPointsForHex` function shape (export function getBuildProgressPointsForHex(h3Index: string): number).

 * Purpose: Supports maintainability by documenting why `getBuildProgressPointsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getBuildProgressPointsForHex(h3Index: string): number {
  return getBuildProgressPointsForHexFromModule({ run, getOne, getAll }, h3Index);
}

/**
 * Defines the `setBuildProgressPointsForHex` function shape (export function setBuildProgressPointsForHex(h3Index: string, storedPoints: number): void).

 * Purpose: Supports maintainability by documenting why `setBuildProgressPointsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setBuildProgressPointsForHex(h3Index: string, storedPoints: number): void {
  setBuildProgressPointsForHexFromModule({ run, getOne, getAll }, h3Index, storedPoints);
}

/**
 * Defines the `clearBuildQueueAndProgressForHex` function shape (export function clearBuildQueueAndProgressForHex(h3Index: string): void).

 * Purpose: Supports maintainability by documenting why `clearBuildQueueAndProgressForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearBuildQueueAndProgressForHex(h3Index: string): void {
  clearBuildQueueAndProgressForHexFromModule({ run, getOne, getAll }, h3Index);
}

/**
 * Defines the `replaceBuildQueueForHex` function shape (export function replaceBuildQueueForHex(h3Index: string, entries: Array<).

 * Purpose: Supports maintainability by documenting why `replaceBuildQueueForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replaceBuildQueueForHex(h3Index: string, entries: Array<{ unitType: BuildUnitType; remainingCount: number }>): void {
  replaceBuildQueueForHexFromModule({ run, getOne, getAll }, h3Index, entries);
}

/**
 * Defines the `getRes1InfrastructureForHex` function shape (export function getRes1InfrastructureForHex(h3Index: string): Res1InfrastructureRow).

 * Purpose: Supports maintainability by documenting why `getRes1InfrastructureForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRes1InfrastructureForHex(h3Index: string): Res1InfrastructureRow {
  return getRes1InfrastructureForHexFromModule({ run, getOne, getAll }, h3Index);
}

/**
 * Defines the `listRes1InfrastructureRows` function shape (export function listRes1InfrastructureRows(): Res1InfrastructureRow[]).

 * Purpose: Supports maintainability by documenting why `listRes1InfrastructureRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listRes1InfrastructureRows(): Res1InfrastructureRow[] {
  return listRes1InfrastructureRowsFromModule({ run, getOne, getAll });
}

/**
 * Defines the `setRes1InfrastructureForHex` function shape (export function setRes1InfrastructureForHex().

 * Purpose: Supports maintainability by documenting why `setRes1InfrastructureForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setRes1InfrastructureForHex(
  h3Index: string,
  counts: { urbanHexCount: number; airportCount: number; seaportCount: number }
): void {
  setRes1InfrastructureForHexFromModule({ run, getOne, getAll }, h3Index, counts);
}

/**
 * Defines the `listRes4FeatureOverridesForGame` function shape (export function listRes4FeatureOverridesForGame(): Res4FeatureOverrideRow[]).

 * Purpose: Supports maintainability by documenting why `listRes4FeatureOverridesForGame` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listRes4FeatureOverridesForGame(): Res4FeatureOverrideRow[] {
  return listRes4FeatureOverridesForGameFromModule({ run, getOne, getAll });
}

/**
 * Defines the `reconcileRes1InfrastructureCountsFromRes4Overrides` function shape (export function reconcileRes1InfrastructureCountsFromRes4Overrides(): { changedHexCount: number } { logDebug('gameDb reconcileRes1InfrastructureCountsFromRes).

 * Purpose: Supports maintainability by documenting why `reconcileRes1InfrastructureCountsFromRes4Overrides` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function reconcileRes1InfrastructureCountsFromRes4Overrides(): { changedHexCount: number } {
  logDebug('gameDb reconcileRes1InfrastructureCountsFromRes4Overrides');
  return reconcileRes1InfrastructureCountsFromRes4OverridesFromModule({ run, getOne, getAll });
}

/**
 * Defines the `runInfrastructureStartupConsistencyPass` function shape (function runInfrastructureStartupConsistencyPass(options?:).

 * Purpose: Supports maintainability by documenting why `runInfrastructureStartupConsistencyPass` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function runInfrastructureStartupConsistencyPass(options?: { includeReconciliation?: boolean }): void {
  ensureRes1InfrastructureSyncTriggers();
  if (options?.includeReconciliation === false) return;
  reconcileRes1InfrastructureCountsFromRes4Overrides();
}

/**
 * Defines the `ensureRes1InfrastructureSyncTriggers` function shape (export function ensureRes1InfrastructureSyncTriggers(): void).

 * Purpose: Supports maintainability by documenting why `ensureRes1InfrastructureSyncTriggers` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function ensureRes1InfrastructureSyncTriggers(): void {
  ensureRes1InfrastructureSyncTriggersFromModule({ run, getOne, getAll });
}

/**
 * Defines the `updateRes4FeatureOverrideRow` function shape (export function updateRes4FeatureOverrideRow( h3Index: string, patch: Partial<Pick<Res4FeatureOverrideRow, 'isUrban' | 'isAirport' | 'isSeaport' | 'isRubb).

 * Purpose: Supports maintainability by documenting why `updateRes4FeatureOverrideRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateRes4FeatureOverrideRow(
  h3Index: string,
  patch: Partial<Pick<Res4FeatureOverrideRow, 'isUrban' | 'isAirport' | 'isSeaport' | 'isRubble'>>
): void {
  updateRes4FeatureOverrideRowFromModule({ run, getOne, getAll }, h3Index, patch);
}

/**
 * Defines the `getRes4TerrainOverridesForRendererFromGame` function shape (export function getRes4TerrainOverridesForRendererFromGame(): Array<).

 * Purpose: Supports maintainability by documenting why `getRes4TerrainOverridesForRendererFromGame` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `isDbReady` function shape (export function isDbReady(): boolean).

 * Purpose: Supports maintainability by documenting why `isDbReady` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isDbReady(): boolean {
  return db !== null;
}

/**
 * Defines the `setGameOver` function shape (export function setGameOver(winner: string): void).

 * Purpose: Supports maintainability by documenting why `setGameOver` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setGameOver(winner: string): void {
  setGameOverWithOps({ hasDb: () => db !== null, run, getOne }, winner);
}

/**
 * Defines the `clearGameOver` function shape (export function clearGameOver(): void).

 * Purpose: Supports maintainability by documenting why `clearGameOver` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearGameOver(): void {
  clearGameOverWithOps({ hasDb: () => db !== null, run, getOne });
}

/**
 * Defines the `getAiStateDbOps` function shape (function getAiStateDbOps()).

 * Purpose: Supports maintainability by documenting why `getAiStateDbOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getAiStateDbOps() {
  return {
    hasDb: () => db !== null,
    run,
    getOne,
    getAll,
  };
}

/**
 * Defines the `setAiToolLimitExceededLastTurn` function shape (export function setAiToolLimitExceededLastTurn(): void).

 * Purpose: Supports maintainability by documenting why `setAiToolLimitExceededLastTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiToolLimitExceededLastTurn(): void {
  setAiToolLimitExceededLastTurnFromModule(getAiStateDbOps());
}

/**
 * Defines the `getAndClearAiToolLimitExceededLastTurn` function shape (export function getAndClearAiToolLimitExceededLastTurn(): boolean).

 * Purpose: Supports maintainability by documenting why `getAndClearAiToolLimitExceededLastTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAndClearAiToolLimitExceededLastTurn(): boolean {
  return getAndClearAiToolLimitExceededLastTurnFromModule(getAiStateDbOps());
}

/**
 * Defines the `getAiLastConsultationTurn` function shape (export function getAiLastConsultationTurn(): number).

 * Purpose: Supports maintainability by documenting why `getAiLastConsultationTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiLastConsultationTurn(): number {
  return getAiLastConsultationTurnFromModule(getAiStateDbOps());
}

/**
 * Defines the `setAiLastConsultationTurn` function shape (export function setAiLastConsultationTurn(turn: number): void).

 * Purpose: Supports maintainability by documenting why `setAiLastConsultationTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiLastConsultationTurn(turn: number): void {
  setAiLastConsultationTurnFromModule(getAiStateDbOps(), turn);
}

/**
 * Defines the `getOpponentUnitsInCombatSinceConsultation` function shape (export function getOpponentUnitsInCombatSinceConsultation(): string[]).

 * Purpose: Supports maintainability by documenting why `getOpponentUnitsInCombatSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getOpponentUnitsInCombatSinceConsultation(): string[] {
  return getOpponentUnitsInCombatSinceConsultationFromModule(getAiStateDbOps());
}

/**
 * Defines the `addOpponentCombatParticipants` function shape (export function addOpponentCombatParticipants(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `addOpponentCombatParticipants` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addOpponentCombatParticipants(unitIds: string[]): void {
  addOpponentCombatParticipantsFromModule(getAiStateDbOps(), unitIds);
}

/**
 * Defines the `clearOpponentCombatSinceConsultation` function shape (export function clearOpponentCombatSinceConsultation(): void).

 * Purpose: Supports maintainability by documenting why `clearOpponentCombatSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearOpponentCombatSinceConsultation(): void {
  clearOpponentCombatSinceConsultationFromModule(getAiStateDbOps());
}

/**
 * Defines the `addAiLossEventsSinceConsultation` function shape (export function addAiLossEventsSinceConsultation( playerId: string, turnNumber: number, removedUnits: { id: string; player: string }[], kills: { vic).

 * Purpose: Supports maintainability by documenting why `addAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `getAiLossEventsSinceConsultation` function shape (export function getAiLossEventsSinceConsultation(playerId: string): AiLossEventSinceConsultation[]).

 * Purpose: Supports maintainability by documenting why `getAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiLossEventsSinceConsultation(playerId: string): AiLossEventSinceConsultation[] {
  return getAiLossEventsSinceConsultationFromModule(getAiStateDbOps(), playerId);
}

/**
 * Defines the `clearAiLossEventsSinceConsultation` function shape (export function clearAiLossEventsSinceConsultation(playerId: string): void).

 * Purpose: Supports maintainability by documenting why `clearAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearAiLossEventsSinceConsultation(playerId: string): void {
  clearAiLossEventsSinceConsultationFromModule(getAiStateDbOps(), playerId);
}

/**
 * Defines the `getAiPendingOrders` function shape (export function getAiPendingOrders(playerId: string): { movementOrders: MovementOrder[]; rangedOrders: RangedAttackOrder[]; airStrikeOrders: AirStrikeO).

 * Purpose: Supports maintainability by documenting why `getAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiPendingOrders(playerId: string): {
  movementOrders: MovementOrder[];
  rangedOrders: RangedAttackOrder[];
  airStrikeOrders: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
  embarkOrders: EmbarkOrder[];
} | null {
  return getAiPendingOrdersFromModule(getAiStateDbOps(), playerId);
}

/**
 * Defines the `setAiPendingOrders` function shape (export function setAiPendingOrders( playerId: string, movementOrders: MovementOrder[], rangedOrders: RangedAttackOrder[], airStrikeOrders: AirStrike).

 * Purpose: Supports maintainability by documenting why `setAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiPendingOrders(
  playerId: string,
  movementOrders: MovementOrder[],
  rangedOrders: RangedAttackOrder[],
  airStrikeOrders: AirStrikeOrder[] = [],
  ferryOrders: FerryOrder[] = [],
  embarkOrders: EmbarkOrder[] = []
): void {
  setAiPendingOrdersFromModule(
    getAiStateDbOps(),
    playerId,
    movementOrders,
    rangedOrders,
    airStrikeOrders,
    ferryOrders,
    embarkOrders
  );
}

/**
 * Defines the `clearAiPendingOrders` function shape (export function clearAiPendingOrders(playerId: string): void).

 * Purpose: Supports maintainability by documenting why `clearAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearAiPendingOrders(playerId: string): void {
  clearAiPendingOrdersFromModule(getAiStateDbOps(), playerId);
}

/**
 * Defines the `resetGameForNewMatch` function shape (export function resetGameForNewMatch(options?:).

 * Purpose: Supports maintainability by documenting why `resetGameForNewMatch` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resetGameForNewMatch(options?: {
  fogOfWarEnabled?: boolean;
  humanHomeRegion?: string;
  aiHomeRegion?: string;
}): void {
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
