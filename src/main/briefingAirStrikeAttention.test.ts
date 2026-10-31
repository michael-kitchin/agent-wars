/**
 * Strategic attention for an air unit whose Best Options row is an air strike.
 *
 * Purpose: An infrastructure strike does not create an enemy-unit attack row, and a healthy defend order must not hide it.
 * When to use: After edits to Action needed or the armed-units bullet.
 * Expected outcome: The air unit is yes, not quiet, and named on the armed bullet. An empty set and a tactical call leave it off. Infantry in the set stays quiet.
 * Exceptions: AssertionError on contract drift.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ORIGIN_BONUS_OFF } from '../shared/originBonusRules';
import { buildAttentionFlags, buildUnitStatusTable } from './briefingFormatter';
import type { UnitAssessmentResult } from './precomputation';

/**
 * One unit holding a healthy defend order and with no enemy-unit attack row.
 *
 * Purpose: The air-strike cases need a standing order that would otherwise read quiet.
 * When to use: Each case in this file.
 * Expected outcome: `currentStandingOrder.status` is `holding`, and `canAttackThisTurn` is empty.
 * Exceptions: None.
 */
function holdingAssessment(unitId: string, unitType: string): UnitAssessmentResult {
  return {
    unitId,
    result: {
      status: 'ok',
      unit: { unitId, type: unitType, currentStandingOrder: { status: 'holding' } },
      nearbyEnemies: [],
      threats: [],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  };
}

/**
 * The Unit Status row for one unit.
 *
 * Purpose: The action cell is easier to check on one row than on the whole table.
 * When to use: After `buildUnitStatusTable`.
 * Expected outcome: The markdown row.
 * Exceptions: AssertionError when the unit is missing.
 */
function statusRow(table: string, unitId: string): string {
  const row = table.split('\n').find((line) => line.includes(unitId));
  assert.ok(row, `expected a Unit Status row for ${unitId}`);
  return row;
}

test('an air unit with a listed air strike is action needed and named on the armed bullet', () => {
  const unitId = 'a1-a10';
  const assessment = holdingAssessment(unitId, 'air');
  const strikes = new Set([unitId]);
  const row = statusRow(
    buildUnitStatusTable([assessment], { mode: 'strategic' }, true, ORIGIN_BONUS_OFF, undefined, strikes),
    unitId
  );
  assert.ok(row.includes('| yes |'), row);
  assert.equal(row.includes('quiet'), false, row);
  const flags = buildAttentionFlags([assessment], 'strategic', true, undefined, strikes);
  assert.match(flags, new RegExp(unitId));
  assert.match(flags, /air-strike/);
});

test('an air unit with a healthy defend order stays quiet when no air strike is listed', () => {
  const unitId = 'a1-a10';
  const assessment = holdingAssessment(unitId, 'air');
  const row = statusRow(
    buildUnitStatusTable([assessment], { mode: 'strategic' }, true, ORIGIN_BONUS_OFF, undefined, new Set()),
    unitId
  );
  assert.match(row, /no \(quiet\)/);
  const flags = buildAttentionFlags([assessment], 'strategic', true, undefined, new Set());
  assert.equal(flags.includes(unitId), false);
});

test('a tactical attention call that omits the air-strike set leaves the air unit off the list', () => {
  const unitId = 'a1-a10';
  const flags = buildAttentionFlags([holdingAssessment(unitId, 'air')], 'tactical', false);
  assert.equal(flags.includes(unitId), false);
});

test('an infantry id in the air-strike set stays quiet and off the armed bullet', () => {
  const unitId = 'a1-i9';
  const assessment = holdingAssessment(unitId, 'infantry');
  const strikes = new Set([unitId]);
  const row = statusRow(
    buildUnitStatusTable([assessment], { mode: 'strategic' }, true, ORIGIN_BONUS_OFF, undefined, strikes),
    unitId
  );
  assert.match(row, /no \(quiet\)/);
  const flags = buildAttentionFlags([assessment], 'strategic', true, undefined, strikes);
  assert.equal(flags, 'None.');
});
