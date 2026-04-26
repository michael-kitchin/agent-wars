/**
 * Unit tests for this-turn options table assembly helpers (`mergeThisTurnOptionsRowsForBriefing`, action column derivation).
 *
 * Purpose: Locks merge-by-target-hex behavior without full briefing or map registries.
 * When to use: `npm test` after `build:main`.
 * Expected outcome: Rows with identical unit, action, Notes, and target-units text collapse to one row with `coTargetH3Indexes`.
 * Exceptions: Assertion failures indicate regression in merge keys or output shape.
 */

import assert from 'node:assert/strict';
import {
  deriveThisTurnOptionsActionColumn,
  mergeThisTurnOptionsRowsForBriefing,
  type PossibleActionTableRow,
} from './possibleUnitActionsTableAssembly';

/**
 * Documents the function binding `fixtureRow` (fixtureRow).
 *
 * Purpose: Builds a minimal `PossibleActionTableRow` with overridable fields for merge tests.
 * When to use: Only inside this test module.
 * Expected outcome: Valid row with defaults matching the user’s multi-hex merge example shape.
 * Exceptions: None.
 */
function fixtureRow(overrides: Partial<PossibleActionTableRow>): PossibleActionTableRow {
  return {
    bucket: 'other',
    unitId: 'opponent-armor-2:01',
    unitType: 'armor',
    actionTypes: 'move/melee',
    targetH3: '8f283082dcb519f',
    distance: 1,
    enemySummary: '—',
    featuresSummary: '—',
    enemyUnitCount: 0,
    urbanHexCount: 0,
    ...overrides,
  };
}

/**
 * Documents the function binding `testMergeCombinesMultipleTargetHexes` (testMergeCombinesMultipleTargetHexes).
 *
 * Purpose: Ensures four identical-context rows become one row with three co-target indexes.
 * When to use: Regression for briefing "Target Hexes" comma grouping.
 * Expected outcome: Single merged row; `coTargetH3Indexes` length 3; primary keeps smallest distance then lexicographic H3.
 * Exceptions: None.
 */
function testMergeCombinesMultipleTargetHexes(): void {
  const h0 = '8f283082dcb519f0';
  const h1 = '8f283082dcb519f1';
  const h2 = '8f283082dcb519f2';
  const h3 = '8f283082dcb519f3';
  const rows: PossibleActionTableRow[] = [
    fixtureRow({ targetH3: h0, distance: 2 }),
    fixtureRow({ targetH3: h1, distance: 2 }),
    fixtureRow({ targetH3: h2, distance: 2 }),
    fixtureRow({ targetH3: h3, distance: 2 }),
  ];
  const merged = mergeThisTurnOptionsRowsForBriefing(rows);
  assert.strictEqual(merged.length, 1);
  const m = merged[0]!;
  assert.strictEqual(m.targetH3, h0);
  assert.deepStrictEqual(m.coTargetH3Indexes, [h1, h2, h3]);
}

/**
 * Documents the function binding `testMergeDoesNotCombineDifferentEnemySummary` (testMergeDoesNotCombineDifferentEnemySummary).
 *
 * Purpose: Different target-units column text must stay separate rows.
 * When to use: Same merge helper as `testMergeCombinesMultipleTargetHexes`.
 * Expected outcome: Two output rows.
 * Exceptions: None.
 */
function testMergeDoesNotCombineDifferentEnemySummary(): void {
  const rows: PossibleActionTableRow[] = [
    fixtureRow({ targetH3: '8f283082dcb519a0', enemySummary: 'H1' }),
    fixtureRow({ targetH3: '8f283082dcb519a1', enemySummary: 'H2' }),
  ];
  const merged = mergeThisTurnOptionsRowsForBriefing(rows);
  assert.strictEqual(merged.length, 2);
}

/**
 * Documents the function binding `testDeriveActionColumnMoveMelee` (testDeriveActionColumnMoveMelee).
 *
 * Purpose: Smoke test for exported action label helper.
 * When to use: Same module as merge tests.
 * Expected outcome: `move/melee` for standard move row.
 * Exceptions: None.
 */
function testDeriveActionColumnMoveMelee(): void {
  assert.strictEqual(deriveThisTurnOptionsActionColumn(fixtureRow({})), 'move/melee');
}

/**
 * Documents the function binding `main` (main).
 *
 * Purpose: Node test driver for this file.
 * When to use: `node dist/main/openrouter/possibleUnitActionsTableAssembly.test.js`.
 * Expected outcome: All tests pass; prints success line.
 * Exceptions: Propagates assertion errors.
 */
function main(): void {
  testMergeCombinesMultipleTargetHexes();
  testMergeDoesNotCombineDifferentEnemySummary();
  testDeriveActionColumnMoveMelee();
  console.log('possibleUnitActionsTableAssembly tests passed');
}

main();
