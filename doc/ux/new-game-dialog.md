# New Game Dialog

The overlay that starts a match and the overlay that reports game over. They are the same surface.

## Purpose

Collect the settings for a match, and later show how the match finished.

## Availability

Opens in New game and in Game over. See [modes-and-transitions.md](modes-and-transitions.md). It opens at startup when no match is loaded, when the player clicks New game in the game menu, and when the match ends. At startup and at game over it cannot be dismissed without starting a match. While a match is waiting under the screen, the header bar's right edge holds a close control (`#new-game-dialog-close`) that hides the screen and returns to that match. The console and the selection panel are not on screen while it is open, including while the choices are hidden. The top bar is the new-game bar ([top-bar.md](top-bar.md)). The setup panel floats over the map, 12 px in from the map's top-left corner, and the map fills the window under the top bar. Drag and the wheel pan and zoom the preview, and the + and − buttons zoom it, with the choices showing or hidden.

## Information Displayed

- A message: "Start the global game when ready." or "Start the regional game when ready." at startup, and "Start a new global game when ready." or "Start a new regional game when ready." after New game. Those sentences follow the selected tab. When the match is over, the message is the standings heading from `buildStandings` in `src/shared/standings.ts`: "You placed {ordinal} of {n}." when a human seat played and one side won, "{Winner} wins." when the match had no human seat, and "No side won." when first place is shared. A tab switch does not change that heading.
- While the match is over, the body's first section is Result (`#game-over-standings`). It shows the turn and date, the result line, one row per seat, and "Model cost this match" with the sum of `costUsd`. The result line is "{Winner} is the last side standing. It knocked out {Side} on turn {N}." for last side standing, omitting the second sentence when that winner knocked out nobody. A turn limit says "{Winner} holds the most city hexes at the end of turn {L}." A mutual wipe says "{Winner} holds the most city hexes." Ending the match from the knocked-out dialog says "You ended the match on turn {N}." When several seats share first under a turn limit or a mutual wipe, the line names every one of them in seat order: "{A} and {B} share first place with {n} city hexes each." Three or more use "{A}, {B}, and {C} share first place with {n} city hexes each." Each row shows the place, a seat-color dot, the full home name with " (you)" on the human seat, and a status: "Winner", "Out, turn {N}", or "{n} city hexes" for a seat that was still active at a turn limit, a mutual wipe, or an early end. An AI row adds the commander summary (`formatCommanderSummary`), the consultation count, and that seat's cost. "Knocked out by {Side}" or "Knocked out by you" appears when `outBy` is set.
- The panel's body has five setup sections, each under a small uppercase title: Map, Sides, Victory, Forces, and Rules. Result, when it is showing, sits above them.
- Map: Global and Regional tabs. Opening the overlay selects Global when no match is loaded or the loaded match is global, and Regional when the loaded match is a region. The Global tab has no rows of its own. The Regional tab has one row: Region, the region selector, and a randomize control labeled "Randomize region". Opening the overlay draws a region. Changing the region, or clicking its randomize control, draws a new home for each side. The region draw includes the region already shown. A long name is cut off in the closed dropdown; the open list shows it in full. Game size, the four bonuses, fog of war, Auto-start AI, and the starting month stay in Rules and Forces.
- Sides: a caption, "{n} of {max} sides in play", or "{n} of {max} sides, all AI" when Observe is on. `max` is 4, or the number of homes on the map when that is smaller (`sidesCaption` in `src/shared/newGameSides.ts`). Then the checkbox "Observe only: an AI commander plays every side". Then one row per side. With a human, the first row is "You": a home select and a randomize button. Each later row is "Opponent 1", "Opponent 2", and so on: a home select, a randomize button, a remove button, and a commander button. Observe names the rows "Side 1", "Side 2", and so on, and every row has the remove button and the commander button. Remove is disabled while only two sides remain. A home another row already holds is disabled in the list and labeled "{name} · {row name}". Opening the overlay starts with two sides and draws a free home for each. Changing the tab or the regional region keeps the side count when the new map has enough homes, draws homes again, and rebuilds the rows from the app-wide model and the remembered first key. Add another opponent, or Add another side while Observe is on, copies the key, model, reasoning effort, and doctrine from the AI row just above. The home is still the next free home. The button is disabled when four sides are already listed ("Up to 4 sides") or every home is taken ("No free side on this map"). The commander button shows one line (`formatCommanderSummary` in `src/shared/commanderSummary.ts`): "No model · standing orders only" when no model is set, otherwise the model name, the reasoning effort when one is set, and the doctrine. Random stays "Random" until a finished match reveals the draw, which reads "Random, drew {doctrine}". Clicking the button opens a popover titled "{row name} commander".
- Victory: Rule offers Deathmatch and Most city hexes at turn limit on both maps. Deathmatch is selected when the overlay opens. The Turn limit row stays visible. Under Deathmatch it is disabled and shows Unlimited. Under Most city hexes it lists 20, 30, 40, and 50 turns, with 30 selected until the player picks another. Adding or removing a side leaves that choice. Switching maps does not change the rule. Opening the overlay does.
- Forces: on the title's line, at the right, `Advanced tech: $N+ hexes`. On Global, N is the world map's threshold. On Regional, N is the selected region's threshold, and it changes with the region.
- Forces: Game size, its dropdown only as wide as its longest item.
- Forces: one row of the four unit types, infantry, armor, naval, and air. Each shows the map glyph drawn dark on a small gray disk, the cap for the chosen game size in bold, a dot, and the unit's price, such as `12 · $20` (`formatUnitCostLabel`). The glyph's alternative text names the type. The price follows the selected tab and, on Regional, the selected region. The caps are in [game size and unit caps](../game-size-unit-caps.md).
- Rules: the four bonuses in two columns. The first row is Origin bonus, then Tech bonus. The second row is Terrain bonus, then Weather bonus. Each dropdown lists Off, Low, and High. Whenever the overlay opens, every dropdown is set to Low. Each dropdown is independent. Under them, Starting month, a control that lists the full English month names and is only as wide as its longest month, starting at the same edge as the bonus dropdowns, with a randomize control labeled "Randomize starting month" to its right, a square button the same height and color as the region randomize button. Then Fog of war and Auto-start AI on one row, with Auto-start AI to the right. Both are checked by the same reset whenever the overlay is shown, including a refresh that shows it. A refresh that returns before that reset leaves them as the player set them. Auto-start AI is not sent with the match. Whenever the overlay opens, the month control shows a random month, the same way the home regions are drawn. The bonus rules for each level are in [combat rules §4.9](../combat-rules-v3.md).
- A button labeled "Start game" when no match is loaded or when New game opened the overlay, and "New game" when the match is over.
- The setup panel floats over the map, 12 px in from the map's top-left corner, `--new-game-panel-width` (432 px) wide, in the selection panel's chrome: navy, a 1 px `--chrome-border` border, 6 px corners, and a shadow (`static/newGameChrome.css`). It is as tall as its content, up to the map's height less the 12 px inset at the top and the bottom. Its header bar is 50 px tall: the chevron expand control (a 32 px column with a divider) at the left, then the message, and, while a match waits under the screen, a close control (a 32 px column) at the right. Its body holds the choices and scrolls. Its footer holds Start game, or New game, while the choices show. While they are hidden, that same button fills the header between the expand control and the close control, or the bar's right edge, 6 px in from each side and from the top and bottom of the bar. It keeps its label, tip, and enabled state (`placeStartButton` in `src/renderer/gameplay/newGameDialogCollapse.ts`).
- The chevron points down while the choices are hidden and up while they show. Collapsing leaves only the header bar, 52 px with the border, at the same spot, and Start game, or New game, takes the message's place. During the 150 ms collapse the message stays and the button stays in the footer; they swap when the panel settles. The panel slides between the two states over 150 ms from its top edge, or changes at once when the system asks for reduced motion (`startPanelHeightSlide`). The tips are "Hide the new game choices to see more of the map." and "Show the new game choices." Every open puts the panel back at the corner, expanded (`placeNewGameDialogAtInset` and `expandNewGameDialog`).
- A grip on the panel's top-right corner moves the panel with a primary-button drag. The panel stays inside the map with the 12 px inset to spare (`floatingPanelOffset` in `src/shared/mapChromePlacement.ts`). The grip is a 14 px square (`.new-game-panel-grip` in `static/newGameChrome.css`) over the top-right corner of the close control, and of Start game or New game when that control is absent. A drag there moves the panel, and that corner of the button does not start the match. The rest of the button still does. Its tip is "Drag to move this screen. It goes back to the corner each time it opens."
- Control tips for these choices and those buttons are in [control-tooltips.md](control-tooltips.md).
- The map under the panel shows the selected tab's preview. The preview fit centres on the whole map, so the panel covers part of the framed area. Global frames the Mercator world one zoom level closer than that world fit. Regional frames the selected region, including sea and neutral-border hexes. Global draws the selected home regions with the same terrain fills a started match uses on those hexes, and leaves the rest of the strategic hex grid undrawn until the player holds T. Holding T draws that grid, with those same fills and strokes. A regional preview always draws its strategic hex grid, with those same fills and strokes. Each side's home is outlined in that row's seat color: seat 1 teal, seat 2 rose, seat 3 orange, seat 4 blue (`SEAT_PALETTES`). An exclusive home uses that color for both rings. A home shared by two or more rows uses the gray overlap rings. The colors follow the rows on this screen, not the match waiting underneath. Weather icons sit on the same band as in a match, on every strategic hex of the preview, and follow the selected starting month while Weather bonus is Low or High. The Weather tab does not apply to the preview, because the minimap panel is hidden while the overlay is open. Low and High use the same glyph. Off hides the icons. While T is held and Tech bonus is Low or High, each strategic hex whose original urban count can produce units shows that map's tech icon, Basic or Advanced, on the same band, beside the weather icon as in a match. Low and High use the same glyph. Off hides the tech icons. Battle-detail zoom of that map's strategic hexes hides the weather icons and the tech icons. The preview draws no units, hex codes, production labels, build markers, battle-entry markers, or other match chrome. Fog of war does not hide the preview icons. Basic and Advanced follow that map's Advanced threshold, the same N as the Advanced tech line. Opening the overlay frames the main map to that extent. Changing a home does not move the view. Changing the tab or the regional region does. The map fills the window under the top bar, and the frame centres on the whole map. The minimap panel and the terrain legend are hidden until the overlay closes.

