import {
  getTacticalTerrainOverridesForRenderer as getTacticalTerrainOverridesFromCache,
  isTerrainClassificationCacheLoaded,
} from '../terrainClassificationCache';
import { logDebug, logTrace } from '../logger';
import { getTacticalRendererOverrideRowsCached } from './tacticalRendererOverrideCache';
import { isBuildQueueItemType, type BuildQueueItemType } from '../productionRules';
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
   * Specifies the contract for the `unitType` member (unitType: BuildQueueItemType;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: BuildQueueItemType;
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
 * Documents the `StrategicInfrastructureRow` interface as a named contract surface (export interface StrategicInfrastructureRow).

 * Purpose: Supports maintainability by documenting why `StrategicInfrastructureRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface StrategicInfrastructureRow {
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
  /**
   * Fortified intact city cells in this hex.
   *
   * Contract: Matches `res_s_infrastructure.fortified_count`.
   * When to use: Soak, siege, and the build pause.
   * Expected outcome: A non-negative integer. Missing rows read as 0.
   * Exceptions: None.
   */
  fortifiedCount: number;
  /**
   * Intact city cells that are not fortified.
   *
   * Contract: Matches `res_s_infrastructure.fortifiable_count`.
   * When to use: Production, when choosing cells that can still be fortified.
   * Expected outcome: A non-negative integer. Missing rows read as 0.
   * Exceptions: None.
   */
  fortifiableCount: number;
}

/**
 * Documents the `TacticalFeatureOverrideRow` interface as a named contract surface (export interface TacticalFeatureOverrideRow).

 * Purpose: Supports maintainability by documenting why `TacticalFeatureOverrideRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TacticalFeatureOverrideRow {
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
  /**
   * True when this intact city cell is fortified.
   *
   * Contract: Matches `res_t_feature_overrides.is_fortified`.
   * When to use: Strikes, missiles, and the renderer.
   * Expected outcome: False on every non-urban or rubble cell.
   * Exceptions: None.
   */
  isFortified: boolean;
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
 * Documents the `StrategicInfrastructureDbRow` interface as a named contract surface (interface StrategicInfrastructureDbRow extends Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `StrategicInfrastructureDbRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface StrategicInfrastructureDbRow extends Record<string, unknown> {
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
  /**
   * Fortified intact city cells on the hex.
   *
   * Contract: Column `fortified_count`.
   * When to use: Tooltips, soak, and the turn report.
   * Expected outcome: A count of cells with the fortification flag.
   * Exceptions: None.
   */
  fortifiedCount: number;
  /**
   * Intact city cells that are not yet fortified.
   *
   * Contract: Column `fortifiable_count`.
   * When to use: Production eligibility and the Fortified column.
   * Expected outcome: Intact city cells minus `fortifiedCount`.
   * Exceptions: None.
   */
  fortifiableCount: number;
}

/**
 * Defines the `mapStrategicInfrastructureDbRow` function shape (function mapStrategicInfrastructureDbRow(row: StrategicInfrastructureDbRow): StrategicInfrastructureRow).

 * Purpose: Supports maintainability by documenting why `mapStrategicInfrastructureDbRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function mapStrategicInfrastructureDbRow(row: StrategicInfrastructureDbRow): StrategicInfrastructureRow {
  return {
    h3Index: row.h3Index,
    urbanHexCount: Math.max(0, row.urbanHexCount),
    airportCount: Math.max(0, row.airportCount),
    seaportCount: Math.max(0, row.seaportCount),
    fortifiedCount: Math.max(0, row.fortifiedCount),
    fortifiableCount: Math.max(0, row.fortifiableCount),
  };
}

/**
 * Defines the `listStrategicInfrastructureRowsInternal` function shape (function listStrategicInfrastructureRowsInternal( ops: ControlDbOps, options?: { whereClause?: string; params?: unknown[]; orderByClause?: string } ): StrategicInf).

 * Purpose: Supports maintainability by documenting why `listStrategicInfrastructureRowsInternal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function listStrategicInfrastructureRowsInternal(
  ops: ControlDbOps,
  options?: { whereClause?: string; params?: unknown[]; orderByClause?: string }
): StrategicInfrastructureRow[] {
  const whereClause = options?.whereClause ? ` ${options.whereClause}` : '';
  const orderByClause = options?.orderByClause ? ` ${options.orderByClause}` : '';
  return ops.getAll<StrategicInfrastructureDbRow>(
    `SELECT h3_index AS h3Index,
            urban_hex_count AS urbanHexCount,
            airport_count AS airportCount,
            seaport_count AS seaportCount,
            fortified_count AS fortifiedCount,
            fortifiable_count AS fortifiableCount
     FROM res_s_infrastructure${whereClause}${orderByClause}`,
    options?.params ?? []
  ).map(mapStrategicInfrastructureDbRow);
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
    'SELECT controller_player_id AS controllerPlayerId FROM res_s_control WHERE h3_index = ?',
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
    ops.run('DELETE FROM res_s_control WHERE h3_index = ?', [h3Index]);
    return;
  }
  ops.run(
    `INSERT INTO res_s_control (h3_index, controller_player_id)
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
    'SELECT h3_index AS h3Index, controller_player_id AS controllerPlayerId FROM res_s_control ORDER BY h3_index ASC'
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
    unitType: BuildQueueItemType;
    remainingCount: number;
  }>(
    `SELECT id, h3_index AS h3Index, queue_index AS queueIndex, unit_type AS unitType, remaining_count AS remainingCount
     FROM res_s_build_queue
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
    'SELECT stored_points AS storedPoints FROM res_s_build_progress WHERE h3_index = ?',
    [h3Index]
  );
  return Math.max(0, row?.storedPoints ?? 0);
}

/**
 * Reads the Keep-building standing order for one production hex.
 *
 * Purpose: Exposes durable Keep-building flag/type for snapshots, prune sync, and production refill.
 * When to use: Anytime callers need whether a hex should auto-refill after its queue empties.
 * Expected outcome: `{ keepBuilding: false, keepBuildingUnitType: null }` when no progress row or flag off;
 * when armed, `keepBuildingUnitType` is a valid build unit type (invalid stored values are treated as disarmed).
 * Exceptions: None.
 */
export function getKeepBuildingForHex(
  ops: ControlDbOps,
  h3Index: string
): { keepBuilding: boolean; keepBuildingUnitType: BuildQueueItemType | null } {
  logTrace('gameDb getKeepBuildingForHex', { h3Index });
  const row = ops.getOne<{ keepBuilding: number; keepBuildingUnitType: string | null }>(
    `SELECT keep_building AS keepBuilding, keep_building_unit_type AS keepBuildingUnitType
     FROM res_s_build_progress WHERE h3_index = ?`,
    [h3Index]
  );
  if (!row || row.keepBuilding !== 1) {
    return { keepBuilding: false, keepBuildingUnitType: null };
  }
  const unitType = row.keepBuildingUnitType;
  if (!isBuildQueueItemType(unitType)) {
    return { keepBuilding: false, keepBuildingUnitType: null };
  }
  return { keepBuilding: true, keepBuildingUnitType: unitType };
}

/**
 * Writes or clears the Keep-building standing order for one production hex.
 *
 * Purpose: Persists checkbox arm/disarm and prune/engine standing-order updates without touching stored points.
 * When to use: Human Keep-building mutations, last-type sync after queue edits, and prune/refill invalidation.
 * Expected outcome: When `keepBuilding` is false, both columns clear; when true, requires a unit type and upserts
 * a progress row (creating one with `stored_points = 0` if missing) without changing existing stored points.
 * Exceptions: Throws if `keepBuilding` is true and `keepBuildingUnitType` is null.
 */
export function setKeepBuildingForHex(
  ops: ControlDbOps,
  h3Index: string,
  keepBuilding: boolean,
  keepBuildingUnitType: BuildQueueItemType | null
): void {
  if (keepBuilding && !keepBuildingUnitType) {
    throw new Error('Keep building requires a unit type when enabled.');
  }
  const flag = keepBuilding ? 1 : 0;
  const unitType = keepBuilding ? keepBuildingUnitType : null;
  logDebug('gameDb setKeepBuildingForHex', { h3Index, keepBuilding, keepBuildingUnitType: unitType });
  ops.run(
    `INSERT INTO res_s_build_progress (h3_index, stored_points, keep_building, keep_building_unit_type)
     VALUES (?, 0, ?, ?)
     ON CONFLICT(h3_index) DO UPDATE SET
       keep_building = excluded.keep_building,
       keep_building_unit_type = excluded.keep_building_unit_type`,
    [h3Index, flag, unitType]
  );
}

/**
 * Defines the `setBuildProgressPointsForHex` function shape (export function setBuildProgressPointsForHex(ops: ControlDbOps, h3Index: string, storedPoints: number): void).

 * Purpose: Updates banked production points without clearing Keep-building columns.
 * When to use: After a production spend pulse or test setup that only adjusts stored points.
 * Expected outcome: `stored_points` set; existing `keep_building` / `keep_building_unit_type` preserved on conflict.
 * Exceptions: None.
 */
export function setBuildProgressPointsForHex(ops: ControlDbOps, h3Index: string, storedPoints: number): void {
  const safePoints = Math.max(0, Math.trunc(storedPoints));
  logDebug('gameDb setBuildProgressPointsForHex', { h3Index, storedPoints: safePoints });
  ops.run(
    `INSERT INTO res_s_build_progress (h3_index, stored_points, keep_building, keep_building_unit_type)
     VALUES (?, ?, 0, NULL)
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
  ops.run('DELETE FROM res_s_build_queue WHERE h3_index = ?', [h3Index]);
  ops.run('DELETE FROM res_s_build_progress WHERE h3_index = ?', [h3Index]);
}

/**
 * Defines the `replaceBuildQueueForHex` function shape (export function replaceBuildQueueForHex( ops: ControlDbOps, h3Index: string, entries: Array<{ unitType: BuildQueueItemType; remainingCount: number }> ): vo).

 * Purpose: Supports maintainability by documenting why `replaceBuildQueueForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replaceBuildQueueForHex(
  ops: ControlDbOps,
  h3Index: string,
  entries: Array<{ unitType: BuildQueueItemType; remainingCount: number }>
): void {
  logDebug('gameDb replaceBuildQueueForHex', { h3Index, entryCount: entries.length });
  ops.run('DELETE FROM res_s_build_queue WHERE h3_index = ?', [h3Index]);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    ops.run(
      `INSERT INTO res_s_build_queue (h3_index, queue_index, unit_type, remaining_count)
       VALUES (?, ?, ?, ?)`,
      [h3Index, i, entry.unitType, Math.max(1, Math.trunc(entry.remainingCount))]
    );
  }
}

/**
 * Defines the `getStrategicInfrastructureForHex` function shape (export function getStrategicInfrastructureForHex(ops: ControlDbOps, h3Index: string): StrategicInfrastructureRow).

 * Purpose: Supports maintainability by documenting why `getStrategicInfrastructureForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getStrategicInfrastructureForHex(ops: ControlDbOps, h3Index: string): StrategicInfrastructureRow {
  logTrace('gameDb getRes1InfrastructureForHex', { h3Index });
  const row = listStrategicInfrastructureRowsInternal(ops, {
    whereClause: 'WHERE h3_index = ?',
    params: [h3Index],
  })[0];
  return row ?? { h3Index, urbanHexCount: 0, airportCount: 0, seaportCount: 0, fortifiedCount: 0, fortifiableCount: 0 };
}

/**
 * Defines the `listStrategicInfrastructureRows` function shape (export function listStrategicInfrastructureRows(ops: ControlDbOps): StrategicInfrastructureRow[]).

 * Purpose: Supports maintainability by documenting why `listStrategicInfrastructureRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listStrategicInfrastructureRows(ops: ControlDbOps): StrategicInfrastructureRow[] {
  logTrace('gameDb listRes1InfrastructureRows');
  return listStrategicInfrastructureRowsInternal(ops, { orderByClause: 'ORDER BY h3_index ASC' });
}

/**
 * Defines the `setStrategicInfrastructureForHex` function shape (export function setStrategicInfrastructureForHex( ops: ControlDbOps, h3Index: string, counts: { urbanHexCount: number; airportCount: number; seaportCount: n).

 * Purpose: Supports maintainability by documenting why `setStrategicInfrastructureForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setStrategicInfrastructureForHex(
  ops: ControlDbOps,
  h3Index: string,
  counts: { urbanHexCount: number; airportCount: number; seaportCount: number }
): void {
  logDebug('gameDb setRes1InfrastructureForHex', { h3Index, ...counts });
  ops.run(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
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
 * Defines the `listTacticalFeatureOverridesForGame` function shape (export function listTacticalFeatureOverridesForGame(ops: ControlDbOps): TacticalFeatureOverrideRow[]).

 * Purpose: Supports maintainability by documenting why `listTacticalFeatureOverridesForGame` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listTacticalFeatureOverridesForGame(ops: ControlDbOps): TacticalFeatureOverrideRow[] {
  logTrace('gameDb listRes4FeatureOverridesForGame');
  return ops.getAll<{
    h3Index: string;
    parentH3Index: string;
    terrainKind: string;
    isUrban: number;
    isAirport: number;
    isSeaport: number;
    isRubble: number;
    isFortified: number;
  }>(
    `SELECT h3_index AS h3Index,
            parent_h3_index AS parentH3Index,
            terrain_kind AS terrainKind,
            is_urban AS isUrban,
            is_airport AS isAirport,
            is_seaport AS isSeaport,
            is_rubble AS isRubble,
            is_fortified AS isFortified
     FROM res_t_feature_overrides
     ORDER BY h3_index ASC`
  ).map((row) => ({
    h3Index: row.h3Index,
    parentH3Index: row.parentH3Index,
    terrainKind: row.terrainKind,
    isUrban: row.isUrban === 1,
    isAirport: row.isAirport === 1,
    isSeaport: row.isSeaport === 1,
    isRubble: row.isRubble === 1,
    isFortified: row.isFortified === 1,
  }));
}

/**
 * Inserts a new `res_t_feature_overrides` row marking rubble-only damage (no facilities) for tactical transport destruction.
 *
 * Purpose: `UPDATE` on missing rows is a no-op; road/rail-only cells need a durable rubble row so refresh and march rules see `is_rubble`.
 * When to use: `applyTacticalRangedRubbleToTacticalCell` after confirming no existing row for the tactical index and a strikeable transport corridor.
 * Expected outcome: One INSERT with `is_rubble=1`, facility flags cleared, `terrain_kind` from merged renderer metadata; triggers roll up strategic infrastructure counts.
 * Exceptions: Caller must ensure `h3_index` is unused or SQLite will throw (caught at caller).
 */
export function insertTacticalFeatureOverrideRubbleRow(
  ops: ControlDbOps,
  args: { h3Index: string; parentH3Index: string; terrainKind: string }
): void {
  logDebug('gameDb insertRes4FeatureOverrideRubbleRow', {
    h3Index: args.h3Index,
    parentH3Index: args.parentH3Index,
    terrainKind: args.terrainKind,
  });
  ops.run(
    `INSERT INTO res_t_feature_overrides (
       h3_index, parent_h3_index, terrain_kind,
       is_urban, is_airport, is_seaport, is_rubble
     ) VALUES (?, ?, ?, 0, 0, 0, 1)`,
    [args.h3Index, args.parentH3Index, args.terrainKind]
  );
}

/**
 * Defines the `updateTacticalFeatureOverrideRow` function shape (export function updateTacticalFeatureOverrideRow( ops: ControlDbOps, h3Index: string, patch: Partial<Pick<TacticalFeatureOverrideRow, 'isUrban' | 'isAirport' |).

 * Purpose: Supports maintainability by documenting why `updateTacticalFeatureOverrideRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateTacticalFeatureOverrideRow(
  ops: ControlDbOps,
  h3Index: string,
  patch: Partial<Pick<TacticalFeatureOverrideRow, 'isUrban' | 'isAirport' | 'isSeaport' | 'isRubble' | 'isFortified'>>
): void {
  logDebug('gameDb updateRes4FeatureOverrideRow', { h3Index, patch });
  const row = ops.getOne<{
    isUrban: number;
    isAirport: number;
    isSeaport: number;
    isRubble: number;
    isFortified: number;
  }>(
    `SELECT is_urban AS isUrban,
            is_airport AS isAirport,
            is_seaport AS isSeaport,
            is_rubble AS isRubble,
            is_fortified AS isFortified
     FROM res_t_feature_overrides
     WHERE h3_index = ?`,
    [h3Index]
  );
  if (!row) return;
  ops.run(
    `UPDATE res_t_feature_overrides
     SET is_urban = ?, is_airport = ?, is_seaport = ?, is_rubble = ?, is_fortified = ?
     WHERE h3_index = ?`,
    [
      patch.isUrban === undefined ? row.isUrban : patch.isUrban ? 1 : 0,
      patch.isAirport === undefined ? row.isAirport : patch.isAirport ? 1 : 0,
      patch.isSeaport === undefined ? row.isSeaport : patch.isSeaport ? 1 : 0,
      patch.isRubble === undefined ? row.isRubble : patch.isRubble ? 1 : 0,
      patch.isFortified === undefined ? row.isFortified : patch.isFortified ? 1 : 0,
      h3Index,
    ]
  );
}

export { ensureStrategicInfrastructureSyncTriggers, reconcileStrategicInfrastructureCountsFromTacticalOverrides } from './strategicInfrastructureRollup';

/**
 * Returns merged tactical terrain rows for the renderer, using the override cache.
 *
 * Purpose: The renderer reads one row per tactical cell without rebuilding the merge on every call.
 * When to use: IPC and tests that need the current tactical feature picture.
 * Expected outcome: Cached rows when the feature signature is unchanged.
 * Exceptions: Propagates errors from the cache rebuild.
 */
export function getTacticalTerrainOverridesForRendererFromGame(ops: ControlDbOps): Array<{
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
  isFortified?: boolean;
}> {
  logTrace('gameDb getRes4TerrainOverridesForRendererFromGame');
  return getTacticalRendererOverrideRowsCached(ops, () => buildTacticalTerrainOverridesForRendererFromGameUncached(ops));
}

/**
 * Builds merged tactical terrain override rows for the renderer without memoization.
 *
 * Purpose: Inner rebuild used by `getTacticalRendererOverrideRowsCached` on cache miss.
 * When to use: Only from the cache wrapper in this module.
 * Expected outcome: Base pack rows overlaid with match feature rows. An empty list when the classification cache has not been loaded, so a startup request cannot publish feature rows as the whole tactical map.
 * Exceptions: Propagates SQLite errors from the feature-override read after the cache is loaded.
 */
function buildTacticalTerrainOverridesForRendererFromGameUncached(ops: ControlDbOps): Array<{
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
  isFortified?: boolean;
}> {
  logDebug('gameDb buildRes4TerrainOverridesForRendererFromGameUncached');
  if (!isTerrainClassificationCacheLoaded()) {
    logDebug('gameDb buildRes4TerrainOverridesForRendererFromGameUncached: terrain cache empty, returning []');
    return [];
  }
  const baseRows = getTacticalTerrainOverridesFromCache();
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
        isFortified: false,
      },
    ])
  );
  for (const feature of listTacticalFeatureOverridesForGame(ops)) {
    const current = mergedByH3.get(feature.h3Index);
    mergedByH3.set(feature.h3Index, {
      h3Index: feature.h3Index,
      terrainKind: current?.terrainKind ?? (feature.terrainKind as (typeof baseRows)[number]['terrainKind']),
      isUrban: feature.isUrban,
      isAirport: feature.isAirport,
      isSeaport: feature.isSeaport,
      isRubble: feature.isRubble,
      isFortified: feature.isFortified,
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
