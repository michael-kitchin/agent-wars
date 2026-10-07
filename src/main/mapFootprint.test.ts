import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { isOnMap, setLoadedStrategicFootprint } from '../shared/loadedStrategicFootprint';
import { getReachableHexes } from './pathfinding';
import { computeVisibleHexesForSide } from './visibility';
import type { GameStateSnapshot } from '../shared/ipcTypes';

/**
 * One land cell and an off-map neighbor at the global strategic resolution.
 *
 * Purpose: The footprint test needs two adjacent cells without reading a regional pack.
 * When to use: This file only.
 * Expected outcome: The neighbor is one `gridDisk` step from the origin.
 * Exceptions: None.
 */
function originAndOffMapNeighbor(): { origin: string; neighbor: string } {
  const origin = latLngToCell(48.8, 2.3, 1);
  const neighbor = gridDisk(origin, 1).find((hex) => hex !== origin);
  if (!neighbor) throw new Error('origin has no neighbor');
  return { origin, neighbor };
}

test('an off-map neighbor is not a legal move or a visible hex', () => {
  const { origin, neighbor } = originAndOffMapNeighbor();
  setLoadedStrategicFootprint([origin]);
  try {
    assert.equal(isOnMap(origin), true);
    assert.equal(isOnMap(neighbor), false);
    const reachable = getReachableHexes(
      origin,
      new Set([origin, neighbor]),
      new Map([
        [origin, 'water'],
        [neighbor, 'water'],
      ]),
      'water'
    );
    assert.equal(reachable.has(neighbor), false);
    const state = {
      hexes: [
        { h3Index: origin, terrain: 'water', terrainKind: 'water' },
        { h3Index: neighbor, terrain: 'water', terrainKind: 'water' },
      ],
      units: [{ id: 'u1', player: 'human', unitType: 'naval', h3Index: origin }],
      phase: 'planning',
      turnNumber: 1,
      pendingOrders: [],
    } as GameStateSnapshot;
    const visible = computeVisibleHexesForSide(state, 'human', new Set([origin, neighbor]));
    assert.equal(visible.has(neighbor), false);
    assert.equal(visible.has(origin), true);
  } finally {
    setLoadedStrategicFootprint(null);
  }
});
