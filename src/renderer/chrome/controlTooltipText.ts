/**
 * Purpose: One catalog so static markup and dynamic controls do not drift apart.
 * When to use: Set `data-control-tooltip` from these values. Do not rewrite a sentence in a TypeScript caller. Static markup may repeat the same characters.
 * Expected outcome: The player sees the sentence unchanged.
 * Exceptions: None.
 */

/**
 * Purpose: Says which caps change and that the map and starting forces do not.
 * When to use: `#new-game-size-select`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const gameSizeSelectTooltipText =
  'Set how many units each side may field. Small is the baseline, Medium doubles it, and Large triples it, without changing the map or the starting forces.';

/**
 * Purpose: Names Off, Default, and High and what Default and High add.
 * When to use: `#new-game-origin-bonus-select`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const originBonusSelectTooltipText =
  'Default adds 2 and High adds 4 when a unit fights in the area where it was built: a country in a global game, and the origin area in a regional game.';

/**
 * Purpose: Names who gains attack and defense, and that Basic units gain nothing.
 * When to use: `#new-game-tech-bonus-select`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const techBonusSelectTooltipText =
  'Choose Off, Default, or High. Advanced units gain 2 attack at either level, High also adds 2 defense, and Basic units gain nothing.';

/**
 * Purpose: Says the bonus is for battles and does not stack with the origin bonus.
 * When to use: `#new-game-terrain-bonus-select`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const terrainBonusSelectTooltipText =
  'In a battle, Default adds 2 and High adds 4 when a unit fights on the terrain where it was built. Off adds nothing, and a unit that also gets the origin bonus receives only the larger of the two.';

/**
 * Purpose: Says Off ignores weather and that High is the harsher penalty.
 * When to use: `#new-game-weather-bonus-select`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const weatherBonusSelectTooltipText =
  'Choose Off to ignore weather. Default and High slow movement and cut some attacks for units that lack that weather, and High is the harsher penalty.';

/**
 * Purpose: Says what checked and unchecked do for the next match.
 * When to use: `#new-game-fog-checkbox`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const fogCheckboxTooltipText =
  'Leave this checked to hide places and enemy units you have not seen. Uncheck it to show the whole map for the next match.';

/**
 * Purpose: Says planning turns on at the start only when this box is checked and an opponent on this screen has a key and a model. Otherwise planning stays off.
 * When to use: `#new-game-auto-start-checkbox`. The same sentence is the `data-control-tooltip` on that checkbox in `static/index.html`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const autoStartCheckboxTooltipText =
  'Leave this checked to turn opponent planning on when the match starts, when at least one AI opponent on this screen has an API key and a model. Uncheck it, or start without them, and planning stays off.';

/**
 * Purpose: Says a global turn is a month, a regional turn is a week, and a battle stays on the current date.
 * When to use: `#new-game-start-month`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const startMonthSelectTooltipText =
  'Pick the month the match starts in. A global turn is one month. A regional turn is one week, starting on the 1st. Weather changes when the date enters a new month, and a battle stays on the date that is current.';

/**
 * Purpose: Says the draw can repeat the month already shown.
 * When to use: `#new-game-start-month-randomize`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const startMonthRandomizeTooltipText = 'Pick a month at random, including the month already shown.';

/**
 * Purpose: Says the screen stays open when the start fails.
 * When to use: `#new-game-btn` at startup and when New opens the screen during a match.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const startGameButtonTooltipText =
  'Start the match with the choices on this screen. If the start fails, the screen stays open.';

/**
 * Purpose: Says a finished match's selection and queued orders are cleared.
 * When to use: `#new-game-btn` on the game-over screen.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const newMatchButtonTooltipText =
  'Start a new match with the choices on this screen. This clears your selection and the orders you had queued.';

/**
 * Purpose: The same button changes its label. The tip must change with it.
 * When to use: Beside each assignment of that button's label.
 * Expected outcome: The Start game sentence when `startGame` is true, otherwise the New game sentence.
 * Exceptions: None.
 */
export function newGameButtonTooltipText(startGame: boolean): string {
  return startGame ? startGameButtonTooltipText : newMatchButtonTooltipText;
}

