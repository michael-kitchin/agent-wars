/**
 * Stores a posture the commander declared, after the hold has elapsed.
 *
 * Purpose: The engine remembers the choice and does not invent one.
 * When to use: Once per strategic consult, when the reply named a posture.
 * Expected outcome: The row is written, left unchanged, or a drop reason says when it may change. A choice that names the default posture is stored like any other when no row exists.
 * Exceptions: A database error is logged and returned as a drop reason. It does not throw.
 */

import { dbGetOne, dbRun } from '../gameDb';
import { readPosture, writePosture } from '../gameDb/postureMemory';
import { logDebug, logError } from '../logger';
import {
  DEFAULT_POSTURE,
  POSTURE_MIN_HOLD_TURNS,
  type Posture,
} from '../../shared/postureTypes';

/**
 * Applies one declared posture for this seat.
 *
 * Purpose: A new name replaces the stored one only after the hold. The same name as the stored one changes nothing. An explicit choice is stored even when it names the default, and that starts the hold.
 * When to use: After the reply is parsed, before the refusal note is written. A seat with no row may set one at once, whatever the posture.
 * Expected outcome: `{ applied: true }` when the posture is kept or stored. A refused change names the turn it was set and the turn it may change.
 * Exceptions: A throw is logged and returns `{ applied: false }` with `posture dropped: the engine could not store it.`
 */
export function applyPostureChoice(args: {
  readonly seatId: string;
  readonly posture: Posture;
  readonly turnNumber: number;
}): { readonly applied: boolean; readonly dropReasons: string[] } {
  const ops = { getOne: dbGetOne, run: dbRun };
  try {
    const stored = readPosture(ops, args.seatId);
    const current = stored?.posture ?? DEFAULT_POSTURE;
    if (stored !== null && stored.posture === args.posture) {
      logDebug('postureChoice unchanged', { seatId: args.seatId, from: current, to: args.posture, turnNumber: args.turnNumber, echoed: true });
      return { applied: true, dropReasons: [] };
    }
    if (stored !== null && args.turnNumber - stored.sinceTurn < POSTURE_MIN_HOLD_TURNS) {
      const nextTurn = stored.sinceTurn + POSTURE_MIN_HOLD_TURNS;
      logDebug('postureChoice refused', { seatId: args.seatId, from: current, to: args.posture, turnNumber: args.turnNumber, refusedUntil: nextTurn });
      return {
        applied: false,
        dropReasons: [`posture dropped: you set ${current} on turn ${stored.sinceTurn} and may change it from turn ${nextTurn}.`],
      };
    }
    writePosture(ops, args.seatId, { posture: args.posture, sinceTurn: args.turnNumber });
    logDebug('postureChoice applied', { seatId: args.seatId, from: current, to: args.posture, turnNumber: args.turnNumber });
    return { applied: true, dropReasons: [] };
  } catch (err) {
    logError('postureChoice applyPostureChoice', { seatId: args.seatId, turnNumber: args.turnNumber }, err);
    return { applied: false, dropReasons: ['posture dropped: the engine could not store it.'] };
  }
}

/**
 * Applies the posture a strategic reply named, or logs that the reply named none.
 *
 * Purpose: One step for the apply path, so an omitted posture is still visible in the debug log.
 * When to use: Once per strategic consult with orders on, before the refusal note is written.
 * Expected outcome: The drop reasons to add. An omitted posture adds none, and is logged unless the parser already
 * dropped a bad posture name.
 * Exceptions: None; it never throws.
 */
export function applyReplyPosture(args: {
  /**
   * The commander whose reply is applied.
   *
   * Contract: A seat id.
   * When to use: Every call.
   * Expected outcome: Only this seat's posture can change.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The posture the reply named.
   *
   * Contract: Undefined when the reply named none that is known.
   * When to use: Every call.
   * Expected outcome: Undefined changes nothing.
   * Exceptions: None.
   */
  readonly posture: Posture | undefined;
  /**
   * The turn of the consult.
   *
   * Contract: The strategic turn being played.
   * When to use: Checking how long the current posture has held.
   * Expected outcome: Stored with a new posture.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The drop reasons collected so far.
   *
   * Contract: Read only.
   * When to use: Telling a refused posture name from an omitted one.
   * Expected outcome: A refused name is not logged as omitted.
   * Exceptions: None.
   */
  readonly priorDropReasons: readonly string[];
}): string[] {
  logDebug('postureChoice applyReplyPosture', { seatId: args.seatId, named: args.posture !== undefined });
  if (args.posture !== undefined) {
    return applyPostureChoice({ seatId: args.seatId, posture: args.posture, turnNumber: args.turnNumber }).dropReasons;
  }
  if (!args.priorDropReasons.some((reason) => reason.startsWith('posture dropped:'))) {
    logDebug('requestOrdersApplyParsed posture omitted', { seatId: args.seatId, turnNumber: args.turnNumber });
  }
  return [];
}
