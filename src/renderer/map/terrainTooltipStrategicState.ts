/**
 * Strategic/tactical terrain tooltip assembly, client-side summary caches, and pointer hit-testing for hex naming.
 *
 * Purpose: Extracts a large cohesive slice from `renderer.ts` so map tooltip behavior stays testable and navigable.
 * When to use: Renderer and `mainMapInteractions` should import the exported entrypoints instead of duplicating logic.
 * Expected outcome: Map tooltip HTML, memoization keys, and pointer hit-testing stay cohesive, including bold `(XX)` / `(XX.YY)` prefixes aligned with strategic and tactical LLM hex codes.
 * Exceptions: Naming-line IPC failures are logged to `console.error` and cached as null (renderer has no main logger).
 */

import { strategicParentOf, tacticalCellAt, tacticalChildrenOf } from '../../shared/h3Resolutions';
import { tacticalBattleTerrainKindByCell } from '../../shared/tacticalBattleFootprint';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

import { isHexExploredByPlayer } from '../core/selection';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal } from './mapHelpers';
import type { NamingLookupTarget, TerrainTooltipState } from './terrainTooltipTypes';
import { shouldRenderTacticalHexes } from './terrainView';
import type { HexNamingCaption } from '../../shared/hexNamingCaption';
import { formatTerrainKindLabel } from '../../shared/terrainKindLabel';
import { getMainLeafletMap } from './worldLeafletMap';

export { getCachedTerrainTooltipHtml } from './terrainTooltipHtml';

/**
 * Cached hex naming captions keyed by `resolution:h3Index`.
 *
 * Purpose: Avoids repeating the naming IPC call on every hover.
 * When to use: Through `getCachedNamingLineForTarget` only.
 * Expected outcome: Caption with country spans, or `null` when the hex has no naming data or the lookup failed.
 * Exceptions: None.
 */
const namingLineByLookupKey = new Map<string, HexNamingCaption | null>();

/** Default tactical effect fields for strategic tooltips and error fallbacks. */
const EMPTY_TERRAIN_EFFECT_FIELDS: Pick<
  TerrainTooltipState,
  'parentTerrain' | 'parentTerrainKind' | 'isSeaport' | 'hasRoad' | 'hasRail'
> = {
  parentTerrain: '',
  parentTerrainKind: '',
  isSeaport: false,
  hasRoad: false,
  hasRail: false,
};

/**
 * Resolves strategic passability (`terrain` column) for a strategic hex id.
 *
 * Purpose: Supplies `parentTerrain` for tactical effects normalization.
 * When to use: From `tacticalEffectFieldsForChild` when building tactical tooltip state.
 * Expected outcome: Passability string or `land` when hex row is missing.
 * Exceptions: None.
 */
function parentPassabilityForStrategicHex(parentH3: string): string {
  if (!S.gameState) return 'land';
  const hx = S.gameState.hexes.find((h) => h.h3Index === parentH3);
  return hx?.terrain ?? 'land';
}

/**
 * Returns road and rail side-boolean masks for one tactical child from the session-global overlay map.
 *
 * Purpose: Single lookup for tactical tooltip Features and Effects lines so strategic tactical zoom and tactical battles stay aligned.
 * When to use: From `featureLabelsForTacticalChild` and `tacticalEffectFieldsForChild` after the parent strategic exploration gate passes.
 * Expected outcome: Undefined mask arrays when the child has no row in `S.tacticalRoadRailSidesByH3`.
 * Exceptions: None.
 */
function tacticalRoadRailSideMasksForChild(detailH3: string): {
  roadSides: readonly boolean[] | undefined;
  railSides: readonly boolean[] | undefined;
} {
  const roadRail = S.tacticalRoadRailSidesByH3.get(detailH3);
  return { roadSides: roadRail?.roadSides, railSides: roadRail?.railSides };
}

/**
 * Builds tactical effect-input fields from renderer terrain/infra caches for one child hex.
 *
 * Purpose: Keeps road/rail detection aligned with global map data (not tactical snapshot only).
 * When to use: Tactical branch of `terrainStateForPointer` after resolving parent/child ids.
 * Expected outcome: Empty transport flags when parent is unexplored; seaport/road/rail from renderer maps.
 * Exceptions: None.
 */
