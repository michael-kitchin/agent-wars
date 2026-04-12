/**
 * Verification for ranged/melee phase resolution contracts.
 * Run with: node dist/main/combatResolution.test.js
 */

import * as assert from 'assert';
import { runMeleePhase, runRangedPhase, type CombatUnit } from './combatResolution';

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
function testMeleePhaseSkipHexLeavesThatHexUnresolved(): void {
  const hexA = '891f1d48b9fffff';
  const hexB = '891f1d48b8fffff';
  const units: CombatUnit[] = [
    makeUnit('h1', 'human', 'infantry', hexA),
    makeUnit('o1', 'opponent', 'infantry', hexA),
    makeUnit('h2', 'human', 'infantry', hexB),
    makeUnit('o2', 'opponent', 'infantry', hexB),
  ];
  const rollAlways1 = () => 0;
  const out = runMeleePhase(units, [hexA, hexB], rollAlways1, { skipMeleeHexes: new Set([hexA]) });
  assert.ok(!out.combatHexes.includes(hexA), 'skipped hex must not appear in melee combat hex list');
  assert.ok(out.combatHexes.includes(hexB), 'non-skipped contested hex should still resolve melee');
  assert.ok(!out.removedUnitIds.includes('h1') && !out.removedUnitIds.includes('o1'), 'units in skipped hex should not be removed by melee');
}

/**
 * Defines the `testMeleePhaseNoSkipResolvesMoreThanSkipOneHex` function shape (function testMeleePhaseNoSkipResolvesMoreThanSkipOneHex(): void).

 * Purpose: Phase E contract — Ignore runs stock melee everywhere; skipping one hex must strictly reduce resolved engagements vs full melee.
 * When to use: Regression guard paired with `testMeleePhaseSkipHexLeavesThatHexUnresolved`.
 * Expected outcome: Without skip, both contested hexes appear in `combatHexes` and strictly more (or equal rare edge) removals than skip-one-hex path for the same RNG.
 * Exceptions: None.
 */
function testMeleePhaseNoSkipResolvesMoreThanSkipOneHex(): void {
  const hexA = '891f1d48b9fffff';
  const hexB = '891f1d48b8fffff';
  const units: CombatUnit[] = [
    makeUnit('h1', 'human', 'infantry', hexA),
    makeUnit('o1', 'opponent', 'infantry', hexA),
    makeUnit('h2', 'human', 'infantry', hexB),
    makeUnit('o2', 'opponent', 'infantry', hexB),
  ];
  const rollAlways1 = () => 0;
  const full = runMeleePhase(units, [hexA, hexB], rollAlways1);
  const skipA = runMeleePhase(units, [hexA, hexB], rollAlways1, { skipMeleeHexes: new Set([hexA]) });
  assert.ok(full.combatHexes.includes(hexA) && full.combatHexes.includes(hexB), 'full melee lists every contested hex');
  assert.ok(
    full.removedUnitIds.length > skipA.removedUnitIds.length,
    'Ignore-equivalent full melee should remove strictly more units than skipping one hex alone'
  );
}

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
  testMeleePhaseSkipHexLeavesThatHexUnresolved();
  testMeleePhaseNoSkipResolvesMoreThanSkipOneHex();
  testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly();
  console.log('combatResolution tests passed');
}

run();
