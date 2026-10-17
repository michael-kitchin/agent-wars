/**
 * The row of map-mode tabs under the minimap overview: Weather, Tech, Control, and Production each show or hide one map
 * layer, and Legend opens or closes the terrain legend. The row starts hidden, and the toggle on the overview's
 * lower-left corner shows and hides it.
 *
 * Purpose: Keeps the tabs, the row's toggle, the stored choices, and the legend in step.
 * When to use: `wireMapModeTabs` once at startup.
 * Expected outcome: Each layer tab reads as pressed while its layer is chosen, and Legend while the legend is open.
 *   The toggle reads as expanded while the row shows.
 * Exceptions: None; missing elements are skipped.
 */
import { mapModeTabsHideTooltipText, mapModeTabsShowTooltipText } from '../chrome/frameTooltipText';
import { layoutMapChrome } from './mapChromeLayout';
import {
  areControlBordersShown,
  areWeatherIconsShown,
  isProductionDetailChosen,
  isTechViewChosen,
  setControlBordersShown,
  setProductionDetailChosen,
  setTechViewChosen,
  setWeatherIconsShown,
} from './mapViewModeState';

/**
 * One layer tab: its element id and the stored choice it reads and writes.
 *
 * Purpose: The four layer tabs behave the same way, so one table drives them.
 * When to use: Entries of `LAYER_TABS`.
 * Expected outcome: `read` returns the stored choice; `write` records a new one without redrawing.
 * Exceptions: None.
 */
interface MapLayerTab {
  /**
   * The tab's id in `static/index.html`.
   *
   * Contract: The button id, also used as its tip host's id.
   * When to use: Read while the tabs are wired and while a layer toggles.
   * Expected outcome: One of the four ids in `LAYER_TABS`.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Returns whether the layer is chosen.
   *
   * Contract: Reads the stored choice and does not redraw.
   * When to use: Read while the tabs sync and after a toggle.
   * Expected outcome: True when the layer is on.
   * Exceptions: None.
   */
  readonly read: () => boolean;
  /**
   * Records whether the layer is chosen.
   *
   * Contract: Writes the stored choice and does not redraw.
   * When to use: Called when the player toggles the tab.
   * Expected outcome: The next `read` returns the value written.
   * Exceptions: None.
   */
  readonly write: (chosen: boolean) => void;
}

/**
 * The layer tabs, left to right.
 *
 * Purpose: A layer tab is one row here, plus its markup and its stored choice.
 * When to use: `syncMapModeTabs` and `wireMapModeTabs`.
 * Expected outcome: Weather, Tech, Control, Production.
 * Exceptions: None.
 */
const LAYER_TABS: readonly MapLayerTab[] = Object.freeze([
  { id: 'map-mode-weather', read: areWeatherIconsShown, write: setWeatherIconsShown },
  { id: 'map-mode-tech', read: isTechViewChosen, write: setTechViewChosen },
  { id: 'map-mode-control', read: areControlBordersShown, write: setControlBordersShown },
  { id: 'map-mode-production', read: isProductionDetailChosen, write: setProductionDetailChosen },
]);

/**
 * Sets each tab's pressed state from the stored choices and the legend.
 *
 * Purpose: The tabs are the only sign of which choices are on, so they must never disagree with them.
 * When to use: After a choice changes or the legend opens or closes.
 * Expected outcome: `aria-pressed` on each layer tab matches its stored choice; `aria-pressed` and `aria-expanded` on
 *   Legend match whether `#terrain-legend` is shown.
 * Exceptions: None.
 */
function syncMapModeTabs(): void {
  for (const tab of LAYER_TABS) {
    document.getElementById(tab.id)?.setAttribute('aria-pressed', String(tab.read()));
  }
  const legendOpen = document.getElementById('terrain-legend')?.hidden === false;
  const legendToggle = document.getElementById('map-legend-toggle');
  legendToggle?.setAttribute('aria-pressed', String(legendOpen));
  legendToggle?.setAttribute('aria-expanded', String(legendOpen));
}

/**
 * Turns one map layer on or off.
 *
 * Purpose: The canvas draws each layer from its stored choice, so a click only flips the choice and redraws.
 * When to use: From a layer tab's click.
 * Expected outcome: The choice flips, the tabs follow, and the map is redrawn. The other layers are not touched.
 * Exceptions: None.
 */
function toggleMapLayer(tab: MapLayerTab, requestRedraw: () => void): void {
  tab.write(!tab.read());
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
 * Wires the row's toggle, the layer tabs, and the Legend tab.
 *
 * Purpose: The mode tabs' single setup point.
 * When to use: Once at startup, after the maps and the legend are built.
 * Expected outcome: Clicks show or hide the row, turn a layer on or off, or open or close the legend, and the tabs
 *   show the session's starting state. The row's starting state, hidden, comes from the markup.
 * Exceptions: None.
 */
export function wireMapModeTabs(requestRedraw: () => void): void {
  document.getElementById('map-mode-tabs-toggle')?.addEventListener('click', () => {
    setMapModeTabsShown(document.getElementById('map-mode-tabs')?.hidden === true);
  });
  for (const tab of LAYER_TABS) {
    document.getElementById(tab.id)?.addEventListener('click', () => toggleMapLayer(tab, requestRedraw));
  }
  document.getElementById('map-legend-toggle')?.addEventListener('click', toggleTerrainLegend);
  syncMapModeTabs();
}
