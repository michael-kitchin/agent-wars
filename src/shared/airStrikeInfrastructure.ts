/**
 * Shared air-strike target checks that do not read the database.
 *
 * Purpose: Strategic and tactical validators refuse a missing city, airport, or seaport with the same words.
 * When to use: After the caller has read the target hex's infrastructure counts.
 * Expected outcome: Pure text. This module does not import the logger.
 * Exceptions: None.
 */

import type { AirStrikeTargetType } from './ipc/ordersTypes';

/**
 * The refusal for an infrastructure air strike, or null when the target has what it needs.
 *
 * Purpose: The three validators must not drift on the wording or the count check.
 * When to use: After reading `urbanHexCount`, `airportCount`, and `seaportCount` for the target hex.
 * Expected outcome: A reason when the chosen infrastructure count is not positive. Null for `units` and for a count above zero.
 * Exceptions: None.
 */
export function airStrikeInfrastructureGapReason(
  targetType: AirStrikeTargetType,
  counts: { readonly urbanHexCount: number; readonly airportCount: number; readonly seaportCount: number },
): string | null {
  if (targetType === 'urban' && counts.urbanHexCount <= 0) return 'Target hex has no urban infrastructure';
  if (targetType === 'airport' && counts.airportCount <= 0) return 'Target hex has no airport';
  if (targetType === 'seaport' && counts.seaportCount <= 0) return 'Target hex has no seaport';
  return null;
}
