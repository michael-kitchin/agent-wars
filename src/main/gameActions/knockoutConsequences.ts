/**
 * Turns a knocked-out seat into Neutral garrisons.
 *
 * Purpose: Land, queues, units, standing orders, and that seat's commander and fog rows change together.
 * When to use: After the end-of-turn outcome is recorded, once per seat in `knockouts`.
 * Expected outcome: The seat's hexes and units belong to Neutral, and its private rows are gone.
 * Exceptions: Propagates SQLite errors after rolling back the knockout transaction.
 */

import { NEUTRAL_OWNER_ID, type SeatId } from '../../shared/seatIds';
import {
  clearBuildQueueAndProgressForHex,
  dbGetAll,
  dbRun,
  setHexController,
} from '../gameDb';
import { logDebug, logError } from '../logger';
import { convertUnitsToNeutral, type KnockoutCoordinates } from './unitOwnershipTransfer';

export type { KnockoutCoordinates } from './unitOwnershipTransfer';

/**
 * What one knockout changed.
 *
 * Contract: Counts are the hexes and units that belonged to the seat when the knockout was applied.
 * When to use: Logging and tests.
 * Expected outcome: Both counts are non-negative.
 * Exceptions: None.
 */
export interface KnockoutApplied {
  /**
   * The seat that was knocked out.
   *
   * Contract: The same id passed to `applyKnockout`.
   * When to use: Matching the result to the roster row.
   * Expected outcome: A `SeatId`.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * Hexes whose controller became Neutral.
   *
   * Contract: Every hex that seat controlled, including hexes with no queue.
   * When to use: Confirming the land flip.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly hexesTurnedNeutral: number;
  /**
   * Units whose owner became Neutral.
   *
   * Contract: Units removed earlier in the turn are not included.
   * When to use: Confirming the garrison conversion.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly unitsTurnedNeutral: number;
}

/**
 * Deletes one seat's commander and fog rows.
 *
 * Purpose: A knocked-out seat no longer consults, remembers, or keeps a private view.
 * When to use: The first step of `applyKnockout`.
 * Expected outcome: Those tables have no row for the seat, and its new-contact key is gone.
 * Exceptions: Propagates SQLite errors.
 */
function deleteSeatPrivateRows(seatId: SeatId): void {
  const tables = [
    'standing_orders',
    'ai_memory',
    'ai_callback_subscriptions',
    'ai_pending_orders',
    'ai_combat_since_consultation',
    'ai_loss_events_since_consultation',
    'player_hex_intel',
    'player_unit_intel',
    'res_s_treasury',
    'res_s_hire_orders',
  ];
  for (const table of tables) {
    dbRun(`DELETE FROM ${table} WHERE player_id = ?`, [seatId]);
  }
  dbRun('DELETE FROM game_config WHERE key = ?', [`fog_new_contacts_${seatId}`]);
}

/**
 * Applies one seat's knockout.
 *
 * Purpose: Land becomes Neutral, queues clear, and units become Neutral garrisons with a defend order.
 * When to use: After `recordEndOfTurnOutcome`, before the fog refresh.
 * Expected outcome: The counts of hexes and units that changed. A standing-order error is logged and skipped.
 * Exceptions: Propagates SQLite errors after rollback.
 */
export function applyKnockout(seatId: SeatId, coordinates: KnockoutCoordinates): KnockoutApplied {
  logDebug('applyKnockout', { seatId });
  dbRun('BEGIN');
  try {
    deleteSeatPrivateRows(seatId);
    const hexes = dbGetAll<{ h3Index: string }>(
      'SELECT h3_index AS h3Index FROM res_s_control WHERE controller_player_id = ?',
      [seatId]
    );
    for (const hex of hexes) {
      setHexController(hex.h3Index, NEUTRAL_OWNER_ID);
      clearBuildQueueAndProgressForHex(hex.h3Index);
    }
    const unitIds = dbGetAll<{ id: string }>('SELECT id FROM units WHERE player = ?', [seatId]).map((row) => row.id);
    const unitsTurnedNeutral = convertUnitsToNeutral(unitIds, coordinates);
    const applied = { seatId, hexesTurnedNeutral: hexes.length, unitsTurnedNeutral };
    dbRun('COMMIT');
    logDebug('applyKnockout done', applied);
    return applied;
  } catch (err) {
    logError('applyKnockout failed', err);
    dbRun('ROLLBACK');
    throw err;
  }
}
