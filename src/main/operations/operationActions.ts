/**
 * Applies one sea operation's orders to the match.
 *
 * Purpose: The advance decides the orders. This file is the only place they are written.
 * When to use: Once per operation each planning turn, with that operation's action list, in order.
 * Expected outcome: How many actions were stored. A failed action is logged and skipped. Later actions still run.
 * Exceptions: None. A thrown error from one action is logged and counted as a failure.
 */

import type { GameStateSnapshot } from '../gameDb';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import {
  applyEmbarkOrdersForPlayer,
  clearEmbarkAssignmentForLandUnit,
  getEmbarkedNavalForLandUnit,
} from '../gameActions/sealift';
import { logDebug, logError } from '../logger';
import { executeStandingOrderActionForPlayer } from '../tools/standingOrdersCore';
import type { OperationAction } from './seaOperationAdvance';

/**
 * The seat, the snapshot, and the coordinate helpers one batch of actions shares.
 *
 * Purpose: Each action is applied for the same seat without repeating those arguments.
 * When to use: `applyOperationActions` only.
 * Expected outcome: The snapshot still contains the seat's units. Coordinates cover the destination hexes.
 * Exceptions: None.
 */
interface ActionBatch {
  /**
   * Seat whose orders are written.
   *
   * Contract: Standing orders and embark rows are stored for this owner.
   * When to use: Every action in the batch.
   * Expected outcome: An AI seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Snapshot the standing-order writer reads.
   *
   * Contract: The writer finds the unit and the hex set here.
   * When to use: March, defend, and cancel.
   * Expected outcome: A snapshot that includes the seat's units.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * Hex centers and the reverse lookup.
   *
   * Contract: A march or defend names a hex. The writer stores the center of that hex.
   * When to use: March and defend.
   * Expected outcome: The same pair the turn already built.
   * Exceptions: None.
   */
  readonly coordinates: KnockoutCoordinates;
}

/**
 * Writes one standing order, or cancels one.
 *
 * Purpose: March, defend, and cancel share the standing-order tool and the same failure report.
 * When to use: For those three action kinds.
 * Expected outcome: True when the order was stored, or a cancel found no order to remove.
 * Exceptions: None. A throw is logged and returns false.
 */
function applyStandingOrder(batch: ActionBatch, unitId: string, toolName: 'assign_order' | 'cancel_order', args: unknown): boolean {
  try {
    const result = executeStandingOrderActionForPlayer(
      batch.seatId,
      toolName,
      args,
      batch.state,
      batch.coordinates.latLngByH3,
      batch.coordinates.resolveToH3,
    );
    if (result.status === 'error') {
      const message = typeof result.error === 'string' ? result.error : '';
      if (toolName === 'cancel_order' && message.includes('No standing order found')) {
        logDebug('operationActions: cancel found no standing order', { seatId: batch.seatId, unitId });
        return true;
      }
      logError('operationActions: standing order was rejected', { seatId: batch.seatId, unitId, toolName, error: result.error });
      return false;
    }
    return true;
  } catch (err) {
    logError('operationActions: standing order threw', { seatId: batch.seatId, unitId, toolName }, err);
    return false;
  }
}

/**
 * Writes one action.
 *
 * Purpose: A missing hex or a rejected embark does not stop the rest of the list.
 * When to use: Once per action, in the list order.
 * Expected outcome: True when the order or the assignment was stored.
 * Exceptions: None. Failures are logged and return false.
 */
function applyOne(batch: ActionBatch, action: OperationAction): boolean {
  if (action.kind === 'march' || action.kind === 'defend') {
    const hex = action.kind === 'march' ? action.toH3 : action.atH3;
    const center = batch.coordinates.latLngByH3.get(hex);
    if (center === undefined) {
      logError('operationActions: missing coordinate', { seatId: batch.seatId, kind: action.kind, unitId: action.unitId, hex });
      return false;
    }
    const order = action.kind === 'march'
      ? { type: 'march' as const, destination: center, engageEnRoute: true }
      : { type: 'defend' as const, defendHex: center };
    return applyStandingOrder(batch, action.unitId, 'assign_order', { unitId: action.unitId, order });
  }
  if (action.kind === 'cancelOrder') return applyStandingOrder(batch, action.unitId, 'cancel_order', { unitId: action.unitId });
  if (action.kind === 'embark') {
    try {
      applyEmbarkOrdersForPlayer([{ unitId: action.unitId, navalUnitId: action.carrierId }], batch.seatId);
      const carrierId = getEmbarkedNavalForLandUnit(action.unitId);
      if (carrierId !== action.carrierId) {
        logError('operationActions: embark did not assign the ship', {
          seatId: batch.seatId,
          unitId: action.unitId,
          carrierId: action.carrierId,
          actual: carrierId,
        });
        return false;
      }
      return true;
    } catch (err) {
      logError('operationActions: embark threw', { seatId: batch.seatId, unitId: action.unitId, carrierId: action.carrierId }, err);
      return false;
    }
  }
  try {
    clearEmbarkAssignmentForLandUnit(action.unitId);
    return true;
  } catch (err) {
    logError('operationActions: unload threw', { seatId: batch.seatId, unitId: action.unitId }, err);
    return false;
  }
}

/**
 * Applies every action for one seat, in order.
 *
 * Purpose: The turn advance hands over the list from `advanceSeaOperation` and keeps going when one write fails.
 * When to use: Once per operation, after the decision and before the operation is stored.
 * Expected outcome: The count of actions that were stored. Zero when the list is empty.
 * Exceptions: None. A missing coordinate, a rejected order, a failed embark, or a throw is logged and skipped.
 */
export function applyOperationActions(args: {
  readonly seatId: string;
  readonly actions: readonly OperationAction[];
  readonly state: GameStateSnapshot;
  readonly coordinates: KnockoutCoordinates;
}): number {
  logDebug('operationActions applyOperationActions', { seatId: args.seatId, actionCount: args.actions.length });
  const batch: ActionBatch = { seatId: args.seatId, state: args.state, coordinates: args.coordinates };
  let succeeded = 0;
  for (const action of args.actions) {
    if (applyOne(batch, action)) succeeded += 1;
  }
  return succeeded;
}
