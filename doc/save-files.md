# Save files

How a match becomes an `.agentwars` file, what that file contains, and which files this build will open.

The engine is the authority. The symbols named below are the ones to check when this page and the code disagree.

## What a save is

A save is a copy of the open match database, `GAME_DB_FILE_NAME` (`game-baseline-v12.sqlite`), written by `writeSaveFileFromOpenDatabase`. The copy is made with `VACUUM INTO` into a staging file under the app's user-data directory (`SAVE_STAGING_FILE_NAME`, `save-staging.agentwars`). The staging database is then opened with `journal_mode = DELETE`. If a `-wal` or `-shm` file is still beside it, the staging file and those journal files are deleted and the save fails with `SAVE_FAILED_MESSAGE` ("The game could not be saved."). The finished staging file is copied beside the player's chosen path and then takes that path's place. On Windows a rename does not replace an existing file, so the copy lands as a `.partial` file, any file already at the target is moved aside to `.replacing`, and the partial file is renamed onto the target. A failure puts the aside file back.

The file's SQLite `application_id` is `SAVE_APPLICATION_ID` (`0x41575356`). Two `game_config` rows record the write: `save_app_version` (`SAVE_APP_VERSION_CONFIG_KEY`) is `app.getVersion()`, and `save_written_at` (`SAVE_WRITTEN_AT_CONFIG_KEY`) is the UTC time of the write. A database that is inside a transaction fails the save with `SAVE_FAILED_MESSAGE` as well.

The operating-system dialogs use the filter name "Agent Wars save" and the extension `agentwars`.

## What a save leaves out

`MACHINE_LOCAL_CONFIG_KEYS` in `src/main/gameDb/machineLocalConfigKeys.ts` lists the six `game_config` rows that belong to this machine. A save deletes them before the file is written. A load copies this machine's current values of those same rows into the loaded match. They are:

| Key constant | `game_config` key |
| --- | --- |
| `OPENROUTER_API_KEY_CONFIG_KEY` | `openrouter_api_key` |
| `OPENROUTER_SELECTED_MODEL_CONFIG_KEY` | `openrouter_selected_model` |
| `OPENROUTER_SELECTED_REASONING_EFFORT_CONFIG_KEY` | `openrouter_selected_reasoning_effort` |
| `COMMANDER_MEMORY_CONFIG_KEY` | `openrouter_commander_memory` |
| `SEAT_API_KEYS_CONFIG_KEY` | `openrouter_seat_api_keys` |
| `SEAT_API_KEY_FLAGS_CONFIG_KEY` | `openrouter_seat_api_key_flags` |

The `seats` table stays in the file. That includes each seat's `model_id`, `reasoning_effort`, `doctrine_choice`, and `doctrine`. An in-flight commander request is not in the database, so it is not in the file. Loading stops those requests the same way starting a new match does (`stopModelWork` with `load_game`).

A new machine-local row has to be added to `MACHINE_LOCAL_CONFIG_KEYS` in the same change, or saves will carry it.

## Version

`EXPECTED_USER_VERSION` in `src/main/gameDb.ts` is **25**. A save is loaded only when its SQLite `user_version` equals that number. There is no migration. Bump it when `getFullDdl` changes. That bump makes every earlier save unloadable, and it also makes the on-disk match database from the previous schema fail validation on the next launch.

A change to the shape of any JSON a save carries in `game_config` needs a new versioned key, or the same bump. An older or newer app would misread the old shape. When `EXPECTED_USER_VERSION` or `MACHINE_LOCAL_CONFIG_KEYS` changes, update this document in the same change.

## What load accepts

`inspectSaveFile` reads the chosen file without touching the open match. The first failing check is the one the player sees:

