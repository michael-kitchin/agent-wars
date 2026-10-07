/**
 * Decides the tech and weather icons drawn above a strategic hex code.
 *
 * Purpose: The held-T icon row and the hex tooltip share one rule for which icons exist, how tall they are, and how far they sit from the code.
 * When to use: From the inspection icon drawer, and from tests that lock those rules.
 * Expected outcome: Pure results with no map, canvas, or game snapshot.
 * Exceptions: None.
 */

import { techLevelFromUrbanHexCount } from './techBonusRules';
import type { TechLevel } from './techBonusTypes';
import type { WeatherState } from './weatherBonusTypes';
import { weatherIconAssetPath } from './weatherIcons';

/**
 * Fraction of a hex's projected span between the code and the production line.
 *
 * Purpose: The icon row uses the same distance above the code that production uses below its anchor.
 * When to use: `strategicOverlayBandOffsetPx` and the strategic overlay text position.
 * Expected outcome: `0.24`, with no rounding inside the helper.
 * Exceptions: None.
 */
export const STRATEGIC_OVERLAY_BAND_OFFSET_SPAN_FRAC = 0.24;

/**
 * Text drawn between the tech icon and the weather icon.
 *
 * Purpose: Matches the spaces around the slash in a production label such as `$1,000 / 3t`.
 * When to use: The canvas slash when both icons are present.
 * Expected outcome: A space, a slash, and a space.
 * Exceptions: None.
 */
export const INSPECTION_STATUS_ICON_SLASH_TEXT = ' / ';

/**
 * Where a world hex's production label is drawn.
 *
 * Purpose: The icon row appears only on a hex that already shows that label.
 * When to use: `strategicProductionLabelSurface`.
 * Expected outcome: `'button'` for the build-entry control, `'canvas'` for the painted line, `'none'` when the label is hidden.
 * Exceptions: None.
 */
export type StrategicProductionLabelSurface = 'none' | 'canvas' | 'button';

/**
 * Facts that choose the production-label surface.
 *
 * Purpose: Keeps the surface decision free of renderer state so tests can lock it.
 * When to use: `strategicProductionLabelSurface`.
 * Expected outcome: One object per hex per decision.
 * Exceptions: None.
 */
export interface StrategicProductionLabelInput {
  /**
   * Whether tactical cells are the visible hexes.
   *
   * Contract: True hides every world-hex production label.
   * When to use: Pass the current `shouldRenderTacticalHexes` result.
   * Expected outcome: A true value yields `'none'`.
   * Exceptions: None.
   */
  readonly tacticalRendered: boolean;
  /**
   * Whether the player has explored this world hex.
   *
   * Contract: The build button requires this. Inspection can still show a canvas label when it is false.
   * When to use: Pass the exploration predicate used by the production overlay.
   * Expected outcome: An unexplored hex outside inspection yields `'none'`.
   * Exceptions: None.
   */
  readonly explored: boolean;
  /**
   * Whether map inspection is held.
   *
   * Contract: True is the T key. It reveals labels that are otherwise hidden.
   * When to use: Pass `isMapInspectionModeHeld`.
   * Expected outcome: Opponent and unexplored hexes can return `'canvas'`.
   * Exceptions: None.
   */
  readonly mapInspectionHeld: boolean;
  /**
   * Whether the human controls this hex.
   *
   * Contract: A human non-urban hex still shows a canvas label outside inspection.
   * When to use: Pass true when the control row is `'human'`.
   * Expected outcome: Combined with the other flags, selects `'canvas'` or `'none'`.
   * Exceptions: None.
   */
  readonly controlledByHuman: boolean;
  /**
   * Whether this is a human hex with urban production.
   *
   * Contract: Matches `isStrategicHexHumanUrbanProduction`. The build button requires it.
   * When to use: Pass that helper's result.
   * Expected outcome: With exploration and build-entry zoom, the surface is `'button'`.
   * Exceptions: None.
   */
  readonly humanUrbanProduction: boolean;
  /**
   * Whether the map is zoomed in far enough for build-entry buttons.
   *
   * Contract: Matches `shouldShowBuildEntryZoom`.
   * When to use: Pass that helper's result.
   * Expected outcome: A false value keeps an eligible hex on the canvas label.
   * Exceptions: None.
   */
  readonly buildEntryZoom: boolean;
}

/**
 * Facts that choose the tech and weather icons.
 *
 * Purpose: The drawer gathers snapshot fields and the surface, then asks this object what to paint.
 * When to use: `inspectionStatusIconsForHex`.
 * Expected outcome: One object per hex that has already chosen a production surface.
 * Exceptions: None.
 */