## Inputs and Responses

### Mouse

- When the player drags or turns the wheel over the map outside the panel, the preview pans and zooms, inside the extent already applied. The + and − buttons zoom the preview. A click, double-click, or right-click on the map itself does not select, order, or change the selection. Hover does not open a hex tooltip or an order preview, and the pointer does not show a unit cursor.
- When the player clicks the expand control while the choices are showing, the panel slides down to the header bar and the chevron points down. The settled bar shows Start game, or New game, in place of the message. The map keeps its centre and zoom. Clicking it again puts that button back in the footer as the panel grows, slides the choices open, and the chevron points up. A panel dragged low moves up if the expanded height would leave the map.
- When the player drags the grip, the panel follows the pointer and stays inside the map, 12 px in from each edge. Every open puts it back at the corner.
- When the player clicks the close control, the screen hides and the match that was waiting returns, including its camera, its orders, and its selection. The control is absent at startup and at game over.
- When the player changes a side's home, or clicks that row's randomize button, that row's outline moves to a home no other row holds. The map extent stays. A shared outline uses the gray overlap rings.
- When the player checks Observe only, the first row becomes an AI side and keeps its home. Unchecking it brings "You" back on that home. The caption reads "all AI" while the box is checked.
- When the player clicks Add another opponent, or Add another side, a row appears on the next free home with the previous AI row's key, model, reasoning effort, and doctrine. The button's tip names the reason when it is disabled.
- When the player clicks a commander button, a popover opens under it (`openCommanderPopover` in `src/renderer/openRouter/commanderPopover.ts`). The popover is 380 px wide. Its fields, the refresh button, and the copy button are 30 px tall, the same height as the panel's controls. It opens under the button, and above it when there is no room below. The first field is that opponent's API key, a password field filled with the key and masked. The model list is the shared one, including "— Select model —", with the refresh button on the select's right. The API key, Model, Reasoning, and Doctrine labels are right-aligned and each as wide as "Reasoning", so the API key field and the model list start at the reasoning list's left edge. Reasoning, its list, Doctrine, and its list share the next line, with equal labels and equal lists. When the model has fewer than two levels, that list stays on the line and is disabled. When it has none, the disabled list reads "Model default". Aggressive, Balanced, Cautious, and Random follow, with that choice's description under the line. Choosing a model saves it as the app-wide model. The first AI row's button reads "Copy from Last Game (Opponent 1)", or "Copy from Last Game (Side 1)" while Observe is on. It copies the key, model, reasoning effort, and doctrine from the remembered first AI opponent. Until a match has been snapshotted, that button is disabled and reads "No previous game". Each later AI row copies the AI row just above it: "Copy from Opponent 2" on Opponent 3, and "Copy from Side 1" on Side 2 while Observe is on. The names come from `rowLabel`. A new game fills only the first AI row's key from that remembered opponent, or from the stored legacy key when no match has been snapshotted. Later AI rows start with an empty key. The remembered record is written when the match starts and updated when a commander is saved during that match. Clearing a key during the match and leaving the field is one of those saves, so the next game fills from that save. Changing the map tab or the region rebuilds the rows and fills only that first key again. Checking or unchecking Observe fills only the first AI row's key again. Adding or removing a side, editing a commander, and the copy button do not. Clearing the key and closing without starting leaves the remembered record as it was. The close button, Escape, and a click outside the popover close it. Clicking the same commander button again closes it.
- When the player clicks Regional, the map frames that region and draws each side's home. Changing the region frames the new region, draws homes again, and updates the Advanced line to that region's threshold. The region randomize control does the same draw, and it may draw the region already shown. Switching to Global frames the world one zoom level closer than that world fit, draws the selected homes, hides the hex grid until the player holds T, sets that line to the world map's threshold, and leaves the Victory rule as the player set it.
- When the rows cannot start, Start is disabled and its tip says "At least 2 sides", "Each side needs a home", or "Two sides share a home". Clicking it while it can still receive the click shows that sentence as a toast.
- When the player clicks the starting-month randomize control, the month becomes a random month from the list, including the month already shown. Opening the overlay draws a month the same way.
- When the player changes game size, the caps in the unit row update to that size.
- When the player changes Fog of war, Origin bonus, Tech bonus, Terrain bonus, Weather bonus, or the starting month, the next match uses that setting. Auto-start AI does not. A global match starts in that month of Year 1, and each turn is one month. A regional match starts on the 1st of that month, and each turn is one week. Changing the starting month or Weather bonus updates the weather icons on the map under the panel without reloading the grid. Changing Tech bonus updates the tech icons the same way while T is held. Opening the overlay checks Fog of war and Auto-start AI again, sets every bonus dropdown back to Low, and draws a new starting month. A refresh while the overlay stays open keeps the month the player is looking at.
- When the player clicks Start game or New game, in the footer or in the collapsed header, and no AI row has a model, a dialog asks whether to start. The question takes the pointer, and Yes takes focus, so Enter chooses Yes. No, Escape, and a click on the backdrop leave the screen open. Yes starts the match. When some AI row has a model, the click starts it without asking. On that start, drafts and the selection clear, the match cost resets to zero in the Commander section and on the footer status line, the AI activity log and the Reports tab clear, and the overlay closes on success. That success uses the Auto-start AI choice from the click (`chooseStartMatchAi` in `src/shared/startMatchAiChoice.ts`, applied by `readStartMatchAiInput` and `applyStartMatchAiChoice` in `src/renderer/gameplay/newGameAiStart.ts`): when the box was checked and at least one AI row had a key and a model, the Commanders button reads Stop and turn-1 planning starts; otherwise the Commanders button reads Start and planning stays off. Either way the console collapses, and the selected tab stays selected. An opponent with a model and an empty key does not call the model. A failure leaves the Commanders Start button and the console unchanged. The top bar shows the match status again, the console is on screen, and the view then frames the new match in the map beside the console, as in [map-surface.md](map-surface.md). Clicking Start while a match is waiting stops that match before the new one is requested. A failure leaves the overlay open, and Close is gone because there is no match left to return to.

