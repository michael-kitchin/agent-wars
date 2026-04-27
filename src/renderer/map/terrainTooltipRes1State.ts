/**
 * Res1/res4 terrain tooltip assembly, client-side summary caches, and pointer hit-testing for hex naming.
 *
 * Purpose: Extracts a large cohesive slice from `renderer.ts` so map tooltip behavior stays testable and navigable.
 * When to use: Renderer and `mainMapInteractions` should import the exported entrypoints instead of duplicating logic.
 * Expected outcome: Map tooltip HTML, memoization keys, and pointer hit-testing stay cohesive, including bold `(XX)` / `(XX.YY)` prefixes aligned with strategic and tactical LLM hex codes.
 * Exceptions: Naming-line IPC failures are logged to `console.error` and cached as null (renderer has no main logger).
 */

import { cellToChildren, cellToParent, latLngToCell } from 'h3-js';
import { getLlmHexLocationParenLabelForNamingTarget } from '../../shared/hexLlmCodeAssignment';
import { DETAIL_H3_RESOLUTION, WORLD_H3_RESOLUTION } from '../core/constants';
import { isHexExploredByPlayer } from '../core/selection';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal } from './mapUtils';
import { TOOLTIP_SECTION_GAP_HTML } from '../../shared/tooltipSectionGap';
import type { NamingLookupTarget, TerrainTooltipState } from './terrainTooltipTypes';
import { shouldRenderRes4Hexes } from './terrainView';
import { getMainLeafletMap } from './worldLeafletMap';

/**
 * Clears the delayed terrain tooltip timer without touching tooltip visibility.
 *
 * Purpose: Centralizes tooltip timer teardown used by map interactions and popovers.
 * When to use: Before scheduling a new hover tooltip or when leaving the map surface.
 * Expected outcome: `S.terrainTooltipDelayTimer` is null after this returns.
 * Exceptions: None.
 */
export function clearTerrainTooltipTimer(): void {
  if (S.terrainTooltipDelayTimer !== null) {
    clearTimeout(S.terrainTooltipDelayTimer);
    S.terrainTooltipDelayTimer = null;
  }
}

/**
 * Hides the hex tooltip element and bumps the request sequence to invalidate in-flight async work.
 *
 * Purpose: Ensures tooltip DOM state stays consistent with suppression rules.
 * When to use: Pointer leave, popovers opening, or explicit tooltip cancellation.
 * Expected outcome: `#hex-tooltip` is hidden and `S.terrainTooltipRequestSeq` increments.
 * Exceptions: None.
 */
export function hideTerrainTooltipVisual(): void {
  S.terrainTooltipRequestSeq++;
  const el = document.getElementById('hex-tooltip');
  if (el) {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }
}

