/**
 * Local-IJ placement for ASCII operational maps.
 *
 * Purpose: Latitude clustering collapses a small connected set into one row. Local IJ keeps each cell
 * on its own odd-r slot, which both the tactical footprint and a strategic patch need.
 * When to use: Tactical footprint projection, and a strategic patch that can share one local origin.
 * Expected outcome: One grid cell per input when every local-IJ lookup succeeds.
 * Exceptions: The tactical path falls back to scaled latitude and longitude. The strict path returns null.
 */

import { cellToLatLng, cellToLocalIj } from 'h3-js';
import { logDebug } from '../../logger';
import type { CoordinateContext } from './coordinateContext';
import { getHexCodeForContext } from './hexCoordinates';
import type { GridCell, HexGrid } from './hexGridProjection';

/**
 * Converts H3 local IJ (anchored at `origin`) to odd-r offset hex coordinates.
 *
 * Purpose: Matches the odd-row indent used by `renderHexAsciiMap`.
 * When to use: Once per cell while projecting a connected set.
 * Expected outcome: Integer row and column before they are shifted to zero.
 * Exceptions: None.
 */
export function localIjToOddRRowCol(i: number, j: number): { row: number; col: number } {
  const row = j;
  const col = i + (j - (j & 1)) / 2;
  return { row, col };
}

/**
 * Picks an origin such that `cellToLocalIj` succeeds for every cell when one exists.
 *
 * Purpose: A lexicographic minimum can sit on a pentagon and fail for the rest of the set.
 * When to use: Before projecting a footprint or a patch.
 * Expected outcome: The first probed origin that covers every cell, or the lexicographic minimum.
 * Exceptions: None. A failed probe is skipped.
 */
export function pickLocalIjOrigin(h3Indices: readonly string[]): string {
  const sorted = [...h3Indices].sort();
  const probe = sorted.length <= 10
    ? sorted
    : [...sorted.slice(0, 5), ...sorted.slice(Math.floor(sorted.length / 2), Math.floor(sorted.length / 2) + 5)];
  for (const origin of probe) {
    let allOk = true;
    for (const h3Index of h3Indices) {
      try {
        cellToLocalIj(origin, h3Index);
      } catch {
        allOk = false;
        break;
      }
    }
    if (allOk) return origin;
  }
  logDebug('localIjGridProjection pickLocalIjOrigin: no probe covered all cells, using lexicographic min', {
    cellCount: h3Indices.length,
  });
  return sorted[0]!;
}

/**
 * Raw odd-r row and column for each cell, anchored at `origin`.
 *
 * Purpose: A window and its full footprint must share one origin so their rows stay comparable.
 * When to use: Tactical footprint and window projection.
 * Expected outcome: One position per index. A failed local-IJ lookup uses scaled latitude and longitude.
 * Exceptions: None.
 */
export function rawOddRPositions(
  h3Indices: readonly string[],
  origin: string
): Array<{ h3Index: string; row: number; col: number; lat: number; lng: number }> {
  const raw: Array<{ h3Index: string; row: number; col: number; lat: number; lng: number }> = [];
  for (const h3Index of h3Indices) {
    const [lat, lng] = cellToLatLng(h3Index);
    try {
      const ij = cellToLocalIj(origin, h3Index);
      const rc = localIjToOddRRowCol(ij.i, ij.j);
      raw.push({ h3Index, row: rc.row, col: rc.col, lat, lng });
    } catch (err) {
      logDebug('localIjGridProjection cellToLocalIj failed for cell', { h3Index, origin, err });
      raw.push({ h3Index, row: Math.round(lat * 1e6), col: Math.round(lng * 1e6), lat, lng });
    }
  }
  return raw;
}

/**
 * Shifts raw positions so the minimum row and column are zero, unless they were already shifted.
 *
 * Purpose: `renderHexAsciiMap` reads non-negative row and column indexes.
 * When to use: After `rawOddRPositions`, or after a caller has already shifted a crop.
 * Expected outcome: A grid whose cells carry briefing codes.
 * Exceptions: Throws when a cell has no briefing code in `context`.
 */
export function gridFromRaw(
  raw: readonly { h3Index: string; row: number; col: number; lat: number; lng: number }[],
  context: CoordinateContext,
  indentFirstRow: boolean,
  alreadyShifted = false
): HexGrid {
  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = -Infinity;
  let maxCol = -Infinity;
  for (const cell of raw) {
    if (cell.row < minRow) minRow = cell.row;
    if (cell.col < minCol) minCol = cell.col;
    if (cell.row > maxRow) maxRow = cell.row;
    if (cell.col > maxCol) maxCol = cell.col;
  }
  const rowShift = alreadyShifted ? 0 : minRow;
  const colShift = alreadyShifted ? 0 : minCol;
  const cells: GridCell[] = raw.map((cell) => {
    const code = getHexCodeForContext(cell.h3Index, context);
    if (!code) {
      logDebug('localIjGridProjection missing briefing code', { h3Index: cell.h3Index });
      throw new Error(`tacticalAsciiGridProjection: missing briefing code for H3 ${cell.h3Index}`);
    }
    return {
      h3Index: cell.h3Index,
      code,
      row: cell.row - rowShift,
      col: cell.col - colShift,
      lat: cell.lat,
      lng: cell.lng,
    };
  });
  return {
    cells,
    numRows: maxRow - (alreadyShifted ? 0 : minRow) + 1,
    numCols: maxCol - (alreadyShifted ? 0 : minCol) + 1,
    ...(indentFirstRow ? { indentFirstRow: true } : {}),
  };
}

/**
 * Projects cells with local IJ, or returns null when any cell cannot share the origin.
 *
 * Purpose: A strategic patch that crosses a pentagon must not fall back to a latitude times 1e6 grid.
 * When to use: One connected strategic patch. Tactical maps keep `rawOddRPositions` instead.
 * Expected outcome: An empty grid for an empty list. Null when local IJ or the briefing code fails. Otherwise one cell per input, minimum row and column zero, and no first-row indent.
 * Exceptions: None. Lookup failures return null.
 */
export function tryProjectLocalIjGrid(
  h3Indices: readonly string[],
  context: CoordinateContext
): HexGrid | null {
  logDebug('localIjGridProjection tryProjectLocalIjGrid', { cellCount: h3Indices.length, mode: context.mode });
  if (h3Indices.length === 0) return { cells: [], numRows: 0, numCols: 0 };
  const origin = pickLocalIjOrigin(h3Indices);
  const raw: Array<{ h3Index: string; row: number; col: number; lat: number; lng: number }> = [];
  for (const h3Index of h3Indices) {
    try {
      const ij = cellToLocalIj(origin, h3Index);
      const rc = localIjToOddRRowCol(ij.i, ij.j);
      const [lat, lng] = cellToLatLng(h3Index);
      if (!getHexCodeForContext(h3Index, context)) return null;
      raw.push({ h3Index, row: rc.row, col: rc.col, lat, lng });
    } catch (err) {
      logDebug('localIjGridProjection tryProjectLocalIjGrid failed', { h3Index, origin, err });
      return null;
    }
  }
  return gridFromRaw(raw, context, false);
}
