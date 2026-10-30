import { logDebug, logError } from '../../logger';
import { storedStrategicTerrainKind } from '../../../shared/landTraversalStrategic';
import { loadedHexRole } from '../../../shared/loadedStrategicFootprint';
import { getOrderedHexList } from '../../mapData';
import { assertTerrainMetadataMatchesHexList } from '../../terrainMetadataLoad';
import {
  ensureTerrainClassificationCacheLoaded,
  getStrategicLandMassByH3,
  getStrategicProductionContext,
  getTacticalFeatureRowsForSeeding,
  getTerrainStrategicKindsFromCache,
} from '../../terrainClassificationCache';
import { pipelineTerrainToPassability } from '../../terrainPassability';
import { gameDbOps, getAll, run } from '../dbConnection';
import {
  ensureStrategicInfrastructureSyncTriggers,
  reconcileStrategicInfrastructureCountsFromTacticalOverrides,
} from '../controlInfrastructureAccess';

/**
 * Documents the module-scope binding `INFRASTRUCTURE_SYNC_TRIGGER_NAMES` (INFRASTRUCTURE_SYNC_TRIGGER_NAMES).

 * Purpose: Supports maintainability by documenting why `INFRASTRUCTURE_SYNC_TRIGGER_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const INFRASTRUCTURE_SYNC_TRIGGER_NAMES = [
  'res_t_sync_res_s_after_insert',
  'res_t_sync_res_s_after_delete',
  'res_t_sync_res_s_after_update',
] as const;

/**
 * Defines the `seedHexesFromTerrainMetadata` function shape (export function seedHexesFromTerrainMetadata(): void).

 * Purpose: Writes the terrain the map, the briefing, and passability read for the rest of the match. A water-dominant hex land units can enter is stored as coastal.
 * When to use: New-match reset, once the database is open. Do not call it to relabel hexes in an existing match.
 * Expected outcome: Each ordered hex is inserted. `terrain` is the passability of the stored kind, and `terrain_kind` is that kind. A water-dominant hex that land units can occupy below the water cap is stored as coastal. Nothing is inserted when no database is open.
 * Exceptions: Throws when a hex has no classified kind.
 */
export function seedHexesFromTerrainMetadata(): void {
  logDebug('gameDb seedHexesFromTerrainMetadata');
  if (!gameDbOps.hasDb()) return;
  ensureTerrainClassificationCacheLoaded();
  const hexes = getOrderedHexList();
  const byH3 = getTerrainStrategicKindsFromCache();
  const landMassByH3 = getStrategicLandMassByH3();
  assertTerrainMetadataMatchesHexList(byH3, hexes);
  for (const h3 of hexes) {
    const classifiedKind = byH3.get(h3);
    if (!classifiedKind) {
      logError('gameDb seedHexesFromTerrainMetadata: missing row', new Error(`no classified kind for ${h3}`));
      throw new Error(`terrain metadata missing h3_index ${h3}`);
    }
    const kind = storedStrategicTerrainKind(classifiedKind, landMassByH3.get(h3) ?? null);
    const terrain = pipelineTerrainToPassability(kind);
    run('INSERT INTO hexes (h3_index, terrain, terrain_kind, map_role) VALUES (?, ?, ?, ?)', [
      h3,
      terrain,
      kind,
      loadedHexRole(h3),
    ]);
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
    run('DELETE FROM res_s_infrastructure');
    run('DELETE FROM res_t_feature_overrides');
    const { strategicRows, tacticalRows } = getInfrastructureSeedRowsFromMetadata();
    for (const row of strategicRows) {
      insertStrategicInfrastructureRow(row.h3Index, row.urbanHexCount, row.airportCount, row.seaportCount);
    }
    for (const row of tacticalRows) {
      insertTacticalFeatureOverrideSeedRow(row);
    }
  } finally {
    // Bulk reseed already writes canonical strategic counts, so restoring triggers afterwards avoids N-per-row trigger overhead.
    ensureStrategicInfrastructureSyncTriggers();
  }
  const { changedHexCount } = reconcileStrategicInfrastructureCountsFromTacticalOverrides();
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
    getAll<{ h3Index: string }>('SELECT h3_index AS h3Index FROM res_s_infrastructure').map((r) => r.h3Index)
  );
  const existingTacticalOverrides = new Set(
    getAll<{ h3Index: string }>('SELECT h3_index AS h3Index FROM res_t_feature_overrides').map((r) => r.h3Index)
  );
  const { strategicRows, tacticalRows } = getInfrastructureSeedRowsFromMetadata();
  let insertedInfra = 0;
  for (const row of strategicRows) {
    if (existingInfra.has(row.h3Index)) continue;
    insertStrategicInfrastructureRow(row.h3Index, row.urbanHexCount, row.airportCount, row.seaportCount);
    insertedInfra += 1;
  }
  let insertedTactical = 0;
  for (const row of tacticalRows) {
    if (existingTacticalOverrides.has(row.h3Index)) continue;
    insertTacticalFeatureOverrideSeedRow(row);
    insertedTactical += 1;
  }

  if (insertedInfra > 0 || insertedTactical > 0) {
    logDebug('gameDb backfillInfrastructureStateFromMetadataIfMissing: inserted missing rows', {
      insertedInfra,
      insertedTactical,
    });
  }
}

