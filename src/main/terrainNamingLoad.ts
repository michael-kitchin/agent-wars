/** Loads and validates terrain naming envelopes emitted by the Python naming pipeline. */

import * as fs from 'fs';
import { getResolution } from 'h3-js';
import { logDebug, logError, logTrace } from './logger';
import { resolveTerrainRes1NamingPath, resolveTerrainRes4NamingPath } from './terrainMetadataPaths';

/**
 * Documents the module-scope binding `EXPECTED_HEX_NAMING_SCHEMA_VERSION` (EXPECTED_HEX_NAMING_SCHEMA_VERSION).

 * Purpose: Supports maintainability by documenting why `EXPECTED_HEX_NAMING_SCHEMA_VERSION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const EXPECTED_HEX_NAMING_SCHEMA_VERSION = '1.1.0';
/**
 * Documents the module-scope binding `TOOLTIP_NAME_LIST_MAX_ITEMS` (TOOLTIP_NAME_LIST_MAX_ITEMS).

 * Purpose: Supports maintainability by documenting why `TOOLTIP_NAME_LIST_MAX_ITEMS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TOOLTIP_NAME_LIST_MAX_ITEMS = 5;

/**
 * Documents the `TerrainNamingStateRow` interface as a named contract surface (export interface TerrainNamingStateRow).

 * Purpose: Supports maintainability by documenting why `TerrainNamingStateRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TerrainNamingStateRow {
    /**
   * Specifies the contract for the `name` member (name: string;).

   * Contract: Describes stable behavior for callers of `name` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
name: string;
    /**
   * Specifies the contract for the `country` member (country: string;).

   * Contract: Describes stable behavior for callers of `country` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
country: string;
    /**
   * Specifies the contract for the `scalerank` member (scalerank: number | null;).

   * Contract: Describes stable behavior for callers of `scalerank` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scalerank: number | null;
}

/**
 * Documents the `TerrainNamingCityRow` interface as a named contract surface (export interface TerrainNamingCityRow).

 * Purpose: Supports maintainability by documenting why `TerrainNamingCityRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TerrainNamingCityRow {
    /**
   * Specifies the contract for the `name` member (name: string;).

   * Contract: Describes stable behavior for callers of `name` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
name: string;
    /**
   * Specifies the contract for the `state` member (state: string | null;).

   * Contract: Describes stable behavior for callers of `state` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
state: string | null;
    /**
   * Specifies the contract for the `country` member (country: string | null;).

   * Contract: Describes stable behavior for callers of `country` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
country: string | null;
    /**
   * Specifies the contract for the `population` member (population: number | null;).

   * Contract: Describes stable behavior for callers of `population` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
population: number | null;
    /**
   * Specifies the contract for the `scalerank` member (scalerank: number | null;).

   * Contract: Describes stable behavior for callers of `scalerank` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scalerank: number | null;
}

/**
 * Documents the `TerrainNamingCountryRow` interface as a named contract surface (export interface TerrainNamingCountryRow).

 * Purpose: Supports maintainability by documenting why `TerrainNamingCountryRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * One lake or ocean polygon intersecting a hex from Natural Earth water shapefiles.
 *
 * Contract: `type` is `lake` (ne_10m_lakes) or `ocean` (ne_10m_geography_marine_polys).
 * When to use: Parsed from naming JSON `water` arrays; input to water caption functions.
 * Expected outcome: Stable name/type/scalerank triple per intersecting water body.
 * Exceptions: None.
 */
export interface TerrainNamingWaterRow {
  /**
   * Specifies the contract for the `name` member (name: string;).

   * Contract: Human-readable water body name from the source shapefile.
   * When to use: Water caption formatting and JSON parsing validation.
   * Expected outcome: Non-empty string for each intersecting lake or ocean feature.
   * Exceptions: None.
   */
  name: string;
  /**
   * Specifies the contract for the `type` member (type: 'ocean' | 'lake';).

   * Contract: Source layer discriminator for lakes vs marine polygons.
   * When to use: JSON parsing validation and dedupe keys in the naming pipeline.
   * Expected outcome: Exactly `ocean` or `lake` per originating shapefile.
   * Exceptions: None.
   */
  type: 'ocean' | 'lake';
  /**
   * Specifies the contract for the `scalerank` member (scalerank: number | null;).

   * Contract: Natural Earth prominence rank; lower integer = more prominent.
   * When to use: Scalerank filtering when building water tooltip captions.
   * Expected outcome: Integer rank or null when the source field is missing.
   * Exceptions: None.
   */
  scalerank: number | null;
}

