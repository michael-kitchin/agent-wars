/**
 * Reads a side code from a talk reply.
 *
 * Purpose: The message and stance parser and the agreement parser resolve side codes the same way.
 * When to use: Parsing the `to`, `toward`, `with`, and `against` values of a talk reply.
 * Expected outcome: A seat id from the allowed list, or null.
 * Exceptions: None.
 */

import { isSeatId, type SeatId } from '../../../shared/seatIds';
import { playerIdCodeFor } from '../../../shared/unitIds';

/**
 * Resolves a side code or a seat id to a seat this reply may name.
 *
 * Purpose: The model is shown side codes, and sometimes repeats a seat id.
 * When to use: Each `to`, `toward`, `with`, and `against` value.
 * Expected outcome: The seat, or null when the code does not name one of `addressableSeatIds`.
 * Exceptions: None.
 */
export function seatIdForSideCode(code: unknown, addressableSeatIds: readonly SeatId[]): SeatId | null {
  if (typeof code !== 'string') return null;
  const normalized = code.trim().toLowerCase();
  if (normalized.length === 0) return null;
  const byCode = addressableSeatIds.find((seatId) => playerIdCodeFor(seatId) === normalized);
  if (byCode) return byCode;
  if (isSeatId(normalized) && addressableSeatIds.includes(normalized)) return normalized;
  return null;
}
