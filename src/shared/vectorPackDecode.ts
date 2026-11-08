/**
 * Reads vector documents and turns stored integers back into latitudes and longitudes.
 *
 * Purpose: The Python writer and this module share one quantize rule and one cell key.
 * When to use: After the main process returns the JSON text of a vector zip.
 * Expected outcome: Packs, points, and the cells inside a view. A bad document throws.
 * Exceptions: This module does not read files and does not log. Callers log a full cell list.
 */

import { WEB_MERCATOR_MAX_ABS_LAT } from './webMercator';
import {
  ADMIN_BORDER_GROUP_IDS,
  type AdminBorderGroupId,
  type AdminBorderPack,
  type CoastEdgeMaskCell,
  type CoastEdgeMaskPack,
  type CoastlinePack,
  type EncodedPart,
  type VectorCellRef,
  type VectorLod,
  type VectorViewBounds,
} from './vectorPackTypes';

const SCHEMA_VERSION = '1.0.0';

/**
 * Longitude windows, in degrees, and the shift that puts each one back inside ±180.
 * The middle window is closed at 180. The copies on either side start just past it.
 */
const LONGITUDE_WINDOWS: readonly { lo: number; hi: number; offset: number }[] = [
  { lo: -540, hi: -180, offset: -360 },
  { lo: -180, hi: 180, offset: 0 },
  { lo: 180, hi: 540, offset: 360 },
];

/**
 * Rounds half away from zero.
 *
 * Purpose: `Math.round` sends a negative half toward zero, and the writer does not.
 * When to use: Quantizing one degree value, and folding a longitude.
 * Expected outcome: Sign of `value` times the floor of its absolute value plus one half. Zero stays zero.
 * Exceptions: None.
 */
