/**
 * Per-seat AI stores.
 * Run: `node dist/main/gameDb/aiStateSeats.test.js`
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { MovementOrder } from '../../shared/ipcTypes';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import {
  addAiLossEventsSinceConsultation,
  addCombatSinceConsultation,
  closeGameDatabaseForTests,
  getAiLastConsultationTurn,
  getAiLossEventsSinceConsultation,
  getAiPendingOrders,
  getAndClearAiToolLimitExceededLastTurn,
  getCombatSinceConsultation,
  openGameDatabaseAtPathForTests,
  setAiLastConsultationTurn,
  setAiPendingOrders,
  setAiToolLimitExceededLastTurn,
} from '../gameDb';

/**
 * Opens a temporary database for one store check.
 *
 * Purpose: Seat isolation must not touch the developer's match file.
 * When to use: Each test in this file.
 * Expected outcome: `runCase` sees an empty game database. The directory is removed afterward.
 * Exceptions: Propagates `runCase` errors after closing the database.
 */
function withTempDb(runCase: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ai-seats-'));
  openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
  try {
    runCase();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('one seat cannot read another seat\'s commander stores', () => {
  withTempDb(() => {
    const first = AI_SEAT_IDS[0];
    const second = AI_SEAT_IDS[1];
    const move: MovementOrder = { unitId: 'a2-inf', toH3Index: 'abc' };
    setAiPendingOrders(second, [move], []);
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
    assert.deepEqual(getCombatSinceConsultation(second), ['a2-inf']);
    assert.equal(getAiLossEventsSinceConsultation(second)[0]?.victimUnitId, 'a2-inf');
    assert.equal(getAiLastConsultationTurn(second), 4);
    assert.equal(getAndClearAiToolLimitExceededLastTurn(second), true);
    assert.equal(getAndClearAiToolLimitExceededLastTurn(second), false);
  });
});
