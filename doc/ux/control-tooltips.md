# Control Tooltips

The short tip on a button, text field, checkbox, or dropdown that does not already have its own gameplay tooltip.

## Purpose

Say why the player would use the control, and state a limit only when the player can hit it.

## Availability

The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Start before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back. It also includes New game in the game menu while the new-game screen is open, and every disabled placeholder: Settings and Help in the top bar, How to play in the game menu, the Build and Forces tabs, and Replay on a turn report. Save game and Load game show the sentences in [save-and-load.md](save-and-load.md). Add another opponent shows its reason while it is disabled. Start game shows its reason while the rows cannot start. The top bar's four readouts show a tip the same way, though they are not controls.

## Information Displayed

- One shared tip, using the same chrome as the [hex tooltip](hex-tooltips.md). It is wider than that tooltip and draws above the new-game overlay, the tactical battles list, and the annihilation dialog.
- The tip appears one second after the pointer or keyboard focus arrives on the control or on its label. Moving on that same control does not start the wait again. It follows the pointer. Keyboard focus, with the pointer on a different control or on none, places the tip at the focused control. The tip opens below and to the right of that point, or above or to the left of it where it would otherwise leave the window.
- The text is plain. Opening a dropdown, or choosing an item in it, hides the tip until the pointer leaves that control.
- While a blocked-order tip or an order-effects tip is showing, this tip hides and does not hide those tips. Once that order tip hides, moving on the control starts this wait again. When this tip appears, the hex tooltip hides.
- Hiding a control hides its tip. The in-battle Exit Battle tip does not remain over the annihilation dialog.
- The model dropdown keeps the model description tooltip. Unit origin flags keep the Bonuses tooltip. This tip is not added to either.

## Sentences

