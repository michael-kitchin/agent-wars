import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { CASUALTY_X_COLOR, COUNT_BADGE_OFFSET, LIGHTNING_COLOR, MULTI_PLAYER_FILL, MULTI_PLAYER_GLYPH_FILTER, MULTI_PLAYER_STROKE, PLAYER_COLORS, STACK_OFFSET_X, STACK_OFFSET_Y, UNIT_RADIUS, UNIT_TYPE_LABELS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { hexCenterPx } from '../map/mapHelpers';
import { shouldHideStrategicMapUnitsForRes4Zoom } from '../map/terrainView';

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
 * Defines the `drawOneUnitMarker` function shape (export function drawOneUnitMarker( ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string, strokeColor: string = '#).

 * Purpose: Supports maintainability by documenting why `drawOneUnitMarker` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
  ctx.strokeStyle = stackedNeutral ? MULTI_PLAYER_STROKE : strokeColor;
  ctx.lineWidth = 2;
  ctx.stroke();
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
 * Defines the `drawUnits` function shape (export function drawUnits().

 * Purpose: Supports maintainability by documenting why `drawUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
  for (const [h3Index, hexUnits] of byHex) {
    const { x, y } = hexCenterPx(h3Index);
    const count = hexUnits.length;
    const types = new Set(hexUnits.map((u) => u.unitType));
    const players = new Set(hexUnits.map((u) => u.player));
    const mixedType = types.size > 1;
    const multiPlayer = players.size > 1;
    const fillColor = multiPlayer ? MULTI_PLAYER_FILL : (PLAYER_COLORS[hexUnits[0]!.player] ?? '#333');
    const strokeColor = multiPlayer ? MULTI_PLAYER_STROKE : '#fff';
    const label = mixedType ? '*' : (UNIT_TYPE_LABELS[hexUnits[0]!.unitType] ?? '?');

    drawOneUnitMarker(ctx, x, y, fillColor, label, strokeColor, hexUnits[0]!.player);
    if (count > 1) {
      drawOneUnitMarker(ctx, x + STACK_OFFSET_X, y + STACK_OFFSET_Y, fillColor, label, strokeColor, hexUnits[0]!.player);
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

  if (shouldHideStrategicMapUnitsForRes4Zoom()) return;

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

/**
 * Defines the `drawCombatLightning` function shape (export function drawCombatLightning( ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, combatHexes: string[], hexList: st).

 * Purpose: Supports maintainability by documenting why `drawCombatLightning` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawCombatLightning(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  combatHexes: string[],
  hexList: string[],
  opacity: number
): void {
  if (combatHexes.length === 0 || opacity <= 0) return;
  void canvasWidth;
  void canvasHeight;
  void hexList;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const h = 18;
  for (const h3Index of combatHexes) {
    const { x, y } = hexCenterPx(h3Index);
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + 6, y - 4);
    ctx.lineTo(x - 4, y + 6);
    ctx.lineTo(x + 5, y + h);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = LIGHTNING_COLOR;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Defines the `drawCasualtyOverlay` function shape (export function drawCasualtyOverlay( ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, casualtyHexes: string[], hexList:).

 * Purpose: Supports maintainability by documenting why `drawCasualtyOverlay` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawCasualtyOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  casualtyHexes: string[],
  hexList: string[],
  opacity: number
): void {
  if (casualtyHexes.length === 0 || opacity <= 0) return;
  void canvasWidth;
  void canvasHeight;
  void hexList;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  const size = 20;
  for (const h3Index of casualtyHexes) {
    const { x, y } = hexCenterPx(h3Index);
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = CASUALTY_X_COLOR;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();
}
