import type { BuildQueueItemType } from '../productionRules';
import { logDebug, logTrace } from '../logger';
import { gameDbOps } from './dbConnection';
import {
  clearBuildQueueAndProgressForHex as clearBuildQueueAndProgressForHexFromModule,
  getBuildProgressPointsForHex as getBuildProgressPointsForHexFromModule,
  getKeepBuildingForHex as getKeepBuildingForHexFromModule,
  getHexController as getHexControllerFromModule,
  getStrategicInfrastructureForHex as getStrategicInfrastructureForHexFromModule,
  getTacticalTerrainOverridesForRendererFromGame as getTacticalTerrainOverridesForRendererFromGameFromModule,
  ensureStrategicInfrastructureSyncTriggers as ensureStrategicInfrastructureSyncTriggersFromModule,
  listAllHexControls as listAllHexControlsFromModule,
  listBuildQueueRowsForHex as listBuildQueueRowsForHexFromModule,
  listStrategicInfrastructureRows as listStrategicInfrastructureRowsFromModule,
  listTacticalFeatureOverridesForGame as listTacticalFeatureOverridesForGameFromModule,
  reconcileStrategicInfrastructureCountsFromTacticalOverrides as reconcileStrategicInfrastructureCountsFromTacticalOverridesFromModule,
  replaceBuildQueueForHex as replaceBuildQueueForHexFromModule,
  setBuildProgressPointsForHex as setBuildProgressPointsForHexFromModule,
  setKeepBuildingForHex as setKeepBuildingForHexFromModule,
  setHexController as setHexControllerFromModule,
  setStrategicInfrastructureForHex as setStrategicInfrastructureForHexFromModule,
  insertTacticalFeatureOverrideRubbleRow as insertTacticalFeatureOverrideRubbleRowFromModule,
  updateTacticalFeatureOverrideRow as updateTacticalFeatureOverrideRowFromModule,
  type BuildQueueRow,
  type HexControlRow,
  type StrategicInfrastructureRow,
  type TacticalFeatureOverrideRow,
} from './controlInfrastructure';

/**
 * Defines the `getHexController` function shape (export function getHexController(h3Index: string): string | null).

 * Purpose: Supports maintainability by documenting why `getHexController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHexController(h3Index: string): string | null {
  return getHexControllerFromModule(gameDbOps, h3Index);
}

/**
 * Defines the `setHexController` function shape (export function setHexController(h3Index: string, controllerPlayerId: string | null): void).

 * Purpose: Supports maintainability by documenting why `setHexController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setHexController(h3Index: string, controllerPlayerId: string | null): void {
  setHexControllerFromModule(gameDbOps, h3Index, controllerPlayerId);
}

/**
 * Defines the `listAllHexControls` function shape (export function listAllHexControls(): HexControlRow[]).

 * Purpose: Supports maintainability by documenting why `listAllHexControls` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listAllHexControls(): HexControlRow[] {
  return listAllHexControlsFromModule(gameDbOps);
}

/**
 * Returns every strategic hex’s current controller as a map keyed by H3 index.
 *
 * Purpose: Avoid repeating `new Map(listAllHexControls().map(...))` at call sites that need bulk control lookups.
 * When to use: Whenever resolution reads many hex controllers from `res_s_control` in one pass (win checks, control resolution snapshots).
 * Expected outcome: A new map per call; values mirror `controller_player_id` (including null when unset).
 * Exceptions: None.
 */
export function getHexControlMap(): ReadonlyMap<string, string | null> {
  logTrace('gameDb getHexControlMap');
  return new Map(listAllHexControls().map((row) => [row.h3Index, row.controllerPlayerId]));
}

/**
 * Defines the `listBuildQueueRowsForHex` function shape (export function listBuildQueueRowsForHex(h3Index: string): BuildQueueRow[]).

 * Purpose: Supports maintainability by documenting why `listBuildQueueRowsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listBuildQueueRowsForHex(h3Index: string): BuildQueueRow[] {
  return listBuildQueueRowsForHexFromModule(gameDbOps, h3Index);
}

/**
 * Defines the `getBuildProgressPointsForHex` function shape (export function getBuildProgressPointsForHex(h3Index: string): number).

 * Purpose: Supports maintainability by documenting why `getBuildProgressPointsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getBuildProgressPointsForHex(h3Index: string): number {
  return getBuildProgressPointsForHexFromModule(gameDbOps, h3Index);
}

/**
 * Reads Keep-building standing order for a hex through the game DB handle.
 *
 * Purpose: Facade over controlInfrastructure Keep-building reads for gameActions callers.
 * When to use: Snapshots, prune sync, production refill, and Keep-building mutations.
 * Expected outcome: Same contract as `getKeepBuildingForHex` in controlInfrastructure.
 * Exceptions: None.
 */
