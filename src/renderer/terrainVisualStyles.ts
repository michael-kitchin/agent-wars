/**
 * Canvas fill (and optional hatch) per pipeline terrain_kind. Ocean vs land legibility is the priority.
 */

import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import { PIPELINE_TERRAIN_KINDS } from '../shared/pipelineTerrain';

const patternCache = new Map<string, CanvasPattern | null>();
const UNKNOWN_FILL = 'rgba(140, 140, 140, 0.075)';

export type TerrainVisualStyleId = 'default' | 'atlas' | 'wargame' | 'scientific';

interface HatchStyle {
  color: string;
  spacing: number;
  lineWidth: number;
  reverseDiagonal: boolean;
}

interface TerrainStylePreset {
  label: string;
  basemapFilter: string;
  strokeColor: string;
  strokeWidth: number;
  /** Multiplier for fill alpha (0..1 more transparent, >1 less transparent). */
  fillAlphaMultiplier: number;
  /** Multiplier for hatch alpha (0..1 more transparent, >1 less transparent). */
  hatchAlphaMultiplier: number;
  fills: Record<PipelineTerrainKind, string>;
  hatches: Partial<Record<PipelineTerrainKind, HatchStyle>>;
}

const TERRAIN_STYLE_PRESETS: Record<TerrainVisualStyleId, TerrainStylePreset> = {
  default: {
    label: 'Default',
    basemapFilter: 'grayscale(0.8) saturate(0.68) contrast(0.97) brightness(1.03)',
    strokeColor: 'rgba(36,38,42,0.4)',
    strokeWidth: 0.5,
    fillAlphaMultiplier: 0.75,
    hatchAlphaMultiplier: 0.65,
    fills: {
      ocean: 'rgba(25, 90, 170, 0.15)',
      coastal: 'rgba(55, 130, 140, 0.13)',
      land: 'rgba(130, 145, 95, 0.05)',
      forest: 'rgba(35, 110, 55, 0.09)',
      mountain: 'rgba(110, 95, 85, 0.11)',
      desert: 'rgba(210, 175, 95, 0.1)',
      arctic: 'rgba(220, 235, 250, 0.14)',
    },
    hatches: {
      mountain: { color: 'rgba(60,45,40,0.19)', spacing: 6, lineWidth: 0.85, reverseDiagonal: true },
      forest: { color: 'rgba(20,70,35,0.15)', spacing: 8, lineWidth: 0.75, reverseDiagonal: true },
      coastal: { color: 'rgba(30,100,120,0.16)', spacing: 8, lineWidth: 0.6, reverseDiagonal: false },
    },
  },
  atlas: {
    label: 'Atlas',
    basemapFilter: 'grayscale(0.2) saturate(1.25) contrast(1.12) brightness(1.0)',
    strokeColor: 'rgba(24,34,48,0.52)',
    strokeWidth: 0.3,
    fillAlphaMultiplier: 0.55,
    hatchAlphaMultiplier: 0.75,
    fills: {
      ocean: 'rgba(35, 116, 201, 0.28)',
      coastal: 'rgba(62, 162, 172, 0.24)',
      land: 'rgba(140, 156, 100, 0)',
      forest: 'rgba(48, 150, 82, 0.42)',
      mountain: 'rgba(158, 129, 109, 0.45)',
      desert: 'rgba(236, 195, 98, 0.4)',
      arctic: 'rgba(235, 244, 255, 0.5)',
    },
    hatches: {
      mountain: { color: 'rgba(79,60,50,0.26)', spacing: 8, lineWidth: 0.65, reverseDiagonal: true },
      forest: { color: 'rgba(22,92,47,0.24)', spacing: 9, lineWidth: 0.62, reverseDiagonal: true },
    },
  },
  wargame: {
    label: 'Wargame',
    // Keep tactical contrast, but preserve blue-water orientation cues from the raster basemap.
    basemapFilter: 'grayscale(0.18) saturate(1.35) contrast(0.9) brightness(0.9)',
    strokeColor: 'rgba(36,38,42,0.42)',
    strokeWidth: 0.5,
    fillAlphaMultiplier: 0.45,
    hatchAlphaMultiplier: 0.5,
    fills: {
      // Let raster water show through in Wargame for stronger geographic context.
      ocean: 'rgba(56, 126, 206, 0)',
      coastal: 'rgba(72, 153, 160, 0.21)',
      land: 'rgba(140, 156, 100, 0.15)',
      forest: 'rgba(54, 138, 76, 0.24)',
      mountain: 'rgba(141, 117, 101, 0.27)',
      desert: 'rgba(224, 188, 98, 0.23)',
      arctic: 'rgba(226, 238, 252, 0.28)',
    },
    hatches: {
      mountain: { color: 'rgba(79,60,50,0.24)', spacing: 8, lineWidth: 0.78, reverseDiagonal: true },
      forest: { color: 'rgba(22,92,47,0.22)', spacing: 9, lineWidth: 0.74, reverseDiagonal: true },
      coastal: { color: 'rgba(40,118,130,0.2)', spacing: 9, lineWidth: 0.7, reverseDiagonal: false },
      desert: { color: 'rgba(171,134,58,0.22)', spacing: 10, lineWidth: 0.68, reverseDiagonal: false },
    },
  },
  scientific: {
    label: 'Scientific',
    basemapFilter: 'grayscale(0.85) saturate(0.28) contrast(1.12) brightness(0.98)',
    strokeColor: 'rgba(44,52,60,0.56)',
    strokeWidth: 0.25,
    fillAlphaMultiplier: 0.45,
    hatchAlphaMultiplier: 0.45,
    fills: {
      ocean: 'rgba(38, 121, 187, 0.15)',
      coastal: 'rgba(70, 165, 180, 0.11)',
      land: 'rgba(148, 164, 106, 0)',
      forest: 'rgba(56, 141, 83, 0.28)',
      mountain: 'rgba(142, 120, 104, 0.3)',
      desert: 'rgba(226, 192, 108, 0.24)',
      arctic: 'rgba(236, 246, 255, 0.32)',
    },
    hatches: {
      mountain: { color: 'rgba(86,72,62,0.12)', spacing: 13, lineWidth: 0.5, reverseDiagonal: true },
      forest: { color: 'rgba(29,93,54,0.11)', spacing: 14, lineWidth: 0.48, reverseDiagonal: true },
    },
  },
};

