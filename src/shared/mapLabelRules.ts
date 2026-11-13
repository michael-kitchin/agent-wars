/**
 * Which place-name kinds a zoom draws, and the limits the label pass uses.
 *
 * Purpose: Continent, country, and state names, and the borders that share their visibility, read one rule.
 *   Water names use `visibleWaterLabelKinds`.
 * When to use: Before choosing labels or border groups for a frame.
 * Expected outcome: A tactical view draws country and state names. Below the country zoom, only continent names.
 *   From the country zoom, outside a tactical view, continent and country names are both drawn.
 * Exceptions: None.
 */

/**
 * Lowest zoom that draws country names and national borders.
 *
 * Purpose: A world view stays limited to continents.
 * When to use: `visibleLabelKinds`. Border layers call that function rather than this constant.
 * Expected outcome: Zoom 4 and above, outside a tactical view, draws countries and continents.
 * Exceptions: None.
 */
export const COUNTRY_LABEL_MIN_ZOOM = 4;

/**
 * How far below a state's own minimum zoom its name may linger.
 *
 * Purpose: A state that just appeared should not vanish on a tiny zoom-out.
 * When to use: The state branch of `labelFeatureIsCandidate`, and the minor-water branch when the body is not a strait or channel.
 * Expected outcome: A state or a minor water body stays eligible until the zoom is this far below its minimum, and still has to cover its radius minimum.
 * Exceptions: None.
 */
export const LABEL_MIN_ZOOM_SLACK = 1.5;

/**
 * Levels past a country's minimum zoom before its name appears.
 *
 * Purpose: Minor countries share a minimum that would otherwise show as soon as country names turn on.
 * When to use: The country branch of `labelFeatureIsCandidate`.
 * Expected outcome: A country is eligible once the zoom reaches its minimum plus this delay. It does not linger below that zoom.
 * Exceptions: None.
 */
export const COUNTRY_LABEL_ZOOM_DELAY = 1;

/**
 * Smallest on-screen inscribed radius that earns a state a name.
 *
 * Purpose: States that share a minimum zoom are distinguished by how large they are on screen.
 * When to use: The state branch of `labelFeatureIsCandidate`, with the largest stored anchor.
 * Expected outcome: A state whose largest anchor covers fewer than this many CSS pixels is omitted.
 * Exceptions: None.
 */
export const STATE_LABEL_MIN_RADIUS_PX = 40;

/**
 * Levels past a major water body's minimum zoom before its name appears.
 *
 * Purpose: Major seas share the country delay, so a body does not appear at the instant its kind turns on.
 * When to use: The major-water branch of `labelFeatureIsCandidate`, unless the body is narrow.
 * Expected outcome: A non-narrow major water body is eligible once the zoom reaches its minimum plus this delay, and it still has to cover `WATER_LABEL_MIN_RADIUS_PX`.
 * Exceptions: None.
 */
export const WATER_LABEL_ZOOM_DELAY = 1;

/**
 * Smallest on-screen inscribed radius that earns a water body a name.
 *
 * Purpose: Seas, gulfs, bays, and lakes that share a minimum zoom are distinguished by how large they are on screen.
 * When to use: The major-water and minor-water branches of `labelFeatureIsCandidate`, unless the body is narrow.
 * Expected outcome: A water body whose largest anchor covers fewer than this many CSS pixels is omitted.
 * Exceptions: None. Straits and channels do not use it.
 */
export const WATER_LABEL_MIN_RADIUS_PX = 40;

/**
 * Levels past a strait's or channel's minimum zoom before its name appears.
 *
 * Purpose: Those bodies are too thin for the radius test, so a delay is the only gate.
 * When to use: The narrow branch of `labelFeatureIsCandidate`.
 * Expected outcome: A strait or channel is eligible once the zoom reaches its minimum plus this delay. It does not also wait for `WATER_LABEL_ZOOM_DELAY` or the radius test.
 * Exceptions: None.
 */
export const NARROW_WATER_ZOOM_DELAY = 2;

/**
 * Fill opacity for every water name.
 *
 * Purpose: The ink color does the quieting, so water names stay at full strength in every view.
 * When to use: `labelKindOpacity` for a water kind.
 * Expected outcome: `1`.
 * Exceptions: None.
 */
export const WATER_LABEL_OPACITY = 1;

/**
 * Most labels drawn in one frame.
 *
 * Purpose: A dense tactical view must not fill the map with names.
 * When to use: After collision checks, as a hard stop.
 * Expected outcome: At most this many labels.
 * Exceptions: None.
 */