export interface TerrainNamingCountryRow {
    /**
   * Specifies the contract for the `name` member (name: string;).

   * Contract: Describes stable behavior for callers of `name` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
name: string;
    /**
   * Specifies the contract for the `continent` member (continent: string | null;).

   * Contract: Describes stable behavior for callers of `continent` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
continent: string | null;
    /**
   * Specifies the contract for the `region` member (region: string | null;).

   * Contract: Describes stable behavior for callers of `region` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
region: string | null;
    /**
   * Specifies the contract for the `population` member (population: number | null;).

   * Contract: Describes stable behavior for callers of `population` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
population: number | null;
    /**
   * Specifies the contract for the `scalerank` member (scalerank: number | null;).

   * Contract: Describes stable behavior for callers of `scalerank` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scalerank: number | null;
}

/**
 * Documents the `TerrainNamingRecordRes1` interface as a named contract surface (export interface TerrainNamingRecordRes1).

 * Purpose: Supports maintainability by documenting why `TerrainNamingRecordRes1` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TerrainNamingRecordRes1 {
    /**
   * Specifies the contract for the `h3_index` member (h3_index: string;).

   * Contract: Describes stable behavior for callers of `h3_index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3_index: string;
    /**
   * Specifies the contract for the `states` member (states: TerrainNamingStateRow[];).

   * Contract: Describes stable behavior for callers of `states` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
states: TerrainNamingStateRow[];
    /**
   * Specifies the contract for the `countries` member (countries: TerrainNamingCountryRow[];).

   * Contract: Describes stable behavior for callers of `countries` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
countries: TerrainNamingCountryRow[];
    /**
   * Specifies the contract for the `water` member (water: TerrainNamingWaterRow[];).

   * Contract: Lake and ocean polygons intersecting this hex from Natural Earth water shapefiles.
   * When to use: Water caption fallback when geographic naming returns null.
   * Expected outcome: Array ordered by scalerank then name; empty when no water bodies intersect.
   * Exceptions: None.
   */
  water: TerrainNamingWaterRow[];
}

