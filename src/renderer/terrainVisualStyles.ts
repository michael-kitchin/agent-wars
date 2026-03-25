/**
 * Canvas fill (and optional hatch) per pipeline terrain_kind. Ocean vs land legibility is the priority.
 */

import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import { PIPELINE_TERRAIN_KINDS } from '../shared/pipelineTerrain';

const patternCache = new Map<string, CanvasPattern | null>();
const UNKNOWN_FILL = 'rgba(140, 140, 140, 0.075)';

/**
 * Canonical hex outline for most terrain style presets; zoom scaling is applied in the renderer.
 * Matches the former `default` preset stroke.
 */
const DEFAULT_HEX_STROKE_COLOR = 'rgba(36,38,42,0.4)';
const DEFAULT_HEX_STROKE_WIDTH = 0.5;

/** Wargame uses a dark basemap; light strokes read as hex boundaries (opacity tuned vs legibility). */
const WARGAME_HEX_STROKE_COLOR = 'rgba(210, 216, 228, 0.077)';
const WARGAME_HEX_STROKE_WIDTH = 0.72;

/**
 * Hover highlight for generic `land` cells: slightly darker than the base land fill for feedback.
 */
const LAND_HOVER_FILL_BASE = 'rgba(155, 168, 128, 0.42)';

export type TerrainVisualStyleId = 'default' | 'atlas' | 'wargame' | 'scientific';

interface HatchStyle {
  color: string;
  spacing: number;
  lineWidth: number;
  reverseDiagonal: boolean;
}

interface TerrainStylePreset {
  label: string;
  /**
   * Raster basemap provider id (see `basemapProvider.ts`). Switched with this terrain style so the
   * map background matches the preset; no labels / minimal political detail in chosen providers.
   */
  basemapId: string;
  /** Multiplier for fill alpha (0..1 more transparent, >1 less transparent). */
  fillAlphaMultiplier: number;
  /** Multiplier for hatch line alpha. */
  hatchAlphaMultiplier: number;
  fills: Record<PipelineTerrainKind, string>;
  hatches: Partial<Record<PipelineTerrainKind, HatchStyle>>;
}

const TERRAIN_STYLE_PRESETS: Record<TerrainVisualStyleId, TerrainStylePreset> = {
  default: {
    label: 'Default',
    basemapId: 'carto_light_nolabels',
    fillAlphaMultiplier: 0.55,
    hatchAlphaMultiplier: 0.375,
    fills: {
      ocean: 'rgba(35, 116, 201, 0.28)',
      coastal: 'rgba(62, 162, 172, 0.24)',
      land: 'rgba(198, 212, 168, 0.2)',
      forest: 'rgba(48, 150, 82, 0.42)',
      mountain: 'rgba(158, 129, 109, 0.45)',
      desert: 'rgba(132, 94, 42, 0.44)',
      arctic: 'rgba(235, 244, 255, 0.5)',
    },
    hatches: {
      mountain: { color: 'rgba(110, 22, 18, 0.413)', spacing: 7, lineWidth: 0.95, reverseDiagonal: true },
      forest: { color: 'rgba(16, 72, 36, 0.44)', spacing: 7, lineWidth: 0.88, reverseDiagonal: true },
      coastal: { color: 'rgba(40, 130, 155, 0.32)', spacing: 8, lineWidth: 0.72, reverseDiagonal: false },
    },
  },
  atlas: {
    label: 'Atlas',
    basemapId: 'carto_voyager_nolabels',
    fillAlphaMultiplier: 0.55,
    hatchAlphaMultiplier: 0.375,
    fills: {
      ocean: 'rgba(35, 116, 201, 0.28)',
      coastal: 'rgba(62, 162, 172, 0.24)',
      land: 'rgba(198, 212, 168, 0.2)',
      forest: 'rgba(48, 150, 82, 0.42)',
      mountain: 'rgba(158, 129, 109, 0.45)',
      desert: 'rgba(132, 94, 42, 0.44)',
      arctic: 'rgba(235, 244, 255, 0.5)',
    },
    hatches: {
      mountain: { color: 'rgba(110, 22, 18, 0.413)', spacing: 7, lineWidth: 0.95, reverseDiagonal: true },
      forest: { color: 'rgba(16, 72, 36, 0.44)', spacing: 7, lineWidth: 0.88, reverseDiagonal: true },
      coastal: { color: 'rgba(40, 130, 155, 0.32)', spacing: 8, lineWidth: 0.72, reverseDiagonal: false },
    },
  },
  wargame: {
    label: 'Wargame',
    basemapId: 'carto_dark_nolabels',
    fillAlphaMultiplier: 0.55,
    hatchAlphaMultiplier: 0.375,
    fills: {
      ocean: 'rgba(35, 116, 201, 0.28)',
      coastal: 'rgba(62, 162, 172, 0.24)',
      land: 'rgba(198, 212, 168, 0.2)',
      forest: 'rgba(48, 150, 82, 0.42)',
      mountain: 'rgba(158, 129, 109, 0.45)',
      desert: 'rgba(132, 94, 42, 0.44)',
      arctic: 'rgba(235, 244, 255, 0.5)',
    },
    hatches: {
      mountain: { color: 'rgba(110, 22, 18, 0.413)', spacing: 7, lineWidth: 0.95, reverseDiagonal: true },
      forest: { color: 'rgba(130, 245, 190, 0.58)', spacing: 7, lineWidth: 0.9, reverseDiagonal: true },
      coastal: { color: 'rgba(110, 220, 235, 0.42)', spacing: 8, lineWidth: 0.72, reverseDiagonal: false },
    },
  },
  scientific: {
    label: 'Scientific',
    basemapId: 'esri_world_shaded_relief',
    fillAlphaMultiplier: 0.55,
    hatchAlphaMultiplier: 0.375,
    fills: {
      ocean: 'rgba(35, 116, 201, 0.28)',
      coastal: 'rgba(62, 162, 172, 0.24)',
      land: 'rgba(198, 212, 168, 0.2)',
      forest: 'rgba(48, 150, 82, 0.42)',
      mountain: 'rgba(158, 129, 109, 0.45)',
      desert: 'rgba(132, 94, 42, 0.44)',
      arctic: 'rgba(235, 244, 255, 0.5)',
    },
    hatches: {
      mountain: { color: 'rgba(110, 22, 18, 0.413)', spacing: 7, lineWidth: 0.95, reverseDiagonal: true },
      forest: { color: 'rgba(16, 72, 36, 0.44)', spacing: 7, lineWidth: 0.88, reverseDiagonal: true },
      coastal: { color: 'rgba(40, 130, 155, 0.32)', spacing: 8, lineWidth: 0.72, reverseDiagonal: false },
    },
  },
};

