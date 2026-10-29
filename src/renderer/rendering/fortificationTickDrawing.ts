/**
 * Draws fortification ticks on strategic hexes and tactical cells.
 *
 * Purpose: The pattern uses the controller's color and hides while terrain inspection is held.
 * When to use: The strategic scene pass, the zoomed-in cell loop, and the battle footprint.
 * Expected outcome: Ticks on explored fortified hexes and on fortified cells. A polygon smaller than the minimum radius is skipped.
 * Exceptions: None. A missing map or game state draws nothing.
 */

import { isPentagon } from 'h3-js';
import { strategicParentOf } from '../../shared/h3Resolutions';
import { isHexOwnershipVisibleToPerspective, ownershipPerspective } from '../../shared/homeRegionRules';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  fortificationEdges,
  fortificationTickSegments,
  litFortificationEdgeCount,
  type ScreenPoint,
} from '../../shared/fortificationTickGeometry';
import { OWNERSHIP_BORDER_ALPHA } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { getHexBoundaryLatLngForLeafletOverlay } from '../map/hexGrid';
import { getLeafletGlobal } from '../map/mapHelpers';
import { shouldRenderTacticalHexes } from '../map/terrainView';
import { getMainLeafletMap } from '../map/worldLeafletMap';
import { resolveControllerBorderColor } from './homeRegionBorderDrawing';

/** Tick length as a fraction of a strategic hex's radius. */
export const STRATEGIC_FORTIFICATION_TICK_LENGTH_RATIO = 0.16;

/** Tick width as a fraction of a strategic hex's radius. */
export const STRATEGIC_FORTIFICATION_TICK_WIDTH_RATIO = 0.04;

/** Smallest strategic tick width, in pixels. */
export const STRATEGIC_FORTIFICATION_TICK_MIN_WIDTH_PX = 1.5;

/** Tick length as a fraction of a cell's radius. */
export const CELL_FORTIFICATION_TICK_LENGTH_RATIO = 0.18;

/** Tick width as a fraction of a cell's radius. */
export const CELL_FORTIFICATION_TICK_WIDTH_RATIO = 0.05;

/** Smallest cell tick width, in pixels. */
export const CELL_FORTIFICATION_TICK_MIN_WIDTH_PX = 1;

/**
 * Polygons smaller than this draw no ticks.
 *
 * Purpose: A hex that is only a few pixels wide cannot show the pattern.
 * When to use: The map passes. The legend swatch does not use this limit.
 * Expected outcome: 6 pixels.
 * Exceptions: None.
 */
export const FORTIFICATION_TICK_MIN_RADIUS_PX = 6;

/**
 * What the strategic pass needs from the scene.
 *
 * Purpose: Exploration and inspection already live on the terrain draw dependencies.
 * When to use: `drawStrategicFortificationTicks`.
 * Expected outcome: The same predicates `drawTerrainHexes` uses.
 * Exceptions: None.
 */
export interface StrategicFortificationTickDeps {
  /**
   * Hexes the viewer has explored.
   *
   * Contract: The same set `drawTerrainHexes` uses.
   * When to use: Before drawing ticks on a strategic hex.
   * Expected outcome: An unexplored hex draws no ticks.
   * Exceptions: None.
   */
  readonly getExploredHexSet: (state: GameStateSnapshot) => ReadonlySet<string>;
  /**
   * Whether terrain inspection is held.
   *
   * Contract: True only while T is held.
   * When to use: The strategic tick pass.
   * Expected outcome: True hides the ticks.
   * Exceptions: None.
   */
  readonly isMapInspectionModeHeld: () => boolean;
}

let colorMemoState: GameStateSnapshot | null = null;
let colorByParent = new Map<string, string>();

/**
 * Strokes tick segments inside the current path state.
 *
 * Purpose: Map passes and the legend share the stroke. The legend is smaller than the map's radius limit, so this function does not check size.
 * When to use: After the caller has chosen color, width, and which edges are lit.
 * Expected outcome: The segments are stroked at ownership-border opacity with butt caps. The canvas state is restored.
 * Exceptions: None.
 */