/**
 * Documents the `TerrainNamingRecordRes4` interface as a named contract surface (export interface TerrainNamingRecordRes4 extends TerrainNamingRecordRes1).

 * Purpose: Supports maintainability by documenting why `TerrainNamingRecordRes4` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TerrainNamingRecordRes4 extends TerrainNamingRecordRes1 {
    /**
   * Specifies the contract for the `cities` member (cities: TerrainNamingCityRow[];).

   * Contract: Describes stable behavior for callers of `cities` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cities: TerrainNamingCityRow[];
}

/**
 * Documents the `TerrainNamingEnvelope` interface as a named contract surface (export interface TerrainNamingEnvelope).

 * Purpose: Supports maintainability by documenting why `TerrainNamingEnvelope` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TerrainNamingEnvelope {
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
   * Specifies the contract for the `record_count` member (record_count: number;).

   * Contract: Describes stable behavior for callers of `record_count` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
record_count: number;
    /**
   * Specifies the contract for the `records` member (records: TerrainNamingRecordRes1[] | TerrainNamingRecordRes4[];).

   * Contract: Describes stable behavior for callers of `records` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
records: TerrainNamingRecordRes1[] | TerrainNamingRecordRes4[];
}

/**
 * Defines the `isRecord` function shape (function isRecord(x: unknown): x is Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `isRecord` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
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
  if (typeof v !== 'string' || !v) throw new Error(`terrain naming: "${key}" must be a non-empty string`);
  return v;
}

/**
 * Defines the `readNumOrNull` function shape (function readNumOrNull(r: Record<string, unknown>, key: string): number | null).

 * Purpose: Supports maintainability by documenting why `readNumOrNull` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readNumOrNull(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`terrain naming: "${key}" must be a number or null`);
  }
  return v;
}

/**
 * Defines the `readIntOrNull` function shape (function readIntOrNull(r: Record<string, unknown>, key: string): number | null).

 * Purpose: Supports maintainability by documenting why `readIntOrNull` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readIntOrNull(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`terrain naming: "${key}" must be an integer or null`);
  }
  return v;
}

/**
 * Defines the `readRequiredIntOrNull` function shape (function readRequiredIntOrNull(r: Record<string, unknown>, key: string): number | null).

 * Purpose: Supports maintainability by documenting why `readRequiredIntOrNull` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readRequiredIntOrNull(r: Record<string, unknown>, key: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(r, key)) {
    throw new Error(`terrain naming: "${key}" is required`);
  }
  return readIntOrNull(r, key);
}

/**
 * Defines the `readOptionalStrOrNull` function shape (function readOptionalStrOrNull(r: Record<string, unknown>, key: string): string | null).

 * Purpose: Supports maintainability by documenting why `readOptionalStrOrNull` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readOptionalStrOrNull(r: Record<string, unknown>, key: string): string | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new Error(`terrain naming: "${key}" must be a string or null`);
  return v;
}

/**
 * Defines the `readStateArray` function shape (function readStateArray(r: Record<string, unknown>, key: string): TerrainNamingStateRow[]).

 * Purpose: Supports maintainability by documenting why `readStateArray` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readStateArray(r: Record<string, unknown>, key: string): TerrainNamingStateRow[] {
  const v = r[key];
  if (!Array.isArray(v)) throw new Error(`terrain naming: "${key}" must be an array`);
  return v.map((el, i) => {
    if (!isRecord(el)) throw new Error(`terrain naming: ${key}[${i}] must be an object`);
    return {
      name: readStr(el, 'name'),
      country: readStr(el, 'country'),
      scalerank: readIntOrNull(el, 'scalerank'),
    };
  });
}

/**
 * Defines the `readCountryArray` function shape (function readCountryArray(r: Record<string, unknown>, key: string): TerrainNamingCountryRow[]).

 * Purpose: Supports maintainability by documenting why `readCountryArray` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readCountryArray(r: Record<string, unknown>, key: string): TerrainNamingCountryRow[] {
  const v = r[key];
  if (!Array.isArray(v)) throw new Error(`terrain naming: "${key}" must be an array`);
  return v.map((el, i) => {
    if (!isRecord(el)) throw new Error(`terrain naming: ${key}[${i}] must be an object`);
    return {
      name: readStr(el, 'name'),
      continent: readOptionalStrOrNull(el, 'continent'),
      region: readOptionalStrOrNull(el, 'region'),
      population: readNumOrNull(el, 'population'),
      scalerank: readRequiredIntOrNull(el, 'scalerank'),
    };
  });
}

/**
 * Defines the `readCityArray` function shape (function readCityArray(r: Record<string, unknown>, key: string): TerrainNamingCityRow[]).

 * Purpose: Supports maintainability by documenting why `readCityArray` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Parses the `water` array from a naming JSON record.
 *
 * Purpose: Validates lake/ocean rows emitted by the Python naming pipeline.
 * When to use: From `parseRes1Row` for every res1/res4 naming record.
 * Expected outcome: Array of `TerrainNamingWaterRow` with required `name` and `type`.
 * Exceptions: Throws when `type` is not `ocean` or `lake`.
 */
function readWaterArray(r: Record<string, unknown>, key: string): TerrainNamingWaterRow[] {
  const v = r[key];
  if (!Array.isArray(v)) throw new Error(`terrain naming: "${key}" must be an array`);
  return v.map((el, i) => {
    if (!isRecord(el)) throw new Error(`terrain naming: ${key}[${i}] must be an object`);
    const typeRaw = readStr(el, 'type');
    if (typeRaw !== 'ocean' && typeRaw !== 'lake') {
      throw new Error(`terrain naming: ${key}[${i}].type must be "ocean" or "lake"`);
    }
    return {
      name: readStr(el, 'name'),
      type: typeRaw,
      scalerank: readIntOrNull(el, 'scalerank'),
    };
  });
}

