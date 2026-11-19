/**
 * Reads and writes `side_agreements`.
 *
 * Purpose: The talk round, the orders decision step, and the prompt ledger share one SQL surface for a commander's private agreements.
 * When to use: After `ensureSideAgreementTable`. Callers that must not throw wrap these calls.
 * Expected outcome: Rows in `agreement_id` order, with the zone parsed from its stored JSON.
 * Exceptions: Propagates a SQLite error, including the checks that a seat cannot agree with itself and that an end turn is not before the start turn.
 */

import type { BasicDbOps } from './dbOps';
import { logDebug, logError, logTrace } from '../logger';
import type {
  SideAgreementDecision,
  SideAgreementIntent,
  SideAgreementKind,
  SideAgreementStatus,
} from '../../shared/sideAgreements';

/**
 * One stored agreement.
 *
 * Contract: The owning commander's private record. Standing is not stored. It is worked out on read with `sideAgreementStanding`.
 * When to use: Every read this module returns.
 * Expected outcome: The columns a prompt, a recorder event, and a decision need.
 * Exceptions: None.
 */
export interface SideAgreementRow {
  /**
   * The assigned id.
   *
   * Contract: The `agreement_id` primary key.
   * When to use: Changing, deciding on, and printing an agreement.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly agreementId: number;
  /**
   * The commander that owns the record.
   *
   * Contract: A seat id, different from `counterpartSeatId`.
   * When to use: Listing one commander's agreements.
   * Expected outcome: The stored owner.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The other side of the agreement.
   *
   * Contract: A seat id, different from `seatId`.
   * When to use: The per-side limit and the prompt line.
   * Expected outcome: The stored counterpart.
   * Exceptions: None.
   */
  readonly counterpartSeatId: string;
  /**
   * The kind of agreement.
   *
   * Contract: A `SideAgreementKind`.
   * When to use: The prompt line and the recorder event.
   * Expected outcome: One of the five kinds.
   * Exceptions: None.
   */
  readonly kind: SideAgreementKind;
  /**
   * The one-sentence terms.
   *
   * Contract: Cleaned text. This module does not clean it.
   * When to use: The prompt. Do not log it.
   * Expected outcome: The stored terms.
   * Exceptions: None.
   */
  readonly terms: string;
  /**
   * The strategic H3 indexes of a no-entry zone.
   *
   * Contract: Empty unless `kind` is `no_entry_zone`. A stored value that does not parse reads as empty.
   * When to use: Translating back to hex codes for a prompt.
   * Expected outcome: An array of strings.
   * Exceptions: None.
   */
  readonly zoneH3: readonly string[];
  /**
   * The third side of a joint action.
   *
   * Contract: A seat id for `joint_action`, otherwise null.
   * When to use: The prompt line.
   * Expected outcome: The stored seat id or null.
   * Exceptions: None.
   */
  readonly againstSeatId: string | null;
  /**
   * The strategic turn the agreement was first recorded.
   *
   * Contract: Never changes after insert.
   * When to use: Evidence and the span cap.
   * Expected outcome: The stored turn.
   * Exceptions: None.
   */
  readonly startTurn: number;
  /**
   * The last turn the agreement covers.
   *
   * Contract: Not before `startTurn`.
   * When to use: Standing and the prompt line.
   * Expected outcome: The stored turn.
   * Exceptions: None.
   */
  readonly endTurn: number;
  /**
   * The status the commander set.
   *
   * Contract: A `SideAgreementStatus`.
   * When to use: Standing and the recorder event.
   * Expected outcome: One of the five statuses.
   * Exceptions: None.
   */
  readonly status: SideAgreementStatus;
  /**
   * The commander's private plan for the agreement.
   *
   * Contract: A `SideAgreementIntent`.
   * When to use: The prompt line.
   * Expected outcome: One of the three words.
   * Exceptions: None.
   */
  readonly intent: SideAgreementIntent;
  /**
   * The one-sentence reason the commander gave.
   *
   * Contract: Text, possibly empty.
   * When to use: The recorder event. Do not log it.
   * Expected outcome: The stored reason.
   * Exceptions: None.
   */
  readonly reason: string;
  /**
   * The strategic turn any stored field last changed.
   *
   * Contract: Equals `startTurn` for a new row.
   * When to use: Deciding how long a closed agreement stays in the ledger.
   * Expected outcome: The stored turn.
   * Exceptions: None.
   */
  readonly updatedTurn: number;
  /**
   * The latest keep-or-break decision.
   *
   * Contract: Null until a decision is stored. A later decision replaces it.
   * When to use: The next talk prompt.
   * Expected outcome: `keep`, `break`, or null.
   * Exceptions: None.
   */
  readonly decision: SideAgreementDecision | null;
  /**
   * The reason given with the latest decision.
   *
   * Contract: Null when there is no decision.
   * When to use: The next talk prompt. Do not log it.
   * Expected outcome: The stored text or null.
   * Exceptions: None.
   */
  readonly decisionReason: string | null;
  /**
   * The strategic turn of the latest decision.
   *
   * Contract: Null when there is no decision.
   * When to use: The next talk prompt.
   * Expected outcome: The stored turn or null.
   * Exceptions: None.
   */
  readonly decisionTurn: number | null;
}

