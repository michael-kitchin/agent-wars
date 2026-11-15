# Match Recorder Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Every match records its own history inside the match database: a full state frame at every step boundary, plus typed events for the things a frame comparison cannot reveal (orders, resolutions, model consultations, strategies). A finished match exports that history to a standalone file. There is no new screen.

**Shape:** Phase 0 records a baseline. Phases 1 through 8 each add one piece that can be verified on its own or with earlier phases. Phase 9 runs the final verification, the doc check, and hands the user a short manual checklist.

**Tech:** TypeScript (Electron main, sandboxed preload, esbuild-bundled renderer), `better-sqlite3`, `node:zlib`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Order:** This is the first of three plans. `2026-11-14-dispatches-0-meta-plan.md` explains the order. The two later plans depend on the table and the functions this plan adds.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names (record that file in the Completion Log).
- Find code by the quoted text, not by a line number. Line numbers in this plan are approximate.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log.
- **Tests come first.** Write a new module's test with the module, and run it before any existing code calls the module. A phase that hooks existing code runs the existing tests before and after the hook.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/main/gameDb/schema.ts', 'src/main/gameDb.ts')
$backup = Join-Path $env:TEMP "aw-match-recorder\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
# Then delete every file the phase added (its "Add" list).
```

---

## Verification Bar

Every phase ends with all three commands, run from the repo root:

```powershell
npm test
npm run build:renderer
npm run check:circular
```

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes. New `*.test.ts` files under `src/main` or `src/shared` are discovered automatically. Tests under `src/renderer` are **not** run.
- `npm run check:circular` passes when it prints **exactly** the cycles recorded in Phase 0 and no others. A new cycle fails the phase. Type-only imports are erased and cannot cause a cycle.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- **Quick loop while you work:** `npm run build:main`, then `node dist/main/<path>.test.js` (or `dist/shared/...`). This is a shortcut only. The full bar decides pass or fail.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file. This is an environment problem, not a phase failure.

---

## Non-Goals

- No timeline, slider, replay mode, chart, or any other screen. No renderer file changes in this plan.
- No change to gameplay, combat, AI prompts, IPC payloads, or the order of anything a turn does.
- No message or stance events. The next plan adds them as new event types.
- No recording of the turn-update text the player reads. The renderer composes that text, and the main process never sees it. It can be rebuilt from a `strategic_resolution` event with the builders in `src/shared`.
- No change to `EXPECTED_USER_VERSION`. The new table is created on open when it is missing, the way `pending_air_drop_orders` is, so the match on disk and every existing save keep loading.
- No change to `README.md`. The user writes that file.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new function, constant, type, interface, and field needs a JSDoc block with a one-line summary, then `Purpose:` (or `Contract:` for types and interfaces), `When to use:`, `Expected outcome:`, and `Exceptions:`. Lint rule `orienting-comments/require-orienting-block` fails the build without one. Many existing blocks are generic filler ("Supports maintainability by documenting why…"). **Do not copy that filler.** Write what the code does, when to call it, what it returns, and what it throws.
- **Logging in `src/main`.** A new **exported** function that changes state logs `logDebug` on entry. A new exported getter or pure builder logs `logTrace`. Log context carries ids, keys, and counts only. Never log an API key, a `game_config` value, a payload body, or a prompt body. New **private** helpers add no log lines.
- **No logging in `src/shared` or `src/renderer`.** Shared code must not import `logger.ts`.
- **Names.** camelCase files, directories, and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`: the only role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`, each with the meaning that document gives it, and `Utils`, `Impl`, `Manager`, `Service`, `Processor`, and `Controller` are banned. Use the file names this plan gives. `npm test` runs `naming:check`. Names from this plan (phase numbers, plan file names) must never appear in code, comments, test names, or `doc/`.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, and the guards in `src/shared/seatIds.ts`, never string literals. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. Functions take 6 or fewer named parameters. Use a parameter object for more.
- **`readonly`.** Mark parameter arrays and object fields `readonly` where they are not reassigned. Use `const` unless a value is reassigned.
- **Tests.** Test happy paths and essential failures only. A new test file copies the imports and structure of the nearest sibling test file. A `function` declaration in a test file needs the same orienting block as production code.
- **Secrets.** `game_config` holds API keys. Nothing this plan writes, to the database or to a file, may contain a row listed in `MACHINE_LOCAL_CONFIG_KEYS`. A test that needs a stand-in for a key uses an obviously fake value such as `SENTINEL-NOT-A-KEY`, with a comment beside it saying it is a test value.
- **Docs.** `AGENTS.md` requires `doc/` to change in the same change as the code. Each phase names the documents it touches. Your final message names every document you updated.
- **Large files.** `src/main/main.ts`, `src/main/openRouter/requestOrdersFlow.ts`, and `src/main/gameIpcHandlers.ts` are already past the 600-line target. This plan adds only a few call lines to each and puts all logic in new files. None may pass 1000 lines.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **Record, never recompute.** Combat rolls and model output are not repeatable, so history is stored, not re-derived by running the engine again.
2. **One table.** `match_records` holds frames and events. Payloads are versioned JSON. The table lives in the match database, so saves and automatic saves carry it.
3. **Frames are full snapshots,** written at every step boundary: each strategic turn start and each tactical beat start, plus the state after a battle ends and the final state of a finished match. Frames are not deltas.
4. **Static data is not in frames.** The `hexes` table never changes during a match. The export writes it once.
5. **Derive changes, record causes.** Captures, completed production, treasury changes, knockouts, and battle starts and ends are found by comparing consecutive frames. Events exist only for orders, resolutions, consultations, strategies, the match start, and the match end.
6. **Charts come from extractors over this data, later.** This plan stores no precomputed metric.
7. **Every match table is classified.** A test fails when a table is neither recorded in frames nor excluded with a reason.
8. **Consult telemetry is persisted.** The existing `consult telemetry` log line stays as it is.

### How "same transaction" is met

The user asked for each record to be written in the same transaction as the state change it describes. Turn resolution is not one database transaction today, and three places inside it open their own (`dismissMercenary.ts`, `knockoutConsequences.ts`, `mercenaryTurnStep.ts`), so wrapping resolution in an outer transaction would make those fail. This plan therefore uses these rules, which give the same guarantee the user wanted (history cannot silently diverge from state):

- **The recorder never opens a transaction.** Each record is exactly one `INSERT`. When the caller is inside a transaction, the record joins it. When it is not, the insert is atomic on its own.
- **A record is written in the same synchronous call sequence as its state change,** with no `await` between them. The database driver is synchronous and the app has one connection, so nothing else can run in between.
- **Frames heal themselves.** A frame is a snapshot of whatever the state is. `recordStepBoundary` writes one whenever the current step differs from the last recorded frame's step. `withAutoSaveAfter` calls it before `work` as well as after, so a loaded or resumed match is snapshotted before the next mutation. Launching the app writes no rows by itself.
- **A normal frame stays the boundary snapshot.** It is taken when the step key changes, before the post-resolution consult. Consult events are written after that frame. Later same-step table writes show up in the next frame. A save made after the consult holds that older frame and the newer tables.
- **The ended match is the exception.** There is no next frame, and a finished match cannot be saved. Before the recording file is written, the latest frame's payload is replaced in place when that frame's step is still current, so the file matches the ended database. The file is rewritten when `match_records` has grown. That replacement is the only `UPDATE` this plan adds. It is one statement. It is not a transaction.

Do not add `BEGIN`, `COMMIT`, or `SAVEPOINT` anywhere in this plan.

---

## Design

### Step keys

A step is one strategic turn or one tactical beat. `turnStartKey` in `src/main/saveGame/autoSave.ts` already names one: `s{turn}` or `s{turn}-b{battleId}-t{tacticalTurn}`. This plan moves that format into shared code and uses it everywhere.

```ts
// src/shared/matchRecording.ts
export interface StepKey {
  readonly scope: 'strategic' | 'tactical';
  readonly turnNumber: number;      // strategic turn
  readonly battleId: string;        // '' when scope is 'strategic'
  readonly beatNumber: number;      // tactical turn number; 0 when scope is 'strategic'
}
export function stepKeyText(step: StepKey): string   // 's12' or 's12-bB7-t3'
export function strategicStep(turnNumber: number): StepKey
export function tacticalStep(turnNumber: number, battleId: string, beatNumber: number): StepKey
```

### The table

```sql
CREATE TABLE IF NOT EXISTS match_records (
  record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('frame', 'event')),
  record_type TEXT NOT NULL,
  format_version INTEGER NOT NULL CHECK (format_version >= 1),
  step_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('strategic', 'tactical')),
  turn_number INTEGER NOT NULL,
  battle_id TEXT NOT NULL DEFAULT '',
  beat_number INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL,
  display_text TEXT,
  recorded_at TEXT NOT NULL,
  payload BLOB NOT NULL
);
```

- `record_id` is the order of history. Readers sort by it and by nothing else.
- `record_type` is `state` for a frame, and one of the event types below for an event.
- `visibility` is `everyone`, `engine`, or `seats:` followed by seat ids joined with commas (for example `seats:human,opponent2`). `engine` means the unfiltered truth that no player was shown as such.
- `display_text` is the exact text shown to a player at the time, when the main process has it. Otherwise null.
- `payload` is the UTF-8 JSON text of the payload, compressed with `zlib.deflateSync`. Every record uses the same encoding.

### Event types in this plan

| `record_type` | Written when | Step | Visibility | Payload |
| --- | --- | --- | --- | --- |
| `match_started` | The first boundary call of a match, before the first frame | current | `everyone` | `appVersion`, `matchId`, `firstRecordedTurn` |
| `orders_committed` | Ready, just before resolution. One event per owner | the turn being resolved | `seats:{owner}` | That owner's orders |
| `strategic_resolution` | Resolution succeeded | the turn that was resolved | `engine` | The playback fields the renderer receives |
| `tactical_orders_committed` | A beat commit succeeded | the beat that was resolved | `engine` | The committed drafts |
| `tactical_resolution` | A beat commit succeeded | the beat that was resolved | `engine` | The beat's playback |
| `consultation` | One model consult ended, however it ended | the consult's turn or beat | `seats:{seat}` | `stage: 'orders'` and the telemetry summary |
| `commander_strategy` | A consult succeeded and gave a strategy line | the consult's turn or beat | `seats:{seat}` | `seatId`, `strategy`. `display_text` is the strategy |
| `match_ended` | The first boundary call after `game_over` is set | current | `everyone` | `winner`, `reason` |

Every event type has its own format version in `MATCH_EVENT_FORMAT_VERSIONS`. All start at 1. `MATCH_FRAME_FORMAT_VERSION` starts at 1.

### Frame payload

```json
{ "tables": { "units": { "columns": ["id", "player", "..."], "rows": [["h1-inf-1", "human", "..."]] } } }
```

One entry per table whose policy is `frame`. Columns come from `PRAGMA table_info`, in that order. Rows are in `rowid` order. `game_config` is one of the tables, without the excluded keys.

### Module map

All new main-process code is under `src/main/recorder/`. Shared types and pure helpers are in `src/shared/matchRecording.ts`.

| File | Holds |
| --- | --- |
| `src/shared/matchRecording.ts` | `StepKey`, key text, visibility type and its text form, event type list, format versions |
| `src/main/recorder/matchRecordCodec.ts` | Payload encode and decode |
| `src/main/recorder/matchRecordStore.ts` | Insert and read rows. Throws on failure |
| `src/main/recorder/matchFramePolicy.ts` | The table policy and the excluded config keys |
| `src/main/recorder/matchFrameCapture.ts` | Builds a frame payload |
| `src/main/recorder/matchRecorder.ts` | The safe public API: never throws into gameplay |
| `src/main/recorder/recorderStepKey.ts` | Reads the current step from the open match |
| `src/main/recorder/matchRecordingEvents.ts` | One small function per event type |
| `src/main/recorder/matchRecordingFile.ts` | Parses a recording file. No database import |
| `src/main/recorder/matchRecordingExport.ts` | Writes a recording file |
| `src/main/recorder/matchRecordingSummary.ts` | Totals for a parsed recording. No database import |
| `src/main/recorder/recordingSummaryCli.ts` | Command-line entry for the summary |

**Import rule, to keep `check:circular` clean:** files in `src/main/recorder/` may import from `src/shared/`, `../logger`, and leaf files under `../gameDb/`. Database access is `gameDbOps` and `hasDbHandle` from `../gameDb/dbConnection`. `matchFramePolicy.ts` may also import the two key constants from `../saveGame/saveFileFormat`, and `matchRecorder.ts` may import `../envFlag`. **Never import the barrel file `src/main/gameDb.ts` from the recorder:** it imports `gameActions`, and the recorder is called from there. Only `recorderStepKey.ts` may import from `../tacticalBattle/`. Nothing in `src/main/recorder/` imports from `../openRouter/`, `../ipc/`, or `../gameActions/`, except with `import type`. `matchRecordingFile.ts`, `matchRecordingSummary.ts`, and `recordingSummaryCli.ts` import nothing that loads `better-sqlite3`.

---

## Phase 0 — Baseline

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory. Uncommitted work already in the tree is the baseline. Edit on top of it and never revert it.
2. Run the Verification Bar. Record pass or fail for each command, and the exact cycle list `check:circular` prints.
3. Confirm these exist, and record any that do not: `src/main/gameDb/schema.ts` (`getFullDdl`), `src/main/gameDb.ts` (`EXPECTED_USER_VERSION`), `src/main/gameDb/dbConnection.ts` (`gameDbOps`, `hasDbHandle`), `src/main/gameDb/resetGame.ts` (`resetGameForNewMatch`), `src/main/gameDb/machineLocalConfigKeys.ts` (`MACHINE_LOCAL_CONFIG_KEYS`), `src/main/saveGame/autoSave.ts` (`turnStartKey`), `src/main/ipc/saveLoadIpcHandler.ts` (`withAutoSaveAfter`), `src/main/gameIpcHandlers.ts` (`handleGameReady`), `src/main/ipc/meleeInterceptResolveIpc.ts` (`handleResolveMeleeIntercept`), `src/main/openRouter/requestOrdersFlow.ts` (`logConsultTelemetrySummary(telemetry.summary())`), `src/main/openRouter/requestOrdersConsultationMarks.ts` (`markSuccessfulConsultation`), `src/main/ipc/endMatchIpcHandler.ts` (`registerEndMatchIpcHandler`).
4. Record the value of `EXPECTED_USER_VERSION`. This plan does not change it.
5. Read `ensurePendingAirDropOrdersTable` in `src/main/gameDb/pendingAirDropOrders.ts` and its three call sites in `src/main/gameDb.ts` (`createFreshGameDatabaseAt`, `openGameDatabaseAtPathForTests`, `openExistingGameDatabaseAt`). Phase 1 follows that pattern. Confirm that `replaceGameDatabaseWithStagedFile` in `src/main/gameDb/databaseReplace.ts` reopens through `openExistingGameDatabaseAt`, so a loaded save gets the table too. Record it if it does not.

**Stop if** the bar fails before any edit. Report it. Do not start Phase 1 on a failing baseline.

---

## Phase 1 — Table and Match Id

The table exists in a new database and in every database opened by this build, a new match clears it, and each match has an id. Nothing writes records yet.

**Add:** `src/main/gameDb/matchRecordsTable.ts`, `src/main/gameDb/matchRecordsTable.test.ts`
**Edit:** `src/main/gameDb/schema.ts`, `src/main/gameDb.ts`, `src/main/gameDb/resetGame.ts`, `src/main/gameDb/gameConfigKv.ts`, `doc/save-files.md`

### Steps

1. `matchRecordsTable.ts`: export `MATCH_RECORDS_TABLE_DDL`, the `CREATE TABLE IF NOT EXISTS match_records (...)` statement from the Design section as one string, and `ensureMatchRecordsTable(exec: (sql: string) => void): void`, which runs it. Model both on `pendingAirDropOrders.ts`.
2. `schema.ts`: add `${MATCH_RECORDS_TABLE_DDL};` to the end of the string `getFullDdl` returns, so the statement text exists once.
3. `gameDb.ts`: call `ensureMatchRecordsTable((sql) => gameDbOps.run(sql));` directly after each of the three `ensurePendingAirDropOrdersTable(...)` calls. Update the comment on `EXPECTED_USER_VERSION` so its list of exceptions names this function. **Do not change the number. Do not add the table to `GAME_DB_REQUIRED_TABLES`:** validation runs before the ensure call, so a required table would make every existing database fail validation and be replaced.
4. `gameConfigKv.ts`: add
   - `export const MATCH_ID_CONFIG_KEY = 'match_id';`
   - `export function readMatchId(ops: GameConfigKvDbOps): string | null`, which returns the stored value, or null when the row is missing or empty. It logs `logTrace` with `{ found }` only. Do not log the id.
   - `export function ensureMatchId(ops: GameConfigKvDbOps): string`, which returns the stored id, or writes and returns a new `randomUUID()` (from `node:crypto`) when there is none. Write it with `upsertGameConfigValue` from `gameConfigRows.ts`. `GameConfigKvDbOps` already has `run`. Do not widen it. Log `logDebug` with `{ created }` only. A match that began in an earlier build gets its id this way.
5. `resetGame.ts`, inside `resetGameForNewMatch`, between `run('BEGIN')` and `run('COMMIT')`:
   - Add `run('DELETE FROM match_records');` next to the other `DELETE FROM` lines.
   - Write a new match id: `upsertGameConfigValue({ run }, MATCH_ID_CONFIG_KEY, randomUUID());`.
6. `doc/save-files.md`, section "Version": add `ensureMatchRecordsTable` to the sentence that lists what is added on open, and one sentence: the match file includes `match_records`, the match's recorded history, and a save carries it. A save from an earlier build loads, and its recording starts at the turn it was loaded on. Add `match_id` to the paragraph that lists match rows that stay in the file.

### Tests

`matchRecordsTable.test.ts`, modelled on `src/main/fortificationSchema.test.ts`:

- A fresh match database has a `match_records` table with the thirteen columns above.
- Inserting a row with `kind = 'other'` fails the `CHECK`.
- After `DROP TABLE match_records`, `ensureMatchRecordsTable` creates it again, and a second call does nothing.
- After `resetGameForNewMatch`, `match_id` is a non-empty string. A second reset gives a different value and leaves `match_records` empty (insert one row by hand before the second reset).
- `ensureMatchId` returns the stored id when there is one, and writes one when the row is deleted.

### Verification

Run the Verification Bar. The existing save, load, and validation tests must pass without edits, because the version and the required-table list did not change. If one fails, a step above changed something it should not have.

---

## Phase 2 — Shared Types, Codec, and Store

Records can be written and read back. Nothing in the game calls this yet.

**Add:** `src/shared/matchRecording.ts`, `src/shared/matchRecording.test.ts`, `src/main/recorder/matchRecordCodec.ts`, `src/main/recorder/matchRecordStore.ts`, `src/main/recorder/matchRecordStore.test.ts`
**Edit:** `src/main/saveGame/autoSave.ts`

### Steps

1. `src/shared/matchRecording.ts` (no logging, no Node imports):
   - `StepKey`, `strategicStep`, `tacticalStep`, `stepKeyText` as in the Design section. `stepKeyText` must return exactly what `turnStartKey` returns today for the same inputs.
   - `export type RecordVisibility = 'everyone' | 'engine' | { readonly seats: readonly string[] };`
   - `visibilityText(visibility)` and `parseVisibilityText(text)`. Seat ids are written in the order given. `parseVisibilityText` returns `'engine'` for text it does not recognize, so an unknown value is never shown to a player by mistake.
   - `export const MATCH_FRAME_RECORD_TYPE = 'state';` and `export const MATCH_FRAME_FORMAT_VERSION = 1;`
   - `export const MATCH_EVENT_TYPES = ['match_started', 'orders_committed', 'strategic_resolution', 'tactical_orders_committed', 'tactical_resolution', 'consultation', 'commander_strategy', 'match_ended'] as const;` and `export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];`
   - `export const MATCH_EVENT_FORMAT_VERSIONS: Readonly<Record<MatchEventType, number>>`, every value 1.
   - `export interface MatchRecord` with camelCase fields for every column, `payload: unknown` (already decoded).
2. In `autoSave.ts`, make `turnStartKey` delegate: build a `StepKey` from its three arguments and return `stepKeyText(...)`. Keep its signature and its comment's meaning. Its existing tests must pass unchanged.
3. `matchRecordCodec.ts`:
   - `encodeRecordPayload(payload: unknown): Buffer` returns `deflateSync(Buffer.from(JSON.stringify(payload), 'utf8'))`. It throws a clear `Error` when `JSON.stringify` returns `undefined`.
   - `decodeRecordPayload(blob: Buffer | Uint8Array): unknown` reverses it.
4. `matchRecordStore.ts`, every function taking `ops: BasicDbOps` (from `../gameDb/dbOps`) as its first argument:
   - `insertMatchRecord(ops, record: NewMatchRecord): void`. `NewMatchRecord` has `kind`, `recordType`, `formatVersion`, `step: StepKey`, `visibility: RecordVisibility`, `displayText: string | null`, `recordedAt: string`, `payload: unknown`. One `INSERT`. Throws on failure.
   - `listMatchRecords(ops): MatchRecord[]`, in `record_id` order, payloads decoded.
   - `lastFrameStepKeyText(ops): string | null`, the `step_key` of the frame with the highest `record_id`.
   - `matchHasEventOfType(ops, recordType: MatchEventType): boolean`.
   - `countMatchRecords(ops): number`.

### Tests

- `matchRecording.test.ts`: `stepKeyText` for a strategic and a tactical step; `visibilityText` and `parseVisibilityText` round-trip all three forms; unknown text parses to `'engine'`; `MATCH_EVENT_FORMAT_VERSIONS` has a key for every entry of `MATCH_EVENT_TYPES`.
- `matchRecordStore.test.ts`, using `withTempGameDb` or `withSeatedTempGameDb` from `src/main/testSupport/` with `gameDbOps` from `src/main/gameDb/dbConnection.ts` as `ops`: insert one frame and two events, list them, and check order, decoded payloads (include a nested object and a non-ASCII string), `lastFrameStepKeyText`, `matchHasEventOfType`, and `countMatchRecords`.

### Verification

Run the Verification Bar. `autoSave.test.ts` must pass without edits.

---

## Phase 3 — Frame Capture and the Table Policy

A frame payload can be built from the open match, every table is classified, and no secret can reach a frame.

**Add:** `src/main/recorder/matchFramePolicy.ts`, `src/main/recorder/matchFrameCapture.ts`, `src/main/recorder/matchFramePolicy.test.ts`, `src/main/recorder/matchFrameCapture.test.ts`
**Edit:** nothing.

### Steps

1. `matchFramePolicy.ts`:

   ```ts
   export type TableRecordingPolicy =
     | { readonly mode: 'frame' }
     | { readonly mode: 'excluded'; readonly reason: string };

   export const MATCH_TABLE_RECORDING_POLICY: Readonly<Record<string, TableRecordingPolicy>> = { ... };
   ```

   Policy for every table `getFullDdl` creates:

   | Table | Mode | Reason when excluded |
   | --- | --- | --- |
   | `hexes` | excluded | Terrain never changes during a match. The export writes it once. |
   | `turn_notes_history` | excluded | A growing log. Strategies are `commander_strategy` events, and losses are found by comparing frames. |
   | `match_records` | excluded | The recording itself. |
   | every other table | frame | |

   Also export `FRAME_EXCLUDED_CONFIG_KEYS: readonly string[]`, which is every entry of `MACHINE_LOCAL_CONFIG_KEYS` plus `SAVE_APP_VERSION_CONFIG_KEY` and `SAVE_WRITTEN_AT_CONFIG_KEY` from `src/main/saveGame/saveFileFormat.ts`. Build it from those constants. Do not retype the key strings.

2. `matchFrameCapture.ts`:
   - `buildFramePayload(ops: BasicDbOps): FramePayload`. For each table whose mode is `frame`, in the order the policy lists them: read the column names with `PRAGMA table_info`, then `SELECT` those columns in that order, quoted, `ORDER BY rowid`. Store `{ columns, rows }` where each row is an array in column order. Table names come only from the policy object, never from input. Quote every identifier. Reject a name that is not a plain identifier.
   - For `game_config`, drop every row whose `key` is in `FRAME_EXCLUDED_CONFIG_KEYS`.
   - Logs `logTrace` with the table count and the total row count only.

### Tests

- `matchFramePolicy.test.ts` (**this is the test the user asked for**): open a temp match database, read every table name from `sqlite_master` where `type = 'table'` and the name does not start with `sqlite_`. Assert each has an entry in `MATCH_TABLE_RECORDING_POLICY`, with a message that names the missing table and says: "Add this table to MATCH_TABLE_RECORDING_POLICY as a frame table, or exclude it with a reason." Assert the reverse too: every policy key is a real table. Assert every excluded entry has a non-empty reason.
- `matchFrameCapture.test.ts`:
  - On a seated temp match, the payload has an entry for `units`, `seats`, `turn_state`, and `game_config`, and none for `hexes`. The `units` entry's row count equals `SELECT COUNT(*) FROM units`, and its `columns` start with `id`.
  - **Secrets:** write a sentinel value such as `SENTINEL-KEY-12345` into every key of `MACHINE_LOCAL_CONFIG_KEYS`, build the payload, and assert `JSON.stringify(payload)` does not contain the sentinel. Assert it does contain the value of a normal key written the same way (for example `match_id`).
  - **Speed:** building the payload on a fresh global match takes under 2000 ms, so a busy machine does not fail the phase. The results file records the measured time. A capture over about 100 ms, or a compressed frame much larger than about 150 KB, is reported for the user to judge. It does not fail the phase.

### Verification

Run the Verification Bar.

### If verification fails

- The policy test names a table this plan did not list: the tree has a table added since this plan was written. Classify it as `frame` unless it only ever grows, and record the choice in the Completion Log.

---

## Phase 4 — Step Boundaries

The game writes a `match_started` event, a frame at every step boundary, and a `match_ended` event with a final frame.

**Add:** `src/main/recorder/matchRecorder.ts`, `src/main/recorder/recorderStepKey.ts`, `src/main/recorder/matchRecorder.test.ts`, `src/main/envFlag.ts`, `src/main/envFlag.test.ts`
**Edit:** `src/main/ipc/saveLoadIpcHandler.ts`, `src/main/gameIpcHandlers.ts`, `src/main/gameIpcHandlers.test.ts`, `src/main/main.ts`, `src/main/openRouter/requestOrdersFlowSupport.ts`, `src/main/ipc/meleeInterceptResolveIpc.ts`, `src/main/ipc/endMatchIpcHandler.ts`, `src/main/ipc/deferredResolutionPlaybackConsult.ts`

### Steps

1. `recorderStepKey.ts`: `export function currentStepKey(): StepKey | null`. Read the turn with `readTurnStateRow(gameDbOps.getOne)` from `../gameDb/turnStateReads`. Read the battle with `getActiveTacticalBattleSnapshot()` from `../tacticalBattle/tacticalBattleSession`. Return `tacticalStep(turn, battle.battleId, battle.tacticalTurnNumber)` when a battle is open, `strategicStep(turn)` otherwise, and null when the database is not ready or there is no turn row. This mirrors `currentAutoSaveTurnKey` in `autoSave.ts`. Read that function first.

2. `matchRecorder.ts`. This file is the only door the rest of the game uses. **None of its exported functions may throw.** Each wraps its body in `try`/`catch`, calls `logError` with ids and counts only, and returns.

   ```ts
   export function isRecorderEnabled(): boolean
   // false when the AGENT_WARS_DISABLE_RECORDER environment variable is on; true otherwise. Uses isEnvFlagEnabled (below).

   export function recordMatchEvent(event: {
     readonly type: MatchEventType;
     readonly step: StepKey;
     readonly visibility: RecordVisibility;
     readonly payload: unknown;
     readonly displayText?: string | null;
   }): void
   // One insert. Uses MATCH_EVENT_FORMAT_VERSIONS[event.type]. Does nothing when the recorder is off or the database is not ready.

   export function recordStepBoundary(step: StepKey | null, appVersion: string): void
   ```

   `recordStepBoundary` does these in order, and returns early when the recorder is off, `step` is null, or the database is not ready:
   1. When `countMatchRecords` is 0: write `match_started` with `{ appVersion, matchId: ensureMatchId(...), firstRecordedTurn: step.turnNumber }`, visibility `everyone`. `firstRecordedTurn` is 1 for a match started in this build, and later for a match that began in an earlier build.
   2. When `stepKeyText(step)` differs from `lastFrameStepKeyText(...)`: write one frame (`kind: 'frame'`, `recordType: MATCH_FRAME_RECORD_TYPE`, `formatVersion: MATCH_FRAME_FORMAT_VERSION`, visibility `engine`, payload from `buildFramePayload`). Remember that this call inserted that frame.
   3. When `game_config` has `game_over` equal to `'1'` and `matchHasEventOfType(..., 'match_ended')` is false: if step 2 did not insert a frame, insert one frame of the current database; then write `match_ended` with `{ winner, reason }`. Do not insert a second frame when step 2 already wrote one. `winner` is the stored string, or null when the row is missing. An empty string stays empty, because a tie is stored that way. `reason` is the stored `game_end_reason`, or null when the row is missing. Visibility is `everyone`.

   The clock is a module-level `let nowIso: () => string = () => new Date().toISOString();` with `setRecorderClockForTests(fn | null)`. Use `gameDbOps` and `hasDbHandle()` from `../gameDb/dbConnection`. "Database is not ready" means `hasDbHandle()` is false.

   **Environment flag.** `isEnvFlagEnabled` in `src/main/openRouter/requestOrdersFlowSupport.ts` already parses an `AGENT_WARS_*` on/off flag, and its comment says every main-process flag should use it. The recorder may not import from `openRouter/`, so move that one function, with its comment, into a new `src/main/envFlag.ts`, keeping its name and behavior. There is no test of it today. Add `src/main/envFlag.test.ts`. In `requestOrdersFlowSupport.ts`, import it and re-export it (`import { isEnvFlagEnabled } from '../envFlag'; export { isEnvFlagEnabled };`) so this file can still call it and `openRouterModelCapabilities.ts` needs no change. A bare `export { isEnvFlagEnabled } from '../envFlag'` does not create a local binding. Change the function's log label to `envFlag isEnvFlagEnabled`. No test asserts the old label.

3. Hook the boundary. The call is `recordStepBoundary(currentStepKey(), app.getVersion())`. It is cheap when nothing changed: one count and one key read.
   - `saveLoadIpcHandler.ts`, in `withAutoSaveAfter`: call it **before** `await work()` and **after** `work()`, and keep the after call **before** `maybeWriteTurnStartAutoSave(...)`. The before call records a loaded or resumed match at the turn that is about to change. The after call records the new step when the handler did not already record it. Update the function's comment to say it records the step before the work, records it again after, and then saves. This covers new game, Ready, melee resolution, a tactical commit, a battle start, and a battle end.
   - `gameIpcHandlers.ts` has no `app` import. Add an `appVersion: string` field to `ReadyDeps`, and set it in `buildSharedHumanReadyConsultationDeps` in `src/main/main.ts` from `app.getVersion()`. The deps objects in `src/main/gameIpcHandlers.test.ts` get `appVersion: 'test'`. `ResolveMeleeInterceptDeps` is `Omit<ReadyDeps, 'ready'>`, so this one field covers that handler. Do not add a second field.
   - `endMatchIpcHandler.ts`: after `endMatchByHuman(state.turnNumber)` succeeds, call the boundary. This writes the final frame and `match_ended`. Read the app version from `app` inside the registrar, the way `saveLoadIpcHandler.ts` does.
   - Do not call the boundary from `deferredResolutionPlaybackConsult.ts`. That consult does not change the step. Phase 7 exports from the end of that handler instead.

### Tests

`matchRecorder.test.ts`, on a seated temp match, with the recorder clock fixed:

- First call: one `match_started` event, then one frame with `step_key` `s1`. A second call with the same step writes nothing.
- After `UPDATE turn_state SET turn_number = 2`, a call with `strategicStep(2)` writes a second frame.
- A call with `tacticalStep(2, 'b1', 1)`, then `strategicStep(2)` again, writes two more frames (the state after a battle is its own frame).
- After setting `game_over` to `'1'` on the step that already has a frame (use `setGameOutcomeWithOps` from `gameConfigKv.ts`), one call writes one final frame and one `match_ended` event. Another call writes nothing.
- A call that both enters a new step and finds `game_over` already set writes one frame for the new step and one `match_ended`, not two frames.
- With `process.env.AGENT_WARS_DISABLE_RECORDER = '1'`, nothing is written. Restore the variable in a `finally`.
- On a match whose turn is already 7 and whose `match_id` row was deleted, the first call, made before any turn advance, writes `match_started` with `firstRecordedTurn: 7` and a new id, then a frame with `step_key` `s7`.
- `recordMatchEvent` with a payload that cannot be encoded (a function as the whole payload) does not throw, and writes nothing.
- A null step writes nothing. A tie stores `winner` as `''`, not null.

### Verification

Run the Verification Bar. Then start the app (`npm start`), start a new match, play two turns, and quit. Open the match database copy from the newest file in `userData/autosaves` with any SQLite tool, or add a temporary `console.log(countMatchRecords(...))` that you remove before finishing, and confirm there is one `match_started` row and one frame per turn. Record what you saw in the Completion Log. If you cannot run the app, say so in the Completion Log. The user's manual checklist in Phase 9 covers it.

### If verification fails

- `check:circular` reports a cycle through `recorderStepKey`: something under `src/main/tacticalBattle/` imports a file that now imports the recorder. Move the `currentStepKey()` call up to the IPC-level caller and pass the `StepKey` down as an argument. Do not import `recorderStepKey` from any file outside `src/main/ipc/`, `src/main/main.ts`, and `src/main/gameIpcHandlers.ts`.
- An existing Ready test fails on a missing `appVersion`: add the field to that test's deps.

---

## Phase 5 — Order and Resolution Events

The orders each side gave and the result of each resolution are recorded.

**Add:** `src/main/recorder/matchRecordingEvents.ts`, `src/main/recorder/matchRecordingEvents.test.ts`
**Edit:** `src/main/gameIpcHandlers.ts`, `src/main/ipc/meleeInterceptResolveIpc.ts`, `src/main/main.ts`

### Steps

1. `matchRecordingEvents.ts`. Each function builds a payload and calls `recordMatchEvent`. None throws.

   ```ts
   export function recordStrategicOrders(args: {
     readonly step: StepKey;
     readonly humanOrderTables: FramePayload['tables'];       // the human's queued orders
     readonly ordersByOwner: ReadonlyMap<string, unknown>;    // TurnOrdersByOwner
   }): void
   // One 'orders_committed' event for the human seat with { owner, tables }, visibility seats of HUMAN_SEAT_ID,
   // written only when at least one of the tables has a row (an Observe match has no human orders).
   // One per entry of ordersByOwner with { owner, orders }, visibility seats of that owner id.
   // Production code uses HUMAN_SEAT_ID and the owner id from the map. It does not write a seat-id literal.

   export function recordStrategicResolution(step: StepKey, resolution: unknown): void   // 'strategic_resolution', engine
   export function recordTacticalBeat(args: {
     readonly step: StepKey;
     readonly orders: unknown;
     readonly playback: unknown;
   }): void
   // 'tactical_orders_committed' then 'tactical_resolution', both engine.
   ```

   Add `export function readHumanOrderTables(ops: BasicDbOps): FramePayload['tables']` to `matchFrameCapture.ts`. It reads these six tables with the same column-and-rows shape a frame uses: `pending_orders`, `pending_ranged_orders`, `pending_air_orders`, `pending_missile_launches`, `pending_ferry_orders`, `pending_air_drop_orders`. Reuse the private table reader `buildFramePayload` already has. Do not write a second one.

2. `gameIpcHandlers.ts`, `handleGameReady`:
   - Immediately before `const readyResult = deps.ready(ordersByOwner);`, capture `const resolvedStep = strategicStep(state.turnNumber);` and `const humanOrderTables = readHumanOrderTables(...)`. Use this captured step for the order and resolution events. Do not call `currentStepKey()` after `ready`, because the turn has already advanced. `state` is the snapshot read at the top of the function.
   - Immediately after the `if (!readyResult.success)` block: call `recordStrategicOrders({ step: resolvedStep, humanOrderTables, ordersByOwner })`. This runs for a turn that then waits on a melee decision as well, because the orders are final at that point.
   - On the melee-pause return, do not record a resolution and do not call the boundary.
   - Immediately after `const playbackMoves = buildReadyPlaybackMoves(readyResult);`, and before the consult block: call `recordStrategicResolution(resolvedStep, { ...pickReadyResolutionIpcMirrorFields(readyResult), aiMoves: playbackMoves.aiMoves, humanMoves: playbackMoves.humanMoves })`, then `recordStepBoundary(currentStepKey(), deps.appVersion)`. These are the fields the renderer plays back, so they are safe to store as JSON. The boundary writes the new turn's frame before the handler waits on a model. The after call in `withAutoSaveAfter` then sees the same step and writes nothing.
3. `meleeInterceptResolveIpc.ts`, `handleResolveMeleeIntercept`: capture `strategicStep(state.turnNumber)` from the `state` read near the top. After the resolve succeeds, build the playback fields with `buildReadyPlaybackMoves(resolveResult)` before the consult block. `buildReadyPlaybackMoves` is synchronous and does not depend on the consult. Call `recordStrategicResolution`, then `recordStepBoundary(currentStepKey(), deps.appVersion)`, then leave the consult block where it is. Do not record orders here. The first handler already did.
4. `main.ts`, the `IPC_GAME.commitHumanTacticalDraftOrders` handler: `const v = parsed.value` already exists. Before `const result = commitHumanTacticalDraftOrders({...})`, capture `const beatStep = currentStepKey();`. Immediately after that call, before the later `return` paths, when `result.success` is true and `beatStep` is not null and `result.tacticalResolutionPlayback` exists, call `recordTacticalBeat({ step: beatStep, orders: { movementOrders: v.movementOrders, rangedAttacks: v.rangedAttacks, airStrikes: v.airStrikes, airDropOrders: v.airDropOrders, ferryOrders: v.ferryOrders, embarkOrders: v.embarkOrders, opponentTacticalDraft: v.opponentTacticalDraft }, playback: result.tacticalResolutionPlayback })`. Those later returns still committed the beat. `main.ts` is 644 lines. Keep the added code to those few lines.
5. `main.ts`, the `IPC_GAME.newGame` handler: before `resetGameForNewMatch`, when `getGameState().gameOver` is true, export the open match. Pass the deferred-consult flag as false so the rows that exist are written before the reset deletes them. A consult still in flight is absent from that file. Do not block the new game.

### Tests

`matchRecordingEvents.test.ts`, on a seated temp match:

- `recordStrategicOrders` with a human table set that has one row and a map of two AI owners writes three `orders_committed` events, with visibilities `seats:human`, `seats:opponent`, and `seats:opponent2`. With empty human tables it writes two.
- `recordStrategicResolution` writes one `engine` event whose decoded payload equals the input.
- `recordTacticalBeat` writes the two tactical events in order, with the tactical step's `battle_id` and `beat_number` in their columns.
- `readHumanOrderTables` returns exactly the six tables, and a row inserted into `pending_orders` appears in it.

Add one case to the existing test file that covers `handleGameReady` (search `src/main` for `handleGameReady(` in `*.test.ts`). When such a test runs a successful Ready against a real temp database, assert that afterwards `match_records` has an `orders_committed` row and a `strategic_resolution` row with `turn_number` equal to the turn before Ready, and a frame whose `turn_number` is the turn after. When the existing tests only use fakes with no database, skip this case and say so in the Completion Log.

### Verification

Run the Verification Bar.

---

## Phase 6 — Consultation Telemetry and Strategy

Every model consult's telemetry summary is stored in the match database, and so is each strategy line.

**Add:** nothing.
**Edit:** `src/main/recorder/matchRecordingEvents.ts`, `src/main/recorder/matchRecordingEvents.test.ts`, `src/main/openRouter/requestOrdersFlow.ts`, `src/main/openRouter/requestOrdersConsultationMarks.ts`

### Steps

1. `matchRecordingEvents.ts`:

   ```ts
   export function recordConsultation(args: {
     readonly step: StepKey;
     readonly stage: 'orders';                       // the next plan adds 'talk'
     readonly summary: ConsultTelemetrySummary;      // import type only
   }): void
   // 'consultation', visibility seats:{summary.seatId}, or engine when seatId is null. Payload { stage, ...summary }.

   export function recordCommanderStrategy(args: {
     readonly step: StepKey;
     readonly seatId: string;
     readonly strategy: string;
   }): void
   // 'commander_strategy', visibility seats:{seatId}, displayText = strategy. Does nothing for an empty or whitespace strategy.

   export function stepForConsult(turnNumber: number, battle: { readonly battleId: string; readonly tacticalTurnNumber: number } | null | undefined): StepKey
   // tacticalStep when battle is given, strategicStep otherwise.
   ```

   `ConsultTelemetrySummary` comes from `../openRouter/consultTelemetrySummary` with **`import type`**. A value import would break the import rule.

2. `requestOrdersFlow.ts`: in the `finally` block that contains `logConsultTelemetrySummary(telemetry.summary());`, read the summary once into a `const`, pass it to the existing log call, and then call `recordConsultation({ step: stepForConsult(state.turnNumber, tacticalBattle), stage: 'orders', summary })`. `state` and `tacticalBattle` are already in scope there. The log line and its position do not change. This file is at 620 lines. Add only these lines. Do not edit the local `markSuccessfulConsultation` wrapper. It already forwards `seatId`, `turnNumber`, and `tacticalBattle`, including the budget-exceeded call with a null strategy.

3. `requestOrdersConsultationMarks.ts`, the exported `markSuccessfulConsultation`: after both note writes, call `recordCommanderStrategy({ step: stepForConsult(args.turnNumber, args.tacticalBattle), seatId: args.seatId, strategy: args.strategyText ?? '' })` once. Remove the early `return` in the tactical branch so that one call covers both paths. The existing writes keep their order. A blank strategy still writes nothing.

### Tests

Extend `matchRecordingEvents.test.ts`:

- `recordConsultation` with a summary built by `buildConsultTelemetrySummary` writes one event. Its decoded payload has `stage: 'orders'`, the same `inputTokens`, `outputTokens`, `costUsd`, and `attempts` length, and its visibility is `seats:` plus the seat id.
- A summary with a null seat id uses `engine`.
- `recordCommanderStrategy` writes one event with `display_text` equal to the strategy, and writes nothing for `'  '`.
- `stepForConsult` returns a tactical step when given a battle.

Run the existing tests for the two edited files before and after the edit (search for `requestOrdersFlow` and `markSuccessfulConsultation` in `*.test.ts`). They must pass unchanged, or with an added `match_records` assertion only.

### Verification

Run the Verification Bar. `check:circular` is the gate that matters most in this phase. If it reports a new cycle through `matchRecordingEvents`, the `ConsultTelemetrySummary` import is not type-only.

---

## Phase 7 — Recording File: Export, Reader, and Fixture

A finished match writes one standalone file. A reader parses it, and a fixture pins format version 1.

**Add:** `src/main/recorder/matchRecordingFile.ts`, `src/main/recorder/matchRecordingExport.ts`, `src/main/recorder/matchRecordingFile.test.ts`, `src/main/recorder/matchRecordingExport.test.ts`, `src/main/fixtures/recording-format-1.jsonl`
**Edit:** `src/shared/matchRecording.ts`, `src/main/ipc/saveLoadIpcHandler.ts`, `src/main/ipc/endMatchIpcHandler.ts`

### File format

A recording is gzip-compressed JSON Lines, UTF-8, one JSON object per line, with the extension `.agentwars-recording`:

1. A header line: `{"line":"header","format":"agent-wars-recording","formatVersion":1,"appVersion":"…","matchId":"…","exportedAt":"…"}`
2. A static line: `{"line":"static","hexes":{"columns":[…],"rows":[…]}}`
3. One record line per row of `match_records`, in `record_id` order: `{"line":"record","recordId":1,"kind":"event","recordType":"match_started","formatVersion":1,"stepKey":"s1","scope":"strategic","turnNumber":1,"battleId":"","beatNumber":0,"visibility":"everyone","displayText":null,"recordedAt":"…","payload":{…}}`

`payload` is the decoded JSON, not the compressed bytes.

### Steps

1. `src/shared/matchRecording.ts`: add `RECORDING_FILE_FORMAT = 'agent-wars-recording'`, `RECORDING_FILE_FORMAT_VERSION = 1`, `RECORDING_FILE_EXTENSION = 'agentwars-recording'`, and the types `RecordingHeader`, `RecordingStatic`, and `ParsedRecording { header; staticData; records: MatchRecord[] }`.
2. `matchRecordingFile.ts` (no database import):
   - `parseRecordingLines(text: string): ParsedRecording`. Splits on `\n`, skips empty lines, and parses each. Throws an `Error` with a plain sentence when the first line is not a header with the expected `format`, when `formatVersion` is greater than `RECORDING_FILE_FORMAT_VERSION`, or when a line is not valid JSON (name the line number).
   - `readRecordingFile(filePath: string): ParsedRecording` reads the file, `gunzipSync`s it, and calls `parseRecordingLines`.
3. `matchRecordingExport.ts`:
   - `recordingFileName(matchId: string): string` returns `recording-{matchId}.agentwars-recording`. Characters outside `[A-Za-z0-9-]` in the id become `-`.
   - `writeMatchRecordingFile(args: { ops: BasicDbOps; targetPath: string; appVersion: string; exportedAt: string }): void`. Builds the lines, joins them with `\n`, compresses with `gzipSync`, writes to `targetPath + '.tmp'`, then renames over `targetPath`. The `hexes` line uses the same column-and-rows reader as a frame table. Record payloads come from `listMatchRecords`.
   - `exportFinishedMatchRecordingIfNeeded(deps: { userDataDir: string; appVersion: string; now: () => Date; deferredConsultPending: boolean }): void`. Does nothing unless the recorder is on, the database is ready, `game_over` is `'1'`, a `match_ended` event exists, and `deferredConsultPending` is false. The export module does not import the deferred-consult module. Callers pass the flag. The target is `userData/recordings/` plus `recordingFileName(matchId)`. Before writing, replace the latest frame's payload in place when that frame's step key is the current step. When the file is missing, write it. When it exists and its record count equals `countMatchRecords`, leave it untouched, including its modified time. When the database has more records, rewrite the file. On Windows, delete the target before the rename, because a rename does not replace an existing file. It never throws: catch, `logError` with the directory only, and return.
4. Hooks:
   - `saveLoadIpcHandler.ts`, `withAutoSaveAfter`: call `exportFinishedMatchRecordingIfNeeded(...)` after the after-boundary call and after the automatic-save call. Pass whether a deferred playback consult is pending.
   - `endMatchIpcHandler.ts`: call it after the boundary call, with the pending flag false unless a deferred consult is still pending.
   - `deferredResolutionPlaybackConsult.ts`: after each path that ran a consult and then cleared the pending slot, call the export. Do not import `electron` at the top of this file. Its tests load it under Node. Read `app.getVersion()` with a lazy `require` only inside that export call.
5. `src/main/fixtures/recording-format-1.jsonl`: an **uncompressed** four-line file, written by hand, exactly:

   ```
   {"line":"header","format":"agent-wars-recording","formatVersion":1,"appVersion":"0.0.0-fixture","matchId":"fixture-match","exportedAt":"2026-01-01T00:00:00.000Z"}
   {"line":"static","hexes":{"columns":["h3_index","terrain","terrain_kind","map_role"],"rows":[["8001fffffffffff","land","plains",null]]}}
   {"line":"record","recordId":1,"kind":"event","recordType":"match_started","formatVersion":1,"stepKey":"s1","scope":"strategic","turnNumber":1,"battleId":"","beatNumber":0,"visibility":"everyone","displayText":null,"recordedAt":"2026-01-01T00:00:00.000Z","payload":{"appVersion":"0.0.0-fixture","matchId":"fixture-match","firstRecordedTurn":1}}
   {"line":"record","recordId":2,"kind":"frame","recordType":"state","formatVersion":1,"stepKey":"s1","scope":"strategic","turnNumber":1,"battleId":"","beatNumber":0,"visibility":"engine","displayText":null,"recordedAt":"2026-01-01T00:00:00.000Z","payload":{"tables":{"turn_state":{"columns":["id","phase","turn_number"],"rows":[[1,"planning",1]]}}}}
   ```

   This file is the frozen example of format version 1. A later change to the file format or to a payload shape adds a new fixture and keeps this one.

### Tests

- `matchRecordingFile.test.ts`: read the fixture with `fs.readFileSync` (build the path the way `fixturePath` does in `src/main/terrainStrategicCsv.test.ts`) and assert `parseRecordingLines` returns the header's `matchId`, one hex row, and two records, the second with `kind: 'frame'` and a `turn_state` table. A text whose header has `formatVersion: 2` throws. A text with a broken third line throws and names line 3.
- `matchRecordingExport.test.ts`, on a seated temp match and a temp directory:
  - After two boundary calls, `writeMatchRecordingFile` then `readRecordingFile` returns the same number of records as `countMatchRecords`, in the same order, with equal payloads, and a `hexes` row count equal to `SELECT COUNT(*) FROM hexes`.
  - **Secrets:** with the sentinel in every `MACHINE_LOCAL_CONFIG_KEYS` row, the unzipped file text does not contain the sentinel.
  - `exportFinishedMatchRecordingIfNeeded` writes nothing while the match is running, and nothing while `deferredConsultPending` is true. After the match is marked over and a boundary call has written `match_ended`, it writes one file. A second call with no new rows leaves the file's modified time unchanged. After one more inserted event, the next call rewrites the file and the parsed recording contains that event.
  - `recordingFileName('a/b:c')` is `recording-a-b-c.agentwars-recording`.

### Verification

Run the Verification Bar.

---

## Phase 8 — Summary Command and Measurements

One command prints what a recording cost, and the plan's results file states how large and how slow recording is.

**Add:** `src/main/recorder/matchRecordingSummary.ts`, `src/main/recorder/matchRecordingSummary.test.ts`, `src/main/recorder/recordingSummaryCli.ts`, `.spec/2026-11-14-dispatches-1-match-recorder-results.md`
**Edit:** `package.json`

### Steps

1. `matchRecordingSummary.ts` (no database import):

   ```ts
   export interface ConsultTotals {
     readonly seatId: string;
     readonly stage: string;
     readonly consults: number;
     readonly inputTokens: number;
     readonly outputTokens: number;
     readonly cachedTokens: number;
     readonly costUsd: number;
     readonly wallClockMs: number;
   }
   export interface RecordingSummary {
     readonly matchId: string;
     readonly frames: number;
     readonly events: number;
     readonly lastTurnNumber: number;
     readonly framePayloadJsonBytes: number;          // sum of JSON.stringify(payload).length over frames
     readonly consultTotals: readonly ConsultTotals[]; // one row per seat and stage, sorted by seat then stage
   }
   export function summarizeRecording(recording: ParsedRecording): RecordingSummary
   export function formatRecordingSummary(summary: RecordingSummary): string
   ```

   `formatRecordingSummary` returns plain text: a header block, then a table with one row per seat and stage and a final `Total` row. Costs print with four decimals. A consult event with a missing or non-numeric field counts as zero for that field.

2. `recordingSummaryCli.ts`: reads `process.argv[2]`, calls `readRecordingFile`, prints `formatRecordingSummary`. With no argument, or on an error, it prints one sentence to stderr and sets `process.exitCode = 1`. It must not import `../gameDb`, `electron`, or anything that does.
3. `package.json`: add `"recording:summary": "node dist/main/recorder/recordingSummaryCli.js"` next to the other scripts. It needs `npm run build:main` first, and is run as `npm run recording:summary -- <path to file>`.
4. Results file. Write `.spec/2026-11-14-dispatches-1-match-recorder-results.md` with:
   - The capture time in milliseconds and the byte length of `encodeRecordPayload(payload)` for a fresh global match and for one regional map. Add one temporary case to `matchFrameCapture.test.ts` that prints both for `withSeatedTempGameDb` and for `withRegionVsRegionTempGameDb`, run that one test file, read the numbers, then remove the case.
   - An estimate: compressed frame bytes × 150 frames, as megabytes, for each map.
   - Whether you could run the app, and what `match_records` held after two turns.

   These numbers are reported, not gated. Do not change the design to make them smaller.

### Tests

`matchRecordingSummary.test.ts`: build a `ParsedRecording` in memory with two frames, two `consultation` events for one seat and one for another (stage `orders`), and one event with a broken payload. Assert the totals, the sort order, and that `formatRecordingSummary` contains the `Total` row and each seat id.

### Verification

Run the Verification Bar. Then run `npm run build:main` and `npm run recording:summary -- src/main/fixtures/recording-format-1.jsonl`. It must fail with one sentence, because the fixture is not gzip-compressed. That proves the error path. Then gzip a copy of the fixture into a temp folder (`node -e "const z=require('zlib'),f=require('fs');f.writeFileSync(process.argv[2],z.gzipSync(f.readFileSync(process.argv[1])))" src/main/fixtures/recording-format-1.jsonl "$env:TEMP\fixture.agentwars-recording"`) and run the command on it. It must print one frame, one event, and an empty consult table.

---

## Phase 9 — Docs, Final Verification, and Hand-Off

**Add:** `doc/match-recording.md`
**Edit:** `doc/README.md`, `doc/save-files.md`

### Steps

1. Write `doc/match-recording.md` in the voice of `doc/save-files.md`: short sections, engine symbols named, no plan vocabulary. Cover:
   - What is recorded: frames and the eight event types, with the table from this plan's Design section.
   - When a frame is written, and what `step_key` means.
   - The table policy, and the rule that a new table must be classified in `MATCH_TABLE_RECORDING_POLICY` in the same change.
   - What is never recorded: the rows in `FRAME_EXCLUDED_CONFIG_KEYS`.
   - Visibility values.
   - The recording file: where it is written (`userData/recordings`), when (the match ends, or the player ends it), its three line kinds, and `npm run recording:summary`.
   - Versioning: a payload shape change raises that type's number in `MATCH_EVENT_FORMAT_VERSIONS` or `MATCH_FRAME_FORMAT_VERSION`; a file layout change raises `RECORDING_FILE_FORMAT_VERSION`; either adds a fixture beside `recording-format-1.jsonl` and keeps the old one.
   - `AGENT_WARS_DISABLE_RECORDER`.
   - What is derived and not stored: captures, production, treasury changes, knockouts, battle starts and ends.
2. `doc/README.md`: add the new document to the index table with a role and a status, in the same form as the `save-files.md` row.
3. `doc/save-files.md`: add a link to `match-recording.md` next to the `ensureMatchRecordsTable` sentence from Phase 1. In "Automatic saves", add one sentence: the step's frame is written before the automatic save, so the file holds it. Also say a finished match is not a save file (`SAVE_GAME_OVER_MESSAGE`); the recording under `userData/recordings` is the copy that leaves the match database.
4. Run `node scripts/check-doc-links.cjs` if `package.json` or the docs reference it, and fix any link it reports in the files this phase touched.
5. Search the whole diff for plan vocabulary and remove it: `git diff | Select-String -Pattern 'Phase \d|dispatches-1|execution plan|locked decision' -CaseSensitive:$false`. Nothing under `src/` or `doc/` may match.
6. Run the Verification Bar one last time.
7. Fill in the Completion Log.
8. In your final message, name every document you updated, as `AGENTS.md` requires. Also tell the user that `README.md` lists the app's environment variables and was not edited, so `AGENT_WARS_DISABLE_RECORDER` is documented only in `doc/match-recording.md`.

### Manual checklist for the user

Give the user this list in your final message:

1. Start a new match and play three turns, including one tactical battle. Use Game → Save. Open the save with a SQLite tool and run `SELECT record_id, kind, record_type, step_key FROM match_records ORDER BY record_id;`. Expect `match_started`, then a frame per turn and per beat, with `orders_committed` and `strategic_resolution` between them.
2. End the match from the menu. Expect a file in the app's user-data folder under `recordings`.
3. Run `npm run build:main`, then `npm run recording:summary -- <that file>`. Expect a row per commander with tokens and cost.
4. Start an Observe match with logging off and compare a turn's wall-clock time with the previous build. Expect no visible difference.
5. Load a save made by the previous build and play a turn. Expect it to load and play, and `match_records` to begin with `match_started` at that turn.
6. Start the app with the match that was open in the previous build still on disk. Expect it to open as before, with no recovery dialog.

---

## Reliability Checklist

Check each item before you mark a phase complete:

- [ ] The phase's files were backed up before the first edit.
- [ ] New modules were tested before any existing code called them.
- [ ] No exported function in `matchRecorder.ts`, `matchRecordingEvents.ts`, or `exportFinishedMatchRecordingIfNeeded` can throw.
- [ ] No `BEGIN`, `COMMIT`, or `SAVEPOINT` was added.
- [ ] `EXPECTED_USER_VERSION` and `GAME_DB_REQUIRED_TABLES` are unchanged.
- [ ] No file in `src/main/recorder/` has a value import from `../openRouter/`, `../ipc/`, `../gameActions/`, or the barrel `../gameDb`.
- [ ] No log line added by this plan carries a payload, a config value, or a key.
- [ ] Every new function, type, interface, field, and constant has a full orienting comment that describes behavior and is not generic filler.
- [ ] `npm run check:circular` shows only the baseline cycles.
- [ ] No baseline file was edited.
- [ ] No commit, push, stash, checkout, restore, reset, or clean was run.
- [ ] No plan vocabulary appears in `src/` or `doc/`.

## Success Definition

- `match_records` exists in new and in existing databases, `EXPECTED_USER_VERSION` is unchanged, saves from the previous build load, and a new match clears the table and writes a new `match_id`.
- A played match holds one `match_started` event, a frame for every strategic turn and tactical beat, orders and resolution events for every resolved step, a `consultation` event for every model consult, and a `match_ended` event with a final frame.
- `matchFramePolicy.test.ts` fails when a table is added without a policy entry.
- No recorded frame or exported file contains a machine-local config value.
- A finished match writes one recording file, and `npm run recording:summary` prints its totals.
- The Verification Bar passes. No renderer file changed. No gameplay, prompt, or IPC payload changed.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | Filled after the work. At the start, the code tree was clean aside from the other three dispatch spec files. |
| `npm test` | Not re-run as a pre-change baseline in this session. The final run passed (exit 0, about 23 minutes). |
| `npm run build:renderer` | The final run passed. |
| `check:circular` cycle list | Three cycles, none of which include the recorder. The baseline file is empty. It was not edited. The cycles are the existing orderless-unit loop through `gameActions`, and two renderer loops through `openRouterUiHelpers`. |
| `EXPECTED_USER_VERSION` (must not change) | 26. Unchanged. |
| Missing symbols | None. The symbols this plan calls were present. |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|
| 1 | `tsc -p tsconfig.main.json` | `matchRecordsTable.test.ts` imported `./gameDb` from inside `src/main/gameDb`. | Import `resetGameForNewMatch` from `../gameDb`. |
| 2 | `tsc -p tsconfig.main.json` | `StoredMatchRecordRow` did not satisfy `getAll`'s `Record<string, unknown>` constraint. | The row type is a type alias instead of an interface. |
| 5 | `eslint` | `require('electron')` in the deferred-consult export. | The same file-level disable used by the other lazy Electron require, with the reason that a top-level import loads Electron in the unit tests. |
| 1 | `node dist/main/gameDb/matchRecordsTable.test.js` | `better_sqlite3.node` was built for Electron (`NODE_MODULE_VERSION` 143). | `npm run rebuild:native:node`. |

## Completion Log

| Phase | Result | Sketch differences | Test files changed outside the Add/Edit lists | Docs updated |
|-------|--------|--------------------|-----------------------------------------------|--------------|
| 0 | Inventory filled after implementation. No code. | The full bar was not repeated before the first edit. | None | None |
| 1 | Done. Final `npm test` passed. | `ensureMatchId` uses the existing `upsertGameConfigValue`. | None | `doc/save-files.md` mentions the table |
| 2 | Done. Final `npm test` passed. | None | None | None |
| 3 | Done. Final `npm test` passed. | The speed assert is 2000 ms. A fresh global frame was 32.0 ms and 27,169 deflated bytes. | None | None |
| 4 | Done. Final `npm test` passed. | `currentStepKey` reads `activeTacticalBattleRef` rather than `tacticalBattleSession`, so the recorder does not import the `gameDb` barrel. | None | None |
| 5 | Done. Final `npm test` passed. | No Ready assertion against a real database. The existing Ready tests use fakes, and a closed database makes the recorder return without writing. | None | None |
| 6 | Done. Final `npm test` passed. | None | None | None |
| 7 | Done. Final `npm test` passed. | The export takes `deferredConsultPending` so it does not import the deferred-consult module. That module loads Electron with `require` only inside the export call. A replace deletes the target first. | None | None |
| 8 | Done. Final `npm test` passed. | The app was not played. Numbers are in `.spec/2026-11-14-dispatches-1-match-recorder-results.md`. The temporary measurement print was removed. | None | None |
| 9 | Done. `npm test` and `npm run build:renderer` passed. `check:circular` still fails on the three cycles in the Phase 0 row. | The full bar ran once, at the end, rather than after every phase. | None | `doc/match-recording.md` added. `doc/README.md` and `doc/save-files.md` updated. `README.md` was not edited. |
