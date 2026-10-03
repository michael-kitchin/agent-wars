import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildUnitStatusTable } from './briefingFormatter';
import type { UnitAssessmentResult } from './precomputation';

/**
 * Builds a quiet strategic assessment with optional origin bonus reasons.
 *
 * Purpose: The Bonus column depends only on `unit.originBonusHere`.
 * When to use: In the tests below.
 * Expected outcome: A minimal `UnitAssessmentResult` with no enemies or threats.
 * Exceptions: None.
 */
function assessment(unitId: string, originBonusHere?: Array<'country' | 'terrain'>): UnitAssessmentResult {
  return {
    unitId,
    result: {
      status: 'ok',
      unit: {
        unitId,
        type: 'infantry',
        position: [3, 3],
        currentStandingOrder: null,
        ...(originBonusHere ? { originBonusHere } : {}),
      },
      nearbyEnemies: [],
      threats: [],
      canAttackThisTurn: [],
    },
  };
}

test('the Bonus column appears when an assessment carries origin bonus reasons', () => {
  const table = buildUnitStatusTable(
    [assessment('opp-a', ['country']), assessment('opp-b', [])],
    { mode: 'strategic' },
    true
  );
  const [header, , rowA, rowB] = table.split('\n');
  assert.equal(header, '| Unit ID | Type | Hex | Bonus | Nearest enemy + distance | Threat severity | Action needed |');
  assert.ok(rowA?.includes('| +1 country |'), rowA);
  assert.ok(rowB?.includes('| — |'), rowB);
});

test('the table is unchanged when no assessment carries origin bonus reasons', () => {
  const table = buildUnitStatusTable([assessment('opp-a')], { mode: 'strategic' }, true);
  assert.equal(
    table.split('\n')[0],
    '| Unit ID | Type | Hex | Nearest enemy + distance | Threat severity | Action needed |'
  );
});
