/**
 * Control tips for Hire markers and the hire panel.
 *
 * Purpose: Each hire control says what it does in one sentence.
 * When to use: The marker, the type select, the count field, the Hire button, and the remove button.
 * Expected outcome: The sentence stored on `data-control-tooltip`.
 * Exceptions: None.
 */

/**
 * Tip for a Hire marker.
 *
 * Purpose: The marker opens hiring and does not join a multi-hex build selection.
 * When to use: Each hire-entry button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const hireEntryTooltipText =
  'Click to hire on this hex. Shift-click does not add it to a group of build queues, and the click does nothing during playback.';

/**
 * Tip for the raise type select.
 *
 * Purpose: The select chooses which unit the order will raise.
 * When to use: The raise section's type select.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const hireTypeTooltipText = 'Choose the unit type this order raises.';

/**
 * Tip for the raise count field.
 *
 * Purpose: The count is how many of that type the order asks for.
 * When to use: The raise section's count input.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const hireCountTooltipText = 'How many of that type to raise, from 1 to 99.';

/**
 * Tip for a Hire button.
 *
 * Purpose: The button stores the order and does not spend credits yet.
 * When to use: Each Hire button in the panel.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const hireSubmitTooltipText =
  'Place this hire order. It is charged at the end of the turn if it can be filled.';

/**
 * Tip for removing a hire order.
 *
 * Purpose: The order can be taken back until Ready.
 * When to use: Each pending order's remove button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const hireRemoveTooltipText = 'Remove this hire order.';
