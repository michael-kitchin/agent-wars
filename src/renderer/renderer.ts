/**
 * Renderer process entry point. Leaflet world basemap + overlay canvas (terrain, units, orders),
 * minimap with viewport sync, and click / double-click interaction with the sidebar.
 */

import { cellToChildren, cellToLatLng, cellToParent, gridDisk, gridDistance, latLngToCell } from 'h3-js';
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
  HumanOrderGroupPreviewResult,
  HumanStandingOrderSnapshot,
} from '../shared/ipcTypes';

/** One executed move (human or AI) for resolution-phase fade animation. */
interface ResolutionMove {
  unitId: string;
  fromH3Index: string;
  toH3Index: string;
}

interface HoverRoutePreviewState {
  hoveredH3Index: string;
  data: HumanOrderGroupPreviewResult;
}

/** Ranged range in hexes by unit type (0 = melee only). Matches combat spec. */
const RANGED_RANGE: Record<string, number> = {
  infantry: 0,
  armor: 1,
  naval: 2,
};

/** Per-turn movement budget in hex edges by unit type. */
const MOVEMENT_RANGE: Record<string, number> = {
  infantry: 1,
  armor: 2,
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
  if (el) {
    el.classList.add('hidden');
    el.removeAttribute('data-open');
    el.removeAttribute('data-x');
    el.removeAttribute('data-y');
    el.removeAttribute('data-unit-ids');
  }
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

  calloutEl.setAttribute('data-open', 'true');
  calloutEl.setAttribute('data-x', String(clientX));
  calloutEl.setAttribute('data-y', String(clientY));
  calloutEl.setAttribute('data-unit-ids', JSON.stringify(sorted.map((u) => u.id)));

  listEl.innerHTML = '';
  const existingHeader = calloutEl.querySelector('.stack-callout-actions');
  if (existingHeader) existingHeader.remove();
  const header = document.createElement('div');
  header.className = 'stack-callout-actions';
  header.style.display = 'flex';
  header.style.justifyContent = 'flex-end';
  header.style.gap = '0.4rem';
  header.style.marginBottom = '0.4rem';

  const humanIds = sorted.filter((u) => u.player === 'human').map((u) => u.id);
  if (!ctrlKeyActive) {
    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.className = 'unit-select';
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.addEventListener('click', () => {
      replaceSelection(humanIds);
      hideStackCallout();
      updateSidebar();
      updateRangedSidebar();
      redraw();
    });
    header.appendChild(selectAllBtn);
  } else {
    const addAllBtn = document.createElement('button');
    addAllBtn.type = 'button';
    addAllBtn.className = 'unit-select';
    addAllBtn.textContent = 'Add All';
    addAllBtn.addEventListener('click', () => {
      addUnitsToSelection(humanIds);
      showStackCallout(units, clientX, clientY);
      updateSidebar();
      updateRangedSidebar();
      redraw();
    });
    const removeAllBtn = document.createElement('button');
    removeAllBtn.type = 'button';
    removeAllBtn.className = 'unit-select';
    removeAllBtn.textContent = 'Remove All';
    removeAllBtn.addEventListener('click', () => {
      removeUnitsFromSelection(humanIds);
      showStackCallout(units, clientX, clientY);
      updateSidebar();
      updateRangedSidebar();
      redraw();
    });
    header.appendChild(addAllBtn);
    header.appendChild(removeAllBtn);
  }
  calloutEl.insertBefore(header, listEl);
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
      const inSelection = selectedUnitIds.includes(u.id);
      btn.textContent = ctrlKeyActive ? (inSelection ? 'Remove' : 'Add') : 'Select';
      btn.addEventListener('click', () => {
        if (ctrlKeyActive) {
          toggleUnitSelection(u.id);
          showStackCallout(units, clientX, clientY);
        } else {
          selectUnitOnMap(u.id);
          hideStackCallout();
        }
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

function refreshStackCalloutIfOpen(): void {
  const calloutEl = document.getElementById('stack-callout');
  if (!calloutEl || calloutEl.classList.contains('hidden')) return;
  const rawX = calloutEl.getAttribute('data-x');
  const rawY = calloutEl.getAttribute('data-y');
  const rawUnitIds = calloutEl.getAttribute('data-unit-ids');
  if (!rawX || !rawY || !rawUnitIds || !gameState) return;
  let unitIds: string[] = [];
  try {
    const parsed = JSON.parse(rawUnitIds);
    if (Array.isArray(parsed)) unitIds = parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return;
  }
  const units = unitIds
    .map((id) => gameState.units.find((u) => u.id === id))
    .filter((unit): unit is NonNullable<typeof unit> => !!unit);
  if (units.length === 0) {
    hideStackCallout();
    return;
  }
  showStackCallout(units, Number(rawX), Number(rawY));
}

const TOOLTIP_OFFSET_PX = 12;

/** Dwell time on the same hex before showing the terrain type tooltip (pointer may move within the hex). */
const TERRAIN_TOOLTIP_DELAY_MS = 750;

/** World map H3 resolution; must match main process mapData and terrain CSV. */
const WORLD_H3_RESOLUTION = 1;
const DETAIL_H3_RESOLUTION = 4;
const RES4_SHOW_THRESHOLD_VIEW_FRACTION = 0.8;
const RES4_HIDE_THRESHOLD_VIEW_FRACTION = 0.7;
const INITIAL_CAMERA_ZOOM_IN_LEVELS = 1;

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
    (hx.terrain === 'water' ? 'water' : hx.terrain === 'coastal' ? 'coastal' : hx.terrain === 'wetlands' ? 'wetlands' : 'plains'),
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
  urbanHexCount: number | null;
  res1TerrainSummary: string | null;
  res1FeaturesSummary: string | null;
}

interface NamingLookupTarget {
  h3Index: string;
  resolution: 1 | 4;
}

function countUrbanRes4HexesInRes1Hex(parentH3: string): number {
  let children = res4ChildrenByParent.get(parentH3);
  if (!children) {
    children = cellToChildren(parentH3, DETAIL_H3_RESOLUTION);
    res4ChildrenByParent.set(parentH3, children);
  }
  let count = 0;
  for (const child of children) {
    if (res4TerrainOverridesByH3.get(child)?.isUrban) count++;
  }
  return count;
}

function roundToNearestInteger(value: number): number {
  return Math.round(value);
}

function formatPercentInteger(value: number): string {
  return value.toLocaleString();
}

const res1DominantTerrainKindByH3 = new Map<string, string>();
const res1TerrainSummaryByH3 = new Map<string, string>();
const res1FeaturesSummaryByH3 = new Map<string, string | null>();

function clearRes1TooltipSummaryCaches(): void {
  res1DominantTerrainKindByH3.clear();
  res1TerrainSummaryByH3.clear();
  res1FeaturesSummaryByH3.clear();
  terrainTooltipHtmlByContentKey.clear();
}

function getRes1DominantTerrainKind(h3: string, parentKind: string): string {
  const cached = res1DominantTerrainKindByH3.get(h3);
  if (cached !== undefined) return cached;
  let children = res4ChildrenByParent.get(h3);
  if (!children) {
    children = cellToChildren(h3, DETAIL_H3_RESOLUTION);
    res4ChildrenByParent.set(h3, children);
  }
  if (children.length <= 0) {
    res1DominantTerrainKindByH3.set(h3, parentKind);
    return parentKind;
  }
  const counts = new Map<string, number>();
  for (const child of children) {
    const kind = res4TerrainOverridesByH3.get(child)?.terrainKind ?? parentKind;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  let dominantKind = parentKind;
  let dominantCount = -1;
  for (const [kind, count] of counts.entries()) {
    if (count > dominantCount || (count === dominantCount && kind.localeCompare(dominantKind) < 0)) {
      dominantKind = kind;
      dominantCount = count;
    }
  }
  res1DominantTerrainKindByH3.set(h3, dominantKind);
  return dominantKind;
}

function getRes1TerrainSummary(h3: string, parentKind: string): string {
  const cached = res1TerrainSummaryByH3.get(h3);
  if (cached !== undefined) return cached;
  let children = res4ChildrenByParent.get(h3);
  if (!children) {
    children = cellToChildren(h3, DETAIL_H3_RESOLUTION);
    res4ChildrenByParent.set(h3, children);
  }
  const total = children.length;
  if (total <= 0) {
    const fallback = `${formatTerrainKindLabel(parentKind)} (100.0%)`;
    res1TerrainSummaryByH3.set(h3, fallback);
    return fallback;
  }
  const counts = new Map<string, number>();
  for (const child of children) {
    const kind = res4TerrainOverridesByH3.get(child)?.terrainKind ?? parentKind;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const entries = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  if (entries.length <= 3) {
    const parts = entries.map(([kind, count]) => {
      const pct = roundToNearestInteger((count * 100) / total);
      return `${formatTerrainKindLabel(kind)} (${formatPercentInteger(pct)}%)`;
    });
    const summary = parts.join(', ');
    res1TerrainSummaryByH3.set(h3, summary);
    return summary;
  }
  const topTwo = entries.slice(0, 2);
  const topTwoCount = topTwo.reduce((sum, [, count]) => sum + count, 0);
  const parts = topTwo.map(([kind, count]) => {
    const pct = roundToNearestInteger((count * 100) / total);
    return `${formatTerrainKindLabel(kind)} (${formatPercentInteger(pct)}%)`;
  });
  const otherPct = roundToNearestInteger(((total - topTwoCount) * 100) / total);
  parts.push(`Other (${formatPercentInteger(otherPct)}%)`);
  const summary = parts.join(', ');
  res1TerrainSummaryByH3.set(h3, summary);
  return summary;
}

function getRes1FeaturesSummary(h3: string): string | null {
  if (res1FeaturesSummaryByH3.has(h3)) return res1FeaturesSummaryByH3.get(h3) ?? null;
  const labels = featureLabelsForRes1Hex(h3);
  if (labels.length === 0) {
    res1FeaturesSummaryByH3.set(h3, null);
    return null;
  }
  let children = res4ChildrenByParent.get(h3);
  if (!children) {
    children = cellToChildren(h3, DETAIL_H3_RESOLUTION);
    res4ChildrenByParent.set(h3, children);
  }
  let airportCount = 0;
  let portCount = 0;
  for (const child of children) {
    if (terrainInfraRes4Airport.has(child)) airportCount++;
    if (terrainInfraRes4Port.has(child)) portCount++;
  }
  const parts: string[] = [];
  if (labels.includes('Airports')) parts.push(`Airports (${airportCount.toLocaleString()})`);
  if (labels.includes('Ports')) parts.push(`Ports (${portCount.toLocaleString()})`);
  const summary = parts.length > 0 ? parts.join(', ') : null;
  res1FeaturesSummaryByH3.set(h3, summary);
  return summary;
}

function terrainTooltipStateForRes1Hex(h3: string): TerrainTooltipState {
  const state = terrainStateForRes1Hex(h3);
  return {
    ...state,
    features: featureLabelsForRes1Hex(h3),
    urbanHexCount: countUrbanRes4HexesInRes1Hex(h3),
    res1TerrainSummary: getRes1TerrainSummary(h3, state.terrainKind),
    res1FeaturesSummary: getRes1FeaturesSummary(h3),
  };
}

function terrainStateForPointer(
  clientX: number,
  clientY: number,
  fallbackRes1H3: string | null
): TerrainTooltipState {
  if (!gameState) {
    return {
      terrainKind: 'Unknown',
      isUrban: false,
      features: [],
      urbanHexCount: null,
      res1TerrainSummary: null,
      res1FeaturesSummary: null,
    };
  }
  const res4On = shouldRenderRes4Hexes();
  if (!res4On) {
    if (!fallbackRes1H3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        features: [],
        urbanHexCount: null,
        res1TerrainSummary: null,
        res1FeaturesSummary: null,
      };
    }
    return terrainTooltipStateForRes1Hex(fallbackRes1H3);
  }
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
      }
    | null;
  if (!map) {
    if (!fallbackRes1H3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        features: [],
        urbanHexCount: null,
        res1TerrainSummary: null,
        res1FeaturesSummary: null,
      };
    }
    return terrainTooltipStateForRes1Hex(fallbackRes1H3);
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
      urbanHexCount: null,
      res1TerrainSummary: null,
      res1FeaturesSummary: null,
    };
  } catch {
    if (!fallbackRes1H3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        features: [],
        urbanHexCount: null,
        res1TerrainSummary: null,
        res1FeaturesSummary: null,
      };
    }
    return terrainTooltipStateForRes1Hex(fallbackRes1H3);
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
const terrainTooltipHtmlByContentKey = new Map<string, string>();
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

function formatGroupedNamingLineHtml(namingLine: string): string {
  const groups = namingLine
    .split(';')
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
  if (groups.length === 0) return escapeHtml(namingLine);
  const formattedGroups = groups.map((group) => {
    const colonIdx = group.indexOf(':');
    if (colonIdx < 0) return escapeHtml(group);
    const heading = group.slice(0, colonIdx).trim();
    const remainder = group.slice(colonIdx + 1).trim();
    if (!heading) return escapeHtml(group);
    if (!remainder) return `<strong>${escapeHtml(heading)}:</strong>`;
    return `<strong>${escapeHtml(heading)}:</strong> ${escapeHtml(remainder)}`;
  });
  return formattedGroups.join('; ');
}

function formatTerrainTooltipHtml(state: TerrainTooltipState, namingLine: string | null): string {
  const terrainLabel = formatTerrainKindLabel(state.terrainKind);
  const terrainValue = state.res1TerrainSummary ?? (state.isUrban ? `${terrainLabel}, Urban` : terrainLabel);
  const terrainLine = `<strong>Terrain:</strong> ${terrainValue}`;
  const bodyParts: string[] = [terrainLine];
  if (state.res1FeaturesSummary != null) bodyParts.push(`<strong>Features:</strong> ${state.res1FeaturesSummary}`);
  else if (state.features.length > 0) bodyParts.push(`<strong>Features:</strong> ${state.features.join(', ')}`);
  if (state.urbanHexCount != null) bodyParts.push(`<strong>Urban Hexes:</strong> ${state.urbanHexCount.toLocaleString()}`);
  const bodyLine = bodyParts.join('<br/>');
  if (!namingLine) return bodyLine;
  return `${formatGroupedNamingLineHtml(namingLine)}<br/>${bodyLine}`;
}

function terrainTooltipContentKey(state: TerrainTooltipState, namingLine: string | null): string {
  const namingKey = namingLine ?? '';
  const urbanKey = state.isUrban ? '1' : '0';
  const featuresKey = state.features.join('|');
  const urbanHexCountKey = state.urbanHexCount == null ? 'x' : String(state.urbanHexCount);
  const res1TerrainSummaryKey = state.res1TerrainSummary ?? '';
  const res1FeaturesSummaryKey = state.res1FeaturesSummary ?? '';
  return `${namingKey}::${state.terrainKind}::${urbanKey}::${featuresKey}::${urbanHexCountKey}::${res1TerrainSummaryKey}::${res1FeaturesSummaryKey}`;
}

function getCachedTerrainTooltipHtml(state: TerrainTooltipState, namingLine: string | null): string {
  const key = terrainTooltipContentKey(state, namingLine);
  const cachedHtml = terrainTooltipHtmlByContentKey.get(key);
  if (cachedHtml !== undefined) return cachedHtml;
  const html = formatTerrainTooltipHtml(state, namingLine);
  terrainTooltipHtmlByContentKey.set(key, html);
  if (terrainTooltipHtmlByContentKey.size > 4096) terrainTooltipHtmlByContentKey.clear();
  return html;
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
  el.innerHTML = getCachedTerrainTooltipHtml(state, namingLine);
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
let selectedUnitIds: string[] = [];
/** Selection snapshot at mousedown; used so double-click can issue group move without reselecting first. */
let selectedUnitIdsAtMouseDown: string[] = [];
let ctrlKeyActive = false;
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
  unknownCombatHexes?: string[];
  unknownCasualtyHexes?: string[];
} | null = null;
let resolutionMoveAnimationFrameId: number | null = null;
let initialCameraApplied = false;
const clientStaleEnemyIntelByUnitId = new Map<string, {
  unitId: string;
  lastKnownH3Index: string;
  lastSeenTurn: number;
  staleUntilTurn: number;
}>();
const lastRenderedVisibleEnemyByUnitId = new Map<string, { h3Index: string; lastSeenTurn: number }>();
const lastObservedEnemyByUnitId = new Map<string, { h3Index: string; lastSeenTurn: number }>();

let redrawRafId: number | null = null;

function getPrimarySelectedUnitId(): string | null {
  return selectedUnitIds[0] ?? null;
}

function reconcileSelectionToCurrentState(): void {
  if (!gameState) {
    selectedUnitIds = [];
    return;
  }
  const validHumanUnitIds = new Set(gameState.units.filter((u) => u.player === 'human').map((u) => u.id));
  selectedUnitIds = selectedUnitIds.filter((id) => validHumanUnitIds.has(id));
}

function replaceSelection(unitIds: string[]): void {
  const unique = [...new Set(unitIds)];
  selectedUnitIds = unique;
  reconcileSelectionToCurrentState();
  if (selectedUnitIds.length === 0) {
    selectedHexIndex = null;
    hoverRoutePreview = null;
    hoverPreviewRequestSeq++;
    rangedModeActive = false;
    return;
  }
  const primary = gameState?.units.find((u) => u.id === selectedUnitIds[0]);
  selectedHexIndex = primary?.h3Index ?? null;
}

function addUnitsToSelection(unitIds: string[]): void {
  replaceSelection([...selectedUnitIds, ...unitIds]);
}

function removeUnitsFromSelection(unitIds: string[]): void {
  const remove = new Set(unitIds);
  replaceSelection(selectedUnitIds.filter((id) => !remove.has(id)));
}

function toggleUnitSelection(unitId: string): void {
  if (selectedUnitIds.includes(unitId)) {
    removeUnitsFromSelection([unitId]);
  } else {
    addUnitsToSelection([unitId]);
  }
}

function clearSelection(): void {
  replaceSelection([]);
}

function getVisibleHexSet(state: GameStateSnapshot | null): Set<string> {
  if (!state) return new Set<string>();
  if (!Array.isArray(state.visibleHexes)) return new Set(state.hexes.map((h) => h.h3Index));
  return new Set(state.visibleHexes);
}

function getExploredHexSet(state: GameStateSnapshot | null): Set<string> {
  if (!state) return new Set<string>();
  if (!Array.isArray(state.exploredHexes)) return new Set(state.hexes.map((h) => h.h3Index));
  return new Set(state.exploredHexes);
}

function isHexExploredByPlayer(h3Index: string): boolean {
  if (!gameState) return false;
  const explored = getExploredHexSet(gameState);
  return explored.has(h3Index);
}

function inferUnitTypeLabelFromId(unitId: string): string {
  if (unitId.includes('-infantry-')) return 'I';
  if (unitId.includes('-armor-')) return 'A';
  if (unitId.includes('-naval-')) return 'N';
  return '?';
}

function formatUnknownBattleAnnouncement(continentNames: string[]): string {
  const clean = continentNames
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((name, idx, arr) => arr.indexOf(name) === idx);
  if (clean.length === 0) return 'Unknown battle observed in an unidentified continent.';
  if (clean.length === 1) return `Unknown battle observed in ${clean[0]}.`;
  if (clean.length === 2) return `Unknown battle observed in ${clean[0]} or ${clean[1]}.`;
  return `Unknown battle observed in ${clean.slice(0, -1).join(', ')}, or ${clean[clean.length - 1]}.`;
}
function requestRedraw(): void {
  if (resolutionMoveAnimation) return;
  if (redrawRafId !== null) return;

  redrawRafId = requestAnimationFrame(() => {
    redrawRafId = null;
    redraw();
  });
}

/**
 * Maintains the client-side stale enemy intel cache across state transitions. Call after every
 * gameState update (ready, initial load, new game). Compares the previous and current visible enemy
 * sets to create stale entries for enemies that just left view, and culls entries that are now
 * contradicted (hex visible but enemy gone), expired, or re-sighted. Works alongside the persisted
 * DB intel; the draw function merges both sources so stale markers appear even when DB rows lag.
 */
function updateClientStaleEnemyIntel(previousState: GameStateSnapshot | null, state: GameStateSnapshot): void {
  const currentTurn = state.turnNumber;
  const hasFogData = Array.isArray(state.visibleHexes);
  const visibleHexes = hasFogData ? new Set(state.visibleHexes!) : new Set<string>();
  const visibleEnemiesNow = state.units.filter((u) => u.player !== 'human');
  const visibleEnemyIdsNow = new Set(visibleEnemiesNow.map((u) => u.id));
  const visibleEnemyHexesNow = new Set(visibleEnemiesNow.map((u) => u.h3Index));

  for (const enemy of visibleEnemiesNow) {
    lastObservedEnemyByUnitId.set(enemy.id, { h3Index: enemy.h3Index, lastSeenTurn: currentTurn });
    clientStaleEnemyIntelByUnitId.delete(enemy.id);
  }

  if (previousState) {
    const previousVisibleEnemies = previousState.units.filter((u) => u.player !== 'human');
    for (const enemy of previousVisibleEnemies) {
      if (visibleEnemyIdsNow.has(enemy.id)) continue;
      lastObservedEnemyByUnitId.set(enemy.id, {
        h3Index: enemy.h3Index,
        lastSeenTurn: previousState.turnNumber,
      });
      if (!hasFogData || !visibleHexes.has(enemy.h3Index)) {
        clientStaleEnemyIntelByUnitId.set(enemy.id, {
          unitId: enemy.id,
          lastKnownH3Index: enemy.h3Index,
          lastSeenTurn: previousState.turnNumber,
          staleUntilTurn: previousState.turnNumber + 2,
        });
      }
    }
  }

  for (const [unitId, stale] of clientStaleEnemyIntelByUnitId) {
    const isNowVisible = visibleEnemyIdsNow.has(unitId);
    const contradictedOnVisibleHex = hasFogData && visibleHexes.has(stale.lastKnownH3Index) && !visibleEnemyHexesNow.has(stale.lastKnownH3Index);
    const expired = currentTurn > stale.staleUntilTurn;
    if (isNowVisible || contradictedOnVisibleHex || expired) {
      clientStaleEnemyIntelByUnitId.delete(unitId);
      lastRenderedVisibleEnemyByUnitId.delete(unitId);
    }
  }
}

type PanDirection = 'north' | 'south' | 'west' | 'east';

function shouldIgnoreGlobalKeydown(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!target.isContentEditable;
}

function getNeighborForPan(centerH3: string, direction: PanDirection): string | null {
  const [centerLat, centerLng] = cellToLatLng(centerH3);
  const neighbors = Array.from(gridDisk(centerH3, 1)).filter((h3) => h3 !== centerH3);
  if (neighbors.length === 0) return null;
  let bestH3: string | null = null;
  let bestScore = direction === 'north' || direction === 'east' ? -Infinity : Infinity;
  for (const h3 of neighbors) {
    const [lat, lng] = cellToLatLng(h3);
    const alignedLng = alignLngToReference(lng, centerLng);
    const deltaLng = alignedLng - centerLng;
    const deltaLat = lat - centerLat;
    const score =
      direction === 'north'
        ? deltaLat
        : direction === 'south'
          ? deltaLat
          : direction === 'east'
            ? deltaLng
            : deltaLng;
    if (direction === 'north' || direction === 'east') {
      if (score > bestScore) {
        bestScore = score;
        bestH3 = h3;
      }
    } else if (score < bestScore) {
      bestScore = score;
      bestH3 = h3;
    }
  }
  return bestH3;
}

function panMapOneRes1Hex(direction: PanDirection): void {
  const map = getMainLeafletMap() as {
    getCenter: () => { lat: number; lng: number };
    setView: (center: unknown, zoom: number) => unknown;
    getZoom: () => number;
  } | null;
  const Lref = (globalThis as unknown as { L?: { latLng: (lat: number, lng: number) => unknown } }).L;
  if (!map || !Lref) return;
  const center = map.getCenter();
  let centerH3: string;
  try {
    centerH3 = latLngToCell(center.lat, center.lng, WORLD_H3_RESOLUTION);
  } catch {
    return;
  }
  const neighbor = getNeighborForPan(centerH3, direction);
  if (!neighbor) return;
  const [nextLat, nextLngRaw] = cellToLatLng(neighbor);
  const nextLng = alignLngToReference(nextLngRaw, center.lng);
  map.setView(Lref.latLng(clampLatForWebMercatorDisplay(nextLat), nextLng), map.getZoom());
}

function applyInitialCameraForState(state: GameStateSnapshot): void {
  const map = getMainLeafletMap() as {
    getZoom: () => number;
    getMaxZoom?: () => number;
    setView: (center: unknown, zoom: number) => unknown;
  } | null;
  const Lref = (globalThis as unknown as { L?: { latLng: (lat: number, lng: number) => unknown } }).L;
  if (!map || !Lref) return;

  const humanGround = state.units.filter((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
  const anchors = humanGround.length > 0 ? humanGround : state.units.filter((u) => u.player === 'human');
  if (anchors.length === 0) return;

  const [, anchorLng] = cellToLatLng(anchors[0]!.h3Index);
  let latSum = 0;
  let lngSum = 0;
  for (const unit of anchors) {
    const [lat, lng] = cellToLatLng(unit.h3Index);
    latSum += lat;
    lngSum += alignLngToReference(lng, anchorLng);
  }
  const centerLat = latSum / anchors.length;
  const centerLng = lngSum / anchors.length;
  const maxZoom = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : 12;
  const targetZoom = Math.min(maxZoom, map.getZoom() + INITIAL_CAMERA_ZOOM_IN_LEVELS);
  map.setView(Lref.latLng(clampLatForWebMercatorDisplay(centerLat), centerLng), targetZoom);
  initialCameraApplied = true;
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
  const exploredHexes = getExploredHexSet(gameState);
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
    if (!exploredHexes.has(parentH3)) return null;
    return mapHexSet.has(parentH3) ? detailH3 : null;
  } catch {
    return null;
  }
}

function drawTerrainHexes(ctx: CanvasRenderingContext2D): void {
  if (!gameState) return;
  const exploredHexes = getExploredHexSet(gameState);
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
      getRes1DominantTerrainKind(
        hx.h3Index,
        hx.terrainKind ??
          (hx.terrain === 'water' ? 'water' : hx.terrain === 'coastal' ? 'coastal' : hx.terrain === 'wetlands' ? 'wetlands' : 'plains')
      );
    const drawClosedPath = (): void => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };
    const explored = exploredHexes.has(hx.h3Index);
    if (explored && reverseTerrainFillWhileHeld) {
      fillHexTerrain(ctx, kind, drawClosedPath, {
        fillAndHatchAlphaScale: hoveredHexH3 === hx.h3Index ? 0.6 : 1,
        landHoverFill: kind === 'plains',
        isUrban: false,
      });
    } else if (explored && !res4Active && hoveredHexH3 === hx.h3Index) {
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
  const exploredHexes = getExploredHexSet(gameState);
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
    if (!exploredHexes.has(parent.h3Index)) continue;
    const parentPts = projectHexBoundaryToContainerPoints(parent.h3Index, map, L);
    if (!projectedPolygonOverlapsViewport(parentPts, viewportWidth, viewportHeight)) continue;
    const parentKind =
      parent.terrainKind ??
      (parent.terrain === 'water'
        ? 'water'
        : parent.terrain === 'coastal'
          ? 'coastal'
          : parent.terrain === 'wetlands'
            ? 'wetlands'
            : 'plains');
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
  if (!isHexExploredByPlayer(h3)) return false;
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
  if (!isHexExploredByPlayer(parentH3)) return false;
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
function bulletizeToastLines(message: string): string {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return '•';
  return lines
    .map((line) => (line.startsWith('•') ? line : `• ${line}`))
    .join('\n');
}

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
    textEl.appendChild(document.createTextNode('\n' + bulletizeToastLines(message)));
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
 * Draws a neutral loading canvas while map/game state is still initializing.
 */
function drawLoadingScene(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#666';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Loading…', width / 2, height / 2);
}

/**
 * Draws the full tactical scene for the current frame. Use from both resize and animation redraw paths
 * so terrain, units, stale intel, and combat overlays stay behaviorally identical.
 */
function drawGameScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: GameStateSnapshot
): void {
  ctx.clearRect(0, 0, width, height);
  drawTerrainHexes(ctx);
  drawRes4TerrainHexes(ctx);
  const hexList = state.hexes.map((h) => h.h3Index);
  let moveProgress = 1;
  let unitsToDraw: GameStateSnapshot['units'] = state.units;
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
      const preMoveSurvivors = state.units
        .filter((u) => !rangedRemovedIds.has(u.id))
        .map((u) => {
          const move = anim.moves.find((m) => m.unitId === u.id);
          return move ? { ...u, h3Index: move.fromH3Index } : u;
        });
      unitsToDraw = [...preMoveSurvivors, ...(anim.rangedRemovedUnits ?? [])];
      movingIds = undefined;
    } else if (phase.inMovement) {
      unitsToDraw = state.units;
      movingIds = moveProgress < 1 ? new Set(anim.moves.map((m) => m.unitId)) : undefined;
    } else if (phase.inMeleeLightning || phase.inMeleeCasualty) {
      unitsToDraw = [...state.units, ...(anim.meleeRemovedUnits ?? [])];
      movingIds = undefined;
    }
    if (elapsed >= phase.movementStart) {
      drawResolutionMoveLines(ctx, width, height, anim.moves, state.units, hexList, 1);
    }
  } else {
    movingIds = undefined;
  }
  if (!hideCommittedOrderLinesAfterReady && humanStandingOrders.length > 0 && state.units.length) {
    drawStandingOrderLines(ctx, humanStandingOrders, state.units);
  }
  if (!anim) drawHoverRoutePreview(ctx);
  if (pendingRangedAttacks.length > 0 && state.units.length && hexList) {
    drawRangedAttackLines(ctx, width, height, pendingRangedAttacks, state.units, hexList);
  }
  if (unitsToDraw.length) {
    drawUnits(ctx, width, height, unitsToDraw, hexList, movingIds);
  }
  drawStaleEnemyIntel(ctx, state);
  if (anim && hexList && moveProgress < 1) {
    drawMovingUnits(ctx, width, height, anim.moves, state.units, hexList, moveProgress);
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
      const unknownSet = new Set(anim.unknownCombatHexes ?? []);
      const knownCombatHexes = combatHexes.filter((h3) => !unknownSet.has(h3));
      const unknownCombatHexes = combatHexes.filter((h3) => unknownSet.has(h3));
      drawCombatLightning(ctx, width, height, knownCombatHexes, hexList, pulseOpacity);
      drawUnknownBattleMarkers(ctx, unknownCombatHexes, pulseOpacity);
    }
    const casualtyHexes = phase.inRangedCasualty ? (anim.rangedCasualtyHexes ?? anim.casualtyHexes) : phase.inMeleeCasualty ? anim.meleeCasualtyHexes : undefined;
    if (casualtyHexes?.length) {
      const casualtyElapsed = phase.inRangedCasualty
        ? elapsed - (hasRangedCombat ? LIGHTNING_DURATION_MS : 0)
        : elapsed - (phase.movementStart + RESOLUTION_FADE_MS + (hasMeleeCombat ? LIGHTNING_DURATION_MS : 0));
      const pulseOpacity = 0.5 + 0.5 * Math.sin(casualtyElapsed * 0.008);
      const unknownSet = new Set(anim.unknownCasualtyHexes ?? []);
      const knownCasualtyHexes = casualtyHexes.filter((h3) => !unknownSet.has(h3));
      const unknownCasualtyHexes = casualtyHexes.filter((h3) => unknownSet.has(h3));
      drawCasualtyOverlay(ctx, width, height, knownCasualtyHexes, hexList, pulseOpacity);
      drawUnknownBattleMarkers(ctx, unknownCasualtyHexes, pulseOpacity);
    }
  }
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
    drawLoadingScene(ctx, w, h);
    return;
  }
  drawGameScene(ctx, w, h, gameState);
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

