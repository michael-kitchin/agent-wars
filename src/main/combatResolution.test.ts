/**
 * Verification for ranged/melee phase resolution contracts.
 * Run with: node dist/main/combatResolution.test.js
 */

import * as assert from 'assert';
import { runRangedPhase, type CombatUnit } from './combatResolution';

/**
 * Defines the `makeUnit` function shape (function makeUnit(id: string, player: string, unitType: string, h3Index: string): CombatUnit).

 * Purpose: Supports maintainability by documenting why `makeUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function makeUnit(id: string, player: string, unitType: string, h3Index: string): CombatUnit {
  return { id, player, unitType, h3Index };
}

/**
 * Defines the `testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly` function shape (function testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly(): void).

 * Purpose: Supports maintainability by documenting why `testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly(): void {
  const hex = '891f1d48b9fffff';
  const units: CombatUnit[] = [
    makeUnit('opponent-armor-1', 'opponent', 'armor', hex),
    makeUnit('opponent-armor-2', 'opponent', 'armor', hex),
    makeUnit('opponent-armor-3', 'opponent', 'armor', hex),
    makeUnit('human-armor-1', 'human', 'armor', hex),
  ];
  const rangedOrders = [
    { unitId: 'opponent-armor-1', targetH3Index: hex },
    { unitId: 'opponent-armor-2', targetH3Index: hex },
  ];
  const rollAlways1 = () => 0; // d6 => 1, every eligible shot hits.

  const out = runRangedPhase(units, [hex], rangedOrders, rollAlways1);

  assert.deepStrictEqual(out.removedUnitIds.sort(), ['human-armor-1', 'opponent-armor-1'].sort());
  assert.strictEqual(out.killsByDirectFire?.length, 1, 'only one enemy defender exists in the stack');
  assert.strictEqual(out.killsByDirectFire?.[0]?.victimId, 'human-armor-1');
  assert.deepStrictEqual(
    out.killsByDirectFire?.[0]?.killerIds.sort(),
    ['opponent-armor-1', 'opponent-armor-2'].sort(),
    'direct fire should attribute kills only to attacking side units'
  );
  assert.strictEqual(out.killsByReturnFire?.length, 1, 'only one enemy defender can return fire here');
  assert.strictEqual(out.killsByReturnFire?.[0]?.victimId, 'opponent-armor-1');
  assert.deepStrictEqual(
    out.killsByReturnFire?.[0]?.killerIds,
    ['human-armor-1'],
    'return fire should attribute kills only to enemy-side defenders'
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
  testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly();
  console.log('combatResolution tests passed');
}

run();
