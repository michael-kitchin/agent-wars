/**
 * Copy labels and the first-opponent key fill.
 *
 * The key strings in this file are for testing.
 * Run: `node dist/shared/commanderSetupCopy.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  commanderApiKey,
  copyButtonState,
  prefillFirstAiApiKey,
  previousAiRowIndex,
} from './commanderSetupCopy';
import type { NewGameCommanderInput } from './ipc/ordersTypes';
import { initialSidesState, setObserveOnly, type HomeOption } from './newGameSides';

/**
 * A commander used only so rows share one object until prefill copies the first AI row.
 *
 * Purpose: The prefill test checks that later rows keep this object.
 * When to use: The cases in this file.
 * Expected outcome: Balanced, with no model and no key.
 * Exceptions: None.
 */
const COMMANDER: NewGameCommanderInput = { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced' };

/**
 * Four homes, so a match can list opponent 3.
 *
 * Purpose: Opponent 3's copy source is opponent 2.
 * When to use: The cases in this file.
 * Expected outcome: Keys a through d.
 * Exceptions: None.
 */
const FOUR: readonly HomeOption[] = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
  { key: 'c', label: 'Gamma' },
  { key: 'd', label: 'Delta' },
];

test('prefill writes the key only onto the first AI row', () => {
  const started = initialSidesState({ mapKind: 'global', homes: FOUR, defaultCommander: COMMANDER, rowCount: 3 });
  const next = prefillFirstAiApiKey(started, ' test-openrouter-key ');
  assert.equal(commanderApiKey(next.rows[1]?.commander ?? null), 'test-openrouter-key');
  assert.equal(commanderApiKey(next.rows[2]?.commander ?? null), '');
  assert.equal(next.rows[2]?.commander, COMMANDER);
  assert.equal(COMMANDER.apiKey, undefined);
  const observed = setObserveOnly(started, true, COMMANDER);
  const watched = prefillFirstAiApiKey(observed, 'test-openrouter-key');
  assert.equal(commanderApiKey(watched.rows[0]?.commander ?? null), 'test-openrouter-key');
  assert.equal(commanderApiKey(watched.rows[1]?.commander ?? null), '');
});

test('a later opponent copies the AI row just above it', () => {
  const started = initialSidesState({ mapKind: 'global', homes: FOUR, defaultCommander: COMMANDER, rowCount: 4 });
  assert.equal(previousAiRowIndex(started, 3), 2);
  assert.equal(copyButtonState(started, 3, true)?.label, 'Copy from Opponent 2');
  assert.equal(previousAiRowIndex(started, 2), 1);
  assert.equal(copyButtonState(started, 2, false)?.label, 'Copy from Opponent 1');
  assert.equal(copyButtonState(started, 2, false)?.disabled, false);
  assert.equal(previousAiRowIndex(started, 1), null);
});

test('observe names sides, and the first side waits for a remembered match', () => {
  const started = initialSidesState({ mapKind: 'global', homes: FOUR, defaultCommander: COMMANDER, rowCount: 3 });
  const observed = setObserveOnly(started, true, COMMANDER);
  const first = copyButtonState(observed, 0, false);
  assert.equal(first?.label, 'No previous game');
  assert.equal(first?.disabled, true);
  assert.equal(first?.source, 'previous-match');
  const second = copyButtonState(observed, 1, true);
  assert.equal(second?.label, 'Copy from Side 1');
  assert.equal(second?.source, 'previous-opponent');
  assert.equal(copyButtonState(observed, 0, true)?.label, 'Copy from Last Game (Side 1)');
});

test('a missing key reads as empty', () => {
  assert.equal(commanderApiKey(null), '');
  assert.equal(commanderApiKey(COMMANDER), '');
  assert.equal(copyButtonState(initialSidesState({ mapKind: 'global', homes: FOUR, defaultCommander: COMMANDER }), 0, true), null);
});
