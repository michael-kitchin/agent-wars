# New Game Dialog

The overlay that starts a match and the overlay that reports game over. They are the same surface.

## Purpose

Collect the settings for a match, and later tell the player who won.

## Availability

Opens in New game and in Game over. See [modes-and-transitions.md](modes-and-transitions.md). It opens at startup when no match is loaded, when the player clicks New, and when the match ends. It cannot be dismissed without starting a match. The map and the right panel do not accept input while it is open.

## Information Displayed

- A message: "Start the world map game when ready.", "Start a new world map game when ready.", "You win!", or "You lose."
- A human home-region choice and a randomize control labeled "Randomize human home region".
- An AI home-region choice and a randomize control labeled "Randomize AI home region".
- A game-size choice.
- Cap badges for infantry, armor, naval, and air. The numbers are in [game size and unit caps](../game-size-unit-caps.md).
- A fog-of-war checkbox, checked whenever the overlay opens.
- A button labeled "Start game" when no match is loaded or when New opened the overlay, and "New game" when the match is over.

## Inputs and Responses

### Mouse

- When the player changes either home region, that side's home region updates. The two home regions may be the same. Nothing in the overlay prevents that.
- When the player clicks a randomize control, that side's region becomes a random legal choice.
- When the player changes game size, the cap badges update to that size.
- When the player changes fog of war, the next match uses that setting. Opening the overlay checks the box again.
- When the player clicks Start game or New game, the match starts, drafts and the selection clear, the AI cost readout and the AI activity log clear, and the overlay closes on success. A failure leaves the overlay open. The current code does not clear the log; see Known Deviations in [ai-activity-log.md](ai-activity-log.md).

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
- Fog of war is checked every time the overlay opens, including game over.
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

- `static/index.html` (`#game-over-overlay`, `#game-over-message`, `#new-game-human-region-select`, `#new-game-human-region-randomize`, `#new-game-ai-region-select`, `#new-game-ai-region-randomize`, `#new-game-size-select`, `#new-game-size-cap-infantry`, `#new-game-size-cap-armor`, `#new-game-size-cap-naval`, `#new-game-size-cap-air`, `#new-game-fog-checkbox`, `#new-game-btn`)
- `src/renderer/gameplay/newGame.ts`
- `src/renderer/gameplay/newGameRegionUi.ts`
- `src/renderer/gameplay/newGameSizeUi.ts`
- `src/renderer/core/uiState.ts`
- `src/shared/gameSize.ts`
