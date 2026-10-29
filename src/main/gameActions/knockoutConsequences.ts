/**
 * Turns a knocked-out seat into Neutral garrisons.
 *
 * Purpose: Land, queues, units, standing orders, and that seat's commander and fog rows change together.
 * When to use: After the end-of-turn outcome is recorded, once per seat in `knockouts`.
 * Expected outcome: The seat's hexes and units belong to Neutral, and its private rows are gone.
 * Exceptions: Propagates SQLite errors after rolling back the knockout transaction.
 */

import { isMissileUnitType } from '../../shared/missileRules';
import { NEUTRAL_OWNER_ID, type SeatId } from '../../shared/seatIds';
import {
  clearBuildQueueAndProgressForHex,
  dbGetAll,
  dbRun,
  getGameState,
  setHexController,
} from '../gameDb';
import { logDebug, logError } from '../logger';
import { executeStandingOrderActionForPlayer } from '../tools/standingOrdersCore';
import { insertMissileHoldOrder } from '../tools/missileHoldOrder';
import type { LatLng } from '../tools/pathfinding';

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
 * Coordinate helpers the standing-order writer needs.
 *
 * Contract: `latLngByH3` covers the hexes still on the map. `resolveToH3` is the inverse used by order assignment.
 * When to use: The same pair `executeReadyStrategicTurn` built for this turn.
 * Expected outcome: A defend order can name the unit's current hex.
 * Exceptions: None.
 */
export interface KnockoutCoordinates {
  /**
   * Center of each strategic hex.
   *
   * Contract: Keys are H3 indexes. Values are latitude and longitude.
   * When to use: The defend order's hex.
   * Expected outcome: A unit's current hex is present when that hex is on the map.
   * Exceptions: None.
   */
  readonly latLngByH3: Map<string, LatLng>;
  /**
   * Resolves a center back to an H3 index.
   *
   * Contract: Returns undefined when the point is not a known hex.
   * When to use: Standing-order assignment.
   * Expected outcome: The inverse of `latLngByH3` for map hexes.
   * Exceptions: None.
   */
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
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
    const units = dbGetAll<{ id: string; h3Index: string; unitType: string }>(
      'SELECT id, h3_index AS h3Index, unit_type AS unitType FROM units WHERE player = ?',
      [seatId]
    );
    dbRun('UPDATE units SET player = ? WHERE player = ?', [NEUTRAL_OWNER_ID, seatId]);
    const snapshot = getGameState();
    for (const unit of units) {
      if (isMissileUnitType(unit.unitType)) {
        insertMissileHoldOrder({
          playerId: NEUTRAL_OWNER_ID,
          unitId: unit.id,
          h3Index: unit.h3Index,
          createdTurn: snapshot.turnNumber,
        });
        continue;
      }
      const result = executeStandingOrderActionForPlayer(
        NEUTRAL_OWNER_ID,
        'assign_order',
        { unitId: unit.id, order: { type: 'defend', defendHex: coordinates.latLngByH3.get(unit.h3Index) } },
        snapshot,
        coordinates.latLngByH3,
        coordinates.resolveToH3
      );
      if (result.status === 'error') {
        logError('applyKnockout could not assign a defend order', { seatId, unitId: unit.id, error: result.error });
      }
    }
    const applied = { seatId, hexesTurnedNeutral: hexes.length, unitsTurnedNeutral: units.length };
    dbRun('COMMIT');
    logDebug('applyKnockout done', applied);
    return applied;
  } catch (err) {
    logError('applyKnockout failed', err);
    dbRun('ROLLBACK');
    throw err;
  }
}
