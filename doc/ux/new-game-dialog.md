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
- On Regional: one region selector, centered, above a human side-group choice and an AI side-group choice. Each side has a randomize button. Opening the overlay draws a region, then two different sides. Changing the region draws two different sides again. One side's randomize button picks any group except the other side's current group. Under the side selectors, a line reads `Advanced tech: $N+ hexes` for that region's threshold.
- After each unit type, that unit's price in parentheses, such as `Infantry ($20)`, for the selected tab and, on Regional, the selected region. Cap badges stay driven by game size.
- A game-size choice. The dropdown sits on the same line as its label, to the right, with the same gap as each bonus dropdown, and only as wide as its longest item.
- Cap badges for infantry, armor, naval, and air: gray disks with the map glyphs drawn dark. The numbers are in [game size and unit caps](../game-size-unit-caps.md).
- Two option lines. The first line is Origin bonus, a slash (/) with a small space on each side, then Tech bonus. The second line is Terrain bonus, a slash the same way, then Weather bonus. When a narrow window wraps a line, a slash that would sit at the start or end of that line is hidden. Each label ends with a colon, for example "Tech bonus:". Each dropdown lists Off, Low, and High. Whenever the overlay opens, every dropdown is set to Low. Each dropdown is independent. The next row starts with a Fog of war checkbox, then a slash (/) with a small space on each side, then a "Starting month:" control that lists the full English month names. Whenever the overlay opens, Fog of war is checked and that control shows a random month, the same way the home regions are drawn. To the right of the month is a randomize control labeled "Randomize starting month", a square button the same height and color as the human home-region randomize button. The bonus rules for each level are in [combat rules §4.9](../combat-rules-v3.md).
- A button labeled "Start game" when no match is loaded or when New opened the overlay, and "New game" when the match is over.
- Control tips for these choices and that button are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player is on Global and changes either home region, that side's home region updates. The two home regions may be the same. Nothing in the overlay prevents that.
- When the player is on Global and clicks a home-region randomize control, that side's region becomes a random legal choice.
- When the player clicks Regional, the region and two different sides are the ones drawn when the overlay opened, until the player changes them. Changing the region draws two different sides again.
- When the player clicks one Regional side's randomize control, that side becomes a random group other than the other side's current group.
- When a regional map has fewer than two sides, Start is disabled and a toast says the map has no two sides.
- When the player clicks the starting-month randomize control, the month becomes a random month from the list, including the month already shown. Opening the overlay draws a month the same way.
- When the player changes game size, the cap badges update to that size.
- When the player changes Fog of war, Origin bonus, Tech bonus, Terrain bonus, Weather bonus, or the starting month, the next match uses that setting. Opening the overlay checks Fog of war again, sets every bonus dropdown back to Low, and draws a new starting month. A refresh while the overlay stays open keeps the month the player is looking at.
- When the player clicks Start game or New game, the match starts, drafts and the selection clear, the AI cost readout and the AI activity log clear, and the overlay closes on success. A failure leaves the overlay open.

### Keyboard

- When a dropdown has focus, map pan keys do nothing. See [input-map.md](input-map.md).
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
- [game size and unit caps](../game-size-unit-caps.md)
- [region versus region](../region-vs-region.md)
- [right-panel-model-tab.md](right-panel-model-tab.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#game-over-overlay`, `#game-over-message`, `#new-game-tab-global`, `#new-game-tab-regional`, `#new-game-human-region-select`, `#new-game-human-region-randomize`, `#new-game-ai-region-select`, `#new-game-ai-region-randomize`, `#new-game-region-select`, `#new-game-human-side-select`, `#new-game-human-side-randomize`, `#new-game-ai-side-select`, `#new-game-ai-side-randomize`, `#new-game-advanced-tech`, `#new-game-cost-infantry`, `#new-game-cost-armor`, `#new-game-cost-naval`, `#new-game-cost-air`, `#new-game-size-select`, `#new-game-size-cap-infantry`, `#new-game-size-cap-armor`, `#new-game-size-cap-naval`, `#new-game-size-cap-air`, `#new-game-fog-checkbox`, `#new-game-country-bonus-select`, `#new-game-terrain-bonus-select`, `#new-game-weather-bonus-select`, `#new-game-tech-bonus-select`, `#new-game-start-month`, `#new-game-start-month-randomize`, `#new-game-btn`)
- `src/renderer/gameplay/newGame.ts`
- `src/renderer/gameplay/newGameMapUi.ts`
- `src/renderer/gameplay/newGameOptionsUi.ts`
- `src/renderer/gameplay/newGameRegionUi.ts`
- `src/renderer/gameplay/newGameSizeUi.ts`
- `src/renderer/core/uiState.ts`
- `src/shared/gameSize.ts`
