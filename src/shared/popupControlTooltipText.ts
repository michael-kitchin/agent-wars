/**
 * Tips for the build popup, the hire panel, and the stack callout controls that did not already have one.
 *
 * Purpose: Those controls share one catalog so the renderer does not repeat the sentences.
 * When to use: Set `data-control-tooltip` from these values.
 * Expected outcome: The player sees the sentence unchanged.
 * Exceptions: None.
 */

/**
 * Tip for closing the build or hire popup.
 *
 * Purpose: The close control is the same on every build and hire paint.
 * When to use: Each build and hire close button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const buildPopupCloseTooltipText = 'Close this popup.';

/**
 * Tip for removing one single-hex queue row.
 *
 * Purpose: The row leaves only that hex's queue.
 * When to use: The remove button on a single-hex queue row.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const singleHexQueueRemoveTooltipText = 'Remove this row from the queue.';

/**
 * Tip for removing one multi-hex template row.
 *
 * Purpose: The row leaves every selected hex.
 * When to use: The remove button on a multi-hex queue row.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const multiHexQueueRemoveTooltipText = 'Remove this row on every selected hex.';

/**
 * Tip for the Build tab.
 *
 * Purpose: The tab shows the queue and hides hiring.
 * When to use: The Build tab button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const buildTabTooltipText = 'Show the build queue for this hex.';

/**
 * Tip for the Hire tab.
 *
 * Purpose: The tab shows hiring and hides the queue.
 * When to use: The Hire tab button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const hireTabTooltipText = 'Show hiring for this hex.';

/**
 * Tip for closing the stack callout.
 *
 * Purpose: The close control dismisses the unit list.
 * When to use: The stack callout close button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const stackCalloutCloseTooltipText = 'Close this list.';

/**
 * Tip for a row whose unit is not selected.
 *
 * Purpose: A plain click selects that unit alone and closes the list.
 * When to use: The row toggle while the unit is not selected.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const stackUnitToggleUnselectedTooltipText =
  'Select only this unit and close the list. Shift toggles it and leaves the list open.';

/**
 * Tip for a row whose unit is selected.
 *
 * Purpose: A plain click removes that unit and closes the list.
 * When to use: The row toggle while the unit is selected.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const stackUnitToggleSelectedTooltipText =
  'Remove this unit from the selection and close the list. Shift toggles it and leaves the list open.';

/**
 * Tip for Select All.
 *
 * Purpose: Without Shift, the All button replaces the selection and closes the list.
 * When to use: The `+ All` button while Shift is up.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const stackSelectAllTooltipText = 'Select every unit you can select in this hex and close the list.';

/**
 * Tip for Add All.
 *
 * Purpose: With Shift, `+ All` adds units and leaves the list open.
 * When to use: The `+ All` button while Shift is down.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const stackAddAllTooltipText = 'Add every unit you can select in this hex. The list stays open.';

/**
 * Tip for Remove All.
 *
 * Purpose: With Shift, `- All` removes units and leaves the list open.
 * When to use: The `- All` button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const stackRemoveAllTooltipText = 'Remove every unit you can select in this hex. The list stays open.';

/**
 * Picks the row-toggle tip from the current selection.
 *
 * Purpose: The glyph and the tip stay on the same condition.
 * When to use: When a stack row button is created or its glyph is refreshed.
 * Expected outcome: The selected sentence when the unit is selected, otherwise the unselected sentence.
 * Exceptions: None.
 */
export function stackUnitToggleTooltipText(selected: boolean): string {
  return selected ? stackUnitToggleSelectedTooltipText : stackUnitToggleUnselectedTooltipText;
}
