/**
 * Geodesic land-chain fixtures for strategic approach and destination-suggestion tests.
 *
 * Purpose: Approach behaviour can only be asserted on hexes whose hop count equals their H3 grid distance, and finding
 * such a chain on the real world map is slow, fiddly, and identical for every caller. Sharing one definition also keeps
 * the Best Options approach rows and the Standing Order Status suggestions under test against the same geometry.
 * When to use: Any strategic test that needs a unit able to close on a distant enemy over legal land.
 * Expected outcome: A chain of occupiable land hexes plus a matching snapshot in which `chain[0]` can step toward `chain[hops]`.
 * Exceptions: `findGeodesicLandMassChain` throws when the loaded world map has no chain of the requested length.
 */

import { gridDisk, gridDistance } from 'h3-js';
import { canLandUnitTraverseEdge, landUnitCanOccupyHex } from '../../shared/landTraversalRes1';
import type { GameStateSnapshot } from '../gameDb';
import { getOrderedHexList } from '../mapData';
import { ensureTerrainClassificationCacheLoaded, getRes1LandMassByH3 } from '../terrainClassificationCache';

/**
 * Finds a land-mass hex chain whose hop count equals H3 grid distance (a geodesic on occupiable land).
 *
 * Purpose: Strategic this-turn tests need path-legal destinations whose grid distance to a far enemy is well-defined;
 * a merely-connected chain can bend, which makes "this move closes the distance" assertions meaningless.
 * When to use: Occupancy, empty-urban, adjacent-enemy, contested, approach, and suggested-destination fixtures.
 * Expected outcome: `hops + 1` hexes from origin to the far end; `gridDistance(chain[0], chain[hops]) === hops`.
 * Exceptions: Throws if no such chain exists on the loaded world map.
 */
export function findGeodesicLandMassChain(hops: number): string[] {
  ensureTerrainClassificationCacheLoaded();
  const data = getRes1LandMassByH3();
  const allHexes = getOrderedHexList();
  const onMap = new Set(allHexes);
  for (const origin of allHexes) {
    if (!landUnitCanOccupyHex(origin, data)) continue;
    const prev = new Map<string, string | null>();
    const dist = new Map<string, number>();
    prev.set(origin, null);
    dist.set(origin, 0);
    const q = [origin];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i]!;
      const d = dist.get(cur) ?? 0;
      if (d === hops) {
        try {
          if (gridDistance(origin, cur) !== hops) continue;
        } catch {
          continue;
        }
        const chain: string[] = [];
        let walk: string | null = cur;
        while (walk) {
          chain.push(walk);
          walk = prev.get(walk) ?? null;
        }
        chain.reverse();
        return chain;
      }
      if (d >= hops) continue;
      for (const n of gridDisk(cur, 1)) {
        if (n === cur || prev.has(n) || !onMap.has(n)) continue;
        if (!canLandUnitTraverseEdge(cur, n, data)) continue;
        prev.set(n, cur);
        dist.set(n, d + 1);
        q.push(n);
      }
    }
  }
  throw new Error(`expected a geodesic land-mass chain of ${hops} hops`);
}

/**
 * Builds a strategic snapshot on a geodesic land chain with optional urban on the first step.
 *
 * Purpose: Shared fixture so occupancy vs empty-urban vs adjacent-enemy vs suggestion tests differ only in units and infra.
 * When to use: With a chain from `findGeodesicLandMassChain`.
 * Expected outcome: Infantry at `chain[0]` can legally step onto `chain[1]` / `chain[2]` this turn; `chain[4]` is out of this-turn reach.
 * Exceptions: None.
 */
export function buildLandChainState(args: {
  chain: string[];
  units: GameStateSnapshot['units'];
  urbanOnStep1?: boolean;
}): GameStateSnapshot {
  return {
    turnNumber: 1,
    phase: 'planning',
    hexes: args.chain.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: args.units,
    pendingOrders: [],
    res1Infrastructure: args.urbanOnStep1
      ? [{ h3Index: args.chain[1]!, urbanHexCount: 2, airportCount: 0, seaportCount: 0 }]
      : [],
    res1Control: [],
  };
}
