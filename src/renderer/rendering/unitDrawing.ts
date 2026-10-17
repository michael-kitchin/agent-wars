import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  COUNT_BADGE_OFFSET,
  MULTI_PLAYER_FILL,
  MULTI_PLAYER_GLYPH_FILTER,
  MULTI_PLAYER_STROKE,
  PLAYER_COLORS,
  SELECTION_RING_COLOR,
  SELECTION_RING_WIDTH,
  STACK_OFFSET_X,
  STACK_OFFSET_Y,
  UNIT_RADIUS,
  UNIT_TYPE_LABELS,
} from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { hexCenterPx } from '../map/mapHelpers';
import { shouldHideStrategicMapUnitsForZoom } from '../map/terrainView';

/**
 * Documents the module-scope binding `TOKEN_ICON_FIT_RATIO` (TOKEN_ICON_FIT_RATIO).

 * Purpose: Supports maintainability by documenting why `TOKEN_ICON_FIT_RATIO` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const TOKEN_ICON_FIT_RATIO = 0.9;
/**
 * Documents the `UnitIconType` type alias (type UnitIconType).

 * Purpose: Supports maintainability by documenting why `UnitIconType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type UnitIconType = 'infantry' | 'armor' | 'naval' | 'air' | 'mixed';
/**
 * Documents the module-scope binding `UNIT_ICON_FILE_BY_TYPE` (UNIT_ICON_FILE_BY_TYPE: Record<UnitIconType, string>).

 * Purpose: Supports maintainability by documenting why `UNIT_ICON_FILE_BY_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const UNIT_ICON_FILE_BY_TYPE: Record<UnitIconType, string> = {
    /**
   * Documents the object literal property `infantry` (infantry: 'infantry.svg').

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 'infantry.svg',
    /**
   * Documents the object literal property `armor` (armor: 'armor.svg').

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 'armor.svg',
    /**
   * Documents the object literal property `naval` (naval: 'naval.svg').

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 'naval.svg',
    /**
   * Documents the object literal property `air` (air: 'air.svg').

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 'air.svg',
    /**
   * Documents the object literal property `mixed` (mixed: 'mixed.svg').

   * Purpose: Supports maintainability by documenting why `mixed` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
mixed: 'mixed.svg',
};
/**
 * Documents the module-scope binding `unitIconCache` (unitIconCache).

 * Purpose: Supports maintainability by documenting why `unitIconCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const unitIconCache = new Map<UnitIconType, HTMLImageElement | null>();

/**
 * Path of the glyph for one unit type.
 *
 * Purpose: The map token and the image loader share one URL.
 * When to use: When starting an icon load.
 * Expected outcome: `units/<file>.svg`, resolved from `static/index.html`, the same way weather icons resolve.
 * Exceptions: None.
 */
function iconPathForType(unitType: UnitIconType): string {
  return `units/${UNIT_ICON_FILE_BY_TYPE[unitType]}`;
}

/**
 * Path of the glyph for a unit type, for page elements that show a unit's type.
 *
 * Purpose: A list row and the map token use the same glyph.
 * When to use: As an `<img>` source in panel markup.
 * Expected outcome: `units/<type>.svg`; a type with no glyph of its own uses the mixed glyph.
 * Exceptions: None.
 */
export function unitIconPathForUnitType(unitType: string): string {
  const known = Object.prototype.hasOwnProperty.call(UNIT_ICON_FILE_BY_TYPE, unitType);
  return iconPathForType(known ? (unitType as UnitIconType) : 'mixed');
}

