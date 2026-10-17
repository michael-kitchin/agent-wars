# New Game Dialog

The overlay that starts a match and the overlay that reports game over. They are the same surface.

## Purpose

Collect the settings for a match, and later tell the player who won.

## Availability

Opens in New game and in Game over. See [modes-and-transitions.md](modes-and-transitions.md). It opens at startup when no match is loaded, when the player clicks New game in the game menu, and when the match ends. At startup and at game over it cannot be dismissed without starting a match. While a match is waiting under the screen, the header bar's right edge holds a close control (`#new-game-dialog-close`) that hides the screen and returns to that match. The console and the selection panel are not on screen while it is open, including while the choices are hidden. The top bar is the new-game bar ([top-bar.md](top-bar.md)). The setup panel floats over the map, 12 px in from the map's top-left corner, and the map fills the window under the top bar. Drag and the wheel pan and zoom the preview, with the choices showing or hidden.

## Information Displayed

- A message: "Start the global game when ready." or "Start the regional game when ready." at startup, "Start a new global game when ready." or "Start a new regional game when ready." after New game, and "You win!" or "You lose." The startup and New game sentences follow the selected tab. Game over does not.
- The panel's body has three sections, each under a small uppercase title: Map, Forces, and Rules.
- Map: Global and Regional tabs. Opening the overlay selects Global when no match is loaded or the loaded match is global, and Regional when the loaded match is a region. Under the tabs, one row per choice: a label, the dropdown, and a square randomize button the dropdown's height. The label column fits the longest label, so every dropdown in both tabs starts at the same edge, has the same width, and fills the row up to its randomize button. A long name is cut off in the closed dropdown; the open list shows it in full. Game size, the four bonuses, fog of war, and the starting month stay outside the tabs.
- On Global: Human, the human home-region choice, and a randomize control labeled "Randomize human home region".
- On Global: AI, the AI home-region choice, and a randomize control labeled "Randomize AI home region", in the opponent rose from the [UI style guide](../ui-style-guide.md). The two home regions may match.
- On Regional: Region, the region selector, with a randomize control labeled "Randomize region", the same teal square as the human home-region randomize button; then Your side, the human side-group choice; then Opponent, the AI side-group choice, with a rose randomize button. Each side has a randomize button. Opening the overlay draws a region, then two different sides. Changing the region, or clicking its randomize control, draws two different sides again. The region draw includes the region already shown. One side's randomize button picks any group except the other side's current group.
- Under the Map rows, Add another opponent, a dashed slot across the section, disabled in this version.
- Forces: on the title's line, at the right, `Advanced tech: $N+ hexes`. On Global, N is the world map's threshold. On Regional, N is the selected region's threshold, and it changes with the region.
- Forces: Game size, its dropdown only as wide as its longest item.
- Forces: one row of the four unit types, infantry, armor, naval, and air. Each shows the map glyph drawn dark on a small gray disk, the cap for the chosen game size in bold, a dot, and the unit's price, such as `12 · $20` (`formatUnitCostLabel`). The glyph's alternative text names the type. The price follows the selected tab and, on Regional, the selected region. The caps are in [game size and unit caps](../game-size-unit-caps.md).
- Rules: the four bonuses in two columns. The first row is Origin bonus, then Tech bonus. The second row is Terrain bonus, then Weather bonus. Each dropdown lists Off, Low, and High. Whenever the overlay opens, every dropdown is set to Low. Each dropdown is independent. Under them, Starting month, a control that lists the full English month names and is only as wide as its longest month, starting at the same edge as the bonus dropdowns, with a randomize control labeled "Randomize starting month" to its right, a square button the same height and color as the human home-region randomize button. Then the Fog of war checkbox. Whenever the overlay opens, Fog of war is checked and the month control shows a random month, the same way the home regions are drawn. The bonus rules for each level are in [combat rules §4.9](../combat-rules-v3.md).
- A button labeled "Start game" when no match is loaded or when New game opened the overlay, and "New game" when the match is over.
- The setup panel floats over the map, 12 px in from the map's top-left corner, `--new-game-panel-width` (432 px) wide, in the selection panel's chrome: navy, a 1 px `--chrome-border` border, 6 px corners, and a shadow (`static/newGameChrome.css`). It is as tall as its content, up to the map's height less the 12 px inset at the top and the bottom. Its header bar is 50 px tall: the chevron expand control (a 32 px column with a divider) at the left, then the message, and, while a match waits under the screen, a close control (a 32 px column) at the right. Its body holds the choices and scrolls. Its footer holds Start game, or New game.
- The chevron points down while the choices are hidden and up while they show. Collapsing leaves only the header bar, 52 px with the border, at the same spot, and it still shows the message. The panel slides between the two states over 150 ms from its top edge, or changes at once when the system asks for reduced motion (`startPanelHeightSlide`). The tips are "Hide the new game choices to see more of the map." and "Show the new game choices." Every open puts the panel back at the corner, expanded (`placeNewGameDialogAtInset` and `expandNewGameDialog`).
- A grip on the panel's top-right corner moves the panel with a primary-button drag. The panel stays inside the map with the 12 px inset to spare (`floatingPanelOffset` in `src/shared/mapChromePlacement.ts`). Its tip is "Drag to move this screen. It goes back to the corner each time it opens."
- Control tips for these choices and those buttons are in [control-tooltips.md](control-tooltips.md).
- The map under the panel shows the selected tab's preview. The preview fit centres on the whole map, so the panel covers part of the framed area. Global frames the Mercator world one zoom level closer than that world fit. Regional frames the selected region, including sea and neutral-border hexes. Global draws the selected home regions with the same terrain fills a started match uses on those hexes, and leaves the rest of the strategic hex grid undrawn until the player holds T. Holding T draws that grid, with those same fills and strokes. A regional preview always draws its strategic hex grid, with those same fills and strokes. The human and AI home areas are highlighted with the same rings a match in progress uses: an exclusive home uses that player's color for both rings, and a shared or identical home uses the gray overlap rings. Weather icons sit on the same band as in a match, on every strategic hex of the preview, and follow the selected starting month while Weather bonus is Low or High. The Weather tab does not apply to the preview, because the minimap panel is hidden while the overlay is open. Low and High use the same glyph. Off hides the icons. While T is held and Tech bonus is Low or High, each strategic hex whose original urban count can produce units shows that map's tech icon, Basic or Advanced, on the same band, beside the weather icon as in a match. Low and High use the same glyph. Off hides the tech icons. Battle-detail zoom of that map's strategic hexes hides the weather icons and the tech icons. The preview draws no units, hex codes, production labels, build markers, battle-entry markers, or other match chrome. Fog of war does not hide the preview icons. Basic and Advanced follow that map's Advanced threshold, the same N as the Advanced tech line. Opening the overlay frames the main map to that extent. Changing a home does not move the view. Changing the tab or the regional region does. The map fills the window under the top bar, and the frame centres on the whole map. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden until the overlay closes.