function formatTerrainKindLabel(kind: string): string {
  if (!kind) return 'Unknown';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function terrainStateForRes1Hex(h3: string): { terrainKind: string; isUrban: boolean; isRubble: boolean } {
  if (!S.gameState) return { terrainKind: 'Unknown', isUrban: false, isRubble: false };
  const hx = S.gameState.hexes.find((h) => h.h3Index === h3);
  if (!hx) return { terrainKind: 'Unknown', isUrban: false, isRubble: false };
  return {
    terrainKind:
      hx.terrainKind ??
      (hx.terrain === 'water'
        ? 'water'
        : hx.terrain === 'coastal'
          ? 'coastal'
          : hx.terrain === 'wetlands'
            ? 'wetlands'
            : 'plains'),
    isUrban: false,
    isRubble: false,
  };
}

function terrainKindForRes1Hex(h3: string): string {
  return terrainStateForRes1Hex(h3).terrainKind;
}

/**
 * Returns whether res1 infrastructure glyphs may be shown for a hex (explored-only gate).
 *
 * Purpose: Shared gate for tooltip feature lists and infrastructure drawing helpers.
 * When to use: Any res1 overlay that should respect fog-of-war exploration state.
 * Expected outcome: False when the hex is not explored by the human player.
 * Exceptions: None.
 */
export function infraGlyphsAllowedForRes1Hex(h3: string): boolean {
  if (!isHexExploredByPlayer(h3)) return false;
  return true;
}

/**
 * Returns whether res4 infrastructure detail may be shown for a child hex under a res1 parent.
 *
 * Purpose: Keeps res4 infra labels consistent with parent exploration.
 * When to use: Res4 tooltip feature lines and infrastructure overlays.
 * Expected outcome: False when the parent res1 hex is not explored.
 * Exceptions: None.
 */
export function infraGlyphsAllowedForRes4Child(parentH3: string, childH3: string): boolean {
  if (!isHexExploredByPlayer(parentH3)) return false;
  void childH3;
  return true;
}

function featureLabelsForRes1Hex(h3: string): string[] {
  if (!infraGlyphsAllowedForRes1Hex(h3)) return [];
  const counts = getRes1FeatureCounts(h3);
  const labels: string[] = [];
  if (counts.airportCount > 0) labels.push('Airports');
  if (counts.seaportCount > 0) labels.push('Seaports');
  if (counts.rubbleCount > 0) labels.push('Rubble');
  return labels;
}

/**
 * Defines the `transportSideMaskHasAnyTrue` function shape (function transportSideMaskHasAnyTrue(mask: readonly boolean[] | undefined): boolean).

 * Purpose: Detects whether a res4 road or rail side-boolean array carries any active edge for tooltip feature lists.
 * When to use: Only from `featureLabelsForRes4Child` when a tactical battle snapshot supplies `res4RoadSidesByH3` / `res4RailSidesByH3` rows.
 * Expected outcome: False for missing, empty, or all-false masks; true when at least one entry is strictly `true`.
 * Exceptions: None.
 */
function transportSideMaskHasAnyTrue(mask: readonly boolean[] | undefined): boolean {
  if (!mask || mask.length === 0) return false;
  return mask.some((v) => v === true);
}

function featureLabelsForRes4Child(parentH3: string, childH3: string): string[] {
  if (!infraGlyphsAllowedForRes4Child(parentH3, childH3)) return [];
  const labels: string[] = [];
  const detail = S.res4TerrainOverridesByH3.get(childH3);
  if (detail?.isRubble) labels.push('Rubble');
  if (S.terrainInfraRes4Airport.has(childH3)) labels.push('Airport');
  if (S.terrainInfraRes4Seaport.has(childH3)) labels.push('Seaport');
  const tb = S.tacticalBattleSnapshot;
  if (tb && tb.res4ChildH3Indexes.includes(childH3)) {
    const roadMask = tb.res4RoadSidesByH3?.[childH3];
    const railMask = tb.res4RailSidesByH3?.[childH3];
    if (transportSideMaskHasAnyTrue(roadMask)) labels.push('Road');
    if (transportSideMaskHasAnyTrue(railMask)) labels.push('Rail');
  }
  return labels;
}

function countUrbanRes4HexesInRes1Hex(parentH3: string): number {
  let children = S.res4ChildrenByParent.get(parentH3);
  if (!children) {
    children = cellToChildren(parentH3, DETAIL_H3_RESOLUTION);
    S.res4ChildrenByParent.set(parentH3, children);
  }
  let count = 0;
  for (const child of children) {
    if (S.res4TerrainOverridesByH3.get(child)?.isUrban) count++;
  }
  return count;
}

/**
 * Returns the human-visible urban production capacity for a res1 hex (urban res4 child count).
 *
 * Purpose: Shared capacity value for tooltip production lines and map production overlays.
 * When to use: Any UI that shows `$N / turn` style production for a res1 hex.
 * Expected outcome: Non-negative integer count of urban res4 children under the hex.
 * Exceptions: None.
 */
export function getUrbanProductionCapacityForHex(h3Index: string): number {
  return countUrbanRes4HexesInRes1Hex(h3Index);
}

/**
 * Rounds a percentage ratio to the nearest integer for compact tooltip copy.
 *
 * Purpose: Shared numeric formatting for terrain composition summaries and production overlays.
 * When to use: When displaying `(NN%)` terrain mix strings.
 * Expected outcome: Nearest whole number to `value`.
 * Exceptions: None.
 */
export function roundToNearestInteger(value: number): number {
  return Math.round(value);
}

/**
 * Formats integers for human-readable tooltip percentages using locale separators.
 *
 * Purpose: Keeps terrain summary strings consistent between tooltip and overlay code paths.
 * When to use: Any `(NN%)` segment in res1 terrain summaries.
 * Expected outcome: Locale-aware digit grouping as a string.
 * Exceptions: None.
 */
export function formatPercentInteger(value: number): string {
  return value.toLocaleString();
}

/**
 * Clears cached res1 tooltip summaries and HTML memoization maps after terrain/infra changes.
 *
 * Purpose: Prevents stale tooltip content after res4 override updates or similar mutations.
 * When to use: After applying res4 terrain override rows or other renderer-side terrain mutations.
 * Expected outcome: All `S.res1*` and `S.terrainTooltipHtmlByContentKey` caches cleared.
 * Exceptions: None.
 */
export function clearRes1TooltipSummaryCaches(): void {
  S.res1DominantTerrainKindByH3.clear();
  S.res1TerrainSummaryByH3.clear();
  S.res1FeaturesSummaryByH3.clear();
  S.res1FeatureCountsByH3.clear();
  S.terrainTooltipHtmlByContentKey.clear();
}

function getRes1FeatureCounts(h3: string): { airportCount: number; seaportCount: number; rubbleCount: number } {
  const cached = S.res1FeatureCountsByH3.get(h3);
  if (cached) return cached;
  let children = S.res4ChildrenByParent.get(h3);
  if (!children) {
    children = cellToChildren(h3, DETAIL_H3_RESOLUTION);
    S.res4ChildrenByParent.set(h3, children);
  }
  let airportCount = 0;
  let seaportCount = 0;
  let rubbleCount = 0;
  for (const child of children) {
    if (S.terrainInfraRes4Airport.has(child)) airportCount++;
    if (S.terrainInfraRes4Seaport.has(child)) seaportCount++;
    if (S.res4TerrainOverridesByH3.get(child)?.isRubble) rubbleCount++;
  }
  const counts = { airportCount, seaportCount, rubbleCount };
  S.res1FeatureCountsByH3.set(h3, counts);
  return counts;
}

/**
 * Computes the dominant res4 terrain kind under a res1 hex for infrastructure-aware rendering.
 *
 * Purpose: Shared helper for terrain hex drawing and tooltip summaries.
 * When to use: When res4 detail is active and res1 needs a single representative terrain label.
 * Expected outcome: Cached dominant kind string under `S.res1DominantTerrainKindByH3`.
 * Exceptions: None.
 */
export function getRes1DominantTerrainKind(h3: string, parentKind: string): string {
  const cached = S.res1DominantTerrainKindByH3.get(h3);
  if (cached !== undefined) return cached;
  let children = S.res4ChildrenByParent.get(h3);
  if (!children) {
    children = cellToChildren(h3, DETAIL_H3_RESOLUTION);
    S.res4ChildrenByParent.set(h3, children);
  }
  if (children.length <= 0) {
    S.res1DominantTerrainKindByH3.set(h3, parentKind);
    return parentKind;
  }
  const counts = new Map<string, number>();
  for (const child of children) {
    const kind = S.res4TerrainOverridesByH3.get(child)?.terrainKind ?? parentKind;
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
  S.res1DominantTerrainKindByH3.set(h3, dominantKind);
  return dominantKind;
}

function getRes1TerrainSummary(h3: string, parentKind: string): string {
  const cached = S.res1TerrainSummaryByH3.get(h3);
  if (cached !== undefined) return cached;
  let children = S.res4ChildrenByParent.get(h3);
  if (!children) {
    children = cellToChildren(h3, DETAIL_H3_RESOLUTION);
    S.res4ChildrenByParent.set(h3, children);
  }
  const total = children.length;
  if (total <= 0) {
    const fallback = `${formatTerrainKindLabel(parentKind)} (100.0%)`;
    S.res1TerrainSummaryByH3.set(h3, fallback);
    return fallback;
  }
  const counts = new Map<string, number>();
  for (const child of children) {
    const kind = S.res4TerrainOverridesByH3.get(child)?.terrainKind ?? parentKind;
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
    S.res1TerrainSummaryByH3.set(h3, summary);
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
  S.res1TerrainSummaryByH3.set(h3, summary);
  return summary;
}

function getRes1FeaturesSummary(h3: string): string | null {
  if (S.res1FeaturesSummaryByH3.has(h3)) return S.res1FeaturesSummaryByH3.get(h3) ?? null;
  if (!infraGlyphsAllowedForRes1Hex(h3)) {
    S.res1FeaturesSummaryByH3.set(h3, null);
    return null;
  }
  const { airportCount, seaportCount, rubbleCount } = getRes1FeatureCounts(h3);
  const parts: string[] = [];
  if (airportCount > 0) parts.push(`Airports (${airportCount.toLocaleString()})`);
  if (seaportCount > 0) parts.push(`Seaports (${seaportCount.toLocaleString()})`);
  if (rubbleCount > 0) parts.push(`Rubble (${rubbleCount.toLocaleString()})`);
  const summary = parts.length > 0 ? parts.join(', ') : null;
  S.res1FeaturesSummaryByH3.set(h3, summary);
  return summary;
}

/**
 * Assembles res1 terrain tooltip state for a known strategic cell id (no pointer / map dependency).
 *
 * Purpose: Shared by map hover (`terrainStateForPointer` fallback) and off-map consumers such as the melee intercept modal.
 * When to use: Whenever you have a res1 `h3Index` and need the same `TerrainTooltipState` shape as hover tooltips.
 * Expected outcome: Terrain + optional feature summaries consistent with `getCachedTerrainTooltipHtml` contracts.
 * Exceptions: None; unknown hexes yield Unknown terrain with empty feature lists when not in `S.gameState.hexes`.
 */
export function terrainTooltipStateForRes1Hex(h3: string): TerrainTooltipState {
  const state = terrainStateForRes1Hex(h3);
  return {
    ...state,
    features: featureLabelsForRes1Hex(h3),
    urbanHexCount: countUrbanRes4HexesInRes1Hex(h3),
    res1TerrainSummary: getRes1TerrainSummary(h3, state.terrainKind),
    res1FeaturesSummary: getRes1FeaturesSummary(h3),
  };
}

/**
 * Builds the terrain tooltip state for the current pointer location and optional res1 fallback hex.
 *
 * Purpose: Single entrypoint for hover tooltip assembly used by `mainMapInteractions`.
 * When to use: On pointer move while terrain inspection is allowed.
 * Expected outcome: `TerrainTooltipState` suitable for HTML rendering and naming lookup pairing.
 * Exceptions: Leaflet/h3 failures fall back to res1-only state when `fallbackRes1H3` is present.
 */
export function terrainStateForPointer(
  clientX: number,
  clientY: number,
  fallbackRes1H3: string | null
): TerrainTooltipState {
  if (!S.gameState) {
    return {
      terrainKind: 'Unknown',
      isUrban: false,
      isRubble: false,
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
        isRubble: false,
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
        isRubble: false,
        features: [],
        urbanHexCount: null,
        res1TerrainSummary: null,
        res1FeaturesSummary: null,
      };
    }
    return terrainTooltipStateForRes1Hex(fallbackRes1H3);
  }
  const L = getLeafletGlobal();
  if (!L) {
    if (!fallbackRes1H3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        isRubble: false,
        features: [],
        urbanHexCount: null,
        res1TerrainSummary: null,
        res1FeaturesSummary: null,
      };
    }
    return terrainTooltipStateForRes1Hex(fallbackRes1H3);
  }
  const rect = map.getContainer().getBoundingClientRect();
  const latlng = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
  try {
    const detailH3 = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
    const parentH3 = cellToParent(detailH3, WORLD_H3_RESOLUTION);
    const parentKind = terrainKindForRes1Hex(parentH3);
    const detail = S.res4TerrainOverridesByH3.get(detailH3);
    return {
      terrainKind: detail?.terrainKind ?? parentKind,
      isUrban: detail?.isUrban ?? false,
      isRubble: detail?.isRubble ?? false,
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
        isRubble: false,
        features: [],
        urbanHexCount: null,
        res1TerrainSummary: null,
        res1FeaturesSummary: null,
      };
    }
    return terrainTooltipStateForRes1Hex(fallbackRes1H3);
  }
}

