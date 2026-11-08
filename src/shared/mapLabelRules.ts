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
 * Purpose: Country and state names need a gap so they do not touch. A continent may sit under either.
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
 * Share of a country name that is painted, fill and halo together.
 *
 * Purpose: Country names stay readable beside the fainter continent and state names.
 * When to use: `labelKindOpacity`.
 * Expected outcome: Two thirds.
 * Exceptions: None.
 */
export const COUNTRY_LABEL_OPACITY = 2 / 3;

/**
 * Share of a state name that is painted, fill and halo together.
 *
 * Purpose: State names stay present without competing with the country names.
 * When to use: `labelKindOpacity`.
 * Expected outcome: One half.
 * Exceptions: None.
 */
export const STATE_LABEL_OPACITY = 1 / 2;

/**
 * Share of a continent name that is painted when country names are also drawn.
 *
 * Purpose: The continent name stays visible under the country names.
 * When to use: `labelKindOpacity`. A world view that draws only continents uses full strength.
 * Expected outcome: One half.
 * Exceptions: None.
 */
export const CONTINENT_BESIDE_COUNTRY_OPACITY = 1 / 2;

/**
 * How strongly one kind is painted in the current view.
 *
 * Purpose: The theme color stays the same. The view decides how much of it shows.
 * When to use: When painting a label. The kind must already be one `visibleLabelKinds` returned.
 * Expected outcome: A world-view continent is 1. A continent beside countries is `CONTINENT_BESIDE_COUNTRY_OPACITY`.
 *   A country is `COUNTRY_LABEL_OPACITY`. A state is `STATE_LABEL_OPACITY`.
 * Exceptions: None.
 */
export function labelKindOpacity(kind: MapLabelKind, zoom: number, tacticalView: boolean): number {
  if (kind === 'country') return COUNTRY_LABEL_OPACITY;
  if (kind === 'state') return STATE_LABEL_OPACITY;
  if (!tacticalView && zoom >= COUNTRY_LABEL_MIN_ZOOM) return CONTINENT_BESIDE_COUNTRY_OPACITY;
  return 1;
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
 * Expected outcome: Size in CSS pixels, a font weight, letter spacing as a fraction of the size, and whether the name is capitalized.
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
 * Expected outcome: Continent 18/600, country 13/600, state 11/400.
 * Exceptions: None.
 */
export const MAP_LABEL_KIND_STYLES: Readonly<Record<MapLabelKind, MapLabelKindStyle>> = {
  continent: { sizePx: 18, weight: 600, letterSpacingEm: 0.35, uppercase: true },
  country: { sizePx: 13, weight: 600, letterSpacingEm: 0.12, uppercase: true },
  state: { sizePx: 11, weight: 400, letterSpacingEm: 0.04, uppercase: false },
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
