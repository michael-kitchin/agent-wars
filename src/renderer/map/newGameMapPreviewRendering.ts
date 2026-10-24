import { latLngToCell } from 'h3-js';
import {
  inspectionStatusIconDrawPx,
  statusIconCentersX,
  strategicOverlayBandOffsetPx,
  techInspectionIconAssetPath,
  weatherInspectionIconAssetPath,
} from '../../shared/inspectionStatusIconLine';
import { previewHexIsDrawn, previewHomeSeatOrders, previewTechIcon, previewWeatherIcon } from '../../shared/newGameMapPreviewCore';
import { SEAT_PALETTES } from '../../shared/seatPalette';
import type { NewGameMapPreview } from '../../shared/newGameMapPreviewTypes';
import { MULTI_PLAYER_FILL, MULTI_PLAYER_STROKE, TACTICAL_HIDE_THRESHOLD_VIEW_FRACTION, TACTICAL_SHOW_THRESHOLD_VIEW_FRACTION } from '../core/constants';
import { isMapInspectionModeHeld } from '../gameplay/productionOverlayHelpers';
import { readNewGameOptionChoices, readNewGameStartMonth } from '../gameplay/newGameOptionsUi';
import { getMainLeafletMapForProjection } from './leafletMainMapProjection';
import { getLeafletGlobal } from './mapHelpers';
import { projectHexBoundaryToContainerPoints, spanForProjectedHex } from './terrainView';
import { drawPlacedStatusIcon, type StatusIconPlacement } from '../rendering/inspectionStatusIcons';
import {
  drawOutlinedHomeRegionOwnershipBorders,
  getHomeRegionOwnershipLineWidth,
  getMapZoomStrokeScale,
} from '../rendering/terrainRendering';
import { fillHexTerrain, getActiveHexStrokeStyle } from '../rendering/terrainVisualStyles';

/**
 * Last preview the canvas may paint.
 *
 * Purpose: Home changes on the same map can keep this grid until the next payload arrives.
 * When to use: `drawNewGameMapPreview` and `storeNewGameMapPreview`.
 * Expected outcome: Null until the first successful preview, and after a switch to a different map.
 * Exceptions: None.
 */
let payload: NewGameMapPreview | null = null;

/**
 * Map id the dialog is showing, including an empty string while a regional choice is incomplete.
 *
 * Purpose: A response for a map the player has already left must not be painted.
 * When to use: `noteNewGameMapPreviewRequest` and `storeNewGameMapPreview`.
 * Expected outcome: `global`, a regional pack id, or empty.
 * Exceptions: None.
 */
let shownGameMapId: string | null = null;

/**
 * Scene repaint installed by the canvas module.
 *
 * Purpose: This module must not import the scene, because the scene already imports the dialog state.
 * When to use: After a payload is stored or cleared, and when the month or weather bonus changes.
 * Expected outcome: The installed function paints the current frame. The default does nothing.
 * Exceptions: None.
 */
let repaint: () => void = () => {};

/**
 * Whether the preview is zoomed far enough that one of its strategic hexes fills the view.
 *
 * Purpose: Weather and tech icons hide at that zoom. The loaded match's zoom flag must stay untouched.
 * When to use: `previewAtBattleDetailZoom`. Cleared when the dialog opens and when it switches maps.
 * Expected outcome: Stays on until the sample hex falls to the hide threshold, then stays off until the show threshold.
 * Exceptions: None.
 */
let previewBattleDetail = false;

/**
 * Installs the canvas repaint used after a preview change.
 *
 * Purpose: Icon loads and dialog changes need a full frame, including while resolution playback would skip a deferred redraw.
 * When to use: Once, after the scene's redraw function exists.
 * Expected outcome: Later `repaintNewGameMapPreview` calls run that function.
 * Exceptions: None.
 */
export function setNewGameMapPreviewRepaint(fn: () => void): void {
  repaint = fn;
}

/**
 * Clears the preview's battle-detail latch.
 *
 * Purpose: A new opening of the dialog measures its own hexes. The previous opening's zoom must not keep the icons hidden.
 * When to use: When the overlay goes from hidden to shown, with the camera-frame reset.
 * Expected outcome: The next preview frame starts from the show threshold.
 * Exceptions: None.
 */
export function resetNewGameMapPreviewZoom(): void {
  previewBattleDetail = false;
}

/**
 * Paints the current frame through the installed scene redraw.
 *
 * Purpose: Month and weather-bonus changes do not need a new payload.
 * When to use: Those control changes, and after a preview is stored.
 * Expected outcome: The scene redraws. Before the scene installs a function, this does nothing.
 * Exceptions: None.
 */
export function repaintNewGameMapPreview(): void {
  repaint();
}

/**
 * Records the map a preview request is about to load.
 *
 * Purpose: Switching maps must drop the previous grid before the new one arrives. A home change on the same map keeps it.
 * When to use: At the start of a preview request. Pass an empty string when the regional choices are not ready.
 * Expected outcome: `shownGameMapId` is updated. A payload for a different map is cleared and the frame is painted.
 * Exceptions: None.
 */
