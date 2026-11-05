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

import { gridDisk } from 'h3-js';
import { logDebug } from '../../logger';
import type { CoordinateContext } from './coordinateContext';
import type { HexGrid } from './hexGridProjection';
import { gridFromRaw, pickLocalIjOrigin, rawOddRPositions } from './localIjGridProjection';

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
  const origin = pickLocalIjOrigin(h3Indices);
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
  const origin = pickLocalIjOrigin(input.footprint);
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
