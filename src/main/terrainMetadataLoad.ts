/** Loads and validates terrain hex metadata envelopes from the Python metadata pipeline. */

import * as fs from 'fs';
import { getResolution } from 'h3-js';
import { logDebug, logError, logTrace } from './logger';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import { resolveTerrainRes1MetadataPath, resolveTerrainRes4MetadataPath } from './terrainMetadataPaths';

export const EXPECTED_HEX_METADATA_SCHEMA_VERSION = '2.0.0';

/** Thresholds mirrored from `ClassifierThresholds` in Python. */
export interface ClassifierThresholds {
  arctic_dominant_min: number;
  forest_dominant_min: number;
  desert_barren_min: number;
  mountain_tri_mean_min: number;
  mountain_slope_mean_min: number;
  mountain_elevation_max_min: number;
}

/** Default classifier thresholds mirrored from Python `ClassifierThresholds` defaults. */
export const DEFAULT_CLASSIFIER_THRESHOLDS: Readonly<ClassifierThresholds> = {
  arctic_dominant_min: 26,
  forest_dominant_min: 38,
  desert_barren_min: 28,
  mountain_tri_mean_min: 24,
  mountain_slope_mean_min: 5,
  mountain_elevation_max_min: 700,
};

/** Product-fixed fallback when a cell has no valid land-cover aggregates. */
export const DEFAULT_NODATA_FALLBACK_TERRAIN: PipelineTerrainKind = 'water';

/** Metadata exporter always writes these two resolutions. */
export const METADATA_PARENT_RESOLUTION = 1;
export const METADATA_CHILD_RESOLUTION = 4;

/** One airport/port bucket in exported JSON (`airport_count_by_scalerank` / `port_count_by_scalerank`). */
export interface ScalerankCountRow {
  scalerank: number;
  count: number;
}

/** Urban mask metrics by scalerank in exported res-4 JSON (`urban_by_scalerank`). */
export interface UrbanByScalerankRow {
  scalerank: number;
  all_urban: boolean;
  intersects_urban: boolean;
  urban_edges: number;
}

/**
 * Natural Earth scalerank for airports/ports: values 0–5 (inclusive) are treated as “major” for map overlays.
 * Invalid / unknown ranks use sentinel -1 in the pipeline and are ignored for this gate.
 */
export const MAJOR_POINT_FEATURE_MAX_SCALERANK = 5;

/** Natural Earth scalerank cutoff for urban overlays from `urban_by_scalerank`. */
export const URBAN_OVERLAY_MAX_SCALERANK = 5;

export interface HexMetadataRecordRes1 {
  h3_index: string;
  total_edges: number;
  all_water: boolean;
  intersects_water: boolean;
  water_edges: number;
  arctic_mean: number | null;
  forest_mean: number | null;
  desert_mean: number | null;
  tri_mean: number | null;
  slope_mean: number | null;
  elevation_max: number | null;
  airport_count_total: number;
  airport_count_by_scalerank: ScalerankCountRow[];
  port_count_total: number;
  port_count_by_scalerank: ScalerankCountRow[];
}

export interface HexMetadataRecordRes4 extends HexMetadataRecordRes1 {
  all_urban: boolean;
  intersects_urban: boolean;
  urban_edges: number;
  urban_by_scalerank: UrbanByScalerankRow[];
}

export interface HexMetadataEnvelope {
  schema_version: string;
  resolution: number;
  record_count: number;
  records: HexMetadataRecordRes1[] | HexMetadataRecordRes4[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function readNum(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`terrain metadata: "${key}" must be a number or null`);
  }
  return v;
}

function readBool(r: Record<string, unknown>, key: string): boolean {
  const v = r[key];
  if (typeof v !== 'boolean') throw new Error(`terrain metadata: "${key}" must be a boolean`);
  return v;
}

function readInt(r: Record<string, unknown>, key: string): number {
  const v = r[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`terrain metadata: "${key}" must be an integer`);
  }
  return v;
}

function readStr(r: Record<string, unknown>, key: string): string {
  const v = r[key];
  if (typeof v !== 'string' || !v) throw new Error(`terrain metadata: "${key}" must be a non-empty string`);
  return v;
}

