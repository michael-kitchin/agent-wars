/**
 * Stroke widths for ranged/air-strike perimeter and connector overlays.
 */

import {
  ORDER_LINE_WIDTH,
  RANGE_PERIMETER_AIR_STRIKE_DASH_GAP_FRACTION,
  RANGE_PERIMETER_AIR_STRIKE_DASH_MIN_GAP_PX,
  RANGE_PERIMETER_AIR_STRIKE_DASH_MIN_SOLID_PX,
  RANGE_PERIMETER_AIR_STRIKE_DASH_SOLID_FRACTION,
  RANGE_PERIMETER_ANIMATED_DASH_VS_WIDTH,
  RANGE_PERIMETER_DASH_GAP_FRACTION,
  RANGE_PERIMETER_DASH_MIN_GAP_PX,
  RANGE_PERIMETER_DASH_MIN_SOLID_PX,
  RANGE_PERIMETER_DASH_SOLID_FRACTION,
  RANGE_PERIMETER_LINE_CAP,
  RANGE_PERIMETER_WIDTH_MULTIPLIER,
  RANGE_SUPPORT_CONNECTOR_LINE_CAP,
  RANGE_SUPPORT_LINE_WIDTH_MULTIPLIER,
} from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { getMainLeafletMap } from '../map/worldLeafletMap';
import { getHomeRegionOwnershipLineWidth } from './terrainRendering';

/**
 * Overlay stroke family that shares color/dash but may use a different width on the strategic map.
 *
 * Purpose: Distinguishes the animated range outline from planned/hover/resolution connectors.
 * When to use: Pass into `getCurrentRangeOverlayLineWidth` and `rangePerimeterStaticLineStyle`.
 * Expected outcome: `'perimeter'` is the targeting outline; `'connector'` is hex-to-hex support lines.
 * Exceptions: None.
 */
export type RangeOverlayStrokeKind = 'perimeter' | 'connector';

/**
 * Returns screen-pixel stroke width for the strategic range perimeter outline.
 *
 * Purpose: Keeps the strategic animated perimeter at 2× the outer home-region ownership border at the given map zoom.
 * When to use: `getCurrentRangeOverlayLineWidth` when drawing a strategic perimeter.
 * Expected outcome: `getHomeRegionOwnershipLineWidth(zoom) * RANGE_PERIMETER_WIDTH_MULTIPLIER`.
 * Exceptions: None.
 */
export function getRangePerimeterOutlineLineWidth(zoom: number): number {
  return getHomeRegionOwnershipLineWidth(zoom) * RANGE_PERIMETER_WIDTH_MULTIPLIER;
}

/**
 * Returns screen-pixel stroke width for strategic planned and planning ranged/air-strike connector lines.
 *
 * Purpose: Keeps strategic support connectors at 1.5× the outer home-region ownership border at the given map zoom.
 * When to use: `getCurrentRangeOverlayLineWidth` when drawing strategic planned, hover, or resolution connectors.
 * Expected outcome: `getHomeRegionOwnershipLineWidth(zoom) * RANGE_SUPPORT_LINE_WIDTH_MULTIPLIER`.
 * Exceptions: None.
 */
export function getRangeSupportPlanLineWidth(zoom: number): number {
  return getHomeRegionOwnershipLineWidth(zoom) * RANGE_SUPPORT_LINE_WIDTH_MULTIPLIER;
}

/**
 * Resolves current main-map zoom for stroke width calculations.
 *
 * Purpose: Shared fallback when Leaflet zoom is unavailable during canvas overlay draws.
 * When to use: Before computing home-border-derived stroke widths on the game canvas.
 * Expected outcome: Map zoom or `defaultZoom` (4) when the main map is missing.
 * Exceptions: None.
 */
export function resolveMainLeafletMapZoom(defaultZoom = 4): number {
  const map = getMainLeafletMap() as { getZoom?: () => number } | null;
  return map && typeof map.getZoom === 'function' ? map.getZoom() : defaultZoom;
}

/**
 * Returns the overlay stroke width for the current map layer (tactical vs strategic).
 *
 * Purpose: Tactical battles keep movement-line thickness; strategic planning restores the thicker home-border-scaled strokes.
 * When to use: `rangePerimeterStaticLineStyle` each time a perimeter or connector is stroked.
 * Expected outcome: `ORDER_LINE_WIDTH` while `S.tacticalBattleSnapshot` is set; otherwise 2× home border for perimeter and 1.5× for connectors.
 * Exceptions: None.
 */
export function getCurrentRangeOverlayLineWidth(kind: RangeOverlayStrokeKind): number {
  if (S.tacticalBattleSnapshot) return ORDER_LINE_WIDTH;
  const zoom = resolveMainLeafletMapZoom();
  return kind === 'perimeter' ? getRangePerimeterOutlineLineWidth(zoom) : getRangeSupportPlanLineWidth(zoom);
}

/**
 * Returns the canvas line cap for a range overlay stroke family.
 *
 * Purpose: Perimeter uses square ends so thick strategic dashes stay gapped; connectors stay rounded.
 * When to use: `rangePerimeterStaticLineStyle` when applying canvas state.
 * Expected outcome: `'butt'` for `'perimeter'`, `'round'` for `'connector'`.
 * Exceptions: None.
 */
export function getRangeOverlayLineCap(kind: RangeOverlayStrokeKind): 'butt' | 'round' {
  return kind === 'perimeter' ? RANGE_PERIMETER_LINE_CAP : RANGE_SUPPORT_CONNECTOR_LINE_CAP;
}

/**
 * Builds the 50/50 dash array for a range overlay stroke at the given width.
 *
 * Purpose: Perimeter dashes scale to 2× line width so a 2×-home-border stroke still shows a moving trough; connectors keep the 8px-floor 1:1 pattern.
 * When to use: `rangePerimeterStaticLineStyle` after resolving `lineWidth`.
 * Expected outcome: Perimeter `[s, s]` with `s = max(8px floors, lineWidth * RANGE_PERIMETER_ANIMATED_DASH_VS_WIDTH)`; connectors use the mode-specific 1:1 floors.
 * Exceptions: None.
 */
export function buildRangeOverlayDashArray(
  lineWidth: number,
  kind: RangeOverlayStrokeKind,
  mode: 'ranged' | 'airStrike'
): [number, number] {
  const minSolid = mode === 'airStrike' ? RANGE_PERIMETER_AIR_STRIKE_DASH_MIN_SOLID_PX : RANGE_PERIMETER_DASH_MIN_SOLID_PX;
  const minGap = mode === 'airStrike' ? RANGE_PERIMETER_AIR_STRIKE_DASH_MIN_GAP_PX : RANGE_PERIMETER_DASH_MIN_GAP_PX;
  if (kind === 'perimeter') {
    const segment = Math.max(minSolid, minGap, lineWidth * RANGE_PERIMETER_ANIMATED_DASH_VS_WIDTH);
    return [segment, segment];
  }
  const solidFraction =
    mode === 'airStrike' ? RANGE_PERIMETER_AIR_STRIKE_DASH_SOLID_FRACTION : RANGE_PERIMETER_DASH_SOLID_FRACTION;
  const gapFraction =
    mode === 'airStrike' ? RANGE_PERIMETER_AIR_STRIKE_DASH_GAP_FRACTION : RANGE_PERIMETER_DASH_GAP_FRACTION;
  return [Math.max(minSolid, lineWidth * solidFraction), Math.max(minGap, lineWidth * gapFraction)];
}