### Keyboard

- When a dropdown or the API key field has focus, map pan keys and T do nothing. The key field is a password field, and [input-map.md](input-map.md) treats it as a text field. Hiding the choices moves focus off a dropdown that had it, so those keys work again. Showing the choices does not move focus onto a dropdown. While this overlay is open, holding T draws the strategic hex grid on the global map and shows that map's tech icons beside the weather icons. A regional preview keeps its hex grid. It does not show hex codes or production labels. Releasing T hides the global grid and the tech icons again and leaves the home regions and the weather icons drawn.
- Escape does not close this overlay.

### Other

- None.

## States

- Hidden: a match is in progress and not over.
- Open for a new match: no match, or the player clicked New game. The close control shows only when a match is waiting under the screen.
- Open for game over: the match is over. The button reads "New game".

## Invariants

- The overlay does not close on its own. A successful start closes it. While a match is waiting under the screen, the close control closes it and returns to that match.
- Whenever the overlay opens, the choices are showing. A refresh while the overlay stays open leaves hidden choices hidden.
- The startup, New game, and game-over messages stay distinct from each other.
- Fog of war and Auto-start AI are checked, and Origin bonus, Tech bonus, Terrain bonus, and Weather bonus are all at Low, every time the overlay opens, including game over. A refresh that shows the overlay checks both boxes again. A refresh that returns before that reset leaves them as set. The starting month is a new random month every time the overlay opens, including game over.
- Starting a match clears the previous selection and drafts.

