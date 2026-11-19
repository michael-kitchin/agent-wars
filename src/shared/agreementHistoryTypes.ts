/**
 * The recorded history of side agreements, as the charts snapshot carries it.
 *
 * Purpose: The main process rebuilds each agreement's versions, decisions, and the attacks between sides from recorder events, and the charts dialog reads them.
 * When to use: Reading agreement history in the main process, and drawing it in the charts dialog.
 * Expected outcome: Plain types and one empty value. This module does not read the database or log.
 * Exceptions: None.
 */

import type {
  SideAgreementDecision,
  SideAgreementIntent,
  SideAgreementKind,
  SideAgreementStatus,
} from './sideAgreements';

/**
 * One recorded state of an agreement.
 *
 * Contract: One entry per turn in which the agreement was recorded, holding the last state recorded that turn.
 * When to use: Working out an agreement's state at a given turn.
 * Expected outcome: The status, end turn, terms, zone, intent, and reason as recorded.
 * Exceptions: None.
 */
export interface AgreementVersion {
  /**
   * The strategic turn the state was recorded in.
   *
   * Contract: The step turn of the `agreement_recorded` event.
   * When to use: Picking the last version at or before a turn.
   * Expected outcome: A whole turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The stored status after that record.
   *
   * Contract: A member of `SIDE_AGREEMENT_STATUSES`.
   * When to use: Working out standing with `sideAgreementStanding`.
   * Expected outcome: One of the five statuses.
   * Exceptions: None.
   */
  readonly status: SideAgreementStatus;
  /**
   * The last turn the agreement is meant to hold.
   *
   * Contract: A whole turn number.
   * When to use: Working out expiry.
   * Expected outcome: The end turn as recorded.
   * Exceptions: None.
   */
  readonly endTurn: number;
  /**
   * The agreed terms as the commander wrote them.
   *
   * Contract: Text that may hold side codes.
   * When to use: Showing the terms in a tooltip, after the side codes become names.
   * Expected outcome: The terms as recorded.
   * Exceptions: None.
   */
  readonly terms: string;
  /**
   * The hex codes of the agreement's zone.
   *
   * Contract: Already translated from H3 cells in the main process. Empty when the agreement has no zone.
   * When to use: Showing the zone in a tooltip.
   * Expected outcome: A list of hex codes.
   * Exceptions: None.
   */
  readonly zoneCodes: readonly string[];
  /**
   * The commander's private plan for the agreement.
   *
   * Contract: A member of `SIDE_AGREEMENT_INTENTS`.
   * When to use: Showing the intent in a tooltip.
   * Expected outcome: One of the three intents.
   * Exceptions: None.
   */
  readonly intent: SideAgreementIntent;
  /**
   * The commander's reason for this state.
   *
   * Contract: Text, possibly empty.
   * When to use: Kept with the version for later display.
   * Expected outcome: The reason as recorded.
   * Exceptions: None.
   */
  readonly reason: string;
}

/**
 * One keep-or-break decision on an agreement.
 *
 * Contract: One entry per turn, holding the last decision recorded that turn.
 * When to use: Marking a break and showing the newest decision.
 * Expected outcome: The turn, the decision, and the reason.
 * Exceptions: None.
 */
export interface AgreementDecisionRecord {
  /**
   * The strategic turn of the decision.
   *
   * Contract: The step turn of the `agreement_decision` event.
   * When to use: Matching a decision to a turn.
   * Expected outcome: A whole turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * What the commander decided.
   *
   * Contract: A member of `SIDE_AGREEMENT_DECISIONS`.
   * When to use: Marking a breach, and printing the decision.
   * Expected outcome: `keep` or `break`.
   * Exceptions: None.
   */
  readonly decision: SideAgreementDecision;
  /**
   * The commander's reason for the decision.
   *
   * Contract: Text that may hold side codes. May be empty.
   * When to use: Showing the decision in a tooltip.
   * Expected outcome: The reason as recorded.
   * Exceptions: None.
   */
  readonly reason: string;
}

/**
 * One agreement with every state and decision recorded for it.
 *
 * Contract: Keyed by `agreementId`, which is unique within a match.
 * When to use: Rebuilding the agreement at any turn.
 * Expected outcome: The fixed facts of the agreement and its ascending versions and decisions.
 * Exceptions: None.
 */
