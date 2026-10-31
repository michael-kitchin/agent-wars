/**
 * Turns one of the human player's mercenaries Neutral during strategic planning.
 *
 * Purpose: The selection panel fires a hired unit without waiting for payroll.
 * When to use: The dismiss IPC handler. A loaded ship takes its cargo with it.
 * Expected outcome: A refusal names the first failing reason and changes nothing. Success converts the unit, and a ship's cargo, through `convertUnitsToNeutral`.
 * Exceptions: Logs and rethrows a database error after rolling back. Refusals do not throw.
 */

import {
  DISMISS_REASON_EMBARKED,
  DISMISS_REASON_MISSING,
  DISMISS_REASON_NOT_ACTIVE,
  DISMISS_REASON_NOT_MERCENARY,
  DISMISS_REASON_NOT_PLANNING,
  DISMISS_REASON_NOT_YOURS,
  DISMISS_REASON_TACTICAL,
  type DismissMercenaryResult,
} from '../../shared/mercenaryDismiss';
import { isHumanSeatId, type SeatId } from '../../shared/seatIds';
import { getSeatRoster } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { logDebug, logError } from '../logger';
import { buildLatLngCoordinateMap, getOrderedHexList } from '../mapData';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { convertUnitsToNeutral, listCargoUnitIdsForShip } from './unitOwnershipTransfer';

/**
 * Fires one mercenary, and a loaded ship's cargo, for the given seat.
 *
 * Purpose: Planning dismiss uses the same Neutral conversion as desertion.
 * When to use: After the payload has a unit id. Pass the human seat from IPC.
 * Expected outcome: Success lists the converted ids, ship first. The treasury is not written. Transport rows stay.
 * Exceptions: Logs and rethrows after rollback. A refusal returns a reason.
 */
export function executeDismissMercenary(seatId: SeatId, unitId: string): DismissMercenaryResult {
  logDebug('gameActions executeDismissMercenary', { seatId, unitId });
  const refused = refusalFor(seatId, unitId);
  if (refused) return refused;
  const unitIds = [unitId, ...listCargoUnitIdsForShip(unitId)];
  gameDbOps.run('BEGIN');
  try {
    convertUnitsToNeutral(unitIds, buildLatLngCoordinateMap(getOrderedHexList()));
    gameDbOps.run('COMMIT');
  } catch (err) {
    logError('gameActions executeDismissMercenary failed', { seatId, unitId, error: err });
    gameDbOps.run('ROLLBACK');
    throw err;
  }
  logDebug('gameActions executeDismissMercenary converted', { seatId, unitId, unitCount: unitIds.length });
  return { success: true, unitIds };
}

/**
 * The first reason this dismiss cannot run, if any.
 *
 * Purpose: Checks stay outside the transaction so a refusal does not open one.
 * When to use: From `executeDismissMercenary` before converting.
 * Expected outcome: A failure result, or null when conversion may start.
 * Exceptions: Propagates a database error from the reads.
 */
function refusalFor(seatId: SeatId, unitId: string): DismissMercenaryResult | null {
  const phase = gameDbOps.getOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning';
  if (phase !== 'planning') return refuse(seatId, unitId, DISMISS_REASON_NOT_PLANNING);
  if (isHumanSeatId(seatId) && isTacticalBattleActive()) return refuse(seatId, unitId, DISMISS_REASON_TACTICAL);
  const seat = getSeatRoster().find((row) => row.seatId === seatId);
  if (!seat || seat.outTurn !== null) return refuse(seatId, unitId, DISMISS_REASON_NOT_ACTIVE);
  const unit = gameDbOps.getOne<{ player: string; mercenary: number }>(
    'SELECT player, is_mercenary AS mercenary FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return refuse(seatId, unitId, DISMISS_REASON_MISSING);
  if (unit.player !== seatId) return refuse(seatId, unitId, DISMISS_REASON_NOT_YOURS);
  if (unit.mercenary !== 1) return refuse(seatId, unitId, DISMISS_REASON_NOT_MERCENARY);
  const embarked = gameDbOps.getOne<{ present: number }>(
    'SELECT 1 AS present FROM unit_transport_assignments WHERE land_unit_id = ? LIMIT 1',
    [unitId]
  );
  if (embarked) return refuse(seatId, unitId, DISMISS_REASON_EMBARKED);
  return null;
}

/**
 * Logs a refusal and returns it.
 *
 * Purpose: Every refusal is one debug line with the same fields.
 * When to use: From `refusalFor` only.
 * Expected outcome: The failure result.
 * Exceptions: None.
 */
function refuse(seatId: SeatId, unitId: string, reason: string): DismissMercenaryResult {
  logDebug('gameActions executeDismissMercenary refused', { seatId, unitId, reason });
  return { success: false, reason };
}
