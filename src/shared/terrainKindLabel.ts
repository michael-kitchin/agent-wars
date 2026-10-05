/**
 * Formats a pipeline terrain kind for display, for example `forest` as `Forest`.
 *
 * Purpose: One capitalization rule for terrain kinds in the map key, hex tooltips, and the unit origin tooltip.
 * When to use: Whenever a raw terrain kind string is shown to the player.
 * Expected outcome: First letter uppercased; `Unknown` for `null` or an empty string.
 * Exceptions: None.
 */
export function formatTerrainKindLabel(kind: string | null): string {
  if (!kind) return 'Unknown';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
