# Replay: Recording and Stepping Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** The player can press `p` to pause into replay and step through the match turn by turn. The map, the top bar, and every other part of the screen drawn from the match state show the chosen turn, and the message and update dialogs that ended that turn's resolution are shown again. Animated playback and replay inside battles are the next plan.

**Shape:** Phase 0 records a baseline. Phases 1 through 3 are in the main process and add the recording replay needs. They can ship on their own. Phases 4 through 7 add the screen. Phase 8 runs the final verification, the doc check, and hands the user a manual checklist.

**Tech:** TypeScript (Electron main, sandboxed preload, esbuild-bundled renderer), `better-sqlite3`, plain DOM and CSS, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/ui-smoke/`.

**Order:** This is the third of four plans. Phases 0 through 3 need nothing from the chart plans. Phases 4 through 8 need the charts dialog plan finished first. `2026-11-15-history-0-meta-plan.md` explains the order.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, merge, rebase, or open a pull request, and never run `git checkout`, `git restore`, `git reset`, or `git clean`. Read-only commands such as `git status`, `git diff`, and `git log` are fine. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names (record that file in the Completion Log).
- Find code by the quoted text, not by a line number. Line numbers in this plan are approximate.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. **User-facing strings and prompt text in this plan are not sketches.** Copy them exactly.
- **Tests come first.** Tests under `src/renderer` are not run by `npm test`. So every rule that can be wrong lives in a pure function under `src/shared` (or a main-process module), with a test, written and run before anything calls it. Renderer files only read the DOM and state, call those functions, and write the DOM.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/main/gameDb.ts')
$backup = Join-Path $env:TEMP "aw-replay-stepping\step-$step"
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
- `npm run check:circular` passes when it prints **exactly** the cycles recorded in Phase 0 and no others. Type-only imports are erased and cannot cause a cycle.
- `npm run check:renderer-types` compares renderer type errors with a baseline. A **new** error fails. Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- **Quick loop while you work:** `npm run build:main`, then `node dist/main/<path>.test.js` (or `dist/shared/...`). This is a shortcut only. The full bar decides pass or fail.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file.
- **No test may call a real model.**
- **Renderer phases also run `npm run ui:smoke`** when the phase says so. If `ui:smoke` cannot run on this machine, say so in the Completion Log. The user's manual checklist covers it.
- **Source contracts.** Renderer wiring is checked by tests under `src/main` that read renderer source with `readRendererSource`, `getFunctionSource`, and `assertMatches` from `src/main/testSupport/rendererSourceAssertions.ts`. Read `src/main/rendererChatPanelContracts.test.ts` for the style before writing one.

---

## Conventions

These come from `.cursor/rules/` (which `CLAUDE.md` imports for Claude Code) and `AGENTS.md`. Read every rule file once before Phase 1. Lint enforces some of them.

### Code

- **Orienting comments.** Every new or changed field, property, function, method, and enum member gets a JSDoc block directly above it, private and non-exported ones included. So do new types, interfaces, and constants. The block is a one-line summary, then `Purpose:` (or `Contract:` for interface members), `When to use:`, `Expected outcome:`, and `Exceptions:`. Write what the code does, when to call it, what it returns, and what it throws.
- **No filler.** Do not copy generic text such as "Supports maintainability by documenting why…" or "Use per team conventions…". When you change a declaration whose existing comment is filler (`applyGameStateSnapshot` and `wireInitCore` are two), replace that comment with specific text in the same edit.
- **Logging in `src/main`.** Use `logTrace`, `logDebug`, `logInfo`, and `logError` from `src/main/logger.ts`, and add no `console` calls. Each new or changed exported function logs `logDebug` when it is called. One that only reads state logs `logTrace` instead. A caught exception logs `logError` with the error itself and the relevant ids and counts. Pass values as the extra argument (`logDebug('…', { seatId, count })`), not inside the message string. Never log message text, a prompt body, a payload body, or an API key. New private helpers add no log lines.
- **No logging in `src/shared` or `src/renderer`.** Shared modules are bundled into the renderer, so they must never import `src/main/logger.ts`. The `src/main` code that calls a shared function logs at that boundary. The renderer may use `console.error` in a `catch`, as `commanderPoolClient.ts` does.
- **Names.** camelCase files, directories, and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`: the only role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`, and `Utils`, `Impl`, `Manager`, `Service`, `Processor`, and `Controller` are banned. Use the file names this plan gives.
- **No plan labels.** Labels from this plan (phase and step numbers, plan file names) never appear in code, comments, test names, configuration, lint messages, or `doc/`. Describe what the code does instead.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, and the guards in `src/shared/seatIds.ts`, never string literals. Tests may use literals.
- **Size limits.** Every file, tests and scripts included, should stay at or under 600 lines and must never pass 1000. Count every line. A file already past 600 lines gets only the call lines and imports a phase names. Put new logic in new files. Never shorten a file by deleting comments or packing lines together.
- **Parameters.** A function takes at most 6 named parameters. Past that, use a parameter object: a named interface with an orienting comment on the interface and on each field. The inline object types in this plan's sketches become such interfaces.
- **Mutability.** Use `const` unless a value is reassigned, `readonly` for fields set once, and `readonly` array types for collections that are not changed.
- **Reuse.** Before writing a helper, search `src/shared/` and the nearby modules for one that already does the job, and extend it instead of copying it.
- **Tests.** Test the contract (inputs, outputs, and observable effects) on happy paths and essential failures only. Do not test private helpers, an IPC handler that only delegates, or other boilerplate. A new test file goes beside the code it covers and copies the imports and structure of the nearest sibling test file. A renderer source-contract test asserts that a wiring call or a guard is present. It does not assert the order of internal calls.
- **Database access in the main process.** Modules under `src/main/recorder/` and `src/main/matchStatistics/` use `gameDbOps` and `hasDbHandle` from `src/main/gameDb/dbConnection.ts` and leaf files under `src/main/gameDb/`. They never import the barrel `src/main/gameDb.ts`. IPC handlers may import the barrel.
- **Save format.** `EXPECTED_USER_VERSION` and `GAME_DB_REQUIRED_TABLES` do not change. A new column is added on open, the way `ensureSeatAddedColumns` does it.
- **Side names, flags, and colors.** A side's name on screen is `sideDisplayName` (`src/shared/sideNicknames.ts`). Its flag is `createSideNumberFlag` (`src/renderer/chrome/toastInlineMarks.ts`). Its color is the color the top bar and the unit tokens already use for that side. Find it before drawing anything (read `src/renderer/chrome/topBar.ts` and `src/shared/topBarSides.ts`) and reuse it. Do not invent side colors.
- **Text reaches the DOM through `textContent`.** Never build HTML from match text.

### Documents

- **Keep `doc/` current.** `AGENTS.md` requires `doc/` to change in the same change as the code, and the UX suite is normative. Before changing a surface, read its `doc/ux/` document and the cross-cutting documents `doc/ux-specification.md` routes it through.
- **New UX documents.** A new element document uses the fixed heading set (copy the headings of `doc/ux/selection-panel.md` exactly), gets a row in the routing table of `doc/ux-specification.md`, and lists its Code Entry Points.
- **Prompt documents.** A phase that changes what a model is told updates `doc/ai-commander-prompts/` in that phase.
- **Other facts.** When your change makes a fact wrong in `doc/project-instructions.md` or `doc/coding-prompts-1.md` (a moved file, a renamed script), fix that fact and leave the rest of the wording alone.
- **Markdown structure.** Every markdown file you create or change, this plan's logs included, has one `#` title, heading levels in order with none skipped, headings that name their content, and a paragraph break wherever the topic changes.
- **Final message.** It names every document you updated, or says that you checked and none needed changes.

---

## Non-Goals

- No animated playback. The Play button is drawn and stays disabled until the next plan.
- No replay inside a tactical battle. Pressing `p` during a battle shows one sentence and does nothing else. The next plan adds it. The recording this plan adds does cover battles, so matches recorded now can be replayed inside battles later.
- No "play on from here". Replay is read-only. Nothing in replay changes the match.
- No replay of a match that is not the open one, and no replay from a recording file.
- No replay of destroyed-city overlays at battle-detail zoom. Those are drawn from the present state. Units, control, and every number follow the replay turn.
- No change to `README.md`.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **`p` enters replay, and `p` or Escape leaves it.** The controls appear when replay is entered.
2. **Entering shows the current turn first,** with the message dialog and the update dialog that ended the last resolution. Step forward and Play are disabled there, because there is nothing after it.
3. **The panel sits at the lower left, in the style of the selection panel,** and expands and collapses. Collapsed or expanded, its bottom row holds, in order: step back, step forward, play.
4. **Step back and step forward move one turn** and show that turn's unit positions, its turn-specific data (turn number, production, credits, and everything else the screen takes from the match state), and the message and update dialogs that were shown when that turn began. On the first recorded turn the dialogs are not shown.
5. **Buttons are enabled only when their action is possible.**
6. **Expanded, the panel shows a slider above the buttons,** with a text field to its left that shows the selected turn and accepts a turn number. Only positive whole numbers are accepted. An invalid entry gets a red border.
7. **Replay is scoped to one level.** In the strategic game it steps through strategic turns and never enters a battle.
8. **Leaving replay returns to the current turn with its dialogs showing,** exactly as if the player had stepped forward to it.
9. **In replay the selection panel and the chat panel cannot appear, and no unit can be selected.**
10. **Fog of war in replay:** a player sees what they could see on that turn. An observer, and anyone after the match has ended, sees everything.
11. **Commanders keep planning in the background** while the player is in replay. Ready is disabled until replay is left.
12. **It is acceptable to disable more than strictly necessary in replay.** The two dialogs are essential.
13. **A match that began in an earlier build** can be replayed from the first turn recorded by this build.

