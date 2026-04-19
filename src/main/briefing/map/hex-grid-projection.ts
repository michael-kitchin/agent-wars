/**
 * Projects a set of H3 cells onto a 2D row/column grid for ASCII rendering.
 *
 * Purpose: Phase 2 spatial backbone: stable row/column layout for a bounded hex set.
 * When to use: After `computeMapHexes` (strategic) or tactical footprint selection.
 * Expected outcome: Deterministic `(row,col)` per input cell for the same inputs and threshold.
 * Exceptions: None for normal Earth coordinates; relies on H3 centers from `cellToLatLng`.
 */

import { cellToLatLng } from 'h3-js';
import { logDebug, logTrace } from '../../logger';
import type { CoordinateContext } from './coordinateContext';
import { getHexCodeForContext } from './hex-coordinates';

const DEFAULT_CLUSTER_THRESHOLD_DEG = 4;

/**
 * One positioned cell in the projected ASCII grid.
 *
 * Purpose: Feeds the renderer with both geographic and stable code metadata.
 * When to use: Consumers iterate `HexGrid.cells` rather than assuming dense `(row,col)` occupancy.
 * Expected outcome: `code` matches the active `CoordinateContext` registry.
 * Exceptions: None.
 */
export interface GridCell {
  h3Index: string;
  code: string;
  row: number;
  col: number;
  lat: number;
  lng: number;
}

/**
 * Full sparse grid metadata for ASCII rendering.
 *
 * Purpose: Holds all occupied cells plus extents for padding empty positions.
 * When to use: Passed to `renderHexAsciiMap`.
 * Expected outcome: `numRows`/`numCols` bound the occupied indices.
 * Exceptions: None.
 */
export interface HexGrid {
  cells: GridCell[];
  numRows: number;
  numCols: number;
}

/**
 * Wraps a longitude delta to (-180, 180] degrees.
 *
 * Purpose: Shared with bounding-box logic for consistent antimeridian behavior.
 * When to use: When normalizing longitudes relative to a cluster center.
 * Expected outcome: Principal longitude delta.
 * Exceptions: None.
 */
function wrapLongitudeDeltaDegrees(delta: number): number {
  let d = delta;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/**
 * Circular mean longitude for a set of degrees.
 *
 * Purpose: Stable center for sorting and clustering across the dateline.
 * When to use: Before assigning row/column indices.
 * Expected outcome: Finite mean for non-empty inputs; 0 for empty.
 * Exceptions: None.
 */
function circularMeanLongitudeDegrees(longitudes: number[]): number {
  if (longitudes.length === 0) return 0;
  let sx = 0;
  let sy = 0;
  for (const lng of longitudes) {
    const rad = (lng * Math.PI) / 180;
    sx += Math.cos(rad);
    sy += Math.sin(rad);
  }
  const mean = Math.atan2(sy / longitudes.length, sx / longitudes.length);
  return (mean * 180) / Math.PI;
}

/**
 * Projects H3 indices to a 2D grid using latitude row clustering and wrapped-longitude columns.
 *
 * Purpose: Implements the plan's offset-row ASCII layout prerequisites.
 * When to use: Immediately before rendering the operational map.
 * Expected outcome: No duplicate `(row,col)` assignments for distinct cells in one invocation.
 * Exceptions: Throws if any `h3Index` lacks a briefing code in the provided context.
 */
export function projectToGrid(
  h3Indices: string[],
  context: CoordinateContext,
  clusterThresholdDeg = DEFAULT_CLUSTER_THRESHOLD_DEG
): HexGrid {
  logDebug('hex-grid-projection projectToGrid', {
    cellCount: h3Indices.length,
    mode: context.mode,
    clusterThresholdDeg,
  });
  const centers = h3Indices.map((h3) => {
    const [lat, lng] = cellToLatLng(h3);
    return { h3, lat, lng };
  });
  centers.sort((a, b) => b.lat - a.lat);
  const centerLng = circularMeanLongitudeDegrees(centers.map((c) => c.lng));

  const rows: typeof centers[] = [];
  let current: typeof centers = [];
  let anchorLat: number | null = null;
  const flush = (): void => {
    if (current.length > 0) {
      rows.push(current);
      current = [];
    }
  };
  for (const c of centers) {
    if (anchorLat == null) {
      anchorLat = c.lat;
      current.push(c);
      continue;
    }
    if (anchorLat - c.lat <= clusterThresholdDeg) {
      current.push(c);
    } else {
      flush();
      anchorLat = c.lat;
      current.push(c);
    }
  }
  flush();

  const cells: GridCell[] = [];
  let maxCol = 0;
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    row.sort((a, b) => {
      const da = wrapLongitudeDeltaDegrees(a.lng - centerLng);
      const db = wrapLongitudeDeltaDegrees(b.lng - centerLng);
      if (da !== db) return da - db;
      return a.h3.localeCompare(b.h3);
    });
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const item = row[colIdx]!;
      const code = getHexCodeForContext(item.h3, context);
      if (!code) {
        const err = new Error(`hex-grid-projection: missing code for H3 ${item.h3}`);
        logDebug('hex-grid-projection projectToGrid: missing code', { h3: item.h3, mode: context.mode });
        throw err;
      }
      cells.push({
        h3Index: item.h3,
        code,
        row: rowIdx,
        col: colIdx,
        lat: item.lat,
        lng: item.lng,
      });
      if (colIdx > maxCol) maxCol = colIdx;
    }
  }
  const grid: HexGrid = {
    cells,
    numRows: rows.length,
    numCols: maxCol + 1,
  };
  logTrace('hex-grid-projection projectToGrid: complete', { numRows: grid.numRows, numCols: grid.numCols });
  return grid;
}
