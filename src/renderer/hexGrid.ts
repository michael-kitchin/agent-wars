/**
 * H3-based hex grid for the 19-hex flower layout. Single resolution; center + k-ring with k=2.
 * Coordinate system: we use H3 cellToBoundary (lat/lng) and project to canvas with a simple
 * scale and offset so the grid fits the view. Cube coordinates are derived for the sidebar (axial q,r).
 */

import {
  latLngToCell,
  gridDiskDistances,
  cellToBoundary,
  cellToLocalIj,
} from 'h3-js';

/** H3 resolution for the hex flower. Resolution 2 gives ~8700 km² per hex; good for a small demo grid. */
const H3_RESOLUTION = 2;

/**
 * Latitude/longitude of the grid center. (0, 0) gives a symmetric flower over the Gulf of Guinea.
 */
const GRID_CENTER_LAT = 0;
const GRID_CENTER_LNG = 0;

/** Ordered list of 19 H3 indices: center first, then ring 1 (6), then ring 2 (12). */
let hexCells: string[] | null = null;

/**
 * Returns the 19 H3 cell indices in deterministic order (center, then ring 1, then ring 2).
 * Uses gridDiskDistances so we get rings in order; flattened gives center-first ordering.
 */
export function getHexCells(): string[] {
  if (hexCells !== null) return hexCells;
  const center = latLngToCell(GRID_CENTER_LAT, GRID_CENTER_LNG, H3_RESOLUTION);
  const rings = gridDiskDistances(center, 2);
  hexCells = rings.flat();
  return hexCells;
}

/**
 * Returns the H3 resolution used for the grid. Exposed for display and consistency.
 */
export function getH3Resolution(): number {
  return H3_RESOLUTION;
}

/**
 * Converts an H3 cell's boundary (array of [lat, lng]) to canvas points using a simple
 * equirectangular projection: lat/lng relative to grid center, scaled by pixelPerDegree.
 * Boundary is closed (first point repeated at end in H3); we use all points for drawing.
 */
function boundaryToCanvas(
  boundary: [number, number][],
  centerLng: number,
  centerLat: number,
  pixelPerDegree: number
): { x: number; y: number }[] {
  return boundary.map(([lat, lng]) => {
    const x = (lng - centerLng) * pixelPerDegree;
    const y = -(lat - centerLat) * pixelPerDegree;
    return { x, y };
  });
}

/**
 * Grid space uses degree units: x = lng - centerLng, y = -(lat - centerLat).
 * getGridBounds returns the bounding box in that space.
 */
