/**
 * Visibility helper tests verifying radius by unit type.
 * Run with: node dist/main/visibility.test.js
 */

import * as assert from 'assert';
import { gridDisk, latLngToCell } from 'h3-js';
import { computeVisibleHexesForSide } from './visibility';
import type { GameStateSnapshot } from '../shared/ipcTypes';

/**
 * Defines the `makeState` function shape (function makeState(unitType: string, unitId: string):).

 * Purpose: Supports maintainability by documenting why `makeState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testNavalHasTwoHexVision` function shape (function testNavalHasTwoHexVision(): void).

 * Purpose: Supports maintainability by documenting why `testNavalHasTwoHexVision` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNavalHasTwoHexVision(): void {
  const { state, center, mapHexSet } = makeState('naval', 'human-naval-1');
  const visible = computeVisibleHexesForSide(state, 'human', mapHexSet);
  const ring2 = new Set(Array.from(gridDisk(center, 2)));

  for (const h3 of mapHexSet) {
    if (ring2.has(h3)) assert.ok(visible.has(h3), `Expected naval to see <=2-hex cell ${h3}`);
    if (!ring2.has(h3)) assert.ok(!visible.has(h3), `Expected naval not to see >2-hex cell ${h3}`);
  }
}

/**
 * Defines the `testInfantryHasOneHexVision` function shape (function testInfantryHasOneHexVision(): void).

 * Purpose: Supports maintainability by documenting why `testInfantryHasOneHexVision` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testInfantryHasOneHexVision(): void {
  const { state, center, mapHexSet } = makeState('infantry', 'human-infantry-1');
  const visible = computeVisibleHexesForSide(state, 'human', mapHexSet);
  const ring1 = new Set(Array.from(gridDisk(center, 1)));

  for (const h3 of mapHexSet) {
    if (ring1.has(h3)) assert.ok(visible.has(h3), `Expected infantry to see <=1-hex cell ${h3}`);
    if (!ring1.has(h3)) assert.ok(!visible.has(h3), `Expected infantry not to see >1-hex cell ${h3}`);
  }
}

/**
 * Defines the `testAirHasThreeHexVision` function shape (function testAirHasThreeHexVision(): void).

 * Purpose: Supports maintainability by documenting why `testAirHasThreeHexVision` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAirHasThreeHexVision(): void {
  const { state, center, mapHexSet } = makeState('air', 'human-air-1');
  const visible = computeVisibleHexesForSide(state, 'human', mapHexSet);
  const ring3 = new Set(Array.from(gridDisk(center, 3)));

  for (const h3 of mapHexSet) {
    if (ring3.has(h3)) assert.ok(visible.has(h3), `Expected air to see <=3-hex cell ${h3}`);
    if (!ring3.has(h3)) assert.ok(!visible.has(h3), `Expected air not to see >3-hex cell ${h3}`);
  }
}

/**
 * Defines the `testUnknownUnitTypeThrows` function shape (function testUnknownUnitTypeThrows(): void).

 * Purpose: Supports maintainability by documenting why `testUnknownUnitTypeThrows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testUnknownUnitTypeThrows(): void {
  const { state, mapHexSet } = makeState('unknown_type', 'human-unknown-1');
  assert.throws(
    () => computeVisibleHexesForSide(state, 'human', mapHexSet),
    /Unsupported unitType for visibility/
  );
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testNavalHasTwoHexVision();
  testInfantryHasOneHexVision();
  testAirHasThreeHexVision();
  testUnknownUnitTypeThrows();
  console.log('visibility.test.ts passed');
}

run();