/**
 * Renderer process entry point. Leaflet world basemap + overlay canvas (terrain, units, orders),
 * minimap with viewport sync, and click / double-click interaction with the sidebar.
 */

import { cellToChildren, cellToLatLng, cellToParent, gridDistance, latLngToCell } from 'h3-js';
import {
  alignLngToReference,
  clampLatForWebMercatorDisplay,
  getHexBoundaryLatLngForLeafletOverlay,
} from './hexGrid';
import {
  initWorldLeafletMaps,
  getMainLeafletMap,
  hexCenterToOverlayPoint,
  hexCenterToOverlayPointWithReferenceLng,
  invalidateLeafletMapSizes,
  setMainBasemapByProviderId,
  setMainBasemapFilter,
} from './worldLeafletMap';
import {
  fillHexTerrain,
  getActiveHexStrokeStyle,
  getActiveTerrainStyleBasemapId,
  renderTerrainLegend,
} from './terrainVisualStyles';
import {
  drawTerrainInfrastructureGlyphs,
  RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE,
} from './terrainInfrastructureOverlay';
import type {
  GameStateSnapshot,
  GameApi,
  MovementOrder,
  RangedAttackOrder,
  RemovedUnitSnapshot,
  HumanOrderPreviewResult,
  HumanStandingOrderSnapshot,
} from '../shared/ipcTypes';

/** One executed move (human or AI) for resolution-phase fade animation. */
interface ResolutionMove {
  unitId: string;
  fromH3Index: string;
  toH3Index: string;
}

interface HoverRoutePreviewState {
  unitId: string;
  hoveredH3Index: string;
  data: HumanOrderPreviewResult;
}

/** Ranged range in hexes by unit type (0 = melee only). Matches combat spec. */
const RANGED_RANGE: Record<string, number> = {
  infantry: 0,
  armor: 1,
  naval: 2,
};

declare global {
  interface Window {
    gameApi?: GameApi;
  }
}

/** Map background (style guide: neutral, recedes). */
const BACKGROUND_COLOR = '#e0dcd4';

const UNIT_RADIUS = 20;
/** Player accents (style guide: P1 #2e5a7b, P2 #7b4a2e). */
const PLAYER_COLORS: Record<string, string> = {
  human: '#2e5a7b',
  opponent: '#7b4a2e',
};
const UNIT_TYPE_LABELS: Record<string, string> = {
  infantry: 'I',
  armor: 'A',
  naval: 'N',
};

const ORDER_LINE_COLOR = '#2e5a7b';
const ORDER_LINE_WIDTH = 2.5;
const ORDER_ARROW_SIZE = 10;
/** AI movement arrow (opponent accent). */
const AI_ORDER_LINE_COLOR = '#7b4a2e';
const RESOLUTION_FADE_MS = 1000;
/** Combat (lightning) and casualty (red X) phases each use this duration; they run before movement. */
const LIGHTNING_DURATION_MS = 1000;

/** 5-phase resolution: ranged lightning → ranged casualty → movement → melee lightning → melee casualty. */
function getResolutionPhase5(
  elapsed: number,
  hasRangedCombat: boolean,
  hasRangedCasualties: boolean,
  hasMeleeCombat: boolean,
  hasMeleeCasualties: boolean
): {
  movementStart: number;
  totalMs: number;
  moveProgress: number;
  inRangedLightning: boolean;
  inRangedCasualty: boolean;
  inMeleeLightning: boolean;
  inMeleeCasualty: boolean;
  inMovement: boolean;
} {
  const L = LIGHTNING_DURATION_MS;
  const rangedLightningEnd = hasRangedCombat ? L : 0;
  const rangedCasualtyEnd = rangedLightningEnd + (hasRangedCasualties ? L : 0);
  const movementStart = rangedCasualtyEnd;
  const movementEnd = movementStart + RESOLUTION_FADE_MS;
  const meleeLightningEnd = movementEnd + (hasMeleeCombat ? L : 0);
  const meleeCasualtyEnd = meleeLightningEnd + (hasMeleeCasualties ? L : 0);
  const totalMs = meleeCasualtyEnd;
  const moveProgress =
    elapsed < movementStart ? 0 : elapsed >= movementEnd ? 1 : (elapsed - movementStart) / RESOLUTION_FADE_MS;
  return {
    movementStart,
    totalMs,
    moveProgress,
    inRangedLightning: hasRangedCombat && elapsed < rangedLightningEnd,
    inRangedCasualty: hasRangedCasualties && elapsed >= rangedLightningEnd && elapsed < rangedCasualtyEnd,
    inMovement: elapsed >= movementStart && elapsed < movementEnd,
    inMeleeLightning: hasMeleeCombat && elapsed >= movementEnd && elapsed < meleeLightningEnd,
    inMeleeCasualty: hasMeleeCasualties && elapsed >= meleeLightningEnd && elapsed < meleeCasualtyEnd,
  };
}

function getUnitAtHex(h3Index: string): GameStateSnapshot['units'][0] | null {
  if (!gameState) return null;
  return gameState.units.find((u) => u.h3Index === h3Index) ?? null;
}

/** Returns all units at the given hex. */
function getUnitsAtHex(h3Index: string): GameStateSnapshot['units'] {
  if (!gameState) return [];
  return gameState.units.filter((u) => u.h3Index === h3Index);
}