export function noteNewGameMapPreviewRequest(shownMapId: string): void {
  if (shownGameMapId !== shownMapId) previewBattleDetail = false;
  shownGameMapId = shownMapId;
  if (payload != null && payload.gameMapId !== shownMapId) {
    payload = null;
    repaint();
  }
}

/**
 * Keeps a preview when it still belongs to the map on screen.
 *
 * Purpose: A slower response for the previous map must not replace the current one.
 * When to use: After the preview IPC resolves and the request is still the latest.
 * Expected outcome: True when the payload is stored. False when the dialog has moved on.
 * Exceptions: None.
 */
export function storeNewGameMapPreview(next: NewGameMapPreview): boolean {
  if (shownGameMapId !== next.gameMapId) return false;
  payload = next;
  return true;
}

/**
 * Ring colors for one preview hex from the seat orders that claim it.
 *
 * Purpose: Preview colors follow row order. The loaded match's roster must not recolor them.
 * When to use: A hex claimed by at least one home.
 * Expected outcome: One order uses that seat's map color for both rings. Two or more use the shared gray outer ring and the dark inner ring.
 * Exceptions: None.
 */
function previewRingColors(orders: readonly number[]): { readonly outer: string; readonly inner: string } {
  if (orders.length === 1) {
    const color = SEAT_PALETTES[orders[0]! - 1]?.map ?? MULTI_PLAYER_FILL;
    return { outer: color, inner: color };
  }
  return { outer: MULTI_PLAYER_FILL, inner: MULTI_PLAYER_STROKE };
}

/**
 * Paints the new-game map: terrain, home borders, and weather and tech icons.
 *
 * Purpose: While the overlay is open the canvas shows this instead of the loaded match.
 * When to use: From the scene frame when the overlay is visible.
 * Expected outcome: Nothing when there is no payload for the map on screen or Leaflet is missing. Home hexes use the match's terrain fills and ownership rings. On the global map, other strategic hexes stay off the basemap until T is held, and then that grid is filled and stroked. A regional preview fills and strokes its whole strategic grid. Weather icons follow the month on every strategic hex, and tech icons follow the tech bonus on every strategic hex while T is held; a hex with both shows the tech-then-weather pair, as on the world map. Icons are painted after the hex bodies, so a fill does not cover one.
 * Exceptions: None. A missing map returns without drawing.
 */
export function drawNewGameMapPreview(ctx: CanvasRenderingContext2D, requestRedraw: () => void): void {
  if (!payload || payload.gameMapId !== shownGameMapId) return;
  const map = getMainLeafletMapForProjection();
  const leaflet = getLeafletGlobal();
  if (!map || !leaflet) return;
  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 4;
  const zoomStrokeScale = getMapZoomStrokeScale(zoom);
  const ownershipLineWidth = getHomeRegionOwnershipLineWidth(zoom);
  const stroke = getActiveHexStrokeStyle();
  const inspectionHeld = isMapInspectionModeHeld();
  const tacticalZoom = previewAtBattleDetailZoom(map, leaflet, payload);
  const choices = readNewGameOptionChoices();
  const weatherBonusLevel = choices.weatherBonusLevel;
  const techBonusLevel = choices.techBonusLevel;
  const startMonth = readNewGameStartMonth();
  const homesBySeat = payload.homeRegionHexesBySeatOrder;
  const icons: StatusIconPlacement[] = [];
  for (const hex of payload.hexes) {
    const orders = previewHomeSeatOrders(hex.h3Index, homesBySeat);
    const pts = projectHexBoundaryToContainerPoints(hex.h3Index, map, leaflet);
    if (pts.length === 0) continue;
    if (previewHexIsDrawn(payload.gameMapId, orders.length > 0 ? { kind: 'shared' } : null, inspectionHeld)) {
      const drawClosedPath = (): void => {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const point = pts[i]!;
          if (i === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.closePath();
      };
      fillHexTerrain(ctx, hex.terrainKind, drawClosedPath);
      if (orders.length === 0) {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width * zoomStrokeScale;
        drawClosedPath();
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0)';
        ctx.lineWidth = stroke.width * zoomStrokeScale;
        drawClosedPath();
        ctx.stroke();
        const rings = previewRingColors(orders);
        drawOutlinedHomeRegionOwnershipBorders(ctx, pts, {
          controllerPlayerId: null,
          homeOwnerIdentity: { kind: 'shared' },
          ownershipLineWidth,
          outerColor: rings.outer,
          innerColor: rings.inner,
        });
      }
    }
    const weather = previewWeatherIcon({
      weatherBonusLevel,
      startMonth,
      weatherByMonth: hex.weatherByMonth,
      tacticalZoom,
    });
    const tech = previewTechIcon({
      techBonusLevel,
      baselineUrbanHexCount: hex.baselineUrbanHexCount,
      advancedMinUrbanCells: payload.advancedMinUrbanCells,
      mapInspectionHeld: inspectionHeld,
      tacticalZoom,
    });
    // Tech then weather, left to right, the same order as the world map's status icons.
    const assetPaths: string[] = [];
    if (tech) assetPaths.push(techInspectionIconAssetPath(tech));
    if (weather) assetPaths.push(weatherInspectionIconAssetPath(weather));
    icons.push(...statusIconPlacements(pts, assetPaths));
  }
  for (const icon of icons) drawPlacedStatusIcon(ctx, icon, requestRedraw);
}