function readCityArray(r: Record<string, unknown>, key: string): TerrainNamingCityRow[] {
  const v = r[key];
  if (!Array.isArray(v)) throw new Error(`terrain naming: "${key}" must be an array`);
  return v.map((el, i) => {
    if (!isRecord(el)) throw new Error(`terrain naming: ${key}[${i}] must be an object`);
    return {
      name: readStr(el, 'name'),
      state: readOptionalStrOrNull(el, 'state'),
      country: readOptionalStrOrNull(el, 'country'),
      population: readNumOrNull(el, 'population'),
      scalerank: readIntOrNull(el, 'scalerank'),
    };
  });
}

/**
 * Defines the `parseRes1Row` function shape (function parseRes1Row(raw: unknown, resolution: number): TerrainNamingRecordRes1).

 * Purpose: Supports maintainability by documenting why `parseRes1Row` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseRes1Row(raw: unknown, resolution: number): TerrainNamingRecordRes1 {
  if (!isRecord(raw)) throw new Error('terrain naming: record must be an object');
  const h3Index = readStr(raw, 'h3_index');
  if (getResolution(h3Index) !== resolution) {
    throw new Error(`terrain naming: h3_index ${h3Index} resolution != envelope ${resolution}`);
  }
  return {
    h3_index: h3Index,
    states: readStateArray(raw, 'states'),
    countries: readCountryArray(raw, 'countries'),
    water: readWaterArray(raw, 'water'),
  };
}

/**
 * Defines the `parseRes4Row` function shape (function parseRes4Row(raw: unknown, resolution: number): TerrainNamingRecordRes4).

 * Purpose: Supports maintainability by documenting why `parseRes4Row` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseRes4Row(raw: unknown, resolution: number): TerrainNamingRecordRes4 {
  if (!isRecord(raw)) throw new Error('terrain naming: record must be an object');
  const base = parseRes1Row(raw, resolution);
  return {
    ...base,
    cities: readCityArray(raw, 'cities'),
  };
}

/**
 * Defines the `parseNamingEnvelope` function shape (function parseNamingEnvelope(raw: unknown, expectedResolution: number): TerrainNamingEnvelope).

 * Purpose: Supports maintainability by documenting why `parseNamingEnvelope` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseNamingEnvelope(raw: unknown, expectedResolution: number): TerrainNamingEnvelope {
  if (!isRecord(raw)) throw new Error('terrain naming: root must be an object');
  if (raw.schema_version !== EXPECTED_HEX_NAMING_SCHEMA_VERSION) {
    throw new Error(
      `terrain naming: schema_version ${String(raw.schema_version)} != ${EXPECTED_HEX_NAMING_SCHEMA_VERSION}`
    );
  }
  const resolution = readIntOrNull(raw, 'resolution');
  if (resolution === null) throw new Error('terrain naming: "resolution" must be an integer');
  if (resolution !== expectedResolution) {
    throw new Error(`terrain naming: resolution ${resolution} != expected ${expectedResolution}`);
  }
  const recordCount = readIntOrNull(raw, 'record_count');
  if (recordCount === null) throw new Error('terrain naming: "record_count" must be an integer');
  const recs = raw.records;
  if (!Array.isArray(recs)) throw new Error('terrain naming: records must be an array');
  if (recs.length !== recordCount) {
    throw new Error(`terrain naming: record_count ${recordCount} != len(records) ${recs.length}`);
  }
  const parseRow =
    expectedResolution === 4 ? (r: unknown) => parseRes4Row(r, 4) : (r: unknown) => parseRes1Row(r, 1);
  const records = recs.map((r, i) => {
    try {
      return parseRow(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`terrain naming: records[${i}]: ${msg}`);
    }
  }) as TerrainNamingRecordRes1[] | TerrainNamingRecordRes4[];
  const seen = new Set<string>();
  for (const row of records) {
    if (seen.has(row.h3_index)) throw new Error(`terrain naming: duplicate h3_index ${row.h3_index}`);
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
 * Defines the `namesForFirstOccurringScalerank` function shape (export function namesForFirstOccurringScalerank().

 * Purpose: Supports maintainability by documenting why `namesForFirstOccurringScalerank` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function namesForFirstOccurringScalerank(
  rows: ReadonlyArray<{ name: string; scalerank: number | null }>
): string {
  return namesForFirstOccurringScalerankList(rows).join(', ');
}

/**
 * Defines the `namesForFirstOccurringScalerankList` function shape (export function namesForFirstOccurringScalerankList().

 * Purpose: Supports maintainability by documenting why `namesForFirstOccurringScalerankList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function namesForFirstOccurringScalerankList(
  rows: ReadonlyArray<{ name: string; scalerank: number | null }>
): string[] {
  if (rows.length === 0) return [];
  const firstRank = rows[0]?.scalerank ?? null;
  const names: string[] = [];
  for (const row of rows) {
    if ((row.scalerank ?? null) !== firstRank) continue;
    names.push(row.name);
  }
  return names;
}

/**
 * Defines the `sortRowsByScalerankAscending` function shape (function sortRowsByScalerankAscending<T extends).

 * Purpose: Supports maintainability by documenting why `sortRowsByScalerankAscending` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function sortRowsByScalerankAscending<T extends { scalerank: number | null }>(rows: ReadonlyArray<T>): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aRank = a.row.scalerank ?? Number.MAX_SAFE_INTEGER;
      const bRank = b.row.scalerank ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.index - b.index;
    })
    .map((item) => item.row);
}

/**
 * Defines the `groupedLabel` function shape (function groupedLabel<T>().

 * Purpose: Supports maintainability by documenting why `groupedLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function groupedLabel<T>(
  rows: ReadonlyArray<T>,
  groupKey: (row: T) => string,
  itemLabel: (row: T, groupRows: ReadonlyArray<T>) => string
): string {
  const groupOrder: string[] = [];
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupKey(row);
    let list = grouped.get(key);
    if (!list) {
      list = [];
      grouped.set(key, list);
      groupOrder.push(key);
    }
    list.push(row);
  }
  return groupOrder
    .map((key) => {
      const groupRows = grouped.get(key) ?? [];
      const body = groupRows.map((row) => itemLabel(row, groupRows)).join(', ');
      return `${key}: ${body}`;
    })
    .join('; ');
}

/**
 * Defines the `formatGroupedCitiesForTooltip` function shape (function formatGroupedCitiesForTooltip(rows: ReadonlyArray<TerrainNamingCityRow>): string).

 * Purpose: Supports maintainability by documenting why `formatGroupedCitiesForTooltip` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatGroupedCitiesForTooltip(rows: ReadonlyArray<TerrainNamingCityRow>): string {
  const countryOrder: string[] = [];
  const citiesByCountry = new Map<string, TerrainNamingCityRow[]>();
  for (const row of rows) {
    const country = row.country ?? 'Unknown Country';
    let cityRows = citiesByCountry.get(country);
    if (!cityRows) {
      cityRows = [];
      citiesByCountry.set(country, cityRows);
      countryOrder.push(country);
    }
    cityRows.push(row);
  }
  return countryOrder
    .map((country) => {
      const cityRows = citiesByCountry.get(country) ?? [];
      const stateOrder: string[] = [];
      const citiesByState = new Map<string, string[]>();
      for (const cityRow of cityRows) {
        const stateKey = cityRow.state ?? '';
        let stateCities = citiesByState.get(stateKey);
        if (!stateCities) {
          stateCities = [];
          citiesByState.set(stateKey, stateCities);
          stateOrder.push(stateKey);
        }
        stateCities.push(cityRow.name);
      }
      const groupedCityLabels = stateOrder
        .map((stateKey) => {
          const cityNames = citiesByState.get(stateKey) ?? [];
          const joinedCities = cityNames.join(', ');
          return stateKey ? `${joinedCities} (${stateKey})` : joinedCities;
        })
        .filter((label) => label.length > 0);
      return `${country}: ${groupedCityLabels.join(', ')}`;
    })
    .join('; ');
}

/**
 * Defines the `formatGroupedStatesForTooltip` function shape (function formatGroupedStatesForTooltip(rows: ReadonlyArray<TerrainNamingStateRow>): string).

 * Purpose: Supports maintainability by documenting why `formatGroupedStatesForTooltip` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatGroupedStatesForTooltip(rows: ReadonlyArray<TerrainNamingStateRow>): string {
  return groupedLabel(
    rows,
    (row) => row.country || 'Unknown Country',
    (row) => row.name
  );
}

/**
 * Defines the `formatGroupedCountriesForTooltip` function shape (function formatGroupedCountriesForTooltip(rows: ReadonlyArray<TerrainNamingCountryRow>): string).

 * Purpose: Supports maintainability by documenting why `formatGroupedCountriesForTooltip` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatGroupedCountriesForTooltip(rows: ReadonlyArray<TerrainNamingCountryRow>): string {
  return groupedLabel(
    rows,
    (row) => row.continent ?? 'Unknown Continent',
    (row) => row.name
  );
}

/**
 * Defines the `citiesCoverAllStates` function shape (function citiesCoverAllStates().

 * Purpose: Supports maintainability by documenting why `citiesCoverAllStates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function citiesCoverAllStates(
  cityRows: ReadonlyArray<TerrainNamingCityRow>,
  associatedStates: ReadonlyArray<TerrainNamingStateRow>
): boolean {
  if (associatedStates.length === 0) return true;
  const coveredStates = new Set(
    cityRows
      .map((row) => row.state)
      .filter((state): state is string => typeof state === 'string' && state.length > 0)
  );
  for (const stateRow of associatedStates) {
    if (!coveredStates.has(stateRow.name)) return false;
  }
  return true;
}

/**
 * Defines the `citiesCoverAllCountries` function shape (function citiesCoverAllCountries().

 * Purpose: Supports maintainability by documenting why `citiesCoverAllCountries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function citiesCoverAllCountries(
  cityRows: ReadonlyArray<TerrainNamingCityRow>,
  associatedCountries: ReadonlyArray<TerrainNamingCountryRow>
): boolean {
  if (associatedCountries.length === 0) return true;
  const coveredCountries = new Set(
    cityRows
      .map((row) => row.country)
      .filter((country): country is string => typeof country === 'string' && country.length > 0)
  );
  for (const countryRow of associatedCountries) {
    if (!coveredCountries.has(countryRow.name)) return false;
  }
  return true;
}

/**
 * Defines the `statesCoverAllCountries` function shape (function statesCoverAllCountries( stateRows: ReadonlyArray<TerrainNamingStateRow>, associatedCountries: ReadonlyArray<TerrainNamingCountryRow> ): boolean).

 * Purpose: Supports maintainability by documenting why `statesCoverAllCountries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function statesCoverAllCountries(
  stateRows: ReadonlyArray<TerrainNamingStateRow>,
  associatedCountries: ReadonlyArray<TerrainNamingCountryRow>
): boolean {
  if (associatedCountries.length === 0) return true;
  const coveredCountries = new Set(stateRows.map((row) => row.country || 'Unknown Country'));
  for (const countryRow of associatedCountries) {
    if (!coveredCountries.has(countryRow.name)) return false;
  }
  return true;
}

/**
 * Defines the `statesCoverAllContinents` function shape (function statesCoverAllContinents( stateRows: ReadonlyArray<TerrainNamingStateRow>, associatedCountries: ReadonlyArray<TerrainNamingCountryRow> ): boolea).

 * Purpose: Supports maintainability by documenting why `statesCoverAllContinents` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function statesCoverAllContinents(
  stateRows: ReadonlyArray<TerrainNamingStateRow>,
  associatedCountries: ReadonlyArray<TerrainNamingCountryRow>
): boolean {
  if (associatedCountries.length === 0) return true;
  const coveredCountries = new Set(stateRows.map((row) => row.country || 'Unknown Country'));
  const allContinents = new Set(associatedCountries.map((row) => row.continent ?? 'Unknown Continent'));
  const coveredContinents = new Set(
    associatedCountries
      .filter((row) => coveredCountries.has(row.name))
      .map((row) => row.continent ?? 'Unknown Continent')
  );
  for (const continent of allContinents) {
    if (!coveredContinents.has(continent)) return false;
  }
  return true;
}

/**
 * Defines the `preferredNamingLineForRes4Record` function shape (export function preferredNamingLineForRes4Record(record: TerrainNamingRecordRes4): string | null).

 * Purpose: Supports maintainability by documenting why `preferredNamingLineForRes4Record` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function preferredNamingLineForRes4Record(record: TerrainNamingRecordRes4): string | null {
  const firstRankCities = sortRowsByScalerankAscending(record.cities).slice(0, TOOLTIP_NAME_LIST_MAX_ITEMS);
  if (
    firstRankCities.length > 0 &&
    citiesCoverAllStates(firstRankCities, record.states) &&
    citiesCoverAllCountries(firstRankCities, record.countries)
  ) {
    return formatGroupedCitiesForTooltip(firstRankCities);
  }
  const firstRankStates = sortRowsByScalerankAscending(record.states).slice(0, TOOLTIP_NAME_LIST_MAX_ITEMS);
  if (
    firstRankStates.length > 0 &&
    statesCoverAllCountries(firstRankStates, record.countries) &&
    statesCoverAllContinents(firstRankStates, record.countries)
  ) {
    return formatGroupedStatesForTooltip(firstRankStates);
  }
  if (record.countries.length > 0) return formatGroupedCountriesForTooltip(sortRowsByScalerankAscending(record.countries));
  return null;
}

/**
 * Defines the `preferredNamingLineForRes1Record` function shape (export function preferredNamingLineForRes1Record(record: TerrainNamingRecordRes1): string | null).

 * Purpose: Supports maintainability by documenting why `preferredNamingLineForRes1Record` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Formats lake/ocean rows into a grouped water caption string shared by res1 and res4.
 *
 * Purpose: Keep water tooltip grouping identical at both resolutions.
 * When to use: From `waterNamingLineForRes1Record` and `waterNamingLineForRes4Record`.
 * Expected outcome: Comma-separated scalerank groups (descending rank; null rank first), or `null` when empty.
 * Exceptions: None.
 */
