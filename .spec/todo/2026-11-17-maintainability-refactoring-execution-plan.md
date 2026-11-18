# Maintainability Refactoring Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Nine behavior-preserving refactors. They:

- remove duplicated code;
- shrink the files closest to the 1000-line hard limit;
- make the existing gates check what they claim to check.

They make no user-visible change, no save-format change, and no change to any text sent to the AI commanders, logged, or returned over IPC.

**Shape:**

- **Phase 0** records a baseline.
- **Phases 1 to 9** each deliver one refactor. Each can be verified alone, or together with the phases it depends on.
- **Phase 10** runs the full verification.

The gate repairs come first, so later phases are checked by working gates. Phase 1 repairs the cycle check and Phase 3 repairs the IPC channel checks.

**Tech:**

- Electron 40 and TypeScript.
- esbuild.
- Main-process tests run with Node against `dist/`.
- Source-contract tests for the renderer: `src/main/renderer*Contracts.test.ts` and similar, which use `src/main/testSupport/rendererSourceAssertions.ts`.
- Playwright smoke scenes in `scripts/ui-smoke/`.

---

## How to Use This Plan

- **Order:** run the phases in order. Never start a phase while an earlier phase it depends on is failing verification.
- **Stopping:** stop a phase only when its verification fails and its own steps do not fix the failure. Then:
  1. Revert that phase (see Backup and Revert).
  2. Record the failure in the Defect Inventory.
  3. Continue with the next phase, but only if it does not depend on the reverted one. Each phase has a **Dependencies** line.
- **Git:** never commit, push, stash, merge, or rebase. Never run `git checkout`, `git restore`, `git reset`, or `git clean`. Read-only git commands are fine. The user reviews every change.
- **Finding code:** find code by the quoted text, not by line number. The line numbers in this plan are hints, taken on 2026-11-17 at commit `03e3aac`.
- **Sketches:** code sketches are sketches. Where a sketch and the file disagree, the file wins. Record the difference in the Completion Log.
- **Tests first:** where a phase says to write a test first, write it and run it before moving any code. It must pass against the old code, or fail where the phase says it should fail.
- **Shell:** every command in this plan is for **Git Bash**. It uses `$TEMP`, `echo "exit=$?"`, and forward-slash paths.
  - Bash's `**` globs do not recurse unless `globstar` is on. So this plan names files explicitly, and searches with `grep -rn --include=...`.
  - If you use PowerShell instead, read the exit code from `$LASTEXITCODE`, not from `$?`.
- **No paid calls:** make no paid model calls, and never set an OpenRouter key.
- **Files you must not touch:**
  - `doc/match-video.md`
  - `doc/release-notes/*`
  - `scripts/match_video/*`
  - `scripts/compose_match_comparison.py`
  - `.claude/`
- **Generated files:** `static/renderer.js` is a build artifact. A build changes it, which is fine, but never edit it by hand.
- **Line endings:**
  - Keep each file's line endings. Many files under `src/`, `static/`, `doc/`, and `scripts/` are CRLF.
  - Check a file before editing it: `python -c "import sys; print(b'\r\n' in open(sys.argv[1],'rb').read())" <path>`.
  - If your editor would change the line endings, make the edit with a small Python script that reads and writes the file in binary.
  - A new file takes the line endings of the file it was split from.

### Backup and Revert

Before each phase, copy every file the phase lists under **Edit** or **Delete** into `$TEMP/aw-refactor/phase-N/`, keeping each path relative to the repo root.

To revert a phase:

1. Copy the saved files back.
2. Delete every file the phase lists under **Create**.

---

## Verification Bar

**Between phases, targeted checks only:**

- **Build:** `npm run build:main` compiles `src/main` and `src/shared` into `dist/`.
- **One test:** `node dist/main/<path>.test.js`. The test runner `scripts/run-main-node-tests.cjs` finds every `dist/main/**/*.test.js` and `dist/shared/**/*.test.js` by itself, so a new test file needs no registration.
- **Native-module error:** if a test fails with `NODE_MODULE_VERSION` for `better-sqlite3`, run `npm run rebuild:native:node` and retry.
- **All main tests:** `node scripts/run-main-node-tests.cjs > "$TEMP/aw-refactor/tests-N.txt" 2>&1; echo "exit=$?"`, then read the tail of the file. This takes about 15 minutes.
- **Gates:** `npm run check:renderer-types`, `npm run lint`, `npm run naming:check`, and `npm run check:circular`.
- **Smoke-check unit tests:** `node --test scripts/ui-smoke/ui-smoke-checks.test.cjs`.

**Read the exit code, not only the output.**

- Run every gate as `<command>; echo "exit=$?"`.
- `check:circular` prints the cycles it finds and exits 1 when any of them is missing from `scripts/circular-deps-baseline.json`.

**End of the plan only:**

- **`npm test`:** about 20 minutes.
- **`npm run build:renderer`.**
- **`npm run ui:smoke`:** about 15 minutes. It rebuilds the native module for Electron.
- **Known flake:** the beat-limit scene in `ui:smoke` sometimes fails on timing. If the run stops there with no failed checks, run it once more and record both runs.

**Baselines:**

- Never edit a baseline file to make a gate pass. That covers `scripts/circular-deps-baseline.json` and the renderer type-check baseline.

**Behavior preservation (applies to every phase):**

- Every test that passed in Phase 0 still passes.
- No test is deleted unless the phase says so and names the test that takes over its assertions.
- When a contract test checks source text that a phase moves, the phase points the test at the new location. It never drops the assertion.
- Never reword a string that a user, a model, a log, or an IPC caller can see.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Read every file in `.cursor/rules/` once before Phase 1.

- **Orienting comments (rule 04):**
  - Every new or changed function, constant, type, field, and property gets a JSDoc block with:
    - a one-line summary;
    - `Purpose:` (or `Contract:` for interface members);
    - `When to use:`;
    - `Expected outcome:`;
    - `Exceptions:`.
  - `npm run lint` enforces this layout.
  - When you change a declaration whose comment is generic filler ("Supports maintainability by documenting why…", "Use per team conventions…"), replace the filler with specific text.
  - When you move a declaration unchanged, keep its comment. Fix any text the move made wrong, such as a file name.
- **Logging:**
  - Main-process code logs through `src/main/logger`.
  - `src/shared` never logs.
- **File size (rule 09):**
  - The target is 600 lines and the hard limit is 1000.
  - Record line counts before and after for every file that changes by more than 20 lines.
- **Arguments (rule 10):** a function with more than three parameters takes an options object.
- **Naming:** follow `doc/naming-conventions-contract-v1.md`.
- **Import cycles:**
  - From the end of Phase 1, `npm run check:circular` must exit 0 at the end of every phase. A new cycle is a failure.
  - Fix a cycle with a leaf module, which imports nothing from the cycle, or by passing the function in.
- **Documentation:**
  - `AGENTS.md` says `doc/` changes in the same change as the code whenever a document names a moved symbol, a moved path, or a build step. Each phase says which documents to search.
  - Keep plan vocabulary out of `src/`, `static/`, `scripts/`, `doc/`, and `.github/`. That means phase numbers and this file's name.
- **Re-exports:**
  - When a phase moves exported symbols to a new module, the old module re-exports them with `export { name } from './newModule';`. Callers then keep working.
  - Callers on the cycle path are the exception: the phase repoints those directly.
- **Final message:** list every document you updated.

---

## Locked Decisions

The user made these.

1. **Scope:** the whole codebase: `src/main`, `src/renderer`, `src/shared`, and `scripts`.
2. **Behavior preservation:** pure refactors only. There is no user-visible change and no save-format change. Each phase is proven by the existing tests plus the characterization tests it adds before moving code.
3. **Preload bundling:** keep the Phase 4 bundling, gated by a smoke run in the middle of the plan and reverted if the app fails to start.
4. **Cycle gate:** add `npm run check:circular` to `npm test`.
5. **Credits flag:** leave `isOpenRouterSessionCreditsExhausted` alone, and record it as an open question.
   - It is set when OpenRouter credits run out, but nothing reads it.
   - Its comment says later requests should fail fast.
   - So it is either dead code or a fast-fail that was never written. That is a behavior question, and it belongs in a separate change.

