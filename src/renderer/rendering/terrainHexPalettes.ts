/**
 * Hex fills, hatches, legend chips, and strokes reused by the map themes.
 *
 * Purpose: Standard, Topographic, and Nautical share the original default hex colors.
 *   Night shares the original wargame hex colors. The base map is what the theme changes.
 * When to use: From hex painting and the legend. Do not add a third palette here.
 * Expected outcome: `default` and `wargame` only.
 * Exceptions: None.
 */

import type { PipelineTerrainKind } from '../../shared/pipelineTerrain';
import type { HexPaletteId } from '../../shared/mapThemes';

/**
 * One hatch drawn over a terrain fill.
 *
 * Purpose: Mountains, forest, coast, wetlands, and desert stay distinguishable when the fill is faint.
 * When to use: As a field of `TerrainHexPalette`.
 * Expected outcome: A repeating stroke. `pattern` selects the shape. Omitted means a diagonal line.
 * Exceptions: None.
 */
export interface TerrainHatchStyle {
  /**
   * Stroke color, including its own alpha.
   *
   * Contract: A CSS color.
   * When to use: As the hatch stroke.
   * Expected outcome: The hatch stays visible over the fill.
   * Exceptions: None.
   */
  readonly color: string;
  /**
   * Distance between strokes, in pixels.
   *
   * Contract: A positive number.
   * When to use: When repeating the hatch.
   * Expected outcome: Wider spacing reads as a lighter texture.
   * Exceptions: None.
   */
  readonly spacing: number;
  /**
   * Stroke width, in pixels. Dots use twice this as their diameter.
   *
   * Contract: A positive number.
   * When to use: When stroking the hatch.
   * Expected outcome: Matches the width the old preset used.
   * Exceptions: None.
   */
  readonly lineWidth: number;
  /**
   * True draws the diagonal from the top left. False draws it from the bottom left.
   *
   * Contract: A boolean.
   * When to use: For diagonal and crosshatched patterns.
   * Expected outcome: The stroke leans the way the old preset did.
   * Exceptions: None.
   */
  readonly reverseDiagonal: boolean;
  /**
   * When true, a second diagonal crosses the first.
   *
   * Contract: Optional. Used by rubble.
   * When to use: Only when the old preset crossed the hatch.
   * Expected outcome: Omitted means a single direction.
   * Exceptions: None.
   */
  readonly crosshatch?: boolean;
  /**
   * Shape. Omitted means a single diagonal.
   *
   * Contract: `diagonal`, `dots`, or `orthogonal` when set.
   * When to use: When the old preset was not a plain diagonal.
   * Expected outcome: The painter picks that shape.
   * Exceptions: None.
   */
  readonly pattern?: 'diagonal' | 'dots' | 'orthogonal';
}

/**
 * Hex colors for one palette.
 *
 * Purpose: Replaces the old per-style preset without a label or a basemap id. Those belonged to the theme.
 * When to use: `TERRAIN_HEX_PALETTES`.
 * Expected outcome: Fills, hatches, and the two overlay treatments.
 * Exceptions: None.
 */
export interface TerrainHexPalette {
  /**
   * Multiplier applied to each fill alpha when a hex is painted.
   *
   * Contract: The value the old preset used, `0.55`.
   * When to use: When painting a hex fill.
   * Expected outcome: Fills stay translucent so the hillshade shows through.
   * Exceptions: None.
   */
  readonly fillAlphaMultiplier: number;
  /**
   * Multiplier applied to each hatch alpha.
   *
   * Contract: The value the old preset used.
   * When to use: When painting a hatch.
   * Expected outcome: Hatches keep the old strength.
   * Exceptions: None.
   */
  readonly hatchAlphaMultiplier: number;
  /**
   * Translucent fill per terrain kind.
   *
   * Contract: One CSS color for every pipeline terrain kind.
   * When to use: When filling a hex.
   * Expected outcome: The color the old preset used for that kind.
   * Exceptions: None.
   */
  readonly fills: Record<PipelineTerrainKind, string>;
  /**
   * Hatches for the kinds that have one.
   *
   * Contract: A partial map. Missing kinds have no hatch.
   * When to use: When painting a hatch over a fill.
   * Expected outcome: The hatch the old preset used.
   * Exceptions: None.
   */
  readonly hatches: Partial<Record<PipelineTerrainKind, TerrainHatchStyle>>;
  /**
   * Urban overlay fill.
   *
   * Contract: A CSS color.
   * When to use: When painting the urban overlay.
   * Expected outcome: The color the old preset used.
   * Exceptions: None.
   */
  readonly urbanOverlayFill: string;
  /**
   * Urban overlay hatch.
   *
   * Contract: A hatch style.
   * When to use: Over the urban fill.
   * Expected outcome: The hatch the old preset used.
   * Exceptions: None.
   */
  readonly urbanOverlayHatch: TerrainHatchStyle;
  /**
   * Rubble overlay fill.
   *
   * Contract: A CSS color.
   * When to use: When painting the rubble overlay.
   * Expected outcome: The color the old preset used.
   * Exceptions: None.
   */
  readonly rubbleOverlayFill: string;
  /**
   * Rubble overlay hatch.
   *
   * Contract: A hatch style.
   * When to use: Over the rubble fill.
   * Expected outcome: The hatch the old preset used.
   * Exceptions: None.
   */
  readonly rubbleOverlayHatch: TerrainHatchStyle;
}