/**
 * Reports whether one preview strategic hex fills enough of the view to hide weather and tech icons.
 *
 * Purpose: Battle-detail zoom follows the hexes on screen, at this preview's resolution. The loaded match's zoom flag stays as it was.
 * When to use: Once per preview frame.
 * Expected outcome: True after the sample hex reaches the show threshold, until it falls to the hide threshold. A zero fraction clears the flag.
 * Exceptions: None.
 */
function previewAtBattleDetailZoom(
  map: NonNullable<ReturnType<typeof getMainLeafletMapForProjection>>,
  leaflet: NonNullable<ReturnType<typeof getLeafletGlobal>>,
  preview: NewGameMapPreview
): boolean {
  const fraction = previewStrategicFillFraction(map, leaflet, preview);
  if (previewBattleDetail) {
    if (fraction <= TACTICAL_HIDE_THRESHOLD_VIEW_FRACTION) previewBattleDetail = false;
  } else if (fraction >= TACTICAL_SHOW_THRESHOLD_VIEW_FRACTION) {
    previewBattleDetail = true;
  }
  return previewBattleDetail;
}

/**
 * Measures one preview strategic hex against the view.
 *
 * Purpose: The same fill fraction the match uses, taken from this preview's resolution.
 * When to use: `previewAtBattleDetailZoom`.
 * Expected outcome: The larger of the sample hex's width and height, divided by the view. Zero when the preview has no hex or the ring does not project.
 * Exceptions: None. A center that is not a preview hex uses the first hex.
 */
function previewStrategicFillFraction(
  map: NonNullable<ReturnType<typeof getMainLeafletMapForProjection>>,
  leaflet: NonNullable<ReturnType<typeof getLeafletGlobal>>,
  preview: NewGameMapPreview
): number {
  const sample = samplePreviewHex(map, leaflet, preview);
  if (!sample) return 0;
  const pts = projectHexBoundaryToContainerPoints(sample, map, leaflet);
  if (pts.length === 0) return 0;
  let minX = pts[0]!.x;
  let maxX = pts[0]!.x;
  let minY = pts[0]!.y;
  let maxY = pts[0]!.y;
  for (const point of pts) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const container = map.getContainer();
  const viewW = Math.max(1, container.clientWidth);
  const viewH = Math.max(1, container.clientHeight);
  return Math.max((maxX - minX) / viewW, (maxY - minY) / viewH);
}

/**
 * Picks the preview hex at the center of the view.
 *
 * Purpose: Cell size changes with latitude, so the sample should be the hex under the view center.
 * When to use: `previewStrategicFillFraction`.
 * Expected outcome: The center cell when it belongs to this preview. Otherwise the first hex.
 * Exceptions: None. An unusable center falls back to the first hex.
 */
function samplePreviewHex(
  map: NonNullable<ReturnType<typeof getMainLeafletMapForProjection>>,
  leaflet: NonNullable<ReturnType<typeof getLeafletGlobal>>,
  preview: NewGameMapPreview
): string | null {
  const first = preview.hexes[0]?.h3Index;
  if (!first) return null;
  const container = map.getContainer();
  const center = map.containerPointToLatLng(
    leaflet.point(Math.max(1, container.clientWidth) * 0.5, Math.max(1, container.clientHeight) * 0.5)
  );
  try {
    const atCenter = latLngToCell(center.lat, center.lng, preview.strategicResolution);
    if (preview.hexes.some((hex) => hex.h3Index === atCenter)) return atCenter;
  } catch {
    return first;
  }
  return first;
}

/**
 * Places a preview hex's status icons on the band above its center.
 *
 * Purpose: Weather and tech share the band and the plain 16.5px size, because the preview draws no units or
 *   infrastructure. One icon is centered, and two sit side by side as a centered pair (`statusIconCentersX`).
 * When to use: Each preview hex, with the asset paths of the icons it shows this frame, tech first.
 * Expected outcome: One placement per asset path, left to right. None when the list is empty.
 * Exceptions: None.
 */
function statusIconPlacements(
  pts: readonly { x: number; y: number }[],
  assetPaths: readonly string[]
): StatusIconPlacement[] {
  if (assetPaths.length === 0) return [];
  let sumX = 0;
  let sumY = 0;
  for (const point of pts) {
    sumX += point.x;
    sumY += point.y;
  }
  const centerY = sumY / pts.length - strategicOverlayBandOffsetPx(spanForProjectedHex([...pts]));
  const iconPx = inspectionStatusIconDrawPx({
    productionSurface: 'canvas',
    hasInfraSymbols: false,
    hasVisibleUnits: false,
  });
  const centersX = statusIconCentersX(sumX / pts.length, iconPx, assetPaths.length);
  return assetPaths.map((assetPath, i) => ({ centerX: centersX[i]!, centerY, iconPx, assetPath }));
}
