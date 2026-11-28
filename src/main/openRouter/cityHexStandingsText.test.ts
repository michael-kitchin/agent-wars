/**
 * Contract tests for the city-hex standings text both strategic prompts show.
 * Run: `npm run build:main` then `node dist/main/openRouter/cityHexStandingsText.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { playerIdCodeFor } from '../../shared/unitIds';
import type { VictorySettings } from '../../shared/victoryRules';
import type { KnockoutStatusForSeat } from '../gameActions/knockoutStatus';
import { sideStatusWithCityHexes } from '../testSupport/knockoutStatusFixtures';
import { assertNoTripleBlankLines } from '../testSupport/promptOutlineHelpers';
import { buildCityHexStandingsBody, STANDINGS_SECTION_TITLE } from './cityHexStandingsText';

/**
 * The closing paragraph of a match with no turn limit.
 *
 * Purpose: Several cases expect the same sentence pair.
 * When to use: Any case without a turn limit.
 * Expected outcome: The printed paragraph.
 * Exceptions: None.
 */
const NO_LIMIT_PARAGRAPH = 'This match has no turn limit. It ends when one side is left, or when every side would be knocked out on the same turn.';

/**
 * A win rule with a limit of 40 turns.
 *
 * Purpose: The turn-limit cases share one rule.
 * When to use: Any case with a turn limit.
 * Expected outcome: The city-hex rule at turn 40.
 * Exceptions: None.
 */
const LIMIT_40: VictorySettings = { rule: 'most_city_hexes_at_turn_limit', turnLimit: 40 };

/**
 * Builds the commander's status from its own count and the other sides' counts.
 *
 * Purpose: Cases vary only the counts.
 * When to use: Each case below.
 * Expected outcome: The commander is `AI_SEAT_IDS[0]` named North; the others are South, East, and West in order.
 * Exceptions: None. At most three other sides.
 */
function statusWith(ownCount: number, ...enemyCounts: number[]): KnockoutStatusForSeat {
  const others = [
    { seatId: HUMAN_SEAT_ID, name: 'South' },
    { seatId: AI_SEAT_IDS[1], name: 'East' },
    { seatId: AI_SEAT_IDS[2], name: 'West' },
  ];
  return {
    share: 0.9,
    own: sideStatusWithCityHexes(AI_SEAT_IDS[0], 'North', ownCount),
    enemies: enemyCounts.map((count, index) => sideStatusWithCityHexes(others[index]!.seatId, others[index]!.name, count)),
  };
}

/**
 * Splits a body into its blank-line-separated parts.
 *
 * Purpose: Cases read the table and each paragraph on their own.
 * When to use: After building a body.
 * Expected outcome: The table lines and the two paragraphs.
 * Exceptions: Fails the test when the body does not have exactly three parts.
 */
function partsOf(body: string) {
  const parts = body.split('\n\n');
  assert.equal(parts.length, 3, body);
  return { table: parts[0]!.split('\n'), place: parts[1]!, ending: parts[2]! };
}

test('sides are listed by city hexes, with places and the commander marked', () => {
  const { table, place, ending } = partsOf(
    buildCityHexStandingsBody({ status: statusWith(19, 83, 26), victory: undefined, turnNumber: 12 })
  );
  assert.deepEqual(table, [
    '| Place | Side | Code | City hexes |',
    '| --- | --- | --- | --- |',
    `| 1 | South | ${playerIdCodeFor(HUMAN_SEAT_ID)} | 83 |`,
    `| 2 | East | ${playerIdCodeFor(AI_SEAT_IDS[1])} | 26 |`,
    `| 3 | North (you) | ${playerIdCodeFor(AI_SEAT_IDS[0])} | 19 |`,
  ]);
  assert.equal(place, 'City hexes are counted by the game. Your place: 3 of 3.');
  assert.equal(ending, NO_LIMIT_PARAGRAPH);
});

