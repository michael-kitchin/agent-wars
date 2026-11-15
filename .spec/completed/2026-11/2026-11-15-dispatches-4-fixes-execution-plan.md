# Commander Messages: Fixes Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Bring the match recorder, the talk stage, and the chat panel in line with their plans and the meta-plan. The three are already in the tree: commits `01651be`, `8468286`, and `da867be`. This plan fixes what an audit of those commits found incomplete, incorrect, or inconsistent with them. It also makes `npm run ui:smoke` usable as a gate, and adds the keyboard zoom the meta-plan says exists.

**Shape:** Phase 0 records a baseline. Phases 1 through 12 each fix one area and can be verified on their own or with earlier phases. Phase 13 runs the final verification, the doc check, and hands the user a manual checklist.

**Tech:** TypeScript (Electron main, sandboxed preload, esbuild-bundled renderer), better-sqlite3, Leaflet, plain DOM and CSS, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`, `scripts/ui-smoke/`.

**Specs this plan answers to:** `.spec/2026-11-14-dispatches-0-meta-plan.md` (the meta-plan), `.spec/2026-11-14-dispatches-1-match-recorder-execution-plan.md` (the recorder plan), `.spec/2026-11-14-dispatches-2-talk-stage-execution-plan.md` (the talk plan), and `.spec/2026-11-14-dispatches-3-chat-panel-execution-plan.md` (the chat plan). When this plan quotes one of them, the quote is exact.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names. Record any such file in the Completion Log.
- Find code by the quoted text, not by a line number. Line numbers in this plan are hints from commit `da867be` and may have moved.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. **User-facing strings and log sentences in this plan are not sketches.** Copy them exactly.
- **Tests come first.** Write the phase's tests, run them, and see them fail for the reason the phase names. Then make the change and see them pass. When a test cannot fail before the change (a pure addition), say so in the Completion Log.
- Tests under `src/renderer` are not run by `npm test`. A renderer rule that can be wrong goes in a pure function under `src/shared` with a test. A renderer wiring rule gets a source-contract test under `src/main/*Contracts.test.ts`, in the style of `src/main/rendererChatPanelContracts.test.ts`.
- Make no paid model calls. Do not run the pilot. Do not set an OpenRouter key.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root in PowerShell. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('scripts/ui-smoke/ui-smoke-multi.cjs', 'scripts/ui-smoke/ui-smoke-beat-limit.cjs')
$backup = Join-Path $env:TEMP "aw-dispatch-fixes\step-$step"
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

The three earlier plans skipped their backups. Do not skip them here.

---

## Behavior Rule

The user chose **fix to spec, with docs in step**.

- Where code disagrees with a Locked Decision, a meta-plan Decision, or an instruction in one of the three plans, change the code. Update every `doc/` file that describes the changed behavior in the same phase.
- A deviation already logged in a plan's Completion Log stands, unless it breaks a Locked Decision or a meta-plan Decision. The table "Accepted As Is" below lists the ones the audit checked.
- `EXPECTED_USER_VERSION` stays **26**. No phase changes `getFullDdl`. New `game_config` keys are allowed. They do not change the save version.
- The three decisions the user made for this plan are in Locked Decisions. They override any plan text that disagrees.

## Verification Bar

Every phase runs its targeted tests as it goes. At the end of each phase run, from the repo root:

1. `npm test` passes.
2. `npm run build:renderer` passes.
3. `npm run check:circular` prints exactly the cycles Phase 0 recorded, and no others. It exits 1 today, because `scripts/circular-deps-baseline.json` is `[]`. That exit is expected. A new cycle fails the phase. Do not edit `scripts/circular-deps-baseline.json`.
4. `npm run check:renderer-types` passes as part of `npm test`. Never refresh its baseline file.

Phases 1, 10, 11, and 13 also run `npm run ui:smoke`. After Phase 1 it must pass. When it cannot (see Phase 1), the phase records the furthest step it reaches, and later phases must reach at least that step with no new failing check.

How to run a single compiled test: `npm run build:main`, then `node dist/main/<path>.test.js` or `node dist/shared/<path>.test.js`. `scripts/run-main-node-tests.cjs` runs `node <file>`, not `node --test`. A shared test lands under `dist/shared`.

## Non-Goals

- No new mechanic, no alliance, no change to who may talk to whom.
- No change to the frame shape, the event shapes (other than the header field Phase 4 adds), or the file layout version `RECORDING_FILE_FORMAT_VERSION`.
- No change to the talk prompt text. No change to the orders prompt text, other than the one sentence Phase 8 leaves out when talk is off.
- Antarctica and Polynesia stay on the home list. Phase 1 only stops the smoke run from picking them.
- No screenshot regeneration. `doc:shots` is not run. `doc/media/colombia-battle-taunt.png` stays as it is.
- The historical documents listed in `AGENTS.md` are not edited.

## Conventions

These are the repo's rules. The lint and the naming check enforce most of them.

- Every exported symbol, and every non-trivial internal function, has an orienting JSDoc block with Purpose (or Contract), When to use, Expected outcome, and Exceptions, in the voice of the file you are editing.
- In `src/main`, an exported function that changes state logs `logDebug` on entry. An exported getter logs `logTrace`. `src/shared` and `src/renderer` do not log.
- Never log message text, a stance reason, a prompt body, an API key, a match id, or a playthrough id. Log counts, seat ids, step text, and booleans.
- No seat-id string literals in production code. Use the constants in `src/shared/seatIds.ts`.
- Files stay under 600 lines where they already are. No file may pass 1000. Functions take at most 6 parameters. Use one object argument past 3.
- Keep plan vocabulary (phase numbers, "finding", "audit", "defect inventory") out of `src/`, `static/`, `scripts/`, and `doc/`.
- Take numbers and names in `doc/` from the code, and name the symbol.

## Locked Decisions

These are settled. Do not reopen them.

1. **One recording file per playthrough.** Loading a save starts a new playthrough with a new id. A new match starts a new playthrough too. The file name carries the match id and the playthrough id. A file from an earlier playthrough is never replaced by a later one. (User decision.)
2. **A recording file is stale when its record count or its last record id differs from the database.** Count alone is not enough.
3. **With talk off, the orders system prompt drops only the sentence about answering in the diplomacy step.** The source and trust bullets stay, because a human's message can still arrive. (User decision.)
4. **The main map gets zoom keys.** `=` and `+` zoom in. `-` zooms out. The numpad `+` and `-` do the same. One press is one step of the map's `zoomDelta` (0.5). They act where the pan keys act. Ctrl, Alt, and Meta turn them off, so Electron's own Ctrl zoom shortcuts are untouched. Shift does not turn them off, because `+` needs Shift on many layouts. (User decision.)
5. **Nothing under `src/main/recorder/` throws into a turn.** This is the recorder plan's first claim. Every read the turn code calls from the recorder catches, logs, and returns a value that writes nothing.
6. **An orders call never starts after Stop, New, or Load while its seat waited on a talk round.**
7. **End Match passes the real pending-consult flag.** The recorder plan says: "call it after the boundary call, with the pending flag false unless a deferred consult is still pending."
8. **A budget-exceeded orders consult still marks the messages it showed as read.** The model did read them. This is documented, not changed.
9. **The machine-local config claim holds as written.** The meta-plan claim is that nothing the recorder writes "can contain a machine-local config row." A frame's `seats` table carries `nickname` and `model_id`. Those are match data, not `game_config` rows. They stay.

## Accepted As Is

These logged deviations do not break a Locked Decision or a meta-plan Decision. Leave them.

| Plan | Deviation | Why it stands |
| --- | --- | --- |
| Recorder | `currentStepKey` reads `activeTacticalBattleRef`. | Same snapshot, no session import. Phase 2 only makes it non-throwing. |
| Recorder | The export takes `deferredConsultPending` as a flag. | Keeps the export free of the consult module. Phase 3 fixes the one caller that passes the wrong value. |
| Recorder | `match_started` is written whenever no such event exists. | A loaded older match gets one start event. |
| Recorder | `markSuccessfulConsultation` and `saveLoadPipeline.ts` were edited outside their lists. | Process only. The code is correct. |
| Recorder | `check:circular` had no pre-change baseline. | The three cycles exist at `da867be^`. Phase 0 records them. |
| Talk | `countUnreadPromptMessages` counts only the lines the prompt shows. | An unread line outside the window needs eight newer lines in that thread, each of which is itself unread. |
| Talk | The orders block omits a thread with no lines. | Nothing to show. |
| Talk | `withTalkCost` fills the commander's `message` from what it sent to the human seat. | Display only. |
| Talk | `turn_notes_history.message_text` stays in `schema.ts`. | Older saves still open. Documented in `doc/save-files.md`. |
| Chat | `createSideNumberFlag` moved to `src/renderer/chrome/sideNumberFlag.ts`. | One flag helper. |
| Chat | `applyCommanderMessage`'s `message` became optional. | Callers no longer pass a taunt. |
| Chat | The tab `message` field was kept. | Phase 10 removes the dead `ConsoleReportMeta.messageText` branch only. |
| Chat | The panel hides during playback, while `#map-toast` shows, and on New game and Game over. | Matches Locked Decision 8 of the chat plan. |

---

## Phase 0: Baseline and Inventory

**Adds:** none. **Edits:** this plan's Completion Log only.

1. Run `git status`. Stop when any path other than this plan file is dirty. The Completion Log in this file is edited from this phase on. If anything else is dirty, stop and tell the user.
2. Run the Verification Bar. Record in the Completion Log:
   - whether `npm test` and `npm run build:renderer` pass;
   - the exact cycles `npm run check:circular` prints. The audit saw three: one through the orderless-unit prompt, and two through `src/renderer/openRouter/openRouterUiHelpers.ts` (one via `mapToastBody` and `toastInlineMarks`, one via `aiPlanningState`, `commanderPoolClient`, and `newGameReturn`).
3. Run `npm run ui:smoke`. Record the pass count and the first failing check or thrown error. The audit expects it to stop in the beat-limit scene with `a battle needs a land unit on each side`, in some runs and not others.
4. Confirm these exist, by quoted text, and record any that do not:
   - `src/main/recorder/recorderStepKey.ts`: `export function currentStepKey(): StepKey | null`
   - `src/main/recorder/matchFrameCapture.ts`: `export function readMatchTable`, `export function readHumanOrderTables`
   - `src/main/openRouter/requestOrdersConsultationMarks.ts`: `export function consultStillOnOpenMatch`
   - `src/main/recorder/matchRecordingExport.ts`: `if (fs.existsSync(args.targetPath)) fs.rmSync(args.targetPath);` and `recordingRecordCount(targetPath) === count`
   - `src/main/ipc/endMatchIpcHandler.ts`: `deferredConsultPending: false,`
   - `src/main/openRouter/commanderPoolConsult.ts`: `await speakAndAwaitTalkRound(request.talkRound, request.seatId, request.signal);`
   - `src/main/main.ts`: `sendStagedHumanSideMessages(beatStep);`
   - `src/main/openRouter/promptSpec/sideMessageRuleText.ts`: `You answer messages in the diplomacy step, not in your orders.`
   - `src/renderer/chat/chatPanel.ts`: `const key = ids.join('\n');`
   - `src/renderer/map/worldLeafletMap.ts`: the main map has `keyboard: false,` and the minimap has `keyboard: false` with no comma
5. Read the option values of the observe-mode home selects, so Phase 1 can pin homes. Open `src/renderer/gameplay/` new-game side-row code (search for `home"` in the `aria-label`), and record how option values are built. Phase 1 needs four values that are the home names `Southern Europe`, `Northern Africa`, `South America`, and `Eastern Asia`. If an option's value is not its visible name, record the real values for those four homes.

**Verification:** the Completion Log row for Phase 0 is filled in. No file other than this plan changed.

---

## Phase 1: Make ui:smoke a Gate

**Why:** The beat-limit scene picks four observed sides on random homes. Antarctica and Polynesia have no passable land, so seeding turns every land unit there into `naval` (`regionScenarioSeeding.ts`). `aiContestedHexStatements` then takes the first two active sides and throws when either has no land unit. About one run in six fails. Later checks already run on the other runs. Separately, the chat plan said: "Leave `minimapHasZoom` in `ui-smoke-checks.cjs` alone. It asserts the minimap has none." The check that read it was deleted with the zoom buttons, so nothing asserts it now.

**Edits:** `scripts/ui-smoke/ui-smoke-multi.cjs`, `scripts/ui-smoke/ui-smoke-beat-limit.cjs`, `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`

**Steps:**

1. In `ui-smoke-multi.cjs`, add `setSideHome` to the import from `./ui-smoke-new-game.cjs`.
2. Add a frozen constant near `FOUR_SIDE_REGION`, with a short comment that says why:

   ```js
   /** Homes with land on every side, so the beat-limit battle can always pair two land armies. */
   const OBSERVED_HOMES = Object.freeze(['Southern Europe', 'Northern Africa', 'South America', 'Eastern Asia']);
   ```

   Use the values Phase 0 step 5 recorded if they differ from these names.
3. Pin homes only on the Global-tab `await addSidesUntil(page, 4);` inside `runMultiCommanderScenes`, after Observe is on. The other `addSidesUntil(page, 4)` is the Central America setup. Its option values are side-group ids, and pinning `Southern Europe` there throws `Side 1 has no home "Southern Europe"`. Directly after the Global-tab call:

   ```js
   for (const [index, home] of OBSERVED_HOMES.entries()) {
     await setSideHome(page, `Side ${index + 1}`, home);
   }
   ```

   Observe-mode rows are labelled `Side 1` to `Side 4`. Global-tab option values are the home names. `setSideHome` throws `` `${label} has no home "${value}"` ``. It moves a holder off a taken home, so pinning in order always ends with all four pinned.
4. In `ui-smoke-beat-limit.cjs`, make `aiContestedHexStatements(state)` pick the first two active sides that each have at least one land unit, instead of `active[0]` and `active[1]`. When fewer than two qualify, throw:

   ```js
   throw new Error(`a battle needs a land unit on each side (land units by side: ${counts})`);
   ```

   where `counts` is each active side's seat id and land-unit count, joined with `, `. Use the land-unit test the file already uses.
5. In `ui-smoke-map-chrome-checks.cjs`, add a check named `minimap-has-no-zoom` in the `MAP_CHROME_CHECKS` array beside `chat-panel-bottom-right`, in the same shape as its neighbors, that fails with `the minimap has zoom buttons` when `p.minimapHasZoom` is true. There is no separate register call.

**Verification:**

- `npm run ui:smoke` passes, including the beat-limit scene and `minimap-has-no-zoom`.
- Run it twice more. It passes each time. Record all three pass counts.

**If verification fails:**

- If the beat-limit scene now fails at a later step, read the error. When it is another random-setup assumption in `scripts/ui-smoke/`, fix it in the same style (pin the input, or pick tolerantly and throw a clear error), and record it. When it is an app bug, do not fix it here. Record it in the Defect Inventory, with the check name and the error. From then on, the gate is "every check before that step passes, and no new check fails." If the timed AI-only notice check fails, record it under that gate. Do not widen its window.
- If `setSideHome` throws `has no home`, Phase 0 step 5 recorded the wrong values. Read the select's options in the running page and use those.

---

## Phase 2: Recorder Reads Never Throw

**Why:** The recorder plan's claim is that "nothing under `src/main/recorder/` can throw into a turn." Ready calls `readHumanOrderTables(gameDbOps)` unguarded (`gameIpcHandlers.ts`, before `deps.ready`). Five places call `recordStepBoundary(currentStepKey(), …)`, and `currentStepKey()` runs before the boundary's own `try`: `saveLoadIpcHandler.ts` (twice), `gameIpcHandlers.ts`, `meleeInterceptResolveIpc.ts`, and `endMatchIpcHandler.ts`. `main.ts` reads `beatStep = currentStepKey()` before the tactical commit. A null `beatStep` skips `recordTacticalBeat` and the staged-message send. The commit itself still runs. `recordStepBoundary` already returns without writing when the step is null. `readMatchTable` builds `SELECT  FROM …` when a table has no columns, which is what `PRAGMA table_info` returns for a missing table. Other database errors from `readMatchTable` may still throw. The Ready path is safe once `readHumanOrderTables` catches them. Frame builds stay inside `recordStepBoundary`'s try. `consultStillOnOpenMatch` reads `match_id` without a guard. It runs in the `finally` of `requestOrders` and of `requestTalk`, where a throw replaces the return value. Returning false does not undo the consult. In those finallies it skips only the consultation event. Inside `markSuccessfulConsultation` the turn stamp, loss clear, and strategy note still run, and false skips only `markSideMessagesSeen` and `recordCommanderStrategy`. Also, the Ready recorder hook has no test.

**Edits:** `src/main/recorder/recorderStepKey.ts`, `src/main/recorder/matchFrameCapture.ts`, `src/main/recorder/matchFrameCapture.test.ts`, `src/main/openRouter/requestOrdersConsultationMarks.ts`, `src/main/openRouter/requestOrdersConsultationMarks.test.ts`, `src/main/gameIpcHandlers.test.ts`, `src/main/recorder/matchRecordingEvents.test.ts`, `src/shared/matchRecording.test.ts`

**Tests first:**

1. `matchFrameCapture.test.ts`:
   - `readMatchTable` on a table name that does not exist returns `{ columns: [], rows: [] }` and does not throw.
   - `readHumanOrderTables` with an ops object whose `getAll` throws returns `{}` and does not throw.
2. A test for `currentStepKey`: with the database open and an ops failure injected the way the file's other tests inject one, it returns `null`. When the file has no test, add `src/main/recorder/recorderStepKey.test.ts`. If `currentStepKey` cannot be made to fail without a real database error, open a temp game database with `withSeatedTempGameDb`, drop `turn_state`, and call it. Restore nothing: the temp database is thrown away.
3. A test for `consultStillOnOpenMatch`: on a temp game database with `game_config` dropped, it returns `false` and does not throw. (A closed database does not exercise the guard, because `readMatchId` already returns null when there is no handle.) Put it in `requestOrdersConsultationMarks.test.ts`.
4. `gameIpcHandlers.test.ts`: in `testGameReadyPrecomputedWithOrders`, which already runs Ready on a real temp database, the queued orders come from `setAiPendingOrders` and there is no human pending row. Assert after Ready that `match_records` holds one `orders_committed` event for the owner that helper wrote, and at least one frame. Do not assert a human owner. Read the rows with `listMatchRecords(gameDbOps)`.
5. `matchRecordingEvents.test.ts`: rename the test at the `strategic orders are one event per owner, and only when that owner has orders` title to `a human table with a row writes the human event, and every AI owner writes an event, including an empty order set`. It expects an event for `opponent2` with an empty order set, so the current name is false. Change nothing else in it.
6. In `src/shared/matchRecording.test.ts`, the visibility text writer and `parseVisibilityText` agree for `'everyone'` and `'engine'`. Do not add a second file. `parseVisibilityText` lives in `src/shared/matchRecording.ts`.

**Steps:**

1. `currentStepKey`: wrap the body after `if (!hasDbHandle()) return null;` in `try`. On a throw, `logError('recorderStepKey currentStepKey failed', { err })` and return `null`. Update both JSDoc blocks: Exceptions becomes "None. A failed read is logged and returns null, so the boundary writes nothing."
2. `readMatchTable`: after `columns` is built, `if (columns.length === 0) return { columns: [], rows: [] };`, with the trace log. Update Exceptions. This removes the blank `SELECT` only. Other database errors from this function may still throw. The Ready path is safe because `readHumanOrderTables` catches them. Frame builds stay inside `recordStepBoundary`'s try.
3. `readHumanOrderTables`: wrap the loop in `try`. On a throw, `logError('matchFrameCapture readHumanOrderTables failed', { err })` and return `{}`. An empty record has no rows, so `recordStrategicOrders` writes no human event. Update Exceptions to say so.
4. `consultStillOnOpenMatch`: wrap the two reads in `try`. On a throw, `logError('requestOrdersConsultationMarks consultStillOnOpenMatch failed', { err })` and return `false`. False does not undo the consult. In the `requestOrders` and `requestTalk` finallies it skips only the consultation event, and the try keeps a throw from replacing the consult's return value. Inside `markSuccessfulConsultation`, false skips only `markSideMessagesSeen` and `recordCommanderStrategy`. Update Exceptions to say that.

**Doc check:** `doc/match-recording.md` says what the recorder does when a write fails. Add one sentence where it describes failures: "A failed read of the step or the human orders is logged and writes nothing for that step." Search `doc/` for `currentStepKey` and `readHumanOrderTables` and fix any sentence that says they propagate errors.

**Verification:** the Verification Bar.

**If verification fails:** a test that asserts a propagated error from one of these four functions is now wrong. Change it to assert the logged, safe result, and record the file.

---

## Phase 3: Safe Replace and the End Match Flag

**Why:** The export deletes the target, then renames the temp file over it. When the rename fails, the catch deletes the temp file too, and the old recording is gone. Node's `fs.renameSync` replaces an existing file on Windows as well as POSIX (libuv calls `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`), so the delete is not needed. Separately, End Match always passes `deferredConsultPending: false`. The recorder plan says the flag is "false unless a deferred consult is still pending."

**Edits:** `src/main/recorder/matchRecordingExport.ts`, `src/main/recorder/matchRecordingExport.test.ts`, `src/main/ipc/endMatchIpcHandler.ts`, `src/main/main.ts`, `doc/match-recording.md`, plus any test that calls `registerEndMatchIpcHandler` (search for it)

**Tests first (`matchRecordingExport.test.ts`):**

1. A source assertion that `writeMatchRecordingFile` no longer contains `fs.rmSync(args.targetPath)` or `fs.existsSync(args.targetPath)`. This fails on today's code.
2. Writing a recording twice to the same path leaves the second content, and no `.tmp` file beside it. This already passes. Keep it as a regression check and say so in the Completion Log.
3. When the target path is an existing directory, `writeMatchRecordingFile` throws, the directory is still there, and no `.tmp` file is left. (A rename onto a directory fails on every platform.) This already passes. Keep it as a regression check.
4. A source assertion that `endMatchIpcHandler.ts` passes `deps.isDeferredConsultPending()` and that `main.ts` registers `registerEndMatchIpcHandler(ipcMain, { isDeferredConsultPending: hasDeferredPlaybackConsultPending })`. No test calls that registrar today. Put the assertion in a source-contract test next to the handler if none exists. `hasDeferredPlaybackConsultPending` is already imported in `main.ts`.

**Steps:**

1. In `writeMatchRecordingFile`, delete the line `if (fs.existsSync(args.targetPath)) fs.rmSync(args.targetPath);`. Keep the `try` around `fs.renameSync(tmp, args.targetPath)` and the catch that removes the temp file and rethrows. Update the JSDoc: "The write lands in a temporary file, which is then renamed over the target. A failed rename leaves the old file in place and removes the temporary file."
2. Change `registerEndMatchIpcHandler(ipcMain: IpcMain)` to take a second argument, `deps: { readonly isDeferredConsultPending: () => boolean }`, documented with an orienting block. Pass `deferredConsultPending: deps.isDeferredConsultPending()` to the export.
3. In `main.ts`, change the registration to `registerEndMatchIpcHandler(ipcMain, { isDeferredConsultPending: hasDeferredPlaybackConsultPending });`. `main.ts` already imports that function.
4. Leave the other `deferredConsultPending: false` callers alone. New Game and Load delete or replace the match, and the deferred-consult slot passes false only after it has cleared.

**Doc check (`doc/match-recording.md`):**

- Replace "Ending the match passes false, so the file is written even when that consult is still running. If the consult later adds rows and still belongs to this match, the export after the slot clears rewrites the file." with: "Ending the match passes the pending flag too (`hasDeferredPlaybackConsultPending`), so a consult that is still running holds the file. The export after the slot clears writes it."
- Replace "On Windows the existing file is deleted before the new file is renamed into place." with: "The new file is written to a temporary name and renamed over the old one. A failed rename leaves the old file."

**Verification:** the Verification Bar.

---

## Phase 4: One Recording File per Playthrough

**Why:** A save carries `match_id` and `match_records`. When a player loads a save and plays to a second ending, that history goes to the same file name, `recording-{matchId}`, and replaces the first ending. When both endings have the same record count, the export decides the file is current and the second history is never written. The meta-plan calls a Cup recording "the footage and the data." Locked Decisions 1 and 2 fix this.

**Edits:** `src/main/gameDb/gameConfigKv.ts`, `src/main/gameDb/gameConfigKv.playthrough.test.ts` (new; there is no `gameConfigKv` test file today), `src/main/gameDb/resetGame.ts`, `src/main/gameDb/matchRecordsTable.test.ts`, `src/main/saveGame/saveLoadPipeline.ts`, `src/main/saveGame/saveLoadPipeline.test.ts`, `src/main/recorder/matchRecordStore.ts`, `src/main/recorder/matchRecordStore.test.ts`, `src/main/recorder/matchRecordingExport.ts`, `src/main/recorder/matchRecordingExport.test.ts`, `src/main/recorder/matchRecordingFile.ts`, `src/main/recorder/matchRecordingFile.test.ts`, `src/shared/matchRecording.ts`, `src/main/recorder/matchRecordingSummary.test.ts`, `doc/match-recording.md`, `doc/save-files.md`

**Design:**

- A new `game_config` key, `playthrough_id` (`PLAYTHROUGH_ID_CONFIG_KEY`). It is match data, not machine-local. It travels in a save like `match_id`, and is replaced on load.
- `resetGameForNewMatch` stores a new id right after it stores the new match id.
- A successful load stores a new id in the loaded database. `storeNewPlaythroughId` replaces the row. If it throws, delete `playthrough_id` and continue, so the saved id cannot be reused. `ensurePlaythroughId` then creates a new id at export, and it returns an existing id unchanged. If the delete also throws, rethrow and fail the load. Continuing with the saved id would overwrite that playthrough's recording.
- Relaunching the app reopens the on-disk match database, which is not a load, so the playthrough continues with the same id.
- The export calls `ensurePlaythroughId`, so a match from an older build gets one.
- The file name is `recording-{matchId}-{playthroughId}.agentwars-recording`. Both ids go through the same character cleaning.
- The header gains `playthroughId`. The parser reads a missing value as `''`, so old files and the fixture still parse. `RECORDING_FILE_FORMAT_VERSION` stays 1.
- The new file holds every row in `match_records`. That includes the rows the save carried, so each playthrough's file is a whole history from the match start.

**Tests first:**

1. `gameConfigKv.playthrough.test.ts`: open with `openGameDatabaseAtPathForTests` and read before any reset. `withTempGameDb` calls `resetGameForNewMatch` before the test body, and after this phase that reset already stores a playthrough id, so a read inside `withTempGameDb` is not null. `readPlaythroughId` returns null on that fresh database. `ensurePlaythroughId` creates one and returns the same value on a second call. `storeNewPlaythroughId` replaces it with a different value.
2. `matchRecordsTable.test.ts`: after `resetGameForNewMatch`, `readPlaythroughId` is non-null and differs from the value before the reset. That file already checks that reset replaces `match_id`. There is no reset-only test file.
3. `matchRecordStore`: a new `lastMatchRecordId(ops)` returns `null` on an empty table and the highest `record_id` otherwise.
4. `matchRecordingFile`: a header without `playthroughId` parses with `playthroughId === ''`. A header with one keeps it.
5. `matchRecordingExport`:
   - `recordingFileName(matchId, playthroughId)` replaces the one-argument function. Update its two existing test calls. Clean each id with the existing `[^A-Za-z0-9-]` replace.
   - `recordingFileName('m-1', 'p-2')` is `recording-m-1-p-2.agentwars-recording`. Characters outside letters, digits, and hyphen become hyphens in both parts.
   - Two finished playthroughs of one match (same match id, different playthrough ids) leave two files.
   - A file with the same record count but a different last record id is rewritten. To build this case, write the file, delete the last event row, insert another, and call the export again. `recordingTail` uses the last `record` line's `recordId`. The export writes `record_id` ascending, and the column is `AUTOINCREMENT`.
6. `saveLoadPipeline.test.ts`: assert that the loaded database's playthrough id differs from the id stored in the save file. `gameDbOps` is the loaded database on the line after `resetMatchMemoryAfterDatabaseReplace`.

**Steps:**

1. `gameConfigKv.ts`: add `PLAYTHROUGH_ID_CONFIG_KEY`, `readPlaythroughId`, `ensurePlaythroughId`, and `storeNewPlaythroughId`, modeled on `MATCH_ID_CONFIG_KEY`, `readMatchId`, and `ensureMatchId`. The id is a `randomUUID()`. `playthrough_id` is a `game_config` row. Do not add it to `getFullDdl`. Each function gets an orienting block. `readPlaythroughId` logs `logTrace`. `ensurePlaythroughId` logs `logDebug` with `{ created }` and returns an existing id unchanged. `storeNewPlaythroughId` logs `logDebug` and never the id. Never log the id.
2. `resetGame.ts`: directly after `upsertGameConfigValue({ run }, MATCH_ID_CONFIG_KEY, randomUUID());`, store a new playthrough id the same way, in that same transaction.
3. `saveLoadPipeline.ts` `loadBody`: directly after `resetMatchMemoryAfterDatabaseReplace();`, call `storeNewPlaythroughId(gameDbOps)`. `gameDbOps` is the loaded database there. On a throw, `logError('saveLoadPipeline could not start a new playthrough', { err })`, delete `playthrough_id`, and continue. If that delete also throws, rethrow and fail the load. `ensurePlaythroughId` covers a missing id and does not replace a present one.
4. `matchRecordStore.ts`: add `lastMatchRecordId(ops: BasicDbOps): number | null`, using `SELECT MAX(record_id) AS id FROM match_records`. Log `logTrace` with the null-or-number result. Give it an orienting block.
5. `RecordingHeader` lives in `src/shared/matchRecording.ts`. Add `playthroughId: string` there and in `parseHeader` in `matchRecordingFile.ts`, defaulting to `''` when the field is missing or not a string. Add `playthroughId: ''` to the header object in `matchRecordingSummary.test.ts`.
6. `matchRecordingExport.ts`:
   - `recordingFileName(matchId: string, playthroughId: string): string`. Clean both with one helper.
   - `writeMatchRecordingFile` writes `playthroughId: ensurePlaythroughId(args.ops)` into the header, after `matchId`.
   - `exportFinishedMatchRecordingIfNeeded` builds the target from both ids.
   - Replace `recordingRecordCount` with `recordingTail(filePath): { count: number; lastRecordId: number | null } | null`, returning null when the file cannot be read.
   - The file is current only when the tail's count equals `countMatchRecords(gameDbOps)` and its `lastRecordId` equals `lastMatchRecordId(gameDbOps)`.
   - Update the JSDoc of every function you change.

**Doc check:**

- `doc/match-recording.md`:
  - The file name sentence becomes "named `recording-{matchId}-{playthroughId}.agentwars-recording` (`recordingFileName`, `RECORDING_FILE_EXTENSION`)."
  - Add a paragraph after it: "`playthrough_id` in `game_config` (`PLAYTHROUGH_ID_CONFIG_KEY`) names one run of the match. A new match stores a new id (`resetGameForNewMatch`), and so does loading a save (`storeNewPlaythroughId`). Relaunching the app keeps the id. A match played to an ending twice from one save therefore leaves two files, and each holds the whole history from the match start."
  - Replace "A file whose record count matches `match_records` is left as it is. More rows, or a file that cannot be read, replace it." with: "A file whose record count and last record id both match `match_records` is left as it is. Any other file, or one that cannot be read, is replaced."
  - Add `playthroughId` to the `header` row of the line-kind table, and say it reads as empty in a file written before it existed.
- `doc/save-files.md`: after the `match_id` sentences, add: "The match row `playthrough_id` stays in the file too. A load replaces it with a new id (`storeNewPlaythroughId`), so the loaded match records to a new file. See [match-recording.md](match-recording.md)."

**Verification:** the Verification Bar.

---

## Phase 5: Summary Answers the Pilot's Questions

**Why:** The meta-plan's pilot asks: talk cost (the `talk` rows' total), what talk adds to orders (the `orders` total, run one minus run two), total cost, how much slower a turn is (wall-clock time, run one against run two, divided by turns), and recording size. `recording:summary` prints one row per seat and stage and a Total row. It has no stage subtotal. Its only time is the sum of each consult's `wallClockMs`, and consults run in parallel, so that sum is not elapsed time. Its "Frame JSON bytes" counts string length, not bytes.

**Edits:** `src/main/recorder/matchRecordingSummary.ts`, `src/main/recorder/matchRecordingSummary.test.ts`, `src/main/recorder/recordingSummaryCli.ts`, `doc/match-recording.md`

**Tests first (`matchRecordingSummary.test.ts`):**

1. A recording with records stamped `recordedAt` `2026-11-15T00:00:00.000Z` and `2026-11-15T00:10:00.000Z`, with last turn 4, gives `elapsedMs` 600000 and `elapsedMsPerTurn` 150000. The test helper hardcodes `recordedAt`, so these tests override it. `elapsedMs` is the last parseable `recordedAt` minus the first, in record order, floored at 0. That span includes idle time.
2. A recording with one record, or with unparseable `recordedAt` values, gives `elapsedMs` 0 and `elapsedMsPerTurn` 0.
3. Two `talk` consult events from different seats and one `orders` event give a `Stage talk` row whose `costUsd` sums both talk rows, and a `Stage orders` row. `'Stage'` fits `ConsultTotals.seatId` (`string`). The seat-id lint rule does not flag it. `'Total'` is already a label in this formatter.
4. The same recording's summed consult `wallClockMs` divided by `lastTurnNumber` is printed as `Consult wall-clock ms per turn`. That sum still adds overlapping consults.
5. The formatted text contains `Elapsed ms 600000`, `Elapsed ms per turn 150000`, `Consult wall-clock ms per turn`, and `Frame JSON characters`. No current test asserts the label `Frame JSON bytes`. Rename `framePayloadJsonBytes` to `framePayloadJsonCharacters` everywhere it is constructed or read. Stage rows go before the Total row, and the existing seat-row assertions still match.
6. The CLI prints the on-disk byte size of the path it was given (`Recording file bytes`). `npm run recording:summary` gunzips. The fixture `src/main/fixtures/recording-format-1.jsonl` is plain JSON lines, and the CLI already rejects it with `The recording file could not be read.` Gzip it to a temp path, the way the file test does, and run the CLI on that gzip.

**Steps:**

1. Add `elapsedMs` and `elapsedMsPerTurn` to `RecordingSummary`. `elapsedMs` is the last parseable `recordedAt` minus the first, in record order, floored at 0. `elapsedMsPerTurn` is `Math.round(elapsedMs / lastTurnNumber)`, or 0 when `lastTurnNumber` is 0. Also add `consultWallClockMsPerTurn`, `Math.round` of the Total row's summed `wallClockMs` divided by `lastTurnNumber`, or 0 when `lastTurnNumber` is 0.
2. Add `stageTotals: readonly ConsultTotals[]`, one per distinct stage, sorted by stage, with `seatId` set to `'Stage'`. Each row sums the same columns as a seat row, including `costUsd`.
3. Rename `framePayloadJsonBytes` to `framePayloadJsonCharacters`, and the printed label to `Frame JSON characters`.
4. In `formatRecordingSummary`, print `Elapsed ms {n}` and `Elapsed ms per turn {n}` after `Last turn`, then `Consult wall-clock ms per turn {n}`. After the seat rows, print the stage rows (`Stage\t{stage}\t…`) before the Total row.
5. In `recordingSummaryCli.ts`, print `Recording file bytes {n}` from `fs.statSync` of the path the CLI was given.

**Doc check (`doc/match-recording.md`):** in the `recording:summary` paragraph, list the new lines: "the elapsed time from the first record to the last, that time divided by the last turn, the summed consult wall-clock time divided by the last turn, the recording file's size in bytes, … one consult row per seat and stage, one subtotal row per stage, and a Total row." Rename "the JSON size of the frame payloads" to "the JSON length of the frame payloads, in characters." Add: "The elapsed time includes any time the app sat idle, so a pilot run should be played without pauses. The consult wall-clock total adds overlapping consults, so it is not elapsed time. Talk cost and orders cost are the `costUsd` sums on the stage rows. Subtracting one run's orders row from the other's stays a human step."

**Verification:** the Verification Bar. Gzip `src/main/fixtures/recording-format-1.jsonl` to a temp path, the way `matchRecordingFile.test.ts` does, and run `npm run recording:summary` on that gzip. It prints the new lines.

---

## Phase 6: Stop During a Talk Round Stops the Orders Call

**Why:** `runCommanderConsult` awaits `speakAndAwaitTalkRound` and then calls `executeAbortableConsult`. That function begins a new model-call scope, which `request.signal` does not abort. `stopAllPlanning`, `abandon`, and `resetCommanderPool` abort the pool controller and the scopes that exist, and during the talk wait no orders scope exists yet. So after Stop, the orders call still runs and is paid for, and its side effects are written. After New or Load, `requestOrdersFlow` captures `generationAtStart` after the wait, so even its guarded writes land in the new match. That breaks the talk plan's Locked Decision 6 (timeouts and stops are "handled exactly as today") and its rule that "A new match or a loaded save must never receive an old round's messages." The post-resolution paths are safe, because they pass `request.signal` into `requestOrders`.

The audit also found that no test runs the production consult path with a round. If the `speakAndAwaitTalkRound` line or the `talkRound: request.talkRound` lines in `readyIpcResolutionMapping.ts` were deleted, every test would still pass.

**Adds:** `src/main/openRouter/commanderPoolConsultContracts.test.ts`
**Edits:** `src/main/openRouter/commanderPoolConsult.ts`, `src/main/openRouter/commanderPoolSupport.ts`, `src/main/openRouter/commanderPoolSupport.test.ts` (add it if it does not exist)

**Tests first:**

1. `commanderPoolSupport.test.ts`: a new exported `consultStoppedWhileTalking(signal: AbortSignal, generationAtStart: number): boolean` returns:
   - `false` for a live signal and the current generation;
   - `true` for an aborted signal;
   - `true` after `getMatchGeneration()` has moved. The export is `advanceMatchGeneration`. Existing tests pass `'new_game'`. There is no `bumpMatchGeneration`.
2. `commanderPoolConsultContracts.test.ts`, a source-contract test that reads the TypeScript source with `fs.readFileSync`, in the style of `src/main/rendererChatPanelContracts.test.ts`:
   - In `commanderPoolConsult.ts`, `const generationAtStart = getMatchGeneration();` appears before `await speakAndAwaitTalkRound(`, which appears before `if (consultStoppedWhileTalking(`, which appears before `executeAbortableConsult(`.
   - In `src/main/ipc/readyIpcResolutionMapping.ts`, `talkRound: request.talkRound` appears at least twice.
   - In `src/main/openRouter/afterResolution.ts`, each `requestOrders(` call comes after a `speakAndAwaitTalkRound(` or `abstainAndAwaitTalkRound(` call in the same function. Split on `afterResolution` and `afterTacticalBeatResolution` only. `afterTacticalBeatResolution` does not contain the substring `afterResolution`.

   Write a comment at the top of the file that says why a source check is used: the production runner needs an API key and a model to run end to end, and a test must not make a paid call. Do not delete production code to prove the contract.

**Steps:**

1. In `commanderPoolSupport.ts`, add `consultStoppedWhileTalking`, with an orienting block and a `logTrace`. The file today imports `logError` only. Purpose: "Stop, New, and Load during a talk round must not start an orders call, because no orders scope exists yet for them to abort." It calls `getMatchGeneration()`.
2. In `runCommanderConsult`, directly before `await speakAndAwaitTalkRound(…)`, add `const generationAtStart = getMatchGeneration();`. Directly after the await, add:

   ```ts
   if (consultStoppedWhileTalking(request.signal, generationAtStart)) {
     logDebug('commanderPoolConsult stopped during the talk round', { seatId: request.seatId });
     return emptyConsultOutcome({ errorMessage: 'Cancelled', modelId });
   }
   ```

   There is no `'Cancelled'` string in `commanderPool.ts`. This outcome matches the shape `requestOrders` already produces on failure. Stop, New, and Load settle the seat before this continuation runs, so the pool does not apply the outcome. Update the function's JSDoc Expected outcome: "…or a cancelled outcome, with no model call, when the pool was stopped or the match changed while the seat waited on its talk round."

**Doc check:** `doc/hybrid-ai.md` says "Clicking Stop… or opening New aborts every in-flight opponent call sooner." Add after it: "A commander still waiting on its talk round starts no orders call after Stop, New, or Load." Search `doc/commander-messages.md` for its sentence on stopping during talk, and make it agree.

**Verification:** the Verification Bar. The contract test asserts the `if (consultStoppedWhileTalking(` text. Do not delete production code to prove it.

---

## Phase 7: Human Message Sending

**Why:** Four small gaps in how the player's messages are sent and cleaned:

- An AI-only battle beat uses the same commit IPC as the player's own beat, and `main.ts` calls `sendStagedHumanSideMessages(beatStep)` after every successful commit. A draft written for the next Ready is sent mid-battle, stamped with a battle the player is not in. The talk plan says the main process "sends it when the player commits a turn or a beat."
- `sendStagedHumanSideMessages` reads the roster outside its `try`, and its catch runs `ROLLBACK` unguarded. The talk plan says: "It never throws: catch, roll back, log … return 0."
- `cleanSideMessageText` cuts with `.slice(0, maxChars)`, which counts UTF-16 code units, so an emoji at the limit leaves a lone surrogate. The talk plan says it "cuts to `maxChars` characters."
- `requestTalk` logs `Sent 1 messages.`

**Edits:** `src/main/main.ts`, `src/main/sideMessages/humanSideMessages.ts`, `src/main/sideMessages/humanSideMessages.test.ts`, `src/shared/sideMessages.ts`, `src/shared/sideMessages.test.ts`, `src/main/openRouter/talk/requestTalk.ts`, `src/main/openRouter/talk/requestTalk.test.ts`, `src/main/tacticalBattle/opposingParty.ts`, `src/main/tacticalBattle/opposingParty.test.ts`

**Tests first:**

1. `src/shared/sideMessages.test.ts`: `cleanSideMessageText('a'.repeat(279) + '😀', 280)` keeps the emoji whole (281 UTF-16 units, 280 characters). `cleanSideMessageText('a'.repeat(280) + '😀', 280)` drops it and leaves no lone surrogate: assert no code unit in the result is between `0xD800` and `0xDFFF`. A grapheme made of several code points can still split. That is the stated rule.
2. `opposingParty.test.ts`: a new `battleHasPartySeat(battle, seatId): boolean` is true when `seatId` is `leadPartyId` or `opposingPartyId`. It is also true when `leadPartyId` is absent and `seatId` is the human seat. `tacticalBattlePartiesForOwners` omits `leadPartyId` on every human battle and sets it only when both owners are AI. A human-versus-AI snapshot does not put the human seat in either field. The missing-field fallback already in `opposingParty.ts` is `opposingPartyId` defaulting to the first AI seat, and it is not the lead. Tests: a human battle (no `leadPartyId`) returns true for the human seat; an AI-only battle returns false for the human seat and true for each party.
3. `humanSideMessages` test: with `side_messages` dropped from the temp database, `sendStagedHumanSideMessages` returns 0 and does not throw. With the roster table dropped, the same.
4. `requestTalk.test.ts` does not assert the sent-message line. Add a tested helper for `Sent 1 message.` and `Sent ${n} messages.` and use it at the log site.

**Steps:**

1. `src/shared/sideMessages.ts` `cleanSideMessageText`: cut by code points, with `Array.from(text).slice(0, maxChars).join('')`. Keep its other cleaning. Update the JSDoc: "cuts to `maxChars` characters, counting each code point once."
2. `opposingParty.ts`: add `battleHasPartySeat`, with an orienting block and a `logTrace`.
3. `main.ts`, in the `commitHumanTacticalDraftOrders` handler: gate only `sendStagedHumanSideMessages`. `recordTacticalBeat` still runs for an AI-only beat. Read `getActiveTacticalBattleSnapshot()` before the commit (the commit can end the battle). Send only when that snapshot exists, `activeHumanSeatId(readSeatRoster(gameDbOps))` is non-null, `beatStep` is non-null, and `battleHasPartySeat(preBattle, humanSeatId)` is true. The send stays inside the existing `result.success && beatStep && result.tacticalResolutionPlayback` condition. Add a one-line comment: "An AI-only beat commits through this channel too. The player's drafts wait for their own commit." If `main.ts` does not already import these helpers, import them. Do not move other code.
4. `humanSideMessages.ts` `sendStagedHumanSideMessages`: keep `ownTransaction` computed before the try. Move the roster read inside the try and before `BEGIN`. Wrap `ROLLBACK` in its own try, and log `humanSideMessages rollback failed` only when `ownTransaction` is true, matching the rollback catch in `talkRoundPersistence.ts`.
5. `requestTalk.ts`: use the helper. One message logs `Sent 1 message.` and any other count logs `Sent ${n} messages.`

**Doc check:** `doc/commander-messages.md` says when the player's drafts are sent. Add: "A beat of a battle between two AI sides does not send them." Search `doc/` for `Sent N messages` or the log sentence and fix the wording if it appears.

**Verification:** the Verification Bar.

---

## Phase 8: Talk Off, Talk Timeouts, and the Budget Case

**Why:**

- With `AGENT_WARS_DISABLE_TALK` set, the orders system prompt still says "You answer messages in the diplomacy step", and no diplomacy step exists. Locked Decision 3 drops that one sentence when talk is off.
- When the talk call's own deadline fires, `executeAbortableConsult` aborts the scope, and `requestTalk` maps the aborted signal to `cancelled`. Its `finally` then records a `consultation` event with outcome `cancelled`, while `runCommanderTalk` returns `timed_out`. The pilot reads those rows.
- Locked Decision 8 keeps the budget-exceeded behavior. It needs a sentence in the docs.

**Edits:** `src/main/openRouter/promptSpec/sideMessageRuleText.ts`, its test file, `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, `src/main/openRouter/promptSpec/coachingTextTactical.ts`, `src/main/openRouter/consultPromptParts.test.ts`, the other tests that assert those coaching texts (search for `SIDE_MESSAGE_RULE_BLOCK` in test files), `src/main/openRouter/modelCallControl.ts`, its test file, `src/main/ipc/modelConsultAttempt.ts`, `src/main/openRouter/talk/requestTalk.ts`, its test file, `doc/commander-messages.md`, `doc/ai-commander-prompts/talk-prompt.md` or the prompt document that lists the orders message rules (search for `diplomacy step`)

**Tests first:**

1. `sideMessageRuleText` test: `sideMessageRuleBlock({ talkStageEnabled: true })` ends with the sentence `You answer messages in the diplomacy step, not in your orders. Nothing in your orders reply is sent to another side.` `sideMessageRuleBlock({ talkStageEnabled: false })` contains all six source and trust bullets, ends with `Nothing in your orders reply is sent to another side.`, and does not contain `diplomacy step`. Neither contains a digit.
2. `modelCallControl` test: a new `abortModelCallForDeadline()` on a begun call aborts its signal, and `modelCallHitDeadline(signal)` is true for that signal. A plain `abort()` and a `cancelModelCalls` abort leave `modelCallHitDeadline` false.
3. `requestTalk` test: when the signal was aborted by `abortModelCallForDeadline`, the outcome reason is `timed_out` and the recorded telemetry outcome is `wallClock`. A plain abort still gives `cancelled`.

**Steps:**

1. `sideMessageRuleText.ts`: turn `SIDE_MESSAGE_RULE_BLOCK` into `sideMessageRuleBlock(args: { readonly talkStageEnabled: boolean }): string`. Keep the text byte for byte when talk is on, including the four-space indent. It contains no digit. When talk is off, the last line is `    Nothing in your orders reply is sent to another side.`. Keep `SIDE_MESSAGE_SOURCE_BULLETS` and `SIDE_MESSAGE_TRUST_BULLETS` as they are. `consultPromptParts.test.ts` imports the constant today. Update it to call the function with talk on.
2. `coachingTextStrategic.ts` and `coachingTextTactical.ts`: call `sideMessageRuleBlock({ talkStageEnabled: isTalkStageEnabled() })` inside `buildStrategicContextCoaching` and `buildTacticalContextCoaching`. The block is not a module-level constant. `isTalkStageEnabled` is exported from `src/main/openRouter/commanderPoolRounds.ts`. A direct import does not form a cycle on the current graph. If `check:circular` reports a new cycle, move `isTalkStageEnabled` and its env-flag read into a new `src/main/openRouter/talkStageSwitch.ts`, re-export it from `commanderPoolRounds.ts`, and import the new file. The flag does not change while the process runs.
3. `modelCallControl.ts`:
   - Add a module-level `WeakSet<AbortSignal>` of signals aborted by a deadline.
   - Add `abortForDeadline()` to the begun call. It adds the signal to the set and aborts.
   - Export `modelCallHitDeadline(signal: AbortSignal | undefined): boolean`.
   - Do not pass a reason to `controller.abort`. `fetch` would reject with that reason instead of an `AbortError`, and other code checks for `AbortError`.
4. `modelConsultAttempt.ts`: in the timeout handler, call `scope.abortForDeadline()` instead of `scope.abort()`. That handler is shared with orders consults, so orders timeouts are marked too. Orders code does not read `modelCallHitDeadline`. Leave the orders result as `{ ok: false, timedOut: true }`.
5. `requestTalk.ts`: in `silenceReasonForTransport` and in the `catch`, return `timed_out` when `modelCallHitDeadline(signal)` is true, before the `cancelled` check. The `finally` already maps `timed_out` to telemetry `wallClock`. Do not add a second outcome write. Leave the early synchronous `signal.aborted` return as `cancelled`.

**Doc check:**

- The prompt document that lists the orders message rules says the block ends with the diplomacy sentence. Add: "With `AGENT_WARS_DISABLE_TALK` set, that sentence is left out (`sideMessageRuleBlock`). The source and trust bullets stay."
- `doc/commander-messages.md`:
  - Add, where it describes the off switch: "The orders system prompt still carries the message rules, so a run with talk off still pays for them. A pilot comparison of orders cost with talk on and off measures what talk adds, not what the message rules cost."
  - Add, where it says when messages are marked read: "An orders consult that stops at the tool budget still marks the messages it showed as read, because the model saw them."
  - Add, where it describes talk telemetry: "A talk call that hits its own deadline records outcome `wallClock`. A stop records `cancelled`."

**Verification:** the Verification Bar. Also grep `src/` for `SIDE_MESSAGE_RULE_BLOCK`. Nothing may still import it.

---

## Phase 9: Prompt Documents Match the Builders

**Why:** The builders under `src/main/openRouter/` win when `doc/ai-commander-prompts/` drifts from them. The audit found four kinds of drift:

- `tactical-prompt.md` says Callbacks and Messages holds "message discipline (item 9)". `coachingTextTactical.ts` has only the callback, unconsulted-beat, and exit-battle bullets there. Item 9 now lives in the message rule block in Battle Context.
- `example-strategic-prompt.md` and `example-tactical-prompt.md` paraphrase the rule block as one line, and the real block has many lines. They also show an Orders Guidance bullet "You answer messages in the diplomacy step…" that no builder emits. In the strategic builder, `messages = [TOOL_BUDGET_BULLET]`.
- `assembly-contract.md` and `source-inventory.md` still name "the message" (the deleted taunt block) in their assembly order.
- `strategic-prompt.md` says "goals, strategy, and the message always", and it lists item 15 under `# Orders Guidance`, although the rule lives in Strategic Context.

**Edits:** `doc/ai-commander-prompts/tactical-prompt.md`, `doc/ai-commander-prompts/example-strategic-prompt.md`, `doc/ai-commander-prompts/example-tactical-prompt.md`, `doc/ai-commander-prompts/assembly-contract.md`, `doc/ai-commander-prompts/source-inventory.md`, `doc/ai-commander-prompts/strategic-prompt.md`

**Steps:**

1. Read `src/main/openRouter/promptSpec/sideMessageRuleText.ts`, `coachingTextStrategic.ts`, and `coachingTextTactical.ts` as they are after Phase 8.
2. `tactical-prompt.md`: the Callbacks and Messages entry lists items 7, 8, and 10 only. Say where item 9 is: "Item 9 is carried by the message rule block in Battle Context (`sideMessageRuleBlock`)."
3. In both example prompts, replace the one-line paraphrase with the real block text, as `sideMessageRuleBlock({ talkStageEnabled: true })` produces it, copied character for character. Delete the invented Orders Guidance bullet.
4. `assembly-contract.md` and `source-inventory.md`: replace the assembly-order phrase "the message" with "the message rules (`sideMessageRuleBlock`)". Leave "a copy of the message array" and the ignored reply `message` key. Where the Strategic Context sentence already continues with `Messages from other sides:`, do not leave two phrases for the same block.
5. `strategic-prompt.md`: replace "goals, strategy, and the message always" with "goals and strategy always". Move item 15 out of the `# Orders Guidance` list into the Strategic Context list, where `coachingTextStrategic.ts` puts the rule block.
6. Search `doc/ai-commander-prompts/` for `SIDE_MESSAGE_RULE_BLOCK`, `MESSAGE_BLOCK`, `taunt`, and `"message"` as a reply field, and fix any remaining reference.

**Verification:** the Verification Bar (the docs are not tested, so this checks nothing else broke). Then read each edited section once against the builder it describes.

---

## Phase 10: Chat Panel Correctness

**Why:**

- **Stale names.** The recipient drop-down rebuilds only when its seat-id list changes, and labels each option at rebuild time. AI seat ids are fixed (`AI_SEAT_IDS`), and New game does not reload the window, so a new match with the same number of AI sides keeps the previous match's names. A mid-match nickname edit is not shown either. The history's key is the viewer plus the message ids, so rows already painted keep old names. The chat plan says a side's name on screen is `sideDisplayName` "everywhere this plan shows a side."
- **Visibility after a snapshot.** `syncChatPanelVisibility` reads `matchLoaded` from `S.gameState`. Nothing calls it when `applyGameStateSnapshot` sets `S.gameState`. At startup, the chat refresh can land before the first snapshot, and the panel stays hidden. After a Load reload it recovers only because a toast happens to show and hide.
- **Dead and stale text.** `ConsoleReportMeta.messageText` has no caller, and its branch draws a quoted single message, which the chat plan forbids ("Do not wrap the lines in one pair of quotes"). Comments still describe the zoom buttons and the single message. `CommanderDispatch`'s JSDoc is stranded above another type.
- **Tests.** Nothing tests the stage and cancel payload guards in `sideMessageIpcHandler.ts`. `consoleReports.ts` renders message text but has no "no `innerHTML`" contract.

**Edits:** `src/shared/chatPanelState.ts`, `src/shared/chatPanelState.test.ts`, `src/renderer/chat/chatPanel.ts`, `src/renderer/core/stateSnapshot.ts`, `src/shared/commanderStatus.ts`, `src/renderer/chrome/consoleReports.ts`, `src/shared/aiStrategyToastContent.ts`, `src/renderer/openRouter/commanderMessageTabsUi.ts`, `src/renderer/map/worldLeafletMap.ts`, `src/renderer/openRouter/mapToastWheel.ts`, `src/shared/mapToastWheel.ts`, `scripts/ui-smoke/ui-smoke-console-checks.cjs`, `src/main/ipc/sideMessageIpcHandler.test.ts`, `src/main/rendererMessageDialogContracts.test.ts`, `src/main/rendererChatPanelContracts.test.ts`

**Tests first:**

1. `chatPanelState.test.ts`: a new `chatNamedSeatKey(seatIds, nameOf): string` returns different keys for the same ids with different names, the same key for the same ids and names, and different keys for the same names in a different order. Use a separator that cannot appear in a name (`'\u0000'`).
2. `rendererChatPanelContracts.test.ts`:
   - `chatPanel.ts` builds the recipient key and the history key with `chatNamedSeatKey`, and no longer contains `ids.join('\n')`.
   - `stateSnapshot.ts` calls `syncChatPanelVisibility()` inside `applyGameStateSnapshot`, after `S.gameState` is assigned.
3. `rendererMessageDialogContracts.test.ts`: add `src/renderer/chrome/consoleReports.ts` to the files checked for `innerHTML`, `insertAdjacentHTML`, and `outerHTML`. Assert it no longer contains `messageText`.
4. `sideMessageIpcHandler.test.ts`: register the handlers against a fake `IpcMain` that stores each handler by channel (follow how the file already builds snapshots, or how another `*IpcHandler.test.ts` fakes `IpcMain`), then:
   - a stage payload that is not an object, or has a non-string `toSeatId`, returns `{ success: false, reason: 'Invalid message.' }`;
   - a cancel payload with a non-string `toSeatId` returns without error and leaves a staged draft in place.

   Read the handler to confirm the exact refusal sentence before you write the test.

**Steps:**

1. `chatPanelState.ts`: add `chatNamedSeatKey(seatIds: readonly string[], nameOf: (seatId: string) => string): string`, with an orienting block. It joins `seatId + '\u0000' + nameOf(seatId)` with `'\u0001'`.
2. `chatPanel.ts`:
   - `renderRecipient` uses `chatNamedSeatKey(ids, seatName)`.
   - `renderHistory`'s key adds `chatNamedSeatKey` of the distinct seat ids that appear in the messages (both senders and recipients) to the viewer and message ids.
   - Update the two JSDoc blocks: "rebuilt when the side list or a side's name changes."
3. `stateSnapshot.ts`: import `syncChatPanelVisibility` from `../chat/chatPanelVisibility` and call it at the end of `applyGameStateSnapshot`, after `S.gameState` is set. That call does not show the panel during playback or a map toast. Game over stays hidden by the `#game-over-overlay` rule in `static/chatChrome.css`. Do not add a second game-over check. The direct import does not form a new cycle. If `check:circular` reports one, revert this step, and instead call it at the end of the initial load in `src/renderer/map/initCore.ts` and after the new-game start in the renderer's new-game flow. Then change the contract test to match, and record the move. `sideDisplayName` strips NUL and U+0001, so the `chatNamedSeatKey` separators do not collide with a name the panel can show.
4. `commanderStatus.ts`: move the `CommanderDispatch` JSDoc block down so it sits directly above `export type CommanderDispatch`.
5. `consoleReports.ts`: delete `messageText` from `ConsoleReportMeta`, delete the quoted fallback (`const quoted = lines.length === 0 ? (meta.messageText?.trim() ?? '') : '';` and its drawing), and change `meta?.messageText !== undefined || meta?.messages !== undefined` to `meta?.messages !== undefined`. Update each JSDoc that names `messageText`. Run `npm run build:renderer`. It must find no other user.
6. Comments:
   - `aiStrategyToastContent.ts`: replace "The message this commander sent to the human player in this wave…" with a sentence about the messages it sent in this wave, as the code now holds them.
   - `commanderMessageTabsUi.ts`: replace "that dispatch's Message, then Strategy" with "that dispatch's Messages, then Strategy".
   - `worldLeafletMap.ts`: replace "to the left of the zoom buttons" with "below the chat panel". Replace the option comment "The main map zooms from the wheel, from Shift-drag, and from the +/− buttons added below. There is no second control." with "The main map zooms from the wheel, from Shift-drag, and from the zoom keys. There is no on-screen control." Phase 11 adds the keys. Write this text now anyway.
   - `src/renderer/openRouter/mapToastWheel.ts`, `src/shared/mapToastWheel.ts`, `scripts/ui-smoke/ui-smoke-console-checks.cjs`: replace each whole comment sentence. A substring replace in the renderer file would leave "and takes the pointer…", and in the smoke file would leave "The update toast" in front of the new sentence. The new sentence is "The toast takes the map's bottom-right corner, and the chat panel hides while it shows."

**Doc check:** `doc/ux/chat-panel.md`: under Requirements, add "Side names in the drop-down and the history follow `sideDisplayName` after New game and after a nickname edit." and "The panel's visibility is set again whenever a match snapshot is applied."

**Verification:** the Verification Bar, then `npm run ui:smoke`, which must pass, or pass up to the step Phase 1 recorded.

---

## Phase 11: Zoom Keys

**Why:** Removing the + and − buttons removed the only zoom that does not need a pointer. Both maps set Leaflet `keyboard: false`, and no key zooms. The meta-plan says "The wheel and the keyboard still zoom", and `doc/ux/map-surface.md` says "The wheel and the keys in input-map.md zoom the map." Locked Decision 4 adds the keys.

**Adds:** `src/shared/mapKeyboardZoom.ts`, `src/shared/mapKeyboardZoom.test.ts`, `src/main/mapKeyboardZoomWiringContract.test.ts`
**Edits:** `src/renderer/map/initCore.ts`, `src/renderer/map/worldLeafletMap.ts`, `doc/ux/input-map.md`, `doc/ux/map-surface.md`

**Tests first:**

1. `mapKeyboardZoom.test.ts`, for `mapZoomKeyStep(args: { key: string; code: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): 1 | -1 | null`:
   - `+` and `=` give `1`, and `-` gives `-1`;
   - code `NumpadAdd` gives `1`, and code `NumpadSubtract` gives `-1`;
   - Ctrl, Alt, or Meta held gives `null` for each of those;
   - `w`, `t`, `Enter`, and `_` give `null`.
2. `mapKeyboardZoomWiringContract.test.ts`, in the style of `src/main/mapKeyboardPanWiringContract.test.ts`:
   - in `initCore.ts`, `mapZoomKeyStep(` appears after `if (e.repeat) return;` and before `if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;`;
   - in `initCore.ts`, `zoomMainMapByKeyStep(` is called;
   - in `worldLeafletMap.ts`, `MAP_KEYBOARD_ZOOM_STEP` is used.

**Steps:**

1. `src/shared/mapKeyboardZoom.ts`:
   - Export `MAP_KEYBOARD_ZOOM_STEP = 0.5`. Its JSDoc says it equals the main map's `zoomDelta`, so one press matches one step of the removed button.
   - Export `mapZoomKeyStep`. Shift does not turn it off, because `+` needs Shift on many layouts.
2. `worldLeafletMap.ts`:
   - Export `zoomMainMapByKeyStep(step: 1 | -1): void`. It does nothing when the main map is missing. Otherwise it calls `setZoom(getZoom() + step * MAP_KEYBOARD_ZOOM_STEP)`. Leaflet clamps that to `minZoom` and `maxZoom`.
   - Replace the literal `zoomDelta: 0.5` with `zoomDelta: MAP_KEYBOARD_ZOOM_STEP`, so the two cannot drift.
3. One `zoomMainMapByKeyStep` on the main map covers strategic and tactical play. The battle uses that same map. Do not add a battle listener, and do not zoom the minimap. `zoomSnap` is 0.25 and `zoomDelta` is 0.5, so `setZoom(getZoom() + step * MAP_KEYBOARD_ZOOM_STEP)` matches one step of the removed button. In `initCore.ts`, in the global `keydown` handler: after `if (e.repeat) return;` and before the modifier gate, add:

   ```ts
   const zoomStep = mapZoomKeyStep({ key: e.key, code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey });
   if (zoomStep !== null) {
     e.preventDefault();
     zoomMainMapByKeyStep(zoomStep);
     return;
   }
   ```

   It sits after `shouldIgnoreGlobalKeydown`, so the keys do nothing while the chat field, a select, or another editable control has focus. It sits after the repeat check, so holding a key gives one step. Read the handler first. If an overlay check before `shouldIgnoreGlobalKeydown` already returns for the cases where pan is off, the zoom keys inherit it. Do not add separate overlay checks.

**Doc check:**

- `doc/ux/input-map.md`: add a Keyboard row after the pan row. Input: `=`, `+`, `-`, numpad `+` and `-`. Context: "Same as pan, except Shift does not turn them off". Result: "Zooms the main map in or out by one step (`MAP_KEYBOARD_ZOOM_STEP`, the map's `zoomDelta`). Holding a key gives one step. Ctrl, Alt, and Meta turn them off, so the app's own zoom shortcuts are unchanged. These keys do nothing while the chat panel's text field, drop-down, or another editable control has focus." Details In: `map-surface.md`.
- `doc/ux/map-surface.md`: replace "The wheel and the keys in [input-map.md](input-map.md) zoom the map." and the trailing "Shift-drag zooms the map too." with one sentence at the start of that bullet: "The wheel, Shift-drag, and the zoom keys in [input-map.md](input-map.md) zoom the map. There is no on-screen zoom control."
- Search `doc/` for `zoom buttons`, `+ and −`, and `keyboard zoom`, and fix any sentence the change makes wrong. Leave release notes alone.

**Verification:** the Verification Bar, then `npm run ui:smoke`.

---

## Phase 12: UX and Recorder Document Drift

**Why:** The chat plan's doc steps were only partly carried out, and four recorder sentences disagree with the code.

**Edits:** `doc/ux/chat-panel.md`, `doc/ux/modes-and-transitions.md`, `doc/ux/control-tooltips.md`, `doc/match-recording.md`, `doc/save-files.md`

**Steps:**

1. `doc/ux/chat-panel.md`:
   - The chat plan says to "copy the headings of `doc/ux/selection-panel.md` exactly." Split Inputs and Responses into `### Mouse` (expand, drop-down, send, edit, ×, wheel over the history), `### Keyboard` (Enter, Shift+Enter, Tab order, map keys suppressed), and `### Other`, matching `selection-panel.md`. Move the bullets and change no wording, except to drop a word that names its own group.
   - Add to Code Entry Points: `src/main/ipc/sideMessageIpcHandler.ts`, `src/shared/sideMessages.ts` (`sideMessageVisibleTo`), and `src/renderer/gameplay/selectionPanel.ts` (the caller that wires the panel). Confirm each name in the file first.
2. `doc/ux/modes-and-transitions.md`:
   - In New game only, change "The console and the selection panel are not on screen" to "The console, the selection panel, and the chat panel are not on screen". The Game over sentence already lists the chat panel. A file-wide replace would double it.
   - In Strategic planning and Tactical planning, add one sentence each: "The chat panel is at the map's bottom-right ([chat-panel.md](chat-panel.md))."
3. `doc/ux/control-tooltips.md`: add `src/renderer/chat/chatPanel.ts` (`syncExpandControl`) to Source Anchors, because "Hide the message history." is set there and not in `static/index.html`.
4. `doc/match-recording.md`:
   - Replace "An owner with no rows writes no event." with: "The human seat writes no event when those tables are empty. An AI owner writes one event for each set of orders it returned, even an empty one." Confirm this against `recordStrategicOrders` before you write it.
   - After the sentence "Raising a payload version does not raise the file layout version.", add: "Raise a payload's version when a field is renamed, removed, or changes meaning. Adding a field does not need one. When you raise it, keep a recording file written at the old version in `src/main/fixtures`, and keep a test that parses it."
5. `doc/save-files.md`:
   - The `withAutoSaveAfter` paragraph says it "records a history frame for the step it finds before the handler runs, and another frame after the handler when the step has changed." `recordStepBoundary` writes a frame only when the step differs from the latest frame's step, plus one final frame when the match has just ended. Replace that sentence with: "`withAutoSaveAfter` calls the history boundary before and after the handler. Each call writes a frame only when the step differs from the latest frame's step, and writes the final frame and `match_ended` when the match has just ended ([match-recording.md](match-recording.md))."
   - After the `match_id` sentences, add: "A loaded match keeps the history the save carried. New rows follow it from the loaded turn." Phase 4 has already added the playthrough sentence. Put this one before it.

**Verification:** the Verification Bar. Read each edited section once against the code it names.

---

## Phase 13: Final Verification and Hand-off

**Edits:** this plan's Completion Log and Defect Inventory only.

1. Run the full Verification Bar and `npm run ui:smoke`. Record the results.
2. Search the working-tree diff (`git diff`) for plan vocabulary (`Phase`, `finding`, `audit`, `defect inventory`) in `src/`, `static/`, `scripts/`, and `doc/`. Remove any match that is plan vocabulary. Do not search for the bare word `plan`. Product text uses it for planning and for the commander's plan.
3. Search the diff for logging of message text, stance reasons, match ids, or playthrough ids. Remove any.
4. Confirm each meta-plan claim by reading the code once more, and write one line per claim in the Completion Log:
   - **Recorder:** nothing under `src/main/recorder/` can throw into a turn, and nothing it writes can contain a machine-local config row.
   - **Talk:** in every consult path, no orders call can start before the wave's talk round has closed, and none starts after Stop, New, or Load during that wait. An AI commander's prompt can contain only messages addressed to it or sent by it. Both prompts show that history, and both system prompts carry the source and trust text.
   - **Chat:** the renderer never receives a message the viewer may not see, and message text reaches the DOM only through `textContent`.
5. List every `doc/` file this plan changed in the Completion Log.
6. Hand the user this manual checklist. Do not run it.
   1. Start a match against two AI sides. Press `=`, `+`, `-`, numpad `+`, and numpad `-` on the map. Each press zooms one step. Click into the chat field and press them again. Nothing zooms.
   2. Rename an AI side on its commander card. The chat drop-down and the history show the new name.
   3. Start a new match with the same number of AI sides on different homes. The drop-down shows the new names.
   4. Save on turn 2. Play until a side is knocked out, then choose End Match in the knocked-out dialog. (There is no End Match item in the game menu.) A file named `recording-{match}-{playthrough}.agentwars-recording` appears under `userData/recordings`.
   5. Load the turn 2 save. Play to an ending again. A second file appears, and the first is unchanged.
   6. Run `npm run recording:summary -- <second file>`. It prints the elapsed lines, the per-turn line, and a `Stage` row for each stage.
   7. Stage a message to an AI side, then let an AI-only battle beat run before you press Ready. The message is still staged. Press Ready. It is sent.
   8. Start a turn, and press Stop while the console shows the talk step. No orders call for that turn appears in `debug.log` after the stop.
   9. Restart the app with a match open. The chat panel is visible as soon as the map draws.

---

## Reliability Checklist

- [ ] Every phase took a backup before its first edit.
- [ ] Every phase wrote its tests first, and saw each fail for the stated reason or recorded why it could not.
- [ ] `check:circular` printed exactly the Phase 0 cycles after every phase.
- [ ] No baseline file was edited.
- [ ] No production log line contains message text, a stance reason, a match id, or a playthrough id.
- [ ] No `innerHTML`, `insertAdjacentHTML`, or `outerHTML` was added under `src/renderer`.
- [ ] `EXPECTED_USER_VERSION` is still 26, and `getFullDdl` is unchanged.
- [ ] `RECORDING_FILE_FORMAT_VERSION` is still 1, and the existing fixture still parses.
- [ ] No paid model call was made.

## Success Definition

- `npm test`, `npm run build:renderer`, and `npm run ui:smoke` pass, and `check:circular` prints only the three cycles that existed before this plan.
- Each of the meta-plan's three claims holds, with the talk claim extended to Stop, New, and Load during the talk wait.
- A second playthrough of a match never replaces the first playthrough's recording.
- `recording:summary` prints, for each run, the pilot measures: talk cost and orders cost as the stage-row `costUsd` sums, total cost, elapsed time per turn, consult wall-clock time per turn, the printed frame length, and the printed on-disk file size. `check:circular` still exits 1 and prints only the three Phase 0 cycles.
- Every `doc/` sentence this audit found wrong is corrected, and no plan vocabulary entered the tree.

---

## Defect Inventory

Record anything found while running this plan that it does not fix: the phase, the file, what is wrong, and why it was left.

| Phase | File | What is wrong | Why it was left |
| --- | --- | --- | --- |
| 0 | — | `npm run ui:smoke` was not captured before the edits. | The baseline `npm test` still held `dist/` when the source edits began. The post-change smoke run is the gate. |
| 1 | `scripts/ui-smoke/ui-smoke-beat-limit.cjs` | The first stop is `waitForBattleStatus` in `runBeatLimitBattleScenes`, after Fight, expecting the header to start with `Beat 1 · Tactical planning`. The header was `Beat 1 (29 left) · Tactical planning`. The run had 758 passes and 0 failures, including `minimap-has-no-zoom`. A later run of the same scene waited out the `Tactical battles` dialog instead. Neither threw the land-unit error. | The gate from here is every check before that step, and no new check fails. The notice window was not widened. |
| 4 | `src/main/saveGame/saveLoadPipeline.ts` | If storing a new playthrough id throws and deleting the saved id also throws, the load returns `failedLoad(LOAD_FAILED_MESSAGE)` after the database has already been replaced. | `runLoadGame` is documented as throwing nothing. A second throw would leave the pipeline. The saved id is not kept. |
| 4 | `src/main/recorder/matchRecordingExport.test.ts` | The same-count rewrite deletes the earliest row, not the last. | Deleting the last row removes `match_ended`, and the export then writes nothing. The earliest-row delete keeps that event, keeps the count, and changes the last record id. |

## Completion Log

| Phase | Result | Differences from the plan | Extra files touched | Notes |
| --- | --- | --- | --- | --- |
| 0 | Baseline `npm test` passed on the pre-change build. `build:renderer` passed. `check:circular` exited 1 with the three cycles below. | No backup. `ui:smoke` was not run before the edits. The working tree already had the filed prior plans moved under `.spec/completed/2026-11/`. Those moves were left alone. | — | Cycles: `orderlessUnitSuggestions.ts` through `standingOrdersInjectionText.ts`; `openRouterUiHelpers.ts` through `basemapLayer.ts`; `openRouterUiHelpers.ts` through `selection.ts`. |
| 1 | Homes are pinned only after the Global-tab `addSidesUntil(page, 4)`. The battle helper names the land-unit counts. `minimap-has-no-zoom` is in `MAP_CHROME_CHECKS`. | Tests were not seen failing first. The beat-limit scene is the recorded stop, not a passing gate. | — | Every check before `waitForBattleStatus` passed: 758, including `minimap-has-no-zoom`. |
| 2 | A failed step read and a failed human-order read are logged and return empty. `consultStillOnOpenMatch` returns false when its read throws, and that false does not undo the consult. | — | — | The Ready test asserts an orders event for the AI seat that had pending orders, and at least one frame. |
| 3 | The export renames over the target. End Match passes `hasDeferredPlaybackConsultPending`. | The red check is a source assertion. The double-write and directory-target cases already passed before the delete line was removed. | — | — |
| 4 | A playthrough id is stored on a new match and replaced on load. The file name uses both ids. A file is current only when the count and the last record id match. | The playthrough test file is `gameConfigKvPlaythrough.test.ts`. A dotted stem fails the path-casing lint. A second failure on load returns `failedLoad` rather than throwing. | `doc/match-recording.md`, `doc/save-files.md` | Ids are not logged. |
| 5 | The summary prints elapsed time, both per-turn figures, stage rows, frame JSON characters, and the on-disk size. | — | `doc/match-recording.md` | — |
| 6 | A stop or a new generation during the talk wait returns before the orders call. | — | — | The contract test reads the source order. Production code was not deleted to prove it. |
| 7 | Message text is cut by code point. A human battle with no lead party still includes the human seat. An AI-only beat does not send staged drafts. | The missing-table case uses two seats. One seat cannot start a match. | `doc/commander-messages.md` | — |
| 8 | Talk off drops only the diplomacy sentence. A deadline abort records `wallClock`. A plain abort records `cancelled`. | — | `doc/commander-messages.md` and the prompt documents that named the old constant | `check:circular` did not gain a cycle, so the talk-stage flag stayed in `commanderPoolRounds.ts`. |
| 9 | The prompt documents name `sideMessageRuleBlock`, and the example prompts carry the talk-on block. | — | `crosswalk.md`, `information-decision-model.md` | Those two still named the old constant. |
| 10 | The recipient and history keys include side names. A snapshot syncs the panel. The quoted single-message report is gone. | — | The comment files named in the phase | — |
| 11 | `=` `+` `-` and the numpad keys zoom the main map by `MAP_KEYBOARD_ZOOM_STEP`, after a repeated key is ignored and before the modifier gate. | — | `doc/ux/input-map.md`, `doc/ux/map-surface.md` | — |
| 12 | The chat inputs are split into Mouse, Keyboard, and Other. The recorder and save sentences match the code. | — | — | — |
| 13 | `npm test` passed. `build:renderer` passed. `check:circular` still exits 1 with only the three cycles from phase 0. The smoke gate is the 758 checks before `waitForBattleStatus`, including `minimap-has-no-zoom`, with no new failure. | Backups were not taken. Most tests were written with the implementation, because the baseline suite held `dist/`. | — | Recorder: nothing under `src/main/recorder/` throws into a turn, and a frame does not write a machine-local config row. Talk: no orders call starts before the wave's talk round closes, and none starts after Stop, New, or Load during that wait. A commander's prompt holds only messages addressed to it or sent by it, both prompts show that history, and both system prompts carry the source and trust text. Chat: the renderer never receives a message the viewer may not see, and message text reaches the DOM only through `textContent`. Docs changed: `doc/match-recording.md`, `doc/save-files.md`, `doc/commander-messages.md`, `doc/ai-commander-prompts/strategic-prompt.md`, `doc/ai-commander-prompts/tactical-prompt.md`, `doc/ai-commander-prompts/example-strategic-prompt.md`, `doc/ai-commander-prompts/example-tactical-prompt.md`, `doc/ai-commander-prompts/assembly-contract.md`, `doc/ai-commander-prompts/source-inventory.md`, `doc/ai-commander-prompts/crosswalk.md`, `doc/ai-commander-prompts/information-decision-model.md`, `doc/ux/chat-panel.md`, `doc/ux/input-map.md`, `doc/ux/map-surface.md`, `doc/ux/modes-and-transitions.md`, `doc/ux/control-tooltips.md`. The diff of `src/`, `static/`, `scripts/`, and `doc/` has no new plan vocabulary. New logs do not include a match id or a playthrough id. |
