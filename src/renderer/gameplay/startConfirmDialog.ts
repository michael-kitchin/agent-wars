/**
 * Yes/no question before a match that has no models.
 *
 * Purpose: Start must not begin that match until the player says yes.
 * When to use: The Start click when `newGameHasAnyModel` is false.
 * Expected outcome: True for Yes. False for No, Escape, a backdrop click, or a missing dialog.
 * Exceptions: None. A missing dialog logs `console.error` and resolves false.
 */

import { createConfirmDialog } from '../chrome/confirmDialog';

/**
 * Asks whether to start with no models set.
 *
 * Purpose: The match epoch must not advance until this resolves true.
 * When to use: After a blocked start has already returned, and before `advanceRendererMatchEpoch`.
 * Expected outcome: The dialog shows and Yes takes focus, so Enter answers Yes. No, Escape, and the backdrop resolve false.
 * Exceptions: A missing dialog resolves false and logs `console.error`.
 */
export const confirmStartWithNoModels = createConfirmDialog({
  dialogId: 'start-confirm-dialog',
  confirmId: 'start-confirm-yes',
  cancelId: 'start-confirm-no',
  initialFocus: 'confirm',
});
