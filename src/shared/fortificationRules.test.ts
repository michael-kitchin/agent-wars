/**
 * Fortification sentences that name one hex or several.
 *
 * Purpose: The paused-queue line is the player-facing contract for a full city.
 * When to use: After changing `formatFortificationQueuePausedLine`.
 * Expected outcome: One name, or three names with a serial comma.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatFortificationQueuePausedLine } from './fortificationRules';

test('a paused fortification queue names one hex', () => {
  assert.equal(
    formatFortificationQueuePausedLine(['Vienna']),
    'Every city cell at Vienna is fortified, so its build queue is paused.'
  );
});

test('a paused fortification queue names three hexes', () => {
  assert.equal(
    formatFortificationQueuePausedLine(['Vienna', 'Prague', 'Berlin']),
    'Every city cell is fortified at Vienna, Prague, and Berlin, so their build queues are paused.'
  );
});
