import { countryFlagImgHtml } from './countryFlags';
import { getStrategicRes1HexCode } from './hexLlmCodeAssignment';
import { escapeHtmlText } from './htmlTextFormatting';
import { formatTerrainKindHtml } from './terrainSwatchHtml';
import type { UnitOrigin } from './unitOriginTypes';
import type { WeatherState } from './weatherBonusTypes';
import { weatherTagsInDisplayOrder } from './weatherBonusRules';
import { formatWeatherIconHtml } from './weatherIcons';

/**
 * Which optional bonuses the tooltip may list, and which of them this unit has.
 *
 * Purpose: The Bonus block follows the match options and the unit's current qualification.
 * When to use: `formatUnitOriginTooltipHtml`.
 * Expected outcome: A disabled option is omitted. An enabled option that does not apply is omitted. The whole
 *   block is `None` when no selected bonus applies.
 * Exceptions: None.
 */
export interface UnitOriginTooltipBonuses {
  /**
   * Country bonus checkbox.
   *
   * Contract: The Country line is omitted when this is false.
   * When to use: `state.countryBonusEnabled`.
   * Expected outcome: True only for a match that selected the country bonus.
   * Exceptions: None.
   */
  readonly countryEnabled: boolean;
  /**
   * Terrain bonus checkbox.
   *
   * Contract: The Terrain line is omitted when this is false, including on the strategic map when the box is off.
   * When to use: `state.terrainBonusEnabled`.
   * Expected outcome: True only for a match that selected the terrain bonus.
   * Exceptions: None.
   */
  readonly terrainEnabled: boolean;
  /**
   * Weather bonus checkbox.
   *
   * Contract: The Weather line is omitted when this is false.
   * When to use: `state.weatherBonusEnabled`.
   * Expected outcome: True only for a match that selected the weather bonus.
   * Exceptions: None.
   */
  readonly weatherEnabled: boolean;
  /**
   * Whether the unit's birth country matches where it stands.
   *
   * Contract: Ignored when the country bonus is off. A unit that is not standing anywhere is false.
   * When to use: The same matcher as combat.
   * Expected outcome: True only when the country bonus would add 1 to a roll here.
   * Exceptions: None.
   */
  readonly countryApplies: boolean;
  /**
   * Whether the unit's birth terrain matches the cell where it stands.
   *
   * Contract: Ignored when the terrain bonus is off. Strategic standing never matches.
   * When to use: The same matcher as combat.
   * Expected outcome: True only when the terrain bonus would add 1 to a roll here.
   * Exceptions: None.
   */
  readonly terrainApplies: boolean;
  /**
   * Acclimation tags, in display order.
   *
   * Contract: Used only when the weather bonus is on. Empty or omitted means the unit has no weather bonus.
   * When to use: The snapshot tags, or the tags remembered from the birth hex after the unit is gone.
   * Expected outcome: Zero to two of snow, rain, and heat.
   * Exceptions: None.
   */
  readonly weatherTags?: readonly WeatherState[] | null;
}

/**
 * Whether two origins would show the same flag and the same tooltip.
 *
 * Purpose: A loss line keyed by display name can name two units. The flag is safe to show when both origins present the same birth place, and unsafe when they do not.
 * When to use: Before attaching one origin to a shared display name.
 * Expected outcome: `true` only when every birth field matches.
 * Exceptions: None.
 */
export function unitOriginsPresentTheSame(left: UnitOrigin, right: UnitOrigin): boolean {
  return (
    left.birthH3Index === right.birthH3Index &&
    left.birthRes4H3Index === right.birthRes4H3Index &&
    left.birthTerrainKind === right.birthTerrainKind &&
    left.birthIsUrban === right.birthIsUrban &&
    left.birthCountryName === right.birthCountryName &&
    left.birthCountryCode === right.birthCountryCode
  );
}

/**
 * One labeled row inside the Bonus block.
 *
 * Purpose: Keeps the bold category label next to its value.
 * When to use: While assembling `formatUnitOriginTooltipHtml`.
 * Expected outcome: `<strong>Country:</strong> …` and the same shape for Terrain and Weather.
 * Exceptions: None.
 */
function bonusRow(label: string, value: string): string {
  return `<strong>${label}:</strong> ${value}`;
}

/**
 * Builds the Bonus block.
 *
 * Purpose: Only bonuses that apply to this unit are listed.
 * When to use: From `formatUnitOriginTooltipHtml`.
 * Expected outcome: `Bonus:` plus `None` when no option is on or none of them apply. Otherwise one row per bonus that applies.
 * Exceptions: None.
 */
function bonusesBlock(origin: UnitOrigin, bonuses: UnitOriginTooltipBonuses): string {
  const rows: string[] = [];
  if (bonuses.countryEnabled && bonuses.countryApplies) {
    const country = escapeHtmlText(origin.birthCountryName ?? 'Unknown');
    rows.push(bonusRow('Country', `${countryFlagImgHtml(origin.birthCountryCode)}${country}`));
  }
  if (bonuses.terrainEnabled && bonuses.terrainApplies) {
    rows.push(bonusRow('Terrain', formatTerrainKindHtml(origin.birthTerrainKind)));
  }
  if (bonuses.weatherEnabled) {
    const tags = weatherTagsInDisplayOrder(bonuses.weatherTags);
    if (tags.length > 0) rows.push(bonusRow('Weather', tags.map((tag) => formatWeatherIconHtml(tag)).join(', ')));
  }
  const body = rows.length > 0 ? rows.join('\n') : 'None';
  return `<strong>Bonus:</strong>\n${body}`;
}

/**
 * Builds the unit-flag tooltip.
 *
 * Purpose: Every flag hover, including loss toasts, shows the unit name, its birth country, and the bonuses selected for the match.
 * When to use: When creating a unit flag. The result is stored on the flag and assigned to the tooltip's `innerHTML`.
 * Expected outcome: The unit name and the labels Origin and Bonus are bold. Country, Terrain, and Weather are bold when those bonuses apply, and omitted when they do not. The birth hex code is omitted when the hex has none. A country with no name reads Unknown.
 * Exceptions: None.
 */
export function formatUnitOriginTooltipHtml(input: {
  readonly unitName: string;
  readonly origin: UnitOrigin;
  readonly bonuses: UnitOriginTooltipBonuses;
}): string {
  const hexCode = getStrategicRes1HexCode(input.origin.birthH3Index);
  const codeSuffix = hexCode ? ` (${escapeHtmlText(hexCode)})` : '';
  const country = escapeHtmlText(input.origin.birthCountryName ?? 'Unknown');
  const originLine = bonusRow('Origin', `${countryFlagImgHtml(input.origin.birthCountryCode)}${country}${codeSuffix}`);
  return `<strong>${escapeHtmlText(input.unitName)}</strong>\n${originLine}\n\n${bonusesBlock(input.origin, input.bonuses)}`;
}
