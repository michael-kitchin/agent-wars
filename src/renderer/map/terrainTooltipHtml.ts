/**
 * Terrain tooltip HTML for the hover tooltip and the tactical battles list.
 *
 * Purpose: Keeps tooltip markup next to the caption flags, out of the hit-testing module.
 * When to use: `getCachedTerrainTooltipHtml` from the hover tooltip and the melee-intercept hex cell.
 * Expected outcome: Memoized HTML. The naming line is omitted when the caption is missing or empty. A world hex orders Control, Production, Tech, Features, Terrain, Weather, and Effects. A detail cell orders Features, then Terrain, Weather, and Effects. A line that does not apply is left out.
 * Exceptions: None.
 */

import { formatProductionCapacityAmount } from '../../shared/economySymbols';
import { FORTIFIED_CELL_VARIANT_LABEL, FORTIFIED_TOOLTIP_LABEL, formatFortifiedTooltipValue } from '../../shared/fortificationRules';
import { strategicParentOf } from '../../shared/h3Resolutions';

import { formatHexNamingCaptionHtml, type HexNamingCaption } from '../../shared/hexNamingCaption';
import { getLlmHexLocationParenLabelForNamingTarget, getStrategicHexCode } from '../../shared/hexLlmCodeAssignment';
import { tacticalBattleHexCode } from '../../shared/tacticalBattleFootprint';
import { escapeHtmlText } from '../../shared/htmlTextFormatting';
import { isHexOwnershipVisibleToPerspective, ownershipPerspective } from '../../shared/homeRegionRules';
import { formatHexControlLabel, homeSeatIdsAtHex } from '../../shared/sideLabels';
import { computeTerrainEffectsLineHtml } from '../../shared/terrainEffectsForTooltip';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { formatFeatureLabelHtml, formatProducedUnitTechLineHtml } from '../../shared/featureIconHtml';
import { formatRubbleSwatchHtml, formatTerrainKindHtml, formatTerrainNameListHtml, formatUrbanSwatchHtml } from '../../shared/terrainSwatchHtml';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import {
  strategicHexEffectsBodyHtml,
  terrainCoverPairFor,
  type TerrainCoverPair,
} from '../../shared/terrainCoverRules';
import { TOOLTIP_SECTION_GAP_HTML } from '../../shared/tooltipSectionGap';
import { rendererSharedState as S } from '../core/state';
import { baselineUrbanHexCountForStrategicHex } from '../rendererTacticalHydration';
import type { NamingLookupTarget, TerrainTooltipState } from './terrainTooltipTypes';

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
  const battle = S.tacticalBattleSnapshot;
  if (battle) {
    const strategicCode = getStrategicHexCode(battle.enclosingStrategicH3Index);
    const tacticalCode = tacticalBattleHexCode(battle.enclosingStrategicH3Index, namingTarget.h3Index);
    if (!strategicCode || !tacticalCode) return '';
    return `<strong>${escapeHtmlText(`(${strategicCode}.${tacticalCode})`)}</strong> `;
  }
  const label = getLlmHexLocationParenLabelForNamingTarget(namingTarget);
  if (!label) return '';
  return `<strong>${escapeHtmlText(label)}</strong> `;
}

/**
 * Appends urban and rubble markers to a terrain label.
 *
 * Purpose: The base terrain kind does not include those cell flags.
 * When to use: From `formatTerrainTooltipHtml` when there is no prebuilt strategic terrain summary.
 * Expected outcome: Empty, an Urban swatch, or a Rubble swatch. A rubble cell names Rubble. An intact urban cell names Urban. The caller inserts this HTML as-is.
 * Exceptions: None.
 */
function formatTerrainVariantSuffix(state: Pick<TerrainTooltipState, 'isUrban' | 'isRubble' | 'isFortifiedCell'>): string {
  const variants: string[] = [];
  if (state.isRubble) variants.push(`${formatRubbleSwatchHtml()}Rubble`);
  else if (state.isFortifiedCell) variants.push(`${formatUrbanSwatchHtml()}${FORTIFIED_CELL_VARIANT_LABEL}`);
  else if (state.isUrban) variants.push(`${formatUrbanSwatchHtml()}Urban`);
  return variants.length > 0 ? `, ${variants.join(', ')}` : '';
}

