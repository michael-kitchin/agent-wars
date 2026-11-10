/**
 * Hex codes named by a turn-report strike sentence.
 *
 * Purpose: Missile and fortification sentences share one sorted list of codes.
 * When to use: After the caller has resolved each hex to a code, or to null.
 * Expected outcome: Known codes once each, in ordinal order, then one fallback if any code was missing.
 * Exceptions: None. This module has no logger.
 */

import { joinWithSerialComma } from './consolidatedTurnUpdateToast';

/**
 * Words used when a hex has no code.
 *
 * Purpose: The list still names that hex.
 * When to use: `formatTurnReportHexList` when a code is null or blank.
 * Expected outcome: The words `an unidentified hex`.
 * Exceptions: None.
 */
export const TURN_REPORT_UNKNOWN_HEX = 'an unidentified hex';

/**
 * Joins hex codes for one strike sentence.
 *
 * Purpose: The sentence names each hex once, in a stable order.
 * When to use: After collecting the codes for one side's strikes.
 * Expected outcome: One code unchanged, two joined with "and", and three or more with a comma before "and".
 *   A null or blank code becomes `TURN_REPORT_UNKNOWN_HEX`, once, after the sorted codes.
 * Exceptions: None. An empty list returns an empty string.
 */
export function formatTurnReportHexList(codes: readonly (string | null)[]): string {
  const known = new Set<string>();
  let unknown = false;
  for (const code of codes) {
    const trimmed = code?.trim() ?? '';
    if (trimmed.length === 0) unknown = true;
    else known.add(trimmed);
  }
  const sorted = [...known].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if (unknown) sorted.push(TURN_REPORT_UNKNOWN_HEX);
  return joinWithSerialComma(sorted);
}