## Inputs and Responses

### Mouse

- When the player drags or turns the wheel over the map outside the panel, the preview pans and zooms, inside the extent already applied. The + and − zoom control stays hidden. A click, double-click, or right-click on that map does not select, order, or change the selection. Hover does not open a hex tooltip or an order preview, and the pointer does not show a unit cursor.
- When the player clicks the expand control while the choices are showing, the panel slides down to the header bar and the chevron points down. The map keeps its centre and zoom. Clicking it again slides the choices open and the chevron points up. A panel dragged low moves up if the expanded height would leave the map.
- When the player drags the grip, the panel follows the pointer and stays inside the map, 12 px in from each edge. Every open puts it back at the corner.
- When the player clicks the close control, the screen hides and the match that was waiting returns, including its camera, its orders, and its selection. The control is absent at startup and at game over.
- When the player is on Global and changes either home region, that side's home region updates and the map highlights that home. The two home regions may be the same. Nothing in the overlay prevents that. The same region for both homes uses the gray overlap rings.
- When the player is on Global and clicks a home-region randomize control, that side's region becomes a random legal choice and the map highlights that home. The world extent stays.
- When the player clicks Regional, the map frames that region and draws the two home areas, and the region and two different sides are the ones drawn when the overlay opened, until the player changes them. The strategic hex grid stays drawn. Changing the region frames the new region, draws two different sides again, and updates the Advanced line to that region's threshold. The region randomize control does the same draw, and it may draw the region already shown. Switching to Global frames the world one zoom level closer than that world fit, draws the selected home regions, hides the hex grid until the player holds T, and sets that line to the world map's threshold.
- When the player clicks one Regional side's randomize control, or changes one side, that side's home highlight moves. The other side stays. The region extent stays.
- When a regional map has fewer than two sides, Start is disabled and a toast says the map has no two sides.
- When the player clicks the starting-month randomize control, the month becomes a random month from the list, including the month already shown. Opening the overlay draws a month the same way.
- When the player changes game size, the caps in the unit row update to that size.
- When the player changes Fog of war, Origin bonus, Tech bonus, Terrain bonus, Weather bonus, or the starting month, the next match uses that setting. A global match starts in that month of Year 1, and each turn is one month. A regional match starts on the 1st of that month, and each turn is one week. Changing the starting month or Weather bonus updates the weather icons on the map under the panel without reloading the grid. Changing Tech bonus updates the tech icons the same way while T is held. Opening the overlay checks Fog of war again, sets every bonus dropdown back to Low, and draws a new starting month. A refresh while the overlay stays open keeps the month the player is looking at.
- When the player clicks Start game or New game, the match starts, drafts and the selection clear, the match cost resets to zero in the Commander section and on the footer status line, the AI activity log and the Reports tab clear, and the overlay closes on success. The top bar shows the match status again, the console is on screen, and the view then frames the new match in the map beside the console, as in [map-surface.md](map-surface.md). Clicking Start while a match is waiting stops that match before the new one is requested. A failure leaves the overlay open, and Close is gone because there is no match left to return to.