function readOptionalIntNonNegative(r: Record<string, unknown>, key: string, defaultValue: number): number {
  const v = r[key];
  if (v === undefined || v === null) return defaultValue;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`terrain metadata: optional "${key}" must be a non-negative integer`);
  }
  return v;
}

function readScalerankCountArray(r: Record<string, unknown>, key: string): ScalerankCountRow[] {
  const v = r[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`terrain metadata: "${key}" must be an array`);
  const out: ScalerankCountRow[] = [];
  for (let i = 0; i < v.length; i++) {
    const el = v[i];
    if (!isRecord(el)) throw new Error(`terrain metadata: ${key}[${i}] must be an object`);
    out.push({
      scalerank: readInt(el, 'scalerank'),
      count: readInt(el, 'count'),
    });
  }
  return out;
}

function readUrbanByScalerankArray(r: Record<string, unknown>, key: string): UrbanByScalerankRow[] {
  const v = r[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`terrain metadata: "${key}" must be an array`);
  const out: UrbanByScalerankRow[] = [];
  for (let i = 0; i < v.length; i++) {
    const el = v[i];
    if (!isRecord(el)) throw new Error(`terrain metadata: ${key}[${i}] must be an object`);
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
 * Why this exists:
 *     Gate renderer airport glyph on pipeline metadata (major hubs by scalerank).
 * When to use:
 *     When building infrastructure hint sets from a parsed res-1/res-4 row.
 * What to expect:
 *     True when any bucket has scalerank in [0, maxRank] with positive count; negative ranks are ignored.
 */
export function recordHasMajorAirport(
  r: Pick<HexMetadataRecordRes1, 'airport_count_by_scalerank'>,
  maxRank = MAJOR_POINT_FEATURE_MAX_SCALERANK
): boolean {
  for (const row of r.airport_count_by_scalerank) {
    if (row.count <= 0) continue;
    if (row.scalerank >= 0 && row.scalerank <= maxRank) return true;
  }
  return false;
}

/**
 * Why this exists:
 *     Gate renderer port glyph on pipeline metadata (major ports by scalerank).
 * When to use:
 *     Same as `recordHasMajorAirport` for port buckets.
 * What to expect:
 *     True when any qualifying bucket has a positive count.
 */
export function recordHasMajorPort(
  r: Pick<HexMetadataRecordRes1, 'port_count_by_scalerank'>,
  maxRank = MAJOR_POINT_FEATURE_MAX_SCALERANK
): boolean {
  for (const row of r.port_count_by_scalerank) {
    if (row.count <= 0) continue;
    if (row.scalerank >= 0 && row.scalerank <= maxRank) return true;
  }
  return false;
}

function parseRes1Row(raw: unknown, resolution: number): HexMetadataRecordRes1 {
  if (!isRecord(raw)) throw new Error('terrain metadata: record must be an object');
  const h3_index = readStr(raw, 'h3_index');
  if (getResolution(h3_index) !== resolution) {
    throw new Error(`terrain metadata: h3_index ${h3_index} resolution != envelope ${resolution}`);
  }
  return {
    h3_index,
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
    airport_count_total: readOptionalIntNonNegative(raw, 'airport_count_total', 0),
    airport_count_by_scalerank: readScalerankCountArray(raw, 'airport_count_by_scalerank'),
    port_count_total: readOptionalIntNonNegative(raw, 'port_count_total', 0),
    port_count_by_scalerank: readScalerankCountArray(raw, 'port_count_by_scalerank'),
  };
}

function parseRes4Row(raw: unknown, resolution: number): HexMetadataRecordRes4 {
  const base = parseRes1Row(raw, resolution);
  if (!isRecord(raw)) throw new Error('terrain metadata: record must be an object');
  return {
    ...base,
    all_urban: readBool(raw, 'all_urban'),
    intersects_urban: readBool(raw, 'intersects_urban'),
    urban_edges: readInt(raw, 'urban_edges'),
    urban_by_scalerank: readUrbanByScalerankArray(raw, 'urban_by_scalerank'),
  };
}

function parseMetadataEnvelope(raw: unknown, expectedResolution: number): HexMetadataEnvelope {
  if (!isRecord(raw)) throw new Error('terrain metadata: root must be an object');
  if (raw.schema_version !== EXPECTED_HEX_METADATA_SCHEMA_VERSION) {
    throw new Error(
      `terrain metadata: schema_version ${String(raw.schema_version)} != ${EXPECTED_HEX_METADATA_SCHEMA_VERSION}`
    );
  }
  const resolution = readInt(raw, 'resolution');
  if (resolution !== expectedResolution) {
    throw new Error(`terrain metadata: resolution ${resolution} != expected ${expectedResolution}`);
  }
  const record_count = readInt(raw, 'record_count');
  const recs = raw.records;
  if (!Array.isArray(recs)) throw new Error('terrain metadata: records must be an array');
  if (recs.length !== record_count) {
    throw new Error(`terrain metadata: record_count ${record_count} != len(records) ${recs.length}`);
  }
  const parseRow =
    expectedResolution === 4 ? (r: unknown) => parseRes4Row(r, 4) : (r: unknown) => parseRes1Row(r, 1);
  const records = recs.map((r, i) => {
    try {
      return parseRow(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`terrain metadata: records[${i}]: ${msg}`);
    }
  }) as HexMetadataRecordRes1[] | HexMetadataRecordRes4[];
  const seen = new Set<string>();
  for (const row of records) {
    if (seen.has(row.h3_index)) throw new Error(`terrain metadata: duplicate h3_index ${row.h3_index}`);
    seen.add(row.h3_index);
  }
  return {
    schema_version: String(raw.schema_version),
    resolution,
    record_count,
    records,
  };
}

/**
 * Why this exists:
 *     Load res-1 hex metadata from disk with strict validation for seeding the game DB.
 * When to use:
 *     Terrain cache build.
 * What to expect:
 *     Throws on invalid JSON, schema mismatch, or H3 / field contract violations.
 */
export function loadTerrainRes1MetadataFromPath(absPath: string): HexMetadataEnvelope {
  logDebug('terrainMetadataLoad loadTerrainRes1MetadataFromPath', { absPath });
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError('terrainMetadataLoad loadTerrainRes1MetadataFromPath: read/parse failed', err);
    throw err;
  }
  return parseMetadataEnvelope(parsed, 1);
}

/**
 * Why this exists:
 *     Load res-4 hex metadata from disk for renderer override classification.
 * When to use:
 *     Terrain cache build.
 * What to expect:
 *     Throws on invalid JSON or res-4 record shape violations.
 */
export function loadTerrainRes4MetadataFromPath(absPath: string): HexMetadataEnvelope {
  logDebug('terrainMetadataLoad loadTerrainRes4MetadataFromPath', { absPath });
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError('terrainMetadataLoad loadTerrainRes4MetadataFromPath: read/parse failed', err);
    throw err;
  }
  return parseMetadataEnvelope(parsed, 4);
}

