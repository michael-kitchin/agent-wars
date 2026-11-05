/**
 * Opponent lines for the ranged-attack effects tooltip.
 *
 * Purpose: The tooltip names the units on a target with the same collapse rule as a turn-update loss line.
 * When to use: After combat odds have chosen which defenders count.
 * Expected outcome: One line per opponent seat. The human and Neutral are omitted.
 * Exceptions: None.
 */

import { aiIndexForSeatId } from './seatIds';
import { LOSS_GROUP_ORDER, splitLossEntries, type LostUnit, type LostUnitType } from './lossSummary';
import { sideDisplayName, type SideDisplaySeat } from './sideNicknames';

/**
 * One defender the roster may name.
 *
 * Purpose: The tooltip already knows the id, owner, type, and base display name.
 * When to use: `buildRangedTargetRosterLines`.
 * Expected outcome: `displayName` is the base name, without a side prefix.
 * Exceptions: None.
 */
export interface RangedTargetRosterUnit {
  /**
   * Unit id.
   *
   * Contract: The id in the snapshot the player is looking at. A battle uses the sub-unit id.
   * When to use: Matching an origin flag to this unit.
   * Expected outcome: Non-empty.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Owning seat or Neutral.
   *
   * Contract: `units.player` or the battle sub-unit's player.
   * When to use: Choosing the line.
   * Expected outcome: A seat id or `neutral`.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Unit type.
   *
   * Contract: A build unit type collapses with the loss-line rule. Any other type stays a name.
   * When to use: Sorting and grouping.
   * Expected outcome: The snapshot's `unitType`.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Base display name.
   *
   * Contract: No side prefix. A tactical suffix such as `IV Fleet (12)` stays whole.
   * When to use: The text of a named token.
   * Expected outcome: The lookup name, or the id fallback.
   * Exceptions: None.
   */
  readonly displayName: string;
}

/**
 * Seat fields the roster needs in addition to a display name.
 *
 * Purpose: Lines follow `seatOrder`, and only an opponent seat gets one.
 * When to use: `buildRangedTargetRosterLines`.
 * Expected outcome: `sideDisplayName` can read the inherited fields.
 * Exceptions: None.
 */
export interface RangedTargetRosterSeat extends SideDisplaySeat {
  /**
   * Roster order.
   *
   * Contract: Lower numbers come first. Ties break by `seatId`.
   * When to use: Sorting lines.
   * Expected outcome: The seat's `seatOrder`.
   * Exceptions: None.
   */
  readonly seatOrder: number;
}

/**
 * A named unit on a roster line.
 *
 * Purpose: The painter puts that unit's origin flag before the name.
 * When to use: A type that stayed under the loss-line cap.
 * Expected outcome: `displayName` is the base name.
 * Exceptions: None.
 */
export interface RangedTargetUnitToken {
  /**
   * Discriminator for a named unit.
   *
   * Contract: Always `unit`.
   * When to use: Choosing the origin flag.
   * Expected outcome: `unit`.
   * Exceptions: None.
   */
  readonly kind: 'unit';
  /**
   * Unit id for the origin flag.
   *
   * Contract: The defender's `unitId`.
   * When to use: `resolveUnitOrigin`.
   * Expected outcome: Non-empty.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Base display name.
   *
   * Contract: The defender's `displayName`.
   * When to use: The text after the flag.
   * Expected outcome: Non-empty for a real unit.
   * Exceptions: None.
   */
  readonly displayName: string;
}

/**
 * A collapsed type on a roster line.
 *
 * Purpose: The painter puts one type icon before the count and no origin flag.
 * When to use: A type with more than the loss-line cap.
 * Expected outcome: `text` matches the turn-update token.
 * Exceptions: None.
 */
export interface RangedTargetGroupToken {
  /**
   * Discriminator for a collapsed group.
   *
   * Contract: Always `group`.
   * When to use: Choosing the type icon.
   * Expected outcome: `group`.
   * Exceptions: None.
   */
  readonly kind: 'group';
  /**
   * Collapsed unit type.
   *
   * Contract: A build unit type.
   * When to use: The type icon.
   * Expected outcome: One of `LOSS_GROUP_ORDER`.
   * Exceptions: None.
   */
  readonly unitType: LostUnitType;
  /**
   * How many units collapsed.
   *
   * Contract: Greater than the loss-line name cap.
   * When to use: The count in `text`.
   * Expected outcome: At least 4.
   * Exceptions: None.
   */
  readonly count: number;
  /**
   * Popup token, such as `4x Infantry`.
   *
   * Contract: The same text a loss line would write.
   * When to use: The text after the type icon.
   * Expected outcome: Count, `x`, and the type label.
   * Exceptions: None.
   */
  readonly text: string;
}

