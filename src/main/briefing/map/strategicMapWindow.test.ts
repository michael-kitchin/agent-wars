/**
 * Strategic map window: radius, cities, and fog.
 *
 * Run: `npm run build:main` then `node dist/main/briefing/map/strategicMapWindow.test.js`
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../../gameDb';
import {
  controlledCityH3ForStrategicMap,
  groupConnectedMapPatches,
  selectStrategicMapWindowCells,
  STRATEGIC_MAP_WINDOW_RADIUS,
  visibleEnemyH3ForStrategicMap,
} from './strategicMapWindow';

/**
 * A real strategic cell outside the window radius of `origin`.
 *
 * Purpose: `gridDistance` throws across some pentagon pairs. A disk does not.
 * When to use: Tests that need two separated seeds.
 * Expected outcome: A cell that is not inside `gridDisk(origin, radius)`.
 * Exceptions: Throws when the disk cannot be built.
 */
function cellBeyondRadius(origin: string, radius: number): string {
  const near = new Set(gridDisk(origin, radius + 1));
  const farther = gridDisk(origin, radius + 3).find((cell) => !near.has(cell));
  assert.ok(farther);
  return farther;
}

const emptyState = {
  hexes: [],
  units: [],
  phase: 'planning',
  turnNumber: 1,
  pendingOrders: [],
} as unknown as GameStateSnapshot;

test('occupied cells farther than the window become two patches', () => {
  const left = latLngToCell(0, 0, 1);
  const right = cellBeyondRadius(left, STRATEGIC_MAP_WINDOW_RADIUS);
  const window = selectStrategicMapWindowCells({
    mapCells: [left, right],
    ownUnitH3: [left, right],
    visibleEnemyH3: [],
    controlledCityH3: [],
    targetH3: [],
  });
  const patches = groupConnectedMapPatches(window);
  assert.equal(patches.length, 2);
  assert.deepEqual(patches.map((patch) => patch.length), [1, 1]);
});

test('a controlled city with no unit is included and a cell outside the map is not', () => {
  const unit = latLngToCell(12, 34, 1);
  const city = cellBeyondRadius(unit, STRATEGIC_MAP_WINDOW_RADIUS);
  const window = selectStrategicMapWindowCells({
    mapCells: [unit, city],
    ownUnitH3: [unit],
    visibleEnemyH3: [],
    controlledCityH3: [city, 'off-map'],
    targetH3: ['also-off-map'],
  });
  assert.ok(window.includes(city));
  assert.ok(window.includes(unit));
  assert.ok(!window.includes('off-map'));
  assert.ok(!window.includes('also-off-map'));
});

test('an empty seed list returns every map cell', () => {
  const mapCells = ['aa', 'bb'];
  assert.deepEqual(
    selectStrategicMapWindowCells({
      mapCells,
      ownUnitH3: [],
      visibleEnemyH3: [],
      controlledCityH3: [],
      targetH3: [],
    }),
    mapCells
  );
});

test('fog omits an enemy cell that is not visible or explored', () => {
  const hidden = latLngToCell(5, 10, 1);
  const seen = latLngToCell(-15, 120, 1);
  const state: GameStateSnapshot = {
    ...emptyState,
    units: [
      { id: 'opp-1', player: 'opponent', unitType: 'infantry', h3Index: latLngToCell(0, 0, 1) },
      { id: 'hum-hidden', player: 'human', unitType: 'infantry', h3Index: hidden },
      { id: 'hum-seen', player: 'human', unitType: 'infantry', h3Index: seen },
    ],
    fogOfWarEnabled: true,
    visibleHexes: [seen],
    exploredHexes: [],
  };
  const cells = visibleEnemyH3ForStrategicMap(state);
  assert.ok(!cells.includes(hidden));
  assert.ok(cells.includes(seen));
  const cities = controlledCityH3ForStrategicMap({
    ...state,
    strategicControl: [{ h3Index: seen, controllerPlayerId: 'opponent' }],
    strategicInfrastructure: [{ h3Index: seen, urbanHexCount: 2, airportCount: 0, seaportCount: 0 }],
  });
  assert.deepEqual(cities, [seen]);
});
