/**
 * Missile standing-order contracts exercised through the standing-order tool.
 *
 * Purpose: A missile may hold and may not cancel that hold. Other standing orders are refused.
 * When to use: From the standing-order test list.
 * Expected outcome: The march refusal, the hold acceptance, and the cancel refusal each match the missile sentences.
 * Exceptions: None. The temporary database is removed by `withTempGameDb`.
 */

import * as assert from 'assert';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import {
  MISSILE_HOLD_CANNOT_BE_CANCELLED_REASON,
  missileStandingOrderRejectionReason,
} from '../../shared/missileRules';
import { dbGetOne, dbRun } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { executeStandingOrders } from './standingOrders';

/**
 * Refuses a missile march, accepts hold, and refuses cancelling that hold.
 *
 * Purpose: Covers the three standing-order outcomes a missile can produce.
 * When to use: The standing-order test list.
 * Expected outcome: March and cancel return the missile sentences. Hold returns ok. The hold row remains after cancel.
 * Exceptions: None.
 */
export function testMissileRefusesMarchAcceptsHoldAndKeepsIt(): void {
  withTempGameDb('aw-missile-order-', () => {
    const h3 = dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM hexes LIMIT 1')?.h3Index;
    assert.ok(h3);
    const seatId = AI_SEAT_IDS[0];
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index) VALUES ('a1-m1', ?, 'missile', ?)`,
      [seatId, h3]
    );
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, status, created_turn, origin_hex)
       VALUES (?, 'a1-m1', 'hold_fire', '{"type":"hold_fire"}', 'holding', 1, '[]')`,
      [seatId]
    );
    const state = {
      turnNumber: 1,
      phase: 'planning',
      hexes: [],
      units: [{ id: 'a1-m1', player: seatId, unitType: 'missile', h3Index: h3 }],
    } as unknown as GameStateSnapshot;
    const noCoordinates = new Map<string, [number, number]>();
    const refused = executeStandingOrders(
      seatId,
      'assign_order',
      { unitId: 'a1-m1', order: { type: 'march', destination: [0, 0] } },
      state,
      noCoordinates,
      () => undefined
    );
    assert.strictEqual((refused as { error?: string }).error, missileStandingOrderRejectionReason('march'));
    const cancelled = executeStandingOrders(
      seatId,
      'cancel_order',
      { unitId: 'a1-m1' },
      state,
      noCoordinates,
      () => undefined
    );
    assert.strictEqual((cancelled as { error?: string }).error, MISSILE_HOLD_CANNOT_BE_CANCELLED_REASON);
    assert.strictEqual(
      dbGetOne<{ orderType: string }>('SELECT order_type AS orderType FROM standing_orders WHERE unit_id = ?', ['a1-m1'])
        ?.orderType,
      'hold_fire'
    );
    const accepted = executeStandingOrders(
      seatId,
      'assign_order',
      { unitId: 'a1-m1', order: { type: 'hold_fire' } },
      state,
      noCoordinates,
      () => undefined
    );
    assert.strictEqual(accepted.status, 'ok');
    assert.strictEqual(
      standingOrderHoldStatus(),
      'holding'
    );
  });
}

/**
 * Reads the missile hold row's status.
 *
 * Purpose: Confirms `assign_order` of `hold_fire` stored the same status knockout and production write.
 * When to use: After the accept call in `testMissileRefusesMarchAcceptsHoldAndKeepsIt`.
 * Expected outcome: `holding`.
 * Exceptions: None.
 */
function standingOrderHoldStatus(): string | undefined {
  return dbGetOne<{ status: string }>('SELECT status FROM standing_orders WHERE unit_id = ?', ['a1-m1'])?.status;
}
