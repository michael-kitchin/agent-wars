/**
 * The agreements strip model: rows and cells for the charts dialog.
 *
 * Purpose: Turns a charts snapshot and two filters into one row per AI commander and one cell per turn, with the counts, marks, and items a cell shows.
 * When to use: Drawing the agreements strip, and writing its tooltip text.
 * Expected outcome: Pure values. This module does not read the database, draw, or log.
 * Exceptions: None.
 */

import type {
  AgreementDecisionRecord,
  AgreementHistoryEntry,
  AgreementVersion,
  AttackLossRecord,
} from './agreementHistoryTypes';
import type { MatchChartsSeat, MatchChartsSnapshot } from './matchStatistics';
import {
  sideAgreementStanding,
  type SideAgreementIntent,
  type SideAgreementKind,
} from './sideAgreements';

/**
 * The filter value that matches everything.
 *
 * Purpose: One word for "All" in both dropdowns.
 * When to use: As the starting value of both filters, and as the option value for All.
 * Expected outcome: The text `all`.
 * Exceptions: None.
 */
export const AGREEMENT_FILTER_ALL = 'all';

/**
 * The two filters of the agreements strip.
 *
 * Contract: Both fields are required.
 * When to use: Calling `agreementStrip`.
 * Expected outcome: Read by `agreementStrip` only.
 * Exceptions: None.
 */
export interface AgreementStripFilter {
  /**
   * The kind to count.
   *
   * Contract: A kind, or `AGREEMENT_FILTER_ALL`.
   * When to use: The Kind dropdown.
   * Expected outcome: Limits cells to that kind.
   * Exceptions: None.
   */
  readonly kind: SideAgreementKind | typeof AGREEMENT_FILTER_ALL;
  /**
   * The other side to count agreements with.
   *
   * Contract: A seat id, or `AGREEMENT_FILTER_ALL`.
   * When to use: The With dropdown.
   * Expected outcome: Limits cells to that counterpart and removes that seat's row.
   * Exceptions: None.
   */
  readonly withSeatId: string;
}

/**
 * Whether the other side records a matching agreement.
 *
 * Contract: `not_applicable` when the other side is not an AI seat, `none` when it records no agreement of the same kind with this side, `match` otherwise.
 * When to use: Marking a mismatch and writing the tooltip.
 * Expected outcome: One of the three shapes.
 * Exceptions: None.
 */
export type CounterpartRecord =
  | { readonly kind: 'not_applicable' }
  | { readonly kind: 'none' }
  | { readonly kind: 'match'; readonly agreementId: number; readonly standing: 'active' | 'proposed' };

/**
 * One agreement as it stands in one cell.
 *
 * Contract: Built from the agreement's last version at or before the cell's turn.
 * When to use: Listing the agreements in a tooltip.
 * Expected outcome: The facts a tooltip prints, plus the breach flags.
 * Exceptions: None.
 */
