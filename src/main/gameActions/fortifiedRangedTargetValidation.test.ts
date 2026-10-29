/**
 * Ranged fire may target an empty enemy fortified hex.
 *
 * Purpose: The order gate accepts that target and still rejects an empty hex with no fortification.
 * When to use: After changing `validateRangedAttack`.
 * Expected outcome: The cases below. Fog is off.
 * Exceptions: None. Each case removes its temporary match.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  dbGetOne,
  dbRun,
  getMapHexSet,
  listFortifiableCellsForHex,
  setTacticalCellFortified,
} from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { validateRangedAttack } from './strategicOrderValidation';

test('an empty enemy fortified hex is a legal ranged target and an unfortified one is not', () => {
  withSeatedTempGameDb('aw-fort-ranged-target-', { fogOfWarEnabled: false }, () => {
    const target = dbGetOne<{ h3Index: string }>(
      `SELECT c.h3_index AS h3Index
       FROM res_s_control c
       JOIN res_s_infrastructure i ON i.h3_index = c.h3_index
       WHERE c.controller_player_id IS NOT NULL
         AND c.controller_player_id != ?
         AND i.fortifiable_count >= 1
         AND NOT EXISTS (SELECT 1 FROM units u WHERE u.h3_index = c.h3_index)
       ORDER BY c.h3_index ASC
       LIMIT 1`,
      [HUMAN_SEAT_ID]
    )?.h3Index;
    assert.ok(target);
    const map = getMapHexSet();
    const origin = gridDisk(target, 1).find((hex) => hex !== target && map.has(hex));
    assert.ok(origin);
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('fort-ranged-armor', ?, 'armor', ?, 1)`,
      [HUMAN_SEAT_ID, origin]
    );
    const before = validateRangedAttack('fort-ranged-armor', target);
    assert.equal(before.valid, false);
    if (!before.valid) assert.equal(before.reason, 'Target hex has no enemy units');
    const cell = listFortifiableCellsForHex(target)[0];
    assert.ok(cell);
    setTacticalCellFortified(cell, true);
    assert.deepEqual(validateRangedAttack('fort-ranged-armor', target), { valid: true });
  });
});
