/**
 * The two view choices the player made in the map-mode tabs: whether weather icons show, and whether the Tech view is
 * on. This module holds them for the rest of the session; they are not saved, so the app opens with weather icons shown
 * and the Tech view off each time.
 *
 * Purpose: The mode tabs write the choices and the drawing code reads them, without either importing the other.
 * When to use: Through the getters and setters below.
 * Expected outcome: `DEFAULT_WEATHER_ICONS_SHOWN` and `DEFAULT_TECH_VIEW_CHOSEN` until the player changes them.
 * Exceptions: None.
 */
import { DEFAULT_TECH_VIEW_CHOSEN, DEFAULT_WEATHER_ICONS_SHOWN } from '../../shared/mapViewMode';

/**
 * Whether Weather is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `areWeatherIconsShown` and `setWeatherIconsShown`.
 * Expected outcome: Starts as `DEFAULT_WEATHER_ICONS_SHOWN`.
 * Exceptions: None.
 */
let weatherIconsShown = DEFAULT_WEATHER_ICONS_SHOWN;

/**
 * Whether Tech is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `isTechViewChosen` and `setTechViewChosen`.
 * Expected outcome: Starts as `DEFAULT_TECH_VIEW_CHOSEN`.
 * Exceptions: None.
 */
let techViewChosen = DEFAULT_TECH_VIEW_CHOSEN;

/**
 * Returns whether the world map shows weather icons.
 *
 * Purpose: The status-icon pass and the Weather tab follow the same choice.
 * When to use: Each time the status icons are drawn, and when the mode tabs redraw their pressed state.
 * Expected outcome: True while Weather is on.
 * Exceptions: None.
 */
export function areWeatherIconsShown(): boolean {
  return weatherIconsShown;
}

/**
 * Records whether the world map shows weather icons.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Weather tab.
 * Expected outcome: Later calls to `areWeatherIconsShown` return `shown`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setWeatherIconsShown(shown: boolean): void {
  weatherIconsShown = shown;
}

/**
 * Returns whether the player turned the Tech view on.
 *
 * Purpose: Drawing code and the Tech tab follow the same choice.
 * When to use: Each time the inspection view is decided, and when the mode tabs redraw their pressed state.
 * Expected outcome: True while Tech is on.
 * Exceptions: None.
 */
export function isTechViewChosen(): boolean {
  return techViewChosen;
}

/**
 * Records whether the player turned the Tech view on.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Tech tab.
 * Expected outcome: Later calls to `isTechViewChosen` return `chosen`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setTechViewChosen(chosen: boolean): void {
  techViewChosen = chosen;
}
