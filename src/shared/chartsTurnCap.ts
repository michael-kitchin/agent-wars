/**
 * Cuts a charts snapshot off at one strategic turn.
 *
 * Purpose: While replay shows a past turn, the charts show the match as it stood on that turn and know nothing later.
 * When to use: Applying a snapshot to the charts dialog while replay is on.
 * Expected outcome: A snapshot with no turn, agreement state, decision, or attack after the cap, whose current turn is the cap.
 * Exceptions: None.
 */

import type { AgreementHistory } from './agreementHistoryTypes';
import type { MatchChartsSeat, MatchChartsSnapshot } from './matchStatistics';

/**
 * Cuts the agreement history off at a turn.
 *
 * Purpose: An agreement made after the cap does not exist yet, and one that changed later shows its state as of the cap.
 * When to use: From `capChartsSnapshot`.
 * Expected outcome: Only versions, decisions, and attacks recorded at or before the cap, and no agreement left without a version.
 * Exceptions: None.
 */
function capAgreementHistory(history: AgreementHistory, turn: number): AgreementHistory {
  const agreements = history.agreements
    .map((entry) => ({
      ...entry,
      versions: entry.versions.filter((version) => version.turnNumber <= turn),
      decisions: entry.decisions.filter((decision) => decision.turnNumber <= turn),
    }))
    .filter((entry) => entry.versions.length > 0);
  return { agreements, attacks: history.attacks.filter((attack) => attack.turnNumber <= turn) };
}

/**
 * Forgets a seat's exit when it came after the cap.
 *
 * Purpose: A side that left later was still in the match on the capped turn.
 * When to use: From `capChartsSnapshot`.
 * Expected outcome: The same seat, or the seat with no out turn.
 * Exceptions: None.
 */
function capSeat(seat: MatchChartsSeat, turn: number): MatchChartsSeat {
  return seat.outTurn != null && seat.outTurn > turn ? { ...seat, outTurn: null } : seat;
}

/**
 * Cuts a charts snapshot off at a turn.
 *
 * Purpose: See the file note.
 * When to use: See the file note.
 * Expected outcome: Turns after `turn` are dropped, `currentTurnNumber` becomes `turn`, and the agreement history and seat exits follow the cap.
 * Exceptions: None.
 */
export function capChartsSnapshot(snapshot: MatchChartsSnapshot, turn: number): MatchChartsSnapshot {
  return {
    ...snapshot,
    seats: snapshot.seats.map((seat) => capSeat(seat, turn)),
    turns: snapshot.turns.filter((entry) => entry.turnNumber <= turn),
    currentTurnNumber: Math.min(snapshot.currentTurnNumber, turn),
    ...(snapshot.agreementHistory ? { agreementHistory: capAgreementHistory(snapshot.agreementHistory, turn) } : {}),
  };
}
