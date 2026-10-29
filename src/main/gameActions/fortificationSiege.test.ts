/**
 * One player in an enemy fortified hex strips fortifications and does not take the hex while any remain.
 *
 * Purpose: Siege uses the same soak hooks as other strategic combat, and control waits for the last fortification.
 * When to use: After changing `runSiegeRolls` or the control skip.
 * Expected outcome: The AI still owns the hex after one fortification falls. The human owns it after the last one, and both reports name the AI.
 * Exceptions: None. The case removes its temporary match.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { runMeleePhase } from '../combatResolution';
import {
  dbGetOne,
  dbRun,
  getHexController,
  getStrategicInfrastructureForHex,
  listFortifiableCellsForHex,
  setTacticalCellFortified,
} from '../gameDb';
import type { FortificationLossTally } from '../fortificationCombat';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { resolveStrategicControlAfterCombatAndMovement } from './controlAndProduction';
import { buildFortificationReports, createStrategicFortificationHooks } from './fortificationCombatLedger';

test('siege keeps the defender until the last fortification falls', () => {
  withSeatedTempGameDb('aw-fort-siege-', { fogOfWarEnabled: false }, () => {
    const row = dbGetOne<{ h3Index: string; controller: string }>(
      `SELECT c.h3_index AS h3Index, c.controller_player_id AS controller
       FROM res_s_control c
       JOIN res_s_infrastructure i ON i.h3_index = c.h3_index
       WHERE c.controller_player_id IS NOT NULL
         AND c.controller_player_id != ?
         AND i.fortifiable_count >= 2
         AND NOT EXISTS (SELECT 1 FROM units u WHERE u.h3_index = c.h3_index)
       ORDER BY c.h3_index ASC
       LIMIT 1`,
      [HUMAN_SEAT_ID]
    );
    assert.ok(row);
    for (const cell of listFortifiableCellsForHex(row.h3Index).slice(0, 2)) setTacticalCellFortified(cell, true);
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('fort-siege-inf', ?, 'infantry', ?, 1)`,
      [HUMAN_SEAT_ID, row.h3Index]
    );
    const infantry = [{ id: 'fort-siege-inf', player: HUMAN_SEAT_ID, unitType: 'infantry', h3Index: row.h3Index }];
    const firstTally: FortificationLossTally = new Map();
    runMeleePhase(infantry, [row.h3Index], () => 0, {
      fortification: createStrategicFortificationHooks({ next: () => 0, tally: firstTally }),
    });
    const firstReports = buildFortificationReports(firstTally);
    resolveStrategicControlAfterCombatAndMovement();
    assert.equal(getStrategicInfrastructureForHex(row.h3Index).fortifiedCount, 1);
    assert.equal(getHexController(row.h3Index), row.controller);
    assert.equal(firstReports[0]?.ownerId, row.controller);
    assert.equal(firstReports[0]?.remaining, 1);

    const secondTally: FortificationLossTally = new Map();
    runMeleePhase(infantry, [row.h3Index], () => 0, {
      fortification: createStrategicFortificationHooks({ next: () => 0, tally: secondTally }),
    });
    const secondReports = buildFortificationReports(secondTally);
    resolveStrategicControlAfterCombatAndMovement();
    assert.equal(getStrategicInfrastructureForHex(row.h3Index).fortifiedCount, 0);
    assert.equal(getHexController(row.h3Index), HUMAN_SEAT_ID);
    assert.equal(secondReports[0]?.ownerId, row.controller);
    assert.equal(secondReports[0]?.remaining, 0);
  });
});
