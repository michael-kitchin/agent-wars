/**
 * Game-over standings: heading, result line, rows, and model cost.
 *
 * Purpose: The game-over panel and the knocked-out dialog share one wording.
 * When to use: After a match ends, and when Ready knocks out the human seat.
 * Expected outcome: Pure text. This module does not read the database or the DOM.
 * Exceptions: None. This module does not import the main-process logger.
 */

import { formatCommanderSummary } from './commanderSummary';
import { formatPlaceOrdinal } from './placeOrdinal';
import { paletteForOwner } from './seatPalette';
import type { SeatId } from './seatIds';
import { HUMAN_SEAT_KIND, type Doctrine, type DoctrineChoice, type SeatKind } from './seatRoster';
import type { GameEndReason } from './victoryRules';

/**
 * One seat as standings reads it.
 *
 * Purpose: The builder does not look up city hexes or model names itself.
 * When to use: `buildStandings`.
 * Expected outcome: City hexes are already counted. A human seat has a null commander.
 * Exceptions: None.
 */
export interface StandingsSeatInput {
  /**
   * Stored id of this side.
   *
   * Contract: A `SeatId`.
   * When to use: Dots, "(you)", and "Knocked out by you".
   * Expected outcome: Matches the roster.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * List and color order, from 1 to 4.
   *
   * Contract: Unique in the roster. Seat 1 is the human when the match has one.
   * When to use: Tie breaks and the seat color.
   * Expected outcome: An integer from 1 to 4.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * Whether a person or a commander plays the seat.
   *
   * Contract: `HUMAN_SEAT_KIND` or `AI_SEAT_KIND`.
   * When to use: The heading, and whether a row shows a commander.
   * Expected outcome: At most one human seat.
   * Exceptions: None.
   */
  readonly kind: SeatKind;
  /**
   * Full home name.
   *
   * Contract: The roster's `homeRegion`, not a shortened label.
   * When to use: The row name and the result line.
   * Expected outcome: The name the player reads.
   * Exceptions: None.
   */
  readonly homeRegion: string;
  /**
   * Turn on which the seat was knocked out, or null while it finished active.
   *
   * Contract: Null means the seat was still in the match at the end.
   * When to use: "Out, turn N" and the last-side-standing sentence.
   * Expected outcome: A positive turn number, or null.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
  /**
   * The seat credited with the knockout, or null.
   *
   * Contract: Null when the seat is active or no seat was credited.
   * When to use: "Knocked out by" and the last-side-standing sentence.
   * Expected outcome: A `SeatId` or null.
   * Exceptions: None.
   */
  readonly outBy: SeatId | null;
  /**
   * Finishing place.
   *
   * Contract: Ties share a place. Null only when the roster has not placed the seat.
   * When to use: Row order and the heading.
   * Expected outcome: A positive integer, or null.
   * Exceptions: None.
   */
  readonly place: number | null;
  /**
   * Consultations this AI seat finished.
   *
   * Contract: Zero for a human seat.
   * When to use: The row's consultation count.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly consultationCount: number;
  /**
   * Model cost charged to this seat, in US dollars.
   *
   * Contract: Zero for a human seat.
   * When to use: The row and the match total.
   * Expected outcome: A non-negative number.
   * Exceptions: None.
   */
  readonly costUsd: number;
  /**
   * City hexes this seat held when the match ended.
   *
   * Contract: A non-negative integer. Zero when the seat held none.
   * When to use: Active-seat status and a shared first place.
   * Expected outcome: The count from `countCityHexesBySeat`.
   * Exceptions: None.
   */
  readonly cityHexes: number;
  /**
   * Commander settings, or null for the human seat.
   *
   * Contract: Null hides the commander line. `revealedDoctrine` is the draw once the match is over.
   * When to use: The commander summary.
   * Expected outcome: A model id, effort, choice, and revealed doctrine, or null.
   * Exceptions: None.
   */
  readonly commander: {
    readonly modelId: string | null;
    readonly reasoningEffort: string | null;
    readonly doctrineChoice: DoctrineChoice;
    readonly revealedDoctrine: Doctrine | null;
  } | null;
}