export interface AgreementCellItem {
  /**
   * The agreement id.
   *
   * Contract: A whole number.
   * When to use: Naming the agreement.
   * Expected outcome: The stored id.
   * Exceptions: None.
   */
  readonly agreementId: number;
  /**
   * The other side.
   *
   * Contract: A seat id.
   * When to use: Naming the other side.
   * Expected outcome: The counterpart's seat id.
   * Exceptions: None.
   */
  readonly counterpartSeatId: string;
  /**
   * The third side of a joint action, or null.
   *
   * Contract: A seat id or null.
   * When to use: Naming the target.
   * Expected outcome: The seat id or null.
   * Exceptions: None.
   */
  readonly againstSeatId: string | null;
  /**
   * The kind.
   *
   * Contract: A member of `SIDE_AGREEMENT_KINDS`.
   * When to use: Labelling the agreement.
   * Expected outcome: One of the five kinds.
   * Exceptions: None.
   */
  readonly kind: SideAgreementKind;
  /**
   * The turn the agreement was first recorded.
   *
   * Contract: A whole turn number.
   * When to use: Printing the span.
   * Expected outcome: The first version's turn.
   * Exceptions: None.
   */
  readonly startTurn: number;
  /**
   * The end turn at this turn.
   *
   * Contract: A whole turn number.
   * When to use: Printing the span.
   * Expected outcome: The end turn of the state in force.
   * Exceptions: None.
   */
  readonly endTurn: number;
  /**
   * Whether the agreement is active or only proposed at this turn.
   *
   * Contract: `active` or `proposed`.
   * When to use: Ordering items and counting.
   * Expected outcome: One of the two words.
   * Exceptions: None.
   */
  readonly standing: 'active' | 'proposed';
  /**
   * The keeper's private plan.
   *
   * Contract: A member of `SIDE_AGREEMENT_INTENTS`.
   * When to use: Printing the intent.
   * Expected outcome: The intent of the state in force.
   * Exceptions: None.
   */
  readonly intent: SideAgreementIntent;
  /**
   * The terms of the state in force.
   *
   * Contract: Text that may hold side codes.
   * When to use: Printing the terms after the codes become names.
   * Expected outcome: The terms as recorded.
   * Exceptions: None.
   */
  readonly terms: string;
  /**
   * The hex codes of the zone of the state in force.
   *
   * Contract: May be empty.
   * When to use: Printing the zone.
   * Expected outcome: A list of codes.
   * Exceptions: None.
   */
  readonly zoneCodes: readonly string[];
  /**
   * The newest decision at or before this turn.
   *
   * Contract: Null when there is none.
   * When to use: Printing the decision.
   * Expected outcome: The decision record or null.
   * Exceptions: None.
   */
  readonly latestDecision: AgreementDecisionRecord | null;
  /**
   * Units the keeper's attacks destroyed of the counterpart this turn.
   *
   * Contract: Zero for a proposal.
   * When to use: Marking and printing a breach.
   * Expected outcome: A count.
   * Exceptions: None.
   */
  readonly unitsDestroyedByAttack: number;
  /**
   * Whether the keeper decided to break the agreement this turn.
   *
   * Contract: True when a `break` decision is recorded for this turn.
   * When to use: Marking and printing a breach.
   * Expected outcome: A flag.
   * Exceptions: None.
   */
  readonly decidedBreakThisTurn: boolean;
  /**
   * Whether the agreement was breached this turn.
   *
   * Contract: True only for an active agreement with attack losses or a break decision this turn.
   * When to use: Hatching a cell.
   * Expected outcome: A flag.
   * Exceptions: None.
   */
  readonly breached: boolean;
  /**
   * Whether the other side records a matching agreement.
   *
   * Contract: Ignores the dropdowns.
   * When to use: Marking a mismatch and printing the tooltip.
   * Expected outcome: The counterpart record.
   * Exceptions: None.
   */
  readonly counterpartRecord: CounterpartRecord;
}

/**
 * One cell of the strip.
 *
 * Contract: Counts only agreements that match both filters.
 * When to use: Drawing a cell and its tooltip.
 * Expected outcome: Counts, marks, and the items behind them.
 * Exceptions: None.
 */
export interface AgreementCell {
  /**
   * How many matching agreements are active.
   *
   * Contract: Never counts proposals.
   * When to use: The main number and fill.
   * Expected outcome: A count.
   * Exceptions: None.
   */
  readonly activeCount: number;
  /**
   * How many matching agreements are only proposed.
   *
   * Contract: Counted apart from the active ones.
   * When to use: The `+N` label and the dashed edge.
   * Expected outcome: A count.
   * Exceptions: None.
   */
  readonly proposedCount: number;
  /**
   * Whether any item was breached.
   *
   * Contract: True when any item has `breached`.
   * When to use: Hatching the cell.
   * Expected outcome: A flag.
   * Exceptions: None.
   */
  readonly breached: boolean;
  /**
   * Whether any active item has no matching record on the other side.
   *
   * Contract: True when an active item's counterpart record is `none`.
   * When to use: Drawing the corner mark.
   * Expected outcome: A flag.
   * Exceptions: None.
   */
  readonly mismatched: boolean;
  /**
   * The matching agreements.
   *
   * Contract: Active first, then proposed, each group by agreement id.
   * When to use: The tooltip.
   * Expected outcome: A list, possibly empty.
   * Exceptions: None.
   */
  readonly items: readonly AgreementCellItem[];
}

