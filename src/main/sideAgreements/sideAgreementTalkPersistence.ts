/**
 * Stores the agreements of one strategic talk reply.
 *
 * Purpose: A reply entry becomes a stored agreement, or a change to one, only when it passes the limits that depend on the match.
 * When to use: From `persistTalkRound`, inside its transaction, once per commander that sent agreements.
 * Expected outcome: Each accepted entry is stored and recorded. Each refused entry is counted and leaves no trace but the count.
 * Exceptions: Propagates a SQLite error to the caller, whose transaction rolls back the whole round.
 */

import { logDebug } from '../logger';
import { gameDbOps } from '../gameDb/dbConnection';
import {
  getSideAgreement,
  insertSideAgreement,
  listSideAgreementsForSeat,
  updateSideAgreement,
} from '../gameDb/sideAgreementStore';
import { recordSideAgreementRecorded } from '../recorder/sideAgreementRecordingEvents';
import type { TalkReplyAgreement } from '../openRouter/talk/sideAgreementReply';
import type { StepKey } from '../../shared/matchRecording';
import type { AiSeatId } from '../../shared/seatIds';
import {
  isOpenSideAgreementStanding,
  resolveSideAgreementEndTurn,
  SIDE_AGREEMENT_MAX_OPEN_PER_SIDE,
  SIDE_AGREEMENT_NEW_STATUSES,
  sideAgreementStanding,
} from '../../shared/sideAgreements';
import { STRATEGIC_ZONE_CODE_TRANSLATOR, zoneCodesToH3, type ZoneCodeTranslator } from './sideAgreementZoneCodes';

/**
 * What `persistTalkAgreements` needs.
 *
 * Contract: All fields except `zoneTranslator` are required.
 * When to use: One call per commander's reply.
 * Expected outcome: The values the entries are stored with.
 * Exceptions: None.
 */
export interface PersistTalkAgreementsArgs {
  /**
   * The commander that sent the reply.
   *
   * Contract: An AI seat id.
   * When to use: The owner of every stored row.
   * Expected outcome: Only this seat's agreements are created or changed.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * The step of the talk round.
   *
   * Contract: A strategic step. A tactical step stores nothing.
   * When to use: The current turn and the recorder events.
   * Expected outcome: Its turn is the start turn of a new agreement.
   * Exceptions: None.
   */
  readonly step: StepKey;
  /**
   * The entries that passed the reply rules.
   *
   * Contract: From `parseTalkReply`.
   * When to use: The entries to store, in order.
   * Expected outcome: Each is stored or counted as dropped.
   * Exceptions: None.
   */
  readonly agreements: readonly TalkReplyAgreement[];
  /**
   * The seats still in the match.
   *
   * Contract: Seat ids.
   * When to use: Refusing a new agreement with a side that left, and working out standing.
   * Expected outcome: A seat missing here counts as out of the match.
   * Exceptions: None.
   */
  readonly activeSeatIds: ReadonlySet<string>;
  /**
   * The lookups for hex codes.
   *
   * Contract: Defaults to the strategic registry.
   * When to use: A test passes a fake.
   * Expected outcome: Used for every no-entry zone.
   * Exceptions: None.
   */
  readonly zoneTranslator?: ZoneCodeTranslator;
}

/**
 * Stores or changes the agreements of one talk reply.
 *
 * Purpose: Applies the limits that depend on the match: who is still in it, how many agreements are open with one side, and how long an agreement may run.
 * When to use: Inside the talk round's transaction. This function opens none.
 * Expected outcome: Nothing happens, and zeros are returned, unless the step is strategic. A new entry (id 0) is dropped when its side or third side is out, its status is not `proposed` or `active`, the commander already holds `SIDE_AGREEMENT_MAX_OPEN_PER_SIDE` open agreements with that side, its end turn cannot be fixed, or a no-entry zone translates to no hex. A change (positive id) is dropped when the agreement is missing, belongs to another seat, differs in side or kind, is not open, or has an end turn or zone that cannot be fixed. A change that alters a stored field is recorded with the previous status. An unchanged entry counts as stored.
 * Exceptions: Propagates a SQLite error.
 */
