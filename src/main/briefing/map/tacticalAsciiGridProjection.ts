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

import { cellToLatLng, cellToLocalIj, gridDisk } from 'h3-js';
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
 * Grid steps around each sub-unit that the tactical briefing map draws.
 *
 * Purpose: The full footprint is mostly empty, and the model does not use cells far from the fight.
 * When to use: `selectTacticalMapWindowCells`.
 * Expected outcome: 2. A listed Best Options target is added even when it is farther.
 * Exceptions: None.
 */
export const TACTICAL_MAP_WINDOW_RADIUS = 2;

/**
 * Cells of the footprint the tactical briefing map should draw.
 *
 * Purpose: Keeps the prompt map on units and listed targets instead of every margin cell.
 * When to use: `buildTacticalOperationalMapSectionMarkdown` before projecting the grid.
 * Expected outcome: Footprint cells within `TACTICAL_MAP_WINDOW_RADIUS` of an occupied cell, plus listed targets that are inside the footprint. An empty selection returns the whole footprint.
 * Exceptions: A `gridDisk` failure keeps that occupied cell and logs at debug.
 */
export function selectTacticalMapWindowCells(input: {
  readonly footprint: readonly string[];
  readonly occupiedH3: readonly string[];
  readonly targetH3: readonly string[];
}): readonly string[] {
  const footprint = new Set(input.footprint);
  logDebug('tacticalAsciiGridProjection selectTacticalMapWindowCells', {
    footprint: footprint.size,
    occupied: input.occupiedH3.length,
    targets: input.targetH3.length,
  });
  const selected = new Set<string>();
  for (const cell of input.occupiedH3) {
    if (!footprint.has(cell)) continue;
    try {
      for (const near of gridDisk(cell, TACTICAL_MAP_WINDOW_RADIUS)) {
        if (footprint.has(near)) selected.add(near);
      }
    } catch (err) {
      logDebug('tacticalAsciiGridProjection gridDisk failed', { cell, err });
      selected.add(cell);
    }
  }
  for (const target of input.targetH3) {
    if (footprint.has(target)) selected.add(target);
  }
  return selected.size === 0 ? [...input.footprint] : [...selected];
}

/**
 * True when cropping the map flips which printed row is indented.
 *
 * Purpose: Shifting the window's minimum row back to zero would otherwise indent the wrong rows.
 * When to use: `projectTacticalMapWindow`.
 * Expected outcome: True when `windowMinRow - fullMinRow` is odd.
 * Exceptions: None.
 */
export function tacticalMapWindowIndentsFirstRow(windowMinRow: number, fullMinRow: number): boolean {
  const odd = ((windowMinRow - fullMinRow) % 2 + 2) % 2 === 1;
  logDebug('tacticalAsciiGridProjection tacticalMapWindowIndentsFirstRow', { windowMinRow, fullMinRow, odd });
  return odd;
}

/**
 * Picks an origin tactical cell such that `cellToLocalIj(origin, h)` succeeds for every `h` in the footprint when possible.
 *
 * Purpose: Mitigates rare H3 pentagon / distance failures when a single lexicographic minimum is a bad anchor.
 * When to use: Before projecting all cells in `projectTacticalFootprintToAsciiGrid` and `projectTacticalMapWindow`.
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
  const grid = gridFromRaw(rawOddRPositions(h3Indices, origin), context, false);
  logDebug('tacticalAsciiGridProjection projectTacticalRes4FootprintToAsciiGrid', {
    cellCount: grid.cells.length,
    numRows: grid.numRows,
    numCols: grid.numCols,
    origin,
  });
  return grid;
}

/**
 * Projects a window of the footprint, keeping the full footprint's row indent.
 *
 * Purpose: A crop that starts on a formerly indented row must stay indented.
 * When to use: When `selectTacticalMapWindowCells` returned fewer cells than the footprint.
 * Expected outcome: One cell per window index. `indentFirstRow` follows `tacticalMapWindowIndentsFirstRow`.
 * Exceptions: Throws if a window cell has no tactical briefing code.
 */
export function projectTacticalMapWindow(input: {
  readonly footprint: readonly string[];
  readonly window: readonly string[];
  readonly context: CoordinateContext;
}): HexGrid {
  if (input.window.length === 0) {
    return projectTacticalFootprintToAsciiGrid(input.footprint, input.context);
  }
  const origin = pickTacticalAsciiOrigin(input.footprint);
  const full = rawOddRPositions(input.footprint, origin);
  const cropped = rawOddRPositions(input.window, origin);
  const fullMinRow = Math.min(...full.map((cell) => cell.row));
  const windowMinRow = Math.min(...cropped.map((cell) => cell.row));
  const windowMinCol = Math.min(...cropped.map((cell) => cell.col));
  const shifted = cropped.map((cell) => ({
    ...cell,
    row: cell.row - windowMinRow,
    col: cell.col - windowMinCol,
  }));
  const grid = gridFromRaw(shifted, input.context, tacticalMapWindowIndentsFirstRow(windowMinRow, fullMinRow), true);
  logDebug('tacticalAsciiGridProjection projectTacticalMapWindow', {
    footprint: input.footprint.length,
    window: input.window.length,
    indentFirstRow: grid.indentFirstRow === true,
    origin,
  });
  return grid;
}

/**
 * Raw odd-r row and column for each cell, anchored at `origin`.
 *
 * Purpose: The window and the full footprint must share one origin so their rows stay comparable.
 * When to use: `projectTacticalFootprintToAsciiGrid` and `projectTacticalMapWindow`.
 * Expected outcome: One position per index. A failed local-IJ lookup uses scaled latitude and longitude and logs at debug.
 * Exceptions: None.
 */
function rawOddRPositions(
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
      logDebug('tacticalAsciiGridProjection cellToLocalIj failed for cell', { h3Index, origin, err });
      raw.push({ h3Index, row: Math.round(lat * 1e6), col: Math.round(lng * 1e6), lat, lng });
    }
  }
  return raw;
}

/**
 * Shifts raw positions so the minimum row and column are zero, unless they were already shifted.
 *
 * Purpose: `renderHexAsciiMap` reads non-negative row and column indexes.
 * When to use: After `rawOddRPositions`.
 * Expected outcome: A grid whose cells carry briefing codes. `alreadyShifted` skips a second shift.
 * Exceptions: Throws when a cell has no briefing code in `context`.
 */
function gridFromRaw(
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
      logDebug('tacticalAsciiGridProjection missing tactical code', { h3Index: cell.h3Index });
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