/**
 * One row of the strip.
 *
 * Contract: One cell per entry of `AgreementStrip.turns`.
 * When to use: Drawing a commander's row.
 * Expected outcome: The seat id and its cells.
 * Exceptions: None.
 */
export interface AgreementStripRow {
  /**
   * The commander's seat id.
   *
   * Contract: An AI seat.
   * When to use: Labelling the row.
   * Expected outcome: A seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The row's cells, in turn order.
   *
   * Contract: Same length as the strip's turns.
   * When to use: Drawing.
   * Expected outcome: A list of cells.
   * Exceptions: None.
   */
  readonly cells: readonly AgreementCell[];
}

/**
 * The whole strip.
 *
 * Contract: Turns are the snapshot's recorded turns.
 * When to use: Drawing the strip.
 * Expected outcome: The turn axis and the rows.
 * Exceptions: None.
 */
export interface AgreementStrip {
  /**
   * The turn numbers on the axis.
   *
   * Contract: The same turns as the stance strip.
   * When to use: The horizontal axis.
   * Expected outcome: Ascending turn numbers.
   * Exceptions: None.
   */
  readonly turns: readonly number[];
  /**
   * One row per AI commander, in side order.
   *
   * Contract: Omits the seat chosen in the With filter.
   * When to use: Drawing rows.
   * Expected outcome: A list of rows.
   * Exceptions: None.
   */
  readonly rows: readonly AgreementStripRow[];
}

/**
 * An agreement's state at one turn, before the filters.
 *
 * Contract: Only agreements with a version at or before the turn have one.
 * When to use: Inside this module.
 * Expected outcome: The entry, the version in force, and the standing.
 * Exceptions: None.
 */
interface AgreementAtTurn {
  /**
   * The history entry.
   *
   * Contract: Not changed.
   * When to use: Reading fixed facts and decisions.
   * Expected outcome: The entry.
   * Exceptions: None.
   */
  readonly entry: AgreementHistoryEntry;
  /**
   * The last version at or before the turn.
   *
   * Contract: Not changed.
   * When to use: Reading terms and the end turn.
   * Expected outcome: A version.
   * Exceptions: None.
   */
  readonly version: AgreementVersion;
  /**
   * The standing at the turn, limited to the two shown standings.
   *
   * Contract: Not changed.
   * When to use: Counting.
   * Expected outcome: `active` or `proposed`.
   * Exceptions: None.
   */
  readonly standing: 'active' | 'proposed';
}

/**
 * Lookups built once per strip.
 *
 * Contract: Built from one snapshot and not changed.
 * When to use: Inside this module.
 * Expected outcome: Agreements by keeper, attack units by key, and seats by id.
 * Exceptions: None.
 */
interface StripLookups {
  /**
   * Agreements grouped by keeper seat id.
   *
   * Contract: Each list is ordered by agreement id.
   * When to use: Building a row.
   * Expected outcome: A map.
   * Exceptions: None.
   */
  readonly byKeeper: ReadonlyMap<string, readonly AgreementHistoryEntry[]>;
  /**
   * Units destroyed by attack, keyed by turn, attacker, and victim.
   *
   * Contract: Keys come from `attackKey`.
   * When to use: Reading `unitsDestroyedByAttack`.
   * Expected outcome: A map to unit counts.
   * Exceptions: None.
   */
  readonly attackUnits: ReadonlyMap<string, number>;
  /**
   * Seats by seat id.
   *
   * Contract: Every seat in the snapshot.
   * When to use: Reading kind and out turn.
   * Expected outcome: A map.
   * Exceptions: None.
   */
  readonly seats: ReadonlyMap<string, MatchChartsSeat>;
}

/**
 * Builds the key for one attack record.
 *
 * Purpose: One text key finds the attack count of a turn, attacker, and victim.
 * When to use: Building and reading `StripLookups.attackUnits`.
 * Expected outcome: A key text.
 * Exceptions: None.
 */
function attackKey(turn: number, bySeatId: string, fromSeatId: string): string {
  return `${turn}|${bySeatId}|${fromSeatId}`;
}

