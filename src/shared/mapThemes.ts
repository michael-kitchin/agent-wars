/**
 * The four map themes and the land-color math the tile filter must match.
 *
 * Purpose: One place for water, land, coast, border, grid, and label colors, so the legend,
 *   the tile filter, and the vector layers cannot drift apart.
 * When to use: Read `MAP_THEMES` for the legend and `mapThemeById` for a stored or incoming id.
 * Expected outcome: Unknown ids resolve to Standard. `themedLandRgb` is the color a stored land
 *   byte shows after contrast and the theme filter.
 * Exceptions: None. This module does not touch the DOM.
 */

/**
 * Stable id of one map theme.
 *
 * Purpose: The legend option value and the SVG filter id share this string.
 * When to use: As the key into `MAP_THEMES`. Do not persist it.
 * Expected outcome: One of the four theme ids.
 * Exceptions: None.
 */
export type MapThemeId = 'standard' | 'topographic' | 'nautical' | 'night';

/**
 * Which hex palette a theme reuses.
 *
 * Purpose: Light themes keep the original default hex colors. Night keeps the original dark ones.
 * When to use: When painting hexes, legend chips, or the hex stroke.
 * Expected outcome: `default` or `wargame`.
 * Exceptions: None.
 */
export type HexPaletteId = 'default' | 'wargame';

/**
 * Which bundled face a theme uses for place names.
 *
 * Purpose: Standard and Night are sans. Topographic and Nautical are serif.
 * When to use: When choosing the label canvas font.
 * Expected outcome: `sans` or `serif`.
 * Exceptions: None.
 */
export type MapLabelFontId = 'sans' | 'serif';

/**
 * Fill and halo colors for the three place-name kinds.
 *
 * Purpose: Each theme needs readable text on its own land color.
 * When to use: When stroking and filling a label.
 * Expected outcome: Four CSS colors.
 * Exceptions: None.
 */
export interface MapThemeLabelColors {
  /**
   * Continent names. Fainter than country names.
   *
   * Contract: A CSS color, usually with alpha.
   * When to use: When filling a continent label.
   * Expected outcome: Readable on that theme's land.
   * Exceptions: None.
   */
  readonly continent: string;
  /**
   * Country names.
   *
   * Contract: A CSS color.
   * When to use: When filling a country label.
   * Expected outcome: Darker or brighter than the continent color so it reads first.
   * Exceptions: None.
   */
  readonly country: string;
  /**
   * State and province names.
   *
   * Contract: A CSS color.
   * When to use: When filling a state label.
   * Expected outcome: Quieter than the country color.
   * Exceptions: None.
   */
  readonly state: string;
  /**
   * Halo drawn under the fill so the name stays readable on relief.
   *
   * Contract: A CSS color, usually with alpha.
   * When to use: As the stroke behind the fill.
   * Expected outcome: A light halo on light themes and a dark halo on Night.
   * Exceptions: None.
   */
  readonly halo: string;
}

/**
 * One complete map theme.
 *
 * Purpose: Everything that changes when the player picks a theme, except the hex palette, which is selected by id.
 * When to use: From the legend, the tile filter, and the vector layers.
 * Expected outcome: Colors and font choice for that theme. RGB triples are 0–255.
 * Exceptions: None.
 */
