/**
 * Sentences for one turn report when more than one side can win or lose.
 *
 * Purpose: The toast and the Reports entry name who took hexes and who lost units.
 * When to use: After Ready, for the active human seat, or with a null viewer while observing.
 * Expected outcome: "You" lines for the viewer, then "Seen:" lines for other fights, then the other update lines.
 * Exceptions: None.
 */

import { isNeutralOwnerId } from './seatIds';
import { shortSideName } from './seatRoster';

/**
 * A side the report can name.
 *
 * Purpose: Short names and order come from the roster, not from seat ids.
 * When to use: `buildTurnReportLines`.
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
 * One unit lost in a fight the report may mention.
 *
 * Purpose: The sentence groups units by who lost them, who killed them, and where.
 * When to use: `buildTurnReportLines`.
 * Expected outcome: One row per removed unit the viewer is allowed to see.
 * Exceptions: None.
 */
export interface TurnReportLoss {
  /**
   * The owner of the lost unit.
   *
   * Contract: A seat id or the neutral owner id.
   * When to use: "You lost" when this is the viewer.
   * Expected outcome: The victim's owner.
   * Exceptions: None.
   */
  readonly victimOwnerId: string;
  /**
   * The owner of the unit that destroyed it.
   *
   * Contract: A seat id, the neutral owner id, or null when no killer is known.
   * When to use: "to {Side}" and "You destroyed".
   * Expected outcome: Null omits the "to" name.
   * Exceptions: None.
   */
  readonly killerOwnerId: string | null;
  /**
   * The hex as the player should read it, without parentheses.
   *
   * Contract: A label such as "H7".
   * When to use: The "(H7)" in a loss sentence.
   * Expected outcome: Wrapped in parentheses by the sentence.
   * Exceptions: None.
   */
  readonly hexLabel: string;
  /**
   * The lost unit's type.
   *
   * Contract: One of the four build types.
   * When to use: The count-and-type list.
   * Expected outcome: Infantry reads "1 infantry". Armor reads "1 armored unit".
   * Exceptions: None.
   */
  readonly unitType: 'infantry' | 'armor' | 'naval' | 'air';
}

/**
 * One hex whose controller changed.
 *
 * Purpose: "You took" and "{Side} took" count these.
 * When to use: `buildTurnReportLines`.
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
   * When to use: Who the viewer took the hex from.
   * Expected outcome: Null is skipped.
   * Exceptions: None.
   */
  readonly from: string | null;
  /**
   * The new controller.
   *
   * Contract: A seat id, the neutral owner id, or null.
   * When to use: Who took the viewer's hex.
   * Expected outcome: Null is skipped.
   * Exceptions: None.
   */
  readonly to: string | null;
}

/**
 * Facts for one turn report.
 *
 * Purpose: The function does not read the match.
 * When to use: `buildTurnReportLines`.
 * Expected outcome: A null viewer writes only "Seen:" lines.
 * Exceptions: None.
 */
export interface TurnReportInput {
  /**
   * The seat the "You" lines speak to.
   *
   * Contract: A seat id, or null while observing every side.
   * When to use: Choosing "You" lines versus "Seen:" lines.
   * Expected outcome: Null omits every "You" line.
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
   * Expected outcome: Only flips between the viewer and another owner are sentences.
   * Exceptions: None.
   */
  readonly transitions: readonly TurnReportTransition[];
  /**
   * Visible unit losses.
   *
   * Contract: One row per unit.
   * When to use: The loss sentences and "Seen:" fights.
   * Expected outcome: A fight that includes the viewer is "You" lines. Any other fight is "Seen:".
   * Exceptions: None.
   */
  readonly losses: readonly TurnReportLoss[];
  /**
   * Deployment, cap, and other update lines already written.
   *
   * Contract: Plain sentences, in the order they should appear.
   * When to use: After the fight sentences.
   * Expected outcome: Appended unchanged.
   * Exceptions: None.
   */
  readonly otherLines: readonly string[];
}

const TYPE_ORDER = ['infantry', 'armor', 'naval', 'air'] as const;

/**
 * Writes the turn-report sentences.
 *
 * Purpose: One wording for the toast and the Reports entry.
 * When to use: After Ready has transitions, losses, and the viewer's seat.
 * Expected outcome: Hex sentences, then the viewer's losses and destructions, then other fights, then `otherLines`.
 * Exceptions: None.
 */
export function buildTurnReportLines(input: TurnReportInput): string[] {
  const lines = [
    ...hexLines(input),
    ...viewerLossLines(input),
    ...seenLines(input),
    ...input.otherLines,
  ];
  return lines;
}

