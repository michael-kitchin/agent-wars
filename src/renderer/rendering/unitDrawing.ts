import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { CASUALTY_X_COLOR, COUNT_BADGE_OFFSET, LIGHTNING_COLOR, MULTI_PLAYER_FILL, MULTI_PLAYER_STROKE, PLAYER_COLORS, STACK_OFFSET_X, STACK_OFFSET_Y, UNIT_RADIUS, UNIT_TYPE_LABELS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { hexCenterPx } from '../map/mapUtils';

const TOKEN_ICON_FIT_RATIO = 0.9;
type UnitIconType = 'infantry' | 'armor' | 'naval' | 'air' | 'mixed';
const UNIT_ICON_FILE_BY_TYPE: Record<UnitIconType, string> = {
  infantry: 'infantry-1.svg',
  armor: 'armor-1.svg',
  naval: 'naval-1.svg',
  air: 'air-1.svg',
  mixed: 'mixed-1.svg',
};
const unitIconCache = new Map<UnitIconType, HTMLImageElement | null>();

function iconPathForType(unitType: UnitIconType): string {
  return `../symbols/${UNIT_ICON_FILE_BY_TYPE[unitType]}`;
}

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

export function drawOneUnitMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  strokeColor: string = '#fff',
  unitPlayer?: string
): void {
  ctx.beginPath();
  ctx.arc(x, y, UNIT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (label === UNIT_TYPE_LABELS.armor && drawUnitSvgIcon(ctx, x, y, 'armor', unitPlayer)) {
    return;
  }
  if (label === UNIT_TYPE_LABELS.infantry && drawUnitSvgIcon(ctx, x, y, 'infantry', unitPlayer)) {
    return;
  }
  if (label === UNIT_TYPE_LABELS.air && drawUnitSvgIcon(ctx, x, y, 'air', unitPlayer)) {
    return;
  }
  if (label === UNIT_TYPE_LABELS.naval && drawUnitSvgIcon(ctx, x, y, 'naval', unitPlayer)) {
    return;
  }
  if (label === '*' && drawUnitSvgIcon(ctx, x, y, 'mixed', unitPlayer, false, 0.5)) {
    return;
  }
  ctx.fillText(label, x, y);
}

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
