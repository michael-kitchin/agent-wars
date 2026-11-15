/**
 * The numbered flag painted beside a side's name.
 *
 * Purpose: The message dialog, the chat history, and a Reports row share one badge, without pulling in unit drawing.
 * When to use: When a line shows a side's name. `createSideNumberFlag` is the opponent badge. `createMessagePartyFlag` also covers the human seat.
 * Expected outcome: Callers receive a `side-number-flag` or null.
 * Exceptions: None.
 */

import { aiIndexForSeatId, isHumanSeatId } from '../../shared/seatIds';
import { paletteForOwner } from '../../shared/seatPalette';

/**
 * A roster row enough to color a side flag.
 *
 * Purpose: The flag needs seat order, not the rest of the snapshot.
 * When to use: `createSideNumberFlag` and `createMessagePartyFlag`.
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
  return numberFlag(index, palette.map);
}

/**
 * The numbered flag for a side named in a message line.
 *
 * Purpose: The message dialog and the chat panel name the human with the same badge as an opponent.
 * When to use: A message line that names a seat, including the human seat.
 * Expected outcome: An opponent flag from `createSideNumberFlag`. The human seat gets that badge with digit `seatOrder` and that seat's map color. The human is seat 1. Null when the seat is missing or has no palette.
 * Exceptions: None.
 */
export function createMessagePartyFlag(seatId: string, seats: readonly FlagSeat[]): HTMLSpanElement | null {
  if (!isHumanSeatId(seatId)) return createSideNumberFlag(seatId, seats);
  const seat = seats.find((row) => row.seatId === seatId);
  const palette = paletteForOwner(seatId, seats);
  if (seat == null || palette == null) return null;
  return numberFlag(seat.seatOrder, palette.map);
}

/**
 * One side-number badge.
 *
 * Purpose: Opponent flags and the human's message-line flag share the markup.
 * When to use: `createSideNumberFlag` and `createMessagePartyFlag`.
 * Expected outcome: A `side-number-flag` with a white digit on `color`. The badge is hidden from assistive tech because the name beside it is the label.
 * Exceptions: None.
 */
function numberFlag(digit: number, color: string): HTMLSpanElement {
  const flag = document.createElement('span');
  flag.className = 'side-number-flag';
  flag.style.background = color;
  flag.setAttribute('aria-hidden', 'true');
  const mark = document.createElement('span');
  mark.textContent = String(digit);
  mark.style.color = '#ffffff';
  flag.appendChild(mark);
  return flag;
}
