/**
 * Strategic hexes of the map that is loaded, in file order.
 *
 * Purpose: A regional match must not treat every cell at its resolution as part of the game.
 * When to use: After a map load, and when a snapshot arrives in the renderer.
 * Expected outcome: Null means the global world grid. An array is that map's footprint.
 * Exceptions: None.
 */

let footprint: readonly string[] | null = null;

/**
 * Membership set for the loaded footprint.
 *
 * Purpose: Neighbor and visibility checks ask this once per hex.
 * When to use: Kept beside `footprint` by `setLoadedStrategicFootprint`.
 * Expected outcome: Null when the global map is loaded.
 * Exceptions: None.
 */
let footprintSet: ReadonlySet<string> | null = null;

/**
 * Role of each loaded strategic hex.
 *
 * Purpose: Neutral-border rules need the manifest role without a second file read.
 * When to use: Set with the footprint. Null on the global map.
 * Expected outcome: Values are `member_land`, `sea`, or `neutral_border`.
 * Exceptions: None.
 */
let hexRoles: ReadonlyMap<string, string> | null = null;

/**
 * Remembers the loaded map's strategic hexes and their roles.
 *
 * Purpose: Seeding, snapshots, and hex codes walk this list instead of the whole Earth.
 * When to use: When a regional pack is installed, and with null when the global map is installed.
 * Expected outcome: Later reads return the same indexes in the same order. A null list clears roles.
 * Exceptions: None.
 */
export function setLoadedStrategicFootprint(
  hexes: readonly string[] | null,
  roles?: ReadonlyMap<string, string> | null
): void {
  footprint = hexes ? [...hexes] : null;
  footprintSet = hexes ? new Set(hexes) : null;
  hexRoles = hexes && roles ? new Map(roles) : null;
}

/**
 * Returns the loaded footprint, or null for the global world grid.
 *
 * Purpose: Callers that enumerate strategic cells stay on the match map.
 * When to use: Ordered hex lists and strategic code assignment.
 * Expected outcome: A copy of the stored indexes, or null when no footprint is installed.
 * Exceptions: None.
 */
export function loadedStrategicFootprint(): readonly string[] | null {
  return footprint ? [...footprint] : null;
}

/**
 * Reports whether a strategic hex belongs to the loaded map.
 *
 * Purpose: Movement, vision, ranges, and spawning stay inside the footprint.
 * When to use: After `gridDisk` returns a neighbor. Do not use it to change `gridDisk` itself.
 * Expected outcome: True for every hex on the global map, and for footprint hexes on a regional map.
 * Exceptions: None.
 */
export function isOnMap(h3Index: string): boolean {
  if (!footprintSet) return true;
  return footprintSet.has(h3Index);
}

/**
 * Returns the stored role of one strategic hex.
 *
 * Purpose: Neutral-border checks use the role recorded with the footprint.
 * When to use: When the caller has an H3 index and no database row.
 * Expected outcome: The role string, or null when the map has no roles or the hex is absent.
 * Exceptions: None.
 */
export function loadedHexRole(h3Index: string): string | null {
  return hexRoles?.get(h3Index) ?? null;
}
