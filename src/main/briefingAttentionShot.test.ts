import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAttentionFlags } from './briefingFormatter';
import type { UnitAssessmentResult } from './precomputation';

/**
 * Builds one assessment whose only listed attack is the given type.
 *
 * Purpose: The armed-units bullet depends on attack type and unit type, not on the rest of the assessment.
 * When to use: The tests in this file.
 * Expected outcome: A minimal assessment with one nearby enemy and one `canAttackThisTurn` row.
 * Exceptions: None.
 */
function contacted(
  unitId: string,
  unitType: string,
  attackType: string
): UnitAssessmentResult {
  return {
    unitId,
    result: {
      status: 'ok',
      unit: {
        unitId,
        type: unitType,
        position: [1, 1],
        currentStandingOrder: null,
      },
      nearbyEnemies: [
        {
          unitId: 'hum-1',
          hexDistance: attackType === 'melee' ? 0 : 1,
          inRangedRange: unitType !== 'infantry',
          inMeleeRange: attackType === 'melee',
        } as UnitAssessmentResult['result']['nearbyEnemies'][0],
      ],
      threats: [{ description: 'contact', severity: 'critical', sourceUnit: 'hum-1' }],
      canAttackThisTurn: [{ unitId: 'hum-1', attackType, reason: '' }],
    },
  } as unknown as UnitAssessmentResult;
}

test('the strategic shot list omits infantry and keeps units that can fire', () => {
  const infantryContact = contacted('a1-i1', 'infantry', 'melee');
  const flags = buildAttentionFlags(
    [
      infantryContact,
      contacted('a1-i2', 'infantry', 'ranged'),
      contacted('a1-t2', 'armor', 'ranged'),
      contacted('a1-t4', 'armor', 'melee'),
      contacted('a1-a1', 'air', 'melee'),
    ],
    'strategic',
    true
  );
  const shot = flags.split('\n').find((line) => line.includes('legal attack')) ?? '';
  assert.ok(shot.includes('a1-t2'), shot);
  assert.ok(shot.includes('a1-t4'), shot);
  assert.ok(shot.includes('a1-a1'), shot);
  assert.ok(shot.includes('air strike'), shot);
  assert.equal(shot.includes('a1-i1'), false, shot);
  assert.equal(shot.includes('a1-i2'), false, shot);
  assert.ok(flags.includes('a1-i1'), 'infantry in contact stays on a threat bullet');
});

test('a tactical infantry shot stays on the armed-units bullet', () => {
  const flags = buildAttentionFlags([contacted('a1-i1-s6', 'infantry', 'ranged')], 'tactical', false);
  const shot = flags.split('\n').find((line) => line.includes('legal attack')) ?? '';
  assert.ok(shot.includes('a1-i1-s6'), shot);
  assert.ok(shot.includes('this beat'), shot);
});
