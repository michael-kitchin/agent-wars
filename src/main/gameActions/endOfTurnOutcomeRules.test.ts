/**
 * End-of-turn knockout and place decisions.
 * Run: `node dist/main/gameActions/endOfTurnOutcomeRules.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, type SeatId } from '../../shared/seatIds';
import type { SeatRecord } from '../../shared/seatRoster';
import type { VictorySettings } from '../../shared/victoryRules';
import { decideEndOfTurnOutcome, type EndOfTurnOutcome, type EndOfTurnOutcomeInput } from './endOfTurnOutcomeRules';

const GLOBAL_LIMIT: VictorySettings = { rule: 'most_city_hexes_at_turn_limit', turnLimit: 30 };
const REGIONAL: VictorySettings = { rule: 'last_side_standing', turnLimit: null };

/**
 * Builds one roster row for a decision test.
 *
 * Purpose: The rules read activity, order, and id. The other columns stay at match-start values.
 * When to use: Every case in this file.
 * Expected outcome: An active seat unless `outTurn` is set.
 * Exceptions: None.
 */
function seat(seatId: SeatId, seatOrder: number, outTurn: number | null = null): SeatRecord {
  return {
    seatId,
    seatOrder,
    kind: seatId === HUMAN_SEAT_ID ? 'human' : 'ai',
    homeRegion: seatId,
    commander: seatId === HUMAN_SEAT_ID
      ? null
      : { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', doctrine: 'balanced' },
    outTurn,
    outBy: null,
    outReasons: [],
    place: outTurn === null ? null : seatOrder,
    consultationCount: 0,
    costUsd: 0,
  };
}

/**
 * Runs one decision with cities and intact homes defaulting to one.
 *
 * Purpose: A case only overrides the facts that matter.
 * When to use: Each test below.
 * Expected outcome: The outcome `decideEndOfTurnOutcome` returns for those facts.
 * Exceptions: None.
 */
function decide(args: {
  seats: readonly SeatRecord[];
  turnNumber?: number;
  victory?: VictorySettings;
  control?: (attacker: SeatId, victim: SeatId) => boolean;
  cities?: Readonly<Record<string, number>>;
  intact?: Readonly<Record<string, number>>;
  homeCells?: (victim: SeatId, controller: SeatId) => number;
}): EndOfTurnOutcome {
  const cities = new Map(args.seats.map((row) => [row.seatId, args.cities?.[row.seatId] ?? 1]));
  const intact = new Map(args.seats.map((row) => [row.seatId, args.intact?.[row.seatId] ?? 1]));
  const input: EndOfTurnOutcomeInput = {
    turnNumber: args.turnNumber ?? 1,
    seats: args.seats,
    victory: args.victory ?? GLOBAL_LIMIT,
    controlWinMet: args.control ?? (() => false),
    cityHexCountBySeat: cities,
    intactHomeUrbanCellsBySeat: intact,
    homeCityCellsControlledBy: args.homeCells ?? (() => 0),
  };
  return decideEndOfTurnOutcome(input);
}

test('one of four seats loses its home to an earlier seat and shares last place', () => {
  const seats = [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2), seat(AI_SEAT_IDS[1], 3), seat(AI_SEAT_IDS[2], 4)];
  const outcome = decide({
    seats,
    control: (attacker, victim) => attacker === AI_SEAT_IDS[0] && victim === AI_SEAT_IDS[2],
  });
  assert.deepEqual(outcome.knockouts, [{
    seatId: AI_SEAT_IDS[2],
    outBy: AI_SEAT_IDS[0],
    reasons: ['home_control'],
    place: 4,
  }]);
  assert.equal(outcome.gameOver, false);
});

test('a seat with no city hex and a destroyed home records both reasons in order', () => {
  const outcome = decide({
    seats: [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2)],
    cities: { [AI_SEAT_IDS[0]]: 0 },
    intact: { [AI_SEAT_IDS[0]]: 0 },
  });
  assert.deepEqual(outcome.knockouts[0]?.reasons, ['no_city_hexes', 'home_cities_destroyed']);
});

