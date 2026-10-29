/**
 * Strategic soak against fortified cells on a temporary match.
 *
 * Purpose: A fortification saves its controller's unit and is recorded before control can change.
 * When to use: After changing `createStrategicFortificationHooks` or `buildFortificationReports`.
 * Expected outcome: The cases below. Fog is off.
 * Exceptions: None. Each case removes its temporary match.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  dbGetOne,
  getHexController,
  getStrategicInfrastructureForHex,
  listFortifiableCellsForHex,
  setTacticalCellFortified,
} from '../gameDb';
import type { FortificationLossTally } from '../fortificationCombat';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { buildFortificationReports, createStrategicFortificationHooks } from './fortificationCombatLedger';

test('the controller is absorbed until the fortifications are gone', () => {
  withSeatedTempGameDb('aw-fort-ledger-', { fogOfWarEnabled: false }, () => {
    const hex = dbGetOne<{ h3Index: string }>(
      `SELECT c.h3_index AS h3Index
       FROM res_s_control c
       JOIN res_s_infrastructure i ON i.h3_index = c.h3_index
       WHERE c.controller_player_id = ? AND i.fortifiable_count >= 2
       ORDER BY c.h3_index ASC
       LIMIT 1`,
      [HUMAN_SEAT_ID]
    )?.h3Index;
    assert.ok(hex);
    const cells = listFortifiableCellsForHex(hex).slice(0, 2);
    for (const cell of cells) setTacticalCellFortified(cell, true);
    const tally: FortificationLossTally = new Map();
    const hooks = createStrategicFortificationHooks({ next: () => 0, tally });
    const victim = { player: HUMAN_SEAT_ID, h3Index: hex };
    assert.equal(hooks.absorbHit(victim), true);
    assert.equal(hooks.absorbHit(victim), true);
    assert.equal(hooks.absorbHit(victim), false);
    assert.equal(tally.get(hex), 2);
    assert.equal(getStrategicInfrastructureForHex(hex).fortifiedCount, 0);
    assert.deepEqual(buildFortificationReports(tally), [
      { h3Index: hex, ownerId: HUMAN_SEAT_ID, lost: 2, remaining: 0 },
    ]);
  });
});

test('a unit that does not control the hex is never absorbed', () => {
  withSeatedTempGameDb('aw-fort-ledger-other-', { fogOfWarEnabled: false }, () => {
    const hex = dbGetOne<{ h3Index: string }>(
      `SELECT c.h3_index AS h3Index
       FROM res_s_control c
       JOIN res_s_infrastructure i ON i.h3_index = c.h3_index
       WHERE c.controller_player_id = ? AND i.fortifiable_count >= 1
       ORDER BY c.h3_index ASC
       LIMIT 1`,
      [HUMAN_SEAT_ID]
    )?.h3Index;
    assert.ok(hex);
    const cell = listFortifiableCellsForHex(hex)[0];
    assert.ok(cell);
    setTacticalCellFortified(cell, true);
    const tally: FortificationLossTally = new Map();
    const hooks = createStrategicFortificationHooks({ next: () => 0, tally });
    assert.equal(hooks.absorbHit({ player: AI_SEAT_IDS[0], h3Index: hex }), false);
    assert.equal(tally.size, 0);
    assert.equal(getStrategicInfrastructureForHex(hex).fortifiedCount, 1);
    assert.equal(getHexController(hex), HUMAN_SEAT_ID);
  });
});