### Decisions this plan makes

Tell the user about these in your final message.

- **Replay shows recorded pictures, not reconstructed ones.** At every step boundary the main process stores the exact match snapshot the screen is given, once as the player sees it and once with everything visible. Replay hands those back. Nothing is recomputed, so replay cannot drift from what was shown.
- **Replay blocks map input at the map's own handlers.** The map still pans and zooms. A click, double-click, or right-click on the map does nothing, and the build and battle-entry buttons are hidden. The console's Orders tab is disabled, and the console moves to the Commanders tab, as it does in Observe. It stays there after replay.
- **An update dialog that waited for a battle** is shown at the start of its turn, without the battle lines the live game added when the battle ended.
- **An observer replays with everything visible,** whichever side the observer was viewing as.
- **Last-seen enemy markers are not drawn in replay.** The live markers are put back, unchanged, when replay ends.
- **The slider jumps when it is released,** not while it is dragged, and a jump shows that turn's dialogs like a step does.
- **A turn with a battle is shown as it began.** Such a turn has a second picture after the battle. Stepping shows the first, beside the update dialog that opened the turn. The current turn is shown as it is now.
- **The message dialog in replay shows every message,** as the live dialog does, whatever the fog setting.
- **The recording file is written and read one line at a time,** so a long match with these snapshots can still be exported.
- **Opening the game menu leaves replay.**
- **`p` does nothing** while a turn is resolving, while resolution playback is running, while another dialog is open, and while typing in a text field.

---

## Design

### What is recorded

Two new event types.

| `record_type` | Written when | Step | Visibility | Payload |
| --- | --- | --- | --- | --- |
| `view_snapshot` | Directly after each frame | the frame's step | `engine` for the `all` view, `seats:{seat}` for the `player` view | `{ view: 'all' \| 'player', seatId: string \| null, snapshot }` |
| `resolution_view` | A strategic resolution or a tactical beat commit succeeded, inside the handler's work, so the automatic save and the export include it | the step that was resolved | `engine` | `{ kind: 'strategic' \| 'tactical', result }` |

- `snapshot` is the `GameStateSnapshot` the renderer would be given for that view, **without its `hexes` list** and with `hexWeather` in its place: one `[h3Index, weather]` pair for each hex in that view's `hexes` list that has a `weather` field. Weather changes during a match and depends on what the view has explored. Every other field of a hex is fixed for the match, so the reader takes those from the open match and puts the stored weather back. For the `all` view the three lists `visibleHexes`, `exploredHexes`, and `staleHexes` are also left out, and the reader rebuilds them with the same function `omniscientSnapshot` in `src/main/ipc/matchViewSnapshot.ts` uses.
- The `all` view is always recorded. The `player` view is recorded when a human seat is still in the match.
- `result` is the object the IPC handler returned to the renderer: the Ready result, the melee-intercept resolve result, or the tactical commit result. `strategic_resolution` already stores the mirror fields and the playback moves, and `tactical_resolution` stores the beat's playback. Neither holds the whole result the renderer's update dialog reads, so `resolution_view` stores it whole. The overlap is accepted, so replay reads one record per step.
- **The recording file.** `writeMatchRecordingFile` builds the whole file as one string, and `readRecordingFile` decodes the whole file into one. The 917-turn AI-only match recorded on v3.0.0 already decodes to about 379 MB of JSON, without view snapshots. V8's longest string is about 537 MB. These two events roughly double that, so a long match would fail to export. Phase 2 makes both functions work one line at a time, with no single string for the whole file.

### What replay reads

```ts
// src/shared/replayTypes.ts
export type ReplayView = 'player' | 'all';
export interface ReplayStepRef {
  readonly recordId: number;       // the view_snapshot record to show
  readonly scope: 'strategic' | 'tactical';
  readonly turnNumber: number;
  readonly beatNumber: number;
}
export interface ReplayTimeline {
  readonly view: ReplayView;
  readonly scope: 'strategic' | 'tactical';
  readonly steps: readonly ReplayStepRef[];     // oldest first; the last one is the current step
}
export interface ReplayStepView {
  readonly ref: ReplayStepRef;
  readonly snapshot: GameStateSnapshot;                  // hexes put back
  readonly resolution: unknown | null;                   // the result that led into this step; null on the first step
  readonly visibleHexesBefore: readonly string[] | null; // from the step before; null on the first step
  readonly dispatches: readonly CommanderDispatch[];     // what the message dialog showed when this step began
}
```

### IPC

| Channel | Request | Reply |
| --- | --- | --- |
| `game:readReplayTimeline` | none | `ReplayTimeline` |
| `game:readReplayStep` | `{ recordId: number }` | `ReplayStepView \| null` |

### The panel

```
collapsed:                                          expanded:
┌───────────────────────────────────────────────┐   ┌───────────────────────────────────────────────┐
│ [˄] Replay · Turn 12 of 30      [⏮] [⏭] [▶]  │   │ [ 12 ] ├──────────●───────────────────────┤   │
└───────────────────────────────────────────────┘   │ [˅] Replay · Turn 12 of 30      [⏮] [⏭] [▶]  │
                                                    └───────────────────────────────────────────────┘
```

### Module map

| File | Holds |
| --- | --- |
| `src/shared/replayTypes.ts` | The types above |
| `src/shared/replayNavigation.ts` | Every rule: which view, which buttons are enabled, turn entry parsing, when replay may be entered. Pure, tested |
| `src/main/replay/replayRecording.ts` | Writes `view_snapshot` and `resolution_view` |
| `src/main/replay/replayReading.ts` | Builds the timeline and one step's view |
| `src/main/ipc/replayIpcHandler.ts` | The two channels |
| `src/renderer/replay/replayMode.ts` | Entering, leaving, and showing a step |
| `src/renderer/replay/replayPanel.ts` | The panel |
| `src/renderer/replay/replayDialogs.ts` | The two dialogs for a step |
| `src/renderer/replay/replayState.ts` | Whether replay is on, and where it is. Imports no other replay file, so any module can ask `replayActive()` |
| `src/renderer/gameplay/resolutionPlaybackPlan.ts` | What one resolution result shows: visibility, moves, strike lines, and whether it needs the update dialog. Used by the live turn and by replay |
| `static/replayChrome.css` | The panel's styles |

**Import order inside `src/renderer/replay/`.** `check:circular` covers the renderer, so these files import each other in one direction only. `replayState.ts` imports no replay file. `replayDialogs.ts` imports only `replayState.ts`. `replayMode.ts` imports `replayState.ts` and `replayDialogs.ts`. `replayPanel.ts` may import any of them. Nothing outside this folder imports `replayPanel.ts` except `renderer.ts`, which wires it. Files outside the folder that need to know about replay import `replayState.ts` only, except `initCore.ts`, which imports `toggleReplay` and `leaveReplay` from `replayMode.ts`. The panel learns of every change through `onReplayChange` in `replayState.ts`, so `replayMode.ts` never imports the panel.

---

## Phase 0 — Baseline and Prerequisites

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory.
2. Run the Verification Bar and `npm run ui:smoke`. Record pass or fail for each, and the exact cycle list `check:circular` prints.
3. **Prerequisite.** Confirm each of these. **If any is missing, stop** and tell the user.
   - Main process: `src/main/recorder/matchRecorder.ts` (`recordStepBoundary`, `recordMatchEvent`, `isRecorderEnabled`), `src/main/recorder/matchRecordStore.ts` (`listMatchRecords`), `src/shared/matchRecording.ts` (`MATCH_EVENT_TYPES`), and `src/main/ipc/matchViewSnapshot.ts` (`readMatchSnapshot`, `omniscientSnapshot`).
   - Shared: `src/shared/commanderStatus.ts` (`CommanderDispatch` with `messages`), `src/shared/chatPanelState.ts` (`chatPanelShouldShow`), and `src/shared/observeModeControls.ts` (`activeHumanSeatId`).
   - Renderer: `src/renderer/core/stateSnapshot.ts` (`applyGameStateSnapshot`), `src/renderer/gameplay/readyResolutionAnnouncements.ts` (`announceResolutionTurnUpdate`), `src/renderer/openRouter/commanderMessageTabsUi.ts` (`showCommanderMessageTabs`), `src/renderer/map/mapClickSelectionPolicy.ts` (`clearSelectionLikeRightClick`), and `src/renderer/wiredEntryCallbacks.ts` (`createReadyHandlerDeps`).

   Phases 4 through 8 also need the charts dialog plan: `src/renderer/charts/chartsDialog.ts` exports `chartsDialogIsOpen`, and `src/renderer/chrome/blockingDialogGuards.ts` exports `blockingDialogIsOpen`. If those are missing, run Phases 0 through 3 only, then stop and tell the user. Phases 0 through 3 need nothing from the chart plans.