/**
 * The fields a new agreement is stored with.
 *
 * Contract: Every row field except the id, the updated turn, and the three decision fields, which the store sets.
 * When to use: `insertSideAgreement`.
 * Expected outcome: The values written to the new row.
 * Exceptions: None.
 */
export type SideAgreementInsert = Omit<
  SideAgreementRow,
  'agreementId' | 'updatedTurn' | 'decision' | 'decisionReason' | 'decisionTurn'
>;

/**
 * The fields a commander may change on an open agreement.
 *
 * Contract: The six changeable fields, the id, and the turn of the change.
 * When to use: `updateSideAgreement`.
 * Expected outcome: The values compared with the stored row and written when they differ.
 * Exceptions: None.
 */
export interface SideAgreementUpdate {
  /**
   * The agreement to change.
   *
   * Contract: An existing `agreement_id`.
   * When to use: Selecting the row.
   * Expected outcome: Null result from the update when no row has it.
   * Exceptions: None.
   */
  readonly agreementId: number;
  /**
   * The new terms.
   *
   * Contract: Cleaned text.
   * When to use: Compared with the stored terms.
   * Expected outcome: Written when different.
   * Exceptions: None.
   */
  readonly terms: string;
  /**
   * The new zone indexes.
   *
   * Contract: Empty unless the kind is `no_entry_zone`.
   * When to use: Compared in order with the stored zone.
   * Expected outcome: Written when different.
   * Exceptions: None.
   */
  readonly zoneH3: readonly string[];
  /**
   * The new end turn.
   *
   * Contract: Already fixed by `resolveSideAgreementEndTurn`.
   * When to use: Compared with the stored end turn.
   * Expected outcome: Written when different.
   * Exceptions: None.
   */
  readonly endTurn: number;
  /**
   * The new status.
   *
   * Contract: A `SideAgreementStatus`.
   * When to use: Compared with the stored status.
   * Expected outcome: Written when different.
   * Exceptions: None.
   */
  readonly status: SideAgreementStatus;
  /**
   * The new intent.
   *
   * Contract: A `SideAgreementIntent`.
   * When to use: Compared with the stored intent.
   * Expected outcome: Written when different.
   * Exceptions: None.
   */
  readonly intent: SideAgreementIntent;
  /**
   * The new reason.
   *
   * Contract: Cleaned text.
   * When to use: Compared with the stored reason.
   * Expected outcome: Written when different.
   * Exceptions: None.
   */
  readonly reason: string;
  /**
   * The strategic turn of the change.
   *
   * Contract: Stored as `updated_turn` only when a field differs.
   * When to use: Dating a change.
   * Expected outcome: The row's new `updatedTurn`.
   * Exceptions: None.
   */
  readonly turnNumber: number;
}

