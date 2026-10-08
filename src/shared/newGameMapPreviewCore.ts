import type { PreviewHomeBorder, PreviewTechIconInput, PreviewWeatherIconInput } from './newGameMapPreviewTypes';
import type { TechLevel } from './techBonusTypes';
import { calendarMonthIndex } from './weatherBonusRules';
import type { WeatherState } from './weatherBonusTypes';

/**
 * The four weather words the icon row accepts.
 *
 * Purpose: A bad payload entry must not be drawn as Mild by the asset helper.
 * When to use: `previewWeatherIcon` after the month index is chosen.
 * Expected outcome: Membership is true only for the four display states.
 * Exceptions: None.
 */
const WEATHER_STATES: ReadonlySet<string> = new Set<WeatherState>(['mild', 'rain', 'snow', 'heat']);

/**
 * Chooses the home-border colors for one preview hex.
 *
 * Purpose: Exclusive homes are drawn as already controlled by that side. A hex in both homes uses the gray overlap rings.
 * When to use: Once per hex after the draw loop has built the two home sets.
 * Expected outcome: A null identity when the hex is in neither set. Otherwise the controller and owner the ownership drawer expects.
 * Exceptions: None.
 */
export function previewHomeBorder(
  h3Index: string,
  humanHomeHexes: ReadonlySet<string>,
  aiHomeHexes: ReadonlySet<string>
): PreviewHomeBorder {
  const inHuman = humanHomeHexes.has(h3Index);
  const inAi = aiHomeHexes.has(h3Index);
  if (inHuman && inAi) return { controllerPlayerId: null, homeOwnerIdentity: 'both' };
  if (inHuman) return { controllerPlayerId: 'human', homeOwnerIdentity: 'human' };
  if (inAi) return { controllerPlayerId: 'opponent', homeOwnerIdentity: 'opponent' };
  return { controllerPlayerId: null, homeOwnerIdentity: null };
}

/**
 * Chooses the weather icon for one preview hex, or null when that hex shows none.
 *
 * Purpose: The preview follows the dialog's month and weather bonus, and it does not draw a tech icon while T is held.
 * When to use: Once per hex per frame, with values read from the dialog and the view, not from a cached copy.
 * Expected outcome: A display state, including `mild`. Null when the bonus is off, T is held, the view is at battle-detail zoom, or the year is not twelve known states.
 * Exceptions: None.
 */
export function previewWeatherIcon(input: PreviewWeatherIconInput): WeatherState | null {
  if (input.tacticalZoom || input.mapInspectionHeld || input.weatherBonusLevel === 'off') return null;
  if (input.weatherByMonth.length !== 12) return null;
  const weather: string | undefined = input.weatherByMonth[calendarMonthIndex(1, input.startMonth)];
  if (weather == null || !WEATHER_STATES.has(weather)) return null;
  return weather as WeatherState;
}

/**
 * Chooses the tech icon for one preview hex, or null when that hex shows none.
 *
 * Purpose: Holding T with Tech bonus on shows the same Basic or Advanced glyph a match on this map would show.
 * When to use: Once per hex per frame. Low and High share the glyph. The threshold is the preview map's, not the loaded match's.
 * Expected outcome: `basic` or `advanced` when T is held, the bonus is not off, the view is not at battle-detail zoom, and the urban count is positive. Otherwise null.
 * Exceptions: None.
 */
export function previewTechIcon(input: PreviewTechIconInput): TechLevel | null {
  if (!input.mapInspectionHeld || input.tacticalZoom || input.techBonusLevel === 'off') return null;
  if (!Number.isFinite(input.baselineUrbanHexCount) || input.baselineUrbanHexCount <= 0) return null;
  if (!Number.isFinite(input.advancedMinUrbanCells)) return null;
  return input.baselineUrbanHexCount >= input.advancedMinUrbanCells ? 'advanced' : 'basic';
}
