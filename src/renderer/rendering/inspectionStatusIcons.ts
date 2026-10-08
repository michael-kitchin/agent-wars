/**
 * Draws one status icon above a strategic world hex.
 *
 * Purpose: Weather shows while T is not held. Tech replaces it, at the same enlarged size, while T is held.
 * When to use: Immediately after the strategic hex-code pass.
 * Expected outcome: One centered icon on each qualifying world hex. Nothing in a tactical battle or at battle-detail zoom.
 * Exceptions: A missing map or a failed image load leaves that icon blank. The function does not throw.
 */

import {
  inspectionStatusIconDrawPx,
  inspectionStatusIconsForHex,
  strategicOverlayBandOffsetPx,
  strategicProductionLabelSurface,
  techInspectionIconAssetPath,
  weatherInspectionIconAssetPath,
} from '../../shared/inspectionStatusIconLine';
import { rendererSharedState as S } from '../core/state';
import {
  getControllerForHex,
  isMapInspectionModeHeld,
  isStrategicHexHumanUrbanProduction,
} from '../gameplay/productionOverlayHelpers';
import { getLeafletGlobal } from '../map/mapHelpers';
import { getMainLeafletMapForProjection } from '../map/leafletMainMapProjection';
import {
  projectHexBoundaryToContainerPoints,
  shouldRenderTacticalHexes,
  shouldShowBuildEntryZoom,
  spanForProjectedHex,
} from '../map/terrainView';
import { baselineUrbanHexCountForStrategicHex } from '../rendererTacticalHydration';

/**
 * Callbacks the scene already owns.
 *
 * Purpose: Exploration, infrastructure visibility, and redraw stay with the renderer so this module does not import it.
 * When to use: Pass the wrappers from `drawGameScene`.
 * Expected outcome: One object for the whole pass.
 * Exceptions: None.
 */
export interface InspectionStatusIconDrawDeps {
  /**
   * Whether the player has explored a world hex.
   *
   * Contract: Same predicate the production overlay uses.
   * When to use: Once per hex.
   * Expected outcome: True when the hex is explored.
   * Exceptions: None.
   */
  readonly isHexExploredByPlayer: (h3Index: string) => boolean;
  /**
   * Whether the hex would show an airport or seaport glyph.
   *
   * Contract: The set is the hexes that currently hold a unit. The boolean matches the production label's infrastructure check.
   * When to use: Once per hex that may draw a status icon.
   * Expected outcome: True when that check would shrink the production text to 10px.
   * Exceptions: None.
   */
  readonly hasInfraSymbols: (h3Index: string, unitHexes: Set<string>) => boolean;
  /**
   * Asks the scene to paint again.
   *
   * Contract: Called once when an icon image finishes loading.
   * When to use: From the image load callback.
   * Expected outcome: The next frame can draw the image that was blank on this frame.
   * Exceptions: None.
   */
  readonly requestRedraw: () => void;
}

/**
 * Loaded icon images, keyed by asset path. Null means the load failed.
 *
 * Purpose: One load per icon for the life of the page.
 * When to use: `iconImage`.
 * Expected outcome: An element while loading or after success, or null after an error. The entry is stored before `src` is set, so a load that finishes during this call is already cached.
 * Exceptions: None.
 */
const iconImages = new Map<string, HTMLImageElement | null>();

/**
 * Returns the average of a projected hex ring.
 *
 * Purpose: The inspection hex code is placed on this centroid, and the icon row uses the same point.
 * When to use: After `projectHexBoundaryToContainerPoints` returns a non-empty ring.
 * Expected outcome: The arithmetic mean of the vertices.
 * Exceptions: None. Callers skip an empty ring.
 */
function projectedCentroid(pts: readonly { x: number; y: number }[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const point of pts) {
    sx += point.x;
    sy += point.y;
  }
  const count = pts.length;
  return { x: sx / count, y: sy / count };
}

/**
 * Starts or returns the cached image for one icon path.
 *
 * Purpose: The first frame can reserve space, and a later frame draws the image after it loads.
 * When to use: Once per icon per hex per frame.
 * Expected outcome: The image element, or null after a load error. The cache is written before `src` is assigned. A successful load requests one redraw.
 * Exceptions: A load error stores null and does not throw.
 */
function iconImage(src: string, requestRedraw: () => void): HTMLImageElement | null {
  if (iconImages.has(src)) return iconImages.get(src) ?? null;
  const img = new Image();
  img.decoding = 'async';
  iconImages.set(src, img);
  img.onload = () => {
    if (iconImages.get(src) === img) requestRedraw();
  };
  img.onerror = () => {
    if (iconImages.get(src) === img) iconImages.set(src, null);
  };
  img.src = src;
  return iconImages.get(src) ?? null;
}

/**
 * Paints one icon inside a square, preserving its aspect.
 *
 * Purpose: The square is the enlarged status-icon size for this hex.
 * When to use: For the one icon after its pixel size is known.
 * Expected outcome: The image is drawn when it has loaded. A blank square is left while it is loading or after an error.
 * Exceptions: None.
 */
function drawFittedIcon(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  centerX: number,
  centerY: number,
  iconPx: number
): void {
  if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
  const scale = iconPx / Math.max(img.naturalWidth, img.naturalHeight);
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  ctx.drawImage(img, centerX - width / 2, centerY - height / 2, width, height);
}

/**
 * Placement for the one status icon on a hex.
 *
 * Purpose: Keeps the draw call within the argument limit while the icon still knows its center, size, and asset.
 * When to use: `drawStatusIcon`.
 * Expected outcome: One object per hex that will be painted.
 * Exceptions: None.
 */
