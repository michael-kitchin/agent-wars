/**
 * Game state persistence in SQLite via better-sqlite3 (native). Single file under Electron userData;
 * durable across restarts (no wipe on launch). Schema: hexes, units, turn state, pending orders, AI tables.
 *
 * Legacy sql.js file `game.db` is not migrated; current baseline file is GAME_DB_FILE_NAME.
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { ensureTerrainClassificationCacheLoaded } from './terrainClassificationCache';
import { logDebug, logError, logTrace } from './logger';
import { closeDbHandle, gameDbOps, getAll, getOne, hasDbHandle, run, setDbHandle } from './gameDb/dbConnection';
import { resolveUnitBirthOrigin } from './unitOrigin/unitBirthOrigin';
import type { GameStateSnapshot } from '../shared/ipcTypes';
import type { BuildUnitType } from './productionRules';
import { seedUnits as seedUnitsFromModule } from './gameDb/seeding/seedUnits';
import {
  recoverCorruptDatabaseUi as recoverCorruptDatabaseUiWithFs,
  silentRecoverCorruptDatabase as silentRecoverCorruptDatabaseWithFs,
} from './gameDb/recovery/corruptRecovery';
import { notifyBetterSqliteNativeLoadFailureAndExitIfApplicable } from './gameDb/betterSqliteNativeLoad';
import {
  ensureTurnStateRowWhenDbOpen,
  repairStrandedStrategicResolutionPhaseWhenDbOpen,
} from './gameDb/databaseBootstrap';
import { getFullDdl } from './gameDb/schema';
import {
  applyGameDbPragmas as applyGameDbPragmasCore,
  validateGameDatabaseOrThrow as validateGameDatabaseOrThrowCore,
} from './gameDb/databaseValidation';
import { getMapHexSetWithGetAll } from './gameDb/mapHexRead';
import { listUnitsForSnapshotWithGetAll } from './gameDb/unitSnapshotRead';
import {
  ensureStrategicInfrastructureSyncTriggers,
  listStrategicInfrastructureRows,
  reconcileStrategicInfrastructureCountsFromTacticalOverrides,
  runInfrastructureStartupConsistencyPass,
} from './gameDb/controlInfrastructureAccess';
import {
  backfillInfrastructureStateFromMetadataIfMissing,
  seedHexesFromTerrainMetadata,
  seedInfrastructureStateFromMetadata,
} from './gameDb/seeding/infrastructureSeeding';
import {
  consumeFogNewContactsForPlayer as consumeFogNewContactsForPlayerFromModule,
  getGameStateSnapshot as getGameStateSnapshotFromModule,
  getGameStateForPlayer as getGameStateForPlayerFromModule,
  refreshFogOfWarIntelFromCurrentState as refreshFogOfWarIntelFromCurrentStateFromModule,
} from './gameDb/fogState';
import { mergeMeleeCandidateHexesIntoHumanFogSnapshot } from './gameActions/meleeInterceptPendingState';
import { mergeActiveTacticalSessionIntoGameStateSnapshot } from './gameDb/attachTacticalSessionToGameState';
import { resolveGameDbFileUnderUserData } from './gameDb/canonicalDbPath';
import {
  allocateNextUnitDisplayOrderWithOps,
  allocateNextUnitIdOrdinalWithOps,
  clearGameOverWithOps,
  getGameSeedWithOps,
  seedGameSeedIfMissingWithOps,
  setGameOverWithOps,
} from './gameDb/gameConfigKv';
import { resetGameForNewMatch as resetGameForNewMatchFromModule, type ResetGameForNewMatchOptions } from './gameDb/resetGame';
import {
  getScenarioHomeRegionHexes as getScenarioHomeRegionHexesFromModule,
  listScenarioHomeRegions as listScenarioHomeRegionsFromModule,
} from './regionScenario';

export type { GameStateSnapshot } from '../shared/ipcTypes';
export type { AiLossEventSinceConsultation } from './gameDb/aiState';
export type { TurnConsultationNoteTexts, TurnNoteRow, TurnNotesScope } from './gameDb/turnNotesHistory';
export type { BuildQueueRow, HexControlRow, StrategicInfrastructureRow, TacticalFeatureOverrideRow } from './gameDb/controlInfrastructure';
export {
  clearBuildQueueAndProgressForHex,
  ensureStrategicInfrastructureSyncTriggers,
  getBuildProgressPointsForHex,
  getHexControlMap,
  getHexController,
  getKeepBuildingForHex,
  getStrategicInfrastructureForHex,
  getTacticalTerrainOverridesForRendererFromGame,
  insertTacticalFeatureOverrideRubbleRow,
  listAllHexControls,
  listBuildQueueRowsForHex,
  listStrategicInfrastructureRows,
  listTacticalFeatureOverridesForGame,
  reconcileStrategicInfrastructureCountsFromTacticalOverrides,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
  setHexController,
  setKeepBuildingForHex,
  setStrategicInfrastructureForHex,
  sumUrbanHexCountForHexes,
  updateTacticalFeatureOverrideRow,
} from './gameDb/controlInfrastructureAccess';
export {
  addAiLossEventsSinceConsultation,
  addOpponentCombatParticipants,
  clearAiLossEventsSinceConsultation,
  clearAiPendingOrders,
  clearOpponentCombatSinceConsultation,
  clearTacticalTurnNotes,
  getAiLastConsultationTurn,
  getAiLossEventsSinceConsultation,
  getAiPendingOrders,
  getAndClearAiToolLimitExceededLastTurn,
  getOpponentUnitsInCombatSinceConsultation,
  getRecentTurnNotes,
  setAiLastConsultationTurn,
  setAiPendingOrders,
  setAiToolLimitExceededLastTurn,
  upsertTurnLossNote,
  upsertTurnStrategyNote,
} from './gameDb/aiStateAccess';

/**
 * SQLite `user_version` that the current schema DDL produces.
 *
 * Purpose: Detects match databases created by an older schema.
 * When to use: Bump whenever `getFullDdl` changes; fresh databases are stamped with it.
 * Expected outcome: On first launch after a bump, the old match database fails validation, is renamed aside, and a fresh one is created.
 * Exceptions: None.
 */
