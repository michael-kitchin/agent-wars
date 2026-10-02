/**
 * Contract tests for the per-round `tool_choice`, schema, and legal-answer rule.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveOrderFlowRoundShape } from './orderFlowRoundShape';

/**
 * Verifies the forced-tool round carries no schema and later rounds allow it.
 *
 * Purpose: The envelope is not a legal answer on a `required` round, and some providers reject the schema there;
 * after the first tool call the model must be able to submit the envelope with the schema.
 * When to use: After changing `resolveOrderFlowRoundShape`.
 * Expected outcome: No tools gives no `tool_choice`, the schema, and orders only; before a tool call, no schema
 * (`required` with tool call only, or `auto` once rejected, or none when unsupported); after a tool call, the schema
 * with `auto` or none when unsupported. Every round that offers tools without `required` allows either answer.
 * Exceptions: Assertion failure on contract drift.
 */
test('round shape forces a schema-free tool call first, then allows the schema', () => {
  const shapeFor = (
    toolCount: number,
    hasCalledTool: boolean,
    requiredToolChoiceRejected: boolean,
    toolChoiceSupported: boolean
  ) => resolveOrderFlowRoundShape({ toolCount, hasCalledTool, requiredToolChoiceRejected, toolChoiceSupported });
  assert.deepEqual(shapeFor(0, false, false, true), {
    toolChoice: null,
    attachResponseFormat: true,
    answerShape: 'orders',
  });
  assert.deepEqual(shapeFor(2, false, false, true), {
    toolChoice: 'required',
    attachResponseFormat: false,
    answerShape: 'toolCall',
  });
  assert.deepEqual(shapeFor(2, true, false, true), {
    toolChoice: 'auto',
    attachResponseFormat: true,
    answerShape: 'toolCallOrOrders',
  });
  assert.deepEqual(shapeFor(2, false, true, true), {
    toolChoice: 'auto',
    attachResponseFormat: false,
    answerShape: 'toolCallOrOrders',
  });
  assert.deepEqual(shapeFor(2, false, false, false), {
    toolChoice: null,
    attachResponseFormat: false,
    answerShape: 'toolCallOrOrders',
  });
  assert.deepEqual(shapeFor(2, true, false, false), {
    toolChoice: null,
    attachResponseFormat: true,
    answerShape: 'toolCallOrOrders',
  });
});