/**
 * Resolves the strategic hex id for control-tooltip rendering from the current naming target.
 *
 * Purpose: Lets tooltip control lines use strategic ownership even when pointer sampling is on tactical cells.
 * When to use: Only from control-line helpers in this module.
 * Expected outcome: Returns a strategic h3 index or null when no stable mapping is available.
 * Exceptions: Invalid h3 conversion returns null.
 */
function resolveStrategicHexForControlLine(namingTarget: NamingLookupTarget | null): string | null {
  if (S.tacticalBattleSnapshot) return S.tacticalBattleSnapshot.enclosingStrategicH3Index;
  if (!namingTarget) return null;
  if (namingTarget.resolution === 1) return namingTarget.h3Index;
  try {
    return strategicParentOf(namingTarget.h3Index);
  } catch {
    return null;
  }
}

/**
 * Computes human-facing control label text for terrain tooltip content.
 *
 * Purpose: Shows the short control line while respecting hidden ownership as unknown.
 * When to use: Tooltip HTML formatting and cache-key derivation for strategic terrain popups and the tactical battles list.
 * Expected outcome: The roster's control line, or `Unknown` when the hex is hidden and is not a home.
 * Exceptions: None. Missing game state returns `Unknown`.
 */
function getTooltipControlLabel(namingTarget: NamingLookupTarget | null): string {
  if (!S.gameState) return 'Unknown';
  const strategicHex = resolveStrategicHexForControlLine(namingTarget);
  if (!strategicHex) return 'Unknown';
  const controller = (S.gameState.strategicControl ?? []).find((row) => row.h3Index === strategicHex)?.controllerPlayerId ?? null;
  const homeSeatIds = homeSeatIdsAtHex(strategicHex, S.gameState);
  const label = formatHexControlLabel({
    controllerId: controller,
    homeSeatIds,
    seats: S.gameState.seats ?? [],
  });
  if (homeSeatIds.length > 0) return label;
  const visibleHexes = Array.isArray(S.gameState.visibleHexes)
    ? new Set(S.gameState.visibleHexes)
    : new Set(S.gameState.hexes.map((h) => h.h3Index));
  const perspective = ownershipPerspective(S.gameState.playerPerspective);
  const ownershipVisible = isHexOwnershipVisibleToPerspective({
    h3Index: strategicHex,
    playerPerspective: perspective,
    visibleHexes,
    homeRegionHexesBySeat: S.gameState.homeRegionHexesBySeat,
    intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
  });
  if (!ownershipVisible) return 'Unknown';
  return label;
}

/**
 * Returns the weather to show on a hex tooltip, if the snapshot has one.
 *
 * Purpose: Unexplored hexes omit weather, so the tooltip stays blank there.
 * When to use: While building the terrain tooltip.
 * Expected outcome: The battle's weather on a tactical cell. Otherwise the world hex's weather, including the parent of a zoomed cell, when that hex is explored. Null when the bonus is off or the hex is unexplored.
 * Exceptions: None.
 */
function tooltipWeather(namingTarget: NamingLookupTarget | null): import('../../shared/weatherBonusTypes').WeatherState | null {
  if (S.tacticalBattleSnapshot) return S.tacticalBattleSnapshot.weather ?? null;
  if (!namingTarget) return null;
  if (!S.gameState) return null;
  const strategicHex = namingTarget.resolution === 1
    ? namingTarget.h3Index
    : parentStrategicHex(namingTarget.h3Index);
  if (!strategicHex) return null;
  return S.gameState.hexes.find((hex) => hex.h3Index === strategicHex)?.weather ?? null;
}