/**
 * The outcome of `updateSideAgreement` for an existing row.
 *
 * Contract: `changed` is false when nothing differed and nothing was written.
 * When to use: Deciding whether to record a change event.
 * Expected outcome: The status before the call and the row after it.
 * Exceptions: None.
 */
export interface SideAgreementUpdateResult {
  /**
   * Whether any stored field differed.
   *
   * Contract: True only when the row was written.
   * When to use: Gate for the recorder event.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly changed: boolean;
  /**
   * The status stored before this call.
   *
   * Contract: A `SideAgreementStatus`.
   * When to use: The recorder event's `previousStatus`.
   * Expected outcome: The old status.
   * Exceptions: None.
   */
  readonly previousStatus: SideAgreementStatus;
  /**
   * The row after this call.
   *
   * Contract: The stored row, changed or not.
   * When to use: The recorder event.
   * Expected outcome: The current row.
   * Exceptions: None.
   */
  readonly row: SideAgreementRow;
}

/**
 * One `side_agreements` row as SQLite returns it.
 *
 * Contract: The snake_case columns, with the zone still as JSON text.
 * When to use: `toAgreementRow`.
 * Expected outcome: Matches `AGREEMENT_COLUMNS`.
 * Exceptions: None.
 */
type AgreementSqlRow = {
  readonly agreement_id: number;
  readonly seat_id: string;
  readonly counterpart_seat_id: string;
  readonly kind: SideAgreementKind;
  readonly terms: string;
  readonly zone_h3_json: string;
  readonly against_seat_id: string | null;
  readonly start_turn: number;
  readonly end_turn: number;
  readonly status: SideAgreementStatus;
  readonly intent: SideAgreementIntent;
  readonly reason: string;
  readonly updated_turn: number;
  readonly decision: SideAgreementDecision | null;
  readonly decision_reason: string | null;
  readonly decision_turn: number | null;
};

/**
 * The column list every select uses.
 *
 * Purpose: One list keeps every read in step with `AgreementSqlRow`.
 * When to use: Building a select.
 * Expected outcome: The sixteen columns, comma separated.
 * Exceptions: None.
 */
const AGREEMENT_COLUMNS = `agreement_id, seat_id, counterpart_seat_id, kind, terms, zone_h3_json, against_seat_id, start_turn, end_turn, status, intent, reason, updated_turn, decision, decision_reason, decision_turn`;

/**
 * Reads a stored zone value as a list of H3 indexes.
 *
 * Purpose: A damaged value must not break a prompt, so anything that is not an array of strings reads as empty.
 * When to use: Converting a stored row.
 * Expected outcome: The parsed strings, or an empty array. Only the value's length is logged, never the value.
 * Exceptions: None. A parse error is caught and logged.
 */
function parseZoneJson(text: string): string[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) return parsed as string[];
  } catch (err) {
    // A value that does not parse reads as an empty zone.
    logError('sideAgreementStore parseZoneJson failed', { length: text.length, err });
  }
  return [];
}

/**
 * Converts a SQLite row to a `SideAgreementRow`.
 *
 * Purpose: Keeps column names out of the callers.
 * When to use: After every select.
 * Expected outcome: A row with a parsed zone.
 * Exceptions: None.
 */
function toAgreementRow(row: AgreementSqlRow): SideAgreementRow {
  return {
    agreementId: row.agreement_id,
    seatId: row.seat_id,
    counterpartSeatId: row.counterpart_seat_id,
    kind: row.kind,
    terms: row.terms,
    zoneH3: parseZoneJson(row.zone_h3_json),
    againstSeatId: row.against_seat_id,
    startTurn: row.start_turn,
    endTurn: row.end_turn,
    status: row.status,
    intent: row.intent,
    reason: row.reason,
    updatedTurn: row.updated_turn,
    decision: row.decision,
    decisionReason: row.decision_reason,
    decisionTurn: row.decision_turn,
  };
}

