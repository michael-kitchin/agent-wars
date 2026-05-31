/**
 * Draws res4 city markers and labels when res4 terrain is visible; while map inspection (T held) is active,
 * replaces city name text with two-character LLM hex codes centered in each visible res4 cell and can draw strategic res1 codes centered at world zoom.
 *
 * Road/rail **display** uses Leaflet polylines from bundled `terrain_res4_road_rail_vectors.json` (see `syncRes4TransportVectorLeafletLayer`).
 * Boolean `road_sides` / `rail_sides` remain gameplay data but are not drawn here.
 */

import { cellToChildren } from 'h3-js';
import {
  projectHexBoundaryToContainerPoints,
  shouldConsiderRes4ChildrenForViewport,
  shouldDrawRes4ChildHexInViewport,
  shouldRenderRes4Hexes,
  spanForProjectedHex,
} from '../map/terrainView';
import { getLeafletGlobal } from '../map/mapUtils';
import { getMainLeafletMapForProjection } from '../map/leafletMainMapProjection';
import { DETAIL_H3_RESOLUTION } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  RES4_MAP_OVERLAY_CITY_CIRCLE_RADIUS_FRAC,
  RES4_MAP_OVERLAY_CITY_DOT_HALO_WIDTH_PX,
  RES4_MAP_OVERLAY_CITY_DOT_RADIUS_PX,
  RES4_MAP_OVERLAY_CITY_HALO_ALPHA,
  RES4_MAP_OVERLAY_CITY_LABEL_COLLISION_STEP_PX,
  RES4_MAP_OVERLAY_CITY_LABEL_HALO_WIDTH_PX,
  RES4_MAP_OVERLAY_CITY_LABEL_LIFT_SCALE,
  RES4_MAP_OVERLAY_CITY_LABEL_UPWARD_EXTRA_PX,
  RES4_MAP_OVERLAY_CITY_LABEL_UPWARD_OFFSET_SPAN_FRAC,
  RES4_MAP_OVERLAY_VECTOR_TRANSPORT_HALO_OPACITY,
} from '../../shared/res4MapOverlayConstants';
import { getRes4ChildCodeWithinParent, getStrategicRes1HexCode } from '../../shared/hexLlmCodeAssignment';
import { isMapInspectionModeHeld } from '../gameplay/productionOverlayHelpers';
import { withOpacityHex } from './canvasColor';

/**
 * Scales the computed city-style font size for two-character inspection codes (25% smaller than the city-label formula).
 *
 * Purpose: Keeps hex codes visually subordinate to terrain and production text while T is held.
 * When to use: Only in `scheduleCenteredInspectionCodeLabelJob` after the same span-based clamp as city names.
 * Expected outcome: Font size 75% of `Math.max(14, Math.min(23, span * 0.165))`.
 * Exceptions: None.
 */
const INSPECTION_HEX_CODE_FONT_SCALE = 0.75;

/**
 * Documents the `Res4CityOverlayDrawDeps` interface as a named contract surface (interface Res4CityOverlayDrawDeps).

 * Purpose: Supplies exploration gating aligned with res4 parent hex drawing so overlays match visible res4 terrain.
 * When to use: Passed from `renderer.drawRes4CityOverlayPass` into `drawRes4CityOverlays`.
 * Expected outcome: Callers provide the same exploration predicate as `drawRes4TerrainHexes` for strategic fog parity.
 * Exceptions: None.
 */
