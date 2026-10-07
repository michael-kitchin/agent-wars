/**
 * Combat and destruction marks for resolution playback.
 *
 * Purpose: Air, ranged, and melee windows show the combat bolt and the destruction mark from `static/resolution`.
 * When to use: `drawResolutionCombatAndCasualtyOverlays` passes the pulse opacity for the active window.
 * Expected outcome: One mark per hex, centered, fading with that opacity. Unknown-battle hexes are not passed here.
 * Exceptions: A missing image draws nothing for that mark and does not throw. The other playback layers still draw.
 */

import { hexCenterPx } from '../map/mapHelpers';

/**
 * Combat bolt file, relative to `static/index.html`.
 *
 * Purpose: Playback loads the bolt from `static/resolution`, next to the other map assets.
 * When to use: The lightning image load.
 * Expected outcome: `resolution/lightning_bolt.svg`.
 * Exceptions: None.
 */
const COMBAT_LIGHTNING_SRC = 'resolution/lightning_bolt.svg';

/**
 * Destruction mark file, relative to `static/index.html`.
 *
 * Purpose: Playback loads the destruction mark from `static/resolution`, next to the other map assets.
 * When to use: The destruction image load.
 * Expected outcome: `resolution/x_destroyed.svg`.
 * Exceptions: None.
 */
const DESTRUCTION_MARK_SRC = 'resolution/x_destroyed.svg';

/**
 * On-screen side of the combat bolt, in CSS pixels.
 *
 * Purpose: The bolt spans 20 of the 24 viewBox units, so 44px keeps it about as tall as a unit token.
 * When to use: `drawCombatLightning`.
 * Expected outcome: A square centered on the hex.
 * Exceptions: None.
 */
const COMBAT_LIGHTNING_PX = 44;

/**
 * On-screen side of the destruction mark, in CSS pixels.
 *
 * Purpose: The mark spans about 19 of the 24 viewBox units, so 52px keeps it a little larger than the bolt.
 * When to use: `drawCasualtyOverlay`.
 * Expected outcome: A square centered on the hex.
 * Exceptions: None.
 */
const DESTRUCTION_MARK_PX = 52;

/**
 * Starts a load of one resolution symbol.
 *
 * Purpose: The files declare a large pixel size with a 24-unit viewBox, so the browser rasterizes them sharply and playback draws them smaller.
 * When to use: Once per symbol, when this module is evaluated. That is well before the first resolution frame.
 * Expected outcome: An image element. It can be drawn after `complete` and `naturalWidth` are set.
 * Exceptions: Does not throw. A missing file never becomes drawable.
 */
function startResolutionSymbolLoad(src: string): HTMLImageElement {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

/**
 * Combat and destruction images for the life of the page.
 *
 * Purpose: One load each, shared by every hex drawn during playback.
 * When to use: The two draw functions.
 * Expected outcome: Both loads are in flight before the first resolution frame.
 * Exceptions: None.
 */
const resolutionSymbolImage = {
  lightning: startResolutionSymbolLoad(COMBAT_LIGHTNING_SRC),
  destroyed: startResolutionSymbolLoad(DESTRUCTION_MARK_SRC),
} as const;

/**
 * Draws one symbol on each hex at the pulse opacity.
 *
 * Purpose: Combat and destruction share placement, the opacity pulse, and the skip while an image is still loading.
 * When to use: From `drawCombatLightning` and `drawCasualtyOverlay`.
 * Expected outcome: Nothing when `hexes` is empty, `opacity` is not positive, or the image is not ready. Otherwise each hex gets one centered square, and canvas smoothing is restored afterward.
 * Exceptions: None.
 */
function drawSymbolsOnHexes(
  ctx: CanvasRenderingContext2D,
  hexes: readonly string[],
  opacity: number,
  img: HTMLImageElement,
  sizePx: number
): void {
  if (hexes.length === 0 || opacity <= 0) return;
  if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
  const half = sizePx / 2;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const h3Index of hexes) {
    const { x, y } = hexCenterPx(h3Index);
    ctx.drawImage(img, x - half, y - half, sizePx, sizePx);
  }
  ctx.restore();
}

/**
 * Draws the combat bolt on each hex.
 *
 * Purpose: Air, ranged, and melee playback mark the hexes where combat happened.
 * When to use: While a lightning window is active. Pass the pulse opacity from that window.
 * Expected outcome: One bolt per hex at `opacity`. An empty list or a non-positive opacity draws nothing.
 * Exceptions: None. A bolt that has not loaded yet leaves that frame blank.
 */
export function drawCombatLightning(
  ctx: CanvasRenderingContext2D,
  combatHexes: readonly string[],
  opacity: number
): void {
  drawSymbolsOnHexes(ctx, combatHexes, opacity, resolutionSymbolImage.lightning, COMBAT_LIGHTNING_PX);
}

/**
 * Draws the destruction mark on each hex.
 *
 * Purpose: Casualty windows mark hexes where a unit was removed.
 * When to use: While a casualty window is active. Pass the pulse opacity from that window.
 * Expected outcome: One mark per hex at `opacity`. An empty list or a non-positive opacity draws nothing.
 * Exceptions: None. A mark that has not loaded yet leaves that frame blank.
 */
export function drawCasualtyOverlay(
  ctx: CanvasRenderingContext2D,
  casualtyHexes: readonly string[],
  opacity: number
): void {
  drawSymbolsOnHexes(ctx, casualtyHexes, opacity, resolutionSymbolImage.destroyed, DESTRUCTION_MARK_PX);
}