export function getKeepBuildingForHex(h3Index: string): {
  keepBuilding: boolean;
  keepBuildingUnitType: BuildQueueItemType | null;
} {
  return getKeepBuildingForHexFromModule(gameDbOps, h3Index);
}

/**
 * Writes Keep-building standing order for a hex through the game DB handle.
 *
 * Purpose: Facade over controlInfrastructure Keep-building writes for gameActions callers.
 * When to use: Arm/disarm, last-type sync, prune invalidation, and refill-path clears.
 * Expected outcome: Same contract as `setKeepBuildingForHex` in controlInfrastructure.
 * Exceptions: Propagates when enabling without a unit type.
 */
export function setKeepBuildingForHex(
  h3Index: string,
  keepBuilding: boolean,
  keepBuildingUnitType: BuildQueueItemType | null
): void {
  setKeepBuildingForHexFromModule(gameDbOps, h3Index, keepBuilding, keepBuildingUnitType);
}

/**
 * Defines the `setBuildProgressPointsForHex` function shape (export function setBuildProgressPointsForHex(h3Index: string, storedPoints: number): void).

 * Purpose: Supports maintainability by documenting why `setBuildProgressPointsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setBuildProgressPointsForHex(h3Index: string, storedPoints: number): void {
  setBuildProgressPointsForHexFromModule(gameDbOps, h3Index, storedPoints);
}

/**
 * Defines the `clearBuildQueueAndProgressForHex` function shape (export function clearBuildQueueAndProgressForHex(h3Index: string): void).

 * Purpose: Supports maintainability by documenting why `clearBuildQueueAndProgressForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearBuildQueueAndProgressForHex(h3Index: string): void {
  clearBuildQueueAndProgressForHexFromModule(gameDbOps, h3Index);
}

/**
 * Defines the `replaceBuildQueueForHex` function shape (export function replaceBuildQueueForHex(h3Index: string, entries: Array<).

 * Purpose: Supports maintainability by documenting why `replaceBuildQueueForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replaceBuildQueueForHex(h3Index: string, entries: Array<{ unitType: BuildQueueItemType; remainingCount: number }>): void {
  replaceBuildQueueForHexFromModule(gameDbOps, h3Index, entries);
}

/**
 * Defines the `getStrategicInfrastructureForHex` function shape (export function getStrategicInfrastructureForHex(h3Index: string): StrategicInfrastructureRow).

 * Purpose: Supports maintainability by documenting why `getStrategicInfrastructureForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getStrategicInfrastructureForHex(h3Index: string): StrategicInfrastructureRow {
  return getStrategicInfrastructureForHexFromModule(gameDbOps, h3Index);
}

/**
 * Sums persisted tactical urban cell counts (aggregated per strategic hex) over a list of strategic hex ids.
 *
 * Purpose: Single place for region-scale urban totals used by victory rules and any future analytics.
 * When to use: Pass the full strategic hex list for a home region or other bounded set.
 * Expected outcome: Non-negative integer equal to the sum of each hex’s `urbanHexCount` from `res_s_infrastructure`.
 * Exceptions: None.
 */
export function sumUrbanHexCountForHexes(hexIds: readonly string[]): number {
  logTrace('gameDb sumUrbanHexCountForHexes', { hexCount: hexIds.length });
  let sum = 0;
  for (const h3Index of hexIds) {
    sum += getStrategicInfrastructureForHex(h3Index).urbanHexCount;
  }
  return sum;
}

