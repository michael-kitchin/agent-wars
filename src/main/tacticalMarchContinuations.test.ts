/**
 * Tests for tactical march continuation filtering. Run with: node dist/main/tacticalMarchContinuations.test.js
 */

import assert from 'node:assert/strict';
import { filterTacticalMarchContinuationsToPresentSubUnits } from '../shared/tacticalMarchContinuations';

/**
 * Verifies that continuations for living sub-units are kept in order.
 *
 * Purpose: Guards the happy path after a beat where every continuing marcher survived combat.
 * When to use: Run after changing `filterTacticalMarchContinuationsToPresentSubUnits`.
 * Expected outcome: Input rows whose ids are present are returned unchanged and in the same order.
 * Exceptions: None.
 */
function testKeepsPresentSubUnitsInOrder(): void {
  const present = new Set(['a', 'b', 'c']);
  const rows = [
    { subUnitId: 'a', destinationH3Index: 'h1' },
    { subUnitId: 'b', destinationH3Index: 'h2' },
  ];
  assert.deepStrictEqual(filterTacticalMarchContinuationsToPresentSubUnits(rows, present), rows);
}

/**
 * Verifies that continuations for removed sub-units are dropped.
 *
 * Purpose: Prevents post-melee / post-ranged Ready failures from re-queued dead marchers.
 * When to use: Run after changing continuation filtering used by tactical Ready commit.
 * Expected outcome: Only the living row remains when one of two continuation ids is absent.
 * Exceptions: None.
 */
function testDropsAbsentSubUnits(): void {
  const present = new Set(['survivor']);
  const rows = [
    { subUnitId: 'dead', destinationH3Index: 'h1' },
    { subUnitId: 'survivor', destinationH3Index: 'h2' },
  ];
  assert.deepStrictEqual(filterTacticalMarchContinuationsToPresentSubUnits(rows, present), [
    { subUnitId: 'survivor', destinationH3Index: 'h2' },
  ]);
}

/**
 * Verifies that an empty present set drops every continuation.
 *
 * Purpose: Covers total wipe / empty roster edge cases without throwing.
 * When to use: Run after changing empty-set handling in continuation filtering.
 * Expected outcome: Returns an empty array.
 * Exceptions: None.
 */
function testEmptyPresentSetDropsAll(): void {
  assert.deepStrictEqual(
    filterTacticalMarchContinuationsToPresentSubUnits(
      [{ subUnitId: 'x', destinationH3Index: 'h' }],
      new Set()
    ),
    []
  );
}

/**
 * Runs all tactical march continuation filter tests in declaration order.
 *
 * Purpose: Single entrypoint for the Node test runner manifest.
 * When to use: Invoked at module load by `node dist/main/tacticalMarchContinuations.test.js`.
 * Expected outcome: Throws on first assertion failure; logs pass message when all cases succeed.
 * Exceptions: Propagates assertion errors from individual test cases.
 */
function run(): void {
  testKeepsPresentSubUnitsInOrder();
  testDropsAbsentSubUnits();
  testEmptyPresentSetDropsAll();
  console.log('tacticalMarchContinuations.test.ts passed');
}

run();
