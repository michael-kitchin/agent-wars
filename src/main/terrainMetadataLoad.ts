/** Loads and validates terrain hex metadata envelopes from the Python metadata pipeline. */

import { getResolution } from 'h3-js';
import { readJsonFileOrThrow } from './jsonFileHelpers';
import { logDebug, logTrace } from './logger';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import { resolveTerrainStrategicMetadataPath, resolveTerrainTacticalMetadataPath } from './terrainMetadataPaths';
import { GLOBAL_GAME_MAP } from '../shared/activeGameMap';
import { isNonNullObject } from '../shared/objectGuards';
import { strategicH3Resolution, tacticalH3Resolution } from '../shared/h3Resolutions';

import {
  EXPECTED_HEX_METADATA_SCHEMA_VERSION,
  MAJOR_POINT_FEATURE_MAX_SCALERANK,
  TERRAIN_METADATA_COUNT_KEYS,
} from './terrainMetadataSchema';
import type {
  HexMetadataEnvelope,
  HexMetadataRecordStrategic,
  HexMetadataRecordTactical,
  ScalerankCountRow,
  UrbanByScalerankRow,
} from './terrainMetadataSchema';
export {
  DEFAULT_CLASSIFIER_THRESHOLDS,
  DEFAULT_NODATA_FALLBACK_TERRAIN,
  EXPECTED_HEX_METADATA_SCHEMA_VERSION,
  MAJOR_POINT_FEATURE_MAX_SCALERANK,
  METADATA_CHILD_RESOLUTION,
  METADATA_PARENT_RESOLUTION,
  TERRAIN_METADATA_COUNT_KEYS,
  URBAN_OVERLAY_MAX_SCALERANK,
} from './terrainMetadataSchema';
export type {
  ClassifierThresholds,
  HexMetadataEnvelope,
  HexMetadataRecordStrategic,
  HexMetadataRecordTactical,
  ScalerankCountRow,
  UrbanByScalerankRow,
} from './terrainMetadataSchema';


