/**
 * Canvas fill (and optional hatch) per pipeline terrain_kind. Ocean vs land legibility is the priority.
 */

import type { PipelineTerrainKind } from '../../shared/pipelineTerrain';
import { PIPELINE_TERRAIN_KINDS } from '../../shared/pipelineTerrain';
import { formatTerrainKindLabel } from '../../shared/terrainKindLabel';
import { TERRAIN_SWATCH_CLASS_NAME } from '../../shared/terrainSwatchHtml';
import { appendLegendRow, applyLegendSwatchChrome } from './terrainLegendRow';
import { appendUrbanLegendRow, urbanSwatchColor } from './terrainLegendUrban';
import { appendFortifiedLegendRow } from './terrainLegendFortified';
import { appendRubbleLegendRow, applyRubbleSwatchPaint } from './terrainLegendRubble';
import { terrainStyleTooltipText } from '../chrome/controlTooltipText';

/**
 * Documents the module-scope binding `patternCache` (patternCache).

 * Purpose: Supports maintainability by documenting why `patternCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const patternCache = new Map<string, CanvasPattern | null>();
/**
 * Documents the module-scope binding `UNKNOWN_FILL` (UNKNOWN_FILL).

 * Purpose: Supports maintainability by documenting why `UNKNOWN_FILL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const UNKNOWN_FILL = 'rgba(140, 140, 140, 0.075)';

/**
 * Documents the module-scope binding `DEFAULT_HEX_STROKE_COLOR` (DEFAULT_HEX_STROKE_COLOR).

 * Purpose: Supports maintainability by documenting why `DEFAULT_HEX_STROKE_COLOR` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const DEFAULT_HEX_STROKE_COLOR = 'rgba(36,38,42,0.4)';
/**
 * Documents the module-scope binding `DEFAULT_HEX_STROKE_WIDTH` (DEFAULT_HEX_STROKE_WIDTH).

 * Purpose: Supports maintainability by documenting why `DEFAULT_HEX_STROKE_WIDTH` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const DEFAULT_HEX_STROKE_WIDTH = 0.5;

/**
 * Documents the module-scope binding `WARGAME_HEX_STROKE_COLOR` (WARGAME_HEX_STROKE_COLOR).

 * Purpose: Supports maintainability by documenting why `WARGAME_HEX_STROKE_COLOR` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const WARGAME_HEX_STROKE_COLOR = 'rgba(210, 216, 228, 0.077)';
/**
 * Documents the module-scope binding `WARGAME_HEX_STROKE_WIDTH` (WARGAME_HEX_STROKE_WIDTH).

 * Purpose: Supports maintainability by documenting why `WARGAME_HEX_STROKE_WIDTH` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const WARGAME_HEX_STROKE_WIDTH = 0.72;

/**
 * Documents the module-scope binding `LAND_HOVER_FILL_BASE` (LAND_HOVER_FILL_BASE).

 * Purpose: Supports maintainability by documenting why `LAND_HOVER_FILL_BASE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const LAND_HOVER_FILL_BASE = 'rgba(155, 168, 128, 0.42)';

/**
 * Documents the `TerrainVisualStyleId` type alias (export type TerrainVisualStyleId).

 * Purpose: Supports maintainability by documenting why `TerrainVisualStyleId` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type TerrainVisualStyleId = 'default' | 'atlas' | 'wargame' | 'scientific';

/**
 * Documents the `HatchStyle` interface as a named contract surface (interface HatchStyle).

 * Purpose: Supports maintainability by documenting why `HatchStyle` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface HatchStyle {
    /**
   * Specifies the contract for the `color` member (color: string;).

   * Contract: Describes stable behavior for callers of `color` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
color: string;
    /**
   * Specifies the contract for the `spacing` member (spacing: number;).

   * Contract: Describes stable behavior for callers of `spacing` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
spacing: number;
    /**
   * Specifies the contract for the `lineWidth` member (lineWidth: number;).

   * Contract: Describes stable behavior for callers of `lineWidth` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lineWidth: number;
    /**
   * Specifies the contract for the `reverseDiagonal` member (reverseDiagonal: boolean;).

   * Contract: Describes stable behavior for callers of `reverseDiagonal` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reverseDiagonal: boolean;
    /**
   * Specifies the contract for the `crosshatch` member (crosshatch?: boolean;).

   * Contract: Describes stable behavior for callers of `crosshatch` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
crosshatch?: boolean;
    /**
   * Specifies the contract for the `pattern` member (pattern?: 'diagonal' | 'dots' | 'orthogonal';).

   * Contract: Describes stable behavior for callers of `pattern` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pattern?: 'diagonal' | 'dots' | 'orthogonal';
}

/**
 * Documents the `TerrainStylePreset` interface as a named contract surface (interface TerrainStylePreset).

 * Purpose: Supports maintainability by documenting why `TerrainStylePreset` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface TerrainStylePreset {
    /**
   * Specifies the contract for the `label` member (label: string;).

   * Contract: Describes stable behavior for callers of `label` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
label: string;
    /**
   * Specifies the contract for the `basemapId` member (basemapId: string;).

   * Contract: Describes stable behavior for callers of `basemapId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
basemapId: string;
    /**
   * Specifies the contract for the `fillAlphaMultiplier` member (fillAlphaMultiplier: number;).

   * Contract: Describes stable behavior for callers of `fillAlphaMultiplier` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fillAlphaMultiplier: number;
    /**
   * Specifies the contract for the `hatchAlphaMultiplier` member (hatchAlphaMultiplier: number;).

   * Contract: Describes stable behavior for callers of `hatchAlphaMultiplier` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hatchAlphaMultiplier: number;
    /**
   * Specifies the contract for the `fills` member (fills: Record<PipelineTerrainKind, string>;).

   * Contract: Describes stable behavior for callers of `fills` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fills: Record<PipelineTerrainKind, string>;
    /**
   * Specifies the contract for the `hatches` member (hatches: Partial<Record<PipelineTerrainKind, HatchStyle>>;).

   * Contract: Describes stable behavior for callers of `hatches` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hatches: Partial<Record<PipelineTerrainKind, HatchStyle>>;
    /**
   * Specifies the contract for the `urbanOverlayFill` member (urbanOverlayFill: string;).

   * Contract: Describes stable behavior for callers of `urbanOverlayFill` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanOverlayFill: string;
    /**
   * Specifies the contract for the `urbanOverlayHatch` member (urbanOverlayHatch: HatchStyle;).

   * Contract: Describes stable behavior for callers of `urbanOverlayHatch` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanOverlayHatch: HatchStyle;
    /**
   * Specifies the contract for the `rubbleOverlayFill` member (rubbleOverlayFill: string;).

   * Contract: Describes stable behavior for callers of `rubbleOverlayFill` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rubbleOverlayFill: string;
    /**
   * Specifies the contract for the `rubbleOverlayHatch` member (rubbleOverlayHatch: HatchStyle;).

   * Contract: Describes stable behavior for callers of `rubbleOverlayHatch` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rubbleOverlayHatch: HatchStyle;
}

/**
 * Documents the module-scope binding `TERRAIN_STYLE_PRESETS` (TERRAIN_STYLE_PRESETS: Record<TerrainVisualStyleId, TerrainStylePreset>).

 * Purpose: Supports maintainability by documenting why `TERRAIN_STYLE_PRESETS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const TERRAIN_STYLE_PRESETS: Record<TerrainVisualStyleId, TerrainStylePreset> = {
    /**
   * Documents the object literal property `default` (default: { label: 'Default', basemapId: 'esri_world_shaded_relief', fillAlphaMultiplier: 0.55, hatchAlphaMultiplier: 0.375, fills: {).

   * Purpose: Supports maintainability by documenting why `default` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
default: {
    label: 'Default',
    basemapId: 'esri_world_shaded_relief',
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
    /**
   * Documents the object literal property `atlas` (atlas: { label: 'Atlas', basemapId: 'esri_world_shaded_relief', fillAlphaMultiplier: 0.55, hatchAlphaMultiplier: 0.375, fills: { w).

   * Purpose: Supports maintainability by documenting why `atlas` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
atlas: {
    label: 'Atlas',
    basemapId: 'esri_world_shaded_relief',
    fillAlphaMultiplier: 0.55,
    hatchAlphaMultiplier: 0.375,
    fills: {
      water: 'rgba(56, 128, 214, 0.28)',
      coastal: 'rgba(76, 173, 188, 0.24)',
      wetlands: 'rgba(76, 173, 188, 0.24)',
      plains: 'rgba(193, 211, 165, 0.2)',
      forest: 'rgba(70, 146, 86, 0.43)',
      mountain: 'rgba(168, 70, 96, 0.55)',
      desert: 'rgba(220, 189, 128, 0.44)',
      arctic: 'rgba(235, 244, 255, 0.5)',
    },
    hatches: {
      mountain: { color: 'rgba(114, 26, 50, 0.62)', spacing: 7, lineWidth: 0.95, reverseDiagonal: true },
      forest: { color: 'rgba(16, 72, 36, 0.44)', spacing: 7, lineWidth: 0.88, reverseDiagonal: true },
      coastal: { color: 'rgba(40, 130, 155, 0.32)', spacing: 8, lineWidth: 0.72, reverseDiagonal: false },
      wetlands: { color: 'rgba(40, 130, 155, 0.32)', spacing: 8, lineWidth: 0.72, reverseDiagonal: true },
      desert: { color: 'rgba(152, 109, 47, 0.48)', spacing: 7, lineWidth: 1, reverseDiagonal: false, pattern: 'dots' },
    },
    urbanOverlayFill: 'rgba(141, 122, 103, 0.46)',
    urbanOverlayHatch: { color: 'rgba(110, 22, 18, 0.413)', spacing: 6, lineWidth: 0.85, reverseDiagonal: false, pattern: 'orthogonal' },
    rubbleOverlayFill: 'rgba(141, 122, 103, 0.46)',
    rubbleOverlayHatch: { color: 'rgba(110, 22, 18, 0.413)', spacing: 5, lineWidth: 0.85, reverseDiagonal: true, crosshatch: true },
  },
    /**
   * Documents the object literal property `wargame` (wargame: { label: 'Wargame', basemapId: 'esri_world_shaded_relief', fillAlphaMultiplier: 0.55, hatchAlphaMultiplier: 0.375, fills: {).

   * Purpose: Supports maintainability by documenting why `wargame` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
wargame: {
    label: 'Wargame',
    basemapId: 'esri_world_shaded_relief',
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
    /**
   * Documents the object literal property `scientific` (scientific: { label: 'Scientific', basemapId: 'esri_world_shaded_relief', fillAlphaMultiplier: 0.55, hatchAlphaMultiplier: 0.375, fills).

   * Purpose: Supports maintainability by documenting why `scientific` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scientific: {
    label: 'Scientific',
    basemapId: 'esri_world_shaded_relief',
    fillAlphaMultiplier: 0.55,
    hatchAlphaMultiplier: 0.375,
    fills: {
      water: 'rgba(42, 117, 214, 0.28)',
      coastal: 'rgba(59, 186, 194, 0.24)',
      wetlands: 'rgba(59, 186, 194, 0.24)',
      plains: 'rgba(186, 208, 160, 0.2)',
      forest: 'rgba(50, 142, 74, 0.43)',
      mountain: 'rgba(154, 77, 122, 0.54)',
      desert: 'rgba(214, 182, 120, 0.44)',
      arctic: 'rgba(234, 245, 255, 0.5)',
    },
    hatches: {
      mountain: { color: 'rgba(95, 24, 74, 0.62)', spacing: 7, lineWidth: 0.95, reverseDiagonal: true },
      forest: { color: 'rgba(16, 72, 36, 0.44)', spacing: 7, lineWidth: 0.88, reverseDiagonal: true },
      coastal: { color: 'rgba(40, 130, 155, 0.32)', spacing: 8, lineWidth: 0.72, reverseDiagonal: false },
      wetlands: { color: 'rgba(40, 130, 155, 0.32)', spacing: 8, lineWidth: 0.72, reverseDiagonal: true },
      desert: { color: 'rgba(150, 104, 43, 0.48)', spacing: 7, lineWidth: 1, reverseDiagonal: false, pattern: 'dots' },
    },
    urbanOverlayFill: 'rgba(137, 117, 98, 0.46)',
    urbanOverlayHatch: { color: 'rgba(110, 22, 18, 0.413)', spacing: 6, lineWidth: 0.85, reverseDiagonal: false, pattern: 'orthogonal' },
    rubbleOverlayFill: 'rgba(137, 117, 98, 0.46)',
    rubbleOverlayHatch: { color: 'rgba(110, 22, 18, 0.413)', spacing: 5, lineWidth: 0.85, reverseDiagonal: true, crosshatch: true },
  },
};

/**
 * Documents the module-scope binding `activeTerrainStyleId` (activeTerrainStyleId: TerrainVisualStyleId).

 * Purpose: Supports maintainability by documenting why `activeTerrainStyleId` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let activeTerrainStyleId: TerrainVisualStyleId = 'default';

/**
 * Defines the `makeDiagonalHatchPattern` function shape (function makeDiagonalHatchPattern( color: string, spacing: number, lineWidth: number, reverseDiagonal: boolean, crosshatch = false ): CanvasPatt).

 * Purpose: Supports maintainability by documenting why `makeDiagonalHatchPattern` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function makeDiagonalHatchPattern(
  color: string,
  spacing: number,
  lineWidth: number,
  reverseDiagonal: boolean,
  crosshatch = false
): CanvasPattern | null {
  const c = document.createElement('canvas');
  const s = spacing * 2;
  c.width = s;
  c.height = s;
  const p = c.getContext('2d');
  if (!p) return null;
  p.strokeStyle = color;
  p.lineWidth = lineWidth;
  p.beginPath();
  if (reverseDiagonal) {
    p.moveTo(0, 0);
    p.lineTo(s, s);
  } else {
    p.moveTo(0, s);
    p.lineTo(s, 0);
  }
  if (crosshatch) {
    if (reverseDiagonal) {
      p.moveTo(0, s);
      p.lineTo(s, 0);
    } else {
      p.moveTo(0, 0);
      p.lineTo(s, s);
    }
  }
  p.stroke();
  return p.createPattern(c, 'repeat');
}

/**
 * Defines the `makeDotPattern` function shape (function makeDotPattern(color: string, spacing: number, diameter: number): CanvasPattern | null).

 * Purpose: Supports maintainability by documenting why `makeDotPattern` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function makeDotPattern(color: string, spacing: number, diameter: number): CanvasPattern | null {
  const c = document.createElement('canvas');
  const s = Math.max(2, spacing);
  c.width = s;
  c.height = s;
  const p = c.getContext('2d');
  if (!p) return null;
  const r = Math.max(0.5, diameter * 0.5);
  p.fillStyle = color;
  p.beginPath();
  p.arc(s * 0.5, s * 0.5, r, 0, Math.PI * 2);
  p.fill();
  return p.createPattern(c, 'repeat');
}

/**
 * Defines the `makeOrthogonalHatchPattern` function shape (function makeOrthogonalHatchPattern(color: string, spacing: number, lineWidth: number): CanvasPattern | null).

 * Purpose: Supports maintainability by documenting why `makeOrthogonalHatchPattern` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function makeOrthogonalHatchPattern(color: string, spacing: number, lineWidth: number): CanvasPattern | null {
  const c = document.createElement('canvas');
  const s = spacing * 2;
  c.width = s;
  c.height = s;
  const p = c.getContext('2d');
  if (!p) return null;
  p.strokeStyle = color;
  p.lineWidth = lineWidth;
  p.beginPath();
  p.moveTo(0, s * 0.5);
  p.lineTo(s, s * 0.5);
  p.moveTo(s * 0.5, 0);
  p.lineTo(s * 0.5, s);
  p.stroke();
  return p.createPattern(c, 'repeat');
}

/**
 * Defines the `boostRgbaAlpha` function shape (function boostRgbaAlpha(color: string, factor: number): string).

 * Purpose: Supports maintainability by documenting why `boostRgbaAlpha` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function boostRgbaAlpha(color: string, factor: number): string {
  const m = color.match(/^rgba\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i);
  if (!m) return color;
  const r = m[1]!.trim();
  const g = m[2]!.trim();
  const b = m[3]!.trim();
  const a = Number(m[4]!.trim());
  if (!Number.isFinite(a)) return color;
  const boosted = Math.max(0, Math.min(1, a * factor));
  const aStr = String(Number(boosted.toFixed(3)));
  return `rgba(${r}, ${g}, ${b}, ${aStr})`;
}

/**
 * Defines the `activePreset` function shape (function activePreset(): TerrainStylePreset).

 * Purpose: Supports maintainability by documenting why `activePreset` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function activePreset(): TerrainStylePreset {
  return TERRAIN_STYLE_PRESETS[activeTerrainStyleId];
}

/**
 * Defines the `getTerrainStyleOptions` function shape (export function getTerrainStyleOptions(): Array<).

 * Purpose: Supports maintainability by documenting why `getTerrainStyleOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getTerrainStyleOptions(): Array<{ id: TerrainVisualStyleId; label: string }> {
  return (Object.keys(TERRAIN_STYLE_PRESETS) as TerrainVisualStyleId[]).map((id) => ({
    id,
    label: TERRAIN_STYLE_PRESETS[id].label,
  }));
}

/**
 * Defines the `getActiveTerrainStyleId` function shape (export function getActiveTerrainStyleId(): TerrainVisualStyleId).

 * Purpose: Supports maintainability by documenting why `getActiveTerrainStyleId` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getActiveTerrainStyleId(): TerrainVisualStyleId {
  return activeTerrainStyleId;
}

/**
 * Defines the `getActiveTerrainStyleBasemapId` function shape (export function getActiveTerrainStyleBasemapId(): string).

 * Purpose: Supports maintainability by documenting why `getActiveTerrainStyleBasemapId` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getActiveTerrainStyleBasemapId(): string {
  return activePreset().basemapId;
}

/**
 * Defines the `getActiveHexStrokeStyle` function shape (export function getActiveHexStrokeStyle():).

 * Purpose: Supports maintainability by documenting why `getActiveHexStrokeStyle` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getActiveHexStrokeStyle(): { color: string; width: number } {
  if (activeTerrainStyleId === 'wargame') {
    return { color: WARGAME_HEX_STROKE_COLOR, width: WARGAME_HEX_STROKE_WIDTH };
  }
  return { color: DEFAULT_HEX_STROKE_COLOR, width: DEFAULT_HEX_STROKE_WIDTH };
}

/**
 * Defines the `setActiveTerrainStyle` function shape (export function setActiveTerrainStyle(id: TerrainVisualStyleId): void).

 * Purpose: Supports maintainability by documenting why `setActiveTerrainStyle` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setActiveTerrainStyle(id: TerrainVisualStyleId): void {
  if (activeTerrainStyleId === id) return;
  activeTerrainStyleId = id;
  patternCache.clear();
}

/**
 * Paints each terrain swatch in a tooltip from the style selected now.
 *
 * Purpose: Tooltip markup names the kind. The fill is read when the tooltip is shown, so a style change
 *   applies the next time that tooltip opens.
 * When to use: Immediately after assigning tooltip HTML that may contain `.terrain-swatch` spans.
 * Expected outcome: Each span's background is the opaque swatch color for that kind under the active style. A rubble span also receives the crosshatch. An open tooltip is left as it was.
 * Exceptions: None.
 */