export function halfAwayFromZero(value: number): number {
  if (value === 0) return 0;
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

/**
 * Quantizes one latitude or longitude.
 *
 * Purpose: Tests lock the same integers the Python writer stores.
 * When to use: On a degree value. Pass the document's quantum, which is `0.00001`.
 * Expected outcome: An integer. `-0.000005` degrees at that quantum is `-1`, not `0`.
 * Exceptions: None. A quantum of zero is not a supported input.
 */
export function quantizeDegrees(degrees: number, quantumDeg = 0.00001): number {
  return halfAwayFromZero(degrees / quantumDeg);
}

/**
 * Folds a longitude into `[-180, 180)`.
 *
 * Purpose: Longitude 180 and longitude -180 are one meridian, and it is the first column.
 * When to use: Before choosing a cell column for a single point.
 * Expected outcome: 180 becomes -180. Other longitudes move by whole turns of 360.
 * Exceptions: None.
 */
export function foldLongitude(lng: number): number {
  const folded = lng - 360 * halfAwayFromZero(lng / 360);
  return folded === 180 ? -180 : folded;
}

/**
 * Cell key for one point.
 *
 * Purpose: The renderer looks up the same key the writer stored.
 * When to use: Tests, and any point that is not already a stored key.
 * Expected outcome: `"<row>:<col>"`. A cell of 360° or more is `"0:0"`. Latitude 90 stays in the last row.
 * Exceptions: None.
 */
export function vectorCellKey(lat: number, lng: number, cellDeg: number): string {
  if (cellDeg >= 360) return '0:0';
  const folded = foldLongitude(lng);
  const col = Math.floor((folded + 180) / cellDeg);
  let row = Math.floor((lat + 90) / cellDeg);
  const lastRow = Math.floor(180 / cellDeg) - 1;
  if (row < 0) row = 0;
  if (row > lastRow) row = lastRow;
  return `${row}:${col}`;
}

/**
 * Turns one stored part into latitudes and longitudes.
 *
 * Purpose: Drawing needs degrees. The document stores a first point and deltas.
 * When to use: For each part in a visible cell. Pass the cell ref's `lngOffset`.
 * Expected outcome: `[lat, lng]` points. A part with fewer than two points is empty.
 *   Longitudes include `lngOffset`, so a second world copy is not shifted twice.
 * Exceptions: None.
 */
export function decodePart(part: EncodedPart, quantumDeg: number, lngOffset: number): Array<[number, number]> {
  if (part.length < 4 || part.length % 2 !== 0) return [];
  const points: Array<[number, number]> = [];
  let lat = part[0]! * quantumDeg;
  let lng = part[1]! * quantumDeg + lngOffset;
  points.push([lat, lng]);
  for (let index = 2; index < part.length; index += 2) {
    lat += part[index]! * quantumDeg;
    lng += part[index + 1]! * quantumDeg;
    points.push([lat, lng]);
  }
  return points;
}

/**
 * Picks the coastline or border band that contains a zoom.
 *
 * Purpose: One zoom draws one band. The boundary belongs to the finer band.
 * When to use: Before listing the cells to draw.
 * Expected outcome: The band whose `minZoom` is at most `zoom` and whose `maxZoom` is null or greater than `zoom`.
 *   `null` when no band contains it.
 * Exceptions: None.
 */
export function coastlineLodForZoom(pack: { readonly lods: readonly VectorLod[] }, zoom: number): VectorLod | null {
  return pack.lods.find((lod) => lod.minZoom <= zoom && (lod.maxZoom === null || zoom < lod.maxZoom)) ?? null;
}

/**
 * Cells that cover a view, including the world copy on each side of the antimeridian.
 *
 * Purpose: A view that crosses longitude 180 has to draw the cells on both sides of the cut.
 * When to use: For coastlines, the edge mask, and borders. Callers pass `maxCells` 800.
 * Expected outcome: At most `maxCells` refs. Each ref's key is looked up inside ±180, and its
 *   `lngOffset` is the shift to add when decoding. A result whose length is exactly `maxCells`
 *   is truncated; the caller logs that once and still draws those refs.
 * Exceptions: None. A view with south above north returns an empty list.
 */
export function visibleCellRefs(view: VectorViewBounds, cellDeg: number, maxCells: number): VectorCellRef[] {
  if (maxCells <= 0 || view.south > view.north) return [];
  const south = Math.max(-WEB_MERCATOR_MAX_ABS_LAT, view.south);
  const north = Math.min(WEB_MERCATOR_MAX_ABS_LAT, view.north);
  if (south > north) return [];
  const west = view.west;
  let east = view.east;
  if (east < west) east += 360;
  if (cellDeg >= 360) return [{ key: '0:0', lngOffset: 0 }];
  const refs: VectorCellRef[] = [];
  const seen = new Set<string>();
  for (const window of LONGITUDE_WINDOWS) {
    const lo = Math.max(west, window.lo);
    const hi = Math.min(east, window.hi);
    if (!(hi > lo)) continue;
    appendCells(refs, seen, south, north, lo - window.offset, hi - window.offset, window.offset, cellDeg, maxCells);
    if (refs.length >= maxCells) break;
  }
  return refs;
}

/**
 * Parses the coastline document.
 *
 * Purpose: The renderer should not trust the zip text until the kind and schema match.
 * When to use: On the JSON from the `coastlines` zip.
 * Expected outcome: A pack. Bands keep their cell size and parts.
 * Exceptions: Throws `Error` naming `schema_version` or `kind` when either is wrong, and naming
 *   the field when a band is not an object.
 */
export function parseCoastlinePack(value: unknown): CoastlinePack {
  const record = requireRecord(value, 'coastlines');
  requireIdentity(record, 'coastlines');
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'coastlines',
    quantumDeg: requireNumber(record, 'quantum_deg'),
    lods: requireLods(record),
  };
}

/**
 * Parses the coast edge-mask document.
 *
 * Purpose: Water and land rings have to stay paired inside the cell that stored them.
 * When to use: On the JSON from the `coast_edge_mask` zip.
 * Expected outcome: A pack whose cells hold polygon lists. An empty cell map is valid.
 * Exceptions: Throws `Error` naming `schema_version`, `kind`, or `cells` when the field is wrong.
 */
