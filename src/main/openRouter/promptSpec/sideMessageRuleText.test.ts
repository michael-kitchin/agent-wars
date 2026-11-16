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
import { sideMessageRuleBlock } from './sideMessageRuleText';

test('talk off leaves out only the diplomacy sentence', () => {
  const on = sideMessageRuleBlock({ talkStageEnabled: true });
  const off = sideMessageRuleBlock({ talkStageEnabled: false });
  assert.ok(on.endsWith('You answer messages in the diplomacy step, not in your orders. Nothing in your orders reply is sent to another side.'));
  assert.equal(off.includes('diplomacy step'), false);
  assert.ok(off.endsWith('Nothing in your orders reply is sent to another side.'));
  assert.equal(off.includes('Every message in the Messages section was written'), true);
  assert.equal(off.includes('A message is its sender\'s claim'), true);
  assert.equal(on.includes('A loss line in Recent Turn Notes is a fact reported by the game'), true);
  assert.equal(off.includes('A loss line in Recent Turn Notes is a fact reported by the game'), true);
  assert.equal(/\d/.test(on), false);
  assert.equal(/\d/.test(off), false);
});
