/**
 * The Orders tab's tip. This module holds the control tips for the app frame around the map: set
 * `data-control-tooltip` from these values, and keep the static markup in `static/index.html` the same, character for
 * character.
 *
 * Purpose: Says what the Orders tab shows.
 * When to use: `#console-tab-orders`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const ordersTabTooltipText = 'Show the orders queued for this turn or beat.';

/**
 * The Opponent tab's tip.
 *
 * Purpose: Says what the Opponent tab shows.
 * When to use: `#console-tab-opponent`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const opponentTabTooltipText = "Show whether the opponent is planning, its model, its tools, and the AI activity log.";

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
 * Purpose: Says collapsing widens the map and how to bring the console back.
 * When to use: `#console-collapse-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const collapseConsoleTooltipText = 'Hide the console to widen the map. Click a tab to show it again.';

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
export function forcesStatTooltipText(breakdown: string): string {
  return `Units you have fielded, out of the most this game size allows: ${breakdown}.`;
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
export const opponentHomeStatTooltipText = "Hexes of the opponent's home region that you hold, out of all its hexes.";

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
 * Purpose: Says saving to a file is not available, and that the match in progress is still kept.
 * When to use: The tip host around `#game-menu-save-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const saveGameUnavailableTooltipText =
  'Saving to a file is not available in this version. The match in progress is kept on disk between sessions.';

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
 * The Reports tab's tip.
 *
 * Purpose: Says what the Reports tab lists.
 * When to use: `#console-tab-reports`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const reportsTabTooltipText = 'Show the turn reports, opponent messages, and notices from this match, newest first.';

/**
 * The Weather map mode's tip.
 *
 * Purpose: Says Weather is the map's normal view.
 * When to use: `#map-mode-weather`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapWeatherModeTooltipText =
  "Show the map as usual: terrain, and each hex's weather while the weather bonus is on.";

/**
 * The Tech map mode's tip.
 *
 * Purpose: Says what Tech shows, where it applies, how long it lasts, and how it relates to holding T.
 * When to use: `#map-mode-tech`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapTechModeTooltipText =
  "Show each hex's code, production, and tech tier instead of terrain on the world map, until you choose Weather. Holding T shows the same view while the key is down.";

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
 * The battle header's force bar tip.
 *
 * Purpose: Says what the two counts include, and that the enemy count is not limited by fog of war.
 * When to use: `#battle-force-bar`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const battleForceBarTooltipText =
  'Sub-units each side has in this battle, counting any carried by a ship. A battle has no fog of war, so both counts are exact.';