/**
 * Resolves the world hex that owns a battle cell.
 *
 * Purpose: A zoomed strategic cell has no battle snapshot, so its weather is the parent hex's.
 * When to use: `tooltipWeather` for a tactical naming target outside a battle.
 * Expected outcome: The strategic parent, or null when the cell id is not a hex.
 * Exceptions: None. An invalid id returns null.
 */
function parentStrategicHex(h3Index: string): string | null {
  try {
    return strategicParentOf(h3Index);
  } catch {
    return null;
  }
}

/**
 * Builds the movement and range clauses for a detail cell.
 *
 * Purpose: Those clauses belong on tactical cells. Cover is joined afterward, and weather stays on the Weather line.
 * When to use: From `formatTerrainTooltipHtml`, as the first argument to `joinHexTooltipEffectsHtml`.
 * Expected outcome: The cell's tactical movement and range HTML, or null for a world hex and for a cell with none.
 * Exceptions: None.
 */
function movementRangeHtml(state: TerrainTooltipState, namingTarget: NamingLookupTarget | null): string | null {
  if (namingTarget?.resolution !== 4) return null;
  return computeTerrainEffectsLineHtml({
    terrainKind: state.terrainKind,
    parentTerrain: state.parentTerrain,
    parentTerrainKind: state.parentTerrainKind,
    isUrban: state.isUrban,
    isRubble: state.isRubble,
    isSeaport: state.isSeaport,
    hasRoad: state.hasRoad,
    hasRail: state.hasRail,
  });
}

/**
 * Reads the cover pair for a world hex or a detail cell.
 *
 * Purpose: The Effects line and the tooltip cache key share one lookup.
 * When to use: From `formatTerrainTooltipHtml` and `terrainTooltipContentKey`.
 * Expected outcome: For a world hex, the stored terrain kind plus that hex's rugged and city flags, or null when the kind is missing. For any other resolution, the cell's kind plus its urban and rubble flags. Null when there is no target.
 * Exceptions: None.
 */
function coverPair(state: TerrainTooltipState, namingTarget: NamingLookupTarget | null): TerrainCoverPair | null {
  if (!namingTarget) return null;
  if (namingTarget.resolution === 1) {
    const hex = S.gameState?.hexes.find((row) => row.h3Index === namingTarget.h3Index);
    return hex?.terrainKind
      ? terrainCoverPairFor({ terrainKind: hex.terrainKind, rugged: hex.rugged === true, city: hex.city === true })
      : null;
  }
  return terrainCoverPairFor({ terrainKind: state.terrainKind, isUrban: state.isUrban, isRubble: state.isRubble });
}

/**
 * Builds the full terrain tooltip HTML: hex-code prefix, naming caption with flags, then the resolution's line order.
 *
 * Purpose: Single formatter behind `getCachedTerrainTooltipHtml`.
 * When to use: Only through `getCachedTerrainTooltipHtml`, which memoizes the result.
 * Expected outcome: The naming line is omitted when the caption is missing or empty. A world hex lists Control, Production, Tech, Features, Terrain, Weather, and Effects. A detail cell lists Features, then Terrain, Weather, and Effects. A line that does not apply is left out, and the next line moves up. Effects lists movement, range, and cover clauses. Weather stays on the Weather line.
 * Exceptions: None.
 */