function getGridBounds(
  cells: string[]
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const centerLat = GRID_CENTER_LAT;
  const centerLng = GRID_CENTER_LNG;
  const scale = 1;

  for (const h of cells) {
    const boundary = cellToBoundary(h);
    const pts = boundaryToCanvas(boundary, centerLng, centerLat, scale);
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Padding in pixels around the grid when fitting to canvas. */
const FIT_PADDING = 20;

/**
 * Returns the scale factor that maps grid-space extent to (canvas size - padding).
 * If cells is provided (e.g. from game state), uses that list; otherwise uses the default 19-hex grid.
 */
export function getFitScale(
  canvasWidth: number,
  canvasHeight: number,
  cells?: string[]
): number {
  const list = cells ?? getHexCells();
  const b = getGridBounds(list);
  const rangeX = b.maxX - b.minX || 1;
  const rangeY = b.maxY - b.minY || 1;
  const fitW = canvasWidth - 2 * FIT_PADDING;
  const fitH = canvasHeight - 2 * FIT_PADDING;
  return Math.min(fitW / rangeX, fitH / rangeY);
}

export interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Converts a point from grid space (degrees relative to center) to canvas pixels.
 * Transform: canvas = center + offset + grid * fitScale * view.scale.
 */
export function gridToCanvas(
  gridX: number,
  gridY: number,
  view: ViewState,
  fitScale: number,
  canvasCenterX: number,
  canvasCenterY: number
): { x: number; y: number } {
  const s = fitScale * view.scale;
  return {
    x: canvasCenterX + view.offsetX + gridX * s,
    y: canvasCenterY + view.offsetY + gridY * s,
  };
}

/**
 * Converts canvas pixel coordinates to grid space for hit-testing.
 */
export function canvasToGrid(
  canvasX: number,
  canvasY: number,
  view: ViewState,
  fitScale: number,
  canvasCenterX: number,
  canvasCenterY: number
): { x: number; y: number } {
  const s = fitScale * view.scale;
  return {
    x: (canvasX - canvasCenterX - view.offsetX) / s,
    y: (canvasY - canvasCenterY - view.offsetY) / s,
  };
}

/** Terrain fill and stroke colors when drawing from game state. */
const TERRAIN_STYLES: Record<string, { fill: string; stroke: string }> = {
  land: { fill: '#dde8ef', stroke: '#6b8a9a' },
  water: { fill: '#a8c8e0', stroke: '#2a5a8a' },
};

const DEFAULT_FILL = '#dde8ef';
const DEFAULT_STROKE = '#6b8a9a';

/**
 * Draws hexes onto the given context. If hexesWithTerrain is provided (from game state), draws that list with terrain colors; otherwise draws the default 19-hex grid. Clears the canvas with the background color first.
 */
export function drawHexes(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  backgroundColor: string,
  selectedIndex: string | null,
  hexesWithTerrain?: { h3Index: string; terrain: string }[]
): void {
  const cells = hexesWithTerrain?.map((h) => h.h3Index) ?? getHexCells();
  const centerLat = GRID_CENTER_LAT;
  const centerLng = GRID_CENTER_LNG;
  const fitScale = getFitScale(canvasWidth, canvasHeight, cells);
  const canvasCenterX = canvasWidth / 2;
  const canvasCenterY = canvasHeight / 2;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  for (let i = 0; i < cells.length; i++) {
    const h = cells[i];
    const boundary = cellToBoundary(h);
    const gridPts = boundaryToCanvas(boundary, centerLng, centerLat, 1);
    const pts = gridPts.map((p) =>
      gridToCanvas(p.x, p.y, view, fitScale, canvasCenterX, canvasCenterY)
    );

    const isSelected = selectedIndex === h;
    const terrain = hexesWithTerrain?.[i]?.terrain;
    const styles = terrain ? TERRAIN_STYLES[terrain] ?? { fill: DEFAULT_FILL, stroke: DEFAULT_STROKE } : { fill: DEFAULT_FILL, stroke: DEFAULT_STROKE };
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) {
      ctx.lineTo(pts[j].x, pts[j].y);
    }
    ctx.closePath();
    ctx.fillStyle = isSelected ? '#b8d4e8' : styles.fill;
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#1a5a8a' : styles.stroke;
    ctx.lineWidth = isSelected ? 3 : 1;
    ctx.stroke();
  }
}

/**
 * Returns the H3 index of the hex containing the given canvas point, or null if none.
 * If hexList is provided (e.g. from game state), hit-tests against that list; otherwise uses the default 19-hex grid.
 */
export function hitTest(
  canvasX: number,
  canvasY: number,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  hexList?: string[]
): string | null {
  const cells = hexList ?? getHexCells();
  const centerLat = GRID_CENTER_LAT;
  const centerLng = GRID_CENTER_LNG;
  const fitScale = getFitScale(canvasWidth, canvasHeight, cells);
  const canvasCenterX = canvasWidth / 2;
  const canvasCenterY = canvasHeight / 2;
  const grid = canvasToGrid(
    canvasX,
    canvasY,
    view,
    fitScale,
    canvasCenterX,
    canvasCenterY
  );

  for (let i = cells.length - 1; i >= 0; i--) {
    const h = cells[i];
    const boundary = cellToBoundary(h);
    const gridPts = boundaryToCanvas(boundary, centerLng, centerLat, 1);
    if (pointInPolygon(grid.x, grid.y, gridPts)) return h;
  }
  return null;
}

function pointInPolygon(
  x: number,
  y: number,
  pts: { x: number; y: number }[]
): boolean {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Converts H3 cell to cube coordinates (x, y, z) with z = -x - y.
 * Uses H3's cellToLocalIj(origin, cell). If originH3 is not provided, uses the default grid center (first cell of getHexCells()).
 */
export function cellToCube(
  h3Index: string,
  originH3?: string
): { x: number; y: number; z: number } {
  const center = originH3 ?? getHexCells()[0];
  try {
    const [i, j] = cellToLocalIj(center, h3Index);
    return { x: i, y: j, z: -i - j };
  } catch {
    return { x: 0, y: 0, z: 0 };
  }
}

/**
 * Returns the canvas coordinates of the center of the given hex. Used to draw unit markers.
 * If hexList is provided, fitScale uses that list; otherwise uses the default grid.
 */
export function getHexCanvasCenter(
  h3Index: string,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  hexList?: string[]
): { x: number; y: number } {
  const cells = hexList ?? getHexCells();
  const fitScale = getFitScale(canvasWidth, canvasHeight, cells);
  const canvasCenterX = canvasWidth / 2;
  const canvasCenterY = canvasHeight / 2;
  const boundary = cellToBoundary(h3Index);
  const gridPts = boundaryToCanvas(
    boundary,
    GRID_CENTER_LNG,
    GRID_CENTER_LAT,
    1
  );
  const cx = gridPts.reduce((s, p) => s + p.x, 0) / gridPts.length;
  const cy = gridPts.reduce((s, p) => s + p.y, 0) / gridPts.length;
  return gridToCanvas(
    cx,
    cy,
    view,
    fitScale,
    canvasCenterX,
    canvasCenterY
  );
}
