/**
 * Loads optional display-only road/rail vector polylines for the Leaflet transport overlay (non-gameplay).
 */

import * as fs from 'fs';
import type { TacticalTransportVectorOverlayRow } from '../shared/ipc/terrainHexTypes';
import { logDebug, logError } from './logger';
import { resolveTerrainTacticalRoadRailVectorsPathOptional } from './terrainMetadataPaths';

/**
 * Defines the `isRecord` function shape (function isRecord(x: unknown): x is Record<string, unknown>).

 * Purpose: Narrows unknown JSON nodes to object records for schema checks.
 * When to use: During vector JSON envelope/row parsing.
 * Expected outcome: True only for non-null objects.
 * Exceptions: None.
 */
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Defines the `parsePointTuple` function shape (function parsePointTuple(x: unknown, rowIndex: number, pointIndex: number): [number, number] | null).

 * Purpose: Validates one `[lat, lng]` tuple while rejecting non-finite coordinates.
 * When to use: While parsing each row in `parseTerrainTacticalRoadRailVectorsJson`.
 * Expected outcome: Returns normalized numeric tuple or `null` when the point is invalid.
 * Exceptions: None.
 */
function parsePointTuple(x: unknown, rowIndex: number, pointIndex: number): [number, number] | null {
  if (!Array.isArray(x) || x.length !== 2) {
    logDebug('terrainRoadRailVectorsLoad parsePointTuple: invalid tuple shape', { rowIndex, pointIndex });
    return null;
  }
  const lat = x[0];
  const lng = x[1];
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    logDebug('terrainRoadRailVectorsLoad parsePointTuple: invalid numeric tuple', { rowIndex, pointIndex });
    return null;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    logDebug('terrainRoadRailVectorsLoad parsePointTuple: out-of-range WGS84 tuple', { rowIndex, pointIndex });
    return null;
  }
  return [lat, lng];
}

const SUPPORTED_VECTOR_SCHEMA_VERSIONS = new Set(['0.1.0']);

/**
 * Defines the `parseTerrainTacticalRoadRailVectorsJson` function shape (export function parseTerrainTacticalRoadRailVectorsJson(text: string): TacticalTransportVectorOverlayRow[]).

 * Purpose: Parses optional display-only vector JSON into validated renderer IPC rows.
 * When to use: Unit tests and main-process file loads after reading UTF-8 text.
 * Expected outcome: Returns only rows with valid `kind` and at least two valid points.
 * Exceptions: Throws when root shape is invalid JSON object, rows array is missing, or `schema_version` is present and unsupported.
 */
export function parseTerrainTacticalRoadRailVectorsJson(text: string): TacticalTransportVectorOverlayRow[] {
  const root = JSON.parse(text) as unknown;
  if (!isRecord(root)) throw new Error('terrain road/rail vectors: root must be an object');
  const schema = root.schema_version;
  if (schema !== undefined && (typeof schema !== 'string' || !SUPPORTED_VECTOR_SCHEMA_VERSIONS.has(schema))) {
    throw new Error(`terrain road/rail vectors: unsupported schema_version ${String(schema)}`);
  }
  const rowsRaw = root.rows;
  if (!Array.isArray(rowsRaw)) throw new Error('terrain road/rail vectors: rows must be an array');
  const out: TacticalTransportVectorOverlayRow[] = [];
  for (let i = 0; i < rowsRaw.length; i++) {
    const row = rowsRaw[i];
    if (!isRecord(row)) continue;
    const kind = row.kind;
    if (kind !== 'road' && kind !== 'rail') continue;
    const ptsRaw = row.points;
    if (!Array.isArray(ptsRaw)) continue;
    const points: [number, number][] = [];
    for (let j = 0; j < ptsRaw.length; j++) {
      const p = parsePointTuple(ptsRaw[j], i, j);
      if (p) points.push(p);
    }
    if (points.length < 2) continue;
    out.push({ kind, points });
  }
  return out;
}

/**
 * Defines the `loadTerrainTacticalRoadRailVectorsBundled` function shape (export function loadTerrainTacticalRoadRailVectorsBundled(): TacticalTransportVectorOverlayRow[]).

 * Purpose: Loads optional generated vector data for Leaflet transport overlays when the artifact ships with the app.
 * When to use: During terrain classification snapshot build after metadata/naming loads.
 * Expected outcome: Empty array when artifact is missing or invalid; otherwise validated rows.
 * Exceptions: None; failures are logged and degraded to empty output.
 */
export function loadTerrainTacticalRoadRailVectorsBundled(): TacticalTransportVectorOverlayRow[] {
  logDebug('terrainRoadRailVectorsLoad loadTerrainRes4RoadRailVectorsBundled: start');
  const path = resolveTerrainTacticalRoadRailVectorsPathOptional();
  if (!path) {
    logDebug('terrainRoadRailVectorsLoad loadTerrainRes4RoadRailVectorsBundled: skipped (missing file)');
    return [];
  }
  try {
    const text = fs.readFileSync(path, 'utf8');
    const rows = parseTerrainTacticalRoadRailVectorsJson(text);
    logDebug('terrainRoadRailVectorsLoad loadTerrainRes4RoadRailVectorsBundled: done', {
      path,
      rowCount: rows.length,
    });
    return rows;
  } catch (err) {
    logError('terrainRoadRailVectorsLoad loadTerrainRes4RoadRailVectorsBundled: failed', err);
    return [];
  }
}
