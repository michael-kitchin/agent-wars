/**
 * Decides which single status icon a strategic world hex shows, and how large it is.
 *
 * Purpose: Weather shows while T is not held. Tech replaces it while T is held. Size and band offset stay pure so tests can lock them.
 * When to use: From the status-icon drawer, and from tests that lock those rules.
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
 * Where a world hex's production label is drawn.
 *
 * Purpose: Callers use `'button'` for the build-entry control, `'canvas'` for the painted line, and `'none'` when the label is hidden.
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
 * Facts that choose the one status icon for a world hex.
 *
 * Purpose: The drawer gathers the hold state and the snapshot fields, then asks this object what to paint.
 * When to use: `inspectionStatusIconsForHex`.
 * Expected outcome: One object per hex. A production label is not required.
 * Exceptions: None.
 */
export interface InspectionStatusIconInput {
  /**
   * Whether T is held.
   *
   * Contract: True selects a tech icon. False selects a weather icon.
   * When to use: Pass `isMapInspectionModeHeld`.
   * Expected outcome: The other icon is never returned for this hold state.
   * Exceptions: None.
   */
  readonly mapInspectionHeld: boolean;
  /**
   * Whether the match awards a tech tier.
   *
   * Contract: Only `true` can show a tech icon, and only while T is held. Low and High use the same icon.
   * When to use: Pass `techBonusEnabled === true`.
   * Expected outcome: A false or missing flag omits the tech icon.
   * Exceptions: None.
   */
  readonly techBonusEnabled: boolean;
  /**
   * Whether the match applies weather.
   *
   * Contract: Only `true` can show a weather icon, and only while T is not held. Low and High use the same icon.
   * When to use: Pass `weatherBonusEnabled === true`.
   * Expected outcome: A false or missing flag omits the weather icon even when the hex has a weather word.
   * Exceptions: None.
   */
  readonly weatherBonusEnabled: boolean;
  /**
   * Generated urban-cell count for this hex.
   *
   * Contract: A finite count above zero can show tech. The tier comes from `techLevelFromUrbanHexCount`, which follows the loaded map.
   * When to use: Pass `baselineUrbanHexCountForStrategicHex`.
   * Expected outcome: Zero, negative, and non-finite counts omit the tech icon. On the global map, 20 is Basic and 21 is Advanced.
   * Exceptions: None.
   */
  readonly baselineUrbanHexCount: number;
  /**
   * Weather word stored on the hex, if any.
   *
   * Contract: Only `mild`, `rain`, `snow`, and `heat` count, and only while T is not held and the weather bonus is on.
   * When to use: Pass the snapshot weather field, including null or undefined.
   * Expected outcome: An unknown word does not become Mild.
   * Exceptions: None.
   */
  readonly weather: string | null | undefined;
}

/**
 * The one status icon to paint for a hex.
 *
 * Purpose: Tech and weather cannot both be set. The drawer centers whichever side is present.
 * When to use: The return value of `inspectionStatusIconsForHex`.
 * Expected outcome: A tech tier while T is held, or a weather state while T is not held.
 * Exceptions: None.
 */
