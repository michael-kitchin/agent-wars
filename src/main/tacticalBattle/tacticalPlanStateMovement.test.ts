/**
 * Tests tactical AI plan-state movement projection. Run with: node dist/main/tacticalBattle/tacticalPlanStateMovement.test.js
 */

import * as assert from 'assert';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { applyMovementOrdersToPlanState } from './tacticalPlanStateMovement';

/**
 * Defines the `testApplyMovementOrdersAutoDebarksOpponentEmbarkedCargo` function shape.

 * Purpose: Tactical AI plan state must reflect debark+move for subsequent ranged/embark validation in the same order batch.
 * When to use: After edits to `applyMovementOrdersToPlanState`.
 * Expected outcome: Opponent land row moves and clears `embarkedOnSubUnitId`.
 * Exceptions: None.
 */
function testApplyMovementOrdersAutoDebarksOpponentEmbarkedCargo(): void {
  const state: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [
      { h3Index: 'carrier-hex', terrain: 'coastal', terrainKind: 'plains' },
      { h3Index: 'land-hex', terrain: 'land', terrainKind: 'plains' },
    ],
    units: [
      {
        id: 'opp-nav',
        player: 'opponent',
        unitType: 'naval',
        h3Index: 'carrier-hex',
      },
      {
        id: 'opp-inf',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: 'carrier-hex',
        embarkedOnSubUnitId: 'opp-nav',
      },
    ],
    fogOfWarEnabled: false,
    playerPerspective: 'opponent',
    pendingOrders: [],
  };
  const next = applyMovementOrdersToPlanState(state, [{ unitId: 'opp-inf', toH3Index: 'land-hex' }]);
  const land = next.units.find((u) => u.id === 'opp-inf');
  assert.strictEqual(land?.h3Index, 'land-hex');
  assert.ok(!land?.embarkedOnSubUnitId);
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Executes named cases for the manual test runner at the bottom of this file.
 * When to use: Invoked at module load when running `node dist/.../tacticalPlanStateMovement.test.js`.
 * Expected outcome: Prints `OK` lines and returns normally when all pass.
 * Exceptions: `process.exit(1)` on assertion error.
 */
function run(): void {
  const tests = [
    {
      name: 'applyMovementOrdersToPlanState auto-debarks opponent embarked cargo',
      fn: testApplyMovementOrdersAutoDebarksOpponentEmbarkedCargo,
    },
  ];
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