/**
 * Why this exists:
 *     Load bundled res-1 metadata using standard path resolution.
 * When to use:
 *     Terrain cache and parity tests.
 * What to expect:
 *     Same as `loadTerrainRes1MetadataFromPath`.
 */
export function loadTerrainRes1MetadataBundled(): HexMetadataEnvelope {
  logTrace('terrainMetadataLoad loadTerrainRes1MetadataBundled');
  return loadTerrainRes1MetadataFromPath(resolveTerrainRes1MetadataPath());
}

/**
 * Why this exists:
 *     Load bundled res-4 metadata using standard path resolution.
 * When to use:
 *     Terrain cache build.
 * What to expect:
 *     Same as `loadTerrainRes4MetadataFromPath`.
 */
export function loadTerrainRes4MetadataBundled(): HexMetadataEnvelope {
  logTrace('terrainMetadataLoad loadTerrainRes4MetadataBundled');
  return loadTerrainRes4MetadataFromPath(resolveTerrainRes4MetadataPath());
}

/**
 * Why this exists:
 *     Ensure the res-1 metadata row set matches the canonical world hex list before DB seeding.
 * When to use:
 *     After loading metadata and before inserting `hexes` rows.
 * What to expect:
 *     Throws when counts differ or any expected hex is missing from the metadata map.
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