/**
 * Defines the `getOrStartUnitIconLoad` function shape (function getOrStartUnitIconLoad(unitType: UnitIconType): HTMLImageElement | null).

 * Purpose: Supports maintainability by documenting why `getOrStartUnitIconLoad` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getOrStartUnitIconLoad(unitType: UnitIconType): HTMLImageElement | null {
  if (unitIconCache.has(unitType)) return unitIconCache.get(unitType) ?? null;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    // no-op: presence in cache is enough to render on next frame
  };
  img.onerror = () => {
    unitIconCache.set(unitType, null);
  };
  img.src = iconPathForType(unitType);
  unitIconCache.set(unitType, img);
  return img;
}

/**
 * Defines the `drawUnitSvgIcon` function shape (function drawUnitSvgIcon( ctx: CanvasRenderingContext2D, centerX: number, centerY: number, unitType: UnitIconType, unitPlayer?: string, flipFo).

 * Purpose: Supports maintainability by documenting why `drawUnitSvgIcon` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawUnitSvgIcon(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  unitType: UnitIconType,
  unitPlayer?: string,
  flipForOpponent = true,
  fitScaleMultiplier = 1
): boolean {
  const img = getOrStartUnitIconLoad(unitType);
  if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return false;

  const maxIconSize = UNIT_RADIUS * 2 * TOKEN_ICON_FIT_RATIO * fitScaleMultiplier;
  const iconScale = maxIconSize / Math.max(img.naturalWidth, img.naturalHeight);
  const width = img.naturalWidth * iconScale;
  const height = img.naturalHeight * iconScale;
  const drawX = centerX - width / 2;
  const drawY = centerY - height / 2;
  const shouldFlip = flipForOpponent && unitPlayer === 'opponent';

  ctx.save();
  if (shouldFlip) {
    ctx.translate(centerX, centerY);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
  } else {
    ctx.drawImage(img, drawX, drawY, width, height);
  }
  ctx.restore();
  return true;
}

/**
 * Draws one unit-type glyph at an arbitrary size, without the token circle.
 *
 * Purpose: Lets small overlays such as resolution dice chips show the same unit glyphs as map tokens.
 * When to use: When a caller draws its own background and needs only the glyph. Map tokens keep using
 *   `drawOneUnitMarker`.
 * Expected outcome: Draws the glyph so its longer side is `sizePx`, mirrored for the opponent like map tokens, and
 *   returns true. Returns false without drawing for a type other than infantry, armor, naval, or air, and while the
 *   glyph image is still loading, so the caller can draw a text fallback.
 * Exceptions: None.
 */
export function drawUnitTypeGlyph(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  unitType: string,
  sizePx: number,
  player?: string
): boolean {
  if (unitType !== 'infantry' && unitType !== 'armor' && unitType !== 'naval' && unitType !== 'air') return false;
  const fitScaleMultiplier = sizePx / (UNIT_RADIUS * 2 * TOKEN_ICON_FIT_RATIO);
  return drawUnitSvgIcon(ctx, centerX, centerY, unitType, player, true, fitScaleMultiplier);
}

/**
 * Covers one marker's border with the gold selection ring.
 *
 * Purpose: Replaces the marker's border with the gold ring, in the border's own paint step.
 * When to use: From `drawOneUnitMarker`, in the border's own step, before the glyph. A stack draws its lower marker
 *   first, so the upper marker covers the lower ring where they overlap, the same way it covers the lower border.
 * Expected outcome: A `SELECTION_RING_WIDTH` stroke in `SELECTION_RING_COLOR` on the marker's circle, in the place of
 *   the 2 px border.
 * Exceptions: None.
 */