export interface Res4CityOverlayDrawDeps {
  /**
   * Specifies the contract for the `getExploredHexSet` member (getExploredHexSet: (state: GameStateSnapshot | null) => Set<string>;).

   * Contract: Describes stable behavior for callers of `getExploredHexSet` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  getExploredHexSet: (state: GameStateSnapshot | null) => Set<string>;
}

type LabelJob = { x: number; y: number; text: string; fontPx: number };

/**
 * Defines the `projectedCentroid` function shape (function projectedCentroid(pts: readonly { x: number; y: number }[]): { x: number; y: number }).

 * Purpose: Screen-space centroid of the projected hex ring for city glyph placement.
 * When to use: Once per res4 child cell that has a city label.
 * Expected outcome: Arithmetic mean of vertex coordinates; callers must pass non-empty `pts`.
 * Exceptions: None.
 */
function projectedCentroid(pts: readonly { x: number; y: number }[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const n = pts.length;
  return { x: sx / n, y: sy / n };
}

/**
 * Queues one halo city-style label using the same font size and vertical lift as named-city overlays.
 *
 * Purpose: Positions city **names** above the hex centroid so they match legacy city overlay layout.
 * When to use: Only when map inspection (T) is **not** replacing labels with codes — i.e. named-city text on res4 cells.
 * Expected outcome: One `LabelJob` with Y lifted above centroid per `RES4_MAP_OVERLAY_CITY_LABEL_*` constants.
 * Exceptions: None.
 */
function scheduleCityStyleLabelJob(
  labelJobs: LabelJob[],
  centerPx: { x: number; y: number },
  span: number,
  text: string,
  zoomStrokeScale: number
): void {
  const fontPx = Math.max(14, Math.min(23, span * 0.165));
  const labelLiftPx =
    (span * RES4_MAP_OVERLAY_CITY_LABEL_UPWARD_OFFSET_SPAN_FRAC +
      RES4_MAP_OVERLAY_CITY_LABEL_UPWARD_EXTRA_PX * zoomStrokeScale) *
    RES4_MAP_OVERLAY_CITY_LABEL_LIFT_SCALE;
  const labelYBase = centerPx.y - labelLiftPx;
  labelJobs.push({ x: centerPx.x, y: labelYBase, text, fontPx });
}

/**
 * Queues a two-character inspection code centered on the hex (city-label font formula scaled by `INSPECTION_HEX_CODE_FONT_SCALE`, no upward lift).
 *
 * Purpose: Keeps LLM hex codes readable at the cell centroid while T is held; avoids overlapping the infra/production band on strategic res1.
 * When to use: Map inspection active — res4/tactical cell codes and strategic res1 world-zoom codes only.
 * Expected outcome: One `LabelJob` with Y equal to projected centroid; `flushCityStyleLabelJobs` uses `textBaseline: middle`.
 * Exceptions: None.
 */
function scheduleCenteredInspectionCodeLabelJob(
  labelJobs: LabelJob[],
  centerPx: { x: number; y: number },
  span: number,
  text: string
): void {
  const fontPx = Math.max(14, Math.min(23, span * 0.165)) * INSPECTION_HEX_CODE_FONT_SCALE;
  labelJobs.push({ x: centerPx.x, y: centerPx.y, text, fontPx });
}

/**
 * Draws collision-nudged white-halo / black-fill labels for queued city-style jobs.
 *
 * Purpose: Single implementation shared by lifted city names, centered inspection codes, and strategic res1 inspection codes.
 * When to use: After all jobs for the frame are scheduled for one overlay pass.
 * Expected outcome: Sorted draw order and up to eight downward nudge steps per label to reduce overlap.
 * Exceptions: None.
 */
function flushCityStyleLabelJobs(ctx: CanvasRenderingContext2D, labelJobs: LabelJob[], zoomStrokeScale: number): void {
  if (labelJobs.length === 0) return;
  labelJobs.sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];
  const haloW = RES4_MAP_OVERLAY_CITY_LABEL_HALO_WIDTH_PX * zoomStrokeScale;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const job of labelJobs) {
    ctx.font = `${job.fontPx}px sans-serif`;
    const metrics = ctx.measureText(job.text);
    const w = metrics.width;
    const h = job.fontPx;
    let y = job.y;
    for (let guard = 0; guard < 8; guard++) {
      const left = job.x - w * 0.5;
      const right = job.x + w * 0.5;
      const top = y - h * 0.5;
      const bottom = y + h * 0.5;
      const hit = placed.some((r) => !(right < r.left || left > r.right || bottom < r.top || top > r.bottom));
      if (!hit) break;
      y += RES4_MAP_OVERLAY_CITY_LABEL_COLLISION_STEP_PX;
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = haloW;
    ctx.strokeStyle = withOpacityHex('#ffffff', RES4_MAP_OVERLAY_CITY_HALO_ALPHA);
    ctx.strokeText(job.text, job.x, y);
    ctx.fillStyle = '#000000';
    ctx.fillText(job.text, job.x, y);
    placed.push({
      left: job.x - w * 0.5 - 1,
      right: job.x + w * 0.5 + 1,
      top: y - h * 0.5 - 2,
      bottom: y + h * 0.5 + 2,
    });
  }
}

/**
 * Defines the `drawRes4CityCircleMarker` function shape (function drawRes4CityCircleMarker(ctx: CanvasRenderingContext2D, cx: number, cy: number, radiusPx: number, haloWidthPx: number, zoomStrokeScale: number): void).

 * Purpose: Renders the canonical yellow filled disk with a translucent black rim matching vector road/rail edge treatment.
 * When to use: Once per labeled res4 city cell; drawn before airport/seaport infrastructure glyphs via frame draw order.
 * Expected outcome: Filled circle with radius `radiusPx` and black stroke at `RES4_MAP_OVERLAY_VECTOR_TRANSPORT_HALO_OPACITY`.
 * Exceptions: None.
 */
function drawRes4CityCircleMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusPx: number,
  haloWidthPx: number,
  zoomStrokeScale: number
): void {
  const r = Math.max(0.5, radiusPx);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const halo = Math.max(0.5, haloWidthPx * zoomStrokeScale);
  ctx.strokeStyle = withOpacityHex('#000000', RES4_MAP_OVERLAY_VECTOR_TRANSPORT_HALO_OPACITY);
  ctx.lineWidth = halo;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = '#f5cc00';
  ctx.fill();
}

