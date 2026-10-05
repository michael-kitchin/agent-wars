/**
 * Timer that shows the Bonuses tooltip for a single-unit token.
 *
 * Purpose: A single-unit token shows the Bonuses tooltip after the same dwell as the hex tooltip. The unit list stays a click.
 * When to use: From the main-map pointer handler.
 * Expected outcome: The dwell fires only while the pointer is still on that token. A stack is left to the click path.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { HEX_DETAILS_TOOLTIP_DELAY_MS } from '../core/constants';
import { decideSingleUnitHoverCallout } from '../../shared/singleUnitHoverCallout';
import { formatLiveUnitOriginTooltipHtml, resolveUnitOrigin } from '../core/unitOriginFlags';
import {
  dismissMapUnitOriginTooltip,
  moveMapUnitOriginTooltip,
  presentUnitOriginTooltip,
} from '../core/unitOriginTooltip';

/**
 * Dwell timer for the hex currently being hovered, or null when none is waiting.
 *
 * Purpose: A later sample for a different token must cancel this before it opens the tooltip in the wrong place.
 * When to use: Only inside this module.
 * Expected outcome: Null whenever no one-unit dwell is in progress.
 * Exceptions: None.
 */
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Hex the dwell timer will open, or null when no dwell is waiting.
 *
 * Purpose: A second sample on the same hex must not restart the dwell.
 * When to use: Only inside this module.
 * Expected outcome: Matches the hex passed to the timer, or null after the timer fires or is cleared.
 * Exceptions: None.
 */
let pendingH3: string | null = null;

/**
 * Hex whose Bonuses tooltip this hover opened, or null when it is closed.
 *
 * Purpose: Leaving that token hides the Bonuses tooltip. A click-opened stack list is separate.
 * When to use: Inside this module. Cleared by `forgetSingleUnitHoverCallout`.
 * Expected outcome: Null after the tooltip is hidden.
 * Exceptions: None.
 */
let hoverOpenedH3: string | null = null;

/**
 * Latest units the pointer handler reported, so the dwell reads the hex at fire time.
 *
 * Pointer position of the latest sample, read when the dwell fires.
 *
 * Purpose: The pointer can move across the token during the one-second wait. The tooltip should open where the pointer is then.
 * When to use: Written by `applySingleUnitHoverCallout` and read by the dwell timer.
 * Expected outcome: Matches the latest pointer sample for the token that armed the hover.
 * Exceptions: None.
 */
let hoverClientX = 0;

/**
 * Pointer position of the latest sample, vertical component.
 *
 * Purpose: Paired with `hoverClientX`.
 * When to use: Written by `applySingleUnitHoverCallout` and read by the dwell timer.
 * Expected outcome: Matches the latest pointer sample for the token that armed the hover.
 * Exceptions: None.
 */
let hoverClientY = 0;

/**
 * Whether the previous sample was holding the hex tooltip off for a token.
 *
 * Purpose: Leaving the token onto the rest of the same hex must start the hex-tooltip dwell, which only starts when the hex changes.
 * When to use: Inside `syncMapSingleUnitHover`.
 * Expected outcome: True after a sample that suppressed the hex tooltip, until a sample that does not.
 * Exceptions: None.
 */
let holdingHexTooltip = false;

/**
 * Latest units the pointer handler reported, so the dwell reads the hex at fire time.
 *
 * Purpose: A unit can leave the hex during the one-second wait. The tooltip must not open for a snapshot that is no longer true.
 * When to use: Written by `syncMapSingleUnitHover` and read when the dwell fires.
 * Expected outcome: Empty until the first pointer sample.
 * Exceptions: None.
 */
let drawnNow: {
  readonly unitsToDraw: GameStateSnapshot['units'];
  readonly movingIds: Set<string> | undefined;
  readonly unitsHidden: boolean;
} = { unitsToDraw: [], movingIds: undefined, unitsHidden: false };

/**
 * Drops a dwell that has not shown the tooltip yet.
 *
 * Purpose: A newer sample for another token must not let the previous timer finish.
 * When to use: Before starting a dwell, and when the pointer leaves the token that was waiting.
 * Expected outcome: The pending timer is cleared. A tooltip that is already open stays up until `forgetSingleUnitHoverCallout`.
 * Exceptions: None.
 */
function cancelSingleUnitHoverCalloutPending(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pendingH3 = null;
}

/**
 * Forgets both the dwell and the hover-opened hex.
 *
 * Purpose: A press on the map, or leaving the token, must not leave a stale dwell that opens the tooltip later.
 * When to use: From the main-map press handler, and when the pointer sample says to dismiss.
 * Expected outcome: No dwell remains and the Bonuses tooltip hides when no flag hover owns it.
 * Exceptions: None.
 */
export function forgetSingleUnitHoverCallout(): void {
  cancelSingleUnitHoverCalloutPending();
  hoverOpenedH3 = null;
  dismissMapUnitOriginTooltip();
}

/**
 * Applies one pointer sample to the one-unit token tooltip.
 *
 * Purpose: Starts the dwell on a one-unit token, and hides the Bonuses tooltip when the pointer leaves it.
 * When to use: Every main-map pointer move, and when the pointer leaves the map.
 * Expected outcome: `suppressHexTooltip` is true only while the pointer is on that token.
 * Exceptions: None.
 */
