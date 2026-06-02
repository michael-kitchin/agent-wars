import { getRes4TerrainOverridesForRenderer as getRes4TerrainOverridesFromCache } from '../terrainClassificationCache';
import { logDebug, logTrace } from '../logger';
import { getRes4RendererOverrideRowsCached } from './res4RendererOverrideCache';
import type { BuildUnitType } from '../productionRules';
import type { BasicDbOps } from './dbOps';

/**
 * Documents the `HexControlRow` interface as a named contract surface (export interface HexControlRow).

 * Purpose: Supports maintainability by documenting why `HexControlRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexControlRow {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `controllerPlayerId` member (controllerPlayerId: string | null;).

   * Contract: Describes stable behavior for callers of `controllerPlayerId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controllerPlayerId: string | null;
}

/**
 * Documents the `BuildQueueRow` interface as a named contract surface (export interface BuildQueueRow).

 * Purpose: Supports maintainability by documenting why `BuildQueueRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface BuildQueueRow {
    /**
   * Specifies the contract for the `id` member (id: number;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: number;
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `queueIndex` member (queueIndex: number;).

   * Contract: Describes stable behavior for callers of `queueIndex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
queueIndex: number;
    /**
   * Specifies the contract for the `unitType` member (unitType: BuildUnitType;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: BuildUnitType;
    /**
   * Specifies the contract for the `remainingCount` member (remainingCount: number;).

   * Contract: Describes stable behavior for callers of `remainingCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
remainingCount: number;
}

/**
 * Documents the `Res1InfrastructureRow` interface as a named contract surface (export interface Res1InfrastructureRow).

 * Purpose: Supports maintainability by documenting why `Res1InfrastructureRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface Res1InfrastructureRow {
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
 * Documents the `Res4FeatureOverrideRow` interface as a named contract surface (export interface Res4FeatureOverrideRow).

 * Purpose: Supports maintainability by documenting why `Res4FeatureOverrideRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface Res4FeatureOverrideRow {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `parentH3Index` member (parentH3Index: string;).

   * Contract: Describes stable behavior for callers of `parentH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
parentH3Index: string;
    /**
   * Specifies the contract for the `terrainKind` member (terrainKind: string;).

   * Contract: Describes stable behavior for callers of `terrainKind` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainKind: string;
    /**
   * Specifies the contract for the `isUrban` member (isUrban: boolean;).

   * Contract: Describes stable behavior for callers of `isUrban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isUrban: boolean;
    /**
   * Specifies the contract for the `isAirport` member (isAirport: boolean;).

   * Contract: Describes stable behavior for callers of `isAirport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isAirport: boolean;
    /**
   * Specifies the contract for the `isSeaport` member (isSeaport: boolean;).

   * Contract: Describes stable behavior for callers of `isSeaport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isSeaport: boolean;
    /**
   * Specifies the contract for the `isRubble` member (isRubble: boolean;).

   * Contract: Describes stable behavior for callers of `isRubble` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isRubble: boolean;
}

/**
 * Documents the `ControlDbOps` type alias (type ControlDbOps).

 * Purpose: Supports maintainability by documenting why `ControlDbOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type ControlDbOps = BasicDbOps;

/**
 * Documents the module-scope binding `RES4_TO_RES1_SYNC_TRIGGER_NAMES` (RES4_TO_RES1_SYNC_TRIGGER_NAMES).

 * Purpose: Supports maintainability by documenting why `RES4_TO_RES1_SYNC_TRIGGER_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const RES4_TO_RES1_SYNC_TRIGGER_NAMES = {
  afterInsert: 'res4_sync_res1_after_insert',
  afterDelete: 'res4_sync_res1_after_delete',
  afterUpdate: 'res4_sync_res1_after_update',
} as const;

/**
 * Documents the module-scope binding `RES4_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL` (RES4_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL).

 * Purpose: Supports maintainability by documenting why `RES4_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const RES4_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL = `SELECT parent_h3_index AS h3Index,
              SUM(CASE WHEN is_urban = 1 THEN 1 ELSE 0 END) AS urbanHexCount,
              SUM(CASE WHEN is_airport = 1 THEN 1 ELSE 0 END) AS airportCount,
              SUM(CASE WHEN is_seaport = 1 THEN 1 ELSE 0 END) AS seaportCount
       FROM res4_feature_overrides
       GROUP BY parent_h3_index`;

/**
 * Defines the `buildRes1CountsMismatchPredicateSql` function shape (function buildRes1CountsMismatchPredicateSql(res1TableAlias: string, countsAlias: string): string).

 * Purpose: Supports maintainability by documenting why `buildRes1CountsMismatchPredicateSql` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildRes1CountsMismatchPredicateSql(res1TableAlias: string, countsAlias: string): string {
  return `${res1TableAlias}.urban_hex_count != COALESCE(${countsAlias}.urbanHexCount, 0)
       OR ${res1TableAlias}.airport_count != COALESCE(${countsAlias}.airportCount, 0)
       OR ${res1TableAlias}.seaport_count != COALESCE(${countsAlias}.seaportCount, 0)`;
}

/**
 * Defines the `buildRes1RollupUpdateSql` function shape (function buildRes1RollupUpdateSql(parentH3Expression: string): string).

 * Purpose: Supports maintainability by documenting why `buildRes1RollupUpdateSql` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildRes1RollupUpdateSql(parentH3Expression: string): string {
  return `UPDATE res1_infrastructure
          SET urban_hex_count = COALESCE(
                (SELECT SUM(CASE WHEN is_urban = 1 THEN 1 ELSE 0 END)
                 FROM res4_feature_overrides
                 WHERE parent_h3_index = ${parentH3Expression}),
                0
              ),
              airport_count = COALESCE(
                (SELECT SUM(CASE WHEN is_airport = 1 THEN 1 ELSE 0 END)
                 FROM res4_feature_overrides
                 WHERE parent_h3_index = ${parentH3Expression}),
                0
              ),
              seaport_count = COALESCE(
                (SELECT SUM(CASE WHEN is_seaport = 1 THEN 1 ELSE 0 END)
                 FROM res4_feature_overrides
                 WHERE parent_h3_index = ${parentH3Expression}),
                0
              )
          WHERE h3_index = ${parentH3Expression};`;
}

/**
 * Documents the `Res1InfrastructureDbRow` interface as a named contract surface (interface Res1InfrastructureDbRow extends Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `Res1InfrastructureDbRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface Res1InfrastructureDbRow extends Record<string, unknown> {
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
 * Defines the `mapRes1InfrastructureDbRow` function shape (function mapRes1InfrastructureDbRow(row: Res1InfrastructureDbRow): Res1InfrastructureRow).

 * Purpose: Supports maintainability by documenting why `mapRes1InfrastructureDbRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function mapRes1InfrastructureDbRow(row: Res1InfrastructureDbRow): Res1InfrastructureRow {
  return {
    h3Index: row.h3Index,
    urbanHexCount: Math.max(0, row.urbanHexCount),
    airportCount: Math.max(0, row.airportCount),
    seaportCount: Math.max(0, row.seaportCount),
  };
}

/**
 * Defines the `listRes1InfrastructureRowsInternal` function shape (function listRes1InfrastructureRowsInternal( ops: ControlDbOps, options?: { whereClause?: string; params?: unknown[]; orderByClause?: string } ): Res1Inf).

 * Purpose: Supports maintainability by documenting why `listRes1InfrastructureRowsInternal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function listRes1InfrastructureRowsInternal(
  ops: ControlDbOps,
  options?: { whereClause?: string; params?: unknown[]; orderByClause?: string }
): Res1InfrastructureRow[] {
  const whereClause = options?.whereClause ? ` ${options.whereClause}` : '';
  const orderByClause = options?.orderByClause ? ` ${options.orderByClause}` : '';
  return ops.getAll<Res1InfrastructureDbRow>(
    `SELECT h3_index AS h3Index,
            urban_hex_count AS urbanHexCount,
            airport_count AS airportCount,
            seaport_count AS seaportCount
     FROM res1_infrastructure${whereClause}${orderByClause}`,
    options?.params ?? []
  ).map(mapRes1InfrastructureDbRow);
}

/**
 * Defines the `getHexController` function shape (export function getHexController(ops: ControlDbOps, h3Index: string): string | null { logTrace('gameDb getHexController', { h3Index }); const row = ops.ge).

 * Purpose: Supports maintainability by documenting why `getHexController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHexController(ops: ControlDbOps, h3Index: string): string | null {
  logTrace('gameDb getHexController', { h3Index });
  const row = ops.getOne<{ controllerPlayerId: string | null }>(
    'SELECT controller_player_id AS controllerPlayerId FROM res1_control WHERE h3_index = ?',
    [h3Index]
  );
  return row?.controllerPlayerId ?? null;
}

/**
 * Defines the `setHexController` function shape (export function setHexController(ops: ControlDbOps, h3Index: string, controllerPlayerId: string | null): void).

 * Purpose: Supports maintainability by documenting why `setHexController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setHexController(ops: ControlDbOps, h3Index: string, controllerPlayerId: string | null): void {
  logDebug('gameDb setHexController', { h3Index, controllerPlayerId });
  if (controllerPlayerId === null) {
    ops.run('DELETE FROM res1_control WHERE h3_index = ?', [h3Index]);
    return;
  }
  ops.run(
    `INSERT INTO res1_control (h3_index, controller_player_id)
     VALUES (?, ?)
     ON CONFLICT(h3_index) DO UPDATE SET controller_player_id = excluded.controller_player_id`,
    [h3Index, controllerPlayerId]
  );
}

/**
 * Defines the `listAllHexControls` function shape (export function listAllHexControls(ops: ControlDbOps): HexControlRow[]).

 * Purpose: Supports maintainability by documenting why `listAllHexControls` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listAllHexControls(ops: ControlDbOps): HexControlRow[] {
  logTrace('gameDb listAllHexControls');
  return ops.getAll<{ h3Index: string; controllerPlayerId: string | null }>(
    'SELECT h3_index AS h3Index, controller_player_id AS controllerPlayerId FROM res1_control ORDER BY h3_index ASC'
  );
}

/**
 * Defines the `listBuildQueueRowsForHex` function shape (export function listBuildQueueRowsForHex(ops: ControlDbOps, h3Index: string): BuildQueueRow[]).

 * Purpose: Supports maintainability by documenting why `listBuildQueueRowsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listBuildQueueRowsForHex(ops: ControlDbOps, h3Index: string): BuildQueueRow[] {
  logTrace('gameDb listBuildQueueRowsForHex', { h3Index });
  const rows = ops.getAll<{
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
 * Defines the `getBuildProgressPointsForHex` function shape (export function getBuildProgressPointsForHex(ops: ControlDbOps, h3Index: string): number).

 * Purpose: Supports maintainability by documenting why `getBuildProgressPointsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getBuildProgressPointsForHex(ops: ControlDbOps, h3Index: string): number {
  logTrace('gameDb getBuildProgressPointsForHex', { h3Index });
  const row = ops.getOne<{ storedPoints: number }>(
    'SELECT stored_points AS storedPoints FROM res1_build_progress WHERE h3_index = ?',
    [h3Index]
  );
  return Math.max(0, row?.storedPoints ?? 0);
}

/**
 * Defines the `setBuildProgressPointsForHex` function shape (export function setBuildProgressPointsForHex(ops: ControlDbOps, h3Index: string, storedPoints: number): void).

 * Purpose: Supports maintainability by documenting why `setBuildProgressPointsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setBuildProgressPointsForHex(ops: ControlDbOps, h3Index: string, storedPoints: number): void {
  const safePoints = Math.max(0, Math.trunc(storedPoints));
  logDebug('gameDb setBuildProgressPointsForHex', { h3Index, storedPoints: safePoints });
  ops.run(
    `INSERT INTO res1_build_progress (h3_index, stored_points)
     VALUES (?, ?)
     ON CONFLICT(h3_index) DO UPDATE SET stored_points = excluded.stored_points`,
    [h3Index, safePoints]
  );
}

/**
 * Defines the `clearBuildQueueAndProgressForHex` function shape (export function clearBuildQueueAndProgressForHex(ops: ControlDbOps, h3Index: string): void).

 * Purpose: Supports maintainability by documenting why `clearBuildQueueAndProgressForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearBuildQueueAndProgressForHex(ops: ControlDbOps, h3Index: string): void {
  logDebug('gameDb clearBuildQueueAndProgressForHex', { h3Index });
  ops.run('DELETE FROM res1_build_queue WHERE h3_index = ?', [h3Index]);
  ops.run('DELETE FROM res1_build_progress WHERE h3_index = ?', [h3Index]);
}

/**
 * Defines the `replaceBuildQueueForHex` function shape (export function replaceBuildQueueForHex( ops: ControlDbOps, h3Index: string, entries: Array<{ unitType: BuildUnitType; remainingCount: number }> ): vo).

 * Purpose: Supports maintainability by documenting why `replaceBuildQueueForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replaceBuildQueueForHex(
  ops: ControlDbOps,
  h3Index: string,
  entries: Array<{ unitType: BuildUnitType; remainingCount: number }>
): void {
  logDebug('gameDb replaceBuildQueueForHex', { h3Index, entryCount: entries.length });
  ops.run('DELETE FROM res1_build_queue WHERE h3_index = ?', [h3Index]);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    ops.run(
      `INSERT INTO res1_build_queue (h3_index, queue_index, unit_type, remaining_count)
       VALUES (?, ?, ?, ?)`,
      [h3Index, i, entry.unitType, Math.max(1, Math.trunc(entry.remainingCount))]
    );
  }
}

/**
 * Defines the `getRes1InfrastructureForHex` function shape (export function getRes1InfrastructureForHex(ops: ControlDbOps, h3Index: string): Res1InfrastructureRow).

 * Purpose: Supports maintainability by documenting why `getRes1InfrastructureForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRes1InfrastructureForHex(ops: ControlDbOps, h3Index: string): Res1InfrastructureRow {
  logTrace('gameDb getRes1InfrastructureForHex', { h3Index });
  const row = listRes1InfrastructureRowsInternal(ops, {
    whereClause: 'WHERE h3_index = ?',
    params: [h3Index],
  })[0];
  return row ?? { h3Index, urbanHexCount: 0, airportCount: 0, seaportCount: 0 };
}

/**
 * Defines the `listRes1InfrastructureRows` function shape (export function listRes1InfrastructureRows(ops: ControlDbOps): Res1InfrastructureRow[]).

 * Purpose: Supports maintainability by documenting why `listRes1InfrastructureRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listRes1InfrastructureRows(ops: ControlDbOps): Res1InfrastructureRow[] {
  logTrace('gameDb listRes1InfrastructureRows');
  return listRes1InfrastructureRowsInternal(ops, { orderByClause: 'ORDER BY h3_index ASC' });
}

/**
 * Defines the `setRes1InfrastructureForHex` function shape (export function setRes1InfrastructureForHex( ops: ControlDbOps, h3Index: string, counts: { urbanHexCount: number; airportCount: number; seaportCount: n).

 * Purpose: Supports maintainability by documenting why `setRes1InfrastructureForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setRes1InfrastructureForHex(
  ops: ControlDbOps,
  h3Index: string,
  counts: { urbanHexCount: number; airportCount: number; seaportCount: number }
): void {
  logDebug('gameDb setRes1InfrastructureForHex', { h3Index, ...counts });
  ops.run(
    `INSERT INTO res1_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(h3_index) DO UPDATE SET
       urban_hex_count = excluded.urban_hex_count,
       airport_count = excluded.airport_count,
       seaport_count = excluded.seaport_count`,
    [
      h3Index,
      Math.max(0, Math.trunc(counts.urbanHexCount)),
      Math.max(0, Math.trunc(counts.airportCount)),
      Math.max(0, Math.trunc(counts.seaportCount)),
    ]
  );
}

/**
 * Defines the `listRes4FeatureOverridesForGame` function shape (export function listRes4FeatureOverridesForGame(ops: ControlDbOps): Res4FeatureOverrideRow[]).

 * Purpose: Supports maintainability by documenting why `listRes4FeatureOverridesForGame` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listRes4FeatureOverridesForGame(ops: ControlDbOps): Res4FeatureOverrideRow[] {
  logTrace('gameDb listRes4FeatureOverridesForGame');
  return ops.getAll<{
    h3Index: string;
    parentH3Index: string;
    terrainKind: string;
    isUrban: number;
    isAirport: number;
    isSeaport: number;
    isRubble: number;
  }>(
    `SELECT h3_index AS h3Index,
            parent_h3_index AS parentH3Index,
            terrain_kind AS terrainKind,
            is_urban AS isUrban,
            is_airport AS isAirport,
            is_seaport AS isSeaport,
            is_rubble AS isRubble
     FROM res4_feature_overrides
     ORDER BY h3_index ASC`
  ).map((row) => ({
    h3Index: row.h3Index,
    parentH3Index: row.parentH3Index,
    terrainKind: row.terrainKind,
    isUrban: row.isUrban === 1,
    isAirport: row.isAirport === 1,
    isSeaport: row.isSeaport === 1,
    isRubble: row.isRubble === 1,
  }));
}

/**
 * Inserts a new `res4_feature_overrides` row marking rubble-only damage (no facilities) for tactical transport destruction.
 *
 * Purpose: `UPDATE` on missing rows is a no-op; road/rail-only cells need a durable rubble row so refresh and march rules see `is_rubble`.
 * When to use: `applyTacticalRangedRubbleToRes4Cell` after confirming no existing row for the res4 index and a strikeable transport corridor.
 * Expected outcome: One INSERT with `is_rubble=1`, facility flags cleared, `terrain_kind` from merged renderer metadata; triggers roll up res1 infrastructure counts.
 * Exceptions: Caller must ensure `h3_index` is unused or SQLite will throw (caught at caller).
 */