| Check | Sentence |
| --- | --- |
| The file is not a database, or its `application_id` is not `SAVE_APPLICATION_ID`, or `validateGameDatabaseOrThrow` rejects the schema | `SAVE_NOT_A_SAVE_MESSAGE`: "This file is not an Agent Wars save." |
| `user_version` is not `EXPECTED_USER_VERSION` | `saveWrongVersionMessage`. When the file has `save_app_version`, "This save was made by Agent Wars {saved}. Agent Wars {current} cannot load it." Otherwise "This save was made by a different version of Agent Wars. Agent Wars {current} cannot load it." |
| `hexes` or `seats` has no rows, or `turn_state` has no row for id 1 | `SAVE_NO_MATCH_MESSAGE`: "This save has no match in it." |
| `game_map_id` is missing or empty, which means the global map, or it is a key of `REGIONAL_RULES_BY_ID` | Accepted. The global map is not a catalog row, and it is still accepted. |
| `game_map_id` is anything else | `SAVE_UNKNOWN_MAP_MESSAGE`: "This save uses a map this version of Agent Wars does not have." |

A file that passes is copied to `LOAD_STAGING_FILE_NAME` (`load-staging.agentwars`) under user data. This machine's current values of the six keys are read from the open match and written into that copy. When the match database is not open, the load stops and the copy is deleted, so a closed database is not treated as an empty key list. A rejected copy is closed before it is deleted, and any `-wal` or `-shm` file beside the staging path is deleted with it. `replaceGameDatabaseWithStagedFile` copies the open database to `canonicalPath + BEFORE_LOAD_BACKUP_SUFFIX` (`.before-load`), then puts the staged file in its place. The next load overwrites that backup. When the staged match cannot be opened, the previous file is copied back. A fog refresh failure is logged and does not by itself reject the load or replace the match file. The player then sees `LOAD_FAILED_MESSAGE`, or the map-load sentence when the failure was a map. When that previous file cannot be reopened, the player sees `DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE`: "The previous match could not be reopened. Restart Agent Wars."

After a successful replacement, `resetMatchMemoryAfterDatabaseReplace` reloads the seat roster and the other match-scoped memory, releases the in-memory battle, and restores a battle the file had open. It does not run the end-battle path. The window then reloads. The result matches quitting and launching again with that file on disk.

## When a save is refused

`matchSaveBlocker` refuses before any file is written. A database that is not ready, or a match with no hexes or no seats, uses `SAVE_NOTHING_TO_SAVE_MESSAGE`. A finished match (`game_over` of `1`) uses `SAVE_GAME_OVER_MESSAGE`: "The match is over, so there is nothing to save." A missing turn row, or a phase other than `planning`, uses `SAVE_BUSY_MESSAGE`: "The match can be saved once this turn finishes resolving." The same busy sentence is used when Ready is still in flight, including a check after the dialog returns. Load uses `LOAD_BUSY_MESSAGE`: "A saved game can be loaded once this turn finishes resolving." A second save or load started while one is in progress uses `SAVE_LOAD_IN_PROGRESS_MESSAGE`. An unexpected failure in the save or load request uses `SAVE_FAILED_MESSAGE` or `LOAD_FAILED_MESSAGE`.

The menu's own tips, for the new-game screen and for a turn that is still resolving, are the longer sentences in [ux/save-and-load.md](ux/save-and-load.md). Those two cases are decided in the renderer before a request is sent.

## Automatic saves

`maybeWriteTurnStartAutoSave` writes one file per strategic turn, and one file per tactical turn, when the open turn's key is not the key already written. The key is `s{turn}` or `s{turn}-b{battleId}-t{tacticalTurn}` (`turnStartKey`). The folder is `userData/autosaves` (`AUTOSAVE_DIRECTORY_NAME`). `pruneAutoSaves` keeps the five newest names that start with `autosave-` and end with `.agentwars` (`AUTOSAVE_KEEP_COUNT`). A save or load already in progress skips the automatic save, because both use the same staging file.

`withAutoSaveAfter` runs that write after these handlers return: `game:newGame`, `game:commitHumanTacticalDraftOrders`, `game:startTacticalBattle`, `game:endTacticalBattle`, `game:ready`, and `game:resolveMeleeIntercept`. `game:notifyResolutionPlaybackComplete` does not write one. `forgetAutoSaveTurnKey` runs after the new-game database reset, so the new match can write its own first file. `rememberCurrentAutoSaveTurnKey` runs after the battle is restored on launch, and again after a load, so opening a match does not immediately write another file for the turn it already holds.
