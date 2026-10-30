/**
 * Hire-marker rows and the button that opens the hire panel.
 *
 * Purpose: The build-entry layer stays small. Hire buttons are built here.
 * When to use: From `syncBuildEntryButton` for a hex that is not a build hex.
 * Expected outcome: A row only when the hex is in the hire set and its center is near the view.
 * Exceptions: None.
 */

import { formatProductionCapacityAmount } from '../../shared/economySymbols';
import { formatHireEntryAriaLabel, formatHireEntryLabel } from '../../shared/mercenaryRules';
import { getUrbanProductionCapacityForHex } from './productionOverlayHelpers';
import { hireEntryTooltipText } from '../chrome/hireTooltipText';

/**
 * Extra pixels around the map that still receive a Hire marker.
 *
 * Purpose: A marker just outside the view should not pop in a frame late.
 * When to use: `isPointInMapView` while rebuilding the hire layer.
 * Expected outcome: 40.
 * Exceptions: None.
 */
export const HIRE_ENTRY_VIEW_MARGIN_PX = 40;

/**
 * One hire button's position and label.
 *
 * Purpose: The layer key and the button HTML share this row.
 * When to use: The return of `hireEntryRowForHex`.
 * Expected outcome: A hire row with no capacity class and no selected state.
 * Exceptions: None.
 */
export interface HireEntryRow {
  /**
   * Hex the button opens.
   *
   * Contract: A strategic hex index.
   * When to use: The button's data attribute.
   * Expected outcome: The hex that was requested.
   * Exceptions: None.
   */
  readonly h3: string;
  /**
   * Button text.
   *
   * Contract: The production figure, with no hire suffix.
   * When to use: The button body.
   * Expected outcome: The production figure alone.
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * Horizontal center in container pixels.
   *
   * Contract: Rounded.
   * When to use: The button's `left`.
   * Expected outcome: The hex center.
   * Exceptions: None.
   */
  readonly left: number;
  /**
   * Vertical center in container pixels.
   *
   * Contract: Rounded. Hire markers are not pushed down for infrastructure.
   * When to use: The button's `top`.
   * Expected outcome: The hex center.
   * Exceptions: None.
   */
  readonly top: number;
  /**
   * Whether the button uses the capacity class.
   *
   * Contract: Always false for a hire row.
   * When to use: The layer key.
   * Expected outcome: False.
   * Exceptions: None.
   */
  readonly hasCapacity: false;
  /**
   * Whether the button is pressed.
   *
   * Contract: Always false. A hire hex is not part of a multi-hex selection.
   * When to use: The layer key.
   * Expected outcome: False.
   * Exceptions: None.
   */
  readonly selected: false;
  /**
   * Which button HTML to emit.
   *
   * Contract: Always `hire` from this helper.
   * When to use: The layer key and the HTML branch.
   * Expected outcome: `hire`.
   * Exceptions: None.
   */
  readonly kind: 'hire';
}

/**
 * Reports whether a point is inside the map, plus a margin.
 *
 * Purpose: Hire markers outside the view are not created on a pan frame.
 * When to use: With Leaflet's `map.getSize()` and `HIRE_ENTRY_VIEW_MARGIN_PX`.
 * Expected outcome: True when both axes are within the size expanded by the margin.
 * Exceptions: None.
 */
export function isPointInMapView(
  point: { readonly x: number; readonly y: number },
  size: { readonly x: number; readonly y: number },
  margin: number
): boolean {
  return point.x >= -margin && point.y >= -margin && point.x <= size.x + margin && point.y <= size.y + margin;
}

/**
 * Builds a hire row when the hex is in the set and on screen.
 *
 * Purpose: Build rows are not culled. Hire rows are.
 * When to use: For an explored hex that is not a human build hex.
 * Expected outcome: The row, or null when the hex is not a hire hex or its center is outside the margin.
 * Exceptions: None.
 */
export function hireEntryRowForHex(
  h3Index: string,
  center: { readonly x: number; readonly y: number },
  mapSize: { readonly x: number; readonly y: number },
  hireHexes: ReadonlySet<string>
): HireEntryRow | null {
  if (!hireHexes.has(h3Index)) return null;
  if (!isPointInMapView(center, mapSize, HIRE_ENTRY_VIEW_MARGIN_PX)) return null;
  const capacityText = formatProductionCapacityAmount(getUrbanProductionCapacityForHex(h3Index).toLocaleString());
  return {
    h3: h3Index,
    label: formatHireEntryLabel(capacityText),
    left: Math.round(center.x),
    top: Math.round(center.y),
    hasCapacity: false,
    selected: false,
    kind: 'hire',
  };
}

/**
 * HTML for one Hire marker.
 *
 * Purpose: The marker uses the build-entry class plus `hire-entry-btn`.
 * When to use: When the row's kind is `hire`.
 * Expected outcome: A button whose tip and accessible name come from the hire copy.
 * Exceptions: None.
 */
export function hireEntryButtonHtml(row: {
  readonly h3: string;
  readonly label: string;
  readonly left: number;
  readonly top: number;
}): string {
  return `<button type="button" class="build-entry-btn hire-entry-btn" data-h3-index="${row.h3}" data-control-tooltip="${hireEntryTooltipText}" style="left:${row.left}px;top:${row.top}px;transform:translate(-50%, -50%);" aria-label="${formatHireEntryAriaLabel(row.h3)}">${row.label}</button>`;
}