/**
 * Defines the `readNum` function shape (function readNum(r: Record<string, unknown>, key: string): number | null).

 * Purpose: Supports maintainability by documenting why `readNum` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readNum(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`terrain metadata: "${key}" must be a number or null`);
  }
  return v;
}

/**
 * Defines the `readBool` function shape (function readBool(r: Record<string, unknown>, key: string): boolean).

 * Purpose: Supports maintainability by documenting why `readBool` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readBool(r: Record<string, unknown>, key: string): boolean {
  const v = r[key];
  if (typeof v !== 'boolean') throw new Error(`terrain metadata: "${key}" must be a boolean`);
  return v;
}

/**
 * Defines the `readInt` function shape (function readInt(r: Record<string, unknown>, key: string): number).

 * Purpose: Supports maintainability by documenting why `readInt` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readInt(r: Record<string, unknown>, key: string): number {
  const v = r[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`terrain metadata: "${key}" must be an integer`);
  }
  return v;
}

/**
 * Defines the `readStr` function shape (function readStr(r: Record<string, unknown>, key: string): string).

 * Purpose: Supports maintainability by documenting why `readStr` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readStr(r: Record<string, unknown>, key: string): string {
  const v = r[key];
  if (typeof v !== 'string' || !v) throw new Error(`terrain metadata: "${key}" must be a non-empty string`);
  return v;
}

/**
 * Defines the `readOptionalIntNonNegative` function shape (function readOptionalIntNonNegative(r: Record<string, unknown>, key: string, defaultValue: number): number).

 * Purpose: Supports maintainability by documenting why `readOptionalIntNonNegative` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readOptionalIntNonNegative(r: Record<string, unknown>, key: string, defaultValue: number): number {
  const v = r[key];
  if (v === undefined || v === null) return defaultValue;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`terrain metadata: optional "${key}" must be a non-negative integer`);
  }
  return v;
}

/**
 * Defines the `readScalerankCountArray` function shape (function readScalerankCountArray(r: Record<string, unknown>, key: string): ScalerankCountRow[]).

 * Purpose: Supports maintainability by documenting why `readScalerankCountArray` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readScalerankCountArray(r: Record<string, unknown>, key: string): ScalerankCountRow[] {
  const v = r[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`terrain metadata: "${key}" must be an array`);
  const out: ScalerankCountRow[] = [];
  for (let i = 0; i < v.length; i++) {
    const el = v[i];
    if (!isNonNullObject(el)) throw new Error(`terrain metadata: ${key}[${i}] must be an object`);
    out.push({
      scalerank: readInt(el, 'scalerank'),
      count: readInt(el, 'count'),
    });
  }
  return out;
}

/**
 * Defines the `readUrbanByScalerankArray` function shape (function readUrbanByScalerankArray(r: Record<string, unknown>, key: string): UrbanByScalerankRow[]).

 * Purpose: Supports maintainability by documenting why `readUrbanByScalerankArray` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readUrbanByScalerankArray(r: Record<string, unknown>, key: string): UrbanByScalerankRow[] {
  const v = r[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`terrain metadata: "${key}" must be an array`);
  const out: UrbanByScalerankRow[] = [];
  for (let i = 0; i < v.length; i++) {
    const el = v[i];
    if (!isNonNullObject(el)) throw new Error(`terrain metadata: ${key}[${i}] must be an object`);
    out.push({
      scalerank: readInt(el, 'scalerank'),
      all_urban: readBool(el, 'all_urban'),
      intersects_urban: readBool(el, 'intersects_urban'),
      urban_edges: readInt(el, 'urban_edges'),
    });
  }
  return out;
}

/**
 * Defines the `recordHasMajorAirport` function shape (export function recordHasMajorAirport( r: Pick<HexMetadataRecordStrategic, 'airport_count_by_scalerank'>, maxRank = MAJOR_POINT_FEATURE_MAX_SCALERANK ): boole).

 * Purpose: Supports maintainability by documenting why `recordHasMajorAirport` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function recordHasMajorAirport(
  r: Pick<HexMetadataRecordStrategic, 'airport_count_by_scalerank'>,
  maxRank = MAJOR_POINT_FEATURE_MAX_SCALERANK
): boolean {
  for (const row of r.airport_count_by_scalerank) {
    if (row.count <= 0) continue;
    if (row.scalerank >= 0 && row.scalerank <= maxRank) return true;
  }
  return false;
}

/**
 * Defines the `recordHasMajorSeaport` function shape (export function recordHasMajorSeaport( r: Pick<HexMetadataRecordStrategic, 'seaport_count_by_scalerank'>, maxRank = MAJOR_POINT_FEATURE_MAX_SCALERANK ): boole).

 * Purpose: Supports maintainability by documenting why `recordHasMajorSeaport` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function recordHasMajorSeaport(
  r: Pick<HexMetadataRecordStrategic, 'seaport_count_by_scalerank'>,
  maxRank = GLOBAL_GAME_MAP.scaleranks.seaport
): boolean {
  for (const row of r.seaport_count_by_scalerank) {
    if (row.count <= 0) continue;
    if (row.scalerank >= 0 && row.scalerank <= maxRank) return true;
  }
  return false;
}

/**
 * Defines the `parseStrategicRow` function shape (function parseStrategicRow(raw: unknown, resolution: number): HexMetadataRecordStrategic).

 * Purpose: Supports maintainability by documenting why `parseStrategicRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseStrategicRow(raw: unknown, resolution: number): HexMetadataRecordStrategic {
  if (!isNonNullObject(raw)) throw new Error('terrain metadata: record must be an object');
  const h3Index = readStr(raw, 'h3_index');
  if (getResolution(h3Index) !== resolution) {
    throw new Error(`terrain metadata: h3_index ${h3Index} resolution != envelope ${resolution}`);
  }
  return {
    h3_index: h3Index,
    total_edges: readInt(raw, 'total_edges'),
    all_water: readBool(raw, 'all_water'),
    intersects_water: readBool(raw, 'intersects_water'),
    water_edges: readInt(raw, 'water_edges'),
    arctic_mean: readNum(raw, 'arctic_mean'),
    forest_mean: readNum(raw, 'forest_mean'),
    desert_mean: readNum(raw, 'desert_mean'),
    tri_mean: readNum(raw, 'tri_mean'),
    slope_mean: readNum(raw, 'slope_mean'),
    elevation_max: readNum(raw, 'elevation_max'),
    airport_count_total: readOptionalIntNonNegative(raw, TERRAIN_METADATA_COUNT_KEYS.airport_count_total, 0),
    airport_count_by_scalerank: readScalerankCountArray(raw, TERRAIN_METADATA_COUNT_KEYS.airport_count_by_scalerank),
    seaport_count_total: readOptionalIntNonNegative(raw, TERRAIN_METADATA_COUNT_KEYS.seaport_count_total, 0),
    seaport_count_by_scalerank: readScalerankCountArray(raw, TERRAIN_METADATA_COUNT_KEYS.seaport_count_by_scalerank),
  };
}

/**
 * Defines the `parseTacticalRow` function shape (function parseTacticalRow(raw: unknown, resolution: number): HexMetadataRecordTactical).

 * Purpose: Supports maintainability by documenting why `parseTacticalRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseTacticalRow(raw: unknown, resolution: number): HexMetadataRecordTactical {
  const base = parseStrategicRow(raw, resolution);
  if (!isNonNullObject(raw)) throw new Error('terrain metadata: record must be an object');
  return {
    ...base,
    all_urban: readBool(raw, 'all_urban'),
    intersects_urban: readBool(raw, 'intersects_urban'),
    urban_edges: readInt(raw, 'urban_edges'),
    urban_by_scalerank: readUrbanByScalerankArray(raw, 'urban_by_scalerank'),
  };
}

/**
 * Validates one terrain metadata envelope.
 *
 * Purpose: Strategic and tactical files share the envelope checks. The caller says which row shape to expect.
 * When to use: After a metadata file has been parsed as JSON.
 * Expected outcome: Records match `expectedResolution`. `tacticalRows` keeps urban fields. Otherwise rows stay strategic.
 * Exceptions: Throws when the schema, resolution, or a row is invalid.
 */
