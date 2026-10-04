/**
 * Terrain tooltip HTML: hex-code prefix, naming caption, control, terrain, features, and effects.
 *
 * Purpose: Keeps tooltip markup next to the caption flags, out of the hit-testing module.
 * When to use: `getCachedTerrainTooltipHtml` from the hover tooltip and the melee-intercept hex cell.
 * Expected outcome: Memoized HTML; the naming line is omitted when the caption is missing or empty.
 * Exceptions: None.
 */
import { cellToParent } from 'h3-js';
import { formatHexNamingCaptionHtml, type HexNamingCaption } from '../../shared/hexNamingCaption';
import { getLlmHexLocationParenLabelForNamingTarget } from '../../shared/hexLlmCodeAssignment';
import { escapeHtmlText } from '../../shared/htmlTextFormatting';
import {
  formatHomeRegionAssignmentControlSuffix,
  isHexOwnershipVisibleToPerspective,
  resolveHomeRegionOwnerIdentity,
} from '../../shared/homeRegionRules';
import { computeTerrainEffectsLineHtml, joinHexEffectsLine } from '../../shared/terrainEffectsForTooltip';
import { formatTerrainKindHtml, formatTerrainNameListHtml } from '../../shared/terrainSwatchHtml';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import { TOOLTIP_SECTION_GAP_HTML } from '../../shared/tooltipSectionGap';
import { WORLD_H3_RESOLUTION } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
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
  const label = getLlmHexLocationParenLabelForNamingTarget(namingTarget);
  if (!label) return '';
  return `<strong>${escapeHtmlText(label)}</strong> `;
}

/**
 * Appends urban and rubble markers to a terrain label.
 *
 * Purpose: The base terrain kind does not include those cell flags.
 * When to use: From `formatTerrainTooltipHtml` when there is no prebuilt res1 terrain summary.
 * Expected outcome: Empty, `, Urban`, `, Rubble`, or `, Urban, Rubble`.
 * Exceptions: None.
 */
function formatTerrainVariantSuffix(state: Pick<TerrainTooltipState, 'isUrban' | 'isRubble'>): string {
  const variants: string[] = [];
  if (state.isUrban) variants.push('Urban');
  if (state.isRubble) variants.push('Rubble');
  return variants.length > 0 ? `, ${variants.join(', ')}` : '';
}

/**
 * Resolves the strategic hex id for control-tooltip rendering from the current naming target.
 *
 * Purpose: Lets tooltip control lines use res1 ownership even when pointer sampling is on res4 cells.
 * When to use: Only from control-line helpers in this module.
 * Expected outcome: Returns a res1 h3 index or null when no stable mapping is available.
 * Exceptions: Invalid h3 conversion returns null.
 */
function resolveStrategicHexForControlLine(namingTarget: NamingLookupTarget | null): string | null {
  if (!namingTarget) return null;
  if (namingTarget.resolution === 1) return namingTarget.h3Index;
  try {
    return cellToParent(namingTarget.h3Index, WORLD_H3_RESOLUTION);
  } catch {
    return null;
  }
}

/**
 * Computes human-facing control label text for terrain tooltip content.
 *
 * Purpose: Shows perspective-aware ownership (`Human`/`AI`) while respecting hidden ownership as unknown.
 * When to use: Tooltip HTML formatting and cache-key derivation for res1/res4 terrain popups.
 * Expected outcome: `Human`, `AI`, or `Unknown`, plus a home-region suffix when the hex has one. Hidden ownership is `Unknown`.
 * Exceptions: None. Missing game state returns `Unknown`.
 */
