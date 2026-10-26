/**
 * Hex sentences for one turn report when more than one side can win or lose territory.
 *
 * Purpose: The toast and the Reports entry name who lost hexes, once per side.
 * When to use: After Ready, for the turn-report viewer, or with a null viewer while observing every side.
 * Expected outcome: Each owner that lost hexes gets one total. A null viewer writes no "You".
 * Exceptions: None.
 */

import { aiIndexForSeatId, isNeutralOwnerId } from './seatIds';
import { shortSideName } from './seatRoster';

/**
 * A side the report can name.
 *
 * Purpose: Short names and order come from the roster, not from seat ids.
 * When to use: `hexChangeLinesByOwner`.
 * Expected outcome: One row per seat.
 * Exceptions: None.
 */
export interface TurnReportSeat {
  /**
   * The seat id.
   *
   * Contract: A seat id.
   * When to use: Matching a transition or a loss to a name.
   * Expected outcome: The id stored on the roster.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Seat order, starting at 1.
   *
   * Contract: A positive integer.
   * When to use: Ordering names in a sentence.
   * Expected outcome: Lower numbers are named first.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * The full home name.
   *
   * Contract: The roster's `homeRegion`.
   * When to use: `shortSideName`.
   * Expected outcome: "Western Turkey" becomes "W. Turkey".
   * Exceptions: None.
   */
  readonly homeRegion: string;
}

/**
 * One hex whose controller changed.
 *
 * Purpose: Loss sentences count these.
 * When to use: `hexChangeLinesByOwner`.
 * Expected outcome: `from` or `to` null is unowned land and does not get a sentence.
 * Exceptions: None.
 */
export interface TurnReportTransition {
  /**
   * The hex that changed hands.
   *
   * Contract: An H3 index. The sentences count hexes and do not print this.
   * When to use: Grouping. The label is not required.
   * Expected outcome: One row per flip.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * The previous controller.
   *
   * Contract: A seat id, the neutral owner id, or null.
   * When to use: The owner who lost the hex.
   * Expected outcome: Null is skipped.
   * Exceptions: None.
   */
  readonly from: string | null;
  /**
   * The new controller.
   *
   * Contract: A seat id, the neutral owner id, or null.
   * When to use: The owner who received this hex.
   * Expected outcome: Null is skipped. Several flips can name that owner once in the loss sentence.
   * Exceptions: None.
   */
  readonly to: string | null;
}

/**
 * Facts for one turn's hex sentences.
 *
 * Purpose: The function does not read the match.
 * When to use: `hexChangeLinesByOwner`.
 * Expected outcome: One loss sentence for each owner that lost hexes.
 * Exceptions: None.
 */
export interface TurnReportInput {
  /**
   * The seat the "You" lines speak to.
   *
   * Contract: A seat id, or null while observing every side. While a human seat is playing, this is that seat.
   *   While observing, it is the View as seat, or null for All sides.
   * When to use: The subject "You" and the list word "you".
   * Expected outcome: Null writes every seat by name.
   * Exceptions: None.
   */
  readonly viewerSeatId: string | null;
  /**
   * Seats in the match, used for names and order.
   *
   * Contract: One row per seat.
   * When to use: Every name in a sentence.
   * Expected outcome: Short names. Neutral is the word "Neutral".
   * Exceptions: None.
   */
  readonly seats: readonly TurnReportSeat[];
  /**
   * Control changes this turn.
   *
   * Contract: Rows from Ready. A null side is unowned land.
   * When to use: The hex sentences.
   * Expected outcome: A flip with a null side, or the same side on both ends, is skipped. Every other flip counts for the owner who lost it.
   * Exceptions: None.
   */
  readonly transitions: readonly TurnReportTransition[];
}

/**
 * Writes one loss sentence per owner.
 *
 * Purpose: The side sections name territory once for the owner who lost it, instead of once per other owner.
 * When to use: `buildTurnLossSections`, after Ready has transitions and the viewer's seat.
 * Expected outcome: A map from owner id to that owner's loss sentence. An owner who only gained hexes is absent.
 *   The count is the total, and the other owners are named once.
 * Exceptions: None.
 */
