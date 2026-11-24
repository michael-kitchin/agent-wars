/**
 * Mercenary prompt sentences use the global upkeep table and the active credits price.
 *
 * Purpose: A regional map must not change the upkeep the model is told.
 * When to use: After changing the mercenary rule text.
 * Expected outcome: The credits sentence and the upkeep list below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREDITS_PER_ITEM } from '../../../shared/creditsRules';
import { creditsItemCost } from '../../../shared/gameRules';
import {
  buildCreditsCountGuidance,
  buildCreditsProductionRulePart,
  buildMercenaryRule,
  MERCENARY_ENVELOPE_ROWS_SENTENCE,
  MERCENARY_FUNDS_WARNING_ACTION,
} from './gameRuleMercenaryText';
import { SECTION_TITLE_MERCENARIES } from './sectionHeadings';

test('the credits rule names the global item price and the credits it adds', () => {
  assert.ok(buildCreditsProductionRulePart().includes('costs 20 production points and adds 20 credits'));
});

test('the mercenary rule lists basic and Advanced upkeep', () => {
  assert.ok(buildMercenaryRule().includes('infantry 5 (Advanced 10), armor 10 (20), naval 25 (50), air 15 (30)'));
});

test('the mercenary rule has five one-line paragraphs, the last two about firing', () => {
  const parts = buildMercenaryRule().split('\n\n');
  assert.equal(parts.length, 5);
  assert.ok(parts.every((part) => !part.includes('\n')));
  assert.ok(parts[3]?.startsWith('To fire a mercenary, add a dismiss_mercenary row to productionOrders. It turns Neutral at once'));
  assert.ok(parts[4]?.startsWith('A fired unit left alone in a cell takes the cell for Neutral'));
});

test('the envelope sentence and the funds action name the fire row', () => {
  assert.equal(
    MERCENARY_ENVELOPE_ROWS_SENTENCE,
    'To hire, add {"action":"raise_mercenaries","hex":"<code>","unitType":"infantry","count":1} or {"action":"rehire_mercenary","unitId":"<id>"} rows to productionOrders. To fire a mercenary, add {"action":"dismiss_mercenary","unitId":"<id>"}.'
  );
  assert.equal(
    MERCENARY_FUNDS_WARNING_ACTION,
    'Queue more credits, and do not raise or rehire mercenaries this turn. Firing a mercenary you can spare also stops its upkeep.'
  );
});

test('the credits count guidance names the item economics and a larger count', () => {
  const cost = creditsItemCost();
  assert.equal(
    buildCreditsCountGuidance(),
    `A credits row adds ${CREDITS_PER_ITEM} credits for each ${cost} production points it spends, and it stops when its count runs out. For steady income, give it a larger count, unless the ${SECTION_TITLE_MERCENARIES} section says your credits are more than you need. A city makes one production point per city cell each turn, so a count of 10 in a city with ${cost} city cells lasts about 10 turns.`
  );
  assert.ok(buildCreditsCountGuidance().includes('unless the Mercenaries section says your credits are more than you need'));
});
