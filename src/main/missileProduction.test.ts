/**
 * Missile production contracts: the Advanced urban gate and the hold order written at spawn.
 *
 * Purpose: A missile is offered only at an Advanced hex, and the spawned row is already holding.
 * When to use: After changing `getAvailableBuildUnitTypes` or `spawnProducedUnitsForHex`.
 * Expected outcome: 20 urban cells offer no missile. 21 do. A funded queue spawns a holding missile.
 * Exceptions: None. The temporary database is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dbGetOne,
  getGameState,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
  setStrategicInfrastructureForHex,
} from './gameDb';
import { processProductionAfterControlResolution } from './gameActions/controlAndProduction';
import { getAvailableBuildUnitTypes } from './productionRules';
import { withTempGameDb } from './testSupport/withTempGameDb';

test('missiles are offered at the Advanced urban threshold', () => {
  assert.equal(getAvailableBuildUnitTypes(20, 0, 0).includes('missile'), false);
  assert.equal(getAvailableBuildUnitTypes(21, 0, 0).includes('missile'), true);
});

test('a funded missile queue spawns a missile that is already holding', () => {
  withTempGameDb('aw-missile-prod-', () => {
    const h3 = getGameState().hexes.find((hex) => {
      return dbGetOne<{ controller: string }>(
        'SELECT controller_player_id AS controller FROM res_s_control WHERE h3_index = ?',
        [hex.h3Index]
      )?.controller === 'human';
    })?.h3Index;
    assert.ok(h3);
    setStrategicInfrastructureForHex(h3, { urbanHexCount: 21, airportCount: 0, seaportCount: 0 });
    replaceBuildQueueForHex(h3, [{ unitType: 'missile', remainingCount: 1 }]);
    setBuildProgressPointsForHex(h3, 200);
    processProductionAfterControlResolution();
    const unit = dbGetOne<{ id: string }>(
      `SELECT id FROM units WHERE player = 'human' AND unit_type = 'missile' AND h3_index = ?`,
      [h3]
    );
    assert.ok(unit);
    const order = dbGetOne<{ orderType: string; status: string }>(
      'SELECT order_type AS orderType, status FROM standing_orders WHERE unit_id = ?',
      [unit!.id]
    );
    assert.equal(order?.orderType, 'hold_fire');
    assert.equal(order?.status, 'holding');
  });
});
