/**
 * Small res-4 H3 helpers shared by tactical unit tests to avoid repeating `latLngToCell` boilerplate.
 *
 * Purpose: One place for “pick a res4 cell and a neighbor” patterns used across tactical rules tests.
 * When to use: Any `tacticalBattle/*.test.ts` that needs stable local geometry without hard-coded index strings.
 * Expected outcome: Valid parent/child relationships for res4 indices at the given coordinates.
 * Exceptions: `firstRingCellDistinctFrom` throws when the ring unexpectedly has no other cell (should not happen for res4).
 */

import { gridDisk, latLngToCell } from 'h3-js';
import { res4GridDiskNeighborsOrdered } from '../../../shared/tacticalRes4TransportLink';

/**
 * Returns the res-4 H3 index for a latitude/longitude pair (convenience over `latLngToCell(..., 4)`).
 *
 * Purpose: Makes tests read as “this cell” rather than repeating resolution arguments.
 * When to use: Fixture setup for tactical march/range assertions.
 * Expected outcome: Same cell as `latLngToCell(lat, lng, 4)`.
 * Exceptions: None from h3-js for normal Earth-range coordinates used in tests.
 */
export function tacticalRes4Cell(lat: number, lng: number): string {
  return latLngToCell(lat, lng, 4);
}

/**
 * Returns the res-1 parent H3 for a latitude/longitude pair (tests often anchor a tactical footprint here).
 *
 * Purpose: Avoid repeating `latLngToCell(lat, lng, 1)` when pairing with a child res4 cell.
 * When to use: Any tactical test that builds `enclosingRes1H3Index` from synthetic coordinates.
 * Expected outcome: Same cell as `latLngToCell(lat, lng, 1)`.
 * Exceptions: None for coordinates used in unit tests.
 */
export function tacticalRes1Cell(lat: number, lng: number): string {
  return latLngToCell(lat, lng, 1);
}

/**
 * Returns a res-4 child index near the given res-1 corner by applying small lat/lng epsilons before indexing.
 *
 * Purpose: Encodes the common “nudge into a res4 child under this res1 parent” pattern used across movement tests.
 * When to use: After `tacticalRes1Cell(lat, lng)` when the scenario needs a deterministic res4 anchor inside that parent.
 * Expected outcome: A res4 index whose parent at resolution 1 matches the implied res1 cell for `(lat, lng)`.
 * Exceptions: None; invalid coordinates behave like `latLngToCell`.
 */
export function tacticalRes4UnderRes1Corner(
  res1Lat: number,
  res1Lng: number,
  options?: { latEpsilon?: number; lngEpsilon?: number }
): string {
  const latE = options?.latEpsilon ?? 0.02;
  const lngE = options?.lngEpsilon ?? 0;
  return latLngToCell(res1Lat + latE, res1Lng + lngE, 4);
}

/**
 * Picks any cell in `gridDisk(center, 1)` that is not `center` (typically one step away on the res4 grid).
 *
 * Purpose: Neighbor selection without embedding magic index literals.
 * When to use: Distance-one tactical march tests.
 * Expected outcome: A defined string distinct from `center` when the ring contains neighbors.
 * Exceptions: Throws if no distinct neighbor exists.
 */
export function firstRingCellDistinctFrom(center: string): string {
  const ring = gridDisk(center, 1);
  const neighbor = [...ring].find((h) => h !== center);
  if (!neighbor) {
    throw new Error('expected a distinct res4 ring-1 neighbor');
  }
  return neighbor;
}

/**
 * Builds `res4RoadSidesByH3` / `res4RailSidesByH3` for two adjacent cells so march-pair transport tests stay consistent.
 *
 * Purpose: DRY fixture setup after loose march-pair rules required overlays on **both** endpoints of a step.
 * When to use: Snapshot builders in tactical march or tooltip tests that model a single adjacent hop with aligned corridor sides.
 * Expected outcome: Flags true on the slot toward the neighbor on each cell per `mode`; throws if `fromH3`/`toH3` are not ring-1 neighbors.
 * Exceptions: Throws when either index is missing from the neighbor ring of the other.
 */
export function pairedTransportSidesForAdjacentHexes(
  fromH3: string,
  toH3: string,
  mode: 'road' | 'rail' | 'both'
): { res4RoadSidesByH3: Record<string, boolean[]>; res4RailSidesByH3: Record<string, boolean[]> } {
  const ringFrom = res4GridDiskNeighborsOrdered(fromH3);
  const iTowardTo = ringFrom.indexOf(toH3);
  if (iTowardTo < 0) {
    throw new Error('pairedTransportSidesForAdjacentHexes: toH3 is not a ring-1 neighbor of fromH3');
  }
  const ringTo = res4GridDiskNeighborsOrdered(toH3);
  const iTowardFrom = ringTo.indexOf(fromH3);
  if (iTowardFrom < 0) {
    throw new Error('pairedTransportSidesForAdjacentHexes: fromH3 is not a ring-1 neighbor of toH3');
  }
  const nF = ringFrom.length;
  const nT = ringTo.length;
  const roadAtFrom = mode === 'rail' ? false : true;
  const railAtFrom = mode === 'road' ? false : true;
  const roadAtTo = mode === 'rail' ? false : true;
  const railAtTo = mode === 'road' ? false : true;
  const roadSidesFrom = Array.from({ length: nF }, (_, k) => k === iTowardTo && roadAtFrom);
  const railSidesFrom = Array.from({ length: nF }, (_, k) => k === iTowardTo && railAtFrom);
  const roadSidesTo = Array.from({ length: nT }, (_, k) => k === iTowardFrom && roadAtTo);
  const railSidesTo = Array.from({ length: nT }, (_, k) => k === iTowardFrom && railAtTo);
  return {
    res4RoadSidesByH3: { [fromH3]: roadSidesFrom, [toH3]: roadSidesTo },
    res4RailSidesByH3: { [fromH3]: railSidesFrom, [toH3]: railSidesTo },
  };
}
