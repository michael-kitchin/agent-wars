# Finished Match Save, Load, and Replay Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** A player can save a finished match, load it later, and replay it.

1. **Save.** Save game… works once the match is over. Today it is disabled with "The match is over, so there is nothing to save." The file is an ordinary `.agentwars` save. It already carries the whole match history (`match_records`), which replay reads.
2. **Load.** Loading a finished match opens on the results screen, exactly as if the match had just ended. That path already exists: a loaded file reloads the window, and a database with `game_over = 1` opens the new-game overlay with the Result section. This plan keeps it and adds two safeguards:
   - a loaded finished match keeps its playthrough id;
   - an export never replaces a recording file with a shorter one.
3. **Replay.** Replay already opens over a finished match. Today the results screen stays on top on every step, and the map draws the next-game preview instead of the match. After this plan:
   - **Every step before the last:** the results screen is set aside. The map, the top bar, and the console look as they did during the game, the same as replay during a live match.
   - **The last step:** the results screen is shown, over the finished match's final map.
   - **Leaving replay:** puts back the normal game-over view, with the next-game preview.

**Shape:**
- Phase 0 records a baseline.
- Phase 1 allows saving a finished match.
- Phase 2 makes loading a finished match safe for its recording.
- Phase 3 lets replay draw the match while the results screen is open.
- Phase 4 sets the results screen aside on every replay step but the last.
- Phase 5 adds UI smoke scenes and checks.
- Phase 6 updates the docs, runs the final checks, and hands off.

Phases 1 and 2 are main-process and shared work. They can be verified without the renderer. Phase 3 changes nothing a player can see outside replay. Phase 4 depends on Phase 3. Phase 5 depends on Phase 4.

