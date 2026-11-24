/**
 * Contract tests for the operation rule paragraphs about sea and air.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSpec/operationRuleText.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOperationRuleBlock } from './operationRuleText';

/**
 * The sentences that state the raid timeout rule.
 *
 * Purpose: Tests compare the block to one copy of the wording.
 * When to use: The sea paragraph cases.
 * Expected outcome: The two sentences appended to the sea paragraph, as rendered with the current constants.
 * Exceptions: None.
 */
const TIMEOUT_SENTENCES =
  'If the force has not gathered after 10 turns, it sails only when the ships at the port can carry at least 75% of its ground units, and is called off otherwise, so keep its ships with it. A campaign lift needs only its own minimum.';

test('the sea paragraph states the raid timeout rule', () => {
  const block = buildOperationRuleBlock(true);
  assert.ok(block.includes(TIMEOUT_SENTENCES));
  assert.match(block, /at least 75% of its ground units/);
});

test('the air paragraph says up to two infantry units', () => {
  assert.match(buildOperationRuleBlock(true), /By air, it marches up to 2 infantry units to an air unit's airport, loads them,/);
});

test('the sea paragraph is still one paragraph', () => {
  const sea = buildOperationRuleBlock(true).split('\n\n').find((paragraph) => paragraph.startsWith('By sea,'));
  assert.ok(sea);
  assert.ok(sea.includes(TIMEOUT_SENTENCES));
  assert.equal(sea.includes('\n'), false);
});
