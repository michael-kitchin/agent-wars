/**
 * The numbered flag painted beside an opponent's name.
 *
 * Purpose: The message dialog, the chat history, and a Reports row name an opponent the same way, without pulling in unit drawing.
 * When to use: When a line shows an AI seat's name.
 * Expected outcome: Callers receive a `side-number-flag` or null.
 * Exceptions: None.
 */

import { aiIndexForSeatId } from '../../shared/seatIds';
import { paletteForOwner } from '../../shared/seatPalette';

/**
 * A roster row enough to color a side flag.
 *
 * Purpose: The flag needs seat order, not the rest of the snapshot.
 * When to use: `createSideNumberFlag`.
 * Expected outcome: `paletteForOwner` can find the seat.
 * Exceptions: None.
 */
type FlagSeat = { readonly seatId: string; readonly seatOrder: number };

/**
 * The opponent index on that side's map color.
 *
 * Purpose: Tabs, the chat history, hex sentences, and Reports message rows name an opponent the same way.
 * When to use: When a line or a tab shows an AI seat's name.
 * Expected outcome: A `side-number-flag` with a white digit from `aiIndexForSeatId` and a background of `palette.map`.
 * Exceptions: Returns null when the seat is not an AI seat or has no palette. The caller then paints no flag.
 */
export function createSideNumberFlag(seatId: string, seats: readonly FlagSeat[]): HTMLSpanElement | null {
  const index = aiIndexForSeatId(seatId);
  const palette = paletteForOwner(seatId, seats);
  if (index == null || palette == null) return null;
  const flag = document.createElement('span');
  flag.className = 'side-number-flag';
  flag.style.background = palette.map;
  flag.setAttribute('aria-hidden', 'true');
  const digit = document.createElement('span');
  digit.textContent = String(index);
  digit.style.color = '#ffffff';
  flag.appendChild(digit);
  return flag;
}
