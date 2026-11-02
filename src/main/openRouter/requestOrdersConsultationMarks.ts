/**
 * Stores that a consultation finished from the model's point of view.
 *
 * Purpose: The last-consultation turn, loss events, and the strategy note stay together.
 * When to use: A finished consult and a consult that stopped on the tool-round budget.
 * Expected outcome: The seat's last consultation turn is this turn. A tactical note uses the battle id.
 * Exceptions: Propagates database errors from the note write.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { AiSeatId } from '../../shared/seatIds';
import {
  clearAiLossEventsSinceConsultation,
  setAiLastConsultationTurn,
  upsertTurnStrategyNote,
} from '../gameDb';
import { logDebug } from '../logger';
import type { ConsultTelemetry, ConsultTelemetryOutcome } from './consultTelemetry';
import type { RequestOrdersError } from './requestOrdersFlowTypes';

/**
 * Records a failed, cancelled, or wall-clock consult and returns the failure.
 *
 * Purpose: The flow's failure returns share one outcome mapping.
 * When to use: A loop failure, a cancel, a parse failure, and the outer catch.
 * Expected outcome: The summary outcome matches the error text. `fail` builds the returned error.
 * Exceptions: None. `fail` does not throw.
 */
export function settleConsultFailure(
  telemetry: ConsultTelemetry,
  error: string,
  wallClockError: string,
  fail: (error: string) => RequestOrdersError
): RequestOrdersError {
  const outcome: ConsultTelemetryOutcome = error === 'Cancelled'
    ? 'cancelled'
    : error === wallClockError
      ? 'wallClock'
      : 'failed';
  logDebug('requestOrdersConsultationMarks settleConsultFailure', { outcome, error });
  telemetry.setOutcome(outcome, error);
  return fail(error);
}

/**
 * Marks one consultation complete for this seat.
 *
 * Purpose: Event-driven consultation and the strategy note need the same turn stamp.
 * When to use: After a parsed envelope, and when the tool budget ends the consult.
 * Expected outcome: Strategic notes use an empty battle id. Tactical notes use the battle's turn.
 * Exceptions: Propagates database errors.
 */
export function markSuccessfulConsultation(args: {
  readonly seatId: AiSeatId;
  readonly turnNumber: number;
  readonly tacticalBattle: TacticalBattleSnapshot | undefined;
  readonly strategyText?: string | null;
  readonly messageText?: string | null;
}): void {
  logDebug('requestOrdersConsultationMarks markSuccessfulConsultation', {
    seatId: args.seatId,
    turnNumber: args.turnNumber,
    tacticalBattleId: args.tacticalBattle?.battleId ?? null,
  });
  setAiLastConsultationTurn(args.seatId, args.turnNumber);
  clearAiLossEventsSinceConsultation(args.seatId);
  if (args.tacticalBattle) {
    upsertTurnStrategyNote(args.seatId, 'tactical', args.tacticalBattle.battleId, args.tacticalBattle.tacticalTurnNumber, {
      strategyText: args.strategyText,
      messageText: args.messageText,
    });
    return;
  }
  upsertTurnStrategyNote(args.seatId, 'strategic', '', args.turnNumber, {
    strategyText: args.strategyText,
    messageText: args.messageText,
  });
}