export const EXPECTED_USER_VERSION = 17;

/**
 * Documents the module-scope binding `GAME_DB_FILE_NAME` (GAME_DB_FILE_NAME).

 * Purpose: Supports maintainability by documenting why `GAME_DB_FILE_NAME` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const GAME_DB_FILE_NAME = 'game-baseline-v12.sqlite';

/**
 * Defines the `applyGameDbPragmas` function shape (export function applyGameDbPragmas(database: InstanceType<typeof Database>): void).

 * Purpose: Supports maintainability by documenting why `applyGameDbPragmas` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applyGameDbPragmas(database: InstanceType<typeof Database>): void {
  applyGameDbPragmasCore(database);
}

/**
 * Defines the `validateGameDatabaseOrThrow` function shape (export function validateGameDatabaseOrThrow(database: InstanceType<typeof Database>): void).

 * Purpose: Supports maintainability by documenting why `validateGameDatabaseOrThrow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function validateGameDatabaseOrThrow(database: InstanceType<typeof Database>): void {
  validateGameDatabaseOrThrowCore(database, EXPECTED_USER_VERSION);
}

/**
 * Defines the `getCanonicalDbPath` function shape (function getCanonicalDbPath(): string).

 * Purpose: Delegates canonical DB location to `resolveGameDbFileUnderUserData` for reuse across modules.
 * When to use: Internal `gameDb` helpers that open, seed, or recover the primary SQLite file.
 * Expected outcome: Same path as previously returned for `GAME_DB_FILE_NAME`.
 * Exceptions: None.
 */
function getCanonicalDbPath(): string {
  return resolveGameDbFileUnderUserData(GAME_DB_FILE_NAME);
}

/**
 * Defines the `ensureTurnStateRow` function shape (function ensureTurnStateRow(): void).

 * Purpose: Supports maintainability by documenting why `ensureTurnStateRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function ensureTurnStateRow(): void {
  if (!hasDbHandle()) return;
  ensureTurnStateRowWhenDbOpen(run, getOne);
}

/**
 * Defines the `repairStrandedStrategicResolutionPhaseOnDbBootstrap` function shape (export function repairStrandedStrategicResolutionPhaseOnDbBootstrap(): void).

 * Purpose: After a process restart, `turn_state.phase` may still be `resolution` while the melee-intercept resume snapshot lived only in memory, which blocks `ready()` with "Not in planning phase". Tactical restore also requires planning phase.
 * When to use: Once per successful `initDatabase` open of an existing database file, after `ensureTurnStateRow`.
 * Expected outcome: Any persisted `resolution` row becomes `planning` so the player can issue orders again; idempotent when already planning.
 * Exceptions: None; skips work when the DB handle is missing.
 */