function formatTerrainTooltipHtml(
  state: TerrainTooltipState,
  namingCaption: HexNamingCaption | null,
  namingTarget: NamingLookupTarget | null
): string {
  const prefix = formatLlmLocationBoldPrefixHtml(namingTarget);
  const techLine = producedUnitTechLineHtml(namingTarget);
  const showControlLine = namingTarget?.resolution === 1;
  const controlLine = showControlLine ? `<strong>Control:</strong> ${escapeHtmlText(getTooltipControlLabel(namingTarget))}` : null;
  const terrainValue = state.strategicTerrainSummary != null
    ? formatTerrainNameListHtml(state.strategicTerrainSummary)
    : `${formatTerrainKindHtml(state.terrainKind)}${formatTerrainVariantSuffix(state)}`;
  const terrainLine = `<strong>Terrain:</strong> ${terrainValue}`;
  const weather = tooltipWeather(namingTarget);
  const weatherLine = weather ? `<strong>Weather:</strong> ${formatWeatherIconHtml(weather)}` : null;
  const featuresLine =
    state.strategicFeaturesSummary != null
      ? `<strong>Features:</strong> ${formatTerrainNameListHtml(state.strategicFeaturesSummary)}`
      : state.features.length > 0
        ? `<strong>Features:</strong> ${state.features.map((label) => formatFeatureLabelHtml(label)).join(', ')}`
        : null;
  const pair = coverPair(state, namingTarget);
  const effectsHtml = strategicHexEffectsBodyHtml(
    namingTarget?.resolution ?? null,
    namingTarget?.resolution === 1 && strategicHexStopsArmor(namingTarget.h3Index),
    pair,
    movementRangeHtml(state, namingTarget)
  );
  const effectsLine = effectsHtml ? `<strong>Effects:</strong> ${effectsHtml}` : null;
  const neutralBorder = namingTarget?.resolution === 1 && isNeutralBorderHex(namingTarget.h3Index);
  const productionLine =
    state.urbanHexCount == null
      ? null
      : state.urbanHexCount > 0 && !neutralBorder
        ? `<strong>Production:</strong> ${formatProductionCapacityAmount(state.urbanHexCount.toLocaleString())} / turn`
        : `<strong>Production:</strong> (none)`;
  const fortifiedCount = state.fortifiedCount ?? 0;
  const fortifiedLine =
    fortifiedCount > 0
      ? `<strong>${FORTIFIED_TOOLTIP_LABEL}:</strong> ${formatFortifiedTooltipValue(fortifiedCount, state.intactCityCells ?? fortifiedCount)}`
      : null;
  const resolution = namingTarget?.resolution;
  const orderedLines =
    resolution === 1
      ? [controlLine, productionLine, fortifiedLine, techLine, featuresLine, terrainLine, weatherLine, effectsLine]
      : resolution === 4
        ? [featuresLine, techLine, controlLine, terrainLine, weatherLine, effectsLine, productionLine]
        : [techLine, controlLine, terrainLine, weatherLine, featuresLine, effectsLine, productionLine];
  const bodyParts = orderedLines.filter((line): line is string => line != null);
  const bodyLine = bodyParts.join(TOOLTIP_SECTION_GAP_HTML);
  if (!namingCaption || namingCaption.text === '') return `${prefix}${bodyLine}`;
  return `${prefix}${formatHexNamingCaptionHtml(namingCaption)}${TOOLTIP_SECTION_GAP_HTML}${bodyLine}`;
}

/**
 * Builds the memoization key for a terrain tooltip.
 *
 * Purpose: Identifies tooltips whose HTML would be identical.
 * When to use: From `getCachedTerrainTooltipHtml`.
 * Expected outcome: Uses the caption text; spans are fixed per target, and the target is part of the key.
 * Exceptions: None.
 */
