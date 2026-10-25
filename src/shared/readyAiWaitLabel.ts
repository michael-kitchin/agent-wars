/**
 * The Ready button's wait text.
 *
 * Purpose: The button shows how long the longest consult has run and how many commanders are still planning.
 * When to use: `setReadyButtonLabelAiWait`. The clock is already formatted.
 * Expected outcome: `AI: {elapsed} (x{n})`. A count below 1 is shown as 1.
 * Exceptions: None. This module does not import the logger.
 */

/**
 * Builds the Ready wait label.
 *
 * Purpose: The screen owns the clock. This function only joins it to the planning count.
 * When to use: While any commander is planning.
 * Expected outcome: The label string. `pendingCount` below 1 becomes 1.
 * Exceptions: None.
 */
export function readyAiWaitLabel(elapsedLabel: string, pendingCount: number): string {
  const shown = pendingCount < 1 ? 1 : pendingCount;
  return `AI: ${elapsedLabel} (x${shown})`;
}
