/**
 * The check that a talk wait outlived Stop, New, or Load.
 *
 * Purpose: An orders call must not start after the seat's wait was cancelled.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/commanderPoolSupport.test.js`.
 * Expected outcome: A live signal on the current generation continues. An abort or a moved generation stops.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceMatchGeneration, getMatchGeneration } from '../matchGeneration';
import { consultStoppedWhileTalking } from './commanderPoolSupport';

test('a live signal on the current generation may start orders', () => {
  const signal = new AbortController().signal;
  assert.equal(consultStoppedWhileTalking(signal, getMatchGeneration()), false);
});

test('an aborted signal or a new match stops the orders call', () => {
  const aborted = new AbortController();
  aborted.abort();
  const generation = getMatchGeneration();
  assert.equal(consultStoppedWhileTalking(aborted.signal, generation), true);
  advanceMatchGeneration('new_game');
  assert.equal(consultStoppedWhileTalking(new AbortController().signal, generation), true);
});
