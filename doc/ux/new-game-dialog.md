# New Game Dialog

The overlay that starts a match and the overlay that reports game over. They are the same surface.

## Purpose

Collect the settings for a match, and later tell the player who won.

## Availability

Opens in New game and in Game over. See [modes-and-transitions.md](modes-and-transitions.md). It opens at startup when no match is loaded, when the player clicks New, and when the match ends. It cannot be dismissed without starting a match. The map and the right panel do not accept input while it is open.

## Information Displayed

- A message: "Start the world map game when ready.", "Start a new world map game when ready.", "You win!", or "You lose."
- Global and Regional tabs. Opening the overlay selects Global when no match is loaded or the loaded match is global, and Regional when the loaded match is a region. Game size, the four bonuses, fog of war, and the starting month stay outside the tabs.
- On Global: a human home-region choice and a randomize control labeled "Randomize human home region". The dropdown is only as wide as its longest region name. The randomize control is a square button the same height as that dropdown.
- On Global: an AI home-region choice and a randomize control labeled "Randomize AI home region". The dropdown is only as wide as its longest region name. The randomize control is a square button the same height as that dropdown, in the opponent rose from the [UI style guide](../ui-style-guide.md). The two home regions may match.
- On Regional: one region selector, centered, above a human side-group choice and an AI side-group choice. Beside the region selector is a randomize control labeled "Randomize region", the same teal square as the human home-region randomize button. Each side has a randomize button. Opening the overlay draws a region, then two different sides. Changing the region, or clicking its randomize control, draws two different sides again. The region draw includes the region already shown. One side's randomize button picks any group except the other side's current group.
- After each unit type, that unit's price in parentheses, such as `Infantry ($20)`, for the selected tab and, on Regional, the selected region. Cap badges stay driven by game size.
- A game-size choice. The dropdown sits on the same line as its label, to the right, with the same gap as each bonus dropdown, and only as wide as its longest item. Under that dropdown, a line reads `Advanced tech: $N+ hexes`. On Global, N is the world map's threshold. On Regional, N is the selected region's threshold, and it changes with the region.
- Cap badges for infantry, armor, naval, and air: gray disks with the map glyphs drawn dark. The numbers are in [game size and unit caps](../game-size-unit-caps.md).
- Two option lines. The first line is Origin bonus, a slash (/) with a small space on each side, then Tech bonus. The second line is Terrain bonus, a slash the same way, then Weather bonus. When a narrow window wraps a line, a slash that would sit at the start or end of that line is hidden. Each label ends with a colon, for example "Tech bonus:". Each dropdown lists Off, Low, and High. Whenever the overlay opens, every dropdown is set to Low. Each dropdown is independent. The next row starts with a Fog of war checkbox, then a slash (/) with a small space on each side, then a "Starting month:" control that lists the full English month names. Whenever the overlay opens, Fog of war is checked and that control shows a random month, the same way the home regions are drawn. To the right of the month is a randomize control labeled "Randomize starting month", a square button the same height and color as the human home-region randomize button. The bonus rules for each level are in [combat rules §4.9](../combat-rules-v3.md).
- A button labeled "Start game" when no match is loaded or when New opened the overlay, and "New game" when the match is over.
- Control tips for these choices and that button are in [control-tooltips.md](control-tooltips.md).
- The map behind the overlay shows the selected tab's strategic hexes, with the same terrain fills a started match on that map uses. Global frames the Mercator world and uses the world strategic grid. Regional frames the selected region, including sea and neutral-border hexes, and uses that pack's strategic grid. The human and AI home areas are highlighted with the same rings a match in progress uses: an exclusive home uses that player's color for both rings, and a shared or identical home uses the gray overlap rings. Weather icons sit on the same band as in a match and follow the selected starting month while Weather bonus is Low or High. Low and High use the same glyph. Off hides the icons. Holding T hides the fills and the weather icons. While T is held and Tech bonus is Low or High, each hex whose original urban count can produce units shows that map's tech icon, Basic or Advanced, on the same band. Low and High use the same glyph. Off hides the tech icons. Battle-detail zoom of that map's strategic hexes hides the weather icons and the tech icons. The preview draws no units, hex codes, production labels, build markers, battle-entry markers, or other match chrome. Fog of war does not hide the preview icons. Basic and Advanced follow that map's Advanced threshold, the same N as the Advanced tech line. Opening the overlay frames the main map to that extent. Changing a home does not move the view. Changing the tab or the regional region does. The overlay has no dark veil. Its upper-left corner is the minimap's usual corner, 12px from the top and left of the map pane. The minimap and the terrain legend are hidden until the overlay closes. A short or narrow map pane scrolls the dialog, and the form keeps its size.