### Keyboard

- When a dropdown has focus, map pan keys and T do nothing. See [input-map.md](input-map.md). Hiding the choices moves focus off a dropdown that had it, so those keys work again. Showing the choices does not move focus onto a dropdown. While this overlay is open, holding T draws the strategic hex grid on the global map and shows that map's tech icons beside the weather icons. A regional preview keeps its hex grid. It does not show hex codes or production labels. Releasing T hides the global grid and the tech icons again and leaves the home regions and the weather icons drawn.
- Escape does not close this overlay.

### Other

- None.

## States

- Hidden: a match is in progress and not over.
- Open for a new match: no match, or the player clicked New game. The close control shows only when a match is waiting under the screen.
- Open for game over: the match has a winner. The button reads "New game".

## Invariants

- The overlay does not close on its own. A successful start closes it. While a match is waiting under the screen, the close control closes it and returns to that match.
- Whenever the overlay opens, the choices are showing. A refresh while the overlay stays open leaves hidden choices hidden.
- The startup, New game, and game-over messages stay distinct from each other.
- Fog of war is checked and Origin bonus, Tech bonus, Terrain bonus, and Weather bonus are all at Low every time the overlay opens, including game over. The starting month is a new random month every time the overlay opens, including game over.
- Starting a match clears the previous selection and drafts.

## Strategic and Tactical Differences

New game, in the game menu, opens this overlay during strategic planning, tactical planning, and resolution playback in either theater. It does not open while the tactical annihilation dialog is open, or while the tactical battles list is open, because those dialogs already take the window. Opening it leaves the match running: planning that was already running finishes and applies, and playback continues under the screen. A new background plan does not start while the screen is open. New game is unavailable while a Ready is being sent and answered. Close returns to the match as it was, including its camera (`closeNewGameOverlayToMatch` in `src/renderer/gameplay/newGameReturn.ts`). Clicking Start is the only step that stops the match. That stop happens before the new match is created, so a failed start leaves the screen open with nothing underneath to return to. The current match is replaced when Start succeeds. If the match ends while the screen is open, the close control goes and the screen shows the result. Starting a match ends any tactical session and returns to Strategic planning.

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

- `static/index.html` (`#game-over-overlay`, `#new-game-dialog-collapse`, `#game-over-dialog`, `#game-over-message`, `#new-game-tab-global`, `#new-game-tab-regional`, `#new-game-human-region-select`, `#new-game-human-region-randomize`, `#new-game-ai-region-select`, `#new-game-ai-region-randomize`, `#new-game-region-select`, `#new-game-region-randomize`, `#new-game-human-side-select`, `#new-game-human-side-randomize`, `#new-game-ai-side-select`, `#new-game-ai-side-randomize`, `#new-game-add-opponent-btn`, `#new-game-advanced-tech`, `#new-game-cost-infantry`, `#new-game-cost-armor`, `#new-game-cost-naval`, `#new-game-cost-air`, `#new-game-size-select`, `#new-game-size-cap-infantry`, `#new-game-size-cap-armor`, `#new-game-size-cap-naval`, `#new-game-size-cap-air`, `#new-game-fog-checkbox`, `#new-game-origin-bonus-select`, `#new-game-terrain-bonus-select`, `#new-game-weather-bonus-select`, `#new-game-tech-bonus-select`, `#new-game-start-month`, `#new-game-start-month-randomize`, `#new-game-btn`)
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
- `src/renderer/gameplay/newGameRegionUi.ts`
- `src/renderer/gameplay/newGameSizeUi.ts`
- `src/renderer/gameplay/newGameMapPreviewUi.ts`
- `src/renderer/map/newGameMapPreviewRendering.ts`
- `src/main/gameMap/newGameMapPreview.ts`
- `src/renderer/core/uiState.ts`
- `src/shared/gameSize.ts`
- `src/shared/gameMapList.ts` (`formatUnitCostLabel`, `formatAdvancedTechLine`)
