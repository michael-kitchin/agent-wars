/**
 * Production pauses outside home until a unit or a fortification is there.
 *
 * Purpose: A paused queue drops its points and keeps its rows. Standing on the hex, or fortifying it, lets it build. A queue that is still building keeps what it cannot yet spend.
 * When to use: After changing the production pause.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SEAT_ID } from '../shared/seatIds';
import { getHexBuildQueue } from './gameActions';
import { processProductionAfterControlResolution } from './gameActions/controlAndProduction';
import {
  dbGetAll,
  dbGetOne,
  dbRun,
  getBuildProgressPointsForHex,
  getScenarioHomeRegionHexes,
  getSeatRoster,
  getStrategicInfrastructureForHex,
  listBuildQueueRowsForHex,
  listFortifiableCellsForHex,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
  setHexController,
  setStrategicInfrastructureForHex,
  setTacticalCellFortified,
} from './gameDb';
import { insertUnitRow } from './gameDb/unitInsert';
import { withTempGameDb } from './testSupport/withTempGameDb';

test('an empty hex outside home discards its points and keeps the queue', () => {
  withTempGameDb('aw-pause-bank-', () => {
    const hex = outsideHomeCity();
    setHexController(hex, HUMAN_SEAT_ID);
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    replaceBuildQueueForHex(hex, [{ unitType: 'infantry', remainingCount: 1 }]);
    setBuildProgressPointsForHex(hex, 40);
    assert.equal(getHexBuildQueue(hex, HUMAN_SEAT_ID).buildPaused, true);
    assert.deepEqual(getHexBuildQueue(hex, HUMAN_SEAT_ID).pausedReasons, ['occupation']);
    const summary = processProductionAfterControlResolution();
    assert.equal(listBuildQueueRowsForHex(hex).length, 1);
    assert.equal(getBuildProgressPointsForHex(hex), 0);
    assert.deepEqual(
      summary.newlyPausedQueuesByPlayer.get(HUMAN_SEAT_ID)?.find((pause) => pause.h3Index === hex)?.reasons,
      ['occupation']
    );
    const spawned = dbGetOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM units WHERE player = 'human' AND unit_type = 'infantry' AND h3_index = ? AND is_mercenary = 0",
      [hex]
    );
    assert.equal(spawned?.n, 0);
  });
});

test('a buildable queue that cannot afford its next item keeps its points', () => {
  withTempGameDb('aw-pause-keep-', () => {
    const hex = outsideHomeCity();
    setHexController(hex, HUMAN_SEAT_ID);
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    insertUnitRow(dbRun, {
      id: 'h1-i949',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 949,
      h3Index: hex,
      origin: null,
      formedTurn: 1,
    });
    setStrategicInfrastructureForHex(hex, { urbanHexCount: 4, airportCount: 0, seaportCount: 0 });
    replaceBuildQueueForHex(hex, [{ unitType: 'infantry', remainingCount: 1 }]);
    setBuildProgressPointsForHex(hex, 3);
    processProductionAfterControlResolution();
    assert.equal(listBuildQueueRowsForHex(hex).length, 1);
    assert.equal(getBuildProgressPointsForHex(hex), 7);
  });
});

test('a unit on the hex lets production build', () => {
  withTempGameDb('aw-pause-unit-', () => {
    const hex = outsideHomeCity();
    setHexController(hex, HUMAN_SEAT_ID);
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    insertUnitRow(dbRun, {
      id: 'h1-i950',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 950,
      h3Index: hex,
      origin: null,
      formedTurn: 1,
    });
    replaceBuildQueueForHex(hex, [{ unitType: 'infantry', remainingCount: 1 }]);
    setBuildProgressPointsForHex(hex, 100);
    processProductionAfterControlResolution();
    const spawned = dbGetOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM units WHERE player = 'human' AND unit_type = 'infantry' AND h3_index = ? AND is_mercenary = 0",
      [hex]
    );
    assert.equal(spawned?.n, 2);
  });
});

test('a fortification on the hex lets production build', () => {
  withTempGameDb('aw-pause-fort-', () => {
    const hex = outsideHomeCity();
    setHexController(hex, HUMAN_SEAT_ID);
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    const cell = listFortifiableCellsForHex(hex)[0];
    assert.ok(cell);
    setTacticalCellFortified(cell, true);
    replaceBuildQueueForHex(hex, [{ unitType: 'infantry', remainingCount: 1 }]);
    setBuildProgressPointsForHex(hex, 100);
    processProductionAfterControlResolution();
    const spawned = dbGetOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM units WHERE player = 'human' AND unit_type = 'infantry' AND h3_index = ? AND is_mercenary = 0",
      [hex]
    );
    assert.equal(spawned?.n, 1);
  });
});

test('a fortification queue in a fully fortified city reports every city cell fortified', () => {
  withTempGameDb('aw-pause-full-', () => {
    const hex = outsideHomeCity();
    setHexController(hex, HUMAN_SEAT_ID);
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    for (const cell of listFortifiableCellsForHex(hex)) setTacticalCellFortified(cell, true);
    assert.equal(getStrategicInfrastructureForHex(hex).fortifiableCount, 0, 'fixture must leave no fortifiable cell');
    replaceBuildQueueForHex(hex, [{ unitType: 'fortification', remainingCount: 1 }]);
    assert.deepEqual(getHexBuildQueue(hex, HUMAN_SEAT_ID).pausedReasons, ['allCellsFortified']);
  });
});

test('a paused queue is reported on the turn it pauses, and again only after it resumes', () => {
  withTempGameDb('aw-pause-once-', () => {
    const hex = outsideHomeCity();
    setHexController(hex, HUMAN_SEAT_ID);
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    replaceBuildQueueForHex(hex, [{ unitType: 'infantry', remainingCount: 1 }]);
    const reportedThisPass = (): boolean =>
      processProductionAfterControlResolution()
        .newlyPausedQueuesByPlayer.get(HUMAN_SEAT_ID)
        ?.some((pause) => pause.h3Index === hex) === true;
    assert.equal(reportedThisPass(), true, 'first paused pass');
    assert.equal(reportedThisPass(), false, 'still paused');
    insertUnitRow(dbRun, {
      id: 'h1-i951',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 951,
      h3Index: hex,
      origin: null,
      formedTurn: 1,
    });
    setBuildProgressPointsForHex(hex, 100);
    assert.equal(reportedThisPass(), false, 'building again');
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    replaceBuildQueueForHex(hex, [{ unitType: 'infantry', remainingCount: 1 }]);
    assert.equal(reportedThisPass(), true, 'paused again after resuming');
  });
});

/**
 * A city hex outside every seat's home region.
 *
 * Purpose: The pause cases need a hex the home-region rule does not already allow.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: The hex index.
 * Exceptions: Throws when the seeded map has no such city.
 */
function outsideHomeCity(): string {
  const homes = new Set<string>();
  for (const seat of getSeatRoster()) {
    for (const h3Index of getScenarioHomeRegionHexes(seat.homeRegion)) homes.add(h3Index);
  }
  const hex = dbGetAll<{ h3Index: string }>(
    `SELECT h3_index AS h3Index FROM res_s_infrastructure
     WHERE urban_hex_count > 0 AND fortified_count = 0 AND fortifiable_count >= 1`
  ).find((row) => !homes.has(row.h3Index))?.h3Index;
  assert.ok(hex);
  return hex;
}
