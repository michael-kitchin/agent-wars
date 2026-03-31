/**
 * Canvas glyphs for major airports and ports when terrain hexes are highlighted (hover or T-key inspection).
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

export interface HexScreenPoint {
  x: number;
  y: number;
}

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
 * Renders a Path2D built from an SVG `d` string: maps viewBox coordinates to `pixelSize` on screen (max dimension).
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

/** Narrows wingspan vs uniform `pixelSize` (viewBox X). */
const AIRPLANE_WIDTH_SCALE = 0.74;
/** Shortens fuselage (viewBox Y) by half the relative reduction applied on X: `1 - (1 - widthScale) / 2`. */
const AIRPLANE_HEIGHT_SCALE = 1 - (1 - AIRPLANE_WIDTH_SCALE) / 2;

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

const AIRPORT_FILL = '#e8eef6';
const AIRPORT_STROKE = '#1a1f28';
const PORT_FILL = '#6eb6f0';
const PORT_STROKE = '#0d1f35';

/** Multiply base outline from map zoom for icon strokes (both airplane and anchor). */
const GLYPH_OUTLINE_MULT = 1.58;

/** Max pixel size for aircraft (matches dual-symbol layout). */
const GLYPH_AIR_PIXEL_FACTOR = 0.22;
/** Anchor vs aircraft max dimension; slightly above 1 so the port glyph reads a bit larger. */
const GLYPH_ANCHOR_TO_AIR_RATIO = 1.03;

/**
 * Pass as `glyphAreaScale` for res-4 child hexes so the combined glyph footprint covers more of the small hex
 * (linear scale = √areaScale; area scales by this factor).
 */
export const RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE = 1.2;

/**
 * Solo airport or solo port only: footprint area × this vs the shared dual-symbol baseline sizes.
 */
export const SOLO_TERRAIN_INFRA_GLYPH_AREA_SCALE = 1.2;

/**
 * Draws airport and/or port glyphs inside a hex polygon (container pixel space).
 * @param both When true, uses diagonal offset and a separating slash. Solo-only hexes use `SOLO_TERRAIN_INFRA_GLYPH_AREA_SCALE` (area ×1.2, linear √1.2).
 */
export function drawTerrainInfrastructureGlyphs(
  ctx: CanvasRenderingContext2D,
  pts: HexScreenPoint[],
  options: { showAirport: boolean; showPort: boolean; outlineScreenPx: number; glyphAreaScale?: number; centerYOffsetPx?: number }
): void {
  const { showAirport, showPort, outlineScreenPx, glyphAreaScale = 1, centerYOffsetPx = 0 } = options;
  if (!showAirport && !showPort) return;
  const lin = Math.sqrt(glyphAreaScale);
  const glyphOutline = Math.max(0.92, outlineScreenPx * GLYPH_OUTLINE_MULT * lin);
  const { cx, cy, span } = centroidAndSpan(pts);
  const centerY = cy + centerYOffsetPx;
  const pxAir = span * GLYPH_AIR_PIXEL_FACTOR * lin;
  const pxAnchor = pxAir * GLYPH_ANCHOR_TO_AIR_RATIO;
  const both = showAirport && showPort;
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