/**
 * Facts the standings screen is built from.
 *
 * Purpose: The caller already has the roster, the end reason, and model names.
 * When to use: `buildStandings`.
 * Expected outcome: `modelLabels` maps a model id to the option text the player picked.
 * Exceptions: None.
 */
export interface StandingsInput {
  /**
   * Every seat in the match.
   *
   * Contract: Two to four rows.
   * When to use: The heading's count and the rows.
   * Expected outcome: One row per seat.
   * Exceptions: None.
   */
  readonly seats: readonly StandingsSeatInput[];
  /**
   * The seat marked "(you)", or null when nobody is.
   *
   * Contract: Null in a match with no human viewer. A played match passes the human seat, including after that seat is out.
   * When to use: The row name and "Knocked out by you".
   * Expected outcome: A `SeatId` or null.
   * Exceptions: None.
   */
  readonly viewerSeatId: SeatId | null;
  /**
   * Why the match ended.
   *
   * Contract: One of `GameEndReason`.
   * When to use: The result line and active-seat status.
   * Expected outcome: Last side standing, the turn limit, a mutual wipe, or the human ending the match.
   * Exceptions: None.
   */
  readonly gameEndReason: GameEndReason;
  /**
   * The turn the match ended on.
   *
   * Contract: A positive integer.
   * When to use: The date line and the result line.
   * Expected outcome: The snapshot's `turnNumber`.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The date of that turn.
   *
   * Contract: The snapshot's `currentDateLabel`, or empty when it is missing.
   * When to use: The date line.
   * Expected outcome: A label such as "November 2nd, Year 1", or empty.
   * Exceptions: None.
   */
  readonly dateLabel: string;
  /**
   * Model option text keyed by model id.
   *
   * Contract: A missing id falls back to the id itself.
   * When to use: The commander summary.
   * Expected outcome: The text of the model the seat was given.
   * Exceptions: None.
   */
  readonly modelLabels: Readonly<Record<string, string>>;
}

/**
 * One standings row.
 *
 * Purpose: The panel paints this without rejoining names.
 * When to use: The result of `buildStandings`.
 * Expected outcome: Place order, with seat order breaking ties.
 * Exceptions: None.
 */
export interface StandingsRow {
  /**
   * Finishing place shown at the left of the row.
   *
   * Contract: The seat's place, or null when it was never placed.
   * When to use: The place numeral.
   * Expected outcome: Ties repeat the same place.
   * Exceptions: None.
   */
  readonly place: number | null;
  /**
   * Stored id of this side.
   *
   * Contract: A `SeatId`.
   * When to use: A caller that needs the roster row.
   * Expected outcome: The input seat's id.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * Full home name, with " (you)" on the viewer's row.
   *
   * Contract: `homeRegion`, plus " (you)" when this seat is `viewerSeatId`.
   * When to use: The name on the row.
   * Expected outcome: The words the player reads.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * Map color for the seat's dot.
   *
   * Contract: A CSS hex color from the seat palette.
   * When to use: The dot beside the name.
   * Expected outcome: Seat order picks the color. A missing palette is gray.
   * Exceptions: None.
   */
  readonly dotColor: string;
  /**
   * Winner, the knockout turn, or the city-hex count.
   *
   * Contract: "Winner", "Out, turn N", or a city-hex count.
   * When to use: The right side of the name line.
   * Expected outcome: Active seats at a turn limit, a mutual wipe, or an early end show city hexes.
   * Exceptions: None.
   */
  readonly status: string;
  /**
   * Commander summary, or null for the human seat.
   *
   * Contract: Null hides the commander. Otherwise `formatCommanderSummary`.
   * When to use: The line under the name.
   * Expected outcome: Model, effort when set, and doctrine, including a revealed random draw.
   * Exceptions: None.
   */
  readonly commanderSummary: string | null;
  /**
   * Consultation count, or null for the human seat.
   *
   * Contract: Null hides it. Otherwise "1 consultation" or "N consultations".
   * When to use: Beside the commander summary.
   * Expected outcome: The seat's `consultationCount`.
   * Exceptions: None.
   */
  readonly consultationsLabel: string | null;
  /**
   * This seat's model cost, or null for the human seat.
   *
   * Contract: Null hides it. Otherwise a dollar amount with two decimals.
   * When to use: The end of the commander line.
   * Expected outcome: `$1.92` style text.
   * Exceptions: None.
   */
  readonly costLabel: string | null;
  /**
   * Who knocked the seat out, or null.
   *
   * Contract: Null when `outBy` is null. "Knocked out by you" when `outBy` is the viewer.
   * When to use: The line under the commander.
   * Expected outcome: A full home name, or "you".
   * Exceptions: None.
   */
  readonly knockedOutBy: string | null;
}

