/**
 * The open-only actions the game menu's Playback… and Metrics… items run.
 *
 * Purpose: The game menu cannot import the charts dialog or replay without an import cycle, so `renderer.ts` builds
 *   these actions here and passes them to `wireGameMenu`. Nothing but `renderer.ts` imports this module.
 * When to use: Only as the actions given to `wireGameMenu`.
 * Expected outcome: Each action opens its surface and never closes it.
 * Exceptions: None.
 */
import { chartsDialogIsOpen, toggleChartsDialog } from '../charts/chartsDialog';

/**
 * Opens the charts dialog when it is closed. It never closes it.
 *
 * Purpose: The game menu's Metrics… item opens the charts, unlike the charts key, which toggles them.
 * When to use: From the game menu, through the actions `renderer.ts` passes to `wireGameMenu`.
 * Expected outcome: The dialog opens as `toggleChartsDialog` would open it, which still refuses with no match loaded
 *   or another modal open. Nothing happens when it is already open.
 * Exceptions: None.
 */
export function openChartsDialog(): void {
  if (!chartsDialogIsOpen()) toggleChartsDialog();
}