/**
 * Documents the `InfrastructureSeedStrategicRow` interface as a named contract surface (interface InfrastructureSeedStrategicRow).

 * Purpose: Supports maintainability by documenting why `InfrastructureSeedStrategicRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface InfrastructureSeedStrategicRow {
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
   * Specifies the contract for the `strategicRows` member (strategicRows: InfrastructureSeedStrategicRow[];).

   * Contract: Describes stable behavior for callers of `strategicRows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
strategicRows: InfrastructureSeedStrategicRow[];
    /**
   * Specifies the contract for the `tacticalRows` member (tacticalRows: ReturnType<typeof getTacticalFeatureRowsForSeeding>;).

   * Contract: Describes stable behavior for callers of `tacticalRows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tacticalRows: ReturnType<typeof getTacticalFeatureRowsForSeeding>;
}

/**
 * Defines the `getInfrastructureSeedRowsFromMetadata` function shape (function getInfrastructureSeedRowsFromMetadata(): InfrastructureSeedRows).

 * Purpose: Supports maintainability by documenting why `getInfrastructureSeedRowsFromMetadata` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getInfrastructureSeedRowsFromMetadata(): InfrastructureSeedRows {
  const strategicRows: InfrastructureSeedStrategicRow[] = getOrderedHexList().map((h3Index) => {
    const ctx = getStrategicProductionContext({ h3Index });
    return {
      h3Index,
      urbanHexCount: ctx.urbanHexCount,
      airportCount: ctx.airportCount,
      seaportCount: ctx.seaportCount,
    };
  });
  const tacticalRows = getTacticalFeatureRowsForSeeding()
    .filter((row) => row.isUrban || row.isAirport || row.isSeaport);
  return { strategicRows, tacticalRows };
}

/**
 * Defines the `insertStrategicInfrastructureRow` function shape (function insertStrategicInfrastructureRow().

 * Purpose: Supports maintainability by documenting why `insertStrategicInfrastructureRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function insertStrategicInfrastructureRow(
  h3Index: string,
  urbanHexCount: number,
  airportCount: number,
  seaportCount: number
): void {
  run(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, ?, ?, ?)`,
    [h3Index, urbanHexCount, airportCount, seaportCount]
  );
}

/**
 * Defines the `insertTacticalFeatureOverrideSeedRow` function shape (function insertTacticalFeatureOverrideSeedRow(row: ReturnType<typeof getTacticalFeatureRowsForSeeding>[number]): void).

 * Purpose: Supports maintainability by documenting why `insertTacticalFeatureOverrideSeedRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function insertTacticalFeatureOverrideSeedRow(row: ReturnType<typeof getTacticalFeatureRowsForSeeding>[number]): void {
  run(
    `INSERT INTO res_t_feature_overrides (
       h3_index, parent_h3_index, terrain_kind, is_urban, is_airport, is_seaport, is_rubble
     ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [row.h3Index, row.parentH3Index, row.terrainKind, row.isUrban ? 1 : 0, row.isAirport ? 1 : 0, row.isSeaport ? 1 : 0]
  );
}
