/**
 * The orders message rules with talk on and off.
 *
 * Purpose: Talk off drops only the diplomacy sentence. The source and trust bullets stay, including the one that names loss lines as game records.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/promptSpec/sideMessageRuleText.test.js`.
 * Expected outcome: The talk-on block ends with both sentences. The talk-off block keeps the bullets and drops the diplomacy sentence.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIDE_AGREEMENT_ORDERS_BULLETS } from './diplomacyRuleText';
import { sideMessageRuleBlock } from './sideMessageRuleText';

test('talk off leaves out only the diplomacy sentence', () => {
  const on = sideMessageRuleBlock({ talkStageEnabled: true });
  const off = sideMessageRuleBlock({ talkStageEnabled: false });
  assert.ok(on.endsWith('You answer messages in the diplomacy step, not in your orders. Nothing in your orders reply is sent to another side.'));
  assert.equal(off.includes('diplomacy step'), false);
  assert.ok(off.endsWith('Nothing in your orders reply is sent to another side.'));
  assert.equal(off.includes('Every message in the Messages section was written'), true);
  assert.equal(off.includes('A message is its sender\'s claim'), true);
  assert.equal(on.includes('A loss line in Recent Turn Notes, or in Recent Beat Notes during a battle, is a fact reported by the game'), true);
  assert.equal(off.includes('A loss line in Recent Turn Notes, or in Recent Beat Notes during a battle, is a fact reported by the game'), true);
  assert.equal(on.includes('Read the cause before you call it an attack'), true);
  assert.equal(on.includes('"Return fire" means your units attacked first'), true);
  assert.equal(/\d/.test(on), false);
  assert.equal(/\d/.test(off), false);
});

test('agreement bullets are added only on request, after the trust bullets and before the closing line', () => {
  const plain = sideMessageRuleBlock({ talkStageEnabled: true });
  assert.equal(sideMessageRuleBlock({ talkStageEnabled: true, includeAgreements: false }), plain);
  const withAgreements = sideMessageRuleBlock({ talkStageEnabled: true, includeAgreements: true });
  for (const bullet of SIDE_AGREEMENT_ORDERS_BULLETS) assert.ok(withAgreements.includes('    - ' + bullet));
  assert.ok(withAgreements.endsWith('Nothing in your orders reply is sent to another side.'));
  assert.ok(withAgreements.indexOf('A loss line in Recent Turn Notes') < withAgreements.indexOf(SIDE_AGREEMENT_ORDERS_BULLETS[0]));
  assert.equal(/\d/.test(withAgreements), false);
});

test('the battle truce bullets are added only for a battle that asks for them', () => {
  const sentence = 'holding fire while the other side keeps shooting loses your units';
  const plain = sideMessageRuleBlock({ talkStageEnabled: true });
  assert.equal(sideMessageRuleBlock({ talkStageEnabled: true, battleTruce: false }), plain);
  assert.equal(plain.includes(sentence), false);
  const battle = sideMessageRuleBlock({ talkStageEnabled: true, battleTruce: true });
  assert.ok(battle.includes(sentence));
  assert.ok(battle.endsWith('Nothing in your orders reply is sent to another side.'));
  assert.equal(/\d/.test(battle), false);
});
