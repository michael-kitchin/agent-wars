/** Loads and validates res-1 land-mass JSON from the Python landmass pipeline. */

import { readJsonFileOrThrow } from './jsonFileHelpers';
import { logDebug, logTrace } from './logger';
import { strategicH3Resolution } from '../shared/h3Resolutions';
import type { StrategicLandMassRecord } from '../shared/landTraversalStrategic';
import { resolveTerrainStrategicLandMassPath } from './terrainMetadataPaths';

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
  /**
   * Natural Earth shapefile path used to derive continent and island membership.
   *
   * Contract: Mirrors Python export metadata for audit trails.
   * When to use: Loader DEBUG logs and pipeline QA cross-checks.
   * Expected outcome: Non-empty relative or absolute path string from v2 landmass JSON.
   * Exceptions: None.
   */
  shapefile: string;
  /**
   * ``featurecla`` values treated as continents when building polygon membership.
   *
   * Contract: Read-only list of Natural Earth feature class names.
   * When to use: Validating v2 envelope provenance or reproducing pipeline filters.
   * Expected outcome: Includes ``Continent`` and related classes used by the Python exporter.
   * Exceptions: None.
   */
  continent_featurecla: readonly string[];
  /**
   * ``featurecla`` value used for island polygon membership.
   *
   * Contract: Single Natural Earth feature class name for islands.
   * When to use: Validating v2 envelope provenance against Python export settings.
   * Expected outcome: Typically ``Island`` or the pipeline's configured island class.
   * Exceptions: None.
   */
  island_featurecla: string;
  /**
   * Property name on Natural Earth features used as stable numeric ids.
   *
   * Contract: Names the id column joined into strategic landmass records.
   * When to use: Cross-referencing ``continentIds`` / ``islandIds`` with source GIS data.
   * Expected outcome: ``NE_ID`` for production v2 exports.
   * Exceptions: None.
   */
  id_property: string;
  /**
   * Minimum island polygon area in km² included in membership.
   *
   * Contract: Mirrors Python ``island_min_area_km2`` filter threshold.
   * When to use: Explaining why small islands are absent from a hex's ``islandIds``.
   * Expected outcome: Positive number consistent with bundled v2 JSON metadata.
   * Exceptions: None.
   */
  island_min_area_km2: number;
}

/**
 * Documents the `LandMassWaterPctSource` interface as a named contract surface (export interface LandMassWaterPctSource).

 * Purpose: Describes how strategic ``water_pct`` was derived in v2 landmass JSON.
 * When to use: Loader DEBUG logs and pipeline documentation cross-checks.
 * Expected outcome: Names tactical metadata dependency and aggregation method.
 * Exceptions: None.
 */
export interface LandMassWaterPctSource {
  /**
   * Aggregation method used to derive strategic ``water_pct`` from tactical child cells.
   *
   * Contract: Names the Python reducer applied across tactical metadata.
   * When to use: Loader DEBUG logs and landmass pipeline documentation.
   * Expected outcome: Stable method label matching v2 export metadata.
   * Exceptions: None.
   */
  method: string;
  /**
   * Input artifacts required before ``water_pct`` can be computed.
   *
   * Contract: Read-only list of generated data file names or logical dependencies.
   * When to use: Verifying regeneration order for v2 landmass exports.
   * Expected outcome: Includes tactical terrain metadata paths used by the Python pipeline.
   * Exceptions: None.
   */
  requires: readonly string[];
}

