/**
 * The sentence that ends each enabled console tab's tip. This module holds the control tips for the app frame around
 * the map: set `data-control-tooltip` from these values, and keep the static markup in `static/index.html` the same,
 * character for character.
 *
 * Purpose: The console has no collapse button, so each tab says how to hide it.
 * When to use: The last sentence of the Orders, Reports, and Commanders tabs' tips.
 * Expected outcome: The control tip ends with this sentence.
 * Exceptions: None.
 */
const consoleTabCollapseSentence = 'Click the selected tab to hide the console and widen the map.';

/**
 * The Orders tab's tip.
 *
 * Purpose: Says what the Orders tab shows, and how to hide the console.
 * When to use: `#console-tab-orders`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const ordersTabTooltipText = `Show the orders queued for this turn or beat. ${consoleTabCollapseSentence}`;

/**
 * The Commanders tab's tip.
 *
 * Purpose: Says what the Commanders tab shows, and how to hide the console.
 * When to use: `#console-tab-commanders`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const commandersTabTooltipText =
  `Show each commander's status, cost, and settings, the tool groups, and the AI activity log. ${consoleTabCollapseSentence}`;

/**
 * Builds the tip for a control this version does not offer.
 *
 * Purpose: Says a disabled placeholder is not a broken control.
 * When to use: The tip host around each disabled placeholder, with the control's visible name, such as "Settings".
 * Expected outcome: For example "Settings is not available in this version."
 * Exceptions: None.
 */
export function unavailableTooltipText(name: string): string {
  return `${name} is not available in this version.`;
}

/**
 * Purpose: Says what the Production readout counts and when it is earned.
 * When to use: The Production readout in the top bar.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const productionStatTooltipText =
  'The production your cities can add each turn. A city adds its share only while it is building, and a city on the neutral border adds none.';

/**
 * Purpose: Lists units fielded against the game-size cap for each type.
 * When to use: Whenever the Forces readout is refreshed, with the breakdown from `formatForcesBreakdown`.
 * Expected outcome: For example "Units you have fielded, out of the most this game size allows: infantry 3 of 12, ...".
 * Exceptions: None.
 */
export const forcesStatTooltipLead = 'Units you have fielded, out of the most this game size allows';

/**
 * Purpose: Lists units fielded against the game-size cap for each type.
 * When to use: Whenever the Forces readout is refreshed, with the breakdown from `formatForcesBreakdown`.
 * Expected outcome: `${forcesStatTooltipLead}: ${breakdown}.`
 * Exceptions: None.
 */
export function forcesStatTooltipText(breakdown: string): string {
  return `${forcesStatTooltipLead}: ${breakdown}.`;
}