**Tech:** TypeScript (Electron main, renderer, and shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`, Playwright UI smoke scripts (CommonJS).

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`. Search with `Get-ChildItem -Recurse src -Include *.ts | Select-String -Pattern '<text>' -SimpleMatch`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names.
  - Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`.
  - Never run test files the phase does not name.
  - The user runs the full test pass and the UI smoke afterwards.
- **Stop only when a check fails** and you cannot fix it within the phase's rules. Then:
  1. revert that phase (see Backup and Revert);
  2. record the failure in the Defect Inventory;
  3. stop, and tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, `git mv`, `git rm`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything.
  - Each phase lists the files it **Edits** and the files it **Adds**.
  - Do not edit other files, with one exception: removing an import that lint reports unused in a listed file. Record every such file in the Completion Log.
- Find code by the quoted text or the symbol name, not by a line number.
- **Code blocks are sketches** unless marked **Exact**.
  - Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log.
  - Text marked **Exact** is copied character for character, including punctuation and spacing.
- **Do not start the app.** No test may call a real model.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edits** list.

```powershell
$step = '1'
$files = @('src/shared/saveLoadAvailability.ts', 'src/shared/saveLoadAvailability.test.ts')
$backup = Join-Path $env:TEMP "aw-finished-replay\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase:
1. copy the backups back: `foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }`;
2. tell the user which files the phase **added**, so they can delete them. Do not delete them yourself.

Phases 3 and 4 also rebuild `static/renderer.js`. After reverting either one, run `npm run build:renderer` again.

---

## Verification

### Database tests

Tests that open a database load `better-sqlite3`. The native module in `node_modules` is built for Electron, and the user may have the app open, so **do not rebuild it**. Run those tests with Electron acting as Node:

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& node_modules\electron\dist\electron.exe dist\main\saveGame\saveFileWrite.test.js
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

- Always remove the variable afterwards, even after a failure.
- Run every test under `src/main` this way. Run tests under `src/shared` with plain `node dist/shared/<path>.test.js`.

### Phase Check

Every phase from 1 to 6 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run naming:check
npm run check:circular
```

- **Shared or renderer files.** When the phase edits or adds a file under `src/shared` or `src/renderer`, also run `npm run check:renderer-types` and then `npm run build:renderer`.
- **Tests.** Then run every test file the phase lists under **Tests to run**, and no others. All must pass.
- `check:circular` must print **no** new cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- Record each Phase Check result in the Completion Log.

---

## Locked Decisions

The user made these decisions. Do not reopen them.

| Question | Decision |
| --- | --- |
| Which file holds a finished match | The ordinary `.agentwars` save. Recording files (`.agentwars-recording`) are **not** loadable. |
| Results screen on the last replay step | Shown as the player left it: expanded or collapsed, same scroll position. The plan never calls `expandNewGameDialog` or `scrollNewGameDialogToTop`. |
| Map under the results screen on the last replay step | The finished match's final map, not the next-game preview. The preview returns only when replay ends. |
| New game on the results screen during replay | Works as it does today. `abandonReplayForNewMatch` drops replay when Start is clicked. |
| Saving a finished match that was loaded | Allowed. One rule: any finished match can be saved. |

### Design Summary

Read this before Phase 3. It explains why each piece exists.

- **The overlay is still "open" while set aside.**
  - `#game-over-overlay` loses `hidden` when the match ends, and it keeps it off for the whole game-over state. Many checks read that class: `newGameOverlayIsOpen`, the game menu, Save and Load, map clicks, and the cursor.
  - Setting the screen aside **must not** add `hidden`. It adds the class `replay-aside` instead, so all of those checks keep treating the overlay as open, which they should while the match is over.
- **Three things change while the screen is set aside:**
  1. a CSS rule in `static/replayChrome.css` hides the overlay;
  2. the CSS rules that hide the console, the chat panel, and the top bar's match readouts while the overlay is open stop applying: every selector `#game-over-overlay:not(.hidden)` becomes `#game-over-overlay:not(.hidden):not(.replay-aside)`;
  3. the main UI controls are enabled again (`setMainUIControlsEnabled(true)`), as when the player closes the new-game screen over a waiting match. Replay's own guards still keep Ready, the Orders tab, map clicks, and commander cards inert.
- **Who draws the map.** Today an open overlay makes `paintMapFrame` (`src/renderer/rendering/gameScene.ts`) draw only the next-game preview. A new predicate, `newGamePreviewOwnsMapNow()`, is true only when the overlay is open **and replay is off**. Three places use it in place of their own overlay check:
  - `paintMapFrame`;
  - the basemap switch in `syncMapExtentToSnapshot` (`src/renderer/map/mapExtent.ts`);
  - `refreshNewGameMapPreview` (`src/renderer/gameplay/newGameMapPreviewUi.ts`), so a preview reply cannot take the map back during replay.

  With replay off, the predicate equals "overlay open", so nothing changes outside replay.
- **Entering and leaving replay over a finished match.**
  - On entry, a new renderer module switches the hillshade to the match's map and refits the match's extent. The preview had applied its own extent and camera.
  - On leave, the same module forgets the preview frame and refreshes the preview, which puts the preview's hillshade, extent, and camera back.
  - When replay ends because Start began a new match, which the match epoch shows, the module only clears its own class. The start path owns the rest.
- **The live match is over even while a past step shows.** During replay, `S.gameState` is a recorded snapshot. A leaf module, `replayMatchOver.ts`, tells the Save and Load rules that the live match is over, so Save game stays enabled and Load does not ask for confirmation.
- **One source for "set aside".** A pure function in `src/shared/replayResultsScreenRules.ts` decides it from three numbers. The renderer module only applies the decision. The tests cover the pure function.

---

## Non-Goals

- Loading `.agentwars-recording` files.
- Replaying a battle's beats over a finished match. A match never ends inside a battle, so a finished match's replay is always strategic.
- A different suggested file name for a finished match's save. `suggestedSaveFileName` is unchanged.
- Holding a save until a deferred post-resolution consult finishes. A save made while the last consult runs holds the history up to that moment. The recording export still waits for the consult, as today.
- A version bump, release notes, or `README.md` release summaries. The user chooses the next version.
- Any change to replay during a live match.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Orienting comments.** Every new or changed declaration has a JSDoc block:
  - a one-line summary;
  - `Purpose:` (or `Contract:` for types and fields);
  - `When to use:`, `Expected outcome:`, and `Exceptions:`.

  A new file opens with a file-level block in the same form. Update every comment whose behavior this plan changes. In particular, no comment may still say that a finished match cannot be saved. That includes the file comment of `src/main/recorder/matchRecordingExport.ts` ("A finished match cannot be saved as a match file."). No generic filler.
- **Logging (rule 02).**
  - New main-process branches log at DEBUG with `logDebug` and a small object of ids and flags, never file contents.
  - Renderer code uses `console.debug` for state changes and `console.error` for failures, as the neighbouring replay modules do.
- **No plan vocabulary** in code, comments, test names, or `doc/`. Never write "Phase 3", "locked decision", or similar.
- **Size limits (rule 09).**
  - Each new or edited source, test, CSS, or script file must stay under 600 lines. Record every final line count in the Completion Log.
  - **Files already over 600 lines must not grow.** This plan edits four of them, and each edit changes lines in place:
    - `src/renderer/rendering/gameScene.ts` (838);
    - `static/newGameChrome.css` (748);
    - `static/frameChrome.css` (696);
    - `doc/how-to-play.md` (683).

    Their line counts after the edit must be less than or equal to their Phase 0 counts.
  - `src/renderer/replay/replayMode.ts` is 597 lines. **Do not edit it.**
  - `src/renderer/renderer.ts` (850) is not edited.
  - `scripts/ui-smoke/ui-smoke-new-game-checks.cjs` (620) is not edited.
- **Reuse (rule 06).**
  - `newGamePreviewOwnsMap` (shared, pure) is the only rule for who draws the map.
  - `replayResultsScreenAside` (shared, pure) is the only rule for setting the screen aside.
  - Call the existing helpers named in each phase. Do not copy their bodies.
- **Tests (rule 03).** Test contracts, not private helpers. Copy the structure of the test next to the one you add.
- **Naming.** Follow [doc/naming-conventions-contract-v1.md](../doc/naming-conventions-contract-v1.md). `npm run naming:check` is part of every Phase Check.
- **Docs.** Phase 6 updates `doc/`. Do not edit `doc/` earlier.

---

## Phase 0 — Baseline

**Edits:** none. **Adds:** none.

### Steps

1. Run the Phase Check commands once, plus `npm run check:renderer-types`. Record each result in the Phase 0 Inventory.
2. Build, then run these existing tests and record pass or fail for each:
   - `node dist/shared/saveLoadAvailability.test.js`
   - `node dist/shared/replayNavigation.test.js`
   - Electron as Node: `dist\main\saveGame\saveFileWrite.test.js`, `dist\main\saveGame\saveLoadPipeline.test.js`, `dist\main\recorder\matchRecordingExport.test.js`
   - `node scripts/ui-smoke/ui-smoke-checks.test.cjs`
3. **Confirm the anchors.** Each must be found exactly as quoted. A missing anchor is a stop: record it in the Defect Inventory and stop.

   | File | Anchor |
   | --- | --- |
   | `src/shared/saveLoadAvailability.ts` | `if (state.gameOver) return { disabled: true, tooltip: SAVE_GAME_OVER_MESSAGE };` |
   | `src/main/saveGame/saveFileWrite.ts` | `if (over?.value === '1') return SAVE_GAME_OVER_MESSAGE;` |
   | `src/main/saveGame/saveFileFormat.ts` | `export { SAVE_GAME_OVER_MESSAGE, SAVE_NOTHING_TO_SAVE_MESSAGE };` |
   | `src/main/saveGame/saveLoadPipeline.ts` | `storeNewPlaythroughId(gameDbOps);` |
   | `src/main/recorder/matchRecordingExport.ts` | `if (tail && tail.count === count && tail.lastRecordId === lastId) return;` |
   | `src/renderer/rendering/gameScene.ts` | `const overlayOpen = overlay != null && !overlay.classList.contains('hidden');` |
   | `src/renderer/map/mapExtent.ts` | `if (!isNewGameOverlayOpen()) setBasemapGameMap(mapId);` |
   | `src/renderer/gameplay/newGameMapPreviewUi.ts` | `if (serial !== requestSerial \|\| !newGameOverlayOpen() \|\| mapCameraHeldForStart) return;` |
   | `src/renderer/replay/replayPanel.ts` | `onReplayChange(renderReplayPanel);` |
   | `src/renderer/replay/replayMode.ts` | `setReplay({ timeline, index: last, busy: false, matchEpoch: epoch, playing: false, stopRequested: false, session: nextReplaySession() });` (read only) |
   | `src/main/gameDb/machineLocalConfigKeys.ts` | `MACHINE_LOCAL_CONFIG_KEYS` does **not** list `PLAYTHROUGH_ID_CONFIG_KEY` |

4. Count `#game-over-overlay:not(.hidden)` in every file under `static/`. Record each file and count. Today: `newGameChrome.css` 8, `frameChrome.css` 1, `chatChrome.css` 1, `selectionChrome.css` 1, `shellChrome.css` 2. Also search `src/renderer` for the same text. Phase 4 changes every hit.
5. **Read, do not edit:**
   - `src/renderer/replay/replayMode.ts`: `enterReplay`, `presentReplayStep`, `runLeaveReplay`, and `abandonReplayForNewMatch`.
   - `src/renderer/replay/replayState.ts`.

   Confirm two facts and record them:
   - `enterReplay` calls `setReplay` with a new `session` **before** it calls `showReplayStep`, so the first `onReplayChange` call of a session still sees the live `S.gameState`;
   - every step shown, previews and playback included, ends in a `setReplay` that sets `index`.

   Also confirm three more facts, and record them:
   - `runLeaveReplay` calls `setReplay(null)` **before** it applies the live snapshot;
   - in `src/renderer/gameplay/newGame.ts`, the Start path calls `advanceRendererMatchEpoch()` **before** `abandonReplayForNewMatch()`, and both come before `holdNewGameMapPreviewCamera()`;
   - `#game-over-overlay` in `static/index.html` is **not** inside `#canvas-container`, so `setMainUIControlsEnabled` never turns off its pointer input.

   If any of these facts is false, stop.

   Last, list every caller that passes `updateGameOverUi: true` or calls `updateGameOverUI` directly, and record the list. Expect `readyHandler.ts`, `initCore.ts` (startup), and `newGame.ts`. None of them should run while replay is on, because Ready is disabled and Start drops replay first. If you find another caller that can run during replay, record it in the Defect Inventory and continue. The user decides.
6. Read `scripts/ui-smoke/ui-smoke.cjs` from the first session through `runFinishedMatchSession`. Count the Ready presses (strategic turns) before the finished match session, and record the count. Phase 5 needs at least two recorded strategic steps.
7. Record the line count of every file any phase edits.

### Verification

The Phase 0 Inventory is filled in. No file is changed.

---

## Phase 1 — A Finished Match Can Be Saved

**Edits:**
- `src/shared/saveLoadAvailability.ts`
- `src/shared/saveLoadAvailability.test.ts`
- `src/main/saveGame/saveFileWrite.ts`
- `src/main/saveGame/saveFileWrite.test.ts`
- `src/main/saveGame/saveFileFormat.ts`

**Adds:** none.

### Steps

1. In `saveLoadAvailability.ts`, delete `SAVE_GAME_OVER_MESSAGE` and add, in its place:

   **Exact:**
   ```ts
   /** Shown when Save game can write a finished match to a file. */
   export const SAVE_FINISHED_MATCH_TOOLTIP = 'Save this finished match to a file, to load and replay it later.';
   ```

2. Rewrite `saveGameItemState` so the first matching rule wins, in this order:

   | Order | Condition | Result |
   | --- | --- | --- |
   | 1 | `!state.matchLoaded` | disabled, `SAVE_NOTHING_TO_SAVE_MESSAGE` |
   | 2 | `state.readyInFlight` | disabled, `SAVE_RESOLVING_MESSAGE` |
   | 3 | `state.gameOver` | **enabled**, `SAVE_FINISHED_MATCH_TOOLTIP` |
   | 4 | `state.newGameScreenOpen` | disabled, `SAVE_CLOSE_NEW_GAME_SCREEN_MESSAGE` |
   | 5 | otherwise | enabled, `SAVE_MATCH_TOOLTIP` |

   - Rule 3 comes before rule 4 because the results screen is always open while a match is over.
   - Update the function's JSDoc so `Purpose:` and `Expected outcome:` describe this order.
   - Update the JSDoc of `SaveLoadUiState.gameOver` if it says a finished match cannot be saved.

3. In `saveFileWrite.ts`, delete the two lines that read `game_over` in `matchSaveBlocker`, and remove `SAVE_GAME_OVER_MESSAGE` from its imports.
   - The turn-phase check stays. A finished match is in phase `planning`: `meleeInterceptReadyFinalize` writes `planning` after the outcome is recorded.
   - Update the JSDoc: `Purpose:` becomes "A turn that is still resolving, or a match with nothing in it, is refused before any file is written. A finished match is saved like any other."
4. In `saveFileFormat.ts`, remove `SAVE_GAME_OVER_MESSAGE` from the import, the re-export, and `SAVE_FILE_FORMAT_MESSAGES`. Search `src` and `scripts` for `SAVE_GAME_OVER_MESSAGE`. No hit may remain.
5. Replace the test `save is refused for a finished match, an empty launch, the new-game screen, and Ready` in `saveLoadAvailability.test.ts` with two tests:
   - **`save is refused for an empty launch, the new-game screen over a live match, and Ready`:** the three refusals, including `liveMatch({ gameOver: true, readyInFlight: true })` → `SAVE_RESOLVING_MESSAGE`, and `liveMatch({ matchLoaded: false, gameOver: true })` → `SAVE_NOTHING_TO_SAVE_MESSAGE`.
   - **`a finished match can be saved while the results screen is open`:** `liveMatch({ gameOver: true, newGameScreenOpen: true })` → `{ disabled: false, tooltip: SAVE_FINISHED_MATCH_TOOLTIP }`, and the same with `newGameScreenOpen: false`.

   The two load tests stay unchanged.
6. Add a test to `saveFileWrite.test.ts`: **`a finished match is written with its result and its history`.** Copy the setup of `a save omits machine-local rows and keeps them in the open match`.
   - Before the save:
     - set `game_over` to `1`, `winner` to a seat id the fixture has, and `game_end_reason` to `last_side_standing`, through `game_config`;
     - insert two `match_records` rows with the recorder helper the file or its neighbours already use (search `src/main/recorder` for `insertMatchRecord`). If no helper fits, insert the rows with SQL that names every non-null column of `match_records`.
   - Assert:
     - `matchSaveBlocker()` returns null;
     - `writeSaveFileFromOpenDatabase` writes the file;
     - the written file, opened read-only, has `game_over` `1`, the same `winner`, and the same `match_records` count as the open match.

### Tests to run

- `node dist/shared/saveLoadAvailability.test.js`
- Electron as Node: `dist\main\saveGame\saveFileWrite.test.js`

### Verification

- The Phase Check is clean. `check:renderer-types` and `build:renderer` also pass, because a shared file changed.
- No `SAVE_GAME_OVER_MESSAGE` remains in `src` or `scripts`.

---

## Phase 2 — Loading a Finished Match Keeps Its Recording Whole

A saved finished match was already exported when it ended. Two problems follow if it is loaded as it is today:

1. Loading stores a new playthrough id. The next New game or Load then exports it as a second file for the same playthrough.
2. A save made before the last consult finished has fewer records than the file already on disk, and the export replaces any file whose count differs.

**Edits:**
- `src/main/saveGame/saveLoadPipeline.ts`
- `src/main/saveGame/saveLoadPipeline.test.ts`
- `src/main/recorder/matchRecordingExport.ts`
- `src/main/recorder/matchRecordingExport.test.ts`
- `src/main/gameDb/gameConfigKv.ts` (JSDoc only)

**Adds:** none.

### Steps

1. **Keep the playthrough id of a finished match.** In `saveLoadPipeline.ts`, right after `resetMatchMemoryAfterDatabaseReplace();`, read `game_over` from the newly opened match with `selectGameConfigValue(gameDbOps, 'game_over') === '1'`. Import it from where `matchRecordingExport.ts` imports it.
   - When the match is over, skip the `try` block that calls `storeNewPlaythroughId`, and log `logDebug('saveLoadPipeline kept the finished match playthrough', {})`.
   - Otherwise run the block unchanged.
   - Keep the read inside the code's existing synchronous stretch. Add no `await`.
   - Update the JSDoc of the function that holds this code: a loaded finished match keeps its playthrough id, because it cannot be played on and its recording already names that id.
2. In `gameConfigKv.ts`, update the `When to use:` line of `storeNewPlaythroughId`: "Loading a save of a match that is still being played. A loaded finished match keeps its id."
3. **Never replace a recording with a shorter one.** In `exportFinishedMatchRecordingIfNeeded`, after the line that returns when count and last id both match, add:

   ```ts
   if (tail && tail.count > count) {
     logDebug('matchRecordingExport kept a longer recording', { directory, fileCount: tail.count, count });
     return;
   }
   ```

   - The `refreshCurrentFramePayload()` call stays after both returns, so a kept file never refreshes the database.
   - Update the function's `Expected outcome:`: "… replaced when the record count or the last record id differs, except that a file holding more records than the database is kept."
   - Update the file comment's `Purpose:` so it no longer says a finished match cannot be saved: "The portable copy of a finished match's history. A save of a finished match is a match file; this is the history alone."
4. Add a test to `matchRecordingExport.test.ts`: **`a recording with more records than the database is kept`.** Copy the setup of the closest existing export test.
   - Export once.
   - Delete the newest `match_records` row from the open database.
   - Export again.
   - Assert the file's bytes, or its modification time and size, are unchanged, and that its record count is still the larger one (`readRecordingFile`).
5. Add a test to `saveLoadPipeline.test.ts`: **`a finished match loads over a new match with its result, its history, and its playthrough`.** Copy `a saved match loads back over a new match`.
   - Before the save, mark the match finished as in Phase 1, step 6, and read its `playthrough_id` (`PLAYTHROUGH_ID_CONFIG_KEY`).
   - After the load, assert:
     - `game_over` is `1`;
     - `winner` is unchanged;
     - the `match_records` count is unchanged;
     - `playthrough_id` equals the saved value.
   - In the existing test `a saved match loads back over a new match`, whose match is not finished, read `playthrough_id` before the save and after the load. Assert that they **differ**, if the test does not assert that already. That pins the unchanged path for a live match.

### Tests to run

Electron as Node:
- `dist\main\saveGame\saveLoadPipeline.test.js`
- `dist\main\recorder\matchRecordingExport.test.js`
- `dist\main\saveGame\saveFileWrite.test.js`

### Verification

The Phase Check is clean. All three tests pass.

---

## Phase 3 — Replay Draws the Match While the Results Screen Is Open

After this phase, replay over a finished match draws the past map, with the results screen still on top. Outside replay nothing changes.

**Edits:**
- `src/renderer/rendering/gameScene.ts`
- `src/renderer/map/mapExtent.ts`
- `src/renderer/gameplay/newGameMapPreviewUi.ts`

**Adds:**
- `src/shared/replayResultsScreenRules.ts`
- `src/shared/replayResultsScreenRules.test.ts`
- `src/renderer/gameplay/newGamePreviewOwnership.ts`

### Steps

1. **Add `src/shared/replayResultsScreenRules.ts`** with a file comment and two pure exported functions. Phase 4 uses the second one.

   ```ts
   export function newGamePreviewOwnsMap(input: { readonly overlayOpen: boolean; readonly replayOn: boolean }): boolean {
     return input.overlayOpen && !input.replayOn;
   }

   export function replayResultsScreenAside(input: {
     readonly matchOver: boolean;
     readonly stepCount: number;
     readonly index: number;
   }): boolean {
     return input.matchOver && input.stepCount > 0 && input.index < input.stepCount - 1;
   }
   ```

   - Name each input type as an exported interface with a JSDoc block per field, in the file's style (`ReplayPosition` in `src/shared/replayNavigation.ts` is the model).
   - JSDoc for `newGamePreviewOwnsMap`: `Purpose:` "The new-game preview replaces the match on the map only outside replay. Replay over a finished match shows the recorded match." `Expected outcome:` "True when the overlay is open and replay is off."
   - JSDoc for `replayResultsScreenAside`: `Purpose:` "Replay over a finished match shows the results screen only on the last step, where the match ended." `Expected outcome:` "True for every step before the last of a finished match. False on the last step, for a match still being played, and for an empty timeline."
2. **Add `src/shared/replayResultsScreenRules.test.ts`** with these tests:
   - **`the preview owns the map only while the overlay is open and replay is off`:** all four combinations.
   - **`a finished match sets the results screen aside on every step before the last`:** `stepCount` 3, indexes 0 and 1 true, index 2 false.
   - **`the results screen is never set aside for a live match or an empty timeline`:** `matchOver` false at index 0 of 3, and `stepCount` 0 at index 0 with `matchOver` true. Both false.
   - **`a one-step timeline shows the results screen`:** `stepCount` 1, index 0, `matchOver` true → false.
3. **Add `src/renderer/gameplay/newGamePreviewOwnership.ts`**, which reads the screen and asks the pure rule:

   ```ts
   import { newGamePreviewOwnsMap } from '../../shared/replayResultsScreenRules';
   import { replayActive } from '../replay/replayState';

   export function newGamePreviewOwnsMapNow(): boolean {
     const overlay = document.getElementById('game-over-overlay');
     const overlayOpen = overlay != null && !overlay.classList.contains('hidden');
     return newGamePreviewOwnsMap({ overlayOpen, replayOn: replayActive() });
   }
   ```

   - The module imports only those two, on purpose. `gameScene.ts` and `mapExtent.ts` import it, and either would close a cycle through the new-game modules. Do not replace the inline read with `newGameOverlayIsOpen`. Say why in the function's `Purpose:`.
   - `replayState.ts` imports only `../core/matchEpoch` and a shared type, so this adds no cycle.
4. **`gameScene.ts`, `paintMapFrame`:** replace the two lines

   **Exact (old):**
   ```ts
     const overlay = document.getElementById('game-over-overlay');
     const overlayOpen = overlay != null && !overlay.classList.contains('hidden');
   ```

   with

   **Exact (new):**
   ```ts
     const overlayOpen = newGamePreviewOwnsMapNow();
   ```

   - Add the import, and put it on an existing import line if the file's style allows, so the file does not grow.
   - Update the JSDoc's `Expected outcome:` to start: "While the new-game preview owns the map (`newGamePreviewOwnsMapNow`), the canvas is cleared, only the preview is drawn, and match markers hide."
   - `wc -l` must be at most the Phase 0 count.
5. **`mapExtent.ts`, `syncMapExtentToSnapshot`:**
   - Replace `if (!isNewGameOverlayOpen()) setBasemapGameMap(mapId);` with `if (!newGamePreviewOwnsMapNow()) setBasemapGameMap(mapId);`.
   - Remove the `isNewGameOverlayOpen` import if nothing else in the file uses it.
   - Add to the JSDoc's `Expected outcome:` "The hillshade follows the snapshot's map unless the new-game preview owns the map."
6. **`newGameMapPreviewUi.ts`, `refreshNewGameMapPreview`:**
   - At the top, change `if (mapCameraHeldForStart) return;` to `if (mapCameraHeldForStart || replayActive()) return;`. Gate on replay alone here. A call made while the overlay is closed must keep today's behavior: it notes the request and is dropped after the reply.
   - After the await, change `!newGameOverlayOpen()` to `!newGamePreviewOwnsMapNow()`. That drops a reply that arrives once replay has started.
   - Keep the file's private `newGameOverlayOpen` if anything else in the file still uses it. Otherwise delete it.
   - Import `replayActive` from `../replay/replayState` and `newGamePreviewOwnsMapNow` from `./newGamePreviewOwnership`.
   - Update the JSDoc: "Does nothing while replay is on, so a preview reply cannot move the camera or the hillshade off a recorded step."

   The preview is not drawn during replay. Phase 4 refreshes it when replay ends.

### Tests to run

- `node dist/shared/replayResultsScreenRules.test.js`
- `node dist/shared/replayNavigation.test.js`

### Verification

- The Phase Check is clean, plus `check:renderer-types` and `build:renderer`.
- Search `src/renderer` for `classList.contains('hidden')` near `game-over-overlay`, and record the hits. Apart from `paintMapFrame` and `refreshNewGameMapPreview`, every hit Phase 0 found is unchanged. Those checks still mean "overlay open", which stays true while the screen is set aside.
- Outside replay, `newGamePreviewOwnsMapNow()` equals the old inline check. No player-visible behavior outside replay changes in this phase.

---

## Phase 4 — The Results Screen Steps Aside Before the Last Step

**Edits:**
- `src/renderer/replay/replayPanel.ts`
- `src/renderer/gameplay/saveLoadMenu.ts`
- `static/replayChrome.css`
- every `static/*.css` file Phase 0, step 4 found

**Adds:**
- `src/renderer/replay/replayMatchOver.ts`
- `src/renderer/replay/replayResultsScreen.ts`

### Why Save and Load need a flag

During replay, `S.gameState` is the step's recorded snapshot. On every step before the last, its `gameOver` is false, while the overlay still counts as open. `readSaveLoadUiState` would then disable Save game with the "Close the new-game screen…" tip. A disabled button never fires the menu's leave-replay listener, so the player could not save from replay. Load would also ask "The match in progress will be replaced", although the match is over. A small flag module tells those rules that the live match is over.

### Steps

0. **Add `src/renderer/replay/replayMatchOver.ts`.** It is a leaf module with no imports:
   - one module `let` holding a boolean;
   - `setReplayOverFinishedMatch(over: boolean): void`;
   - `replayIsOverFinishedMatch(): boolean`.

   Each part gets a full JSDoc block. `Purpose:` "During replay the screen shows a recorded snapshot, so rules about the live match read this flag for whether that match is over."

   Then in `saveLoadMenu.ts`, `readSaveLoadUiState`, change the `gameOver` field to `S.gameState?.gameOver === true || replayIsOverFinishedMatch()`. Add the import, and add to the JSDoc's `Expected outcome:` "During replay over a finished match, the match counts as over."

1. **CSS: hide the set-aside overlay.** Append to `static/replayChrome.css`:

   **Exact:**
   ```css
   /* Replay over a finished match sets the results screen aside on every step before the last (replayResultsScreen.ts).
      The overlay keeps its open state for the rest of the renderer; only its box is hidden. */
   body[data-replay="on"] #game-over-overlay.replay-aside {
     display: none;
   }
   ```

2. **CSS: the chrome comes back while it is aside.** In every file Phase 0, step 4 listed, replace each `#game-over-overlay:not(.hidden)` with `#game-over-overlay:not(.hidden):not(.replay-aside)`. Each replacement is in place, and no file gains a line. Afterwards, the count of the old text that is **not** followed by `:not(.replay-aside)` is 0 in every file.
3. **Add `src/renderer/replay/replayResultsScreen.ts`.**
   - Its file comment says it sets the results screen aside during replay over a finished match, and gives the map back to the preview when replay ends.
   - **Module state**, each `let` with a JSDoc block:
     - `trackedSession: number | null`, the replay session this module last saw;
     - `trackedEpoch: number`, that session's `matchEpoch`;
     - `matchOverInReplay: boolean`, whether that session opened over a finished match;
     - `screenAside: boolean`, whether `replay-aside` is on.
   - **Functions:**
     - **`wireReplayResultsScreen(): void`** (exported): `onReplayChange(syncReplayResultsScreen);`.
     - **`syncReplayResultsScreen(): void`:**
       ```ts
       const state = currentReplay();
       if (!state) {
         if (trackedSession !== null) endReplayOverResults();
         return;
       }
       if (state.session !== trackedSession) {
         trackedSession = state.session;
         trackedEpoch = state.matchEpoch;
         matchOverInReplay = state.timeline.scope === 'strategic' && S.gameState?.gameOver === true;
         setReplayOverFinishedMatch(matchOverInReplay);
         console.debug('replay results screen session', { session: state.session, matchOverInReplay });
         if (matchOverInReplay) showMatchMapForReplay();
       }
       if (!matchOverInReplay) return;
       setScreenAside(replayResultsScreenAside({ matchOver: true, stepCount: state.timeline.steps.length, index: state.index }));
       ```
       `S.gameState` is still the live finished match on a session's first call (Phase 0, step 5).
     - **`showMatchMapForReplay(): void`:** with the live `S.gameState`:
       1. `setBasemapGameMap(S.gameState.gameMap?.id ?? 'global')`;
       2. `syncMapExtentToSnapshot(S.gameState, { refit: true })`;
       3. `invalidateLeafletMapSizes()`;
       4. `resizeAndRedraw()`.

       Do nothing when `S.gameState` is null.
     - **`setScreenAside(aside: boolean): void`:**
       1. Return when `aside === screenAside`.
       2. Set `screenAside`.
       3. Toggle `replay-aside` on `#game-over-overlay`.
       4. Call `setMainUIControlsEnabled(aside)`. Aside, the match chrome takes the pointer; shown, it is disabled as at game over.
       5. `invalidateLeafletMapSizes()` and `resizeAndRedraw()`, because the console's width changes.
       6. `console.debug('replay results screen aside', { aside })`.
     - **`endReplayOverResults(): void`:**
       1. Save the old `matchOverInReplay` as `wasOver`, and `sameMatch = rendererMatchEpochCurrent(trackedEpoch)`.
       2. Set `trackedSession = null` and `matchOverInReplay = false`, and call `setReplayOverFinishedMatch(false)`.
       3. **New match (`!sameMatch`):** Start in `newGame.ts` advances the epoch, then calls `abandonReplayForNewMatch`, then holds the preview camera. In this case, only remove `replay-aside` from the overlay and set `screenAside = false`.
          - Do **not** call `setMainUIControlsEnabled`, `resetNewGameMapPreviewFrame`, or `refreshNewGameMapPreview`. The start path owns the controls and the camera from here, and `resetNewGameMapPreviewFrame` would clear its Start hold.
          - Log `console.debug('replay results screen dropped for a new match')` and return.
       4. **Same match:** `setScreenAside(false)`. Then, when `wasOver`: `resetNewGameMapPreviewFrame()`, `void refreshNewGameMapPreview()`, and `resizeAndRedraw()`.

       `runLeaveReplay` calls `setReplay(null)` before it applies the live snapshot. That apply runs with replay off and the overlay open, so it does not move the hillshade off the preview.
   - **Imports, all existing:**
     - `currentReplay` and `onReplayChange` from `./replayState`;
     - `setReplayOverFinishedMatch` from `./replayMatchOver`;
     - `rendererMatchEpochCurrent` from `../core/matchEpoch`;
     - `replayResultsScreenAside` from `../../shared/replayResultsScreenRules`;
     - `rendererSharedState as S` from `../core/state`;
     - `setMainUIControlsEnabled` from `../core/uiState`;
     - `resizeAndRedraw` from `../rendering/gameScene`;
     - `invalidateLeafletMapSizes` from `../map/worldLeafletMap`;
     - `setBasemapGameMap` from `../map/basemapLayer`;
     - `syncMapExtentToSnapshot` from `../map/mapExtent`;
     - `resetNewGameMapPreviewFrame` and `refreshNewGameMapPreview` from `../gameplay/newGameMapPreviewUi`.

     Only `renderer.ts` imports `replayPanel.ts`, so these imports add no cycle. `saveLoadMenu.ts` imports only the leaf `replayMatchOver.ts`. If `check:circular` reports a cycle anyway, stop and record it. Do not restructure other modules.
   - Every function gets a full JSDoc block. `Expected outcome:` states the class, the controls, and the map.
4. **`replayPanel.ts`:** in `wireReplayPanel`, add `wireReplayResultsScreen();` after `onReplayChange(renderReplayPanel);`, add its import, and add to the JSDoc's `Expected outcome:` "Replay over a finished match sets the results screen aside on every step before the last."

### Behavior This Phase Must Produce

Phase 6 copies this table into the manual checklist.

| Situation | Overlay | Console and top-bar readouts | Map |
| --- | --- | --- | --- |
| Game over, replay off | shown | hidden | next-game preview |
| P over game over (lands on the last step) | shown | hidden | final match map |
| Rewind, Step back, slider, playback on an earlier step | hidden (`replay-aside`) | shown | that step's map |
| Back on the last step | shown, same collapse state and scroll | hidden | final match map |
| Escape or P | shown | hidden | next-game preview, reframed |
| New game clicked on the last step | replay drops, the match starts | as after any start | the new match |
| Game menu on any replay step | Save game… enabled with the finished-match tip, and Load game… asks no confirmation | — | — |

### Tests to run

- `node dist/shared/replayResultsScreenRules.test.js`

### Verification

- The Phase Check is clean, plus `check:renderer-types` and `build:renderer`.
- `replayPanel.ts`, `saveLoadMenu.ts`, `replayChrome.css`, and the two new modules are each under 600 lines.
- Every other edited CSS file has its Phase 0 line count.

---

## Phase 5 — UI Smoke Scenes and Checks

These run when the user runs `npm run ui:smoke`. You run only the checks' unit test.

**Edits:**
- `scripts/ui-smoke/ui-smoke.cjs`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/run-main-node-tests.cjs`

**Adds:**
- `scripts/ui-smoke/ui-smoke-replay-results-checks.cjs`
- `scripts/ui-smoke/ui-smoke-replay-results-checks.test.cjs`

### Steps

1. In `ui-smoke-scenes.cjs`, add three scene names next to `gameOverSmallWindow`:

   **Exact:**
   ```js
     gameOverReplayLast: 'game-over-replay-last',
     gameOverReplayEarlier: 'game-over-replay-earlier',
     gameOverReplayLeft: 'game-over-replay-left',
   ```

   Do **not** add them to `NEW_GAME_SCENES`. Those scenes get the new-game panel checks, and the earlier scene hides the panel on purpose.
2. In `ui-smoke.cjs`, `runFinishedMatchSession`, after the `gameOverHidden` scene and its second expand click, and before `setViewport(app, page, SMALL_WINDOW)`, add:
   1. Press `p`. Wait until `document.body.dataset.replay === 'on'` and `#replay-panel` has client rects, with `{ timeout: SETTLE_MS.overlay * 4 }` as the replay block in the first session does. Wait `SETTLE_MS.click`. Record `gameOverReplayLast`.
   2. Click `#replay-rewind`. Wait until `#game-over-overlay` has the class `replay-aside`. Wait `SETTLE_MS.click`. Record `gameOverReplayEarlier`.
   3. Press `Escape`. Wait until `document.body.dataset.replay === undefined` and `#game-over-overlay` lacks `replay-aside`. Wait `SETTLE_MS.overlay`. Record `gameOverReplayLeft`.

   - Update the function's JSDoc: it now records six scenes.
   - **If Phase 0, step 6 counted fewer than two strategic turns before this session,** Rewind cannot move. In that case:
     1. leave out step 2 and the `gameOverReplayEarlier` scene;
     2. record it in the Defect Inventory;
     3. keep the other two scenes.

     Do not add turns to the smoke run.
3. **Add `ui-smoke-replay-results-checks.cjs`.** It exports `REPLAY_RESULTS_CHECKS` and uses the check shape of `ui-smoke-console-checks.cjs`: `name`, `scenes`, `needs`, and `run(p, el)` returning null or a sentence.
   - **`replay-over-a-finished-match-opens-on-the-results-screen`** (`gameOverReplayLast`):
     - `#replay-panel` shown;
     - `#game-over-overlay` shown;
     - `#game-over-standings` shown;
     - `#sidebar` not shown.
   - **`replay-sets-the-results-screen-aside-before-the-last-turn`** (`gameOverReplayEarlier`):
     - `#replay-panel` shown;
     - `#game-over-overlay` not shown;
     - `#sidebar` shown;
     - `#app-topbar .topbar-date-block` shown.
   - **`leaving-replay-over-a-finished-match-shows-the-results-screen`** (`gameOverReplayLeft`):
     - `#replay-panel` not shown;
     - `#game-over-overlay` shown;
     - `#game-over-standings` shown.

   Read how `el(selector).shown` is computed in `ui-smoke-checks.cjs` before writing the checks.
4. In `ui-smoke-checks.cjs`, require the new file next to `NEW_GAME_CHECKS` and spread `...REPLAY_RESULTS_CHECKS` after `...NEW_GAME_CHECKS`. That is two added lines, and the file must stay under 600.
5. **Add `ui-smoke-replay-results-checks.test.cjs`,** modelled on `ui-smoke-checks.test.cjs`, using `runChecks` or the `runOneCheck` helper that file defines. If that helper is not exported, write a local one the same way. For each new check, one probe that passes and one that fails with the expected sentence.
6. **Register the new test.** `scripts/run-main-node-tests.cjs` lists its extra CJS tests by name. Add `'ui-smoke/ui-smoke-replay-results-checks.test.cjs',` to that list, right after `'ui-smoke/ui-smoke-checks.test.cjs',`. Add `scripts/run-main-node-tests.cjs` to this phase's backups.

### Tests to run

- `node scripts/ui-smoke/ui-smoke-checks.test.cjs`
- `node scripts/ui-smoke/ui-smoke-replay-results-checks.test.cjs`

### Verification

- The Phase Check is clean.
- `node --check` passes on each edited or added `.cjs` file.
- Every added or edited script file is under 600 lines.

---

## Phase 6 — Docs, Final Checks, and Hand-Off

**Edits:**
- `doc/save-files.md`
- `doc/match-recording.md`
- `doc/ux/save-and-load.md`
- `doc/ux/control-tooltips.md`
- `doc/ux/replay-panel.md`
- `doc/ux/new-game-dialog.md`
- `doc/ux/modes-and-transitions.md`
- `doc/how-to-play.md`

**Adds:** none.

Match the voice and layout of each document. Name the symbol behind every rule. Edit in place; `doc/how-to-play.md` must not grow.

### Steps

1. **`doc/save-files.md`, "When a save is refused":**
   - Remove the finished-match sentence.
   - Add: a finished match is saved like any other, with its result and its whole history, so it can be loaded and replayed. The tip is `SAVE_FINISHED_MATCH_TOOLTIP`.
   - In the load section, add: a loaded finished match keeps its playthrough id (`storeNewPlaythroughId` is skipped when `game_over` is `1`).
2. **`doc/match-recording.md`:**
   - Replace "A finished match cannot be saved (`SAVE_GAME_OVER_MESSAGE`)." with a sentence saying the recording is the history alone, and that a save of a finished match is a full match file. Link [save-files.md](save-files.md).
   - In the `playthrough_id` paragraph, add that loading a finished match keeps its id.
   - In the export paragraph, add that a file holding more records than the database is kept.
3. **`doc/ux/save-and-load.md`, Availability:**
   - Remove the first bullet.
   - Restate the order as `saveGameItemState` now has it.
   - Add: "While the match is over, Save game… is enabled, including on the results screen. The tip is "Save this finished match to a file, to load and replay it later.""
   - Add to the load text: loading a finished match opens on the results screen, as at the end of that match.
   - Add: during replay over a finished match, Save game… stays enabled and Load game… asks no confirmation on every step, because the live match is over (`replayIsOverFinishedMatch`). As before, both leave replay first.
4. **`doc/ux/control-tooltips.md`:**
   - In the Save game line, remove "The match is over, so there is nothing to save."
   - Add the finished-match tip next to "Save this match to a file."
   - If the file has Source Anchors, keep `saveGameItemState` there.
5. **`doc/ux/replay-panel.md`:**
   - **Availability:** P starts replay over a finished match's results screen.
   - **Other:** replace the sentence "Replay can be on over a finished match's standings, …" with the behavior table from Phase 4, in prose.
     - On every step before the last, the results screen is set aside (`replayResultsScreenAside`, `src/renderer/replay/replayResultsScreen.ts`).
     - The console, the chat panel, and the top bar look as they do during replay of a live match.
     - On the last step, the results screen is shown as the player left it, over the final map.
     - Leaving replay brings back the next-game preview.
     - New game on the results screen still drops replay.
   - **Invariants:** add "Over a finished match, the results screen shows only on the last step."
   - **Code Entry Points:** add `src/renderer/replay/replayResultsScreen.ts` (`wireReplayResultsScreen`), `src/renderer/replay/replayMatchOver.ts` (`replayIsOverFinishedMatch`), `src/shared/replayResultsScreenRules.ts` (`replayResultsScreenAside`, `newGamePreviewOwnsMap`), and `src/renderer/gameplay/newGamePreviewOwnership.ts` (`newGamePreviewOwnsMapNow`).
6. **`doc/ux/new-game-dialog.md`:**
   - Where it says the map shows the selected tab's preview, add "except during replay, when the map shows the recorded match (`newGamePreviewOwnsMapNow`)".
   - In States or Behavior, add that replay over a finished match sets the screen aside on every step before the last, without closing it. Link [replay-panel.md](replay-panel.md).
7. **`doc/ux/modes-and-transitions.md`, Replay section:** add one sentence: over Game over, the results screen shows only on the last recorded turn, and the map shows the recorded match.
8. **`doc/how-to-play.md`, Saving and Loading:**
   - Change "or after the match ends" in the Saving bullet to say a finished match can be saved too, to load and replay it later.
   - In the result-screen paragraph near "The match's history is saved in the `recordings` folder", add that **P** replays the match from the results screen. Change words in place, so no line is added.
9. Search `doc/` for `nothing to save`, `SAVE_GAME_OVER_MESSAGE`, and `cannot be saved`. No maintained document may still say a finished match cannot be saved. Release notes and the historical documents in `AGENTS.md` stay as they are.
10. Run `node scripts/check-doc-links.cjs`. Fix any broken link you added.
11. Run the full Phase Check, plus `check:renderer-types` and `build:renderer`, then every test any phase named, once more.

### Manual checklist for the user

Run `npm run ui:smoke` and `npm test`, then in the app:

1. Finish a short match, or load an autosave from the end of one.
2. Open the game menu. Save game… is enabled, with the tip "Save this finished match to a file, to load and replay it later." Save it.
3. Start a new match. Then use Load game… on the new-game bar to load the saved file. The window reloads onto the results screen with the Result section, as at the end of the match. No load confirmation appears over a finished match.
4. Press P. The results screen stays, and the map shows the final match map, not the preview.
5. Click Rewind. The results screen disappears. The console, the top bar's date and stats, and the past map show. Step and Play through the turns.
6. On an earlier turn, open the game menu. Save game… is enabled with the finished-match tip, and clicking it leaves replay and saves. Press P again afterwards.
7. Fast-forward to the last turn. The results screen returns, collapsed or expanded as you left it.
8. Press Escape. The next-game preview returns, framed as before.
9. Press P, then click New game on the results screen. The match starts normally.
10. In `userData/recordings`, only one recording file exists for that match.

### Verification

- Every Phase Check and named test passes.
- The doc searches in step 9 find nothing in maintained documents.
- `doc/how-to-play.md` has its Phase 0 line count or fewer.

---

## Reliability Checklist

- [ ] `saveGameItemState` enables Save for a finished match even with the results screen open, and still refuses an empty launch and a resolving turn.
- [ ] `matchSaveBlocker` no longer reads `game_over`, and the phase check still refuses a resolving turn.
- [ ] No `SAVE_GAME_OVER_MESSAGE` remains in `src`, `scripts`, or maintained docs.
- [ ] A loaded finished match keeps its playthrough id. A loaded live match still gets a new one.
- [ ] `exportFinishedMatchRecordingIfNeeded` never replaces a file holding more records than the database.
- [ ] `newGamePreviewOwnsMap` and `replayResultsScreenAside` are the only rules for their decisions, and both are tested.
- [ ] Setting the screen aside never adds or removes `hidden` on `#game-over-overlay`. Only `replay-aside` changes.
- [ ] Ending replay because of a new match, which the epoch shows, touches only the `replay-aside` class. It never resets the preview's Start hold or the controls.
- [ ] `readSaveLoadUiState` counts the match as over during replay over a finished match.
- [ ] `newGamePreviewOwnership.ts` imports only `replayState` and the shared rule, and `replayMatchOver.ts` imports nothing.
- [ ] Every `#game-over-overlay:not(.hidden)` selector also has `:not(.replay-aside)`.
- [ ] `replayMode.ts` and `renderer.ts` are unchanged. Files over 600 lines did not grow.
- [ ] Every new declaration has a full orienting comment. There is no plan vocabulary in code, tests, or `doc/`.

## Success Definition

- A finished match can be saved, loaded onto its results screen, and replayed.
- During replay, earlier turns look as they did in the game, and the results screen shows only on the last turn, over the final map.
- Leaving replay restores the normal game-over view.
- The recording of a finished match is never duplicated or shortened by loading its save.
- The named tests and static checks pass, and the docs describe the new behavior.

## Phase 0 Inventory

| Item | Value |
| --- | --- |
| Static check results | |
| Pre-existing failures in named tests | |
| Anchors confirmed | |
| `#game-over-overlay:not(.hidden)` counts | |
| Replay facts (session before first step; every step sets `index`) | |
| Strategic turns before the finished UI smoke session | |
| Line counts | |

## Defect Inventory

| Phase | Defect | Fix or reason for stopping |
| --- | --- | --- |
| 4 | The replay panel is a child of `#canvas-container`, so `setMainUIControlsEnabled(false)` made it ignore the pointer while the results screen was shown, on the step replay opens on. | `setMainUIControlsEnabled` leaves `replay-panel` out, with a contract test. |
| 4 | Names, borders, and the Tech and Production layers read `isNewGameOverlayOpen`, so they followed the preview latch during replay. | `mapAnnotationView.ts` and `productionOverlayHelpers.ts` read `newGamePreviewOwnsMapNow`. |
| 4 | Hex tips and the unit cursor read `newGameOverlayIsOpen`, so they stayed off on a step with the screen set aside. | New `newGameOverlayOnScreen` in `newGamePreviewOwnership.ts`, used by `mainMapInteractions.ts` and `drawInteraction.ts`. Its four click guards switched too, which is the same answer because replay is on whenever the screen is aside. |
| 4 | Editing five CSS files with `sed` turned their CRLF line endings into LF. | Converted back to CRLF; the diffs are the selector lines only. |

## Completion Log

| Phase | Result | Files changed beyond the lists | Sketch differences | Notes |
| --- | --- | --- | --- | --- |
| 1 | Done. Targeted tests pass. | none | none | Save of a finished match is enabled; tooltip is `SAVE_FINISHED_MATCH_TOOLTIP`. |
| 2 | Done. Targeted tests pass. | none | none | Finished-match load keeps its playthrough id; a longer recording file is kept. |
| 3 | Done. Targeted tests pass. | none | none | `gameScene.ts` stays 838 lines. |
| 4 | Done. Static checks and contract tests pass. | `src/main/rendererChatPanelContracts.test.ts` (selector assertion) | none | `newGameChrome.css` 748, `frameChrome.css` 696 (unchanged). New modules 163 and 42 lines. |
| 5 | Done. `ui-smoke-checks.test.cjs` 12 pass, new test 4 pass. The smoke run itself was not executed (told to test targeted only). | none | The earlier-step scene is kept, with the rewind click assumed to reach an earlier step. | `ui-smoke.cjs` is 595 lines. |
| 6 | Done. Doc links check passes. | `doc/ux/top-bar.md`, `doc/ux/console.md` | none | `how-to-play.md` stays 683 lines. Nothing committed. |
