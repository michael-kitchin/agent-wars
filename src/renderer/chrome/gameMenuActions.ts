/**
 * The charts actions behind the game menu's Charts… checkbox.
 *
 * Purpose: The game menu cannot import the charts dialog or replay without an import cycle, so `renderer.ts` builds
 *   these actions here and passes them to `wireGameMenu`. Nothing but `renderer.ts` imports this module.
 * When to use: Only as the actions given to `wireGameMenu`.
 * Expected outcome: Checking the item opens the dialog and unchecking it closes the dialog.
 * Exceptions: None.
 */
import { chartsDialogIsOpen, closeChartsDialogIfOpen, toggleChartsDialog } from '../charts/chartsDialog';

export { chartsDialogIsOpen, closeChartsDialogIfOpen };

/**
 * Opens the charts dialog when it is closed.
 *
 * Purpose: The game menu's Charts… checkbox opens the charts when checked, unlike the charts key, which toggles them.
 * When to use: From the game menu, through the actions `renderer.ts` passes to `wireGameMenu`.
 * Expected outcome: The dialog opens as `toggleChartsDialog` would open it, which still refuses with no match loaded
 *   or another modal open. Nothing happens when it is already open.
 * Exceptions: None.
 */
export function openChartsDialog(): void {
  if (!chartsDialogIsOpen()) toggleChartsDialog();
}
