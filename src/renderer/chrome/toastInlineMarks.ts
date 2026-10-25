/**
 * Small marks painted inside the map toast, the message tabs, and a Reports message row.
 *
 * Purpose: A collapsed loss group and an opponent's name share one place to build those marks.
 * When to use: From the toast body, the message tabs, and the Reports sender line.
 * Expected outcome: A type circle or a numbered flag. A side that is not an opponent with a palette yields no flag.
 * Exceptions: None.
 */

import { HUMAN_SEAT_ID, aiIndexForSeatId } from '../../shared/seatIds';
import { miniTokenColors, paletteForOwner } from '../../shared/seatPalette';
import { unitIconPathForUnitType } from '../rendering/unitDrawing';

/**
 * A roster row enough to color a side.
 *
 * Purpose: The flag and the type circle need seat order, not the rest of the snapshot.
 * When to use: `createLossTypeToken` and `createSideNumberFlag`.
 * Expected outcome: `paletteForOwner` can find the seat.
 * Exceptions: None.
 */
type MarkSeat = { readonly seatId: string; readonly seatOrder: number };

/**
 * A 12px circle for one collapsed loss group.
 *
 * Purpose: `4x Infantry` shows the type once, in the losing side's colors.
 * When to use: Before a group token, and only while the current loss owner is known.
 * Expected outcome: A `loss-type-token` whose fill and ring come from `miniTokenColors`. The glyph is the white unit icon.
 *   The icon is mirrored when the owner is not the human seat and a palette was found.
 * Exceptions: A null palette uses fill `#333` and ring `#f4f6f8`, does not call `miniTokenColors`, and does not mirror.
 */
export function createLossTypeToken(unitType: string, ownerId: string, seats: readonly MarkSeat[]): HTMLSpanElement {
  const palette = paletteForOwner(ownerId, seats);
  const colors = palette == null ? null : miniTokenColors(palette);
  const token = document.createElement('span');
  token.className = 'loss-type-token';
  token.style.background = colors?.fill ?? '#333';
  token.style.borderColor = colors?.ring ?? '#f4f6f8';
  token.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.src = unitIconPathForUnitType(unitType);
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.draggable = false;
  if (colors != null && ownerId !== HUMAN_SEAT_ID) image.style.transform = 'scaleX(-1)';
  token.appendChild(image);
  return token;
}

/**
 * The opponent index on that side's map color.
 *
 * Purpose: Tabs, loss headers, hex sentences, and Reports message rows name an opponent the same way.
 * When to use: When a line or a tab shows an AI seat's name.
 * Expected outcome: A `side-number-flag` with a white digit from `aiIndexForSeatId` and a background of `palette.map`.
 * Exceptions: Returns null when the seat is not an AI seat or has no palette. The caller then paints no flag.
 */
export function createSideNumberFlag(seatId: string, seats: readonly MarkSeat[]): HTMLSpanElement | null {
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
