/**
 * The two recorder events for side agreements.
 *
 * Purpose: The agreement table keeps only the current row. The recording keeps each change and each keep-or-break decision.
 * When to use: When a talk reply stores or changes an agreement, and when an orders reply decides on one.
 * Expected outcome: One event visible only to the commander that owns the agreement, with no display text.
 * Exceptions: None. `recordMatchEvent` swallows its own failure.
 */

import { logDebug } from '../logger';
import type { SideAgreementRow } from '../gameDb/sideAgreementStore';
import { stepKeyText, type StepKey } from '../../shared/matchRecording';
import type { SideAgreementDecision, SideAgreementStatus } from '../../shared/sideAgreements';
import { recordMatchEvent } from './matchRecorder';

/**
 * What one `agreement_recorded` event needs.
 *
 * Contract: Every field is required.
 * When to use: `recordSideAgreementRecorded`.
 * Expected outcome: The values the event payload is built from.
 * Exceptions: None.
 */
export interface SideAgreementRecordedArgs {
  /**
   * The step the event belongs to.
   *
   * Contract: A strategic step.
   * When to use: Always.
   * Expected outcome: Stored as the event's step.
   * Exceptions: None.
   */
  readonly step: StepKey;
  /**
   * The agreement as stored after the change.
   *
   * Contract: The row returned by the store.
   * When to use: Always.
   * Expected outcome: Its fields become the payload.
   * Exceptions: None.
   */
  readonly row: SideAgreementRow;
  /**
   * The status before this change.
   *
   * Contract: Null for a new agreement.
   * When to use: Always.
   * Expected outcome: Stored in the payload.
   * Exceptions: None.
   */
  readonly previousStatus: SideAgreementStatus | null;
}

/**
 * Records a new agreement, or a change to a stored field of one.
 *
 * Purpose: History of each agreement, with the status it had before the change.
 * When to use: After `insertSideAgreement`, or after `updateSideAgreement` reports `changed: true`.
 * Expected outcome: One `agreement_recorded` event visible only to the owning commander. The log line carries ids and the status, never the terms or the reason.
 * Exceptions: None. `recordMatchEvent` swallows its own failure.
 */
export function recordSideAgreementRecorded(args: SideAgreementRecordedArgs): void {
  const { step, row, previousStatus } = args;
  logDebug('sideAgreementRecordingEvents recordSideAgreementRecorded', {
    step: stepKeyText(step),
    agreementId: row.agreementId,
    seatId: row.seatId,
    counterpartSeatId: row.counterpartSeatId,
    status: row.status,
    previousStatus,
  });
  recordMatchEvent({
    type: 'agreement_recorded',
    step,
    visibility: { seats: [row.seatId] },
    payload: {
      agreementId: row.agreementId,
      seatId: row.seatId,
      counterpartSeatId: row.counterpartSeatId,
      kind: row.kind,
      terms: row.terms,
      zoneH3: row.zoneH3,
      againstSeatId: row.againstSeatId,
      startTurn: row.startTurn,
      endTurn: row.endTurn,
      status: row.status,
      intent: row.intent,
      reason: row.reason,
      previousStatus,
    },
  });
}

/**
 * What one `agreement_decision` event needs.
 *
 * Contract: Every field is required.
 * When to use: `recordSideAgreementDecision`.
 * Expected outcome: The values the event payload is built from.
 * Exceptions: None.
 */
export interface SideAgreementDecisionEventArgs {
  /**
   * The step the event belongs to.
   *
   * Contract: A strategic step.
   * When to use: Always.
   * Expected outcome: Stored as the event's step.
   * Exceptions: None.
   */
  readonly step: StepKey;
  /**
   * The agreement decided on.
   *
   * Contract: An existing agreement id.
   * When to use: Always.
   * Expected outcome: Stored in the payload.
   * Exceptions: None.
   */
  readonly agreementId: number;
  /**
   * The commander that decided.
   *
   * Contract: The agreement's owner.
   * When to use: Always.
   * Expected outcome: Sets the event's visibility.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The other side of the agreement.
   *
   * Contract: A seat id.
   * When to use: Always.
   * Expected outcome: Stored in the payload.
   * Exceptions: None.
   */
  readonly counterpartSeatId: string;
  /**
   * The choice.
   *
   * Contract: keep or break.
   * When to use: Always.
   * Expected outcome: Stored in the payload.
   * Exceptions: None.
   */
  readonly decision: SideAgreementDecision;
  /**
   * The reason given.
   *
   * Contract: Cleaned text, possibly empty.
   * When to use: Always. Never log it.
   * Expected outcome: Stored in the payload.
   * Exceptions: None.
   */
  readonly reason: string;
}

/**
 * Records one keep-or-break decision.
 *
 * Purpose: The agreement row keeps only the latest decision. The recording keeps every one.
 * When to use: After `setSideAgreementDecision` stores an accepted decision.
 * Expected outcome: One `agreement_decision` event visible only to the owning commander. The log line carries ids and the decision, never the reason.
 * Exceptions: None. `recordMatchEvent` swallows its own failure.
 */
export function recordSideAgreementDecision(args: SideAgreementDecisionEventArgs): void {
  logDebug('sideAgreementRecordingEvents recordSideAgreementDecision', {
    step: stepKeyText(args.step),
    agreementId: args.agreementId,
    seatId: args.seatId,
    decision: args.decision,
  });
  recordMatchEvent({
    type: 'agreement_decision',
    step: args.step,
    visibility: { seats: [args.seatId] },
    payload: {
      agreementId: args.agreementId,
      seatId: args.seatId,
      counterpartSeatId: args.counterpartSeatId,
      decision: args.decision,
      reason: args.reason,
    },
  });
}
