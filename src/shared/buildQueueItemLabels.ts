/**
 * Display names for build-queue items.
 *
 * Purpose: Menus share one label for a unit, a fortification, and a credits purchase.
 * When to use: A type select or a multi-hex option. Eligibility suffixes stay with the caller.
 * Expected outcome: `Fortification`, `Credits`, or a capitalized unit type.
 * Exceptions: None.
 */

import { CREDITS_QUEUE_ITEM, CREDITS_QUEUE_ITEM_LABEL } from './creditsRules';
import { FORTIFICATION_QUEUE_ITEM, FORTIFICATION_QUEUE_ITEM_LABEL } from './fortificationRules';
import type { BuildQueueItemType } from './ipc/productionTypes';

/**
 * Returns the menu label for one queue item.
 *
 * Purpose: A credits row and a fortification row are not unit types, so they do not use the unit's own word.
 * When to use: Option text. Append an eligibility suffix after this label when the menu needs one.
 * Expected outcome: `Fortification`, `Credits`, or the unit type with its first letter capitalized.
 * Exceptions: None.
 */
export function formatBuildQueueItemLabel(item: BuildQueueItemType): string {
  if (item === FORTIFICATION_QUEUE_ITEM) return FORTIFICATION_QUEUE_ITEM_LABEL;
  if (item === CREDITS_QUEUE_ITEM) return CREDITS_QUEUE_ITEM_LABEL;
  return item.charAt(0).toUpperCase() + item.slice(1);
}
