/**
 * The losses-both-ways text for one agreement.
 *
 * Purpose: A commander sees what the game recorded since an agreement began, in the same words as the Record column of the Sides table.
 * When to use: Building an agreement view for an open agreement.
 * Expected outcome: Pure text built from stored loss turns.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import { buildSideCombatRecords, type CombatRecordTurn } from '../briefing/sideCombatRecord';
import { formatSideCombatRecord } from '../briefing/sideCombatRecordText';
import { isSeatId } from '../../shared/seatIds';
import { playerIdCodeFor } from '../../shared/unitIds';

/**
 * The sentence printed when the game has no resolved turn to report.
 *
 * Purpose: A new agreement has no evidence yet, and the commander should read that plainly.
 * When to use: `formatSideAgreementEvidence`.
 * Expected outcome: `No turn has resolved since this agreement began.`
 * Exceptions: None.
 */
const NO_RESOLVED_TURN_TEXT = 'No turn has resolved since this agreement began.';

/**
 * What `formatSideAgreementEvidence` needs.
 *
 * Contract: All fields are required.
 * When to use: One call per open agreement.
 * Expected outcome: The values the text is built from.
 * Exceptions: None.
 */
export interface SideAgreementEvidenceArgs {
  /**
   * The commander that owns the agreement.
   *
   * Contract: A seat id.
   * When to use: Taking the commander's point of view.
   * Expected outcome: "Yours" in the text means this seat's units.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The other side of the agreement.
   *
   * Contract: A seat id.
   * When to use: Choosing whose record to print.
   * Expected outcome: The text names this side's code.
   * Exceptions: None.
   */
  readonly counterpartSeatId: string;
  /**
   * The turn the agreement began.
   *
   * Contract: An integer turn number.
   * When to use: Dropping earlier turns.
   * Expected outcome: Only turns at or after it are counted.
   * Exceptions: None.
   */
  readonly startTurn: number;
  /**
   * The commander's stored loss turns.
   *
   * Contract: The turns from `readCombatRecordTurns`.
   * When to use: Counting losses.
   * Expected outcome: Filtered by the start turn.
   * Exceptions: None.
   */
  readonly turns: readonly CombatRecordTurn[];
}

/**
 * Words the losses both ways since an agreement began.
 *
 * Purpose: Reuses the wording of the Record column, so the two never disagree.
 * When to use: Building a view for an open agreement.
 * Expected outcome: The no-turn sentence when nothing resolved since the start. Otherwise `Record, turn ...` text for the counterpart.
 * Exceptions: None.
 */
export function formatSideAgreementEvidence(args: SideAgreementEvidenceArgs): string {
  const turns = args.turns.filter((turn) => turn.turnNumber >= args.startTurn);
  const set = turns.length > 0 && isSeatId(args.counterpartSeatId)
    ? buildSideCombatRecords({ ownSeatId: args.seatId, sideIds: [args.counterpartSeatId], turns })
    : null;
  const record = set?.records.find((entry) => entry.sideId === args.counterpartSeatId);
  logTrace('sideAgreementEvidence formatSideAgreementEvidence', {
    seatId: args.seatId,
    counterpartSeatId: args.counterpartSeatId,
    turnCount: turns.length,
    hasRecord: record !== undefined,
  });
  if (!set || !record || !isSeatId(args.counterpartSeatId)) return NO_RESOLVED_TURN_TEXT;
  return formatSideCombatRecord({
    record,
    sideCode: playerIdCodeFor(args.counterpartSeatId),
    firstTurn: set.firstTurn,
    lastTurn: set.lastTurn,
  });
}
