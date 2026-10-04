import type { BuildUnitType } from '../productionRules';
import { logDebug, logTrace } from '../logger';
import { gameDbOps } from './dbConnection';
import {
  clearBuildQueueAndProgressForHex as clearBuildQueueAndProgressForHexFromModule,
  getBuildProgressPointsForHex as getBuildProgressPointsForHexFromModule,
  getKeepBuildingForHex as getKeepBuildingForHexFromModule,
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
  setKeepBuildingForHex as setKeepBuildingForHexFromModule,
  setHexController as setHexControllerFromModule,
  setRes1InfrastructureForHex as setRes1InfrastructureForHexFromModule,
  insertRes4FeatureOverrideRubbleRow as insertRes4FeatureOverrideRubbleRowFromModule,
  updateRes4FeatureOverrideRow as updateRes4FeatureOverrideRowFromModule,
  type BuildQueueRow,
  type HexControlRow,
  type Res1InfrastructureRow,
  type Res4FeatureOverrideRow,
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
 * Returns every strategic res1 hex’s current controller as a map keyed by H3 index.
 *
 * Purpose: Avoid repeating `new Map(listAllHexControls().map(...))` at call sites that need bulk control lookups.
 * When to use: Whenever resolution reads many hex controllers from `res1_control` in one pass (win checks, control resolution snapshots).
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
  keepBuildingUnitType: BuildUnitType | null;
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
  keepBuildingUnitType: BuildUnitType | null
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
export function replaceBuildQueueForHex(h3Index: string, entries: Array<{ unitType: BuildUnitType; remainingCount: number }>): void {
  replaceBuildQueueForHexFromModule(gameDbOps, h3Index, entries);
}

/**
 * Defines the `getRes1InfrastructureForHex` function shape (export function getRes1InfrastructureForHex(h3Index: string): Res1InfrastructureRow).

 * Purpose: Supports maintainability by documenting why `getRes1InfrastructureForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRes1InfrastructureForHex(h3Index: string): Res1InfrastructureRow {
  return getRes1InfrastructureForHexFromModule(gameDbOps, h3Index);
}

/**
 * Sums persisted res4 urban cell counts (aggregated per res1 hex) over a list of strategic hex ids.
 *
 * Purpose: Single place for region-scale urban totals used by victory rules and any future analytics.
 * When to use: Pass the full res1 hex list for a home region or other bounded set.
 * Expected outcome: Non-negative integer equal to the sum of each hex’s `urbanHexCount` from `res1_infrastructure`.
 * Exceptions: None.
 */
export function sumUrbanHexCountForHexes(hexIds: readonly string[]): number {
  logTrace('gameDb sumUrbanHexCountForHexes', { hexCount: hexIds.length });
  let sum = 0;
  for (const h3Index of hexIds) {
    sum += getRes1InfrastructureForHex(h3Index).urbanHexCount;
  }
  return sum;
}

/**
 * Defines the `listRes1InfrastructureRows` function shape (export function listRes1InfrastructureRows(): Res1InfrastructureRow[]).

 * Purpose: Supports maintainability by documenting why `listRes1InfrastructureRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listRes1InfrastructureRows(): Res1InfrastructureRow[] {
  return listRes1InfrastructureRowsFromModule(gameDbOps);
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
  setRes1InfrastructureForHexFromModule(gameDbOps, h3Index, counts);
}

/**
 * Defines the `listRes4FeatureOverridesForGame` function shape (export function listRes4FeatureOverridesForGame(): Res4FeatureOverrideRow[]).

 * Purpose: Supports maintainability by documenting why `listRes4FeatureOverridesForGame` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listRes4FeatureOverridesForGame(): Res4FeatureOverrideRow[] {
  return listRes4FeatureOverridesForGameFromModule(gameDbOps);
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
  return reconcileRes1InfrastructureCountsFromRes4OverridesFromModule(gameDbOps);
}

/**
 * Defines the `runInfrastructureStartupConsistencyPass` function shape (export function runInfrastructureStartupConsistencyPass(options?:).

 * Purpose: Supports maintainability by documenting why `runInfrastructureStartupConsistencyPass` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function runInfrastructureStartupConsistencyPass(options?: { includeReconciliation?: boolean }): void {
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
  ensureRes1InfrastructureSyncTriggersFromModule(gameDbOps);
}

/**
 * Defines the `insertRes4FeatureOverrideRubbleRow` function shape (export function insertRes4FeatureOverrideRubbleRow(args: { h3Index: string; parentH3Index: string; terrainKind: string }): void).
 *
 * Purpose: Exposes transport-only tactical rubble persistence at the game DB facade.
 * When to use: `applyTacticalRangedRubbleToRes4Cell` when no override row exists yet for the res4 cell.
 * Expected outcome: Delegates to `controlInfrastructure.insertRes4FeatureOverrideRubbleRow` with the live connection bundle (which emits debug logs).
 * Exceptions: None; SQLite errors surface to callers that wrap in try/catch.
 */
export function insertRes4FeatureOverrideRubbleRow(args: {
  h3Index: string;
  parentH3Index: string;
  terrainKind: string;
}): void {
  insertRes4FeatureOverrideRubbleRowFromModule(gameDbOps, args);
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
  updateRes4FeatureOverrideRowFromModule(gameDbOps, h3Index, patch);
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
  return getRes4TerrainOverridesForRendererFromGameFromModule(gameDbOps);
}
