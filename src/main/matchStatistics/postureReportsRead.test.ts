/**
 * Posture reports for a turn's statistics.
 *
 * Purpose: Each active AI seat's posture, whether it was declared, and whether its lead activity ran must read correctly from the match tables.
 * When to use: `npm run build:main`, then `node dist/main/matchStatistics/postureReportsRead.test.js`.
 * Expected outcome: The cases below. The temporary match is closed afterward.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CampaignObjective } from '../../shared/campaignTypes';
import type { Operation } from '../../shared/operationTypes';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { writeCampaignObjectiveForSeat } from '../gameDb/campaignObjectiveMemory';
import { gameDbOps } from '../gameDb/dbConnection';
import { writeOperationsForSeat } from '../gameDb/operationMemory';
import { writePosture } from '../gameDb/postureMemory';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { postureActing, readPostureReports } from './postureReportsRead';

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
 * Builds a stored campaign objective.
 *
 * Purpose: The cases vary only the phase and the approach.
 * When to use: The objective cases.
 * Expected outcome: An objective with fixed hexes and turns.
 * Exceptions: None.
 */
function objective(phase: CampaignObjective['phase'], approach?: CampaignObjective['approach']): CampaignObjective {
  return { targetH3: '8a2a1072b59ffff', stagingH3: null, phase, source: 'engine', chosenTurn: 1, ...(approach ? { approach } : {}) };
}

/**
 * Builds a stored operation.
 *
 * Purpose: The cases vary only the method and the phase.
 * When to use: The operation cases.
 * Expected outcome: An operation with fixed hexes, units, and turns.
 * Exceptions: None.
 */
function operation(method: Operation['method'], phase: Operation['phase']): Operation {
  return {
    id: `op-${method}-${phase}`,
    method,
    objectiveH3: '8a2a1072b59ffff',
    musterH3: '8a2a1072b587fff',
    landingH3: null,
    unitIds: [],
    carrierIds: [],
    phase,
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
  };
}

test('overland acts only while the land campaign assaults', () => {
  const base = { posture: 'overland', operations: [], launchedMissile: false } as const;
  assert.equal(postureActing({ ...base, objective: objective('assault', 'land') }), true);
  assert.equal(postureActing({ ...base, objective: objective('assault') }), true);
  assert.equal(postureActing({ ...base, objective: objective('assemble', 'land') }), false);
  assert.equal(postureActing({ ...base, objective: objective('assault', 'sea') }), false);
  assert.equal(postureActing({ ...base, objective: null }), false);
});

test('maritime acts while a sea operation is at sea or landed', () => {
  const base = { posture: 'maritime', objective: null, launchedMissile: false } as const;
  assert.equal(postureActing({ ...base, operations: [operation('sea', 'transit')] }), true);
  assert.equal(postureActing({ ...base, operations: [operation('sea', 'assault')] }), true);
  assert.equal(postureActing({ ...base, operations: [operation('sea', 'muster')] }), false);
  assert.equal(postureActing({ ...base, operations: [operation('air', 'transit')] }), false);
});

test('blitz acts with an air operation in any phase', () => {
  const base = { posture: 'blitz', objective: null, launchedMissile: false } as const;
  assert.equal(postureActing({ ...base, operations: [operation('air', 'muster')] }), true);
  assert.equal(postureActing({ ...base, operations: [operation('sea', 'transit')] }), false);
});

test('strangle acts only when a missile was launched', () => {
  const base = { posture: 'strangle', objective: null, operations: [] } as const;
  assert.equal(postureActing({ ...base, launchedMissile: true }), true);
  assert.equal(postureActing({ ...base, launchedMissile: false }), false);
});

test('reports cover active AI seats, with the default undeclared and a stored posture declared', () => {
  const regions = largestHomeRegions(4);
  assert.equal(regions.length, 4);
  withSeatedTempGameDb('aw-posture-reports-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
      { kind: 'ai', homeRegion: regions[3] },
    ],
  }, () => {
    const [first, second, third] = AI_SEAT_IDS;
    writePosture(gameDbOps, second, { posture: 'maritime', sinceTurn: 2 });
    writeOperationsForSeat(gameDbOps, second, [operation('sea', 'transit')]);
    writeCampaignObjectiveForSeat(gameDbOps, first, objective('assault', 'land'));
    const roster = readSeatRoster(gameDbOps).map((seat) => (seat.seatId === third ? { ...seat, outTurn: 4 } : seat));

    const reports = readPostureReports({ ops: gameDbOps, seats: roster, launchedSeatIds: new Set() });

    assert.deepEqual(reports, [
      { seatId: first, posture: 'overland', declared: false, acting: true },
      { seatId: second, posture: 'maritime', declared: true, acting: true },
    ]);
    assert.equal(reports.some((report) => report.seatId === HUMAN_SEAT_ID), false);
  });
});

test('a strangle seat acts only when it is among the launching seats passed in', () => {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  withSeatedTempGameDb('aw-posture-reports-strangle-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, () => {
    const [first, second] = AI_SEAT_IDS;
    writePosture(gameDbOps, first, { posture: 'strangle', sinceTurn: 2 });
    writePosture(gameDbOps, second, { posture: 'strangle', sinceTurn: 2 });

    const reports = readPostureReports({ ops: gameDbOps, seats: readSeatRoster(gameDbOps), launchedSeatIds: new Set([first]) });

    assert.deepEqual(reports, [
      { seatId: first, posture: 'strangle', declared: true, acting: true },
      { seatId: second, posture: 'strangle', declared: true, acting: false },
    ]);
  });
});