test('two of four seats knocked out on one turn share the next place', () => {
  const outcome = decide({
    seats: [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2), seat(AI_SEAT_IDS[1], 3), seat(AI_SEAT_IDS[2], 4)],
    cities: { [AI_SEAT_IDS[0]]: 0, [AI_SEAT_IDS[1]]: 0 },
    intact: { [AI_SEAT_IDS[0]]: 0, [AI_SEAT_IDS[1]]: 0 },
  });
  assert.deepEqual(outcome.knockouts.map((row) => row.place), [3, 3]);
  assert.equal(outcome.gameOver, false);
});

test('a mutual wipe before the turn limit ends the match without knockouts', () => {
  const outcome = decide({
    seats: [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2)],
    turnNumber: 10,
    control: () => true,
    cities: { [HUMAN_SEAT_ID]: 3, [AI_SEAT_IDS[0]]: 1 },
  });
  assert.equal(outcome.knockouts.length, 0);
  assert.equal(outcome.gameOver, true);
  assert.equal(outcome.endReason, 'mutual_elimination');
  assert.equal(outcome.finalPlaces.get(HUMAN_SEAT_ID), 1);
  assert.equal(outcome.finalPlaces.get(AI_SEAT_IDS[0]), 2);
  assert.equal(outcome.winnerSeatId, HUMAN_SEAT_ID);
});

test('a mutual wipe on the turn limit keeps the turn-limit reason', () => {
  const outcome = decide({
    seats: [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2)],
    turnNumber: 30,
    control: () => true,
  });
  assert.equal(outcome.endReason, 'turn_limit');
  assert.equal(outcome.knockouts.length, 0);
});

test('a regional mutual wipe ends the match', () => {
  const outcome = decide({
    seats: [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2)],
    victory: REGIONAL,
    control: () => true,
  });
  assert.equal(outcome.endReason, 'mutual_elimination');
  assert.equal(outcome.gameOver, true);
});

test('three seats wiped with the same city count share first and nobody wins', () => {
  const seats = [seat(AI_SEAT_IDS[0], 1), seat(AI_SEAT_IDS[1], 2), seat(AI_SEAT_IDS[2], 3)];
  const outcome = decide({
    seats,
    cities: { [AI_SEAT_IDS[0]]: 4, [AI_SEAT_IDS[1]]: 4, [AI_SEAT_IDS[2]]: 4 },
    intact: { [AI_SEAT_IDS[0]]: 0, [AI_SEAT_IDS[1]]: 0, [AI_SEAT_IDS[2]]: 0 },
  });
  assert.equal(outcome.winnerSeatId, null);
  assert.deepEqual([...outcome.finalPlaces.values()], [1, 1, 1]);
});

test('a seat already out stays out of a later mutual ranking', () => {
  const seats = [
    seat(AI_SEAT_IDS[0], 1),
    seat(AI_SEAT_IDS[1], 2),
    seat(AI_SEAT_IDS[2], 3),
    seat(AI_SEAT_IDS[3], 4, 1),
  ];
  const outcome = decide({
    seats,
    cities: { [AI_SEAT_IDS[0]]: 5, [AI_SEAT_IDS[1]]: 5, [AI_SEAT_IDS[2]]: 1, [AI_SEAT_IDS[3]]: 0 },
    intact: { [AI_SEAT_IDS[0]]: 0, [AI_SEAT_IDS[1]]: 0, [AI_SEAT_IDS[2]]: 0, [AI_SEAT_IDS[3]]: 0 },
  });
  assert.equal(outcome.finalPlaces.has(AI_SEAT_IDS[3]), false);
  assert.equal(outcome.knockouts.some((row) => row.seatId === AI_SEAT_IDS[3]), false);
  assert.equal(outcome.finalPlaces.get(AI_SEAT_IDS[0]), 1);
  assert.equal(outcome.finalPlaces.get(AI_SEAT_IDS[1]), 1);
  assert.equal(outcome.finalPlaces.get(AI_SEAT_IDS[2]), 3);
  assert.equal(outcome.winnerSeatId, null);
});