4. Record the line counts of the files past 600 lines that this plan edits: `src/main/main.ts`, `src/main/preload.ts`, `src/shared/ipc/gameApiTypes.ts`, `src/renderer/renderer.ts`, `src/renderer/map/initCore.ts`, and `src/renderer/map/mainMapInteractions.ts`. When this plan was checked, `preload.ts` was 940 lines and `mainMapInteractions.ts` 955. If adding the lines a phase names would take any file past 1000, stop and tell the user.
5. Find every call of `recordStepBoundary(` outside `src/main/recorder/` and record the list. When this plan was written there were five: one in `src/main/gameIpcHandlers.ts`, one in `src/main/ipc/meleeInterceptResolveIpc.ts`, one in `src/main/ipc/endMatchIpcHandler.ts`, and two in `src/main/ipc/saveLoadIpcHandler.ts`. Phase 2 adds one line after each.
6. Read, and do not edit: `doc/ux/selection-panel.md`, `doc/ux/modes-and-transitions.md`, `doc/ux/input-map.md`, `doc/ux/resolution-playback.md`, `doc/ui-style-guide.md` section 2.10 (Replay Controls), `src/renderer/gameplay/selectionPanelExpand.ts`, `static/selectionChrome.css`, `src/renderer/gameplay/observeChrome.ts`, `src/renderer/core/stateSnapshot.ts` (`applyGameStateSnapshot` and `updateClientStaleEnemyIntel`), and `handleReadyButtonClick` in `src/renderer/gameplay/readyHandler.ts`, from the call to `deps.callReadyWithTimeout` to the end.

**Stop if** the bar fails before any edit.

---

## Phase 1 — Types and Rules

**Add:** `src/shared/replayTypes.ts`, `src/shared/replayNavigation.ts`, `src/shared/replayNavigation.test.ts`
**Edit:** `src/shared/matchRecording.ts`

### Steps

1. `src/shared/matchRecording.ts`: add `'view_snapshot'` and `'resolution_view'` to the end of `MATCH_EVENT_TYPES` (after `losses_attributed` when the statistics plan has run), each with format version 1.
2. `replayTypes.ts`: the types from the Design section.
3. `replayNavigation.ts`, pure:

   ```ts
   export function replayViewFor(input: { humanSeatActive: boolean; gameOver: boolean }): ReplayView
   // 'player' when a human seat is active and the match is not over. 'all' otherwise.

   export function replayMayEnter(input: {
     matchLoaded: boolean; inBattle: boolean; readyInFlight: boolean; playbackRunning: boolean; otherModalOpen: boolean;
     newGameOpenMidMatch: boolean;
   }): { ok: true } | { ok: false; reason: string | null }
   // A reason is a sentence to show the player. null means do nothing silently.

   export interface ReplayPosition { readonly stepCount: number; readonly index: number; readonly busy: boolean }
   export function canStepBack(position: ReplayPosition): boolean      // index > 0 and not busy
   export function canStepForward(position: ReplayPosition): boolean   // index < stepCount - 1 and not busy
   export function canPlay(position: ReplayPosition): boolean          // always false in this build

   export function parseTurnEntry(text: string, steps: readonly ReplayStepRef[]): { index: number } | { error: true }
   // Trims. Accepts only digits (no sign, no decimal point, no spaces inside), value at least 1,
   // and only a number that is the turnNumber of a step. Returns that step's index.

   export function replayLabel(steps: readonly ReplayStepRef[], index: number): string
   // 'Replay · Turn 12 of 30', where 30 is the last step's turn number.
   ```

   `replayMayEnter` reasons, checked in this order: no match loaded gives null; `otherModalOpen` gives null; `newGameOpenMidMatch` gives null; `readyInFlight` or `playbackRunning` gives `Replay is available once this turn finishes resolving.`; `inBattle` gives `Replay inside a battle is not available yet. Leave the battle to replay the match.` Put both sentences in exported constants.

### Tests

`replayNavigation.test.ts`: `replayViewFor` for its four inputs; each `replayMayEnter` case and their order; the three `can…` functions at the first step, a middle step, the last step, and while busy; `parseTurnEntry` accepts `'12'` and `' 12 '`, and rejects `''`, `'0'`, `'-3'`, `'1.5'`, `'1 2'`, `'abc'`, and a number that is not a recorded turn; `replayLabel`.

### Verification

Run the Verification Bar.

---

## Phase 2 — Recording What the Screen Was Given

Every step boundary stores the snapshots, and every resolution stores the result the renderer received. Nothing reads them yet.

**Add:** `src/main/replay/replayRecording.ts`, `src/main/replay/replayRecording.test.ts`, and the results file named in step 6
**Edit:** `src/shared/matchRecording.ts`, `src/main/ipc/matchViewSnapshot.ts`, `src/main/recorder/matchRecordStore.ts`, `src/main/recorder/matchRecordStore.test.ts`, `src/main/recorder/matchRecordingExport.ts`, `src/main/recorder/matchRecordingFile.ts`, and the existing tests of both, `src/main/gameIpcHandlers.ts`, `src/main/ipc/meleeInterceptResolveIpc.ts`, `src/main/ipc/endMatchIpcHandler.ts`, `src/main/ipc/saveLoadIpcHandler.ts`, `src/main/main.ts`, `doc/match-recording.md`

### Steps

1. `matchViewSnapshot.ts`:
   - Export `omniscientSnapshot` (it is private today).
   - Move the four fields it sets from the hex list (`visibleHexes`, `exploredHexes`, `staleHexes`, and the `allHexes` list they are built from) into `export function withEveryHexVisible(snapshot: GameStateSnapshot, hexIds: readonly string[]): GameStateSnapshot`, and have `omniscientSnapshot` call it. The reader in Phase 3 calls the same function.
   - Add `export function playerViewSnapshot(seatId: SeatId): GameStateSnapshot`, which returns exactly what `readMatchSnapshot` returns for that seat. Move the statements after `if (decision.view === 'all') return omniscientSnapshot();` into it, and have `readMatchSnapshot` call it.
   - `readMatchSnapshot` must return the same values as before.
2. `matchRecordStore.ts`. `match_records` has no index besides its key, and a step must not decode every record of a type. Add, each with a test:
   - `lastRecordIdOfType(ops, recordType: MatchEventType): number | null`;
   - `lastFrameHeader(ops): { recordId: number; stepKey: string } | null`, the latest frame's id and step key, read without its payload;
   - `readMatchRecord(ops, recordId: number)`: one record with its payload decoded, or null;
   - `listMatchEventsAtStep(ops, recordType: MatchEventType, stepKey: string)`: the events of one type at one step key, in `record_id` order, payloads decoded.
   Use `MatchEventType` for every record-type parameter, as the statistics plan does.
3. `replayRecording.ts`. Every exported function catches everything, logs `logError` with the error and the record ids and counts, and returns. **Recording must never break a turn.**
   - `export function recordReplayViewsIfNeeded(): void`. It does nothing when the recorder is off or the database is not ready. It reads `lastFrameHeader` and `lastRecordIdOfType(..., 'view_snapshot')`. When there is a frame and no view snapshot newer than it, it writes:
     - one `view_snapshot` for the `all` view, payload `{ view: 'all', seatId: null, snapshot }`, where `snapshot` is `omniscientSnapshot()` stored with a private helper `storedSnapshot(snapshot, dropFogLists)`: it removes `hexes` and adds `hexWeather` (see Design), and with `dropFogLists` true it also removes `visibleHexes`, `exploredHexes`, and `staleHexes`. Visibility `engine`;
     - and, when `activeHumanSeatId(getSeatRoster())` is not null, one for the `player` view, payload `{ view: 'player', seatId, snapshot }`, where `snapshot` is `storedSnapshot(playerViewSnapshot(seatId), false)`, visibility `{ seats: [seatId] }`.
     - Before writing the helper, read the comment on each field of `hexes` in `src/shared/ipc/gameStateTypes.ts`. When this plan was written only `weather` could change during a match. If another field is documented as changing, carry it the same way and record it in the Completion Log.
     Both use the step of the latest frame. Read that step from `lastFrameHeader`, not from the live turn, so the two always agree.
   - `export function recordResolutionView(step: StepKey | null, kind: 'strategic' | 'tactical', result: unknown): void`. It does nothing for a null step. It writes one `resolution_view` with payload `{ kind, result }`, visibility `engine`.
4. Hooks. One line each:
   - Directly after **each** `recordStepBoundary(...)` call found in Phase 0: `recordReplayViewsIfNeeded();`.
   - `gameIpcHandlers.ts`, `handleGameReady`, and `meleeInterceptResolveIpc.ts`: directly after each `recordStrategicResolution(resolvedStep, ...)` call, call `recordResolutionView(resolvedStep, 'strategic', readyResult)` with the result that call is built from. Both calls sit inside the work `withAutoSaveAfter` runs, so the automatic save and the export that follow include the row. Recording in the `main.ts` handler after the wrapped call returns would miss both. Phase 0 records which local in each file holds the result the handler returns. If fields are added to it after that point, they are consult details the update dialog does not read. Record the object as it is at that point.
   - `main.ts`, the `IPC_GAME.commitHumanTacticalDraftOrders` handler: it already captures `beatStep` and records a tactical beat on success, inside the wrapped work. Directly after the `recordTacticalBeat(...)` call, call `recordResolutionView(beatStep, 'tactical', result)`. Fields the handler adds afterwards (such as `tacticalPostBeatConsultDeferred`) are not in the row. Replay does not need them.
   `main.ts` is past 600 lines. Add only that line and its import.