/**
 * The two hex palettes.
 *
 * Purpose: Night selects `wargame`. Every other theme selects `default`.
 * When to use: `hexPaletteById`.
 * Expected outcome: The colors previously shipped as Default and Wargame.
 * Exceptions: None.
 */
export const TERRAIN_HEX_PALETTES: Record<HexPaletteId, TerrainHexPalette> = {
  default: {
    fillAlphaMultiplier: 0.55,
    hatchAlphaMultiplier: 0.375,
    fills: {
      water: 'rgba(52, 120, 204, 0.28)',
      coastal: 'rgba(69, 165, 186, 0.24)',
      wetlands: 'rgba(69, 165, 186, 0.24)',
      plains: 'rgba(188, 205, 162, 0.2)',
      forest: 'rgba(52, 136, 84, 0.43)',
      mountain: 'rgba(127, 83, 171, 0.55)',
      desert: 'rgba(206, 176, 118, 0.44)',
      arctic: 'rgba(234, 245, 255, 0.5)',
    },
    hatches: {
      mountain: { color: 'rgba(74, 35, 116, 0.62)', spacing: 7, lineWidth: 0.95, reverseDiagonal: true },
      forest: { color: 'rgba(16, 72, 36, 0.44)', spacing: 7, lineWidth: 0.88, reverseDiagonal: true },
      coastal: { color: 'rgba(40, 130, 155, 0.32)', spacing: 8, lineWidth: 0.72, reverseDiagonal: false },
      wetlands: { color: 'rgba(40, 130, 155, 0.32)', spacing: 8, lineWidth: 0.72, reverseDiagonal: true },
      desert: { color: 'rgba(145, 104, 42, 0.48)', spacing: 7, lineWidth: 1, reverseDiagonal: false, pattern: 'dots' },
    },
    urbanOverlayFill: 'rgba(130, 112, 96, 0.46)',
    urbanOverlayHatch: { color: 'rgba(110, 22, 18, 0.413)', spacing: 6, lineWidth: 0.85, reverseDiagonal: false, pattern: 'orthogonal' },
    rubbleOverlayFill: 'rgba(130, 112, 96, 0.46)',
    rubbleOverlayHatch: { color: 'rgba(110, 22, 18, 0.413)', spacing: 5, lineWidth: 0.85, reverseDiagonal: true, crosshatch: true },
  },
  wargame: {
    fillAlphaMultiplier: 0.55,
    hatchAlphaMultiplier: 0.375,
    fills: {
      water: 'rgba(38, 118, 206, 0.28)',
      coastal: 'rgba(70, 176, 192, 0.24)',
      wetlands: 'rgba(70, 176, 192, 0.24)',
      plains: 'rgba(170, 188, 136, 0.2)',
      forest: 'rgba(58, 150, 86, 0.43)',
      mountain: 'rgba(218, 76, 146, 0.5)',
      desert: 'rgba(221, 171, 88, 0.46)',
      arctic: 'rgba(221, 236, 255, 0.5)',
    },
    hatches: {
      mountain: { color: 'rgba(255, 162, 214, 0.68)', spacing: 7, lineWidth: 0.95, reverseDiagonal: true },
      forest: { color: 'rgba(130, 245, 190, 0.58)', spacing: 7, lineWidth: 0.9, reverseDiagonal: true },
      coastal: { color: 'rgba(110, 220, 235, 0.42)', spacing: 8, lineWidth: 0.72, reverseDiagonal: false },
      wetlands: { color: 'rgba(110, 220, 235, 0.42)', spacing: 8, lineWidth: 0.72, reverseDiagonal: true },
      desert: { color: 'rgba(255, 207, 130, 0.5)', spacing: 7, lineWidth: 1.05, reverseDiagonal: false, pattern: 'dots' },
    },
    urbanOverlayFill: 'rgba(132, 112, 97, 0.46)',
    urbanOverlayHatch: { color: 'rgba(110, 22, 18, 0.413)', spacing: 6, lineWidth: 0.88, reverseDiagonal: false, pattern: 'orthogonal' },
    rubbleOverlayFill: 'rgba(132, 112, 97, 0.46)',
    rubbleOverlayHatch: { color: 'rgba(110, 22, 18, 0.413)', spacing: 5, lineWidth: 0.88, reverseDiagonal: true, crosshatch: true },
  },
};

