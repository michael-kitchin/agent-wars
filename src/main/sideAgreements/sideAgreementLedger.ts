/**
 * One commander's agreements as prompt views.
 *
 * Purpose: Prompts show each open agreement with its standing, hex codes, and the losses both ways since it began.
 * When to use: Building the talk situation text and the Messages section of the strategic orders prompt.
 * Expected outcome: Views sorted by the other side's seat order, then by id. Nothing is stored here.
 * Exceptions: None. `readSideAgreementViews` catches every error and returns an empty list.
 */

import { logDebug, logError, logTrace } from '../logger';
import { gameDbOps } from '../gameDb/dbConnection';
import { listSideAgreementsForSeat, type SideAgreementRow } from '../gameDb/sideAgreementStore';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import type { CombatRecordTurn } from '../briefing/sideCombatRecord';
import { readCombatRecordTurns } from '../briefing/sideCombatRecordRead';
import {
  isOpenSideAgreementStanding,
  SIDE_AGREEMENT_RECENTLY_CLOSED_TURNS,
  sideAgreementStanding,
  type SideAgreementDecision,
  type SideAgreementIntent,
  type SideAgreementKind,
  type SideAgreementStanding,
} from '../../shared/sideAgreements';
import { isSeatId, type AiSeatId } from '../../shared/seatIds';
import { isSeatActive, sortSeatsByOrder, type SeatRecord } from '../../shared/seatRoster';
import { playerIdCodeFor } from '../../shared/unitIds';
import { formatSideAgreementEvidence } from './sideAgreementEvidence';
import { zoneH3ToCodes } from './sideAgreementZoneCodes';

/**
 * The latest keep-or-break decision as a prompt shows it.
 *
 * Contract: All three fields come from the stored row.
 * When to use: `SideAgreementView.decision`.
 * Expected outcome: The turn, the choice, and the reason.
 * Exceptions: None.
 */
export interface SideAgreementViewDecision {
  /**
   * The turn the decision was made.
   *
   * Contract: An integer turn number.
   * When to use: The decision line.
   * Expected outcome: The stored decision turn.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The choice.
   *
   * Contract: A `SideAgreementDecision`.
   * When to use: The decision line.
   * Expected outcome: `keep` or `break`.
   * Exceptions: None.
   */
  readonly decision: SideAgreementDecision;
  /**
   * The reason given.
   *
   * Contract: Text, possibly empty.
   * When to use: The decision line.
   * Expected outcome: The stored reason.
   * Exceptions: None.
   */
  readonly reason: string;
}

/**
 * One agreement as a prompt prints it.
 *
 * Contract: Built from a stored row, the roster, and the stored loss turns. Standing is worked out for the turn being played.
 * When to use: `formatSideAgreementLines` and the talk prompt input.
 * Expected outcome: Everything a prompt line needs, with codes and labels already resolved.
 * Exceptions: None.
 */