export interface InspectionStatusIconInput {
  /**
   * Production surface for this hex.
   *
   * Contract: `'none'` suppresses the whole icon row.
   * When to use: Pass `strategicProductionLabelSurface`.
   * Expected outcome: Any other surface can still return null when both icons are absent.
   * Exceptions: None.
   */
  readonly productionSurface: StrategicProductionLabelSurface;
  /**
   * Whether the match awards a tech tier.
   *
   * Contract: Only `true` can show a tech icon. Low and High use the same icon.
   * When to use: Pass `techBonusEnabled === true`.
   * Expected outcome: A false or missing flag omits the tech icon.
   * Exceptions: None.
   */
  readonly techBonusEnabled: boolean;
  /**
   * Generated urban-cell count for this hex.
   *
   * Contract: The tier cut is 21. Zero and non-finite counts omit the tech icon.
   * When to use: Pass `baselineUrbanHexCountForStrategicHex`.
   * Expected outcome: 20 is Basic. 21 is Advanced.
   * Exceptions: None.
   */
  readonly baselineUrbanHexCount: number;
  /**
   * Weather word stored on the hex, if any.
   *
   * Contract: Only `mild`, `rain`, `snow`, and `heat` count. Other strings omit the weather icon.
   * When to use: Pass the snapshot weather field, including null or undefined.
   * Expected outcome: An unknown word does not become Mild.
   * Exceptions: None.
   */
  readonly weather: string | null | undefined;
}

/**
 * Icons to paint for one hex.
 *
 * Purpose: The drawer reads which side is present. A null side is omitted, and the slash appears only when both are set.
 * When to use: The return value of `inspectionStatusIconsForHex`.
 * Expected outcome: At least one of `tech` and `weather` is set.
 * Exceptions: None.
 */
export interface InspectionStatusIconLine {
  /**
   * Tech tier icon, or null when that icon is omitted.
   *
   * Contract: `basic` or `advanced` when the tech line would appear on the hex tooltip.
   * When to use: Choose `techInspectionIconAssetPath`.
   * Expected outcome: Null leaves the weather icon centered alone.
   * Exceptions: None.
   */
  readonly tech: TechLevel | null;
  /**
   * Weather icon, or null when that icon is omitted.
   *
   * Contract: One of the four weather states when the snapshot has that weather.
   * When to use: Choose `weatherInspectionIconAssetPath`.
   * Expected outcome: Null leaves the tech icon centered alone.
   * Exceptions: None.
   */
  readonly weather: WeatherState | null;
}

/**
 * Facts that choose the icon pixel size.
 *
 * Purpose: A build button and a crowded canvas label use 10px. A plain canvas label uses 11px.
 * When to use: `inspectionStatusIconFontPx`.
 * Expected outcome: One object per hex that will be drawn.
 * Exceptions: None.
 */
export interface InspectionStatusIconFontInput {
  /**
   * Surface that is actually showing the production label.
   *
   * Contract: `'button'` is always 10. `'canvas'` depends on the other two flags.
   * When to use: Pass the surface after rejecting `'none'`.
   * Expected outcome: Combined with the flags, a size of 10 or 11.
   * Exceptions: None.
   */
  readonly productionSurface: 'canvas' | 'button';
  /**
   * Whether this hex would show an airport or seaport glyph.
   *
   * Contract: Matches the production overlay's infrastructure check, even while inspection hides the glyphs.
   * When to use: Pass the infrastructure helper used by the production label.
   * Expected outcome: True selects 10 for a canvas label.
   * Exceptions: None.
   */
  readonly hasInfraSymbols: boolean;
  /**
   * Whether a unit is standing on this hex.
   *
   * Contract: Matches the production overlay's occupied-hex check.
   * When to use: Pass true when the hex is in the unit-hex set.
   * Expected outcome: True selects 10 for a canvas label.
   * Exceptions: None.
   */
  readonly hasVisibleUnits: boolean;
}

/**
 * Weather words the icon row will draw.
 *
 * Purpose: Rejects any other string before it can be drawn as Mild.
 * When to use: `knownWeather`.
 * Expected outcome: The four snapshot weather values.
 * Exceptions: None.
 */
const KNOWN_WEATHER: ReadonlySet<string> = new Set<WeatherState>(['mild', 'rain', 'snow', 'heat']);

/**
 * Returns a weather state when the value is one of the four known words.
 *
 * Purpose: The asset helper treats an unknown state as Mild, and this row must not.
 * When to use: Before choosing a weather icon.
 * Expected outcome: The same state, or null for null, undefined, and any other string.
 * Exceptions: None.
 */