function getTooltipControlLabel(namingTarget: NamingLookupTarget | null): string {
  if (!S.gameState) return 'Unknown';
  const strategicHex = resolveStrategicHexForControlLine(namingTarget);
  if (!strategicHex) return 'Unknown';
  const controller = (S.gameState.res1Control ?? []).find((row) => row.h3Index === strategicHex)?.controllerPlayerId ?? null;
  const ownerLabel = controller === 'human' ? 'Human' : controller === 'opponent' ? 'AI' : 'Unknown';
  const homeRegionIdentity = resolveHomeRegionOwnerIdentity({
    h3Index: strategicHex,
    humanHomeRegionHexes: S.gameState.humanHomeRegionHexes,
    aiHomeRegionHexes: S.gameState.aiHomeRegionHexes,
    intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
  });
  if (homeRegionIdentity != null) {
    return `${ownerLabel} ${formatHomeRegionAssignmentControlSuffix(homeRegionIdentity)}`;
  }
  const visibleHexes = Array.isArray(S.gameState.visibleHexes)
    ? new Set(S.gameState.visibleHexes)
    : new Set(S.gameState.hexes.map((h) => h.h3Index));
  const perspective = S.gameState.playerPerspective === 'opponent' ? 'opponent' : 'human';
  const ownershipVisible = isHexOwnershipVisibleToPerspective({
    h3Index: strategicHex,
    playerPerspective: perspective,
    visibleHexes,
    humanHomeRegionHexes: S.gameState.humanHomeRegionHexes,
    aiHomeRegionHexes: S.gameState.aiHomeRegionHexes,
    intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
  });
  if (!ownershipVisible) return 'Unknown';
  return ownerLabel;
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
  if (!namingTarget) return null;
  if (namingTarget.resolution === 4 && S.tacticalBattleSnapshot) return S.tacticalBattleSnapshot.weather ?? null;
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
 * When to use: `tooltipWeather` for a res4 naming target outside a battle.
 * Expected outcome: The res1 parent, or null when the cell id is not a hex.
 * Exceptions: None. An invalid id returns null.
 */
function parentStrategicHex(h3Index: string): string | null {
  try {
    return cellToParent(h3Index, WORLD_H3_RESOLUTION);
  } catch {
    return null;
  }
}

/**
 * Builds the Effects line for a world hex or a detail cell.
 *
 * Purpose: Terrain effects stay on res4 cells. Snow, rain, and heat are named, with their icon, on world hexes and detail cells.
 * When to use: From `formatTerrainTooltipHtml`.
 * Expected outcome: Terrain effects, then the weather chip. Null when the cell has no terrain effects and the weather is mild, missing, or off.
 * Exceptions: None.
 */
function effectsLine(state: TerrainTooltipState, namingTarget: NamingLookupTarget | null): string | null {
  const terrain = namingTarget?.resolution === 4
    ? computeTerrainEffectsLineHtml({
      terrainKind: state.terrainKind,
      parentTerrain: state.parentTerrain,
      parentTerrainKind: state.parentTerrainKind,
      isUrban: state.isUrban,
      isRubble: state.isRubble,
      isSeaport: state.isSeaport,
      hasRoad: state.hasRoad,
      hasRail: state.hasRail,
    })
    : null;
  return joinHexEffectsLine(terrain, tooltipWeather(namingTarget));
}

/**
 * Builds the full terrain tooltip HTML: hex-code prefix, naming caption with flags, then control, terrain, weather, and effects.
 *
 * Purpose: Single formatter behind `getCachedTerrainTooltipHtml`.
 * When to use: Only through `getCachedTerrainTooltipHtml`, which memoizes the result.
 * Expected outcome: The naming line is omitted when the caption is missing or empty. Effects include snow, rain, or heat when that weather is in effect.
 * Exceptions: None.
 */
function formatTerrainTooltipHtml(
  state: TerrainTooltipState,
  namingCaption: HexNamingCaption | null,
  namingTarget: NamingLookupTarget | null
): string {
  const prefix = formatLlmLocationBoldPrefixHtml(namingTarget);
  const showControlLine = namingTarget?.resolution === 1;
  const controlLine = showControlLine ? `<strong>Control:</strong> ${getTooltipControlLabel(namingTarget)}` : null;
  const terrainValue = state.res1TerrainSummary != null
    ? formatTerrainNameListHtml(state.res1TerrainSummary)
    : `${formatTerrainKindHtml(state.terrainKind)}${escapeHtmlText(formatTerrainVariantSuffix(state))}`;
  const terrainLine = `<strong>Terrain:</strong> ${terrainValue}`;
  const weather = tooltipWeather(namingTarget);
  const weatherLine = weather ? `<strong>Weather:</strong> ${formatWeatherIconHtml(weather)}` : null;
  const bodyParts: string[] = controlLine ? [controlLine, terrainLine] : [terrainLine];
  if (weatherLine) bodyParts.push(weatherLine);
  if (state.res1FeaturesSummary != null) bodyParts.push(`<strong>Features:</strong> ${state.res1FeaturesSummary}`);
  else if (state.features.length > 0) bodyParts.push(`<strong>Features:</strong> ${state.features.join(', ')}`);
  const effectsLineHtml = effectsLine(state, namingTarget);
  if (effectsLineHtml) bodyParts.push(`<strong>Effects:</strong> ${effectsLineHtml}`);
  if (state.urbanHexCount != null) {
    const productionLine =
      state.urbanHexCount > 0
        ? `<strong>Production:</strong> $${state.urbanHexCount.toLocaleString()} / turn`
        : `<strong>Production:</strong> (none)`;
    bodyParts.push(productionLine);
  }
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
  const res1TerrainSummaryKey = state.res1TerrainSummary ?? '';
  const res1FeaturesSummaryKey = state.res1FeaturesSummary ?? '';
  const weatherKey = tooltipWeather(namingTarget) ?? '';
  const controlKey = getTooltipControlLabel(namingTarget);
  const parentTerrainKey = state.parentTerrain;
  const parentTerrainKindKey = state.parentTerrainKind;
  const seaportKey = state.isSeaport ? '1' : '0';
  const roadKey = state.hasRoad ? '1' : '0';
  const railKey = state.hasRail ? '1' : '0';
  return `${targetKey}::${namingKey}::${state.terrainKind}::${urbanKey}::${rubbleKey}::${featuresKey}::${urbanHexCountKey}::${res1TerrainSummaryKey}::${res1FeaturesSummaryKey}::${controlKey}::${parentTerrainKey}::${parentTerrainKindKey}::${seaportKey}::${roadKey}::${railKey}::${weatherKey}`;
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
