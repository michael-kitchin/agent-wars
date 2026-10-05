/**
 * Road, rail, and tech icons for tooltips.
 *
 * Purpose: Hex and order tooltips share one markup rule for Road, Rail, and the two tech tiers.
 * When to use: Any HTML tooltip that names those features.
 * Expected outcome: Escaped HTML.
 * Exceptions: None.
 */

import { escapeHtmlText } from './htmlTextFormatting';
import { techLevelFromUrbanHexCount } from './techBonusRules';
import type { TechLevel } from './techBonusTypes';

/**
 * CSS class for a tech, road, or rail icon.
 *
 * Purpose: One size next to those words, matching the weather icon.
 * When to use: On every tech, road, and rail `<img>`.
 * Expected outcome: `feature-icon`, styled in `static/overlayChrome.css`.
 * Exceptions: None.
 */
export const FEATURE_ICON_CLASS_NAME = 'feature-icon';

/**
 * Returns one feature icon plus its word.
 *
 * Purpose: Road, Rail, and the tech row lead with an icon the way weather leads with one.
 * When to use: From the transport and tech formatters.
 * Expected outcome: Escaped HTML. The word is not escaped by the caller again.
 * Exceptions: None.
 */
function formatFeatureIconHtml(src: string, label: string): string {
  return `<img class="${FEATURE_ICON_CLASS_NAME}" src="${escapeHtmlText(src)}" alt="" aria-hidden="true" />${escapeHtmlText(label)}`;
}

/**
 * Reports whether a payload names a road, a rail, or an unspecified line.
 *
 * Purpose: Empty checks must treat the new flags the same as the older boolean.
 * When to use: Before deciding to draw a Using line.
 * Expected outcome: True when any of the three is set.
 * Exceptions: None.
 */
export function transportLineSpecified(input: {
  readonly road?: boolean;
  readonly rail?: boolean;
  readonly roadRail?: boolean;
}): boolean {
  return input.road === true || input.rail === true || input.roadRail === true;
}

/**
 * Returns the Road icon and word, the Rail icon and word, or both.
 *
 * Purpose: A march can use a road, a rail, or, on an older payload, an unspecified line.
 * When to use: The Using line of an order tooltip.
 * Expected outcome: Road, then Rail, joined by a comma. An unspecified line (`roadRail` with neither flag) names both. Empty when nothing is set.
 * Exceptions: None.
 */
export function formatTransportIconsHtml(input: {
  readonly road?: boolean;
  readonly rail?: boolean;
  readonly roadRail?: boolean;
}): string {
  const specified = input.road === true || input.rail === true;
  const road = specified ? input.road === true : input.roadRail === true;
  const rail = specified ? input.rail === true : input.roadRail === true;
  const parts: string[] = [];
  if (road) parts.push(formatFeatureIconHtml('transport/road.svg', 'Road'));
  if (rail) parts.push(formatFeatureIconHtml('transport/rail.svg', 'Rail'));
  return parts.join(', ');
}

/**
 * Returns one feature label, with an icon when the word is Road or Rail.
 *
 * Purpose: A cell's feature list mixes transport with airports, seaports, and rubble.
 * When to use: Each comma-separated feature token.
 * Expected outcome: An icon before Road and Rail. Other words are escaped text.
 * Exceptions: None.
 */
export function formatFeatureLabelHtml(label: string): string {
  if (label === 'Road') return formatFeatureIconHtml('transport/road.svg', 'Road');
  if (label === 'Rail') return formatFeatureIconHtml('transport/rail.svg', 'Rail');
  return escapeHtmlText(label);
}

/**
 * Returns the tech icon and word for one known tier.
 *
 * Purpose: The unit tooltip names Basic and Advanced the same way it names weather.
 * When to use: The Tech row of a unit flag tooltip when the unit has a stamped tier.
 * Expected outcome: The basic icon and the word Basic, or the advanced icon and the word Advanced.
 * Exceptions: None.
 */
export function formatTechTierHtml(level: TechLevel): string {
  if (level === 'advanced') return formatFeatureIconHtml('tech/tech_advanced.svg', 'Advanced');
  return formatFeatureIconHtml('tech/tech_basic.svg', 'Basic');
}

/**
 * Returns the Tech line for units a res1 hex will produce, or null when that line does not apply.
 *
 * Purpose: The hex tooltip and the build popup name the hex's tier with the same icon and word as a unit tooltip.
 * When to use: Under the hex name on a res1 surface, passing the match's tech flag and the hex's generated urban count.
 * Expected outcome: Null when tech is off, or when the count is not finite or not positive. Otherwise `Tech:` plus the Basic or Advanced icon. Low and High use the same line.
 * Exceptions: None.
 */
export function formatProducedUnitTechLineHtml(input: {
  readonly techBonusEnabled: boolean;
  readonly baselineUrbanHexCount: number;
}): string | null {
  if (input.techBonusEnabled !== true) return null;
  if (!Number.isFinite(input.baselineUrbanHexCount) || input.baselineUrbanHexCount <= 0) return null;
  const level = techLevelFromUrbanHexCount(input.baselineUrbanHexCount);
  return `<strong>Tech:</strong> ${formatTechTierHtml(level)}`;
}

/**
 * Returns the Tech line for the unique tiers of several selected hexes, or null when that line does not apply.
 *
 * Purpose: The multi-hex build popup names every tier those hexes will produce, in the same words as one hex.
 * When to use: Under the hex codes, passing the match's tech flag and each hex's generated urban count.
 * Expected outcome: Null when tech is off, or when no count is a positive finite number. Otherwise `Tech:` plus Basic, then Advanced, each at most once. A count that is not positive is ignored before classification, so it cannot appear as Basic.
 * Exceptions: None.
 */
export function formatSelectedHexTechLineHtml(input: {
  readonly techBonusEnabled: boolean;
  readonly baselineUrbanHexCounts: readonly number[];
}): string | null {
  if (input.techBonusEnabled !== true) return null;
  let hasBasic = false;
  let hasAdvanced = false;
  for (const count of input.baselineUrbanHexCounts) {
    if (!Number.isFinite(count) || count <= 0) continue;
    if (techLevelFromUrbanHexCount(count) === 'advanced') hasAdvanced = true;
    else hasBasic = true;
  }
  const parts: string[] = [];
  if (hasBasic) parts.push(formatTechTierHtml('basic'));
  if (hasAdvanced) parts.push(formatTechTierHtml('advanced'));
  if (parts.length === 0) return null;
  return `<strong>Tech:</strong> ${parts.join(', ')}`;
}