/** Draws stale enemy intel markers as transparent unit icons with fixed two-turn fade schedule. */
function drawStaleEnemyIntel(ctx: CanvasRenderingContext2D, state: GameStateSnapshot): void {
  const hasFogData = Array.isArray(state.visibleHexes);
  const currentlyVisibleEnemies = state.units.filter((u) => u.player !== 'human');
  const currentlyVisibleEnemyIds = new Set(currentlyVisibleEnemies.map((u) => u.id));
  for (const [unitId, prevSeen] of lastRenderedVisibleEnemyByUnitId) {
    if (currentlyVisibleEnemyIds.has(unitId)) continue;
    if (!clientStaleEnemyIntelByUnitId.has(unitId)) {
      const lastSeenTurn = Math.min(prevSeen.lastSeenTurn, Math.max(1, state.turnNumber - 1));
      clientStaleEnemyIntelByUnitId.set(unitId, {
        unitId,
        lastKnownH3Index: prevSeen.h3Index,
        lastSeenTurn,
        staleUntilTurn: lastSeenTurn + 2,
      });
    }
  }
  lastRenderedVisibleEnemyByUnitId.clear();
  for (const enemy of currentlyVisibleEnemies) {
    lastRenderedVisibleEnemyByUnitId.set(enemy.id, {
      h3Index: enemy.h3Index,
      lastSeenTurn: state.turnNumber,
    });
  }

  if (!hasFogData) return;

  const persistedIntel = Array.isArray(state.enemyIntel) ? state.enemyIntel : [];
  const fallbackIntel = Array.from(clientStaleEnemyIntelByUnitId.values()).map((row) => ({
    unitId: row.unitId,
    lastKnownH3Index: row.lastKnownH3Index,
    intelState: 'stale' as const,
    lastSeenTurn: row.lastSeenTurn,
    staleUntilTurn: row.staleUntilTurn,
  }));
  const byUnitId = new Map<string, typeof fallbackIntel[number]>();
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
    drawOneUnitMarker(ctx, x, y, PLAYER_COLORS.opponent, label);
    ctx.restore();
  }
}