export function hexChangeLinesByOwner(input: TurnReportInput): ReadonlyMap<string, readonly string[]> {
  const lostTo = new Map<string, Map<string, number>>();
  for (const row of input.transitions) {
    if (row.from === null || row.to === null || row.from === row.to) continue;
    addHexCount(lostTo, row.from, row.to);
  }
  const lines = new Map<string, readonly string[]>();
  for (const [ownerId, counterparts] of lostTo) {
    lines.set(ownerId, [hexSentence(ownerId, counterparts, input)]);
  }
  return lines;
}

/**
 * Adds one hex to an owner's count against another owner.
 *
 * Purpose: One tally holds every hex an owner lost, grouped by who received it.
 * When to use: Each counted transition, for the owner who lost the hex.
 * Expected outcome: `counts` holds one nested map per owner, and that owner's counterpart is one higher.
 * Exceptions: None.
 */
function addHexCount(counts: Map<string, Map<string, number>>, ownerId: string, counterpartId: string): void {
  const row = counts.get(ownerId) ?? new Map<string, number>();
  row.set(counterpartId, (row.get(counterpartId) ?? 0) + 1);
  counts.set(ownerId, row);
}

/**
 * The loss sentence for one owner.
 *
 * Purpose: "You lost 3 hexes to E. Turkey and W. Turkey." is the whole loss, not one line per capturer.
 * When to use: After the tallies are complete. The tally has at least one hex.
 * Expected outcome: The viewer's subject is "You" and their list word is "you", placed first. Other names are short
 *   names in `localeCompare('en')` order, then seat order. One hex uses "hex". Two names use "and". Three or more
 *   use commas and a final "and".
 * Exceptions: None.
 */
function hexSentence(
  ownerId: string,
  counterparts: ReadonlyMap<string, number>,
  input: TurnReportInput
): string {
  let total = 0;
  for (const count of counterparts.values()) total += count;
  const names = [...counterparts.keys()]
    .sort((left, right) => compareCounterparts(left, right, input))
    .map((counterpartId) => partyLabel(counterpartId, input, 'list'));
  const hexWord = total === 1 ? 'hex' : 'hexes';
  return `${partyLabel(ownerId, input, 'subject')} lost ${total} ${hexWord} to ${joinPartyNames(names)}.`;
}

/**
 * The short name of an owner.
 *
 * Purpose: Sentences use "E. Turkey" and "Neutral".
 * When to use: Every named side.
 * Expected outcome: Neutral is "Neutral". A known seat uses its short name, or its seat id when the home name is blank. An unknown id is printed as itself.
 * Exceptions: None.
 */
function ownerName(ownerId: string, seats: readonly TurnReportSeat[]): string {
  if (isNeutralOwnerId(ownerId)) return 'Neutral';
  const seat = seats.find((row) => row.seatId === ownerId);
  return seat ? hexLabelForSeat(seat) : ownerId;
}

/**
 * The name a hex sentence shows for one seat.
 *
 * Purpose: The sentence and the number-flag mark have to name the seat with the same characters.
 * When to use: `ownerName` and `hexNameForSeat`.
 * Expected outcome: The short home name, or the seat id when the trimmed home is empty.
 * Exceptions: None.
 */
function hexLabelForSeat(seat: { readonly seatId: string; readonly homeRegion: string }): string {
  return seat.homeRegion.trim().length > 0 ? shortSideName(seat.homeRegion) : seat.seatId;
}

/**
 * The name a sentence uses for one owner.
 *
 * Purpose: The viewer is addressed as "you". Every other owner uses the short name.
 * When to use: The subject of a sentence and each name in its list.
 * Expected outcome: "You" at the start of the viewer's own sentence, and "you" when the viewer is in someone else's list.
 *   Neutral is "Neutral". A null viewer names every seat.
 * Exceptions: None.
 */
