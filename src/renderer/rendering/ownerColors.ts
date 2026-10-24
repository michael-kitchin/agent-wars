import { paletteForOwner, SEAT_PALETTES, type OwnerPalette } from '../../shared/seatPalette';
import { HUMAN_SEAT_ID, type SeatId } from '../../shared/seatIds';
import { rendererSharedState as S } from '../core/state';

/**
 * Roster the current frame should paint from.
 *
 * Purpose: Colors follow seat order on the live snapshot.
 * When to use: Every map color lookup in the renderer.
 * Expected outcome: The snapshot seats, or an empty list before a match exists.
 * Exceptions: None.
 */
function paletteSeats(): readonly { seatId: SeatId; seatOrder: number }[] {
  return S.gameState?.seats ?? [];
}

/**
 * Palette for an owner on the current match, with seat 1's colors before a roster exists.
 *
 * Purpose: The human's own lines stay teal when the snapshot has not arrived yet.
 * When to use: Drawing one owner's map color or text color.
 * Expected outcome: That owner's palette. The human seat uses seat 1 before a roster exists.
 *   A missing id on a loaded roster returns null.
 * Exceptions: None.
 */
export function paletteForCurrentOwner(ownerId: string | null | undefined): OwnerPalette | null {
  if (ownerId == null || ownerId === '') return null;
  const seats = paletteSeats();
  const palette = paletteForOwner(ownerId, seats);
  if (palette) return palette;
  if (seats.length === 0 && ownerId === HUMAN_SEAT_ID) return SEAT_PALETTES[0] ?? null;
  return null;
}
