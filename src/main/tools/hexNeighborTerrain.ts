/**
 * Adjacent land, water, and passable-neighbor counts for one hex.
 *
 * Purpose: Assessment notes and briefing columns must use one reading of the neighbor ring.
 * When to use: `executeAssessHex` and any briefing column that repeats its chokepoint or coast test.
 * Expected outcome: Counts from `gridDisk` of radius 1, excluding the center hex.
 * Exceptions: A thrown disk returns three zeros after an error log.
 */

import { gridDisk } from 'h3-js';
import { logError, logTrace } from '../logger';
import { terrainIsPassableForDomain, type PassableDomain } from '../pathfinding';

/**
 * Passable neighbors at or below this count are a chokepoint.
 *
 * Purpose: The assessment note and the Raise Options column share one cutoff.
 * When to use: Compare with `countNeighborTerrain(...).passableNeighbors`.
 * Expected outcome: Three. A hex with three or fewer passable neighbors is a chokepoint.
 * Exceptions: None.
 */
export const CHOKEPOINT_MAX_PASSABLE_NEIGHBORS = 3;

/**
 * Counts land, water, and passable neighbors around one hex.
 *
 * Purpose: Callers should not each reimplement the ring, including the coastal and wetlands double count.
 * When to use: Pass the map's hex set, terrain, and the domain whose passability matters.
 * Expected outcome: Neighbors outside `hexSet` are ignored. `coastal` and `wetlands` increment both land and water. The center hex is not a neighbor.
 * Exceptions: A thrown `gridDisk` is logged and returned as three zeros.
 */
export function countNeighborTerrain(args: {
  readonly hexH3: string;
  readonly hexSet: ReadonlySet<string>;
  readonly terrainByH3: ReadonlyMap<string, string>;
  readonly passableFor: PassableDomain;
}): { readonly adjacentLand: number; readonly adjacentWater: number; readonly passableNeighbors: number } {
  let adjacentLand = 0;
  let adjacentWater = 0;
  let passableNeighbors = 0;
  try {
    const ring = gridDisk(args.hexH3, 1);
    for (let i = 1; i < ring.length; i++) {
      const neighbor = ring[i]!;
      if (!args.hexSet.has(neighbor)) continue;
      const terrain = args.terrainByH3.get(neighbor) ?? 'land';
      if (terrain === 'land') adjacentLand++;
      else if (terrain === 'water') adjacentWater++;
      else if (terrain === 'coastal' || terrain === 'wetlands') {
        adjacentLand++;
        adjacentWater++;
      }
      if (terrainIsPassableForDomain(terrain, args.passableFor)) passableNeighbors++;
    }
  } catch (err) {
    logError('hexNeighborTerrain countNeighborTerrain: gridDisk threw', err);
  }
  logTrace('hexNeighborTerrain countNeighborTerrain', {
    hexH3: args.hexH3,
    adjacentLand,
    adjacentWater,
    passableNeighbors,
  });
  return { adjacentLand, adjacentWater, passableNeighbors };
}