- Global tab: Start on the world map. Each side picks a different home region.
- Regional tab: Start on one region. Each side picks a different home.
- Region: Pick the region. Changing it draws a new home for each side.
- Randomize region: Pick one of the listed regions at random, including the region already shown.
- Observe only: Leave this checked to watch. An AI commander plays every side, including the first.
- Add another opponent, or Add another side: Add a side on the next free home. While the button is disabled the tip is "Up to 4 sides" or "No free side on this map".
- Commander button: Change this side's API key, model, reasoning, and doctrine.
- Victory rule: Deathmatch ends when one side remains. Most city hexes at turn limit ends the match at the turn limit, and the side holding the most city hexes wins.
- Turn limit: How long a Most city hexes match lasts. 30 is the usual length. Deathmatch has no turn limit.
- Start game or New game, while the rows cannot start: "At least 2 sides", "Each side needs a home", or "Two sides share a home".
- Game size: Set how many units each side may field. Small is the baseline, Medium doubles it, and Large triples it, without changing the map or the starting forces.
- Origin bonus: Default adds 2 and High adds 4 when a unit fights in the area where it was built: a country in a global game, and the origin area in a regional game.
- Tech bonus: Choose Off, Default, or High. Advanced units gain 2 attack at either level, High also adds 2 defense, and Basic units gain nothing.
- Terrain bonus: In a battle, Default adds 2 and High adds 4 when a unit fights on the terrain where it was built. Off adds nothing, and a unit that also gets the origin bonus receives only the larger of the two.
- Weather bonus: Choose Off to ignore weather. Default and High slow movement and cut some attacks for units that lack that weather, and High is the harsher penalty.
- Fog of war: Leave this checked to hide places and enemy units you have not seen. Uncheck it to show the whole map for the next match.
- Auto-start AI: Leave this checked to turn opponent planning on when the match starts, when at least one AI opponent on this screen has an API key and a model. Uncheck it, or start without them, and planning stays off.
- Starting month: Pick the month the match starts in. A global turn is one month. A regional turn is one week, starting on the 1st. Weather changes when the date enters a new month, and a battle stays on the date that is current.
- Randomize starting month: Pick a month at random, including the month already shown.
- Hide the new game choices: Hide the new game choices to see more of the map.
- Show the new game choices: Show the new game choices.
- New-game panel grip: Drag to move this screen. It goes back to the corner each time it opens.
- Start game: Start the match with the choices on this screen. If the start fails, the screen stays open.
- New game: Start a new match with the choices on this screen. This clears your selection and the orders you had queued.
- Ready: End this planning step and play out the orders you have queued, on the world map or in a battle. It stays unavailable while the match is over, while the opponent is still planning, or while playback is already running. The sentence stays the same when the label reads "AI:".
- Reticle, for a selection that can fire: Aim a ranged attack. Turn this on, then double-click the target on the map.
- Reticle, while a ranged attack is aimed: Stop aiming a ranged attack. Attacks already in the list stay there.
- Reticle, for an all-air selection: Aim an air strike. Turn this on, pick a target type in the list beside it, then double-click the target on the map.
- Reticle, while an air strike is aimed: Stop aiming an air strike. Strikes already in the list stay there.
- Reticle, before a missile launch is aimed: Aim a missile launch. Turn this on, then double-click any explored hex in range. Each missile launches once.
- Reticle, while a missile launch is aimed: Stop aiming a missile launch. Launches already in the list stay there.
- Air-strike target: Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you stop aiming.
- The reticle while it is greyed out: its reason, "Missiles cannot fire or launch during a battle.", "A launch needs a selection of missiles only.", "Infantry can't fire on the world map.", or "Strike needs a selection of air units only." (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`). The tip sits on a host around the control (`#ranged-attack-tip-host`), because a disabled control gets no pointer events.
- Orders tab: Show the orders queued for this turn or beat. Click the selected tab to hide the console and widen the map.
- Reports tab: Show the turn reports, opponent messages, and notices from this match, newest first. Click the selected tab to hide the console and widen the map.
- Commanders tab: Show each commander's status, cost, and settings, the tool groups, and the AI activity log. Click the selected tab to hide the console and widen the map.
- Settings, Help, How to play, Build, Forces, Replay: "<name> is not available in this version.", for example "Settings is not available in this version."
- Selection panel close: Clear the selection. Queued orders stay.
- Selection panel grip: Drag to resize this panel. The size lasts until the app closes.
- Selection panel expand control, while the panel is compact: Show the hex, its terrain, and each selected unit's orders.
- Selection panel expand control, while the panel is expanded: Hide the details. The bar stays.
- Map-mode tabs toggle, while the tabs are hidden: Show the map-mode buttons under the overview.
- Map-mode tabs toggle, while the tabs show: Hide the map-mode buttons. Hiding them also closes the terrain legend.
- Weather map mode: Show or hide each hex's weather icon on the world map, while the weather bonus is on.
- Tech map mode: Show or hide each hex's tech tier icon on the world map, while the tech bonus is on. Holding T shows them too, while the key is down.
- Control map mode: Show or hide the borders that mark who controls each hex, and the home-region outlines.
- Production map mode: Show or hide production on every world hex, the way holding T does. Off shows it only on hexes you control.
- Legend: Show or hide the terrain legend and its style choice.
- Force bar in the battle header: Sub-units each side has in this battle, counting any carried by a ship. A battle has no fog of war, so both counts are exact.
- Production readout: The production your cities can add each turn. A city adds its share only while it is building, and a city on the neutral border adds none.
- Forces readout: Units you have fielded, out of the most this game size allows: then each unit type as "infantry 3 of 12", separated by commas, ending with a period.
- Your home readout: Hexes of your home region that you hold, out of all its hexes. Hidden while observing.
- Enemy homes readout: Hexes of every active enemy home that you hold, out of all of those hexes. A knocked-out side's home is left out. Hidden while observing, and hidden in a match that ends on a turn limit.
- Cities readout: City hexes you hold, your place, and how many sides are still playing. The tip lists every active side. Shown only in a match that ends on a turn limit. While observing, the tip has no "(you)".
- Game menu button: Open the game menu to start a new game, choose whether Ready offers tactical battles, or quit.
- Quit: Close Agent Wars.
- Save game, while it can be clicked: Save this match to a file.
- Save game, while it cannot: "There is no match to save.", "The match is over, so there is nothing to save.", "Close the new-game screen to save the match under it.", or "Save game is available again once this turn or beat finishes resolving."
- Load game, while a match is still being played: Open a saved game from a file. The match in progress is replaced.
- Load game, while it can be clicked and no match is still being played: Open a saved game from a file.
- Load game, while a turn or beat is resolving: Load game is available again once this turn or beat finishes resolving.
- API key: Enter the OpenRouter key for this opponent. Click away or press Enter to keep it. Clear the field and leave it to forget this opponent's key.
- Refresh models: Load the model list again. If that fails, the message appears in the AI activity log. The button sits to the right of the model selector in the commander popover.
- Start, while it cannot be clicked: Turn planning on or off for every commander. Give at least one commander an API key and a model first.
- Start or Stop, while it can be clicked: Turn planning on or off for every commander. Start turns planning on. Stop turns it off. On can hold Ready while a commander is planning; off cancels a plan that is still running.
- New game in the game menu: Open the new-game screen. The current match keeps going underneath; close the screen to return to it, or start a new match to replace it.
- New game in the game menu while a Ready is resolving, on its tip host: New game is available again once this turn or beat finishes resolving.
- New-game panel close, shown only while a match is waiting under the screen: Close this screen and go back to the match in progress.
- New game in the game menu while the new-game screen is open, on its tip host: The new-game screen is already open.
- Reasoning effort: Choose how much reasoning this model uses. You only see levels this model offers, its default is marked, and the list stays unavailable when it has fewer than two.
- Offer tactical battles: Leave this checked if you want Ready to let you fight one melee. Uncheck it to skip that list and resolve melee as Ignore.
- Precomputation: Turn on a summary of units, hexes, and combat that is prepared before the model plans. The number counts uses since the last Ready, and the button stays pressed while this is on.
- Events: Turn this on to stop a background plan every turn. One plan still runs when the match starts, when you click Start, or when you turn this on, and the number counts uses since the last Ready.
- Planning: Let the opponent plan routes and measure distances. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.
- Assessment: Let the opponent inspect nearby units and hexes. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.
- Estimation: Let the opponent estimate the odds of a fight. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.
- Memory: Let the opponent read notes it has saved. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.
- Orders: Let the opponent look up standing orders. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.
- Production: Let the opponent read and change build queues on the world map, not during a battle. The number counts uses since the last Ready, and this does nothing when the model cannot use tools.
- Terrain style: Pick the terrain colors and the map picture under them. The choices are Default, Atlas, Wargame, and Scientific.
- Build marker: Click to open this hex's build queue. Shift-click adds or removes the hex when several queues are edited together, and the click does nothing during playback or while you are aiming an order.
- Tactical entry marker: Click to start or resume the battle in this hex. That also stops world-map playback, and the click does nothing while you are aiming an order.
- Single-hex add: Add a queue row. It starts as the first unit type this hex can build.
- Single-hex type: Change what this row builds. Only types this hex can produce are listed, and a change the game rejects is restored.
- Single-hex count: Enter how many to build, from 1 to 99, digits only. Other values are corrected, and a count the game rejects is restored.
- Single-hex Keep building: After this queue finishes, keep building its last unit type. You can turn this on only when the hex has rows in the queue, or is already set to keep building. A fortification row keeps fortifying city cells until every one is fortified, then the queue pauses.
- Multi-hex add: Add a row and copy it onto every selected hex. A hex that cannot build that type skips the row.
- Multi-hex type: Change the unit type for this row on every selected hex. A hex that cannot build the type skips it.
- Multi-hex count: Set how many to build on each selected hex, from 1 to 99, digits only. Other values are corrected, and a count the game rejects is restored.
- Multi-hex Keep building: After each selected hex finishes its queue, keep building that hex's last unit type. You can change this only when every selected hex can, and it is checked only when every selected hex is already set to keep building. A fortification row keeps fortifying city cells until every one is fortified, then the queue pauses.
- Sealift slot: Choose a land unit to load on this ship, or (none) to empty the slot. This applies immediately, not when you press Ready, and in a battle it also cancels marches for the units you changed.
- Sealift debark: Land the unit in this slot now. In a battle, that unit's march is cancelled too.
- Fight: Fight the row you selected as a battle, after the rest of this turn resolves. Select a row first; until you do, Fight does nothing.
- Ignore: Skip every melee this turn and continue. Press Escape, or click the dimmed area around this list, to do the same.
- Exit Battle during a fight: Leave the battle, bring back your world-map orders, and play that turn. The button does nothing while a battle turn is resolving or playing back.
- Exit Battle on the annihilation result: Close this result and leave the battle. The world-map turn then plays, as it does when you exit during the fight.

## Controls with no tip

- The map toast dismiss control and the AI strategy toast dismiss control.
- The stack callout close control, and its per-unit selection controls, including "+ All" and "- All".
- The build popup close control, and each queue row's remove control, in both the single-hex and multi-hex popups.
- Order rows in the Orders tab, and their cancel controls.
- The cancel control on an order in the selection panel.
- The reticle while it is greyed out and neither reason applies.
- The choice on each tactical battles row.
- The model dropdown. It uses the model description tooltip.

## Inputs and Responses

### Mouse

- When the pointer rests on a tipped control, or on its label, for one second, the sentence for that control appears. If the pointer is on one tipped control and keyboard focus is on another, the tip follows the pointer.
- When the pointer leaves the control, the tip hides.
- When the player opens a tipped dropdown, or chooses an item in it, the tip hides until the pointer leaves.

### Keyboard

- When keyboard focus arrives on a tipped control, the same one-second wait starts. If the pointer is not on that control, the tip is placed at the control.
- When focus leaves, the tip hides, unless the pointer is still on the control.
- When the player presses a key that opens a focused dropdown, the tip hides until the pointer leaves that control.

### Other

- Hiding the control hides the tip, including a tip that was already showing.
- While a blocked-order tip or an order-effects tip is showing, this tip stays hidden.

## States

- Waiting: the pointer or focus is on a tipped control and the second has not elapsed.
- Showing: the sentence is visible.
- Hidden: the pointer and focus have left, the control is hidden, a dropdown list is open, or a blocked or effects order tip is already showing.

## Invariants

- A control shows at most one of these sentences.
- The model description tooltip, the Bonuses tooltip, the hex tooltip, the blocked-order tip, and the order-effects tip stay their own tips.
- This tip does not show together with the hex tooltip, the blocked-order tip, or the order-effects tip.
- The controls listed under "Controls with no tip" never show this tip.

## Strategic and Tactical Differences

Ready, sealift, and Exit Battle name the battle case in the same sentence. Production says it does nothing during a battle. The terrain bonus sentence applies in a battle.

## Known Deviations

- None.

## Open Questions

- None.

## Source Anchors

- `static/index.html` (`#control-tooltip`)
- `static/overlayChrome.css` (`.control-tooltip`, `.control-tooltip-host`)
- `src/renderer/chrome/controlTooltip.ts`
- `src/renderer/chrome/controlTooltipText.ts` (`launchAimTooltipText`, `launchStopTooltipText`, `KEEP_BUILDING_FORTIFICATION_NOTE`)
- `src/shared/selectionSupportButtonMode.ts`
- `src/shared/missileRules.ts` (`LAUNCH_NEEDS_MISSILES_ONLY_REASON`, `MISSILES_CANNOT_FIRE_IN_BATTLE_REASON`)
- `src/renderer/chrome/frameTooltipText.ts`
- `src/shared/saveLoadAvailability.ts`
- `src/renderer/gameplay/saveLoadMenu.ts`
