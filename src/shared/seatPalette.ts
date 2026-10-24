import type { SeatSnapshot } from './seatRoster';
import { isNeutralOwnerId } from './seatIds';

/**
 * Colors for one owner on the map, in force bars, and in text.
 *
 * Purpose: Seat order picks a row from `SEAT_PALETTES`. Neutral uses `NEUTRAL_PALETTE`.
 * When to use: Map tokens, borders, order lines, dice chips, and later chrome that paints a side.
 * Expected outcome: Three CSS colors. Callers do not invent a fourth.
 * Exceptions: None.
 */
export interface OwnerPalette {
  /**
   * Fill for tokens, order lines, and ownership borders.
   *
   * Contract: A CSS hex color.
   * When to use: Anything drawn on the map for this owner.
   * Expected outcome: Seat 1 is `#115E59`. Neutral tokens are `#141414`.
   * Exceptions: None.
   */
  readonly map: string;
  /**
   * Brighter bar color for force displays.
   *
   * Contract: A CSS hex color.
   * When to use: Force bars and similar chrome, not map fills.
   * Expected outcome: Seat 1 is `#1B8A82`. Neutral is `#9CA3AF`.
   * Exceptions: None.
   */
  readonly forceBar: string;
  /**
   * Light color for glyphs, dice text, and rings on a dark fill.
   *
   * Contract: A CSS hex color.
   * When to use: Text and strokes that sit on `map`.
   * Expected outcome: Seat 1 is `#7DCEC8`. Neutral symbols are `#D9D9D9`.
   * Exceptions: None.
   */
  readonly text: string;
}

/**
 * Map colors by seat order.
 *
 * Purpose: Seat 1 is teal and seat 2 is rose, the same colors a two-sided match already uses.
 * When to use: Index with `seatOrder - 1`. Do not index by seat id.
 * Expected outcome: Four palettes. Index 0 is seat order 1.
 * Exceptions: None.
 */
export const SEAT_PALETTES: readonly OwnerPalette[] = [
  { map: '#115E59', forceBar: '#1B8A82', text: '#7DCEC8' },
  { map: '#9D174D', forceBar: '#B02A62', text: '#F0B4C8' },
  { map: '#C2410C', forceBar: '#EA580C', text: '#FDBA74' },
  { map: '#2563EB', forceBar: '#3B82F6', text: '#A9C1F5' },
];

/**
 * Colors for Neutral land and Neutral garrisons.
 *
 * Purpose: Knocked-out land and units are not a fifth seat.
 * When to use: A controller or unit owner of Neutral.
 * Expected outcome: A near-black token, a dark held-hex outline, a gray bar, and a light ring.
 * Exceptions: None.
 */
export const NEUTRAL_PALETTE: OwnerPalette & { readonly heldHexOutline: string } = {
  map: '#141414',
  heldHexOutline: '#1F1F1F',
  forceBar: '#9CA3AF',
  text: '#D9D9D9',
};

/**
 * Palette for a unit owner or hex controller.
 *
 * Purpose: Drawing code asks for a color by owner id instead of two fixed player names.
 * When to use: Whenever a token, line, chip, or border is painted for one owner.
 * Expected outcome: The palette for that seat's `seatOrder`, `NEUTRAL_PALETTE` for Neutral,
 * and null when `ownerId` is null or not on the roster.
 * Exceptions: None.
 */
export function paletteForOwner(
  ownerId: string | null,
  seats: readonly Pick<SeatSnapshot, 'seatId' | 'seatOrder'>[]
): OwnerPalette | null {
  if (ownerId == null) return null;
  if (isNeutralOwnerId(ownerId)) return NEUTRAL_PALETTE;
  const seat = seats.find((row) => row.seatId === ownerId);
  if (!seat) return null;
  const palette = SEAT_PALETTES[seat.seatOrder - 1];
  return palette ?? null;
}