export function drawFortificationTicks(
  ctx: CanvasRenderingContext2D,
  args: {
    readonly points: readonly ScreenPoint[];
    readonly cornerCount: number;
    readonly litEdgeCount: number;
    readonly color: string;
    readonly tickLengthPx: number;
    readonly lineWidthPx: number;
  }
): void {
  const segments = fortificationTickSegments(args);
  if (segments.length === 0) return;
  ctx.save();
  ctx.globalAlpha = OWNERSHIP_BORDER_ALPHA;
  ctx.strokeStyle = args.color;
  ctx.lineWidth = args.lineWidthPx;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const segment of segments) {
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Color of a fortified hex's ticks.
 *
 * Purpose: The pattern uses the same color as that controller's ownership border.
 * When to use: When the caller already knows the controller and whether ownership is visible.
 * Expected outcome: The controller color, or the gray used for an unknown controller.
 * Exceptions: None.
 */
export function fortificationTickColor(controllerId: string | null, ownershipVisible: boolean): string {
  return resolveControllerBorderColor(ownershipVisible ? controllerId : null);
}

/**
 * Color of a fortified cell's ticks.
 *
 * Purpose: Cell draw loops do not carry the controller map, so the color is read from the parent hex.
 * When to use: Zoomed-in cells and battle cells.
 * Expected outcome: The parent hex's tick color. The gray color when there is no match. The same parent reuses the color until the game state object changes.
 * Exceptions: None. An index that is not a tactical cell uses the gray color.
 */
export function fortificationCellTickColor(cellH3Index: string): string {
  const state = S.gameState;
  if (!state) return fortificationTickColor(null, false);
  if (state !== colorMemoState) {
    colorMemoState = state;
    colorByParent = new Map();
  }
  let parent = cellH3Index;
  try {
    parent = strategicParentOf(cellH3Index);
  } catch {
    return fortificationTickColor(null, false);
  }
  const cached = colorByParent.get(parent);
  if (cached) return cached;
  const controller = state.strategicControl?.find((row) => row.h3Index === parent)?.controllerPlayerId ?? null;
  const visibleHexes = state.visibleHexes ? new Set(state.visibleHexes) : new Set(state.hexes.map((hex) => hex.h3Index));
  const ownershipVisible = isHexOwnershipVisibleToPerspective({
    h3Index: parent,
    playerPerspective: ownershipPerspective(state.playerPerspective),
    visibleHexes,
    homeRegionHexesBySeat: state.homeRegionHexesBySeat,
    intersectingHomeRegionHexes: state.intersectingHomeRegionHexes,
  });
  const color = fortificationTickColor(controller, ownershipVisible);
  colorByParent.set(parent, color);
  return color;
}

/**
 * How many corners a hex index has.
 *
 * Purpose: Pentagons have five sides. Every other cell has six.
 * When to use: Before splitting a projected boundary.
 * Expected outcome: 5 or 6.
 * Exceptions: None.
 */
export function fortificationCornerCount(h3Index: string): number {
  return isPentagon(h3Index) ? 5 : 6;
}

/**
 * Draws ticks on explored fortified hexes.
 *
 * Purpose: The pattern sits above hex borders and hides at tactical zoom, during a battle, and while inspecting terrain.
 * When to use: The strategic branch of the scene, after home-region outlines.
 * Expected outcome: Each explored hex with a fortified cell shows its share of edges, in the controller's color.
 * Exceptions: None. A missing map draws nothing.
 */
export function drawStrategicFortificationTicks(ctx: CanvasRenderingContext2D, deps: StrategicFortificationTickDeps): void {
  const state = S.gameState;
  if (!state || S.tacticalBattleSnapshot) return;
  if (shouldRenderTacticalHexes() || deps.isMapInspectionModeHeld()) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  const leaflet = getLeafletGlobal() as { latLng: (lat: number, lng: number) => unknown } | null;
  if (!map || !leaflet) return;
  const explored = deps.getExploredHexSet(state);
  const visibleHexes = state.visibleHexes ? new Set(state.visibleHexes) : new Set(state.hexes.map((hex) => hex.h3Index));
  const perspective = ownershipPerspective(state.playerPerspective);
  const control = new Map((state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const infra = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row]));
  for (const hex of state.hexes) {
    if (!explored.has(hex.h3Index)) continue;
    const row = infra.get(hex.h3Index);
    const fortified = row?.fortifiedCount ?? 0;
    if (fortified <= 0) continue;
    const boundary = getHexBoundaryLatLngForLeafletOverlay(hex.h3Index);
    const points = boundary.map(([lat, lng]) => {
      const projected = map.latLngToContainerPoint(leaflet.latLng(lat, lng));
      return { x: projected.x, y: projected.y };
    });
    const cornerCount = fortificationCornerCount(hex.h3Index);
    const ownershipVisible = isHexOwnershipVisibleToPerspective({
      h3Index: hex.h3Index,
      playerPerspective: perspective,
      visibleHexes,
      homeRegionHexesBySeat: state.homeRegionHexesBySeat,
      intersectingHomeRegionHexes: state.intersectingHomeRegionHexes,
    });
    drawScaledFortificationTicks(ctx, {
      points,
      cornerCount,
      litEdgeCount: litFortificationEdgeCount({
        fortified,
        intactCityCells: fortified + (row?.fortifiableCount ?? 0),
        edgeCount: cornerCount,
      }),
      color: fortificationTickColor(control.get(hex.h3Index) ?? null, ownershipVisible),
      lengthRatio: STRATEGIC_FORTIFICATION_TICK_LENGTH_RATIO,
      widthRatio: STRATEGIC_FORTIFICATION_TICK_WIDTH_RATIO,
      minWidthPx: STRATEGIC_FORTIFICATION_TICK_MIN_WIDTH_PX,
    });
  }
}