let activeTerrainStyleId: TerrainVisualStyleId = 'default';

/**
 * @param reverseDiagonal When true, hatch runs top-left → bottom-right ( / ); when false, bottom-left → top-right ( \\ ).
 *        Mountain and forest share one direction; coastal littoral uses the opposite for water/land texture.
 */
function makeDiagonalHatchPattern(
  color: string,
  spacing: number,
  lineWidth: number,
  reverseDiagonal: boolean
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
  p.stroke();
  return p.createPattern(c, 'repeat');
}

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

function activePreset(): TerrainStylePreset {
  return TERRAIN_STYLE_PRESETS[activeTerrainStyleId];
}

/** Returns available style options for the legend selector. */
export function getTerrainStyleOptions(): Array<{ id: TerrainVisualStyleId; label: string }> {
  return (Object.keys(TERRAIN_STYLE_PRESETS) as TerrainVisualStyleId[]).map((id) => ({
    id,
    label: TERRAIN_STYLE_PRESETS[id].label,
  }));
}

/** Returns the currently active terrain visual style id. */
export function getActiveTerrainStyleId(): TerrainVisualStyleId {
  return activeTerrainStyleId;
}

/**
 * Returns which raster basemap id should be shown for the current terrain style preset.
 * Used when initializing the map and when the legend style dropdown changes; ids match `basemapProvider`.
 */
export function getActiveTerrainStyleBasemapId(): string {
  return activePreset().basemapId;
}

/**
 * Hex boundary stroke for the active terrain style. Wargame uses a stronger, light-on-dark stroke;
 * others use the default neutral stroke (zoom scaling in renderer).
 */
export function getActiveHexStrokeStyle(): { color: string; width: number } {
  if (activeTerrainStyleId === 'wargame') {
    return { color: WARGAME_HEX_STROKE_COLOR, width: WARGAME_HEX_STROKE_WIDTH };
  }
  return { color: DEFAULT_HEX_STROKE_COLOR, width: DEFAULT_HEX_STROKE_WIDTH };
}

/**
 * Switches terrain visual style preset and clears hatch cache so new patterns are regenerated.
 */
export function setActiveTerrainStyle(id: TerrainVisualStyleId): void {
  if (activeTerrainStyleId === id) return;
  activeTerrainStyleId = id;
  patternCache.clear();
}

/**
 * Returns the rgba fill for a terrain kind (always applied under any pattern).
 */