const LIGHTNING_COLOR = '#f0d000';

function drawUnknownBattleMarkers(
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
  const selectedSet = new Set(selectedUnitIds);
  for (const order of orders) {
    // While the player is actively re-planning a selected unit, hide that unit's committed path.
    if (selectedSet.has(order.unitId)) continue;
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
  const previewGroup = hoverRoutePreview.data;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const selectedHumanUnits = selectedUnitIds
    .map((id) => gameState.units.find((u) => u.id === id))
    .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human');
  const slowestMovementRangeByOriginH3 = new Map<string, number>();
  for (const unit of selectedHumanUnits) {
    const movementRange = MOVEMENT_RANGE[unit.unitType] ?? 1;
    const prior = slowestMovementRangeByOriginH3.get(unit.h3Index);
    if (prior === undefined || movementRange < prior) {
      slowestMovementRangeByOriginH3.set(unit.h3Index, movementRange);
    }
  }
  for (const perUnit of previewGroup.previews) {
    const preview = perUnit.preview;
    if (preview.segments.length === 0) continue;
    const previewUnit = gameState.units.find((u) => u.id === perUnit.unitId);
    const perStackSolidCap =
      previewUnit && slowestMovementRangeByOriginH3.has(previewUnit.h3Index)
        ? slowestMovementRangeByOriginH3.get(previewUnit.h3Index)!
        : previewGroup.slowestMovementRange;
    let lastSegmentPenultimate: { x: number; y: number } | null = null;
    let lastSegmentLast: { x: number; y: number } | null = null;
    let remainingSolidEdges = perStackSolidCap;
    ctx.save();
    ctx.globalAlpha = preview.valid ? 0.55 : 0.75;
    for (const seg of preview.segments) {
      if (!Array.isArray(seg.hexes) || seg.hexes.length < 2) continue;
      const points = seg.hexes.map(([lat, lng]) => {
        const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
        return { x: p.x, y: p.y };
      });
      const edgeCount = Math.max(0, points.length - 1);
      if (remainingSolidEdges >= edgeCount) {
        ctx.setLineDash([]);
        ctx.strokeStyle = ORDER_LINE_COLOR;
        ctx.lineWidth = ORDER_LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      } else if (remainingSolidEdges <= 0) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = ORDER_LINE_COLOR;
        ctx.lineWidth = ORDER_LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      } else {
        const splitIndex = Math.min(points.length - 1, remainingSolidEdges);
        const solidPoints = points.slice(0, splitIndex + 1);
        if (solidPoints.length >= 2) {
          ctx.setLineDash([]);
          ctx.strokeStyle = ORDER_LINE_COLOR;
          ctx.lineWidth = ORDER_LINE_WIDTH;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          strokePolylineSkippingWrap(ctx, solidPoints, ctx.canvas.width * 0.5);
        }
        const dashedPoints = points.slice(splitIndex);
        if (dashedPoints.length >= 2) {
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = ORDER_LINE_COLOR;
          ctx.lineWidth = ORDER_LINE_WIDTH;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          strokePolylineSkippingWrap(ctx, dashedPoints, ctx.canvas.width * 0.5);
        }
      }
      remainingSolidEdges -= edgeCount;
      lastSegmentPenultimate = points[points.length - 2] ?? null;
      lastSegmentLast = points[points.length - 1] ?? null;
    }
    ctx.setLineDash([]);
    if (lastSegmentPenultimate && lastSegmentLast) {
      drawArrowheadOnly(ctx, lastSegmentPenultimate, lastSegmentLast, ORDER_LINE_COLOR, {
        tipAtTargetCenter: true,
      });
    } else if (preview.arrowLatLng && preview.segments.length > 0) {
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
    ctx.restore();
  }
  if (previewGroup.showInvalidMarker && hoveredHexH3) {
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
    drawLoadingScene(ctx, w, h);
    return;
  }
  drawGameScene(ctx, w, h, gameState);
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
    // Re-enable committed path rendering at the end of resolution playback.
    hideCommittedOrderLinesAfterReady = false;
    redraw();
  }
}

