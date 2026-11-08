/**
 * Which place-name kinds a zoom draws, and the limits the label pass uses.
 *
 * Purpose: Continent, country, and state names, and the borders that share their visibility, read one rule.
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
 * How far below a feature's own minimum zoom a label may linger.
 *
 * Purpose: A label that just appeared should not vanish on a tiny zoom-out.
 * When to use: The label placement pass.
 * Expected outcome: A feature stays eligible until the zoom is this far below its minimum.
 * Exceptions: None.
 */
export const LABEL_MIN_ZOOM_SLACK = 1.5;

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
 * A place-name kind.
 *
 * Purpose: The three annotation levels the map can draw.
 * When to use: As the result of `visibleLabelKinds`.
 * Expected outcome: Continent, country, or state.
 * Exceptions: None.
 */
export type MapLabelKind = 'continent' | 'country' | 'state';

/**
 * Place-name kinds for one view.
 *
 * Purpose: Names and the borders that match them appear and disappear together.
 * When to use: Once per frame, with the map zoom and whether tactical hexes are showing.
 * Expected outcome: Tactical view returns country and state. Zoom below `COUNTRY_LABEL_MIN_ZOOM`
 *   returns continent. Any other zoom returns continent and country.
 * Exceptions: None.
 */
export function visibleLabelKinds(zoom: number, tacticalView: boolean): MapLabelKind[] {
  if (tacticalView) return ['country', 'state'];
  if (zoom < COUNTRY_LABEL_MIN_ZOOM) return ['continent'];
  return ['continent', 'country'];
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
 * Purpose: The broader name under the local name uses this share. A country under a state uses it too.
 * When to use: `labelKindOpacity` from the country zoom, outside a tactical view. `COUNTRY_BESIDE_STATE_OPACITY` aliases it.
 * Expected outcome: One half.
 * Exceptions: None.
 */
export const CONTINENT_BESIDE_COUNTRY_OPACITY = 1 / 2;

/**
 * Share of a country name painted when state names are also drawn.
 *
 * Purpose: The country name stays visible under the state name, at the same share as a continent under a country.
 * When to use: `labelKindOpacity` in a tactical view.
 * Expected outcome: `CONTINENT_BESIDE_COUNTRY_OPACITY`.
 * Exceptions: None.
 */
export const COUNTRY_BESIDE_STATE_OPACITY = CONTINENT_BESIDE_COUNTRY_OPACITY;

/**
 * How strongly one kind is painted in the current view.
 *
 * Purpose: The theme color stays the same. The view decides how much of it shows.
 * When to use: When painting a label. The kind must already be one `visibleLabelKinds` returned.
 * Expected outcome: A world-view continent is `CONTINENT_LABEL_OPACITY`. A continent beside countries is `CONTINENT_BESIDE_COUNTRY_OPACITY`.
 *   A country beside continents is `COUNTRY_LABEL_OPACITY`. A country beside states is `COUNTRY_BESIDE_STATE_OPACITY`.
 *   A state is `STATE_LABEL_OPACITY`. The name on top is the theme color. The name under it is half.
 * Exceptions: None.
 */
export function labelKindOpacity(kind: MapLabelKind, zoom: number, tacticalView: boolean): number {
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
 * Purpose: Continents, countries, and states are not drawn at the same size.
 * When to use: When measuring and drawing a label.
 * Expected outcome: Size in CSS pixels, a font weight, letter spacing as a fraction of the size, a halo width, and whether the name is capitalized.
 * Exceptions: None.
 */
export interface MapLabelKindStyle {
  /**
   * Font size in CSS pixels.
   *
   * Contract: A positive number.
   * When to use: The canvas font size.
   * Expected outcome: 18, 13, or 11.
   * Exceptions: None.
   */
  readonly sizePx: number;
  /**
   * Font weight.
   *
   * Contract: 600 for continents and countries. 400 for states.
   * When to use: The canvas font weight.
   * Expected outcome: One of those two weights.
   * Exceptions: None.
   */
  readonly weight: 400 | 600;
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
   * Contract: True for continents and countries.
   * When to use: `labelDisplayText`.
   * Expected outcome: States keep the name's own case.
   * Exceptions: None.
   */
  readonly uppercase: boolean;
}

/**
 * Styles for the three place-name kinds.
 *
 * Purpose: One table, so the measurer and the painter cannot drift.
 * When to use: Before measuring or drawing a label.
 * Expected outcome: Continent 18/600, country 13/600, state 11/400, with halo widths 3, 2, and 1.
 * Exceptions: None.
 */
export const MAP_LABEL_KIND_STYLES: Readonly<Record<MapLabelKind, MapLabelKindStyle>> = {
  continent: { sizePx: 18, weight: 600, letterSpacingEm: 0.35, haloWidthPx: 3, uppercase: true },
  country: { sizePx: 13, weight: 600, letterSpacingEm: 0.12, haloWidthPx: 2, uppercase: true },
  state: { sizePx: 11, weight: 400, letterSpacingEm: 0.04, haloWidthPx: 1, uppercase: false },
};

/**
 * The text drawn for a feature.
 *
 * Purpose: Continents and countries are letter-spaced capitals. States keep their own case.
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
