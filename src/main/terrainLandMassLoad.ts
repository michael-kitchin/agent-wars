/** Loads and validates res-1 land-mass JSON from the Python landmass pipeline. */

import * as fs from 'fs';
import { logDebug, logError, logTrace } from './logger';
import type { Res1LandMassRecord } from '../shared/landTraversalRes1';
import { resolveTerrainRes1LandMassPath } from './terrainMetadataPaths';

/**
 * Documents the module-scope binding `EXPECTED_LANDMASS_SCHEMA_VERSION` (EXPECTED_LANDMASS_SCHEMA_VERSION).

 * Purpose: Supports maintainability by documenting why `EXPECTED_LANDMASS_SCHEMA_VERSION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const EXPECTED_LANDMASS_SCHEMA_VERSION = '2.0.0';

/**
 * Documents the `LandMassPolygonSource` interface as a named contract surface (export interface LandMassPolygonSource).

 * Purpose: Describes provenance for continent/island polygon membership in v2 landmass JSON.
 * When to use: QA tooling and loader DEBUG logs after parsing v2 envelopes.
 * Expected outcome: Stable fields mirroring Python export metadata.
 * Exceptions: None.
 */
export interface LandMassPolygonSource {
  shapefile: string;
  continent_featurecla: readonly string[];
  island_featurecla: string;
  id_property: string;
  island_min_area_km2: number;
}

/**
 * Documents the `LandMassWaterPctSource` interface as a named contract surface (export interface LandMassWaterPctSource).

 * Purpose: Describes how res1 ``water_pct`` was derived in v2 landmass JSON.
 * When to use: Loader DEBUG logs and pipeline documentation cross-checks.
 * Expected outcome: Names res4 metadata dependency and aggregation method.
 * Exceptions: None.
 */
export interface LandMassWaterPctSource {
  method: string;
  requires: readonly string[];
}

/**
 * Documents the `Res1LandMassEnvelope` interface as a named contract surface (export interface Res1LandMassEnvelope).

 * Purpose: Supports maintainability by documenting why `Res1LandMassEnvelope` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface Res1LandMassEnvelope {
    /**
   * Specifies the contract for the `schema_version` member (schema_version: string;).

   * Contract: Describes stable behavior for callers of `schema_version` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
schema_version: string;
    /**
   * Specifies the contract for the `resolution` member (resolution: number;).

   * Contract: Describes stable behavior for callers of `resolution` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resolution: number;
  /**
   * Specifies the contract for the `generated_at_utc` member (generated_at_utc: string;).

   * Contract: Describes stable behavior for callers of `generated_at_utc` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
generated_at_utc: string;
  /**
   * Specifies the contract for the `polygon_source` member (polygon_source?: LandMassPolygonSource;).

   * Contract: Optional v2 provenance for geography region polygon membership.
   * When to use: After schema 2.0.0 landmass regeneration.
   * Expected outcome: Present on bundled production JSON; absent only in minimal test fixtures.
   * Exceptions: None.
   */
polygon_source?: LandMassPolygonSource;
  /**
   * Specifies the contract for the `water_pct_source` member (water_pct_source?: LandMassWaterPctSource;).

   * Contract: Optional v2 provenance for res4-derived water fraction.
   * When to use: After schema 2.0.0 landmass regeneration.
   * Expected outcome: Documents res4 metadata dependency for ``water_pct``.
   * Exceptions: None.
   */
water_pct_source?: LandMassWaterPctSource;
  /**
   * Specifies the contract for the `island_min_area_km2` member (island_min_area_km2: number;).

   * Contract: Legacy v1 root field; v2 stores the value under ``polygon_source``.
   * When to use: Prefer ``polygon_source.island_min_area_km2`` when present.
   * Expected outcome: Non-negative island filter km² used during export.
   * Exceptions: None.
   */
