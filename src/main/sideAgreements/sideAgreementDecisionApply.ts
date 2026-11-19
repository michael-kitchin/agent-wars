/**
 * Stores the keep-or-break decisions of one strategic orders reply.
 *
 * Purpose: A decision is stored on the agreement, so the next talk prompt shows it, and recorded, so the history is kept.
 * When to use: From `applyParsedOrders`, once per strategic reply that carried decisions.
 * Expected outcome: Each decision for an active agreement of this commander is stored and recorded. The game never checks a decision against the orders.
 * Exceptions: None. A failure is logged and the decisions applied so far are returned.
 */

import { logDebug, logError } from '../logger';
import { gameDbOps } from '../gameDb/dbConnection';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { getSideAgreement, setSideAgreementDecision } from '../gameDb/sideAgreementStore';
import { recordSideAgreementDecision } from '../recorder/sideAgreementRecordingEvents';
import type { ParsedAgreementDecision } from '../openRouter/sideAgreementDecisionParsing';
import { strategicStep } from '../../shared/matchRecording';
import type { AiSeatId } from '../../shared/seatIds';
import { isSeatActive } from '../../shared/seatRoster';
import { sideAgreementStanding } from '../../shared/sideAgreements';

/**
 * What `applySideAgreementDecisions` needs.
 *
 * Contract: All fields are required.
 * When to use: One call per reply.
 * Expected outcome: The values the decisions are checked and stored with.
 * Exceptions: None.
 */
export interface ApplySideAgreementDecisionsArgs {
  /**
   * The commander that replied.
   *
   * Contract: An AI seat id.
   * When to use: Refusing a decision on another seat's agreement.
   * Expected outcome: Only this seat's agreements are decided.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * The decisions that passed the reply rules.
   *
   * Contract: From `normalizeAgreementDecisions`.
   * When to use: The decisions to store, in order.
   * Expected outcome: Each is stored or answered with a drop reason.
   * Exceptions: None.
   */
  readonly decisions: readonly ParsedAgreementDecision[];
  /**
   * The strategic turn of the orders.
   *
   * Contract: An integer turn number.
   * When to use: Working out standing, and dating the decision.
   * Expected outcome: Stored as the decision turn.
   * Exceptions: None.
   */
  readonly turnNumber: number;
}

/**
 * Stores each decision that names an active agreement of the commander.
 *
 * Purpose: Only an active agreement accepts a decision, and an unknown, foreign, or inactive one is answered with a drop reason.
 * When to use: After the orders are applied, on the world map only.
 * Expected outcome: The count of decisions stored and one drop reason per decision refused. A stored decision writes one `agreement_decision` event.
 * Exceptions: None. Any error is logged with the seat and turn, and what was applied so far is returned.
 */
export function applySideAgreementDecisions(args: ApplySideAgreementDecisionsArgs): {
  readonly appliedCount: number;
  readonly dropReasons: readonly string[];
} {
  const { seatId, decisions, turnNumber } = args;
  logDebug('sideAgreementDecisionApply applySideAgreementDecisions', { seatId, turnNumber, decisionCount: decisions.length });
  let appliedCount = 0;
  const dropReasons: string[] = [];
  try {
    const roster = readSeatRoster(gameDbOps);
    for (const decision of decisions) {
      const row = getSideAgreement(gameDbOps, decision.agreementId);
      const counterpart = row ? roster.find((seat) => seat.seatId === row.counterpartSeatId) : undefined;
      const standing = row
        ? sideAgreementStanding({
            status: row.status,
            endTurn: row.endTurn,
            currentTurn: turnNumber,
            counterpartActive: counterpart !== undefined && isSeatActive(counterpart),
          })
        : null;
      if (!row || row.seatId !== seatId || standing !== 'active') {
        dropReasons.push(`agreementDecisions entry dropped: agreement ${decision.agreementId} is not one of your active agreements.`);
        continue;
      }
      setSideAgreementDecision(gameDbOps, {
        agreementId: row.agreementId,
        decision: decision.decision,
        reason: decision.reason,
        turnNumber,
      });
      recordSideAgreementDecision({
        step: strategicStep(turnNumber),
        agreementId: row.agreementId,
        seatId,
        counterpartSeatId: row.counterpartSeatId,
        decision: decision.decision,
        reason: decision.reason,
      });
      appliedCount += 1;
    }
  } catch (err) {
    logError('sideAgreementDecisionApply applySideAgreementDecisions failed', { seatId, turnNumber, err });
  }
  return { appliedCount, dropReasons };
}
