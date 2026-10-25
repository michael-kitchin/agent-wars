import { planningToggleLabel } from '../../shared/commanderPlanningStatus';

/**
 * Writes the planning button's pressed state and the label that matches it.
 *
 * Purpose: The button reads Stop while planning is on and Start while it is off. Every write of that pressed state uses this, so the word cannot drift from it.
 * When to use: A click, a new-game start, and every refresh of whether the button can be clicked.
 * Expected outcome: `aria-pressed` is true only when `planningOn` is true, and the button text is `planningToggleLabel`.
 * Exceptions: None.
 */
export function setPlanningTogglePressed(button: HTMLElement, planningOn: boolean): void {
  button.setAttribute('aria-pressed', planningOn ? 'true' : 'false');
  button.textContent = planningToggleLabel(planningOn);
}

/**
 * The installed refresh for whether the planning button can be clicked.
 *
 * Purpose: The entry callbacks own the button. This module only forwards the call.
 * When to use: Set once when the renderer callbacks load.
 * Expected outcome: Null until that install.
 * Exceptions: None.
 */
let syncRunToggle: (() => Promise<void>) | null = null;

/**
 * Installs the Start refresh.
 *
 * Purpose: Seat changes outside the OpenRouter controls can enable or disable Start.
 * When to use: Once, from the renderer entry callbacks, after the sync function exists.
 * Expected outcome: Later `syncOpenRouterRunToggle` calls `sync`.
 * Exceptions: None.
 */
export function setOpenRouterRunToggleSync(sync: () => Promise<void>): void {
  syncRunToggle = sync;
}

/**
 * Refreshes whether Start can be clicked.
 *
 * Purpose: A commander save or a loaded match can change which seats have a key and a model.
 * When to use: After a seat commander is stored, after a match snapshot is applied, and after a new game starts.
 * Expected outcome: The button can be clicked when an active seat has a key and a model. Otherwise it is disabled. If planning was on, it turns off and the label returns to Start.
 * Exceptions: None. A call before the install resolves without changing the button.
 */
export function syncOpenRouterRunToggle(): Promise<void> {
  return syncRunToggle?.() ?? Promise.resolve();
}
