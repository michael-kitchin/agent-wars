/**
 * Unit tests for Best Options This Turn table assembly helpers (`deriveThisTurnOptionsActionColumn`, row priority inputs).
 *
 * Purpose: Locks action-column labels and documents that Best Options This Turn tables no longer merge multiple target hexes into one row.
 * When to use: `npm test` after `build:main`.
 * Expected outcome: `deriveThisTurnOptionsActionColumn` returns stable labels; merged multi-hex rows are not produced by this module.
 * Exceptions: Assertion failures indicate regression in action column derivation.
 */

import assert from 'node:assert/strict';
import { deriveThisTurnOptionsActionColumn, selectTopRowsPerUnit, type PossibleActionTableRow } from './possibleUnitActionsTableAssembly';

/**
 * Documents the function binding `fixtureRow` (fixtureRow).
 *
 * Purpose: Builds a minimal `PossibleActionTableRow` with overridable fields for assembly tests.
 * When to use: Only inside this test module.
 * Expected outcome: Valid row with defaults for priority / action column checks.
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
 * Documents the function binding `testSelectTopRowsPerUnitKeepsDistinctHexRows` (testSelectTopRowsPerUnitKeepsDistinctHexRows).
 *
 * Purpose: Ensures four same-context rows stay four rows after per-unit capping (no merge step in this module).
 * When to use: Regression guard after removing `mergeThisTurnOptionsRowsForBriefing`.
 * Expected outcome: `selectTopRowsPerUnit` returns four rows for one unit when under the per-unit cap.
 * Exceptions: None.
 */
function testSelectTopRowsPerUnitKeepsDistinctHexRows(): void {
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
  const latLngByH3 = new Map<string, [number, number]>();
  const capped = selectTopRowsPerUnit(rows, latLngByH3);
  assert.strictEqual(capped.length, 4);
  const hexes = new Set(capped.map((r) => r.targetH3));
  assert.strictEqual(hexes.size, 4);
}

/**
 * Documents the function binding `testDeriveActionColumnMoveMelee` (testDeriveActionColumnMoveMelee).
 *
 * Purpose: Smoke test for exported action label helper.
 * When to use: Same module as priority tests.
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
  testSelectTopRowsPerUnitKeepsDistinctHexRows();
  testDeriveActionColumnMoveMelee();
  console.log('possibleUnitActionsTableAssembly tests passed');
}

main();
