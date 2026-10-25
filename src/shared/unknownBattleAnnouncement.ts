/**
 * One sentence for an unknown battle in the turn-update toast.
 *
 * Purpose: Names the continents where combat happened outside vision, in a stable order.
 * When to use: After `collectUnknownBattleContinentNames`, and when that lookup fails.
 * Expected outcome: One name, a comma-separated list sorted with `localeCompare('en')`, or the unidentified-continent sentence.
 * Exceptions: None. The caller's array is not changed.
 */

/**
 * Builds the unknown-battle sentence for the Updates section.
 *
 * Purpose: One line the turn-update toast can append after deployments and caps.
 * When to use: Pass the continent names the collector returned. Pass an empty list when the lookup failed.
 * Expected outcome: Trimmed unique names, sorted A to Z. Blank names are dropped. `Asia` and `asia` both remain. No names yields the unidentified-continent sentence.
 * Exceptions: None. The caller's array is not changed.
 */
export function formatUnknownBattleAnnouncement(continentNames: readonly string[]): string {
  const clean = [...new Set(continentNames.map((name) => name.trim()).filter((name) => name.length > 0))].sort(
    (left, right) => left.localeCompare(right, 'en')
  );
  if (clean.length === 0) return 'Unknown battle observed in an unidentified continent.';
  return `Unknown battle observed in ${clean.join(', ')}.`;
}