/**
 * Purpose: Says what Ready plays and when it cannot be used. The sentence stays put when the label reads AI.
 * When to use: The wrapper around `#ready-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const readyButtonTooltipText =
  'End this planning step and play out the orders you have queued, on the world map or in a battle. It stays unavailable while the match is over, while the opponent is still planning, or while playback is already running.';

/**
 * Purpose: Names the attack the reticle aims for a selection that can fire, and says to double-click the target.
 * When to use: `#ranged-attack-btn` for a ranged selection while ranged targeting is off.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const rangedAimTooltipText = 'Aim a ranged attack. Turn this on, then double-click the target on the map.';

/**
 * Purpose: Says a second click stops aiming and queued ranged attacks stay in the list.
 * When to use: `#ranged-attack-btn` while ranged targeting is on.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const rangedStopTooltipText = 'Stop aiming a ranged attack. Attacks already in the list stay there.';

/**
 * Purpose: Names the attack the reticle aims for an all-air selection, and points to the target list beside it.
 * When to use: `#ranged-attack-btn` for an air selection while strike targeting is off.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const strikeAimTooltipText =
  'Aim an air strike. Turn this on, pick a target type in the list beside it, then double-click the target on the map.';

/**
 * Purpose: Says a second click stops aiming and queued strikes stay in the list.
 * When to use: `#ranged-attack-btn` while strike targeting is on.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const strikeStopTooltipText = 'Stop aiming an air strike. Strikes already in the list stay there.';

/**
 * Purpose: Says the next double-click chooses the hex a missile flies to.
 * When to use: `#ranged-attack-btn` while missile aiming is off and the selection is missiles.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const launchAimTooltipText =
  'Aim a missile launch. Turn this on, then double-click any explored hex in range. Each missile launches once.';

/**
 * Purpose: Says a second click stops aiming and queued launches stay in the list.
 * When to use: `#ranged-attack-btn` while missile aiming is on.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const launchStopTooltipText = 'Stop aiming a missile launch. Launches already in the list stay there.';

/**
 * Purpose: Names the four targets and says the next double-click uses the choice.
 * When to use: `#air-strike-target-type`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const airStrikeTargetTooltipText =
  'Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you stop aiming.';

/**
 * Purpose: One reticle aims both kinds of attack and stops aiming when clicked again. The tip must match the attack it
 *   aims and whether it is pressed.
 * When to use: Each time `#ranged-attack-btn` is updated for a selection that can use it.
 * Expected outcome: The sentence for that attack and that state.
 * Exceptions: None.
 */
export function supportButtonTooltipText(kind: 'ranged' | 'strike' | 'launch', aiming: boolean): string {
  if (kind === 'strike') return aiming ? strikeStopTooltipText : strikeAimTooltipText;
  if (kind === 'launch') return aiming ? launchStopTooltipText : launchAimTooltipText;
  return aiming ? rangedStopTooltipText : rangedAimTooltipText;
}

/**
 * Purpose: Says how to keep one opponent's key and how to forget it.
 * When to use: The API key field in the commander popover.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const apiKeyTooltipText =
  'Enter the OpenRouter key for this opponent. Click away or press Enter to keep it. Clear the field and leave it to forget this opponent\'s key.';

/**
 * Purpose: Says where a failed refresh is reported.
 * When to use: The refresh button beside the model selector in the commander popover.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const refreshModelsTooltipText =
  'Load the model list again. If that fails, the message appears in the AI activity log.';

/**
 * Purpose: Says an API key and a model are required first.
 * When to use: The wrapper around `#openrouter-run-btn` while that button cannot be clicked. Its label is Start.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const runDisabledTooltipText =
  'Turn planning on or off for every commander. Give at least one commander an API key and a model first.';

/**
 * The planning button's tip while it can be clicked.
 *
 * Purpose: Says what Start and Stop do to Ready. The button reads Start while planning is off and Stop while it is on.
 * When to use: The wrapper around `#openrouter-run-btn` while that button can be clicked.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const runEnabledTooltipText =
  'Turn planning on or off for every commander. On can hold Ready while a commander is planning; off cancels a plan that is still running.';

/**
 * Purpose: The planning button's tip changes when a key and model become available.
 * When to use: Whenever that button's disabled state is written.
 * Expected outcome: The enabled sentence when `enabled` is true, otherwise the disabled sentence.
 * Exceptions: None.
 */
export function runButtonTooltipText(enabled: boolean): string {
  return enabled ? runEnabledTooltipText : runDisabledTooltipText;
}