export function parseCoastEdgeMaskPack(value: unknown): CoastEdgeMaskPack {
  const record = requireRecord(value, 'coast_edge_mask');
  requireIdentity(record, 'coast_edge_mask');
  const cellsValue = record.cells;
  if (!isRecord(cellsValue)) throw new Error('cells is not an object');
  const cells: Record<string, CoastEdgeMaskCell> = {};
  for (const [key, cell] of Object.entries(cellsValue)) {
    if (!isRecord(cell)) throw new Error(`cells ${key} is not an object`);
    cells[key] = {
      water: requirePolygons(cell.water, 'water'),
      land: requirePolygons(cell.land, 'land'),
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'coast_edge_mask',
    quantumDeg: requireNumber(record, 'quantum_deg'),
    cellDeg: requireNumber(record, 'cell_deg'),
    cells,
  };
}

/**
 * Parses the border document.
 *
 * Purpose: A missing disputed group is normal. An unknown group name is not.
 * When to use: On the JSON from the `admin_borders` zip.
 * Expected outcome: All four groups, in order. A group the document omitted has empty bands.
 * Exceptions: Throws `Error` naming `schema_version`, `kind`, or `id` when a group id is not one of the four.
 */
export function parseAdminBorderPack(value: unknown): AdminBorderPack {
  const record = requireRecord(value, 'admin_borders');
  requireIdentity(record, 'admin_borders');
  const groupsValue = record.groups;
  if (!Array.isArray(groupsValue)) throw new Error('groups is not an array');
  const byId = new Map<AdminBorderGroupId, readonly VectorLod[]>();
  for (const group of groupsValue) {
    if (!isRecord(group)) throw new Error('group is not an object');
    const id = group.id;
    if (!isBorderGroupId(id)) throw new Error(`id ${String(id)} is not a border group`);
    byId.set(id, parseLodList(group.lods));
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'admin_borders',
    quantumDeg: requireNumber(record, 'quantum_deg'),
    groups: ADMIN_BORDER_GROUP_IDS.map((id) => ({ id, lods: byId.get(id) ?? [] })),
  };
}

/**
 * Adds the cells that overlap one longitude piece.
 *
 * Purpose: The column walk stays inside ±180, using longitudes that already had the window shift removed.
 * When to use: From `visibleCellRefs` only.
 * Expected outcome: Refs appended until `maxCells`. A range that ends on a cell edge does not open the next cell.
 * Exceptions: None.
 */
function appendCells(
  refs: VectorCellRef[],
  seen: Set<string>,
  south: number,
  north: number,
  lo: number,
  hi: number,
  lngOffset: number,
  cellDeg: number,
  maxCells: number,
): void {
  const start = Math.max(lo, -180);
  const end = Math.min(hi, 180);
  if (!(end > start)) return;
  const row0 = rowOf(south, cellDeg);
  const row1 = rowOf(north, cellDeg);
  const col0 = Math.floor((start + 180) / cellDeg);
  const col1 = Math.floor((end - 1e-9 + 180) / cellDeg);
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) {
      const key = `${row}:${col}`;
      const id = `${lngOffset}:${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      refs.push({ key, lngOffset });
      if (refs.length >= maxCells) return;
    }
  }
}

/**
 * Row index for a latitude, clamped into the rows that exist.
 *
 * Purpose: Latitude 90 must not open a row past the last one.
 * When to use: From `appendCells`.
 * Expected outcome: An integer in `0 .. floor(180 / cellDeg) - 1`.
 * Exceptions: None.
 */
function rowOf(lat: number, cellDeg: number): number {
  const lastRow = Math.floor(180 / cellDeg) - 1;
  const row = Math.floor((lat + 90) / cellDeg);
  if (row < 0) return 0;
  if (row > lastRow) return lastRow;
  return row;
}

/**
 * True for a plain object.
 *
 * Purpose: JSON values arrive as `unknown`.
 * When to use: Before reading a field.
 * Expected outcome: True for objects, false for arrays and null.
 * Exceptions: None.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Requires a JSON object.
 *
 * Purpose: Every document is one object.
 * When to use: At the start of a parse.
 * Expected outcome: The object.
 * Exceptions: Throws `Error` naming `document` when the value is not an object.
 */
function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} document is not an object`);
  return value;
}

/**
 * Requires the schema and the kind.
 *
 * Purpose: A zip member for one document must not be parsed as another.
 * When to use: After `requireRecord`.
 * Expected outcome: Returns when both fields match.
 * Exceptions: Throws `Error` naming `schema_version` or `kind`.
 */