export interface StatusIconPlacement {
  /**
   * Horizontal center of the icon, in container pixels.
   *
   * Contract: The hex centroid x.
   * When to use: Centering the icon.
   * Expected outcome: The icon is centered on this x.
   * Exceptions: None.
   */
  readonly centerX: number;
  /**
   * Vertical center of the icon, in container pixels.
   *
   * Contract: The centroid y minus the production-band offset.
   * When to use: The icon's vertical center.
   * Expected outcome: The icon sits on the band above the hex center.
   * Exceptions: None.
   */
  readonly centerY: number;
  /**
   * Icon square size, in pixels.
   *
   * Contract: 15 or 16.5. One and a half times the 10px or 11px production-text base.
   * When to use: `drawFittedIcon`.
   * Expected outcome: Weather and tech use the same size on a given hex.
   * Exceptions: None.
   */
  readonly iconPx: number;
  /**
   * SVG path for the one icon.
   *
   * Contract: A tech or weather asset path from the status-icon choice.
   * When to use: `iconImage`.
   * Expected outcome: That file is drawn, or a blank square while it loads.
   * Exceptions: None.
   */
  readonly assetPath: string;
}

/**
 * Draws one weather or tech icon for the new-game map preview.
 *
 * Purpose: The preview has no match, so it cannot use the status-icon pass that returns without game state.
 * When to use: One preview hex that is showing a weather icon, or a tech icon while T is held.
 * Expected outcome: The image is centered on the placement. A blank square is left while it loads, then a redraw paints it.
 * Exceptions: None.
 */
export function drawPlacedStatusIcon(
  ctx: CanvasRenderingContext2D,
  placement: StatusIconPlacement,
  requestRedraw: () => void
): void {
  drawStatusIcon(
    ctx,
    {
      isHexExploredByPlayer: () => false,
      hasInfraSymbols: () => false,
      requestRedraw,
    },
    placement
  );
}

/**
 * Draws one status icon centered on a hex band.
 *
 * Purpose: Paints the one chosen image at the band center.
 * When to use: After the selector returns a tech or weather icon.
 * Expected outcome: The image is centered on the placement point at `iconPx`. A blank square is left while it loads.
 * Exceptions: None.
 */
function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  deps: InspectionStatusIconDrawDeps,
  placement: StatusIconPlacement
): void {
  drawFittedIcon(
    ctx,
    iconImage(placement.assetPath, deps.requestRedraw),
    placement.centerX,
    placement.centerY,
    placement.iconPx
  );
}

/**
 * Draws the status icon above each qualifying world hex.
 *
 * Purpose: Weather shows while T is not held. Tech replaces it while T is held. Neither requires a production label.
 * When to use: On the next line after each `drawStrategicInspectionHexCodes` call.
 * Expected outcome: No-op in a tactical battle or at battle-detail zoom. Otherwise one icon per qualifying hex. An unexplored hex is not passed a weather word, because the renderer snapshot still stores weather there.
 * Exceptions: A missing map returns without drawing. Image errors leave a blank square.
 */
export function drawInspectionStatusIcons(ctx: CanvasRenderingContext2D, deps: InspectionStatusIconDrawDeps): void {
  if (!S.gameState || S.tacticalBattleSnapshot || shouldRenderTacticalHexes()) return;
  const map = getMainLeafletMapForProjection();
  const leaflet = getLeafletGlobal();
  if (!map || !leaflet) return;
  const state = S.gameState;
  const unitHexes = new Set(state.units.map((unit) => unit.h3Index));
  const buildEntryZoom = shouldShowBuildEntryZoom();
  const mapInspectionHeld = isMapInspectionModeHeld();
  ctx.save();
  try {
    for (const hx of state.hexes) {
      const explored = deps.isHexExploredByPlayer(hx.h3Index);
      const controlledByHuman = getControllerForHex(state, hx.h3Index) === 'human';
      const humanUrbanProduction = isStrategicHexHumanUrbanProduction(state, hx);
      const surface = strategicProductionLabelSurface({
        tacticalRendered: false,
        explored,
        mapInspectionHeld,
        controlledByHuman,
        humanUrbanProduction,
        buildEntryZoom,
      });
      const icon = inspectionStatusIconsForHex({
        mapInspectionHeld,
        techBonusEnabled: state.techBonusEnabled === true,
        weatherBonusEnabled: state.weatherBonusEnabled === true,
        baselineUrbanHexCount: baselineUrbanHexCountForStrategicHex(hx.h3Index),
        weather: explored ? hx.weather : null,
      });
      if (!icon) continue;
      const pts = projectHexBoundaryToContainerPoints(hx.h3Index, map, leaflet);
      if (pts.length === 0) continue;
      const centroid = projectedCentroid(pts);
      const assetPath = icon.kind === 'tech'
        ? techInspectionIconAssetPath(icon.level)
        : weatherInspectionIconAssetPath(icon.state);
      drawStatusIcon(ctx, deps, {
        centerX: centroid.x,
        centerY: centroid.y - strategicOverlayBandOffsetPx(spanForProjectedHex(pts)),
        iconPx: inspectionStatusIconDrawPx({
          productionSurface: surface === 'button' ? 'button' : 'canvas',
          hasInfraSymbols: deps.hasInfraSymbols(hx.h3Index, unitHexes),
          hasVisibleUnits: unitHexes.has(hx.h3Index),
        }),
        assetPath,
      });
    }
  } finally {
    ctx.restore();
  }
}
