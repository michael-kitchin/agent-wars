/**
 * A funded fortification queue fortifies city cells, and a full city pauses the queue.
 *
 * Purpose: Production must spend a fortification before any later unit row, and Keep building stops at the last cell.
 * When to use: After changing the production spend loop or cell fortification.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fortificationCostPerCell } from '../shared/gameRules';
import { FORTIFICATION_QUEUE_ITEM } from '../shared/fortificationRules';
import { HUMAN_SEAT_ID } from '../shared/seatIds';
import { processProductionAfterControlResolution } from './gameActions/controlAndProduction';
import {
  dbGetOne,
  getBuildProgressPointsForHex,
  getKeepBuildingForHex,
  getStrategicInfrastructureForHex,
  listBuildQueueRowsForHex,
  listFortifiableCellsForHex,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
  setKeepBuildingForHex,
  setTacticalCellFortified,
} from './gameDb';
import { withTempGameDb } from './testSupport/withTempGameDb';

/**
 * A human city hex with at least three intact cells.
 *
 * Purpose: The flow cases need a real city, not a faked infrastructure count.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: The hex index.
 * Exceptions: Throws when the seeded map has no such hex.
 */
function humanCityHex(): string {
  const hex = dbGetOne<{ h3Index: string }>(
    `SELECT c.h3_index AS h3Index
     FROM res_s_control c
     JOIN res_s_infrastructure i ON i.h3_index = c.h3_index
     WHERE c.controller_player_id = ? AND i.fortifiable_count >= 3
     ORDER BY i.fortifiable_count ASC, c.h3_index ASC
     LIMIT 1`,
    [HUMAN_SEAT_ID]
  )?.h3Index;
  assert.ok(hex, 'expected a human city hex with at least 3 intact cells');
  return hex;
}

test('a funded fortification queue fortifies that many cells and then is empty', () => {
  withTempGameDb('aw-fort-build-', () => {
    const hex = humanCityHex();
    const before = getStrategicInfrastructureForHex(hex).fortifiedCount;
    const cost = fortificationCostPerCell();
    replaceBuildQueueForHex(hex, [{ unitType: FORTIFICATION_QUEUE_ITEM, remainingCount: 2 }]);
    setBuildProgressPointsForHex(hex, cost * 2);
    const result = processProductionAfterControlResolution();
    assert.equal(getStrategicInfrastructureForHex(hex).fortifiedCount, before + 2);
    assert.equal(listBuildQueueRowsForHex(hex).length, 0);
    assert.equal(result.fortificationsBuiltByPlayer.get(HUMAN_SEAT_ID), 2);
  });
});

test('a full city pauses the fortification row and does not build the infantry behind it', () => {
  withTempGameDb('aw-fort-pause-', () => {
    const hex = humanCityHex();
    for (const cell of listFortifiableCellsForHex(hex)) setTacticalCellFortified(cell, true);
    const stored = 40;
    replaceBuildQueueForHex(hex, [
      { unitType: FORTIFICATION_QUEUE_ITEM, remainingCount: 1 },
      { unitType: 'infantry', remainingCount: 1 },
    ]);
    setBuildProgressPointsForHex(hex, stored);
    const urban = getStrategicInfrastructureForHex(hex).urbanHexCount;
    const unitsBefore = dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM units WHERE h3_index = ?', [hex])?.count;
    const result = processProductionAfterControlResolution();
    const rows = listBuildQueueRowsForHex(hex);
    assert.deepEqual(
      rows.map((row) => row.unitType),
      [FORTIFICATION_QUEUE_ITEM, 'infantry']
    );
    assert.equal(getBuildProgressPointsForHex(hex), stored + urban);
    assert.equal(dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM units WHERE h3_index = ?', [hex])?.count, unitsBefore);
    assert.ok(result.fortificationPausedHexesByPlayer.get(HUMAN_SEAT_ID)?.includes(hex));
  });
});

test('keep building fortifies the last cell and then pauses', () => {
  withTempGameDb('aw-fort-keep-', () => {
    const hex = humanCityHex();
    const cells = listFortifiableCellsForHex(hex);
    for (const cell of cells.slice(1)) setTacticalCellFortified(cell, true);
    const before = getStrategicInfrastructureForHex(hex).fortifiedCount;
    setKeepBuildingForHex(hex, true, FORTIFICATION_QUEUE_ITEM);
    setBuildProgressPointsForHex(hex, fortificationCostPerCell() * 3);
    const result = processProductionAfterControlResolution();
    const standing = getKeepBuildingForHex(hex);
    assert.equal(getStrategicInfrastructureForHex(hex).fortifiedCount, before + 1);
    assert.equal(standing.keepBuilding, true);
    assert.equal(standing.keepBuildingUnitType, FORTIFICATION_QUEUE_ITEM);
    assert.ok(result.fortificationPausedHexesByPlayer.get(HUMAN_SEAT_ID)?.includes(hex));
  });
});
