import { logDebug, logError } from '../../logger';
import { getOrderedHexList } from '../../mapData';
import { assertTerrainMetadataMatchesHexList } from '../../terrainMetadataLoad';
import {
  ensureTerrainClassificationCacheLoaded,
  getRes1ProductionContext,
  getRes4FeatureRowsForSeeding,
  getTerrainRes1KindsFromCache,
} from '../../terrainClassificationCache';
import { pipelineTerrainToPassability } from '../../terrainPassability';
import { gameDbOps, getAll, run } from '../dbConnection';
import {
  ensureRes1InfrastructureSyncTriggers,
  reconcileRes1InfrastructureCountsFromRes4Overrides,
} from '../controlInfrastructureAccess';

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
 * Defines the `seedHexesFromTerrainMetadata` function shape (export function seedHexesFromTerrainMetadata(): void).

 * Purpose: Supports maintainability by documenting why `seedHexesFromTerrainMetadata` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function seedHexesFromTerrainMetadata(): void {
  logDebug('gameDb seedHexesFromTerrainMetadata');
  if (!gameDbOps.hasDb()) return;
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
 * Defines the `seedInfrastructureStateFromMetadata` function shape (export function seedInfrastructureStateFromMetadata(): void).

 * Purpose: Supports maintainability by documenting why `seedInfrastructureStateFromMetadata` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function seedInfrastructureStateFromMetadata(): void {
  logDebug('gameDb seedInfrastructureStateFromMetadata');
  if (!gameDbOps.hasDb()) return;
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
 * Defines the `backfillInfrastructureStateFromMetadataIfMissing` function shape (export function backfillInfrastructureStateFromMetadataIfMissing(): void).

 * Purpose: Supports maintainability by documenting why `backfillInfrastructureStateFromMetadataIfMissing` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function backfillInfrastructureStateFromMetadataIfMissing(): void {
  logDebug('gameDb backfillInfrastructureStateFromMetadataIfMissing');
  if (!gameDbOps.hasDb()) return;
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
