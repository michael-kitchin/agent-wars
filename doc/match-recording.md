# Match recording

How one match keeps a history, and how that history becomes a file when the match ends.

The engine is the authority. The symbols named below are the ones to check when this page and the code disagree.

## What is recorded

History lives in `match_records`, in the open match database. `ensureMatchRecordsTable` creates the table on open, the same way `ensurePendingAirDropOrdersTable` does. `EXPECTED_USER_VERSION` stays 26, and the table is not in `GAME_DB_REQUIRED_TABLES`. An older file at version 26 gains the table when it is opened. A save copies the table with the rest of the match. See [save-files.md](save-files.md).

A frame is a snapshot of the match tables at one step. An event is one thing that happened at that step and cannot be recovered by comparing frames. Each row stores `record_id`, `kind` (`frame` or `event`), `record_type`, `format_version`, `step_key`, `scope` (`strategic` or `tactical`), `turn_number`, `battle_id` (empty outside a battle), `beat_number` (0 outside a battle), `visibility`, `display_text`, `recorded_at`, and a `payload`. The payload is zlib-compressed JSON. A frame's `record_type` is `state` (`MATCH_FRAME_RECORD_TYPE`) at format version `MATCH_FRAME_FORMAT_VERSION` (1). This build writes fourteen event types, each at format version 1 except `stance_declared`, which is at 2 (`MATCH_EVENT_FORMAT_VERSIONS`):

| `record_type` | When it is written |
| --- | --- |
| `match_started` | Written on the first step boundary of a match, including when another row was stored first. The payload has `appVersion`, `matchId`, and `firstRecordedTurn`. |
| `orders_committed` | Strategic orders that were about to resolve. One event for the human seat when any of the six pending order tables has a row, and one event for each owner in the orders gathered for Ready. The human seat is not in that gathered set. |
| `strategic_resolution` | A finished Ready, or a finished melee resolve. The payload is the resolution result. |
| `tactical_orders_committed` | The drafts of one tactical beat, immediately after a successful commit. |
| `tactical_resolution` | The playback of that beat, in the same call. |
| `consultation` | One model consult, from the summary already written to the consult log. `stage` is `orders` or `talk`. A consult that finishes after New or Load has replaced the database is not stored on the replacement, including when the loaded file still has this match's id. Creating the match id during the consult does not drop it, and stopping the model does not drop it. |
| `commander_strategy` | The strategy line of that consult, when the line is not blank. The same New or Load rule as `consultation` applies. `display_text` is the line. |
| `match_ended` | The match is over. The payload has `winner` and `reason` as stored, including an empty `winner` for a tie. |
| `message_sent` | A side message was sent. The payload has `messageId`, `fromSeatId`, `toSeatId`, and `text`. Visibility is the sender and the recipient. `display_text` is the text. |
| `stance_declared` | A commander changed its private stance or the reason for it. The payload (format version 2) has `seatId`, `towardSeatId`, `stance`, `reason`, `trust`, `threat`, and `previousStance`. `trust` and `threat` are each null when the commander did not report them. A change to the trust or the threat alone is also an event. Visibility is that commander. |
| `side_statistics` | Every side's numbers at one strategic step, written directly after that step's frame. The payload is `TurnStatistics` (`src/shared/matchStatistics.ts`): per seat the built units, mercenaries, hexes, production per turn, stored points, treasury, upkeep, units lost, and model cost, every stored stance row as a relationship report, and the hexes taken. `unitsLost` and `hexesTaken` are differences from the previous turn, which `src/main/matchStatistics/turnDifferences.ts` keeps in memory, so both are null for the first turn after a load and after a gap. A loss resolved in turn N is in `unitsLost` of turn N+1's event, while its `losses_attributed` event is at strategic step N. A turn with a battle has a second strategic frame and so a second event. Readers use the last one for each turn. A tactical step writes none. Visibility is `engine`, because the event holds every side's numbers without fog and every commander's private scores. |
| `losses_attributed` | Every owner's losses from one loss capture, with who was responsible for each unit. The payload is `AttributedLossesRecord` (`src/shared/lossHistory.ts`): a `source` and `byOwner`, the six cause buckets for each victim owner as `attributeTurnLosses` returns them, the human seat and Neutral included. Each lost unit keeps its attribution (`ownerId`, `lossH3Index`, `responsibleOwnerIds`, `killerUnits`) as the commanders' loss notes store it. There are three sources. `strategicTurn` is written by `captureStrategicTurnLossNote` at the strategic step of the turn that resolved. `tacticalBeat` is written by `captureTacticalBeatLossNote` at the tactical step of the beat that resolved (`tacticalTurnNumber - 1`, at least 1). `battleParents` is written by `writeBattleParentLossNotes` when a battle deletes strategic parents, at the tactical step of the beat in progress, once per call with the units that call added, each in its owner's `other` bucket. The first two are written once per capture, before the per-seat note loop, so a match with no active AI seat still records them. Nothing is written when no owner lost a unit. The event ignores fog of war, so its visibility is `engine`. |
| `view_snapshot` | The `GameStateSnapshot` the screen is given, written directly after each frame by `recordReplayViewsIfNeeded` (`src/main/replay/replayRecording.ts`). The payload is `{ view, seatId, snapshot }`. The `all` view (`seatId` null, visibility `engine`) is always written. The `player` view (visibility `seats:` plus the human seat) is written while a human seat is still in the match. A stored snapshot has no `hexes` list. It has `hexWeather` in its place, one `[h3Index, weather]` pair for each hex that had a `weather` field, because weather changes during a match and every other hex field is fixed. The `all` view also leaves out `visibleHexes`, `exploredHexes`, and `staleHexes`, which the reader rebuilds with `withEveryHexVisible`. |
| `resolution_view` | The result the renderer received for one resolution, written inside the handler's work so the automatic save and the export include it. The payload is `{ kind, result }`, where `kind` is `strategic` or `tactical` and `result` is the Ready result, the melee-intercept resolve result, or the tactical commit result as the handler had it when it recorded the resolution. Visibility is `engine`. |

