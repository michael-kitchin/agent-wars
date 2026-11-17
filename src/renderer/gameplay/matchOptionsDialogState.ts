/**
 * Whether the in-match Game Options dialog is open, and a way to close it from anywhere.
 *
 * Purpose: The new-game screen and the auto-advance check must ask about the dialog without importing it, which would add an import cycle.
 * When to use: `matchOptionsDialogIsOpen` before an action the dialog must block. `closeMatchOptionsDialogIfOpen` before the new-game screen resets the shared controls, and before a dialog that needs the player's choice. `refreshMatchOptionsDialogIfOpen` when a Ready request finishes.
 * Expected outcome: Plain DOM reads and two stored callbacks. This module imports nothing.
 * Exceptions: None.
 */

/**
 * The dialog's close function, once the dialog is wired.
 *
 * Purpose: The dialog module registers it, so callers here never import that module.
 * When to use: `registerMatchOptionsDialogCloser` sets it. `closeMatchOptionsDialogIfOpen` calls it.
 * Expected outcome: Null until the dialog is wired.
 * Exceptions: None.
 */
let registeredCloser: (() => void) | null = null;

/**
 * Reports whether Game Options is showing as the in-match dialog.
 *
 * Purpose: The dialog reuses the new-game popover. Match mode is marked by `data-mode="match"` on it.
 * When to use: Before pressing Ready on its own, and in any check that must not act under the dialog.
 * Expected outcome: True when `#new-game-options-popover` has `data-mode="match"` and is not hidden.
 * Exceptions: None.
 */
export function matchOptionsDialogIsOpen(): boolean {
  const popover = document.getElementById('new-game-options-popover');
  return popover !== null && popover.dataset.mode === 'match' && !popover.hidden;
}

/**
 * Stores the dialog's close function.
 *
 * Purpose: Lets `closeMatchOptionsDialogIfOpen` reach the dialog without an import.
 * When to use: Once, from the dialog's wiring.
 * Expected outcome: A later `closeMatchOptionsDialogIfOpen` calls `close`.
 * Exceptions: None.
 */
export function registerMatchOptionsDialogCloser(close: () => void): void {
  registeredCloser = close;
}

/**
 * Closes the in-match dialog when it is open.
 *
 * Purpose: The new-game screen resets the shared controls, and the dialog must put its saved values back first. A prompt that needs the player's choice must not sit under the dialog or lose its keys to it.
 * When to use: Just before the new-game screen shows or resets its option controls, and just before the tactical battles list, the knockout dialog, the annihilation or AI-only result, or a confirmation shows.
 * Expected outcome: The registered closer runs when the dialog is open. Otherwise nothing happens.
 * Exceptions: None.
 */
export function closeMatchOptionsDialogIfOpen(): void {
  if (matchOptionsDialogIsOpen()) registeredCloser?.();
}

/**
 * The dialog's re-check function, once the dialog is wired.
 *
 * Purpose: The Ready handler asks the dialog to re-read the match without importing it.
 * When to use: `registerMatchOptionsDialogRefresher` sets it. `refreshMatchOptionsDialogIfOpen` calls it.
 * Expected outcome: Null until the dialog is wired.
 * Exceptions: None.
 */
let registeredRefresher: (() => void) | null = null;

/**
 * Stores the dialog's re-check function.
 *
 * Purpose: Lets `refreshMatchOptionsDialogIfOpen` reach the dialog without an import.
 * When to use: Once, from the dialog's wiring.
 * Expected outcome: A later `refreshMatchOptionsDialogIfOpen` calls `refresh`.
 * Exceptions: None.
 */
export function registerMatchOptionsDialogRefresher(refresh: () => void): void {
  registeredRefresher = refresh;
}

/**
 * Asks the open dialog to re-read the live match.
 *
 * Purpose: A dialog opened read-only while a turn resolved becomes editable once planning resumes.
 * When to use: When a Ready request finishes.
 * Expected outcome: The registered refresher runs when the dialog is open. Otherwise nothing happens.
 * Exceptions: None.
 */
export function refreshMatchOptionsDialogIfOpen(): void {
  if (matchOptionsDialogIsOpen()) registeredRefresher?.();
}