function terrainTooltipContentKey(
  state: TerrainTooltipState,
  namingCaption: HexNamingCaption | null,
  namingTarget: NamingLookupTarget | null
): string {
  const targetKey =
    namingTarget == null ? 'none' : `${namingTarget.resolution}:${namingTarget.h3Index}`;
  const namingKey = namingCaption?.text ?? '';
  const urbanKey = state.isUrban ? '1' : '0';
  const rubbleKey = state.isRubble ? '1' : '0';
  const featuresKey = state.features.join('|');
  const urbanHexCountKey = state.urbanHexCount == null ? 'x' : String(state.urbanHexCount);
  const strategicTerrainSummaryKey = state.strategicTerrainSummary ?? '';
  const strategicFeaturesSummaryKey = state.strategicFeaturesSummary ?? '';
  const weatherKey = tooltipWeather(namingTarget) ?? '';
  const pair = coverPair(state, namingTarget);
  const coverKey = pair == null ? 'none' : `${pair.surface}:${pair.air}`;
  const controlKey = getTooltipControlLabel(namingTarget);
  const parentTerrainKey = state.parentTerrain;
  const parentTerrainKindKey = state.parentTerrainKind;
  const seaportKey = state.isSeaport ? '1' : '0';
  const roadKey = state.hasRoad ? '1' : '0';
  const railKey = state.hasRail ? '1' : '0';
  const techBonusKey = S.gameState?.techBonusEnabled === true ? '1' : '0';
  const baselineUrbanKey =
    namingTarget?.resolution === 1 ? String(baselineUrbanHexCountForStrategicHex(namingTarget.h3Index)) : 'x';
  const fortifiedKey = state.fortifiedCount == null ? 'x' : String(state.fortifiedCount);
  const intactKey = state.intactCityCells == null ? 'x' : String(state.intactCityCells);
  const fortifiedCellKey = state.isFortifiedCell ? '1' : '0';
  return `${targetKey}::${namingKey}::${state.terrainKind}::${urbanKey}::${rubbleKey}::${featuresKey}::${urbanHexCountKey}::${strategicTerrainSummaryKey}::${strategicFeaturesSummaryKey}::${controlKey}::${parentTerrainKey}::${parentTerrainKindKey}::${seaportKey}::${roadKey}::${railKey}::${weatherKey}::${coverKey}::${techBonusKey}::${baselineUrbanKey}::${fortifiedKey}::${intactKey}::${fortifiedCellKey}`;
}

/**
 * Tech line for a strategic hex, using the generated urban count.
 *
 * Purpose: The hover tooltip and the melee-intercept cell share this placement in the world-hex order, after Control and Production and before Features.
 * When to use: From `formatTerrainTooltipHtml` when the naming target is a world hex.
 * Expected outcome: The shared Tech line, or null for any other resolution, when tech is off, or when the hex produces nothing.
 * Exceptions: None.
 */
function producedUnitTechLineHtml(namingTarget: NamingLookupTarget | null): string | null {
  if (namingTarget?.resolution !== 1) return null;
  return formatProducedUnitTechLineHtml({
    techBonusEnabled: S.gameState?.techBonusEnabled === true,
    baselineUrbanHexCount: baselineUrbanHexCountForStrategicHex(namingTarget.h3Index),
  });
}

/**
 * True when a strategic hex ends an armor move.
 *
 * Purpose: The Effects line names the stop once for rugged, arctic, and city.
 * When to use: While formatting a world-hex tooltip.
 * Expected outcome: True when the snapshot hex has any of the three flags.
 * Exceptions: None.
 */
function strategicHexStopsArmor(h3Index: string): boolean {
  const hex = S.gameState?.hexes.find((row) => row.h3Index === h3Index);
  return hex?.rugged === true || hex?.arctic === true || hex?.city === true;
}

/**
 * Returns memoized HTML for a terrain tooltip state + optional naming header caption.
 *
 * Purpose: Prevents expensive HTML rebuilds when the pointer jitters within the same logical tooltip.
 * When to use: From `showTerrainTooltip` after awaiting the naming caption lookup.
 * Expected outcome: Stable HTML (with country flags in the naming line) for identical `(state, caption, namingTarget)` tuples until caches clear.
 * Exceptions: None.
 */
export function getCachedTerrainTooltipHtml(
  state: TerrainTooltipState,
  namingCaption: HexNamingCaption | null,
  namingTarget: NamingLookupTarget | null
): string {
  const key = terrainTooltipContentKey(state, namingCaption, namingTarget);
  const cachedHtml = S.terrainTooltipHtmlByContentKey.get(key);
  if (cachedHtml !== undefined) return cachedHtml;
  const html = formatTerrainTooltipHtml(state, namingCaption, namingTarget);
  S.terrainTooltipHtmlByContentKey.set(key, html);
  if (S.terrainTooltipHtmlByContentKey.size > 4096) S.terrainTooltipHtmlByContentKey.clear();
  return html;
}
