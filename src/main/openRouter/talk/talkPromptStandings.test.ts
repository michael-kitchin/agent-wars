/**
 * The standings text of one commander's talk prompt.
 *
 * Purpose: The diplomacy step shows the same standings as the orders step, and a failed read never fails the consult.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/talkPromptStandings.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, type SeatId } from '../../../shared/seatIds';
import type { VictorySettings } from '../../../shared/victoryRules';
import type { KnockoutStatusForSeat } from '../../gameActions/knockoutStatus';
import { sideStatusWithCityHexes } from '../../testSupport/knockoutStatusFixtures';
import { buildCityHexStandingsBody } from '../cityHexStandingsText';
import { readCityHexStandingsText } from './talkPromptInput';

/**
 * A win rule with a limit of 30 turns.
 *
 * Purpose: The reader must pass the stored rule to the builder.
 * When to use: The cases below.
 * Expected outcome: The city-hex rule at turn 30.
 * Exceptions: None.
 */
const LIMIT: VictorySettings = { rule: 'most_city_hexes_at_turn_limit', turnLimit: 30 };

/**
 * A three-side status seen by the first AI seat.
 *
 * Purpose: Stands in for the database's knockout status.
 * When to use: The cases below.
 * Expected outcome: The commander and two other sides with different counts.
 * Exceptions: None.
 */
const STATUS: KnockoutStatusForSeat = {
  share: 0.9,
  own: sideStatusWithCityHexes(AI_SEAT_IDS[0], 'North', 4),
  enemies: [sideStatusWithCityHexes(HUMAN_SEAT_ID, 'South', 9), sideStatusWithCityHexes(AI_SEAT_IDS[1], 'East', 2)],
};

/**
 * What the reader is asked for.
 *
 * Purpose: Each case reads the same seat and turn.
 * When to use: The cases below.
 * Expected outcome: The first AI seat on turn 12.
 * Exceptions: None.
 */
const ARGS = { seatId: AI_SEAT_IDS[0], turnNumber: 12 } as const;

test('the reader returns the standings body for the status, the win rule, and the turn', () => {
  const asked: SeatId[] = [];
  const text = readCityHexStandingsText(ARGS, {
    status: (seatId) => {
      asked.push(seatId);
      return STATUS;
    },
    victory: () => LIMIT,
  });
  assert.equal(text, buildCityHexStandingsBody({ status: STATUS, victory: LIMIT, turnNumber: 12 }));
  assert.deepEqual(asked, [AI_SEAT_IDS[0]]);
});

test('no status gives no standings', () => {
  assert.equal(readCityHexStandingsText(ARGS, { status: () => null, victory: () => LIMIT }), null);
});

test('a status or win rule that cannot be read gives no standings', () => {
  /**
   * A reader that always fails.
   *
   * Purpose: Stands in for a database read that throws.
   * When to use: Both failure cases.
   * Expected outcome: Never returns.
   * Exceptions: Always throws.
   */
  const fail = (): never => {
    throw new Error('read failed');
  };
  assert.equal(readCityHexStandingsText(ARGS, { status: fail, victory: () => LIMIT }), null);
  assert.equal(readCityHexStandingsText(ARGS, { status: () => STATUS, victory: fail }), null);
});