function partyLabel(ownerId: string, input: TurnReportInput, place: 'subject' | 'list'): string {
  if (input.viewerSeatId !== null && ownerId === input.viewerSeatId) return place === 'subject' ? 'You' : 'you';
  return ownerName(ownerId, input.seats);
}

/**
 * Orders the other owners in one sentence.
 *
 * Purpose: The viewer is named first. The rest follow the displayed short name.
 * When to use: Before joining the names in `hexSentence`.
 * Expected outcome: A negative number when `left` is named first. Equal names use seat order, then the owner id.
 * Exceptions: None.
 */
function compareCounterparts(left: string, right: string, input: TurnReportInput): number {
  const leftViewer = input.viewerSeatId !== null && left === input.viewerSeatId;
  const rightViewer = input.viewerSeatId !== null && right === input.viewerSeatId;
  if (leftViewer !== rightViewer) return leftViewer ? -1 : 1;
  const byName = ownerName(left, input.seats).localeCompare(ownerName(right, input.seats), 'en');
  if (byName !== 0) return byName;
  const leftOrder = input.seats.find((row) => row.seatId === left)?.seatOrder ?? 9_000;
  const rightOrder = input.seats.find((row) => row.seatId === right)?.seatOrder ?? 9_000;
  return leftOrder - rightOrder || left.localeCompare(right, 'en');
}

/**
 * Joins the other owners the way a short English list does.
 *
 * Purpose: One sentence stays readable when several sides are involved.
 * When to use: The end of a hex sentence.
 * Expected outcome: One name alone. Two names with "and". Three or more with commas and a final "and".
 *   `splitJoinedNames` reads this exact shape back when placing flags, so a change here has to change that split too.
 * Exceptions: None. An empty list returns an empty string, which the caller does not ask for.
 */
function joinPartyNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * One opponent name inside a toast line.
 *
 * Purpose: The painter inserts a numbered flag immediately before that name.
 * When to use: Output of `sideNameMarksForLine`.
 * Expected outcome: `start` is inclusive and `end` is exclusive, both in the line that was passed.
 * Exceptions: None.
 */
export interface SideNameMark {
  /**
   * The AI seat whose name was found.
   *
   * Contract: `aiIndexForSeatId` of this id is 1 through 4.
   * When to use: Choosing the flag color and the digit.
   * Expected outcome: An AI seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Index of the first character of the name.
   *
   * Contract: `0 <= start < end <= line.length`.
   * When to use: Slicing the line.
   * Expected outcome: The name begins here.
   * Exceptions: None.
   */
  readonly start: number;
  /**
   * Index just after the name.
   *
   * Contract: Greater than `start`.
   * When to use: Slicing the line.
   * Expected outcome: The name ends here.
   * Exceptions: None.
   */
  readonly end: number;
}

/**
 * A seat a toast line can name.
 *
 * Purpose: Hex sentences use the short name. Loss headers use the full home name.
 * When to use: `sideNameMarksForLine`.
 * Expected outcome: One row per seat.
 * Exceptions: None.
 */
export interface SideNameMarkSeat {
  /**
   * Seat id.
   *
   * Contract: An AI seat id can receive a mark. The human seat cannot.
   * When to use: Matching a blank home name, and the mark's `seatId`.
   * Expected outcome: The roster id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Seat order.
   *
   * Contract: Lower numbers win when two seats display the same name.
   * When to use: Sorting candidates.
   * Expected outcome: The seat's `seatOrder`.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * Full home name.
   *
   * Contract: Blank or whitespace means the seat id is the displayed name.
   * When to use: `shortSideName` for hex sentences, and the full name for loss headers.
   * Expected outcome: The name the roster stores.
   * Exceptions: None.
   */
  readonly homeRegion: string;
}