export interface MapTheme {
  /**
   * Stable id. Also the legend option value.
   *
   * Contract: One of `standard`, `topographic`, `nautical`, `night`.
   * When to use: As the select value and the SVG filter id suffix.
   * Expected outcome: Matches a member of `MAP_THEMES`.
   * Exceptions: None.
   */
  readonly id: MapThemeId;
  /**
   * Legend label.
   *
   * Contract: The text shown in the dropdown.
   * When to use: When building the theme options.
   * Expected outcome: Standard, Topographic, Nautical, or Night.
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * Flat water color, painted on the water pane rather than filtered.
   *
   * Contract: A CSS `rgb()` color.
   * When to use: As the water pane background and the water mask fill.
   * Expected outcome: Water stays that color at every zoom.
   * Exceptions: None.
   */
  readonly waterColor: string;
  /**
   * Land color at stored gray 0, after contrast clamps that gray to 0.
   *
   * Contract: Three channels, each 0–255.
   * When to use: As the intercept of the land transfer.
   * Expected outcome: The darkest land the theme can show.
   * Exceptions: None.
   */
  readonly landShadowRgb: readonly [number, number, number];
  /**
   * Land color at stored gray 255.
   *
   * Contract: Three channels, each 0–255.
   * When to use: With the shadow to build the transfer slope.
   * Expected outcome: The lightest land the theme can show.
   * Exceptions: None.
   */
  readonly landHighlightRgb: readonly [number, number, number];
  /**
   * Coastline hairline.
   *
   * Contract: A CSS color, distinct from both border colors.
   * When to use: As the coastline stroke.
   * Expected outcome: The coast reads apart from national borders.
   * Exceptions: None.
   */
  readonly coastlineColor: string;
  /**
   * Solid national borders.
   *
   * Contract: A CSS color.
   * When to use: On the country and disputed-country border layers.
   * Expected outcome: Distinct from the coastline color.
   * Exceptions: None.
   */
  readonly countryBorderColor: string;
  /**
   * Dashed state and province borders.
   *
   * Contract: A CSS color.
   * When to use: On the state and disputed-state border layers.
   * Expected outcome: Quieter than the national border.
   * Exceptions: None.
   */
  readonly stateBorderColor: string;
  /**
   * Elevation-tile grid lines.
   *
   * Contract: A CSS color.
   * When to use: `setStyle` on the grid polylines.
   * Expected outcome: The lines stay visible on that theme's water and land.
   * Exceptions: None.
   */
  readonly gridLineColor: string;
  /**
   * Hex fills, chips, and stroke to reuse.
   *
   * Contract: `default` or `wargame`.
   * When to use: When painting hexes and legend chips.
   * Expected outcome: Night uses `wargame`. The other themes use `default`.
   * Exceptions: None.
   */
  readonly hexPaletteId: HexPaletteId;
  /**
   * Place-name face.
   *
   * Contract: `sans` or `serif`.
   * When to use: When choosing the label font.
   * Expected outcome: Standard and Night use sans. Topographic and Nautical use serif.
   * Exceptions: None.
   */
  readonly labelFont: MapLabelFontId;
  /**
   * Place-name colors.
   *
   * Contract: One color per label kind, plus a halo.
   * When to use: When filling and stroking labels.
   * Expected outcome: Text stays readable on that theme's land.
   * Exceptions: None.
   */
  readonly labelColors: MapThemeLabelColors;
}

/**
 * One linear channel of the land recolor, in the 0–1 units an SVG feFunc uses.
 *
 * Purpose: `feComponentTransfer` computes `slope * channel + intercept`.
 * When to use: When building the theme's SVG filter.
 * Expected outcome: Slope and intercept that map contrast-stretched gray onto the theme.
 * Exceptions: None.
 */
export interface LinearTransfer {
  /**
   * Multiplier on the 0–1 channel.
   *
   * Contract: `(highlight - shadow) / 255`.
   * When to use: As the `slope` of an SVG `feFunc`.
   * Expected outcome: Maps contrast-stretched gray onto the theme.
   * Exceptions: None.
   */
  readonly slope: number;
  /**
   * Added after the slope, still in 0–1.
   *
   * Contract: `shadow / 255`.
   * When to use: As the `intercept` of an SVG `feFunc`.
   * Expected outcome: Gray 0 lands on the theme's shadow color.
   * Exceptions: None.
   */
  readonly intercept: number;
}

/**
 * Themes in legend order.
 *
 * Purpose: The dropdown and the SVG filter list both walk this array.
 * When to use: When building the legend. Do not sort it.
 * Expected outcome: Standard, Topographic, Nautical, Night.
 * Exceptions: None.
 */
export const MAP_THEMES: readonly MapTheme[] = [
  {
    id: 'standard',
    label: 'Standard',
    waterColor: 'rgb(163, 199, 223)',
    landShadowRgb: [92, 90, 85],
    landHighlightRgb: [251, 250, 247],
    coastlineColor: '#6d8ea6',
    countryBorderColor: '#4e6273',
    stateBorderColor: 'rgba(78, 98, 115, 0.7)',
    gridLineColor: 'rgba(48, 56, 64, 0.15)',
    hexPaletteId: 'default',
    labelFont: 'sans',
    labelColors: {
      continent: 'rgba(70, 74, 82, 0.55)',
      country: '#3b3f46',
      state: '#686d76',
      halo: 'rgba(255, 255, 255, 0.85)',
    },
  },
  {
    id: 'topographic',
    label: 'Topographic',
    waterColor: 'rgb(166, 217, 239)',
    landShadowRgb: [107, 85, 54],
    landHighlightRgb: [251, 246, 228],
    coastlineColor: '#3f8fc0',
    countryBorderColor: '#6e5340',
    stateBorderColor: 'rgba(110, 83, 64, 0.65)',
    gridLineColor: 'rgba(48, 56, 64, 0.15)',
    hexPaletteId: 'default',
    labelFont: 'serif',
    labelColors: {
      continent: 'rgba(92, 70, 44, 0.55)',
      country: '#4a3a28',
      state: '#6e5a43',
      halo: 'rgba(251, 246, 228, 0.9)',
    },
  },
  {
    id: 'nautical',
    label: 'Nautical',
    waterColor: 'rgb(227, 241, 248)',
    landShadowRgb: [122, 100, 51],
    landHighlightRgb: [251, 231, 166],
    coastlineColor: '#2f3a40',
    countryBorderColor: '#1e4d78',
    stateBorderColor: 'rgba(30, 77, 120, 0.55)',
    gridLineColor: 'rgba(48, 56, 64, 0.15)',
    hexPaletteId: 'default',
    labelFont: 'serif',
    labelColors: {
      continent: 'rgba(40, 50, 60, 0.5)',
      country: '#2b2f33',
      state: '#4f565c',
      halo: 'rgba(251, 236, 180, 0.9)',
    },
  },
  {
    id: 'night',
    label: 'Night',
    waterColor: 'rgb(15, 26, 38)',
    landShadowRgb: [16, 19, 23],
    landHighlightRgb: [74, 82, 92],
    coastlineColor: '#7d97ad',
    countryBorderColor: '#9eb4c8',
    stateBorderColor: 'rgba(158, 180, 200, 0.6)',
    gridLineColor: 'rgba(210, 216, 228, 0.12)',
    hexPaletteId: 'wargame',
    labelFont: 'sans',
    labelColors: {
      continent: 'rgba(215, 221, 229, 0.45)',
      country: '#d7dde5',
      state: '#a9b3bf',
      halo: 'rgba(10, 14, 20, 0.85)',
    },
  },
];