/**
 * Defines the `listStrategicInfrastructureRows` function shape (export function listStrategicInfrastructureRows(): StrategicInfrastructureRow[]).

 * Purpose: Supports maintainability by documenting why `listStrategicInfrastructureRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listStrategicInfrastructureRows(): StrategicInfrastructureRow[] {
  return listStrategicInfrastructureRowsFromModule(gameDbOps);
}

/**
 * Defines the `setStrategicInfrastructureForHex` function shape (export function setStrategicInfrastructureForHex().

 * Purpose: Supports maintainability by documenting why `setStrategicInfrastructureForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setStrategicInfrastructureForHex(
  h3Index: string,
  counts: { urbanHexCount: number; airportCount: number; seaportCount: number }
): void {
  setStrategicInfrastructureForHexFromModule(gameDbOps, h3Index, counts);
}

/**
 * Defines the `listTacticalFeatureOverridesForGame` function shape (export function listTacticalFeatureOverridesForGame(): TacticalFeatureOverrideRow[]).

 * Purpose: Supports maintainability by documenting why `listTacticalFeatureOverridesForGame` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listTacticalFeatureOverridesForGame(): TacticalFeatureOverrideRow[] {
  return listTacticalFeatureOverridesForGameFromModule(gameDbOps);
}

/**
 * Defines the `reconcileStrategicInfrastructureCountsFromTacticalOverrides` function shape (export function reconcileStrategicInfrastructureCountsFromTacticalOverrides(): { changedHexCount: number } { logDebug('gameDb reconcileStrategicInfrastructureCountsFromRes).

 * Purpose: Supports maintainability by documenting why `reconcileStrategicInfrastructureCountsFromTacticalOverrides` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function reconcileStrategicInfrastructureCountsFromTacticalOverrides(): { changedHexCount: number } {
  logDebug('gameDb reconcileRes1InfrastructureCountsFromRes4Overrides');
  return reconcileStrategicInfrastructureCountsFromTacticalOverridesFromModule(gameDbOps);
}

/**
 * Defines the `runInfrastructureStartupConsistencyPass` function shape (export function runInfrastructureStartupConsistencyPass(options?:).

 * Purpose: Supports maintainability by documenting why `runInfrastructureStartupConsistencyPass` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function runInfrastructureStartupConsistencyPass(options?: { includeReconciliation?: boolean }): void {
  ensureStrategicInfrastructureSyncTriggers();
  if (options?.includeReconciliation === false) return;
  reconcileStrategicInfrastructureCountsFromTacticalOverrides();
}

/**
 * Defines the `ensureStrategicInfrastructureSyncTriggers` function shape (export function ensureStrategicInfrastructureSyncTriggers(): void).

 * Purpose: Supports maintainability by documenting why `ensureStrategicInfrastructureSyncTriggers` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function ensureStrategicInfrastructureSyncTriggers(): void {
  ensureStrategicInfrastructureSyncTriggersFromModule(gameDbOps);
}

/**
 * Defines the `insertTacticalFeatureOverrideRubbleRow` function shape (export function insertTacticalFeatureOverrideRubbleRow(args: { h3Index: string; parentH3Index: string; terrainKind: string }): void).
 *
 * Purpose: Exposes transport-only tactical rubble persistence at the game DB facade.
 * When to use: `applyTacticalRangedRubbleToTacticalCell` when no override row exists yet for the tactical cell.
 * Expected outcome: Delegates to `controlInfrastructure.insertTacticalFeatureOverrideRubbleRow` with the live connection bundle (which emits debug logs).
 * Exceptions: None; SQLite errors surface to callers that wrap in try/catch.
 */
export function insertTacticalFeatureOverrideRubbleRow(args: {
  h3Index: string;
  parentH3Index: string;
  terrainKind: string;
}): void {
  insertTacticalFeatureOverrideRubbleRowFromModule(gameDbOps, args);
}

/**
 * Defines the `updateTacticalFeatureOverrideRow` function shape (export function updateTacticalFeatureOverrideRow( h3Index: string, patch: Partial<Pick<TacticalFeatureOverrideRow, 'isUrban' | 'isAirport' | 'isSeaport' | 'isRubb).

 * Purpose: Supports maintainability by documenting why `updateTacticalFeatureOverrideRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateTacticalFeatureOverrideRow(
  h3Index: string,
  patch: Partial<Pick<TacticalFeatureOverrideRow, 'isUrban' | 'isAirport' | 'isSeaport' | 'isRubble' | 'isFortified'>>
): void {
  updateTacticalFeatureOverrideRowFromModule(gameDbOps, h3Index, patch);
}

/**
 * Defines the `getTacticalTerrainOverridesForRendererFromGame` function shape (export function getTacticalTerrainOverridesForRendererFromGame(): Array<).

 * Purpose: Supports maintainability by documenting why `getTacticalTerrainOverridesForRendererFromGame` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getTacticalTerrainOverridesForRendererFromGame(): Array<{
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
  isFortified?: boolean;
}> {
  return getTacticalTerrainOverridesForRendererFromGameFromModule(gameDbOps);
}
