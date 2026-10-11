/**
 * Player-facing sentences for the new-game overlay banner.
 *
 * Purpose: Startup and New stay distinct, and the sentence follows the selected tab.
 * When to use: Writing `#game-over-message` while the overlay is the new-game screen.
 * Expected outcome: One of the four start sentences. Game-over text is not produced here.
 * Exceptions: None.
 */

export type NewGameBannerKind = 'startup' | 'newGame';

/**
 * Which new-game tab the banner should name.
 *
 * Purpose: The banner says global or regional to match the tab the player is looking at.
 * When to use: `newGameBannerText` and the overlay's tab sync.
 * Expected outcome: `'global'` or `'regional'`.
 * Exceptions: None.
 */
export type NewGameMapTab = 'global' | 'regional';

/**
 * Returns the overlay sentence for a startup or New screen and the selected tab.
 *
 * Purpose: Keeps the four banner sentences in one place so the overlay and its tests cannot drift.
 * When to use: When showing the overlay before a match starts, or when the player switches tabs.
 * Expected outcome: `Start the global game when ready.`, `Start the regional game when ready.`,
 * `Start a new global game when ready.`, or `Start a new regional game when ready.`
 * Exceptions: None.
 */
export function newGameBannerText(kind: NewGameBannerKind, tab: NewGameMapTab): string {
  if (kind === 'startup') return `Start the ${tab} game when ready.`;
  return `Start a new ${tab} game when ready.`;
}
