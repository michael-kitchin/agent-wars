/**
 * Weather icons for the four states. Rain, snow, and heat are vendored Meteocons. Mild is a larger static sun in the same gold.
 *
 * Purpose: Hex tooltips, the turn line, and unit origin tooltips share one icon per state.
 * When to use: Any UI that shows Mild, Rain, Snow, or Heat.
 * Expected outcome: A path under `static/weather/` and an escaped `<img>` at text size.
 * Exceptions: None.
 */

import type { WeatherState } from './weatherBonusTypes';
import { escapeHtmlText } from './htmlTextFormatting';
import { formatWeatherLabel } from './weatherBonusRules';

/**
 * CSS class for a weather icon.
 *
 * Purpose: One size next to weather words, styled in `static/index.html`.
 * When to use: On every weather `<img>`.
 * Expected outcome: A square icon that sits on the text baseline.
 * Exceptions: None.
 */
export const WEATHER_ICON_CLASS_NAME = 'weather-icon';

/**
 * Maps a weather state to its icon file.
 *
 * Purpose: Mild uses a large static sun so it fills the same text size as rain, snow, and heat. Heat uses the warmer thermometer.
 * When to use: `weatherIconAssetPath`.
 * Expected outcome: A file name in `static/weather/`.
 * Exceptions: None.
 */
const WEATHER_ICON_FILE: Readonly<Record<WeatherState, string>> = Object.freeze({
  mild: 'clear-day.svg',
  rain: 'rain.svg',
  snow: 'snow.svg',
  heat: 'thermometer-warmer.svg',
});

/**
 * Returns the asset path for one weather state.
 *
 * Purpose: `<img src>` values are relative to `static/`.
 * When to use: When building weather markup.
 * Expected outcome: `weather/<file>.svg`. An unknown state uses the mild icon.
 * Exceptions: None.
 */
export function weatherIconAssetPath(weather: WeatherState | null | undefined): string {
  const file = weather ? WEATHER_ICON_FILE[weather] : WEATHER_ICON_FILE.mild;
  return `weather/${file ?? WEATHER_ICON_FILE.mild}`;
}

/**
 * Returns an icon plus the weather word.
 *
 * Purpose: Every surface that shows weather leads with the icon, the way country names lead with a flag.
 * When to use: Tooltips and the turn line.
 * Expected outcome: Escaped HTML. An unknown state renders as Mild.
 * Exceptions: None.
 */
export function formatWeatherIconHtml(weather: WeatherState | null | undefined): string {
  const label = formatWeatherLabel(weather);
  const src = escapeHtmlText(weatherIconAssetPath(weather));
  return `<img class="${WEATHER_ICON_CLASS_NAME}" src="${src}" alt="" aria-hidden="true" />${escapeHtmlText(label)}`;
}

/**
 * Returns the weather chip for an Effects line, when that weather changes movement or attack.
 *
 * Purpose: Mild is the baseline, so an Effects line names only snow, rain, and heat.
 * When to use: While building the hex tooltip Effects line. The Weather line still names mild.
 * Expected outcome: Icon plus word for snow, rain, or heat. Null for mild, missing weather, and an unknown value.
 * Exceptions: None.
 */
export function formatAppliedWeatherEffectHtml(weather: WeatherState | null | undefined): string | null {
  if (weather !== 'snow' && weather !== 'rain' && weather !== 'heat') return null;
  return formatWeatherIconHtml(weather);
}