/**
 * Finds the last item at or before a turn in a list ordered by turn.
 *
 * Purpose: Versions and decisions are both "the newest one up to this turn".
 * When to use: Rebuilding an agreement at a turn.
 * Expected outcome: The last item whose turn is at most `turn`, or undefined.
 * Exceptions: None.
 */
function lastAtOrBefore<Item extends { readonly turnNumber: number }>(
  items: readonly Item[],
  turn: number,
): Item | undefined {
  return [...items].reverse().find((item) => item.turnNumber <= turn);
}

/**
 * Builds the lookups for one strip.
 *
 * Purpose: A long match stays fast because nothing searches the whole history per cell.
 * When to use: Once per `agreementStrip` call.
 * Expected outcome: The three lookups.
 * Exceptions: None.
 */
function buildLookups(snapshot: MatchChartsSnapshot): StripLookups {
  const history = snapshot.agreementHistory;
  const byKeeper = new Map<string, AgreementHistoryEntry[]>();
  for (const entry of history?.agreements ?? []) {
    byKeeper.set(entry.seatId, [...(byKeeper.get(entry.seatId) ?? []), entry]);
  }
  const attackUnits = new Map<string, number>();
  (history?.attacks ?? []).forEach((attack: AttackLossRecord) => {
    const key = attackKey(attack.turnNumber, attack.bySeatId, attack.fromSeatId);
    attackUnits.set(key, (attackUnits.get(key) ?? 0) + attack.units);
  });
  return { byKeeper, attackUnits, seats: new Map(snapshot.seats.map((seat) => [seat.seatId, seat])) };
}

/**
 * Tells whether a seat was still in the match at a turn.
 *
 * Purpose: Applies the `outTurn` rule: a side still plays the turn it is knocked out on, and is out after it.
 * When to use: Deciding whether an agreement had lapsed because one of its two sides had left the match.
 * Expected outcome: False for a seat missing from the snapshot or past its out turn, true otherwise.
 * Exceptions: None.
 */
function isSeatInMatchAt(seat: MatchChartsSeat | undefined, turn: number): boolean {
  if (seat === undefined) return false;
  const outTurn = seat.outTurn;
  return outTurn === null || outTurn === undefined || turn <= outTurn;
}

/**
 * Works out an agreement's state and shown standing at one turn.
 *
 * Purpose: Applies the shared standing rule with the counterpart's out turn. An agreement whose keeper is out of
 *   the match lapses the same way, so a knocked-out side shows no agreements after its out turn.
 * When to use: For each agreement and turn.
 * Expected outcome: The state, or null when the agreement does not exist yet, is closed, expired, or lapsed.
 * Exceptions: None.
 */
function agreementAtTurn(entry: AgreementHistoryEntry, turn: number, lookups: StripLookups): AgreementAtTurn | null {
  const version = lastAtOrBefore(entry.versions, turn);
  if (!version) return null;
  const counterpartActive = isSeatInMatchAt(lookups.seats.get(entry.counterpartSeatId), turn)
    && isSeatInMatchAt(lookups.seats.get(entry.seatId), turn);
  const standing = sideAgreementStanding({
    status: version.status,
    endTurn: version.endTurn,
    currentTurn: turn,
    counterpartActive,
  });
  return standing === 'active' || standing === 'proposed' ? { entry, version, standing } : null;
}

/**
 * Finds whether the counterpart records a matching agreement at a turn.
 *
 * Purpose: Marks an active agreement the other side does not record.
 * When to use: For each item of a cell.
 * Expected outcome: `not_applicable` for a non-AI counterpart, else the lowest-id match, else `none`. The dropdowns are ignored.
 * Exceptions: None.
 */
function counterpartRecordAt(item: AgreementAtTurn, turn: number, lookups: StripLookups): CounterpartRecord {
  const { entry } = item;
  const counterpart = lookups.seats.get(entry.counterpartSeatId);
  if (counterpart?.kind !== 'ai') return { kind: 'not_applicable' };
  for (const other of lookups.byKeeper.get(entry.counterpartSeatId) ?? []) {
    if (other.counterpartSeatId !== entry.seatId || other.kind !== entry.kind) continue;
    const state = agreementAtTurn(other, turn, lookups);
    if (state) return { kind: 'match', agreementId: other.agreementId, standing: state.standing };
  }
  return { kind: 'none' };
}

