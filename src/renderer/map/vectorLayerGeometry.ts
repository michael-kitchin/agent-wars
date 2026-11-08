/**
 * Decodes vector cells and reads a vector document for the map layers.
 *
 * Purpose: The path layer stays about drawing. This module stays about turning stored integers into positions.
 * When to use: From the coastline and border layers, and from the bucketed path layer.
 * Expected outcome: Line and polygon positions in `[lat, lng]`, or the JSON text of one document.
 * Exceptions: A missing document returns null. Decoding drops parts that are too short to draw.
 */

import { decodePart } from '../../shared/vectorPackDecode';
import type { BasemapVectorName, EncodedPart } from '../../shared/vectorPackTypes';

/**
 * Most cells one sync will draw.
 *
 * Purpose: A zoomed-out view of a fine band must not build an unbounded path list.
 * When to use: As the `maxCells` argument of `visibleCellRefs`, and as the count that logs once.
 * Expected outcome: 800.
 * Exceptions: None.
 */
export const VECTOR_CELL_CAP = 800;

/**
 * One logged warning for a truncated cell list.
 *
 * Purpose: The cap can fire on every pan. One message is enough to show that it happened.
 * When to use: Reset only by reloading the page.
 * Expected outcome: False until the first caller reports exactly `VECTOR_CELL_CAP` cells.
 * Exceptions: None.
 */
let cellCapLogged = false;

/**
 * Logs once when a cell query was cut off at the cap.
 *
 * Purpose: The caller still draws the cells it received. The log says the picture may be missing lines.
 * When to use: Immediately after `visibleCellRefs`, with that result's length.
 * Expected outcome: One console error the first time `count` equals `VECTOR_CELL_CAP`. Other counts do nothing.
 * Exceptions: None.
 */
export function noteVectorCellCap(count: number): void {
  if (count !== VECTOR_CELL_CAP || cellCapLogged) return;
  cellCapLogged = true;
  console.error('[agent-wars] vector cell cap reached', count);
}

/**
 * Reads one vector document from the main process.
 *
 * Purpose: The renderer does not read the zip itself.
 * When to use: When a layer first needs its document.
 * Expected outcome: The JSON text, or null when the document is missing. A missing bridge or a failed call logs once and returns null.
 * Exceptions: None. Failures are logged and returned as null.
 */
export async function loadBasemapVectorText(name: BasemapVectorName): Promise<string | null> {
  const ask = window.gameApi?.basemapVectorDocument;
  if (!ask) {
    console.error('[agent-wars] basemap vector document unavailable', name);
    return null;
  }
  try {
    return await ask(name);
  } catch (error) {
    console.error('[agent-wars] basemap vector document failed', name, error);
    return null;
  }
}

/**
 * Decoded line parts, each `[lat, lng]`.
 *
 * Purpose: The shape Leaflet draws for one cell of a line layer.
 * When to use: As the build result of a line cell.
 * Expected outcome: One array per part. Empty when the cell has no part long enough to draw.
 * Exceptions: None.
 */
export type VectorLineGeometry = Array<Array<[number, number]>>;

/**
 * Decoded polygons, each a list of rings, each ring `[lat, lng]`.
 *
 * Purpose: The shape Leaflet draws for one cell of a fill layer.
 * When to use: As the build result of a mask cell.
 * Expected outcome: One polygon per stored polygon. A ring shorter than three points is dropped.
 * Exceptions: None.
 */
export type VectorPolygonGeometry = Array<Array<Array<[number, number]>>>;

/**
 * Turns encoded line parts into Leaflet positions.
 *
 * Purpose: The line layers share one decode step.
 * When to use: Inside a line cell's `build`.
 * Expected outcome: Parts with at least two points, in `[lat, lng]`, shifted by `lngOffset`.
 * Exceptions: None. A short part is skipped.
 */
export function vectorLines(
  parts: readonly EncodedPart[],
  quantumDeg: number,
  lngOffset: number,
): VectorLineGeometry {
  const lines: VectorLineGeometry = [];
  for (const part of parts) {
    const decoded = decodePart(part, quantumDeg, lngOffset);
    if (decoded.length >= 2) lines.push(decoded);
  }
  return lines;
}

/**
 * Turns encoded polygons into Leaflet rings.
 *
 * Purpose: The land underlay and the water mask share one decode step.
 * When to use: Inside a mask cell's `build`.
 * Expected outcome: Polygons whose rings have at least three points. An empty polygon is dropped.
 * Exceptions: None.
 */
export function vectorPolygons(
  polygons: readonly (readonly EncodedPart[])[],
  quantumDeg: number,
  lngOffset: number,
): VectorPolygonGeometry {
  const shapes: VectorPolygonGeometry = [];
  for (const polygon of polygons) {
    const rings: Array<Array<[number, number]>> = [];
    for (const ring of polygon) {
      const decoded = decodePart(ring, quantumDeg, lngOffset);
      if (decoded.length >= 3) rings.push(decoded);
    }
    if (rings.length > 0) shapes.push(rings);
  }
  return shapes;
}
