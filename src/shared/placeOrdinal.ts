/**
 * An English ordinal for a 1-based finishing place.
 *
 * Purpose: Standings and the knockout dialog share one wording for places such as 1st, 12th, and 22nd.
 * When to use: When a sentence names a finishing place.
 * Expected outcome: 1st, 2nd, 3rd, 4th, and the same pattern afterward. 11, 12, and 13 use "th".
 * Exceptions: None.
 */
export function formatPlaceOrdinal(place: number): string {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  switch (place % 10) {
    case 1: return `${place}st`;
    case 2: return `${place}nd`;
    case 3: return `${place}rd`;
    default: return `${place}th`;
  }
}
