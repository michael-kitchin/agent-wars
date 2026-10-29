/**
 * Fortification sentences in the combat and production rules.
 *
 * Purpose: Strategic consultations always hear the combat rule. A battle hears it only when a cell is fortified. The cost stays on the production line.
 * When to use: After changing `buildFortificationRule` or `buildFortificationProductionRulePart`.
 * Expected outcome: The cases below. The global map costs 20.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ORIGIN_BONUS_OFF } from '../../../shared/originBonusRules';
import { buildFortificationProductionRulePart, buildFortificationRule } from './gameRuleFortificationText';
import type { GameRuleTextGates } from './gameRuleText';

/**
 * Gates with the fields the fortification rule reads.
 *
 * Purpose: The other gate fields are unused by this rule.
 * When to use: Each case in this file.
 * Expected outcome: A strategic gate unless the case overrides it.
 * Exceptions: None.
 */
function gates(overrides: Partial<GameRuleTextGates> = {}): GameRuleTextGates {
  return {
    coordinateMode: 'strategic',
    hasAirUnits: false,
    hasNavalUnits: false,
    ordersEnabled: false,
    originBonusSettings: ORIGIN_BONUS_OFF,
    ...overrides,
  };
}

test('the strategic rule is present and the tactical rule waits for a fortified cell', () => {
  const strategic = buildFortificationRule(gates());
  assert.ok(strategic?.startsWith('Fortifications: a hex\'s controller may fortify'));
  assert.equal(buildFortificationRule(gates({ coordinateMode: 'tactical' })), null);
  assert.ok(buildFortificationRule(gates({ coordinateMode: 'tactical', hasFortifiedCells: true }))?.includes('Fortified cells'));
});

test('the production part names the global-map cost', () => {
  assert.ok(buildFortificationProductionRulePart().includes('fortification cost 20 per city cell'));
});
