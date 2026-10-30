/**
 * The sentence for one chosen build or hire item.
 *
 * Purpose: A type list describes the selected item, and every queue item has exactly one sentence.
 * When to use: The closed type dropdown in the build popup and the hire panel.
 * Expected outcome: The sentence for a known item, or null when the value is empty or unknown.
 * Exceptions: None.
 */

import { isBuildQueueItemType, type BuildQueueItemType } from './ipc/productionTypes';

/**
 * One sentence per queue item.
 *
 * Purpose: A new queue item fails to compile until it has a sentence.
 * When to use: `queueItemTooltipText` only.
 * Expected outcome: The words the player sees for that item.
 * Exceptions: None.
 */
const QUEUE_ITEM_TOOLTIP_TEXT: Record<BuildQueueItemType, string> = {
  infantry: 'The cheapest unit. It cannot shoot on the world map, and it can shoot in a battle.',
  armor: 'Costs more than infantry, shoots one hex on the world map, and cannot enter mountains, wetlands, or arctic.',
  naval: 'Needs a seaport, shoots two hexes on the world map, and can carry land units.',
  air: 'Strikes from an airport and does not march. A hex needs an airport to build it.',
  missile: 'Launches once on the world map and is then gone. It cannot fire in a battle.',
  fortification: 'Protects one city cell. It is not a unit, and a hit removes it before a unit.',
  credits: 'Adds 20 credits to the treasury. It is not a unit and does not count toward a unit cap.',
};

/**
 * Returns the description of a selected queue item.
 *
 * Purpose: The type dropdown's tip changes with its value.
 * When to use: After the select's value is known. An empty or unknown value uses the caller's how-to sentence instead.
 * Expected outcome: The sentence, or null when `isBuildQueueItemType` rejects the value.
 * Exceptions: None.
 */
export function queueItemTooltipText(value: string): string | null {
  if (!isBuildQueueItemType(value)) return null;
  return QUEUE_ITEM_TOOLTIP_TEXT[value];
}
