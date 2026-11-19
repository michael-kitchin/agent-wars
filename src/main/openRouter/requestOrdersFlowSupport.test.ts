/**
 * Contract tests for full-prompt disk artifact filenames.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  resolveFullPromptLogFileName,
  resolveFullResponseLogFileName,
  buildToolBudgetExceededWarning,
  logPromptPreview,
  REQUEST_ORDERS_MAX_TOOL_ROUNDS,
  dedupeByUnitKeepLast,
  explicitMoveAlreadyArrivedReason,
  unitIdsWhoseEarlierRowsWereDiscarded,
  type PromptLogArtifactKind,
} from './requestOrdersFlowSupport';

const KIND_TO_FILE: ReadonlyArray<{ kind: PromptLogArtifactKind; fileName: string }> = [
  { kind: 'user', fileName: 'debug-last-user-prompt-1.txt' },
  { kind: 'strategic', fileName: 'debug-last-strategic-prompt-1.txt' },
  { kind: 'tactical', fileName: 'debug-last-tactical-prompt-1.txt' },
  { kind: 'talk-system', fileName: 'debug-last-talk-system-prompt-1.txt' },
  { kind: 'talk-user', fileName: 'debug-last-talk-user-prompt-1.txt' },
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
  assert.equal(resolveFullPromptLogFileName('talk-system', 2), 'debug-last-talk-system-prompt-2.txt');
  assert.equal(resolveFullPromptLogFileName('talk-user', 2), 'debug-last-talk-user-prompt-2.txt');
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

/**
 * Locks which earlier rows keep-last discards, and which row it still keeps.
 *
 * Purpose: A second strike or move for the same unit must be visible as a drop reason without changing the winner.
 * When to use: After edits to `unitIdsWhoseEarlierRowsWereDiscarded` or `dedupeByUnitKeepLast`.
 * Expected outcome: Earlier ids are reported in input order. The last row of each unit is the one kept.
 * Exceptions: AssertionError on contract drift.
 */
test('keep-last reports earlier duplicate rows and still keeps the last row', () => {
  assert.deepEqual(
    unitIdsWhoseEarlierRowsWereDiscarded([{ unitId: 'a' }, { unitId: 'b' }, { unitId: 'a' }]),
    ['a']
  );
  assert.deepEqual(unitIdsWhoseEarlierRowsWereDiscarded([{ unitId: 'a' }, { unitId: 'b' }]), []);
  assert.deepEqual(unitIdsWhoseEarlierRowsWereDiscarded([{ unitId: 'a' }]), []);
  assert.deepEqual(unitIdsWhoseEarlierRowsWereDiscarded([]), []);
  assert.deepEqual(
    unitIdsWhoseEarlierRowsWereDiscarded([{ unitId: 'a' }, { unitId: 'a' }, { unitId: 'a' }]),
    ['a', 'a']
  );
  const three = [
    { unitId: 'a', mark: 1 },
    { unitId: 'a', mark: 2 },
    { unitId: 'a', mark: 3 },
  ];
  assert.deepEqual(dedupeByUnitKeepLast(three), [{ unitId: 'a', mark: 3 }]);
  const four = [
    { unitId: 'a', mark: 1 },
    { unitId: 'b', mark: 1 },
    { unitId: 'a', mark: 2 },
    { unitId: 'b', mark: 2 },
  ];
  assert.deepEqual(unitIdsWhoseEarlierRowsWereDiscarded(four), ['a', 'b']);
  assert.deepEqual(dedupeByUnitKeepLast(four), [
    { unitId: 'a', mark: 2 },
    { unitId: 'b', mark: 2 },
  ]);
});

/**
 * A same-hex explicit_move is already arrived; a different hex is not.
 *
 * Purpose: The apply loop drops a zero-length AI move and keeps a move to another hex.
 * When to use: After edits to `explicitMoveAlreadyArrivedReason`.
 * Expected outcome: Equal indexes return `already arrived`. Different indexes return null.
 * Exceptions: None.
 */
test('explicitMoveAlreadyArrivedReason matches only the unit hex', () => {
  assert.equal(explicitMoveAlreadyArrivedReason('abc', 'abc'), 'already arrived');
  assert.equal(explicitMoveAlreadyArrivedReason('abc', 'def'), null);
});

/**
 * Runs a case in a temporary working directory with the full-prompt flag set.
 *
 * Purpose: `logPromptPreview` writes to the working directory, so the case must not touch the project.
 * When to use: The two `logPromptPreview` cases below.
 * Expected outcome: `runCase` receives the directory. The flag, the directory, and the files are restored or removed afterward.
 * Exceptions: Propagates the case error after cleanup.
 */
function withPromptLogDirectory(flag: string | undefined, runCase: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-prompt-log-'));
  const previousCwd = process.cwd();
  const previousFlag = process.env.AGENT_WARS_LOG_FULL_PROMPTS;
  try {
    process.chdir(dir);
    if (flag === undefined) delete process.env.AGENT_WARS_LOG_FULL_PROMPTS;
    else process.env.AGENT_WARS_LOG_FULL_PROMPTS = flag;
    runCase(dir);
  } finally {
    process.chdir(previousCwd);
    if (previousFlag === undefined) delete process.env.AGENT_WARS_LOG_FULL_PROMPTS;
    else process.env.AGENT_WARS_LOG_FULL_PROMPTS = previousFlag;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('logPromptPreview with previewWhenDisabled false writes no file when full logging is off', () => {
  withPromptLogDirectory(undefined, (dir) => {
    logPromptPreview('test: talk', 'secret prompt text', { artifactKind: 'talk-system', aiIndex: 1, previewWhenDisabled: false });
    assert.deepEqual(fs.readdirSync(dir), []);
  });
});

test('logPromptPreview writes the full talk prompt when full logging is on', () => {
  withPromptLogDirectory('1', (dir) => {
    logPromptPreview('test: talk', 'full prompt body', { artifactKind: 'talk-user', aiIndex: 2, previewWhenDisabled: false });
    assert.equal(fs.readFileSync(path.join(dir, 'debug-last-talk-user-prompt-2.txt'), 'utf8'), 'full prompt body');
  });
});