5. **The recording file, one line at a time.**
   - `matchRecordingExport.ts`, `writeMatchRecordingFile`: encode each line with `Buffer.from(JSON.stringify(line) + '\n', 'utf8')` as it is built, and gzip the joined buffers with `gzipSync(Buffer.concat(parts))`. No string holds the whole file. Records are still read with `listMatchRecords`, in `record_id` order. The bytes written are the same as before except that the file now ends with a newline. Check that `parseRecordingLines` ignores an empty last line (the existing fixture tests show it). If it does not, leave the last newline out.
   - `matchRecordingFile.ts`, `readRecordingFile`: split the gunzipped `Buffer` on byte `0x0A` and decode each line on its own, then parse the lines as `parseRecordingLines` does today. Move the per-line parsing into a private function both use, so the fixture path and the file path keep one parser.
   - Tests: the existing export and file tests pass unchanged, and a new test writes a recording whose records contain multi-byte text and reads it back equal.
6. Results file. Write `.spec/todo/v3.1.0/YYYY-MM-DD-replay-stepping-results.md`, beside this plan, where `YYYY-MM-DD` is the local date on which you create it. Give it:
   - the compressed byte length of one `all` snapshot and one `player` snapshot for a fresh global match and for one regional match (add a temporary test case that prints `encodeRecordPayload(payload).length`, run it, then remove it);
   - the same two lengths, and the time `recordReplayViewsIfNeeded` takes, on a late save with battles: ask the user for one, copy it to a temp folder, and open the copy, never the original;
   - an estimate for 150 turns and for 900 turns, and the decoded size of the 900-turn history against the about 537 MB string limit that step 5 removed.
   These numbers are reported, not gated.
7. `doc/match-recording.md`: add both event types to the event table after the ones before them, change "ten event types" to the new count, add `view_snapshot` and `resolution_view` to the visibility paragraph, say what is left out of a stored snapshot and why, say that these two exist so a past turn can be shown again exactly as it was, and say that the recording file is written and read one line at a time. `src/shared/matchRecording.ts`: update the two comments that count the event types.

### Tests

- `matchRecordStore.test.ts`: the two new functions.
- `replayRecording.test.ts`, on a seated temp match with a human seat:
  - After a boundary call and `recordReplayViewsIfNeeded()`, there are two `view_snapshot` rows with the frame's step, one `all` and one `player`. Neither payload has a `hexes` key. The `all` payload has no `visibleHexes` key. With the weather option on, a hex's weather appears in `hexWeather`.
  - A second call writes nothing. After the turn moves on and another boundary call, the next call writes two more.
  - On a match with no human seat, only the `all` view is written.
  - **Secrets:** with a sentinel in every `MACHINE_LOCAL_CONFIG_KEYS` row, neither payload's JSON contains it. Use an obviously fake value with a comment saying it is a test value.
  - `recordResolutionView` writes one row with the given step and kind, and nothing for a null step.
  - After `handleGameReady` succeeds on the seated match, the `resolution_view` row exists before the closing boundary's frame, so a save taken by `withAutoSaveAfter` holds it.
  - With `AGENT_WARS_DISABLE_RECORDER=1`, nothing is written.
- The existing tests for `readMatchSnapshot` pass unchanged.

### Verification

Run the Verification Bar. Run the app, play two turns and one battle beat, save, and confirm with a SQLite tool that `view_snapshot` rows follow each frame and that there is a `resolution_view` row per resolved turn and beat.

### If verification fails

- `check:circular` reports a cycle through `replayRecording`: it imports the barrel through `matchViewSnapshot.ts`, which is correct for a file under `src/main/replay/`. The cycle means something under `src/main/recorder/` or `src/main/gameDb/` imports `replay/`. Remove that import. The hooks belong only in the IPC-level files listed.

---

## Phase 3 — Reading a Timeline and a Step

**Add:** `src/main/replay/replayReading.ts`, `src/main/replay/replayReading.test.ts`, `src/main/ipc/replayIpcHandler.ts`
**Edit:** `src/shared/ipc/channels.ts`, `src/main/preload.ts`, `src/shared/ipc/gameApiTypes.ts`, `src/main/main.ts`, `src/main/recorder/matchRecordStore.ts`, `src/main/recorder/matchRecordStore.test.ts`, `src/main/openRouter/commanderPoolSettle.ts` (to export its model-label function, which then logs a `logTrace` line as rule 02 requires of an exported function that only reads)

### Steps

1. `replayReading.ts`:
   - `export function currentReplayView(): ReplayView`, from `replayViewFor` with the roster and the `game_over` row.
   - `export function readReplayTimeline(): ReplayTimeline`. In this build the scope is always `'strategic'`. It lists `view_snapshot` events **without decoding their payloads**: add `listMatchRecordHeadersOfType(ops, recordType)` to `matchRecordStore.ts`, which returns every column except `payload`, in `record_id` order The view is read from the `visibility` column: `engine` is the `all` view, and `seats:…` is the `player` view. It keeps the events of the current view whose scope is `strategic`. A turn with a battle has a second strategic frame after the battle, so it can have two snapshots. For each `turn_number` it keeps the **first** one, the picture when the turn began (Locked Decision 4), except for the last turn, where it keeps the last one, so entering replay shows the screen as it is now. `steps` is those, in turn order. With the recorder off or no events, `steps` is empty.
   - `export function readReplayStep(recordId: number): ReplayStepView | null`. It reads with `readMatchRecord` and `listMatchEventsAtStep` from Phase 2, never by decoding every record of a type. It returns null when the record is missing, is not a `view_snapshot`, or is not of the current view. Otherwise:
     - `snapshot`: the stored one with `hexes` rebuilt from the open match (`getGameState().hexes`, each entry without its `weather`), then the stored `hexWeather` applied, and `hexWeather` removed. For the `all` view, pass the result through `withEveryHexVisible`.
     - `resolution`: the `result` of the last `resolution_view` of kind `strategic` at step `strategicStep(turn - 1)`. Null when there is none, and null when this is the first step of the timeline.
     - `visibleHexesBefore`: the `visibleHexes` of the step before in the timeline (for the `all` view, every hex). Null on the first step.
     - `dispatches`: one `CommanderDispatch` per AI seat that has a `commander_strategy` or a `message_sent` event with this step's key, in side order. `strategy` is the last strategy text for that seat at this step, or null. `messages` is every message that seat sent at this step, with no filter. The live dialog shows every message, including those addressed to another commander, whatever the fog setting (`CommanderDispatch.messages` in `commanderStatus.ts`, and the comment on `sideMessageVisibleTo`). Replay shows the same. `modelLabel` comes from the same function the pool uses when it pushes a dispatch (`modelLabel` in `commanderPoolSettle.ts`: export it), given the `modelId` of that seat's last `consultation` event at this step, or the seat's current model when there is none. `turnNumber` is the step's turn. A seat with neither a strategy nor a visible message has no dispatch.
2. `replayIpcHandler.ts`: registers `game:readReplayTimeline` and `game:readReplayStep`. The second validates that the payload is an object with a whole-number `recordId`, and returns null otherwise.
3. Add both channels to `IPC_GAME` in `channels.ts`, to the preload's channel list and exposed API, and to `gameApiTypes.ts`, following `readMatchCharts`. Register the handler in `main.ts` beside the others.

### Tests

`replayReading.test.ts`, on a seated temp match with a human seat, fog of war on, driving the recorder by hand (boundary call, `recordReplayViewsIfNeeded`, then move the turn and repeat, with a `resolution_view`, a `commander_strategy`, and two `message_sent` events written between):

- The timeline has one step per turn, in order, in the `player` view. Two snapshots for one turn give one step: the earlier one, and on the last turn the later one.
- A step's snapshot has a `hexes` list as long as the match's, and the turn number of that step. A hex whose weather was stored has that weather, even after the live weather changes. A hex with no stored weather has none.
- The first step has `resolution: null` and `visibleHexesBefore: null`. The second has the recorded result and a list.
- `dispatches` for a step holds the strategy and both messages, the one addressed to the human and the one addressed to another commander. With `game_over` set, the view is `all`, and the dispatches are the same.
- `readReplayStep` returns null for a frame's record id and for an unknown id.
- `listMatchRecordHeadersOfType` returns the rows in order with no payload field.
- The channel parity tests pass.

### Verification

Run the Verification Bar.

---

## Phase 4 — Entering and Leaving Replay

`p` shows a past picture of the match and `p` or Escape brings the present back. There is no panel yet: in this phase replay enters at the current step and can only be left.

**Add:** `src/renderer/replay/replayState.ts`, `src/renderer/replay/replayMode.ts`, `static/replayChrome.css`, `src/main/rendererReplayContracts.test.ts`
**Edit:** `src/renderer/core/stateSnapshot.ts`, `src/renderer/entryCallbacks.ts`, `src/renderer/gameplay/readyHandlerTypes.ts`, `src/renderer/rendering/canvasPreviewPolicy.ts`, `src/renderer/map/initCore.ts`, `src/renderer/map/mainMapInteractions.ts`, `src/renderer/map/mapDoubleClickHandler.ts`, `src/renderer/map/tacticalEntryLayer.ts`, `src/renderer/chrome/consoleFrame.ts`, `src/shared/chatPanelState.ts`, `src/shared/chatPanelState.test.ts`, `src/renderer/chat/chatPanelVisibility.ts`, `src/renderer/gameplay/readyHandler.ts`, `src/renderer/openRouter/openRouterUiHelpers.ts`, `src/renderer/renderer.ts`, `static/index.html`

### Steps

