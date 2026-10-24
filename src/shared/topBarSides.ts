/**
 * The side chips in the top bar.
 *
 * Purpose: The bar names every side, and shows whether each AI commander is planning or ready.
 * When to use: Every top-bar refresh, including a pool update that does not change the snapshot.
 * Expected outcome: A lead chip and the other sides, or one chip per side while observing.
 * Exceptions: None.
 */

import type { CommanderStatus } from './commanderStatus';
import { SEAT_PALETTES } from './seatPalette';
import { shortSideName } from './seatRoster';

const READY_CHECK_COLOR = '#86EFAC';

/**
 * One seat the chips can name.
 *
 * Purpose: The bar does not need the commander's model.
 * When to use: `buildTopBarSideChips`.
 * Expected outcome: Enough to order, name, and dim a side.
 * Exceptions: None.
 */
export interface TopBarSideSeat {
  /**
   * The seat id.
   *
   * Contract: A `SeatId`.
   * When to use: Matching a commander status.
   * Expected outcome: Unique in the list.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * List order, from 1.
   *
   * Contract: Unique in the roster.
   * When to use: Chip order and the seat color.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * Human or AI.
   *
   * Contract: `HUMAN_SEAT_ID` or `'ai'`.
   * When to use: The lead chip is the human seat when one is playing.
   * Expected outcome: At most one human.
   * Exceptions: None.
   */
  readonly kind: 'human' | 'ai';
  /**
   * Home name.
   *
   * Contract: The side-group display name, or the UN subregion name.
   * When to use: The chip's label. Other chips use the short form.
   * Expected outcome: A non-empty name.
   * Exceptions: None.
   */
  readonly homeRegion: string;
  /**
   * The turn the seat was knocked out, or null while it plays.
   *
   * Contract: Null means the seat is active.
   * When to use: A knocked-out chip is dimmed and has no status icon.
   * Expected outcome: A turn number, or null.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
}

/**
 * One commander's current status.
 *
 * Purpose: The chip icon follows the pool, not the roster.
 * When to use: `buildTopBarSideChips`.
 * Expected outcome: One row per AI seat.
 * Exceptions: None.
 */
export interface TopBarCommanderStatus {
  /**
   * The AI seat.
   *
   * Contract: An AI seat id.
   * When to use: Matching a chip.
   * Expected outcome: Unique in the list.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The pool status.
   *
   * Contract: A `CommanderStatus`.
   * When to use: Choosing the icon.
   * Expected outcome: Planning and ready draw an icon. No model and timed out do not.
   * Exceptions: None.
   */
  readonly status: CommanderStatus;
}

/**
 * One chip the bar can paint.
 *
 * Purpose: The renderer does not decide names, colors, or icons.
 * When to use: Returned by `buildTopBarSideChips`.
 * Expected outcome: Ready to write into the sides block.
 * Exceptions: None.
 */
export interface TopBarSideChip {
  /**
   * The seat id.
   *
   * Contract: A `SeatId`.
   * When to use: Stable identity if the bar is rebuilt.
   * Expected outcome: The seat this chip names.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The label.
   *
   * Contract: The full home name for the lead chip, and the short name for every other chip.
   * When to use: The chip's text.
   * Expected outcome: A non-empty name.
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * The seat dot color.
   *
   * Contract: A CSS hex color from the seat palette.
   * When to use: The dot's fill.
   * Expected outcome: Seat order 1 is `#115E59`.
   * Exceptions: None.
   */
  readonly dotColor: string;
  /**
   * The status icon, or null when the chip has none.
   *
   * Contract: `'planning'`, `'ready'`, or null.
   * When to use: An arc or a check beside the name.
   * Expected outcome: Null for a human seat, a knocked-out seat, no model, and a timed-out consult.
   * Exceptions: None.
   */
  readonly statusIcon: 'planning' | 'ready' | null;
  /**
   * The icon color, or null when there is no icon.
   *
   * Contract: A CSS hex color.
   * When to use: The arc uses the seat's text color. The check is `#86EFAC`.
   * Expected outcome: Null when `statusIcon` is null.
   * Exceptions: None.
   */
  readonly statusColor: string | null;
  /**
   * The knockout turn, or null while the seat plays.
   *
   * Contract: Null means the chip is not struck through.
   * When to use: "out T{N}" and the dimmed name.
   * Expected outcome: A turn number, or null.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
}

/**
 * The sides block.
 *
 * Purpose: Observe mode and a match with a human seat are different layouts.
 * When to use: Returned by `buildTopBarSideChips`.
 * Expected outcome: `observing` chooses the heading. `chips` is in seat order.
 * Exceptions: None.
 */
export interface TopBarSidesBlock {
  /**
   * True when nobody is playing the human seat.
   *
   * Contract: True when `viewerSeatId` is null.
   * When to use: The heading is "Observing" and every seat is a chip.
   * Expected outcome: False shows the viewer's full name, "vs", then the other chips.
   * Exceptions: None.
   */
  readonly observing: boolean;
  /**
   * The viewer's chip, or null while observing.
   *
   * Contract: Null when `observing` is true.
   * When to use: The name before "vs".
   * Expected outcome: The full home name.
   * Exceptions: None.
   */
  readonly lead: TopBarSideChip | null;
  /**
   * The other chips, or every seat while observing.
   *
   * Contract: Seat order. Does not include `lead`.
   * When to use: After "vs", or after "Observing".
   * Expected outcome: Short names.
   * Exceptions: None.
   */
  readonly chips: readonly TopBarSideChip[];
}

/**
 * Builds the sides block.
 *
 * Purpose: Tests can cover names, icons, and knockout text without a DOM.
 * When to use: Each top-bar refresh. Pass null for `viewerSeatId` while observing.
 * Expected outcome: Planning and ready draw an icon. A knocked-out seat is marked out and has no icon.
 * Exceptions: None.
 */
export function buildTopBarSideChips(
  seats: readonly TopBarSideSeat[],
  statuses: readonly TopBarCommanderStatus[],
  viewerSeatId: string | null
): TopBarSidesBlock {
  const ordered = [...seats].sort((left, right) => left.seatOrder - right.seatOrder);
  const chips = ordered.map((seat) => chipFor(seat, statuses));
  if (viewerSeatId === null) return { observing: true, lead: null, chips };
  const lead = chips.find((chip) => chip.seatId === viewerSeatId) ?? null;
  if (!lead) return { observing: true, lead: null, chips };
  return { observing: false, lead: { ...lead, label: fullName(ordered, lead.seatId) }, chips: chips.filter((chip) => chip.seatId !== viewerSeatId) };
}

/**
 * One chip from a seat and the pool.
 *
 * Purpose: Icon rules stay in one place.
 * When to use: `buildTopBarSideChips`.
 * Expected outcome: A short name, a seat color, and an icon only for planning or ready.
 * Exceptions: None.
 */
function chipFor(seat: TopBarSideSeat, statuses: readonly TopBarCommanderStatus[]): TopBarSideChip {
  const palette = SEAT_PALETTES[seat.seatOrder - 1] ?? SEAT_PALETTES[0]!;
  const status = statuses.find((row) => row.seatId === seat.seatId)?.status ?? null;
  const knockedOut = seat.outTurn !== null;
  const statusIcon = knockedOut || status === null || status === 'no_model' || status === 'timed_out' || status === 'out' ? null : status;
  return {
    seatId: seat.seatId,
    label: shortSideName(seat.homeRegion),
    dotColor: palette.map,
    statusIcon,
    statusColor: statusIcon === 'planning' ? palette.text : statusIcon === 'ready' ? READY_CHECK_COLOR : null,
    outTurn: seat.outTurn,
  };
}

/**
 * The seat's full home name.
 *
 * Purpose: The lead chip keeps the long name. The model otherwise stores the short one.
 * When to use: The viewer's chip.
 * Expected outcome: The roster's `homeRegion`.
 * Exceptions: None.
 */
function fullName(seats: readonly TopBarSideSeat[], seatId: string): string {
  return seats.find((seat) => seat.seatId === seatId)?.homeRegion ?? '';
}