### Decisions This Plan Makes

- **The cycle check has been failing unnoticed.**
  - `scripts/circular-deps-baseline.json` is `[]`, and three runtime cycles exist today: one in `src/main` and two in `src/renderer`. So `npm run check:circular` exits 1.
  - `npm test` does not run the check, and neither does CI (`.github/workflows/ci.yml` runs `npm run test`). That is how the failure went unnoticed.
  - Phase 1 breaks all three cycles and adds the check to `npm test`.
- **Preload is bundled instead of split by hand.**
  - The renderer is sandboxed: Electron 40 has `contextIsolation: true` and sets no `sandbox` option, so the default applies. A sandboxed preload can `require` only `electron` and a few built-in modules.
  - That is why `src/main/preload.ts` copies the channel tables from `src/shared/ipc/channels.ts`.
  - Phase 4 bundles the preload with esbuild, which `build:renderer` already uses. The preload can then import the shared tables, and the copies are deleted.
- **Some unused code stays.**
  - The tooltip text constants that no code reads stay, because `doc/ux/control-tooltips.md` names some of them.
  - `src/renderer/tactical/tacticalDraftMarchOverlay.ts` stays. Nothing imports it, but a contract test reads it, and two UX documents list it as a code entry point. Deleting it is a decision for the user (see Phase 9).

---

## Non-Goals

- **Long engine functions:** no splitting of `applyTacticalAirStrikeThenRangedPhaseOnBattle`, `requestOrdersFlow`, `applyParsedRequestOrders`, or `executeReadyStrategicTurn`. They decide dice order and AI prompt text, so they need a golden-output test harness with fixed seeds first.
- **Renderer state:** no restructuring of the fields of `src/renderer/core/state.ts` into sub-objects. That would touch more than 200 call sites. No rewrite of its filler comments either.
- **CSS:** no splitting of CSS files.
- **DOM lookup:** no move to a typed DOM lookup helper.
- **Targeting modes:** no targeting-mode helper. The four `S.*ModeActive` flags have ordering rules that need a design of their own.
- **Confirm dialog:** no change to the backdrop behavior in `confirmDialog.ts`, which closes on any click on the backdrop.
- **Removing `export`:** no removal of `export` from symbols used only inside their own file.

---

## Phase 0 — Baseline

**Edit:** none. **Create:** none.

### Steps

1. Run `mkdir -p "$TEMP/aw-refactor"`.
2. Run `git status --short` and `git log --oneline -3`, and record both in the Phase 0 Inventory. On 2026-11-17, `static/renderer.js` was already modified and `.spec/todo/` was untracked. Phase 10 compares against this list.
3. Run each of the following as `<command>; echo "exit=$?"` and record the exit code and the last lines of output.
   - `npm run build:main`
   - `npm run check:renderer-types`
   - `npm run lint`
   - `npm run naming:check`
   - `npm run check:circular`: expected to exit 1 and print three cycles. Copy the cycle list exactly.
   - `node --test scripts/ui-smoke/ui-smoke-checks.test.cjs`
4. Record `wc -l` of these files:
   - `src/main/preload.ts`
   - `src/main/main.ts`
   - `src/main/gameDb.ts`
   - `src/renderer/renderer.ts`
   - `src/renderer/openRouter/openRouterUiHelpers.ts`
   - `src/renderer/rendering/unitDrawing.ts`
   - `src/renderer/charts/chartsDialog.ts`
   - `src/renderer/gameplay/matchOptionsDialog.ts`
5. Run `npm test > "$TEMP/aw-refactor/tests-0.txt" 2>&1; echo "exit=$?"` and record the result line.
   - This is the reference for "every test that passed in Phase 0".
   - If tests already fail, record which ones. Those failures are not yours to fix, but they must not get worse.

### Verification

Every command's result is recorded.

---

## Phase 1 — Break the Three Import Cycles and Gate Them

**Dependencies:** none.

**Edit:**

