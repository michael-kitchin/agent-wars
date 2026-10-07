/**
 * Draws the tech and weather icons above strategic hex codes while map inspection is held.
 *
 * Purpose: The held-T world map shows those icons on hexes that already show a production label.
 * When to use: Immediately after the strategic hex-code pass.
 * Expected outcome: While T is held on the strategic world map, a centered icon row one production-band above each code. Nothing in a tactical battle, at tactical zoom, or when T is released.
 * Exceptions: A missing map or a failed image load leaves that icon blank. The function does not throw.
 */

import {
  INSPECTION_STATUS_ICON_SLASH_TEXT,
  inspectionStatusIconFontPx,
  inspectionStatusIconsForHex,
  inspectionStatusSlashIsBold,
  strategicOverlayBandOffsetPx,
  strategicProductionLabelSurface,
  techInspectionIconAssetPath,
  weatherInspectionIconAssetPath,
} from '../../shared/inspectionStatusIconLine';
import type { TechLevel } from '../../shared/techBonusTypes';
import type { WeatherState } from '../../shared/weatherBonusTypes';
import { rendererSharedState as S } from '../core/state';
import {
  getUrbanProductionCapacityForHex,
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
   * When to use: Once per hex that will draw an icon row.
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
 * Purpose: Tech and weather marks match the production text height.
 * When to use: For each present icon after the font size is known.
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
 * Paints the slash with the production label's white edge and black fill.
 *
 * Purpose: The character between the icons matches the slash between production numbers.
 * When to use: Only when both icons are present.
 * Expected outcome: ` / ` centered at the given point.
 * Exceptions: None.
 */
function drawSlash(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.25;
  ctx.strokeText(INSPECTION_STATUS_ICON_SLASH_TEXT, centerX, centerY);
  ctx.fillStyle = '#000';
  ctx.fillText(INSPECTION_STATUS_ICON_SLASH_TEXT, centerX, centerY);
}

/**
 * Placement for one icon row.
 *
 * Purpose: Keeps the draw call within the argument limit while the row still knows its center, size, and icons.
 * When to use: `drawIconGroup`.
 * Expected outcome: One object per hex that will be painted.
 * Exceptions: None.
 */
interface IconGroupPlacement {
  /**
   * Horizontal center of the group, in container pixels.
   *
   * Contract: The hex-code centroid x.
   * When to use: Centering the icons and the slash.
   * Expected outcome: The group is centered on this x.
   * Exceptions: None.
   */
  readonly centerX: number;
  /**
   * Vertical center of the icons, in container pixels.
   *
   * Contract: The centroid y minus the production-band offset.
   * When to use: The shared baseline for the icons and the slash.
   * Expected outcome: The row sits above the hex code.
   * Exceptions: None.
   */
  readonly centerY: number;
  /**
   * Icon square and slash font size, in pixels.
   *
   * Contract: 10 or 11, matching the production label.
   * When to use: Font string and icon fit.
   * Expected outcome: Icons and the slash share this size.
   * Exceptions: None.
   */
  readonly fontPx: number;
  /**
   * Whether the slash uses the bold production weight.
   *
   * Contract: True for a human hex with capacity above zero.
   * When to use: The canvas font string.
   * Expected outcome: Bold or regular `system-ui`.
   * Exceptions: None.
   */
  readonly bold: boolean;
  /**
   * Tech tier to paint, or null when that icon is omitted.
   *
   * Contract: Set only when the icon line includes tech.
   * When to use: The left side of the group.
   * Expected outcome: Null skips that square.
   * Exceptions: None.
   */
  readonly tech: TechLevel | null;
  /**
   * Weather state to paint, or null when that icon is omitted.
   *
   * Contract: Set only when the icon line includes weather.
   * When to use: The right side of the group.
   * Expected outcome: Null skips that square.
   * Exceptions: None.
   */
  readonly weather: WeatherState | null;
}

/**
 * Draws the icon row for one hex.
 *
 * Purpose: Keeps the group centered, with a reserved square for an icon that has not loaded yet.
 * When to use: After the hex has a non-empty icon line.
 * Expected outcome: Tech, then the slash, then weather. A single icon is centered with no slash.
 * Exceptions: None.
 */
function drawIconGroup(
  ctx: CanvasRenderingContext2D,
  deps: InspectionStatusIconDrawDeps,
  placement: IconGroupPlacement
): void {
  const { centerX, centerY, fontPx, bold, tech, weather } = placement;
  ctx.font = `${bold ? 'bold ' : ''}${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const slashWidth = tech && weather ? ctx.measureText(INSPECTION_STATUS_ICON_SLASH_TEXT).width : 0;
  const totalWidth = (tech ? fontPx : 0) + slashWidth + (weather ? fontPx : 0);
  let left = centerX - totalWidth / 2;
  if (tech) {
    drawFittedIcon(
      ctx,
      iconImage(techInspectionIconAssetPath(tech), deps.requestRedraw),
      left + fontPx / 2,
      centerY,
      fontPx
    );
    left += fontPx;
  }
  if (tech && weather) {
    drawSlash(ctx, left + slashWidth / 2, centerY);
    left += slashWidth;
  }
  if (weather) {
    drawFittedIcon(
      ctx,
      iconImage(weatherInspectionIconAssetPath(weather), deps.requestRedraw),
      left + fontPx / 2,
      centerY,
      fontPx
    );
  }
}

/**
 * Draws tech and weather icons above world-hex codes while inspection is held.
 *
 * Purpose: Shows the same tech tier and weather the hex tooltip names, on hexes that already show a production label.
 * When to use: On the next line after each `drawStrategicInspectionHexCodes` call.
 * Expected outcome: No-op in a tactical battle, at tactical zoom, or when T is not held. Otherwise one row per labeled hex.
 * Exceptions: A missing map returns without drawing. Image errors leave a blank square.
 */
export function drawInspectionStatusIcons(ctx: CanvasRenderingContext2D, deps: InspectionStatusIconDrawDeps): void {
  if (!S.gameState || S.tacticalBattleSnapshot || !isMapInspectionModeHeld() || shouldRenderTacticalHexes()) return;
  const map = getMainLeafletMapForProjection();
  const leaflet = getLeafletGlobal();
  if (!map || !leaflet) return;
  const state = S.gameState;
  const unitHexes = new Set(state.units.map((unit) => unit.h3Index));
  const buildEntryZoom = shouldShowBuildEntryZoom();
  ctx.save();
  try {
    for (const hx of state.hexes) {
      const explored = deps.isHexExploredByPlayer(hx.h3Index);
      const controlledByHuman = getControllerForHex(state, hx.h3Index) === 'human';
      const humanUrbanProduction = isStrategicHexHumanUrbanProduction(state, hx);
      const surface = strategicProductionLabelSurface({
        tacticalRendered: false,
        explored,
        mapInspectionHeld: true,
        controlledByHuman,
        humanUrbanProduction,
        buildEntryZoom,
      });
      const icons = inspectionStatusIconsForHex({
        productionSurface: surface,
        techBonusEnabled: state.techBonusEnabled === true,
        baselineUrbanHexCount: baselineUrbanHexCountForStrategicHex(hx.h3Index),
        weather: hx.weather,
      });
      if (surface === 'none' || !icons) continue;
      const pts = projectHexBoundaryToContainerPoints(hx.h3Index, map, leaflet);
      if (pts.length === 0) continue;
      const centroid = projectedCentroid(pts);
      const fontPx = inspectionStatusIconFontPx({
        productionSurface: surface,
        hasInfraSymbols: deps.hasInfraSymbols(hx.h3Index, unitHexes),
        hasVisibleUnits: unitHexes.has(hx.h3Index),
      });
      drawIconGroup(ctx, deps, {
        centerX: centroid.x,
        centerY: centroid.y - strategicOverlayBandOffsetPx(spanForProjectedHex(pts)),
        fontPx,
        bold: inspectionStatusSlashIsBold(controlledByHuman, getUrbanProductionCapacityForHex(hx.h3Index)),
        tech: icons.tech,
        weather: icons.weather,
      });
    }
  } finally {
    ctx.restore();
  }
}