export function paintTerrainSwatches(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(`span.${TERRAIN_SWATCH_CLASS_NAME}`).forEach((node) => {
    const kind = node.dataset.terrainKind;
    if (!kind) return;
    if (kind === 'urban') {
      node.style.background = urbanSwatchColor(activeTerrainStyleId);
      return;
    }
    if (kind === 'rubble') {
      applyRubbleSwatchPaint(node, activeTerrainStyleId);
      return;
    }
    node.style.background = terrainSwatchColor(kind);
  });
}

/**
 * Opaque legend and tooltip chips, one set per map style.
 *
 * Purpose: The hex fills are translucent and wash out on navy chrome. These solids keep each kind recognizable without changing the map.
 * When to use: Only for legend rows and `.terrain-swatch` chips.
 * Expected outcome: Coastal stays blue-green and wetlands a greener teal so the two rows are not the same chip. Mountain follows that style's hue.
 * Exceptions: None.
 */
const TERRAIN_SWATCH_COLORS: Record<TerrainVisualStyleId, Record<PipelineTerrainKind, string>> = {
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
  atlas: {
    water: '#3f86dc',
    coastal: '#2e9eb4',
    wetlands: '#339878',
    plains: '#a0ba74',
    forest: '#40a058',
    mountain: '#b44a64',
    desert: '#dbb468',
    arctic: '#d8e8f7',
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
  scientific: {
    water: '#3c84d8',
    coastal: '#2aa8b0',
    wetlands: '#329882',
    plains: '#9cb672',
    forest: '#38964e',
    mountain: '#b04a84',
    desert: '#d4b062',
    arctic: '#d7e7f6',
  },
};

/**
 * Returns the opaque chip color for a terrain kind under the active map style.
 *
 * Purpose: Legend rows and tooltip swatches need a solid color that still reads on navy chrome.
 * When to use: When assigning a swatch background. Do not use this for hex fills.
 * Expected outcome: A hex color. An unknown kind is neutral gray `#9aa3ad`.
 * Exceptions: None.
 */
function terrainSwatchColor(kind: string): string {
  const colors = TERRAIN_SWATCH_COLORS[activeTerrainStyleId];
  return colors[kind as PipelineTerrainKind] ?? '#9aa3ad';
}

/**
 * Returns the translucent hex fill for one terrain kind under the active style.
 *
 * Purpose: Hex painting keeps the muted map palette. Legend rows and tooltip chips use `terrainSwatchColor`.
 * When to use: `fillHexTerrain` and any other hex fill.
 * Expected outcome: An rgba color. An unknown kind uses the unknown fill. Urban overlay uses that preset's urban color.
 * Exceptions: None.
 */
export function terrainKindFillStyle(kind: string, options?: { urbanOverlay?: boolean }): string {
  const k = kind as PipelineTerrainKind;
  const p = activePreset();
  const base = options?.urbanOverlay ? p.urbanOverlayFill : (p.fills[k] ?? UNKNOWN_FILL);
  return boostRgbaAlpha(base, p.fillAlphaMultiplier);
}

/**
 * Defines the `landHoverFillStyle` function shape (function landHoverFillStyle(): string).

 * Purpose: Supports maintainability by documenting why `landHoverFillStyle` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function landHoverFillStyle(): string {
  return boostRgbaAlpha(LAND_HOVER_FILL_BASE, activePreset().fillAlphaMultiplier);
}

/**
 * Defines the `terrainKindPattern` function shape (export function terrainKindPattern( ctx: CanvasRenderingContext2D, kind: string, fillAndHatchAlphaScale = 1, options?: { urbanOverlay?: boolean; rub).

 * Purpose: Supports maintainability by documenting why `terrainKindPattern` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function terrainKindPattern(
  ctx: CanvasRenderingContext2D,
  kind: string,
  fillAndHatchAlphaScale = 1,
  options?: { urbanOverlay?: boolean; rubbleOverlay?: boolean }
): CanvasPattern | null {
  const k = kind as PipelineTerrainKind;
  const overlayKey = options?.rubbleOverlay ? 'rubble' : options?.urbanOverlay ? 'urban' : 'base';
  const key = `${activeTerrainStyleId}:${k}:${fillAndHatchAlphaScale}:${overlayKey}`;
  if (patternCache.has(key)) return patternCache.get(key) ?? null;

  const p = activePreset();
  const spec = options?.rubbleOverlay ? p.rubbleOverlayHatch : options?.urbanOverlay ? p.urbanOverlayHatch : p.hatches[k];
  const pat = spec
    ? spec.pattern === 'dots'
      ? makeDotPattern(
        boostRgbaAlpha(boostRgbaAlpha(spec.color, p.hatchAlphaMultiplier), fillAndHatchAlphaScale),
        spec.spacing,
        spec.lineWidth * 2
      )
      : spec.pattern === 'orthogonal'
        ? makeOrthogonalHatchPattern(
          boostRgbaAlpha(boostRgbaAlpha(spec.color, p.hatchAlphaMultiplier), fillAndHatchAlphaScale),
          spec.spacing,
          spec.lineWidth
        )
        : makeDiagonalHatchPattern(
          boostRgbaAlpha(boostRgbaAlpha(spec.color, p.hatchAlphaMultiplier), fillAndHatchAlphaScale),
          spec.spacing,
          spec.lineWidth,
          spec.reverseDiagonal,
          spec.crosshatch ?? false
        )
    : null;
  patternCache.set(key, pat);
  return pat;
}

/**
 * Defines the `fillHexTerrain` function shape (export function fillHexTerrain( ctx: CanvasRenderingContext2D, terrainKind: string, drawPath: () => void, options?: { fillAndHatchAlphaScale?: numbe).

 * Purpose: Supports maintainability by documenting why `fillHexTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function fillHexTerrain(
  ctx: CanvasRenderingContext2D,
  terrainKind: string,
  drawPath: () => void,
  options?: { fillAndHatchAlphaScale?: number; landHoverFill?: boolean; isUrban?: boolean; isRubble?: boolean }
): void {
  const scale = options?.fillAndHatchAlphaScale ?? 1;
  const k = terrainKind as PipelineTerrainKind;
  // Urban/rubble variants override base terrain styling for this cell.
  const isRubble = options?.isRubble === true;
  const isUrban = !isRubble && options?.isUrban === true;
  if (!isUrban && options?.landHoverFill && k === 'plains') {
    drawPath();
    ctx.fillStyle = boostRgbaAlpha(landHoverFillStyle(), scale);
    ctx.fill();
    return;
  }
  drawPath();
  const fillBase = isRubble
    ? boostRgbaAlpha(activePreset().rubbleOverlayFill, activePreset().fillAlphaMultiplier)
    : terrainKindFillStyle(terrainKind, { urbanOverlay: isUrban });
  ctx.fillStyle = boostRgbaAlpha(fillBase, scale);
  ctx.fill();
  const pat = terrainKindPattern(ctx, terrainKind, scale, { urbanOverlay: isUrban, rubbleOverlay: isRubble });
  if (pat) {
    drawPath();
    ctx.fillStyle = pat;
    ctx.fill();
  }
}

/**
 * Documents the module-scope binding `TERRAIN_LEGEND_ORDER` (TERRAIN_LEGEND_ORDER: PipelineTerrainKind[]).

 * Purpose: Supports maintainability by documenting why `TERRAIN_LEGEND_ORDER` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TERRAIN_LEGEND_ORDER: PipelineTerrainKind[] = [...PIPELINE_TERRAIN_KINDS];

/**
 * Fills the terrain legend with the active style's kinds and the style picker.
 *
 * Purpose: The legend is the map key. Row text and the picker are styled by `#terrain-legend` in the page stylesheet, so this function does not set those colors.
 * When to use: On startup, and again after the player changes the terrain style.
 * Expected outcome: The container shows a left-aligned style select, then one capitalized swatch row per kind, then Urban, then Rubble. There is no title. Swatches use the opaque key color for the active style. Pass `#terrain-legend`; another container inherits its own text color and an unstyled select.
 * Exceptions: None.
 */
export function renderTerrainLegend(
  container: HTMLElement,
  options?: { onStyleChanged?: (styleId: TerrainVisualStyleId) => void }
): void {
  container.innerHTML = '';
  container.style.fontSize = '11px';
  container.style.lineHeight = '1.3';
  container.style.pointerEvents = 'auto';
  const styleSelect = document.createElement('select');
  styleSelect.setAttribute('aria-label', 'Terrain style');
  styleSelect.setAttribute('data-control-tooltip', terrainStyleTooltipText);
  const opts = getTerrainStyleOptions();
  for (const o of opts) {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.label;
    styleSelect.appendChild(opt);
  }
  styleSelect.value = getActiveTerrainStyleId();
  styleSelect.addEventListener('change', () => {
    setActiveTerrainStyle(styleSelect.value as TerrainVisualStyleId);
    if (options?.onStyleChanged) options.onStyleChanged(getActiveTerrainStyleId());
    renderTerrainLegend(container, options);
  });
  container.appendChild(styleSelect);

  for (const kind of TERRAIN_LEGEND_ORDER) {
    const sw = document.createElement('span');
    applyLegendSwatchChrome(sw);
    sw.style.background = terrainSwatchColor(kind);
    appendLegendRow(container, sw, formatTerrainKindLabel(kind));
  }
  appendUrbanLegendRow(container, urbanSwatchColor(getActiveTerrainStyleId()));
  appendRubbleLegendRow(container, getActiveTerrainStyleId());
  appendFortifiedLegendRow(container);
}