/**
 * Defines the `drawRes4CityOverlays` function shape (export function drawRes4CityOverlays(ctx: CanvasRenderingContext2D, deps: Res4CityOverlayDrawDeps): void).

 * Purpose: Renders city circle markers and collision-nudged labels on the overlay canvas; road/rail lines are drawn only on the Leaflet layer from vector JSON.
 * When to use: Before `drawTerrainInfrastructureOverlays` when res4 is active so city markers sit under airport/seaport glyphs.
 * Expected outcome: Yellow disks for named cities without infra glyphs; labels are city names normally, or per-cell two-character codes while map inspection (T) is held (city names hidden, exploration ignored for strategic parents so all viewport-visible cells get codes).
 * Exceptions: None.
 */
export function drawRes4CityOverlays(ctx: CanvasRenderingContext2D, deps: Res4CityOverlayDrawDeps): void {
  if (!S.gameState || !shouldRenderRes4Hexes()) return;
  const map = getMainLeafletMapForProjection();
  if (!map) return;
  const L = getLeafletGlobal();
  if (!L) return;
  ctx.save();
  try {
    const container = map.getContainer();
    const viewportWidth = Math.max(1, container.clientWidth);
    const viewportHeight = Math.max(1, container.clientHeight);
    const zoom = typeof map.getZoom === 'function' ? map.getZoom() ?? 4 : 4;
    const zoomStrokeScale = Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))));
    const exploredHexes = deps.getExploredHexSet(S.gameState);
    const tactical = S.tacticalBattleSnapshot;
    const inspection = isMapInspectionModeHeld();

    const labelJobs: LabelJob[] = [];

    for (const parent of S.gameState.hexes) {
      if (tactical && parent.h3Index !== tactical.enclosingRes1H3Index) continue;
      if (!tactical && !inspection && !exploredHexes.has(parent.h3Index)) continue;
      if (!shouldConsiderRes4ChildrenForViewport(parent.h3Index, map, L, viewportWidth, viewportHeight)) continue;
      let children = S.res4ChildrenByParent.get(parent.h3Index);
      if (!children) {
        children = cellToChildren(parent.h3Index, DETAIL_H3_RESOLUTION);
        S.res4ChildrenByParent.set(parent.h3Index, children);
      }
      for (const child of children) {
        const pts = projectHexBoundaryToContainerPoints(child, map, L);
        if (!shouldDrawRes4ChildHexInViewport(pts, viewportWidth, viewportHeight)) continue;
        const span = spanForProjectedHex(pts);
        const centerPx = projectedCentroid(pts);
        const cityLabel = S.res4CityOverlayLabelByH3.get(child);

        if (cityLabel) {
          const hasAirportOrSeaport =
            S.terrainInfraRes4Airport.has(child) || S.terrainInfraRes4Seaport.has(child);
          if (!hasAirportOrSeaport) {
            const referenceOuterR = RES4_MAP_OVERLAY_CITY_DOT_RADIUS_PX * 2 * zoomStrokeScale;
            const circleRadiusPx = referenceOuterR * RES4_MAP_OVERLAY_CITY_CIRCLE_RADIUS_FRAC;
            drawRes4CityCircleMarker(
              ctx,
              centerPx.x,
              centerPx.y,
              circleRadiusPx,
              RES4_MAP_OVERLAY_CITY_DOT_HALO_WIDTH_PX,
              zoomStrokeScale
            );
          }
        }

        if (inspection) {
          const parentForCode = tactical ? tactical.enclosingRes1H3Index : parent.h3Index;
          const code = getRes4ChildCodeWithinParent(parentForCode, child);
          if (code) {
            scheduleCenteredInspectionCodeLabelJob(labelJobs, centerPx, span, code);
          }
        } else if (cityLabel) {
          scheduleCityStyleLabelJob(labelJobs, centerPx, span, cityLabel, zoomStrokeScale);
        }
      }
    }

    flushCityStyleLabelJobs(ctx, labelJobs, zoomStrokeScale);
  } finally {
    ctx.restore();
  }
}