/**
 * The short name of an owner.
 *
 * Purpose: Sentences use "E. Turkey" and "Neutral".
 * When to use: Every named side.
 * Expected outcome: Neutral is "Neutral". A known seat uses `shortSideName`. An unknown id is printed as itself.
 * Exceptions: None.
 */
function ownerName(ownerId: string, seats: readonly TurnReportSeat[]): string {
  if (isNeutralOwnerId(ownerId)) return 'Neutral';
  const seat = seats.find((row) => row.seatId === ownerId);
  return seat ? shortSideName(seat.homeRegion) : ownerId;
}

/**
 * Compares two owners by seat order. Neutral is last.
 *
 * Purpose: Names in one sentence follow the roster.
 * When to use: Sorting groups and fight parties.
 * Expected outcome: A negative number when `left` is named first.
 * Exceptions: None.
 */
function compareOwners(left: string, right: string, seats: readonly TurnReportSeat[]): number {
  const rank = (ownerId: string): number => {
    if (isNeutralOwnerId(ownerId)) return 10_000;
    return seats.find((row) => row.seatId === ownerId)?.seatOrder ?? 9_000;
  };
  return rank(left) - rank(right) || left.localeCompare(right);
}

/**
 * Joins names as "A and B" or "A, B, and C".
 *
 * Purpose: Fight sentences name every party once.
 * When to use: A "Seen:" line.
 * Expected outcome: Two names use "and". Three or more use commas and a final "and".
 * Exceptions: None.
 */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * A count-and-type list such as "1 infantry" or "1 armored unit".
 *
 * Purpose: Loss sentences name types, not unit ids.
 * When to use: Grouped losses.
 * Expected outcome: Infantry has no "unit". The other types do. Parts are joined with "and".
 * Exceptions: None.
 */
function typeList(types: readonly TurnReportLoss['unitType'][]): string {
  const counts = new Map<TurnReportLoss['unitType'], number>();
  for (const unitType of types) counts.set(unitType, (counts.get(unitType) ?? 0) + 1);
  const parts: string[] = [];
  for (const unitType of TYPE_ORDER) {
    const count = counts.get(unitType) ?? 0;
    if (count === 0) continue;
    parts.push(typePhrase(unitType, count));
  }
  return joinNames(parts);
}

/**
 * One type's phrase.
 *
 * Purpose: The image's "1 infantry" and "1 armored unit" stay distinct.
 * When to use: `typeList`.
 * Expected outcome: The singular or plural phrase.
 * Exceptions: None.
 */
function typePhrase(unitType: TurnReportLoss['unitType'], count: number): string {
  if (unitType === 'infantry') return `${count} infantry`;
  if (unitType === 'armor') return count === 1 ? '1 armored unit' : `${count} armored units`;
  if (unitType === 'naval') return count === 1 ? '1 naval unit' : `${count} naval units`;
  return count === 1 ? '1 air unit' : `${count} air units`;
}

/**
 * Hex sentences for the viewer.
 *
 * Purpose: "You took" and "{Side} took" replace a single hex-lost count.
 * When to use: First lines of the report.
 * Expected outcome: One line per other owner. A null controller is skipped. A null viewer writes nothing.
 * Exceptions: None.
 */
function hexLines(input: TurnReportInput): string[] {
  const viewer = input.viewerSeatId;
  if (viewer === null) return [];
  const taken = new Map<string, number>();
  const lost = new Map<string, number>();
  for (const row of input.transitions) {
    if (row.to === viewer && row.from !== null && row.from !== viewer) taken.set(row.from, (taken.get(row.from) ?? 0) + 1);
    if (row.from === viewer && row.to !== null && row.to !== viewer) lost.set(row.to, (lost.get(row.to) ?? 0) + 1);
  }
  const lines: string[] = [];
  for (const ownerId of [...taken.keys()].sort((left, right) => compareOwners(left, right, input.seats))) {
    const count = taken.get(ownerId) ?? 0;
    const hexWord = count === 1 ? 'hex' : 'hexes';
    lines.push(`You took ${count} ${hexWord} from ${ownerName(ownerId, input.seats)}.`);
  }
  for (const ownerId of [...lost.keys()].sort((left, right) => compareOwners(left, right, input.seats))) {
    const count = lost.get(ownerId) ?? 0;
    lines.push(`${ownerName(ownerId, input.seats)} took ${count} of your hexes.`);
  }
  return lines;
}

/**
 * The viewer's own losses and the units the viewer destroyed.
 *
 * Purpose: Those fights are "You" lines, not "Seen:" lines.
 * When to use: After the hex sentences.
 * Expected outcome: One line per killer or victim, per hex. A null viewer writes nothing.
 * Exceptions: None.
 */