island_min_area_km2: number;
    /**
   * Specifies the contract for the `record_count` member (record_count: number;).

   * Contract: Describes stable behavior for callers of `record_count` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
record_count: number;
    /**
   * Specifies the contract for the `records` member (records: Res1LandMassJsonRecord[];).

   * Contract: Describes stable behavior for callers of `records` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
records: Res1LandMassJsonRecord[];
}

/**
 * Documents the `Res1LandMassJsonRecord` interface as a named contract surface (export interface Res1LandMassJsonRecord).

 * Purpose: Supports maintainability by documenting why `Res1LandMassJsonRecord` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface Res1LandMassJsonRecord {
    /**
   * Specifies the contract for the `h3_index` member (h3_index: string;).

   * Contract: Describes stable behavior for callers of `h3_index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3_index: string;
    /**
   * Specifies the contract for the `water_pct` member (water_pct: number;).

   * Contract: Describes stable behavior for callers of `water_pct` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
water_pct: number;
    /**
   * Specifies the contract for the `continent_ids` member (continent_ids: number[];).

   * Contract: Describes stable behavior for callers of `continent_ids` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
continent_ids: number[];
    /**
   * Specifies the contract for the `island_ids` member (island_ids: number[];).

   * Contract: Describes stable behavior for callers of `island_ids` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
island_ids: number[];
}

/**
 * Defines the `parseRes1LandMassEnvelope` function shape (export function parseRes1LandMassEnvelope(parsed: unknown): Res1LandMassEnvelope).

 * Purpose: Supports maintainability by documenting why `parseRes1LandMassEnvelope` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseRes1LandMassEnvelope(parsed: unknown): Res1LandMassEnvelope {
  logTrace('terrainLandMassLoad parseRes1LandMassEnvelope');
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('landmass JSON: expected object envelope');
  }
  const env = parsed as Record<string, unknown>;
  const schemaVersion = env.schema_version;
  if (schemaVersion !== EXPECTED_LANDMASS_SCHEMA_VERSION) {
    throw new Error(
      `landmass JSON: schema_version ${String(schemaVersion)} != expected ${EXPECTED_LANDMASS_SCHEMA_VERSION}`
    );
  }
  const polygonSource = parsePolygonSource(env.polygon_source);
  const waterPctSource = parseWaterPctSource(env.water_pct_source);
  if (polygonSource) {
    logDebug('terrainLandMassLoad parseRes1LandMassEnvelope: polygon_source', polygonSource);
  }
  if (waterPctSource) {
    logDebug('terrainLandMassLoad parseRes1LandMassEnvelope: water_pct_source', waterPctSource);
  }
  const resolution = env.resolution;
  if (resolution !== 1) {
    throw new Error(`landmass JSON: resolution ${String(resolution)} != expected 1`);
  }
  const recordsRaw = env.records;
  if (!Array.isArray(recordsRaw)) {
    throw new Error('landmass JSON: records must be an array');
  }
  const recordCount = env.record_count;
  if (typeof recordCount !== 'number' || recordCount !== recordsRaw.length) {
    throw new Error(
      `landmass JSON: record_count ${String(recordCount)} !== records.length ${recordsRaw.length}`
    );
  }

  const records: Res1LandMassJsonRecord[] = [];
  const seenH3 = new Set<string>();
  for (const row of recordsRaw) {
    if (!row || typeof row !== 'object') {
      throw new Error('landmass JSON: each record must be an object');
    }
    const r = row as Record<string, unknown>;
    const h3Index = r.h3_index;
    if (typeof h3Index !== 'string' || h3Index.length === 0) {
      throw new Error('landmass JSON: h3_index must be a non-empty string');
    }
    if (seenH3.has(h3Index)) {
      throw new Error(`landmass JSON: duplicate h3_index ${h3Index}`);
    }
    seenH3.add(h3Index);
    const waterPct = r.water_pct;
    if (typeof waterPct !== 'number' || waterPct < 0 || waterPct > 100) {
      throw new Error(`landmass JSON: water_pct out of range for ${h3Index}`);
    }
    const continentIds = r.continent_ids;
    const islandIds = r.island_ids;
    if (!Array.isArray(continentIds) || !Array.isArray(islandIds)) {
      throw new Error(`landmass JSON: continent_ids and island_ids must be arrays for ${h3Index}`);
    }
    records.push({
      h3_index: h3Index,
      water_pct: waterPct,
      continent_ids: continentIds.map((id) => {
        if (typeof id !== 'number') throw new Error(`landmass JSON: invalid continent id for ${h3Index}`);
        return id;
      }),
      island_ids: islandIds.map((id) => {
        if (typeof id !== 'number') throw new Error(`landmass JSON: invalid island id for ${h3Index}`);
        return id;
      }),
    });
  }

  return {
    schema_version: EXPECTED_LANDMASS_SCHEMA_VERSION,
    resolution: 1,
    generated_at_utc: String(env.generated_at_utc ?? ''),
    polygon_source: polygonSource,
    water_pct_source: waterPctSource,
    island_min_area_km2: resolveIslandMinAreaKm2(env),
    record_count: records.length,
    records,
  };
}

/**
 * Parses optional v2 polygon provenance from a landmass envelope object.
 *
 * Purpose: Surface geography-region export metadata to callers without failing on absent fields.
 * When to use: Inside ``parseRes1LandMassEnvelope`` after schema version check.
 * Expected outcome: Undefined when missing or malformed; structured object when valid.
 * Exceptions: None.
 */
