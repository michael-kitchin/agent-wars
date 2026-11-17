# Game Menu

The menu under the top bar's menu button: New game, Save game, Load game, Playback, Metrics, Offer tactical battles, How to play, and Quit.

## Purpose

Keep match-level actions that the player uses rarely in one place, out of the way of turn play.

## Availability

The menu button is on the [top bar](top-bar.md), so the menu can open wherever the top bar accepts pointer input: Strategic planning, Tactical planning, Resolution playback, New game, and Game over. It closes, and cannot open, while the tactical battles list or the annihilation dialog is open.

## Information Displayed

A popup under the menu button, in this order:

- New game…, disabled while the new-game overlay is open.
- Save game…. When it is enabled or disabled is in [save-and-load.md](save-and-load.md).
- Load game…. When it is enabled or disabled is in [save-and-load.md](save-and-load.md).
- A separator.
- Playback…, with its key, P, on the right.
- Metrics…, with its key, C, on the right.
- A separator.
- Offer tactical battles, a checkbox, checked by default.
- How to play.
- A separator.
- Quit.

Control tips for these items are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks the menu button, the menu opens. A second click closes it.
- When the player clicks New game…, the menu closes and the new-game overlay opens over the match, which keeps running. New game works during strategic planning, tactical planning, and resolution playback. See [new-game-dialog.md](new-game-dialog.md). While that overlay is open, in New game and Game over, New game… is disabled, and its tip says the new-game screen is already open. While a Ready is resolving, New game… is also disabled, and its tip host says "New game is available again once this turn or beat finishes resolving." (`syncGameMenuNewGameItem`).
- When the player clicks Save game… or Load game…, an enabled item closes the menu and runs that action. A disabled item does nothing. The tips, the dialogs, and the toasts are in [save-and-load.md](save-and-load.md).
- When the player clicks Playback…, the menu closes and replay starts on the newest recorded turn, the same as the P key. Opening the menu already starts leaving replay, so Playback… waits for that leave to finish and then enters. It never leaves replay, and does nothing when replay is already on. A refusal shows the same sentence as P. See [replay-panel.md](replay-panel.md).
- When the player clicks Metrics…, the menu closes and the charts dialog opens, under the same conditions as the C key. It never closes the dialog. See [charts-dialog.md](charts-dialog.md).
- When the player changes Offer tactical battles, the menu stays open. Later Ready resolutions either show the tactical battles list or skip it and resolve melee as Ignore. The choice survives a restart. See [tactical-battles-list.md](tactical-battles-list.md).
- When the player clicks How to play, the menu closes and the How to play guide opens on GitHub in the system's default browser, never inside the app. The renderer sends no address: the main process opens one fixed URL (`HOW_TO_PLAY_URL` in `src/main/ipc/howToPlayIpcHandler.ts`) with `shell.openExternal`. When the browser cannot be opened, nothing else happens.
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
- Unchecking Offer tactical battles never opens the tactical battles list for a human who is still playing. An observed match uses AI-only battles instead.
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
- [save-and-load.md](save-and-load.md)

## Known Deviations

None.

## Open Questions

- On macOS, Quit closes the window and leaves the app running in the dock. A full quit would need a main-process call.

## Code Entry Points

- `static/index.html` (`#game-menu-btn`, `#game-menu`, `#openrouter-new-btn`, `#game-menu-save-btn`, `#game-menu-load-btn`, `#game-menu-playback-btn`, `#game-menu-metrics-btn`, `#openrouter-tactical-battles`, `#game-menu-how-to-play-btn`, `#game-menu-quit-btn`)
- `static/frameChrome.css` (`.game-menu-shortcut`)
- `src/renderer/chrome/gameMenu.ts` (`syncGameMenuNewGameItem`, `GameMenuActions`)
- `src/renderer/chrome/gameMenuActions.ts` (`openChartsDialog`)
- `src/renderer/replay/replayMode.ts` (`openReplay`)
- `src/renderer/gameplay/saveLoadMenu.ts` (`syncSaveLoadItems`)
- `src/renderer/openRouter/openRouterControls.ts` (New game and Offer tactical battles handlers)
- `src/renderer/gameplay/newGame.ts` (`openNewGameOverlayFromModelTab`)
- `src/renderer/gameplay/tacticalBattlePromptPreference.ts`
- `src/renderer/core/uiState.ts` (`setMainUIControlsEnabled`)
- `src/main/ipc/howToPlayIpcHandler.ts` (`HOW_TO_PLAY_URL`, `openHowToPlay`, `registerHowToPlayIpcHandler`)
- `src/main/main.ts` (`autoHideMenuBar` on the window)