export function terrainKindFillStyle(kind: string): string {
  const k = kind as PipelineTerrainKind;
  const p = activePreset();
  return boostRgbaAlpha(p.fills[k] ?? UNKNOWN_FILL, p.fillAlphaMultiplier);
}

/**
 * Fill for hovered generic land hexes: darker desert-like tan, same alpha pipeline as other fills.
 */
function landHoverFillStyle(): string {
  return boostRgbaAlpha(LAND_HOVER_FILL_BASE, activePreset().fillAlphaMultiplier);
}

/**
 * Optional hatch pattern layered after fill for a subset of kinds (mountain, forest).
 * @param fillAndHatchAlphaScale Extra multiplier on hatch line alpha (e.g. 2 on hover to match doubled fill opacity).
 */
export function terrainKindPattern(
  ctx: CanvasRenderingContext2D,
  kind: string,
  fillAndHatchAlphaScale = 1
): CanvasPattern | null {
  const k = kind as PipelineTerrainKind;
  const key = `${activeTerrainStyleId}:${k}:${fillAndHatchAlphaScale}`;
  if (patternCache.has(key)) return patternCache.get(key) ?? null;

  const spec = activePreset().hatches[k];
  const p = activePreset();
  const pat = spec
    ? makeDiagonalHatchPattern(
      boostRgbaAlpha(boostRgbaAlpha(spec.color, p.hatchAlphaMultiplier), fillAndHatchAlphaScale),
      spec.spacing,
      spec.lineWidth,
      spec.reverseDiagonal
    )
    : null;
  patternCache.set(key, pat);
  return pat;
}

/**
 * Fills a closed path on `ctx` using fill + optional pattern for `terrainKind`.
 * @param options.fillAndHatchAlphaScale Multiplies fill and hatch opacity (e.g. 2 on mouseover).
 * @param options.landHoverFill When true and `terrainKind` is `land`, use a darker desert-like fill (land is otherwise transparent).
 */
export function fillHexTerrain(
  ctx: CanvasRenderingContext2D,
  terrainKind: string,
  drawPath: () => void,
  options?: { fillAndHatchAlphaScale?: number; landHoverFill?: boolean }
): void {
  const scale = options?.fillAndHatchAlphaScale ?? 1;
  const k = terrainKind as PipelineTerrainKind;
  if (options?.landHoverFill && k === 'land') {
    drawPath();
    ctx.fillStyle = boostRgbaAlpha(landHoverFillStyle(), scale);
    ctx.fill();
    return;
  }
  drawPath();
  ctx.fillStyle = boostRgbaAlpha(terrainKindFillStyle(terrainKind), scale);
  ctx.fill();
  const pat = terrainKindPattern(ctx, terrainKind, scale);
  if (pat) {
    drawPath();
    ctx.fillStyle = pat;
    ctx.fill();
  }
}

/** Labels for legend rows (same order as pipeline enum). */
export const TERRAIN_LEGEND_ORDER: PipelineTerrainKind[] = [...PIPELINE_TERRAIN_KINDS];

/**
 * Builds the removable legend DOM under `#terrain-legend` (swatches match canvas styles).
 */
export function renderTerrainLegend(
  container: HTMLElement,
  options?: { onStyleChanged?: (styleId: TerrainVisualStyleId) => void }
): void {
  container.innerHTML = '';
  container.style.fontSize = '11px';
  container.style.lineHeight = '1.3';
  container.style.pointerEvents = 'auto';
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';
  header.style.marginBottom = '4px';
  const title = document.createElement('div');
  title.textContent = 'Terrain';
  title.style.fontWeight = '600';
  title.style.color = '#333';
  header.appendChild(title);
  const styleSelect = document.createElement('select');
  styleSelect.setAttribute('aria-label', 'Terrain style');
  styleSelect.style.fontSize = '11px';
  styleSelect.style.padding = '1px 3px';
  styleSelect.style.border = '1px solid #aaa';
  styleSelect.style.borderRadius = '2px';
  styleSelect.style.background = '#f6f3ee';
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
  header.appendChild(styleSelect);
  container.appendChild(header);

  for (const kind of TERRAIN_LEGEND_ORDER) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.marginBottom = '2px';

    const sw = document.createElement('span');
    sw.style.display = 'inline-block';
    sw.style.width = '18px';
    sw.style.height = '12px';
    sw.style.border = '1px solid #888';
    sw.style.borderRadius = '2px';
    sw.style.background = terrainKindFillStyle(kind);
    row.appendChild(sw);

    const lab = document.createElement('span');
    lab.textContent = kind;
    lab.style.color = '#444';
    row.appendChild(lab);
    container.appendChild(row);
  }
}
