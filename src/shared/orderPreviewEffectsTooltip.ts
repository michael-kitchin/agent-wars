/**
 * HTML for the order-planning effects tooltip.
 *
 * Purpose: Tells the player which terrain and weather change the march, ferry, air strike, or ranged attack under the pointer, and which cover protects the targeted units.
 * When to use: After a hover preview is known, and from tests of that copy.
 * Expected outcome: Escaped HTML, or null when the order is blocked or nothing changes it.
 * Exceptions: None.
 */

import type { BonusLevel } from './bonusLevel';
import {
  terrainCoverFor,
  terrainCoverSourceLabel,
  type TerrainCoverPlace,
  type TerrainCoverShooter,
} from './terrainCoverRules';
import { collectTacticalRangedSlowTerrainLabels, sortSlowTerrainLabels } from './orderPreviewSlowTerrainTooltip';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import type { TacticalBattleTerrainPick } from './tacticalTerrainCombatModifiers';
import { formatTransportIconsHtml, transportLineSpecified } from './featureIconHtml';
import { formatTerrainNameListHtml } from './terrainSwatchHtml';
import { TOOLTIP_SECTION_GAP_HTML } from './tooltipSectionGap';
import {
  strategicFerryRangeHexes,
  weatherAttackPenalty,
  weatherSlowsMovement,
} from './weatherBonusRules';
import { formatStatusIconHtml } from './statusIconHtml';
import { formatWeatherIconHtml } from './weatherIcons';
import type { WeatherState } from './weatherBonusTypes';

/**
 * Which order the pointer is aiming.
 *
 * Purpose: The effects line follows the order, not the hex under the pointer.
 * When to use: The renderer classifies the hover the same way the preview does, then passes the kind here.
 * Expected outcome: One of the six planning kinds.
 * Exceptions: None.
 */
export type OrderPreviewEffectsKind =
  | 'tacticalMarch'
  | 'strategicMarch'
  | 'strategicFerry'
  | 'tacticalFerry'
  | 'ranged'
  | 'airStrike';

/**
 * One selected unit's type, the weather where it stands, and its acclimation tags.
 *
 * Purpose: Movement and attack effects are per unit, then collapsed to distinct labels.
 * When to use: Every unit in the selection that the hover is planning for.
 * Expected outcome: `originWeather` is the unit's own hex, or the battle's weather during a battle.
 * Exceptions: None.
 */
export type OrderPreviewEffectsUnit = {
  readonly unitType: string;
  readonly originWeather?: WeatherState | null;
  readonly weatherTags?: readonly WeatherState[] | null;
};

/**
 * Battle slice the ranged-cap collector already accepts.
 *
 * Purpose: Forest, urban, and rubble are read from the attacker's cell, not the hovered target.
 * When to use: A tactical ranged hover. Strategic ranged omits it.
 * Expected outcome: The same shape `collectTacticalRangedSlowTerrainLabels` reads.
 * Exceptions: None.
 */
export type OrderPreviewRangedTerrainBattle = TacticalBattleTerrainPick &
  Pick<TacticalBattleSnapshot, 'subUnits'>;

/**
 * Input for `resolveOrderPreviewEffectsTooltipHtml`.
 *
 * Purpose: Keeps the formatter free of renderer state.
 * When to use: The hover publisher, after it knows whether the preview is legal.
 * Expected outcome: A blocked or empty order produces null.
 * Exceptions: None.
 */
export type OrderPreviewEffectsTooltipInput = {
  readonly kind: OrderPreviewEffectsKind;
  readonly hasBlockedMessage: boolean;
  readonly validForAll: boolean;
  readonly level: BonusLevel;
  readonly units: readonly OrderPreviewEffectsUnit[];
  readonly destinationWeather?: WeatherState | null;
  readonly targetWeather?: WeatherState | null;
  readonly marchImpact?: {
    readonly slower: readonly string[];
    readonly roadRail: boolean;
    readonly road?: boolean;
    readonly rail?: boolean;
  } | null;
  readonly rangedBattle?: OrderPreviewRangedTerrainBattle | null;
  readonly rangedPreviewUnitIds?: readonly string[];
  /**
   * Cover place of the hovered target, for ranged and air-strike hovers.
   *
   * Contract: Set only when the hovered target holds an enemy unit the player can see; otherwise null or omitted.
   * When to use: The hover publisher reads it from the same source the engine uses for that theater.
   * Expected outcome: Adds a Cover line when the target's cover against the selected shooters is above 0.
   * Exceptions: None.
   */
  readonly targetCover?: TerrainCoverPlace | null;
};

