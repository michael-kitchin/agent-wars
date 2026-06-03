/**
 * Tests for shared loss summary formatters. Run with: node dist/main/lossSummary.test.js
 */

import assert from 'node:assert/strict';
import {
  formatLossEntries,
  formatPlayerLossInline,
  formatPlayerLossLinesMultiline,
  type LostUnit,
  type PlayerLossSummary,
} from '../shared/lossSummary';

/**
 * Builds sample {@link LostUnit} rows for formatter threshold tests.
 *
 * Purpose: Reduces duplication in loss summary formatter tests.
 * When to use: List vs grouped-count test cases in this module.
 * Expected outcome: `n` units sharing one type and sequential display names.
 * Exceptions: None.
 */
function sampleUnits(n: number, type: LostUnit['unitType'] = 'infantry'): LostUnit[] {
  return Array.from({ length: n }, (_, i) => ({ unitType: type, displayName: `Unit${i + 1}` }));
}

/**
 * Verifies short lists use comma-separated display names.
 *
 * Purpose: Guards the ≤5 entry list contract.
 * When to use: Run after changing `formatLossEntries`.
 * Expected outcome: Names joined with commas when count ≤ 5.
 * Exceptions: None.
 */
function testListWhenFiveOrFewer(): void {
  const text = formatLossEntries(sampleUnits(3));
  assert.strictEqual(text, 'Unit1, Unit2, Unit3');
}

/**
 * Verifies crowded lines switch to grouped type totals.
 *
 * Purpose: Guards the >5 grouped totals contract.
 * When to use: Run after changing group labels or order.
 * Expected outcome: Shows `6 Infantry` for six infantry victims.
 * Exceptions: None.
 */
function testGroupedWhenMoreThanFive(): void {
  const text = formatLossEntries(sampleUnits(6));
  assert.strictEqual(text, '6 Infantry');
}

/**
 * Verifies grouped totals omit zero groups and follow Naval/Air/Armored/Infantry order.
 *
 * Purpose: Protects mixed-type grouping labels including Armored spelling.
 * When to use: Run after changing `GROUP_ORDER` or label map.
 * Expected outcome: `1 Naval, 2 Armored` with no zero groups.
 * Exceptions: None.
 */
function testGroupedOrderAndZeroOmission(): void {
  const units: LostUnit[] = [
    { unitType: 'armor', displayName: 'A' },
    { unitType: 'naval', displayName: 'B' },
    { unitType: 'armor', displayName: 'C' },
    { unitType: 'armor', displayName: 'D' },
    { unitType: 'armor', displayName: 'E' },
    { unitType: 'naval', displayName: 'F' },
  ];
  const text = formatLossEntries(units);
  assert.strictEqual(text, '2 Naval, 4 Armored');
}

/**
 * Verifies multiline formatter suppresses empty causes and orders Other losses last.
 *
 * Purpose: Protects popup cause line ordering.
 * When to use: Run after changing `CAUSE_SPECS`.
 * Expected outcome: Ranged first, Other losses last; empty buckets omitted.
 * Exceptions: None.
 */
function testMultilineCauseOrderAndSuppression(): void {
  const summary: PlayerLossSummary = {
    ranged: [{ unitType: 'infantry', displayName: 'X' }],
    melee: [],
    returnFire: [{ unitType: 'armor', displayName: 'Y' }],
    airStrike: [],
    other: [{ unitType: 'naval', displayName: 'Z' }],
  };
  const lines = formatPlayerLossLinesMultiline(summary);
  assert.deepStrictEqual(
    lines.map((l) => l.causeLabel),
    ['Ranged attack', 'Return fire', 'Other losses']
  );
}

/**
 * Verifies inline formatter joins cause lines with semicolons.
 *
 * Purpose: Protects prompt recent-turn loss bullet formatting.
 * When to use: Run after changing `formatPlayerLossInline`.
 * Expected outcome: Semicolon-separated `Cause: victims` pairs.
 * Exceptions: None.
 */
function testInlineJoinsWithSemicolons(): void {
  const summary: PlayerLossSummary = {
    ranged: [{ unitType: 'infantry', displayName: 'A' }],
    melee: [{ unitType: 'armor', displayName: 'B' }],
    returnFire: [],
    airStrike: [],
    other: [],
  };
  assert.strictEqual(
    formatPlayerLossInline(summary),
    'Ranged attack: A; Melee attack: B'
  );
}

/**
 * Runs all loss summary formatter tests.
 *
 * Purpose: Single entrypoint for the Node test runner manifest.
 * When to use: Invoked at module load by `node dist/main/lossSummary.test.js`.
 * Expected outcome: Throws on first assertion failure; logs pass message when all succeed.
 * Exceptions: Propagates assertion errors from individual cases.
 */
function run(): void {
  testListWhenFiveOrFewer();
  testGroupedWhenMoreThanFive();
  testGroupedOrderAndZeroOmission();
  testMultilineCauseOrderAndSuppression();
  testInlineJoinsWithSemicolons();
  console.log('lossSummary.test.ts passed');
}

run();