/**
 * Derives the naming lookup target (res1 vs res4) for the pointer using the same rules as terrain sampling.
 *
 * Purpose: Keeps naming IPC requests aligned with the terrain tooltip’s effective resolution.
 * When to use: Paired with `terrainStateForPointer` when showing `showTerrainTooltip`.
 * Expected outcome: Res4 cell index when zoomed in; otherwise res1 fallback when provided.
 * Exceptions: Leaflet/h3 failures return res1 fallback or null.
 */
export function namingLookupTargetForPointer(
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
  if (!L) {
    if (!fallbackRes1H3) return null;
    return { h3Index: fallbackRes1H3, resolution: 1 };
  }
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

function namingLookupKey(target: NamingLookupTarget | null): string | null {
  if (!target) return null;
  return `${target.resolution}:${target.h3Index}`;
}

/**
 * Fetches (with memoization) the naming line used in the terrain tooltip header.
 *
 * Purpose: Avoids duplicate IPC for identical naming targets during pointer hover.
 * When to use: From `showTerrainTooltip` after computing `namingLookupTargetForPointer`.
 * Expected outcome: Cached string or null when IPC is unavailable or fails.
 * Exceptions: Logs `console.error` on IPC rejection paths.
 */
export async function getCachedNamingLineForTarget(target: NamingLookupTarget | null): Promise<string | null> {
  const key = namingLookupKey(target);
  if (!key || !target) return null;
  if (S.namingLineByLookupKey.has(key)) return S.namingLineByLookupKey.get(key) ?? null;
  if (!window.gameApi?.getHexNamingTooltipLine) return null;
  try {
    const line = await window.gameApi.getHexNamingTooltipLine(target);
    S.namingLineByLookupKey.set(key, line ?? null);
    return line ?? null;
  } catch (err) {
    console.error('getHexNamingTooltipLine failed:', err);
    S.namingLineByLookupKey.set(key, null);
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

/**
 * Renders the bold LLM hex-code badge (`(XX)` or `(XX.YY)`) that prefixes tooltip copy for the active naming target.
 *
 * Purpose: Aligns hover copy with briefing coordinate labels without an IPC call.
 * When to use: From `formatTerrainTooltipHtml` when a naming target is known (matches naming IPC resolution).
 * Expected outcome: Empty string when codes cannot be resolved; otherwise escaped HTML with a trailing space.
 * Exceptions: None.
 */
function formatLlmLocationBoldPrefixHtml(namingTarget: NamingLookupTarget | null): string {
  if (!namingTarget) return '';
  const label = getLlmHexLocationParenLabelForNamingTarget(namingTarget);
  if (!label) return '';
  return `<strong>${escapeHtml(label)}</strong> `;
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

function formatTerrainVariantSuffix(state: Pick<TerrainTooltipState, 'isUrban' | 'isRubble'>): string {
  const variants: string[] = [];
  if (state.isUrban) variants.push('Urban');
  if (state.isRubble) variants.push('Rubble');
  return variants.length > 0 ? `, ${variants.join(', ')}` : '';
}

function formatTerrainTooltipHtml(
  state: TerrainTooltipState,
  namingLine: string | null,
  namingTarget: NamingLookupTarget | null
): string {
  const prefix = formatLlmLocationBoldPrefixHtml(namingTarget);
  const terrainLabel = formatTerrainKindLabel(state.terrainKind);
  const terrainValue = state.res1TerrainSummary ?? `${terrainLabel}${formatTerrainVariantSuffix(state)}`;
  const terrainLine = `<strong>Terrain:</strong> ${terrainValue}`;
  const bodyParts: string[] = [terrainLine];
  if (state.res1FeaturesSummary != null) bodyParts.push(`<strong>Features:</strong> ${state.res1FeaturesSummary}`);
  else if (state.features.length > 0) bodyParts.push(`<strong>Features:</strong> ${state.features.join(', ')}`);
  if (state.urbanHexCount != null) {
    const productionLine =
      state.urbanHexCount > 0
        ? `<strong>Production:</strong> $${state.urbanHexCount.toLocaleString()} / turn`
        : `<strong>Production:</strong> (none)`;
    bodyParts.push(productionLine);
  }
  const bodyLine = bodyParts.join(TOOLTIP_SECTION_GAP_HTML);
  if (!namingLine) return `${prefix}${bodyLine}`;
  return `${prefix}${formatGroupedNamingLineHtml(namingLine)}${TOOLTIP_SECTION_GAP_HTML}${bodyLine}`;
}

function terrainTooltipContentKey(
  state: TerrainTooltipState,
  namingLine: string | null,
  namingTarget: NamingLookupTarget | null
): string {
  const targetKey =
    namingTarget == null ? 'none' : `${namingTarget.resolution}:${namingTarget.h3Index}`;
  const namingKey = namingLine ?? '';
  const urbanKey = state.isUrban ? '1' : '0';
  const rubbleKey = state.isRubble ? '1' : '0';
  const featuresKey = state.features.join('|');
  const urbanHexCountKey = state.urbanHexCount == null ? 'x' : String(state.urbanHexCount);
  const res1TerrainSummaryKey = state.res1TerrainSummary ?? '';
  const res1FeaturesSummaryKey = state.res1FeaturesSummary ?? '';
  return `${targetKey}::${namingKey}::${state.terrainKind}::${urbanKey}::${rubbleKey}::${featuresKey}::${urbanHexCountKey}::${res1TerrainSummaryKey}::${res1FeaturesSummaryKey}`;
}

/**
 * Returns memoized HTML for a terrain tooltip state + optional naming header line.
 *
 * Purpose: Prevents expensive HTML rebuilds when the pointer jitters within the same logical tooltip.
 * When to use: From `showTerrainTooltip` after awaiting naming line lookup.
 * Expected outcome: Stable HTML string for identical `(state, namingLine, namingTarget)` tuples until caches clear.
 * Exceptions: None.
 */
export function getCachedTerrainTooltipHtml(
  state: TerrainTooltipState,
  namingLine: string | null,
  namingTarget: NamingLookupTarget | null
): string {
  const key = terrainTooltipContentKey(state, namingLine, namingTarget);
  const cachedHtml = S.terrainTooltipHtmlByContentKey.get(key);
  if (cachedHtml !== undefined) return cachedHtml;
  const html = formatTerrainTooltipHtml(state, namingLine, namingTarget);
  S.terrainTooltipHtmlByContentKey.set(key, html);
  if (S.terrainTooltipHtmlByContentKey.size > 4096) S.terrainTooltipHtmlByContentKey.clear();
  return html;
}
