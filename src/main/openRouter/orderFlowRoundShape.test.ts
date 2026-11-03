/**
 * Contract tests for the per-round `tool_choice`, schema, and legal-answer rule.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveOrderFlowRoundShape } from './orderFlowRoundShape';

/**
 * Verifies every tool round allows a tool call or the envelope, with the schema attached.
 *
 * Purpose: Forcing a tool call before the envelope made models spend the round cap on routing calls the
 * briefing had already answered.
 * When to use: After changing `resolveOrderFlowRoundShape`.
 * Expected outcome: No tools gives no `tool_choice`, the schema, and orders only. Tools give the schema and
 * either answer, with `auto` when `tool_choice` is supported and no `tool_choice` when it is not.
 * Exceptions: Assertion failure on contract drift.
 */
test('round shape allows the envelope on the first tool round', () => {
  const shapeFor = (toolCount: number, toolChoiceSupported: boolean) =>
    resolveOrderFlowRoundShape({ toolCount, toolChoiceSupported });
  assert.deepEqual(shapeFor(0, true), {
    toolChoice: null,
    attachResponseFormat: true,
    answerShape: 'orders',
  });
  assert.deepEqual(shapeFor(2, true), {
    toolChoice: 'auto',
    attachResponseFormat: true,
    answerShape: 'toolCallOrOrders',
  });
  assert.deepEqual(shapeFor(2, false), {
    toolChoice: null,
    attachResponseFormat: true,
    answerShape: 'toolCallOrOrders',
  });
});