/**
 * Draws two-character strategic res1 hex codes while map inspection is held at zoom levels without res4 tessellation.
 *
 * Purpose: Matches LLM strategic cell codes with res4-sized sans-serif typography; codes sit at hex centers while T is held on the world map.
 * When to use: From the renderer after `drawRes4CityOverlayPass` when `!shouldRenderRes4Hexes()` and inspection is active.
 * Expected outcome: One label per snapshot res1 hex intersecting the viewport (exploration ignored); no-op in tactical or when inspection is off.
 * Exceptions: None.
 */
export function drawStrategicRes1InspectionHexCodes(
  ctx: CanvasRenderingContext2D,
  _deps: Res4CityOverlayDrawDeps
): void {
  void _deps;
  if (!S.gameState || shouldRenderRes4Hexes() || S.tacticalBattleSnapshot || !isMapInspectionModeHeld()) return;
  const map = getMainLeafletMapForProjection();
  if (!map) return;
  const L = getLeafletGlobal();
  if (!L) return;
  ctx.save();
  try {
    const container = map.getContainer();
    const viewportWidth = Math.max(1, container.clientWidth);
    const viewportHeight = Math.max(1, container.clientHeight);
    const zoom = typeof map.getZoom === 'function' ? map.getZoom() ?? 4 : 4;
    const zoomStrokeScale = Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))));
    const labelJobs: LabelJob[] = [];

    for (const parent of S.gameState.hexes) {
      if (!shouldConsiderRes4ChildrenForViewport(parent.h3Index, map, L, viewportWidth, viewportHeight)) continue;
      const pts = projectHexBoundaryToContainerPoints(parent.h3Index, map, L);
      const span = spanForProjectedHex(pts);
      const centerPx = projectedCentroid(pts);
      const code = getStrategicRes1HexCode(parent.h3Index);
      if (!code) continue;
      scheduleCenteredInspectionCodeLabelJob(labelJobs, centerPx, span, code);
    }

    flushCityStyleLabelJobs(ctx, labelJobs, zoomStrokeScale);
  } finally {
    ctx.restore();
  }
}
