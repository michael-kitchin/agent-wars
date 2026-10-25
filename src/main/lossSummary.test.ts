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
 * Purpose: Guards the popup rule that three of one type stay named.
 * When to use: Run after changing `formatLossEntries`.
 * Expected outcome: Names joined with commas when one type has three victims.
 * Exceptions: None.
 */
function testListWhenFiveOrFewer(): void {
  const text = formatLossEntries(sampleUnits(3));
  assert.strictEqual(text, 'Unit1, Unit2, Unit3');
}

/**
 * Verifies a type past three collapses, and a type of three stays named.
 *
 * Purpose: Guards the popup per-type collapse.
 * When to use: Run after changing `formatLossEntries`.
 * Expected outcome: Four infantry read `4x Infantry`. Six infantry read `6x Infantry`.
 * Exceptions: None.
 */
function testGroupedWhenMoreThanThreeOfOneType(): void {
  assert.strictEqual(formatLossEntries(sampleUnits(4)), '4x Infantry');
  assert.strictEqual(formatLossEntries(sampleUnits(6)), '6x Infantry');
}

/**
 * Verifies grouped totals omit zero groups and follow Naval/Air/Armored/Infantry order.
 *
 * Purpose: Protects mixed-type grouping labels including Armored spelling.
 * When to use: Run after changing `GROUP_ORDER` or label map.
 * Expected outcome: Named naval units first, then `4x Armored`. Zero groups are omitted.
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
  assert.strictEqual(text, 'B, F, 4x Armored');
}

/**
 * Verifies four of two types collapse in naval-then-armor order, and six named units stay named.
 *
 * Purpose: Mixed lines must not collapse a type that is still at the name cap.
 * When to use: Run after changing `formatLossEntries`.
 * Expected outcome: `4x Naval, 4x Armored`, and six interleaved names with no `x`.
 * Exceptions: None.
 */
function testMixedCollapseAndNameCap(): void {
  const collapsed: LostUnit[] = [
    ...sampleUnits(4, 'naval'),
    ...sampleUnits(4, 'armor'),
  ];
  assert.strictEqual(formatLossEntries(collapsed), '4x Naval, 4x Armored');
  const named: LostUnit[] = [
    { unitType: 'infantry', displayName: 'I1' },
    { unitType: 'armor', displayName: 'A1' },
    { unitType: 'infantry', displayName: 'I2' },
    { unitType: 'armor', displayName: 'A2' },
    { unitType: 'infantry', displayName: 'I3' },
    { unitType: 'armor', displayName: 'A3' },
  ];
  assert.strictEqual(formatLossEntries(named), 'I1, A1, I2, A2, I3, A3');
}

/**
 * Verifies a type outside the four stays a name.
 *
 * Purpose: An unexpected type must not disappear from the popup line.
 * When to use: Run after changing `formatLossEntries`.
 * Expected outcome: The four display names, in input order.
 * Exceptions: None.
 */
function testUnknownTypeStaysNamed(): void {
  const units: LostUnit[] = Array.from({ length: 4 }, (_, index) => ({
    unitType: 'transport' as unknown as LostUnit['unitType'],
    displayName: `T${index + 1}`,
  }));
  assert.strictEqual(formatLossEntries(units), 'T1, T2, T3, T4');
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
    ranged: [{ unitType: 'infantry', displayName: 'A', unitId: 'human-inf-1' }],
    melee: [{ unitType: 'armor', displayName: 'B', unitId: 'human-armor-1' }],
    returnFire: [],
    airStrike: [],
    other: [],
  };
  assert.strictEqual(
    formatPlayerLossInline(summary),
    'Ranged attack: human-inf-1; Melee attack: human-armor-1'
  );
}

/**
 * Verifies prompt loss lines never fall back to display names when snapshot ids are missing.
 *
 * Purpose: Older persisted rows may have only `displayName`. Grouped type totals keep the prompt on one identity scheme.
 * When to use: Run after changing `formatLossEntriesForPrompt`.
 * Expected outcome: Grouped totals; display names absent even for a short list.
 * Exceptions: None.
 */
function testInlineWithoutUnitIdsUsesGroupedTypesNotDisplayNames(): void {
  const summary: PlayerLossSummary = {
    ranged: [{ unitType: 'infantry', displayName: 'IX Fleet' }],
    melee: [
      { unitType: 'armor', displayName: 'A', unitId: 'human-armor-1' },
      { unitType: 'infantry', displayName: 'B' },
    ],
    returnFire: [],
    airStrike: [],
    other: [],
  };
  const text = formatPlayerLossInline(summary);
  assert.strictEqual(text, 'Ranged attack: 1 Infantry; Melee attack: 1 Armored, 1 Infantry');
  assert.ok(!text.includes('IX Fleet'), 'prompt losses must not use display names');
  assert.ok(!text.includes('human-armor-1'), 'partial ids fall back to grouped totals, not a mixed list');
  const six = formatPlayerLossInline({
    ...summary,
    ranged: sampleUnits(6),
    melee: [],
  });
  assert.strictEqual(six, 'Ranged attack: 6 Infantry');
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
  testGroupedWhenMoreThanThreeOfOneType();
  testGroupedOrderAndZeroOmission();
  testMixedCollapseAndNameCap();
  testUnknownTypeStaysNamed();
  testMultilineCauseOrderAndSuppression();
  testInlineJoinsWithSemicolons();
  testInlineWithoutUnitIdsUsesGroupedTypesNotDisplayNames();
  console.log('lossSummary.test.ts passed');
}

run();
