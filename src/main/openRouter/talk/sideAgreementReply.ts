/**
 * Reads the `agreements` list of a strategic talk reply.
 *
 * Purpose: A reply entry becomes a validated agreement entry, or it is dropped and counted without affecting the rest of the reply.
 * When to use: `parseTalkReply`, on the world map only.
 * Expected outcome: Pure parsing. The end turn and the zone are checked again when the entry is stored, because they depend on the match.
 * Exceptions: None.
 */

import { logDebug } from '../../logger';
import type { SeatId } from '../../../shared/seatIds';
import {
  isSideAgreementIntent,
  isSideAgreementKind,
  isSideAgreementStatus,
  SIDE_AGREEMENT_TERMS_MAX_CHARS,
  type SideAgreementIntent,
  type SideAgreementKind,
  type SideAgreementStatus,
} from '../../../shared/sideAgreements';
import { cleanSideMessageText, SIDE_STANCE_REASON_MAX_CHARS } from '../../../shared/sideMessages';
import { seatIdForSideCode } from './talkSideCodes';

/**
 * One agreement entry that passed the reply rules.
 *
 * Contract: `withSeatId` is another seat the reply may name. Fields that do not apply to the kind are empty.
 * When to use: Storing a closed strategic talk round.
 * Expected outcome: What `persistTalkAgreements` stores or changes.
 * Exceptions: None.
 */
export interface TalkReplyAgreement {
  /**
   * The agreement to change, or 0 for a new one.
   *
   * Contract: An integer of 0 or more. A positive id appears once per reply.
   * When to use: Choosing between insert and update.
   * Expected outcome: The id as sent.
   * Exceptions: None.
   */
  readonly agreementId: number;
  /**
   * The other side.
   *
   * Contract: A seat other than the speaker.
   * When to use: The counterpart column.
   * Expected outcome: The resolved seat.
   * Exceptions: None.
   */
  readonly withSeatId: SeatId;
  /**
   * The kind.
   *
   * Contract: A `SideAgreementKind`.
   * When to use: The kind column.
   * Expected outcome: One of the five kinds.
   * Exceptions: None.
   */
  readonly kind: SideAgreementKind;
  /**
   * The cleaned terms.
   *
   * Contract: Non-empty, at most `SIDE_AGREEMENT_TERMS_MAX_CHARS`.
   * When to use: The terms column. Do not log it.
   * Expected outcome: The stored text.
   * Exceptions: None.
   */
  readonly terms: string;
  /**
   * The raw hex codes of a no-entry zone.
   *
   * Contract: Trimmed, non-empty strings for `no_entry_zone`, otherwise empty. Translated when stored.
   * When to use: The zone column.
   * Expected outcome: At least one code for a no-entry zone.
   * Exceptions: None.
   */
  readonly zoneCodes: readonly string[];
  /**
   * The third side of a joint action.
   *
   * Contract: Set only for `joint_action`, and different from the speaker and from `withSeatId`.
   * When to use: The against column.
   * Expected outcome: A seat or null.
   * Exceptions: None.
   */
  readonly againstSeatId: SeatId | null;
  /**
   * The end turn as sent.
   *
   * Contract: An integer. Checked against the start turn when stored.
   * When to use: Fixing the end turn.
   * Expected outcome: The value from the reply.
   * Exceptions: None.
   */
  readonly endTurn: number;
  /**
   * The status.
   *
   * Contract: A `SideAgreementStatus`. A new agreement must also be `proposed` or `active`, which is checked when stored.
   * When to use: The status column.
   * Expected outcome: One of the five statuses.
   * Exceptions: None.
   */
  readonly status: SideAgreementStatus;
  /**
   * The private plan.
   *
   * Contract: A `SideAgreementIntent`.
   * When to use: The intent column.
   * Expected outcome: One of the three words.
   * Exceptions: None.
   */
  readonly intent: SideAgreementIntent;
  /**
   * The cleaned reason.
   *
   * Contract: Text, possibly empty, at most `SIDE_STANCE_REASON_MAX_CHARS`.
   * When to use: The reason column. Do not log it.
   * Expected outcome: The stored reason.
   * Exceptions: None.
   */
  readonly reason: string;
}

/**
 * What `parseSideAgreementEntries` needs.
 *
 * Contract: All fields are required.
 * When to use: One call per reply.
 * Expected outcome: The values the entries are checked against.
 * Exceptions: None.
 */
export interface ParseSideAgreementEntriesArgs {
  /**
   * The `agreements` value from the reply, unchecked.
   *
   * Contract: Any value. A non-array gives no entries and no drops.
   * When to use: Taken straight from the parsed JSON.
   * Expected outcome: Each element is checked.
   * Exceptions: None.
   */
  readonly raw: unknown;
  /**
   * The commander that sent the reply.
   *
   * Contract: A seat id.
   * When to use: Refusing an agreement with itself.
   * Expected outcome: No kept entry names this seat.
   * Exceptions: None.
   */
  readonly ownSeatId: SeatId;
  /**
   * The seats the reply may name.
   *
   * Contract: Seats still in the match.
   * When to use: Resolving `with` and `against`.
   * Expected outcome: An unknown code drops the entry.
   * Exceptions: None.
   */
  readonly addressableSeatIds: readonly SeatId[];
}

/**
 * The fields of a raw entry, before checking.
 *
 * Contract: Every field may be missing or of any type.
 * When to use: Reading one array element.
 * Expected outcome: A view of the element's keys.
 * Exceptions: None.
 */
type RawAgreementEntry = Readonly<Partial<Record<'id' | 'with' | 'kind' | 'terms' | 'zone' | 'against' | 'endTurn' | 'status' | 'intent' | 'reason', unknown>>>;