function knownWeather(weather: string | null | undefined): WeatherState | null {
  if (weather == null || !KNOWN_WEATHER.has(weather)) return null;
  return weather as WeatherState;
}

/**
 * Returns how far a label sits from the hex anchor, in pixels.
 *
 * Purpose: Production adds this distance. The icon row subtracts it.
 * When to use: After measuring the projected hex span.
 * Expected outcome: `spanPx * 0.24`, with no rounding.
 * Exceptions: None.
 */
export function strategicOverlayBandOffsetPx(spanPx: number): number {
  return spanPx * STRATEGIC_OVERLAY_BAND_OFFSET_SPAN_FRAC;
}

/**
 * Returns which production label a world hex shows.
 *
 * Purpose: The icon row is limited to hexes that already show a production label, either as a button or as canvas text.
 * When to use: Once per hex while deciding whether to draw icons. Keep this aligned with `drawStrategicProductionOverlays` and `syncBuildEntryButton`.
 * Expected outcome: `'none'`, `'button'`, or `'canvas'` from the rules above.
 * Exceptions: None.
 */
export function strategicProductionLabelSurface(input: StrategicProductionLabelInput): StrategicProductionLabelSurface {
  if (input.tacticalRendered) return 'none';
  if (input.explored && input.humanUrbanProduction && input.buildEntryZoom) return 'button';
  if (!input.explored && !input.mapInspectionHeld) return 'none';
  if (!input.mapInspectionHeld && !input.humanUrbanProduction && !input.controlledByHuman) return 'none';
  return 'canvas';
}

/**
 * Returns the tech and weather icons for one hex, or null when the row is empty.
 *
 * Purpose: Applies the hex tooltip's Tech and Weather omissions to the map icon row.
 * When to use: After `strategicProductionLabelSurface`.
 * Expected outcome: Null when the surface is `'none'` or both icons are omitted. Otherwise at least one icon is set.
 * Exceptions: None.
 */
export function inspectionStatusIconsForHex(input: InspectionStatusIconInput): InspectionStatusIconLine | null {
  if (input.productionSurface === 'none') return null;
  const tech =
    input.techBonusEnabled === true &&
    Number.isFinite(input.baselineUrbanHexCount) &&
    input.baselineUrbanHexCount > 0
      ? techLevelFromUrbanHexCount(input.baselineUrbanHexCount)
      : null;
  const weather = knownWeather(input.weather);
  if (tech == null && weather == null) return null;
  return { tech, weather };
}

/**
 * Returns the icon and slash size in pixels.
 *
 * Purpose: The row matches the production text height on that same hex.
 * When to use: For a hex whose surface is `'canvas'` or `'button'`.
 * Expected outcome: 10 for a button or a crowded canvas label. 11 for a plain canvas label.
 * Exceptions: None.
 */
export function inspectionStatusIconFontPx(input: InspectionStatusIconFontInput): number {
  if (input.productionSurface === 'button' || input.hasInfraSymbols || input.hasVisibleUnits) return 10;
  return 11;
}

/**
 * Returns whether the slash uses the bold production weight.
 *
 * Purpose: A human hex with capacity paints its production numbers in bold, and the icon slash follows.
 * When to use: When both icons are present.
 * Expected outcome: True only when the controller is human and capacity is above zero.
 * Exceptions: None.
 */
export function inspectionStatusSlashIsBold(controlledByHuman: boolean, capacityPerTurn: number): boolean {
  return controlledByHuman && capacityPerTurn > 0;
}

/**
 * Returns the SVG path for a tech tier icon.
 *
 * Purpose: The map row uses the same files as the Tech line in a tooltip.
 * When to use: When `InspectionStatusIconLine.tech` is set.
 * Expected outcome: `tech/tech_basic.svg` or `tech/tech_advanced.svg`.
 * Exceptions: None.
 */
export function techInspectionIconAssetPath(level: TechLevel): string {
  return level === 'advanced' ? 'tech/tech_advanced.svg' : 'tech/tech_basic.svg';
}

/**
 * Returns the SVG path for a weather icon.
 *
 * Purpose: The map row uses the same files as the Weather line in a tooltip.
 * When to use: When `InspectionStatusIconLine.weather` is set.
 * Expected outcome: `weather/<state>.svg` for that state.
 * Exceptions: None.
 */
export function weatherInspectionIconAssetPath(weather: WeatherState): string {
  return weatherIconAssetPath(weather);
}
