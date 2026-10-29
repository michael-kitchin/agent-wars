/**
 * The five launch-validation failures and one accepted launch.
 *
 * Purpose: Submit and resolution share `validateMissileLaunchOrder`.
 * When to use: After changing that function's check order.
 * Expected outcome: Each reason below, then a valid neighbor launch with fog off.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { missileRangeHexes } from '../../shared/gameRules';
import {
  MISSILE_TARGET_OFF_MAP_REASON,
  MISSILE_TARGET_UNEXPLORED_REASON,
  ONLY_MISSILES_CAN_LAUNCH_REASON,
  missileTargetOutOfRangeReason,
} from '../../shared/missileRules';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { dbGetAll, dbGetOne, dbRun, getMapHexSet } from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { validateMissileLaunchOrder } from './missileValidation';

test('launch validation returns each failure reason and accepts an explored hex in range', () => {
  withSeatedTempGameDb('aw-missile-valid-', { fogOfWarEnabled: false }, () => {
    const missing = validateMissileLaunchOrder('missing-missile', 'not-on-map');
    assert.equal(missing.valid, false);
    if (!missing.valid) assert.match(missing.reason, /not found/i);

    const launch = dbGetOne<{ h3Index: string }>(
      `SELECT h3_index AS h3Index FROM hexes h
       WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.h3_index = h.h3_index)
       LIMIT 1`
    )?.h3Index;
    assert.ok(launch);
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('valid-probe', ?, 'infantry', ?, 1)`,
      [HUMAN_SEAT_ID, launch]
    );
    const notMissile = validateMissileLaunchOrder('valid-probe', launch);
    assert.equal(notMissile.valid, false);
    if (!notMissile.valid) assert.equal(notMissile.reason, ONLY_MISSILES_CAN_LAUNCH_REASON);

    dbRun(`UPDATE units SET unit_type = 'missile' WHERE id = 'valid-probe'`);
    const offMap = validateMissileLaunchOrder('valid-probe', 'not-on-map');
    assert.equal(offMap.valid, false);
    if (!offMap.valid) assert.equal(offMap.reason, MISSILE_TARGET_OFF_MAP_REASON);

    const range = missileRangeHexes();
    const inside = new Set(gridDisk(launch, range));
    const outside = gridDisk(launch, range + 1).find((hex) => getMapHexSet().has(hex) && !inside.has(hex));
    assert.ok(outside, `expected an on-map hex outside missile range ${range}`);
    const tooFar = validateMissileLaunchOrder('valid-probe', outside);
    assert.equal(tooFar.valid, false);
    if (!tooFar.valid) assert.equal(tooFar.reason, missileTargetOutOfRangeReason(range));

    const neighbor = gridDisk(launch, 1).find((hex) => hex !== launch && getMapHexSet().has(hex));
    assert.ok(neighbor);
    const valid = validateMissileLaunchOrder('valid-probe', neighbor);
    assert.equal(valid.valid, true);
  });

  withSeatedTempGameDb('aw-missile-valid-fog-', {}, () => {
    const unseen = dbGetAll<{ h3Index: string }>(
      `SELECT h.h3_index AS h3Index FROM hexes h
       WHERE NOT EXISTS (
         SELECT 1 FROM player_hex_intel i WHERE i.player_id = ? AND i.h3_index = h.h3_index
       )
       LIMIT 30`,
      [HUMAN_SEAT_ID]
    );
    let pair: { launch: string; target: string } | null = null;
    for (const row of unseen) {
      const launch = gridDisk(row.h3Index, 1).find((hex) => hex !== row.h3Index && getMapHexSet().has(hex));
      if (launch) {
        pair = { launch, target: row.h3Index };
        break;
      }
    }
    assert.ok(pair);
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('valid-probe-fog', ?, 'missile', ?, 1)`,
      [HUMAN_SEAT_ID, pair.launch]
    );
    const unexplored = validateMissileLaunchOrder('valid-probe-fog', pair.target);
    assert.equal(unexplored.valid, false);
    if (!unexplored.valid) assert.equal(unexplored.reason, MISSILE_TARGET_UNEXPLORED_REASON);
  });
});
