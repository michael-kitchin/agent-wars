/**
 * Lets a commander save and a new-game start refresh Run.
 *
 * Purpose: Those screens cannot import the entry callbacks, and Run's enabled state has to follow the seats.
 * When to use: The entry callbacks install the sync. A seat save and a successful new game call it.
 * Expected outcome: A call before the install does nothing.
 * Exceptions: None.
 */

/**
 * The installed Run refresh.
 *
 * Purpose: The entry callbacks own the button. This module only forwards the call.
 * When to use: Set once when the renderer callbacks load.
 * Expected outcome: Null until that install.
 * Exceptions: None.
 */
let syncRunToggle: (() => Promise<void>) | null = null;

/**
 * Installs the Run refresh.
 *
 * Purpose: Seat changes outside the OpenRouter controls can enable or disable Run.
 * When to use: Once, from the renderer entry callbacks, after the sync function exists.
 * Expected outcome: Later `syncOpenRouterRunToggle` calls `sync`.
 * Exceptions: None.
 */
export function setOpenRouterRunToggleSync(sync: () => Promise<void>): void {
  syncRunToggle = sync;
}

/**
 * Refreshes whether Run can be clicked.
 *
 * Purpose: A commander save or a loaded match can change which seats have a key and a model.
 * When to use: After a seat commander is stored, after a match snapshot is applied, and after a new game starts.
 * Expected outcome: Run is enabled when an active seat has a key and a model. Otherwise it is disabled, and a pressed Run is turned off.
 * Exceptions: None. A call before the install resolves without changing the button.
 */
export function syncOpenRouterRunToggle(): Promise<void> {
  return syncRunToggle?.() ?? Promise.resolve();
}