/**
 * The new-game commander button's tip.
 *
 * Purpose: The button opens the key, model, reasoning, and doctrine for that side.
 * When to use: Each AI row's commander button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const newGameCommanderTooltipText =
  'Change this side\'s API key, model, reasoning, and doctrine.';

/**
 * Purpose: Says New opens the new-game screen over the match, which keeps going until a new one starts.
 * When to use: `#openrouter-new-btn`, the game menu's New game item.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const newButtonTooltipText =
  'Open the new-game screen. The current match keeps going underneath; close the screen to return to it, or start a new match to replace it.';

/**
 * Purpose: Says why New game is disabled while the new-game screen is open.
 * When to use: The tip host around `#openrouter-new-btn`, from `syncGameMenuNewGameItem`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const newGameItemOpenTooltipText = 'The new-game screen is already open.';

/**
 * Purpose: Says why New game is disabled while a Ready is being resolved.
 * When to use: The tip host around `#openrouter-new-btn`, from `syncGameMenuNewGameItem`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const newGameItemBusyTooltipText = 'New game is available again once this turn or beat finishes resolving.';

/**
 * Purpose: Says the list is limited to the selected model's levels.
 * When to use: The wrapper around `#openrouter-reasoning-effort`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const reasoningEffortTooltipText =
  'Choose how much reasoning this model uses. You only see levels this model offers, its default is marked, and the list stays unavailable when it has fewer than two.';

/**
 * Purpose: Says what checked and unchecked do the next time Ready finds a melee.
 * When to use: The game-menu label around `#openrouter-tactical-battles`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const tacticalBattlesCheckboxTooltipText =
  'Leave this checked if you want Ready to let you fight one melee. Uncheck it to skip that list and resolve melee as Ignore.';

/**
 * Purpose: Says what the summary is and that the number is a use count.
 * When to use: The Precomputation tool cell.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const precomputationTooltipText =
  'Turn on a summary of units, hexes, and combat that is prepared before the model plans. The number counts uses since the last Ready, and the button stays pressed while this is on.';

/**
 * Purpose: Says when a background plan still runs and that the number is a use count.
 * When to use: The Events tool cell.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const eventsTooltipText =
  'Turn this on to stop a background plan every turn. One plan still runs when the match starts, when you turn Run on, or when you turn this on, and the number counts uses since the last Ready.';

/**
 * Purpose: Says what the opponent can do, and that a model without tools ignores the group.
 * When to use: The Planning tool cell.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const planningTooltipText =
  'Let the opponent plan routes and measure distances. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.';

/**
 * Purpose: Says what the opponent can inspect, and that a model without tools ignores the group.
 * When to use: The Assessment tool cell.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const assessmentTooltipText =
  'Let the opponent inspect nearby units and hexes. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.';

/**
 * Purpose: Says the opponent can estimate fight odds, and that a model without tools ignores the group.
 * When to use: The Estimation tool cell.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const estimationTooltipText =
  'Let the opponent estimate the odds of a fight. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.';

/**
 * Purpose: Says the opponent can read saved notes, and that a model without tools ignores the group.
 * When to use: The Memory tool cell.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const memoryTooltipText =
  'Let the opponent read notes it has saved. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.';

/**
 * Purpose: Says the opponent can look up standing orders, and that a model without tools ignores the group.
 * When to use: The Orders tool cell.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const ordersTooltipText =
  'Let the opponent look up standing orders. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.';

/**
 * Purpose: Says build queues change on the world map only, and that a model without tools ignores the group.
 * When to use: The Production tool cell.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const productionTooltipText =
  'Let the opponent read and change build queues on the world map, not during a battle. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.';

/**
 * Returns a tool group's tip.
 *
 * Purpose: New group ids must not invent a tip. Known ids keep one sentence each.
 * When to use: While building each tool-group cell.
 * Expected outcome: The group's sentence, or null.
 * Exceptions: None.
 */
export function toolGroupTooltipText(groupId: string): string | null {
  switch (groupId) {
    case 'precomputation':
      return precomputationTooltipText;
    case 'events':
      return eventsTooltipText;
    case 'planning':
      return planningTooltipText;
    case 'assessment':
      return assessmentTooltipText;
    case 'estimation':
      return estimationTooltipText;
    case 'memory':
      return memoryTooltipText;
    case 'orders':
      return ordersTooltipText;
    case 'production':
      return productionTooltipText;
    default:
      return null;
  }
}

