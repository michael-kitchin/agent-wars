/**
 * Which sides a top-bar Production and Forces readout includes.
 *
 * Purpose: All sides adds every side still playing. A named view stays on that one side.
 * When to use: `computeTopBarStats` after it has resolved an omitted viewer to the human seat.
 * Expected outcome: Helpers do not read the database or the DOM.
 * Exceptions: None.
 */

import type { BuildUnitType } from './ipc/productionTypes';
import { ALL_BUILD_UNIT_TYPES } from './ipc/productionTypes';
import { getPlayerUnitCountsByType } from './unitCountsByType';

/**
 * One roster row the readout needs.
 *
 * Purpose: A knocked-out side leaves both the totals and the cap multiplier.
 * When to use: The `seats` list already on the top-bar input.
 * Expected outcome: `outTurn` null means the side is still playing.
 * Exceptions: None.
 */
export interface ReadoutSide {
  /**
   * The seat id.
   *
   * Contract: Matches `unit.player` for that side's units.
   * When to use: Filtering control rows and unit counts.
   * Expected outcome: A non-empty id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The turn the side was knocked out, or null while it plays.
   *
   * Contract: Null means the side is still playing.
   * When to use: All-sides totals.
   * Expected outcome: A turn number, or null.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
}

/**
 * The seat ids whose cities and units the readout adds.
 *
 * Purpose: An omitted viewer is already the human seat before this is called. Only a null viewer means every side.
 * When to use: `computeTopBarStats` with its resolved viewer.
 * Expected outcome: A named viewer returns that one id. Null returns every seat whose `outTurn` is null.
 *   Missing seats return an empty list.
 * Exceptions: None.
 */
export function readoutSideIds(
  viewer: string | null,
  seats: readonly ReadoutSide[] | undefined
): readonly string[] {
  if (viewer !== null) return [viewer];
  return (seats ?? []).filter((seat) => seat.outTurn === null).map((seat) => seat.seatId);
}

/**
 * Fielded units of the named sides, by type.
 *
 * Purpose: All sides is the sum of each side's own count. Mercenaries stay out, the same way one side's Forces leaves them out.
 * When to use: After `readoutSideIds`.
 * Expected outcome: Five counts. Neutral is not a seat, so a neutral unit is never included.
 * Exceptions: None.
 */
export function countFieldedForSides(
  units: ReadonlyArray<{ readonly player: string; readonly unitType: string; readonly isMercenary?: boolean }>,
  sideIds: readonly string[]
): Record<BuildUnitType, number> {
  const totals: Record<BuildUnitType, number> = { infantry: 0, armor: 0, naval: 0, air: 0, missile: 0 };
  const list = Array.from(units);
  for (const sideId of sideIds) {
    const counts = getPlayerUnitCountsByType(list, sideId);
    for (const unitType of ALL_BUILD_UNIT_TYPES) totals[unitType] += counts[unitType];
  }
  return totals;
}

/**
 * One side's caps, multiplied by how many sides are still playing.
 *
 * Purpose: All sides shows the most this game size allows those sides together.
 * When to use: Only when the viewer is null. A named viewer keeps the unscaled caps.
 * Expected outcome: Each cap times `sideCount`, and at least one side's cap when the roster is empty.
 * Exceptions: None.
 */
export function scaleCapsForSides(
  caps: Readonly<Record<BuildUnitType, number>>,
  sideCount: number
): Record<BuildUnitType, number> {
  const multiplier = Math.max(1, sideCount);
  const scaled: Record<BuildUnitType, number> = { infantry: 0, armor: 0, naval: 0, air: 0, missile: 0 };
  for (const unitType of ALL_BUILD_UNIT_TYPES) scaled[unitType] = caps[unitType] * multiplier;
  return scaled;
}
