/**
 * Hire markers appear only on the active human's own view.
 *
 * Purpose: An observe-all view and a knocked-out seat must not offer hiring.
 * When to use: After changing `hireEntryHexesForHuman`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from './ipc/gameStateTypes';
import { HUMAN_SEAT_ID } from './seatIds';
import type { SeatSnapshot } from './seatRoster';
import { hireEntryHexesForHuman } from './hireEntryHexes';

test('the human view returns the hire hexes', () => {
  const hexes = hireEntryHexesForHuman(state({
    playerPerspective: HUMAN_SEAT_ID,
    mercenaryEconomy: { credits: 0, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0, hireHexes: ['b', 'a'] },
  }));
  assert.deepEqual([...hexes].sort(), ['a', 'b']);
});

test('an AI view and a knocked-out human return no hire hexes', () => {
  const economy = { credits: 0, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0, hireHexes: ['a'] };
  assert.equal(hireEntryHexesForHuman(state({ playerPerspective: 'opponent', mercenaryEconomy: economy })).size, 0);
  assert.equal(hireEntryHexesForHuman(state({
    playerPerspective: HUMAN_SEAT_ID,
    seats: [{ seatId: HUMAN_SEAT_ID, outTurn: 3 } as SeatSnapshot],
    mercenaryEconomy: economy,
  })).size, 0);
});

/**
 * A snapshot with only the fields the hire-marker rule reads.
 *
 * Purpose: The cases do not build a full match.
 * When to use: Each case.
 * Expected outcome: A snapshot. Absent seats count the human as active.
 * Exceptions: None.
 */
function state(partial: Partial<GameStateSnapshot>): GameStateSnapshot {
  return {
    hexes: [],
    units: [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    ...partial,
  };
}
