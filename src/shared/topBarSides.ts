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
import { AI_SEAT_KIND, sortSeatsByOrder, type SeatKind } from './seatRoster';
import { sideDisplayName } from './sideNicknames';

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
   * Contract: `HUMAN_SEAT_KIND` or `AI_SEAT_KIND`.
   * When to use: The lead chip is the human seat when one is playing.
   * Expected outcome: At most one human.
   * Exceptions: None.
   */
  readonly kind: SeatKind;
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
   * Stored nickname, or null for the default.
   *
   * Contract: Null means Human for a human seat and the short home name for an AI seat.
   * When to use: `sideDisplayName`.
   * Expected outcome: The chip label.
   * Exceptions: None.
   */
  readonly nickname: string | null;
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
   * Contract: `sideDisplayName` for the lead chip and for every other chip.
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
   * When to use: "(T{N})" and the dimmed name.
   * Expected outcome: A turn number, or null.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
  /**
   * Whether the name shows that side's unit counts on hover.
   *
   * Contract: True for the viewer's own chip, and for every AI chip while observing. False for an opponent of a
   *   human who is still playing, and for the human seat's chip while observing.
   * When to use: Deciding whether the name gets the unit-count tooltip.
   * Expected outcome: A knocked-out AI chip is still true while observing.
   * Exceptions: None.
   */
  readonly showsUnitCounts: boolean;
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
   * Expected outcome: False shows the viewer's display name, "vs", then the other chips.
   * Exceptions: None.
   */
  readonly observing: boolean;
  /**
   * The viewer's chip, or null while observing.
   *
   * Contract: Null when `observing` is true.
   * When to use: The name before "vs".
   * Expected outcome: The viewer's display name.
   * Exceptions: None.
   */
  readonly lead: TopBarSideChip | null;
  /**
   * The other chips, or every seat while observing.
   *
   * Contract: Seat order. Does not include `lead`.
   * When to use: After "vs", or after "Observing".
   * Expected outcome: Each other seat's display name.
   * Exceptions: None.
   */
  readonly chips: readonly TopBarSideChip[];
}

/**
 * Builds the sides block.
 *
 * Purpose: Tests can cover names, icons, and knockout text without a DOM.
 * When to use: Each top-bar refresh. Pass null for `viewerSeatId` while observing.
 * Expected outcome: Planning and ready draw an icon. A knocked-out seat is marked out and has no icon. The viewer's
 *   chip shows unit counts. While observing, every AI chip does.
 * Exceptions: None.
 */
export function buildTopBarSideChips(
  seats: readonly TopBarSideSeat[],
  statuses: readonly TopBarCommanderStatus[],
  viewerSeatId: string | null
): TopBarSidesBlock {
  const ordered = sortSeatsByOrder(seats);
  const viewer = viewerSeatId === null ? undefined : ordered.find((seat) => seat.seatId === viewerSeatId);
  if (!viewer) {
    return { observing: true, lead: null, chips: ordered.map((seat) => chipFor(seat, statuses, seat.kind === AI_SEAT_KIND)) };
  }
  return {
    observing: false,
    lead: { ...chipFor(viewer, statuses, true), label: sideDisplayName(viewer) },
    chips: ordered.filter((seat) => seat !== viewer).map((seat) => chipFor(seat, statuses, false)),
  };
}

/**
 * One chip from a seat and the pool.
 *
 * Purpose: Icon rules stay in one place.
 * When to use: `buildTopBarSideChips`.
 * Expected outcome: A display name, a seat color, and an icon only for planning or ready. `showsUnitCounts` is passed
 *   through, because only `buildTopBarSideChips` knows whether the match is observed.
 * Exceptions: None.
 */
function chipFor(seat: TopBarSideSeat, statuses: readonly TopBarCommanderStatus[], showsUnitCounts: boolean): TopBarSideChip {
  const palette = SEAT_PALETTES[seat.seatOrder - 1] ?? SEAT_PALETTES[0]!;
  const status = statuses.find((row) => row.seatId === seat.seatId)?.status ?? null;
  const knockedOut = seat.outTurn !== null;
  const statusIcon = knockedOut || status === null || status === 'no_model' || status === 'timed_out' || status === 'out' ? null : status;
  return {
    seatId: seat.seatId,
    label: sideDisplayName(seat),
    dotColor: palette.map,
    statusIcon,
    statusColor: statusIcon === 'planning' ? palette.text : statusIcon === 'ready' ? READY_CHECK_COLOR : null,
    outTurn: seat.outTurn,
    showsUnitCounts,
  };
}