function parsePolygonSource(raw: unknown): LandMassPolygonSource | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const shapefile = src.shapefile;
  const continentFeaturecla = src.continent_featurecla;
  const islandFeaturecla = src.island_featurecla;
  const idProperty = src.id_property;
  const islandMinArea = src.island_min_area_km2;
  if (
    typeof shapefile !== 'string' ||
    !Array.isArray(continentFeaturecla) ||
    typeof islandFeaturecla !== 'string' ||
    typeof idProperty !== 'string' ||
    typeof islandMinArea !== 'number'
  ) {
    return undefined;
  }
  return {
    shapefile,
    continent_featurecla: continentFeaturecla.map(String),
    island_featurecla: islandFeaturecla,
    id_property: idProperty,
    island_min_area_km2: islandMinArea,
  };
}

/**
 * Parses optional v2 water-percent provenance from a landmass envelope object.
 *
 * Purpose: Document res4 metadata sourcing for ``water_pct`` in loader diagnostics.
 * When to use: Inside ``parseRes1LandMassEnvelope`` after schema version check.
 * Expected outcome: Undefined when missing or malformed; structured object when valid.
 * Exceptions: None.
 */
function parseWaterPctSource(raw: unknown): LandMassWaterPctSource | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const method = src.method;
  const requires = src.requires;
  if (typeof method !== 'string' || !Array.isArray(requires)) return undefined;
  return { method, requires: requires.map(String) };
}

/**
 * Resolves island minimum area from v2 ``polygon_source`` or legacy v1 root field.
 *
 * Purpose: Keep loader compatible while envelope layout moves under ``polygon_source``.
 * When to use: Building ``Res1LandMassEnvelope`` from parsed JSON.
 * Expected outcome: Numeric km² threshold; zero when neither source is present.
 * Exceptions: None.
 */
function resolveIslandMinAreaKm2(env: Record<string, unknown>): number {
  const polygonSource = parsePolygonSource(env.polygon_source);
  if (polygonSource) return polygonSource.island_min_area_km2;
  return Number(env.island_min_area_km2 ?? 0);
}

/**
 * Defines the `buildRes1LandMassByH3` function shape (export function buildRes1LandMassByH3(envelope: Res1LandMassEnvelope): Map<string, Res1LandMassRecord>).

 * Purpose: Supports maintainability by documenting why `buildRes1LandMassByH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildRes1LandMassByH3(envelope: Res1LandMassEnvelope): Map<string, Res1LandMassRecord> {
  logDebug('terrainLandMassLoad buildRes1LandMassByH3', { recordCount: envelope.record_count });
  const out = new Map<string, Res1LandMassRecord>();
  for (const row of envelope.records) {
    out.set(row.h3_index, {
      h3Index: row.h3_index,
      waterPct: row.water_pct,
      continentIds: row.continent_ids,
      islandIds: row.island_ids,
    });
  }
  return out;
}

/**
 * Defines the `loadTerrainRes1LandMassFromPath` function shape (export function loadTerrainRes1LandMassFromPath(absPath: string): Res1LandMassEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes1LandMassFromPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes1LandMassFromPath(absPath: string): Res1LandMassEnvelope {
  logDebug('terrainLandMassLoad loadTerrainRes1LandMassFromPath', { absPath });
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError('terrainLandMassLoad loadTerrainRes1LandMassFromPath: read/parse failed', err);
    throw err;
  }
  return parseRes1LandMassEnvelope(parsed);
}

/**
 * Defines the `loadTerrainRes1LandMassBundled` function shape (export function loadTerrainRes1LandMassBundled(): Res1LandMassEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes1LandMassBundled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes1LandMassBundled(): Res1LandMassEnvelope {
  logTrace('terrainLandMassLoad loadTerrainRes1LandMassBundled');
  return loadTerrainRes1LandMassFromPath(resolveTerrainRes1LandMassPath());
}

/**
 * Defines the `assertLandMassMatchesHexList` function shape (export function assertLandMassMatchesHexList().

 * Purpose: Supports maintainability by documenting why `assertLandMassMatchesHexList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function assertLandMassMatchesHexList(
  byH3: ReadonlyMap<string, Res1LandMassRecord>,
  expectedHexes: readonly string[]
): void {
  logTrace('terrainLandMassLoad assertLandMassMatchesHexList', { expectedCount: expectedHexes.length });
  if (byH3.size !== expectedHexes.length) {
    throw new Error(`landmass record count ${byH3.size} !== expected hex count ${expectedHexes.length}`);
  }
  for (const h of expectedHexes) {
    if (!byH3.has(h)) {
      throw new Error(`landmass JSON missing h3_index ${h}`);
    }
  }
}