## Strategic and Tactical Differences

New game, in the game menu, opens this overlay during strategic planning, tactical planning, and resolution playback in either theater. It does not open while the tactical annihilation dialog is open, or while the tactical battles list is open, because those dialogs already take the window. Opening it leaves the match running: planning that was already running finishes and applies, and playback continues under the screen. A new background plan does not start while the screen is open. New game is unavailable while a Ready is being sent and answered. Close returns to the match as it was, including its camera (`closeNewGameOverlayToMatch` in `src/renderer/gameplay/newGameReturn.ts`). Clicking Start is the only step that stops the match. That stop happens before the new match is created, so a failed start leaves the screen open with nothing underneath to return to. The current match is replaced when Start succeeds. If the match ends while the screen is open, the close control goes and the message becomes the result. While the choices are hidden, that message stays hidden and the button reads New game. Starting a match ends any tactical session and returns to Strategic planning.

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [map-surface.md](map-surface.md)
- [minimap.md](minimap.md)
- [game size and unit caps](../game-size-unit-caps.md)
- [region versus region](../region-vs-region.md)
- [opponent-tab-commander.md](opponent-tab-commander.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#game-over-overlay`, `#new-game-dialog-collapse`, `#game-over-dialog`, `#game-over-message`, `#new-game-tab-global`, `#new-game-tab-regional`, `#new-game-region-select`, `#new-game-region-randomize`, `#new-game-sides-caption`, `#new-game-observe-only`, `#new-game-side-rows`, `#new-game-add-side-btn`, `#new-game-victory-select`, `#new-game-turn-limit-select`, `#new-game-advanced-tech`, `#new-game-cost-infantry`, `#new-game-cost-armor`, `#new-game-cost-naval`, `#new-game-cost-air`, `#new-game-size-select`, `#new-game-size-cap-infantry`, `#new-game-size-cap-armor`, `#new-game-size-cap-naval`, `#new-game-size-cap-air`, `#new-game-fog-checkbox`, `#new-game-auto-start-checkbox`, `#new-game-origin-bonus-select`, `#new-game-terrain-bonus-select`, `#new-game-weather-bonus-select`, `#new-game-tech-bonus-select`, `#new-game-start-month`, `#new-game-start-month-randomize`, `#new-game-panel-footer`, `#new-game-btn`)
- `src/shared/newGameSides.ts`
- `src/renderer/gameplay/newGameSidesUi.ts`
- `src/renderer/gameplay/newGameVictoryUi.ts` (`bindNewGameVictory`, `readNewGameVictory`)
- `src/renderer/gameplay/startConfirmDialog.ts` (`confirmStartWithNoModels`)
- `static/index.html` (`#start-confirm-dialog`, `#start-confirm-yes`, `#start-confirm-no`)
- `static/feedbackChrome.css` (the no-models question)
- `src/shared/commanderSetupCopy.ts` (`prefillFirstAiApiKey`, `copyButtonState`)
- `src/shared/commanderSummary.ts`
- `src/renderer/openRouter/commanderPopover.ts`
- `src/renderer/openRouter/commanderPopoverLabels.ts`
- `static/newGameChrome.css`
- `src/renderer/gameplay/newGameDialogCollapse.ts`
- `src/renderer/gameplay/newGameDialogMove.ts`
- `src/renderer/gameplay/newGameReturn.ts`
- `src/renderer/map/mainMapCameraReturn.ts`
- `static/index.html` (`#new-game-dialog-close`)
- `src/renderer/chrome/panelSlideHelpers.ts`
- `src/shared/mapChromePlacement.ts` (`floatingPanelOffset`)
- `static/index.html` (`#new-game-panel-grip`, `#new-game-panel-header`)
- `src/renderer/gameplay/newGame.ts`
- `src/renderer/gameplay/newGameBanner.ts`
- `src/shared/newGameBannerText.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/drawInteraction.ts`
- `src/renderer/gameplay/newGameMapUi.ts`
- `src/renderer/gameplay/newGameOptionsUi.ts`
- `src/shared/startMatchAiChoice.ts` (`chooseStartMatchAi`)
- `src/renderer/gameplay/newGameAiStart.ts` (`readStartMatchAiInput`, `applyStartMatchAiChoice`)
- `src/renderer/gameplay/newGameRegionUi.ts`
- `src/renderer/gameplay/newGameSizeUi.ts`
- `src/renderer/gameplay/newGameMapPreviewUi.ts`
- `src/renderer/map/newGameMapPreviewRendering.ts`
- `src/main/gameMap/newGameMapPreview.ts`
- `src/renderer/core/uiState.ts`
- `src/shared/standings.ts` (`buildStandings`)
- `src/renderer/gameplay/gameOverStandings.ts`
- `static/index.html` (`#game-over-standings`)
- `src/shared/gameSize.ts`
- `src/shared/gameMapList.ts` (`formatUnitCostLabel`, `formatAdvancedTechLine`)
