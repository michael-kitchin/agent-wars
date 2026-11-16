/**
 * Recording a turn's statistics on a seated match.
 *
 * Purpose: One event per strategic step, with losses and captures filled in from the turn before.
 * When to use: `npm run build:main`, then `node dist/main/matchStatistics/statisticsRecording.test.js`.
 * Expected outcome: The cases below. The temporary match is closed afterward.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { strategicStep, tacticalStep } from '../../shared/matchRecording';
import type { TurnStatistics } from '../../shared/matchStatistics';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { upsertSideStance } from '../gameDb/sideMessageStore';
import { listMatchRecords } from '../recorder/matchRecordStore';
import { recordMatchEvent } from '../recorder/matchRecorder';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { recordTurnStatistics } from './statisticsRecording';
import { forgetTurnOwnershipForTests } from './turnDifferences';

/**
 * The largest listed home regions.
 *
 * Purpose: A global start needs regions that can hold opening units.
 * When to use: Before the match in this file.
 * Expected outcome: Up to `count` names.
 * Exceptions: None.
 */
function largestHomeRegions(count: number): string[] {
  return listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((region) => region.name);
}

/**
 * Lists the payloads of every recorded statistics event.
 *
 * Purpose: Each case reads back what the recorder wrote.
 * When to use: After a call to `recordTurnStatistics`.
 * Expected outcome: The decoded payloads, oldest first.
 * Exceptions: None.
 */
function listMatchEventsOfTypeForTests(): unknown[] {
  return listMatchRecords(gameDbOps)
    .filter((row) => row.recordType === 'side_statistics')
    .map((row) => row.payload);
}

/**
 * Records the current state as one strategic step and returns the newest statistics payload.
 *
 * Purpose: Each case calls the recorder the way the frame hook does.
 * When to use: Every case.
 * Expected outcome: The payload of the last `side_statistics` event.
 * Exceptions: None.
 */
function recordAt(turnNumber: number): TurnStatistics {
  recordTurnStatistics(strategicStep(turnNumber), readSeatRoster(gameDbOps), recordMatchEvent);
  const events = listMatchEventsOfTypeForTests();
  return events[events.length - 1] as TurnStatistics;
}

beforeEach(() => forgetTurnOwnershipForTests());

test('statistics follow the turns, and a tactical step writes nothing', () => {
  const regions = largestHomeRegions(3);
  withSeatedTempGameDb('aw-statistics-recording-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, () => {
    const seat = AI_SEAT_IDS[0];
    const first = recordAt(1);
    assert.equal(first.sides.length, 3);
    assert.deepEqual(first.sides.map((side) => side.unitsLost), [null, null, null]);
    assert.equal(first.hexesTaken, null);

    const [victim, second] = gameDbOps.getAll<{ id: string }>(
      'SELECT id FROM units WHERE player = ? ORDER BY id LIMIT 2',
      [seat]
    );
    gameDbOps.run('DELETE FROM units WHERE id = ?', [victim!.id]);
    const turn2 = recordAt(2);
    assert.equal(turn2.sides.find((side) => side.seatId === seat)?.unitsLost, 1);
    assert.equal(turn2.sides.find((side) => side.seatId === HUMAN_SEAT_ID)?.unitsLost, 0);
    assert.deepEqual(turn2.hexesTaken, []);

    gameDbOps.run('DELETE FROM units WHERE id = ?', [second!.id]);
    assert.equal(recordAt(2).sides.find((side) => side.seatId === seat)?.unitsLost, 2);
    assert.deepEqual(recordAt(3).sides.map((side) => side.unitsLost), [0, 0, 0]);

    const count = listMatchEventsOfTypeForTests().length;
    recordTurnStatistics(tacticalStep(3, 'b1', 1), readSeatRoster(gameDbOps), recordMatchEvent);
    assert.equal(listMatchEventsOfTypeForTests().length, count);
  });
});

test('a stored stance appears in the relationships with its reported turn', () => {
  const regions = largestHomeRegions(2);
  withSeatedTempGameDb('aw-statistics-stance-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
    ],
  }, () => {
    upsertSideStance(gameDbOps, {
      seatId: AI_SEAT_IDS[0],
      towardSeatId: HUMAN_SEAT_ID,
      stance: 'wary',
      reason: 'massing',
      trust: 1,
      threat: 3,
      turnNumber: 4,
    });
    assert.deepEqual(recordAt(5).relationships, [
      { seatId: AI_SEAT_IDS[0], towardSeatId: HUMAN_SEAT_ID, stance: 'wary', trust: 1, threat: 3, reportedTurn: 4 },
    ]);
  });
});