function formatGroupedWaterNamingLine(water: ReadonlyArray<TerrainNamingWaterRow>): string | null {
  if (water.length === 0) return null;
  const byRank = new Map<number | null, string[]>();
  for (const row of water) {
    const rank = row.scalerank ?? null;
    let names = byRank.get(rank);
    if (!names) {
      names = [];
      byRank.set(rank, names);
    }
    names.push(row.name);
  }
  const ranks = Array.from(byRank.keys()).sort((a, b) => {
    const aSort = a === null ? Number.POSITIVE_INFINITY : a;
    const bSort = b === null ? Number.POSITIVE_INFINITY : b;
    return bSort - aSort;
  });
  const groupStrings = ranks.map((rank) => {
    const names = [...(byRank.get(rank) ?? [])].sort((x, y) => x.localeCompare(y));
    return names.join(', ');
  });
  if (groupStrings.length === 0) return null;
  return groupStrings.join(', ');
}

/**
 * Builds the water-body caption for a res1 hex from lake/ocean naming JSON rows.
 *
 * Purpose: Water fallback when state/country geographic naming is unavailable.
 * When to use: As fallback from `namingLineForRes1Record` after `preferredNamingLineForRes1Record` returns null.
 * Expected outcome: Same comma-grouped water format as res4, or `null` when `water` is empty.
 * Exceptions: None.
 */