1. **State.** `replayState.ts` holds the replay state in module memory and imports no other replay file:

   ```ts
   export interface ReplayState {
     readonly timeline: ReplayTimeline;
     readonly index: number;
     readonly busy: boolean;
     readonly matchEpoch: number;
   }
   export function replayActive(): boolean
   export function currentReplay(): ReplayState | null
   export function setReplay(next: ReplayState | null): void   // then calls every listener
   export function onReplayChange(listener: () => void): void
   export function registerReplayLeaver(leave: () => Promise<void>): void
   export function requestReplayLeave(): Promise<void>      // runs the registered leaver when replay is active; otherwise resolves at once
   export function abandonReplay(): void                    // setReplay(null) and remove the body attribute, without applying anything
   ```

   `replayMode.ts` registers `leaveReplay` with `registerReplayLeaver` when `bindReplayDeps` runs. Other modules leave replay through `requestReplayLeave()`, so they never import `replayMode.ts`.

   Do not add a field to `S`. `src/renderer/core/state.ts` is past 600 lines.
2. **Deps.** `replayMode.ts` exports `bindReplayDeps(deps: ReplayDeps)`, where `ReplayDeps` holds `readyDeps: () => ReadyHandlerDeps`, `selectionDeps: SelectionClearRefreshDeps`, `hideBuildPopup: () => void`, and `hideStackCallout: () => void`. In `renderer.ts`, directly after the call to `wireMainMapInteractionsFromModule(...)`, call `bindReplayDeps` with `createReadyHandlerDeps` and the same functions that call passes for those names. `renderer.ts` is past 600 lines. Add only that call and its import. Binding at startup keeps `replayMode.ts` from importing the renderer's wiring files, which would make a cycle.
3. **Applying a past snapshot.** In `stateSnapshot.ts`, `applyGameStateSnapshot` gains the option `replay?: 'step' | 'leave'`:
   - As the first statement: when `replayActive()` is true and `options.replay` is not `'step'`, return without doing anything. Background work (a commander finishing, an Observe refresh) asks for the live state to be applied. During replay that must not replace the picture. Leaving replay fetches the live state itself.
   - When `options.replay` is set (either value), skip the `deps.updateClientStaleEnemyIntel(previousState, nextState)` call. That function keeps last-seen enemy markers by comparing each snapshot with the one before. Past snapshots in any order would corrupt it.
   Nothing else in the function changes.
   - **The option has to reach it.** Every caller goes through a wrapper whose options type is closed: `applyGameStateSnapshot` in `src/renderer/entryCallbacks.ts` (past 900 lines), the `applyGameStateSnapshot` member of `ReadyHandlerDeps` in `src/renderer/gameplay/readyHandlerTypes.ts`, and the member type in `stateSnapshot.ts` near the deps interface. Add `replay?: 'step' | 'leave'` to each of those three option types, and have the `entryCallbacks.ts` wrapper pass it through. Change only those lines. `replayMode.ts` applies snapshots through `readyDeps().applyGameStateSnapshot`. `check:renderer-types` fails on an object literal with `replay` until all three are done.
