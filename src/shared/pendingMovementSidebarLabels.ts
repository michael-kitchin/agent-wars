/**
 * Lines for pending movement rows: strategic standing orders and tactical march drafts.
 *
 * Purpose: Both kinds of movement row name the destination hex and the hex steps the same way as every other order row.
 * When to use: Rendering the Movement group of the Orders tab and the order chips of the selection panel.
 * Expected outcome: Lines such as `→ E5 · 3h`, built by `formatOrderRowDetail`.
 * Exceptions: None; an unknown code or distance shows a question mark.
 */

import { gridDistance } from 'h3-js';
import { formatOrderRowDetail } from './orderRowDetail';
import { orderTargetHexCode } from './orderTargetHexCode';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';

/**
 * Formats the line for a strategic standing movement order.
 *
 * Purpose: One formatter for every strategic march row.
 * When to use: Strategic rows of the Movement group, with the hex steps the route has left.
 * Expected outcome: `→ <destination code> · <steps>h`. A missing destination shows `?`.
 * Exceptions: None.
 */
export function formatPendingMovementSidebarTargetLabel(destinationH3Index: string | null, distanceHexSteps: number): string {
  return formatOrderRowDetail({
    targetCode: orderTargetHexCode(destinationH3Index, null),
    distanceHexes: distanceHexSteps,
    note: null,
  });
}

/**
 * Formats the line for a tactical march draft, using battle cell codes and battle grid steps.
 *
 * Purpose: Battle marches read like world-map marches, with the destination cell's code.
 * When to use: While a battle is active, for each row of `tacticalPendingMarches`.
 * Expected outcome: `→ <battle cell code> · <steps>h`. The steps are `?` when the sub-unit is missing or the
 *   destination is not a valid cell.
 * Exceptions: None; H3 errors are caught.
 */
export function formatTacticalDraftMarchPendingOrderTargetLabel(
  battle: TacticalBattleSnapshot,
  subUnitId: string,
  destinationH3Index: string
): string {
  const origin = battle.subUnits.find((u) => u.id === subUnitId)?.h3Index;
  let steps: number | null = null;
  if (origin) {
    try {
      steps = gridDistance(origin, destinationH3Index);
    } catch {
      steps = null;
    }
  }
  return formatOrderRowDetail({
    targetCode: orderTargetHexCode(destinationH3Index, battle),
    distanceHexes: steps,
    note: null,
  });
}
