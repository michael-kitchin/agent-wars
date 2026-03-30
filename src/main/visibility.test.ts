/**
 * Visibility helper tests verifying radius by unit type.
 * Run with: node dist/main/visibility.test.js
 */

import * as assert from 'assert';
import { gridDisk, latLngToCell } from 'h3-js';
import { computeVisibleHexesForSide } from './visibility';
import type { GameStateSnapshot } from '../shared/ipcTypes';

function makeState(unitType: string, unitId: string): { state: GameStateSnapshot; center: string; mapHexSet: Set<string> } {
  const center = latLngToCell(0, 0, 1);
  const mapHexes = Array.from(gridDisk(center, 3));
  const state: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: mapHexes.map((h3) => ({ h3Index: h3, terrain: 'water', terrainKind: 'water' })),
    units: [{ id: unitId, player: 'human', unitType, h3Index: center }],
    pendingOrders: [],
  };
  return { state, center, mapHexSet: new Set(mapHexes) };
}

function testNavalHasTwoHexVision(): void {
  const { state, center, mapHexSet } = makeState('naval', 'human-naval-1');
  const visible = computeVisibleHexesForSide(state, 'human', mapHexSet);
  const ring2 = new Set(Array.from(gridDisk(center, 2)));

  for (const h3 of mapHexSet) {
    if (ring2.has(h3)) assert.ok(visible.has(h3), `Expected naval to see <=2-hex cell ${h3}`);
    if (!ring2.has(h3)) assert.ok(!visible.has(h3), `Expected naval not to see >2-hex cell ${h3}`);
  }
}

function testInfantryHasOneHexVision(): void {
  const { state, center, mapHexSet } = makeState('infantry', 'human-infantry-1');
  const visible = computeVisibleHexesForSide(state, 'human', mapHexSet);
  const ring1 = new Set(Array.from(gridDisk(center, 1)));

  for (const h3 of mapHexSet) {
    if (ring1.has(h3)) assert.ok(visible.has(h3), `Expected infantry to see <=1-hex cell ${h3}`);
    if (!ring1.has(h3)) assert.ok(!visible.has(h3), `Expected infantry not to see >1-hex cell ${h3}`);
  }
}

function testUnknownUnitTypeThrows(): void {
  const { state, mapHexSet } = makeState('unknown_type', 'human-unknown-1');
  assert.throws(
    () => computeVisibleHexesForSide(state, 'human', mapHexSet),
    /Unsupported unitType for visibility/
  );
}

function run(): void {
  testNavalHasTwoHexVision();
  testInfantryHasOneHexVision();
  testUnknownUnitTypeThrows();
  console.log('visibility.test.ts passed');
}

run();