export type InspectionStatusIcon =
  | {
      /**
       * Discriminator for the tech glyph.
       *
       * Contract: Always `'tech'`.
       * When to use: Choose `techInspectionIconAssetPath` with `level`.
       * Expected outcome: The drawer paints one tech icon.
       * Exceptions: None.
       */
      readonly kind: 'tech';
      /**
       * Tech tier for this hex.
       *
       * Contract: `basic` or `advanced` from the loaded map's urban-count cut.
       * When to use: `techInspectionIconAssetPath`.
       * Expected outcome: The matching tech SVG.
       * Exceptions: None.
       */
      readonly level: TechLevel;
    }
  | {
      /**
       * Discriminator for the weather glyph.
       *
       * Contract: Always `'weather'`.
       * When to use: Choose `weatherInspectionIconAssetPath` with `state`.
       * Expected outcome: The drawer paints one weather icon.
       * Exceptions: None.
       */
      readonly kind: 'weather';
      /**
       * Weather state for this hex.
       *
       * Contract: One of `mild`, `rain`, `snow`, or `heat`.
       * When to use: `weatherInspectionIconAssetPath`.
       * Expected outcome: The matching weather SVG.
       * Exceptions: None.
       */
      readonly state: WeatherState;
    };

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
 * Purpose: Labels and build buttons use this surface. The status icon uses it only to choose the 10px or 11px base.
 * When to use: Once per hex while placing a production label or sizing a status icon. Keep this aligned with `drawStrategicProductionOverlays` and `syncBuildEntryButton`.
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
 * Returns the one status icon for a world hex, or null when that hex shows none.
 *
 * Purpose: T held selects tech. T released selects weather. A missing bonus or a missing hex fact omits the icon.
 * When to use: Once per world hex while the strategic map is outside a battle and outside battle-detail zoom.
 * Expected outcome: A tech icon, a weather icon, or null. Never both.
 * Exceptions: None.
 */
export function inspectionStatusIconsForHex(input: InspectionStatusIconInput): InspectionStatusIcon | null {
  if (input.mapInspectionHeld) {
    if (input.techBonusEnabled !== true) return null;
    if (!Number.isFinite(input.baselineUrbanHexCount) || input.baselineUrbanHexCount <= 0) return null;
    return { kind: 'tech', level: techLevelFromUrbanHexCount(input.baselineUrbanHexCount) };
  }
  if (input.weatherBonusEnabled !== true) return null;
  const weather = knownWeather(input.weather);
  if (weather == null) return null;
  return { kind: 'weather', state: weather };
}

/**
 * Returns the production-text height used as the status-icon base, in pixels.
 *
 * Purpose: The painted icon is this height times 1.5. Call `inspectionStatusIconDrawPx` to draw.
 * When to use: From `inspectionStatusIconDrawPx`, and from tests that lock the 10px and 11px base.
 * Expected outcome: 10 for a button or a crowded canvas label. 11 for a plain canvas label.
 * Exceptions: None.
 */
export function inspectionStatusIconFontPx(input: InspectionStatusIconFontInput): number {
  if (input.productionSurface === 'button' || input.hasInfraSymbols || input.hasVisibleUnits) return 10;
  return 11;
}

/**
 * Scale from the production-text height to the status icon.
 *
 * Purpose: Weather and tech share one size, half again the 10px or 11px base on that hex.
 * When to use: `inspectionStatusIconDrawPx`.
 * Expected outcome: `1.5`, with no rounding inside the helper.
 * Exceptions: None.
 */
const STATUS_ICON_LINEAR_SCALE = 1.5;

/**
 * Returns the status-icon square size in pixels.
 *
 * Purpose: The drawn icon is one and a half times the production-text height on that hex.
 * When to use: For a hex that will paint a tech or weather icon. Pass `'canvas'` when the production surface is `'none'`.
 * Expected outcome: 15 for a button or a crowded canvas label. 16.5 for a plain canvas label. No rounding.
 * Exceptions: None.
 */
export function inspectionStatusIconDrawPx(input: InspectionStatusIconFontInput): number {
  return inspectionStatusIconFontPx(input) * STATUS_ICON_LINEAR_SCALE;
}

/**
 * Returns the SVG path for a tech tier icon.
 *
 * Purpose: The map row uses the same files as the Tech line in a tooltip.
 * When to use: When `InspectionStatusIcon` has `kind: 'tech'`.
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
 * When to use: When `InspectionStatusIcon` has `kind: 'weather'`.
 * Expected outcome: `weather/<state>.svg` for that state.
 * Exceptions: None.
 */
export function weatherInspectionIconAssetPath(weather: WeatherState): string {
  return weatherIconAssetPath(weather);
}