export function insertRes4FeatureOverrideRubbleRow(
  ops: ControlDbOps,
  args: { h3Index: string; parentH3Index: string; terrainKind: string }
): void {
  logDebug('gameDb insertRes4FeatureOverrideRubbleRow', {
    h3Index: args.h3Index,
    parentH3Index: args.parentH3Index,
    terrainKind: args.terrainKind,
  });
  ops.run(
    `INSERT INTO res4_feature_overrides (
       h3_index, parent_h3_index, terrain_kind,
       is_urban, is_airport, is_seaport, is_rubble
     ) VALUES (?, ?, ?, 0, 0, 0, 1)`,
    [args.h3Index, args.parentH3Index, args.terrainKind]
  );
}

/**
 * Defines the `updateRes4FeatureOverrideRow` function shape (export function updateRes4FeatureOverrideRow( ops: ControlDbOps, h3Index: string, patch: Partial<Pick<Res4FeatureOverrideRow, 'isUrban' | 'isAirport' |).

 * Purpose: Supports maintainability by documenting why `updateRes4FeatureOverrideRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateRes4FeatureOverrideRow(
  ops: ControlDbOps,
  h3Index: string,
  patch: Partial<Pick<Res4FeatureOverrideRow, 'isUrban' | 'isAirport' | 'isSeaport' | 'isRubble'>>
): void {
  logDebug('gameDb updateRes4FeatureOverrideRow', { h3Index, patch });
  const row = ops.getOne<{
    isUrban: number;
    isAirport: number;
    isSeaport: number;
    isRubble: number;
  }>(
    `SELECT is_urban AS isUrban,
            is_airport AS isAirport,
            is_seaport AS isSeaport,
            is_rubble AS isRubble
     FROM res4_feature_overrides
     WHERE h3_index = ?`,
    [h3Index]
  );
  if (!row) return;
  ops.run(
    `UPDATE res4_feature_overrides
     SET is_urban = ?, is_airport = ?, is_seaport = ?, is_rubble = ?
     WHERE h3_index = ?`,
    [
      patch.isUrban === undefined ? row.isUrban : patch.isUrban ? 1 : 0,
      patch.isAirport === undefined ? row.isAirport : patch.isAirport ? 1 : 0,
      patch.isSeaport === undefined ? row.isSeaport : patch.isSeaport ? 1 : 0,
      patch.isRubble === undefined ? row.isRubble : patch.isRubble ? 1 : 0,
      h3Index,
    ]
  );
}

/**
 * Defines the `ensureRes1InfrastructureSyncTriggers` function shape (export function ensureRes1InfrastructureSyncTriggers(ops: ControlDbOps): void).

 * Purpose: Supports maintainability by documenting why `ensureRes1InfrastructureSyncTriggers` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function ensureRes1InfrastructureSyncTriggers(ops: ControlDbOps): void {
  logDebug('gameDb ensureRes1InfrastructureSyncTriggers');
  ops.run(
    `CREATE TRIGGER IF NOT EXISTS ${RES4_TO_RES1_SYNC_TRIGGER_NAMES.afterInsert}
     AFTER INSERT ON res4_feature_overrides
     BEGIN
       ${buildRes1RollupUpdateSql('NEW.parent_h3_index')}
     END;`
  );
  ops.run(
    `CREATE TRIGGER IF NOT EXISTS ${RES4_TO_RES1_SYNC_TRIGGER_NAMES.afterDelete}
     AFTER DELETE ON res4_feature_overrides
     BEGIN
       ${buildRes1RollupUpdateSql('OLD.parent_h3_index')}
     END;`
  );
  ops.run(
    `CREATE TRIGGER IF NOT EXISTS ${RES4_TO_RES1_SYNC_TRIGGER_NAMES.afterUpdate}
     AFTER UPDATE ON res4_feature_overrides
     BEGIN
       ${buildRes1RollupUpdateSql('OLD.parent_h3_index')}
       ${buildRes1RollupUpdateSql('NEW.parent_h3_index')}
     END;`
  );
}

/**
 * Defines the `reconcileRes1InfrastructureCountsFromRes4Overrides` function shape (export function reconcileRes1InfrastructureCountsFromRes4Overrides(ops: ControlDbOps): { changedHexCount: number } { logDebug('gameDb reconcileRes1Infrastruc).

 * Purpose: Supports maintainability by documenting why `reconcileRes1InfrastructureCountsFromRes4Overrides` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function reconcileRes1InfrastructureCountsFromRes4Overrides(ops: ControlDbOps): { changedHexCount: number } {
  logDebug('gameDb reconcileRes1InfrastructureCountsFromRes4Overrides');
  const mismatch = ops.getOne<{ mismatchCount: number }>(
    `SELECT COUNT(*) AS mismatchCount
     FROM res1_infrastructure ri
     LEFT JOIN (${RES4_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL}) counts ON counts.h3Index = ri.h3_index
     WHERE ${buildRes1CountsMismatchPredicateSql('ri', 'counts')}`
  )?.mismatchCount ?? 0;
  if (mismatch <= 0) {
    logDebug('gameDb reconcileRes1InfrastructureCountsFromRes4Overrides: no-op');
    return { changedHexCount: 0 };
  }
  ops.run(
    `WITH counts AS (${RES4_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL})
     UPDATE res1_infrastructure
     SET urban_hex_count = COALESCE((SELECT urbanHexCount FROM counts WHERE counts.h3Index = res1_infrastructure.h3_index), 0),
         airport_count = COALESCE((SELECT airportCount FROM counts WHERE counts.h3Index = res1_infrastructure.h3_index), 0),
         seaport_count = COALESCE((SELECT seaportCount FROM counts WHERE counts.h3Index = res1_infrastructure.h3_index), 0)
     WHERE urban_hex_count != COALESCE((SELECT urbanHexCount FROM counts WHERE counts.h3Index = res1_infrastructure.h3_index), 0)
        OR airport_count != COALESCE((SELECT airportCount FROM counts WHERE counts.h3Index = res1_infrastructure.h3_index), 0)
        OR seaport_count != COALESCE((SELECT seaportCount FROM counts WHERE counts.h3Index = res1_infrastructure.h3_index), 0)`
  );
  logDebug('gameDb reconcileRes1InfrastructureCountsFromRes4Overrides: applied', { changedHexCount: mismatch });
  return { changedHexCount: mismatch };
}

/**
 * Defines the `getRes4TerrainOverridesForRendererFromGame` function shape (export function getRes4TerrainOverridesForRendererFromGame(ops: ControlDbOps): Array<).

 * Purpose: Supports maintainability by documenting why `getRes4TerrainOverridesForRendererFromGame` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRes4TerrainOverridesForRendererFromGame(ops: ControlDbOps): Array<{
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
}> {
  logDebug('gameDb getRes4TerrainOverridesForRendererFromGame');
  return getRes4RendererOverrideRowsCached(ops, () => buildRes4TerrainOverridesForRendererFromGameUncached(ops));
}

/**
 * Builds merged res4 terrain override rows for the renderer without memoization.
 *
 * Purpose: Inner rebuild used by `getRes4RendererOverrideRowsCached` on cache miss.
 * When to use: Only from the cache wrapper in this module.
 * Expected outcome: Same row list as the pre-memoization implementation.
 * Exceptions: None.
 */
