# Match recording

How one match keeps a history, and how that history becomes a file when the match ends.

The engine is the authority. The symbols named below are the ones to check when this page and the code disagree.

## What is recorded

History lives in `match_records`, in the open match database. `ensureMatchRecordsTable` creates the table on open, the same way `ensurePendingAirDropOrdersTable` does. `EXPECTED_USER_VERSION` stays 26, and the table is not in `GAME_DB_REQUIRED_TABLES`. An older file at version 26 gains the table when it is opened. A save copies the table with the rest of the match. See [save-files.md](save-files.md).

A frame is a snapshot of the match tables at one step. An event is one thing that happened at that step and cannot be recovered by comparing frames. Each row stores `record_id`, `kind` (`frame` or `event`), `record_type`, `format_version`, `step_key`, `scope` (`strategic` or `tactical`), `turn_number`, `battle_id` (empty outside a battle), `beat_number` (0 outside a battle), `visibility`, `display_text`, `recorded_at`, and a `payload`. The payload is zlib-compressed JSON. A frame's `record_type` is `state` (`MATCH_FRAME_RECORD_TYPE`) at format version `MATCH_FRAME_FORMAT_VERSION` (1). This build writes eight event types, each at format version 1 (`MATCH_EVENT_FORMAT_VERSIONS`):

| `record_type` | When it is written |
| --- | --- |
| `match_started` | Written on the first step boundary of a match, including when another row was stored first. The payload has `appVersion`, `matchId`, and `firstRecordedTurn`. |
| `orders_committed` | Strategic orders that were about to resolve. One event for the human seat when any of the six pending order tables has a row, and one event for each owner in the orders gathered for Ready. The human seat is not in that gathered set. |
| `strategic_resolution` | A finished Ready, or a finished melee resolve. The payload is the resolution result. |
| `tactical_orders_committed` | The drafts of one tactical beat, immediately after a successful commit. |
| `tactical_resolution` | The playback of that beat, in the same call. |
| `consultation` | One model consult, from the summary already written to the consult log. `stage` is `orders`. A consult that finishes after New or Load has replaced the database is not stored on the replacement, including when the loaded file still has this match's id. Creating the match id during the consult does not drop it, and stopping the model does not drop it. |
| `commander_strategy` | The strategy line of that consult, when the line is not blank. The same New or Load rule as `consultation` applies. `display_text` is the line. |
| `match_ended` | The match is over. The payload has `winner` and `reason` as stored, including an empty `winner` for a tie. |

Human strategic orders are copied from `pending_orders`, `pending_ranged_orders`, `pending_air_orders`, `pending_missile_launches`, `pending_ferry_orders`, and `pending_air_drop_orders` before resolution clears them. An owner with no rows writes no event.

`match_id` in `game_config` (`MATCH_ID_CONFIG_KEY`) names the match. `ensureMatchId` writes one when the row is missing. `resetGameForNewMatch` deletes `match_records` and stores a new id.

## When a frame is written

`recordStepBoundary` writes a frame when the step key changes. The step key is `s{turn}` on the world map and `s{turn}-b{battleId}-t{beat}` inside a battle (`stepKeyText`). The frame is the database at that moment. A consult that runs after the frame, and any later write that stays on the same step, shows up in the next frame.

`withAutoSaveAfter` calls the boundary before the handler and again after it, and then writes the automatic save. The before call is what records a match that was loaded or resumed, at the turn it already holds. That first boundary writes `match_started` even if another row was stored first. Opening the app does not write a history row by itself. The first wrapped action does.

Ready records the human order tables and the step before resolution, writes `orders_committed` after resolution succeeds (including a turn that then waits on a melee decision), and writes `strategic_resolution` and the next step's frame only when the turn finished. Melee resolve writes `strategic_resolution` and the next frame, and does not write another orders event. A tactical commit records the beat's step before the commit, then the two tactical events after a successful commit that has playback.

When `game_over` is `1` and `match_ended` is missing, the boundary writes one frame for the current step if that call did not already write one, then writes `match_ended`. A second call for the same ended step writes nothing.

`AGENT_WARS_DISABLE_RECORDER` turns the recorder off when the flag is `1`, `true`, `yes`, or `on`. Nothing is written while it is on.

## Which tables a frame includes

`MATCH_TABLE_RECORDING_POLICY` in `src/main/recorder/matchFramePolicy.ts` classifies every match table. A frame copies each table whose mode is `frame`. Three tables are excluded:

