/**
 * Renderer-facing collection of unknown-battle continent names (leaf module, no imports).
 *
 * Purpose: Shares the Ready-handler loop that maps unknown combat/casualty hexes to continent labels.
 * When to use: After a Ready or tactical commit that reported unknown battle hexes.
 * Expected outcome: First-occurrence unique continent names, queried sequentially per unique hex.
 * Exceptions: Returns [] when the fetcher is omitted.
 */

/**
 * Collects unique continent names for unknown combat and casualty hexes.
 *
 * Purpose: One implementation of the duplicated Ready toast continent loop.
 * When to use: When `hasUnknownBattle` is true and continent names should be announced.
 * Expected outcome: Combat hexes then casualty hexes, de-duplicated in first-occurrence order; each unique hex awaited in sequence.
 * Exceptions: None; missing fetcher yields an empty array.
 */
export async function collectUnknownBattleContinentNames(
  unknownCombatHexes: readonly string[],
  unknownCasualtyHexes: readonly string[],
  fetchContinentNames: ((h3Index: string) => Promise<readonly string[]>) | undefined
): Promise<string[]> {
  const unknownContinentNames: string[] = [];
  if (!fetchContinentNames) return unknownContinentNames;
  const unknownHexes = [...unknownCombatHexes, ...unknownCasualtyHexes].filter(
    (h3, idx, arr) => arr.indexOf(h3) === idx
  );
  for (const h3 of unknownHexes) {
    const names = await fetchContinentNames(h3);
    for (const n of names) {
      if (!unknownContinentNames.includes(n)) unknownContinentNames.push(n);
    }
  }
  return unknownContinentNames;
}
