/**
 * The charts snapshot.
 *
 * Purpose: The player sees every side's numbers, including an opponent's treasury, with fog of war on.
 * When to use: `npm run build:main`, then `node dist/main/ipc/matchChartsIpcHandler.test.js`.
 * Expected outcome: Every seat is named, the recorded turns are listed, and with no database the snapshot is empty.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strategicStep } from '../../shared/matchRecording';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { upsertGameConfigValue } from '../gameDb/gameConfigRows';
import { forgetTurnOwnershipForTests } from '../matchStatistics/turnDifferences';
import { recordStepBoundary } from '../recorder/matchRecorder';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { buildMatchChartsSnapshot } from './matchChartsIpcHandler';

/**
 * The largest listed home regions.
 *
 * Purpose: A global start needs regions that can hold opening units.
 * When to use: Before the seated start in this file.
 * Expected outcome: Up to `count` names.
 * Exceptions: None.
 */
function largestHomeRegions(count: number): string[] {
  return listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((left, right) => right.hexes - left.hexes || left.name.localeCompare(right.name))
    .slice(0, count)
    .map((region) => region.name);
}

test('the snapshot lists every seat and every recorded turn with fog of war on', () => {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  forgetTurnOwnershipForTests();
  withSeatedTempGameDb('aw-match-charts-ipc-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, () => {
    upsertGameConfigValue(gameDbOps, 'fog_of_war_enabled', '1');
    gameDbOps.run('INSERT OR REPLACE INTO res_s_treasury (player_id, credits) VALUES (?, 321)', [AI_SEAT_IDS[0]]);
    recordStepBoundary(strategicStep(1), '1.0.0');
    gameDbOps.run('UPDATE turn_state SET turn_number = 2 WHERE id = 1');
    recordStepBoundary(strategicStep(2), '1.0.0');
    const snapshot = buildMatchChartsSnapshot();
    assert.deepEqual(snapshot.seats.map((seat) => seat.seatId), [HUMAN_SEAT_ID, AI_SEAT_IDS[0], AI_SEAT_IDS[1]]);
    assert.ok(snapshot.seats.every((seat) => seat.name.length > 0));
    assert.deepEqual(snapshot.turns.map((turn) => turn.turnNumber), [1, 2]);
    assert.equal(snapshot.currentTurnNumber, 2);
    assert.equal(snapshot.turns[1]?.sides.find((side) => side.seatId === AI_SEAT_IDS[0])?.treasury, 321);
  });
});

test('with no match open the snapshot is empty and on turn 1', () => {
  assert.deepEqual(buildMatchChartsSnapshot(), { seats: [], turns: [], currentTurnNumber: 1 });
});
