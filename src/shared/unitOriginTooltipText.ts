import { countryFlagImgHtml } from './countryFlags';
import { escapeHtmlText } from './htmlTextFormatting';
import { formatTerrainKindHtml } from './terrainSwatchHtml';
import type { UnitOrigin } from './unitOriginTypes';
import type { WeatherState } from './weatherBonusTypes';
import { weatherTagsInDisplayOrder } from './weatherBonusRules';
import { formatWeatherIconHtml } from './weatherIcons';
import { formatTechTierHtml } from './featureIconHtml';
import type { TechLevel } from './techBonusTypes';

/**
 * Which optional bonuses the tooltip may list for one unit.
 *
 * Purpose: The Bonuses block follows the match options and the bonuses this unit was born with.
 * When to use: `formatUnitOriginTooltipHtml`.
 * Expected outcome: A disabled option is omitted. An enabled option with nothing recorded for this unit is omitted.
 *   The whole block is `None` when the unit has none of the selected bonuses. A known tech tier is omitted when the tech bonus is off. Where the unit stands does not change the block.
 * Exceptions: None.
 */
export interface UnitOriginTooltipBonuses {
  /**
   * Country bonus for this match.
   *
   * Contract: The Country line is omitted when this is false.
   * When to use: `state.countryBonusEnabled`.
   * Expected outcome: True only for a match that selected the country bonus.
   * Exceptions: None.
   */
  readonly countryEnabled: boolean;
  /**
   * Terrain bonus for this match.
   *
   * Contract: The Terrain line is omitted when this is false.
   * When to use: `state.terrainBonusEnabled`.
   * Expected outcome: True only for a match that selected the terrain bonus.
   * Exceptions: None.
   */
  readonly terrainEnabled: boolean;
  /**
   * Weather bonus for this match.
   *
   * Contract: The Weather line is omitted when this is false.
   * When to use: `state.weatherBonusEnabled`.
   * Expected outcome: True only for a match that selected the weather bonus.
   * Exceptions: None.
   */
  readonly weatherEnabled: boolean;
  /**
   * Tech bonus for this match.
   *
   * Contract: The Tech line is omitted when this is false, even when a tier is recorded.
   * When to use: `state.techBonusEnabled`.
   * Expected outcome: True only for a match that selected the tech bonus.
   * Exceptions: None.
   */
  readonly techEnabled: boolean;
  /**
   * Acclimation tags the unit keeps from its birth hex.
   *
   * Contract: Used only when the weather bonus is on. Empty or omitted means the unit has no weather bonus.
   * When to use: The snapshot tags, or the tags remembered from the birth hex after the unit is gone.
   * Expected outcome: Zero to two of snow, rain, and heat. Moving the unit does not change them.
   * Exceptions: None.
   */
  readonly weatherTags?: readonly WeatherState[] | null;
  /**
   * Tech tier of this unit's birth hex.
   *
   * Contract: Optional. The Tech row is shown for `basic` and `advanced` only when `techEnabled` is true. A missing tier is omitted.
   * When to use: The snapshot tier, or the tier remembered from the birth hex after the unit is gone.
   * Expected outcome: `basic` adds the basic icon and the word Basic. `advanced` adds the advanced icon and the word Advanced. Both follow Weather.
   * Exceptions: None.
   */
  readonly techLevel?: TechLevel | null;
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
    left.birthTacticalH3Index === right.birthTacticalH3Index &&
    left.birthTerrainKind === right.birthTerrainKind &&
    left.birthIsUrban === right.birthIsUrban &&
    left.birthCountryName === right.birthCountryName &&
    left.birthCountryCode === right.birthCountryCode
  );
}

/**
 * One labeled row inside the Bonuses block.
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
 * Builds the unit-flag tooltip.
 *
 * Purpose: Every flag hover, including loss toasts, lists the bonuses this unit carries. The unit name stays on the label beside the flag.
 * When to use: When creating a unit flag. The result is stored on the flag and assigned to the tooltip's `innerHTML`.
 * Expected outcome: Bold `Bonuses:`, then one row per bonus the unit was born with. Country is the birth country, terrain is the birth terrain, and weather is the birth-hex tags. Tech follows when the match tech bonus is on and the unit has a known tier. A line is omitted when that option is off or the unit has none. No selected bonus is `Bonuses:` and then `None`. Where the unit stands does not change the text.
 * Exceptions: None.
 */
export function formatUnitOriginTooltipHtml(input: {
  readonly origin: UnitOrigin;
  readonly bonuses: UnitOriginTooltipBonuses;
}): string {
  const rows: string[] = [];
  const countryName = input.origin.birthCountryName?.trim() ?? '';
  if (input.bonuses.countryEnabled && countryName.length > 0) {
    rows.push(bonusRow('Country', `${countryFlagImgHtml(input.origin.birthCountryCode)}${escapeHtmlText(countryName)}`));
  }
  const terrainKind = input.origin.birthTerrainKind?.trim() ?? '';
  if (input.bonuses.terrainEnabled && terrainKind.length > 0) {
    rows.push(bonusRow('Terrain', formatTerrainKindHtml(terrainKind)));
  }
  if (input.bonuses.weatherEnabled) {
    const tags = weatherTagsInDisplayOrder(input.bonuses.weatherTags);
    if (tags.length > 0) rows.push(bonusRow('Weather', tags.map((tag) => formatWeatherIconHtml(tag)).join(', ')));
  }
  if (input.bonuses.techEnabled && (input.bonuses.techLevel === 'basic' || input.bonuses.techLevel === 'advanced')) {
    rows.push(bonusRow('Tech', formatTechTierHtml(input.bonuses.techLevel)));
  }
  const body = rows.length > 0 ? rows.join('\n') : 'None';
  return `<strong>Bonuses:</strong>\n${body}`;
}