/**
 * Purpose: Names the four styles and what they change.
 * When to use: The select created in `renderTerrainLegend`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const terrainStyleTooltipText =
  'Pick the terrain colors and the map picture under them. The choices are Default, Atlas, Wargame, and Scientific.';

/**
 * Purpose: Says how click and Shift-click differ, and when the click does nothing.
 * When to use: Each build-entry button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const buildEntryTooltipText =
  "Click to open this hex's build queue. Shift-click adds or removes the hex when several queues are edited together, and the click does nothing during playback or while you are aiming an order.";

/**
 * Purpose: Says the click starts or resumes a battle and when it does nothing.
 * When to use: Each tactical-entry button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const tacticalEntryTooltipText =
  'Click to start or resume the battle in this hex. That also stops world-map playback, and the click does nothing while you are aiming an order.';

/**
 * Purpose: Says the new row starts as the first type that hex can build.
 * When to use: The add button in the single-hex build popup.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const buildAddTooltipText = 'Add a queue row. It starts as the first unit type this hex can build.';

/**
 * Purpose: Says only buildable types are listed and a rejected change is restored.
 * When to use: Each type dropdown in the single-hex build popup.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const buildTypeTooltipText =
  'Change what this row builds. Only types this hex can produce are listed, and a change the game rejects is restored.';

/**
 * Purpose: Says the digit range and that a rejected count is restored.
 * When to use: Each count field in the single-hex build popup.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const buildCountTooltipText =
  'Enter how many to build, from 1 to 99, digits only. Other values are corrected, and a count the game rejects is restored.';

/**
 * Sentence appended to both Keep building tips.
 *
 * Purpose: The checkbox also covers a fortification row, which pauses when the city is fully fortified.
 * When to use: `keepBuildingTooltipText` and `multiKeepBuildingTooltipText` only.
 * Expected outcome: One sentence.
 * Exceptions: None.
 */
export const KEEP_BUILDING_FORTIFICATION_NOTE =
  'A fortification row keeps fortifying city cells until every one is fortified, then the queue pauses.';

/**
 * Purpose: Says what stays in production and when the box can be turned on.
 * When to use: The Keep building label in the single-hex build popup.
 * Expected outcome: The control tip shows this sentence, including the fortification note.
 * Exceptions: None.
 */
export const keepBuildingTooltipText =
  `After this queue finishes, keep building its last unit type. You can turn this on only when the hex has rows in the queue, or is already set to keep building. ${KEEP_BUILDING_FORTIFICATION_NOTE}`;

/**
 * Purpose: Says the row is copied to every selected hex and that some hexes skip it.
 * When to use: The add button in the multi-hex build popup.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const multiBuildAddTooltipText =
  'Add a row and copy it onto every selected hex. A hex that cannot build that type skips the row.';

/**
 * Purpose: Says a hex that cannot build the type skips it.
 * When to use: Each type dropdown in the multi-hex build popup.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const multiBuildTypeTooltipText =
  'Change the unit type for this row on every selected hex. A hex that cannot build the type skips it.';

/**
 * Purpose: Says the digit range applies on each selected hex.
 * When to use: Each count field in the multi-hex build popup.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const multiBuildCountTooltipText =
  'Set how many to build on each selected hex, from 1 to 99, digits only. Other values are corrected, and a count the game rejects is restored.';

/**
 * Purpose: Says when the box can change and when it shows checked.
 * When to use: The Keep building label in the multi-hex build popup.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const multiKeepBuildingTooltipText =
  `After each selected hex finishes its queue, keep building that hex's last unit type. You can change this only when every selected hex can, and it is checked only when every selected hex is already set to keep building. ${KEEP_BUILDING_FORTIFICATION_NOTE}`;

/**
 * Purpose: Says the load applies immediately and that a battle also cancels marches.
 * When to use: The wrapper around each sealift slot select.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const sealiftSelectTooltipText =
  'Choose a land unit to load on this ship, or (none) to empty the slot. This applies immediately, not when you press Ready, and in a battle it also cancels marches for the units you changed.';

/**
 * Purpose: Says the landing is immediate and that a battle cancels that unit's march.
 * When to use: The debark button beside a sealift slot.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const sealiftDebarkTooltipText =
  "Land the unit in this slot now. In a battle, that unit's march is cancelled too.";

/**
 * Purpose: Says a row must be selected before Fight does anything.
 * When to use: The wrapper around the Fight button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const fightTooltipText =
  'Fight the row you selected as a battle, after the rest of this turn resolves. Select a row first; until you do, Fight does nothing.';

/**
 * Purpose: Says Escape and a click on the dimmed area do the same thing.
 * When to use: The Ignore button.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const ignoreTooltipText =
  'Skip every melee this turn and continue. Press Escape, or click the dimmed area around this list, to do the same.';

/**
 * Purpose: Says world-map orders return and the button does nothing during playback.
 * When to use: `#tactical-exit-host`, around Exit Battle in the battle header.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const exitBattleTooltipText =
  'Leave the battle, bring back your world-map orders, and play that turn. The button does nothing while a battle turn is resolving or playing back.';

/**
 * Purpose: Says the world-map turn plays the same way as leaving during the fight.
 * When to use: `#tactical-annihilation-exit-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const annihilationExitTooltipText =
  'Close this result and leave the battle. The world-map turn then plays, as it does when you exit during the fight.';
