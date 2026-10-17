/**
 * The layer choices the player made in the map-mode tabs: weather icons, tech icons, control borders, and production
 * detail. This module holds them for the rest of the session; they are not saved, so the app opens with the defaults
 * in `src/shared/mapViewMode.ts` each time.
 *
 * Purpose: The mode tabs write the choices and the drawing code reads them, without either importing the other.
 * When to use: Through the getters and setters below.
 * Expected outcome: The `DEFAULT_*` values until the player changes them.
 * Exceptions: None.
 */
import {
  DEFAULT_CONTROL_BORDERS_SHOWN,
  DEFAULT_PRODUCTION_DETAIL_CHOSEN,
  DEFAULT_TECH_VIEW_CHOSEN,
  DEFAULT_WEATHER_ICONS_SHOWN,
} from '../../shared/mapViewMode';

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
 * Whether Control is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `areControlBordersShown` and `setControlBordersShown`.
 * Expected outcome: Starts as `DEFAULT_CONTROL_BORDERS_SHOWN`.
 * Exceptions: None.
 */
let controlBordersShown = DEFAULT_CONTROL_BORDERS_SHOWN;

/**
 * Whether Production is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `isProductionDetailChosen` and `setProductionDetailChosen`.
 * Expected outcome: Starts as `DEFAULT_PRODUCTION_DETAIL_CHOSEN`.
 * Exceptions: None.
 */
let productionDetailChosen = DEFAULT_PRODUCTION_DETAIL_CHOSEN;

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
 * Returns whether the player turned Tech on.
 *
 * Purpose: The tech-icon pass and the Tech tab follow the same choice.
 * When to use: Through `areTechIconsShown`, which adds the T key and the battle and overlay rules, and when the mode
 *   tabs redraw their pressed state.
 * Expected outcome: True while Tech is on.
 * Exceptions: None.
 */
export function isTechViewChosen(): boolean {
  return techViewChosen;
}

/**
 * Records whether the player turned Tech on.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Tech tab.
 * Expected outcome: Later calls to `isTechViewChosen` return `chosen`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setTechViewChosen(chosen: boolean): void {
  techViewChosen = chosen;
}

/**
 * Returns whether the world map shows the borders that mark who controls each hex, and the home-region outlines.
 *
 * Purpose: The terrain pass and the Control tab follow the same choice.
 * When to use: Each time the world map's hexes or the home-region outlines are drawn, and when the mode tabs redraw
 *   their pressed state.
 * Expected outcome: True while Control is on.
 * Exceptions: None.
 */
export function areControlBordersShown(): boolean {
  return controlBordersShown;
}

/**
 * Records whether the world map shows the control borders and the home-region outlines.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Control tab.
 * Expected outcome: Later calls to `areControlBordersShown` return `shown`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setControlBordersShown(shown: boolean): void {
  controlBordersShown = shown;
}

/**
 * Returns whether the player turned Production on.
 *
 * Purpose: The production labels and the Production tab follow the same choice.
 * When to use: Through `isProductionDetailShown`, which adds the T key and the battle and overlay rules, and when the
 *   mode tabs redraw their pressed state.
 * Expected outcome: True while Production is on.
 * Exceptions: None.
 */
export function isProductionDetailChosen(): boolean {
  return productionDetailChosen;
}

/**
 * Records whether the player turned Production on.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Production tab.
 * Expected outcome: Later calls to `isProductionDetailChosen` return `chosen`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setProductionDetailChosen(chosen: boolean): void {
  productionDetailChosen = chosen;
}
