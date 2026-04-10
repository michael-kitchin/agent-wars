/**
 * Canvas glyphs for major airports and seaports when terrain hexes are highlighted (hover or T-key inspection).
 * Shapes come from embedded SVG path data (see `terrainInfrastructureIconPaths.ts`).
 */

import {
  AIRPLANE_VIEWBOX_CENTER,
  AIRPLANE_VIEWBOX_SIZE,
  ANCHOR_VIEWBOX,
  ANCHOR_VIEWBOX_CENTER,
  getAirplanePath2D,
  getAnchorPath2D,
} from './terrainInfrastructureIconPaths';

/**
 * Documents the `HexScreenPoint` interface as a named contract surface (export interface HexScreenPoint).

 * Purpose: Supports maintainability by documenting why `HexScreenPoint` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexScreenPoint {
    /**
   * Specifies the contract for the `x` member (x: number;).

   * Contract: Describes stable behavior for callers of `x` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
x: number;
    /**
   * Specifies the contract for the `y` member (y: number;).

   * Contract: Describes stable behavior for callers of `y` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
y: number;
}

/**
 * Defines the `centroidAndSpan` function shape (function centroidAndSpan(pts: HexScreenPoint[]):).

 * Purpose: Supports maintainability by documenting why `centroidAndSpan` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function centroidAndSpan(pts: HexScreenPoint[]): { cx: number; cy: number; span: number } {
  if (pts.length === 0) return { cx: 0, cy: 0, span: 1 };
  let sx = 0;
  let sy = 0;
  let minX = pts[0]!.x;
  let maxX = pts[0]!.x;
  let minY = pts[0]!.y;
  let maxY = pts[0]!.y;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  return { cx: sx / pts.length, cy: sy / pts.length, span: Math.min(w, h) };
}

/**
 * Defines the `drawFilledSvgPath` function shape (function drawFilledSvgPath( ctx: CanvasRenderingContext2D, path: Path2D, screenCx: number, screenCy: number, pixelSize: number, outlineScreenP).

 * Purpose: Supports maintainability by documenting why `drawFilledSvgPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawFilledSvgPath(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  screenCx: number,
  screenCy: number,
  pixelSize: number,
  outlineScreenPx: number,
  fillStyle: string,
  strokeStyle: string,
  viewBox: { width: number; height: number; originX: number; originY: number }
): void {
  const s = pixelSize / Math.max(viewBox.width, viewBox.height);
  ctx.save();
  ctx.translate(screenCx, screenCy);
  ctx.scale(s, s);
  ctx.translate(-viewBox.originX, -viewBox.originY);
  ctx.fillStyle = fillStyle;
  ctx.fill(path);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = outlineScreenPx / s;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 1.6;
  ctx.stroke(path);
  ctx.restore();
}

/**
 * Documents the module-scope binding `AIRPLANE_WIDTH_SCALE` (AIRPLANE_WIDTH_SCALE).

 * Purpose: Supports maintainability by documenting why `AIRPLANE_WIDTH_SCALE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AIRPLANE_WIDTH_SCALE = 0.74;
/**
 * Documents the module-scope binding `AIRPLANE_HEIGHT_SCALE` (AIRPLANE_HEIGHT_SCALE).

 * Purpose: Supports maintainability by documenting why `AIRPLANE_HEIGHT_SCALE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AIRPLANE_HEIGHT_SCALE = 1 - (1 - AIRPLANE_WIDTH_SCALE) / 2;

/**
 * Defines the `drawAirplaneAt` function shape (function drawAirplaneAt( ctx: CanvasRenderingContext2D, cx: number, cy: number, pixelSize: number, outlineScreenPx: number, fillStyle: string,).

 * Purpose: Supports maintainability by documenting why `drawAirplaneAt` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawAirplaneAt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  pixelSize: number,
  outlineScreenPx: number,
  fillStyle: string,
  strokeStyle: string
): void {
  const vb = Math.max(AIRPLANE_VIEWBOX_SIZE, AIRPLANE_VIEWBOX_SIZE);
  const s = pixelSize / vb;
  const sx = s * AIRPLANE_WIDTH_SCALE;
  const sy = s * AIRPLANE_HEIGHT_SCALE;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sx, sy);
  ctx.translate(-AIRPLANE_VIEWBOX_CENTER.x, -AIRPLANE_VIEWBOX_CENTER.y);
  const path = getAirplanePath2D();
  ctx.fillStyle = fillStyle;
  ctx.fill(path);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = outlineScreenPx / Math.max(sx, sy * 0.92);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 1.6;
  ctx.stroke(path);
  ctx.restore();
}

/**
 * Defines the `drawAnchorAt` function shape (function drawAnchorAt( ctx: CanvasRenderingContext2D, cx: number, cy: number, pixelSize: number, outlineScreenPx: number, fillStyle: string,).

 * Purpose: Supports maintainability by documenting why `drawAnchorAt` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawAnchorAt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  pixelSize: number,
  outlineScreenPx: number,
  fillStyle: string,
  strokeStyle: string
): void {
  drawFilledSvgPath(ctx, getAnchorPath2D(), cx, cy, pixelSize, outlineScreenPx, fillStyle, strokeStyle, {
    width: ANCHOR_VIEWBOX.w,
    height: ANCHOR_VIEWBOX.h,
    originX: ANCHOR_VIEWBOX_CENTER.x,
    originY: ANCHOR_VIEWBOX_CENTER.y,
  });
}

/**
 * Documents the module-scope binding `AIRPORT_FILL` (AIRPORT_FILL).

 * Purpose: Supports maintainability by documenting why `AIRPORT_FILL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AIRPORT_FILL = '#e8eef6';
/**
 * Documents the module-scope binding `AIRPORT_STROKE` (AIRPORT_STROKE).

 * Purpose: Supports maintainability by documenting why `AIRPORT_STROKE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AIRPORT_STROKE = '#1a1f28';
/**
 * Documents the module-scope binding `PORT_FILL` (PORT_FILL).

 * Purpose: Supports maintainability by documenting why `PORT_FILL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PORT_FILL = '#6eb6f0';
/**
 * Documents the module-scope binding `PORT_STROKE` (PORT_STROKE).

 * Purpose: Supports maintainability by documenting why `PORT_STROKE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PORT_STROKE = '#0d1f35';

/**
 * Documents the module-scope binding `GLYPH_OUTLINE_MULT` (GLYPH_OUTLINE_MULT).

 * Purpose: Supports maintainability by documenting why `GLYPH_OUTLINE_MULT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const GLYPH_OUTLINE_MULT = 1.58;

/**
 * Documents the module-scope binding `GLYPH_AIR_PIXEL_FACTOR` (GLYPH_AIR_PIXEL_FACTOR).

 * Purpose: Supports maintainability by documenting why `GLYPH_AIR_PIXEL_FACTOR` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const GLYPH_AIR_PIXEL_FACTOR = 0.22;
/**
 * Documents the module-scope binding `GLYPH_ANCHOR_TO_AIR_RATIO` (GLYPH_ANCHOR_TO_AIR_RATIO).

 * Purpose: Supports maintainability by documenting why `GLYPH_ANCHOR_TO_AIR_RATIO` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const GLYPH_ANCHOR_TO_AIR_RATIO = 1.03;

/**
 * Documents the module-scope binding `RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE` (RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE).

 * Purpose: Supports maintainability by documenting why `RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE = 1.2;

/**
 * Documents the module-scope binding `SOLO_TERRAIN_INFRA_GLYPH_AREA_SCALE` (SOLO_TERRAIN_INFRA_GLYPH_AREA_SCALE).

 * Purpose: Supports maintainability by documenting why `SOLO_TERRAIN_INFRA_GLYPH_AREA_SCALE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const SOLO_TERRAIN_INFRA_GLYPH_AREA_SCALE = 1.2;

/**
 * Defines the `drawTerrainInfrastructureGlyphs` function shape (export function drawTerrainInfrastructureGlyphs( ctx: CanvasRenderingContext2D, pts: HexScreenPoint[], options: { showAirport: boolean; showSeaport: bo).

 * Purpose: Supports maintainability by documenting why `drawTerrainInfrastructureGlyphs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawTerrainInfrastructureGlyphs(
  ctx: CanvasRenderingContext2D,
  pts: HexScreenPoint[],
  options: { showAirport: boolean; showSeaport: boolean; outlineScreenPx: number; glyphAreaScale?: number; centerYOffsetPx?: number }
): void {
  const { showAirport, showSeaport, outlineScreenPx, glyphAreaScale = 1, centerYOffsetPx = 0 } = options;
  if (!showAirport && !showSeaport) return;
  const lin = Math.sqrt(glyphAreaScale);
  const glyphOutline = Math.max(0.92, outlineScreenPx * GLYPH_OUTLINE_MULT * lin);
  const { cx, cy, span } = centroidAndSpan(pts);
  const centerY = cy + centerYOffsetPx;
  const pxAir = span * GLYPH_AIR_PIXEL_FACTOR * lin;
  const pxAnchor = pxAir * GLYPH_ANCHOR_TO_AIR_RATIO;
  const both = showAirport && showSeaport;
  if (both) {
    // Keep dual symbols close to preserve room for other overlays in the hex.
    const off = span * 0.1 * lin;
    drawAirplaneAt(ctx, cx - off, centerY - off, pxAir, glyphOutline, AIRPORT_FILL, AIRPORT_STROKE);
    drawAnchorAt(ctx, cx + off, centerY + off, pxAnchor, glyphOutline, PORT_FILL, PORT_STROKE);
    return;
  }
  const soloLin = Math.sqrt(SOLO_TERRAIN_INFRA_GLYPH_AREA_SCALE);
  const soloOutline = glyphOutline * soloLin;
  if (showAirport) {
    drawAirplaneAt(ctx, cx, centerY, pxAir * soloLin, soloOutline, AIRPORT_FILL, AIRPORT_STROKE);
  } else {
    drawAnchorAt(ctx, cx, centerY, pxAnchor * soloLin, soloOutline, PORT_FILL, PORT_STROKE);
  }
}