4. **Last-seen markers.** On entering, `replayMode.ts` copies `S.lastObservedEnemyByUnitId`, `S.clientStaleEnemyIntelByUnitId`, and `S.lastRenderedVisibleEnemyByUnitId` (new `Map`s with the same entries), then clears all three, so no live marker is drawn over a past turn. On leaving, it puts the copies back before applying the live state.
5. `replayMode.ts`:
   - `export async function toggleReplay(): Promise<void>`: leaves when active, otherwise tries to enter.
   - **Entering, the check.** Evaluate `replayMayEnter` with `matchLoaded` (`S.gameState` has seats), `inBattle` (`S.tacticalBattleSnapshot != null`), `readyInFlight` (`S.readyRequestInFlight`), `playbackRunning` (`S.resolutionMoveAnimation != null`), `otherModalOpen` (`blockingDialogIsOpen() || chartsDialogIsOpen()`), and `newGameOpenMidMatch` (`newGameOverlayIsOpen()` while `S.gameState.gameOver` is not true). At game over the new-game panel shows the standings and replay is allowed over it, which is why the panel's z-index is above it (Phase 5). On a refusal with a sentence, show it with `showMapToast(sentence, { isError: false, skipReport: true })` and stop.
   - **Entering, the timeline.** Fetch the timeline. With no steps, show `This match has no recorded turns to replay yet.` the same way and stop.
   - **Entering, the screen.** Close the build popup and the stack callout, clear the selection with `clearSelectionLikeRightClick(selectionDeps)`, and save and clear the last-seen markers. Then call `setReplay` with `index` at the last step, set `document.body.dataset.replay = 'on'`, call `refreshConsoleHeader()` from `src/renderer/chrome/consoleFrame.ts`, and show that step (below).
   - **Showing a step** (`export async function showReplayStep(index: number): Promise<void>`): do nothing while busy. Set `busy`, fetch `readReplayStep(steps[index].recordId)`, and drop the reply if replay ended or the match epoch changed while waiting. Apply `view.snapshot` with `{ refreshStandingOrders: false, updateGameStateSidebarUi: true, updateSelectionUi: false, updateGameOverUi: false, updateReadyButton: true, refreshBuildPopup: false, redraw: true, replay: 'step' }`, so the top bar and the map show that turn. Then set the index and clear `busy`. A null reply shows `That turn could not be loaded.` and leaves the index where it was. Phase 6 adds the dialogs here.
   - **Leaving** (`export async function leaveReplay(): Promise<void>`): show the last step (so the screen and, from Phase 6, the dialogs are the current turn's). Then call `setReplay(null)`, delete `document.body.dataset.replay`, put the last-seen markers back, fetch the live state with `fetchMatchSnapshot()`, and apply it with `{ refreshStandingOrders: true, updateGameStateSidebarUi: true, updateSelectionUi: true, updateGameOverUi: false, updateReadyButton: true, refreshBuildPopup: false, redraw: true, replay: 'leave' }`. Then call `refreshConsoleHeader()` and `syncChatPanelVisibility()`.
6. **Order lines.** `src/renderer/rendering/canvasPreviewPolicy.ts`, `shouldDrawCommittedOrderPaths`: return false while `replayActive()`. `drawGameScene` draws `S.humanStandingOrders` against the units of the snapshot it is given, so without this a present-day order line would be drawn from a past turn's unit positions. The same gate covers the march arrows held until movement ends. The hovered path preview needs a selection, and replay clears it.
7. **Map input.** Each of these gets `replayActive()` added to a guard that is already there. Change only that line and add the import:
   - `mainMapInteractions.ts`: the `pointerdown`, `click`, `dblclick`, and `contextmenu` listeners on the map each begin with `if (newGameOverlayIsOpen()) return;` (in `contextmenu`, after `e.preventDefault();`). Make each `if (newGameOverlayIsOpen() || replayActive()) return;`. The file is past 950 lines, so change only those four lines and add one import. A fifth copy of that line, in `scheduleHexDetailsTooltip`, stays as it is: hex tooltips keep working in replay.
   - `mapDoubleClickHandler.ts`, `handleMainMapDoubleClick`: after the `observeModeControls(...).observing` line, add `if (replayActive()) return;`.
   - `initCore.ts`: in the `buildEntryLayer?.addEventListener('click', ...)` listener, add `if (replayActive()) return;` as the first statement.
   - `tacticalEntryLayer.ts`: in the condition that reads `S.gameState.phase !== 'planning' || S.tacticalBattleSnapshot || !observeModeControls(S.gameState.seats ?? []).magnifierEnabled`, add `|| replayActive()`, so the layer is hidden.
   - `consoleFrame.ts`: both `observeModeControls(S.gameState?.seats ?? []).observing` tests (in `refreshConsoleHeader` and in the tab click listener) become `(observeModeControls(S.gameState?.seats ?? []).observing || replayActive())`. The Orders tab lists the live orders. It is disabled in replay.
   Do not change any other `observeModeControls` call.
8. **Panels that must not appear.** `replayChrome.css` (link it in `static/index.html` after `chatChrome.css`): `body[data-replay="on"] #selection-panel, body[data-replay="on"] #chat-panel, body[data-replay="on"] #build-entry-layer { display: none; }`. Hiding the build buttons this way matches the decision above. The click guard in step 7 stays as a second line of defense. Also add `replayActive: boolean` to `chatPanelShouldShow`'s input (false when it is true) and pass it from `chatPanelVisibility.ts`, so the script and the stylesheet agree.
9. **Ready.** `readyHandler.ts`, `handleReadyButtonClick`: add `if (replayActive()) return;` beside the other early returns at the top. `openRouterUiHelpers.ts`, `updateReadyButtonState`: the button is disabled while replay is active.
10. **Keys.** `initCore.ts`, in the `keydown` handler:
   - Inside `if (e.key === 'Escape') {`, directly after the charts-dialog branch the charts plan added: when `replayActive()`, call `e.preventDefault()`, `void leaveReplay()`, and `return`.
   - Directly after the `c` branch: when `key === 'p'`, call `e.preventDefault()`, `void toggleReplay()`, and `return`.
   The charts dialog swallows keys while it is open, so `p` does nothing there. While a text field or the replay slider has focus, `shouldIgnoreGlobalKeydown` drops `p` and Escape before this handler. Phase 5 blurs the slider after a jump, so `p` works again at once.

### Tests

- `chatPanelState.test.ts`: `chatPanelShouldShow` is false when `replayActive` is true.
- `rendererReplayContracts.test.ts` (use `getFunctionSource` and `assertMatches` from `rendererSourceAssertions.ts`):
  - `applyGameStateSnapshot` calls `replayActive()`, and its `updateClientStaleEnemyIntel` call sits inside a branch that tests `options.replay`.
  - The `keydown` handler calls `toggleReplay` and `leaveReplay`.
  - `handleReadyButtonClick` returns when `replayActive()`.
  - Each of the four map listeners in `mainMapInteractions.ts`, `handleMainMapDoubleClick`, the build-entry click listener, the tactical entry layer, `refreshConsoleHeader`, and `shouldDrawCommittedOrderPaths` calls `replayActive()`.
  - The options types in `entryCallbacks.ts`, `readyHandlerTypes.ts`, and `stateSnapshot.ts` each name `replay`.
  - `static/replayChrome.css` hides both panels and `#build-entry-layer` under `body[data-replay="on"]`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app in a match with a few turns played:
- `p` hides the selection and chat panels. Clicking or double-clicking the map does nothing. The map still pans and zooms. Ready is disabled. `p` or Escape brings everything back.
- During a turn's playback, `p` shows the sentence.
- With a commander planning in the background, enter replay and wait for it to finish: the picture does not change, and after leaving, the commander's plan is there.
- With fog of war on, note an enemy's last-seen marker, enter and leave replay, and confirm the marker is still there.
- Queue an order, enter and leave replay, and confirm the order is still queued. While in replay, step to an earlier turn and confirm no order line is drawn.

---

## Phase 5 — The Panel

**Add:** `src/renderer/replay/replayPanel.ts`
**Edit:** `static/index.html`, `static/replayChrome.css`, `src/renderer/renderer.ts`, `src/main/rendererReplayContracts.test.ts`

### Steps

1. Markup, in `static/index.html` directly after the `#chat-panel` section:

   ```html
   <section id="replay-panel" class="replay-panel" aria-label="Replay" data-state="compact" hidden>
     <div id="replay-panel-seek" class="replay-panel-seek">
       <input type="text" id="replay-turn-input" class="replay-turn-input" inputmode="numeric" autocomplete="off" aria-label="Turn" data-control-tooltip="Type a turn number and press Enter to go to that turn." />
       <input type="range" id="replay-slider" class="replay-slider" min="0" max="0" step="1" value="0" aria-label="Turn" data-control-tooltip="Drag to a turn. The map changes when you let go." />
     </div>
     <div id="replay-panel-bar" class="replay-panel-bar">
       <button type="button" id="replay-panel-expand" class="replay-panel-expand" aria-expanded="false" aria-controls="replay-panel-seek" aria-label="Show the turn slider" data-control-tooltip="Show the slider and the turn field."></button>
       <p id="replay-panel-label" class="replay-panel-label"></p>
       <button type="button" id="replay-step-back" class="replay-panel-btn" aria-label="Step back one turn" data-control-tooltip="Go back one turn."></button>
       <button type="button" id="replay-step-forward" class="replay-panel-btn" aria-label="Step forward one turn" data-control-tooltip="Go forward one turn."></button>
       <button type="button" id="replay-play" class="replay-panel-btn" aria-label="Play" data-control-tooltip="Play the turns forward with their animations." disabled></button>
     </div>
   </section>
   ```

   Give the four buttons inline SVG icons in the selection panel's style: a chevron, step-back and step-forward tape-deck glyphs (a triangle against a bar), and a play triangle.
2. `replayChrome.css`: give the panel a `z-index` above the new-game panel's (`static/newGameChrome.css`, 7002 when this plan was written) and below the charts overlay, so it stays usable at game over, when the new-game panel shows the standings. The panel takes the selection panel's place and look: same position (12 px from the map's left and bottom), same opening width and maximum, same face, border, and 50 px bar. `data-state="compact"` hides `.replay-panel-seek`. The slider fills the row to the right of the turn field. The turn field is about five characters wide. `.replay-turn-input[aria-invalid="true"]` has a red border, using the color the app already uses for an error border (find it in the stylesheets and use that variable). A disabled button uses the chrome's disabled colors.
3. `replayPanel.ts`:
   - `export function wireReplayPanel(): void` binds the controls and subscribes `renderReplayPanel` with `onReplayChange`. Call it in `renderer.ts`, directly after `wireGameMenu();` (and after `wireChartsDialog();` when that line is there).
   - `export function renderReplayPanel(): void` shows the panel when `currentReplay()` is not null and hides it otherwise. It sets the label from `replayLabel`, the slider's `max` and `value`, the turn field's value (unless the field has focus), and each button's `disabled` from `canStepBack`, `canStepForward`, and `canPlay`. It clears `aria-invalid` when it sets the field.
   - **Expand:** toggles `data-state`, `aria-expanded`, and the button's `aria-label` between `Show the turn slider` and `Hide the turn slider`, with the same slide the selection panel uses. The state lasts until the app closes.
   - **Step back and step forward:** call `showReplayStep(index - 1)` and `showReplayStep(index + 1)`. A click while `busy` does nothing.
   - **Slider:** on `input`, write the turn number of the step under the thumb into the turn field, and nothing else. On `change`, call `showReplayStep` with that index, then `blur()` the slider, so `p` and Escape reach the map again.
   - **Turn field:** on every `input`, run `parseTurnEntry`. Set `aria-invalid="true"` on an error and remove it otherwise. On Enter or on blur, when the entry is valid and is not the current step, call `showReplayStep`. When it is invalid, leave the field as typed with its red border and do not move. Escape in the field restores the current turn's number and removes the border, and does not leave replay (stop that one key there).
   - Typing in the field must not reach the map. `shouldIgnoreGlobalKeydown` already ignores text inputs. Confirm that `p` typed in the field does not leave replay.
4. `replayMode.ts` does not call the panel. Every change goes through `setReplay`, which calls `renderReplayPanel` through `onReplayChange`.

### Tests

`rendererReplayContracts.test.ts`: `static/index.html` has each id above once; `replayPanel.ts` calls `parseTurnEntry`, `canStepBack`, `canStepForward`, `canPlay`, and `replayLabel`, sets `aria-invalid`, and does not contain `innerHTML`. The import order in the Design section is enforced by `check:circular`, not by a test.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app on a match with at least five turns: entering shows the panel at the lower left with step forward and Play disabled; step back moves one turn and the top bar's turn number, production, and credits change with it; at the first recorded turn step back is disabled; expanded, the slider and the field follow each step; dragging the slider changes the field and releasing it changes the map; `0`, `abc`, `1.5`, and a turn past the end each give a red border and do not move; a valid turn and Enter jumps.

---

## Phase 6 — The Two Dialogs

Each step shows the message dialog and the update dialog that were shown when that turn began.

**Add:** `src/renderer/gameplay/resolutionPlaybackPlan.ts`, `src/renderer/replay/replayDialogs.ts`
**Edit:** `src/renderer/gameplay/readyHandler.ts`, `src/renderer/replay/replayMode.ts`, `src/renderer/openRouter/commanderMessageTabsUi.ts`, `src/main/rendererReplayContracts.test.ts`

### Steps

1. **One function decides what a resolution shows.** In `handleReadyButtonClick`, the statements from `const aiMoves = readyResult.aiMoves ?? [];` through `const needsAnimation = needsCombatOrMovementAnimation || sightCuesForPlayback.length > 0;` compute what the turn shows. Two pieces inside that stretch have effects: the `deps.updateOpenRouterCostLabel();` line and the `if (readyResult.aiConsulted === false) { ... }` block. Every other statement there only computes a value.
   - Create `resolutionPlaybackPlan.ts` with:

     ```ts
     export interface ResolutionPlaybackPlan { /* one readonly field per value the stretch computes, named as the local is now */ }
     export function planResolutionPlayback(input: {
       readonly readyResult: ReadyResult;
       readonly state: GameStateSnapshot;
       readonly humanMoves: readonly ResolutionMove[];
       readonly visibleHexesBeforeTurn: ReadonlySet<string>;
       readonly deps: Pick<ReadyHandlerDeps, 'getVisibleHexSet' | 'buildAirStrikeOutboundPlaybackMoves' | 'buildAirStrikeReturnPlaybackMoves'>;
     }): ResolutionPlaybackPlan
     ```

   - **Move** every statement of the stretch except the two effects into `planResolutionPlayback`, in the same order and with the same text. Change only the names it reads from the handler (`readyResult`, `state`, `humanMoves`, `visibleHexesBeforeTurn`, `deps`) to the input's fields. Add to `deps` any other `ReadyHandlerDeps` member a moved statement uses.
   - In `handleReadyButtonClick`, put `const plan = planResolutionPlayback({ ... });` where the stretch began, then the two effects, unchanged and in their order, then `const { ... } = plan;` with every name the rest of the function reads. The rest of the function is not edited.
   - **This is a move, not a rewrite.** Before moving, confirm that each moved statement only computes a value: it assigns no `S` field, calls nothing named `show…`, `update…`, `notify…`, `refresh…`, `append…`, or `window.gameApi…`, and awaits nothing. If one does not, stop this step, leave `readyHandler.ts` untouched, and take the fallback in step 2.
2. **Fallback only.** When step 1 could not be done, `replayDialogs.ts` builds the two values the dialog needs, `visibility` and the visible missile launches, by calling `deriveCombatVisibilityClassification` and `missileLaunchVisibleToViewer` the way `handleReadyButtonClick` does, and shows the update dialog whenever `announceResolutionTurnUpdate` would produce text. Record this in the Completion Log and in your final message.
3. `replayDialogs.ts`: `export async function showReplayStepDialogs(view: ReplayStepView, replayView: ReplayView, deps: ReadyHandlerDeps): Promise<void>`, where `replayView` is `currentReplay().timeline.view`.
   - It first hides both dialogs (`hideMapToast()` and `hideAiStrategyToast()`), so a step never shows the dialogs of the step before.
   - **Update dialog.** When `view.resolution` is not null, treat it as a `ReadyResult` (`result`) and build `plan = planResolutionPlayback({ readyResult: result, state: view.snapshot, humanMoves: result.humanMoves ?? [], visibleHexesBeforeTurn: new Set(view.visibleHexesBefore ?? []), deps })`. The live turn showed the update when `needsCombatOrMovementAnimation || holdForBattle || hasPendingDestroyedBattleParents()`. For a past turn use `plan.needsCombatOrMovementAnimation || Boolean(result.tacticalAutoStartH3Index)`. The third test reads live memory and does not apply. When it is true, call `announceResolutionTurnUpdate` with:
     - `readySlice: result`, `visibility: plan.visibility`, `missileLaunches: plan.visibleMissileLaunches`, `visibleHexes: plan.visibleHexes`;
     - `killToastFormatter: deps.buildKillToastFormatterBundle(view.snapshot, result.removedUnits, undefined, result.killLabelUnits)`, the same call the live turn makes;
     - `reportTag: currentConsoleReportTag()`, `holdForBattle: false`, and `destroyedParents: []`. An empty list keeps it from taking the live battle parents that `usePendingBattleParents` would take;
     - the past viewer and fog, because each of these falls back to the present when left out: `viewerSeatId` is the human seat for the `player` view and null for the `all` view (`replayView`), `seats: view.snapshot.seats`, and `exploredHexes: new Set(view.snapshot.exploredHexes ?? [])`. Read the exact parameter names and types in `announceResolutionTurnUpdate` before writing the call;
     - and, as its second argument, `{ showMapToast: (message, options) => deps.showMapToast(message, { ...options, skipReport: true }), appendOpenRouterLog: () => {}, formatUnknownBattleAnnouncement: deps.formatUnknownBattleAnnouncement }`. `skipReport` keeps a replayed dialog out of the Reports tab, and the empty log function keeps it out of the activity log. `announceResolutionTurnUpdate` itself is not edited.
   - **Message dialog:** when `view.dispatches` is not empty, call `showCommanderMessageTabs(view.dispatches, [], { fromReplay: true })`.
   - With a null resolution and no dispatches (the first recorded turn), nothing shows.
4. `commanderMessageTabsUi.ts`, `showCommanderMessageTabs`: add a third parameter `options?: { readonly fromReplay?: boolean }`. As the first statement, when `replayActive()` is true and `options?.fromReplay` is not true, return. A commander that finishes in the background must not open its dialog over a past turn. Its messages are still filed in the Reports tab by `messageLines` in `commanderPoolClient.ts`. Confirm that by reading, and change nothing there.
5. `replayMode.ts`: `showReplayStep` calls `showReplayStepDialogs(view, timeline.view, readyDeps())` after applying the snapshot. Leaving replay already shows the last step first (Phase 4), so the current turn's dialogs are showing when the live state comes back. Do not hide them on leaving.

### Tests

- `rendererReplayContracts.test.ts`:
  - `handleReadyButtonClick` calls `planResolutionPlayback` (skip this assertion, with a comment, if step 1 took the fallback).
  - `resolutionPlaybackPlan.ts` contains no `S.` assignment, no `await`, and no `window.gameApi`.
  - `replayDialogs.ts` calls `announceResolutionTurnUpdate` with `skipReport: true`, `destroyedParents: []`, `viewerSeatId`, `seats`, and `exploredHexes`, and calls `showCommanderMessageTabs`.
  - `showCommanderMessageTabs` calls `replayActive()`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. This phase changes the live turn's code path, so check the live path first: play two turns normally, one with combat, and compare the update dialog, the animation, and the Reports tab with screenshots taken before this phase. They must match. Then: enter replay, and the current turn's two dialogs show; step back, and the dialogs change to that turn's; a turn with no movement or combat shows no update dialog, as it did live; at the first recorded turn there are none; the Reports tab and the activity log gain no entries from stepping; leave replay, and the current turn's dialogs are showing.

### If verification fails

- The live update dialog or animation differs from before: revert `readyHandler.ts` and delete `resolutionPlaybackPlan.ts` from the backup, and take the fallback in step 2.

---

## Phase 7 — Background Behavior and Polish

**Add:** nothing.
**Edit:** `src/renderer/replay/replayMode.ts`, `src/renderer/gameplay/observeChrome.ts`, `src/renderer/chrome/gameMenu.ts`, `src/renderer/gameplay/newGame.ts`, `src/renderer/gameplay/selectionPanel.ts` (only if step 6 needs it), `static/replayChrome.css`, `scripts/ui-smoke/ui-smoke-checks.cjs` (or the file its neighbors use), `src/main/rendererReplayContracts.test.ts`

### Steps

1. **Observe matches advance by themselves.** `observeChrome.ts`, `maybeObserveAutoAdvance`: return without advancing while `replayActive()`. This also covers the two listeners that call it: the commander pool subscription and the end of a resolution animation. In `leaveReplay`, after the live state is applied, call `void maybeObserveAutoAdvance()`, so an Observe match carries on.
2. **The game menu.** `gameMenu.ts`, `openGameMenu`: when `replayActive()`, call `void requestReplayLeave()` first. New game, Load, and Save therefore always act on the present.
3. **A new match.** `newGame.ts`, where the new match's state is applied: when `replayActive()`, call `abandonReplay()` first. The last-seen markers are not put back, because the new match starts without them.
4. **The match ends while in replay.** Nothing to do: Ready is disabled in replay, so the match cannot end there. State this in the UX document.
5. **Charts.** The charts dialog opens over replay and shows the whole match. Confirm `c` works in replay and that closing it returns to replay.
6. **Focus and pointer.** Tab reaches the panel's controls in visual order. A click, wheel, or drag on the panel does not reach the map, done the way the selection panel does it.
7. **Smoke check.** After pressing `p` on a match with recorded turns, `#replay-panel` is visible at the lower left and `#selection-panel` and `#chat-panel` are not. After Escape, `#replay-panel` is hidden.

### Tests

`rendererReplayContracts.test.ts`: `maybeObserveAutoAdvance` checks `replayActive`; `openGameMenu` calls `requestReplayLeave`; `newGame.ts` calls `abandonReplay`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run an Observe match: `p` stops the turns advancing; stepping works and shows everything; leaving replay starts the turns advancing again. Open the game menu from replay: replay is left first.

---

## Phase 8 — Docs, Final Verification, and Hand-Off

**Add:** `doc/ux/replay-panel.md`
**Edit:** `doc/ux-specification.md`, `doc/ux/input-map.md`, `doc/ux/modes-and-transitions.md`, `doc/ux/selection-panel.md`, `doc/ux/selection-model.md`, `doc/ux/chat-panel.md`, `doc/ux/console.md`, `doc/ux/console-command-bar.md`, `doc/ux/map-surface.md`, `doc/ux/map-overlays.md`, `doc/ux/tactical-entry-markers.md`, `doc/ux/notifications-and-feedback.md`, `doc/ux/resolution-playback.md`, `doc/ux/control-tooltips.md`, `doc/ui-style-guide.md`, `doc/how-to-play.md`, `doc/match-recording.md`

### Steps

1. Write `doc/ux/replay-panel.md` with the fixed heading set: what replay is, when `p` works and the two sentences shown when it does not, the panel's two states, each control and when it is enabled, the slider and the turn field with the validation rule, what follows the replay turn (everything drawn from the match state) and what does not (the Reports tab, the Commanders tab, destroyed-city overlays at battle-detail zoom), the fog rule, that commanders keep planning and their dialogs are held back, and how leaving works. Under Open Questions, list anything you found that the plan did not decide.
2. Add Replay to `doc/ux/modes-and-transitions.md` as a mode entered from Strategic planning and from Game over, with what is disabled in it. Add `P` and its Escape to `doc/ux/input-map.md`. Add the panel's control tips to `doc/ux/control-tooltips.md` with their Source Anchors. Add the replay rule each of these needs: `selection-panel.md` and `chat-panel.md` (hidden in replay), `selection-model.md` and `map-surface.md` (the selection is cleared on entering; map clicks do nothing in replay; pan and zoom work), `tactical-entry-markers.md` (hidden in replay), `console.md` (the Orders tab is disabled in replay and the console moves to Commanders), and `notifications-and-feedback.md` (both dialogs are shown again for each step and are not filed in the Reports tab again; an update that waited for a battle is shown without its battle lines; last-seen enemy markers are not drawn in replay).
   Also: `console-command-bar.md` adds replay to the cases in which Ready is disabled; `map-overlays.md` says committed order lines are not drawn in replay; `resolution-playback.md` adds `resolutionPlaybackPlan.ts` to Code Entry Points; `input-map.md` says `p` and Escape do nothing while the turn field or the slider has focus, and that the slider gives focus back after a jump.
3. `doc/ui-style-guide.md` section 2.10: replace "Not shipped" with what shipped, and keep what is still a target. Update the implementation-status note near the top that lists the replay strip as unbuilt, and the checklist item that names it.
4. `doc/ux-specification.md`: the routing-table row, the list entry, and an entry under Open Questions by Document when `replay-panel.md` has open questions.
5. `doc/how-to-play.md`: a short section on replay.
6. Run `node scripts/check-doc-links.cjs` and fix what it reports in the documents you changed.
7. Search the whole diff for plan vocabulary and remove it: `git diff | Select-String -Pattern 'Phase \d|history-3|execution plan|locked decision' -CaseSensitive:$false`. Nothing under `src/`, `static/`, `scripts/`, or `doc/` may match.
8. Run the Verification Bar and `npm run ui:smoke` one last time.
9. Fill in the Completion Log.
10. In your final message, name every document you updated, every decision under "Decisions this plan makes", whether Phase 6 step 1 took the fallback, and the sizes from the results file.

### Manual checklist for the user

1. Play six turns with fog of war on. Press `p`. Expect the current turn with both dialogs, and step forward and Play disabled.
2. Step back to the first turn. Expect units where they were, the top bar's numbers for that turn, enemy units hidden as they were then, and no dialogs on the first turn.
3. Use the slider and the turn field, including `0`, `abc`, and a turn that does not exist.
4. Leave with `p` and with Escape. Expect the present, with the current turn's dialogs.
5. Enter replay while a commander is planning. Expect no dialog to appear over the past turn, and the commander's message in the Reports tab afterwards.
6. Finish a match and enter replay from the game-over screen. Expect every unit visible on every turn.
7. Queue an order, note an enemy's last-seen marker, enter replay, step around, and leave. Expect the order and the marker to be as they were.
8. Play a normal turn after all of this. Expect the update dialog and the Reports tab to look exactly as they did before this plan.
9. Load a save from before this build, play two turns, and press `p`. Expect two turns to step through.

---

## Reliability Checklist

- [ ] The phase's files were backed up before the first edit.
- [ ] Every rule that can be wrong is a pure function under `src/shared` with a test.
- [ ] Nothing in replay calls an IPC channel that changes the match.
- [ ] `applyGameStateSnapshot` ignores live applications during replay, replay's own applications pass `replay: 'step'` or `replay: 'leave'`, and the last-seen enemy markers are the same after replay as before it.
- [ ] Queued orders and the human's selection-independent state are the same after replay as before it.
- [ ] Nothing under `src/renderer/replay/` breaks the import order in the Design section.
- [ ] Recording functions under `src/main/replay/` cannot throw into a turn.
- [ ] No recorded snapshot contains a machine-local config value.
- [ ] The live turn's update dialog and Reports entries are unchanged.
- [ ] No text reaches the DOM through `innerHTML`.
- [ ] No timer or poll was added.
- [ ] `EXPECTED_USER_VERSION` and `GAME_DB_REQUIRED_TABLES` are unchanged.
- [ ] Every new function, type, interface, field, and constant has a full orienting comment.
- [ ] `npm run check:renderer-types` shows no new error, `check:circular` shows only the baseline cycles, and no baseline file was edited.
- [ ] No commit, push, stash, merge, rebase, pull request, checkout, restore, reset, or clean was run.
- [ ] Every changed declaration whose comment was generic filler now has a specific comment.
- [ ] Every markdown file created or changed has one title, heading levels in order, and paragraph breaks where the topic changes.
- [ ] No plan vocabulary appears in `src/`, `static/`, `scripts/`, or `doc/`.

## Success Definition

- Every step boundary records the snapshots the screen is given, and every resolution records the result the renderer received.
- `p` enters replay on the current turn with both dialogs, and `p` or Escape leaves it to the present with both dialogs.
- Step back, step forward, the slider, and the turn field each move to a recorded turn, and the map, the top bar, and both dialogs follow.
- In replay nothing can be selected or ordered, the selection and chat panels do not appear, Ready is disabled, and background commanders neither change the picture nor open a dialog.
- A player sees each past turn as they saw it then. An observer, and anyone after the match, sees everything.
- The live turn behaves exactly as before. The Verification Bar and `ui:smoke` pass.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | 60 tracked files modified and about 25 untracked at the start, among them the user's own edits in `doc/match-video.md`, `scripts/match_video/__init__.py`, `scripts/match_video/titles/*`, and `.claude/`. Those were never staged or touched. |
| `npm test` | Not run at the start, by the run's instruction. The full bar ran once, at the end. |
| `npm run build:renderer` | Succeeds. |
| `check:circular` cycle list | The three existing baseline cycles, unchanged after every phase. |
| Prerequisites | Plans 1 and 2 and the naval sea-access plan are committed. The recorder, `match_records`, and the charts dialog exist. |
| Line counts of the long files | `src/main/preload.ts` 965, `src/renderer/renderer.ts` 868, `src/renderer/map/initCore.ts` 713, `src/main/main.ts` 691 at the end. `preload.ts` stays under 1000. |
| Missing symbols | None. |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|
| 1 to 3 | `node dist/main/<file>.test.js` | Native module ABI mismatch for better-sqlite3 | Ran `npm run rebuild:native:node`. |
| 2 | `npm run build:main` | A multi-line replace left a literal newline in a string (TS1002) in `matchRecordingFile.ts` | Fixed by hand. |
| 3 | `node dist/main/replay/replayReading.test.js` | A weather test assumed fog hides weather | Rewrote the test with an injected snapshot. |
| 4 | `node dist/main/rendererReplayContracts.test.js` | Regex escapes and CRLF in source matches | Switched to `includes`, `indexOf`, and `?
`. |
| 6 | `npm run lint` | Imports left unused after the move into `resolutionPlaybackPlan.ts` | Removed them. |
| 7 | `npm run ui:smoke` | Orders tab click not visible after the replay scene: entering replay moves the console to Commanders | Leaving replay now puts the console back on the Orders tab when it was selected on entry. |
| 8 | `npm test` | Two source-contract tests pinned the old guards: `rendererDrawConsolidation` (`return !S.shiftKeyActive;`) and `rendererMapEntryConsolidation` (the magnifier hide condition) | Updated both tests to the guards that now include replay. |
| 8 | `npm run ui:smoke` | The beat-limit scene (`ui-smoke-beat-limit.cjs`) expects the header to start with "Beat 1 · Tactical planning", and the app shows "Beat 1 (29 left) · Tactical planning" | Not caused by replay: that file is unchanged from the last commit. Left for the user. |

## Completion Log

| Phase | Result | Sketch differences | Files changed outside the Add/Edit lists | Docs updated | What you saw in the running app |
|-------|--------|--------------------|-------------------------------------------|--------------|---------------------------------|
| 0 | Done | None | None | None | Not applicable |
| 1 | Done. 6 tests pass. | None | None | None | Not applicable |
| 2 | Done. Recorder, hooks, and recording-file tests pass. | `lastFrameHeader` also returns `step`. `readyResultForReplay` is a new helper that rebuilds the result the renderer received. The recording file is gzipped from `Buffer` parts and read by splitting bytes on newline. | None | `doc/match-recording.md` (fourteen event types, two rows, a visibility paragraph) | Not applicable |
| 3 | Done. Reading, IPC, and parity tests pass. | None | `src/main/openRouter/commanderPoolSettle.ts` exports `modelLabel`. | None | Not applicable |
| 4 | Done. Renderer-types ok, circular unchanged, contract tests pass. | `'replay-panel'` was added to the chrome pointerenter list in `initCore.ts`. | `src/renderer/map/initCore.ts` also has the Escape and `p` branches and the build-entry guard. | None | Not applicable |
| 5 | Done. Contract tests pass. | None | None | None | The panel appears at the bottom-left with the label, three buttons, and the expand control. |
| 6 | Done without the fallback. Each moved statement only computed a value, so `planResolutionPlayback` was moved out of `handleReadyButtonClick`. | The plan's return object names only the values the live turn and replay read. | None | None | Replay screenshot shows the current turn with the panel in place of the selection and chat panels. |
| 7 | Done. Contract tests pass. | Leaving replay also returns the console to the Orders tab when it was selected on entry. The plan left the console on Commanders. | `scripts/ui-smoke/ui-smoke.cjs`, `ui-smoke-scenes.cjs`, `ui-smoke-checks.cjs` | None | `ui:smoke` replay scene: panel shown after `p`, selection and chat panels hidden, panel hidden after Escape. |
| 8 | Docs done. | None | None | `doc/ux/replay-panel.md` (new), `doc/ux-specification.md`, `doc/README.md`, `doc/ux/input-map.md`, `modes-and-transitions.md`, `selection-panel.md`, `selection-model.md`, `chat-panel.md`, `console.md`, `console-command-bar.md`, `map-surface.md`, `map-overlays.md`, `tactical-entry-markers.md`, `notifications-and-feedback.md`, `resolution-playback.md`, `control-tooltips.md`, `doc/ui-style-guide.md`, `doc/how-to-play.md`, `doc/match-recording.md` | See the final verification note below. |

Final verification: `npm test` passes (the full suite, after the two test updates above), `npm run build:renderer` succeeds, and `npm run check:circular` prints only the three baseline cycles. `npm run ui:smoke` reports 798 passed and 0 failed, including the replay scenes, and then stops at the beat-limit scene for the reason in the Defect Inventory. Some runs stopped earlier on an 8 second wait for a unit selection in `ui-smoke-map.cjs`. The late-save size measurement was not made, because it needs a save file from the user.