/**
 * Theme used before the player picks one, and the fallback for an unknown id.
 *
 * Purpose: The choice is not saved, so every launch starts here.
 * When to use: Initial water color and `mapThemeById`.
 * Expected outcome: `standard`.
 * Exceptions: None.
 */
export const DEFAULT_MAP_THEME_ID: MapThemeId = 'standard';

/**
 * Contrast already applied to land tile images by the stylesheet.
 *
 * Purpose: The theme filter is layered on top of this, and the land-color math has to include it.
 * When to use: The underlay filter string and `themedLandRgb`. Do not change the stylesheet without changing this.
 * Expected outcome: `1.4`.
 * Exceptions: None.
 */
export const LAND_TILE_CONTRAST = 1.4;

/**
 * Stored gray of flat land in the hillshade tiles.
 *
 * Purpose: The vector land underlay is filled with this gray so the theme filter matches the tiles.
 * When to use: The underlay fill, and tests of the flat-land color.
 * Expected outcome: `210`.
 * Exceptions: None.
 */
export const FLAT_LAND_GRAY = 210;

const STANDARD_THEME = MAP_THEMES[0]!;

/**
 * Resolves a theme id, including one that is not a theme.
 *
 * Purpose: A stale or empty id must still paint a map.
 * When to use: Whenever an id comes from the legend or from another module.
 * Expected outcome: The matching theme, or Standard when the id is unknown or empty.
 * Exceptions: None.
 */
export function mapThemeById(id: string): MapTheme {
  return MAP_THEMES.find((theme) => theme.id === id) ?? STANDARD_THEME;
}

/**
 * Linear SVG transfer for each land channel.
 *
 * Purpose: The filter and `themedLandRgb` must use the same slope and intercept.
 * When to use: When building `feFuncR`, `feFuncG`, and `feFuncB`.
 * Expected outcome: `slope = (highlight - shadow) / 255` and `intercept = shadow / 255` per channel.
 * Exceptions: None.
 */
export function landTransferFunctions(theme: MapTheme): {
  readonly r: LinearTransfer;
  readonly g: LinearTransfer;
  readonly b: LinearTransfer;
} {
  const channel = (index: 0 | 1 | 2): LinearTransfer => ({
    slope: (theme.landHighlightRgb[index] - theme.landShadowRgb[index]) / 255,
    intercept: theme.landShadowRgb[index] / 255,
  });
  return { r: channel(0), g: channel(1), b: channel(2) };
}

/**
 * Screen color of one stored land gray under a theme.
 *
 * Purpose: Documents the contract the SVG filter implements: contrast first, then the linear transfer.
 * When to use: Tests, and any preview that cannot run the SVG filter.
 * Expected outcome: Three channels in 0–255. Stored gray 0 maps to `landShadowRgb`.
 * Exceptions: None.
 */
export function themedLandRgb(theme: MapTheme, storedGray: number): [number, number, number] {
  const normalized = storedGray / 255;
  const contrasted = Math.min(1, Math.max(0, (normalized - 0.5) * LAND_TILE_CONTRAST + 0.5));
  const transfer = landTransferFunctions(theme);
  const channel = (fn: LinearTransfer): number => Math.round((fn.slope * contrasted + fn.intercept) * 255);
  return [channel(transfer.r), channel(transfer.g), channel(transfer.b)];
}