export function waterNamingLineForRes1Record(record: TerrainNamingRecordRes1): string | null {
  return formatGroupedWaterNamingLine(record.water);
}

/**
 * Builds the water-body caption for a res4 hex from lake/ocean naming JSON rows.
 *
 * Purpose: Water fallback when city/state/country geographic naming is unavailable.
 * When to use: As fallback from `namingLineForRes4Record` after `preferredNamingLineForRes4Record` returns null.
 * Expected outcome: Comma-separated scalerank groups, or `null` when empty.
 * Exceptions: None.
 */
export function waterNamingLineForRes4Record(record: TerrainNamingRecordRes1): string | null {
  return formatGroupedWaterNamingLine(record.water);
}

/**
 * Resolves the res1 tooltip naming line: geographic (state/country) first, then water bodies.
 *
 * Purpose: Single entrypoint for res1 caption selection in the terrain classification cache.
 * When to use: From `buildSnapshot` when precomputing `namingLinesRes1ByH3`.
 * Expected outcome: Geographic line when available; otherwise water-body names from `water` JSON; else `null`.
 * Exceptions: None.
 */
export function namingLineForRes1Record(record: TerrainNamingRecordRes1): string | null {
  return preferredNamingLineForRes1Record(record) ?? waterNamingLineForRes1Record(record);
}

