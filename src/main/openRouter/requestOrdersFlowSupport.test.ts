/**
 * Contract tests for full-prompt disk artifact filenames.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resolveFullPromptLogFileName,
  resolveFullResponseLogFileName,
  buildToolBudgetExceededWarning,
  REQUEST_ORDERS_MAX_TOOL_ROUNDS,
  type PromptLogArtifactKind,
} from './requestOrdersFlowSupport';

const KIND_TO_FILE: ReadonlyArray<{ kind: PromptLogArtifactKind; fileName: string }> = [
  { kind: 'user', fileName: 'debug-last-user-prompt-1.txt' },
  { kind: 'strategic', fileName: 'debug-last-strategic-prompt-1.txt' },
  { kind: 'tactical', fileName: 'debug-last-tactical-prompt-1.txt' },
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
    const resolved = resolveFullPromptLogFileName(kind, 1);
    assert.equal(resolved, fileName);
    return resolved;
  });
  assert.equal(new Set(fileNames).size, fileNames.length);
  assert.equal(resolveFullPromptLogFileName('user', 2), 'debug-last-user-prompt-2.txt');
  assert.equal(resolveFullPromptLogFileName('strategic', 2), 'debug-last-strategic-prompt-2.txt');
  assert.equal(resolveFullPromptLogFileName('tactical', 2), 'debug-last-tactical-prompt-2.txt');
  assert.notEqual(resolveFullPromptLogFileName('strategic', 1), resolveFullPromptLogFileName('strategic', 2));
});

/**
 * Locks the response-body filename to the opponent index.
 *
 * Purpose: Two opponents must not overwrite one response file.
 * When to use: After edits to `resolveFullResponseLogFileName`.
 * Expected outcome: Opponent 1 writes `debug-last-openrouter-response-body-1.txt`.
 * Exceptions: Assertion failure on contract drift.
 */
test('resolveFullResponseLogFileName includes the opponent index', () => {
  assert.equal(resolveFullResponseLogFileName(1), 'debug-last-openrouter-response-body-1.txt');
  assert.notEqual(resolveFullResponseLogFileName(1), resolveFullResponseLogFileName(2));
});

test('tool-budget warning quotes the shared round limit', () => {
  const warning = buildToolBudgetExceededWarning();
  assert.ok(warning.includes(String(REQUEST_ORDERS_MAX_TOOL_ROUNDS)));
  assert.match(warning, /tool-call limit/);
});
