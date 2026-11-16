/**
 * Whether a dialog is showing that a modal overlay must not open over.
 *
 * Purpose: The charts dialog, and later the replay panel, share one answer to "is another dialog open?".
 * When to use: Before opening a modal overlay, and in the window key handler that decides which dialog Escape belongs to.
 * Expected outcome: Predicates that read the page and change nothing.
 * Exceptions: None.
 */

import { commanderPopoverIsOpen } from '../openRouter/commanderPopover';
import { isGameMenuOpen } from './gameMenu';

/**
 * Reports whether the tactical battles list is open.
 *
 * Purpose: The window keydown listener calls this so Escape can reach that dialog's Ignore handler without the listener closing a build popup or stack callout first.
 * When to use: At the start of the window keydown Escape branch, and when asking whether another dialog blocks a modal overlay.
 * Expected outcome: True when a dialog named "Tactical battles" is in the document; false otherwise. Does not change the page.
 * Exceptions: None.
 */
export function tacticalBattlesDialogIsOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-label="Tactical battles"]') !== null;
}

/**
 * Ids of the overlays that are showing when they lack the `hidden` class.
 *
 * Purpose: Each of these dialogs hides itself by adding the class `hidden`.
 * When to use: `blockingDialogIsOpen`.
 * Expected outcome: The knockout dialog, the two confirmation dialogs, and the tactical annihilation overlay.
 * Exceptions: None.
 */
const CLASS_HIDDEN_DIALOG_IDS = [
  'knockout-dialog',
  'start-confirm-dialog',
  'load-confirm-dialog',
  'tactical-annihilation-overlay',
] as const;

/**
 * Reports whether a dialog is showing that a modal overlay must not open over.
 *
 * Purpose: The charts must not stack on a choice the player has to make. The new-game panel is left out on purpose, because at game over it shows the standings and the charts must open over it.
 * When to use: Before opening the charts dialog.
 * Expected outcome: True when the tactical battles list, a melee intercept frame, the knockout or confirmation dialogs, the tactical annihilation overlay, the game options popover, the game menu, or the commander popover is showing.
 * Exceptions: None.
 */
export function blockingDialogIsOpen(): boolean {
  if (tacticalBattlesDialogIsOpen()) return true;
  if (document.querySelector('.melee-intercept-frame') !== null) return true;
  if (CLASS_HIDDEN_DIALOG_IDS.some((id) => document.getElementById(id)?.classList.contains('hidden') === false)) return true;
  const optionsPopover = document.getElementById('new-game-options-popover');
  if (optionsPopover !== null && !optionsPopover.hidden) return true;
  return isGameMenuOpen() || commanderPopoverIsOpen();
}