/**
 * The name an AI seat shows in a hex sentence.
 *
 * Purpose: Hex sentences use the short name, and a blank home uses the seat id.
 * When to use: Matching a short name in a hex sentence.
 * Expected outcome: Null when the seat is not an AI seat.
 * Exceptions: None.
 */
function hexNameForSeat(seat: SideNameMarkSeat): string | null {
  if (aiIndexForSeatId(seat.seatId) == null) return null;
  return hexLabelForSeat(seat);
}

/**
 * The name an AI seat shows in a loss header.
 *
 * Purpose: Headers use the full home name, and a blank home uses the seat id.
 * When to use: Matching `{name} Losses`.
 * Expected outcome: Null when the seat is not an AI seat.
 * Exceptions: None.
 */
function headerNameForSeat(seat: SideNameMarkSeat): string | null {
  if (aiIndexForSeatId(seat.seatId) == null) return null;
  const home = seat.homeRegion.trim();
  return home.length > 0 ? home : seat.seatId;
}

/**
 * The AI seat with the lowest seat order whose displayed name equals `name`.
 *
 * Purpose: Two homes can shorten to the same text.
 * When to use: After a sentence or header has been recognized.
 * Expected outcome: The seat, or null when no AI seat shows that name.
 * Exceptions: None.
 */
function seatForDisplayedName(
  seats: readonly SideNameMarkSeat[],
  name: string,
  nameOf: (seat: SideNameMarkSeat) => string | null
): SideNameMarkSeat | null {
  const matches = seats
    .filter((seat) => nameOf(seat) === name)
    .sort((left, right) => left.seatOrder - right.seatOrder);
  return matches[0] ?? null;
}

/**
 * Marks for the opponent names in one toast line.
 *
 * Purpose: A hex sentence can name several opponents. A loss header names one.
 * When to use: `sideNameMarksForLine` after prefixes are stripped.
 * Expected outcome: Indexes into `body`. `You`, `you`, and Neutral are unmarked. Any other line returns none.
 * Exceptions: None.
 */
function markInBody(body: string, seats: readonly SideNameMarkSeat[], sectionOwnerId: string | null): SideNameMark[] {
  const hexMarks = hexSentenceMarks(body, seats, sectionOwnerId);
  if (hexMarks !== null) return hexMarks;
  if (body === 'Your Losses' || body === 'Neutral Losses' || !body.endsWith(' Losses')) return [];
  const name = body.slice(0, -' Losses'.length);
  const seat = seatForDisplayedName(seats, name, headerNameForSeat);
  if (!seat) return [];
  return [{ seatId: seat.seatId, start: 0, end: name.length }];
}

/**
 * Marks every opponent name in a hex sentence.
 *
 * Purpose: The flag belongs on each opponent, including the subject of that side's own sentence.
 *   The popup writes loss sentences only. A gain sentence still gets flags when one is painted.
 * When to use: `markInBody` before the loss-header check.
 * Expected outcome: Null when `body` is not a hex sentence. Otherwise one mark per opponent name, in sentence order.
 *   The subject uses `sectionOwnerId` when two seats share that short name. List names then take the remaining seats
 *   in the order the sentence already listed them. The list is the text before the final period, so a short name that
 *   contains "to" or "from" is still the name that gets the flag.
 * Exceptions: None.
 */
