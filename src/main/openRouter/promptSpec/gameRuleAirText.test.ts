/**
 * Contract tests for the air unit rule text.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSpec/gameRuleAirText.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ORIGIN_BONUS_OFF } from '../../../shared/originBonusRules';
import { buildAirEmploymentRule } from './gameRuleAirText';
import type { GameRuleTextGates } from './gameRuleText';

/**
 * Gates for an air rule case.
 *
 * Purpose: Each case overrides only the field under test.
 * When to use: Every case in this file.
 * Expected outcome: A complete gate object with air units present.
 * Exceptions: None.
 */
function gates(overrides: Partial<GameRuleTextGates> = {}): GameRuleTextGates {
  return {
    coordinateMode: 'strategic',
    hasAirUnits: true,
    hasNavalUnits: false,
    ordersEnabled: false,
    originBonusSettings: ORIGIN_BONUS_OFF,
    ...overrides,
  };
}

test('the strategic air rule has five paragraphs', () => {
  const paragraphs = buildAirEmploymentRule(gates()).split('\n\n');
  assert.equal(paragraphs.length, 5);
  assert.match(paragraphs[0], /^An air unit ferries any distance/);
  assert.match(paragraphs[3], /^airDrops lands/);
});

test('the battle air rule is one paragraph about the footprint', () => {
  const text = buildAirEmploymentRule(gates({ coordinateMode: 'tactical' }));
  assert.equal(text.includes('\n'), false);
  assert.match(text, /battle footprint/);
});

test('the air rule is empty without air units', () => {
  assert.equal(buildAirEmploymentRule(gates({ hasAirUnits: false })), '');
});

test('the strategic air rule carries two infantry and drops every unit aboard', () => {
  const paragraphs = buildAirEmploymentRule(gates()).split('\n\n');
  assert.match(paragraphs[2], /^It carries up to 2 infantry units\. embark with that air unit's id in navalUnitId loads one infantry unit on the same hex; give one embark row per unit\./);
  assert.match(paragraphs[3], /^airDrops lands every infantry unit aboard on a land hex within \d+ of the current airport/);
  assert.match(paragraphs[3], /if they do, all of that infantry is lost\./);
});

test('the battle air rule carries two infantry sub-units and drops all of them', () => {
  const text = buildAirEmploymentRule(gates({ coordinateMode: 'tactical' }));
  assert.match(text, /An air sub-unit carries up to 2 infantry sub-units, and a drop lands all of them\./);
});
