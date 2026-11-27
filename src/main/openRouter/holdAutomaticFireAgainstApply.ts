/**
 * Stores the automatic-fire choice of one orders reply.
 *
 * Purpose: Turns side codes into seats still in the match, writes a changed list, and records the change.
 * When to use: While applying a parsed reply, before the reply's own attacks are merged.
 * Expected outcome: The stored list matches the choice, or is left as it was, with drop reasons for anything refused.
 * Exceptions: None. A storage failure is logged and returned as a drop reason.
 */

import { isSeatId, type AiSeatId, type SeatId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { gameDbOps } from '../gameDb/dbConnection';
import { readHoldAutomaticFireAgainstSeatIds, writeHoldAutomaticFireAgainstSeatIds } from '../gameDb/holdAutomaticFireAgainstMemory';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { logDebug, logError } from '../logger';
import { recordHoldAutomaticFireAgainstChanged } from '../recorder/holdAutomaticFireAgainstRecordingEvents';
import { stepForConsult } from '../recorder/matchRecordingEvents';
import type { HoldAutomaticFireAgainstChoice } from './holdAutomaticFireAgainstParsing';
import { repickStoredPlanAttacks } from './holdAutomaticFireAgainstStoredPlan';
import { seatIdForSideCode } from './talk/talkSideCodes';

/** The longest part of a refused code repeated in a drop reason. */
const DROPPED_CODE_MAX_LENGTH = 12;

/**
 * The drop reason for a replace that names no listable side.
 *
 * Purpose: Says that the stored list was kept because nothing in the reply could be listed.
 * When to use: After every code was refused.
 * Expected outcome: One reason after the per-code reasons.
 * Exceptions: None.
 */
const NO_LISTED_CODE_REASON = 'holdAutomaticFireAgainst dropped: no listed code names an active side other than your own.';
/**
 * The drop reason for a storage failure.
 *
 * Purpose: A failed write never fails the consult.
 * When to use: When applying a choice throws.
 * Expected outcome: The consult goes on with the list as it was stored.
 * Exceptions: None.
 */
const STORE_FAILED_REASON = 'holdAutomaticFireAgainst dropped: the engine could not store it.';

/**
 * Resolves side codes to seats a commander may list.
 *
 * Purpose: Neutral, the commander's own side, a side that is out, and an unknown code cannot be listed.
 * When to use: For a `replace` choice.
 * Expected outcome: The listable seats in first-seen order, and one drop reason for each code left out.
 * Exceptions: Propagates a database error.
 */
function resolveListedSeats(seatId: AiSeatId, sideCodes: readonly string[]): { seatIds: SeatId[]; dropReasons: string[] } {
  const listable = readSeatRoster(gameDbOps)
    .filter((seat) => seat.outTurn == null)
    .map((seat) => seat.seatId)
    .filter((id): id is SeatId => isSeatId(id) && id !== seatId);
  const seatIds = new Set<SeatId>();
  const dropReasons: string[] = [];
  for (const code of sideCodes) {
    const resolved = seatIdForSideCode(code, listable);
    if (resolved === null) {
      const shown = code.slice(0, DROPPED_CODE_MAX_LENGTH);
      dropReasons.push(`holdAutomaticFireAgainst: "${shown}" is not an active side other than your own, and was left out.`);
    } else {
      seatIds.add(resolved);
    }
  }
  return { seatIds: [...seatIds], dropReasons };
}

/**
 * Applies one reply's choice to the commander's stored list.
 *
 * Purpose: The only path from a reply to the stored list.
 * When to use: Once per applied orders reply, on the world map and in a battle.
 * Expected outcome: Nothing is written or recorded for a missing choice, for an unchanged list, or when no code names a
 * listable side. Otherwise the list is replaced and one change event is recorded on the consult's step.
 * Exceptions: None. A failure is logged and returned as one drop reason.
 */
export function applyHoldAutomaticFireAgainstChoice(args: {
  /**
   * The commander whose reply is applied.
   *
   * Contract: An AI seat.
   * When to use: Every call.
   * Expected outcome: Only this seat's list can change.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * What the reply asked for.
   *
   * Contract: The parsed choice, or undefined when the reply keeps the list.
   * When to use: Every call.
   * Expected outcome: Undefined changes nothing.
   * Exceptions: None.
   */
  readonly choice: HoldAutomaticFireAgainstChoice | undefined;
  /**
   * The strategic turn of the consult.
   *
   * Contract: The turn being played.
   * When to use: Naming the recorded step and the turn a side is listed from.
   * Expected outcome: A battle listing counts from the following turn.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The battle the reply belongs to.
   *
   * Contract: Null on the world map.
   * When to use: Choosing the recorded step and the listed turn.
   * Expected outcome: A battle reply is recorded on its beat.
   * Exceptions: None.
   */
  readonly battle: TacticalBattleSnapshot | null;
}): { readonly dropReasons: string[] } {
  const { seatId, choice } = args;
  if (choice === undefined) return { dropReasons: [] };
  try {
    const previous = readHoldAutomaticFireAgainstSeatIds(seatId);
    const resolved = choice.kind === 'clear' ? { seatIds: [], dropReasons: [] } : resolveListedSeats(seatId, choice.sideCodes);
    const nothingListable = choice.kind === 'replace' && resolved.seatIds.length === 0;
    const changed =
      !nothingListable &&
      (resolved.seatIds.length !== previous.size || resolved.seatIds.some((id) => !previous.has(id)));
    logDebug('holdAutomaticFireAgainstApply applyHoldAutomaticFireAgainstChoice', {
      seatId,
      kind: choice.kind,
      previousCount: previous.size,
      nextCount: nothingListable ? previous.size : resolved.seatIds.length,
      written: changed,
    });
    if (nothingListable) return { dropReasons: [...resolved.dropReasons, NO_LISTED_CODE_REASON] };
    if (changed) {
      const next = [...resolved.seatIds].sort();
      // A battle is fought after its turn's ranged, air, and missile fire, so only later turns come after this listing.
      const listedTurn = args.battle ? args.turnNumber + 1 : args.turnNumber;
      writeHoldAutomaticFireAgainstSeatIds({ getOne: gameDbOps.getOne, run: gameDbOps.run }, seatId, next, listedTurn);
      recordHoldAutomaticFireAgainstChanged({
        step: stepForConsult(args.turnNumber, args.battle),
        seatId,
        sparedSeatIds: next,
        previousSeatIds: [...previous].sort(),
      });
      repickStoredPlanAttacks(seatId);
    }
    return { dropReasons: resolved.dropReasons };
  } catch (err) {
    logError('holdAutomaticFireAgainstApply applyHoldAutomaticFireAgainstChoice', { seatId, kind: choice.kind }, err);
    return { dropReasons: [STORE_FAILED_REASON] };
  }
}
