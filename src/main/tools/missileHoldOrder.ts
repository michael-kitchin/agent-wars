/**
 * The only way a missile receives a standing order.
 *
 * Purpose: A missile always holds. A launch is a separate order, so spawning and knockout both write `hold_fire` here
 * instead of asking the standing-order tool to accept a type the missile would otherwise refuse.
 * When to use: Immediately after a missile row is inserted, and when a missile becomes Neutral.
 * Expected outcome: One `holding` row for that unit. A second call replaces it.
 * Exceptions: Propagates SQLite errors.
 */

import { cellToLatLng } from 'h3-js';
import { roundLatLng } from '../mapData';
import { dbRun } from '../gameDb';
import { logDebug } from '../logger';

/**
 * Writes the missile's permanent hold order.
 *
 * Purpose: Production and knockout share one insert so the stored columns match `assignOrder` for `hold_fire`.
 * When to use: After the missile row exists. `createdTurn` is the planning turn, the same value `assignOrder` stores.
 * Expected outcome: `order_type` `hold_fire`, params `{ type: 'hold_fire' }`, no computed route, status `holding`.
 * Exceptions: Propagates SQLite errors. `cellToLatLng` throws when `h3Index` is not a hex.
 */
export function insertMissileHoldOrder(args: {
  readonly playerId: string;
  readonly unitId: string;
  readonly h3Index: string;
  readonly createdTurn: number;
}): void {
  logDebug('insertMissileHoldOrder', {
    playerId: args.playerId,
    unitId: args.unitId,
    h3Index: args.h3Index,
    createdTurn: args.createdTurn,
  });
  const [latitude, longitude] = cellToLatLng(args.h3Index);
  dbRun(
    `INSERT OR REPLACE INTO standing_orders
       (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
     VALUES (?, ?, 'hold_fire', ?, NULL, 'holding', ?, ?)`,
    [
      args.playerId,
      args.unitId,
      JSON.stringify({ type: 'hold_fire' }),
      args.createdTurn,
      JSON.stringify(roundLatLng(latitude, longitude)),
    ]
  );
}