function buildRes4TerrainOverridesForRendererFromGameUncached(ops: ControlDbOps): Array<{
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
}> {
  logDebug('gameDb buildRes4TerrainOverridesForRendererFromGameUncached');
  const baseRows = getRes4TerrainOverridesFromCache();
  const mergedByH3 = new Map(
    baseRows.map((row) => [
      row.h3Index,
      {
        h3Index: row.h3Index,
        terrainKind: row.terrainKind,
        isUrban: row.isUrban,
        isAirport: false,
        isSeaport: false,
        isRubble: !!row.isRubble,
      },
    ])
  );
  for (const feature of listRes4FeatureOverridesForGame(ops)) {
    const current = mergedByH3.get(feature.h3Index);
    mergedByH3.set(feature.h3Index, {
      h3Index: feature.h3Index,
      terrainKind: current?.terrainKind ?? (feature.terrainKind as (typeof baseRows)[number]['terrainKind']),
      isUrban: feature.isUrban,
      isAirport: feature.isAirport,
      isSeaport: feature.isSeaport,
      isRubble: feature.isRubble,
    });
  }
  const rows = [...mergedByH3.values()].sort((a, b) => a.h3Index.localeCompare(b.h3Index));
  let airportCount = 0;
  let seaportCount = 0;
  for (const row of rows) {
    if (row.isAirport) airportCount += 1;
    if (row.isSeaport) seaportCount += 1;
  }
  logDebug('gameDb getRes4TerrainOverridesForRendererFromGame: prepared rows', {
    rowCount: rows.length,
    airportCount,
    seaportCount,
  });
  return rows;
}
