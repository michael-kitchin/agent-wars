/**
 * Moves units to Neutral and back to a seat.
 *
 * Purpose: Knockout and hiring share one conversion so the mercenary flag and standing orders stay consistent.
 * When to use: Inside a transaction the caller already opened. These functions do not begin one.
 * Expected outcome: Neutral units are not mercenaries. A rehired unit is a mercenary of the new seat.
 * Exceptions: `transferNeutralUnitToSeat` throws when the unit cannot be hired. SQLite errors propagate.
 */

import { isMissileUnitType } from '../../shared/missileRules';
import { isBuildUnitType } from '../../shared/ipc/productionTypes';
import { NEUTRAL_OWNER_ID, type SeatId } from '../../shared/seatIds';
import { allocateNextUnitDisplayOrder, dbGetAll, dbGetOne, dbRun, getGameState } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { insertMissileHoldOrder } from '../tools/missileHoldOrder';
import type { LatLng } from '../tools/pathfinding';
import { executeStandingOrderActionForPlayer } from '../tools/standingOrdersCore';

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
 * Cargo unit ids assigned to one ship.
 *
 * Purpose: A deserting ship turns its cargo Neutral with it.
 * When to use: When grouping a loaded ship for payroll.
 * Expected outcome: Land unit ids, in table order. Empty when the ship has no cargo.
 * Exceptions: Propagates SQLite errors.
 */
export function listCargoUnitIdsForShip(shipId: string): string[] {
  logTrace('gameActions listCargoUnitIdsForShip', { shipId });
  return dbGetAll<{ landUnitId: string }>(
    'SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE naval_unit_id = ? ORDER BY land_unit_id',
    [shipId]
  ).map((row) => row.landUnitId);
}

/**
 * Makes the listed units Neutral and not mercenaries.
 *
 * Purpose: Knockout and desertion use the same garrison orders.
 * When to use: Inside the caller's transaction. An empty list does nothing.
 * Expected outcome: How many units were converted. Transport rows are left in place.
 * Exceptions: A failed Neutral order is logged and skipped. SQLite errors propagate.
 */
export function convertUnitsToNeutral(unitIds: readonly string[], coordinates: KnockoutCoordinates): number {
  logDebug('gameActions convertUnitsToNeutral', { count: unitIds.length });
  if (unitIds.length === 0) return 0;
  const marks = unitIds.map(() => '?').join(', ');
  const units = dbGetAll<{ id: string; h3Index: string; unitType: string }>(
    `SELECT id, h3_index AS h3Index, unit_type AS unitType FROM units WHERE id IN (${marks})`,
    [...unitIds]
  );
  if (units.length === 0) return 0;
  const found = units.map((unit) => unit.id);
  const foundMarks = found.map(() => '?').join(', ');
  dbRun(`DELETE FROM standing_orders WHERE unit_id IN (${foundMarks})`, found);
  dbRun(`DELETE FROM ai_combat_since_consultation WHERE unit_id IN (${foundMarks})`, found);
  dbRun(
    `UPDATE units SET player = ?, is_mercenary = 0 WHERE id IN (${foundMarks})`,
    [NEUTRAL_OWNER_ID, ...found]
  );
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
      logError('convertUnitsToNeutral could not assign a defend order', { unitId: unit.id, error: result.error });
    }
  }
  return units.length;
}

/**
 * Gives a Neutral unit to a seat as a mercenary.
 *
 * Purpose: Rehire keeps the unit's id and clears the Neutral order and the seat's stale intel.
 * When to use: After the caller has checked the unit is a hireable Neutral unit that is not embarked.
 * Expected outcome: The unit's player, mercenary flag, and display order are updated.
 * Exceptions: Throws when the unit is missing, not Neutral, a missile, or in a transport assignment.
 */
export function transferNeutralUnitToSeat(unitId: string, seatId: SeatId): void {
  logDebug('gameActions transferNeutralUnitToSeat', { unitId, seatId });
  const unit = dbGetOne<{ player: string; unitType: string }>(
    'SELECT player, unit_type AS unitType FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) throw loggedTransferError('missing unit', unitId);
  if (unit.player !== NEUTRAL_OWNER_ID) throw loggedTransferError('unit is not Neutral', unitId);
  if (isMissileUnitType(unit.unitType) || !isBuildUnitType(unit.unitType)) {
    throw loggedTransferError('unit cannot be hired', unitId);
  }
  const embarked = dbGetOne<{ present: number }>(
    'SELECT 1 AS present FROM unit_transport_assignments WHERE naval_unit_id = ? OR land_unit_id = ? LIMIT 1',
    [unitId, unitId]
  );
  if (embarked) throw loggedTransferError('unit is embarked', unitId);
  dbRun('DELETE FROM standing_orders WHERE unit_id = ?', [unitId]);
  dbRun('DELETE FROM player_unit_intel WHERE player_id = ? AND enemy_unit_id = ?', [seatId, unitId]);
  const displayOrder = allocateNextUnitDisplayOrder(unit.unitType, seatId);
  dbRun(
    'UPDATE units SET player = ?, is_mercenary = 1, display_order = ? WHERE id = ? AND player = ?',
    [seatId, displayOrder, unitId, NEUTRAL_OWNER_ID]
  );
}

/**
 * Logs and builds a transfer rejection.
 *
 * Purpose: A thrown transfer error is still an error-level event.
 * When to use: Each guard in `transferNeutralUnitToSeat`.
 * Expected outcome: The error, after it has been logged.
 * Exceptions: None.
 */
function loggedTransferError(reason: string, unitId: string): Error {
  const error = new Error(reason);
  logError('gameActions transferNeutralUnitToSeat rejected', { unitId, reason, error });
  return error;
}