const WEATHER_WORDS: Readonly<Record<string, WeatherState>> = Object.freeze({
  Snow: 'snow',
  Rain: 'rain',
  Heat: 'heat',
});

const PENALIZING_WEATHER: readonly WeatherState[] = Object.freeze(['snow', 'rain', 'heat']);

/**
 * Returns effects HTML for the hover in progress, or null when the popup should stay hidden.
 *
 * Purpose: One omit rule for blocked orders, tactical ferry, and orders that terrain and weather do not change.
 * When to use: `publishHoverRoutePreview` after the blocked-message resolve.
 * Expected outcome: `Slower:` or `Using:` for a march. `Effects:` for a ferry, ranged attack, or air strike. Weather words carry their icon. Map-key terrain words carry their swatch.
 * Exceptions: None.
 */
export function resolveOrderPreviewEffectsTooltipHtml(input: OrderPreviewEffectsTooltipInput): string | null {
  if (input.hasBlockedMessage || !input.validForAll) return null;
  switch (input.kind) {
    case 'tacticalMarch':
      return tacticalMarchHtml(input.marchImpact ?? null);
    case 'strategicMarch':
      return strategicMarchHtml(input);
    case 'strategicFerry':
      return strategicFerryHtml(input);
    case 'tacticalFerry':
      return null;
    case 'ranged':
      return rangedHtml(input);
    case 'airStrike':
      return airStrikeHtml(input);
    default:
      return null;
  }
}

/**
 * Builds the tactical march lines, with a weather icon on Snow, Rain, and Heat.
 *
 * Purpose: Renders the march impact in its existing label order, with a weather icon wherever the impact named Snow, Rain, or Heat.
 * When to use: A legal tactical march.
 * Expected outcome: Null when the march is not slowed and does not use a road or rail.
 * Exceptions: None.
 */
function tacticalMarchHtml(
  impact: {
    readonly slower: readonly string[];
    readonly roadRail: boolean;
    readonly road?: boolean;
    readonly rail?: boolean;
  } | null
): string | null {
  if (!impact || (impact.slower.length === 0 && !transportLineSpecified(impact))) return null;
  const parts: string[] = [];
  if (impact.slower.length > 0) {
    parts.push(`<strong>Slower:</strong> ${impact.slower.map((label) => labelHtml(label)).join(', ')}`);
  }
  const using = formatTransportIconsHtml(impact);
  if (using) parts.push(`<strong>Using:</strong> ${using}`);
  return parts.join(TOOLTIP_SECTION_GAP_HTML);
}

/**
 * Names weather and armor-stop terrain that change a strategic march.
 *
 * Purpose: Weather and every stop hex the route enters share one `Slower:` line.
 * When to use: A legal strategic march.
 * Expected outcome: Null when nothing slows the march. Otherwise one `Slower:` line, labels sorted with `sortSlowTerrainLabels`.
 * Exceptions: None.
 */
