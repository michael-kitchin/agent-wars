/**
 * End-of-turn outcome against a two-seat global match.
 * Run: `node dist/main/gameActions/endOfTurnOutcome.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  listScenarioHomeRegions,
  getScenarioHomeRegionHexes,
  setStrategicInfrastructureForHex,
  dbRun,
  getGameState,
  getSeatRoster,
} from '../gameDb';
import { ZERO_STRATEGIC_INFRA_COUNTS } from '../testSupport/strategicTestFixtures';
import { withRegionVsRegionTempGameDb } from '../testSupport/withRegionVsRegionTempGameDb';
import { evaluateEndOfTurnOutcome, recordEndOfTurnOutcome } from './endOfTurnOutcome';

test('exclusive home control knocks out the other seat and the holder wins', () => {
  withRegionVsRegionTempGameDb(() => {
    const regions = listScenarioHomeRegions();
    const humanR = regions[0]!;
    const aiR = regions[1] ?? regions[0]!;
    const aiHexes = getScenarioHomeRegionHexes(aiR);
    const humanHexes = getScenarioHomeRegionHexes(humanR);
    for (const h of aiHexes) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h, HUMAN_SEAT_ID]);
    }
    for (const h of humanHexes) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h, HUMAN_SEAT_ID]);
    }
    setStrategicInfrastructureForHex(aiHexes[0]!, { ...ZERO_STRATEGIC_INFRA_COUNTS, urbanHexCount: 1 });
    setStrategicInfrastructureForHex(humanHexes[0]!, { ...ZERO_STRATEGIC_INFRA_COUNTS, urbanHexCount: 1 });
    const outcome = evaluateEndOfTurnOutcome(1);
    assert.equal(outcome.winnerSeatId, HUMAN_SEAT_ID);
    assert.equal(outcome.endReason, 'last_side_standing');
    const knockedOut = outcome.knockouts.find((row) => row.seatId === AI_SEAT_IDS[0]);
    assert.ok(knockedOut?.reasons.includes('home_control'));
    recordEndOfTurnOutcome(outcome, 1);
    const stored = getSeatRoster().find((row) => row.seatId === AI_SEAT_IDS[0]);
    assert.equal(stored?.outTurn, 1);
    assert.equal(stored?.place, 2);
    const state = getGameState();
    assert.equal(state.gameOver, true);
    assert.equal(state.gameEndReason, 'last_side_standing');
    assert.equal(state.winner, HUMAN_SEAT_ID);
  });
});

test('a home with no cities and no urban knocks that seat out while the other home still has a city', () => {
  withRegionVsRegionTempGameDb(() => {
    const regions = listScenarioHomeRegions();
    const humanR = regions[0]!;
    const aiR = regions[1] ?? regions[0]!;
    const aiHexes = getScenarioHomeRegionHexes(aiR);
    const humanHexes = getScenarioHomeRegionHexes(humanR);
    assert.ok(aiHexes.length >= 1);
    assert.ok(humanHexes.length >= 1);
    for (const h of aiHexes) {
      setStrategicInfrastructureForHex(h, ZERO_STRATEGIC_INFRA_COUNTS);
    }
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [aiHexes[0]!, AI_SEAT_IDS[0]]);
    for (let i = 1; i < aiHexes.length; i++) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [aiHexes[i]!, HUMAN_SEAT_ID]);
    }
    setStrategicInfrastructureForHex(humanHexes[0]!, { ...ZERO_STRATEGIC_INFRA_COUNTS, urbanHexCount: 1 });
    const outcome = evaluateEndOfTurnOutcome(1);
    const knockedOut = outcome.knockouts.find((row) => row.seatId === AI_SEAT_IDS[0]);
    assert.ok(knockedOut?.reasons.includes('no_city_hexes'));
    assert.ok(knockedOut?.reasons.includes('home_cities_destroyed'));
    assert.equal(knockedOut?.reasons.indexOf('no_city_hexes'), 0);
    assert.equal(outcome.winnerSeatId, HUMAN_SEAT_ID);
    assert.equal(outcome.endReason, 'last_side_standing');
  });
});

test('both homes destroyed with no exclusive control ends the match with no winner', () => {
  withRegionVsRegionTempGameDb(() => {
    const regions = listScenarioHomeRegions();
    const humanR = regions[0]!;
    const aiR = regions[1] ?? regions[0]!;
    const aiHexes = getScenarioHomeRegionHexes(aiR);
    const humanHexes = getScenarioHomeRegionHexes(humanR);
    for (const h of [...aiHexes, ...humanHexes]) {
      setStrategicInfrastructureForHex(h, ZERO_STRATEGIC_INFRA_COUNTS);
    }
    const firstAi = aiHexes[0]!;
    for (const h of aiHexes) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [
        h,
        h === firstAi ? AI_SEAT_IDS[0] : HUMAN_SEAT_ID,
      ]);
    }
    for (const h of humanHexes) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h, HUMAN_SEAT_ID]);
    }
    const outcome = evaluateEndOfTurnOutcome(1);
    assert.equal(outcome.knockouts.length, 0);
    assert.equal(outcome.gameOver, true);
    assert.equal(outcome.endReason, 'mutual_elimination');
    assert.equal(outcome.winnerSeatId, null);
    assert.equal(outcome.finalPlaces.get(HUMAN_SEAT_ID), 1);
    assert.equal(outcome.finalPlaces.get(AI_SEAT_IDS[0]), 1);
    recordEndOfTurnOutcome(outcome, 1);
    assert.equal(getSeatRoster().every((row) => row.outTurn === null), true);
    assert.equal(getGameState().gameEndReason, 'mutual_elimination');
  });
});
