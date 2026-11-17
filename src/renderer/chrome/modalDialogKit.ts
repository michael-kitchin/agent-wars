/**
 * Shared behavior for the renderer's modal dialogs.
 *
 * Purpose: The charts dialog and the in-match Game Options dialog trap Tab and dismiss on a backdrop click the same way. One copy keeps them from drifting apart.
 * When to use: Any modal dialog that needs a Tab trap, a first-focus list, or a click-the-backdrop-to-close rule.
 * Expected outcome: The functions below behave exactly as the per-dialog copies they replaced.
 * Exceptions: None.
 */

/**
 * The enabled, visible controls of a dialog that a key can reach.
 *
 * Purpose: The Tab trap and the first focus use the same list.
 * When to use: `trapTabWithin`, and a dialog choosing its first control to focus.
 * Expected outcome: Buttons, selects, inputs, and `[tabindex]` elements in document order, skipping disabled, tab-index-negative, and hidden ones.
 * Exceptions: None.
 *
 * @param root The dialog element to search.
 */
export function focusableControls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, select, input, [tabindex]')).filter(
    (element) => !(element as HTMLButtonElement).disabled && element.tabIndex >= 0 && element.getClientRects().length > 0
  );
}

/**
 * Options for `trapTabWithin`.
 *
 * Purpose: The charts dialog uses its Close button as its first stop.
 * When to use: The third argument of `trapTabWithin`.
 * Expected outcome: Omitted fields keep the plain first-and-last behavior.
 * Exceptions: None.
 */
export interface TrapTabOptions {
  /**
   * The control that counts as the first stop.
   *
   * Contract: When set, Tab from the last control goes here, and the trap still works when the dialog has no other focusable control.
   * When to use: A dialog whose close button is not the first focusable control in the document.
   * Expected outcome: Omitted, the first focusable control is the first stop, and the trap does nothing when there are none.
   * Exceptions: None.
   */
  readonly firstStop?: HTMLElement;
}

/**
 * Keeps Tab inside a dialog.
 *
 * Purpose: From the last control Tab returns to the first stop, and Shift+Tab from the first stop goes to the last control. Focus outside the dialog comes back in.
 * When to use: A dialog's `keydown` handler, after it has checked that the key is Tab.
 * Expected outcome: Focus never leaves the dialog while it is open. The event's default is prevented only when focus is moved.
 * Exceptions: None.
 *
 * @param event The Tab key event.
 * @param root The dialog element.
 * @param options See `TrapTabOptions`.
 */
export function trapTabWithin(event: KeyboardEvent, root: HTMLElement, options?: TrapTabOptions): void {
  const focusable = focusableControls(root);
  const firstStop = options?.firstStop ?? focusable[0];
  const last = focusable[focusable.length - 1] ?? options?.firstStop;
  if (!firstStop || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === firstStop || !root.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    firstStop.focus();
  }
}

/**
 * Closes a dialog when the player clicks its backdrop, and keeps backdrop events away from the map.
 *
 * Purpose: A click closes the dialog only when both the press and the release were on the backdrop, so a text selection dragged out of the dialog does not close it. Pointer, mouse, double-click, and wheel events on the backdrop must not reach the map underneath.
 * When to use: Once, when the dialog is wired.
 * Expected outcome: A `pointerdown` records whether the press started on the backdrop. The next `click` stops propagating, clears the record, and calls `onDismiss` when the click target is the backdrop and the press started there. Four event types are stopped from propagating.
 * Exceptions: None.
 *
 * @param backdrop The overlay element that fills the screen behind the dialog.
 * @param onDismiss What to run when the backdrop is clicked.
 */
export function wireBackdropDismiss(backdrop: HTMLElement, onDismiss: () => void): void {
  let pressStartedOnBackdrop = false;
  backdrop.addEventListener('pointerdown', (event) => {
    pressStartedOnBackdrop = event.target === backdrop;
  });
  backdrop.addEventListener('click', (event) => {
    event.stopPropagation();
    const fromBackdrop = pressStartedOnBackdrop;
    pressStartedOnBackdrop = false;
    if (event.target === backdrop && fromBackdrop) onDismiss();
  });
  for (const type of ['pointerdown', 'mousedown', 'dblclick', 'wheel']) {
    backdrop.addEventListener(type, (event) => event.stopPropagation());
  }
}
