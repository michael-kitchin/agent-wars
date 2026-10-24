import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { dbGetOne, getGameState, getSeatRoster } from '../gameDb';
import { loadScenarioState } from './scenarioState';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('a new match stores the human seat and the first AI seat', () => {
  withTempGameDb('aw-reset-seats-', () => {
    const scenario = loadScenarioState({ getOne: dbGetOne });
    const roster = getSeatRoster();
    assert.equal(roster.length, 2);
    assert.equal(roster[0]?.seatId, HUMAN_SEAT_ID);
    assert.equal(roster[0]?.seatOrder, 1);
    assert.equal(roster[0]?.kind, 'human');
    assert.equal(roster[0]?.commander, null);
    assert.ok((roster[0]?.homeRegion.length ?? 0) > 0);
    assert.equal(roster[1]?.seatId, AI_SEAT_IDS[0]);
    assert.equal(roster[1]?.seatOrder, 2);
    assert.equal(roster[1]?.kind, 'ai');
    assert.equal(roster[1]?.commander?.doctrineChoice, 'balanced');
    assert.equal(roster[1]?.commander?.doctrine, 'balanced');
    assert.ok((roster[1]?.homeRegion.length ?? 0) > 0);
    assert.notEqual(roster[0]?.homeRegion, roster[1]?.homeRegion);
    const state = getGameState();
    assert.equal(scenario.scenarioId, 'region_vs_region');
    assert.equal(state.seats?.length, 2);
    assert.deepEqual(state.homeRegionHexesBySeat?.[HUMAN_SEAT_ID], state.homeRegionHexesBySeat?.[roster[0]!.seatId]);
  });
});
