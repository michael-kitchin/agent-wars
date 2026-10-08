import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { getLandMassReachableHexes, type LandMassByH3 } from '../shared/landTraversalStrategic';
import { setLoadedStrategicFootprint } from '../shared/loadedStrategicFootprint';
import { isNeutralBorderHex } from '../shared/h3Resolutions';
import { getDistanceAndTurns } from './pathfinding';
import { armorMoveEndsOnHex, setStrategicTerrainFlags } from '../shared/strategicTerrainFlags';

/**
 * Three linked res-1 hexes and a land-mass map that allows every step.
 *
 * Purpose: The stop rule can be tested without loading the world pack.
 * When to use: Each case in this file.
 * Expected outcome: `mid` is a neighbor of `origin`, and `far` is a neighbor of `mid` but not of `origin`.
 * Exceptions: Throws when H3 cannot find that far hex.
 */
function sampleChain(): { origin: string; mid: string; far: string; land: LandMassByH3; hexSet: Set<string> } {
  const origin = latLngToCell(48.8, 2.3, 1);
  const mid = gridDisk(origin, 1).find((hex) => hex !== origin);
  if (!mid) throw new Error('missing neighbor');
  const far = gridDisk(mid, 1).find((hex) => hex !== mid && hex !== origin && gridDisk(origin, 1).includes(hex) === false);
  if (!far) throw new Error('missing second hop');
  const hexes = [origin, mid, far];
  const land: LandMassByH3 = new Map(
    hexes.map((h3Index) => [h3Index, { h3Index, waterPct: 0, continentIds: [1], islandIds: [] }])
  );
  return { origin, mid, far, land, hexSet: new Set(hexes) };
}

describe('armor stop', () => {
  it('stops on entering a rugged hex and lets armor leave one it already occupies', () => {
    const { origin, mid, far, land, hexSet } = sampleChain();
    setStrategicTerrainFlags({ rugged: [mid], arctic: [], city: [] });
    try {
      const stopped = getLandMassReachableHexes({
        originH3: origin,
        hexSet,
        data: land,
        maxDepth: 2,
        endMoveOnEnter: armorMoveEndsOnHex,
      });
      assert.equal(stopped.has(mid), true);
      assert.equal(stopped.has(far), false);

      const leaving = getLandMassReachableHexes({
        originH3: mid,
        hexSet,
        data: land,
        maxDepth: 2,
        endMoveOnEnter: armorMoveEndsOnHex,
      });
      assert.equal(leaving.has(origin), true);

      const slowed = getLandMassReachableHexes({
        originH3: origin,
        hexSet,
        data: land,
        maxDepth: 1,
        endMoveOnEnter: armorMoveEndsOnHex,
      });
      assert.equal(slowed.has(mid), true);
      assert.equal(slowed.has(far), false);

      const infantry = getLandMassReachableHexes({
        originH3: origin,
        hexSet,
        data: land,
        maxDepth: 2,
      });
      assert.equal(infantry.has(far), true);
    } finally {
      setStrategicTerrainFlags(null);
    }
  });

  it('counts two turns through a rugged hex and one turn when armor starts there', () => {
    const { origin, mid, far, land, hexSet } = sampleChain();
    setStrategicTerrainFlags({ rugged: [mid], arctic: [], city: [] });
    try {
      const through = getDistanceAndTurns(origin, far, hexSet, new Map(), 'land', 2, undefined, land, armorMoveEndsOnHex);
      assert.equal(through?.hexDistance, 2);
      assert.equal(through?.estimatedTurns, 2);
      const reached = getLandMassReachableHexes({
        originH3: origin,
        hexSet,
        data: land,
        maxDepth: 2,
        endMoveOnEnter: armorMoveEndsOnHex,
      });
      assert.equal(reached.has(mid), true);
      assert.equal(reached.has(far), false);
      const leaving = getDistanceAndTurns(mid, far, hexSet, new Map(), 'land', 2, undefined, land, armorMoveEndsOnHex);
      assert.equal(leaving?.hexDistance, 1);
      assert.equal(leaving?.estimatedTurns, 1);
    } finally {
      setStrategicTerrainFlags(null);
    }
  });

  it('lets infantry enter a neutral-border hex', () => {
    const { origin, mid, land, hexSet } = sampleChain();
    setLoadedStrategicFootprint([origin, mid], new Map([[mid, 'neutral_border']]));
    try {
      const reached = getLandMassReachableHexes({
        originH3: origin,
        hexSet,
        data: land,
        maxDepth: 1,
      });
      assert.equal(isNeutralBorderHex(mid), true);
      assert.equal(reached.has(mid), true);
    } finally {
      setLoadedStrategicFootprint(null);
    }
  });
});
