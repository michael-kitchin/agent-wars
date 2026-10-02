/**
 * Contract tests for full-prompt disk artifact filenames.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resolveFullPromptLogFileName,
  buildToolBudgetExceededWarning,
  REQUEST_ORDERS_MAX_TOOL_ROUNDS,
  resolveOrderFlowToolChoice,
  type PromptLogArtifactKind,
} from './requestOrdersFlowSupport';

const KIND_TO_FILE: ReadonlyArray<{ kind: PromptLogArtifactKind; fileName: string }> = [
  { kind: 'user', fileName: 'debug-last-user-prompt.txt' },
  { kind: 'strategic', fileName: 'debug-last-strategic-prompt.txt' },
  { kind: 'tactical', fileName: 'debug-last-tactical-prompt.txt' },
];

/**
 * Locks each prompt-log artifact kind to its cwd filename.
 *
 * Purpose: Strategic and tactical system prompts must not share a file; the user message stays separate.
 * When to use: After edits to `resolveFullPromptLogFileName`.
 * Expected outcome: Exact filename match for each kind; the three names are distinct.
 * Exceptions: Assertion failure on contract drift.
 */
test('resolveFullPromptLogFileName maps each artifact kind to a distinct file', () => {
  const fileNames = KIND_TO_FILE.map(({ kind, fileName }) => {
    const resolved = resolveFullPromptLogFileName(kind);
    assert.equal(resolved, fileName);
    return resolved;
  });
  assert.equal(new Set(fileNames).size, fileNames.length);
});

/**
 * Verifies a consultation that offers tools must call one before it can submit orders.
 *
 * Purpose: `required` forces the first tool call; staying on `required` would block the envelope.
 * When to use: After changing `resolveOrderFlowToolChoice`.
 * Expected outcome: `required` only when tools are offered and none have been called; `auto` after a call and when
 * there are no tools.
 * Exceptions: Assertion failure on contract drift.
 */
test('tool choice is required until a tool has been called', () => {
  assert.equal(resolveOrderFlowToolChoice(2, false), 'required');
  assert.equal(resolveOrderFlowToolChoice(2, true), 'auto');
  assert.equal(resolveOrderFlowToolChoice(0, false), 'auto');
  assert.equal(resolveOrderFlowToolChoice(2, false, true), 'auto');
});

test('tool-budget warning quotes the shared round limit', () => {
  const warning = buildToolBudgetExceededWarning();
  assert.ok(warning.includes(String(REQUEST_ORDERS_MAX_TOOL_ROUNDS)));
  assert.match(warning, /tool-call limit/);
});