/** Updates the sidebar with the selected unit or placeholder. */
function updateSidebar(): void {
  const selectedUnitEl = document.getElementById('sidebar-selected-unit');
  if (selectedUnitEl) {
    const primary = getPrimarySelectedUnitId();
    if (selectedUnitIds.length <= 1) selectedUnitEl.textContent = primary ?? '—';
    else selectedUnitEl.textContent = `${primary} (+${selectedUnitIds.length - 1})`;
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
      reconcileSelectionToCurrentState();
      clientStaleEnemyIntelByUnitId.clear();
      lastObservedEnemyByUnitId.clear();
      lastRenderedVisibleEnemyByUnitId.clear();
      updateClientStaleEnemyIntel(null, state);
      initialCameraApplied = false;
      if (state.hexes.length > 0) {
        applyInitialCameraForState(state);
      }
      clearRes1TooltipSummaryCaches();
      humanStandingOrders = [];
      hoverRoutePreview = null;
      pendingRangedAttacks = [];
      rangedModeActive = false;
      selectedUnitIds = [];
      selectedUnitIdsAtMouseDown = [];
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

/** Selects a unit on the map by id; replaces selection with that unit and redraws. */
function selectUnitOnMap(unitId: string): void {
  const unit = gameState?.units.find((u) => u.id === unitId);
  if (!unit) return;
  replaceSelection([unit.id]);
  updateSidebar();
  updateRangedSidebar();
  void refreshHoverRoutePreview();
  redraw();
}

async function refreshHoverRoutePreview(): Promise<void> {
  const unitIds = [...selectedUnitIds];
  const hoveredH3 = hoveredHexH3;
  const seq = ++hoverPreviewRequestSeq;
  if (rangedModeActive || !window.gameApi?.previewHumanMarchOrders || unitIds.length === 0 || !hoveredH3 || !gameState) {
    hoverRoutePreview = null;
    requestRedraw();
    return;
  }
  const data = await window.gameApi.previewHumanMarchOrders({ unitIds, hoveredH3Index: hoveredH3 });
  // Ignore stale async responses so preview always matches current hovered hex.
  if (seq !== hoverPreviewRequestSeq) return;
  if (hoveredHexH3 !== hoveredH3) return;
  const currentSelected = [...selectedUnitIds].sort().join('|');
  const requestedSelected = [...unitIds].sort().join('|');
  if (currentSelected !== requestedSelected) return;
  hoverRoutePreview = { hoveredH3Index: hoveredH3, data };
  requestRedraw();
}

function cancelRangedForUnit(unitId: string): void {
  pendingRangedAttacks = pendingRangedAttacks.filter((r) => r.unitId !== unitId);
  if (selectedUnitIds.includes(unitId)) {
    clearSelection();
    hoverRoutePreview = null;
    hoverPreviewRequestSeq++;
  }
  rangedModeActive = false;
  updateSidebar();
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
    const selectedUnits = selectedUnitIds
      .map((id) => gameState?.units.find((u) => u.id === id))
      .filter((unit): unit is NonNullable<typeof unit> => !!unit);
    const allHaveRanged = selectedUnits.length > 0 && selectedUnits.every((unit) => (RANGED_RANGE[unit.unitType] ?? 0) >= 1);
    if (allHaveRanged) {
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
      void refreshHoverRoutePreview();
    } else if (selectedUnitIds.length > 0 && gameState) {
      const selectedUnits = selectedUnitIds
        .map((id) => gameState.units.find((u) => u.id === id))
        .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human');
      const allHaveRanged = selectedUnits.length > 0 && selectedUnits.every((unit) => (RANGED_RANGE[unit.unitType] ?? 0) >= 1);
      if (allHaveRanged) {
        rangedModeActive = true;
        hoverPreviewRequestSeq++;
        hoverRoutePreview = null;
      }
    }
    updateRangedSidebar();
    redraw();
  });

  if (window.gameApi) {
    window.gameApi
      .getGameState()
      .then(async (raw) => {
        const state = raw as GameStateSnapshot;
        const previousState = gameState;
        gameState = state;
        reconcileSelectionToCurrentState();
        updateClientStaleEnemyIntel(previousState, state);
        if (!initialCameraApplied && state.hexes.length > 0) {
          applyInitialCameraForState(state);
        }
        clearRes1TooltipSummaryCaches();
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
        clearRes1TooltipSummaryCaches();
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
        clearRes1TooltipSummaryCaches();
        requestRedraw();
      })
      .catch((err) => console.error('getTerrainInfrastructureHints failed:', err));
  }

  window.addEventListener('resize', () => {
    resizeAndRedraw();
  });
  window.addEventListener('keydown', (e) => {
    if (shouldIgnoreGlobalKeydown(e)) return;
    if (e.repeat) return;
    if (e.key === 'Control') {
      ctrlKeyActive = true;
      refreshStackCalloutIfOpen();
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 't') {
      reverseTerrainFillWhileHeld = true;
      requestRedraw();
      return;
    }
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
      const direction: PanDirection =
        key === 'w' ? 'north' : key === 'a' ? 'west' : key === 's' ? 'south' : 'east';
      panMapOneRes1Hex(direction);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      ctrlKeyActive = false;
      refreshStackCalloutIfOpen();
      return;
    }
    if (e.key.toLowerCase() === 't') {
      reverseTerrainFillWhileHeld = false;
      requestRedraw();
    }
  });
  window.addEventListener('blur', () => {
    ctrlKeyActive = false;
    refreshStackCalloutIfOpen();
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
      if (hit && isHexExploredByPlayer(hit)) {
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
    if (tip && !tip.classList.contains('hidden') && hit && isHexExploredByPlayer(hit)) {
      const state = terrainStateForPointer(e.clientX, e.clientY, hit);
      const namingTarget = namingLookupTargetForPointer(e.clientX, e.clientY, hit);
      void showTerrainTooltip(e.clientX, e.clientY, state, namingTarget);
    } else if (tip && !tip.classList.contains('hidden') && hit && !isHexExploredByPlayer(hit)) {
      hideTerrainTooltipVisual();
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
    selectedUnitIdsAtMouseDown = [...selectedUnitIds];
    clearTerrainTooltipTimer();
    hideTerrainTooltipVisual();
  });

  mainMapEl.addEventListener('click', async (e) => {
    const hit = clientXYToHit(e.clientX, e.clientY);
    selectedHexIndex = hit;
    clearSidebarError();

    if (hit && rangedModeActive && selectedUnitIds.length > 0 && gameState) {
      if (!window.gameApi?.validateGroupRangedTarget) return;
      const selectedIds = [...selectedUnitIds];
      const validation = await window.gameApi.validateGroupRangedTarget({ unitIds: selectedIds, targetH3Index: hit });
      if (!validation.success) {
        showMapToast(validation.reason ?? 'Selected units cannot fire at that target.', { isError: true });
        return;
      }
      pendingRangedAttacks = pendingRangedAttacks.filter((r) => !selectedIds.includes(r.unitId));
      for (const unitId of selectedIds) {
        pendingRangedAttacks.push({ unitId, targetH3Index: hit });
      }
      rangedModeActive = false;
      clearSelection();
      hoverRoutePreview = null;
      hoverPreviewRequestSeq++;
      updateRangedSidebar();
      hideStackCallout();
      updateSidebar();
      redraw();
      return;
    }

    const unitsAtHit = hit ? getUnitsAtHex(hit) : [];
    const isStack = unitsAtHit.length >= 2;
    const isLoneAi = unitsAtHit.length === 1 && unitsAtHit[0]?.player !== 'human';
    if (hit && (isStack || isLoneAi)) {
      ctrlKeyActive = e.ctrlKey;
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
        if (e.ctrlKey) {
          if (pendingSelectTimeout !== null) {
            clearTimeout(pendingSelectTimeout);
            pendingSelectTimeout = null;
          }
          toggleUnitSelection(unit.id);
          void refreshHoverRoutePreview();
        } else if (pendingSelectTimeout !== null) {
          clearTimeout(pendingSelectTimeout);
          pendingSelectTimeout = null;
          /* Second click of a double-click; do not select so dblclick can issue move to this hex. */
        } else {
          const unitIdToSelect = unit.id;
          pendingSelectTimeout = setTimeout(() => {
            replaceSelection([unitIdToSelect]);
            void refreshHoverRoutePreview();
            pendingSelectTimeout = null;
            updateSidebar();
            updateRangedSidebar();
            redraw();
          }, 250);
        }
      } else if (getPrimarySelectedUnitId() && hit !== gameState?.units.find((u) => u.id === getPrimarySelectedUnitId())?.h3Index) {
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
        clearSelection();
        hoverRoutePreview = null;
      }
    } else {
      if (pendingSelectTimeout !== null) {
        clearTimeout(pendingSelectTimeout);
        pendingSelectTimeout = null;
      }
      clearSelection();
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
    if (rangedModeActive) return;
    const hit = clientXYToHit(e.clientX, e.clientY);
    if (!hit || selectedUnitIdsAtMouseDown.length === 0) return;

    const selectedAtMouseDown = selectedUnitIdsAtMouseDown
      .map((id) => gameState.units.find((u) => u.id === id))
      .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human');
    if (selectedAtMouseDown.length === 0) return;
    const selectedIds = selectedAtMouseDown.map((unit) => unit.id);
    if (selectedAtMouseDown.every((unit) => unit.h3Index === hit)) return;

    if (!window.gameApi?.assignHumanMarchOrders) return;
    const assign = await window.gameApi.assignHumanMarchOrders({
      unitIds: selectedIds,
      destinationH3Index: hit,
    });
    if (!assign.success) {
      showMapToast(assign.reason ?? 'Failed to assign movement order.', { isError: true });
      return;
    }
    // Commit complete: clear active selection so preview path is not left floating.
    clearSelection();
    selectedUnitIdsAtMouseDown = [];
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
    if (selectedUnitIds.length === 0 && !hoverRoutePreview) return;
    clearSelection();
    selectedUnitIdsAtMouseDown = [];
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
        const previousState = gameState;
        gameState = state;
        reconcileSelectionToCurrentState();
        updateClientStaleEnemyIntel(previousState, state);
        clearRes1TooltipSummaryCaches();
        const aiMoves = readyResult.aiMoves ?? [];
        const resolutionMoves = [...humanMoves, ...aiMoves];
        // Intentionally do not show per-unit AI movement lines in the turn toast.
        if (readyResult.aiStrategy) {
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
        const visibleHexes = getVisibleHexSet(state);
        const allKills = readyResult.kills ?? [];
        const removedById = new Map((readyResult.removedUnits ?? []).map((u) => [u.id, u]));
        const friendlyInvolvedKillVictimIds = new Set(
          allKills
            .filter((k) => {
              const victim = removedById.get(k.victimId);
              const killerIsFriendly = k.killerIds.some((id) => id.startsWith('human-'));
              const victimIsFriendly = victim?.player === 'human';
              return killerIsFriendly || victimIsFriendly;
            })
            .map((k) => k.victimId)
        );
        const friendlyInvolvedCombatHexes = new Set(
          [...friendlyInvolvedKillVictimIds]
            .map((victimId) => removedById.get(victimId)?.h3Index ?? null)
            .filter((h3): h3 is string => typeof h3 === 'string')
        );
        const unknownCombatHexes = [
          ...(readyResult.rangedCombatHexes ?? []),
          ...(readyResult.meleeCombatHexes ?? []),
          ...(readyResult.combatHexes ?? []),
        ].filter((h3, idx, arr) => arr.indexOf(h3) === idx && !visibleHexes.has(h3) && !friendlyInvolvedCombatHexes.has(h3));
        const unknownCasualtyHexes = [
          ...(readyResult.rangedCasualtyHexes ?? []),
          ...(readyResult.meleeCasualtyHexes ?? []),
          ...(readyResult.casualtyHexes ?? []),
        ].filter((h3, idx, arr) => arr.indexOf(h3) === idx && !visibleHexes.has(h3) && !friendlyInvolvedCombatHexes.has(h3));
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
            unknownCombatHexes: unknownCombatHexes.length > 0 ? unknownCombatHexes : undefined,
            unknownCasualtyHexes: unknownCasualtyHexes.length > 0 ? unknownCasualtyHexes : undefined,
          };
          const directFire = readyResult.killsByDirectFire ?? [];
          const returnFire = readyResult.killsByReturnFire ?? [];
          const knownVictimIds = new Set(
            (readyResult.removedUnits ?? [])
              .filter((u) => visibleHexes.has(u.h3Index))
              .map((u) => u.id)
          );
          for (const victimId of friendlyInvolvedKillVictimIds) {
            knownVictimIds.add(victimId);
          }
          const directSet = new Set(directFire.map((k) => k.victimId));
          const returnSet = new Set(returnFire.map((k) => k.victimId));
          const meleeKills = allKills.filter((k) => !directSet.has(k.victimId) && !returnSet.has(k.victimId));
          const knownDirectFire = directFire.filter((k) => knownVictimIds.has(k.victimId));
          const knownReturnFire = returnFire.filter((k) => knownVictimIds.has(k.victimId));
          const knownMeleeKills = meleeKills.filter((k) => knownVictimIds.has(k.victimId));
          const fmt = (k: { victimId: string; killerIds: string[] }) => `${k.victimId} destroyed by ${k.killerIds.join(', ')}`;
          const bullets: string[] = [];
          if (knownDirectFire.length > 0) bullets.push(`• Direct fire: ${knownDirectFire.map(fmt).join('; ')}`);
          if (knownReturnFire.length > 0) bullets.push(`• Return fire: ${knownReturnFire.map(fmt).join('; ')}`);
          if (knownMeleeKills.length > 0) bullets.push(knownMeleeKills.map(fmt).join('\n'));
          if (bullets.length > 0) showMapToast(bullets.join('\n'), { isError: false });
          const unknownVictimIds = allKills
            .map((k) => k.victimId)
            .filter((id, idx, arr) => arr.indexOf(id) === idx)
            .filter((id) => !friendlyInvolvedKillVictimIds.has(id))
            .filter((id) => {
              const removed = removedById.get(id);
              return removed ? !visibleHexes.has(removed.h3Index) : false;
            });
          const hasUnknownBattle = unknownCombatHexes.length > 0 || unknownCasualtyHexes.length > 0 || unknownVictimIds.length > 0;
          if (hasUnknownBattle) {
            const unknownContinentNames: string[] = [];
            if (window.gameApi?.getHexContinentNames) {
              const unknownHexes = [...unknownCombatHexes, ...unknownCasualtyHexes].filter((h3, idx, arr) => arr.indexOf(h3) === idx);
              for (const h3 of unknownHexes) {
                const names = await window.gameApi.getHexContinentNames({ h3Index: h3 });
                for (const n of names) {
                  if (!unknownContinentNames.includes(n)) unknownContinentNames.push(n);
                }
              }
            }
            showMapToast(formatUnknownBattleAnnouncement(unknownContinentNames), { isError: false });
          }
          resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
        }
        hoverRoutePreview = null;
        hideCommittedOrderLinesAfterReady = false;
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
