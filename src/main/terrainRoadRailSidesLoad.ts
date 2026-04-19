/**
 * Loads and validates `terrain_res4_road_rail_sides.json` for res4 tactical transport overlay masks.
 */

import * as fs from 'fs';
import { logDebug, logError } from './logger';
import { resolveTerrainRes4RoadRailSidesPathOptional } from './terrainMetadataPaths';

/**
 * Documents the `TerrainRoadRailSidesRecord` interface as a named contract surface (export interface TerrainRoadRailSidesRecord).

 * Purpose: Describes one res4 cell's validated side masks after JSON parsing.
 * When to use: When building in-memory maps for renderer IPC responses.
 * Expected outcome: `roadSides` and `railSides` are same-length boolean arrays of length 5 or 6.
 * Exceptions: None.
 */
export interface TerrainRoadRailSidesRecord {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `roadSides` member (roadSides: boolean[];).

   * Contract: Describes stable behavior for callers of `roadSides` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
roadSides: boolean[];
    /**
   * Specifies the contract for the `railSides` member (railSides: boolean[];).

   * Contract: Describes stable behavior for callers of `railSides` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
railSides: boolean[];
}

/**
 * Defines the `isRecord` function shape (function isRecord(x: unknown): x is Record<string, unknown>).

 * Purpose: Narrows unknown JSON nodes to string-keyed records for field validation.
 * When to use: Inside `parseTerrainRes4RoadRailSidesJson` while walking the envelope.
 * Expected outcome: Type guard success only for non-null objects.
 * Exceptions: None.
 */
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Defines the `readBoolArray` function shape (function readBoolArray(r: Record<string, unknown>, key: string): boolean[]).

 * Purpose: Validates a JSON array contains only booleans with pentagon/hexagon side counts.
 * When to use: For `road_sides` / `rail_sides` fields on each record object.
 * Expected outcome: Returns a fresh boolean array of length 5 or 6.
 * Exceptions: Throws when the shape is invalid.
 */
function readBoolArray(r: Record<string, unknown>, key: string): boolean[] {
  const v = r[key];
  if (!Array.isArray(v)) throw new Error(`terrain road/rail sides: "${key}" must be an array`);
  if (v.length !== 5 && v.length !== 6) {
    throw new Error(`terrain road/rail sides: "${key}" length must be 5 or 6`);
  }
  return v.map((el, i) => {
    if (el !== true && el !== false) {
      throw new Error(`terrain road/rail sides: "${key}[${i}]" must be boolean`);
    }
    return el;
  });
}

/**
 * Defines the `parseTerrainRes4RoadRailSidesJson` function shape (export function parseTerrainRes4RoadRailSidesJson(text: string): TerrainRoadRailSidesRecord[]).

 * Purpose: Strictly parses road/rail JSON text into validated in-memory records for overlay maps.
 * When to use: Unit tests and bundled file loads where the caller already read UTF-8 text from disk.
 * Expected outcome: Returns deduplicated rows keyed by `h3_index` in file order (later duplicates override earlier ones).
 * Exceptions: Throws descriptive errors when required envelope fields or per-record masks are invalid.
 */
export function parseTerrainRes4RoadRailSidesJson(text: string): TerrainRoadRailSidesRecord[] {
  const root = JSON.parse(text) as unknown;
  if (!isRecord(root)) throw new Error('terrain road/rail sides: root must be an object');
  const schemaVersion = root.schema_version;
  if (typeof schemaVersion !== 'string' || !schemaVersion) {
    throw new Error('terrain road/rail sides: schema_version must be a non-empty string');
  }
  const resolution = root.resolution;
  if (typeof resolution !== 'number' || resolution !== 4) {
    throw new Error('terrain road/rail sides: resolution must be number 4');
  }
  const recordsRaw = root.records;
  if (!Array.isArray(recordsRaw)) throw new Error('terrain road/rail sides: records must be an array');
  const out: TerrainRoadRailSidesRecord[] = [];
  for (let i = 0; i < recordsRaw.length; i++) {
    const row = recordsRaw[i];
    if (!isRecord(row)) throw new Error(`terrain road/rail sides: records[${i}] must be an object`);
    const h3 = row.h3_index;
    if (typeof h3 !== 'string' || !h3) {
      throw new Error(`terrain road/rail sides: records[${i}].h3_index must be a non-empty string`);
    }
    const roadSides = readBoolArray(row, 'road_sides');
    const railSides = readBoolArray(row, 'rail_sides');
    if (roadSides.length !== railSides.length) {
      throw new Error(`terrain road/rail sides: records[${i}] road_sides and rail_sides length mismatch`);
    }
    out.push({ h3Index: h3, roadSides, railSides });
  }
  return out;
}

/**
 * Defines the `loadTerrainRes4RoadRailSidesBundled` function shape (export function loadTerrainRes4RoadRailSidesBundled(): Map<string, { roadSides: boolean[]; railSides: boolean[] }>).

 * Purpose: Reads optional bundled JSON from resolved metadata paths and returns a lookup map for overlay IPC.
 * When to use: During `terrainClassificationCache` snapshot construction after naming/metadata loads succeed.
 * Expected outcome: Empty map when the file is absent or unparsable after error logging; otherwise all valid rows indexed by h3.
 * Exceptions: None; failures are logged and surfaced as an empty map.
 */
export function loadTerrainRes4RoadRailSidesBundled(): Map<string, { roadSides: boolean[]; railSides: boolean[] }> {
  logDebug('terrainRoadRailSidesLoad loadTerrainRes4RoadRailSidesBundled: start');
  const path = resolveTerrainRes4RoadRailSidesPathOptional();
  if (!path) {
    logDebug('terrainRoadRailSidesLoad loadTerrainRes4RoadRailSidesBundled: skipped (missing file)');
    return new Map();
  }
  try {
    const text = fs.readFileSync(path, 'utf8');
    const rows = parseTerrainRes4RoadRailSidesJson(text);
    const map = new Map<string, { roadSides: boolean[]; railSides: boolean[] }>();
    for (const row of rows) {
      map.set(row.h3Index, { roadSides: [...row.roadSides], railSides: [...row.railSides] });
    }
    logDebug('terrainRoadRailSidesLoad loadTerrainRes4RoadRailSidesBundled: done', {
      path,
      recordCount: map.size,
    });
    return map;
  } catch (err) {
    logError('terrainRoadRailSidesLoad loadTerrainRes4RoadRailSidesBundled: failed', err);
    return new Map();
  }
}