export function repairStrandedStrategicResolutionPhaseOnDbBootstrap(): void {
  if (!hasDbHandle()) return;
  repairStrandedStrategicResolutionPhaseWhenDbOpen(run, getOne);
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
  const database = new Database(canonicalPath);
  setDbHandle(database);
  applyGameDbPragmas(database);
  database.exec(getFullDdl());
  ensureStrategicInfrastructureSyncTriggers();
  ensureTurnStateRow();
  database.pragma(`user_version = ${EXPECTED_USER_VERSION}`);
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
    setDbHandle(d);
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
  try {
    const probe = new Database(':memory:');
    probe.close();
  } catch (err) {
    if (notifyBetterSqliteNativeLoadFailureAndExitIfApplicable(err)) return;
    throw err;
  }
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
    setDbHandle(d);
    d = null;
    runInfrastructureStartupConsistencyPass({ includeReconciliation: false });
    ensureTurnStateRow();
    repairStrandedStrategicResolutionPhaseOnDbBootstrap();
    seedGameSeedIfMissing();
    ensureTerrainClassificationCacheLoaded();
    backfillInfrastructureStateFromMetadataIfMissing();
    reconcileStrategicInfrastructureCountsFromTacticalOverrides();
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
    if (notifyBetterSqliteNativeLoadFailureAndExitIfApplicable(err)) return;
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
  seedGameSeedIfMissingWithOps(gameDbOps);
}

/**
 * Allocates the next monotonic display order for a given player and unit type.
 *
 * Purpose: Facade over `allocateNextUnitDisplayOrderWithOps` for seeding and production callers that hold a live DB.
 * When to use: Unit insertion during seeding and production pipelines; always pass the owning player so each side's
 * ordinals start at 1 independently.
 * Expected outcome: Returns `1` when DB is absent; otherwise increments the per-player-per-type counter and returns it.
 * Exceptions: None.
 */
export function allocateNextUnitDisplayOrder(unitType: BuildUnitType, player: string): number {
  return allocateNextUnitDisplayOrderWithOps(gameDbOps, unitType, player);
}

/**
 * Allocates the next compact unit-id ordinal for a given player and unit type.
 *
 * Purpose: Facade over `allocateNextUnitIdOrdinalWithOps` for seeding and production callers that hold a live DB.
 * When to use: Immediately before `formatStrategicUnitId` when inserting a `units` row.
 * Expected outcome: Increments the per-player-per-type identifier counter and returns it.
 * Exceptions: Throws when the game database is not open.
 */
export function allocateNextUnitIdOrdinal(unitType: BuildUnitType, player: string): number {
  return allocateNextUnitIdOrdinalWithOps(gameDbOps, unitType, player);
}

/**
 * Defines the `getGameSeed` function shape (export function getGameSeed(): number).

 * Purpose: Supports maintainability by documenting why `getGameSeed` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getGameSeed(): number {
  return getGameSeedWithOps(gameDbOps);
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
    allocateNextUnitIdOrdinal,
    hasDb: hasDbHandle,
    resolveBirthOrigin: (unitId, h3Index) => resolveUnitBirthOrigin(gameDbOps, { unitId, birthH3Index: h3Index }),
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
  return getMapHexSetWithGetAll(getAll);
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
    ops: gameDbOps,
    listUnitsForSnapshot,
    listStrategicInfrastructureRows,
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
    gameDbOps,
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
  return listUnitsForSnapshotWithGetAll(getAll);
}

/**
 * Reports whether the game database handle is open.
 *
 * Purpose: Callers outside this module should not touch the connection module directly.
 * When to use: Before IPC work that must no-op when init has not finished or the handle was closed.
 * Expected outcome: Same boolean as `hasDbHandle`.
 * Exceptions: None.
 */
export function isDbReady(): boolean {
  return hasDbHandle();
}

/**
 * Defines the `setGameOver` function shape (export function setGameOver(winner: string): void).

 * Purpose: Supports maintainability by documenting why `setGameOver` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setGameOver(winner: string): void {
  setGameOverWithOps(gameDbOps, winner);
}

/**
 * Defines the `clearGameOver` function shape (export function clearGameOver(): void).

 * Purpose: Supports maintainability by documenting why `clearGameOver` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearGameOver(): void {
  clearGameOverWithOps(gameDbOps);
}

/**
 * Starts a new match with the new-game dialog's choices.
 *
 * Purpose: Facade that binds this module's database helpers to `resetGame.ts`.
 * When to use: The `game:newGame` IPC handler.
 * Expected outcome: See `resetGameForNewMatch` in `gameDb/resetGame.ts`; missing bonus levels mean off.
 * Exceptions: Propagates SQLite errors.
 */
export function resetGameForNewMatch(options?: ResetGameForNewMatchOptions): void {
  resetGameForNewMatchFromModule(
    {
      hasDb: hasDbHandle,
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
