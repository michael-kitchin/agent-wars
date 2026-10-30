/**
 * The Sides table for a strategic system prompt.
 *
 * Purpose: Each commander is told who is still playing, who is out, and that Neutral garrisons are hostile.
 * When to use: Immediately before the Scenario Objective block. Omit in a battle; that prompt does not list homes.
 * Expected outcome: A Markdown table. The commander's row is first and marked "(you)". Other seats follow in seat order.
 * Exceptions: None.
 */

import { playerIdCodeFor } from '../../../shared/unitIds';
import { sortSeatsByOrder } from '../../../shared/seatRoster';
import type { SeatId } from '../../../shared/seatIds';
import { logDebug } from '../../logger';
import { MERCENARY_ID_PREFIX_NOTE } from './gameRuleMercenaryText';

/**
 * One roster row the Sides table can print.
 *
 * Purpose: The table needs a name, an order, and whether the seat is still playing. It does not need a commander.
 * When to use: `buildSidesPromptBlock`.
 * Expected outcome: `outTurn` null means the status cell is Active.
 * Exceptions: None.
 */
export type SidesPromptSeat = {
  /**
   * Stored id of this side.
   *
   * Contract: A `SeatId`. The prefix cell is `playerIdCodeFor` of this id.
   * When to use: Ordering and the "(you)" mark.
   * Expected outcome: The human seat or an AI seat.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * List order.
   *
   * Contract: Lower numbers come first after the commander's own row.
   * When to use: `sortSeatsByOrder`.
   * Expected outcome: An integer from 1 to 4.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * Full home display name.
   *
   * Contract: The side-group name or the UN subregion name. Not the short name.
   * When to use: The Side cell and the Home region cell.
   * Expected outcome: The same string in both cells, with " (you)" added on the commander's Side cell.
   * Exceptions: None.
   */
  readonly homeRegion: string;
  /**
   * Turn the seat was knocked out, or null while it is active.
   *
   * Contract: Null prints Active. A number prints the out-since-turn status.
   * When to use: The Status cell.
   * Expected outcome: Null or a positive turn number.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
};

const NEUTRAL_STATUS =
  'Garrisons hold their hexes and fire on any unit in range. A loaded ship sails to a landing, unloads, and then holds.';

/**
 * Builds the Sides table.
 *
 * Purpose: The commander sees every seat, including seats already knocked out, and Neutral only when a neutral unit exists.
 * When to use: Strategic `buildSystemPromptForTools`, immediately before the scenario objective.
 * Expected outcome: A heading, a four-column table, and a Neutral row when `includeNeutral` is true. An empty seat list returns an empty string.
 * Exceptions: `playerIdCodeFor` throws when a seat id is not a seat. Callers pass roster ids only.
 */
export function buildSidesPromptBlock(args: {
  readonly ownSeatId: SeatId;
  readonly seats: readonly SidesPromptSeat[];
  readonly includeNeutral: boolean;
  /**
   * Whether to add the note that a rehired unit keeps its old id prefix.
   *
   * Contract: Omitted means false.
   * When to use: When the match has at least one mercenary.
   * Expected outcome: The note is the last line.
   * Exceptions: None.
   */
  readonly includeMercenaryNote?: boolean;
}): string {
  logDebug('sidesBlock buildSidesPromptBlock', {
    ownSeatId: args.ownSeatId,
    seatCount: args.seats.length,
    includeNeutral: args.includeNeutral,
  });
  if (args.seats.length === 0) return '';
  const ordered = sortSeatsByOrder(args.seats);
  const own = ordered.find((seat) => seat.seatId === args.ownSeatId);
  const rest = ordered.filter((seat) => seat.seatId !== args.ownSeatId);
  const rows = own ? [own, ...rest] : rest;
  const lines = [
    '## Sides',
    '',
    '| Side | Unit id prefix | Home region | Status |',
    '| --- | --- | --- | --- |',
  ];
  for (const seat of rows) {
    const side = seat.seatId === args.ownSeatId ? `${seat.homeRegion} (you)` : seat.homeRegion;
    const status = seat.outTurn === null
      ? 'Active'
      : `Out since turn ${seat.outTurn}; its units are now neutral`;
    lines.push(`| ${side} | ${playerIdCodeFor(seat.seatId)} | ${seat.homeRegion} | ${status} |`);
  }
  if (args.includeNeutral) {
    lines.push(`| Neutral | (keeps the prefix of the side it came from) | none | ${NEUTRAL_STATUS} |`);
  }
  if (args.includeMercenaryNote) lines.push(MERCENARY_ID_PREFIX_NOTE);
  return lines.join('\n');
}