/** Builds stack tooltip text: counts by player and unit type (e.g. "2 human armor, 1 opponent infantry"). */
function formatStackTooltip(units: GameStateSnapshot['units']): string {
  const byKey = new Map<string, number>();
  for (const u of units) {
    const key = `${u.player} ${u.unitType}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  return Array.from(byKey.entries())
    .map(([key, n]) => `${n} ${key}`)
    .sort()
    .join(', ');
}

/** Hides the stack callout popover (e.g. after selecting a unit or clicking elsewhere). */
function hideStackCallout(): void {
  const el = document.getElementById('stack-callout');
  if (el) el.classList.add('hidden');
}

/**
 * Shows the stack callout at the given screen position with an alphabetized list of units.
 * Units belonging to the human player get a "Select" button to select that unit for movement or ranged fire.
 */
function showStackCallout(
  units: GameStateSnapshot['units'],
  clientX: number,
  clientY: number
): void {
  const calloutEl = document.getElementById('stack-callout');
  const listEl = document.getElementById('stack-callout-list');
  if (!calloutEl || !listEl) return;
  clearTerrainTooltipTimer();
  hideTerrainTooltipVisual();

  const sorted = [...units].sort(
    (a, b) =>
      `${a.player} ${a.unitType} ${a.id}`.localeCompare(`${b.player} ${b.unitType} ${b.id}`)
  );

  listEl.innerHTML = '';
  for (const u of sorted) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'unit-label';
    label.textContent = u.id;
    li.appendChild(label);
    if (u.player === 'human') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'unit-select';
      btn.textContent = 'Select';
      btn.addEventListener('click', () => {
        selectUnitOnMap(u.id);
        hideStackCallout();
        updateSidebar();
        updateRangedSidebar();
        redraw();
      });
      li.appendChild(btn);
    }
    listEl.appendChild(li);
  }

  calloutEl.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  calloutEl.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
  calloutEl.setAttribute('aria-label', formatStackTooltip(units));
  calloutEl.classList.remove('hidden');
}

const TOOLTIP_OFFSET_PX = 12;

/** Dwell time on the same hex before showing the terrain type tooltip (pointer may move within the hex). */
const TERRAIN_TOOLTIP_DELAY_MS = 750;

/** World map H3 resolution; must match main process mapData and terrain CSV. */
const WORLD_H3_RESOLUTION = 1;
const DETAIL_H3_RESOLUTION = 4;
const RES4_SHOW_THRESHOLD_VIEW_FRACTION = 0.8;
const RES4_HIDE_THRESHOLD_VIEW_FRACTION = 0.7;

let lastPointerClientX = 0;
let lastPointerClientY = 0;
let terrainTooltipDelayTimer: ReturnType<typeof setTimeout> | null = null;

function clearTerrainTooltipTimer(): void {
  if (terrainTooltipDelayTimer !== null) {
    clearTimeout(terrainTooltipDelayTimer);
    terrainTooltipDelayTimer = null;
  }
}

function hideTerrainTooltipVisual(): void {
  terrainTooltipRequestSeq++;
  const el = document.getElementById('hex-tooltip');
  if (el) {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Formats a pipeline terrain kind for display (e.g. `forest` → "Forest").
 */
function formatTerrainKindLabel(kind: string): string {
  if (!kind) return 'Unknown';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * Resolves base terrain kind + urban variation state for a res-1 gameplay hex.
 */
function terrainStateForRes1Hex(h3: string): { terrainKind: string; isUrban: boolean } {
  if (!gameState) return { terrainKind: 'Unknown', isUrban: false };
  const hx = gameState.hexes.find((h) => h.h3Index === h3);
  if (!hx) return { terrainKind: 'Unknown', isUrban: false };
  return {
    terrainKind:
    hx.terrainKind ??
    (hx.terrain === 'water' ? 'water' : hx.terrain === 'coastal' ? 'coastal' : 'plains'),
    isUrban: false,
  };
}

function terrainKindForRes1Hex(h3: string): string {
  return terrainStateForRes1Hex(h3).terrainKind;
}

function featureLabelsForRes1Hex(h3: string): string[] {
  if (!infraGlyphsAllowedForRes1Hex(h3)) return [];
  const labels: string[] = [];
  if (terrainInfraRes1Airport.has(h3)) labels.push('Airports');
  if (terrainInfraRes1Port.has(h3)) labels.push('Ports');
  return labels;
}

function featureLabelsForRes4Child(parentH3: string, childH3: string): string[] {
  if (!infraGlyphsAllowedForRes4Child(parentH3, childH3)) return [];
  const labels: string[] = [];
  if (terrainInfraRes4Airport.has(childH3)) labels.push('Airport');
  if (terrainInfraRes4Port.has(childH3)) labels.push('Port');
  return labels;
}

interface TerrainTooltipState {
  terrainKind: string;
  isUrban: boolean;
  features: string[];
}

interface NamingLookupTarget {
  h3Index: string;
  resolution: 1 | 4;
}

function terrainStateForPointer(
  clientX: number,
  clientY: number,
  fallbackRes1H3: string | null
): TerrainTooltipState {
  if (!gameState) return { terrainKind: 'Unknown', isUrban: false, features: [] };
  const res4On = shouldRenderRes4Hexes();
  if (!res4On) {
    if (!fallbackRes1H3) return { terrainKind: 'Unknown', isUrban: false, features: [] };
    const state = terrainStateForRes1Hex(fallbackRes1H3);
    return { ...state, features: featureLabelsForRes1Hex(fallbackRes1H3) };
  }
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
      }
    | null;
  if (!map) {
    if (!fallbackRes1H3) return { terrainKind: 'Unknown', isUrban: false, features: [] };
    const state = terrainStateForRes1Hex(fallbackRes1H3);
    return { ...state, features: featureLabelsForRes1Hex(fallbackRes1H3) };
  }
  const L = getLeafletGlobal();
  const rect = map.getContainer().getBoundingClientRect();
  const latlng = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
  try {
    const detailH3 = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
    const parentH3 = cellToParent(detailH3, WORLD_H3_RESOLUTION);
    const parentKind = terrainKindForRes1Hex(parentH3);
    const detail = res4TerrainOverridesByH3.get(detailH3);
    return {
      terrainKind: detail?.terrainKind ?? parentKind,
      isUrban: detail?.isUrban ?? false,
      features: featureLabelsForRes4Child(parentH3, detailH3),
    };
  } catch {
    if (!fallbackRes1H3) return { terrainKind: 'Unknown', isUrban: false, features: [] };
    const state = terrainStateForRes1Hex(fallbackRes1H3);
    return { ...state, features: featureLabelsForRes1Hex(fallbackRes1H3) };
  }
}

function namingLookupTargetForPointer(
  clientX: number,
  clientY: number,
  fallbackRes1H3: string | null
): NamingLookupTarget | null {
  const res4On = shouldRenderRes4Hexes();
  if (!res4On) {
    if (!fallbackRes1H3) return null;
    return { h3Index: fallbackRes1H3, resolution: 1 };
  }
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
      }
    | null;
  if (!map) {
    if (!fallbackRes1H3) return null;
    return { h3Index: fallbackRes1H3, resolution: 1 };
  }
  const L = getLeafletGlobal();
  const rect = map.getContainer().getBoundingClientRect();
  const latlng = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
  try {
    const detailH3 = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
    return { h3Index: detailH3, resolution: 4 };
  } catch {
    if (!fallbackRes1H3) return null;
    return { h3Index: fallbackRes1H3, resolution: 1 };
  }
}

const namingLineByLookupKey = new Map<string, string | null>();
let terrainTooltipRequestSeq = 0;

function namingLookupKey(target: NamingLookupTarget | null): string | null {
  if (!target) return null;
  return `${target.resolution}:${target.h3Index}`;
}

async function getCachedNamingLineForTarget(target: NamingLookupTarget | null): Promise<string | null> {
  const key = namingLookupKey(target);
  if (!key || !target) return null;
  if (namingLineByLookupKey.has(key)) return namingLineByLookupKey.get(key) ?? null;
  if (!window.gameApi?.getHexNamingTooltipLine) return null;
  try {
    const line = await window.gameApi.getHexNamingTooltipLine(target);
    namingLineByLookupKey.set(key, line ?? null);
    return line ?? null;
  } catch (err) {
    console.error('getHexNamingTooltipLine failed:', err);
    namingLineByLookupKey.set(key, null);
    return null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTerrainTooltipHtml(state: TerrainTooltipState, namingLine: string | null): string {
  const terrainLabel = formatTerrainKindLabel(state.terrainKind);
  const terrainLine = state.isUrban ? `<strong>Terrain:</strong> ${terrainLabel}, Urban` : `<strong>Terrain:</strong> ${terrainLabel}`;
  const bodyLine =
    state.features.length === 0 ? terrainLine : `${terrainLine}<br/><strong>Features:</strong> ${state.features.join(', ')}`;
  if (!namingLine) return bodyLine;
  return `<strong>${escapeHtml(namingLine)}</strong><br/>${bodyLine}`;
}

async function showTerrainTooltip(
  clientX: number,
  clientY: number,
  state: TerrainTooltipState,
  namingTarget: NamingLookupTarget | null
): Promise<void> {
  const requestSeq = ++terrainTooltipRequestSeq;
  const namingLine = await getCachedNamingLineForTarget(namingTarget);
  if (requestSeq !== terrainTooltipRequestSeq) return;
  const el = document.getElementById('hex-tooltip');
  if (!el) return;
  el.innerHTML = formatTerrainTooltipHtml(state, namingLine);
  el.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  el.setAttribute('role', 'tooltip');
}

let selectedHexIndex: string | null = null;
/** H3 index of the hex under the pointer for hover-only terrain fill; null when not over the map or a map hex. */
let hoveredHexH3: string | null = null;
/** H3 index of the res-4 child under pointer while detail mode is active; null otherwise. */
let hoveredDetailHexH3: string | null = null;
/** While held, invert default res1/res4 fill behavior for visual inspection. */
let reverseTerrainFillWhileHeld = false;
let selectedUnitId: string | null = null;
/** Unit selected at mousedown; used so double-click can issue move to an occupied hex without reselecting. */
let selectedUnitIdAtMouseDown: string | null = null;
/** Timeout for deferred single-click selection so double-click can issue move before selection runs. */
let pendingSelectTimeout: ReturnType<typeof setTimeout> | null = null;
let humanStandingOrders: HumanStandingOrderSnapshot[] = [];
let hoverRoutePreview: HoverRoutePreviewState | null = null;
let hoverPreviewRequestSeq = 0;
let pendingRangedAttacks: RangedAttackOrder[] = [];
let hideCommittedOrderLinesAfterReady = false;
/** When true, next hex click sets ranged attack target for selected unit (if valid). */
let rangedModeActive = false;
let gameState: GameStateSnapshot | null = null;
let res4TerrainOverridesByH3 = new Map<string, { terrainKind: string; isUrban: boolean }>();
/** Major airport/port H3 from metadata (scalerank ≤ 5); populated via IPC at startup. */
let terrainInfraRes1Airport = new Set<string>();
let terrainInfraRes1Port = new Set<string>();
let terrainInfraRes4Airport = new Set<string>();
let terrainInfraRes4Port = new Set<string>();
const res4ChildrenByParent = new Map<string, string[]>();
let res4Visible = false;
/** When non-null, we are animating resolution: ranged lightning → ranged casualty → movement → melee lightning → melee casualty. */
let resolutionMoveAnimation: {
  moves: ResolutionMove[];
  startTime: number;
  /** Legacy combined (for backward compat); prefer ranged/melee split. */
  combatHexes?: string[];
  casualtyHexes?: string[];
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: RemovedUnitSnapshot[];
  meleeCombatHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: RemovedUnitSnapshot[];
} | null = null;
let resolutionMoveAnimationFrameId: number | null = null;

let redrawRafId: number | null = null;
function requestRedraw(): void {
  if (resolutionMoveAnimation) return;
  if (redrawRafId !== null) return;

  redrawRafId = requestAnimationFrame(() => {
    redrawRafId = null;
    redraw();
  });
}

/** Cached canvas size metrics to avoid getBoundingClientRect() on every redraw. */
let canvasMetrics: { w: number; h: number; dpr: number } | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLeafletGlobal(): any {
  return (globalThis as unknown as { L?: unknown }).L;
}

function hexCenterPx(h3Index: string): { x: number; y: number } {
  return hexCenterToOverlayPoint(h3Index, cellToLatLng);
}

/** Projects `toH3`’s center into the same longitudinal world copy as `fromH3` so seam-crossing segments stay short. */
function hexCenterPxRelativeTo(fromH3Index: string, toH3Index: string): { x: number; y: number } {
  const [, refLng] = cellToLatLng(fromH3Index);
  return hexCenterToOverlayPointWithReferenceLng(toH3Index, refLng, cellToLatLng);
}

function hitTestHexAtContainerPixel(x: number, y: number, mapHexSet: Set<string>): string | null {
  const map = getMainLeafletMap() as
    | { containerPointToLatLng: (pt: unknown) => { lat: number; lng: number } }
    | null;
  if (!map) return null;
  const L = getLeafletGlobal();
  const latlng = map.containerPointToLatLng(L.point(x, y));
  let cell: string;
  try {
    cell = latLngToCell(latlng.lat, latlng.lng, WORLD_H3_RESOLUTION);
  } catch {
    return null;
  }
  if (mapHexSet.has(cell)) return cell;
  // Keep pointer interactions anchored to gameplay hexes (res1) even when visual res4 detail is visible.
  try {
    const detailCell = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
    const parent = cellToParent(detailCell, WORLD_H3_RESOLUTION);
    return mapHexSet.has(parent) ? parent : null;
  } catch {
    return null;
  }
}

function detailHitAtClientPixel(
  clientX: number,
  clientY: number,
  mapHexSet: Set<string>
): string | null {
  if (!gameState || !shouldRenderRes4Hexes()) return null;
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
      }
    | null;
  if (!map) return null;
  const L = getLeafletGlobal();
  const rect = map.getContainer().getBoundingClientRect();
  const latlng = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
  try {
    const detailH3 = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
    const parentH3 = cellToParent(detailH3, WORLD_H3_RESOLUTION);
    return mapHexSet.has(parentH3) ? detailH3 : null;
  } catch {
    return null;
  }
}

function drawTerrainHexes(ctx: CanvasRenderingContext2D): void {
  if (!gameState) return;
  const res4Active = shouldRenderRes4Hexes();
  const map = getMainLeafletMap() as
    | { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }
    | null;
  if (!map) return;
  const mapWithZoom = map as { getZoom?: () => number };
  const zoom = typeof mapWithZoom.getZoom === 'function' ? mapWithZoom.getZoom() : 4;
  // Thicker outlines when zoomed out, slightly thinner when zoomed in.
  const zoomStrokeScale = Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))));
  const L = getLeafletGlobal();
  for (const hx of gameState.hexes) {
    const boundary = getHexBoundaryLatLngForLeafletOverlay(hx.h3Index);
    const pts = boundary.map(([lat, lng]: [number, number]) => {
      const p = map.latLngToContainerPoint(L.latLng(lat, lng));
      return { x: p.x, y: p.y };
    });
    const kind =
      hx.terrainKind ??
      (hx.terrain === 'water' ? 'water' : hx.terrain === 'coastal' ? 'coastal' : 'plains');
    const drawClosedPath = (): void => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };
    if (reverseTerrainFillWhileHeld) {
      fillHexTerrain(ctx, kind, drawClosedPath, {
        fillAndHatchAlphaScale: hoveredHexH3 === hx.h3Index ? 0.6 : 1,
        landHoverFill: kind === 'plains',
        isUrban: false,
      });
    } else if (!res4Active && hoveredHexH3 === hx.h3Index) {
      fillHexTerrain(ctx, kind, drawClosedPath, {
        fillAndHatchAlphaScale: 2,
        landHoverFill: kind === 'plains',
        isUrban: false,
      });
    }
    const stroke = getActiveHexStrokeStyle();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * zoomStrokeScale;
    drawClosedPath();
    ctx.stroke();
    if (selectedHexIndex === hx.h3Index) {
      drawClosedPath();
      ctx.strokeStyle = '#2e5a7b';
      ctx.lineWidth = Math.max(1.8, 2.2 * zoomStrokeScale);
      ctx.stroke();
    }
  }
}

function computeRes1HexFillFraction(): number {
  if (!gameState || gameState.hexes.length === 0) return 0;
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
        latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
      }
    | null;
  if (!map) return 0;
  const L = getLeafletGlobal();
  const container = map.getContainer();
  const center = {
    x: Math.max(1, container.clientWidth) * 0.5,
    y: Math.max(1, container.clientHeight) * 0.5,
  };
  const centerLatLng = map.containerPointToLatLng(L.point(center.x, center.y));
  let sampleH3: string;
  try {
    sampleH3 = latLngToCell(centerLatLng.lat, centerLatLng.lng, WORLD_H3_RESOLUTION);
  } catch {
    sampleH3 = gameState.hexes[0]!.h3Index;
  }
  if (!gameState.hexes.some((h) => h.h3Index === sampleH3)) {
    sampleH3 = gameState.hexes[0]!.h3Index;
  }
  const sampleBoundary = getHexBoundaryLatLngForLeafletOverlay(sampleH3);
  const pts = sampleBoundary.map(([lat, lng]) => map.latLngToContainerPoint(L.latLng(lat, lng)));
  if (pts.length === 0) return 0;
  let minX = pts[0]!.x;
  let maxX = pts[0]!.x;
  let minY = pts[0]!.y;
  let maxY = pts[0]!.y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const viewW = Math.max(1, container.clientWidth);
  const viewH = Math.max(1, container.clientHeight);
  return Math.max((maxX - minX) / viewW, (maxY - minY) / viewH);
}

function shouldRenderRes4Hexes(): boolean {
  const fillFraction = computeRes1HexFillFraction();
  if (res4Visible) {
    if (fillFraction <= RES4_HIDE_THRESHOLD_VIEW_FRACTION) res4Visible = false;
    return res4Visible;
  }
  if (fillFraction >= RES4_SHOW_THRESHOLD_VIEW_FRACTION) res4Visible = true;
  return res4Visible;
}

/** Projects a hex boundary to canvas points for viewport-overlap culling and drawing. */
function projectHexBoundaryToContainerPoints(
  h3Index: string,
  map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } },
  L: { latLng: (lat: number, lng: number) => unknown }
): { x: number; y: number }[] {
  const boundary = getHexBoundaryLatLngForLeafletOverlay(h3Index);
  return boundary.map(([lat, lng]: [number, number]) => {
    const p = map.latLngToContainerPoint(L.latLng(lat, lng));
    return { x: p.x, y: p.y };
  });
}

/** Returns true when the projected polygon bbox overlaps the viewport rectangle. */
function projectedPolygonOverlapsViewport(
  pts: { x: number; y: number }[],
  viewportWidth: number,
  viewportHeight: number
): boolean {
  if (pts.length === 0) return false;
  let minX = pts[0]!.x;
  let maxX = pts[0]!.x;
  let minY = pts[0]!.y;
  let maxY = pts[0]!.y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return maxX >= 0 && maxY >= 0 && minX <= viewportWidth && minY <= viewportHeight;
}

function drawRes4TerrainHexes(ctx: CanvasRenderingContext2D): void {
  if (!gameState || !shouldRenderRes4Hexes()) return;
  const map = getMainLeafletMap() as
    | {
        latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
        getContainer: () => { clientWidth: number; clientHeight: number };
      }
    | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const container = map.getContainer();
  const viewportWidth = Math.max(1, container.clientWidth);
  const viewportHeight = Math.max(1, container.clientHeight);
  const stroke = getActiveHexStrokeStyle();
  for (const parent of gameState.hexes) {
    const parentPts = projectHexBoundaryToContainerPoints(parent.h3Index, map, L);
    if (!projectedPolygonOverlapsViewport(parentPts, viewportWidth, viewportHeight)) continue;
    const parentKind =
      parent.terrainKind ??
      (parent.terrain === 'water' ? 'water' : parent.terrain === 'coastal' ? 'coastal' : 'plains');
    let children = res4ChildrenByParent.get(parent.h3Index);
    if (!children) {
      children = cellToChildren(parent.h3Index, DETAIL_H3_RESOLUTION);
      res4ChildrenByParent.set(parent.h3Index, children);
    }
    for (const child of children) {
      const override = res4TerrainOverridesByH3.get(child);
      const terrainKind = override?.terrainKind ?? parentKind;
      const isUrban = override?.isUrban ?? false;
      const pts = projectHexBoundaryToContainerPoints(child, map, L);
      if (!projectedPolygonOverlapsViewport(pts, viewportWidth, viewportHeight)) continue;
      const drawClosedPath = (): void => {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]!;
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      };
      if (reverseTerrainFillWhileHeld) {
        if (hoveredDetailHexH3 === child) {
          fillHexTerrain(ctx, terrainKind, drawClosedPath, {
            fillAndHatchAlphaScale: 0.6,
            landHoverFill: terrainKind === 'plains',
            isUrban,
          });
        }
      } else {
        fillHexTerrain(ctx, terrainKind, drawClosedPath, {
          fillAndHatchAlphaScale: hoveredDetailHexH3 === child ? 2 : 1,
          landHoverFill: hoveredDetailHexH3 === child && terrainKind === 'plains',
          isUrban,
        });
      }
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(0.28, stroke.width * 0.62);
      drawClosedPath();
      ctx.stroke();
    }
  }
}

function res1HexHasUnits(h3: string): boolean {
  return !!gameState?.units.some((u) => u.h3Index === h3);
}

/**
 * Res-1 terrain interior fill is drawn only for the hovered hex (when res-4 is off) or for every hex while T is held.
 * Glyphs match that visibility; if the hex has units, show glyphs only while T is held.
 */
function infraGlyphsAllowedForRes1Hex(h3: string): boolean {
  const res4Active = shouldRenderRes4Hexes();
  const fillShown =
    reverseTerrainFillWhileHeld || (!res4Active && hoveredHexH3 === h3);
  if (!fillShown) return false;
  const hasUnits = res1HexHasUnits(h3);
  if (hasUnits && !reverseTerrainFillWhileHeld) return false;
  return true;
}

/**
 * Res-4: without T, every child gets terrain interior fill — show infra glyphs on each child that has data.
 * With T held, only the hovered child gets interior fill — match glyphs to that cell only.
 * Parent hexes with units suppress glyphs unless T is held.
 */
function infraGlyphsAllowedForRes4Child(parentH3: string, childH3: string): boolean {
  if (reverseTerrainFillWhileHeld) {
    if (hoveredDetailHexH3 !== childH3) return false;
  }
  const hasUnits = res1HexHasUnits(parentH3);
  if (hasUnits && !reverseTerrainFillWhileHeld) return false;
  return true;
}

/**
 * Draws airport / port symbols on highlighted terrain hexes after units so glyphs sit above unit markers when T is held.
 */
function drawTerrainInfrastructureOverlays(ctx: CanvasRenderingContext2D): void {
  if (!gameState) return;
  const map = getMainLeafletMap() as
    | {
        latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
        getContainer: () => { clientWidth: number; clientHeight: number };
        getZoom?: () => number;
      }
    | null;
  if (!map) return;
  const mapWithZoom = map as { getZoom?: () => number };
  const zoom = typeof mapWithZoom.getZoom === 'function' ? mapWithZoom.getZoom() : 4;
  const zoomStrokeScale = Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))));
  const outlineScreenPx = Math.max(0.5, 0.58 * zoomStrokeScale);
  const L = getLeafletGlobal();
  const res4On = shouldRenderRes4Hexes();

  if (!res4On) {
    for (const hx of gameState.hexes) {
      if (!infraGlyphsAllowedForRes1Hex(hx.h3Index)) continue;
      const ap = terrainInfraRes1Airport.has(hx.h3Index);
      const pt = terrainInfraRes1Port.has(hx.h3Index);
      if (!ap && !pt) continue;
      const boundary = getHexBoundaryLatLngForLeafletOverlay(hx.h3Index);
      const pts = boundary.map(([lat, lng]: [number, number]) => {
        const p = map.latLngToContainerPoint(L.latLng(lat, lng));
        return { x: p.x, y: p.y };
      });
      drawTerrainInfrastructureGlyphs(ctx, pts, { showAirport: ap, showPort: pt, outlineScreenPx });
    }
    return;
  }

  const container = map.getContainer();
  const viewportWidth = Math.max(1, container.clientWidth);
  const viewportHeight = Math.max(1, container.clientHeight);
  for (const parent of gameState.hexes) {
    let children = res4ChildrenByParent.get(parent.h3Index);
    if (!children) {
      children = cellToChildren(parent.h3Index, DETAIL_H3_RESOLUTION);
      res4ChildrenByParent.set(parent.h3Index, children);
    }
    const parentPts = projectHexBoundaryToContainerPoints(parent.h3Index, map, L);
    if (!projectedPolygonOverlapsViewport(parentPts, viewportWidth, viewportHeight)) continue;
    for (const child of children) {
      if (!infraGlyphsAllowedForRes4Child(parent.h3Index, child)) continue;
      const ap = terrainInfraRes4Airport.has(child);
      const pt = terrainInfraRes4Port.has(child);
      if (!ap && !pt) continue;
      const pts = projectHexBoundaryToContainerPoints(child, map, L);
      if (!projectedPolygonOverlapsViewport(pts, viewportWidth, viewportHeight)) continue;
      drawTerrainInfrastructureGlyphs(ctx, pts, {
        showAirport: ap,
        showPort: pt,
        outlineScreenPx,
        glyphAreaScale: RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE,
      });
    }
  }
}

/** Tool group id and label for the Tools tab. Fallback when getToolGroupList is unavailable; order matches main registry. */
const OPENROUTER_TOOL_GROUPS: { id: string; label: string }[] = [
  { id: 'precomputation', label: 'Precomputation' },
  { id: 'events', label: 'Events' },
  { id: 'planning', label: 'Planning' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'estimation', label: 'Estimation' },
  { id: 'memory', label: 'Memory' },
  { id: 'orders', label: 'Orders' },
];

/** Current tool groups shown in the Tools tab (from main registry or fallback). */
let openRouterToolGroups: { id: string; label: string }[] = [...OPENROUTER_TOOL_GROUPS];

/** Which tool groups are enabled for the AI. Default all enabled (including Precomputation). */
let enabledToolGroups: Set<string> = new Set(OPENROUTER_TOOL_GROUPS.map((g) => g.id));

/** Per-group invocation counts for the most recent turn. Reset on Ready click. Events is always 0 (mode toggle only). */
let toolInvocationCounts: Record<string, number> = Object.fromEntries(OPENROUTER_TOOL_GROUPS.map((g) => [g.id, 0]));

/** Run toggle: when true, background AI planning runs and Ready enables only when orders ready; when false, Ready stays enabled (user resolves without LLM). */
let runButtonOn = false;

/** When true (0.7), AI orders come from main: pending orders or standing-order-only; no background requestAiOrders; afterResolution runs after Ready. */
let useEventDrivenConsultation = true;
/** True once the required first event-driven LLM consultation has completed (success or failure). */
let eventDrivenInitialConsultationDone = false;

/** Synchronizes event-driven mode from the Tools tab "Events" toggle state. */
function syncEventDrivenFromTools(): void {
  useEventDrivenConsultation = enabledToolGroups.has('events');
}

/** Precomputed AI movement orders from the last background request; null until request completes. Cleared on Ready click or when Run is turned off. */
let precomputedAiOrders: MovementOrder[] | null = null;

/** Precomputed AI ranged orders from the last background request; cleared with precomputedAiOrders. */
let precomputedAiRangedOrders: { unitId: string; targetH3Index: string }[] | null = null;

/** Strategy text from the last background request; shown in upper-left toast when using precomputed orders. */
let precomputedAiStrategy: string | null = null;
/** Per-group counters captured alongside precomputed orders (used when Ready path does not return counters). */
let precomputedToolInvocationCounts: Record<string, number> | null = null;

/** True while a background requestAiOrders call is in flight; used to avoid duplicate requests and to guard start. */
let backgroundRequestInFlight = false;
/** True while a Ready click is in flight (submitOrders + ready IPC). */
let readyRequestInFlight = false;

/** When the Ready button is disabled waiting on AI, time (ms) when that state started; null otherwise. */
let readyBtnAiWaitStartTime: number | null = null;
/** Interval id for updating the Ready button AI wait counter; cleared when no longer waiting. */
let readyBtnAiWaitIntervalId: ReturnType<typeof setInterval> | null = null;

/** Total OpenRouter API cost in dollars for the current game session. Reset on new game. */
let openRouterGameCost = 0;

/**
 * Starts one background AI orders request if conditions allow (planning phase, key and model set, no request in flight).
 * Used when Run is toggled on and after new game when Run is on. On success stores orders and enables Ready; on failure shows a user-visible error.
 */
function startBackgroundRequestIfAllowed(): void {
  if (backgroundRequestInFlight || !runButtonOn || gameState?.phase !== 'planning') return;
  if (useEventDrivenConsultation && eventDrivenInitialConsultationDone) return;
  const keyPromise = window.gameApi?.openRouter?.getKey?.();
  const modelPromise = window.gameApi?.openRouter?.getSelectedModel?.();
  if (!keyPromise || !modelPromise) return;
  backgroundRequestInFlight = true;
  Promise.all([keyPromise, modelPromise]).then(([keyResult, modelId]) => {
    if (!keyResult?.hasKey || !modelId?.trim()) {
      backgroundRequestInFlight = false;
      appendOpenRouterLog('Run is on but API key or model not set.', true);
      updateReadyButtonState();
      return;
    }
    if (!runButtonOn || !window.gameApi?.requestAiOrders) {
      backgroundRequestInFlight = false;
      updateReadyButtonState();
      return;
    }
    const enabledToolGroupsPayload = Array.from(enabledToolGroups).filter((id) => id !== 'events');
    window.gameApi
      .requestAiOrders({ enabledToolGroups: enabledToolGroupsPayload })
      .then((result) => {
        backgroundRequestInFlight = false;
        if (useEventDrivenConsultation && !eventDrivenInitialConsultationDone) {
          eventDrivenInitialConsultationDone = true;
        }
        if (runButtonOn && result.success) {
          precomputedAiOrders = result.orders;
          precomputedAiRangedOrders = result.rangedAttacks ?? [];
          precomputedAiStrategy = result.strategy ?? null;
          if (result.toolInvocationCounts) {
            precomputedToolInvocationCounts = { ...result.toolInvocationCounts };
            for (const [groupId, count] of Object.entries(result.toolInvocationCounts)) {
              toolInvocationCounts[groupId] = count;
            }
            updateOpenRouterToolCountLabels();
          } else {
            precomputedToolInvocationCounts = null;
          }
          if (result.cost !== undefined) {
            openRouterGameCost += result.cost;
            updateOpenRouterCostLabel();
          }
        } else if (!result.success) {
          showSidebarError(result.error ?? 'Background AI request failed');
          // Allow Ready to be clicked so the turn can advance with no AI orders (e.g. after parse error).
          precomputedAiOrders = [];
          precomputedAiRangedOrders = [];
          precomputedAiStrategy = null;
          precomputedToolInvocationCounts = null;
        }
        updateReadyButtonState();
      })
      .catch((err) => {
        backgroundRequestInFlight = false;
        if (useEventDrivenConsultation && !eventDrivenInitialConsultationDone) {
          eventDrivenInitialConsultationDone = true;
        }
        showSidebarError(String(err));
        precomputedAiOrders = [];
        precomputedAiRangedOrders = [];
        precomputedAiStrategy = null;
        precomputedToolInvocationCounts = null;
        updateReadyButtonState();
      });
  }).catch((err) => {
    backgroundRequestInFlight = false;
    if (useEventDrivenConsultation && !eventDrivenInitialConsultationDone) {
      eventDrivenInitialConsultationDone = true;
    }
    showSidebarError(String(err));
    precomputedAiOrders = [];
    precomputedAiRangedOrders = [];
    precomputedAiStrategy = null;
    precomputedToolInvocationCounts = null;
    updateReadyButtonState();
  });
}

/**
 * Renders or updates the Tools tab list: 2-column grid; each cell has label and count (toggle button).
 * Toggle click flips enabled state. Does not call main or Ready.
 */
function renderOpenRouterToolsList(): void {
  const container = document.getElementById('openrouter-tools-list');
  if (!container) return;
  container.innerHTML = '';
  for (const group of openRouterToolGroups) {
    const cell = document.createElement('div');
    cell.className = 'openrouter-tool-cell';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'openrouter-tool-toggle';
    btn.setAttribute('data-tool-group', group.id);
    btn.setAttribute('aria-pressed', enabledToolGroups.has(group.id) ? 'true' : 'false');
    if (group.id === 'precomputation') {
      btn.title = 'When on, run assess_unit, assess_hex, and estimate_combat before the LLM and inject the Commander\'s Briefing into the prompt.';
    } else if (group.id === 'events') {
      btn.title = 'When on, use event-driven consultation (pending orders or standing-order-only; no background AI request).';
    }
    btn.textContent = String(toolInvocationCounts[group.id] ?? 0);
    btn.addEventListener('click', () => {
      if (enabledToolGroups.has(group.id)) {
        enabledToolGroups.delete(group.id);
      } else {
        enabledToolGroups.add(group.id);
      }
      btn.setAttribute('aria-pressed', enabledToolGroups.has(group.id) ? 'true' : 'false');
      btn.textContent = String(toolInvocationCounts[group.id] ?? 0);
      if (group.id === 'events') {
        const wasEventDriven = useEventDrivenConsultation;
        syncEventDrivenFromTools();
        if (runButtonOn && useEventDrivenConsultation && !wasEventDriven) {
          window.gameApi?.cancelRequestAiOrders?.();
          precomputedAiOrders = null;
          precomputedAiRangedOrders = null;
          precomputedAiStrategy = null;
          precomputedToolInvocationCounts = null;
          eventDrivenInitialConsultationDone = false;
          startBackgroundRequestIfAllowed();
        } else if (runButtonOn && !useEventDrivenConsultation && wasEventDriven) {
          precomputedAiOrders = null;
          precomputedAiRangedOrders = null;
          precomputedAiStrategy = null;
          precomputedToolInvocationCounts = null;
          eventDrivenInitialConsultationDone = false;
          startBackgroundRequestIfAllowed();
        }
        updateReadyButtonState();
      }
    });
    cell.appendChild(btn);
    const label = document.createElement('span');
    label.className = 'openrouter-tool-label';
    label.textContent = group.label;
    cell.appendChild(label);
    container.appendChild(cell);
  }
}

/** Formats elapsed milliseconds as "MM:SS" (e.g. 00:00, 01:23). */
function formatElapsedMmSs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Sets the Ready button label to plain "Ready" (when enabled or disabled for game over). */
function setReadyButtonLabelReady(readyBtn: HTMLButtonElement): void {
  readyBtn.textContent = 'Ready';
}

/** Sets the Ready button label to bold "AI: " plus MM:SS counter (when disabled waiting on LLM). */
function setReadyButtonLabelAiWait(readyBtn: HTMLButtonElement, elapsedMs: number): void {
  readyBtn.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = 'AI: ';
  readyBtn.appendChild(strong);
  readyBtn.appendChild(document.createTextNode(formatElapsedMmSs(elapsedMs)));
}

/**
 * Single source of truth for Ready button enabled state. Run off ⇒ Ready enabled (unless game over).
 * Run on ⇒ Ready enabled only when precomputed AI orders are available. When disabled waiting on
 * the LLM, shows "AI: MM:SS" with a running counter. Call after load, new game, Run toggle,
 * background result, Ready click start, and whenever game state is applied.
 */
function updateReadyButtonState(): void {
  const readyBtn = document.getElementById('ready-btn') as HTMLButtonElement | null;
  if (!readyBtn) return;
  const gameOver = gameState?.gameOver ?? false;
  const waitingOnReadyRequest =
    readyRequestInFlight && runButtonOn && useEventDrivenConsultation;
  const waitingOnAi =
    waitingOnReadyRequest ||
    (runButtonOn &&
    ((!useEventDrivenConsultation && precomputedAiOrders === null) ||
      (useEventDrivenConsultation && !eventDrivenInitialConsultationDone && precomputedAiOrders === null)));
  readyBtn.disabled = gameOver || waitingOnAi;

  if (waitingOnAi) {
    const now = Date.now();
    if (readyBtnAiWaitStartTime === null) {
      readyBtnAiWaitStartTime = now;
      readyBtnAiWaitIntervalId = setInterval(() => {
        if (readyBtnAiWaitStartTime === null) return;
        const btn = document.getElementById('ready-btn') as HTMLButtonElement | null;
        if (btn) setReadyButtonLabelAiWait(btn, Date.now() - readyBtnAiWaitStartTime);
      }, 1000);
    }
    setReadyButtonLabelAiWait(readyBtn, now - (readyBtnAiWaitStartTime ?? now));
  } else {
    if (readyBtnAiWaitIntervalId !== null) {
      clearInterval(readyBtnAiWaitIntervalId);
      readyBtnAiWaitIntervalId = null;
    }
    readyBtnAiWaitStartTime = null;
    setReadyButtonLabelReady(readyBtn);
  }
}

/**
 * Updates only the count labels on the tool toggles (e.g. after Ready or background result).
 * Call after toolInvocationCounts has been updated.
 */
function updateOpenRouterToolCountLabels(): void {
  for (const group of openRouterToolGroups) {
    const btn = document.querySelector(`.openrouter-tool-toggle[data-tool-group="${group.id}"]`);
    if (btn) btn.textContent = String(toolInvocationCounts[group.id] ?? 0);
  }
}

/** Formats dollars for display (e.g. $0.02, $1,234.56). Supports up to $9,999.99. */
function formatOpenRouterCost(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/** Updates the API cost label to the current game total. */
function updateOpenRouterCostLabel(): void {
  const el = document.getElementById('openrouter-cost');
  if (el) el.textContent = formatOpenRouterCost(openRouterGameCost);
}

/** OpenRouter status log: append a line with optional error styling. */
function appendOpenRouterLog(line: string, isError = false): void {
  const el = document.getElementById('openrouter-log');
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  const span = document.createElement('div');
  span.textContent = `${time} ${line}`;
  if (isError) span.style.color = '#a03030';
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}

/** Toast: show message for a readable duration, then auto-hide; can dismiss early. */
const TOAST_DURATION_MS = 12_000; // 1.5× previous 8s for better readability
let toastHideTimer: ReturnType<typeof setTimeout> | null = null;
let aiStrategyToastHideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Shows a toast message over the map. Auto-hides after TOAST_DURATION_MS unless dismissed.
 * Use for errors (red border) or info e.g. AI moves (blue border).
 */
function showMapToast(message: string, options?: { isError?: boolean }): void {
  if (toastHideTimer !== null) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  const el = document.getElementById('map-toast');
  const textEl = document.getElementById('map-toast-text');
  if (el && textEl) {
    textEl.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Update: ';
    textEl.appendChild(strong);
    textEl.appendChild(document.createTextNode('\n' + message));
    el.classList.toggle('toast-info', options?.isError === false);
    el.classList.remove('hidden');
  }
  toastHideTimer = setTimeout(() => {
    toastHideTimer = null;
    hideMapToast();
  }, TOAST_DURATION_MS);
}

function hideMapToast(): void {
  if (toastHideTimer !== null) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  const el = document.getElementById('map-toast');
  if (el) el.classList.add('hidden');
}

/**
 * Shows the AI strategy toast (upper-left). Same duration and dismiss behavior as the map toast.
 * Prefixes with the bolded model name when provided.
 */
function showAiStrategyToast(message: string, modelName?: string): void {
  if (aiStrategyToastHideTimer !== null) {
    clearTimeout(aiStrategyToastHideTimer);
    aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  const textEl = document.getElementById('ai-strategy-toast-text');
  if (el && textEl) {
    textEl.textContent = '';
    if (modelName) {
      const strong = document.createElement('strong');
      strong.textContent = modelName;
      textEl.appendChild(strong);
      textEl.appendChild(document.createTextNode(': ' + message));
    } else {
      textEl.appendChild(document.createTextNode(message));
    }
    el.classList.add('toast-info');
    el.classList.remove('hidden');
  }
  aiStrategyToastHideTimer = setTimeout(() => {
    aiStrategyToastHideTimer = null;
    hideAiStrategyToast();
  }, TOAST_DURATION_MS);
}

function hideAiStrategyToast(): void {
  if (aiStrategyToastHideTimer !== null) {
    clearTimeout(aiStrategyToastHideTimer);
    aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  if (el) el.classList.add('hidden');
}

/**
 * Resizes the overlay canvas to match the map container (including devicePixelRatio) and redraws hexes/units.
 */
function resizeAndRedraw(): void {
  const container = document.getElementById('canvas-container');
  const canvas = document.getElementById('map-overlay') as HTMLCanvasElement | null;
  if (!container || !canvas) return;
  invalidateLeafletMapSizes();

  const dpr = window.devicePixelRatio ?? 1;
  const rect = container.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));

  canvasMetrics = { w, h, dpr };

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (!gameState) {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#666';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading…', w / 2, h / 2);
    return;
  }

  ctx.clearRect(0, 0, w, h);
  drawTerrainHexes(ctx);
  drawRes4TerrainHexes(ctx);
  const hexList = gameState.hexes.map((h) => h.h3Index);
  let moveProgress = 1;
  let unitsToDraw: GameStateSnapshot['units'] = gameState.units;
  let movingIds: Set<string> | undefined;
  const anim = resolutionMoveAnimation;
  if (anim) {
    const elapsed = Date.now() - anim.startTime;
    const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
    const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
    const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
    const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
    const phase = getResolutionPhase5(
      elapsed,
      hasRangedCombat,
      hasRangedCasualties,
      hasMeleeCombat,
      hasMeleeCasualties
    );
    moveProgress = phase.moveProgress;
    const rangedRemovedIds = new Set((anim.rangedRemovedUnits ?? []).map((u) => u.id));
    if (phase.inRangedLightning || phase.inRangedCasualty) {
      const preMoveSurvivors = gameState.units
        .filter((u) => !rangedRemovedIds.has(u.id))
        .map((u) => {
          const move = anim.moves.find((m) => m.unitId === u.id);
          return move ? { ...u, h3Index: move.fromH3Index } : u;
        });
      unitsToDraw = [...preMoveSurvivors, ...(anim.rangedRemovedUnits ?? [])];
      movingIds = undefined;
    } else if (phase.inMovement) {
      unitsToDraw = gameState.units;
      movingIds = moveProgress < 1 ? new Set(anim.moves.map((m) => m.unitId)) : undefined;
    } else if (phase.inMeleeLightning || phase.inMeleeCasualty) {
      unitsToDraw = [...gameState.units, ...(anim.meleeRemovedUnits ?? [])];
      movingIds = undefined;
    }
    if (elapsed >= phase.movementStart) {
      drawResolutionMoveLines(ctx, w, h, anim.moves, gameState.units, hexList, 1);
    }
  } else {
    movingIds = undefined;
  }
  if (!anim && !hideCommittedOrderLinesAfterReady && humanStandingOrders.length > 0 && gameState.units.length) {
    drawStandingOrderLines(ctx, humanStandingOrders, gameState.units);
  }
  if (!anim) drawHoverRoutePreview(ctx);
  if (pendingRangedAttacks.length > 0 && gameState.units.length && hexList) {
    drawRangedAttackLines(ctx, w, h, pendingRangedAttacks, gameState.units, hexList);
  }
  if (unitsToDraw.length) {
    drawUnits(ctx, w, h, unitsToDraw, hexList, movingIds);
  }
  if (anim && hexList && moveProgress < 1) {
    drawMovingUnits(ctx, w, h, anim.moves, gameState.units, hexList, moveProgress);
  }
  drawTerrainInfrastructureOverlays(ctx);
  if (anim && hexList) {
    const elapsed = Date.now() - anim.startTime;
    const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
    const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
    const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
    const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
    const phase = getResolutionPhase5(
      elapsed,
      hasRangedCombat,
      hasRangedCasualties,
      hasMeleeCombat,
      hasMeleeCasualties
    );
    const combatHexes = phase.inRangedLightning ? (anim.rangedCombatHexes ?? anim.combatHexes) : phase.inMeleeLightning ? anim.meleeCombatHexes : undefined;
    if (combatHexes?.length) {
      const pulseOpacity = 0.5 + 0.5 * Math.sin(elapsed * 0.008);
      drawCombatLightning(ctx, w, h, combatHexes, hexList, pulseOpacity);
    }
    const casualtyHexes = phase.inRangedCasualty ? (anim.rangedCasualtyHexes ?? anim.casualtyHexes) : phase.inMeleeCasualty ? anim.meleeCasualtyHexes : undefined;
    if (casualtyHexes?.length) {
      const casualtyElapsed = phase.inRangedCasualty ? elapsed - (hasRangedCombat ? LIGHTNING_DURATION_MS : 0) : elapsed - (phase.movementStart + RESOLUTION_FADE_MS + (hasMeleeCombat ? LIGHTNING_DURATION_MS : 0));
      const pulseOpacity = 0.5 + 0.5 * Math.sin(casualtyElapsed * 0.008);
      drawCasualtyOverlay(ctx, w, h, casualtyHexes, hexList, pulseOpacity);
    }
  }
}

const STACK_OFFSET_X = 7;
const STACK_OFFSET_Y = -4;
const COUNT_BADGE_OFFSET = 18;
const MULTI_PLAYER_FILL = '#b0b0b0';
const MULTI_PLAYER_STROKE = '#000';

/**
 * Draws one unit marker (circle + label) at (x, y). Used by drawUnits and drawMovingUnits.
 */
function drawOneUnitMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  strokeColor: string = '#fff'
): void {
  ctx.beginPath();
  ctx.arc(x, y, UNIT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
}

/**
 * Draws unit markers with stacking: grouped by hex, layered icon + count badge when count > 1,
 * asterisk for mixed types, light grey + black border for multi-player stacks.
 * When movingUnitIds is provided, units in that set are omitted (drawn elsewhere at interpolated positions).
 */
function drawUnits(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined,
  movingUnitIds?: Set<string>
): void {
  if (!hexList || units.length === 0) return;
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

    drawOneUnitMarker(ctx, x, y, fillColor, label, strokeColor);
    if (count > 1) {
      drawOneUnitMarker(ctx, x + STACK_OFFSET_X, y + STACK_OFFSET_Y, fillColor, label, strokeColor);
      const badgeX = x + COUNT_BADGE_OFFSET;
      const badgeY = y + COUNT_BADGE_OFFSET;
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

const LIGHTNING_COLOR = '#f0d000';

/**
 * Draws a hex-sized yellow pulsing lightning bolt at each combat hex. Call after units so it sits on top.
 * opacity in [0, 1]; combine with pulse for visibility during resolution.
 */
function drawCombatLightning(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  combatHexes: string[],
  hexList: string[],
  opacity: number
): void {
  if (combatHexes.length === 0 || opacity <= 0) return;
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

const CASUALTY_X_COLOR = '#c03030';

/**
 * Draws a pulsing red X at each casualty hex (unit lost). Call after lightning fades for LIGHTNING_DURATION_MS.
 */
function drawCasualtyOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  casualtyHexes: string[],
  hexList: string[],
  opacity: number
): void {
  if (casualtyHexes.length === 0 || opacity <= 0) return;
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

/**
 * Draws ranged attack indicators: line from unit to target hex. Style distinct from movement (dashed, accent color).
 */
function drawRangedAttackLines(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  ranged: RangedAttackOrder[],
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined
): void {
  if (ranged.length === 0 || !hexList) return;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#a06020';
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of ranged) {
    const unit = units.find((u) => u.id === r.unitId);
    if (!unit) continue;
    const from = hexCenterPx(unit.h3Index);
    const to = hexCenterPxRelativeTo(unit.h3Index, r.targetH3Index);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLineArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const inset = UNIT_RADIUS + ORDER_ARROW_SIZE;
  const endX = to.x - ux * inset;
  const endY = to.y - uy * inset;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = color;
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  const ax = endX + ux * ORDER_ARROW_SIZE;
  const ay = endY + uy * ORDER_ARROW_SIZE;
  const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
  const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX - perpX, endY - perpY);
  ctx.lineTo(endX + perpX, endY + perpY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.stroke();
}

function drawArrowheadOnly(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  options?: { tipAtTargetCenter?: boolean }
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const inset = options?.tipAtTargetCenter ? ORDER_ARROW_SIZE : UNIT_RADIUS + ORDER_ARROW_SIZE;
  const endX = to.x - ux * inset;
  const endY = to.y - uy * inset;
  const ax = endX + ux * ORDER_ARROW_SIZE;
  const ay = endY + uy * ORDER_ARROW_SIZE;
  const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
  const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX - perpX, endY - perpY);
  ctx.lineTo(endX + perpX, endY + perpY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.stroke();
}

/**
 * Strokes a polyline while skipping wraparound connectors that jump across the map viewport.
 * When a jump is detected, the line restarts at the next point so the path resumes on the opposite edge.
 */
function strokePolylineSkippingWrap(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  wrapJumpThresholdPx: number
): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const current = points[i]!;
    if (Math.abs(current.x - prev.x) > wrapJumpThresholdPx) {
      ctx.moveTo(current.x, current.y);
      continue;
    }
    ctx.lineTo(current.x, current.y);
  }
  ctx.stroke();
}

/**
 * Draws committed human standing-order routed indicators (opaque): routed segments plus endpoint arrow.
 */
function drawStandingOrderLines(
  ctx: CanvasRenderingContext2D,
  orders: HumanStandingOrderSnapshot[],
  units: GameStateSnapshot['units']
): void {
  if (orders.length === 0) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  for (const order of orders) {
    // While the player is actively re-planning a selected unit, hide that unit's committed path.
    if (selectedUnitId && order.unitId === selectedUnitId) continue;
    const unit = units.find((u) => u.id === order.unitId && u.player === 'human');
    if (!unit) continue;
    const segments = order.routeSegments ?? [];
    if (segments.length === 0) {
      if (order.destinationH3Index) {
        drawLineArrow(
          ctx,
          hexCenterPx(unit.h3Index),
          hexCenterPxRelativeTo(unit.h3Index, order.destinationH3Index),
          ORDER_LINE_COLOR
        );
      }
      continue;
    }
    let lastPenultimate: { x: number; y: number } | null = null;
    let lastPoint: { x: number; y: number } | null = null;
    for (const seg of segments) {
      if (!Array.isArray(seg.hexes) || seg.hexes.length < 2) continue;
      const points = seg.hexes.map(([lat, lng]) => {
        const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
        return { x: p.x, y: p.y };
      });
      ctx.setLineDash(seg.turn <= 1 ? [] : [6, 4]);
      ctx.strokeStyle = ORDER_LINE_COLOR;
      ctx.lineWidth = ORDER_LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      lastPenultimate = points[points.length - 2] ?? null;
      lastPoint = points[points.length - 1] ?? null;
    }
    ctx.setLineDash([]);
    if (lastPenultimate && lastPoint) {
      drawArrowheadOnly(ctx, lastPenultimate, lastPoint, ORDER_LINE_COLOR, { tipAtTargetCenter: true });
    }
  }
}

/**
 * Draws hover route preview for selected unit: turn-1 segment solid, future turns dashed, optional invalid X marker.
 */
function drawHoverRoutePreview(ctx: CanvasRenderingContext2D): void {
  if (!hoverRoutePreview || !gameState) return;
  const unit = gameState.units.find((u) => u.id === hoverRoutePreview.unitId);
  if (!unit) return;
  const preview = hoverRoutePreview.data;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  let lastSegmentPenultimate: { x: number; y: number } | null = null;
  let lastSegmentLast: { x: number; y: number } | null = null;
  ctx.save();
  ctx.globalAlpha = preview.valid ? 0.55 : 0.75;
  for (const seg of preview.segments) {
    if (!Array.isArray(seg.hexes) || seg.hexes.length < 2) continue;
    const points = seg.hexes.map(([lat, lng]) => {
      const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
      return { x: p.x, y: p.y };
    });
    ctx.setLineDash(seg.turn <= 1 ? [] : [6, 4]);
    ctx.strokeStyle = ORDER_LINE_COLOR;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
    lastSegmentPenultimate = points[points.length - 2] ?? null;
    lastSegmentLast = points[points.length - 1] ?? null;
  }
  ctx.setLineDash([]);
  if (lastSegmentPenultimate && lastSegmentLast) {
    drawArrowheadOnly(ctx, lastSegmentPenultimate, lastSegmentLast, ORDER_LINE_COLOR, {
      tipAtTargetCenter: true,
    });
  } else if (preview.arrowLatLng && preview.segments.length > 0) {
    // Fallback for degenerate previews: orient arrow from first preview point to endpoint.
    const firstHex = preview.segments[0]?.hexes[0];
    if (firstHex) {
      const fromPoint = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(firstHex[0]), firstHex[1]));
      const toPoint = map.latLngToContainerPoint(
        L.latLng(clampLatForWebMercatorDisplay(preview.arrowLatLng[0]), preview.arrowLatLng[1])
      );
      drawArrowheadOnly(
        ctx,
        { x: fromPoint.x, y: fromPoint.y },
        { x: toPoint.x, y: toPoint.y },
        ORDER_LINE_COLOR,
        { tipAtTargetCenter: true }
      );
    }
  }
  if (preview.showInvalidMarker && hoveredHexH3) {
    const at = hexCenterPx(hoveredHexH3);
    ctx.beginPath();
    ctx.moveTo(at.x - 8, at.y - 8);
    ctx.lineTo(at.x + 8, at.y + 8);
    ctx.moveTo(at.x + 8, at.y - 8);
    ctx.lineTo(at.x - 8, at.y + 8);
    ctx.strokeStyle = ORDER_LINE_COLOR;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws resolution-phase movement arrows (from → to) with optional opacity. Color by player (human vs opponent).
 * Call after hexes, before units. opacity in [0, 1].
 */
function drawResolutionMoveLines(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  moves: ResolutionMove[],
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined,
  opacity: number
): void {
  if (moves.length === 0 || !hexList || opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  for (const move of moves) {
    const unit = units.find((u) => u.id === move.unitId);
    if (!unit) continue;
    const isHumanMove = unit.player === 'human';
    const lineColor = unit.player === 'human' ? ORDER_LINE_COLOR : AI_ORDER_LINE_COLOR;
    const from = hexCenterPx(move.fromH3Index);
    const to = hexCenterPxRelativeTo(move.fromH3Index, move.toH3Index);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const inset = isHumanMove ? 0 : UNIT_RADIUS + ORDER_ARROW_SIZE;
    const endX = to.x - ux * inset;
    const endY = to.y - uy * inset;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (isHumanMove) continue;
    const ax = endX + ux * ORDER_ARROW_SIZE;
    const ay = endY + uy * ORDER_ARROW_SIZE;
    const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
    const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.closePath();
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws moving units at interpolated positions (from + progress * (to - from)) over the resolution animation.
 * One icon per unit; no stacking. Call when progress < 1; when progress >= 1 units are drawn at destinations via drawUnits.
 */
function drawMovingUnits(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  moves: ResolutionMove[],
  units: GameStateSnapshot['units'],
  hexList: string[],
  progress: number
): void {
  if (moves.length === 0 || progress >= 1) return;
  void canvasWidth;
  void hexList;
  const map = getMainLeafletMap() as
    | { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }
    | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const unitsById = new Map<string, GameStateSnapshot['units'][number]>(units.map((u) => [u.id, u]));
  for (const move of moves) {
    const unit = unitsById.get(move.unitId);
    if (!unit) continue;
    const [lat0, lng0] = cellToLatLng(move.fromH3Index);
    const [lat1, lng1] = cellToLatLng(move.toH3Index);
    const lng1Aligned = alignLngToReference(lng1, lng0);
    const lat = lat0 + progress * (lat1 - lat0);
    const lng = lng0 + progress * (lng1Aligned - lng0);
    const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
    const color = PLAYER_COLORS[unit.player] ?? '#333';
    const label = UNIT_TYPE_LABELS[unit.unitType] ?? '?';
    drawOneUnitMarker(ctx, p.x, p.y, color, label, '#fff');
  }
}

/** Redraws the overlay without resizing. Use after pan/zoom or selection change. */
function redraw(): void {
  const container = document.getElementById('canvas-container');
  const canvas = document.getElementById('map-overlay') as HTMLCanvasElement | null;
  if (!container || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const metrics = canvasMetrics;
  if (!metrics) return;
  const { w, h, dpr } = metrics;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (!gameState) {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#666';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading…', w / 2, h / 2);
    return;
  }

  ctx.clearRect(0, 0, w, h);
  drawTerrainHexes(ctx);
  drawRes4TerrainHexes(ctx);
  const hexList = gameState.hexes.map((h) => h.h3Index);
  let moveProgress = 1;
  let unitsToDraw: GameStateSnapshot['units'] = gameState.units;
  let movingIds: Set<string> | undefined;
  const anim = resolutionMoveAnimation;
  if (anim) {
    const elapsed = Date.now() - anim.startTime;
    const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
    const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
    const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
    const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
    const phase = getResolutionPhase5(
      elapsed,
      hasRangedCombat,
      hasRangedCasualties,
      hasMeleeCombat,
      hasMeleeCasualties
    );
    moveProgress = phase.moveProgress;
    const rangedRemovedIds = new Set((anim.rangedRemovedUnits ?? []).map((u) => u.id));
    if (phase.inRangedLightning || phase.inRangedCasualty) {
      const preMoveSurvivors = gameState.units
        .filter((u) => !rangedRemovedIds.has(u.id))
        .map((u) => {
          const move = anim.moves.find((m) => m.unitId === u.id);
          return move ? { ...u, h3Index: move.fromH3Index } : u;
        });
      unitsToDraw = [...preMoveSurvivors, ...(anim.rangedRemovedUnits ?? [])];
      movingIds = undefined;
    } else if (phase.inMovement) {
      unitsToDraw = gameState.units;
      movingIds = moveProgress < 1 ? new Set(anim.moves.map((m) => m.unitId)) : undefined;
    } else if (phase.inMeleeLightning || phase.inMeleeCasualty) {
      unitsToDraw = [...gameState.units, ...(anim.meleeRemovedUnits ?? [])];
      movingIds = undefined;
    }
    if (elapsed >= phase.movementStart) {
      drawResolutionMoveLines(ctx, w, h, anim.moves, gameState.units, hexList, 1);
    }
  } else {
    movingIds = undefined;
  }
  if (humanStandingOrders.length > 0 && gameState.units.length) {
    drawStandingOrderLines(ctx, humanStandingOrders, gameState.units);
  }
  drawHoverRoutePreview(ctx);
  if (pendingRangedAttacks.length > 0 && gameState.units.length && hexList) {
    drawRangedAttackLines(ctx, w, h, pendingRangedAttacks, gameState.units, hexList);
  }
  if (unitsToDraw.length) {
    drawUnits(ctx, w, h, unitsToDraw, hexList, movingIds);
  }
  if (anim && hexList && moveProgress < 1) {
    drawMovingUnits(ctx, w, h, anim.moves, gameState.units, hexList, moveProgress);
  }
  drawTerrainInfrastructureOverlays(ctx);
  if (anim && hexList) {
    const elapsed = Date.now() - anim.startTime;
    const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
    const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
    const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
    const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
    const phase = getResolutionPhase5(
      elapsed,
      hasRangedCombat,
      hasRangedCasualties,
      hasMeleeCombat,
      hasMeleeCasualties
    );
    const combatHexes = phase.inRangedLightning ? (anim.rangedCombatHexes ?? anim.combatHexes) : phase.inMeleeLightning ? anim.meleeCombatHexes : undefined;
    if (combatHexes?.length) {
      const pulseOpacity = 0.5 + 0.5 * Math.sin(elapsed * 0.008);
      drawCombatLightning(ctx, w, h, combatHexes, hexList, pulseOpacity);
    }
    const casualtyHexes = phase.inRangedCasualty ? (anim.rangedCasualtyHexes ?? anim.casualtyHexes) : phase.inMeleeCasualty ? anim.meleeCasualtyHexes : undefined;
    if (casualtyHexes?.length) {
      const casualtyElapsed = phase.inRangedCasualty ? elapsed - (hasRangedCombat ? LIGHTNING_DURATION_MS : 0) : elapsed - (phase.movementStart + RESOLUTION_FADE_MS + (hasMeleeCombat ? LIGHTNING_DURATION_MS : 0));
      const pulseOpacity = 0.5 + 0.5 * Math.sin(casualtyElapsed * 0.008);
      drawCasualtyOverlay(ctx, w, h, casualtyHexes, hexList, pulseOpacity);
    }
  }
}

function tickResolutionMoveAnimation(): void {
  if (!resolutionMoveAnimation) return;
  const anim = resolutionMoveAnimation;
  const elapsed = Date.now() - anim.startTime;
  const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
  const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
  const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
  const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
  const { totalMs } = getResolutionPhase5(
    elapsed,
    hasRangedCombat,
    hasRangedCasualties,
    hasMeleeCombat,
    hasMeleeCasualties
  );
  redraw();
  if (elapsed < totalMs) {
    resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
  } else {
    resolutionMoveAnimation = null;
    resolutionMoveAnimationFrameId = null;
    redraw();
  }
}

/** Updates the sidebar with the selected unit or placeholder. */
function updateSidebar(): void {
  const selectedUnitEl = document.getElementById('sidebar-selected-unit');
  if (selectedUnitEl) {
    selectedUnitEl.textContent = selectedUnitId ?? '—';
  }
}

function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  const phaseEl = document.getElementById('sidebar-phase');
  const turnEl = document.getElementById('sidebar-turn');
  if (phaseEl) phaseEl.textContent = state ? `Phase: ${state.phase}` : '—';
  if (turnEl) turnEl.textContent = state ? `Turn: ${state.turnNumber}` : '—';
}

/**
 * Enables or disables all main UI (map area and sidebar) when the new-game overlay is visible.
 * Uses pointer-events so only the overlay (Start/New game button) is interactive.
 */
function setMainUIControlsEnabled(enabled: boolean): void {
  const container = document.getElementById('canvas-container');
  if (container) {
    for (const child of container.children) {
      if ((child as HTMLElement).id === 'game-over-overlay') continue;
      (child as HTMLElement).style.pointerEvents = enabled ? '' : 'none';
    }
  }
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    (sidebar as HTMLElement).style.pointerEvents = enabled ? '' : 'none';
    sidebar.classList.toggle('main-ui-disabled', !enabled);
  }
}

/**
 * Shows the new-game overlay when there is no game yet (empty hexes) or when the game is over.
 * Sets message and button label accordingly; disables all other UI controls while overlay is visible.
 */
function updateGameOverUI(state: GameStateSnapshot | null): void {
  const overlay = document.getElementById('game-over-overlay');
  const messageEl = document.getElementById('game-over-message');
  const newGameBtn = document.getElementById('new-game-btn');
  const rangedBtn = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;

  const noGame = !state || state.hexes.length === 0;
  const gameOver = !!state?.gameOver;
  const showOverlay = noGame || gameOver;

  if (!showOverlay) {
    overlay?.classList.add('hidden');
    setMainUIControlsEnabled(true);
    if (rangedBtn) rangedBtn.disabled = false;
    updateReadyButtonState();
    return;
  }

  overlay?.classList.remove('hidden');
  setMainUIControlsEnabled(false);
  if (messageEl) {
    if (gameOver) {
      messageEl.textContent = state!.winner === 'human' ? 'You win!' : 'You lose.';
      messageEl.style.display = '';
    } else {
      messageEl.textContent = 'Start the world map game when ready.';
      messageEl.style.display = '';
    }
  }
  if (newGameBtn) {
    newGameBtn.textContent = noGame ? 'Start game' : 'New game';
  }
  if (rangedBtn) rangedBtn.disabled = true;
  updateReadyButtonState();
}

function initNewGameButton(): void {
  document.getElementById('new-game-btn')?.addEventListener('click', async () => {
    if (!window.gameApi?.newGame) return;
    try {
      const state = (await window.gameApi.newGame()) as GameStateSnapshot;
      gameState = state;
      humanStandingOrders = [];
      hoverRoutePreview = null;
      pendingRangedAttacks = [];
      rangedModeActive = false;
      selectedUnitId = null;
      selectedHexIndex = null;
      hideStackCallout();
      precomputedAiOrders = null;
      precomputedAiRangedOrders = null;
      precomputedAiStrategy = null;
      backgroundRequestInFlight = false;
      eventDrivenInitialConsultationDone = false;
      openRouterGameCost = 0;
      updateOpenRouterCostLabel();
      updateGameStateSidebar(state);
      await refreshHumanStandingOrders();
      updatePendingOrdersSidebar();
      updateRangedSidebar();
      updateSidebar();
      updateGameOverUI(state);
      updateReadyButtonState();
      if (runButtonOn) startBackgroundRequestIfAllowed();
      resizeAndRedraw();
    } catch (err) {
      console.error('newGame failed:', err);
    }
  });
}

/**
 * Opens the new-game overlay from the Model tab "New" button.
 * This does not mutate DB state until the user confirms via Start game.
 */
function openNewGameOverlayFromModelTab(): void {
  window.gameApi?.cancelRequestAiOrders?.();
  precomputedAiOrders = null;
  precomputedAiRangedOrders = null;
  precomputedAiStrategy = null;
  precomputedToolInvocationCounts = null;
  backgroundRequestInFlight = false;
  readyRequestInFlight = false;
  eventDrivenInitialConsultationDone = false;
  const overlay = document.getElementById('game-over-overlay');
  const messageEl = document.getElementById('game-over-message');
  const newGameBtn = document.getElementById('new-game-btn');
  if (messageEl) {
    messageEl.textContent = 'Start a new world map game when ready.';
    messageEl.style.display = '';
  }
  if (newGameBtn) newGameBtn.textContent = 'Start game';
  overlay?.classList.remove('hidden');
  setMainUIControlsEnabled(false);
  updateReadyButtonState();
}

async function refreshHumanStandingOrders(): Promise<void> {
  if (!window.gameApi?.listHumanStandingOrders) {
    humanStandingOrders = [];
    return;
  }
  try {
    humanStandingOrders = await window.gameApi.listHumanStandingOrders();
  } catch {
    humanStandingOrders = [];
  }
}

async function cancelOrderForUnit(unitId: string): Promise<void> {
  if (!window.gameApi?.cancelHumanStandingOrder) return;
  const result = await window.gameApi.cancelHumanStandingOrder({ unitId });
  if (!result.success) {
    showMapToast(result.reason ?? 'Failed to cancel order.', { isError: true });
  }
  await refreshHumanStandingOrders();
  updatePendingOrdersSidebar();
  redraw();
}

/** Selects a unit on the map by id; sets selectedUnitId and selectedHexIndex from current game state and redraws. */
function selectUnitOnMap(unitId: string): void {
  const unit = gameState?.units.find((u) => u.id === unitId);
  if (!unit) return;
  selectedUnitId = unit.id;
  selectedHexIndex = unit.h3Index;
  updateSidebar();
  updateRangedSidebar();
  void refreshHoverRoutePreview();
  redraw();
}

async function refreshHoverRoutePreview(): Promise<void> {
  const unitId = selectedUnitId;
  const hoveredH3 = hoveredHexH3;
  const seq = ++hoverPreviewRequestSeq;
  if (!window.gameApi?.previewHumanMarchOrder || !unitId || !hoveredH3 || !gameState) {
    hoverRoutePreview = null;
    return;
  }
  const unit = gameState.units.find((u) => u.id === unitId);
  if (!unit || unit.player !== 'human') {
    hoverRoutePreview = null;
    return;
  }
  const data = await window.gameApi.previewHumanMarchOrder({ unitId, hoveredH3Index: hoveredH3 });
  // Ignore stale async responses so preview always matches current hovered hex.
  if (seq !== hoverPreviewRequestSeq) return;
  if (selectedUnitId !== unitId || hoveredHexH3 !== hoveredH3) return;
  hoverRoutePreview = { unitId, hoveredH3Index: hoveredH3, data };
  requestRedraw();
}

function cancelRangedForUnit(unitId: string): void {
  pendingRangedAttacks = pendingRangedAttacks.filter((r) => r.unitId !== unitId);
  rangedModeActive = false;
  updateRangedSidebar();
  redraw();
}

function updateRangedSidebar(): void {
  const listEl = document.getElementById('ranged-attacks-list');
  const btnEl = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;
  if (!listEl) return;

  listEl.innerHTML = '';
  if (pendingRangedAttacks.length === 0) {
    const span = document.createElement('span');
    span.textContent = 'None';
    span.style.color = '#666';
    listEl.appendChild(span);
  } else {
    for (const r of pendingRangedAttacks) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '0.5rem';
      row.style.marginBottom = '0.35rem';
      const label = document.createElement('span');
      label.textContent = `${r.unitId} → ${r.targetH3Index}`;
      label.style.flex = '1';
      label.style.fontSize = '0.9em';
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.textContent = 'Select';
      selectBtn.style.flexShrink = '0';
      selectBtn.style.fontSize = '0.8em';
      selectBtn.addEventListener('click', () => selectUnitOnMap(r.unitId));
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.flexShrink = '0';
      cancelBtn.style.fontSize = '0.8em';
      cancelBtn.addEventListener('click', () => cancelRangedForUnit(r.unitId));
      row.appendChild(label);
      row.appendChild(selectBtn);
      row.appendChild(cancelBtn);
      listEl.appendChild(row);
    }
  }

  if (btnEl) {
    const unit = selectedUnitId && gameState?.units.find((u) => u.id === selectedUnitId);
    const range = unit ? (RANGED_RANGE[unit.unitType] ?? 0) : 0;
    if (range >= 1) {
      btnEl.style.display = 'inline-block';
      btnEl.textContent = rangedModeActive ? 'Cancel ranged mode' : 'Ranged attack (click target hex)';
    } else {
      btnEl.style.display = 'none';
      rangedModeActive = false;
    }
  }
}

function updatePendingOrdersSidebar(): void {
  const container = document.getElementById('pending-orders-list');
  if (!container) return;
  container.innerHTML = '';
  if (humanStandingOrders.length === 0) {
    const span = document.createElement('span');
    span.textContent = 'None';
    span.style.color = '#666';
    container.appendChild(span);
    return;
  }
  for (const order of humanStandingOrders) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '0.5rem';
    row.style.marginBottom = '0.35rem';
    const label = document.createElement('span');
    label.textContent = `${order.unitId} → ${order.destinationH3Index ?? '—'} (${order.status})`;
    label.style.flex = '1';
    label.style.fontSize = '0.9em';
    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.textContent = 'Select';
    selectBtn.style.flexShrink = '0';
    selectBtn.style.fontSize = '0.8em';
    selectBtn.addEventListener('click', () => selectUnitOnMap(order.unitId));
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.flexShrink = '0';
    cancelBtn.style.fontSize = '0.8em';
    cancelBtn.addEventListener('click', () => {
      void cancelOrderForUnit(order.unitId);
    });
    row.appendChild(label);
    row.appendChild(selectBtn);
    row.appendChild(cancelBtn);
    container.appendChild(row);
  }
}

/** Reports a user-facing error to the floating log (map toast, lower-left) and clears any sidebar error. */
function showSidebarError(message: string): void {
  showMapToast(message, { isError: true });
  clearSidebarError();
}

function clearSidebarError(): void {
  const el = document.getElementById('sidebar-error');
  if (el) el.style.display = 'none';
}

function initOpenRouterUI(): void {
  const api = window.gameApi?.openRouter;
  if (!api) return;

  window.gameApi?.registerOpenRouterLogListener?.((p) => appendOpenRouterLog(p.line, p.isError ?? false));
  updateOpenRouterCostLabel();

  const tabTools = document.getElementById('openrouter-tab-tools');
  const tabModel = document.getElementById('openrouter-tab-model');
  const panelTools = document.getElementById('openrouter-tools-panel');
  const panelModel = document.getElementById('openrouter-model-panel');

  function setActiveTab(active: 'tools' | 'model'): void {
    if (active === 'model') {
      tabTools?.setAttribute('aria-selected', 'false');
      tabModel?.setAttribute('aria-selected', 'true');
      panelTools?.classList.remove('active');
      panelTools?.setAttribute('hidden', '');
      panelModel?.classList.add('active');
      panelModel?.removeAttribute('hidden');
    } else {
      tabTools?.setAttribute('aria-selected', 'true');
      tabModel?.setAttribute('aria-selected', 'false');
      panelTools?.classList.add('active');
      panelTools?.removeAttribute('hidden');
      panelModel?.classList.remove('active');
      panelModel?.setAttribute('hidden', '');
    }
  }

  tabTools?.addEventListener('click', () => setActiveTab('tools'));
  tabModel?.addEventListener('click', () => setActiveTab('model'));

  setActiveTab('model');

  (async () => {
    try {
      const list = await window.gameApi?.openRouter?.getToolGroupList?.();
      if (list?.length) {
        const withEvents = [...list];
        const precomputationIdx = withEvents.findIndex((g) => g.id === 'precomputation');
        if (!withEvents.some((g) => g.id === 'events')) {
          const insertAt = precomputationIdx >= 0 ? precomputationIdx + 1 : 1;
          withEvents.splice(insertAt, 0, { id: 'events', label: 'Events' });
        }
        openRouterToolGroups = withEvents;
        enabledToolGroups = new Set(withEvents.map((g) => g.id));
        toolInvocationCounts = Object.fromEntries(withEvents.map((g) => [g.id, 0]));
        syncEventDrivenFromTools();
      }
    } finally {
      renderOpenRouterToolsList();
    }
  })();

  const keyInput = document.getElementById('openrouter-key') as HTMLInputElement | null;
  const modelSelect = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  const refreshBtn = document.getElementById('openrouter-refresh-models');
  const newBtn = document.getElementById('openrouter-new-btn');

  function refreshModels(): void {
    api!.listModels().then((result) => {
      if (!modelSelect) return;
      const kept = modelSelect.value;
      modelSelect.innerHTML = '<option value="">— Select model —</option>';
      if ('error' in result && result.error) {
        appendOpenRouterLog(`Models: ${result.error}`, true);
        return;
      }
      const models = 'models' in result ? result.models ?? [] : [];
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name ?? m.id;
        modelSelect.appendChild(opt);
      }
      if (kept && Array.from(modelSelect.options).some((o) => o.value === kept)) {
        modelSelect.value = kept;
      }
    });
  }

  refreshModels();

  if (keyInput) {
    keyInput.addEventListener('blur', () => {
      const v = keyInput.value.trim();
      api!.setKey(v).then(() => {
        if (!v) hideMapToast();
      });
    });
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      api!.setSelectedModel(modelSelect.value);
      if (modelSelect.value) hideMapToast();
    });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', refreshModels);
  if (newBtn) newBtn.addEventListener('click', openNewGameOverlayFromModelTab);

  /** Run toggle: on ⇒ switch to Tools tab, clear precomputed, start background request; off ⇒ cancel in-flight, clear precomputed. */
  const runBtn = document.getElementById('openrouter-run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      runButtonOn = !runButtonOn;
      runBtn.setAttribute('aria-pressed', runButtonOn ? 'true' : 'false');
      if (runButtonOn) {
        document.getElementById('openrouter-tab-tools')?.click();
        precomputedAiOrders = null;
        precomputedAiRangedOrders = null;
        precomputedAiStrategy = null;
        if (useEventDrivenConsultation) eventDrivenInitialConsultationDone = false;
        updateReadyButtonState();
        startBackgroundRequestIfAllowed();
      } else {
        window.gameApi?.cancelRequestAiOrders?.();
        precomputedAiOrders = null;
        precomputedAiRangedOrders = null;
        precomputedAiStrategy = null;
        eventDrivenInitialConsultationDone = false;
        updateReadyButtonState();
      }
    });
  }

  document.getElementById('map-toast-dismiss')?.addEventListener('click', hideMapToast);
  document.getElementById('ai-strategy-toast-dismiss')?.addEventListener('click', hideAiStrategyToast);
}

function init(): void {
  try {
    initWorldLeafletMaps('main-map', 'minimap', () => requestRedraw(), getActiveTerrainStyleBasemapId());
    setMainBasemapFilter('');
    const leg = document.getElementById('terrain-legend');
    if (leg) {
      renderTerrainLegend(leg, {
        onStyleChanged: () => {
          setMainBasemapByProviderId(getActiveTerrainStyleBasemapId());
          requestRedraw();
        },
      });
    }
  } catch (err) {
    console.error('Map init failed:', err);
  }
  resizeAndRedraw();
  updateSidebar();
  updateGameStateSidebar(null);
  void refreshHumanStandingOrders().then(() => updatePendingOrdersSidebar());
  updatePendingOrdersSidebar();
  initOpenRouterUI();
  updateRangedSidebar();
  initNewGameButton();
  updateReadyButtonState();

  document.getElementById('ranged-attack-btn')?.addEventListener('click', () => {
    if (rangedModeActive) {
      rangedModeActive = false;
    } else if (selectedUnitId && gameState) {
      const unit = gameState.units.find((u) => u.id === selectedUnitId);
      const range = unit ? (RANGED_RANGE[unit.unitType] ?? 0) : 0;
      if (range >= 1) rangedModeActive = true;
    }
    updateRangedSidebar();
    redraw();
  });

  if (window.gameApi) {
    window.gameApi
      .getGameState()
      .then(async (raw) => {
        const state = raw as GameStateSnapshot;
        gameState = state;
        await refreshHumanStandingOrders();
        updateGameStateSidebar(state);
        updateRangedSidebar();
        updateSidebar();
        updateGameOverUI(state);
        updateReadyButtonState();
        redraw();
      })
      .catch((err) => console.error('getGameState failed:', err));
    window.gameApi
      .getRes4TerrainOverrides()
      .then((rows) => {
        res4TerrainOverridesByH3 = new Map(rows.map((r) => [r.h3Index, { terrainKind: r.terrainKind, isUrban: !!r.isUrban }]));
        requestRedraw();
      })
      .catch((err) => console.error('getRes4TerrainOverrides failed:', err));
    window.gameApi
      .getTerrainInfrastructureHints()
      .then((hints) => {
        terrainInfraRes1Airport = new Set(hints.res1MajorAirports);
        terrainInfraRes1Port = new Set(hints.res1MajorPorts);
        terrainInfraRes4Airport = new Set(hints.res4MajorAirports);
        terrainInfraRes4Port = new Set(hints.res4MajorPorts);
        requestRedraw();
      })
      .catch((err) => console.error('getTerrainInfrastructureHints failed:', err));
  }

  window.addEventListener('resize', () => {
    resizeAndRedraw();
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key.toLowerCase() !== 't') return;
    reverseTerrainFillWhileHeld = true;
    requestRedraw();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() !== 't') return;
    reverseTerrainFillWhileHeld = false;
    requestRedraw();
  });
  window.addEventListener('blur', () => {
    if (!reverseTerrainFillWhileHeld) return;
    reverseTerrainFillWhileHeld = false;
    requestRedraw();
  });

  const mainMapEl = document.getElementById('main-map');
  if (!mainMapEl) return;

  function clientXYToHit(clientX: number, clientY: number): string | null {
    if (!gameState) return null;
    const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
    if (!map) return null;
    const rect = map.getContainer().getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const set = new Set(gameState.hexes.map((h) => h.h3Index));
    return hitTestHexAtContainerPixel(x, y, set);
  }

  mainMapEl.addEventListener('pointermove', (e) => {
    lastPointerClientX = e.clientX;
    lastPointerClientY = e.clientY;
    const mapHexSet = new Set((gameState?.hexes ?? []).map((h) => h.h3Index));
    const hit = clientXYToHit(e.clientX, e.clientY);
    const detailHit = detailHitAtClientPixel(e.clientX, e.clientY, mapHexSet);

    if (hit !== hoveredHexH3 || detailHit !== hoveredDetailHexH3) {
      clearTerrainTooltipTimer();
      hideTerrainTooltipVisual();
      hoveredHexH3 = hit;
      hoveredDetailHexH3 = detailHit;
      void refreshHoverRoutePreview();
      requestRedraw();
      if (hit) {
        const targetHex = hit;
        terrainTooltipDelayTimer = setTimeout(() => {
          terrainTooltipDelayTimer = null;
          if (hoveredHexH3 !== targetHex || !gameState) return;
          const state = terrainStateForPointer(lastPointerClientX, lastPointerClientY, targetHex);
          const namingTarget = namingLookupTargetForPointer(lastPointerClientX, lastPointerClientY, targetHex);
          void showTerrainTooltip(lastPointerClientX, lastPointerClientY, state, namingTarget);
        }, TERRAIN_TOOLTIP_DELAY_MS);
      }
      return;
    }

    const tip = document.getElementById('hex-tooltip');
    if (tip && !tip.classList.contains('hidden')) {
      const state = terrainStateForPointer(e.clientX, e.clientY, hit);
      const namingTarget = namingLookupTargetForPointer(e.clientX, e.clientY, hit);
      void showTerrainTooltip(e.clientX, e.clientY, state, namingTarget);
    }
  });
  mainMapEl.addEventListener('pointerleave', () => {
    clearTerrainTooltipTimer();
    hideTerrainTooltipVisual();
    if (hoveredHexH3 !== null || hoveredDetailHexH3 !== null) {
      hoveredHexH3 = null;
      hoveredDetailHexH3 = null;
      hoverRoutePreview = null;
      requestRedraw();
    }
  });

  mainMapEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    selectedUnitIdAtMouseDown = selectedUnitId;
    clearTerrainTooltipTimer();
    hideTerrainTooltipVisual();
  });

  mainMapEl.addEventListener('click', (e) => {
    const hit = clientXYToHit(e.clientX, e.clientY);
    selectedHexIndex = hit;
    clearSidebarError();

    if (hit && rangedModeActive && selectedUnitId && gameState) {
      const unit = gameState.units.find((u) => u.id === selectedUnitId);
      if (!unit || unit.player !== 'human') {
        rangedModeActive = false;
        updateRangedSidebar();
      } else {
        const range = RANGED_RANGE[unit.unitType] ?? 0;
        if (range < 1) {
          rangedModeActive = false;
          updateRangedSidebar();
        } else {
          let dist: number;
          try {
            dist = gridDistance(unit.h3Index, hit);
          } catch {
            showMapToast('Invalid target hex.', { isError: true });
            return;
          }
          if (dist < 1 || dist > range) {
            showMapToast(`Target out of range (${unit.unitType} range ${range}).`, { isError: true });
            return;
          }
          const enemiesAtTarget = gameState.units.filter((u) => u.h3Index === hit && u.player !== unit.player);
          if (enemiesAtTarget.length === 0) {
            showMapToast('Target hex has no enemy units.', { isError: true });
            return;
          }
          pendingRangedAttacks = pendingRangedAttacks.filter((r) => r.unitId !== selectedUnitId);
          pendingRangedAttacks.push({ unitId: selectedUnitId, targetH3Index: hit });
          rangedModeActive = false;
          showMapToast(`Ranged attack set: ${unit.id} → ${hit}`);
          updateRangedSidebar();
        }
      }
      hideStackCallout();
      updateSidebar();
      redraw();
      return;
    }

    const unitsAtHit = hit ? getUnitsAtHex(hit) : [];
    const isStack = unitsAtHit.length >= 2;
    const isLoneAi = unitsAtHit.length === 1 && unitsAtHit[0]?.player !== 'human';
    if (hit && (isStack || isLoneAi)) {
      showStackCallout(unitsAtHit, e.clientX, e.clientY);
      updateSidebar();
      updateRangedSidebar();
      redraw();
      return;
    }

    hideStackCallout();
    if (hit) {
      const unit = getUnitAtHex(hit);
      if (unit?.player === 'human') {
        if (pendingSelectTimeout !== null) {
          clearTimeout(pendingSelectTimeout);
          pendingSelectTimeout = null;
          /* Second click of a double-click; do not select so dblclick can issue move to this hex. */
        } else {
          const unitIdToSelect = unit.id;
          pendingSelectTimeout = setTimeout(() => {
            selectedUnitId = unitIdToSelect;
            void refreshHoverRoutePreview();
            pendingSelectTimeout = null;
            updateSidebar();
            updateRangedSidebar();
            redraw();
          }, 250);
        }
      } else if (selectedUnitId && hit !== gameState?.units.find((u) => u.id === selectedUnitId)?.h3Index) {
        /* Movement orders are issued on double-click so the player can move to an occupied hex. */
        if (pendingSelectTimeout !== null) {
          clearTimeout(pendingSelectTimeout);
          pendingSelectTimeout = null;
        }
      } else {
        if (pendingSelectTimeout !== null) {
          clearTimeout(pendingSelectTimeout);
          pendingSelectTimeout = null;
        }
        selectedUnitId = null;
        hoverRoutePreview = null;
      }
    } else {
      if (pendingSelectTimeout !== null) {
        clearTimeout(pendingSelectTimeout);
        pendingSelectTimeout = null;
      }
      selectedUnitId = null;
      hoverRoutePreview = null;
    }

    updateSidebar();
    updateRangedSidebar();
    redraw();
  });

  mainMapEl.addEventListener('dblclick', async (e) => {
    if (pendingSelectTimeout !== null) {
      clearTimeout(pendingSelectTimeout);
      pendingSelectTimeout = null;
    }
    if (!gameState) return;
    const hit = clientXYToHit(e.clientX, e.clientY);
    if (!hit || !selectedUnitIdAtMouseDown) return;

    const unit = gameState.units.find((u) => u.id === selectedUnitIdAtMouseDown);
    if (!unit || unit.player !== 'human' || unit.h3Index === hit) return;

    if (!window.gameApi?.assignHumanMarchOrder) return;
    const assign = await window.gameApi.assignHumanMarchOrder({
      unitId: selectedUnitIdAtMouseDown,
      destinationH3Index: hit,
    });
    if (!assign.success) {
      showMapToast(assign.reason ?? 'Failed to assign movement order.', { isError: true });
      return;
    }
    // Commit complete: clear active selection so preview path is not left floating.
    selectedUnitId = null;
    selectedUnitIdAtMouseDown = null;
    selectedHexIndex = null;
    hideCommittedOrderLinesAfterReady = false;
    hoverRoutePreview = null;
    await refreshHumanStandingOrders();
    updatePendingOrdersSidebar();
    updateSidebar();
    redraw();
  });

  mainMapEl.addEventListener('contextmenu', (e) => {
    // Right-click aborts active path selection and preserves existing committed orders.
    e.preventDefault();
    if (!selectedUnitId && !hoverRoutePreview) return;
    selectedUnitId = null;
    selectedUnitIdAtMouseDown = null;
    selectedHexIndex = null;
    hoverRoutePreview = null;
    updateSidebar();
    updateRangedSidebar();
    redraw();
  });

  const readyBtn = document.getElementById('ready-btn');
  if (readyBtn) {
    readyBtn.addEventListener('click', async () => {
      if (!window.gameApi) return;
      if (gameState?.gameOver) return;
      clearSidebarError();
      readyRequestInFlight = true;
      toolInvocationCounts = Object.fromEntries(openRouterToolGroups.map((g) => [g.id, 0]));
      updateOpenRouterToolCountLabels();
      updateReadyButtonState();
      try {
        const submitResult = (await window.gameApi.submitOrders({
          movementOrders: [],
          rangedAttacks: pendingRangedAttacks,
        })) as { success: boolean; reason?: string };
        if (!submitResult.success) {
          showSidebarError(submitResult.reason ?? 'Submit failed');
          updateReadyButtonState();
          return;
        }
        const enabledToolGroupsPayload = Array.from(enabledToolGroups).filter((id) => id !== 'events');
        const useEventDriven = useEventDrivenConsultation;
        const usePrecomputed = runButtonOn && precomputedAiOrders !== null;
        const readyPayload = useEventDriven
          ? (usePrecomputed
              ? {
                  enabledToolGroups: enabledToolGroupsPayload,
                  useEventDrivenConsultation: true,
                  precomputedAiOrders: precomputedAiOrders!,
                  precomputedAiRangedOrders: precomputedAiRangedOrders ?? [],
                  precomputedAiStrategy: precomputedAiStrategy ?? undefined,
                }
              : {
                  enabledToolGroups: enabledToolGroupsPayload,
                  useEventDrivenConsultation: true,
                })
          : (usePrecomputed
              ? {
                  enabledToolGroups: enabledToolGroupsPayload,
                  precomputedAiOrders: precomputedAiOrders!,
                  precomputedAiRangedOrders: precomputedAiRangedOrders ?? [],
                  precomputedAiStrategy: precomputedAiStrategy ?? undefined,
                }
              : {
                  enabledToolGroups: enabledToolGroupsPayload,
                });
        const readyResult = await window.gameApi!.ready(readyPayload);
        if (!readyResult.success) {
          showSidebarError(readyResult.reason ?? 'Ready failed');
          updateReadyButtonState();
          return;
        }
        // Precomputed AI orders are a single-turn snapshot; consume once and force refresh for the next turn.
        precomputedAiOrders = null;
        precomputedAiRangedOrders = null;
        precomputedAiStrategy = null;
        precomputedToolInvocationCounts = null;
        const humanMoves: ResolutionMove[] = readyResult.humanMoves ?? [];
        const nextState = (await window.gameApi.getGameState()) as GameStateSnapshot;
        const state = nextState;
        gameState = state;
        const aiMoves = readyResult.aiMoves ?? [];
        const resolutionMoves = [...humanMoves, ...aiMoves];
        let didShowMapToastForTurn = false;
        if ((readyResult.aiMovesLog?.length ?? 0) > 0) {
          didShowMapToastForTurn = true;
          showMapToast(`AI moves:\n${readyResult.aiMovesLog!.join('\n')}`, { isError: false });
        }
        if (readyResult.aiStrategy) {
          didShowMapToastForTurn = true;
          showAiStrategyToast(readyResult.aiStrategy);
        } else {
          hideAiStrategyToast();
        }
        if (readyResult.toolInvocationCounts) {
          toolInvocationCounts = readyResult.toolInvocationCounts;
          updateOpenRouterToolCountLabels();
        } else if (usePrecomputed && precomputedToolInvocationCounts) {
          toolInvocationCounts = { ...precomputedToolInvocationCounts };
          updateOpenRouterToolCountLabels();
        }
        precomputedToolInvocationCounts = null;
        if (readyResult.cost !== undefined) {
          openRouterGameCost += readyResult.cost;
          updateOpenRouterCostLabel();
        }
        if (readyResult.aiConsulted === false) {
          appendOpenRouterLog('AI executing standing orders (no event fired).');
          showMapToast('AI: standing orders only (no consultation).', { isError: false });
        }
        const hasRanged = (readyResult.rangedCombatHexes?.length ?? 0) > 0 || (readyResult.rangedCasualtyHexes?.length ?? 0) > 0 || (readyResult.rangedRemovedUnits?.length ?? 0) > 0;
        const hasMelee = (readyResult.meleeCombatHexes?.length ?? 0) > 0 || (readyResult.meleeCasualtyHexes?.length ?? 0) > 0 || (readyResult.meleeRemovedUnits?.length ?? 0) > 0;
        const hasLegacy = (readyResult.combatHexes?.length ?? 0) > 0 || (readyResult.casualtyHexes?.length ?? 0) > 0;
        const needsAnimation = resolutionMoves.length > 0 || hasRanged || hasMelee || hasLegacy;
        if (needsAnimation) {
          if (resolutionMoveAnimationFrameId !== null) cancelAnimationFrame(resolutionMoveAnimationFrameId);
          resolutionMoveAnimation = {
            moves: resolutionMoves,
            startTime: Date.now(),
            combatHexes: readyResult.combatHexes?.length ? readyResult.combatHexes : undefined,
            casualtyHexes: readyResult.casualtyHexes?.length ? readyResult.casualtyHexes : undefined,
            rangedCombatHexes: readyResult.rangedCombatHexes?.length ? readyResult.rangedCombatHexes : undefined,
            rangedCasualtyHexes: readyResult.rangedCasualtyHexes?.length ? readyResult.rangedCasualtyHexes : undefined,
            rangedRemovedUnits: readyResult.rangedRemovedUnits?.length ? readyResult.rangedRemovedUnits : undefined,
            meleeCombatHexes: readyResult.meleeCombatHexes?.length ? readyResult.meleeCombatHexes : undefined,
            meleeCasualtyHexes: readyResult.meleeCasualtyHexes?.length ? readyResult.meleeCasualtyHexes : undefined,
            meleeRemovedUnits: readyResult.meleeRemovedUnits?.length ? readyResult.meleeRemovedUnits : undefined,
          };
          const directFire = readyResult.killsByDirectFire ?? [];
          const returnFire = readyResult.killsByReturnFire ?? [];
          const allKills = readyResult.kills ?? [];
          const directSet = new Set(directFire.map((k) => k.victimId));
          const returnSet = new Set(returnFire.map((k) => k.victimId));
          const meleeKills = allKills.filter((k) => !directSet.has(k.victimId) && !returnSet.has(k.victimId));
          const fmt = (k: { victimId: string; killerIds: string[] }) => `${k.victimId} destroyed by ${k.killerIds.join(', ')}`;
          const bullets: string[] = [];
          if (directFire.length > 0) bullets.push(`• Direct fire: ${directFire.map(fmt).join('; ')}`);
          if (returnFire.length > 0) bullets.push(`• Return fire: ${returnFire.map(fmt).join('; ')}`);
          if (meleeKills.length > 0) bullets.push(meleeKills.map(fmt).join('\n'));
          if (bullets.length > 0 && !didShowMapToastForTurn) showMapToast(bullets.join('\n'), { isError: false });
          resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
        }
        hoverRoutePreview = null;
        hideCommittedOrderLinesAfterReady = true;
        pendingRangedAttacks = [];
        rangedModeActive = false;
        await refreshHumanStandingOrders();
        updateGameStateSidebar(state);
        updatePendingOrdersSidebar();
        updateRangedSidebar();
        updateSidebar();
        updateGameOverUI(state);
        updateReadyButtonState();
        if (runButtonOn) startBackgroundRequestIfAllowed();
        redraw();
      } catch (err) {
        showSidebarError(String(err));
        updateReadyButtonState();
      } finally {
        readyRequestInFlight = false;
        updateReadyButtonState();
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