function applySingleUnitHoverCallout(input: {
  readonly h3: string | null;
  readonly stationaryUnitCount: number;
  readonly pointerOnToken: boolean;
  readonly blocked: boolean;
  readonly clientX: number;
  readonly clientY: number;
}): { readonly suppressHexTooltip: boolean } {
  hoverClientX = input.clientX;
  hoverClientY = input.clientY;
  const decision = decideSingleUnitHoverCallout({
    h3: input.h3,
    stationaryUnitCount: input.stationaryUnitCount,
    pointerOnToken: input.pointerOnToken,
    pendingH3,
    hoverOpenedH3,
    blocked: input.blocked,
  });
  if (decision.clearPending) cancelSingleUnitHoverCalloutPending();
  if (decision.dismissOpen) forgetSingleUnitHoverCallout();
  if (decision.schedule && input.h3 !== null) {
    const h3 = input.h3;
    cancelSingleUnitHoverCalloutPending();
    pendingH3 = h3;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      pendingH3 = null;
      hoverOpenedH3 = h3;
      showTokenTooltip(h3, hoverClientX, hoverClientY);
      const tooltip = document.getElementById('unit-origin-tooltip');
      if (!tooltip || tooltip.classList.contains('hidden')) hoverOpenedH3 = null;
    }, HEX_DETAILS_TOOLTIP_DELAY_MS);
  } else if (hoverOpenedH3 !== null && hoverOpenedH3 === input.h3) {
    moveMapUnitOriginTooltip(input.clientX, input.clientY);
  }
  return { suppressHexTooltip: decision.suppressHexTooltip };
}

/**
 * Shows the Bonuses tooltip for the one stationary unit on `h3`.
 *
 * Purpose: The dwell reads the units at fire time, so a unit that left during the wait does not get a tooltip.
 * When to use: When the one-unit token dwell fires.
 * Expected outcome: The tooltip shows when exactly one stationary unit remains and it has an origin. Otherwise it stays hidden.
 * Exceptions: None.
 */
function showTokenTooltip(h3: string, clientX: number, clientY: number): void {
  const units = stationaryUnitsOnHex(h3, drawnNow.unitsToDraw, drawnNow.movingIds, drawnNow.unitsHidden);
  const unit = units.length === 1 ? units[0] : undefined;
  const html = unit ? formatLiveUnitOriginTooltipHtml(unit.id) : null;
  if (!html) return;
  presentUnitOriginTooltip(html, clientX, clientY);
}

/**
 * Units on one hex that are drawn and not currently moving.
 *
 * Purpose: A unit sliding between hexes is not a stack-mate, matching the click hit test.
 * When to use: `syncMapSingleUnitHover` and the dwell, so both read the same set.
 * Expected outcome: Empty when unit markers are hidden, or when `h3` is null.
 * Exceptions: None.
 */
function stationaryUnitsOnHex(
  h3: string | null,
  unitsToDraw: GameStateSnapshot['units'],
  movingIds: Set<string> | undefined,
  unitsHidden: boolean
): GameStateSnapshot['units'] {
  if (h3 === null || unitsHidden) return [];
  return unitsToDraw.filter((unit) => unit.h3Index === h3 && !movingIds?.has(unit.id));
}

/**
 * Updates the one-unit token tooltip and hides the hex tooltip while the pointer is on that token.
 *
 * Purpose: One call from each map pointer path, so the Bonuses tooltip and the hex tooltip do not both open on the token.
 * When to use: After the pointer's hex is known, including when the pointer leaves the map (`h3` null).
 * Expected outcome: A one-unit token starts or keeps the dwell and the hex tooltip stays hidden. Any other sample drops the dwell and hides a hover-opened tooltip. The return is true when this sample released the hex tooltip after the previous sample had held it.
 * Exceptions: None.
 */
export function syncMapSingleUnitHover(input: {
  readonly h3: string | null;
  readonly unitsToDraw: GameStateSnapshot['units'];
  readonly movingIds: Set<string> | undefined;
  readonly unitsHidden: boolean;
  readonly pointerOnToken: boolean;
  readonly blocked: boolean;
  readonly clientX: number;
  readonly clientY: number;
  readonly clearHexTooltip: () => void;
  readonly hideHexTooltip: () => void;
}): boolean {
  drawnNow = {
    unitsToDraw: input.unitsToDraw,
    movingIds: input.movingIds,
    unitsHidden: input.unitsHidden,
  };
  const onHex = stationaryUnitsOnHex(input.h3, input.unitsToDraw, input.movingIds, input.unitsHidden);
  const lone = onHex.length === 1 ? onHex[0] : undefined;
  const hover = applySingleUnitHoverCallout({
    h3: input.h3,
    stationaryUnitCount: onHex.length,
    pointerOnToken: input.pointerOnToken && lone !== undefined && resolveUnitOrigin(lone.id) !== null,
    blocked: input.blocked,
    clientX: input.clientX,
    clientY: input.clientY,
  });
  const releasedHexTooltip = holdingHexTooltip && !hover.suppressHexTooltip;
  holdingHexTooltip = hover.suppressHexTooltip;
  if (hover.suppressHexTooltip) {
    input.clearHexTooltip();
    input.hideHexTooltip();
  }
  return releasedHexTooltip;
}