export function persistTalkAgreements(args: PersistTalkAgreementsArgs): { readonly storedCount: number; readonly droppedCount: number } {
  const { seatId, step, agreements, activeSeatIds } = args;
  logDebug('sideAgreementTalkPersistence persistTalkAgreements', { seatId, turnNumber: step.turnNumber, entryCount: agreements.length });
  if (step.scope !== 'strategic') return { storedCount: 0, droppedCount: 0 };
  const currentTurn = step.turnNumber;
  const translator = args.zoneTranslator ?? STRATEGIC_ZONE_CODE_TRANSLATOR;
  let storedCount = 0;
  let droppedCount = 0;

  /**
   * Counts the commander's open agreements with one side right now.
   *
   * Purpose: Includes agreements stored earlier in this same call, because they are already in the table.
   * When to use: Before a new agreement is stored.
   * Expected outcome: A count of proposed or active agreements that have not expired or lapsed.
   * Exceptions: Propagates a SQLite error.
   */
  const openCountWith = (counterpartSeatId: string): number =>
    listSideAgreementsForSeat(gameDbOps, seatId).filter(
      (row) =>
        row.counterpartSeatId === counterpartSeatId &&
        isOpenSideAgreementStanding(
          sideAgreementStanding({ status: row.status, endTurn: row.endTurn, currentTurn, counterpartActive: activeSeatIds.has(row.counterpartSeatId) })
        )
    ).length;

  for (const entry of agreements) {
    const zoneH3 = entry.kind === 'no_entry_zone' ? zoneCodesToH3(entry.zoneCodes, translator).h3 : [];
    if (entry.kind === 'no_entry_zone' && zoneH3.length === 0) {
      droppedCount += 1;
      continue;
    }
    if (entry.agreementId === 0) {
      const endTurn = resolveSideAgreementEndTurn({ startTurn: currentTurn, currentTurn, requestedEndTurn: entry.endTurn });
      const sideOut = !activeSeatIds.has(entry.withSeatId) || (entry.againstSeatId !== null && !activeSeatIds.has(entry.againstSeatId));
      const statusAllowed = (SIDE_AGREEMENT_NEW_STATUSES as readonly string[]).includes(entry.status);
      if (endTurn === null || sideOut || !statusAllowed || openCountWith(entry.withSeatId) >= SIDE_AGREEMENT_MAX_OPEN_PER_SIDE) {
        droppedCount += 1;
        continue;
      }
      const row = insertSideAgreement(gameDbOps, {
        seatId,
        counterpartSeatId: entry.withSeatId,
        kind: entry.kind,
        terms: entry.terms,
        zoneH3,
        againstSeatId: entry.againstSeatId,
        startTurn: currentTurn,
        endTurn,
        status: entry.status,
        intent: entry.intent,
        reason: entry.reason,
      });
      recordSideAgreementRecorded({ step, row, previousStatus: null });
      storedCount += 1;
      continue;
    }
    const existing = getSideAgreement(gameDbOps, entry.agreementId);
    if (!existing || existing.seatId !== seatId || existing.counterpartSeatId !== entry.withSeatId || existing.kind !== entry.kind) {
      droppedCount += 1;
      continue;
    }
    const standing = sideAgreementStanding({
      status: existing.status,
      endTurn: existing.endTurn,
      currentTurn,
      counterpartActive: activeSeatIds.has(existing.counterpartSeatId),
    });
    const endTurn = resolveSideAgreementEndTurn({ startTurn: existing.startTurn, currentTurn, requestedEndTurn: entry.endTurn });
    if (!isOpenSideAgreementStanding(standing) || endTurn === null) {
      droppedCount += 1;
      continue;
    }
    const written = updateSideAgreement(gameDbOps, {
      agreementId: existing.agreementId,
      terms: entry.terms,
      zoneH3,
      endTurn,
      status: entry.status,
      intent: entry.intent,
      reason: entry.reason,
      turnNumber: currentTurn,
    });
    if (written === null) {
      droppedCount += 1;
      continue;
    }
    if (written.changed) recordSideAgreementRecorded({ step, row: written.row, previousStatus: written.previousStatus });
    storedCount += 1;
  }
  logDebug('sideAgreementTalkPersistence persistTalkAgreements done', { seatId, turnNumber: currentTurn, storedCount, droppedCount });
  return { storedCount, droppedCount };
}
