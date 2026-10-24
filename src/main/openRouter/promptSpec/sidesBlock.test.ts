/**
 * Contract tests for the Sides table.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSpec/sidesBlock.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SEAT_ID, type SeatId } from '../../../shared/seatIds';
import { playerIdCodeFor } from '../../../shared/unitIds';
import { buildSidesPromptBlock, type SidesPromptSeat } from './sidesBlock';

/**
 * One seat row for the table tests.
 *
 * Purpose: Keeps each case to the fields the table prints.
 * When to use: The cases in this file.
 * Expected outcome: A `SidesPromptSeat`.
 * Exceptions: None.
 */
function seat(seatId: SeatId, seatOrder: number, homeRegion: string, outTurn: number | null = null): SidesPromptSeat {
  return { seatId, seatOrder, homeRegion, outTurn };
}

test('two seats give two rows and the commander is marked you', () => {
  const text = buildSidesPromptBlock({
    ownSeatId: 'opponent',
    seats: [seat(HUMAN_SEAT_ID, 1, 'Northern America'), seat('opponent', 2, 'Eastern Europe')],
    includeNeutral: false,
  });
  assert.match(text, /\| Eastern Europe \(you\) \| a1 \| Eastern Europe \| Active \|/);
  assert.match(text, /\| Northern America \| h1 \| Northern America \| Active \|/);
  assert.equal(text.includes('Out since turn'), false);
  assert.equal(text.includes('Neutral'), false);
  assert.equal(playerIdCodeFor('opponent'), 'a1');
  assert.equal(playerIdCodeFor(HUMAN_SEAT_ID), 'h1');
});

test('a knocked-out seat and a neutral unit add those rows', () => {
  const text = buildSidesPromptBlock({
    ownSeatId: 'opponent2',
    seats: [
      seat(HUMAN_SEAT_ID, 1, 'Northern America'),
      seat('opponent', 2, 'Eastern Europe'),
      seat('opponent2', 3, 'Western Asia'),
      seat('opponent3', 4, 'Southern Asia', 4),
    ],
    includeNeutral: true,
  });
  assert.match(text, /\| Western Asia \(you\) \| a2 \| Western Asia \| Active \|/);
  assert.match(text, /\| Southern Asia \| a3 \| Southern Asia \| Out since turn 4; its units are now neutral \|/);
  assert.match(text, /\| Neutral \| \(keeps the prefix of the side it came from\) \| none \| Garrisons hold their hexes/);
  assert.equal(playerIdCodeFor('opponent2'), 'a2');
  assert.equal(playerIdCodeFor('opponent3'), 'a3');
});
