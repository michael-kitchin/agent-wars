/**
 * The question asked before a load replaces the match in progress.
 *
 * Purpose: Cancel takes focus, because Load replaces that match.
 * When to use: Load game on the menu and the new-game bar when a match is still being played.
 * Expected outcome: True for Load…. False for Cancel, Escape, a backdrop click, or a missing dialog.
 * Exceptions: None. A missing dialog logs `console.error` and resolves false.
 */

import { createConfirmDialog } from '../chrome/confirmDialog';

/**
 * Asks whether to replace the match in progress.
 *
 * Purpose: A load over a live match, including one under the new-game screen, waits for this answer.
 * When to use: After `loadNeedsConfirm` is true and before `game:loadGame`.
 * Expected outcome: The dialog shows and Cancel takes focus. Load… resolves true. Cancel, Escape, and the backdrop resolve false.
 * Exceptions: A missing dialog resolves false and logs `console.error`.
 */
export const confirmLoadOverMatch = createConfirmDialog({
  dialogId: 'load-confirm-dialog',
  confirmId: 'load-confirm-yes',
  cancelId: 'load-confirm-no',
  initialFocus: 'cancel',
});