/**
 * Purpose: Says what the Your home readout counts.
 * When to use: The Your home readout in the top bar.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const humanHomeStatTooltipText = 'Hexes of your home region that you hold, out of all its hexes.';

/**
 * Purpose: Says what the Enemy home readout counts.
 * When to use: The Enemy home readout in the top bar.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const enemyHomeStatTooltipText = "Hexes of the opponent's home region that you hold, out of all its hexes.";

/**
 * Purpose: Names what the game menu holds.
 * When to use: `#game-menu-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const gameMenuButtonTooltipText =
  'Open the game menu to start a new game, choose whether Ready offers tactical battles, or quit.';

/**
 * Purpose: Says Quit closes the app.
 * When to use: `#game-menu-quit-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const quitTooltipText = 'Close Agent Wars.';

/**
 * The selection panel close button's tip.
 *
 * Purpose: Says the selection panel's × clears the selection and keeps the orders.
 * When to use: `#selection-panel-close`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const selectionPanelCloseTooltipText = 'Clear the selection. Queued orders stay.';

/**
 * The selection panel grip's tip.
 *
 * Purpose: Says how the selection panel's grip resizes it, and that the size is not saved.
 * When to use: `#selection-panel-grip`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const selectionPanelGripTooltipText = 'Drag to resize this panel. The size lasts until the app closes.';

/**
 * The selection panel expand control's tip while the panel is compact.
 *
 * Purpose: Says what expanding the panel shows.
 * When to use: `#selection-panel-expand` while the panel shows only its summary bar.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const selectionPanelExpandTooltipText = "Show the hex, its terrain, and each selected unit's orders.";

/**
 * The selection panel expand control's tip while the panel is expanded.
 *
 * Purpose: Says that collapsing hides the details and keeps the summary bar.
 * When to use: `#selection-panel-expand` while the panel shows its details.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const selectionPanelCollapseTooltipText = 'Hide the details. The bar stays.';

/**
 * The Reports tab's tip.
 *
 * Purpose: Says what the Reports tab lists, and how to hide the console.
 * When to use: `#console-tab-reports`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const reportsTabTooltipText =
  `Show the turn reports, opponent messages, and notices from this match, newest first. ${consoleTabCollapseSentence}`;

/**
 * The tip of the toggle on the minimap overview's corner while the map-mode tabs are hidden.
 *
 * Purpose: Says what the toggle shows and where.
 * When to use: `#map-mode-tabs-toggle` while `#map-mode-tabs` is hidden. The static markup starts with this sentence.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapModeTabsShowTooltipText = 'Show the map-mode buttons under the overview.';

/**
 * The tip of the toggle on the minimap overview's corner while the map-mode tabs show.
 *
 * Purpose: Says what the toggle hides, and that the terrain legend closes with the tabs.
 * When to use: `#map-mode-tabs-toggle` while `#map-mode-tabs` shows.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const mapModeTabsHideTooltipText =
  'Hide the map-mode buttons. Hiding them also closes the terrain legend.';

/**
 * The Weather map mode's tip.
 *
 * Purpose: Says Weather is a toggle for the weather icons, and when they can show.
 * When to use: `#map-mode-weather`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapWeatherModeTooltipText =
  "Show or hide each hex's weather icon on the world map, while the weather bonus is on.";

/**
 * The Tech map mode's tip.
 *
 * Purpose: Says Tech is a toggle for the tech tier icons, when they can show, and how it relates to holding T.
 * When to use: `#map-mode-tech`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const mapTechModeTooltipText =
  "Show or hide each hex's tech tier icon on the world map, while the tech bonus is on. Holding T shows them too, while the key is down.";

/**
 * The Control map mode's tip.
 *
 * Purpose: Says Control is a toggle for the control borders and the home-region outlines.
 * When to use: `#map-mode-control`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapControlModeTooltipText =
  'Show or hide the borders that mark who controls each hex, and the home-region outlines.';

/**
 * The Production map mode's tip.
 *
 * Purpose: Says Production shows labels on every hex, as holding T does, and what Off shows.
 * When to use: `#map-mode-production`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const mapProductionModeTooltipText =
  'Show or hide production on every world hex, the way holding T does. Off shows it only on hexes you control.';

/**
 * The Legend button's tip.
 *
 * Purpose: Says the button opens and closes the terrain legend, which holds the terrain style choice.
 * When to use: `#map-legend-toggle`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapLegendToggleTooltipText = 'Show or hide the terrain legend and its style choice.';

/**
 * The new-game setup panel's grip tip.
 *
 * Purpose: Says the grip moves the panel, and that each open puts it back in the corner.
 * When to use: `#new-game-panel-grip`. The static markup holds this sentence.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const newGameGripTooltipText = 'Drag to move this screen. It goes back to the corner each time it opens.';

/**
 * The new-game setup panel's close tip.
 *
 * Purpose: Says close goes back to the match that kept running under the screen.
 * When to use: `#new-game-dialog-close`, which shows only while a match is waiting. The static markup holds this
 *   sentence.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const newGameCloseTooltipText = 'Close this screen and go back to the match in progress.';

/**
 * The battle header's force bar tip.
 *
 * Purpose: Says what the two counts include, and that the enemy count is not limited by fog of war.
 * When to use: `#battle-force-bar`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const battleForceBarTooltipText =
  'Sub-units each side has in this battle, counting any carried by a ship. A battle has no fog of war, so both counts are exact.';