/**
 * Documents the `StrategicLandMassEnvelope` interface as a named contract surface (export interface StrategicLandMassEnvelope).

 * Purpose: Supports maintainability by documenting why `StrategicLandMassEnvelope` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface StrategicLandMassEnvelope {
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

   * Contract: Optional v2 provenance for tactical-derived water fraction.
   * When to use: After schema 2.0.0 landmass regeneration.
   * Expected outcome: Documents tactical metadata dependency for ``water_pct``.
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
   * Specifies the contract for the `records` member (records: StrategicLandMassJsonRecord[];).

   * Contract: Describes stable behavior for callers of `records` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
records: StrategicLandMassJsonRecord[];
}

/**
 * Documents the `StrategicLandMassJsonRecord` interface as a named contract surface (export interface StrategicLandMassJsonRecord).

 * Purpose: Supports maintainability by documenting why `StrategicLandMassJsonRecord` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface StrategicLandMassJsonRecord {
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
 * Defines the `parseStrategicLandMassEnvelope` function shape (export function parseStrategicLandMassEnvelope(parsed: unknown): StrategicLandMassEnvelope).

 * Purpose: Supports maintainability by documenting why `parseStrategicLandMassEnvelope` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseStrategicLandMassEnvelope(parsed: unknown): StrategicLandMassEnvelope {
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
  const expectedResolution = strategicH3Resolution();
  if (resolution !== expectedResolution) {
    throw new Error(`landmass JSON: resolution ${String(resolution)} != expected ${expectedResolution}`);
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

  const records: StrategicLandMassJsonRecord[] = [];
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
    resolution: expectedResolution,
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
 * When to use: Inside ``parseStrategicLandMassEnvelope`` after schema version check.
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
 * Purpose: Document tactical metadata sourcing for ``water_pct`` in loader diagnostics.
 * When to use: Inside ``parseStrategicLandMassEnvelope`` after schema version check.
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
 * When to use: Building ``StrategicLandMassEnvelope`` from parsed JSON.
 * Expected outcome: Numeric km² threshold; zero when neither source is present.
 * Exceptions: None.
 */
function resolveIslandMinAreaKm2(env: Record<string, unknown>): number {
  const polygonSource = parsePolygonSource(env.polygon_source);
  if (polygonSource) return polygonSource.island_min_area_km2;
  return Number(env.island_min_area_km2 ?? 0);
}

/**
 * Defines the `buildStrategicLandMassByH3` function shape (export function buildStrategicLandMassByH3(envelope: StrategicLandMassEnvelope): Map<string, StrategicLandMassRecord>).

 * Purpose: Supports maintainability by documenting why `buildStrategicLandMassByH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildStrategicLandMassByH3(envelope: StrategicLandMassEnvelope): Map<string, StrategicLandMassRecord> {
  logDebug('terrainLandMassLoad buildRes1LandMassByH3', { recordCount: envelope.record_count });
  const out = new Map<string, StrategicLandMassRecord>();
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
 * Loads and validates a strategic land-mass JSON file.
 *
 * Purpose: Entry point for strategic land-mass data on disk.
 * When to use: Bundled load and any caller that already has an absolute land-mass path.
 * Expected outcome: Parsed land-mass envelope.
 * Exceptions: Rethrows read and parse failures. Throws when the envelope fails validation.
 */
export function loadTerrainStrategicLandMassFromPath(absPath: string): StrategicLandMassEnvelope {
  logDebug('terrainLandMassLoad loadTerrainRes1LandMassFromPath', { absPath });
  const parsed = readJsonFileOrThrow(absPath, 'terrainLandMassLoad loadTerrainRes1LandMassFromPath');
  return parseStrategicLandMassEnvelope(parsed);
}

/**
 * Defines the `loadTerrainStrategicLandMassBundled` function shape (export function loadTerrainStrategicLandMassBundled(): StrategicLandMassEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainStrategicLandMassBundled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainStrategicLandMassBundled(): StrategicLandMassEnvelope {
  logTrace('terrainLandMassLoad loadTerrainRes1LandMassBundled');
  return loadTerrainStrategicLandMassFromPath(resolveTerrainStrategicLandMassPath());
}

/**
 * Defines the `assertLandMassMatchesHexList` function shape (export function assertLandMassMatchesHexList().

 * Purpose: Supports maintainability by documenting why `assertLandMassMatchesHexList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function assertLandMassMatchesHexList(
  byH3: ReadonlyMap<string, StrategicLandMassRecord>,
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