export interface SideAgreementView {
  /**
   * The agreement's id.
   *
   * Contract: A positive integer.
   * When to use: The line's head, and the id a change or a decision names.
   * Expected outcome: The stored id.
   * Exceptions: None.
   */
  readonly agreementId: number;
  /**
   * The other side's seat id.
   *
   * Contract: A seat id.
   * When to use: Sorting.
   * Expected outcome: The stored counterpart.
   * Exceptions: None.
   */
  readonly counterpartSeatId: string;
  /**
   * The other side's code, such as `a2`.
   *
   * Contract: From `playerIdCodeFor`.
   * When to use: The line's head.
   * Expected outcome: The unit id prefix of that side.
   * Exceptions: None.
   */
  readonly counterpartCode: string;
  /**
   * The other side's home region.
   *
   * Contract: The roster's `homeRegion`.
   * When to use: The line's head.
   * Expected outcome: A name a commander recognizes.
   * Exceptions: None.
   */
  readonly counterpartLabel: string;
  /**
   * The kind of agreement.
   *
   * Contract: A `SideAgreementKind`.
   * When to use: The line's head.
   * Expected outcome: One of the five kinds.
   * Exceptions: None.
   */
  readonly kind: SideAgreementKind;
  /**
   * The terms.
   *
   * Contract: Cleaned text.
   * When to use: The terms part of the line.
   * Expected outcome: The stored terms.
   * Exceptions: None.
   */
  readonly terms: string;
  /**
   * The hex codes of a no-entry zone.
   *
   * Contract: Empty for other kinds, and for indexes the registry does not know.
   * When to use: The zone part of the line.
   * Expected outcome: Briefing hex codes.
   * Exceptions: None.
   */
  readonly zoneCodes: readonly string[];
  /**
   * The code of the third side of a joint action.
   *
   * Contract: Null when there is none, or when the seat is not a known seat.
   * When to use: The against part of the line.
   * Expected outcome: A side code or null.
   * Exceptions: None.
   */
  readonly againstCode: string | null;
  /**
   * The home region of the third side.
   *
   * Contract: Null exactly when `againstCode` is null.
   * When to use: The against part of the line.
   * Expected outcome: A region name or null.
   * Exceptions: None.
   */
  readonly againstLabel: string | null;
  /**
   * The turn the agreement began.
   *
   * Contract: An integer turn number.
   * When to use: The line's head.
   * Expected outcome: The stored start turn.
   * Exceptions: None.
   */
  readonly startTurn: number;
  /**
   * The last turn the agreement covers.
   *
   * Contract: An integer turn number.
   * When to use: The line's head and the expired text.
   * Expected outcome: The stored end turn.
   * Exceptions: None.
   */
  readonly endTurn: number;
  /**
   * What the agreement is now.
   *
   * Contract: From `sideAgreementStanding` for the turn being played.
   * When to use: The line's head.
   * Expected outcome: One of seven standings.
   * Exceptions: None.
   */
  readonly standing: SideAgreementStanding;
  /**
   * The turn the commander closed the agreement.
   *
   * Contract: The row's `updatedTurn` when the stored status is `ended`, `broken_by_them`, or `broken_by_me`, and null
   *   for every other standing. A closed agreement can no longer be changed, so its last change is the turn it closed.
   * When to use: The line's head, so the model sees when a closed agreement stopped applying.
   * Expected outcome: A turn number or null.
   * Exceptions: None.
   */
  readonly closedTurn: number | null;
  /**
   * The commander's private plan.
   *
   * Contract: A `SideAgreementIntent`.
   * When to use: The intent part of the line.
   * Expected outcome: One of the three words.
   * Exceptions: None.
   */
  readonly intent: SideAgreementIntent;
  /**
   * The latest decision.
   *
   * Contract: Null unless the row holds a decision, its reason, and its turn.
   * When to use: The decision part of the line.
   * Expected outcome: The decision or null.
   * Exceptions: None.
   */
  readonly decision: SideAgreementViewDecision | null;
  /**
   * The losses both ways since the agreement began.
   *
   * Contract: Text for an open agreement, otherwise null.
   * When to use: The second line of the view.
   * Expected outcome: The game's record, not either side's claim.
   * Exceptions: None.
   */
  readonly evidence: string | null;
}

/**
 * What `buildSideAgreementViews` needs.
 *
 * Contract: All fields are required. The function is pure.
 * When to use: Building views from rows already read.
 * Expected outcome: The values the views are built from.
 * Exceptions: None.
 */
export interface BuildSideAgreementViewsArgs {
  /**
   * The strategic turn being played.
   *
   * Contract: An integer turn number.
   * When to use: Standing and the recently closed window.
   * Expected outcome: Decides which agreements are shown.
   * Exceptions: None.
   */
  readonly currentTurn: number;
  /**
   * The commander's stored agreements.
   *
   * Contract: Rows from `listSideAgreementsForSeat`.
   * When to use: The source of every view.
   * Expected outcome: One view for each row that is shown.
   * Exceptions: None.
   */
  readonly rows: readonly SideAgreementRow[];
  /**
   * The seat roster.
   *
   * Contract: Every seat of the match.
   * When to use: Labels, codes, activity, and sort order.
   * Expected outcome: A seat missing here counts as not active.
   * Exceptions: None.
   */
  readonly roster: readonly SeatRecord[];
  /**
   * The commander's stored loss turns.
   *
   * Contract: The turns from `readCombatRecordTurns`.
   * When to use: Evidence for open agreements.
   * Expected outcome: Counted from each agreement's start turn.
   * Exceptions: None.
   */
  readonly turns: readonly CombatRecordTurn[];
  /**
   * Translates stored H3 indexes to hex codes.
   *
   * Contract: Skips indexes it does not know.
   * When to use: A no-entry zone.
   * Expected outcome: Briefing hex codes.
   * Exceptions: None.
   */
  readonly zoneToCodes: (h3Indexes: readonly string[]) => string[];
}