/**
 * Reads the trimmed, non-empty strings of a zone list.
 *
 * Purpose: A zone is a list of codes, and anything else in it is noise.
 * When to use: A `no_entry_zone` entry.
 * Expected outcome: The strings, or an empty array when the value is not an array.
 * Exceptions: None.
 */
function zoneStrings(zone: unknown): string[] {
  if (!Array.isArray(zone)) return [];
  return zone
    .filter((code): code is string => typeof code === 'string')
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
}

/**
 * The rule a dropped agreement entry failed.
 *
 * Contract: One word per rule in `parseOneEntry`, in the order the rules run. Never carries model text.
 * When to use: The DEBUG line of `parseSideAgreementEntries`.
 * Expected outcome: Tells a reader of `debug.log` why a reply's agreement was not stored.
 * Exceptions: None.
 */
export type AgreementDropReason =
  | 'not_object'
  | 'bad_id'
  | 'bad_with'
  | 'bad_kind'
  | 'bad_status'
  | 'bad_intent'
  | 'empty_terms'
  | 'bad_end_turn'
  | 'repeated_id'
  | 'bad_against'
  | 'empty_zone';

/**
 * Checks one entry against every rule.
 *
 * Purpose: One place holds the rules for a kept entry, and names the first rule a dropped entry fails.
 * When to use: `parseSideAgreementEntries`, once per array element.
 * Expected outcome: The entry, or the `AgreementDropReason` of the first rule that fails. `seenIds` gains the id of a kept entry with a positive id.
 * Exceptions: None.
 */
function parseOneEntry(entry: unknown, args: ParseSideAgreementEntriesArgs, seenIds: Set<number>): TalkReplyAgreement | AgreementDropReason {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return 'not_object';
  const row = entry as RawAgreementEntry;
  const agreementId = row.id === undefined ? 0 : row.id;
  if (typeof agreementId !== 'number' || !Number.isSafeInteger(agreementId) || agreementId < 0) return 'bad_id';
  const withSeatId = seatIdForSideCode(row.with, args.addressableSeatIds);
  if (!withSeatId || withSeatId === args.ownSeatId) return 'bad_with';
  if (!isSideAgreementKind(row.kind)) return 'bad_kind';
  if (!isSideAgreementStatus(row.status)) return 'bad_status';
  if (!isSideAgreementIntent(row.intent)) return 'bad_intent';
  const terms = cleanSideMessageText(row.terms, SIDE_AGREEMENT_TERMS_MAX_CHARS);
  if (terms.length === 0) return 'empty_terms';
  if (typeof row.endTurn !== 'number' || !Number.isInteger(row.endTurn)) return 'bad_end_turn';
  if (agreementId > 0 && seenIds.has(agreementId)) return 'repeated_id';
  let againstSeatId: SeatId | null = null;
  if (row.kind === 'joint_action') {
    againstSeatId = seatIdForSideCode(row.against, args.addressableSeatIds);
    if (!againstSeatId || againstSeatId === args.ownSeatId || againstSeatId === withSeatId) return 'bad_against';
  }
  const zoneCodes = row.kind === 'no_entry_zone' ? zoneStrings(row.zone) : [];
  if (row.kind === 'no_entry_zone' && zoneCodes.length === 0) return 'empty_zone';
  if (agreementId > 0) seenIds.add(agreementId);
  return {
    agreementId,
    withSeatId,
    kind: row.kind,
    terms,
    zoneCodes,
    againstSeatId,
    endTurn: row.endTurn,
    status: row.status,
    intent: row.intent,
    reason: cleanSideMessageText(row.reason, SIDE_STANCE_REASON_MAX_CHARS),
  };
}

/**
 * Reads the agreement entries of a talk reply.
 *
 * Purpose: Every rejected entry is dropped and counted, and the rest of the reply is unaffected. The DEBUG line names the
 *   rule each dropped entry failed, so `debug.log` shows whether a commander proposed agreements the rules refused.
 * When to use: `parseTalkReply` with `allowAgreements` on.
 * Expected outcome: The kept entries in order, the number dropped, and one `dropReasons` word per dropped entry in order.
 *   A non-array `raw` gives none of them. Logs entry counts, kinds, statuses, and drop reasons at DEBUG, never terms or reasons.
 * Exceptions: None.
 */
export function parseSideAgreementEntries(args: ParseSideAgreementEntriesArgs): {
  readonly agreements: readonly TalkReplyAgreement[];
  readonly droppedCount: number;
  readonly dropReasons: readonly AgreementDropReason[];
} {
  if (!Array.isArray(args.raw)) {
    logDebug('sideAgreementReply parseSideAgreementEntries', { seatId: args.ownSeatId, rawType: args.raw === undefined ? 'missing' : typeof args.raw });
    return { agreements: [], droppedCount: 0, dropReasons: [] };
  }
  const seenIds = new Set<number>();
  const agreements: TalkReplyAgreement[] = [];
  const dropReasons: AgreementDropReason[] = [];
  for (const entry of args.raw as readonly unknown[]) {
    const parsed = parseOneEntry(entry, args, seenIds);
    if (typeof parsed === 'string') dropReasons.push(parsed);
    else agreements.push(parsed);
  }
  logDebug('sideAgreementReply parseSideAgreementEntries', {
    seatId: args.ownSeatId,
    entryCount: args.raw.length,
    keptCount: agreements.length,
    kept: agreements.map((agreement) => `${agreement.kind}/${agreement.status}`),
    dropReasons,
  });
  return { agreements, droppedCount: dropReasons.length, dropReasons };
}
