/**
 * The sentence in `#game-over-message` while the overlay is a new-game screen.
 *
 * Purpose: The sentence follows the selected tab, and a win or loss does not.
 * When to use: Opening the overlay, switching tabs, and showing game over.
 * Expected outcome: Game over clears the new-game kind so a later tab switch leaves "You win!" or "You lose." alone.
 * Exceptions: None when the message element is missing.
 */

import { newGameBannerText, type NewGameBannerKind, type NewGameMapTab } from '../../shared/newGameBannerText';

/**
 * Which new-game sentence is showing, or null during game over.
 *
 * Purpose: A tab switch rewrites the banner only while a new-game sentence is up.
 * When to use: `showNewGameBanner`, `showGameOverBanner`, and `syncNewGameBannerToTab`.
 * Expected outcome: `'startup'` or `'newGame'` while that screen is up. Null after a win or loss.
 * Exceptions: None.
 */
let bannerKind: NewGameBannerKind | null = null;

/**
 * Writes the overlay message.
 *
 * Purpose: Startup, New, and game over all use the same element.
 * When to use: The banner helpers only.
 * Expected outcome: The element shows `text`. A missing element is ignored.
 * Exceptions: None.
 */
function writeNewGameBanner(text: string): void {
  const messageEl = document.getElementById('game-over-message');
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.style.display = '';
}

/**
 * Shows a startup or New sentence for the selected tab.
 *
 * Purpose: Those two screens stay distinct, and the tab can change the sentence afterward.
 * When to use: When the overlay opens with no match, and when New opens it during a match.
 * Expected outcome: The matching sentence is shown, and a later tab switch can rewrite it.
 * Exceptions: None.
 */
export function showNewGameBanner(kind: NewGameBannerKind, tab: NewGameMapTab): void {
  bannerKind = kind;
  writeNewGameBanner(newGameBannerText(kind, tab));
}

/**
 * Shows a win or loss and stops the sentence from following the tab.
 *
 * Purpose: Game over does not change when the player switches Global and Regional.
 * When to use: `updateGameOverUI` when the match is over.
 * Expected outcome: The message is `text`. A later `syncNewGameBannerToTab` does nothing until a new-game banner is shown again.
 * Exceptions: None.
 */
export function showGameOverBanner(text: string): void {
  bannerKind = null;
  writeNewGameBanner(text);
}

/**
 * Rewrites the new-game sentence for the tab the player just selected.
 *
 * Purpose: The banner stays aligned with the visible tab.
 * When to use: From the tab click, after the panel changes.
 * Expected outcome: The current startup or New sentence uses `tab`. Game over is left unchanged.
 * Exceptions: None.
 */
export function syncNewGameBannerToTab(tab: NewGameMapTab): void {
  if (bannerKind === null) return;
  writeNewGameBanner(newGameBannerText(bannerKind, tab));
}

/**
 * True while the new-game or game-over overlay is on screen.
 *
 * Purpose: Background planning and a late consult push must not land while that overlay is open.
 * When to use: Before starting a background request, and at the start of a deferred-consult push listener.
 * Expected outcome: True when `#game-over-overlay` is in the document and does not have `hidden`.
 * Exceptions: None. A missing overlay is closed.
 */
export function isNewGameOverlayOpen(): boolean {
  const overlay = document.getElementById('game-over-overlay');
  return overlay != null && !overlay.classList.contains('hidden');
}