function tacticalEffectFieldsForChild(
  parentH3: string,
  detailH3: string
): Pick<TerrainTooltipState, 'parentTerrain' | 'parentTerrainKind' | 'isSeaport' | 'hasRoad' | 'hasRail'> {
  if (!infraGlyphsAllowedForTacticalChild(parentH3, detailH3)) {
    return { ...EMPTY_TERRAIN_EFFECT_FIELDS };
  }
  const parentKind = terrainKindForStrategicHex(parentH3);
  const { roadSides, railSides } = tacticalRoadRailSideMasksForChild(detailH3);
  return {
    parentTerrain: parentPassabilityForStrategicHex(parentH3),
    parentTerrainKind: parentKind,
    isSeaport: S.terrainInfraTacticalSeaport.has(detailH3),
    hasRoad: transportSideMaskHasAnyTrue(roadSides),
    hasRail: transportSideMaskHasAnyTrue(railSides),
  };
}

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

function terrainStateForStrategicHex(h3: string): { terrainKind: string; isUrban: boolean; isRubble: boolean } {
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

function terrainKindForStrategicHex(h3: string): string {
  return terrainStateForStrategicHex(h3).terrainKind;
}

/**
 * Returns whether strategic infrastructure glyphs may be shown for a hex (explored-only gate).
 *
 * Purpose: Shared gate for tooltip feature lists and infrastructure drawing helpers.
 * When to use: Any strategic overlay that should respect fog-of-war exploration state.
 * Expected outcome: False when the hex is not explored by the human player.
 * Exceptions: None.
 */
export function infraGlyphsAllowedForStrategicHex(h3: string): boolean {
  if (!isHexExploredByPlayer(h3)) return false;
  return true;
}

/**
 * Returns whether tactical infrastructure detail may be shown for a child hex under a strategic parent.
 *
 * Purpose: Keeps tactical infra labels consistent with parent exploration.
 * When to use: Tactical tooltip feature lines and infrastructure overlays.
 * Expected outcome: False when the parent strategic hex is not explored.
 * Exceptions: None.
 */
export function infraGlyphsAllowedForTacticalChild(parentH3: string, childH3: string): boolean {
  if (!isHexExploredByPlayer(parentH3)) return false;
  void childH3;
  return true;
}

/**
 * Builds world-hex feature labels for the tooltip Features line.
 *
 * Purpose: Names airports and seaports when the hex is explored.
 * When to use: From `terrainTooltipStateForStrategicHex`.
 * Expected outcome: Airports and Seaports when those counts are positive. Empty when the hex is unexplored or has neither.
 * Exceptions: None.
 */
function featureLabelsForStrategicHex(h3: string): string[] {
  if (!infraGlyphsAllowedForStrategicHex(h3)) return [];
  const counts = getStrategicFeatureCounts(h3);
  const labels: string[] = [];
  if (counts.airportCount > 0) labels.push('Airports');
  if (counts.seaportCount > 0) labels.push('Seaports');
  return labels;
}

/**
 * Detects whether a tactical road or rail side-boolean array carries any active edge.
 *
 * Purpose: Shared predicate for tactical tooltip Features labels and Effects transport bonuses.
 * When to use: From `featureLabelsForTacticalChild` and `tacticalEffectFieldsForChild` after loading masks from `S.tacticalRoadRailSidesByH3`.
 * Expected outcome: False for missing, empty, or all-false masks; true when at least one entry is strictly `true`.
 * Exceptions: None.
 */
function transportSideMaskHasAnyTrue(mask: readonly boolean[] | undefined): boolean {
  if (!mask || mask.length === 0) return false;
  return mask.some((v) => v === true);
}

/**
 * Tooltip state for one cell inside the active battle.
 *
 * Purpose: A margin cell keeps its own terrain kind. Airport and seaport words come from the snapshot, which only flags the enclosing hex's children.
 * When to use: `terrainStateForPointer` when the sampled cell is in `tacticalChildH3Indexes`.
 * Expected outcome: Terrain kind follows the tactical row, then a loaded geometric parent, then the enclosing hex. Control and weather stay on that enclosing hex in the HTML formatter.
 * Exceptions: None.
 */
function battleTerrainTooltipState(detailH3: string, battle: TacticalBattleSnapshot): TerrainTooltipState {
  const override = S.tacticalTerrainOverridesByH3.get(detailH3);
  const tacticalKindByH3 = new Map<string, string>();
  if (override?.terrainKind && override.terrainKind.trim().length > 0) {
    tacticalKindByH3.set(detailH3, override.terrainKind);
  }
  const loadedStrategicKindByH3 = new Map<string, string>();
  for (const hex of S.gameState?.hexes ?? []) {
    if (hex.terrainKind && hex.terrainKind.trim().length > 0) loadedStrategicKindByH3.set(hex.h3Index, hex.terrainKind);
  }
  const enclosingKind =
    loadedStrategicKindByH3.get(battle.enclosingStrategicH3Index) || battle.strategicHexTerrainKind || 'plains';
  const terrainKind =
    tacticalBattleTerrainKindByCell({
      cells: [detailH3],
      tacticalKindByH3,
      enclosingKind,
      loadedStrategicKindByH3,
    })[detailH3] ?? enclosingKind;
  const features: string[] = [];
  if (battle.tacticalIsAirportByH3?.[detailH3] === true) features.push('Airport');
  if (battle.tacticalIsSeaportByH3?.[detailH3] === true) features.push('Seaport');
  const { roadSides, railSides } = tacticalRoadRailSideMasksForChild(detailH3);
  if (transportSideMaskHasAnyTrue(roadSides)) features.push('Road');
  if (transportSideMaskHasAnyTrue(railSides)) features.push('Rail');
  return {
    terrainKind,
    isUrban: battle.tacticalIsUrbanByH3?.[detailH3] === true,
    isRubble: battle.tacticalIsRubbleByH3?.[detailH3] === true,
    isFortifiedCell: battle.tacticalFortificationOwnerByH3?.[detailH3] != null,
    features,
    urbanHexCount: null,
    strategicTerrainSummary: null,
    strategicFeaturesSummary: null,
    parentTerrain: parentPassabilityForStrategicHex(battle.enclosingStrategicH3Index),
    parentTerrainKind: enclosingKind,
    isSeaport: battle.tacticalIsSeaportByH3?.[detailH3] === true,
    hasRoad: transportSideMaskHasAnyTrue(roadSides),
    hasRail: transportSideMaskHasAnyTrue(railSides),
  };
}

/**
 * Builds tactical tooltip feature labels for one child hex under an explored strategic parent.
 *
 * Purpose: Lists visible tactical infrastructure and transport features for the hex tooltip Features line.
 * When to use: Tactical branch of `terrainStateForPointer` after resolving parent/child ids.
 * Expected outcome: Airport, Seaport, Road, and Rail when those are present. Urban and Rubble stay on the Terrain line. Empty when the parent is unexplored.
 * Exceptions: None.
 */
function featureLabelsForTacticalChild(parentH3: string, childH3: string): string[] {
  if (!infraGlyphsAllowedForTacticalChild(parentH3, childH3)) return [];
  const labels: string[] = [];
  if (S.terrainInfraTacticalAirport.has(childH3)) labels.push('Airport');
  if (S.terrainInfraTacticalSeaport.has(childH3)) labels.push('Seaport');
  const { roadSides, railSides } = tacticalRoadRailSideMasksForChild(childH3);
  if (transportSideMaskHasAnyTrue(roadSides)) labels.push('Road');
  if (transportSideMaskHasAnyTrue(railSides)) labels.push('Rail');
  return labels;
}

function countUrbanTacticalHexesInStrategicHex(parentH3: string): number {
  let children = S.tacticalChildrenByParent.get(parentH3);
  if (!children) {
    children = tacticalChildrenOf(parentH3);
    S.tacticalChildrenByParent.set(parentH3, children);
  }
  let count = 0;
  for (const child of children) {
    if (S.tacticalTerrainOverridesByH3.get(child)?.isUrban) count++;
  }
  return count;
}

/**
 * Returns the human-visible urban production capacity for a strategic hex (urban tactical child count).
 *
 * Purpose: Shared capacity value for tooltip production lines and map production overlays.
 * When to use: Any UI that shows `$N / turn` style production for a strategic hex.
 * Expected outcome: Non-negative integer count of urban tactical children under the hex.
 * Exceptions: None.
 */
export function getUrbanProductionCapacityForHex(h3Index: string): number {
  return countUrbanTacticalHexesInStrategicHex(h3Index);
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
 * When to use: Any `(NN%)` segment in strategic terrain summaries.
 * Expected outcome: Locale-aware digit grouping as a string.
 * Exceptions: None.
 */
export function formatPercentInteger(value: number): string {
  return value.toLocaleString();
}

/**
 * Clears cached strategic tooltip summaries and HTML memoization maps after terrain/infra changes.
 *
 * Purpose: Prevents stale tooltip content after tactical override updates or similar mutations.
 * When to use: After applying tactical terrain override rows or other renderer-side terrain mutations.
 * Expected outcome: All `S.strategic*` and `S.terrainTooltipHtmlByContentKey` caches cleared.
 * Exceptions: None.
 */
export function clearStrategicTooltipSummaryCaches(): void {
  S.strategicDominantTerrainKindByH3.clear();
  S.strategicTerrainSummaryByH3.clear();
  S.strategicFeaturesSummaryByH3.clear();
  S.strategicFeatureCountsByH3.clear();
  S.terrainTooltipHtmlByContentKey.clear();
}

/**
 * Counts airports and seaports inside one world hex.
 *
 * Purpose: The Features line names those counts. Urban and rubble stay off that line.
 * When to use: From `featureLabelsForStrategicHex` and `getStrategicFeaturesSummary`.
 * Expected outcome: Cached airport and seaport counts for the hex.
 * Exceptions: None.
 */
function getStrategicFeatureCounts(h3: string): { airportCount: number; seaportCount: number } {
  const cached = S.strategicFeatureCountsByH3.get(h3);
  if (cached) return cached;
  let children = S.tacticalChildrenByParent.get(h3);
  if (!children) {
    children = tacticalChildrenOf(h3);
    S.tacticalChildrenByParent.set(h3, children);
  }
  let airportCount = 0;
  let seaportCount = 0;
  for (const child of children) {
    if (S.terrainInfraTacticalAirport.has(child)) airportCount++;
    if (S.terrainInfraTacticalSeaport.has(child)) seaportCount++;
  }
  const counts = { airportCount, seaportCount };
  S.strategicFeatureCountsByH3.set(h3, counts);
  return counts;
}

/**
 * Computes the dominant tactical terrain kind under a strategic hex for infrastructure-aware rendering.
 *
 * Purpose: Shared helper for terrain hex drawing and tooltip summaries.
 * When to use: When tactical detail is active and strategic needs a single representative terrain label.
 * Expected outcome: Cached dominant kind string under `S.strategicDominantTerrainKindByH3`.
 * Exceptions: None.
 */
export function getStrategicDominantTerrainKind(h3: string, parentKind: string): string {
  const cached = S.strategicDominantTerrainKindByH3.get(h3);
  if (cached !== undefined) return cached;
  let children = S.tacticalChildrenByParent.get(h3);
  if (!children) {
    children = tacticalChildrenOf(h3);
    S.tacticalChildrenByParent.set(h3, children);
  }
  if (children.length <= 0) {
    S.strategicDominantTerrainKindByH3.set(h3, parentKind);
    return parentKind;
  }
  const counts = new Map<string, number>();
  for (const child of children) {
    const kind = S.tacticalTerrainOverridesByH3.get(child)?.terrainKind ?? parentKind;
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
  S.strategicDominantTerrainKindByH3.set(h3, dominantKind);
  return dominantKind;
}

function getStrategicTerrainSummary(h3: string, parentKind: string): string {
  const cached = S.strategicTerrainSummaryByH3.get(h3);
  if (cached !== undefined) return cached;
  let children = S.tacticalChildrenByParent.get(h3);
  if (!children) {
    children = tacticalChildrenOf(h3);
    S.tacticalChildrenByParent.set(h3, children);
  }
  const total = children.length;
  if (total <= 0) {
    const fallback = `${formatTerrainKindLabel(parentKind)} (100.0%)`;
    S.strategicTerrainSummaryByH3.set(h3, fallback);
    return fallback;
  }
  const counts = new Map<string, number>();
  for (const child of children) {
    const kind = S.tacticalTerrainOverridesByH3.get(child)?.terrainKind ?? parentKind;
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
    S.strategicTerrainSummaryByH3.set(h3, summary);
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
  S.strategicTerrainSummaryByH3.set(h3, summary);
  return summary;
}

/**
 * Builds the world-hex Features summary.
 *
 * Purpose: The world-hex tooltip and the tactical battles dialog share this string.
 * When to use: From `terrainTooltipStateForStrategicHex`.
 * Expected outcome: `Airports (n)` and `Seaports (n)` when those counts are positive. Null when the hex is unexplored or has neither.
 * Exceptions: None.
 */
function getStrategicFeaturesSummary(h3: string): string | null {
  if (S.strategicFeaturesSummaryByH3.has(h3)) return S.strategicFeaturesSummaryByH3.get(h3) ?? null;
  if (!infraGlyphsAllowedForStrategicHex(h3)) {
    S.strategicFeaturesSummaryByH3.set(h3, null);
    return null;
  }
  const { airportCount, seaportCount } = getStrategicFeatureCounts(h3);
  const parts: string[] = [];
  if (airportCount > 0) parts.push(`Airports (${airportCount.toLocaleString()})`);
  if (seaportCount > 0) parts.push(`Seaports (${seaportCount.toLocaleString()})`);
  const summary = parts.length > 0 ? parts.join(', ') : null;
  S.strategicFeaturesSummaryByH3.set(h3, summary);
  return summary;
}

/**
 * Assembles strategic terrain tooltip state for a known strategic cell id (no pointer / map dependency).
 *
 * Purpose: Shared by map hover (`terrainStateForPointer` fallback) and off-map consumers such as the melee intercept modal.
 * When to use: Whenever you have a strategic `h3Index` and need the same `TerrainTooltipState` shape as hover tooltips.
 * Expected outcome: Terrain + optional feature summaries consistent with `getCachedTerrainTooltipHtml` contracts.
 * Exceptions: None; unknown hexes yield Unknown terrain with empty feature lists when not in `S.gameState.hexes`.
 */
export function terrainTooltipStateForStrategicHex(h3: string): TerrainTooltipState {
  const state = terrainStateForStrategicHex(h3);
  const infra = infraGlyphsAllowedForStrategicHex(h3)
    ? S.gameState?.strategicInfrastructure?.find((row) => row.h3Index === h3)
    : undefined;
  const fortifiedCount = infra ? (infra.fortifiedCount ?? 0) : undefined;
  const intactCityCells = infra ? fortifiedCount! + (infra.fortifiableCount ?? 0) : undefined;
  return {
    ...state,
    ...EMPTY_TERRAIN_EFFECT_FIELDS,
    features: featureLabelsForStrategicHex(h3),
    urbanHexCount: countUrbanTacticalHexesInStrategicHex(h3),
    strategicTerrainSummary: getStrategicTerrainSummary(h3, state.terrainKind),
    strategicFeaturesSummary: getStrategicFeaturesSummary(h3),
    ...(fortifiedCount === undefined ? {} : { fortifiedCount, intactCityCells }),
  };
}

/**
 * Builds the terrain tooltip state for the current pointer location and optional strategic fallback hex.
 *
 * Purpose: Single entrypoint for hover tooltip assembly used by `mainMapInteractions`.
 * When to use: On pointer move while terrain inspection is allowed.
 * Expected outcome: `TerrainTooltipState` suitable for HTML rendering and naming lookup pairing.
 * Exceptions: Leaflet/h3 failures fall back to strategic-only state when `fallbackStrategicH3` is present.
 */
export function terrainStateForPointer(
  clientX: number,
  clientY: number,
  fallbackStrategicH3: string | null
): TerrainTooltipState {
  if (!S.gameState) {
    return {
      terrainKind: 'Unknown',
      isUrban: false,
      isRubble: false,
      features: [],
      urbanHexCount: null,
      strategicTerrainSummary: null,
      strategicFeaturesSummary: null,
      ...EMPTY_TERRAIN_EFFECT_FIELDS,
    };
  }
  const tacticalOn = shouldRenderTacticalHexes();
  if (!tacticalOn) {
    if (!fallbackStrategicH3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        isRubble: false,
        features: [],
        urbanHexCount: null,
        strategicTerrainSummary: null,
        strategicFeaturesSummary: null,
        ...EMPTY_TERRAIN_EFFECT_FIELDS,
      };
    }
    return terrainTooltipStateForStrategicHex(fallbackStrategicH3);
  }
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
      }
    | null;
  if (!map) {
    if (!fallbackStrategicH3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        isRubble: false,
        features: [],
        urbanHexCount: null,
        strategicTerrainSummary: null,
        strategicFeaturesSummary: null,
        ...EMPTY_TERRAIN_EFFECT_FIELDS,
      };
    }
    return terrainTooltipStateForStrategicHex(fallbackStrategicH3);
  }
  const L = getLeafletGlobal();
  if (!L) {
    if (!fallbackStrategicH3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        isRubble: false,
        features: [],
        urbanHexCount: null,
        strategicTerrainSummary: null,
        strategicFeaturesSummary: null,
        ...EMPTY_TERRAIN_EFFECT_FIELDS,
      };
    }
    return terrainTooltipStateForStrategicHex(fallbackStrategicH3);
  }
  const rect = map.getContainer().getBoundingClientRect();
  const latlng = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
  try {
    const detailH3 = tacticalCellAt(latlng.lat, latlng.lng);
    const battle = S.tacticalBattleSnapshot;
    if (battle?.tacticalChildH3Indexes.includes(detailH3)) return battleTerrainTooltipState(detailH3, battle);
    const parentH3 = strategicParentOf(detailH3);
    const parentKind = terrainKindForStrategicHex(parentH3);
    const detail = S.tacticalTerrainOverridesByH3.get(detailH3);
    return {
      terrainKind: detail?.terrainKind ?? parentKind,
      isUrban: detail?.isUrban ?? false,
      isRubble: detail?.isRubble ?? false,
      isFortifiedCell: detail?.isFortified === true,
      features: featureLabelsForTacticalChild(parentH3, detailH3),
      urbanHexCount: null,
      strategicTerrainSummary: null,
      strategicFeaturesSummary: null,
      ...tacticalEffectFieldsForChild(parentH3, detailH3),
    };
  } catch {
    if (!fallbackStrategicH3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        isRubble: false,
        features: [],
        urbanHexCount: null,
        strategicTerrainSummary: null,
        strategicFeaturesSummary: null,
        ...EMPTY_TERRAIN_EFFECT_FIELDS,
      };
    }
    return terrainTooltipStateForStrategicHex(fallbackStrategicH3);
  }
}

