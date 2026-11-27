/**
 * Attributed loss lines for one turn block of the Recent Turn Notes prompt section.
 */

import {
  formatGroupedTypeTotals,
  formatLossEntriesForPrompt,
  LOSS_CAUSE_KEYS,
  LOSS_CAUSE_LABELS,
  type LostUnit,
  type PlayerLossSummary,
} from '../../shared/lossSummary';
import type { LossKillerUnit } from '../../shared/lossAttributionTypes';
import { isSeatId, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import { sideHomeNameKey } from '../../shared/shortSideName';
import { playerIdCodeFor } from '../../shared/unitIds';
import { logDebug } from '../logger';

/**
 * Most loss groups an older turn block lists.
 *
 * Purpose: Ten turns of history must not grow without bound when a war is large.
 * When to use: The `maxGroupLines` of every turn block except the newest.
 * Expected outcome: 12. The newest turn block passes null and lists every group.
 * Exceptions: None.
 */
export const RECENT_TURN_LOSS_GROUP_LINES_MAX = 12;

/**
 * Sentence that explains the loss lines to the model.
 *
 * Purpose: A loss line is a record kept by the game, so the model must not weigh it like a message from another side. Naming where the side codes come from, and printing each side's home region after its code, lets the model tell who attacked it before it writes to that side.
 * When to use: Printed once under the Recent Turn Notes heading when any block has a loss line.
 * Expected outcome: Names what `by`, `you`, `Neutral`, the side codes, `no side responsible`, `by unknown side`, and the closing counts mean. The last two sentences say that a Return fire line is not an attack by the side named, and that a Melee attack line means both sides were in the same place.
 * Exceptions: None.
 */
export const RECENT_TURN_LOSS_LEGEND =
  'Loss lines are game records, not claims by any side. "by" names the side whose units or actions destroyed the units listed, and the closing "(by ...)" counts the units that fought them. "you" is your own side, "Neutral" is the Neutral side, and every other side is named by its code, which is the Code column of the Sides table and the prefix of its unit ids, followed by its home region in parentheses. "no side responsible" means no other side caused the loss. "by unknown side" means the game could not tell, or the loss was recorded before the game kept that detail. A "Return fire" line means the destroyed units attacked first and were hit by the answering fire, so it is not an attack by the side named. In a battle, that includes an air drop that anti-air shoots down. A "Melee attack" line means units of both sides were in the same hex or cell, where they fight every turn or beat whichever side moved there.';

/**
 * Cause label of a unit a tactical battle destroyed.
 *
 * Purpose: A battle loss has no ranged, melee, or air cause, so it prints under its own word.
 * When to use: `lineFor`, for a group whose cause index is past the six standard causes.
 * Expected outcome: `Battle`.
 * Exceptions: None.
 */
export const BATTLE_LOSS_CAUSE_LABEL = 'Battle';

/**
 * Sentence that explains a Battle line to the model.
 *
 * Purpose: The legend says a closing `(by ...)` counts the units that fought, and a Battle line has none.
 * When to use: Appended to `RECENT_TURN_LOSS_LEGEND` when any printed block has a Battle line.
 * Expected outcome: Says what a Battle line lists, who it is credited to, how a battle starts, and that the line does not say which side fired first.
 * Exceptions: None.
 */
export const BATTLE_LOSS_LEGEND_SENTENCE =
  'A "Battle" line lists units destroyed in a tactical battle fought that turn, credited to the other side in that battle. It has no closing count. A battle starts on its own when units of two sides are in the same hex, and the line does not say which side fired first.';

/**
 * Owner key for a loss with no known owner.
 *
 * Purpose: An older row in the other-sides column has no attribution, so its owner is not known.
 * When to use: As the victim owner of such a unit.
 * Expected outcome: A string that no real owner id can equal.
 * Exceptions: None.
 */
const UNKNOWN_OWNER_KEY = '\u0000unknown';

/**
 * How a loss group names who was responsible.
 *
 * Purpose: Groups sort side groups first, then no side, then unknown.
 * When to use: `ResponsibleKey.kind`.
 * Expected outcome: One of three words.
 * Exceptions: None.
 */
type ResponsibleKind = 'sides' | 'none' | 'unknown';

/**
 * The responsibility of one unit, reduced to what a group key needs.
 *
 * Purpose: Units with the same responsibility share a loss line.
 * When to use: `responsibleKeyOf`.
 * Expected outcome: `sides` holds owner ids in rank order, and is empty for `none` and `unknown`.
 * Exceptions: None.
 */
interface ResponsibleKey {
  /**
   * Kind of responsibility.
   *
   * Contract: `sides` when the list is non-empty, `none` for an empty list, `unknown` when the game could not tell.
   * When to use: Choosing the `by ...` text and the sort order.
   * Expected outcome: One of the three kinds.
   * Exceptions: None.
   */
  readonly kind: ResponsibleKind;
  /**
   * Responsible owner ids, de-duplicated and sorted by rank.
   *
   * Contract: Empty unless `kind` is `sides`.
   * When to use: Naming the sides in the line.
   * Expected outcome: At least one id when `kind` is `sides`.
   * Exceptions: None.
   */
  readonly sides: readonly string[];
}

/**
 * One loss line before it is written.
 *
 * Purpose: Sorting, capping, and writing all work on the same group record.
 * When to use: `groupLosses`.
 * Expected outcome: The victims, the killers, and the keys that decide order.
 * Exceptions: None.
 */
interface LossGroup {
  /**
   * Owner of the victims, or the unknown owner key.
   *
   * Contract: Every unit in the group has this owner.
   * When to use: Choosing the section.
   * Expected outcome: The reading seat, another owner, or `UNKNOWN_OWNER_KEY`.
   * Exceptions: None.
   */
  readonly victimOwner: string;
  /**
   * Responsibility shared by every unit in the group.
   *
   * Contract: Equal for every unit.
   * When to use: The `by ...` text.
   * Expected outcome: A `ResponsibleKey`.
   * Exceptions: None.
   */
  readonly responsible: ResponsibleKey;
  /**
   * Index into `LOSS_CAUSE_KEYS` and `LOSS_CAUSE_LABELS`, or `LOSS_CAUSE_KEYS.length` for a battle loss.
   *
   * Contract: A valid index, or the one past the last for a battle loss.
   * When to use: The cause label and the sort order.
   * Expected outcome: Zero for ranged, up to five for other, six for a battle loss, which sorts last.
   * Exceptions: None.
   */
  readonly causeIndex: number;
  /**
   * Printed hex code, or an empty string.
   *
   * Contract: Equal for every unit.
   * When to use: The `at ...` text.
   * Expected outcome: Empty when the hex was not recorded or has no code.
   * Exceptions: None.
   */
  readonly hexCode: string;
  /**
   * Victims in bucket order.
   *
   * Contract: Non-empty.
   * When to use: The victim list of the line.
   * Expected outcome: Printed by id, or as type counts.
   * Exceptions: None.
   */
  readonly units: LostUnit[];
}

/**
 * Input for `buildRecentTurnLossLines`.
 *
 * Purpose: One object keeps the formatter under the argument limit.
 * When to use: Once per turn block.
 * Expected outcome: Both summaries are parsed stored losses for the same turn.
 * Exceptions: None.
 */
export interface RecentTurnLossLinesInput {
  /**
   * Seat of the commander reading the notes.
   *
   * Contract: An AI seat id.
   * When to use: Naming that seat `you` and printing its own losses first.
   * Expected outcome: Matches the seat whose `own_loss_json` is `ownLosses`.
   * Exceptions: None.
   */
  readonly ownSeatId: string;
  /**
   * Home region of each seat, for naming a responsible side.
   *
   * Contract: Seat id to the full home display name. Optional.
   * When to use: `responsibleSideName`, so a `by` names the side's code and its home region.
   * Expected outcome: When absent, or when a seat has no entry, the line prints the bare code as before.
   * Exceptions: None.
   */
  readonly homeRegionBySeatId?: ReadonlyMap<string, string>;
  /**
   * Parsed losses of the reading seat.
   *
   * Contract: Every unit belongs to `ownSeatId`.
   * When to use: The `Your Losses` section.
   * Expected outcome: Empty buckets when the seat lost nothing.
   * Exceptions: None.
   */
  readonly ownLosses: PlayerLossSummary;
  /**
   * Parsed losses of every other owner, merged.
   *
   * Contract: Each unit carries its owner in its attribution when the row is new.
   * When to use: The `Losses of ...` sections.
   * Expected outcome: Empty buckets when no one else lost anything.
   * Exceptions: None.
   */
  readonly otherLosses: PlayerLossSummary;
  /**
   * Every roster seat id, in seat order.
   *
   * Contract: Includes the reading seat.
   * When to use: Ranking sides for sort order.
   * Expected outcome: A seat missing from it ranks after the listed seats and before Neutral.
   * Exceptions: None.
   */
  readonly seatOrder: readonly string[];
  /**
   * Turns an H3 index into the prompt's hex code.
   *
   * Contract: Returns undefined when the cell has no code.
   * When to use: Printing `at XX` on a line.
   * Expected outcome: The same code the map section prints.
   * Exceptions: None.
   */
  readonly hexCodeFor: (h3Index: string) => string | undefined;
  /**
   * Most groups to list, or null for every group.
   *
   * Contract: A positive integer, or null.
   * When to use: Null for the newest turn, `RECENT_TURN_LOSS_GROUP_LINES_MAX` for older turns.
   * Expected outcome: Groups past the cap are replaced by one count line.
   * Exceptions: None.
   */
  readonly maxGroupLines: number | null;
  /**
   * Units of any owner a tactical battle destroyed this turn.
   *
   * Contract: Each unit carries its owner in its attribution. Omitted means none.
   * When to use: Printed under the cause `Battle`, after the six standard causes.
   * Expected outcome: Each unit lands under its own owner's header.
   * Exceptions: None.
   */
  readonly battleLosses?: readonly LostUnit[];
}

/**
 * Rank of an owner for sort order.
 *
 * Purpose: Seats sort by roster order, then Neutral, then any other id.
 * When to use: Sorting sides in a line and sections in a block.
 * Expected outcome: The seat's index; `seatOrder.length - 0.5` for a seat id the roster does not list; `seatOrder.length` for Neutral; one more for anything else.
 * Exceptions: None.
 */
function rankOf(ownerId: string, seatOrder: readonly string[]): number {
  const index = seatOrder.indexOf(ownerId);
  if (index >= 0) return index;
  if (ownerId === NEUTRAL_OWNER_ID) return seatOrder.length;
  if (isSeatId(ownerId)) return seatOrder.length - 0.5;
  return seatOrder.length + 1;
}

/**
 * Compares two owners by rank, then by label.
 *
 * Purpose: One total order for sides and sections.
 * When to use: `Array.prototype.sort` over owner ids.
 * Expected outcome: Negative when `left` comes first.
 * Exceptions: None.
 */
function compareOwners(left: string, right: string, input: RecentTurnLossLinesInput): number {
  const byRank = rankOf(left, input.seatOrder) - rankOf(right, input.seatOrder);
  if (byRank !== 0) return byRank;
  return sideLabel(left, input).localeCompare(sideLabel(right, input), 'en');
}

/**
 * Names an owner in a loss line or header.
 *
 * Purpose: The reading seat is `you`, a seat is its prompt code, and Neutral is Neutral.
 * When to use: Every `by ...` text and every `Losses of ...` header.
 * Expected outcome: `you`, `Neutral`, a code such as `h1` or `a2`, or the id itself for anything else.
 * Exceptions: None.
 */
function sideLabel(ownerId: string, input: RecentTurnLossLinesInput): string {
  if (ownerId === input.ownSeatId) return 'you';
  if (ownerId === NEUTRAL_OWNER_ID) return 'Neutral';
  if (isSeatId(ownerId)) return playerIdCodeFor(ownerId);
  return ownerId;
}

/**
 * Names a responsible side in a `by ...` text.
 *
 * Purpose: A code alone does not say who a side is, so another side's code is followed by its home region.
 * When to use: `responsibleText`, once per responsible side.
 * Expected outcome: What `sideLabel` returns, except that a seat other than the reading seat with a mapped home region reads `a3 (Southern France)`. A trailing abbreviation such as ` (SEGAS)` is dropped so no parentheses nest.
 * Exceptions: None.
 */
function responsibleSideName(ownerId: string, input: RecentTurnLossLinesInput): string {
  const label = sideLabel(ownerId, input);
  if (ownerId === input.ownSeatId) return label;
  const home = input.homeRegionBySeatId?.get(ownerId);
  if (home === undefined) return label;
  const homeName = sideHomeNameKey(home);
  return homeName.length > 0 ? `${label} (${homeName})` : label;
}

/**
 * Reduces a unit's attribution to its responsibility key.
 *
 * Purpose: Units with the same responsibility share a loss line.
 * When to use: `groupLosses`, once per unit.
 * Expected outcome: `unknown` without attribution or with a null list, `none` for an empty list, otherwise `sides` in rank order.
 * Exceptions: None.
 */
function responsibleKeyOf(unit: LostUnit, input: RecentTurnLossLinesInput): ResponsibleKey {
  const ids = unit.attribution?.responsibleOwnerIds;
  if (!ids) return { kind: 'unknown', sides: [] };
  if (ids.length === 0) return { kind: 'none', sides: [] };
  const sides = [...new Set(ids)].sort((left, right) => compareOwners(left, right, input));
  return { kind: 'sides', sides };
}

/**
 * Writes the `by ...` text of a loss line.
 *
 * Purpose: One place decides how one, two, and many sides read.
 * When to use: `lineFor`.
 * Expected outcome: `by unknown side`, `no side responsible`, `by X`, `by X and Y`, or `by X, Y, and Z`. When any name includes a home region, every name is joined with ` and `, because home regions contain commas.
 * Exceptions: None.
 */
function responsibleText(responsible: ResponsibleKey, input: RecentTurnLossLinesInput): string {
  if (responsible.kind === 'unknown') return 'by unknown side';
  if (responsible.kind === 'none') return 'no side responsible';
  const names = responsible.sides.map((id) => responsibleSideName(id, input));
  if (names.some((name) => name.includes(' ('))) return `by ${names.join(' and ')}`;
  if (names.length === 1) return `by ${names[0]}`;
  if (names.length === 2) return `by ${names[0]} and ${names[1]}`;
  return `by ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * Splits both summaries into loss groups.
 *
 * Purpose: Units that share a victim owner, responsibility, cause, and hex code are one line.
 * When to use: `buildRecentTurnLossLines`, before sorting.
 * Expected outcome: One group per distinct key, with victims in bucket order. Battle losses follow the six standard causes.
 * Exceptions: None.
 */
function groupLosses(input: RecentTurnLossLinesInput): LossGroup[] {
  const groups = new Map<string, LossGroup>();
  const add = (unit: LostUnit, victimOwner: string, causeIndex: number): void => {
    const responsible = responsibleKeyOf(unit, input);
    const h3Index = unit.attribution?.lossH3Index ?? null;
    const hexCode = (h3Index ? input.hexCodeFor(h3Index) : undefined) ?? '';
    const key = [victimOwner, responsible.kind, responsible.sides.join(','), causeIndex, hexCode].join('|');
    const existing = groups.get(key);
    if (existing) existing.units.push(unit);
    else groups.set(key, { victimOwner, responsible, causeIndex, hexCode, units: [unit] });
  };
  LOSS_CAUSE_KEYS.forEach((causeKey, causeIndex) => {
    for (const unit of input.ownLosses[causeKey]) add(unit, input.ownSeatId, causeIndex);
    for (const unit of input.otherLosses[causeKey]) add(unit, unit.attribution?.ownerId ?? UNKNOWN_OWNER_KEY, causeIndex);
  });
  for (const unit of input.battleLosses ?? []) add(unit, unit.attribution?.ownerId ?? UNKNOWN_OWNER_KEY, LOSS_CAUSE_KEYS.length);
  return [...groups.values()];
}

/**
 * Compares two groups of the same section.
 *
 * Purpose: Side groups first, then no side, then unknown; then cause order, then hex code.
 * When to use: Sorting the groups of one section.
 * Expected outcome: Negative when `left` comes first.
 * Exceptions: None.
 */
function compareGroups(left: LossGroup, right: LossGroup, input: RecentTurnLossLinesInput): number {
  const kindOrder: Record<ResponsibleKind, number> = { sides: 0, none: 1, unknown: 2 };
  const byKind = kindOrder[left.responsible.kind] - kindOrder[right.responsible.kind];
  if (byKind !== 0) return byKind;
  if (left.responsible.kind === 'sides') {
    const byFirstSide = compareOwners(left.responsible.sides[0]!, right.responsible.sides[0]!, input);
    if (byFirstSide !== 0) return byFirstSide;
    const byCount = left.responsible.sides.length - right.responsible.sides.length;
    if (byCount !== 0) return byCount;
    const byNames = responsibleText(left.responsible, input).localeCompare(responsibleText(right.responsible, input), 'en');
    if (byNames !== 0) return byNames;
  }
  if (left.causeIndex !== right.causeIndex) return left.causeIndex - right.causeIndex;
  if (left.hexCode === right.hexCode) return 0;
  if (left.hexCode.length === 0) return 1;
  if (right.hexCode.length === 0) return -1;
  return left.hexCode.localeCompare(right.hexCode, 'en');
}

/**
 * Sorts groups into section order, then group order.
 *
 * Purpose: One canonical order decides both the printed order and which groups a cap keeps first.
 * When to use: `buildRecentTurnLossLines`, after grouping.
 * Expected outcome: The reading seat's groups, then other owners by rank, then the unknown owner.
 * Exceptions: None.
 */
function sortGroups(groups: readonly LossGroup[], input: RecentTurnLossLinesInput): LossGroup[] {
  const sectionOrder = (owner: string): number => {
    if (owner === input.ownSeatId) return 0;
    return owner === UNKNOWN_OWNER_KEY ? 2 : 1;
  };
  return [...groups].sort((left, right) => {
    const bySection = sectionOrder(left.victimOwner) - sectionOrder(right.victimOwner);
    if (bySection !== 0) return bySection;
    if (left.victimOwner !== right.victimOwner) return compareOwners(left.victimOwner, right.victimOwner, input);
    return compareGroups(left, right, input);
  });
}

/**
 * Keeps the groups a cap allows.
 *
 * Purpose: Groups that involve the reading seat are listed first, so evidence about that seat is never cut for other sides' fights.
 * When to use: `buildRecentTurnLossLines` when `maxGroupLines` is set and exceeded.
 * Expected outcome: At most `maxGroupLines` groups, in the order given.
 * Exceptions: None.
 */
function capGroups(sorted: readonly LossGroup[], maxGroupLines: number, input: RecentTurnLossLinesInput): LossGroup[] {
  const involves = (group: LossGroup): boolean =>
    group.victimOwner === input.ownSeatId || group.responsible.sides.includes(input.ownSeatId);
  const chosen = new Set<LossGroup>();
  for (const group of sorted) {
    if (chosen.size < maxGroupLines && involves(group)) chosen.add(group);
  }
  for (const group of sorted) {
    if (chosen.size < maxGroupLines && !chosen.has(group)) chosen.add(group);
  }
  return sorted.filter((group) => chosen.has(group));
}

/**
 * Notes printed after a cause label that a commander could read as an attack.
 *
 * Purpose: The note tells a commander which losses were not an attack by the side named.
 * When to use: `lineFor`, for a group with one of the standard causes.
 * Expected outcome: A note for return fire and for melee. A cause with no entry prints its label alone.
 * Exceptions: None.
 */
export const LOSS_CAUSE_PROMPT_NOTES: Readonly<Partial<Record<keyof PlayerLossSummary, string>>> = {
  returnFire: 'the destroyed units attacked first',
  melee: 'units of both sides were in the same hex or cell',
};

/**
 * Writes the line of one group.
 *
 * Purpose: One line carries who was responsible, the cause, the hex, the victims, and the killer counts.
 * When to use: `buildRecentTurnLossLines`, once per listed group.
 * Expected outcome: `  - by h1, Ranged attack at QX: a1-i3, a1-a2 (by 2 Armored)`. A cause in `LOSS_CAUSE_PROMPT_NOTES` prints its note in parentheses after the label. A Battle line has no note. The hex and the killer part are left out when empty.
 * Exceptions: None.
 */
function lineFor(group: LossGroup, input: RecentTurnLossLinesInput): string {
  const killers = new Map<string, LossKillerUnit>();
  for (const unit of group.units) {
    for (const killer of unit.attribution?.killerUnits ?? []) killers.set(killer.unitId, killer);
  }
  const hex = group.hexCode.length > 0 ? ` at ${group.hexCode}` : '';
  const by = killers.size > 0 ? ` (by ${formatGroupedTypeTotals([...killers.values()])})` : '';
  const label = group.causeIndex < LOSS_CAUSE_LABELS.length ? LOSS_CAUSE_LABELS[group.causeIndex] : BATTLE_LOSS_CAUSE_LABEL;
  const note = group.causeIndex < LOSS_CAUSE_KEYS.length ? LOSS_CAUSE_PROMPT_NOTES[LOSS_CAUSE_KEYS[group.causeIndex]] : undefined;
  const cause = note ? `${label} (${note})` : label;
  return `  - ${responsibleText(group.responsible, input)}, ${cause}${hex}: ${formatLossEntriesForPrompt(group.units)}${by}`;
}

/**
 * Writes the header of one section.
 *
 * Purpose: The reading seat's losses, each other owner's losses, and losses of an unknown owner each get a header.
 * When to use: `buildRecentTurnLossLines`, when the owner changes.
 * Expected outcome: `- Your Losses:`, `- Losses of other sides:`, or `- Losses of {side}:`.
 * Exceptions: None.
 */
function headerFor(victimOwner: string, input: RecentTurnLossLinesInput): string {
  if (victimOwner === input.ownSeatId) return '- Your Losses:';
  if (victimOwner === UNKNOWN_OWNER_KEY) return '- Losses of other sides:';
  return `- Losses of ${sideLabel(victimOwner, input)}:`;
}

/**
 * Builds the attributed loss lines for one turn block.
 *
 * Purpose: Tells a commander who destroyed which units, where, and with what, for its own losses and for every other side's.
 * When to use: `buildRecentTurnNotesSection`, once per turn block.
 * Expected outcome: Section headers and group lines in canonical order, then a count line when a cap dropped groups. An empty list when nothing was lost.
 * Exceptions: None.
 */
export function buildRecentTurnLossLines(input: RecentTurnLossLinesInput): string[] {
  const sorted = sortGroups(groupLosses(input), input);
  const capped = input.maxGroupLines !== null && sorted.length > input.maxGroupLines
    ? capGroups(sorted, input.maxGroupLines, input)
    : sorted;
  logDebug('recentTurnLossLines buildRecentTurnLossLines', {
    ownSeatId: input.ownSeatId,
    maxGroupLines: input.maxGroupLines,
    groupCount: sorted.length,
    listedCount: capped.length,
  });
  const lines: string[] = [];
  let currentOwner: string | null = null;
  for (const group of capped) {
    if (group.victimOwner !== currentOwner) {
      lines.push(headerFor(group.victimOwner, input));
      currentOwner = group.victimOwner;
    }
    lines.push(lineFor(group, input));
  }
  const dropped = sorted.length - capped.length;
  if (dropped === 1) lines.push('- 1 more loss group on this turn is not listed.');
  else if (dropped > 1) lines.push(`- ${dropped} more loss groups on this turn are not listed.`);
  return lines;
}