`view_snapshot` and `resolution_view` exist so a past turn can be shown again exactly as it was. Replay hands back the stored pictures and recomputes nothing, so it cannot drift from what the player saw. A match that began in an earlier build can be replayed from the first turn recorded by this build.

Human strategic orders are copied from `pending_orders`, `pending_ranged_orders`, `pending_air_orders`, `pending_missile_launches`, `pending_ferry_orders`, and `pending_air_drop_orders` before resolution clears them. The human seat writes no event when those tables are empty. An AI owner writes one event for each set of orders it returned, even an empty one.

`match_id` in `game_config` (`MATCH_ID_CONFIG_KEY`) names the match. `ensureMatchId` writes one when the row is missing. `resetGameForNewMatch` deletes `match_records` and stores a new id.

## When a frame is written

`recordStepBoundary` writes a frame when the step key changes. The step key is `s{turn}` on the world map and `s{turn}-b{battleId}-t{beat}` inside a battle (`stepKeyText`). The frame is the database at that moment. A consult that runs after the frame, and any later write that stays on the same step, shows up in the next frame.

`withAutoSaveAfter` calls the boundary before the handler and again after it, and then writes the automatic save. The before call is what records a match that was loaded or resumed, at the turn it already holds. That first boundary writes `match_started` even if another row was stored first. Opening the app does not write a history row by itself. The first wrapped action does.

Ready records the human order tables and the step before resolution, writes `orders_committed` after resolution succeeds (including a turn that then waits on a melee decision), and writes `strategic_resolution` and the next step's frame only when the turn finished. Melee resolve writes `strategic_resolution` and the next frame, and does not write another orders event. A tactical commit records the beat's step before the commit, then the two tactical events after a successful commit that has playback.

When `game_over` is `1` and `match_ended` is missing, the boundary writes one frame for the current step if that call did not already write one, then writes `match_ended`. A second call for the same ended step writes nothing.

`AGENT_WARS_DISABLE_RECORDER` turns the recorder off when the flag is `1`, `true`, `yes`, or `on`. Nothing is written while it is on.

## Which tables a frame includes

`MATCH_TABLE_RECORDING_POLICY` in `src/main/recorder/matchFramePolicy.ts` classifies every match table. A frame copies each table whose mode is `frame`. Four tables are excluded:

| Table | Reason |
| --- | --- |
| `hexes` | Terrain does not change during a match. The recording file writes it once. |
| `turn_notes_history` | A growing log. Strategies are commander_strategy events, and losses with who was responsible are losses_attributed events. |
| `match_records` | The history itself. |
| `side_messages` | A growing log. Each sent message is a `message_sent` event. `side_stances` is a frame table. |

A new table has to be added to `MATCH_TABLE_RECORDING_POLICY` in the same change, as a frame table or with an exclusion reason. `matchFramePolicy.test.ts` fails when `sqlite_master` and the policy disagree.

`FRAME_EXCLUDED_CONFIG_KEYS` is every `MACHINE_LOCAL_CONFIG_KEYS` entry plus `SAVE_APP_VERSION_CONFIG_KEY` and `SAVE_WRITTEN_AT_CONFIG_KEY`. Those `game_config` rows are never in a frame and never in a recording file. A new machine-local key has to be added to `MACHINE_LOCAL_CONFIG_KEYS` in the same change.

## Who may be shown a row

The `visibility` column is `everyone`, `engine`, or `seats:` plus seat ids. `match_started` and `match_ended` are `everyone`. Frames, statistics, attributed losses, resolutions, both tactical events, the all-sides `view_snapshot`, `resolution_view`, and a consult with no seat are `engine`. The player's `view_snapshot` is `seats:` plus the human seat id. A strategic orders event, a strategy, and a consult that names a seat are `seats:` plus that owner's id. Text that is not one of those forms, including an empty seat list, reads back as `engine` (`parseVisibilityText`).