/**
 * The standings block.
 *
 * Purpose: The header, the result section, and the total are one value.
 * When to use: Painting the game-over panel.
 * Expected outcome: Rows are in place order.
 * Exceptions: None.
 */
export interface Standings {
  /**
   * The header sentence.
   *
   * Contract: "You placed {ordinal} of {n}." when a human seat played and one side won. "{Winner} wins." when nobody played. "No side won." when first place is shared or empty.
   * When to use: `#game-over-message`.
   * Expected outcome: One sentence.
   * Exceptions: None.
   */
  readonly heading: string;
  /**
   * Turn and date beside the Result label.
   *
   * Contract: "Turn N · {date}" when a date is set. "Turn N" when it is not.
   * When to use: The right side of the Result label.
   * Expected outcome: The turn the match ended on.
   * Exceptions: None.
   */
  readonly dateLine: string;
  /**
   * The sentence under the Result label.
   *
   * Contract: Last side standing names the winner and the latest seat that winner knocked out. A turn limit or a mutual wipe names the winner's city hexes, or every side that shares first. Ending early says the human ended the match.
   * When to use: The result paragraph.
   * Expected outcome: One sentence, or empty when no first place is recorded.
   * Exceptions: None.
   */
  readonly resultLine: string;
  /**
   * One row per seat, best place first.
   *
   * Contract: Ties keep seat order.
   * When to use: The list under the result sentence.
   * Expected outcome: The same seats that were passed in.
   * Exceptions: None.
   */
  readonly rows: readonly StandingsRow[];
  /**
   * The label beside the match cost.
   *
   * Contract: "Model cost this match".
   * When to use: The left side of the total.
   * Expected outcome: That exact label.
   * Exceptions: None.
   */
  readonly totalLabel: string;
  /**
   * The sum of every seat's model cost.
   *
   * Contract: A dollar amount with two decimals.
   * When to use: The right side of the total.
   * Expected outcome: The sum of `costUsd`, including zeros.
   * Exceptions: None.
   */
  readonly totalCost: string;
}

const TOTAL_LABEL = 'Model cost this match';

/**
 * Builds the standings block for a finished match.
 *
 * Purpose: One function owns the heading, the result line, the row order, and the cost total.
 * When to use: When the game-over panel opens.
 * Expected outcome: Rows in place order. A shared first place is named in seat order.
 * Exceptions: None.
 */
export function buildStandings(input: StandingsInput): Standings {
  const first = input.seats.filter((seat) => seat.place === 1).sort((left, right) => left.seatOrder - right.seatOrder);
  const rows = [...input.seats]
    .sort((left, right) => (left.place ?? Number.MAX_SAFE_INTEGER) - (right.place ?? Number.MAX_SAFE_INTEGER) || left.seatOrder - right.seatOrder)
    .map((seat) => standingsRow(seat, input, first.length === 1));
  const total = input.seats.reduce((sum, seat) => sum + (Number.isFinite(seat.costUsd) ? seat.costUsd : 0), 0);
  return {
    heading: headingFor(input.seats, first),
    dateLine: input.dateLabel.trim() ? `Turn ${input.turnNumber} · ${input.dateLabel.trim()}` : `Turn ${input.turnNumber}`,
    resultLine: resultLine(input, first),
    rows,
    totalLabel: TOTAL_LABEL,
    totalCost: formatMatchCost(total),
  };
}