function strategicMarchHtml(input: OrderPreviewEffectsTooltipInput): string | null {
  const labels: string[] = [];
  for (const unit of input.units) {
    if (
      !weatherSlowsMovement({
        unitType: unit.unitType,
        weather: unit.originWeather,
        tags: unit.weatherTags,
        level: input.level,
      })
    ) {
      continue;
    }
    const weather = unit.originWeather;
    if (!weather) continue;
    const word = weatherDisplayWord(weather);
    if (!labels.includes(word)) labels.push(word);
  }
  for (const label of input.marchImpact?.slower ?? []) {
    if (!labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) return null;
  const sorted = sortSlowTerrainLabels(labels);
  return `<strong>Slower:</strong> ${sorted.map((label) => labelHtml(label)).join(', ')}`;
}

/**
 * Names snow when it shortens a strategic ferry.
 *
 * Purpose: An untagged snow destination cuts the hop from 4 to 2. Other weather does not.
 * When to use: A legal strategic ferry. The caller only uses this kind when every selected unit is air.
 * Expected outcome: `Effects:` plus the snow icon, or null.
 * Exceptions: None.
 */
function strategicFerryHtml(input: OrderPreviewEffectsTooltipInput): string | null {
  const shortened = input.units.some(
    (unit) =>
      strategicFerryRangeHexes({
        weatherAtDestination: input.destinationWeather,
        tags: unit.weatherTags,
        enabled: input.level !== 'off',
      }) === 2
  );
  if (!shortened) return null;
  return `<strong>Effects:</strong> ${formatWeatherIconHtml('snow')}`;
}

/**
 * Names the attacker's range cap and any weather that cuts a ranged shot.
 *
 * Purpose: The cap is the attacker's cell. The hovered target does not choose the terrain word; it only adds a Cover line.
 * When to use: A legal ranged hover.
 * Expected outcome: `Effects:` with distinct terrain and weather labels, then `Cover:` when a non-air shooter faces cover at the target; null when the shot is unchanged.
 * Exceptions: None.
 */
function rangedHtml(input: OrderPreviewEffectsTooltipInput): string | null {
  const labels: string[] = [];
  if (input.rangedBattle && input.rangedPreviewUnitIds) {
    for (const label of collectTacticalRangedSlowTerrainLabels(input.rangedBattle, input.rangedPreviewUnitIds)) {
      pushDistinct(labels, label);
    }
  }
  for (const unit of input.units) {
    const penalty = weatherAttackPenalty({
      unitType: unit.unitType,
      kind: 'ranged',
      weatherAtUnit: unit.originWeather,
      tags: unit.weatherTags,
      level: input.level,
    });
    if (penalty > 0 && unit.originWeather) pushDistinct(labels, weatherDisplayWord(unit.originWeather));
  }
  const surfaceShooter = input.units.some((unit) => unit.unitType !== 'air');
  return joinSections([effectsLine(labels), surfaceShooter ? coverLine(input.targetCover, 'surface') : null]);
}

/**
 * Names each untagged snow, rain, or heat on the unit hex or the target hex that cuts an air strike.
 *
 * Purpose: Mild and a tagged weather do not change the strike. A shared weather is named once.
 * When to use: A legal air strike.
 * Expected outcome: `Effects:`, then `Cover:` when the targeted units have air cover, or null. Mountains give no air cover, so they are not listed.
 * Exceptions: None.
 */
function airStrikeHtml(input: OrderPreviewEffectsTooltipInput): string | null {
  const labels: string[] = [];
  for (const unit of input.units) {
    const penalty = weatherAttackPenalty({
      unitType: unit.unitType,
      kind: 'airStrike',
      weatherAtUnit: unit.originWeather,
      weatherAtTarget: input.targetWeather,
      tags: unit.weatherTags,
      level: input.level,
    });
    if (penalty <= 0) continue;
    for (const weather of [unit.originWeather, input.targetWeather]) {
      if (!weather || !PENALIZING_WEATHER.includes(weather)) continue;
      if (unit.weatherTags?.includes(weather)) continue;
      pushDistinct(labels, weatherDisplayWord(weather));
    }
  }
  return joinSections([effectsLine(labels), coverLine(input.targetCover, 'air')]);
}

/**
 * Names the cover that protects the targeted units against one kind of shooter.
 *
 * Purpose: Cover belongs to the target, so it gets its own line beside the attacker's Effects line.
 * When to use: Ranged and air-strike hovers with a `targetCover` place.
 * Expected outcome: `Cover:` with the source word and its swatch, or null when there is no place, no cover, or no source word.
 * Exceptions: None.
 */
function coverLine(place: TerrainCoverPlace | null | undefined, shooter: TerrainCoverShooter): string | null {
  if (!place || terrainCoverFor(place, shooter) <= 0) return null;
  const extra = strategicCoverRaiseLabel(place, shooter);
  if (extra) {
    const value = terrainCoverFor(place, shooter);
    const icon = formatStatusIconHtml(value >= 2 ? 'doubleUp' : 'up');
    return `<strong>Cover:</strong> ${icon}${extra}`;
  }
  const source = terrainCoverSourceLabel(place);
  return source ? `<strong>Cover:</strong> ${labelHtml(source)}` : null;
}

/**
 * Names rugged or city when that flag is why this column is above the other sources.
 *
 * Purpose: The planning Cover line uses the same icons as the hex Effects line for those two reasons.
 * When to use: From `coverLine` before the terrain-kind source.
 * Expected outcome: `City` when the city flag raises the column, otherwise `Rugged` when the rugged flag does. Null when forest, mountain, wetlands, urban, or rubble already account for the value.
 * Exceptions: None.
 */
function strategicCoverRaiseLabel(place: TerrainCoverPlace, shooter: TerrainCoverShooter): 'Rugged' | 'City' | null {
  const without = terrainCoverFor({ ...place, rugged: false, city: false }, shooter);
  if (place.city === true && terrainCoverFor({ ...place, rugged: false }, shooter) > without) return 'City';
  if (place.rugged === true && terrainCoverFor(place, shooter) > without) return 'Rugged';
  return null;
}

/**
 * Joins the non-empty tooltip sections with the standard gap.
 *
 * Purpose: Effects and Cover are independent lines; either may be missing.
 * When to use: Shot hovers that may add a Cover line.
 * Expected outcome: Null when every section is null.
 * Exceptions: None.
 */
function joinSections(sections: ReadonlyArray<string | null>): string | null {
  const present = sections.filter((section): section is string => section !== null);
  return present.length > 0 ? present.join(TOOLTIP_SECTION_GAP_HTML) : null;
}

/**
 * Joins terrain and weather labels under one Effects heading.
 *
 * Purpose: Shots and ferries are not marches, so they do not say Slower.
 * When to use: After the label list is collected.
 * Expected outcome: Null when the list is empty.
 * Exceptions: None.
 */
function effectsLine(labels: readonly string[]): string | null {
  if (labels.length === 0) return null;
  return `<strong>Effects:</strong> ${labels.map(labelHtml).join(', ')}`;
}

/**
 * Renders one label with a weather icon or a terrain swatch.
 *
 * Purpose: Snow, Rain, and Heat are weather. Map-key terrain, Urban, and Rubble keep a swatch.
 * When to use: Slower and Effects lines. Weather words use the weather icon. Terrain words use a swatch.
 * Expected outcome: Icon HTML already includes the weather word. Terrain words, including Urban and Rubble, keep their swatch span. The chip color is applied when the tooltip opens.
 * Exceptions: None.
 */
function labelHtml(label: string): string {
  const weather = weatherWord(label);
  if (weather) return formatWeatherIconHtml(weather);
  return formatTerrainNameListHtml(label);
}

/**
 * Reads a weather state from a title-case tooltip word.
 *
 * Purpose: March impact stores Snow, Rain, and Heat as words, and those words need icons.
 * When to use: While splitting a slower list.
 * Expected outcome: The matching state, or null for terrain words.
 * Exceptions: None.
 */
function weatherWord(label: string): WeatherState | null {
  return WEATHER_WORDS[label] ?? null;
}

/**
 * Returns the title-case word for a weather state.
 *
 * Purpose: Effects labels share the words the march impact already uses.
 * When to use: Before `labelHtml`.
 * Expected outcome: Snow, Rain, or Heat. Mild is not a penalty label and is not passed here.
 * Exceptions: None.
 */
function weatherDisplayWord(weather: WeatherState): string {
  switch (weather) {
    case 'snow':
      return 'Snow';
    case 'rain':
      return 'Rain';
    case 'heat':
      return 'Heat';
    default:
      return 'Mild';
  }
}

/**
 * Appends a label once, in first-seen order.
 *
 * Purpose: A mixed selection should not repeat Forest or Snow for every unit.
 * When to use: While collecting ranged and air-strike labels.
 * Expected outcome: `labels` gains `label` only when it is not already present.
 * Exceptions: None.
 */
function pushDistinct(labels: string[], label: string): void {
  if (!labels.includes(label)) labels.push(label);
}
