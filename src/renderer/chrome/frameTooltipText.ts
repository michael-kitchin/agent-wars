/**
 * Purpose: Control tips for the app frame around the map.
 * When to use: Set `data-control-tooltip` from these values. Static markup in `static/index.html` repeats the same characters.
 * Expected outcome: The player sees the sentence unchanged.
 * Exceptions: None.
 */

/**
 * Purpose: Says what the Orders tab shows.
 * When to use: `#console-tab-orders`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const ordersTabTooltipText = 'Show the selected unit and the orders queued for this turn or beat.';

/**
 * Purpose: Says what the Opponent tab shows.
 * When to use: `#console-tab-opponent`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const opponentTabTooltipText = "Show the opponent's model, its tools, and the AI activity log.";

/**
 * Builds the tip for a control this version does not offer.
 *
 * Purpose: Says a disabled placeholder is not a broken control.
 * When to use: The tip host around each disabled placeholder, with the control's visible name, such as "Settings".
 * Expected outcome: For example "Settings is not available in this version."
 * Exceptions: None.
 */
export function unavailableTooltipText(name: string): string {
  return `${name} is not available in this version.`;
}
