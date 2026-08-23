/**
 * Small res-4 H3 helpers shared by tactical unit tests to avoid repeating `latLngToCell` boilerplate.
 *
 * Purpose: One place for “pick a res4 cell and a neighbor” patterns used across tactical rules tests.
 * When to use: Any `tacticalBattle/*.test.ts` that needs stable local geometry without hard-coded index strings.
 * Expected outcome: Valid parent/child relationships for res4 indices at the given coordinates.
 * Exceptions: `firstRingCellDistinctFrom` throws when the ring unexpectedly has no other cell (should not happen for res4).
 */

import { cellToChildren, cellToParent, getPentagons, gridDisk, gridDistance, latLngToCell } from 'h3-js';
import { gridHopDistanceBetween } from '../../tools/assessUnitProximity';
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
 * Two nearby res-4 cells under one res-1 parent whose `gridDistance` throws at an icosahedron face crossing.
 *
 * Purpose: Names the geometry that made tactical briefings report a real neighbor as unreachable, so tests can assert the
 * BFS fallback without hard-coding H3 literals that would silently rot if the fixture search changed.
 * When to use: Returned by `tacticalRes4PentagonCrossingPair`.
 * Expected outcome: `originH3Index` and `crossingH3Index` are distinct children of `res1H3Index`, present in
 * `res4ChildH3Indexes`, `hopDistance` apart on the grid, and unmeasurable by `gridDistance`.
 * Exceptions: None.
 */
export interface TacticalRes4PentagonCrossingPair {
  /**
   * Res-1 parent that encloses both cells, suitable for `enclosingRes1H3Index`.
   *
   * Contract: A pentagon-bearing parent; its res-4 children span an icosahedron face boundary.
   * When to use: Battle snapshot `enclosingRes1H3Index`.
   * Expected outcome: Stable across runs for a given h3-js version.
   * Exceptions: None.
   */
  res1H3Index: string;
  /**
   * All res-4 children of the parent, usable as a full battle footprint.
   *
   * Contract: Contains both `originH3Index` and `crossingH3Index`; pentagon parents yield fewer than 343 children.
   * When to use: Battle snapshot `res4ChildH3Indexes` and terrain maps keyed by footprint cell.
   * Expected outcome: Non-empty array of valid res-4 indexes.
   * Exceptions: None.
   */
  res4ChildH3Indexes: string[];
  /**
   * Cell to measure from.
   *
   * Contract: `gridDistance(originH3Index, crossingH3Index)` throws.
   * When to use: Place the observing sub-unit here.
   * Expected outcome: Distinct from `crossingH3Index`.
   * Exceptions: None.
   */
  originH3Index: string;
  /**
   * Cell whose distance from the origin the fast H3 APIs cannot measure.
   *
   * Contract: `gridDistance(originH3Index, crossingH3Index)` throws while the BFS fallback succeeds.
   * When to use: Place the enemy sub-unit here.
   * Expected outcome: Distinct from `originH3Index`.
   * Exceptions: None.
   */
  crossingH3Index: string;
  /**
   * True grid separation of the pair from the neighbor-BFS fallback.
   *
   * Contract: A small positive integer at or below the requested `maxHops`, never the old 99 placeholder.
   * When to use: Expected value in distance, threat severity, and in-range assertions.
   * Expected outcome: Matches `gridHopDistanceBetween(originH3Index, crossingH3Index)`.
   * Exceptions: None.
   */
  hopDistance: number;
}

/**
 * Finds a close res-4 pair inside one res-1 parent that `gridDistance` refuses to measure.
 *
 * Purpose: Battles fought in the twelve pentagon-bearing res-1 hexes contain pairs where H3's fast distance APIs throw;
 * tactical code that swallowed those throws reported adjacent enemies as far away. Tests need such a pair to prove the
 * fallback works, and discovering it beats pasting indexes that no longer demonstrate anything if h3-js shifts.
 * When to use: Tactical tests covering distance, threat severity, or target selection across a face crossing.
 * Expected outcome: A pair at most `maxHops` apart, searched over the res-1 parents of the res-4 pentagons.
 * Exceptions: Throws when no qualifying pair exists, which would mean the underlying H3 behavior changed.
 */
export function tacticalRes4PentagonCrossingPair(maxHops: number = 2): TacticalRes4PentagonCrossingPair {
  for (const pentagon of getPentagons(4)) {
    const res1H3Index = cellToParent(pentagon, 1);
    const res4ChildH3Indexes = cellToChildren(res1H3Index, 4);
    for (let i = 0; i < res4ChildH3Indexes.length; i++) {
      for (let j = i + 1; j < res4ChildH3Indexes.length; j++) {
        const originH3Index = res4ChildH3Indexes[i]!;
        const crossingH3Index = res4ChildH3Indexes[j]!;
        try {
          gridDistance(originH3Index, crossingH3Index);
          continue;
        } catch {
          // A throwing pair is exactly what this fixture is looking for.
        }
        const hopDistance = gridHopDistanceBetween(originH3Index, crossingH3Index);
        if (hopDistance === null || hopDistance > maxHops) continue;
        return { res1H3Index, res4ChildH3Indexes, originH3Index, crossingH3Index, hopDistance };
      }
    }
  }
  throw new Error(`tacticalRes4PentagonCrossingPair: no unmeasurable res4 pair within ${maxHops} hops`);
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
