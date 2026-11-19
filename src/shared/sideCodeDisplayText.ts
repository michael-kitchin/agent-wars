/**
 * Shows side codes in commander text as side display names.
 *
 * Purpose: Commanders write `a2` or `h1` for a side. The player reads the side's name instead.
 * When to use: Any screen that draws commander-written text, after the text is stored and recorded unchanged.
 * Expected outcome: Pure display conversion. Stored, recorded, and prompt text never pass through this module.
 * Exceptions: None.
 */

import { isSeatId } from './seatIds';
import { sideDisplayName, type SideDisplaySeat } from './sideNicknames';
import { playerIdCodeFor } from './unitIds';

/**
 * Matches a whole lowercase side code.
 *
 * Purpose: Find `h1` and `a1` to `a4` in prose without touching ids, longer words, or hex codes.
 * When to use: Only through `String.prototype.replace`, because the `g` flag keeps state in `lastIndex` for `test` and `exec`.
 * Expected outcome: The lowercase class leaves `A1` hex codes alone. The look-behind and look-ahead reject a code
 *   inside `a2-i5`, `a2-i31-s7`, `a12`, or `ba1`. Punctuation beside a code, as in `a3's` or `(a2)`, still matches.
 * Exceptions: None.
 */
const SIDE_CODE_PATTERN = /(?<![A-Za-z0-9_-])([ah][1-4])(?![A-Za-z0-9_-])/g;

/**
 * Builds the code-to-name lookup for one match.
 *
 * Purpose: Only seats in the match are replaced, so a code of an absent seat stays as written.
 * When to use: Once per conversion.
 * Expected outcome: One entry per seat whose id is a known seat id, keyed by its unit id code.
 * Exceptions: A seat whose id is not a known seat id is skipped.
 */
function namesBySideCode(seats: readonly SideDisplaySeat[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const seat of seats) {
    if (isSeatId(seat.seatId)) names.set(playerIdCodeFor(seat.seatId), sideDisplayName(seat));
  }
  return names;
}

/**
 * Replaces side codes in text with names from a code-to-name lookup.
 *
 * Purpose: Lets a screen that already knows each side's name by code convert text without building seat records.
 * When to use: When drawing commander-written text and the names are known by unit id code, such as `a2`.
 * Expected outcome: Each whole lowercase code found in `nameByCode` becomes its name. A code missing from the map, and all other text, stay as written.
 * Exceptions: None.
 */
export function sideCodesToNamesByCode(text: string, nameByCode: ReadonlyMap<string, string>): string {
  return text.replace(SIDE_CODE_PATTERN, (match: string, code: string) => nameByCode.get(code) ?? match);
}

/**
 * Replaces side codes in text with the sides' display names.
 *
 * Purpose: Commander messages and Strategy text read as names on screen.
 * When to use: When drawing commander-written text for the player.
 * Expected outcome: Each whole lowercase code of a seat in `seats` becomes `sideDisplayName` of that seat. Other text
 *   is unchanged. An empty seat list or text without a code returns the text as given.
 * Exceptions: None.
 */
export function sideCodesToDisplayNames(text: string, seats: readonly SideDisplaySeat[]): string {
  if (seats.length === 0) return text;
  return sideCodesToNamesByCode(text, namesBySideCode(seats));
}
