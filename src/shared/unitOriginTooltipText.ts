import { originFlagImgHtml, originPlaceLabelFor } from './originArea';
import { escapeHtmlText } from './htmlTextFormatting';
import { parseTacticalSubUnitId } from './unitIds';
import { formatTerrainKindHtml } from './terrainSwatchHtml';
import type { UnitOrigin } from './unitOriginTypes';
import type { WeatherState } from './weatherBonusTypes';
import { weatherTagsInDisplayOrder } from './weatherBonusRules';
import { formatWeatherIconHtml } from './weatherIcons';
import { formatTechTierHtml } from './featureIconHtml';
import type { TechLevel } from './techBonusTypes';
import { formatMercenaryTooltipValue, MERCENARY_TOOLTIP_LABEL } from './mercenaryRules';

/**
 * Name and formation date shown above the Bonuses block.
 *
 * Purpose: The flag tooltip identifies the unit before it lists bonuses.
 * When to use: `formatUnitOriginTooltipHtml` when the caller knows the display name or the formation date.
 * Expected outcome: An empty name omits the Unit line. A null or blank formation label omits the DOB line.
 * Exceptions: None.
 */
export interface UnitOriginTooltipIdentity {
  /**
   * Display name already used beside the flag, without a selection count or an order target.
   *
   * Contract: Plain text. The formatter escapes it.
   * When to use: The unit display-name lookup.
   * Expected outcome: `22nd Armored` or `3rd Fleet (02)`.
   * Exceptions: None.
   */
  readonly displayName: string;
  /**
   * Formation date of this unit, or of its parent when this is a tactical unit.
   *
   * Contract: Already formatted. Null when the formation turn was not recorded.
   * When to use: `formatGameDateForTurn`.
   * Expected outcome: `November, Year 3` or `November 22nd, Year 1`, or null.
   * Exceptions: None.
   */
  readonly formedLabel: string | null;
  /**
   * Upkeep of this unit when it is a mercenary.
   *
   * Contract: Set only for a mercenary of a hireable type.
   * When to use: The line after the date of birth.
   * Expected outcome: Credits per turn, or absent.
   * Exceptions: None.
   */
  readonly mercenaryUpkeep?: number;
}

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
   * Origin bonus for this match.
   *
   * Contract: The Origin line is omitted when this is false.
   * When to use: `state.originBonusEnabled`.
   * Expected outcome: True only for a match that selected the origin bonus.
   * Exceptions: None.
   */
  readonly originEnabled: boolean;
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
 * Expected outcome: `true` only when every birth field matches. An omitted looked-up country matches an explicit null.
 * Exceptions: None.
 */
export function unitOriginsPresentTheSame(left: UnitOrigin, right: UnitOrigin): boolean {
  return (
    left.birthH3Index === right.birthH3Index &&
    left.birthTacticalH3Index === right.birthTacticalH3Index &&
    left.birthTerrainKind === right.birthTerrainKind &&
    left.birthIsUrban === right.birthIsUrban &&
    left.birthCountryName === right.birthCountryName &&
    left.birthCountryCode === right.birthCountryCode &&
    left.birthAreaId === right.birthAreaId &&
    left.birthAreaName === right.birthAreaName &&
    left.birthSubdivisionCode === right.birthSubdivisionCode &&
    (left.birthOriginCountryName ?? null) === (right.birthOriginCountryName ?? null)
  );
}

/**
 * One labeled row inside the Bonuses block.
 *
 * Purpose: Keeps the bold category label next to its value.
 * When to use: While assembling `formatUnitOriginTooltipHtml`.
 * Expected outcome: `<strong>Origin:</strong> …` and the same shape for Terrain and Weather.
 * Exceptions: None.
 */
function bonusRow(label: string, value: string): string {
  return `<strong>${label}:</strong> ${value}`;
}

/**
 * Looks up the strategic turn on which a unit was formed.
 *
 * Purpose: A tactical sub-unit has no formation turn of its own. It reports its parent's.
 * When to use: Before formatting the DOB line.
 * Expected outcome: The turn stored for the id, else the parent's turn, else null.
 * Exceptions: None.
 */
export function formationTurnForUnit(unitId: string, formedTurnById: ReadonlyMap<string, number>): number | null {
  const direct = formedTurnById.get(unitId);
  if (direct != null) return direct;
  const parentUnitId = parseTacticalSubUnitId(unitId)?.parentUnitId;
  if (!parentUnitId) return null;
  return formedTurnById.get(parentUnitId) ?? null;
}

/**
 * Builds the Unit and DOB lines.
 *
 * Purpose: Those lines sit above the Bonuses block and are omitted when the caller has nothing to say.
 * When to use: `formatUnitOriginTooltipHtml` when an identity was passed.
 * Expected outcome: Zero, one, or two HTML lines. The name is preceded by the birth flag.
 * Exceptions: None.
 */
function identityLines(origin: UnitOrigin, identity: UnitOriginTooltipIdentity | undefined): string[] {
  if (!identity) return [];
  const lines: string[] = [];
  const displayName = identity.displayName.trim();
  if (displayName.length > 0) {
    lines.push(
      `<strong>Unit:</strong> ${originFlagImgHtml({
        subdivisionCode: origin.birthSubdivisionCode ?? null,
        countryCode: origin.birthCountryCode,
      })}${escapeHtmlText(displayName)}`
    );
  }
  const formedLabel = identity.formedLabel?.trim() ?? '';
  if (formedLabel.length > 0) lines.push(`<strong>DOB:</strong> ${escapeHtmlText(formedLabel)}`);
  if (identity.mercenaryUpkeep != null) {
    lines.push(`<strong>${MERCENARY_TOOLTIP_LABEL}:</strong> ${escapeHtmlText(formatMercenaryTooltipValue(identity.mercenaryUpkeep))}`);
  }
  return lines;
}

/**
 * Builds the unit-flag tooltip.
 *
 * Purpose: Every flag hover, including loss toasts, lists the bonuses this unit carries. An identity adds the name and formation date above that block.
 * When to use: When creating a unit flag. The result is stored on the flag and assigned to the tooltip's `innerHTML`.
 * Expected outcome: Bold `Bonuses:`, then one row per bonus the unit was born with. When an identity is present, `Unit:` and `DOB:` come first, then a blank line. A missing identity leaves the Bonuses block alone. Where the unit stands does not change the text.
 * Exceptions: None.
 */
export function formatUnitOriginTooltipHtml(input: {
  readonly origin: UnitOrigin;
  readonly bonuses: UnitOriginTooltipBonuses;
  readonly identity?: UnitOriginTooltipIdentity;
}): string {
  const rows: string[] = [];
  const placeLabel = originPlaceLabelFor(input.origin);
  if (input.bonuses.originEnabled && placeLabel.length > 0) {
    rows.push(
      bonusRow(
        'Origin',
        `${originFlagImgHtml({
          subdivisionCode: input.origin.birthSubdivisionCode ?? null,
          countryCode: input.origin.birthCountryCode,
        })}${escapeHtmlText(placeLabel)}`
      )
    );
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
  const bonuses = `<strong>Bonuses:</strong>\n${body}`;
  const head = identityLines(input.origin, input.identity);
  if (head.length === 0) return bonuses;
  return `${head.join('\n')}\n\n${bonuses}`;
}