/**
 * The header sentence.
 *
 * Purpose: A shared or missing first place is not a win, and a watched match names the winner.
 * When to use: `buildStandings`.
 * Expected outcome: "No side won.", "{Winner} wins.", or "You placed {ordinal} of {n}."
 * Exceptions: None.
 */
function headingFor(seats: readonly StandingsSeatInput[], first: readonly StandingsSeatInput[]): string {
  if (first.length !== 1) return 'No side won.';
  const human = seats.find((seat) => seat.kind === HUMAN_SEAT_KIND);
  if (!human) return `${first[0]!.homeRegion} wins.`;
  return `You placed ${formatPlaceOrdinal(human.place ?? seats.length)} of ${seats.length}.`;
}

/**
 * The result sentence for the end reason.
 *
 * Purpose: A shared first place replaces the single-winner sentence on a turn limit and a mutual wipe.
 * When to use: `buildStandings`.
 * Expected outcome: One sentence, or empty when first place was not recorded.
 * Exceptions: None.
 */
function resultLine(input: StandingsInput, first: readonly StandingsSeatInput[]): string {
  const shared = input.gameEndReason === 'turn_limit' || input.gameEndReason === 'mutual_elimination';
  if (shared && first.length > 1) return shareSentence(first);
  if (input.gameEndReason === 'ended_by_human') return `You ended the match on turn ${input.turnNumber}.`;
  if (first.length !== 1) return '';
  const winner = first[0]!;
  if (input.gameEndReason === 'mutual_elimination') return `${winner.homeRegion} holds the most city hexes.`;
  if (input.gameEndReason === 'turn_limit') {
    return `${winner.homeRegion} holds the most city hexes at the end of turn ${input.turnNumber}.`;
  }
  return lastStandingLine(winner, input.seats);
}

/**
 * Last side standing, plus the latest seat that winner knocked out.
 *
 * Purpose: The engine does not store a city name for that knockout.
 * When to use: `resultLine` for `last_side_standing`.
 * Expected outcome: The second sentence is omitted when no seat names the winner.
 * Exceptions: None.
 */
function lastStandingLine(winner: StandingsSeatInput, seats: readonly StandingsSeatInput[]): string {
  const opening = `${winner.homeRegion} is the last side standing.`;
  const victims = seats
    .filter((seat) => seat.outBy === winner.seatId && seat.outTurn !== null)
    .sort((left, right) => (right.outTurn ?? 0) - (left.outTurn ?? 0) || left.seatOrder - right.seatOrder);
  const latest = victims[0];
  if (!latest || latest.outTurn === null) return opening;
  return `${opening} It knocked out ${latest.homeRegion} on turn ${latest.outTurn}.`;
}

/**
 * Names every seat that shares first, in seat order.
 *
 * Purpose: Two names use "and". Three or more use commas and a final "and".
 * When to use: A turn limit or a mutual wipe with more than one seat in first.
 * Expected outcome: "{A} and {B} share first place with {n} city hexes each." or the longer form.
 * Exceptions: None.
 */
function shareSentence(first: readonly StandingsSeatInput[]): string {
  const names = first.map((seat) => seat.homeRegion);
  const named = names.length === 2
    ? `${names[0]} and ${names[1]}`
    : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  return `${named} share first place with ${cityHexPhrase(first[0]?.cityHexes ?? 0)} each.`;
}

/**
 * One painted row.
 *
 * Purpose: Status, commander, and knockout credit stay beside the seat that owns them.
 * When to use: `buildStandings`.
 * Expected outcome: A human row has no commander, consultations, or cost.
 * Exceptions: None.
 */
