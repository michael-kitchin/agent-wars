/**
 * Production pauses outside home until a unit or a fortification is there.
 *
 * Purpose: Points bank and the queue stays. Standing on the hex, or fortifying it, lets it build.
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
  setTacticalCellFortified,
} from './gameDb';
import { insertUnitRow } from './gameDb/unitInsert';
import { withTempGameDb } from './testSupport/withTempGameDb';

test('an empty hex outside home banks points and keeps the queue', () => {
  withTempGameDb('aw-pause-bank-', () => {
    const hex = outsideHomeCity();
    setHexController(hex, HUMAN_SEAT_ID);
    dbRun('DELETE FROM units WHERE player = ? AND h3_index = ?', [HUMAN_SEAT_ID, hex]);
    replaceBuildQueueForHex(hex, [{ unitType: 'infantry', remainingCount: 1 }]);
    setBuildProgressPointsForHex(hex, 40);
    const urban = getStrategicInfrastructureForHex(hex).urbanHexCount;
    assert.equal(getHexBuildQueue(hex, HUMAN_SEAT_ID).buildPaused, true);
    const summary = processProductionAfterControlResolution();
    assert.equal(listBuildQueueRowsForHex(hex).length, 1);
    assert.equal(getBuildProgressPointsForHex(hex), 40 + urban);
    assert.ok(summary.buildPausedHexesByPlayer.get(HUMAN_SEAT_ID)?.includes(hex));
    const spawned = dbGetOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM units WHERE player = 'human' AND unit_type = 'infantry' AND h3_index = ? AND is_mercenary = 0",
      [hex]
    );
    assert.equal(spawned?.n, 0);
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
