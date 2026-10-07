import { cellToChildren, cellToParent, getResolution, latLngToCell } from 'h3-js';
import { activeGameMap } from './activeGameMap';
import { loadedHexRole } from './loadedStrategicFootprint';

/**
 * H3 resolution of the global strategic map.
 *
 * Purpose: Fixtures and global file loaders that must stay on resolution 1 even when a test installs another profile.
 * When to use: Test cells and the global terrain readers. Production map code uses `strategicH3Resolution`.
 * Expected outcome: Always 1.
 * Exceptions: None.
 */
export const GLOBAL_STRATEGIC_H3_RESOLUTION = 1;

/**
 * H3 resolution of the global tactical grid.
 *
 * Purpose: Fixtures and global file loaders that must stay on resolution 4 even when a test installs another profile.
 * When to use: Test cells and the global terrain readers. Production map code uses `tacticalH3Resolution`.
 * Expected outcome: Always 4.
 * Exceptions: None.
 */
export const GLOBAL_TACTICAL_H3_RESOLUTION = 4;

/**
 * @deprecated Use `strategicH3Resolution` in production code. Fixtures that must stay on the global grid may keep this alias. It is always 1.
 */
export const STRATEGIC_H3_RESOLUTION = GLOBAL_STRATEGIC_H3_RESOLUTION;

/**
 * @deprecated Use `tacticalH3Resolution` in production code. Fixtures that must stay on the global grid may keep this alias. It is always 4.
 */
export const TACTICAL_H3_RESOLUTION = GLOBAL_TACTICAL_H3_RESOLUTION;

/**
 * Returns the strategic H3 resolution of the active map.
 *
 * Purpose: Regional maps use resolution 2 or 3. The global profile still returns 1.
 * When to use: Any production parent-cell, envelope, or camera decision.
 * Expected outcome: `activeGameMap().strategicResolution`.
 * Exceptions: None.
 */
export function strategicH3Resolution(): number {
  return activeGameMap().strategicResolution;
}

/**
 * Returns the tactical H3 resolution of the active map.
 *
 * Purpose: A battle is the children of one strategic hex, three levels down. Global is 4. Regional is 5 or 6.
 * When to use: Any production child-cell, hover, or birth-cell decision.
 * Expected outcome: `activeGameMap().tacticalResolution`.
 * Exceptions: None.
 */
export function tacticalH3Resolution(): number {
  return activeGameMap().tacticalResolution;
}

/**
 * Returns the strategic parent of an H3 cell on the active map.
 *
 * Purpose: Call sites must not pass a literal resolution.
 * When to use: When a tactical or intermediate cell must be rolled up to the loaded strategic grid.
 * Expected outcome: The parent at `strategicH3Resolution()`.
 * Exceptions: Throws the H3 library's error when `h3Index` is not a cell.
 */
export function strategicParentOf(h3Index: string): string {
  return cellToParent(h3Index, strategicH3Resolution());
}

/**
 * Returns the tactical children of one strategic cell on the active map.
 *
 * Purpose: A battle footprint is those children. The count stays 343 because the gap is always three resolutions.
 * When to use: When expanding one strategic hex into its battle grid.
 * Expected outcome: The children at `tacticalH3Resolution()`.
 * Exceptions: Throws the H3 library's error when `h3Index` is not a cell.
 */
export function tacticalChildrenOf(h3Index: string): string[] {
  return cellToChildren(h3Index, tacticalH3Resolution());
}

/**
 * Returns whether a cell is on the active strategic grid.
 *
 * Purpose: Replaces `getResolution(cell) === 1` so a regional map accepts its own strategic cells.
 * When to use: Envelope and order checks that used to require resolution 1.
 * Expected outcome: True when the cell's resolution equals `strategicH3Resolution()`.
 * Exceptions: Throws the H3 library's error when `h3Index` is not a cell.
 */
export function isStrategicCell(h3Index: string): boolean {
  return getResolution(h3Index) === strategicH3Resolution();
}

/**
 * Returns whether a cell is on the active tactical grid.
 *
 * Purpose: Replaces `getResolution(cell) === 4` so a regional battle accepts resolution 5 or 6.
 * When to use: Tactical march, hover, and snapshot checks.
 * Expected outcome: True when the cell's resolution equals `tacticalH3Resolution()`.
 * Exceptions: Throws the H3 library's error when `h3Index` is not a cell.
 */
export function isTacticalCell(h3Index: string): boolean {
  return getResolution(h3Index) === tacticalH3Resolution();
}

/**
 * Returns the strategic cell that contains a latitude and longitude.
 *
 * Purpose: Map clicks and loaders must use the active strategic resolution.
 * When to use: Instead of `latLngToCell(lat, lng, 1)`.
 * Expected outcome: The cell at `strategicH3Resolution()`.
 * Exceptions: Throws the H3 library's error when the coordinate cannot be indexed.
 */
export function strategicCellAt(lat: number, lng: number): string {
  return latLngToCell(lat, lng, strategicH3Resolution());
}

/**
 * Returns the tactical cell that contains a latitude and longitude.
 *
 * Purpose: Battle clicks and overlays must use the active tactical resolution.
 * When to use: Instead of `latLngToCell(lat, lng, 4)`.
 * Expected outcome: The cell at `tacticalH3Resolution()`.
 * Exceptions: Throws the H3 library's error when the coordinate cannot be indexed.
 */
export function tacticalCellAt(lat: number, lng: number): string {
  return latLngToCell(lat, lng, tacticalH3Resolution());
}

/**
 * Returns false until hex roles are loaded for the active map.
 *
 * Purpose: Neutral-border hexes produce nothing and cannot host bases.
 * When to use: Production, build queues, and air-base checks.
 * Expected outcome: True only when the loaded role is `neutral_border`. The global map has no roles, so this is false.
 * Exceptions: None.
 */
export function isNeutralBorderHex(h3Index: string): boolean {
  return loadedHexRole(h3Index) === 'neutral_border';
}