function requireIdentity(record: Record<string, unknown>, kind: string): void {
  if (record.schema_version !== SCHEMA_VERSION) {
    throw new Error(`schema_version ${String(record.schema_version)} is not ${SCHEMA_VERSION}`);
  }
  if (record.kind !== kind) throw new Error(`kind ${String(record.kind)} is not ${kind}`);
}

/**
 * Requires a numeric field.
 *
 * Purpose: Quantum and cell size are numbers, not strings.
 * When to use: For `quantum_deg` and `cell_deg`.
 * Expected outcome: The number.
 * Exceptions: Throws `Error` naming the field.
 */
function requireNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field} is not a number`);
  return value;
}

/**
 * True when a string is one of the four border group ids.
 *
 * Purpose: An unknown id must fail the parse rather than become a fifth layer.
 * When to use: On each group in the border document.
 * Expected outcome: True for the four names.
 * Exceptions: None.
 */
function isBorderGroupId(value: unknown): value is AdminBorderGroupId {
  return typeof value === 'string' && (ADMIN_BORDER_GROUP_IDS as readonly string[]).includes(value);
}

/**
 * Reads the lod array on a coastline document.
 *
 * Purpose: The field name in the error has to be `lods`.
 * When to use: From `parseCoastlinePack`.
 * Expected outcome: The bands.
 * Exceptions: Throws `Error` naming `lods`.
 */
function requireLods(record: Record<string, unknown>): readonly VectorLod[] {
  return parseLodList(record.lods);
}

/**
 * Reads a list of zoom bands.
 *
 * Purpose: Coastlines and each border group store bands the same way.
 * When to use: From the coastline document and from each border group.
 * Expected outcome: Bands with camelCase fields.
 * Exceptions: Throws `Error` naming `lods`, `min_zoom`, `max_zoom`, `cell_deg`, or `cells`.
 */
function parseLodList(value: unknown): readonly VectorLod[] {
  if (!Array.isArray(value)) throw new Error('lods is not an array');
  return value.map((lod) => {
    if (!isRecord(lod)) throw new Error('lod is not an object');
    const minZoom = lod.min_zoom;
    const maxZoom = lod.max_zoom;
    const cellDeg = lod.cell_deg;
    if (typeof minZoom !== 'number') throw new Error('min_zoom is not a number');
    if (maxZoom !== null && typeof maxZoom !== 'number') throw new Error('max_zoom is not a number or null');
    if (typeof cellDeg !== 'number') throw new Error('cell_deg is not a number');
    return { minZoom, maxZoom, cellDeg, cells: parseCells(lod.cells) };
  });
}

/**
 * Reads a cell map of parts.
 *
 * Purpose: Keys stay strings. Parts stay integer lists.
 * When to use: From a lod.
 * Expected outcome: A record. An empty object is valid.
 * Exceptions: Throws `Error` naming `cells` or `part`.
 */
function parseCells(value: unknown): Readonly<Record<string, readonly EncodedPart[]>> {
  if (!isRecord(value)) throw new Error('cells is not an object');
  const cells: Record<string, EncodedPart[]> = {};
  for (const [key, parts] of Object.entries(value)) {
    if (!Array.isArray(parts)) throw new Error(`cells ${key} is not an array`);
    cells[key] = parts.map((part) => {
      if (!Array.isArray(part) || part.some((item) => typeof item !== 'number')) throw new Error('part is not a number list');
      return part;
    });
  }
  return cells;
}

/**
 * Reads polygons, each an outer ring followed by holes.
 *
 * Purpose: The mask stores rings, not a single line.
 * When to use: For a mask cell's water or land.
 * Expected outcome: A list of polygons. An empty list is valid.
 * Exceptions: Throws `Error` naming the field.
 */
function requirePolygons(value: unknown, field: string): readonly (readonly EncodedPart[])[] {
  if (!Array.isArray(value)) throw new Error(`${field} is not an array`);
  return value.map((polygon) => {
    if (!Array.isArray(polygon)) throw new Error(`${field} polygon is not an array`);
    return polygon.map((ring) => {
      if (!Array.isArray(ring) || ring.some((item) => typeof item !== 'number')) {
        throw new Error(`${field} ring is not a number list`);
      }
      return ring;
    });
  });
}