function parseMetadataEnvelope(raw: unknown, expectedResolution: number, tacticalRows: boolean): HexMetadataEnvelope {
  if (!isNonNullObject(raw)) throw new Error('terrain metadata: root must be an object');
  if (raw.schema_version !== EXPECTED_HEX_METADATA_SCHEMA_VERSION) {
    throw new Error(
      `terrain metadata: schema_version ${String(raw.schema_version)} != ${EXPECTED_HEX_METADATA_SCHEMA_VERSION}`
    );
  }
  const resolution = readInt(raw, 'resolution');
  if (resolution !== expectedResolution) {
    throw new Error(`terrain metadata: resolution ${resolution} != expected ${expectedResolution}`);
  }
  const recordCount = readInt(raw, 'record_count');
  const recs = raw.records;
  if (!Array.isArray(recs)) throw new Error('terrain metadata: records must be an array');
  if (recs.length !== recordCount) {
    throw new Error(`terrain metadata: record_count ${recordCount} != len(records) ${recs.length}`);
  }
  const parseRow = tacticalRows
    ? (r: unknown) => parseTacticalRow(r, expectedResolution)
    : (r: unknown) => parseStrategicRow(r, expectedResolution);
  const records = recs.map((r, i) => {
    try {
      return parseRow(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`terrain metadata: records[${i}]: ${msg}`);
    }
  }) as HexMetadataRecordStrategic[] | HexMetadataRecordTactical[];
  const seen = new Set<string>();
  for (const row of records) {
    if (seen.has(row.h3_index)) throw new Error(`terrain metadata: duplicate h3_index ${row.h3_index}`);
    seen.add(row.h3_index);
  }
  return {
    schema_version: String(raw.schema_version),
    resolution,
    record_count: recordCount,
    records,
  };
}

/**
 * Loads and validates a strategic terrain metadata JSON file.
 *
 * Purpose: Entry point for the strategic terrain pack on disk.
 * When to use: Bundled load and any caller that already has an absolute metadata path.
 * Expected outcome: Parsed envelope at resolution 1.
 * Exceptions: Rethrows read and parse failures. Throws when the envelope fails validation.
 */
