import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { TACTICAL_ENTRY_HIT_PAD_PX } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { computeRes1OverlayTextY } from '../rendering/terrainRendering';
import { getLeafletGlobal, hexCenterPx } from './mapUtils';
import { shouldShowBuildEntryZoom } from './terrainView';
import { getMainLeafletMap } from './worldLeafletMap';

/**
 * Hides the tactical-entry overlay and optionally clears its HTML.
 */
export function hideTacticalEntryLayer(layer: HTMLElement, clearHtml = true): void {
  layer.classList.add('hidden');
  layer.setAttribute('aria-hidden', 'true');
  if (clearHtml) {
    layer.innerHTML = '';
  }
  S.tacticalEntryButtonPointerInside = false;
  S.lastTacticalEntryLayerKey = null;
}

/**
 * Returns true when both human and opponent parent units share the same res1 hex.
 *
 * Purpose: Detects tactical-entry eligibility independent of fog-of-war exploration filters.
 * When to use: While building tactical magnifier buttons for explored strategic hexes.
 * Expected outcome: True only when at least one human and one opponent unit occupy `h3Index`.
 * Exceptions: None.
 */
function isContestedRes1Hex(state: GameStateSnapshot, h3Index: string): boolean {
  const here = state.units.filter((u) => u.h3Index === h3Index);
  return here.some((u) => u.player === 'human') && here.some((u) => u.player === 'opponent');
}

/**
 * Synchronizes tactical-entry magnifying-glass buttons for contested res1 hexes during strategic planning.
 *
 * Vertical placement: same horizontal center as the hex; `top` is `center.y + (textY - center.y)` so the icon sits
 * **below** the hex midpoint by the same distance overlay text sits below it (previously `2 * center.y - textY` mirrored above).
 *
 * Magnifiers are hidden outside strategic planning (`phase !== 'planning'`) or while the renderer already holds a tactical battle (`S.tacticalBattleSnapshot`).
 */
export function syncTacticalEntryButton(deps: {
  isHexExploredByPlayer: (h3: string) => boolean;
  hasRes1OverlayOffsetFeatures: (h3Index: string, visibleUnitHexes: Set<string>) => boolean;
}): void {
  const layer = document.getElementById('tactical-entry-layer');
  if (!layer || !S.gameState) {
    if (layer) hideTacticalEntryLayer(layer, false);
    return;
  }
  if (S.gameState.phase !== 'planning' || S.tacticalBattleSnapshot) {
    hideTacticalEntryLayer(layer);
    return;
  }
  if (!shouldShowBuildEntryZoom()) {
    hideTacticalEntryLayer(layer);
    return;
  }
  const map = getMainLeafletMap() as
    | {
        latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
      }
    | null;
  const L = getLeafletGlobal();
  if (!map || !L) {
    hideTacticalEntryLayer(layer);
    return;
  }
  const visibleUnitHexes = new Set(S.gameState.units.map((u) => u.h3Index));
  const rows: Array<{ h3: string; left: number; top: number }> = [];
  for (const hx of S.gameState.hexes) {
    if (!deps.isHexExploredByPlayer(hx.h3Index)) continue;
    if (!isContestedRes1Hex(S.gameState, hx.h3Index)) continue;
    const center = hexCenterPx(hx.h3Index);
    const hasOffset = deps.hasRes1OverlayOffsetFeatures(hx.h3Index, visibleUnitHexes) || visibleUnitHexes.has(hx.h3Index);
    const textY = computeRes1OverlayTextY(hx.h3Index, map, L, hasOffset);
    const offsetFromCenterToOverlayText = textY - center.y;
    const magnifyTop = Math.round(center.y + offsetFromCenterToOverlayText);
    rows.push({ h3: hx.h3Index, left: Math.round(center.x), top: magnifyTop });
  }
  if (rows.length === 0) {
    hideTacticalEntryLayer(layer);
    return;
  }
  rows.sort((a, b) => a.h3.localeCompare(b.h3));
  const layerKey = rows.map((r) => `${r.h3}|${r.left}|${r.top}`).join(';');
  if (layerKey !== S.lastTacticalEntryLayerKey) {
    const html = rows
      .map(
        (r) =>
          `<button type="button" class="tactical-entry-btn" data-h3-index="${r.h3}" style="left:${r.left}px;top:${r.top}px;transform:translate(-50%, -50%);" title="Tactical battle" aria-label="Start tactical battle in ${r.h3}">&#128269;</button>`
      )
      .join('');
    layer.innerHTML = html;
    S.lastTacticalEntryLayerKey = layerKey;
  }
  layer.classList.remove('hidden');
  layer.setAttribute('aria-hidden', 'false');
}

/**
 * Handles clicks on tactical-entry buttons; returns true when a click was consumed.
 */
export async function tryHandleTacticalEntryAtClientXY(
  clientX: number,
  clientY: number,
  onStart: (h3: string) => Promise<void>
): Promise<boolean> {
  const layer = document.getElementById('tactical-entry-layer');
  if (!layer || layer.classList.contains('hidden')) return false;
  const buttons = Array.from(layer.querySelectorAll<HTMLButtonElement>('.tactical-entry-btn'));
  const pad = TACTICAL_ENTRY_HIT_PAD_PX;
  for (const btn of buttons) {
    const r = btn.getBoundingClientRect();
    if (clientX < r.left - pad || clientX > r.right + pad || clientY < r.top - pad || clientY > r.bottom + pad) continue;
    const h3 = btn.dataset.h3Index;
    if (!h3) continue;
    await onStart(h3);
    return true;
  }
  return false;
}