test('the last side standing wins when one other seat loses its home', () => {
  const outcome = decide({
    seats: [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2)],
    control: (attacker, victim) => attacker === HUMAN_SEAT_ID && victim === AI_SEAT_IDS[0],
  });
  assert.equal(outcome.endReason, 'last_side_standing');
  assert.equal(outcome.winnerSeatId, HUMAN_SEAT_ID);
  assert.deepEqual(outcome.knockouts[0]?.reasons, ['home_control']);
});

test('a seat with no city hex is out even while its home still has urban cells', () => {
  const outcome = decide({
    seats: [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2)],
    cities: { [AI_SEAT_IDS[0]]: 0 },
    intact: { [AI_SEAT_IDS[0]]: 5 },
  });
  assert.deepEqual(outcome.knockouts[0]?.reasons, ['no_city_hexes']);
  assert.equal(outcome.winnerSeatId, HUMAN_SEAT_ID);
});

test('outBy is the seat holding the most home city cells, or the control seat, or nobody', () => {
  const seats = [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2), seat(AI_SEAT_IDS[1], 3)];
  const byCells = decide({
    seats,
    cities: { [AI_SEAT_IDS[1]]: 0 },
    intact: { [AI_SEAT_IDS[1]]: 5 },
    homeCells: (victim, controller) => {
      if (victim !== AI_SEAT_IDS[1]) return 0;
      if (controller === HUMAN_SEAT_ID) return 2;
      if (controller === AI_SEAT_IDS[0]) return 5;
      return 0;
    },
  });
  assert.equal(byCells.knockouts[0]?.outBy, AI_SEAT_IDS[0]);
  const none = decide({
    seats,
    cities: { [AI_SEAT_IDS[1]]: 0 },
    intact: { [AI_SEAT_IDS[1]]: 5 },
  });
  assert.equal(none.knockouts[0]?.outBy, null);
  const byControl = decide({
    seats,
    cities: { [AI_SEAT_IDS[1]]: 0 },
    control: (attacker, victim) => attacker === HUMAN_SEAT_ID && victim === AI_SEAT_IDS[1],
    homeCells: (victim, controller) => (victim === AI_SEAT_IDS[1] && controller === AI_SEAT_IDS[0] ? 5 : 0),
  });
  assert.equal(byControl.knockouts[0]?.outBy, HUMAN_SEAT_ID);
  assert.equal(byControl.knockouts[0]?.reasons[0], 'home_control');
});

test('the turn limit ranks remaining seats and a tie leaves no winner', () => {
  const seats = [seat(AI_SEAT_IDS[0], 1), seat(AI_SEAT_IDS[1], 2), seat(AI_SEAT_IDS[2], 3)];
  const atLimit = decide({
    seats,
    turnNumber: 30,
    cities: { [AI_SEAT_IDS[0]]: 9, [AI_SEAT_IDS[1]]: 9, [AI_SEAT_IDS[2]]: 4 },
  });
  assert.equal(atLimit.gameOver, true);
  assert.equal(atLimit.endReason, 'turn_limit');
  assert.equal(atLimit.finalPlaces.get(AI_SEAT_IDS[0]), 1);
  assert.equal(atLimit.finalPlaces.get(AI_SEAT_IDS[1]), 1);
  assert.equal(atLimit.finalPlaces.get(AI_SEAT_IDS[2]), 3);
  assert.equal(atLimit.winnerSeatId, null);
  const before = decide({
    seats,
    turnNumber: 29,
    cities: { [AI_SEAT_IDS[0]]: 9, [AI_SEAT_IDS[1]]: 9, [AI_SEAT_IDS[2]]: 4 },
  });
  assert.equal(before.gameOver, false);
  assert.equal(before.finalPlaces.size, 0);
});

test('a seat already out is not an attacker and is not knocked out again', () => {
  const seats = [seat(HUMAN_SEAT_ID, 1), seat(AI_SEAT_IDS[0], 2), seat(AI_SEAT_IDS[1], 3, 2)];
  const outcome = decide({
    seats,
    control: (attacker) => attacker === AI_SEAT_IDS[1],
    cities: { [AI_SEAT_IDS[1]]: 0 },
    intact: { [AI_SEAT_IDS[1]]: 0 },
  });
  assert.equal(outcome.knockouts.length, 0);
  assert.equal(outcome.gameOver, false);
});