/**
 * Opaque legend and tooltip chips, one set per hex palette.
 *
 * Purpose: The hex fills are translucent and wash out on navy chrome.
 * When to use: Legend rows and `.terrain-swatch` chips only.
 * Expected outcome: Coastal stays blue-green and wetlands a greener teal.
 * Exceptions: None.
 */
export const TERRAIN_SWATCH_COLORS: Record<HexPaletteId, Record<PipelineTerrainKind, string>> = {
  default: {
    water: '#3d82d6',
    coastal: '#2a9aaf',
    wetlands: '#2f8f72',
    plains: '#9bb56e',
    forest: '#3a9a52',
    mountain: '#8a5cb8',
    desert: '#d4a85a',
    arctic: '#d7e7f6',
  },
  wargame: {
    water: '#3a80d4',
    coastal: '#34a8b8',
    wetlands: '#36a080',
    plains: '#96b068',
    forest: '#3c9e56',
    mountain: '#e05a9a',
    desert: '#e0ac52',
    arctic: '#d4e3f8',
  },
};

/**
 * Hex outline color and width.
 *
 * Purpose: Callers stroke with both numbers together.
 * When to use: As the return of `hexStrokeStyleFor`.
 * Expected outcome: A CSS color and a width in pixels.
 * Exceptions: None.
 */
export interface HexStrokeStyle {
  /**
   * Stroke color, including its own alpha.
   *
   * Contract: A CSS color.
   * When to use: As the canvas stroke style.
   * Expected outcome: The default or wargame color.
   * Exceptions: None.
   */
  readonly color: string;
  /**
   * Stroke width, in pixels.
   *
   * Contract: A positive number.
   * When to use: As the canvas line width.
   * Expected outcome: `0.5` for the default palette and `0.72` for wargame.
   * Exceptions: None.
   */
  readonly width: number;
}

const DEFAULT_HEX_STROKE: HexStrokeStyle = { color: 'rgba(36,38,42,0.4)', width: 0.5 };
const WARGAME_HEX_STROKE: HexStrokeStyle = { color: 'rgba(210, 216, 228, 0.077)', width: 0.72 };

/**
 * Returns the hex palette for an id.
 *
 * Purpose: Callers should not index the table themselves.
 * When to use: Hex painting.
 * Expected outcome: The matching palette. An unexpected id is `default`.
 * Exceptions: None.
 */
export function hexPaletteById(paletteId: HexPaletteId): TerrainHexPalette {
  return TERRAIN_HEX_PALETTES[paletteId] ?? TERRAIN_HEX_PALETTES.default;
}

/**
 * Returns the opaque chip color for one kind.
 *
 * Purpose: Legend rows and tooltip swatches share one solid color.
 * When to use: When assigning a swatch background. Do not use this for hex fills.
 * Expected outcome: A hex color. An unknown kind is `#9aa3ad`.
 * Exceptions: None.
 */
export function terrainSwatchColor(paletteId: HexPaletteId, kind: string): string {
  const colors = TERRAIN_SWATCH_COLORS[paletteId] ?? TERRAIN_SWATCH_COLORS.default;
  return colors[kind as PipelineTerrainKind] ?? '#9aa3ad';
}

/**
 * Returns the hex outline for a palette.
 *
 * Purpose: Night keeps the lighter wargame stroke. The other themes keep the default stroke.
 * When to use: When stroking a hex.
 * Expected outcome: Color and width. An unexpected id uses the default stroke.
 * Exceptions: None.
 */
export function hexStrokeStyleFor(paletteId: HexPaletteId): HexStrokeStyle {
  return paletteId === 'wargame' ? WARGAME_HEX_STROKE : DEFAULT_HEX_STROKE;
}