## Inputs and Responses

### Mouse

- When the player is on Global and changes either home region, that side's home region updates and the map highlights that home. The two home regions may be the same. Nothing in the overlay prevents that. The same region for both homes uses the gray overlap rings.
- When the player is on Global and clicks a home-region randomize control, that side's region becomes a random legal choice and the map highlights that home. The world extent stays.
- When the player clicks Regional, the map frames that region and draws its strategic grid, and the region and two different sides are the ones drawn when the overlay opened, until the player changes them. Changing the region frames the new region, draws two different sides again, and updates the Advanced line to that region's threshold. The region randomize control does the same draw, and it may draw the region already shown. Switching to Global frames the world and sets that line to the world map's threshold.
- When the player clicks one Regional side's randomize control, or changes one side, that side's home highlight moves. The other side stays. The region extent stays.
- When a regional map has fewer than two sides, Start is disabled and a toast says the map has no two sides.
- When the player clicks the starting-month randomize control, the month becomes a random month from the list, including the month already shown. Opening the overlay draws a month the same way.
- When the player changes game size, the cap badges update to that size.
- When the player changes Fog of war, Origin bonus, Tech bonus, Terrain bonus, Weather bonus, or the starting month, the next match uses that setting. Changing the starting month or Weather bonus updates the weather icons on the map behind the overlay without reloading the grid. Changing Tech bonus updates the tech icons the same way while T is held. Opening the overlay checks Fog of war again, sets every bonus dropdown back to Low, and draws a new starting month. A refresh while the overlay stays open keeps the month the player is looking at.
- When the player clicks Start game or New game, the match starts, drafts and the selection clear, the AI cost readout and the AI activity log clear, and the overlay closes on success. The view then frames the new match, as in [map-surface.md](map-surface.md). A failure leaves the overlay open.

### Keyboard

- When a dropdown has focus, map pan keys and T do nothing. See [input-map.md](input-map.md). While this overlay is open, holding T hides the preview fills and weather icons and shows that map's tech icons. It does not show hex codes or production labels.
- Escape does not close this overlay.

### Other

- None.

## States

- Hidden: a match is in progress and not over.
- Open for a new match: no match, or the player clicked New.
- Open for game over: the match has a winner. The button reads "New game".

## Invariants

- The overlay never closes itself. Only a successful start closes it.
- The startup, New, and game-over messages stay distinct from each other.
- Fog of war is checked and Origin bonus, Tech bonus, Terrain bonus, and Weather bonus are all at Low every time the overlay opens, including game over. The starting month is a new random month every time the overlay opens, including game over.
- Starting a match clears the previous selection and drafts.

## Strategic and Tactical Differences

The overlay is not used inside a battle. Starting a match from it ends any tactical session and returns to Strategic planning.

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [map-surface.md](map-surface.md)
- [minimap.md](minimap.md)
- [game size and unit caps](../game-size-unit-caps.md)
- [region versus region](../region-vs-region.md)
- [right-panel-model-tab.md](right-panel-model-tab.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#game-over-overlay`, `#game-over-message`, `#new-game-tab-global`, `#new-game-tab-regional`, `#new-game-human-region-select`, `#new-game-human-region-randomize`, `#new-game-ai-region-select`, `#new-game-ai-region-randomize`, `#new-game-region-select`, `#new-game-region-randomize`, `#new-game-human-side-select`, `#new-game-human-side-randomize`, `#new-game-ai-side-select`, `#new-game-ai-side-randomize`, `#new-game-advanced-tech`, `#new-game-cost-infantry`, `#new-game-cost-armor`, `#new-game-cost-naval`, `#new-game-cost-air`, `#new-game-size-select`, `#new-game-size-cap-infantry`, `#new-game-size-cap-armor`, `#new-game-size-cap-naval`, `#new-game-size-cap-air`, `#new-game-fog-checkbox`, `#new-game-country-bonus-select`, `#new-game-terrain-bonus-select`, `#new-game-weather-bonus-select`, `#new-game-tech-bonus-select`, `#new-game-start-month`, `#new-game-start-month-randomize`, `#new-game-btn`)
- `src/renderer/gameplay/newGame.ts`
- `src/renderer/gameplay/newGameMapUi.ts`
- `src/renderer/gameplay/newGameOptionsUi.ts`
- `src/renderer/gameplay/newGameRegionUi.ts`
- `src/renderer/gameplay/newGameSizeUi.ts`
- `src/renderer/gameplay/newGameMapPreviewUi.ts`
- `src/renderer/map/newGameMapPreviewRendering.ts`
- `src/main/gameMap/newGameMapPreview.ts`
- `src/renderer/core/uiState.ts`
- `src/shared/gameSize.ts`