export const MAX_LABELS_PER_FRAME = 150;

/**
 * Extra pixels around a drawn label that the next label may not enter.
 *
 * Purpose: Two names of the same kind need a gap. A different kind may share the place and is painted later.
 * When to use: The collision pass.
 * Expected outcome: Two labels stay at least this many pixels apart.
 * Exceptions: None.
 */
export const LABEL_COLLISION_PADDING_PX = 4;

/**
 * Pixels inside the view edge where a label is not placed.
 *
 * Purpose: A name cut by the screen edge is harder to read than no name.
 * When to use: When rejecting an anchor that falls in the margin.
 * Expected outcome: Labels sit at least this far from each edge.
 * Exceptions: None.
 */
export const LABEL_VIEW_INSET_PX = 24;

/**
 * A land place-name kind.
 *
 * Purpose: Borders read the same kinds as land names, and must not receive a water kind.
 * When to use: As the result of `visibleLabelKinds`.
 * Expected outcome: Continent, country, or state.
 * Exceptions: None.
 */
export type MapLandLabelKind = 'continent' | 'country' | 'state';

/**
 * A water place-name kind.
 *
 * Purpose: Oceans sit with continents, major water with countries, and minor water with states. A lake may be major or minor.
 * When to use: As the result of `visibleWaterLabelKinds`.
 * Expected outcome: `ocean`, `major_water`, or `minor_water`.
 * Exceptions: None.
 */
export type MapWaterLabelKind = 'ocean' | 'major_water' | 'minor_water';

/**
 * A place-name kind.
 *
 * Purpose: Land and water names share one document and one painter.
 * When to use: On a parsed feature and on a painted label.
 * Expected outcome: A land kind or a water kind.
 * Exceptions: None.
 */
export type MapLabelKind = MapLandLabelKind | MapWaterLabelKind;

/**
 * Water kinds, in tier order.
 *
 * Purpose: One list, so the painter and the parser cannot drift.
 * When to use: `isWaterLabelKind`.
 * Expected outcome: Ocean, then major water, then minor water.
 * Exceptions: None.
 */
export const WATER_LABEL_KINDS: readonly MapWaterLabelKind[] = ['ocean', 'major_water', 'minor_water'];

/**
 * Whether a kind is a water name.
 *
 * Purpose: Water names use their own ink, opacity, and placement pass.
 * When to use: Before indexing land colors by kind, and in `labelKindOpacity`.
 * Expected outcome: True for `ocean`, `major_water`, and `minor_water`.
 * Exceptions: None.
 */
export function isWaterLabelKind(kind: MapLabelKind): kind is MapWaterLabelKind {
  return (WATER_LABEL_KINDS as readonly string[]).includes(kind);
}

/**
 * Land place-name kinds for one view.
 *
 * Purpose: Names and the borders that match them appear and disappear together. Borders read this function, so it never returns a water kind.
 * When to use: Once per frame, with the map zoom and whether tactical hexes are showing.
 * Expected outcome: Tactical view returns country and state. Zoom below `COUNTRY_LABEL_MIN_ZOOM`
 *   returns continent. Any other zoom returns continent and country.
 * Exceptions: None.
 */
export function visibleLabelKinds(zoom: number, tacticalView: boolean): MapLandLabelKind[] {
  if (tacticalView) return ['country', 'state'];
  if (zoom < COUNTRY_LABEL_MIN_ZOOM) return ['continent'];
  return ['continent', 'country'];
}

/**
 * Water place-name kinds for one view.
 *
 * Purpose: Water names follow the same zoom tiers as land names.
 * When to use: Once per frame, with the same zoom and tactical flag as `visibleLabelKinds`.
 * Expected outcome: A tactical view returns major and minor water. Zoom below `COUNTRY_LABEL_MIN_ZOOM`
 *   returns ocean. Any other zoom returns ocean and major water.
 * Exceptions: None.
 */
export function visibleWaterLabelKinds(zoom: number, tacticalView: boolean): MapWaterLabelKind[] {
  if (tacticalView) return ['major_water', 'minor_water'];
  if (zoom < COUNTRY_LABEL_MIN_ZOOM) return ['ocean'];
  return ['ocean', 'major_water'];
}

/**
 * Inputs for whether names and borders use the detail view.
 *
 * Purpose: The overlay and the loaded match do not share one zoom flag.
 * When to use: `annotationViewIsDetail`.
 * Expected outcome: The three fields below.
 * Exceptions: None.
 */
