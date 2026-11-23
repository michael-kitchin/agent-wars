/**
 * Turns one of a seat's mercenaries Neutral during strategic planning.
 *
 * Purpose: The selection panel fires a hired unit without waiting for payroll.
 * When to use: The dismiss IPC handler. A loaded ship takes its cargo with it.
 * Expected outcome: A refusal names the first failing reason and changes nothing. A fire that would by itself knock the side out is refused for every seat. Success converts the unit, and a ship's cargo, through `convertUnitsToNeutral`.
 * Exceptions: Logs and rethrows a database error after rolling back. Refusals do not throw.
 */

import {
  DISMISS_REASON_EMBARKED,
  DISMISS_REASON_KNOCKOUT,
  DISMISS_REASON_MISSING,
  DISMISS_REASON_NOT_ACTIVE,
  DISMISS_REASON_NOT_MERCENARY,
  DISMISS_REASON_NOT_PLANNING,
  DISMISS_REASON_NOT_YOURS,
  DISMISS_REASON_SHIP_CARGO,
  DISMISS_REASON_TACTICAL,
  type DismissMercenaryResult,
} from '../../shared/mercenaryDismiss';
import { isHumanSeatId, type SeatId } from '../../shared/seatIds';
import { getSeatRoster } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { readTurnPhase } from '../gameDb/turnStateReads';
import { logDebug, logError } from '../logger';
import { buildLatLngCoordinateMap, getOrderedHexList } from '../mapData';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { fireWouldKnockOut, readFireRiskInputs } from './mercenaryFireRisk';
import { convertUnitsToNeutral, listCargoUnitIdsForShip } from './unitOwnershipTransfer';

/**
 * Fires one mercenary, and a loaded ship's cargo, for the given seat.
 *
 * Purpose: Planning dismiss uses the same Neutral conversion as desertion.
 * When to use: After the payload has a unit id. Pass the human seat from IPC, or a commander's seat through `executeCommanderDismissMercenary`.
 * Expected outcome: Success lists the converted ids, ship first. The treasury is not written. Transport rows stay.
 * Exceptions: Logs and rethrows after rollback. A refusal returns a reason.
 */
export function executeDismissMercenary(seatId: SeatId, unitId: string): DismissMercenaryResult {
  logDebug('gameActions executeDismissMercenary', { seatId, unitId });
  return dismissUnlessRefused({ seatId, unitId, refuseLoadedShip: false });
}

/**
 * Fires one mercenary for a commander's production row.
 *
 * Purpose: A commander fires the same way the human does, except that it may not fire a ship that still carries units.
 * When to use: `applyProductionOrdersFromEnvelope`, for each `dismiss_mercenary` row, during planning.
 * Expected outcome: The same checks and conversion as `executeDismissMercenary`. After the ownership, mercenary, and embarked checks, a ship with units aboard is refused with `DISMISS_REASON_SHIP_CARGO`.
 * Exceptions: Logs and rethrows a database error after rollback. Refusals do not throw.
 */
export function executeCommanderDismissMercenary(seatId: SeatId, unitId: string): DismissMercenaryResult {
  logDebug('gameActions executeCommanderDismissMercenary', { seatId, unitId });
  return dismissUnlessRefused({ seatId, unitId, refuseLoadedShip: true });
}

/**
 * One dismiss request after the caller has logged it.
 *
 * Purpose: The human and commander entry points share the checks and the conversion.
 * When to use: `executeDismissMercenary` and `executeCommanderDismissMercenary` only.
 * Expected outcome: Fields read by `dismissUnlessRefused`.
 * Exceptions: None.
 */
interface DismissRequest {
  /**
   * The seat that fires.
   *
   * Contract: The owner the unit must have.
   * When to use: Every check.
   * Expected outcome: A `SeatId`.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * The unit to fire.
   *
   * Contract: A unit id from the caller.
   * When to use: Every check and the conversion.
   * Expected outcome: Any string. A missing unit is a refusal.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Whether a ship with units aboard is refused.
   *
   * Contract: True for commanders, false for the human panel.
   * When to use: The cargo check in `refusalFor`.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly refuseLoadedShip: boolean;
}

/**
 * Refuses or converts one mercenary.
 *
 * Purpose: The shared body of both entry points.
 * When to use: From the two exported dismiss functions.
 * Expected outcome: The first refusal, or success with the converted ids, ship first.
 * Exceptions: Logs and rethrows a database error after rollback.
 */
function dismissUnlessRefused(request: DismissRequest): DismissMercenaryResult {
  const { seatId, unitId } = request;
  const refused = refusalFor(request);
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
 * When to use: From `dismissUnlessRefused` before converting.
 * Expected outcome: A failure result, or null when conversion may start. The loaded-ship check comes after the ownership checks, so another side's ship is refused as not yours.
 * Exceptions: Propagates a database error from the reads.
 */
function refusalFor(request: DismissRequest): DismissMercenaryResult | null {
  const { seatId, unitId } = request;
  const phase = readTurnPhase(gameDbOps.getOne) ?? 'planning';
  if (phase !== 'planning') return refuse(seatId, unitId, DISMISS_REASON_NOT_PLANNING);
  if (isHumanSeatId(seatId) && isTacticalBattleActive()) return refuse(seatId, unitId, DISMISS_REASON_TACTICAL);
  const seat = getSeatRoster().find((row) => row.seatId === seatId);
  if (!seat || seat.outTurn !== null) return refuse(seatId, unitId, DISMISS_REASON_NOT_ACTIVE);
  const unit = gameDbOps.getOne<{ player: string; mercenary: number; h3Index: string }>(
    'SELECT player, is_mercenary AS mercenary, h3_index AS h3Index FROM units WHERE id = ?',
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
  if (request.refuseLoadedShip && listCargoUnitIdsForShip(unitId).length > 0) {
    return refuse(seatId, unitId, DISMISS_REASON_SHIP_CARGO);
  }
  const risk = readFireRiskInputs(seatId);
  if (risk && fireWouldKnockOut(risk, unit.h3Index)) return refuse(seatId, unitId, DISMISS_REASON_KNOCKOUT);
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
