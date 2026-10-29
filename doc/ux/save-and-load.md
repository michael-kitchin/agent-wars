# Save and Load

Save game… in the game menu, and Load game… in that menu and on the new-game bar.

## Purpose

Let the player keep a match in a file and open that file later, including a match that is in a tactical battle.

## Availability

Save game… is in the [game menu](game-menu.md). It can be used in strategic planning and in tactical planning, including while a commander is still planning. It is disabled in these cases, and the first one wins:

- The match is over. The tip is "The match is over, so there is nothing to save."
- No match is loaded. The tip is "There is no match to save."
- The new-game screen is open over a match that is still being played, including while that screen is compact. The tip is "Close the new-game screen to save the match under it."
- Ready or a battle beat is still resolving. The tip is "Save game is available again once this turn or beat finishes resolving."

While it can be clicked, the tip is "Save this match to a file."

Load game… is on the game menu and on the new-game bar, in New game and Game over as well as during play. It is disabled only while Ready or a battle beat is still resolving. That tip is "Load game is available again once this turn or beat finishes resolving." While a match is still being played, the tip is "Open a saved game from a file. The match in progress is replaced." Otherwise it is "Open a saved game from a file."

The sentences come from `saveGameItemState` and `loadGameItemState` in `src/shared/saveLoadAvailability.ts`. A click recomputes them, so a menu that opened earlier still follows the match now.

## Information Displayed

The operating system's Save dialog and Open dialog use the filter name "Agent Wars save" and the extension `agentwars` (`SAVE_FILE_FILTER_NAME`, `SAVE_FILE_EXTENSION`).

Save offers a name of the form "Map turn N.agentwars", or "Map turn N battle turn T.agentwars" during a battle (`suggestedSaveFileName`). Characters a file name cannot contain become a hyphen, and trailing dots and spaces are removed. A chosen name that does not already end in `.agentwars` gets that extension. The folder is the last folder used for a manual save or a manual open outside the automatic-save folder, when that path is still a folder, and otherwise the player's documents folder. A remembered path that was deleted, or that is a file, is not offered. A file chosen inside the automatic-save folder does not change that remembered folder.

Open starts in the remembered folder when that path is still a folder, and otherwise in the automatic-save folder.

After a save, the map toast reads "Saved {file name}." Canceling the dialog shows nothing. A refusal shows the main-process sentence, such as "The game could not be saved." These toasts are not copied to the Reports tab.

Before a load replaces a match that is still being played, including a match under the new-game screen, a dialog asks:

- Title: "Load a saved game?"
- Body: "The match in progress will be replaced. Save it first if you want to keep it."
- Buttons: Load… and Cancel. Cancel takes the initial focus.

A load when no match is loaded, or when the match is over, does not ask. Canceling the Open dialog shows nothing. A refusal shows that sentence, such as "The saved game could not be loaded." That toast is not copied to the Reports tab. After a successful load the window reloads, and the map toast reads "Loaded {file name}." The AI activity log and the Reports tab start empty, as they do after a quit and a relaunch.

The app also keeps the last five automatic saves (`AUTOSAVE_KEEP_COUNT`) in an `autosaves` folder under that version's user-data directory. Each file is one strategic turn, or one tactical turn inside a battle, named `autosave-YYYYMMDD-HHMMSS-mmm-turn-N.agentwars`, with `-battle-turn-T` during a battle, in local time. The player does not choose these files. They can be opened with Load game…, because the Open dialog can start in that folder.

A file does not contain this machine's API keys, the remembered commanders, or the app-wide model and reasoning choices. Each seat's model, reasoning effort, and doctrine stay in the file. The full list is in [save-files.md](../save-files.md).

## Inputs and Responses

### Mouse

- Save game…, while it is enabled, closes the game menu and opens the Save dialog. The toast follows the result above.
- Load game…, while it is enabled, closes the game menu when the click came from that menu. Over a live match it opens the confirm dialog first. The question takes the pointer, including while the new-game screen is open. Load… opens the Open dialog. Cancel, a click on the backdrop, and a refused confirm leave the match as it was.
- A disabled Save game… or Load game… does nothing. Its tip still shows.

### Keyboard

- Escape while "Load a saved game?" is open chooses Cancel. The key does not reach the map or the game menu. See [input-map.md](input-map.md).
- Enter chooses Cancel, because Cancel has focus when the question opens.

## States

- No match: Save game… is disabled. Load game… opens a file without asking.
- Match in progress: Save game… writes a file. Load game… asks, then replaces that match.
- New-game screen over a live match: Save game… is disabled until the screen closes. Load game… still asks, because the match underneath is still being played.
- Resolving: both controls are disabled until the turn or beat finishes.
- Game over: Save game… is disabled. Load game… opens a file without asking.
- After load: the window reloads into the match the file holds. A battle that was open in the file is open again. In-flight commander work does not resume. The AI activity log and the Reports tab start empty. The result matches quitting and launching again with that file on disk.

## Invariants

- Save game… never writes a file while it is disabled, while a turn or beat is resolving, or while the match is over.
- Load game… never replaces a match that is still being played unless the player chooses Load….
- A canceled dialog does not show a toast and does not change the match.
- The toast after a load uses the file name stored across the reload. If that name cannot be stored, the match still reloads and the toast is skipped.

## Strategic and Tactical Differences

None for the controls. A save during a battle includes that battle, and a load of such a file resumes it. Automatic saves treat a tactical turn as its own turn, so a battle can add files beyond the strategic turn that opened it. The folder still keeps five.

## Related Documents

- [game-menu.md](game-menu.md)
- [top-bar.md](top-bar.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [control-tooltips.md](control-tooltips.md)
- [input-map.md](input-map.md)
- [save-files.md](../save-files.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#game-menu-save-btn`, `#game-menu-load-btn`, `#topbar-load-btn`, `#load-confirm-dialog`)
- `src/renderer/gameplay/saveLoadMenu.ts` (`wireSaveLoadMenu`, `syncSaveLoadItems`)
- `src/renderer/gameplay/loadConfirmDialog.ts` (`confirmLoadOverMatch`)
- `src/renderer/chrome/confirmDialog.ts` (`createConfirmDialog`)
- `src/shared/saveLoadAvailability.ts` (`saveGameItemState`, `loadGameItemState`, `loadNeedsConfirm`)
- `src/main/ipc/saveLoadIpcHandler.ts` (`registerSaveLoadIpcHandler`)
- `src/main/saveGame/saveLoadPipeline.ts` (`runSaveGame`, `runLoadGame`)
- `src/main/saveGame/autoSave.ts` (`maybeWriteTurnStartAutoSave`)