- `src/main/openRouter/promptText.ts`
- `src/main/tools/orderlessUnitSuggestions.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/map/basemapLayer.ts`
- `src/renderer/core/selection.ts`
- `src/renderer/rendering/unitDrawing.ts`
- `src/renderer/chrome/toastInlineMarks.ts`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/main/rendererChatPanelContracts.test.ts`, plus any other contract test found in step 6
- `package.json`: the `test` script only
- `.github/workflows/ci.yml`: the header comment only
- `doc/ux/reports-tab.md` and `doc/ux/notifications-and-feedback.md`: see step 7

**Create:**

- `src/main/openRouter/latLngText.ts`
- `src/renderer/chrome/mapToasts.ts`
- `src/renderer/rendering/unitIconPaths.ts`

### Background

`npm run check:circular` prints these three cycles.

- **Main:** `tools/orderlessUnitSuggestions.ts` → `openRouter/promptText.ts` → … → `tools/standingOrdersInjectionText.ts` → `tools/orderlessUnitSuggestions.ts`.
  - The edge that closes it is `orderlessUnitSuggestions.ts` importing `formatLatLng` from `../openRouter/promptText`.
  - Removing that edge clears the whole cycle.
- **Renderer A:** `openRouter/openRouterUiHelpers.ts` → `mapToastBody.ts` → `chrome/toastInlineMarks.ts` → `rendering/unitDrawing.ts` → `map/mapHelpers.ts` → `map/worldLeafletMap.ts` → `map/basemapLayer.ts` → `openRouterUiHelpers.ts`.
  - `basemapLayer.ts` closes it by importing `showMapToast`.
- **Renderer B:** `openRouterUiHelpers.ts` → `aiPlanningState.ts` → … → `core/selection.ts` → `openRouterUiHelpers.ts`.
  - `selection.ts` closes it by importing `hidePlanningChromeToasts`.

The checker reports only one cycle per search path, so it can hide others. A simulation of the moves below, run before this plan was written, found no cycles left in either tree once all three were done.

### Steps

1. **Break the main cycle.**
   - Create `src/main/openRouter/latLngText.ts`. It imports nothing.
   - Move `formatLatLng` into it unchanged. Rewrite its filler JSDoc: it formats a `[lat, lng]` pair to `decimalPlaces` decimals as `[lat, lng]` text for prompts.
   - In `promptText.ts`, add `export { formatLatLng } from './latLngText';`. If `promptText.ts` calls `formatLatLng` itself, also add `import { formatLatLng } from './latLngText';`.
   - Change `orderlessUnitSuggestions.ts` to import it from `../openRouter/latLngText`.
   - Run `npm run check:circular`. The main cycle must be gone. If a different main cycle appears, record it and fix it the same way.
2. **Move the toast block (renderer B).**
   - Create `src/renderer/chrome/mapToasts.ts`.
   - Move these declarations from `openRouterUiHelpers.ts` into it unchanged, with their comments:
     - `MapToastOptions`
     - `showMapToast`
     - `hideMapToast`
     - `showFilledAiStrategyToast`
     - `restartAiStrategyToastTimer`
     - the `let onStrategyToastHidden`
     - `setAiStrategyToastHiddenListener`
     - `hideAiStrategyToast`
     - `hidePlanningChromeToasts`
     - every private helper or module-level `let` that only these use
   - Read the block from the `MapToastOptions` comment (about line 226) to the end of `hidePlanningChromeToasts` (about line 460) before you move it.
   - Give `mapToasts.ts` the imports these declarations need: `state`, `constants`, `mapToastBody`, `consoleReports`, `chatPanelVisibility`, and `mapChromeLayout`, adjusted to the new path.
   - In `openRouterUiHelpers.ts`:
     - re-export every moved exported name from `../chrome/mapToasts`;
     - import any moved name it still calls;
     - remove imports it no longer uses.
   - Change `core/selection.ts` and `map/basemapLayer.ts` to import from `../chrome/mapToasts`.
   - **Expected:** right after this step, `check:circular` reports one new cycle: `chrome/mapToasts` → `mapToastBody` → `toastInlineMarks` → `unitDrawing` → … → `basemapLayer` → `chrome/mapToasts`. Step 3 removes it, so do not fix it here.
3. **Move the icon paths (renderer A).**
   - Create `src/renderer/rendering/unitIconPaths.ts` and move these into it from `unitDrawing.ts`, with their comments:
     - `type UnitIconType` (about line 41)
     - `UNIT_ICON_FILE_BY_TYPE`
     - `iconPathForType`
     - `unitIconPathForUnitType`
     - every pure constant they need
   - Export all four from `unitIconPaths.ts`. It must import nothing from `map/`, `openRouter/`, or `chrome/`.
   - In `unitDrawing.ts`:
     - import `UnitIconType`, `UNIT_ICON_FILE_BY_TYPE`, and `iconPathForType`, which it still uses (for example in `unitIconCache` and the draw functions);
     - re-export `unitIconPathForUnitType`;
     - re-export `UnitIconType` too if `unitDrawing.ts` exported it before.
   - Change `chrome/toastInlineMarks.ts` and `gameplay/selectionPanel.ts` to import `unitIconPathForUnitType` from `unitIconPaths`.
   - Check that no other file needs repointing: `grep -rn "unitIconPathForUnitType\|iconPathForType\|UNIT_ICON_FILE_BY_TYPE\|UnitIconType" src/renderer`.
4. **Check the result.**
   - Run `npm run check:circular; echo "exit=$?"`. It must print `check-circular-deps: ok` and exit 0.
   - If a cycle remains, find the edge that closes it in the printed list, move the smallest leaf it needs in the same way, and record the move.
5. **Add the gate.**
   - In `package.json`, insert `npm run check:circular &&` into the `test` script, directly after `npm run check:renderer-types &&`. Change nothing else.
   - In `.github/workflows/ci.yml`, update the header comment that lists what `npm run test` runs, so that it includes the import-cycle check. Change no workflow step.
6. **Repoint the contract tests.**
   - Run `grep -rn --include=*.test.ts "openRouterUiHelpers\|unitDrawing\|promptText" src/main`.
   - For each test that reads one of the moved declarations from its old file, change it to read the new file.
   - Known case: `src/main/rendererChatPanelContracts.test.ts`, about line 101, reads the toast code from `openRouterUiHelpers.ts`. Point it at `readRendererSource('chrome', 'mapToasts.ts')`.
   - Keep each asserted fragment exactly as it is. Record every test you changed.
7. **Update the documents.**
   - Run `grep -rn "openRouterUiHelpers\|showMapToast\|hidePlanningChromeToasts\|unitDrawing\|formatLatLng" doc/ --include=*.md`, excluding `doc/release-notes/`.
   - `doc/ux/reports-tab.md` (about line 84) and `doc/ux/notifications-and-feedback.md` (about line 95) name `openRouterUiHelpers.ts` for the toast code. Point those entries at `src/renderer/chrome/mapToasts.ts`.
   - Update every other Code Entry Points or Source Anchors entry that names a moved symbol's file.

### Verification

- `npm run check:circular` exits 0.
- `npm run check:renderer-types`, `npm run lint`, and `npm run naming:check` exit 0.
- `npm run build:main` passes, and then these pass:
  - every contract test you repointed
  - `node dist/main/openRouter/promptText.test.js`
  - `node dist/main/openRouter/promptTextEmbarked.test.js`
  - `node dist/main/tools/orderlessUnitSuggestions.test.js`

---

## Phase 2 — One List of Additive Schema Migrations

**Dependencies:** Phase 1, which provides the gates.

**Edit:**

- `src/main/gameDb.ts`
- optionally `doc/save-files.md` (see step 6)

**Create:**

- `src/main/gameDb/additiveMigrations.ts`
- `src/main/gameDb/additiveMigrations.test.ts`

### Background

`gameDb.ts` runs the same six migration calls, in the same order, in three places:

- `createFreshGameDatabaseAt`, about line 248;
- `openGameDatabaseAtPathForTests`, about line 293, on its path for an existing file;
- `openExistingGameDatabaseAt`, about line 499.

The calls are exactly these, at all three sites:

```ts
ensureHireOrderReservedCreditsColumn(gameDbOps);
ensureSeatAddedColumns(gameDbOps);
ensurePendingAirDropOrdersTable((sql) => gameDbOps.run(sql));
ensureMatchRecordsTable((sql) => gameDbOps.run(sql));
ensureSideMessageTables((sql) => gameDbOps.run(sql));
ensureSideStanceScoreColumns(gameDbOps);
```

A seventh migration added at only two of the sites would leave either the test path or real saves without the new column.

### Steps

1. **Read the three sites.**
   - Confirm that each matches the block above. Calls that take `gameDbOps` and calls that take `(sql) => gameDbOps.run(sql)` are both expected.
   - If a site differs in any other way, record the difference and leave that site alone.
   - Also confirm the type of `gameDbOps`: `BasicDbOps` from `./gameDb/dbOps`, or whatever the file declares.
2. **Write the test first: `additiveMigrations.test.ts`.**
   - Follow the style of a neighbouring `src/main/gameDb/*.test.ts` file (`node:test` with `assert`).
   - Do this in a temp directory, and remove the directory in a `finally`:
     1. Call `openGameDatabaseAtPathForTests(path)` on a new path. That runs the fresh-database site.
     2. Assert the tables and columns below.
     3. Call `closeGameDatabaseForTests()`.
     4. Call `openGameDatabaseAtPathForTests(path)` again on the same path. That runs the existing-file site.
     5. Assert the same tables and columns again.
   - The tables `match_records`, `pending_air_drop_orders`, `side_messages`, and `side_stances` must exist.
   - The `trust` and `threat` columns must exist on `side_stances`.
   - The column that `ensureHireOrderReservedCreditsColumn` adds must exist, and so must the columns that `ensureSeatAddedColumns` adds. Read each function to get the table and column names.
   - Read tables from `sqlite_master` and columns from `PRAGMA table_info(<table>)`. Use the read helpers the database module exports, as neighbouring tests do.
   - Build, and run the test against the old code. It must pass.
3. **Create the helper.**
   - Create `additiveMigrations.ts`, which exports `applyAdditiveSchemaMigrations(ops: BasicDbOps): void`. Use the real type from step 1.
   - It runs the six calls in the original order. It passes `ops` to the hire-order, seat-columns, and stance-score functions, and `(sql) => ops.run(sql)` to the other three.
   - Its JSDoc says:
     - every migration that adds a column or table on open goes here and only here;
     - the order matters;
     - the `EXPECTED_USER_VERSION` comment in `gameDb.ts` describes the same set.
4. **Use the helper.**
   - Replace each six-line block with `applyAdditiveSchemaMigrations(gameDbOps);`.
   - Leave the lines around it, such as `ensureStrategicInfrastructureSyncTriggers()`, where they are.
   - Remove imports that `gameDb.ts` no longer uses.
5. **Update the `EXPECTED_USER_VERSION` comment.** About line 151, the JSDoc lists each migration function by name. Add that `applyAdditiveSchemaMigrations` runs them. Do not change the version number.
6. **Documents.**
   - `doc/save-files.md` (about line 43) describes the migrations that run on open.
   - If it names the call sites or says the list lives in `gameDb.ts`, update it to name `src/main/gameDb/additiveMigrations.ts`. Otherwise leave it alone.

### Verification

- `npm run build:main` passes, and then these pass:
  - `node dist/main/gameDb/additiveMigrations.test.js`
  - `node dist/main/gameDb.test.js`
  - `node dist/main/fortificationSchema.test.js`
  - `node dist/main/mercenarySchema.test.js`
  - `node dist/main/missileSchema.test.js`
  - `node dist/main/freshMatchLoad.test.js`
- `npm run lint` and `npm run check:circular` exit 0.

---

## Phase 3 — One IPC Parity Test That Also Checks Literals and Handlers

**Dependencies:** Phase 1.

**Edit:**

- `src/main/preload.ts`: two lines
- `src/main/preloadIpcChannelParity.test.ts`

**Delete:** `src/main/preloadChannelParity.test.ts`. Its assertions move into `preloadIpcChannelParity.test.ts` first.

### Background

`preloadChannelParity.test.ts` and `preloadIpcChannelParity.test.ts` do the same job.

- Each parses the copied `IPC_GAME` and `IPC_OPENROUTER` tables in `preload.ts`, and compares them with `src/shared/ipc/channels.ts`.
- `preloadIpcChannelParity.test.ts` is a plain script with a `run()` function and `assert`.
- `preloadChannelParity.test.ts` uses `node:test`.

Neither test catches two problems:

- **Literal channels.** Two calls bypass the tables with string literals: `ipcRenderer.invoke('game:newGame', payload)` (about line 362) and `ipcRenderer.invoke('game:setSeatCommander', seatId, commander)` (about line 409).
- **Missing handlers.** Nothing checks that main registers a handler for every channel.

How main uses the channels:

- **Handlers:** `ipcMain.handle(IPC_GAME.x, …)`, or `registerLoggedIpcHandler(ipcMain, IPC_GAME.x, …)`, from `src/main/ipc/loggedIpcHandler.ts`. With the logged form, the channel is the second argument, often on its own line.
- **Pushes to the renderer:** `sender.send(`, `event.sender.send(`, and `mainWindow?.webContents?.send(`.

### Steps

1. **Merge the two tests.**
   - Keep the `run()` style of `preloadIpcChannelParity.test.ts`.
   - Read both files. Copy in every check from `preloadChannelParity.test.ts` that the other file lacks, as an extra function called from `run()`.
   - Then delete `preloadChannelParity.test.ts`, and also `dist/main/preloadChannelParity.test.js` if it exists. The build does not remove stale output.
   - List each moved check in the Completion Log.
2. **Test first: no literal channels.**
   - Add a check that strips comments from `preload.ts` and asserts no match for this regex:

     ```js
     /ipcRenderer\.(invoke|on|send|removeListener|removeAllListeners)\(\s*['"`]/
     ```

   - Strip block comments with `/\/\*[\s\S]*?\*\//g` and line comments with `/^\s*\/\/.*$/gm`.
   - Build and run it. It must fail, naming the two literals.
3. **Fix the literals.**
   - Change them to `ipcRenderer.invoke(IPC_GAME.newGame, payload)` and `ipcRenderer.invoke(IPC_GAME.setSeatCommander, seatId, commander)`.
   - Both keys exist in the preload table and in `channels.ts`.
   - The check now passes.
4. **Add the main-handler check.**
   - Read every `.ts` file under `src/main`, recursively. Skip `*.test.ts`, `preload.ts`, and `testSupport/`.
   - Strip comments as in step 2, then collect every match of this regex:

     ```js
     /(?:\.handle|\.on|\.send|registerLoggedIpcHandler)\(\s*(?:ipcMain\s*,\s*)?(IPC_GAME|IPC_OPENROUTER)\.(\w+)/g
     ```

   - Assert that every key of `IPC_GAME` and `IPC_OPENROUTER` in `channels.ts` matches at least once. On failure, the message lists the missing keys.
   - **Expected:** run against the current code, every key matches. The review run on 2026-11-17 found all 79.
   - If a key does not match, find its handler by hand.
     - If it has one through a path the regex cannot see, add the key to one named, commented `const HANDLED_ELSEWHERE: readonly string[]` in the test, with a one-line reason.
     - If it really has no handler, record it in the Defect Inventory and add it to `HANDLED_ELSEWHERE` with the reason `no handler found; see the refactoring plan's Defect Inventory`.
     - Never widen the regex until it happens to pass.

### Verification

- `npm run build:main` passes.
- `node dist/main/preloadIpcChannelParity.test.js` passes.
- `dist/main/preloadChannelParity.test.js` does not exist.
- `npm run lint` exits 0.
- `grep -rn "preloadChannelParity" scripts src doc` returns nothing, or only references you updated in this phase.

---

## Phase 4 — Bundle the Preload and Import the Shared Channel Tables

**Dependencies:** Phase 3.

**Edit:**

- `package.json`: the `build:main` script only
- `src/main/preload.ts`
- `src/main/preloadIpcChannelParity.test.ts`
- the documents found in step 8

**Create:**

- `scripts/build-preload.cjs`
- `src/main/preloadBundle.test.ts`

### Background

- **Why the copies exist.** The window has `contextIsolation: true` and no `sandbox` option. Electron 40 (`40.10.6` in `node_modules/electron/package.json`) sandboxes the renderer by default, and a sandboxed preload can `require` only `electron` and a few built-in modules. A relative import of `../shared/ipc/channels` compiles to a `require` that fails at runtime. That is why `preload.ts` copies the tables.
- **What bundling fixes.** esbuild can inline the shared module into the preload file. `preload.ts` is 997 lines, 3 under the hard limit.
- **Where the preload comes from.** `main.ts` loads `path.join(__dirname, 'preload.js')`, which is `dist/main/preload.js`. electron-builder ships `dist/`.
- **Which commands build it.** `npm run build`, `npm test`, `npm run ui:smoke`, `npm run dist*`, and `doc:shots` run `build:main`. `npm start` does not; it uses whatever is in `dist/`.

### Steps

1. **Confirm the facts and record them.**
   - Read how `main.ts` builds `preloadPath`, and the window's `webPreferences`.
   - Read `electron-builder.config.cjs` to confirm that `dist/main/preload.js` ships.
   - Run `grep -n "tsconfig.main.json" package.json scripts/*.cjs` to confirm that only `build:main` runs tsc for main.
2. **Write the build script.** Create `scripts/build-preload.cjs`, with a JSDoc header like the other scripts.
   - Bundle `src/main/preload.ts` into `dist/main/preload.js` with esbuild's JS API:

     ```js
     require('esbuild').build({
       entryPoints: ['src/main/preload.ts'],
       outfile: 'dist/main/preload.js',
       bundle: true,
       platform: 'node',
       format: 'cjs',
       target: 'node20',
       external: ['electron'],
       sourcemap: false,
       logLevel: 'warning',
     })
     ```

   - Electron 40 ships Node 24, so `node20` is safe. Record the choice.
   - Log one line on success with `console.log`.
   - On failure, print the error and `process.exit(1)`.
3. **Wire it in.**
   - Change `build:main` to `npm run generated:extract && tsc -p tsconfig.main.json && node scripts/build-preload.cjs`.
   - tsc still type-checks `preload.ts`, including the `satisfies GameApi` check. The bundle then overwrites tsc's `dist/main/preload.js`.
4. **Test first: `preloadBundle.test.ts`.** Use the `node:test` style. Read `path.resolve(process.cwd(), 'dist', 'main', 'preload.js')` and assert three things:
   - The only `require(` call in the file is `require("electron")`. Match every `require\(\s*["']([^"']+)["']\s*\)` and assert that the set of names is exactly `{"electron"}`.
   - Every value of the shared `IPC_GAME` and `IPC_OPENROUTER`, imported from `../shared/ipc/channels`, appears in the file as a quoted string.
   - The file contains `contextBridge.exposeInMainWorld`.

   Build and run it. It passes now, and it must keep passing after step 5.
5. **Import the shared tables.**
   - In `preload.ts`, delete the copied `IPC_GAME` and `IPC_OPENROUTER` objects and their comments.
   - Add `import { IPC_GAME, IPC_OPENROUTER } from '../shared/ipc/channels';`.
   - Run `npm run build:main`, then `node dist/main/preloadBundle.test.js`.
6. **Retarget the parity test.**
   - The copied tables are gone, so remove the table comparison from `preloadIpcChannelParity.test.ts`.
   - Keep the literal-channel check and the main-handler check from Phase 3.
   - Add a check that `preload.ts` contains `from '../shared/ipc/channels'` and declares no `const IPC_GAME` or `const IPC_OPENROUTER`.
   - Update the test's header comment, which says it parses the preload without importing it because of the sandbox.
   - Record the change.
7. **Update the comments.**
   - Rewrite the module JSDoc of `preload.ts`. It must say that:
     - `scripts/build-preload.cjs` bundles the file, because a sandboxed preload cannot load relative modules;
     - the file may import `src/shared` modules that use no Node or DOM API.
   - Remove every comment that says the tables are copies.
8. **Update the documents.**
   - Run `grep -rln "build:main\|preload" doc/ AGENTS.md README.md --include=*.md`. Skip `doc/release-notes/` and the historical documents that `AGENTS.md` lists.
   - Update every sentence that describes how the preload is built, or why the channel tables are copied.
   - If `doc/project-instructions.md` describes `build:main`, update that fact without touching its persona or tone.
   - Say in the documents that `npm start` uses the last build.

### Verification

- `npm run build:main` passes.
- `node dist/main/preloadBundle.test.js` and `node dist/main/preloadIpcChannelParity.test.js` pass.
- `npm run lint` exits 0.
- `wc -l src/main/preload.ts` is about 90 lines lower than in Phase 0. Record it.
- **Launch check.** This phase changes how the app starts, so run `npm run ui:smoke > "$TEMP/aw-refactor/smoke-4.txt" 2>&1; echo "exit=$?"` now. It is the only smoke run in the middle of the plan.
  - It must get past the first scene that calls `window.gameApi`, which proves the bridge loaded.
  - If the window is blank, or the run reports `gameApi` as undefined, revert this phase and record the error.
  - A beat-limit timing failure does not decide this check. Judge by the scenes before it.

---

## Phase 5 — One Temporary-Database Helper for Tests

**Dependencies:** Phase 1.

**Edit:**

- `src/main/testSupport/withTempGameDb.ts`
- the test files with private wrappers, listed below
- `src/main/tools/tempoRuleAttacks.test.ts`
- `src/main/tools/tempoRuleAirFerry.test.ts`

**Create:** `src/main/testSupport/withTempGameDb.test.ts`

### Background

- **The shared helper.** `withTempGameDb(prefix, runCase)`:
  1. creates a temp directory under `os.tmpdir()` with `fs.mkdtempSync(path.join(os.tmpdir(), prefix))`;
  2. opens a database and resets it;
  3. runs the case;
  4. closes the database and removes the directory, in a `finally`.
- **Private copies.** These files define their own copy, named `withTempDb`, `withSeededGame`, `withMemoryDb`, or `withFreshDb`:
  - `gameActions/humanMarchPreview.test.ts`
  - `gameActions/navalSeaportBerth.test.ts`
  - `gameActions/sealift.test.ts`
  - `gameActions/strategicMarchStacking.test.ts`
  - `gameActionsProduction.test.ts`
  - `gameDb/aiStateSeats.test.ts`
  - `gameDb/turnNotesHistorySeats.test.ts`
  - `openRouter/afterResolutionTacticalBeat.test.ts`
  - `openRouter/applyParsedMemoryUpdates.test.ts`
  - `openRouter/applyParsedOpponentCallbacks.test.ts`
  - `openRouter/tacticalPromptSectionParity.test.ts`
  - `tools/tempoRuleAirFerry.test.ts`
  - `tools/tempoRuleAttacks.test.ts`
  - `testSupport/gameActionsMultiSelectFixtures.ts`, a support module, not a test

  All are under `src/main/`.
- **Leaks.** `tools/tempoRuleAttacks.test.ts` (about lines 58–67) and `tools/tempoRuleAirFerry.test.ts` (about lines 88–97) never delete their temp directory.

### Steps

1. **Test first: `withTempGameDb.test.ts`,** in the `node:test` style. Give each case a unique prefix, for example `aw-wtgdb-${process.pid}-${Date.now()}-`, so its directory can be found.
   - **Open database:** inside the case, `getGameStateSnapshot().turnNumber` is 1. Use the snapshot getter the neighbouring tests use.
   - **Cleanup on return:** after the helper returns, `fs.readdirSync(os.tmpdir())` holds no entry that starts with the prefix.
   - **Cleanup on throw:** when the case throws, the helper rethrows the same error (check with `assert.throws`), and no entry with the prefix is left.

   Build and run it against the current helper. It must pass.
2. **Extend the helper without changing current callers.**
   - New signature: `withTempGameDb(prefix: string, runCase: () => void, options?: WithTempGameDbOptions): void`.
   - `WithTempGameDbOptions` has two optional fields:
     - `reset`: the options type `resetGameForNewMatch` takes, or `false`. Read the function to find the type. Omitted means a plain `resetGameForNewMatch()`; `false` skips the reset.
     - `afterOpen: () => void` runs after the reset and before the case.
   - Replace the helper's filler JSDoc with specific text, and document each field.
   - Add a test for `reset: false`, for example that the case runs without a reset (choose an observable sign from the reset function), and one for `afterOpen` running before the case.
3. **Migrate the private wrappers, one file at a time.** For each listed file:
   1. Read its private wrapper.
   2. Run the file's test and record how many tests pass.
   3. If the wrapper does what `withTempGameDb` does, possibly with reset options or one step after opening, make the wrapper a one-line call to `withTempGameDb`, or replace its callers. Keep every test name.
   4. If the wrapper does something the helper cannot, leave it and write the reason in the Completion Log. Examples: a user-data directory, a seeded save file, an async case, an in-memory database.
   5. Build, run the file's test again, and confirm the pass count is unchanged. Record both counts.
4. **Fix the two leaks.** Make `tempoRuleAttacks.test.ts` and `tempoRuleAirFerry.test.ts` use the helper. If they cannot, add `fs.rmSync(dir, { recursive: true, force: true })` in a `finally`.
5. **Leave the rest.**
   - Do not migrate tests that call `openGameDatabaseAtPathForTests` directly, outside a private wrapper.
   - Record their count from `grep -rl --include=*.test.ts "openGameDatabaseAtPathForTests(" src/main | wc -l` in the Completion Log.

### Verification

- `npm run build:main` passes.
- `node dist/main/testSupport/withTempGameDb.test.js` passes.
- Each migrated file's test passes with the same count as before.
- `npm run lint` exits 0.

---

## Phase 6 — Point Contract Tests at Real Code and Delete the Anchor Comments

**Dependencies:** Phase 1.

**Edit:**

- `src/renderer/renderer.ts`
- `src/renderer/rendering/gameScene.ts`
- `src/renderer/wiredEntryCallbacks.ts`
- `src/main/rendererProductionAirConsolidation.test.ts`
- `src/main/rendererDrawConsolidation.test.ts`
- `src/main/rendererStackPopoverContracts.test.ts`
- any other test found in step 1

### Background

- **Where the anchors are.** Seven comment blocks say "Contract anchor(s) retained … after extraction": five in `renderer.ts` (about lines 644, 660, 749, 792, and 860), one in `gameScene.ts` (about 342), and one in `wiredEntryCallbacks.ts` (about 353). Run `grep -rn "Contract anchor" src/renderer` to find them.
- **What they hold.** They contain copies of code text, so that older source-contract tests still find that text in the file the code used to live in. Those assertions pass on comments and guard nothing.
- **Known cases:**
  - `applyModifierDrivenPopoverCloseRules('shift_pressed')` lives in `src/renderer/map/initCore.ts`. `rendererStackPopoverContracts.test.ts` asserts it.
  - `const hasAirSelection = selectedAtMouseDown…` and `replacePendingFerryOrdersForSelected(selectedIds, destinationH3);` appear only in the anchor near `renderer.ts:792`. `rendererProductionAirConsolidation.test.ts` asserts them at about lines 197–204. The real code in `src/renderer/map/mapDoubleClickHandler.ts` is worded differently.
  - `if (!validation.success) {}` and `buildConsolidatedTurnUpdateToastMessage({})` appear in anchors, but no test asserts them.

### Steps

1. **Map each anchor before changing anything.** For each anchor block:
   - List every code fragment it quotes.
   - Find every test that asserts each fragment, with `grep -rn --include=*.test.ts -F "<fragment>" src/main`.
   - Find the real code, with `grep -rn -F "<fragment>" src/renderer`, ignoring comment lines.
   - Write the result as a table in the Completion Log: fragment, test file and test name, real module, and whether the fragment matches the real code exactly.
2. **Apply the rule that fits each fragment.**
   - **The fragment matches real code in another module:** change the assertion to read that module, with `readRendererSource('<dir>', '<file>.ts')`. Where the old test narrowed to a function with `getFunctionSource`, narrow to the real function. Keep the fragment exactly as it is.
   - **The real code is worded differently,** as with the ferry double-click case: replace the fragment with one copied exactly from the real code that checks the same behavior. For the ferry case, use the line in `mapDoubleClickHandler.ts` that calls `replacePendingFerryOrdersForSelected`, and the line that computes whether the selection holds air units. Record the old and new fragments side by side. Never edit the real code to match a fragment.
   - **No test asserts the fragment:** delete it from the anchor.
   - **Nothing in real code does what the fragment describes:** keep that one anchor line, record it in the Defect Inventory, and raise it in the final message.
3. **Delete** each anchor block once all its fragments are handled. When a block keeps any line, keep its comment header above the kept lines.
4. **Prove the repointed assertions still check something.** Run each changed test, and each must pass. Then, for each repointed assertion:
   1. Change one character of the asserted fragment in the test.
   2. Build and run it, and watch it fail.
   3. Restore the character, then build and run again.

### Verification

- `npm run build:main` passes, and every changed test passes.
- `grep -rn "Contract anchor" src/renderer` prints only the anchors kept in step 2.
- `npm run check:renderer-types`, `npm run lint`, and `npm run check:circular` exit 0.

---

## Phase 7 — Shared Modal Dialog Helpers

**Dependencies:** Phase 1.

**Edit:**

- `src/renderer/charts/chartsDialog.ts`
- `src/renderer/gameplay/matchOptionsDialog.ts`
- `src/main/rendererChartsDialogContracts.test.ts`
- `src/main/rendererMatchOptionsContracts.test.ts`

**Create:**

- `src/renderer/chrome/modalDialogKit.ts`
- `src/main/rendererModalDialogKitContracts.test.ts`

### Background

The charts dialog and the in-match Game Options dialog contain duplicated pieces.

- **Focusable list.** Both use `querySelectorAll('button, select, input, [tabindex]')`, filtered by `!(element as HTMLButtonElement).disabled && element.tabIndex >= 0 && element.getClientRects().length > 0`.
  - `matchOptionsDialog.ts` has a `focusableControls(popover)` function.
  - `chartsDialog.ts` builds the same list inline in `trapTabKey`.
- **Tab trap.** The two differ in three ways:
  - **Key check.** The charts version checks `event.key !== 'Tab'` itself. The match-options caller checks the key before calling.
  - **First stop.** The charts version uses its Close button (`#charts-dialog-close`) as the first stop, and uses it as `last` when the list is empty. The match-options version uses `focusable[0]` as the first stop, and returns early when the list is empty.
  - **The rest is the same:** Shift+Tab from the first stop, or with focus outside the dialog, goes to `last`. Tab from `last`, or with focus outside, goes to the first stop.
- **Backdrop dismissal.** Both are identical: a `pointerdown` listener records `pressStartedOnBackdrop = event.target === <backdrop>`. A `click` listener:
  1. calls `event.stopPropagation()`;
  2. reads the flag and clears it;
  3. closes only when `event.target === <backdrop>` and the press started there.

  A loop then adds a `stopPropagation` listener for `pointerdown`, `mousedown`, `dblclick`, and `wheel`. Neither checks whether the dialog is open.

### Steps

1. **Read both implementations side by side** and confirm the Background. Record any further difference. The kit must keep every difference as a parameter, never by changing either dialog's behavior.
2. **Create `modalDialogKit.ts`.** It imports nothing from the dialogs. It exports these, each with full JSDoc:
   - **`focusableControls(root: HTMLElement): HTMLElement[]`:** the shared selector and filter, exactly as they are today.
   - **`trapTabWithin(event: KeyboardEvent, root: HTMLElement, options?: { readonly firstStop?: HTMLElement }): void`:** it does not check `event.key`; callers call it only for Tab. With `firstStop`, the first stop is `firstStop` and `last` is the last focusable control, or `firstStop` when the list is empty. Without it, the first stop and `last` are the ends of the list, and the function returns when the list is empty. The movement rules are those in the Background.
   - **`wireBackdropDismiss(backdrop: HTMLElement, onDismiss: () => void): void`:** it adds, in this order, the `pointerdown` flag listener, the `click` listener, and the four `stopPropagation` listeners. The press-start flag lives in a closure, so each dialog loses its module-level `pressStartedOnBackdrop`.
3. **Test first: `rendererModalDialogKitContracts.test.ts`,** in the style of `rendererChartsDialogContracts.test.ts`. Assert from the kit's source:
   - `wireBackdropDismiss` sets the flag from `event.target === backdrop` on `pointerdown`.
   - Its `click` listener checks both `event.target === backdrop` and the flag.
   - It adds listeners for all four swallowed event types.
   - `trapTabWithin` calls `preventDefault`, and its two branches focus `last` and the first stop.

   This test fails until step 2 is done. Write it, run it, see it fail on the missing file or functions, then finish step 2.
4. **Use the kit in both dialogs.**
   - **Charts dialog:** keep its `trapTabKey(event)` wrapper with its key check and element lookup, and replace the body after the lookup with `trapTabWithin(event, dialog, { firstStop: close })`.
   - **Match-options dialog:** replace its `focusableControls` and `trapTabKey` with the kit's functions. Its other use of `focusableControls`, choosing the first control to focus on open, uses the kit's version.
   - **Both:** replace the backdrop `pointerdown`, `click`, and swallow-loop code with `wireBackdropDismiss(<backdrop>, () => <the same close call>)`.
   - Keep every open, close, epoch, and focus-return path as it is.
5. **Repoint the contract tests.**
   - `rendererChartsDialogContracts.test.ts` (about lines 127–130) asserts `pressStartedOnBackdrop = event.target === overlay;` inside `wireChartsDialog`. Change it to assert that `wireChartsDialog` contains `wireBackdropDismiss(overlay`.
   - Repoint the same way any `rendererMatchOptionsContracts.test.ts` assertion on the moved pieces. Find them with `grep -n "pressStartedOnBackdrop\|trapTabKey\|focusableControls" src/main/*.test.ts`.
6. Run `npm run check:circular`.

### Verification

- `npm run check:renderer-types`, `npm run lint`, and `npm run check:circular` exit 0.
- `npm run build:main` passes, and the three contract tests pass.
- The line counts of `chartsDialog.ts` and `matchOptionsDialog.ts` are lower than in Phase 0. Record them.
- The smoke run in Phase 10 must pass the charts open and close scenes and `ui-smoke-match-options.cjs`.

---

## Phase 8 — Move Two Large IPC Handlers Out of `main.ts`

**Dependencies:** Phases 1 and 3. Phase 3 provides the main-handler check.

**Edit:** `src/main/main.ts`

**Create:**

- `src/main/ipc/newGameIpcHandler.ts`
- `src/main/ipc/tacticalCommitIpcHandler.ts`

### Background

`registerIpcHandlers` in `main.ts` (695 lines) holds two long inline handler bodies.

- **`IPC_GAME.newGame`:** about 68 lines, starting near line 348.
  - It calls `sendActivityLog`, a closure declared at the top of `registerIpcHandlers` (about line 295).
  - That closure sends to the mutable `mainWindow`.
- **`IPC_GAME.commitHumanTacticalDraftOrders`:** about 75 lines, starting near line 466.
  - It calls `requestOrdersWithLog`, a module-private function in `main.ts` (about line 247) bound to `mainWindow`.
  - It builds the same seven-field orders object twice (about lines 475–483 and 486–494). The two copies were confirmed identical on 2026-11-17.

The pattern to follow is already in `main.ts`: a `register…IpcHandler` function per file, with dependencies passed in. For example:

- `registerSaveLoadIpcHandler(ipcMain, () => mainWindow, sendActivityLog)`
- `registerHowToPlayIpcHandler(ipcMain, (url) => shell.openExternal(url))`

### Steps

1. **Move `newGame`.**
   - Create `newGameIpcHandler.ts`, exporting `registerNewGameIpcHandler(ipcMain: Pick<IpcMain, 'handle'>, deps: NewGameIpcHandlerDeps): void`.
   - `NewGameIpcHandlerDeps` is `{ readonly sendActivityLog: (line: string) => void }`. Add a field for every other closure or module-private function of `main.ts` that the body uses; read the body to list them. Document each field.
   - Move the body in unchanged, including:
     - the `withAutoSaveAfter` wrapper;
     - every `stopModelWork`, reset, and log call, in the same order;
     - every log message string.
   - Import the module-level functions it calls from their real modules.
   - In `main.ts`, replace the inline `ipcMain.handle(IPC_GAME.newGame, …)` with `registerNewGameIpcHandler(ipcMain, { sendActivityLog, … });` at the same position inside `registerIpcHandlers`.
2. **Move the tactical commit handler** the same way.
   - Put it in `tacticalCommitIpcHandler.ts`, as `registerTacticalCommitIpcHandler(ipcMain, deps)`.
   - The deps include `{ readonly requestOrders: typeof requestOrdersWithLog }`, plus any other `main.ts`-private function the body uses. Export no new symbol from `main.ts`; pass functions in instead.
   - While moving it, read both seven-field orders objects.
     - If they are identical, build the object once in a local `const` and use it in both places.
     - If any field differs, keep both and record the difference.
3. **Remove imports from `main.ts` that it no longer uses.**
4. Record the new line count of `main.ts`. Expect it to be about 140 lines lower.
5. Run `npm run check:circular` and `node dist/main/preloadIpcChannelParity.test.js`. The handler check must find both channels in the new files.

### Verification

- `npm run build:main` passes, and `npm run lint` and `npm run check:circular` exit 0.
- These pass:
  - `node dist/main/preloadIpcChannelParity.test.js`
  - `node dist/main/freshMatchLoad.test.js`
  - `node dist/main/gameActions/aiOnlyTacticalCommit.test.js`
  - `node dist/main/ipcPayloadGuardsTacticalCommit.test.js`
- The smoke run in Phase 10 must pass its new-game and tactical-battle scenes.

---

## Phase 9 — Delete Verified Dead Code

**Dependencies:** Phase 1.

**Edit:** only the files that hold the symbols below.

### Steps

1. **Check every candidate before deleting it.**
   - Run `git grep -n "\b<name>\b" -- src scripts doc .github`.
   - Delete a symbol only when the only hits are its own declaration and comment.
   - Also run `grep -rn --include=*.test.ts "<file name without extension>" src/main`. If a contract test reads the symbol's file, read the test. If it asserts text inside the symbol, keep the symbol and record why.
   - Record every result.

   | Symbol | File |
   | --- | --- |
   | `findPathWithOptionalAvoidanceRetry` | `src/main/tools/pathfindingDistanceHelpers.ts` |
   | `prependSeaportEgressStep` | `src/main/tools/pathfindingDistanceHelpers.ts`. It becomes dead only once `findPathWithOptionalAvoidanceRetry` is gone, so grep again after that deletion. |
   | `getTerrainStrategicNamingRecordsFromSnapshot` | `src/main/terrainClassificationCache.ts` |
   | `updatePendingEmbarkAfterTacticalSealiftSelect` | find it with grep |
   | `tacticalRendererShouldBlockStrategicMapOrders` | `src/renderer/tactical/tacticalUiGuards.ts` |
   | `TACTICAL_ADVANCE_BACKGROUND_AI_TIMEOUT_MS` | `src/renderer/core/constants.ts` |

2. **Follow the dead code each deletion leaves.** After each deletion, grep for every symbol the deleted code used from its own file.
   - Delete a symbol that now has no references at all.
   - Remove imports that became unused.
   - Known follow-ons:
     - `tacticalRendererIsBattleActive` and `TacticalRendererGateState` in `tacticalUiGuards.ts`, if nothing else uses them after the gate function goes.
     - The `AI_CONSULTATION_WAIT_TIMEOUT_MS` import in `constants.ts`, if `TACTICAL_ADVANCE_BACKGROUND_AI_TIMEOUT_MS` was its only user there. Update or remove the comment that names it.
   - Never delete a symbol that has a reference outside the deleted code.
3. **Leave these alone,** and record them as findings for the user:
   - `src/renderer/tactical/tacticalDraftMarchOverlay.ts`, including `tacticalDisplayedH3ForSubUnit` and `tacticalSubUnitsWithMarchDraftOverlay`. Nothing imports the module, but:
     - `src/main/rendererMapEntryConsolidation.test.ts` (about lines 81–101) reads it and asserts `'tactical.positionSourceSelection'`;
     - `doc/ux/map-overlays.md` and `doc/ux/order-lifecycle.md` list it under Code Entry Points.

     Deleting it means changing a test and two documents, so it is the user's call.
   - `isOpenRouterSessionCreditsExhausted`. See Locked Decisions.
   - The tooltip text constants.
   - `precomputedToolInvocationCounts` in `state.ts`. Renderer state fields are out of scope.

### Verification

- `npm run build:main` passes, and `npm run check:renderer-types`, `npm run lint`, and `npm run check:circular` exit 0.
- Run every test in `src/main` that reads a file this phase edited. Find them with `grep -rln --include=*.test.ts -e "<file 1 without extension>" -e "<file 2 without extension>" src/main`, then run each from `dist/`.

---

## Phase 10 — Final Verification

**Edit:** none, unless a check fails.

### Steps

1. Run `npm test > "$TEMP/aw-refactor/tests-final.txt" 2>&1; echo "exit=$?"`.
   - The test script now includes `check:circular`.
   - It must exit 0. It may also fail where Phase 0 already failed, but those failures must be no worse.
2. Run `npm run build:renderer`.
3. Run `npm run ui:smoke > "$TEMP/aw-refactor/smoke-final.txt" 2>&1; echo "exit=$?"`. If it stops in the beat-limit scene with 0 failed checks, run it once more, record both runs, and judge by the scenes that ran.
4. Run `git status --short`. Every changed or new file must be one a phase listed, or one of the Phase 0 entries (`static/renderer.js` and `.spec/todo/`).
5. Run `git diff -U0 | grep "^[-+]" | grep -v "^[-+][-+]" | grep -E "'[^']{12,}'|\"[^\"]{12,}\"" | grep -v "^[-+]\s*\*\|import \|from '"`. Read every changed string literal it prints. None may be text shown to the player, sent to a model, logged, or returned over IPC, unless the change only moved the line.
6. Fill in the Completion Log, the Defect Inventory, and the final message.

### Reliability Checklist

- [ ] `npm run check:circular` exits 0 and is part of `npm test`. The header comment of `ci.yml` mentions it.
- [ ] The only deleted test is `preloadChannelParity.test.ts`, and its checks are in `preloadIpcChannelParity.test.ts`.
- [ ] Every moved symbol is re-exported from its old module, or all of its callers are repointed.
- [ ] No prompt text, log text, IPC reason string, dice order, save format, or UI text changed (step 5).
- [ ] The preload bundle requires only `electron`, and the smoke runs got past the first `window.gameApi` scene.
- [ ] Every contract test repointed in Phase 6 fails when its fragment is broken.
- [ ] Line counts are recorded for every file that changed by more than 20 lines, and no file is over 1000.
- [ ] Every document that names a moved symbol, a moved path, or the preload build is updated.
- [ ] No plan vocabulary appears in `src/`, `static/`, `scripts/`, `doc/`, or `.github/`.

---

## Success Definition

- All nine refactors are in. Any refactor or item left out has its reason recorded.
- `npm test`, `npm run build:renderer`, and `npm run ui:smoke` pass. A known smoke flake must be written up.
- The final message lists:
  - the documents updated;
  - line counts before and after;
  - every ruling that departed from this plan, with its reason;
  - every Defect Inventory finding. Expected entries are the unimported `tacticalDraftMarchOverlay.ts` module and the unread `isOpenRouterSessionCreditsExhausted` flag, plus any channel without a handler or anchor fragment without real code.

---

## Phase 0 Inventory

- Start: branch `feature/v3.1.0-metrics-and-replay` at `03e3aac`. `static/renderer.js` was modified and `.spec/todo/` untracked.
- `build:main`, `check:renderer-types`, `lint`, `naming:check`, and the smoke-check unit test exited 0.
- `check:circular` exited 1 with the three cycles the plan names.
- Line counts: `preload.ts` 997, `main.ts` 695, `gameDb.ts` 869, `renderer.ts` 879, `openRouterUiHelpers.ts` 478, `unitDrawing.ts` 509, `chartsDialog.ts` 604, `matchOptionsDialog.ts` 549.
- Ruling: the baseline `npm test` run was stopped at 66 of 605 test files with no failure, because it blocked every build. The final full run is the check, and a copy of the baseline `dist/` was kept for triage. It was not needed.

## Defect Inventory

- `src/renderer/tactical/tacticalDraftMarchOverlay.ts`: nothing imports it. A contract test reads it, and two UX documents list it. Ask the user whether to delete it.
- `isOpenRouterSessionCreditsExhausted`: it is set but never read, and its comment promises a fast-fail. Ask the user whether the fast-fail is missing or the flag is dead.
- `strategicNamingRecords` in the terrain classification snapshot (`terrainClassificationCache.ts`) is now written but never read, since its only reader was deleted in Phase 9. It was left in place.
- Anchor fragment that matched nothing: `.filter((move) => move.player === 'human')` named in a Phase 6 anchor. The real code now reads `.filter((move) => viewerInvolved(move.player))`, so the assertion was repointed to that line.

## Completion Log

- **Phase 1:** `formatLatLng` moved to `openRouter/latLngText.ts`. The toast block moved to `chrome/mapToasts.ts`, and the unit icon paths to `rendering/unitIconPaths.ts`. `check:circular` exits 0 and is now part of `npm test`; the `ci.yml` header comment was updated. `rendererChatPanelContracts.test.ts` and two UX documents were repointed. The `preloadChannelParity.test.ts` deletion was committed here, because it was already staged.
- **Phase 2:** `applyAdditiveSchemaMigrations` in `gameDb/additiveMigrations.ts` replaces three six-line blocks. The new test drops the migrated tables, reopens the file, and checks they return. It passed before and after the change.
- **Phase 3:** `preloadChannelParity.test.ts` had no checks that `preloadIpcChannelParity.test.ts` lacked, so nothing moved. The merged test also checks for literal channels, which failed on the two literals before the fix, and for a main handler on every channel. All keys matched, so `HANDLED_ELSEWHERE` is empty.
- **Phase 4:** `scripts/build-preload.cjs` bundles the preload, with target `node20`. `preload.ts` went from 997 to 901 lines. The bundle test passes, and the mid-plan `ui:smoke` run passed with 820 checks and 0 failures.
- **Phase 5:** `withTempGameDb` gained `reset` and `afterOpen` options. Six wrappers were migrated with unchanged test counts: 1, 1, 3, 17, and the two tempo tests, which print a single passed line. The two temp-directory leaks are fixed. Five wrappers already delegated to the helper. `withMemoryDb` (it opens through `createFreshGameDatabaseAt`) and the async `withFreshDb` were left alone. The new helper test was written together with the helper rather than before it; its first two cases check the old behavior and pass.
- **Phase 6:** the seven anchor blocks are deleted. Only `rendererProductionAirConsolidation.test.ts` needed changes. Its ferry, mixed-selection, targeting-toast, air-strike playback, announcement, and terrain-suppression assertions now read `mapDoubleClickHandler.ts`, `mapPlanningGesture.ts`, `readyHandler.ts`, `resolutionAnimationStart.ts`, `readyResolutionAnnouncements.ts`, `drawInteraction.ts`, and `terrainRendering.ts`. A mutation check on the terrain assertion made it fail.
- **Phase 7:** `chrome/modalDialogKit.ts` holds the Tab trap and backdrop dismissal. `chartsDialog.ts` is 573 lines and `matchOptionsDialog.ts` is 492. Two UX documents list the kit.
- **Phase 8:** `main.ts` went from 695 to 518 lines. The two new handler files take their window-bound callbacks as dependencies. The two identical orders objects in the commit handler are now built once.
- **Phase 9:** eight symbols were deleted. Their imports and constant import were removed too.
- **Phase 10:** `npm test` exited 0 (608 test files). The final `ui:smoke` result is recorded below.
- **Phase 10 result:** final `ui:smoke` passed with 820 checks, 0 failures, 0 page errors. `git status` shows only `static/renderer.js` (a build artifact, not committed) and this plan. The changed-string-literal diff shows import paths and test fragments only; no user-visible text or prompt text changed.

## Review Follow-Up

- The branch-wide review found no Critical or Important defects. Fixed Minor findings:
  - The terrain-suppression assertion now checks the guard inside `drawTerrainHexes`.
  - The `withTempDb` JSDoc in `tacticalPromptSectionParity.test.ts` now matches the helper.
  - `scripts/run-main-node-tests.cjs` skips compiled tests whose `src` source no longer exists. Three stale ones were in the local `dist`.
- Deferred Minor: running `tsc -p tsconfig.main.json` alone overwrites the bundled preload with the unbundled file, and the app then has no `window.gameApi`. No script does this; use `npm run build:main`.
- Defect Inventory resolutions:
  - `tacticalDraftMarchOverlay.ts` is deleted, along with its contract assertion and the two UX document entries.
  - `strategicNamingRecords` is deleted from the terrain classification snapshot.
  - `isOpenRouterSessionCreditsExhausted` was added in `c4222e5` and had never been read. The user chose to wire the fast-fail:
    - `requestOrdersFlow` now returns the insufficient-credits message before building a prompt.
    - The latch is global, because the 402 response does not say which key it was for. It expires after 60 seconds (`OPENROUTER_CREDITS_EXHAUSTED_FAST_FAIL_MS`), so adding credits works without a restart, and it clears when any API key is stored (`saveKey`, `writeSeatApiKey`, `writeSeatApiKeys`).
    - This is a user-visible behavior change, documented in `doc/ux/ai-activity-log.md`, and the one deliberate exception to the behavior-preserving scope.
- Second review (fresh Opus reviewer over the whole range): no Critical or Important findings. Fixed: the README import-cycle check and `tsc` note, and a bundle test name that overstated what it checks. Open Minor: none.
