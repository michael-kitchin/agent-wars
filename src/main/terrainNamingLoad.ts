/** Loads and validates terrain naming envelopes emitted by the Python naming pipeline. */

import { getResolution } from 'h3-js';
import { readJsonFileOrThrow } from './jsonFileHelpers';
import { logDebug, logTrace } from './logger';
import { resolveTerrainRes1NamingPath, resolveTerrainRes4NamingPath } from './terrainMetadataPaths';

/**
 * Documents the module-scope binding `EXPECTED_HEX_NAMING_SCHEMA_VERSION` (EXPECTED_HEX_NAMING_SCHEMA_VERSION).

 * Purpose: Supports maintainability by documenting why `EXPECTED_HEX_NAMING_SCHEMA_VERSION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const EXPECTED_HEX_NAMING_SCHEMA_VERSION = '1.2.0';

/**
 * Shape of a valid `country_code` value in naming JSON.
 *
 * Purpose: Rejects lowercase, `-99`, or other malformed codes at load time instead of at render time.
 * When to use: Inside `readCountryCodeOrNull` only.
 * Expected outcome: Matches exactly two uppercase ASCII letters.
 * Exceptions: None.
 */
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
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
  /**
   * ISO 3166-1 alpha-2 code of the state's country, from Natural Earth.
   *
   * Contract: Uppercase two letters, or `null` when Natural Earth has no code (disputed areas).
   * When to use: Country flags in naming captions and birth-country resolution.
   * Expected outcome: Stable per country across all rows.
   * Exceptions: None.
   */
  countryCode: string | null;
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
  /**
   * ISO 3166-1 alpha-2 code of the city's country, from Natural Earth.
   *
   * Contract: Uppercase two letters, or `null` when Natural Earth has no code.
   * When to use: Country flags in naming captions and birth-country resolution.
   * Expected outcome: Matches the code on the country's own rows when Natural Earth agrees.
   * Exceptions: None.
   */
  countryCode: string | null;
}

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

/**
 * One Natural Earth country intersecting a hex.
 *
 * Contract: Parsed from naming JSON `countries` arrays; `countryCode` is validated by the loader.
 * When to use: Country captions, caption coverage checks, and birth-country resolution.
 * Expected outcome: One row per intersecting country, in pipeline order.
 * Exceptions: None.
 */
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
  /**
   * ISO 3166-1 alpha-2 code of this country, from Natural Earth (`ISO_A2_EH`, else `ISO_A2`).
   *
   * Contract: Uppercase two letters, or `null` when Natural Earth has no code (disputed areas).
   * When to use: Country flags in naming captions and canonical birth-country names.
   * Expected outcome: One code per country.
   * Exceptions: None.
   */
  countryCode: string | null;
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
 * Reads a required `country_code` field from one naming row.
 *
 * Purpose: Validates the ISO code that drives country flags, failing fast on stale or malformed data.
 * When to use: For every country, state, and city row in `readCountryArray`, `readStateArray`, and `readCityArray`.
 * Expected outcome: The uppercase two-letter code, or `null` when the JSON value is `null`.
 * Exceptions: Throws when the key is missing or the value is not `null` or two uppercase letters.
 */
function readCountryCodeOrNull(el: Record<string, unknown>, index: number, arrayKey: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(el, 'country_code')) {
    throw new Error(`terrain naming: ${arrayKey}[${index}].country_code is missing`);
  }
  const v = el.country_code;
  if (v === null) return null;
  if (typeof v !== 'string' || !COUNTRY_CODE_PATTERN.test(v)) {
    throw new Error(`terrain naming: ${arrayKey}[${index}].country_code must be two uppercase letters or null`);
  }
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
      countryCode: readCountryCodeOrNull(el, i, key),
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
      countryCode: readCountryCodeOrNull(el, i, key),
    };
  });
}

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

/**
 * Parses the `cities` array from a res4 naming JSON record.
 *
 * Purpose: Validates city rows, including the country code used for flags and birth countries.
 * When to use: From `parseRes4Row`.
 * Expected outcome: Array of `TerrainNamingCityRow`; `state` and `country` may be `null`.
 * Exceptions: Throws when the value is not an array, a row is not an object, or a field is invalid.
 */
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
      countryCode: readCountryCodeOrNull(el, i, key),
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
 * Loads and validates a res1 terrain naming JSON file.
 *
 * Purpose: Entry point for strategic place-name data on disk.
 * When to use: Bundled load and any caller that already has an absolute naming path.
 * Expected outcome: Parsed naming envelope at resolution 1.
 * Exceptions: Rethrows read and parse failures. Throws when the envelope fails validation.
 */
export function loadTerrainRes1NamingFromPath(absPath: string): TerrainNamingEnvelope {
  logDebug('terrainNamingLoad loadTerrainRes1NamingFromPath', { absPath });
  const parsed = readJsonFileOrThrow(absPath, 'terrainNamingLoad loadTerrainRes1NamingFromPath');
  return parseNamingEnvelope(parsed, 1);
}

/**
 * Loads and validates a res4 terrain naming JSON file.
 *
 * Purpose: Entry point for tactical place-name data on disk.
 * When to use: Bundled load and any caller that already has an absolute naming path.
 * Expected outcome: Parsed naming envelope at resolution 4.
 * Exceptions: Rethrows read and parse failures. Throws when the envelope fails validation.
 */
export function loadTerrainRes4NamingFromPath(absPath: string): TerrainNamingEnvelope {
  logDebug('terrainNamingLoad loadTerrainRes4NamingFromPath', { absPath });
  const parsed = readJsonFileOrThrow(absPath, 'terrainNamingLoad loadTerrainRes4NamingFromPath');
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
