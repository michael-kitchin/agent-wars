/**
 * Keeps a type dropdown's tip matched to its current value.
 *
 * Purpose: The closed list describes the selected item, and an empty value keeps the how-to sentence.
 * When to use: After assigning the select's value, and when the player changes it.
 * Expected outcome: `data-control-tooltip` is the item sentence, or `emptyText` when the value is not a queue item.
 * Exceptions: None. This module does not import the logger.
 */

import { queueItemTooltipText } from '../../shared/queueItemTooltipText';

/**
 * Stores the tip for the select's current value.
 *
 * Purpose: Callers pass the how-to sentence that applies when nothing is selected.
 * When to use: The single-hex, multi-hex, and hire type selects.
 * Expected outcome: The attribute is the item sentence, or `emptyText` when `queueItemTooltipText` returns null.
 * Exceptions: None.
 */
export function syncQueueItemSelectTooltip(select: HTMLSelectElement, emptyText: string): void {
  select.setAttribute('data-control-tooltip', queueItemTooltipText(select.value) ?? emptyText);
}