/**
 * Tells whether two zone lists hold the same indexes in the same order.
 *
 * Purpose: A change that only reorders a zone still counts as a change.
 * When to use: Comparing a stored zone with a requested one.
 * Expected outcome: True when every element matches in order.
 * Exceptions: None.
 */
function sameZone(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

/**
 * Reads one agreement.
 *
 * Purpose: Checking ownership before a change or a decision.
 * When to use: With an id from a talk reply or an orders reply.
 * Expected outcome: The row, or null when no row has that id.
 * Exceptions: Propagates a SQLite error.
 */
export function getSideAgreement(ops: BasicDbOps, agreementId: number): SideAgreementRow | null {
  const row = ops.getOne<AgreementSqlRow>(`SELECT ${AGREEMENT_COLUMNS} FROM side_agreements WHERE agreement_id = ?`, [agreementId]);
  logTrace('sideAgreementStore getSideAgreement', { agreementId, found: row !== undefined });
  return row ? toAgreementRow(row) : null;
}

/**
 * Lists every agreement one seat owns.
 *
 * Purpose: The ledger, the per-side limit, and the prompts read one commander's agreements.
 * When to use: Building a prompt or checking a limit.
 * Expected outcome: Rows in `agreement_id` order. No other seat's rows.
 * Exceptions: Propagates a SQLite error.
 */
export function listSideAgreementsForSeat(ops: BasicDbOps, seatId: string): SideAgreementRow[] {
  const rows = ops.getAll<AgreementSqlRow>(
    `SELECT ${AGREEMENT_COLUMNS} FROM side_agreements WHERE seat_id = ? ORDER BY agreement_id`,
    [seatId]
  );
  logTrace('sideAgreementStore listSideAgreementsForSeat', { seatId, count: rows.length });
  return rows.map(toAgreementRow);
}

/**
 * Stores a new agreement.
 *
 * Purpose: A talk reply creates agreements through this call.
 * When to use: Inside the talk round's transaction, after the entry has passed every rule.
 * Expected outcome: The stored row, with `updatedTurn` equal to `startTurn` and no decision.
 * Exceptions: Propagates a SQLite error, including a failed `CHECK`.
 */
export function insertSideAgreement(ops: BasicDbOps, input: SideAgreementInsert): SideAgreementRow {
  logDebug('sideAgreementStore insertSideAgreement', {
    seatId: input.seatId,
    counterpartSeatId: input.counterpartSeatId,
    kind: input.kind,
    status: input.status,
    startTurn: input.startTurn,
    endTurn: input.endTurn,
    zoneCount: input.zoneH3.length,
    termsLength: input.terms.length,
  });
  ops.run(
    `INSERT INTO side_agreements (seat_id, counterpart_seat_id, kind, terms, zone_h3_json, against_seat_id, start_turn, end_turn, status, intent, reason, updated_turn)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.seatId,
      input.counterpartSeatId,
      input.kind,
      input.terms,
      JSON.stringify(input.zoneH3),
      input.againstSeatId,
      input.startTurn,
      input.endTurn,
      input.status,
      input.intent,
      input.reason,
      input.startTurn,
    ]
  );
  const id = ops.getOne<{ id: number }>('SELECT last_insert_rowid() AS id')?.id ?? 0;
  const stored = getSideAgreement(ops, id);
  if (!stored) throw new Error(`side agreement ${id} was not stored`);
  return stored;
}

/**
 * Changes the six changeable fields of an agreement when any of them differ.
 *
 * Purpose: A repeated, identical entry writes nothing and records nothing.
 * When to use: Inside the talk round's transaction, after the entry has passed every rule.
 * Expected outcome: Null when no row has the id. Otherwise `changed: false` with the row untouched, or `changed: true` with the new row and `updatedTurn` set to the turn of the change.
 * Exceptions: Propagates a SQLite error.
 */
export function updateSideAgreement(ops: BasicDbOps, update: SideAgreementUpdate): SideAgreementUpdateResult | null {
  logDebug('sideAgreementStore updateSideAgreement', {
    agreementId: update.agreementId,
    status: update.status,
    endTurn: update.endTurn,
    turnNumber: update.turnNumber,
  });
  const stored = getSideAgreement(ops, update.agreementId);
  if (!stored) return null;
  const same =
    stored.terms === update.terms &&
    sameZone(stored.zoneH3, update.zoneH3) &&
    stored.endTurn === update.endTurn &&
    stored.status === update.status &&
    stored.intent === update.intent &&
    stored.reason === update.reason;
  if (same) return { changed: false, previousStatus: stored.status, row: stored };
  ops.run(
    `UPDATE side_agreements SET terms = ?, zone_h3_json = ?, end_turn = ?, status = ?, intent = ?, reason = ?, updated_turn = ? WHERE agreement_id = ?`,
    [
      update.terms,
      JSON.stringify(update.zoneH3),
      update.endTurn,
      update.status,
      update.intent,
      update.reason,
      update.turnNumber,
      update.agreementId,
    ]
  );
  const row = getSideAgreement(ops, update.agreementId);
  if (!row) throw new Error(`side agreement ${update.agreementId} disappeared during an update`);
  return { changed: true, previousStatus: stored.status, row };
}

/**
 * The decision to store on an agreement.
 *
 * Contract: The id, the choice, the reason, and the turn.
 * When to use: `setSideAgreementDecision`.
 * Expected outcome: The values written to the row's three decision columns.
 * Exceptions: None.
 */
export interface SideAgreementDecisionInput {
  /**
   * The agreement to decide on.
   *
   * Contract: An existing `agreement_id`.
   * When to use: Selecting the row.
   * Expected outcome: A false result from the call when no row has it.
   * Exceptions: None.
   */
  readonly agreementId: number;
  /**
   * The choice.
   *
   * Contract: A `SideAgreementDecision`.
   * When to use: Storing the decision.
   * Expected outcome: Written to the row.
   * Exceptions: None.
   */
  readonly decision: SideAgreementDecision;
  /**
   * The reason given.
   *
   * Contract: Cleaned text, possibly empty.
   * When to use: Storing the decision. Do not log it.
   * Expected outcome: Written to the row.
   * Exceptions: None.
   */
  readonly reason: string;
  /**
   * The strategic turn of the decision.
   *
   * Contract: An integer turn number.
   * When to use: Storing the decision.
   * Expected outcome: Written as the decision turn.
   * Exceptions: None.
   */
  readonly turnNumber: number;
}

/**
 * Stores the latest keep-or-break decision on an agreement.
 *
 * Purpose: The next talk prompt shows the decision. A later decision replaces it, and the recorder keeps the history.
 * When to use: After the orders reply's decision has passed every rule.
 * Expected outcome: True when a row had the id and now holds the decision. False otherwise.
 * Exceptions: Propagates a SQLite error.
 */
export function setSideAgreementDecision(
  ops: BasicDbOps,
  args: SideAgreementDecisionInput
): boolean {
  logDebug('sideAgreementStore setSideAgreementDecision', {
    agreementId: args.agreementId,
    decision: args.decision,
    turnNumber: args.turnNumber,
    reasonLength: args.reason.length,
  });
  if (!getSideAgreement(ops, args.agreementId)) return false;
  ops.run(`UPDATE side_agreements SET decision = ?, decision_reason = ?, decision_turn = ? WHERE agreement_id = ?`, [
    args.decision,
    args.reason,
    args.turnNumber,
    args.agreementId,
  ]);
  return true;
}
