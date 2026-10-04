import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildUnitStatusTable } from './briefingFormatter';
import type { UnitAssessmentResult } from './precomputation';

/**
 * Builds a quiet strategic assessment with optional origin bonus reasons and amount.
 *
 * Purpose: The Bonus column depends only on `unit.originBonusHere` and `unit.originBonusAmount`.
 * When to use: In the tests below.
 * Expected outcome: A minimal `UnitAssessmentResult` with no enemies or threats.
 * Exceptions: None.
 */
function assessment(
  unitId: string,
  originBonusHere?: Array<'country' | 'terrain'>,
  originBonusAmount: 0 | 1 | 2 = 0
): UnitAssessmentResult {
  return {
    unitId,
    result: {
      status: 'ok',
      unit: {
        unitId,
        type: 'infantry',
        position: [3, 3],
        currentStandingOrder: null,
        ...(originBonusHere ? { originBonusHere, originBonusAmount } : {}),
      },
      nearbyEnemies: [],
      threats: [],
      canAttackThisTurn: [],
    },
  };
}

test('the Bonus column appears when an assessment carries origin bonus reasons', () => {
  const table = buildUnitStatusTable(
    [assessment('opp-a', ['country'], 1), assessment('opp-b', []), assessment('opp-c', ['country'], 2)],
    { mode: 'strategic' },
    true
  );
  const [header, , rowA, rowB, rowC] = table.split('\n');
  assert.equal(header, '| Unit ID | Type | Hex | Bonus | Nearest enemy + distance | Threat severity | Action needed |');
  assert.ok(rowA?.includes('| +1 country |'), rowA);
  assert.ok(rowB?.includes('| — |'), rowB);
  assert.ok(rowC?.includes('| +2 country |'), rowC);
});

test('the Weather column names the weather where the unit stands and its tags', () => {
  const tagged = assessment('opp-a');
  tagged.result.unit.weatherHere = 'mild';
  tagged.result.unit.weatherTags = ['heat'];
  const plain = assessment('opp-b');
  plain.result.unit.weatherHere = 'snow';
  plain.result.unit.weatherTags = [];
  const table = buildUnitStatusTable([tagged, plain], { mode: 'strategic' }, true);
  const [header, , rowA, rowB] = table.split('\n');
  assert.ok(header?.includes('| Weather |'));
  assert.ok(rowA?.includes('| Mild (Heat) |'), rowA);
  assert.ok(rowB?.includes('| Snow |'), rowB);
});

test('the table is unchanged when no assessment carries origin bonus reasons', () => {
  const table = buildUnitStatusTable([assessment('opp-a')], { mode: 'strategic' }, true);
  assert.equal(
    table.split('\n')[0],
    '| Unit ID | Type | Hex | Nearest enemy + distance | Threat severity | Action needed |'
  );
});
