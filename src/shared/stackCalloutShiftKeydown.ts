/**
 * Whether Shift keydown should rebuild stack-callout chrome (Select All vs Add All / Remove All).
 *
 * Purpose: Holding Shift generates key-repeat events. Rebuilding the open stack popup on each
 * repeat replaces the button under the cursor and cancels the subsequent click, so All and
 * per-unit actions appear to do nothing. Strategic and tactical battles share that popup.
 * When to use: Window Shift keydown, before applying shift-pressed popover rules.
 * Expected outcome: `true` only on the inactive-to-active transition; repeats while already held return `false`.
 * Exceptions: None.
 */
export function shouldRefreshStackCalloutOnShiftKeydown(shiftKeyAlreadyActive: boolean): boolean {
  return !shiftKeyAlreadyActive;
}
