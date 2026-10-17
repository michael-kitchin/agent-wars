# Game Menu

The menu under the top bar's menu button: New game, Save game, Load game, Offer tactical battles, How to play, and Quit.

## Purpose

Keep match-level actions that the player uses rarely in one place, out of the way of turn play.

## Availability

The menu button is on the [top bar](top-bar.md), so the menu can open wherever the top bar accepts pointer input: Strategic planning, Tactical planning, Resolution playback, New game, and Game over. It closes, and cannot open, while the tactical battles list or the annihilation dialog is open.

## Information Displayed

A popup under the menu button, in this order:

- New game…, disabled while the new-game overlay is open.
- Save game…, disabled in this version.
- Load game…, disabled in this version.
- A separator.
- Offer tactical battles, a checkbox, checked by default.
- How to play, disabled in this version.
- A separator.
- Quit.

Control tips for these items are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks the menu button, the menu opens. A second click closes it.
- When the player clicks New game…, the menu closes and the new-game overlay opens over the match, which keeps running. New game works during strategic planning, tactical planning, and resolution playback. See [new-game-dialog.md](new-game-dialog.md). While that overlay is open, in New game and Game over, New game… is disabled, and its tip says the new-game screen is already open. While a Ready is resolving, New game… is also disabled, and its tip host says "New game is available again once this turn or beat finishes resolving." (`syncGameMenuNewGameItem`).
- When the player changes Offer tactical battles, the menu stays open. Later Ready resolutions either show the tactical battles list or skip it and resolve melee as Ignore. The choice survives a restart. See [tactical-battles-list.md](tactical-battles-list.md).
- When the player clicks Quit, the menu closes and the window closes. On Windows and Linux the app quits. On macOS the app stays in the dock.
- A press anywhere outside the menu and its button closes the menu.
- The disabled items do nothing.

### Keyboard

- Escape closes the menu and moves focus to the menu button. While the menu is open, Escape does not also close a build popup or a stack callout. See [input-map.md](input-map.md).

### Other

- Opening the new-game overlay closes the menu.
- When the tactical battles list or the annihilation dialog opens, the menu closes.
- Electron's File, Edit, and View bar stays hidden. Alt shows it, and its shortcuts still work.

## States

- Closed: the start state. The menu button reports that the menu is collapsed.
- Open: the popup shows under the button, and the button reports that it is expanded.

## Invariants

- The menu button's expanded state and the popup's visibility always agree.
- Unchecking Offer tactical battles never opens the tactical battles list.
- A disabled item never runs an action.

## Strategic and Tactical Differences

None. The menu works the same in both theaters.

## Related Documents

- [top-bar.md](top-bar.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [new-game-dialog.md](new-game-dialog.md)
- [tactical-battles-list.md](tactical-battles-list.md)
- [opponent-tab-commander.md](opponent-tab-commander.md)
- [input-map.md](input-map.md)

## Known Deviations

None.

## Open Questions

- On macOS, Quit closes the window and leaves the app running in the dock. A full quit would need a main-process call.

## Code Entry Points

- `static/index.html` (`#game-menu-btn`, `#game-menu`, `#openrouter-new-btn`, `#game-menu-save-btn`, `#game-menu-load-btn`, `#openrouter-tactical-battles`, `#game-menu-how-to-play-btn`, `#game-menu-quit-btn`)
- `static/frameChrome.css`
- `src/renderer/chrome/gameMenu.ts` (`syncGameMenuNewGameItem`)
- `src/renderer/openRouter/openRouterControls.ts` (New game and Offer tactical battles handlers)
- `src/renderer/gameplay/newGame.ts` (`openNewGameOverlayFromModelTab`)
- `src/renderer/gameplay/tacticalBattlePromptPreference.ts`
- `src/renderer/core/uiState.ts` (`setMainUIControlsEnabled`)
- `src/main/main.ts` (`autoHideMenuBar` on the window)