export function loadTerrainStrategicMetadataFromPath(absPath: string): HexMetadataEnvelope {
  logDebug('terrainMetadataLoad loadTerrainRes1MetadataFromPath', { absPath });
  const parsed = readJsonFileOrThrow(absPath, 'terrainMetadataLoad loadTerrainRes1MetadataFromPath');
  return parseMetadataEnvelope(parsed, strategicH3Resolution(), false);
}

/**
 * Loads one terrain metadata file at a caller-chosen resolution.
 *
 * Purpose: A new-game preview must read a map that is not the active match. The bundled loaders validate against the active resolution.
 * When to use: Preview grid builds. Match seeding keeps the bundled loaders.
 * Expected outcome: The envelope's resolution is `resolution`. Tactical files pass `tacticalRows` true so urban fields are kept.
 * Exceptions: Rethrows read and parse failures. Throws when the envelope fails validation.
 */
export function loadTerrainMetadataFromPath(absPath: string, resolution: number, tacticalRows: boolean): HexMetadataEnvelope {
  logDebug('terrainMetadataLoad loadTerrainMetadataFromPath', { absPath, resolution, tacticalRows });
  const parsed = readJsonFileOrThrow(absPath, 'terrainMetadataLoad loadTerrainMetadataFromPath');
  return parseMetadataEnvelope(parsed, resolution, tacticalRows);
}

/**
 * Loads and validates a tactical terrain metadata JSON file.
 *
 * Purpose: Entry point for the tactical terrain pack on disk.
 * When to use: Bundled load and any caller that already has an absolute metadata path.
 * Expected outcome: Parsed envelope at resolution 4.
 * Exceptions: Rethrows read and parse failures. Throws when the envelope fails validation.
 */
export function loadTerrainTacticalMetadataFromPath(absPath: string): HexMetadataEnvelope {
  logDebug('terrainMetadataLoad loadTerrainRes4MetadataFromPath', { absPath });
  const parsed = readJsonFileOrThrow(absPath, 'terrainMetadataLoad loadTerrainRes4MetadataFromPath');
  return parseMetadataEnvelope(parsed, tacticalH3Resolution(), true);
}

/**
 * Defines the `loadTerrainStrategicMetadataBundled` function shape (export function loadTerrainStrategicMetadataBundled(): HexMetadataEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainStrategicMetadataBundled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainStrategicMetadataBundled(): HexMetadataEnvelope {
  logTrace('terrainMetadataLoad loadTerrainRes1MetadataBundled');
  return loadTerrainStrategicMetadataFromPath(resolveTerrainStrategicMetadataPath());
}

/**
 * Defines the `loadTerrainTacticalMetadataBundled` function shape (export function loadTerrainTacticalMetadataBundled(): HexMetadataEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainTacticalMetadataBundled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainTacticalMetadataBundled(): HexMetadataEnvelope {
  logTrace('terrainMetadataLoad loadTerrainRes4MetadataBundled');
  return loadTerrainTacticalMetadataFromPath(resolveTerrainTacticalMetadataPath());
}

/**
 * Defines the `assertTerrainMetadataMatchesHexList` function shape (export function assertTerrainMetadataMatchesHexList().

 * Purpose: Supports maintainability by documenting why `assertTerrainMetadataMatchesHexList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function assertTerrainMetadataMatchesHexList(
  byH3: ReadonlyMap<string, PipelineTerrainKind>,
  expectedHexes: readonly string[]
): void {
  logTrace('terrainMetadataLoad assertTerrainMetadataMatchesHexList', { expectedCount: expectedHexes.length });
  if (byH3.size !== expectedHexes.length) {
    throw new Error(`terrain metadata classified count ${byH3.size} !== expected hex count ${expectedHexes.length}`);
  }
  for (const h of expectedHexes) {
    if (!byH3.has(h)) {
      throw new Error(`terrain metadata missing h3_index ${h}`);
    }
  }
}