export interface AgreementHistoryEntry {
  /**
   * The agreement id.
   *
   * Contract: A whole number, unique within the match.
   * When to use: Naming the agreement and matching decisions to it.
   * Expected outcome: The id as stored.
   * Exceptions: None.
   */
  readonly agreementId: number;
  /**
   * The commander who keeps this record of the agreement.
   *
   * Contract: A seat id.
   * When to use: Choosing the strip row the agreement belongs to.
   * Expected outcome: The keeper's seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The other side of the agreement.
   *
   * Contract: A seat id, possibly the human seat.
   * When to use: The With filter and the counterpart's matching record.
   * Expected outcome: The other side's seat id.
   * Exceptions: None.
   */
  readonly counterpartSeatId: string;
  /**
   * The kind of agreement.
   *
   * Contract: A member of `SIDE_AGREEMENT_KINDS`.
   * When to use: The Kind filter and the tooltip.
   * Expected outcome: One of the five kinds.
   * Exceptions: None.
   */
  readonly kind: SideAgreementKind;
  /**
   * The third side of a joint action.
   *
   * Contract: A seat id, or null when the agreement has no third side.
   * When to use: Naming the target in a tooltip.
   * Expected outcome: A seat id or null.
   * Exceptions: None.
   */
  readonly againstSeatId: string | null;
  /**
   * The turn the agreement was first recorded.
   *
   * Contract: A whole turn number.
   * When to use: Showing the span of the agreement.
   * Expected outcome: The turn of the first version.
   * Exceptions: None.
   */
  readonly startTurn: number;
  /**
   * Every recorded state of the agreement.
   *
   * Contract: Ascending by turn, at most one per turn (the last one recorded that turn).
   * When to use: Rebuilding the agreement at a turn.
   * Expected outcome: A non-empty list.
   * Exceptions: None.
   */
  readonly versions: readonly AgreementVersion[];
  /**
   * Every keep-or-break decision on the agreement.
   *
   * Contract: Ascending by turn, at most one per turn (the last one).
   * When to use: Marking breaks and showing the newest decision.
   * Expected outcome: A list, possibly empty.
   * Exceptions: None.
   */
  readonly decisions: readonly AgreementDecisionRecord[];
}

/**
 * Units one side destroyed of another by its own attacks in one turn.
 *
 * Contract: Counts strategic ranged, air, and missile attacks on the world map. Melee and battle losses are not counted.
 * When to use: Marking a breach of an agreement between the two sides.
 * Expected outcome: One record per turn, attacker, and victim.
 * Exceptions: None.
 */
export interface AttackLossRecord {
  /**
   * The strategic turn of the attacks.
   *
   * Contract: The turn whose orders caused the losses.
   * When to use: Matching a record to a strip cell.
   * Expected outcome: A whole turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The seat whose attacks destroyed the units.
   *
   * Contract: A seat id.
   * When to use: Matching the keeper of an agreement.
   * Expected outcome: The attacker's seat id.
   * Exceptions: None.
   */
  readonly bySeatId: string;
  /**
   * The seat that lost the units.
   *
   * Contract: A seat id.
   * When to use: Matching the other side of an agreement.
   * Expected outcome: The victim's seat id.
   * Exceptions: None.
   */
  readonly fromSeatId: string;
  /**
   * How many units were destroyed.
   *
   * Contract: A positive whole number.
   * When to use: Printing the breach in a tooltip.
   * Expected outcome: The unit count.
   * Exceptions: None.
   */
  readonly units: number;
}

/**
 * All agreements and attacks recorded in a match.
 *
 * Contract: Sorted: agreements by id, attacks by turn, then attacker, then victim.
 * When to use: The `agreementHistory` field of the charts snapshot.
 * Expected outcome: Everything the agreements strip needs.
 * Exceptions: None.
 */
export interface AgreementHistory {
  /**
   * Every agreement, by id.
   *
   * Contract: May be empty.
   * When to use: Building strip rows.
   * Expected outcome: The history entries.
   * Exceptions: None.
   */
  readonly agreements: readonly AgreementHistoryEntry[];
  /**
   * Every attack record.
   *
   * Contract: May be empty.
   * When to use: Marking breaches.
   * Expected outcome: The attack loss records.
   * Exceptions: None.
   */
  readonly attacks: readonly AttackLossRecord[];
}

/**
 * The history of a match with no agreements.
 *
 * Purpose: One shared value for a match with no agreements and for a read that failed.
 * When to use: As the default when a snapshot has no `agreementHistory`.
 * Expected outcome: Empty agreements and attacks.
 * Exceptions: None.
 */
export const EMPTY_AGREEMENT_HISTORY: AgreementHistory = { agreements: [], attacks: [] };
