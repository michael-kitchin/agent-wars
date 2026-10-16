/**
 * The row of map-mode tabs under the minimap overview: Weather shows or hides the weather icons and Tech turns the Tech
 * view on or off, each a toggle on its own; Control and Production are disabled placeholders in the markup; and Legend
 * opens or closes the terrain legend. The row starts hidden, and the toggle on the overview's lower-left corner shows
 * and hides it.
 *
 * Purpose: Keeps the tabs, the row's toggle, the stored choices, and the legend in step.
 * When to use: `wireMapModeTabs` once at startup.
 * Expected outcome: Weather reads as pressed while its icons show, Tech while its view is on, and Legend while the
 *   legend is open. The toggle reads as expanded while the row shows.
 * Exceptions: None; missing elements are skipped.
 */
import { mapModeTabsHideTooltipText, mapModeTabsShowTooltipText } from '../chrome/frameTooltipText';
import { layoutMapChrome } from './mapChromeLayout';
import { areWeatherIconsShown, isTechViewChosen, setTechViewChosen, setWeatherIconsShown } from './mapViewModeState';

/**
 * Sets each tab's pressed state from the stored choices and the legend.
 *
 * Purpose: The tabs are the only sign of which choices are on, so they must never disagree with them.
 * When to use: After a choice changes or the legend opens or closes.
 * Expected outcome: `aria-pressed` on Weather and on Tech matches its stored choice; `aria-pressed` and
 *   `aria-expanded` on Legend match whether `#terrain-legend` is shown.
 * Exceptions: None.
 */
function syncMapModeTabs(): void {
  document.getElementById('map-mode-weather')?.setAttribute('aria-pressed', String(areWeatherIconsShown()));
  document.getElementById('map-mode-tech')?.setAttribute('aria-pressed', String(isTechViewChosen()));
  const legendOpen = document.getElementById('terrain-legend')?.hidden === false;
  const legendToggle = document.getElementById('map-legend-toggle');
  legendToggle?.setAttribute('aria-pressed', String(legendOpen));
  legendToggle?.setAttribute('aria-expanded', String(legendOpen));
}

/**
 * Turns the weather icons on the world map on or off.
 *
 * Purpose: The canvas draws the weather icons from the stored choice, in either view.
 * When to use: From the Weather tab.
 * Expected outcome: The choice flips, the tab follows, and the map is redrawn. The Tech view is not touched.
 * Exceptions: None.
 */
function toggleWeatherIcons(requestRedraw: () => void): void {
  setWeatherIconsShown(!areWeatherIconsShown());
  syncMapModeTabs();
  requestRedraw();
}

/**
 * Turns the Tech view on or off.
 *
 * Purpose: The Tech view decides the terrain fill, the hex codes, and the tech icons, which the canvas draws.
 * When to use: From the Tech tab.
 * Expected outcome: The choice flips, the tab follows, and the map is redrawn. The weather icons are not touched.
 * Exceptions: None.
 */
function toggleTechView(requestRedraw: () => void): void {
  setTechViewChosen(!isTechViewChosen());
  syncMapModeTabs();
  requestRedraw();
}

/**
 * Opens the terrain legend, or closes it if it is open.
 *
 * Purpose: The legend is a popover now, closed until the player asks for it.
 * When to use: From the Legend tab.
 * Expected outcome: The legend shows or hides, the tab follows, and the legend and the toast band are placed again.
 * Exceptions: None.
 */
function toggleTerrainLegend(): void {
  const legend = document.getElementById('terrain-legend');
  if (!legend) return;
  legend.hidden = !legend.hidden;
  syncMapModeTabs();
  layoutMapChrome();
}

/**
 * Shows or hides the row of map-mode tabs under the overview.
 *
 * Purpose: The panel is only the overview until the player asks for the tabs. The Legend tab is in the row, so hiding
 *   the row also closes the legend, which would otherwise have no control on screen to close it.
 * When to use: From the toggle on the overview's lower-left corner. The row's `hidden` attribute is the stored state, so
 *   the choice lasts until the app closes, including while the panel is hidden for the new-game overlay.
 * Expected outcome: The row shows or hides; the toggle's `aria-expanded`, name, and tip follow; a hidden row closes the
 *   legend; and the legend and the toast band are placed again for the panel's new height.
 * Exceptions: None; missing elements are skipped.
 */
function setMapModeTabsShown(shown: boolean): void {
  const row = document.getElementById('map-mode-tabs');
  const toggle = document.getElementById('map-mode-tabs-toggle');
  if (!row || !toggle) return;
  row.hidden = !shown;
  toggle.setAttribute('aria-expanded', String(shown));
  toggle.setAttribute('aria-label', shown ? 'Hide the map modes' : 'Show the map modes');
  toggle.setAttribute('data-control-tooltip', shown ? mapModeTabsHideTooltipText : mapModeTabsShowTooltipText);
  const legend = document.getElementById('terrain-legend');
  if (!shown && legend) legend.hidden = true;
  syncMapModeTabs();
  layoutMapChrome();
}

/**
 * Wires the row's toggle and the Weather, Tech, and Legend tabs.
 *
 * Purpose: The mode tabs' single setup point.
 * When to use: Once at startup, after the maps and the legend are built.
 * Expected outcome: Clicks show or hide the row, turn Weather or Tech on or off, or open or close the legend, and the
 *   tabs show the session's starting state. The row's starting state, hidden, comes from the markup.
 * Exceptions: None.
 */
export function wireMapModeTabs(requestRedraw: () => void): void {
  document.getElementById('map-mode-tabs-toggle')?.addEventListener('click', () => {
    setMapModeTabsShown(document.getElementById('map-mode-tabs')?.hidden === true);
  });
  document.getElementById('map-mode-weather')?.addEventListener('click', () => toggleWeatherIcons(requestRedraw));
  document.getElementById('map-mode-tech')?.addEventListener('click', () => toggleTechView(requestRedraw));
  document.getElementById('map-legend-toggle')?.addEventListener('click', toggleTerrainLegend);
  syncMapModeTabs();
}