let activeTerrainStyleId: TerrainVisualStyleId = 'default';

/**
 * @param reverseDiagonal When true, hatch runs top-left → bottom-right ( / ); when false, bottom-left → top-right ( \\ ).
 *        Land biomes use the reversed direction so they read differently from coastal hatching at a glance.
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

/** Returns a CSS filter string for the basemap under the current style. */
export function getActiveBasemapFilter(): string {
  return activePreset().basemapFilter;
}

/** Returns style-dependent hex boundary stroke. */
export function getActiveHexStrokeStyle(): { color: string; width: number } {
  const p = activePreset();
  return { color: p.strokeColor, width: p.strokeWidth };
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
 * Optional hatch pattern layered after fill for a subset of kinds (mountain, forest).
 */
export function terrainKindPattern(ctx: CanvasRenderingContext2D, kind: string): CanvasPattern | null {
  const k = kind as PipelineTerrainKind;
  const key = `${activeTerrainStyleId}:${k}`;
  if (patternCache.has(key)) return patternCache.get(key) ?? null;

  const spec = activePreset().hatches[k];
  const p = activePreset();
  const pat = spec
    ? makeDiagonalHatchPattern(
      boostRgbaAlpha(spec.color, p.hatchAlphaMultiplier),
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
 */
export function fillHexTerrain(
  ctx: CanvasRenderingContext2D,
  terrainKind: string,
  drawPath: () => void
): void {
  drawPath();
  ctx.fillStyle = terrainKindFillStyle(terrainKind);
  ctx.fill();
  const pat = terrainKindPattern(ctx, terrainKind);
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
