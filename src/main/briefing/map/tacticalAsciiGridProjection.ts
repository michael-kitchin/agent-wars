/**
 * Projects a tactical battle footprint onto row/column slots for ASCII operational maps.
 *
 * Purpose: Latitude clustering (`projectToGrid` with multi-degree thresholds) collapses an entire strategic tactical
 * child set into one or two rows; this module uses H3 `cellToLocalIj` so each tactical maps to a distinct offset row
 * in the same odd-row layout consumed by `renderHexAsciiMap`.
 * When to use: Only from `buildTacticalOperationalMapSectionMarkdown` after `initTacticalCoordinateRegistry`.
 * Expected outcome: `HexGrid` with one `GridCell` per input index, no duplicate `(row,col)`, `numRows` large enough
 * for a readable 2D map (typically on the order of tens of rows for a full 343-cell footprint).
 * Exceptions: If no origin yields successful IJ for every cell, falls back to the first sorted index and logs at debug.
 */

import { cellToLatLng, cellToLocalIj } from 'h3-js';
import { logDebug } from '../../logger';
import type { CoordinateContext } from './coordinateContext';
import { getHexCodeForContext } from './hexCoordinates';
import type { GridCell, HexGrid } from './hexGridProjection';

/**
 * Converts H3 local IJ (anchored at `origin`) to odd-r offset hex coordinates for ASCII row/col placement.
 *
 * Purpose: Matches the odd-row horizontal offset convention used by `renderHexAsciiMap` (odd rows indented).
 * When to use: Once per cell inside `projectTacticalFootprintToAsciiGrid`.
 * Expected outcome: Integer `row` / `col` before normalization to non-negative indices.
 * Exceptions: None; pure arithmetic.
 */
function localIjToOddRRowCol(i: number, j: number): { row: number; col: number } {
  const q = i;
  const r = j;
  const row = r;
  const col = q + (r - (r & 1)) / 2;
  return { row, col };
}

/**
 * Picks an origin tactical cell such that `cellToLocalIj(origin, h)` succeeds for every `h` in the footprint when possible.
 *
 * Purpose: Mitigates rare H3 pentagon / distance failures when a single lexicographic minimum is a bad anchor.
 * When to use: Before projecting all cells in `projectTacticalFootprintToAsciiGrid`.
 * Expected outcome: Returns first working origin from sorted candidates, or sorted[0] after logging.
 * Exceptions: None; swallows per-cell IJ errors during probing.
 */
function pickTacticalAsciiOrigin(h3Indices: readonly string[]): string {
  const sorted = [...h3Indices].sort();
  const probe = sorted.length <= 10 ? sorted : [...sorted.slice(0, 5), ...sorted.slice(Math.floor(sorted.length / 2), Math.floor(sorted.length / 2) + 5)];
  for (const origin of probe) {
    let allOk = true;
    for (const h of h3Indices) {
      try {
        cellToLocalIj(origin, h);
      } catch {
        allOk = false;
        break;
      }
    }
    if (allOk) return origin;
  }
  logDebug('tacticalAsciiGridProjection pickTacticalAsciiOrigin: no probe covered all cells, using lexicographic min', {
    footprint: h3Indices.length,
  });
  return sorted[0]!;
}

/**
 * Builds a `HexGrid` for tactical ASCII maps using local IJ coordinates relative to a stable origin.
 *
 * Purpose: Replaces latitude-band clustering for tactical-only prompts so the LLM sees a 2D layout of the battle.
 * When to use: From `buildTacticalOperationalMapSectionMarkdown` instead of `projectToGrid` for tactical context.
 * Expected outcome: `cells.length === h3Indices.length` and unique `(row,col)` per cell when IJ succeeds for all.
 * Exceptions: Throws if a cell lacks a tactical briefing code in `context` (same contract as `projectToGrid`).
 */
export function projectTacticalFootprintToAsciiGrid(
  h3Indices: readonly string[],
  context: CoordinateContext
): HexGrid {
  if (h3Indices.length === 0) {
    return { cells: [], numRows: 0, numCols: 0 };
  }
  const origin = pickTacticalAsciiOrigin(h3Indices);
  const raw: Array<{ h3Index: string; row: number; col: number; lat: number; lng: number }> = [];
  for (const h3Index of h3Indices) {
    let row: number;
    let col: number;
    try {
      const ij = cellToLocalIj(origin, h3Index);
      const rc = localIjToOddRRowCol(ij.i, ij.j);
      row = rc.row;
      col = rc.col;
    } catch (err) {
      logDebug('tacticalAsciiGridProjection cellToLocalIj failed for cell', { h3Index, origin, err });
      const [lat, lng] = cellToLatLng(h3Index);
      raw.push({ h3Index, row: Math.round(lat * 1e6), col: Math.round(lng * 1e6), lat, lng });
      continue;
    }
    const [lat, lng] = cellToLatLng(h3Index);
    raw.push({ h3Index, row, col, lat, lng });
  }
  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = -Infinity;
  let maxCol = -Infinity;
  for (const p of raw) {
    if (p.row < minRow) minRow = p.row;
    if (p.col < minCol) minCol = p.col;
    if (p.row > maxRow) maxRow = p.row;
    if (p.col > maxCol) maxCol = p.col;
  }
  const cells: GridCell[] = [];
  for (const p of raw) {
    const r = p.row - minRow;
    const c = p.col - minCol;
    const code = getHexCodeForContext(p.h3Index, context);
    if (!code) {
      logDebug('tacticalAsciiGridProjection missing tactical code', { h3Index: p.h3Index });
      throw new Error(`tacticalAsciiGridProjection: missing briefing code for H3 ${p.h3Index}`);
    }
    cells.push({
      h3Index: p.h3Index,
      code,
      row: r,
      col: c,
      lat: p.lat,
      lng: p.lng,
    });
  }
  const grid: HexGrid = {
    cells,
    numRows: maxRow - minRow + 1,
    numCols: maxCol - minCol + 1,
  };
  logDebug('tacticalAsciiGridProjection projectTacticalRes4FootprintToAsciiGrid', {
    cellCount: cells.length,
    numRows: grid.numRows,
    numCols: grid.numCols,
    origin,
  });
  return grid;
}
