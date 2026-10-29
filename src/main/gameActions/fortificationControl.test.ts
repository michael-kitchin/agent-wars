/**
 * A fortified hex keeps its controller until the last fortification is gone.
 *
 * Purpose: Walking into an empty fortified hex does not capture it.
 * When to use: After changing the control skip in `resolveStrategicControlAfterCombatAndMovement`.
 * Expected outcome: The AI keeps the hex while a fortification remains, then the human takes it.
 * Exceptions: None. The case removes its temporary match.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  dbGetOne,
  dbRun,
  getHexController,
  listFortifiableCellsForHex,
  listFortifiedCellsForHex,
  setTacticalCellFortified,
} from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { resolveStrategicControlAfterCombatAndMovement } from './controlAndProduction';

test('an occupied fortified hex stays with its controller until the fortification is gone', () => {
  withSeatedTempGameDb('aw-fort-control-', { fogOfWarEnabled: false }, () => {
    const row = dbGetOne<{ h3Index: string; controller: string }>(
      `SELECT c.h3_index AS h3Index, c.controller_player_id AS controller
       FROM res_s_control c
       JOIN res_s_infrastructure i ON i.h3_index = c.h3_index
       WHERE c.controller_player_id IS NOT NULL
         AND c.controller_player_id != ?
         AND i.fortifiable_count >= 1
         AND NOT EXISTS (SELECT 1 FROM units u WHERE u.h3_index = c.h3_index)
       ORDER BY c.h3_index ASC
       LIMIT 1`,
      [HUMAN_SEAT_ID]
    );
    assert.ok(row);
    const cell = listFortifiableCellsForHex(row.h3Index)[0];
    assert.ok(cell);
    setTacticalCellFortified(cell, true);
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('fort-control-inf', ?, 'infantry', ?, 1)`,
      [HUMAN_SEAT_ID, row.h3Index]
    );
    resolveStrategicControlAfterCombatAndMovement();
    assert.equal(getHexController(row.h3Index), row.controller);
    for (const fortified of listFortifiedCellsForHex(row.h3Index)) setTacticalCellFortified(fortified, false);
    resolveStrategicControlAfterCombatAndMovement();
    assert.equal(getHexController(row.h3Index), HUMAN_SEAT_ID);
  });
});