/**
 * Draws the full tick pattern on one fortified cell.
 *
 * Purpose: A cell is either fortified or not, so every side is lit.
 * When to use: After the cell's stroke, when inspection is not held.
 * Expected outcome: Ticks in the parent hex's color, or nothing when the cell is smaller than the radius limit.
 * Exceptions: None.
 */
export function drawFortifiedCellTicks(
  ctx: CanvasRenderingContext2D,
  points: readonly ScreenPoint[],
  cellH3Index: string,
  color = fortificationCellTickColor(cellH3Index)
): void {
  const cornerCount = fortificationCornerCount(cellH3Index);
  drawScaledFortificationTicks(ctx, {
    points,
    cornerCount,
    litEdgeCount: cornerCount,
    color,
    lengthRatio: CELL_FORTIFICATION_TICK_LENGTH_RATIO,
    widthRatio: CELL_FORTIFICATION_TICK_WIDTH_RATIO,
    minWidthPx: CELL_FORTIFICATION_TICK_MIN_WIDTH_PX,
  });
}

function drawScaledFortificationTicks(
  ctx: CanvasRenderingContext2D,
  args: {
    readonly points: readonly ScreenPoint[];
    readonly cornerCount: number;
    readonly litEdgeCount: number;
    readonly color: string;
    readonly lengthRatio: number;
    readonly widthRatio: number;
    readonly minWidthPx: number;
  }
): void {
  const corners = fortificationEdges(args.points, args.cornerCount)
    .map((edge) => edge[0])
    .filter((point): point is ScreenPoint => point != null);
  if (corners.length < 3) return;
  let x = 0;
  let y = 0;
  for (const corner of corners) {
    x += corner.x;
    y += corner.y;
  }
  x /= corners.length;
  y /= corners.length;
  let radius = 0;
  for (const corner of corners) radius += Math.hypot(corner.x - x, corner.y - y);
  radius /= corners.length;
  if (radius < FORTIFICATION_TICK_MIN_RADIUS_PX) return;
  drawFortificationTicks(ctx, {
    points: args.points,
    cornerCount: args.cornerCount,
    litEdgeCount: args.litEdgeCount,
    color: args.color,
    tickLengthPx: radius * args.lengthRatio,
    lineWidthPx: Math.max(args.minWidthPx, radius * args.widthRatio),
  });
}