function viewerLossLines(input: TurnReportInput): string[] {
  const viewer = input.viewerSeatId;
  if (viewer === null) return [];
  const lines: string[] = [];
  const lostGroups = groupLosses(input.losses.filter((row) => row.victimOwnerId === viewer), (row) => `${row.killerOwnerId ?? ''}|${row.hexLabel}`);
  for (const group of sortGroups(lostGroups, input.seats, (row) => row.killerOwnerId ?? '')) {
    const killer = group[0]?.killerOwnerId;
    const hex = group[0]?.hexLabel ?? '';
    const toSide = killer && killer !== viewer ? ` to ${ownerName(killer, input.seats)}` : '';
    lines.push(`You lost ${typeList(group.map((row) => row.unitType))}${toSide} at (${hex}).`);
  }
  const destroyed = groupLosses(
    input.losses.filter((row) => row.killerOwnerId === viewer && row.victimOwnerId !== viewer),
    (row) => `${row.victimOwnerId}|${row.hexLabel}`
  );
  for (const group of sortGroups(destroyed, input.seats, (row) => row.victimOwnerId)) {
    const victim = group[0]?.victimOwnerId ?? '';
    const hex = group[0]?.hexLabel ?? '';
    lines.push(`You destroyed ${typeList(group.map((row) => row.unitType))} of ${ownerName(victim, input.seats)} at (${hex}).`);
  }
  return lines;
}

/**
 * Fights that did not include the viewer.
 *
 * Purpose: The player can still read a battle between other sides.
 * When to use: After the "You" lines. A null viewer uses this for every fight.
 * Expected outcome: One "Seen:" line per hex with two or more parties. Equal losses say "Each lost".
 * Exceptions: None.
 */
function seenLines(input: TurnReportInput): string[] {
  const byHex = groupLosses(input.losses, (row) => row.hexLabel);
  const lines: string[] = [];
  for (const hex of [...byHex.keys()].sort((left, right) => left.localeCompare(right))) {
    const rows = byHex.get(hex) ?? [];
    const parties = fightParties(rows);
    if (input.viewerSeatId !== null && parties.includes(input.viewerSeatId)) continue;
    if (parties.length < 2) continue;
    const ordered = [...parties].sort((left, right) => compareOwners(left, right, input.seats));
    const names = ordered.map((ownerId) => ownerName(ownerId, input.seats));
    const lists = ordered.map((ownerId) => typeList(rows.filter((row) => row.victimOwnerId === ownerId).map((row) => row.unitType)));
    const fought = `Seen: ${joinNames(names)} fought at (${hex}).`;
    if (ordered.length === 2 && lists[0] && lists[0] === lists[1]) {
      lines.push(`${fought} Each lost ${lists[0]}.`);
      continue;
    }
    const clauses = ordered.flatMap((ownerId, index) => {
      const list = lists[index];
      if (!list) return [];
      return [`${ownerName(ownerId, input.seats)} lost ${list}`];
    });
    lines.push(clauses.length > 0 ? `${fought} ${clauses.join('; ')}.` : fought);
  }
  return lines;
}

/**
 * Owners who lost a unit or destroyed one at these rows.
 *
 * Purpose: A fight's parties are both sides, including a killer who lost nothing.
 * When to use: `seenLines`.
 * Expected outcome: Unique owner ids. Null killers are omitted.
 * Exceptions: None.
 */
function fightParties(rows: readonly TurnReportLoss[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.victimOwnerId);
    if (row.killerOwnerId) ids.add(row.killerOwnerId);
  }
  return [...ids];
}

/**
 * Groups rows by a key, keeping input order within a group.
 *
 * Purpose: One sentence covers every unit that shares a killer and a hex.
 * When to use: Loss lines and seen lines.
 * Expected outcome: A map whose arrays are non-empty.
 * Exceptions: None.
 */
function groupLosses(rows: readonly TurnReportLoss[], keyOf: (row: TurnReportLoss) => string): Map<string, TurnReportLoss[]> {
  const groups = new Map<string, TurnReportLoss[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/**
 * Orders groups by an owner, then by hex label.
 *
 * Purpose: Seat order decides which sentence comes first.
 * When to use: "You lost" and "You destroyed".
 * Expected outcome: The groups in that order.
 * Exceptions: None.
 */
function sortGroups(
  groups: Map<string, TurnReportLoss[]>,
  seats: readonly TurnReportSeat[],
  ownerOf: (row: TurnReportLoss) => string
): TurnReportLoss[][] {
  return [...groups.values()].sort((left, right) => {
    const owner = compareOwners(ownerOf(left[0]!), ownerOf(right[0]!), seats);
    if (owner !== 0) return owner;
    return (left[0]?.hexLabel ?? '').localeCompare(right[0]?.hexLabel ?? '');
  });
}