/**
 * Derives the naming lookup target (strategic vs tactical) for the pointer using the same rules as terrain sampling.
 *
 * Purpose: Keeps naming IPC requests aligned with the terrain tooltip’s effective resolution.
 * When to use: Paired with `terrainStateForPointer` when showing `showTerrainTooltip`.
 * Expected outcome: Tactical cell index when zoomed in; otherwise strategic fallback when provided.
 * Exceptions: Leaflet/h3 failures return strategic fallback or null.
 */
export function namingLookupTargetForPointer(
  clientX: number,
  clientY: number,
  fallbackStrategicH3: string | null
): NamingLookupTarget | null {
  const tacticalOn = shouldRenderTacticalHexes();
  if (!tacticalOn) {
    if (!fallbackStrategicH3) return null;
    return { h3Index: fallbackStrategicH3, resolution: 1 };
  }
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
      }
    | null;
  if (!map) {
    if (!fallbackStrategicH3) return null;
    return { h3Index: fallbackStrategicH3, resolution: 1 };
  }
  const L = getLeafletGlobal();
  if (!L) {
    if (!fallbackStrategicH3) return null;
    return { h3Index: fallbackStrategicH3, resolution: 1 };
  }
  const rect = map.getContainer().getBoundingClientRect();
  const latlng = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
  try {
    const detailH3 = tacticalCellAt(latlng.lat, latlng.lng);
    return { h3Index: detailH3, resolution: 4 };
  } catch {
    if (!fallbackStrategicH3) return null;
    return { h3Index: fallbackStrategicH3, resolution: 1 };
  }
}

