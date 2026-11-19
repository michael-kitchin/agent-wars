/**
 * Reads the `agreementDecisions` field of a strategic orders reply.
 *
 * Purpose: A decision is validated here, and a bad entry becomes a drop reason without affecting the rest of the reply.
 * When to use: `parseOrderResponse`, on the world map only.
 * Expected outcome: Pure parsing. Whether the agreement exists, belongs to this commander, and is active is checked when the decision is stored.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import {
  isSideAgreementDecision,
  SIDE_AGREEMENT_MAX_DECISIONS,
  type SideAgreementDecision,
} from '../../shared/sideAgreements';
import { cleanSideMessageText, SIDE_STANCE_REASON_MAX_CHARS } from '../../shared/sideMessages';

/**
 * One keep-or-break decision that passed the reply rules.
 *
 * Contract: `agreementId` is a positive integer. `reason` is cleaned and may be empty.
 * When to use: `applySideAgreementDecisions`.
 * Expected outcome: The values stored on the agreement.
 * Exceptions: None.
 */
export interface ParsedAgreementDecision {
  /**
   * The agreement decided on.
   *
   * Contract: An integer above 0.
   * When to use: Looking up the stored agreement.
   * Expected outcome: The id as sent.
   * Exceptions: None.
   */
  readonly agreementId: number;
  /**
   * The choice.
   *
   * Contract: A `SideAgreementDecision`.
   * When to use: The decision column.
   * Expected outcome: `keep` or `break`.
   * Exceptions: None.
   */
  readonly decision: SideAgreementDecision;
  /**
   * The cleaned reason.
   *
   * Contract: Text, possibly empty, at most `SIDE_STANCE_REASON_MAX_CHARS`.
   * When to use: The decision reason column. Do not log it.
   * Expected outcome: The stored reason.
   * Exceptions: None.
   */
  readonly reason: string;
}

/**
 * Reads the decisions of an orders reply.
 *
 * Purpose: The orders reply may decide keep or break for any active agreement, and a malformed entry never blocks the orders.
 * When to use: With `obj.agreementDecisions` from the parsed reply.
 * Expected outcome: `undefined` gives nothing. A non-array gives one drop reason. Each entry that is not an object, lacks a positive integer id, or lacks a keep or break decision is dropped with a reason. A repeated id is dropped with its own reason. Entries after the first `SIDE_AGREEMENT_MAX_DECISIONS` kept ones are dropped with one shared reason.
 * Exceptions: None.
 */
export function normalizeAgreementDecisions(raw: unknown): {
  readonly decisions: readonly ParsedAgreementDecision[];
  readonly dropReasons: readonly string[];
} {
  if (raw === undefined) return { decisions: [], dropReasons: [] };
  if (!Array.isArray(raw)) return { decisions: [], dropReasons: ['agreementDecisions dropped: expected an array.'] };
  const decisions: ParsedAgreementDecision[] = [];
  const dropReasons: string[] = [];
  const seenIds = new Set<number>();
  let overLimit = false;
  for (const entry of raw as readonly unknown[]) {
    const row = entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? (entry as { readonly id?: unknown; readonly decision?: unknown; readonly reason?: unknown })
      : null;
    if (!row || typeof row.id !== 'number' || !Number.isInteger(row.id) || row.id <= 0 || !isSideAgreementDecision(row.decision)) {
      dropReasons.push('agreementDecisions entry dropped: expected a positive integer id and a decision of keep or break.');
      continue;
    }
    if (seenIds.has(row.id)) {
      dropReasons.push(`agreementDecisions entry dropped: agreement ${row.id} appears more than once.`);
      continue;
    }
    if (decisions.length >= SIDE_AGREEMENT_MAX_DECISIONS) {
      overLimit = true;
      continue;
    }
    seenIds.add(row.id);
    decisions.push({ agreementId: row.id, decision: row.decision, reason: cleanSideMessageText(row.reason, SIDE_STANCE_REASON_MAX_CHARS) });
  }
  if (overLimit) dropReasons.push(`agreementDecisions dropped: at most ${SIDE_AGREEMENT_MAX_DECISIONS} decisions are read.`);
  logTrace('sideAgreementDecisionParsing normalizeAgreementDecisions', { entryCount: raw.length, keptCount: decisions.length, dropCount: dropReasons.length });
  return { decisions, dropReasons };
}