export interface MapAnnotationViewInput {
  /**
   * Whether the new-game or game-over overlay is open.
   *
   * Contract: That screen draws its own map, so the match underneath must not choose the names.
   * When to use: `annotationViewIsDetail`.
   * Expected outcome: True while the overlay is visible.
   * Exceptions: None.
   */
  readonly overlayOpen: boolean;

  /**
   * Whether one of the preview's strategic hexes fills the view.
   *
   * Contract: The preview's own latch. It is not the loaded match's zoom flag.
   * When to use: When `overlayOpen` is true. Ignored when the overlay is closed.
   * Expected outcome: True after the preview hex reaches the show threshold, until it falls to the hide threshold.
   * Exceptions: None.
   */
  readonly previewAtDetailZoom: boolean;

  /**
   * Reads whether the loaded match is showing the detail view.
   *
   * Contract: Reading the match flag can change it, so this stays a function and is not called while the overlay is open.
   * When to use: When `overlayOpen` is false.
   * Expected outcome: The match's current detail-view flag. The call may update that flag.
   * Exceptions: None. The caller supplies the function.
   */
  readonly readMatchDetailView: () => boolean;
}

/**
 * Whether names and borders use the detail view.
 *
 * Purpose: One rule for the overlay and the match, so a battle under the new-game screen does not keep state names at world zoom.
 * When to use: Once per frame, from the single annotation-view reader.
 * Expected outcome: While the overlay is open, `previewAtDetailZoom`. Otherwise the result of `readMatchDetailView`. That read can change the match flag, and it does not run while the overlay is open.
 * Exceptions: None.
 */
export function annotationViewIsDetail(input: MapAnnotationViewInput): boolean {
  return input.overlayOpen ? input.previewAtDetailZoom : input.readMatchDetailView();
}

/**
 * Share of a country name's fill painted beside continent names.
 *
 * Purpose: The local name uses this share for its fill. The halo does not use it. A lone continent and a state name use this share too.
 * When to use: `labelKindOpacity` when state names are not in the view. `CONTINENT_LABEL_OPACITY` and `STATE_LABEL_OPACITY` alias it.
 * Expected outcome: Full strength. On a light theme that is darker than `CONTINENT_BESIDE_COUNTRY_OPACITY`. On Night it is brighter.
 * Exceptions: None.
 */
export const COUNTRY_LABEL_OPACITY = 1;

/**
 * Share of a continent name painted when it is the only kind in view.
 *
 * Purpose: A world view uses the same share as a country name drawn over a continent.
 * When to use: `labelKindOpacity` below the country zoom.
 * Expected outcome: `COUNTRY_LABEL_OPACITY`.
 * Exceptions: None.
 */
export const CONTINENT_LABEL_OPACITY = COUNTRY_LABEL_OPACITY;

/**
 * Share of a state name's fill.
 *
 * Purpose: A state name uses the same fill share as a country name drawn over a continent. The halo does not use it.
 * When to use: `labelKindOpacity`.
 * Expected outcome: `COUNTRY_LABEL_OPACITY`.
 * Exceptions: None.
 */
export const STATE_LABEL_OPACITY = COUNTRY_LABEL_OPACITY;

/**
 * Share of a continent name painted when country names are also drawn.
 *
 * Purpose: The continent name under the country names stays readable without matching their strength.
 * When to use: `labelKindOpacity` from the country zoom, outside a tactical view.
 * Expected outcome: Four fifths.
 * Exceptions: None.
 */
export const CONTINENT_BESIDE_COUNTRY_OPACITY = 4 / 5;

/**
 * Share of a country name painted when state names are also drawn.
 *
 * Purpose: The country name stays visible under the state name, quieter than a continent drawn under countries.
 * When to use: `labelKindOpacity` in a tactical view.
 * Expected outcome: Three fifths.
 * Exceptions: None.
 */
export const COUNTRY_BESIDE_STATE_OPACITY = 3 / 5;

/**
 * How strongly one kind is painted in the current view.
 *
 * Purpose: The theme color stays the same. The view decides how much of it shows.
 * When to use: When painting a label.
 * Expected outcome: A water kind is `WATER_LABEL_OPACITY`. A world-view continent is `CONTINENT_LABEL_OPACITY`. A continent beside countries is `CONTINENT_BESIDE_COUNTRY_OPACITY`.
 *   A country beside continents is `COUNTRY_LABEL_OPACITY`. A country beside states is `COUNTRY_BESIDE_STATE_OPACITY`.
 *   A state is `STATE_LABEL_OPACITY`. The name on top is the theme color. A continent under countries is four fifths. A country under states is three fifths.
 * Exceptions: None.
 */