/**
 * One token on a roster line.
 *
 * Purpose: Named units and collapsed groups share one list in paint order.
 * When to use: Rendering a line.
 * Expected outcome: A unit token or a group token.
 * Exceptions: None.
 */
export type RangedTargetRosterToken = RangedTargetUnitToken | RangedTargetGroupToken;

/**
 * One opponent's line.
 *
 * Purpose: The tooltip shows one of these per opponent seat that has a counted defender.
 * When to use: After `buildRangedTargetRosterLines`.
 * Expected outcome: `tokens` is never empty.
 * Exceptions: None.
 */
export interface RangedTargetRosterLine {
  /**
   * Opponent seat id.
   *
   * Contract: `aiIndexForSeatId` is non-null.
   * When to use: The number flag.
   * Expected outcome: An AI seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Name shown after the flag.
   *
   * Contract: `sideDisplayName` for that seat.
   * When to use: The text before the colon.
   * Expected outcome: The nickname, or the short home name when none is stored.
   * Exceptions: None.
   */
  readonly nickname: string;
  /**
   * Units and groups in paint order.
   *
   * Contract: Named tokens first, in group order then display name. Groups follow in `LOSS_GROUP_ORDER`.
   * When to use: The text after the colon.
   * Expected outcome: At least one token.
   * Exceptions: None.
   */
  readonly tokens: readonly RangedTargetRosterToken[];
}

/**
 * Rank of a unit type in the loss-line group order.
 *
 * Purpose: Named tokens of one seat cluster by type before any type collapses.
 * When to use: Sorting one seat's defenders.
 * Expected outcome: The index in `LOSS_GROUP_ORDER`, or one past the end for an unknown type.
 * Exceptions: None.
 */
function groupRank(unitType: string): number {
  const index = LOSS_GROUP_ORDER.indexOf(unitType as LostUnitType);
  return index < 0 ? LOSS_GROUP_ORDER.length : index;
}

/**
 * Builds one roster line per opponent seat that has defenders.
 *
 * Purpose: The effects tooltip lists those seats without naming the human or Neutral.
 * When to use: With the defenders the odds call counted.
 * Expected outcome: Lines in `seatOrder`. An empty defender list, a human unit, or a Neutral unit adds no line.
 * Exceptions: None.
 */
export function buildRangedTargetRosterLines(input: {
  readonly defenders: readonly RangedTargetRosterUnit[];
  readonly seats: readonly RangedTargetRosterSeat[];
}): readonly RangedTargetRosterLine[] {
  const seats = [...input.seats].sort(
    (a, b) => a.seatOrder - b.seatOrder || a.seatId.localeCompare(b.seatId)
  );
  const lines: RangedTargetRosterLine[] = [];
  for (const seat of seats) {
    if (aiIndexForSeatId(seat.seatId) == null) continue;
    const units = input.defenders
      .filter((unit) => unit.seatId === seat.seatId)
      .sort(
        (a, b) =>
          groupRank(a.unitType) - groupRank(b.unitType) ||
          a.displayName.localeCompare(b.displayName) ||
          a.unitId.localeCompare(b.unitId)
      );
    if (units.length === 0) continue;
    const lost: LostUnit[] = units.map((unit) => ({
      unitId: unit.unitId,
      unitType: unit.unitType as LostUnitType,
      displayName: unit.displayName,
    }));
    const split = splitLossEntries(lost);
    const named: RangedTargetRosterToken[] = [];
    for (const unit of split.named) {
      if (!unit.unitId) continue;
      named.push({ kind: 'unit', unitId: unit.unitId, displayName: unit.displayName });
    }
    const groups: RangedTargetRosterToken[] = split.groups.map((group) => ({
      kind: 'group',
      unitType: group.unitType,
      count: group.count,
      text: group.text,
    }));
    const tokens = [...named, ...groups];
    if (tokens.length === 0) continue;
    lines.push({ seatId: seat.seatId, nickname: sideDisplayName(seat), tokens });
  }
  return lines;
}