/**
 * Builds the item for one agreement in one cell.
 *
 * Purpose: Gathers the facts, breach flags, and counterpart record for the tooltip and marks.
 * When to use: For each agreement that belongs in a cell.
 * Expected outcome: One cell item.
 * Exceptions: None.
 */
function cellItem(item: AgreementAtTurn, turn: number, lookups: StripLookups): AgreementCellItem {
  const { entry, version, standing } = item;
  const unitsDestroyedByAttack = standing === 'active'
    ? lookups.attackUnits.get(attackKey(turn, entry.seatId, entry.counterpartSeatId)) ?? 0
    : 0;
  const decidedBreakThisTurn = entry.decisions.some((d) => d.turnNumber === turn && d.decision === 'break');
  return {
    agreementId: entry.agreementId,
    counterpartSeatId: entry.counterpartSeatId,
    againstSeatId: entry.againstSeatId,
    kind: entry.kind,
    startTurn: entry.startTurn,
    endTurn: version.endTurn,
    standing,
    intent: version.intent,
    terms: version.terms,
    zoneCodes: version.zoneCodes,
    latestDecision: lastAtOrBefore(entry.decisions, turn) ?? null,
    unitsDestroyedByAttack,
    decidedBreakThisTurn,
    breached: standing === 'active' && (unitsDestroyedByAttack > 0 || decidedBreakThisTurn),
    counterpartRecord: counterpartRecordAt(item, turn, lookups),
  };
}

/**
 * Builds one cell.
 *
 * Purpose: Picks the agreements of one keeper that match the filters at one turn and totals them.
 * When to use: For each row and turn.
 * Expected outcome: The cell, with active items before proposed ones, each group by agreement id.
 * Exceptions: None.
 */
function buildCell(
  agreements: readonly AgreementHistoryEntry[],
  turn: number,
  filter: AgreementStripFilter,
  lookups: StripLookups,
): AgreementCell {
  const items = agreements
    .filter((entry) => filter.kind === AGREEMENT_FILTER_ALL || entry.kind === filter.kind)
    .filter((entry) => filter.withSeatId === AGREEMENT_FILTER_ALL || entry.counterpartSeatId === filter.withSeatId)
    .map((entry) => agreementAtTurn(entry, turn, lookups))
    .filter((state): state is AgreementAtTurn => state !== null)
    .map((state) => cellItem(state, turn, lookups))
    .sort((a, b) => Number(b.standing === 'active') - Number(a.standing === 'active') || a.agreementId - b.agreementId);
  return {
    activeCount: items.filter((item) => item.standing === 'active').length,
    proposedCount: items.filter((item) => item.standing === 'proposed').length,
    breached: items.some((item) => item.breached),
    mismatched: items.some((item) => item.standing === 'active' && item.counterpartRecord.kind === 'none'),
    items,
  };
}

/**
 * Builds the agreements strip from a charts snapshot.
 *
 * Purpose: Gives the dialog one row per AI commander and one cell per turn, rebuilt with the shared standing rule.
 * When to use: Every time the snapshot or a dropdown changes.
 * Expected outcome: The turn axis shared with the stance strip, and rows without the human seat and without the With seat. A snapshot with no history gives empty cells.
 * Exceptions: None.
 */
export function agreementStrip(snapshot: MatchChartsSnapshot, filter: AgreementStripFilter): AgreementStrip {
  const turns = snapshot.turns.map((turn) => turn.turnNumber);
  const lookups = buildLookups(snapshot);
  const rows = [...snapshot.seats]
    .filter((seat) => seat.kind === 'ai' && seat.seatId !== filter.withSeatId)
    .sort((a, b) => a.seatOrder - b.seatOrder)
    .map((seat) => ({
      seatId: seat.seatId,
      cells: turns.map((turn) => buildCell(lookups.byKeeper.get(seat.seatId) ?? [], turn, filter, lookups)),
    }));
  return { turns, rows };
}