/**
 * Resolves the res4 tooltip naming line: geographic (city/state/country) first, then water bodies.
 *
 * Purpose: Single entrypoint for res4 caption selection in the terrain classification cache.
 * When to use: From `buildSnapshot` when precomputing `namingLinesRes4ByH3`.
 * Expected outcome: Geographic line when available; otherwise water-body names from `water` JSON; else `null`.
 * Exceptions: None.
 */
export function namingLineForRes4Record(record: TerrainNamingRecordRes4): string | null {
  return preferredNamingLineForRes4Record(record) ?? waterNamingLineForRes4Record(record);
}

export function preferredNamingLineForRes1Record(record: TerrainNamingRecordRes1): string | null {
  const firstRankStates = sortRowsByScalerankAscending(record.states).slice(0, TOOLTIP_NAME_LIST_MAX_ITEMS);
  if (
    firstRankStates.length > 0 &&
    statesCoverAllCountries(firstRankStates, record.countries) &&
    statesCoverAllContinents(firstRankStates, record.countries)
  ) {
    return formatGroupedStatesForTooltip(firstRankStates);
  }
  if (record.countries.length > 0) return formatGroupedCountriesForTooltip(sortRowsByScalerankAscending(record.countries));
  return null;
}

/**
 * Defines the `loadTerrainRes1NamingFromPath` function shape (export function loadTerrainRes1NamingFromPath(absPath: string): TerrainNamingEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes1NamingFromPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes1NamingFromPath(absPath: string): TerrainNamingEnvelope {
  logDebug('terrainNamingLoad loadTerrainRes1NamingFromPath', { absPath });
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError('terrainNamingLoad loadTerrainRes1NamingFromPath: read/parse failed', err);
    throw err;
  }
  return parseNamingEnvelope(parsed, 1);
}

/**
 * Defines the `loadTerrainRes4NamingFromPath` function shape (export function loadTerrainRes4NamingFromPath(absPath: string): TerrainNamingEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes4NamingFromPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes4NamingFromPath(absPath: string): TerrainNamingEnvelope {
  logDebug('terrainNamingLoad loadTerrainRes4NamingFromPath', { absPath });
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError('terrainNamingLoad loadTerrainRes4NamingFromPath: read/parse failed', err);
    throw err;
  }
  return parseNamingEnvelope(parsed, 4);
}

/**
 * Defines the `loadTerrainRes1NamingBundled` function shape (export function loadTerrainRes1NamingBundled(): TerrainNamingEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes1NamingBundled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes1NamingBundled(): TerrainNamingEnvelope {
  logTrace('terrainNamingLoad loadTerrainRes1NamingBundled');
  return loadTerrainRes1NamingFromPath(resolveTerrainRes1NamingPath());
}

/**
 * Defines the `loadTerrainRes4NamingBundled` function shape (export function loadTerrainRes4NamingBundled(): TerrainNamingEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes4NamingBundled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes4NamingBundled(): TerrainNamingEnvelope {
  logTrace('terrainNamingLoad loadTerrainRes4NamingBundled');
  return loadTerrainRes4NamingFromPath(resolveTerrainRes4NamingPath());
}