/**
 * Builds the views of one commander's agreements.
 *
 * Purpose: Works out standing, evidence, and labels, and drops agreements that closed more than a short while ago.
 * When to use: With rows, the roster, and the loss turns already read.
 * Expected outcome: An agreement is kept when it is open, or when it changed or ended within `SIDE_AGREEMENT_RECENTLY_CLOSED_TURNS` turns. Views are sorted by the other side's seat order, then by id. A row whose other side is not a known seat is skipped.
 * Exceptions: None.
 */
export function buildSideAgreementViews(args: BuildSideAgreementViewsArgs): SideAgreementView[] {
  const { currentTurn, rows, roster, turns, zoneToCodes } = args;
  const ordered = sortSeatsByOrder(roster);
  const orderOf = new Map(ordered.map((seat, index) => [seat.seatId as string, index]));
  const seatById = new Map(roster.map((seat) => [seat.seatId as string, seat]));
  const views: SideAgreementView[] = [];
  for (const row of rows) {
    const counterpart = seatById.get(row.counterpartSeatId);
    if (!counterpart || !isSeatId(row.counterpartSeatId)) continue;
    const standing = sideAgreementStanding({
      status: row.status,
      endTurn: row.endTurn,
      currentTurn,
      counterpartActive: isSeatActive(counterpart),
    });
    const open = isOpenSideAgreementStanding(standing);
    if (!open && Math.max(row.updatedTurn, row.endTurn) < currentTurn - SIDE_AGREEMENT_RECENTLY_CLOSED_TURNS) continue;
    const against = row.againstSeatId !== null && isSeatId(row.againstSeatId) ? seatById.get(row.againstSeatId) : undefined;
    views.push({
      agreementId: row.agreementId,
      counterpartSeatId: row.counterpartSeatId,
      counterpartCode: playerIdCodeFor(row.counterpartSeatId),
      counterpartLabel: counterpart.homeRegion,
      kind: row.kind,
      terms: row.terms,
      zoneCodes: row.zoneH3.length > 0 ? zoneToCodes(row.zoneH3) : [],
      againstCode: against && row.againstSeatId !== null && isSeatId(row.againstSeatId) ? playerIdCodeFor(row.againstSeatId) : null,
      againstLabel: against ? against.homeRegion : null,
      startTurn: row.startTurn,
      endTurn: row.endTurn,
      standing,
      closedTurn: standing === 'ended' || standing === 'broken_by_them' || standing === 'broken_by_me' ? row.updatedTurn : null,
      intent: row.intent,
      decision:
        row.decision !== null && row.decisionReason !== null && row.decisionTurn !== null
          ? { turnNumber: row.decisionTurn, decision: row.decision, reason: row.decisionReason }
          : null,
      evidence: open
        ? formatSideAgreementEvidence({
            seatId: row.seatId,
            counterpartSeatId: row.counterpartSeatId,
            startTurn: row.startTurn,
            turns,
          })
        : null,
    });
  }
  views.sort(
    (a, b) =>
      (orderOf.get(a.counterpartSeatId) ?? 0) - (orderOf.get(b.counterpartSeatId) ?? 0) || a.agreementId - b.agreementId
  );
  logTrace('sideAgreementLedger buildSideAgreementViews', { currentTurn, rowCount: rows.length, viewCount: views.length });
  return views;
}

/**
 * Reads one commander's agreement views from the open match.
 *
 * Purpose: Prompts never fail because an agreement could not be read.
 * When to use: Building a strategic talk prompt or the Messages section of a strategic orders prompt.
 * Expected outcome: The views for the turn being played, or an empty list after any error. The error is logged with the seat and turn only.
 * Exceptions: None.
 */
export function readSideAgreementViews(seatId: AiSeatId, currentTurn: number): SideAgreementView[] {
  try {
    const rows = listSideAgreementsForSeat(gameDbOps, seatId);
    const views =
      rows.length === 0
        ? []
        : buildSideAgreementViews({
            currentTurn,
            rows,
            roster: readSeatRoster(gameDbOps),
            turns: readCombatRecordTurns(seatId, currentTurn),
            zoneToCodes: zoneH3ToCodes,
          });
    logDebug('sideAgreementLedger readSideAgreementViews', { seatId, currentTurn, viewCount: views.length });
    return views;
  } catch (err) {
    logError('sideAgreementLedger readSideAgreementViews failed', { seatId, currentTurn, err });
    return [];
  }
}
