/**
 * Whether the in-match Game Options dialog is open, and a way to close it from anywhere.
 *
 * Purpose: The new-game screen and the auto-advance check must ask about the dialog without importing it, which would add an import cycle.
 * When to use: `matchOptionsDialogIsOpen` before an action the dialog must block. `closeMatchOptionsDialogIfOpen` before the new-game screen resets the shared controls.
 * Expected outcome: Plain DOM reads and one stored callback. This module imports nothing.
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
 * Purpose: The new-game screen resets the shared controls, and the dialog must put its saved values back first.
 * When to use: Just before the new-game screen shows or resets its option controls.
 * Expected outcome: The registered closer runs when the dialog is open. Otherwise nothing happens.
 * Exceptions: None.
 */
export function closeMatchOptionsDialogIfOpen(): void {
  if (matchOptionsDialogIsOpen()) registeredCloser?.();
}
