/**
 * Canvas fill (and optional hatch) per pipeline terrain_kind. Ocean vs land legibility is the priority.
 */

import type { PipelineTerrainKind } from '../../shared/pipelineTerrain';
import { PIPELINE_TERRAIN_KINDS } from '../../shared/pipelineTerrain';
import { formatTerrainKindLabel } from '../../shared/terrainKindLabel';
import { TERRAIN_SWATCH_CLASS_NAME } from '../../shared/terrainSwatchHtml';
import { MAP_THEMES } from '../../shared/mapThemes';
import { appendLegendRow, applyLegendSwatchChrome } from './terrainLegendRow';
import { appendUrbanLegendRow, urbanSwatchColor } from './terrainLegendUrban';
import { appendFortifiedLegendRow } from './terrainLegendFortified';
import { appendRubbleLegendRow, applyRubbleSwatchPaint } from './terrainLegendRubble';
import { mapThemeTooltipText } from '../chrome/controlTooltipText';
import { getActiveMapTheme, setActiveMapThemeId } from '../map/activeMapTheme';
import {
  hexPaletteById,
  hexStrokeStyleFor,
  terrainSwatchColor,
  type TerrainHexPalette,
} from './terrainHexPalettes';

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
 * Documents the module-scope binding `LAND_HOVER_FILL_BASE` (LAND_HOVER_FILL_BASE).

 * Purpose: Supports maintainability by documenting why `LAND_HOVER_FILL_BASE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const LAND_HOVER_FILL_BASE = 'rgba(155, 168, 128, 0.42)';


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
 * Returns the hex palette for the active theme.
 *
 * Purpose: Hex fills follow the theme's palette id, not a separate style.
 * When to use: From the fill and hatch painters.
 * Expected outcome: The default palette, or the wargame palette when the theme is Night.
 * Exceptions: None.
 */
function activePreset(): TerrainHexPalette {
  return hexPaletteById(getActiveMapTheme().hexPaletteId);
}

/**
 * Returns the hex outline for the active theme.
 *
 * Purpose: Night keeps the lighter stroke. The other themes keep the default stroke.
 * When to use: When stroking a hex.
 * Expected outcome: Color and width from `hexStrokeStyleFor`.
 * Exceptions: None.
 */
export function getActiveHexStrokeStyle(): ReturnType<typeof hexStrokeStyleFor> {
  return hexStrokeStyleFor(getActiveMapTheme().hexPaletteId);
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
      node.style.background = urbanSwatchColor(getActiveMapTheme().hexPaletteId);
      return;
    }
    if (kind === 'rubble') {
      applyRubbleSwatchPaint(node, getActiveMapTheme().hexPaletteId);
      return;
    }
    node.style.background = terrainSwatchColor(getActiveMapTheme().hexPaletteId, kind);
  });
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
  const key = `${getActiveMapTheme().hexPaletteId}:${k}:${fillAndHatchAlphaScale}:${overlayKey}`;
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
 * Fills the terrain legend with the active theme's kinds and the theme picker.
 *
 * Purpose: The legend is the map key. Row text and the picker are styled by `#terrain-legend`.
 * When to use: On startup, and again after the player changes the theme. The change listener rebuilds it so the chips match.
 * Expected outcome: A left-aligned theme select, then one row per kind, then Urban, then Rubble. No blank option.
 * Exceptions: None.
 */
export function renderTerrainLegend(
  container: HTMLElement,
  options?: { onThemeChanged?: () => void }
): void {
  container.innerHTML = '';
  container.style.fontSize = '11px';
  container.style.lineHeight = '1.3';
  container.style.pointerEvents = 'auto';
  const styleSelect = document.createElement('select');
  styleSelect.setAttribute('aria-label', 'Map theme');
  styleSelect.setAttribute('data-control-tooltip', mapThemeTooltipText);
  for (const theme of MAP_THEMES) {
    const opt = document.createElement('option');
    opt.value = theme.id;
    opt.textContent = theme.label;
    styleSelect.appendChild(opt);
  }
  styleSelect.value = getActiveMapTheme().id;
  styleSelect.addEventListener('change', () => {
    setActiveMapThemeId(styleSelect.value);
    options?.onThemeChanged?.();
    renderTerrainLegend(container, options);
  });
  container.appendChild(styleSelect);
  const paletteId = getActiveMapTheme().hexPaletteId;

  for (const kind of TERRAIN_LEGEND_ORDER) {
    const sw = document.createElement('span');
    applyLegendSwatchChrome(sw);
    sw.style.background = terrainSwatchColor(paletteId, kind);
    appendLegendRow(container, sw, formatTerrainKindLabel(kind));
  }
  appendUrbanLegendRow(container, urbanSwatchColor(paletteId));
  appendRubbleLegendRow(container, paletteId);
  appendFortifiedLegendRow(container);
}