export function labelKindOpacity(kind: MapLabelKind, zoom: number, tacticalView: boolean): number {
  if (isWaterLabelKind(kind)) return WATER_LABEL_OPACITY;
  if (kind === 'country') return tacticalView ? COUNTRY_BESIDE_STATE_OPACITY : COUNTRY_LABEL_OPACITY;
  if (kind === 'state') return STATE_LABEL_OPACITY;
  if (!tacticalView && zoom >= COUNTRY_LABEL_MIN_ZOOM) return CONTINENT_BESIDE_COUNTRY_OPACITY;
  return CONTINENT_LABEL_OPACITY;
}

/**
 * Metres per pixel at zoom 0 on a 256-pixel Web Mercator tile.
 *
 * Purpose: A fragment anchor is usable only when its inscribed circle is at least as tall as the text.
 * When to use: `mercatorMetersPerPixel`. This is the same number the vector pipeline uses.
 * Expected outcome: `156543.03392804097`.
 * Exceptions: None.
 */
export const METERS_PER_PIXEL_Z0 = 156543.03392804097;

/**
 * Type size and spacing for one place-name kind.
 *
 * Purpose: Continents, countries, states, oceans, and other water names are not drawn at the same size.
 * When to use: When measuring and drawing a label.
 * Expected outcome: Size in CSS pixels, a font weight, a font style, letter spacing as a fraction of the size, a halo width, and whether the name is capitalized.
 * Exceptions: None.
 */
export interface MapLabelKindStyle {
  /**
   * Font size in CSS pixels.
   *
   * Contract: A positive number.
   * When to use: The canvas font size.
   * Expected outcome: 27, 19.5, 18, 13, 12, 11, 9.75, or 8.25.
   * Exceptions: None.
   */
  readonly sizePx: number;
  /**
   * Font weight.
   *
   * Contract: 600 for continents and countries. 400 for states and water names.
   * When to use: The canvas font weight.
   * Expected outcome: One of those two weights.
   * Exceptions: None.
   */
  readonly weight: 400 | 600;
  /**
   * Font style keyword.
   *
   * Contract: `normal` or `italic`.
   * When to use: The canvas font style.
   * Expected outcome: `normal` for land names. `italic` for water names, the usual mark of a water body.
   * Exceptions: None.
   */
  readonly fontStyle: 'normal' | 'italic';
  /**
   * Extra space between letters, as a fraction of `sizePx`.
   *
   * Contract: A non-negative number.
   * When to use: `letterSpacing` on the canvas, multiplied by `sizePx`.
   * Expected outcome: Continents are the most widely spaced.
   * Exceptions: None.
   */
  readonly letterSpacingEm: number;
  /**
   * Halo stroke width in CSS pixels.
   *
   * Contract: A positive number, narrower for the smaller kinds.
   * When to use: `lineWidth` of the halo stroke. It does not follow the label opacity.
   * Expected outcome: A light outline that does not cover the fill of an 11 px name.
   * Exceptions: None.
   */
  readonly haloWidthPx: number;
  /**
   * Whether the name is drawn in capitals.
   *
   * Contract: True for continents, countries, and oceans.
   * When to use: `labelDisplayText`.
   * Expected outcome: States and non-ocean water names keep the name's own case.
   * Exceptions: None.
   */
  readonly uppercase: boolean;
}

/**
 * Styles for the land and water place-name kinds.
 *
 * Purpose: One table, so the measurer and the painter cannot drift.
 * When to use: `mapLabelStyleForView`, which returns these rows except while the smaller land names are drawn.
 * Expected outcome: Continent 18/600, country 13/600, state 11/400, ocean 12/400 italic, major water 9.75/400 italic, minor water 8.25/400 italic.
 *   A continent beside countries is 27 px. A country beside states is 19.5 px. Both otherwise match their row. Water kinds return their row in every view.
 * Exceptions: None.
 */
export const MAP_LABEL_KIND_STYLES: Readonly<Record<MapLabelKind, MapLabelKindStyle>> = {
  continent: { sizePx: 18, weight: 600, fontStyle: 'normal', letterSpacingEm: 0.35, haloWidthPx: 3, uppercase: true },
  country: { sizePx: 13, weight: 600, fontStyle: 'normal', letterSpacingEm: 0.12, haloWidthPx: 2, uppercase: true },
  state: { sizePx: 11, weight: 400, fontStyle: 'normal', letterSpacingEm: 0.04, haloWidthPx: 1, uppercase: false },
  ocean: { sizePx: 12, weight: 400, fontStyle: 'italic', letterSpacingEm: 0.3, haloWidthPx: 2, uppercase: true },
  major_water: { sizePx: 9.75, weight: 400, fontStyle: 'italic', letterSpacingEm: 0.06, haloWidthPx: 1.5, uppercase: false },
  minor_water: { sizePx: 8.25, weight: 400, fontStyle: 'italic', letterSpacingEm: 0.04, haloWidthPx: 1, uppercase: false },
};