| Table | Reason |
| --- | --- |
| `hexes` | Terrain does not change during a match. The recording file writes it once. |
| `turn_notes_history` | A growing log. A strategy is a `commander_strategy` event, and a loss is the difference between two frames. |
| `match_records` | The history itself. |

A new table has to be added to `MATCH_TABLE_RECORDING_POLICY` in the same change, as a frame table or with an exclusion reason. `matchFramePolicy.test.ts` fails when `sqlite_master` and the policy disagree.

`FRAME_EXCLUDED_CONFIG_KEYS` is every `MACHINE_LOCAL_CONFIG_KEYS` entry plus `SAVE_APP_VERSION_CONFIG_KEY` and `SAVE_WRITTEN_AT_CONFIG_KEY`. Those `game_config` rows are never in a frame and never in a recording file. A new machine-local key has to be added to `MACHINE_LOCAL_CONFIG_KEYS` in the same change.

## Who may be shown a row

The `visibility` column is `everyone`, `engine`, or `seats:` plus seat ids. `match_started` and `match_ended` are `everyone`. Frames, resolutions, both tactical events, and a consult with no seat are `engine`. A strategic orders event, a strategy, and a consult that names a seat are `seats:` plus that owner's id. Text that is not one of those forms, including an empty seat list, reads back as `engine` (`parseVisibilityText`).

## The recording file

A finished match cannot be saved (`SAVE_GAME_OVER_MESSAGE`). The portable copy is a gzip file under `userData/recordings`, named `recording-{matchId}.agentwars-recording` (`RECORDING_FILE_EXTENSION`). Characters in the id outside letters, digits, and hyphen become hyphens.

`exportFinishedMatchRecordingIfNeeded` writes the file when the recorder is on, the database is open, `game_over` is `1`, and a `match_ended` row exists. It does nothing while `deferredConsultPending` is true. `withAutoSaveAfter` passes that flag from the deferred-consult slot, after the automatic save, so a playback consult that can still add rows holds the file. Ending the match passes false, so the file is written even when that consult is still running. If the consult later adds rows and still belongs to this match, the export after the slot clears rewrites the file. A missing file is written. A file whose record count matches `match_records` is left as it is. More rows, or a file that cannot be read, replace it. Before a write, the latest frame is replaced with a fresh snapshot when that frame is still the current step (`refreshCurrentFramePayload`). On Windows the existing file is deleted before the new file is renamed into place. A failure is logged with the directory only.

Starting a new match, when the open match is already over, exports first with that flag false, including one whose consult has not been pushed yet, because the reset deletes `match_records`. Loading a save does the same before the open database is replaced. A match that is still running is not exported, and New Game deletes its history. A deferred consult that is skipped or abandoned clears its slot and then tries the same export, so a finished match still gets a file when that consult will not add rows.

The file is JSON lines, gzip-compressed. The format name is `agent-wars-recording` (`RECORDING_FILE_FORMAT`) and the layout version is `RECORDING_FILE_FORMAT_VERSION` (1). Three line kinds:

| `line` | What it holds |
| --- | --- |
| `header` | `format`, `formatVersion`, `appVersion`, `matchId`, `exportedAt`. |
| `static` | The `hexes` table, once. |
| `record` | One `match_records` row, in `record_id` order, with the payload decoded. |

A file whose `formatVersion` is newer than this build is refused: "This recording was written by a newer Agent Wars." Each payload has its own format version (`MATCH_FRAME_FORMAT_VERSION` for a frame, `MATCH_EVENT_FORMAT_VERSIONS` for an event). Raising a payload version does not raise the file layout version. An old fixture stays in `src/main/fixtures` and keeps parsing.

`npm run recording:summary -- <path>` prints the totals of one file (`recordingSummaryCli.ts`). It does not open the match database. Build the main process first. With no path, or a file that cannot be read, it prints one sentence on stderr and exits with code 1. The totals are the frame count, the event count, the last turn, the JSON size of the frame payloads, and one consult row per seat and stage. A missing or non-numeric consult field counts as zero. Costs print with four decimals. The table ends with a Total row.

## What is derived, not stored

A frame is the tables. These are not their own events, because a later reader gets them by comparing frames or by reading the resolution payload: captures, production, treasury, knockouts, and the start and end of a battle.