function hexSentenceMarks(
  body: string,
  seats: readonly SideNameMarkSeat[],
  sectionOwnerId: string | null
): SideNameMark[] | null {
  const loss = /^(.+) lost (\d+) hex(?:es)? to (.+)\.$/.exec(body);
  const gain = loss ? null : /^(.+) took (\d+) hex(?:es)? from (.+)\.$/.exec(body);
  const match = loss ?? gain;
  if (!match) return null;
  const subject = match[1] ?? '';
  const verb = loss ? 'lost' : 'took';
  if (!body.startsWith(`${subject} ${verb} `)) return null;
  const marks: SideNameMark[] = [];
  const used = new Set<string>();
  const subjectSeat = seatForHexName(subject, seats, used, sectionOwnerId);
  if (subjectSeat) {
    used.add(subjectSeat.seatId);
    marks.push({ seatId: subjectSeat.seatId, start: 0, end: subject.length });
  }
  const list = match[3] ?? '';
  if (!body.endsWith(`${list}.`)) return marks;
  let cursor = body.length - (list.length + 1);
  for (const name of splitJoinedNames(list)) {
    if (!body.startsWith(name, cursor)) return marks;
    const seat = seatForHexName(name, seats, used, null);
    if (seat) {
      used.add(seat.seatId);
      marks.push({ seatId: seat.seatId, start: cursor, end: cursor + name.length });
    }
    cursor += name.length;
    if (body.startsWith(', and ', cursor)) cursor += ', and '.length;
    else if (body.startsWith(', ', cursor)) cursor += 2;
    else if (body.startsWith(' and ', cursor)) cursor += ' and '.length;
  }
  return marks;
}

/**
 * Splits the other-owner list a hex sentence already joined.
 *
 * Purpose: Flag indexes have to land on each name the sentence wrote.
 * When to use: `hexSentenceMarks`.
 * Expected outcome: The names in list order. Two names were joined with "and". Three or more use a final "and".
 * Exceptions: None.
 */
function splitJoinedNames(list: string): string[] {
  if (!list.includes(', ')) {
    const andAt = list.indexOf(' and ');
    if (andAt < 0) return [list];
    return [list.slice(0, andAt), list.slice(andAt + ' and '.length)];
  }
  const parts = list.split(', ');
  const last = parts[parts.length - 1] ?? '';
  if (last.startsWith('and ')) parts[parts.length - 1] = last.slice('and '.length);
  return parts;
}

/**
 * The AI seat a hex-sentence name belongs to.
 *
 * Purpose: "You", "you", and Neutral take no flag. Two seats can shorten to the same text.
 * When to use: The subject and each list name.
 * Expected outcome: Null for the viewer words and Neutral. The preferred seat when it is one of the unused matches.
 *   Otherwise the unused match with the lowest seat order.
 * Exceptions: None.
 */
function seatForHexName(
  name: string,
  seats: readonly SideNameMarkSeat[],
  used: ReadonlySet<string>,
  preferredId: string | null
): SideNameMarkSeat | null {
  if (name === 'You' || name === 'you' || name === 'Neutral') return null;
  const matches = seats
    .filter((seat) => !used.has(seat.seatId) && hexNameForSeat(seat) === name)
    .sort((left, right) => left.seatOrder - right.seatOrder);
  if (preferredId) {
    const preferred = matches.find((seat) => seat.seatId === preferredId);
    if (preferred) return preferred;
  }
  return matches[0] ?? null;
}

/**
 * Finds the opponent names in a toast line.
 *
 * Purpose: Message tabs and Reports paint their own flags. This covers loss headers and hex sentences.
 * When to use: For each raw updates-toast line, and for a line that already has a bullet or `## ` prefix.
 * Expected outcome: One mark per opponent name. A leading `• ` or `## ` is not part of the name, and the indexes include it.
 *   `Your Losses`, `Neutral Losses`, `You`, `you`, Neutral, and every other line return none.
 *   Pass the section owner when the line is a bullet under a loss header, so a shared short name flags that owner as the subject.
 * Exceptions: None.
 */
export function sideNameMarksForLine(
  line: string,
  seats: readonly SideNameMarkSeat[],
  sectionOwnerId: string | null = null
): readonly SideNameMark[] {
  let offset = 0;
  let body = line;
  if (body.startsWith('\u2022 ')) {
    offset += 2;
    body = body.slice(2);
  }
  if (body.startsWith('## ')) {
    offset += 3;
    body = body.slice(3);
  }
  return markInBody(body, seats, sectionOwnerId).map((mark) => ({
    seatId: mark.seatId,
    start: mark.start + offset,
    end: mark.end + offset,
  }));
}