function standingsRow(seat: StandingsSeatInput, input: StandingsInput, singleWinner: boolean): StandingsRow {
  const you = input.viewerSeatId !== null && seat.seatId === input.viewerSeatId;
  const ai = seat.commander !== null;
  return {
    place: seat.place,
    seatId: seat.seatId,
    name: you ? `${seat.homeRegion} (you)` : seat.homeRegion,
    dotColor: paletteForOwner(seat.seatId, input.seats)?.map ?? '#9CA3AF',
    status: statusFor(seat, input.gameEndReason, singleWinner),
    commanderSummary: ai ? commanderSummary(seat, input.modelLabels) : null,
    consultationsLabel: ai ? consultationPhrase(seat.consultationCount) : null,
    costLabel: ai ? formatMatchCost(seat.costUsd) : null,
    knockedOutBy: knockedOutBy(seat, input),
  };
}

/**
 * Winner, the knockout turn, or the city-hex count.
 *
 * Purpose: A seat that finished active at a limit, a mutual wipe, or an early end is not "Out".
 * When to use: `standingsRow`.
 * Expected outcome: "Winner" only for the sole survivor of last side standing.
 * Exceptions: None.
 */
function statusFor(seat: StandingsSeatInput, reason: GameEndReason, singleWinner: boolean): string {
  if (seat.outTurn !== null) return `Out, turn ${seat.outTurn}`;
  if (reason === 'last_side_standing' && singleWinner && seat.place === 1) return 'Winner';
  return cityHexPhrase(seat.cityHexes);
}

/**
 * The commander summary for an AI seat.
 *
 * Purpose: Standings use the same sentence as the commander card, including a revealed draw.
 * When to use: `standingsRow` when the seat has a commander.
 * Expected outcome: `formatCommanderSummary` for that seat's model label.
 * Exceptions: None.
 */
function commanderSummary(seat: StandingsSeatInput, modelLabels: Readonly<Record<string, string>>): string {
  const commander = seat.commander!;
  const modelLabel = commander.modelId ? (modelLabels[commander.modelId] ?? commander.modelId) : null;
  return formatCommanderSummary({
    modelLabel,
    reasoningEffort: commander.reasoningEffort,
    doctrineChoice: commander.doctrineChoice,
    revealedDoctrine: commander.revealedDoctrine,
  });
}

/**
 * "Knocked out by {Side}" or "Knocked out by you".
 *
 * Purpose: The viewer's own seat is "you".
 * When to use: `standingsRow` when `outBy` is set.
 * Expected outcome: Null when nobody is credited. "A side" when the credited seat is missing.
 * Exceptions: None.
 */
function knockedOutBy(seat: StandingsSeatInput, input: StandingsInput): string | null {
  if (seat.outBy === null) return null;
  if (input.viewerSeatId !== null && seat.outBy === input.viewerSeatId) return 'Knocked out by you';
  const name = input.seats.find((row) => row.seatId === seat.outBy)?.homeRegion;
  return `Knocked out by ${name ?? 'A side'}`;
}

/**
 * A city-hex count, with a singular for one.
 *
 * Purpose: Status and the shared-first sentence use the same words.
 * When to use: `statusFor` and `shareSentence`.
 * Expected outcome: "1 city hex" or "N city hexes".
 * Exceptions: None.
 */
function cityHexPhrase(count: number): string {
  return count === 1 ? '1 city hex' : `${count} city hexes`;
}

/**
 * A consultation count, with a singular for one.
 *
 * Purpose: The row reads as a sentence fragment beside the commander.
 * When to use: `standingsRow`.
 * Expected outcome: "1 consultation" or "N consultations".
 * Exceptions: None.
 */
function consultationPhrase(count: number): string {
  return count === 1 ? '1 consultation' : `${count} consultations`;
}

/**
 * A dollar amount with two decimals.
 *
 * Purpose: Row costs and the match total use one format.
 * When to use: `standingsRow` and the total.
 * Expected outcome: `$1.92`. A non-finite value is `$0.00`.
 * Exceptions: None.
 */
function formatMatchCost(dollars: number): string {
  const cents = Math.round((Number.isFinite(dollars) ? dollars : 0) * 100);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
