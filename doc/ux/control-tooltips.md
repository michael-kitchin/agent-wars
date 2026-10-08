# Control Tooltips

The short tip on a button, text field, checkbox, or dropdown that does not already have its own gameplay tooltip.

## Purpose

Say why the player would use the control, and state a limit only when the player can hit it.

## Availability

The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Run before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back.

## Information Displayed

- One shared tip, using the same chrome as the [hex tooltip](hex-tooltips.md). It is wider than that tooltip and draws above the new-game overlay, the tactical battles list, and the annihilation dialog.
- The tip appears one second after the pointer or keyboard focus arrives on the control or on its label. Moving on that same control does not start the wait again. It follows the pointer. Keyboard focus, with the pointer on a different control or on none, places the tip at the focused control.
- The text is plain. Opening a dropdown, or choosing an item in it, hides the tip until the pointer leaves that control.
- While a blocked-order tip or an order-effects tip is showing, this tip hides and does not hide those tips. Once that order tip hides, moving on the control starts this wait again. When this tip appears, the hex tooltip hides.
- Hiding a control hides its tip. The in-battle Exit Battle tip does not remain over the annihilation dialog.
- The model dropdown keeps the model description tooltip. Unit origin flags keep the Bonuses tooltip. This tip is not added to either.

## Sentences

- Human home region: Pick your side's home region. The opponent may start in the same region.
- Randomize human home region: Pick one of the listed regions at random for your side, including the region already shown.
- Opponent home region: Pick the opponent's home region. It may be the same as yours.
- Randomize opponent home region: Pick one of the listed regions at random for the opponent, including the region already shown.
- Global tab: Start on the world map and pick a home region for each side.
- Regional tab: Start on one region and pick a different side group for each player.
- Region: Pick the region both sides fight over. Changing it draws two different sides again.
- Randomize region: Pick one of the listed regions at random, including the region already shown.
- Human side: Pick your side. It stays different from the opponent's side.
- Randomize human side: Pick one of the other sides at random for your side.
- Opponent side: Pick the opponent's side. It stays different from yours.
- Randomize opponent side: Pick one of the other sides at random for the opponent.
- Game size: Set how many units each side may field. Small is the baseline, Medium doubles it, and Large triples it, without changing the map or the starting forces.
- Origin bonus: Low adds 2 and High adds 4 when a unit fights in the area where it was built: a country in a global game, and the origin area in a regional game.
- Tech bonus: Choose Off, Low, or High. Advanced units gain 2 attack at either level, High also adds 2 defense, and Basic units gain nothing.
- Terrain bonus: In a battle, Low adds 2 and High adds 4 when a unit fights on the terrain where it was built. Off adds nothing, and a unit that also gets the origin bonus receives only the larger of the two.
- Weather bonus: Choose Off to ignore weather. Low and High slow movement and cut some attacks for units that lack that weather, and High is the harsher penalty.
- Fog of war: Leave this checked to hide places and enemy units you have not seen. Uncheck it to show the whole map for the next match.
- Starting month: Pick the month the match starts in. Each world-map turn advances one month, and a battle stays in the month that is current.
- Randomize starting month: Pick a month at random, including the month already shown.
- Start game: Start the match with the choices on this screen. If the start fails, the screen stays open.
- New game: Start a new match with the choices on this screen. This clears your selection and the orders you had queued.
- Ready: End this planning step and play out the orders you have queued, on the world map or in a battle. It stays unavailable while the match is over, while the opponent is still planning, or while playback is already running. The sentence stays the same when the label reads "AI:".
- Ranged: Turn this on, then double-click the target on the map. The button then reads Cancel.
- Ranged Cancel: Stop aiming a ranged attack. Attacks already in the list stay there.
- Strike: Turn this on to aim an air strike. A target list and a Cancel button replace this button.
- Air-strike target: Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you cancel.
- Air-strike Cancel: Stop aiming an air strike and show Strike again. Strikes already in the list stay there.
- Tools tab: Show the tools the opponent can use, and turn each group on or off.
- Model tab: Show the API key, model, reasoning effort, and the controls for opponent planning and a new match.
- API key: Enter your OpenRouter key, then click away or press Enter to save it. The key stays hidden after that; clear the field and leave it to forget the saved key.
- Refresh models: Load the model list again. If that fails, the message appears in the AI activity log.
- Run, while it cannot be clicked: Turn opponent planning on or off. Enter an API key and choose a model first.
- Run, while it can be clicked: Turn opponent planning on or off. On opens the Tools tab and can hold Ready until a plan exists; off cancels a plan that is still running.
- New: Open the new-game screen during world-map planning. During a battle, or while a turn is playing back, the click does nothing.
- Reasoning effort: Choose how much reasoning this model uses. You only see levels this model offers, its default is marked, and the list stays unavailable when it has fewer than two.
- Tactical battles: Leave this checked if you want Ready to let you fight one melee. Uncheck it to skip that list and resolve melee as Ignore.
- Precomputation: Turn on a summary of units, hexes, and combat that is prepared before the model plans. The number counts uses since the last Ready, and the button stays pressed while this is on.
- Events: Turn this on to stop a background plan every turn. One plan still runs when the match starts, when you turn Run on, or when you turn this on, and the number counts uses since the last Ready.
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
- Single-hex Keep building: After this queue finishes, keep building its last unit type. You can turn this on only when the hex has rows in the queue, or is already set to keep building.
- Multi-hex add: Add a row and copy it onto every selected hex. A hex that cannot build that type skips the row.
- Multi-hex type: Change the unit type for this row on every selected hex. A hex that cannot build the type skips it.
- Multi-hex count: Set how many to build on each selected hex, from 1 to 99, digits only. Other values are corrected, and a count the game rejects is restored.
- Multi-hex Keep building: After each selected hex finishes its queue, keep building that hex's last unit type. You can change this only when every selected hex can, and it is checked only when every selected hex is already set to keep building.
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
- Sidebar order select and cancel controls.
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
- `src/renderer/chrome/controlTooltipText.ts`