## The recording file

A finished match cannot be saved (`SAVE_GAME_OVER_MESSAGE`). The portable copy is a gzip file under `userData/recordings`, named `recording-{matchId}-{playthroughId}.agentwars-recording` (`recordingFileName`, `RECORDING_FILE_EXTENSION`). Characters in the id outside letters, digits, and hyphen become hyphens.

`playthrough_id` in `game_config` (`PLAYTHROUGH_ID_CONFIG_KEY`) names one run of the match. A new match stores a new id (`resetGameForNewMatch`), and so does loading a save (`storeNewPlaythroughId`). Relaunching the app keeps the id. A match played to an ending twice from one save therefore leaves two files, and each holds the whole history from the match start.

`exportFinishedMatchRecordingIfNeeded` writes the file when the recorder is on, the database is open, `game_over` is `1`, and a `match_ended` row exists. It does nothing while `deferredConsultPending` is true. `withAutoSaveAfter` passes that flag from the deferred-consult slot, after the automatic save, so a playback consult that can still add rows holds the file. Ending the match passes the pending flag too (`hasDeferredPlaybackConsultPending`), so a consult that is still running holds the file. The export after the slot clears writes it. A missing file is written. A file whose record count and last record id both match `match_records` is left as it is. Any other file, or one that cannot be read, is replaced. Before a write, the latest frame is replaced with a fresh snapshot when that frame is still the current step (`refreshCurrentFramePayload`). The new file is written to a temporary name and renamed over the old one. A failed rename leaves the old file. A failure is logged with the directory only. A failed read of the step or the human orders is logged and writes nothing for that step.

Starting a new match, when the open match is already over, exports first with that flag false, including one whose consult has not been pushed yet, because the reset deletes `match_records`. Loading a save does the same before the open database is replaced. A match that is still running is not exported, and New Game deletes its history. A deferred consult that is skipped or abandoned clears its slot and then tries the same export, so a finished match still gets a file when that consult will not add rows.

The file is JSON lines, gzip-compressed. The format name is `agent-wars-recording` (`RECORDING_FILE_FORMAT`) and the layout version is `RECORDING_FILE_FORMAT_VERSION` (1). Three line kinds:

| `line` | What it holds |
| --- | --- |
| `header` | `format`, `formatVersion`, `appVersion`, `matchId`, `playthroughId`, `exportedAt`. A file written before `playthroughId` existed reads that field as empty. |
| `static` | The `hexes` table, once. |
| `record` | One `match_records` row, in `record_id` order, with the payload decoded. |

The file is written and read one line at a time (`writeMatchRecordingFile`, `readRecordingFile`). No single string holds the whole file, because a long match with view snapshots decodes to more than the longest string V8 allows.

A file whose `formatVersion` is newer than this build is refused: "This recording was written by a newer Agent Wars." Each payload has its own format version (`MATCH_FRAME_FORMAT_VERSION` for a frame, `MATCH_EVENT_FORMAT_VERSIONS` for an event). Raising a payload version does not raise the file layout version. Raise a payload's version when a field is renamed, removed, or changes meaning. Adding a field does not need one. When you raise it, keep a recording file written at the old version in `src/main/fixtures`, and keep a test that parses it. An old fixture stays in `src/main/fixtures` and keeps parsing.

`npm run recording:summary -- <path>` prints the totals of one file (`recordingSummaryCli.ts`). It does not open the match database. Build the main process first. With no path, or a file that cannot be read, it prints one sentence on stderr and exits with code 1. The totals are the frame count, the event count, the last turn, the elapsed time from the first record to the last, that time divided by the last turn, the summed consult wall-clock time divided by the last turn, the recording file's size in bytes, the JSON length of the frame payloads, in characters, one consult row per seat and stage, one subtotal row per stage, and a Total row. A missing or non-numeric consult field counts as zero. Costs print with four decimals. The elapsed time includes any time the app sat idle, so a pilot run should be played without pauses. The consult wall-clock total adds overlapping consults, so it is not elapsed time. Talk cost and orders cost are the `costUsd` sums on the stage rows. Subtracting one run's orders row from the other's stays a human step.

## What is derived, not stored

A frame is the tables. These are not their own events, because a later reader gets them by comparing frames or by reading the resolution payload: captures, production, treasury, knockouts, and the start and end of a battle. A unit's disappearance is found by comparing frames. Who destroyed it is the `losses_attributed` event. Per-turn counts read from the live match at each strategic step, such as upkeep and production capacity, are the `side_statistics` event, described in [match-statistics.md](match-statistics.md). Upkeep comes from `readMercenaryFunds`. Production capacity is a SQL sum in `sideStatisticsRead.ts` that follows the top bar's rule.
