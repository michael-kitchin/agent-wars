/**
 * Per-seat AI stores.
 * Run: `node dist/main/gameDb/aiStateSeats.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { MovementOrder } from '../../shared/ipcTypes';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import {
  addAiLossEventsSinceConsultation,
  addCombatSinceConsultation,
  getAiLastConsultationTurn,
  getAiLossEventsSinceConsultation,
  getAiPendingOrders,
  getAndClearAiToolLimitExceededLastTurn,
  getCombatSinceConsultation,
  setAiLastConsultationTurn,
  setAiPendingOrders,
  setAiToolLimitExceededLastTurn,
} from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';

/**
 * Opens a temporary database for one store check.
 *
 * Purpose: Seat isolation must not touch the developer's match file.
 * When to use: Each test in this file.
 * Expected outcome: `runCase` sees an empty game database. The directory is removed afterward.
 * Exceptions: Propagates `runCase` errors after closing the database.
 */
function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-ai-seats-', runCase, { reset: false });
}

test('one seat cannot read another seat\'s commander stores', () => {
  withTempDb(() => {
    const first = AI_SEAT_IDS[0];
    const second = AI_SEAT_IDS[1];
    const move: MovementOrder = { unitId: 'a2-inf', toH3Index: 'abc' };
    const launch = { unitId: 'a2-m1', targetH3Index: 'def' };
    setAiPendingOrders(second, {
      movementOrders: [move],
      rangedOrders: [],
      airStrikeOrders: [],
      ferryOrders: [],
      embarkOrders: [],
      missileLaunchOrders: [launch],
    });
    addCombatSinceConsultation(second, ['a2-inf']);
    const kill: KillEdge = { victimId: 'a2-inf', killerIds: ['h-inf'] };
    addAiLossEventsSinceConsultation(second, 4, [{ id: 'a2-inf', player: second }], [kill]);
    setAiLastConsultationTurn(second, 4);
    setAiToolLimitExceededLastTurn(second);

    assert.equal(getAiPendingOrders(first)?.movementOrders.length ?? 0, 0);
    assert.deepEqual(getCombatSinceConsultation(first), []);
    assert.equal(getAiLossEventsSinceConsultation(first).length, 0);
    assert.equal(getAiLastConsultationTurn(first), 0);
    assert.equal(getAndClearAiToolLimitExceededLastTurn(first), false);

    assert.equal(getAiPendingOrders(second)?.movementOrders[0]?.unitId, 'a2-inf');
    assert.deepEqual(getAiPendingOrders(second)?.missileLaunchOrders, [launch]);
    assert.deepEqual(getCombatSinceConsultation(second), ['a2-inf']);
    assert.equal(getAiLossEventsSinceConsultation(second)[0]?.victimUnitId, 'a2-inf');
    assert.equal(getAiLastConsultationTurn(second), 4);
    assert.equal(getAndClearAiToolLimitExceededLastTurn(second), true);
    assert.equal(getAndClearAiToolLimitExceededLastTurn(second), false);
  });
});
