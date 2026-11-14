/**
 * Operation command parsing: absent, empty, malformed, and one launch.
 *
 * Purpose: A bad `operations` value must become a drop reason and must not reject the reply.
 * When to use: After changes to `normalizeOperationCommands`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeOperationCommands } from './operationCommandParsing';

const ENTRY_REASON =
  'operations entry dropped: expected {"action":"launch","option":"<letter>"}, {"action":"launch","objective":"<hex code>","method":"land"|"sea"|"air"}, or {"action":"cancel","id":"<operation id>"}.';

test('an absent or empty operations value adds nothing', () => {
  assert.deepEqual(normalizeOperationCommands(undefined), { commands: [], dropReasons: [] });
  assert.deepEqual(normalizeOperationCommands([]), { commands: [], dropReasons: [] });
});

test('a non-array operations value is one reason', () => {
  assert.deepEqual(normalizeOperationCommands({ action: 'launch', option: 'A' }), {
    commands: [],
    dropReasons: ['operations dropped: expected an array.'],
  });
});

test('a launch letter is trimmed and a cancel id is kept', () => {
  const parsed = normalizeOperationCommands([
    { action: 'launch', option: ' b ' },
    { action: 'cancel', id: ' seat-op1 ' },
  ]);
  assert.deepEqual(parsed.commands, [
    { action: 'launch', option: 'B' },
    { action: 'cancel', id: 'seat-op1' },
  ]);
  assert.deepEqual(parsed.dropReasons, []);
});

test('a malformed entry is dropped and a second launch is dropped', () => {
  const parsed = normalizeOperationCommands([
    { action: 'launch', option: 'A' },
    { action: 'launch', option: 'B' },
    { action: 'wait' },
    { action: 'launch', option: 'Z' },
    { action: 'cancel', id: '  ' },
  ]);
  assert.deepEqual(parsed.commands, [{ action: 'launch', option: 'A' }]);
  assert.deepEqual(parsed.dropReasons, [
    'operations entry dropped: one launch per turn.',
    ENTRY_REASON,
    ENTRY_REASON,
    ENTRY_REASON,
  ]);
});

test('a named launch stores the uppercased code and a bad code or method is that entry', () => {
  const parsed = normalizeOperationCommands([
    { action: 'launch', objective: ' ab ', method: 'air' },
  ]);
  assert.deepEqual(parsed.commands, [{ action: 'launch', objective: 'AB', method: 'air' }]);
  assert.deepEqual(parsed.dropReasons, []);
  const dropped = normalizeOperationCommands([
    { action: 'launch', objective: 'A', method: 'air' },
    { action: 'launch', objective: 'AB', method: 'rail' },
    { action: 'launch', option: 'A', objective: 'CD', method: 'sea' },
  ]);
  assert.deepEqual(dropped.commands, [{ action: 'launch', option: 'A' }]);
  assert.equal(dropped.dropReasons.length, 2);
  assert.ok(dropped.dropReasons.every((reason) => reason.startsWith('operations ')));
  assert.ok(!dropped.dropReasons.some((reason) => reason.includes('one launch per turn')));
});

test('a named land launch is kept', () => {
  const parsed = normalizeOperationCommands([{ action: 'launch', objective: 'ab', method: 'land' }]);
  assert.deepEqual(parsed.commands, [{ action: 'launch', objective: 'AB', method: 'land' }]);
  assert.deepEqual(parsed.dropReasons, []);
});
