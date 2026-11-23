/**
 * The win rule read back from `game_config`.
 *
 * Purpose: Startup reads the snapshot before any match has stored a rule, and that must not be logged as an error.
 * When to use: `npm run build:main`, then `node dist/main/gameDb/gameConfigKvVictory.test.js`.
 * Expected outcome: A missing row and an unknown value both read as last-side-standing. Only the unknown value writes to `console.error`.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVictorySettings, type GameConfigKvDbOps } from './gameConfigKv';

/**
 * Database calls that answer every `game_config` read with one value.
 *
 * Purpose: The tests choose what the stored rule row holds.
 * When to use: Each case below.
 * Expected outcome: `getOne` returns `{ value }`, or undefined when `value` is undefined. `run` does nothing.
 * Exceptions: None.
 */
function opsWith(value: string | undefined): GameConfigKvDbOps {
  return {
    getOne: <T>() => (value === undefined ? undefined : ({ value } as T)),
    run: () => undefined,
  } as GameConfigKvDbOps;
}

/**
 * Counts `console.error` calls made while `body` runs.
 *
 * Purpose: `logError` is the only logger level that writes to `console.error`.
 * When to use: Checking whether a read logged an error.
 * Expected outcome: The number of calls. `console.error` is restored afterward.
 * Exceptions: Rethrows what `body` throws, after restoring `console.error`.
 */
function errorCallsDuring(body: () => void): number {
  const original = console.error;
  let calls = 0;
  console.error = () => {
    calls += 1;
  };
  try {
    body();
  } finally {
    console.error = original;
  }
  return calls;
}

test('a missing win rule reads as last-side-standing without an error', () => {
  let settings: ReturnType<typeof readVictorySettings> | null = null;
  const calls = errorCallsDuring(() => {
    settings = readVictorySettings(opsWith(undefined));
  });
  assert.deepEqual(settings, { rule: 'last_side_standing', turnLimit: null });
  assert.equal(calls, 0);
});

test('an unknown stored win rule reads as last-side-standing and logs an error', () => {
  let settings: ReturnType<typeof readVictorySettings> | null = null;
  const calls = errorCallsDuring(() => {
    settings = readVictorySettings(opsWith('not_a_rule'));
  });
  assert.deepEqual(settings, { rule: 'last_side_standing', turnLimit: null });
  assert.equal(calls, 1);
});