function namingLookupKey(target: NamingLookupTarget | null): string | null {
  if (!target) return null;
  return `${target.resolution}:${target.h3Index}`;
}

/**
 * Fetches (with memoization) the naming caption used in the terrain tooltip header.
 *
 * Purpose: Avoids duplicate IPC for identical naming targets during pointer hover.
 * When to use: From `showTerrainTooltip` and the melee-intercept hex cell after computing the naming target.
 * Expected outcome: Cached caption (text plus country spans), or null when IPC is unavailable or fails.
 * Exceptions: Logs `console.error` on IPC rejection paths.
 */
export async function getCachedNamingLineForTarget(target: NamingLookupTarget | null): Promise<HexNamingCaption | null> {
  const key = namingLookupKey(target);
  if (!key || !target) return null;
  if (namingLineByLookupKey.has(key)) return namingLineByLookupKey.get(key) ?? null;
  if (!window.gameApi?.getHexNamingTooltipLine) return null;
  try {
    const caption = await window.gameApi.getHexNamingTooltipLine(target);
    namingLineByLookupKey.set(key, caption ?? null);
    return caption ?? null;
  } catch (err) {
    console.error('getHexNamingTooltipLine failed:', err);
    namingLineByLookupKey.set(key, null);
    return null;
  }
}