/**
 * Continent type size while country names are also drawn.
 *
 * Purpose: The continent name under the countries needs to stay readable at one and a half times its world-view size.
 * When to use: `mapLabelStyleForView` for a continent from `COUNTRY_LABEL_MIN_ZOOM`, outside a tactical view.
 * Expected outcome: 27, which is 1.5 times the continent row.
 * Exceptions: None.
 */
export const CONTINENT_BESIDE_COUNTRY_SIZE_PX = 27;

/**
 * Country type size while state names are also drawn.
 *
 * Purpose: The country name under the states needs to stay readable at one and a half times its usual size.
 * When to use: `mapLabelStyleForView` for a country in a tactical view.
 * Expected outcome: 19.5, which is 1.5 times the country row.
 * Exceptions: None.
 */
export const COUNTRY_BESIDE_STATE_SIZE_PX = 19.5;

/**
 * Continent style used beside country names.
 *
 * Purpose: One object, so each frame does not allocate a new style.
 * When to use: `mapLabelStyleForView` when a continent is drawn with countries.
 * Expected outcome: The continent row with `sizePx` set to `CONTINENT_BESIDE_COUNTRY_SIZE_PX`.
 * Exceptions: None.
 */
const continentBesideCountryStyle: MapLabelKindStyle = {
  ...MAP_LABEL_KIND_STYLES.continent,
  sizePx: CONTINENT_BESIDE_COUNTRY_SIZE_PX,
};

/**
 * Country style used beside state names.
 *
 * Purpose: One object, so each frame does not allocate a new style.
 * When to use: `mapLabelStyleForView` when the kind is country and the view is tactical.
 * Expected outcome: The country row with `sizePx` set to `COUNTRY_BESIDE_STATE_SIZE_PX`.
 * Exceptions: None.
 */
const countryBesideStateStyle: MapLabelKindStyle = {
  ...MAP_LABEL_KIND_STYLES.country,
  sizePx: COUNTRY_BESIDE_STATE_SIZE_PX,
};

/**
 * Style for one kind in the current view.
 *
 * Purpose: A broad name grows only while the smaller names are drawn with it.
 * When to use: Before measuring or drawing a label. `zoom` and `tacticalView` are the same pair `visibleLabelKinds` uses.
 * Expected outcome: 27 px for a continent from the country zoom, outside a tactical view. 19.5 px for a country in a tactical view.
 *   Otherwise the table entry, including a continent below the country zoom, a continent in a tactical view, and every water kind.
 * Exceptions: None.
 */
export function mapLabelStyleForView(kind: MapLabelKind, zoom: number, tacticalView: boolean): MapLabelKindStyle {
  if (kind === 'continent' && !tacticalView && zoom >= COUNTRY_LABEL_MIN_ZOOM) return continentBesideCountryStyle;
  if (kind === 'country' && tacticalView) return countryBesideStateStyle;
  return MAP_LABEL_KIND_STYLES[kind];
}

/**
 * The text drawn for a feature.
 *
 * Purpose: Continents, countries, and oceans are letter-spaced capitals. States and other water names keep their own case.
 * When to use: Before measuring and before drawing.
 * Expected outcome: `toLocaleUpperCase('en')` when the kind is uppercase. Otherwise the name unchanged.
 * Exceptions: None.
 */
export function labelDisplayText(feature: { readonly kind: MapLabelKind; readonly name: string }): string {
  return MAP_LABEL_KIND_STYLES[feature.kind].uppercase
    ? feature.name.toLocaleUpperCase('en')
    : feature.name;
}

/**
 * Metres per screen pixel at a Web Mercator zoom.
 *
 * Purpose: Turns an anchor's inscribed radius into a screen height.
 * When to use: When deciding whether a fragment anchor is large enough for its text.
 * Expected outcome: `METERS_PER_PIXEL_Z0 / 2^zoom`.
 * Exceptions: None.
 */
export function mercatorMetersPerPixel(zoom: number): number {
  return METERS_PER_PIXEL_Z0 / 2 ** zoom;
}