function drawSelectionRing(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, UNIT_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = SELECTION_RING_COLOR;
  ctx.lineWidth = SELECTION_RING_WIDTH;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws one unit token: fill, border, then glyph.
 *
 * Purpose: Map markers, moving markers, and stale intel share one token.
 * When to use: Pass the side fill and the border color. A selected marker passes `SELECTION_RING_COLOR` so the border
 *   is the gold ring, painted in the border's own step, under the glyph.
 * Expected outcome: A filled circle of `UNIT_RADIUS`. Its border is the passed color, 2 px wide, except the selection
 *   color, which is the wider gold ring. The glyph is drawn after the border, so it covers the border's inner edge
 *   the same way it covers a white border. A mixed-side fill still tints the glyph dark.
 * Exceptions: None.
 */
export function drawOneUnitMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  strokeColor: string = '#fff',
  unitPlayer?: string
): void {
  const stackedNeutral = color === MULTI_PLAYER_FILL;
  ctx.beginPath();
  ctx.arc(x, y, UNIT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (strokeColor === SELECTION_RING_COLOR) {
    drawSelectionRing(ctx, x, y);
  } else {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.save();
  if (stackedNeutral) ctx.filter = MULTI_PLAYER_GLYPH_FILTER;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const drewIcon =
    (label === UNIT_TYPE_LABELS.armor && drawUnitSvgIcon(ctx, x, y, 'armor', unitPlayer)) ||
    (label === UNIT_TYPE_LABELS.infantry && drawUnitSvgIcon(ctx, x, y, 'infantry', unitPlayer)) ||
    (label === UNIT_TYPE_LABELS.air && drawUnitSvgIcon(ctx, x, y, 'air', unitPlayer)) ||
    (label === UNIT_TYPE_LABELS.naval && drawUnitSvgIcon(ctx, x, y, 'naval', unitPlayer)) ||
    (label === '*' && drawUnitSvgIcon(ctx, x, y, 'mixed', unitPlayer, false, 0.5));
  if (!drewIcon) ctx.fillText(label, x, y);
  ctx.restore();
}

/**
 * Draws one marker per hex for the given units, with a second offset marker and a count badge for a stack.
 *
 * Purpose: Units are drawn on the canvas, one token per hex, in both theaters.
 * When to use: From the scene draw, with the strategic units or the battle's sub-units. Pass the ids of units drawn
 *   elsewhere this frame, such as units moving in playback, as `movingUnitIds`.
 * Expected outcome: Each hex gets a marker in its side's color, or the mixed-side fill when both sides are there. A hex
 *   with two or more units gets a second marker offset up and right, and a count badge. Each marker of a hex that
 *   holds a unit in the current selection uses the gold ring as that marker's border, under the glyph. The upper
 *   marker of a stack therefore covers the lower ring where they overlap. Badges are drawn after every marker, so a
 *   badge stays readable over a ring.
 * Exceptions: None.
 */
export function drawUnits(
  ctx: CanvasRenderingContext2D,
  units: GameStateSnapshot['units'],
  movingUnitIds?: Set<string>
): void {
  const byHex = new Map<string, GameStateSnapshot['units']>();
  for (const u of units) {
    if (movingUnitIds?.has(u.id)) continue;
    const list = byHex.get(u.h3Index) ?? [];
    list.push(u);
    byHex.set(u.h3Index, list);
  }
  const selectedUnitIds = new Set(S.selectedUnitIds);
  const tokens = [...byHex].map(([h3Index, hexUnits]) => {
    const { x, y } = hexCenterPx(h3Index);
    const count = hexUnits.length;
    return {
      x,
      y,
      count,
      top: count > 1 ? { x: x + STACK_OFFSET_X, y: y + STACK_OFFSET_Y } : { x, y },
      selected: hexUnits.some((u) => selectedUnitIds.has(u.id)),
      units: hexUnits,
    };
  });

  for (const { x, y, count, top, selected, units: hexUnits } of tokens) {
    const types = new Set(hexUnits.map((u) => u.unitType));
    const players = new Set(hexUnits.map((u) => u.player));
    const mixedType = types.size > 1;
    const multiPlayer = players.size > 1;
    const fillColor = multiPlayer ? MULTI_PLAYER_FILL : (PLAYER_COLORS[hexUnits[0]!.player] ?? '#333');
    const strokeColor = multiPlayer ? MULTI_PLAYER_STROKE : '#fff';
    const label = mixedType ? '*' : (UNIT_TYPE_LABELS[hexUnits[0]!.unitType] ?? '?');
    const markerStroke = selected ? SELECTION_RING_COLOR : strokeColor;
    drawOneUnitMarker(ctx, x, y, fillColor, label, markerStroke, hexUnits[0]!.player);
    if (count > 1) {
      drawOneUnitMarker(ctx, top.x, top.y, fillColor, label, markerStroke, hexUnits[0]!.player);
    }
  }
  for (const { x, y, count } of tokens) {
    if (count < 2) continue;
    const badgeX = x + COUNT_BADGE_OFFSET;
    const badgeY = y - COUNT_BADGE_OFFSET;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeText(String(count), badgeX, badgeY);
    ctx.fillStyle = '#000';
    ctx.fillText(String(count), badgeX, badgeY);
  }
}

/**
 * Defines the `drawStaleEnemyIntel` function shape (export function drawStaleEnemyIntel( ctx: CanvasRenderingContext2D, state: GameStateSnapshot, inferUnitTypeLabelFromId: (unitId: string) => string ):).

 * Purpose: Supports maintainability by documenting why `drawStaleEnemyIntel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawStaleEnemyIntel(
  ctx: CanvasRenderingContext2D,
  state: GameStateSnapshot,
  inferUnitTypeLabelFromId: (unitId: string) => string
): void {
  const hasFogData = Array.isArray(state.visibleHexes);
  const currentlyVisibleEnemies = state.units.filter((u) => u.player !== 'human');
  const currentlyVisibleEnemyIds = new Set(currentlyVisibleEnemies.map((u) => u.id));
  for (const [unitId, prevSeen] of S.lastRenderedVisibleEnemyByUnitId) {
    if (currentlyVisibleEnemyIds.has(unitId)) continue;
    if (!S.clientStaleEnemyIntelByUnitId.has(unitId)) {
      const lastSeenTurn = Math.min(prevSeen.lastSeenTurn, Math.max(1, state.turnNumber - 1));
      S.clientStaleEnemyIntelByUnitId.set(unitId, {
        unitId,
        lastKnownH3Index: prevSeen.h3Index,
        lastSeenTurn,
        staleUntilTurn: lastSeenTurn + 2,
      });
    }
  }
  S.lastRenderedVisibleEnemyByUnitId.clear();
  for (const enemy of currentlyVisibleEnemies) {
    S.lastRenderedVisibleEnemyByUnitId.set(enemy.id, {
      h3Index: enemy.h3Index,
      lastSeenTurn: state.turnNumber,
    });
  }

  if (shouldHideStrategicMapUnitsForZoom()) return;

  if (!hasFogData) return;

  const persistedIntel = Array.isArray(state.enemyIntel) ? state.enemyIntel : [];
  const fallbackIntel = Array.from(S.clientStaleEnemyIntelByUnitId.values()).map((row) => ({
    unitId: row.unitId,
    lastKnownH3Index: row.lastKnownH3Index,
    intelState: 'stale' as const,
    lastSeenTurn: row.lastSeenTurn,
    staleUntilTurn: row.staleUntilTurn,
  }));
  const byUnitId = new Map<string, (typeof fallbackIntel)[number]>();
  for (const row of fallbackIntel) byUnitId.set(row.unitId, row);
  for (const row of persistedIntel) {
    if (row.intelState !== 'stale') continue;
    byUnitId.set(row.unitId, {
      unitId: row.unitId,
      lastKnownH3Index: row.lastKnownH3Index,
      intelState: 'stale',
      lastSeenTurn: row.lastSeenTurn,
      staleUntilTurn: row.staleUntilTurn,
    });
  }
  const intel = Array.from(byUnitId.values());
  if (intel.length === 0) return;
  const visibleHexes = new Set(state.visibleHexes!);
  const stale = intel.filter((row) => row.intelState === 'stale');
  if (stale.length === 0) return;
  const visibleEnemyHexes = new Set(currentlyVisibleEnemies.map((u) => u.h3Index));
  const staleByHex = new Map<string, typeof stale>();
  for (const row of stale) {
    if (visibleEnemyHexes.has(row.lastKnownH3Index)) continue;
    if (visibleHexes.has(row.lastKnownH3Index)) continue;
    const list = staleByHex.get(row.lastKnownH3Index) ?? [];
    list.push(row);
    staleByHex.set(row.lastKnownH3Index, list);
  }

  for (const [h3Index, rows] of staleByHex) {
    const age = Math.max(0, state.turnNumber - rows[0]!.lastSeenTurn);
    const alpha = age === 1 ? 0.5 : age === 2 ? 0.3 : 0;
    if (alpha <= 0) continue;
    const types = new Set(rows.map((r) => inferUnitTypeLabelFromId(r.unitId)));
    const label = types.size === 1 ? [...types][0]! : '*';
    const { x, y } = hexCenterPx(h3Index);
    ctx.save();
    ctx.globalAlpha = alpha;
    drawOneUnitMarker(ctx, x, y, PLAYER_COLORS.opponent, label, '#fff', 'opponent');
    ctx.restore();
  }
}

/**
 * Defines the `drawUnknownBattleMarkers` function shape (export function drawUnknownBattleMarkers().

 * Purpose: Supports maintainability by documenting why `drawUnknownBattleMarkers` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawUnknownBattleMarkers(
  ctx: CanvasRenderingContext2D,
  hexes: string[],
  opacity: number
): void {
  if (hexes.length === 0 || opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  for (const h3Index of hexes) {
    const { x, y } = hexCenterPx(h3Index);
    drawOneUnitMarker(ctx, x, y, '#7a7a7a', '?', '#202020');
  }
  ctx.restore();
}
