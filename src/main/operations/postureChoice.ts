/**
 * Stores a posture the commander declared, after the hold has elapsed.
 *
 * Purpose: The engine remembers the choice and does not invent one.
 * When to use: Once per strategic consult, when the reply named a posture.
 * Expected outcome: The row is written, left unchanged, or a drop reason says when it may change.
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
 * Purpose: A new name replaces the stored one only after the hold. The same name changes nothing.
 * When to use: After the reply is parsed, before the refusal note is written. A seat with no row may set one at once.
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
    if (args.posture === current) {
      logDebug('postureChoice applied', { seatId: args.seatId, from: current, to: args.posture, turnNumber: args.turnNumber, echoed: true });
      return { applied: true, dropReasons: [] };
    }
    if (stored !== null && args.turnNumber - stored.sinceTurn < POSTURE_MIN_HOLD_TURNS) {
      const nextTurn = stored.sinceTurn + POSTURE_MIN_HOLD_TURNS;
      logDebug('postureChoice applied', { seatId: args.seatId, from: current, to: args.posture, turnNumber: args.turnNumber, refusedUntil: nextTurn });
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