test('a turn limit names the turn, the limit, and the side that would win now', () => {
  const { ending } = partsOf(
    buildCityHexStandingsBody({ status: statusWith(19, 83, 26), victory: LIMIT_40, turnNumber: 31 })
  );
  assert.equal(
    ending,
    'This is turn 31 of 40. The match ends after turn 40, and the side holding the most city hexes then wins. '
      + `If the match ended now, South (${playerIdCodeFor(HUMAN_SEAT_ID)}) would win.`
  );
});

test('a commander alone in first place would win now', () => {
  const { place, ending } = partsOf(
    buildCityHexStandingsBody({ status: statusWith(50, 20, 10), victory: LIMIT_40, turnNumber: 5 })
  );
  assert.equal(place, 'City hexes are counted by the game. Your place: 1 of 3.');
  assert.ok(ending.endsWith('If the match ended now, you would win.'), ending);
});

test('two sides tied for first share the place and nobody would win now', () => {
  const { table, ending } = partsOf(
    buildCityHexStandingsBody({ status: statusWith(10, 40, 40), victory: LIMIT_40, turnNumber: 5 })
  );
  assert.deepEqual(table.slice(2).map((line) => line.split('|')[1]!.trim()), ['1', '1', '3']);
  assert.ok(table[4]!.includes('North (you)'), table[4]);
  assert.ok(
    ending.endsWith('If the match ended now, no single side would win, because 2 sides are tied for first place.'),
    ending
  );
});

test('a commander tied with one other side is listed first of the two and told of the tie', () => {
  const { table, place } = partsOf(
    buildCityHexStandingsBody({ status: statusWith(20, 20, 60), victory: undefined, turnNumber: 5 })
  );
  assert.equal(place, 'City hexes are counted by the game. Your place: 2 of 3. You are tied with 1 other side.');
  assert.ok(table[2]!.includes('East'), table[2]);
  assert.ok(table[3]!.includes('North (you)'), table[3]);
  assert.ok(table[4]!.includes('South'), table[4]);
});

test('a commander tied with two others is told the number of sides', () => {
  const { place } = partsOf(
    buildCityHexStandingsBody({ status: statusWith(20, 20, 20), victory: undefined, turnNumber: 5 })
  );
  assert.equal(place, 'City hexes are counted by the game. Your place: 1 of 3. You are tied with 2 other sides.');
});

test('every match without a turn limit says so and names no winner', () => {
  const rules: readonly (VictorySettings | null | undefined)[] = [
    undefined,
    null,
    { rule: 'last_side_standing', turnLimit: null },
  ];
  for (const victory of rules) {
    const { ending } = partsOf(buildCityHexStandingsBody({ status: statusWith(5, 4), victory, turnNumber: 7 }));
    assert.equal(ending, NO_LIMIT_PARAGRAPH);
  }
});

test('a side with no city hexes is listed with zero', () => {
  const { table } = partsOf(
    buildCityHexStandingsBody({ status: statusWith(5, 0), victory: undefined, turnNumber: 7 })
  );
  assert.equal(table[3], `| 2 | South | ${playerIdCodeFor(HUMAN_SEAT_ID)} | 0 |`);
});

test('a commander with no other side is first of one', () => {
  const { table, place } = partsOf(
    buildCityHexStandingsBody({ status: statusWith(5), victory: undefined, turnNumber: 7 })
  );
  assert.equal(table.length, 3);
  assert.ok(place.endsWith('Your place: 1 of 1.'), place);
});

test('the body is a table and two paragraphs with no heading and no stray blank lines', () => {
  const body = buildCityHexStandingsBody({ status: statusWith(19, 83, 26, 26), victory: LIMIT_40, turnNumber: 31 });
  const { table } = partsOf(body);
  const pipes = table[0]!.split('|').length;
  for (const line of table) {
    assert.ok(line.startsWith('|') && line.endsWith('|'), line);
    assert.equal(line.split('|').length, pipes, line);
  }
  for (const line of body.split('\n')) {
    assert.ok(!line.startsWith('#'), line);
    assert.ok(line.length <= 400, line);
  }
  assert.ok(!body.startsWith('\n') && !body.endsWith('\n'));
  assert.ok(!body.includes('\n\n\n'));
  assertNoTripleBlankLines(body);
  assert.equal(STANDINGS_SECTION_TITLE, 'Standings');
});
