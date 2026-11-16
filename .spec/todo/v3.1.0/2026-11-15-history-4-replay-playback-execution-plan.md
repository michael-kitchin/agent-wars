# Replay: Playback and Battles Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** The replay panel's Play button plays the recorded turns forward with their resolution animations, and replay works inside a tactical battle, where it steps and plays through that battle's beats.

**Shape:** Phase 0 records a baseline and an inventory of the code to be shared. Phases 1 through 4 each add one piece that can be verified on its own or with earlier phases. Phase 5 runs the final verification, the doc check, and hands the user a manual checklist.

**Tech:** TypeScript (esbuild-bundled renderer, Electron main), plain DOM and canvas animation, `node:test`, ESLint with the local `orienting-comments` rule, `scripts/ui-smoke/`.

**Order:** This is the fourth of four plans. It needs the replay stepping plan finished first. `2026-11-15-history-0-meta-plan.md` explains the order.

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
$backup = Join-Path $env:TEMP "aw-replay-playback\step-$step"
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

- No new recording. This plan plays what the previous plan records.
- No speed control, no reverse playback, and no playback from a file.
- No moving between the strategic game and a battle inside replay.
- No change to how a live turn or a live beat looks.
- No change to `README.md`.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **Play is step forward, repeated, with the turn-resolution animations** (movement, combat, and the rest). Each step is shown, with its dialogs, for one second (`REPLAY_PLAYBACK_DWELL_MS`, 1000). Then the animations that lead into the next step play, and playback moves to that step. A turn with no animation still shows for that second. The user set the one-second hold on 2026-11-16. It applies to battle beats too.
2. **Play is enabled only when there is a turn after the one showing.**
3. **Replay is scoped to one level.** In a battle, the controls step through that battle's beats and nothing else. In the strategic game, they step through strategic turns and never enter a battle.
4. **Leaving replay in a battle returns to the current beat,** with its dialogs showing.
5. **Each step shows its two dialogs,** in playback as in stepping.

### Decisions this plan makes

Tell the user about these in your final message.

- **Play becomes Pause while it runs.** Pressing it stops playback after the turn that is animating. The step buttons, the slider, and the turn field are disabled while playback runs.
- **`p` or Escape during playback** stops it at once and leaves replay.
- **Playback stops by itself at the current turn.**
- **In a battle the label reads "Beat", and the turn field takes a beat number.**
- **A past turn's order arrows are not drawn during playback.** The live animation keeps the player's march and ferry arrows on screen until the units move. Replay passes empty order lists, because those arrows belong to the present.
- **A battle's own state is put back after replay.** The battle view, the queued sub-unit marches, and the pending order lists are copied on entering and restored on leaving.

---

## Design

### Sharing the animation with the live turn

The stepping plan already moved the part of `handleReadyButtonClick` that decides what a resolution shows into `planResolutionPlayback` (`src/renderer/gameplay/resolutionPlaybackPlan.ts`). What is left inline is the object that becomes `S.resolutionMoveAnimation` and the lines that start the frames. Phase 1 moves those for a strategic turn, and Phase 4 does the same for a tactical beat in `runTacticalReadyCommit`, so replay builds the same animation the live game built.

**Behavior rule (strict) for Phases 1 and 4:** the live turn must look and behave exactly as before. The statements move with their order and their text. Nothing is added, removed, or reordered. If a stretch cannot be moved without changing the order of effects, the phase says what to do instead.

### What a played step does

```
for each step after the one showing, until the last step or a stop:
  fetch the step's view
  apply its snapshot (the units are now where the turn ended)
  show its two dialogs
  build the resolution animation from its recorded result and start it
  wait for the animation to finish
```

This is the order the live turn uses: the new state is applied, the update is announced, then the animation runs.

### What replay must not set off

When a resolution animation ends, `tickResolutionMoveAnimation` in `src/renderer/rendering/gameScene.ts` runs `flushResolutionPlaybackCompleteNotifyCallbacks()`. That runs every queued callback and then every `onResolutionPlaybackFinished` listener.
- The queue is filled only by `scheduleResolutionPlaybackCompleteNotify`, which the live turn calls to tell the main process to start a deferred consult. Replay never calls it. Replay cannot start while a live animation runs (`replayMayEnter`), so the queue is empty whenever replay animates, with one exception: a live turn whose awaited announcement threw after the notify was queued. Play refuses while a notify is queued (`hasQueuedResolutionPlaybackCompleteNotify`, added in Phase 2).
- The one listener today is in `observeChrome.ts`. It frames the camera and calls `maybeObserveAutoAdvance`, which returns at once in replay (the stepping plan added that check). The camera framing is harmless.
Phase 0 confirms both are still true.

### Module map

| File | Holds |
| --- | --- |
| `src/shared/replayNavigation.ts` | `canPlay` and the playback rules. Pure, tested |
| `src/renderer/gameplay/resolutionAnimationStart.ts` | Builds a strategic resolution animation and starts its frames. Used by the live turn and by replay |
| `src/renderer/gameplay/tacticalAnimationStart.ts` | The same for a tactical beat |
| `src/renderer/replay/replayPlayback.ts` | The play loop. Imports `replayMode.ts`. Nothing in `src/renderer/replay/` except `replayPanel.ts` imports it |
| `src/main/replay/replayReading.ts` | The tactical timeline and tactical steps |

---

## Phase 0 — Baseline, Prerequisites, and Reading

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory.
2. Run the Verification Bar and `npm run ui:smoke`. Record pass or fail for each, and the exact cycle list `check:circular` prints.
3. **Prerequisite.** Confirm the stepping plan is done: `src/renderer/replay/replayMode.ts` exports `showReplayStep`, `leaveReplay`, and `toggleReplay`; `src/renderer/replay/replayState.ts` exports `currentReplay` and `setReplay`; `src/renderer/replay/replayDialogs.ts` exports `showReplayStepDialogs`; `src/renderer/gameplay/resolutionPlaybackPlan.ts` exports `planResolutionPlayback`; `src/shared/replayNavigation.ts` exports `canPlay`; `src/main/replay/replayReading.ts` exports `readReplayTimeline` and `readReplayStep`; and `match_records` in a played match holds `view_snapshot` and `resolution_view` rows of both kinds. **If not, stop** and tell the user. If the stepping plan's Completion Log says it took the fallback for `planResolutionPlayback`, also stop: this plan needs that function.
4. **Read and write down.** Before any edit, read these and record in the Completion Log:
   - In `handleReadyButtonClick`, the block `if (needsAnimation) { ... }`: which statements build the animation object (`marchArrowsUntilMovementEnds`, `ferryArrowsUntilMovementEnds`, and the `S.resolutionMoveAnimation = { ... }` literal), which ones only the live turn needs (`syncChatPanelVisibility()`, the epoch check, `playbackFinished`, `holdObserveAutoAdvanceForBattleEntry`), and the five lines that start the frames (from `if (S.resolutionMoveAnimation) {` to `requestAnimationFrame(deps.tickResolutionMoveAnimation);`). Also record that the live turn applies the new state with `redraw: false` before the animation starts.
   - `runTacticalReadyCommit` in `src/renderer/gameplay/readyTacticalCommit.ts`: the stretch from `const hasMoves =` to the `S.resolutionMoveAnimation = { ... }` literal, where that function starts the frames for a beat, and how it builds the beat's update dialog (`buildTacticalCommitReadyResultForToast`).
   - `flushResolutionPlaybackCompleteNotifyCallbacks` and every `onResolutionPlaybackFinished(` call in `src/renderer`. Confirm the two facts under "What replay must not set off". If either is no longer true, stop and tell the user.
   - The path in `handleReadyButtonClick` where `scheduleResolutionPlaybackCompleteNotify` queues the notify before an awaited announcement. A throw in that announcement reaches the `finally` with the notify still queued and no animation running. Phase 2 guards against it.
   - `syncTacticalExitButtonElementVisibility` in `src/renderer/tactical/tacticalExitButtonDom.ts`, and the `materiallyDifferent` check in `src/renderer/core/stateSnapshot.ts` that decides when `applyRestoredTacticalBattleFromMain` runs. Phase 3 changes both.
   - `clearResolutionPlaybackAnimationState` in `src/renderer/tactical/tacticalUiOrchestration.ts`, which cancels a running animation and releases anyone waiting on it.
   - For Phase 3: what `applyGameStateSnapshot` does when a snapshot has a `tacticalBattleSession` (`applyRestoredTacticalBattleFromMain`), and every `S` field `runTacticalReadyCommit` sets after a commit (`S.tacticalBattleSnapshot`, `S.tacticalPendingMarches`, and the pending order lists).
5. Take screenshots, or a screen recording, of one live strategic turn with combat and one live battle beat. Phases 1 and 4 compare against them.

**Stop if** the bar fails before any edit.

---

## Phase 1 — One Function Builds a Strategic Animation

The live turn's animation object and frame start move into two functions. Nothing else changes.

**Add:** `src/renderer/gameplay/resolutionAnimationStart.ts`
**Edit:** `src/renderer/gameplay/readyHandler.ts`, `src/main/rendererReplayContracts.test.ts`

### Steps

1. Create `resolutionAnimationStart.ts` with:

   ```ts
   export function buildStrategicResolutionAnimation(input: {
     readonly plan: ResolutionPlaybackPlan;
     readonly readyResult: ReadyResult;
     readonly visibleHexesBeforeTurn: ReadonlySet<string>;
     readonly marchArrowsUntilMovementEnds: ReturnType<typeof ordersHeldUntilMovementEnds>;
     readonly ferryArrowsUntilMovementEnds: ReturnType<typeof ferriesHeldUntilMovementEnds>;
   }): NonNullable<typeof S.resolutionMoveAnimation>
   export function startResolutionAnimationFrames(tick: FrameRequestCallback): void
   ```

2. Move the object literal assigned to `S.resolutionMoveAnimation` in `handleReadyButtonClick` into `buildStrategicResolutionAnimation`, as its return value, with the same text. Its names now come from `input` and `input.plan`. In the handler, the assignment becomes `S.resolutionMoveAnimation = buildStrategicResolutionAnimation({ ... });`, in the same place.
3. Move the five frame-start lines (from `if (S.resolutionMoveAnimation) {` through `S.resolutionMoveAnimationFrameId = requestAnimationFrame(deps.tickResolutionMoveAnimation);`) into `startResolutionAnimationFrames`, and call it with `deps.tickResolutionMoveAnimation` in their place.
4. Everything else in the block stays where it is, in its order: the `cancelAnimationFrame` line, the two arrow lines, `syncChatPanelVisibility()`, the epoch check, `playbackFinished`, and `holdObserveAutoAdvanceForBattleEntry`.

### Tests

`rendererReplayContracts.test.ts`: `handleReadyButtonClick` calls `buildStrategicResolutionAnimation` and `startResolutionAnimationFrames`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Then play the same kind of turn you recorded in Phase 0, live: movement, combat dice, strike lines, the update dialog, and the moment Ready becomes available again must all match. Play one Observe match for five turns and confirm turns still advance by themselves and battles still open.

### If verification fails

- Any difference in the live turn: restore `readyHandler.ts` from the backup, delete the new file, and stop. Tell the user what differed. Do not go on to Phase 2 with a changed live turn.

---

## Phase 2 — Play

The Play button plays the strategic turns forward.

**Add:** `src/renderer/replay/replayPlayback.ts`
**Edit:** `src/shared/replayNavigation.ts`, `src/shared/replayNavigation.test.ts`, `src/renderer/replay/replayState.ts`, `src/renderer/replay/replayMode.ts`, `src/renderer/replay/replayPanel.ts`, `src/renderer/openRouter/resolutionPlaybackDeferral.ts`, `static/index.html`, `static/replayChrome.css`, `src/main/rendererReplayContracts.test.ts`, `doc/ux/replay-panel.md`, `doc/ux/input-map.md`

### Steps

1. `replayNavigation.ts`:
   - `ReplayPosition` gains `readonly playing: boolean`.
   - `canPlay(position)`: true when playing (so the button can pause), or when `index < stepCount - 1` and not busy.
   - `canStepBack` and `canStepForward` are false while playing. Add `canSeek(position)`, false while playing or busy, for the slider and the turn field.
   - `export function nextPlaybackIndex(position: ReplayPosition, stopRequested: boolean): number | null`: the next index, or null when a stop was requested or the last step is showing.
   - `export const REPLAY_PLAYBACK_DWELL_MS = 1000;`, with an orienting comment: how long Play holds each step, with its dialogs, before the animations into the next step start.
2. `replayState.ts`: `ReplayState` gains `readonly playing: boolean`, `readonly stopRequested: boolean`, and `readonly session: number`. The first two are false when replay is entered. `session` is a counter raised each time replay is entered, so a loop that outlives its replay can tell.
3. `replayMode.ts`:
   - Split `showReplayStep` into two exported functions, and have `showReplayStep` call them: `loadReplayStep(index): Promise<ReplayStepView | null>` (the fetch and the epoch check) and `presentReplayStep(index, view, options: { readonly forPlayback: boolean }): Promise<void>` (apply the snapshot, show the dialogs, set the index). With `forPlayback: true` it applies the snapshot with `redraw: false`, as the live turn does before its animation, so the end positions do not flash before the units move. Stepping passes `forPlayback: false` and keeps `redraw: true`.
   - `showReplayStep` does nothing while `playing`.
   - Export `export function replayReadyDeps(): ReadyHandlerDeps`, which returns `readyDeps()` from the deps `bindReplayDeps` stored. `replayPlayback.ts` needs the frame tick from it.
   - `leaveReplay`, when `playing`, does these in order before anything else: set `playing: false` and `stopRequested: true` with `setReplay`, then call `clearResolutionPlaybackAnimationState()` from `src/renderer/tactical/tacticalUiOrchestration.ts`, which stops the animation and releases the play loop's wait. Only then does it go on as before, showing the last step with its dialogs (Locked Decision 4). Clearing `playing` first is what lets that last step show: `showReplayStep` does nothing while `playing`. `replayMode.ts` does not import `replayPlayback.ts`.
4. `replayPlayback.ts`:
   - `export async function startReplayPlayback(): Promise<void>`. It returns at once when `hasQueuedResolutionPlaybackCompleteNotify()` is true (step 5). Otherwise it reads `session` from `currentReplay()`, sets `playing`, and loops on `nextPlaybackIndex`:
     0. `await holdReplayStep()`, a private function that resolves after `REPLAY_PLAYBACK_DWELL_MS` with one `setTimeout`. The step showing, with its dialogs, stays on screen for that second. This is the only timer in the file. Pause or leaving during the hold takes effect when it ends, at most a second later, through the checks after every `await`;
     1. `loadReplayStep` the next index. A null reply ends playback with `That turn could not be loaded.`;
     2. when the view has a resolution: build `plan` with `planResolutionPlayback` exactly as `replayDialogs.ts` does. When `plan.needsAnimation` is true, set `S.resolutionMoveAnimation = buildStrategicResolutionAnimation({ plan, readyResult, visibleHexesBeforeTurn, marchArrowsUntilMovementEnds: ordersHeldUntilMovementEnds([], view.snapshot.units, humanMoves), ferryArrowsUntilMovementEnds: ferriesHeldUntilMovementEnds([], humanMoves) })` with the resolution clock deferred, exactly as the live turn builds it before it applies the state. Empty order lists, because a past turn's orders are not drawn;
     3. `presentReplayStep(index, view, { forPlayback: true })`, which applies the snapshot and shows its dialogs;
     4. when an animation was built: create `const finished = waitForNextResolutionPlaybackFinished();`, call `startResolutionAnimationFrames(replayReadyDeps().tickResolutionMoveAnimation)`, and `await finished`;
     5. go round again, which starts with the hold. When `nextPlaybackIndex` returns null, playback ends with the last step showing and no further hold.
     After every `await`, stop when `currentReplay()` is null, its `session` is not the one read at the start, the match epoch changed, or `playing` was cleared.
   - The whole loop is inside `try { ... } catch (err) { ... } finally { ... }`. The `catch` logs with `console.error`, as `commanderPoolClient.ts` does, and shows `That turn could not be loaded.` The `finally` sets `playing` and `stopRequested` false only when `currentReplay()` is not null and its `session` is the one read at the start. It never calls `setReplay` when replay has ended.
   - `export function requestReplayPlaybackStop(): void` sets `stopRequested`. The loop ends after the turn in progress.
   - Replay calls neither `scheduleResolutionPlaybackCompleteNotify` nor `notifyResolutionPlaybackComplete`. The Design section says why nothing else needs guarding.
5. `resolutionPlaybackDeferral.ts`: add `export function hasQueuedResolutionPlaybackCompleteNotify(): boolean`, true when the notify queue has a callback. It only reads. A live turn whose announcement threw can leave a callback queued with no animation running. The first replay animation to end would then send that live notification, so Play refuses while it is true.
6. `replayPanel.ts`: the Play button calls `void startReplayPlayback()` when not playing and `requestReplayPlaybackStop()` when playing. While playing, its icon is a pause glyph, its `aria-label` is `Pause`, and its tooltip is `Stop after this turn.` Otherwise they are `Play` and `Play the turns forward with their animations.` The step buttons use `canStepBack` and `canStepForward`, and the slider and the turn field are disabled when `canSeek` is false. Remove the hard-coded `disabled` from the Play button in `static/index.html`.
7. `doc/ux/replay-panel.md`: add Play, the one-second hold on each step (`REPLAY_PLAYBACK_DWELL_MS`), Pause, what is disabled while playing, how playback ends, and that a failed load stops playback with `That turn could not be loaded.` `doc/ux/input-map.md`: Escape during playback stops it and leaves replay.

### Tests

- `replayNavigation.test.ts`: `canPlay` at the last step (false), at an earlier step (true), while playing (true), and while busy and not playing (false); the step and seek functions are false while playing; `nextPlaybackIndex` returns the next index, null at the last step, and null on a stop request; `REPLAY_PLAYBACK_DWELL_MS` is 1000.
- `rendererReplayContracts.test.ts`: `replayPlayback.ts` calls `planResolutionPlayback`, `buildStrategicResolutionAnimation`, `startResolutionAnimationFrames`, `waitForNextResolutionPlaybackFinished`, and `nextPlaybackIndex`, and `hasQueuedResolutionPlaybackCompleteNotify`, has a `finally`, reads `REPLAY_PLAYBACK_DWELL_MS`, contains exactly one `setTimeout` (inside `holdReplayStep`), and contains no `setInterval`, no `scheduleResolutionPlaybackCompleteNotify`, and no `notifyResolutionPlaybackComplete`; `leaveReplay` calls `clearResolutionPlaybackAnimationState` after it clears `playing`; `presentReplayStep` passes `redraw: false` when `forPlayback` is true.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app on a match with eight or more turns: enter replay, go to the first turn, press Play. Each turn shows with its dialogs for about a second, then its units move and fight, turn after turn. A turn with no movement still shows for a second. Playback stops at the current turn with Play disabled. Press Pause mid-way: the turn in progress finishes and playback stops. Press `p` mid-animation: replay is left at once and the present is shown. After all of that, play a live turn and confirm it is normal, and check `debug.log` for no playback-complete notification sent during replay.

---

## Phase 3 — Stepping Inside a Battle

In a battle, `p` enters replay over that battle's beats. This phase is the riskiest in the plan, because the battle view keeps state of its own outside `S.gameState`. It has a stop rule.

**Add:** `src/renderer/gameplay/tacticalAnimationStart.ts`
**Edit:** `src/main/replay/replayReading.ts`, `src/main/replay/replayReading.test.ts`, `src/shared/replayTypes.ts`, `src/shared/replayNavigation.ts`, `src/shared/replayNavigation.test.ts`, `src/renderer/replay/replayMode.ts`, `src/renderer/replay/replayPanel.ts`, `src/renderer/replay/replayDialogs.ts`, `src/renderer/core/stateSnapshot.ts`, `src/renderer/tactical/tacticalExitButtonDom.ts`, `src/renderer/gameplay/readyTacticalCommit.ts`, `src/main/rendererReplayContracts.test.ts`, `doc/ux/replay-panel.md`, `doc/ux/input-map.md`, `doc/ux/tactical-battle-controls.md`, `doc/ux-specification.md`

### Steps

1. `replayReading.ts`:
   - `readReplayTimeline`: when a battle is open (`getActiveTacticalBattleSnapshot()` is not null), the scope is `'tactical'` and the steps are the `view_snapshot` events of the current view whose scope is `tactical` and whose `battle_id` is the open battle's, one per `beat_number` (the last for each), in beat order. Otherwise it behaves as before.
   - `readReplayStep`, for a tactical step: `resolution` is the `result` of the last `resolution_view` of kind `tactical` with this battle's id and the beat before this one. `visibleHexesBefore` comes from the step before in the tactical timeline. `dispatches` are built from the events at this beat's step key, as for a strategic step. The first beat of the timeline has a null resolution.
   - `src/shared/replayTypes.ts`: `ReplayStepView` gains `readonly subUnitsBefore: readonly TacticalSubUnit[] | null`, with a full orienting comment. For a tactical step it is the `subUnits` of the previous tactical step's `tacticalBattleSession`, and null for the first beat and for every strategic step. The live beat builds its kill labels and its march playback from the sub-units before the commit. After a slider jump the live `S` value belongs to another beat, so replay must carry its own. Use the sub-unit type the battle session already uses.
2. `replayNavigation.ts`:
   - `replayMayEnter` no longer refuses in a battle. Remove that case and its sentence constant.
   - `replayLabel` takes the scope: `Replay · Beat 3 of 7` for tactical.
   - `parseTurnEntry` matches a step's `beatNumber` when the timeline's scope is tactical.
3. `replayMode.ts`, entering in a battle:
   - **Save** `S.tacticalBattleSnapshot`, `S.tacticalPendingMarches`, and each pending order list that `runTacticalReadyCommit` clears (`S.pendingRangedAttacks`, `S.pendingAirStrikes`, `S.pendingAirDrops`, `S.pendingMissileLaunches`, `S.pendingFerryOrders`, `S.pendingEmbarkOrders`), as copies. **Restore** them on leaving, before applying the live state with `replay: 'leave'`.
   - A recorded tactical snapshot carries `tacticalBattleSession`. Left alone, `applyGameStateSnapshot` would call `applyRestoredTacticalBattleFromMain` on every step, because its `materiallyDifferent` check is true whenever `tacticalTurnNumber` differs. That full activation re-frames the battle view and changes the map bounds, reconciles the selection, resets hover, can flush the notify queue, and runs `scheduleAnnihilationExit` and `refreshOrderSidebars`. So in `src/renderer/core/stateSnapshot.ts`, when `options.replay === 'step'` and the snapshot has a session, assign `S.tacticalBattleSnapshot = restored` and skip `applyRestoredTacticalBattleFromMain`. Every other call is unchanged. The `replay: 'leave'` call runs the normal path, which brings the live beat back.
   - `src/renderer/tactical/tacticalExitButtonDom.ts`, `syncTacticalExitButtonElementVisibility`: the `disabled` value gains `|| replayActive()`. Exit Battle runs `endTacticalBattle`, which changes the match, so it must not be pressable in replay. Leaving replay calls the sync again, as Ready's does.
   - **Stop rule.** Step through four beats and leave. If anything outside the battle view changed (the camera leaves the battle, the strategic map shows, the pending orders or the selected sub-units differ after leaving, or the Exit Battle button changes state), revert this phase, keep the refusal in battles from the stepping plan, skip Phase 4, and tell the user what happened.
4. Move the live beat's playback test into a shared function now, because the update dialog needs it: create `src/renderer/gameplay/tacticalAnimationStart.ts` with `export function tacticalPlaybackNeeded(playback: TacticalResolutionPlayback | undefined): boolean`, made of the statements in `runTacticalReadyCommit` from `const hasMoves =` through `const needsResolutionPlayback = ...;`, returning that value. They read `playback?.`, so the parameter accepts `undefined`. `runTacticalReadyCommit` calls it in their place. These statements only compute a value, so the strict behavior rule of Phase 1 applies and is easy to meet. If they cannot be moved without changing the order of effects, restore the file, keep the refusal in battles, skip Phase 4, and tell the user.
5. `replayDialogs.ts`: for a tactical step with a resolution, the update dialog is shown only when `tacticalPlaybackNeeded(result.tacticalResolutionPlayback)` is true, as the live beat announces only when `needsResolutionPlayback` is. It is built the way `runTacticalReadyCommit` builds it: `buildTacticalCommitReadyResultForToast(result.tacticalResolutionPlayback)`, then the same announcement call that function makes, with the same `skipReport` wrapper and empty log function the strategic dialog uses. The message dialog is unchanged.
6. `replayPanel.ts`: the turn field's `aria-label` and the slider's are `Beat` in a battle.
7. Docs:
   - `doc/ux/replay-panel.md`: add the battle scope to Availability and to Strategic and Tactical Differences.
   - `doc/ux/input-map.md`: `p` now enters replay in a battle. Remove the refusal sentence the stepping plan added there.
   - `doc/ux/tactical-battle-controls.md`: Exit Battle is disabled during replay.
   - `doc/ux-specification.md`: the routing row for the replay panel also names `resolution-playback.md` and `tactical-battle-controls.md`.

### Tests

- `replayReading.test.ts`: with a battle open and three recorded beats, the timeline is tactical with three steps for that battle only, a step's resolution is the previous beat's result, and the first has none. With no battle, the timeline is strategic and contains no tactical step.
- `replayNavigation.test.ts`: the label and the turn entry for a tactical timeline; `replayMayEnter` allows a battle.
- `replayReading.test.ts` also: the second beat's `subUnitsBefore` equals the first beat's session `subUnits`, and the first beat's is null.
- `rendererReplayContracts.test.ts`: `leaveReplay` restores `S.tacticalPendingMarches`; `syncTacticalExitButtonElementVisibility` reads `replayActive()`; `applyGameStateSnapshot` skips `applyRestoredTacticalBattleFromMain` for `replay: 'step'`; `runTacticalReadyCommit` and `replayDialogs.ts` call `tacticalPlaybackNeeded`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app, fight a battle for four beats, queue a sub-unit march, and press `p`. Exit Battle is disabled while replay is on, and the battle view does not re-frame on each step. Then: the panel reads `Beat`, stepping back shows each beat's sub-unit positions and its dialogs, the slider and the field work with beat numbers, and leaving returns to the current beat with its dialogs and the queued march still there. Leave the battle, press `p`, and step through the strategic turns: the turn in which the battle was fought shows the strategic map, not the battle.

---

## Phase 4 — Play Inside a Battle

**Add:** nothing.
**Edit:** `src/renderer/gameplay/tacticalAnimationStart.ts`, `src/renderer/gameplay/readyTacticalCommit.ts`, `src/renderer/replay/replayPlayback.ts`, `src/shared/replayNavigation.ts`, `src/shared/replayNavigation.test.ts`, `src/main/rendererReplayContracts.test.ts`, `doc/ux/replay-panel.md`

### Steps

1. Using the Phase 0 inventory, move one more piece of `runTacticalReadyCommit` into `tacticalAnimationStart.ts`, and have `runTacticalReadyCommit` call it in its place:
   - `export function buildTacticalResolutionAnimation(input: { playback; subUnitsBefore; deps }): NonNullable<typeof S.resolutionMoveAnimation>`: the statements from `const tacticalMarchPlaybackUnits =` through the object literal assigned to `S.resolutionMoveAnimation`, returning the literal. The live beat passes its own sub-units from before the commit.
   The same strict behavior rule as Phase 1 applies. If the piece cannot be moved without changing the order of effects, take the fallback below.
2. `replayPlayback.ts`: for a tactical step, the loop uses `tacticalPlaybackNeeded(result.tacticalResolutionPlayback)` and `buildTacticalResolutionAnimation` with `subUnitsBefore: view.subUnitsBefore`. It sets the animation before presenting the step, as the live beat does to avoid a one-frame hop, then starts the frames the way the live beat does (Phase 0 inventory) and awaits the end as in Phase 2.
3. `doc/ux/replay-panel.md`: Play in a battle.

**Fallback.** `ReplayPosition` gains `readonly scope: 'strategic' | 'tactical'`, and `canPlay` is false when `scope` is `'tactical'`. Restore `readyTacticalCommit.ts` and `replayPlayback.ts` from this phase's backup, so neither imports a function that is not there. Keep `tacticalPlaybackNeeded` from Phase 3. Record the fallback and tell the user.

### Tests

`rendererReplayContracts.test.ts`: `runTacticalReadyCommit` calls `tacticalPlaybackNeeded` and `buildTacticalResolutionAnimation`; `replayPlayback.ts` calls both. With the fallback, `replayNavigation.test.ts` covers `canPlay` false for a tactical scope instead.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Fight a live battle beat and compare it with the Phase 0 recording: it must match. Then, in a battle with four or more beats, enter replay, go to the first beat, and press Play: the beats animate in order with their dialogs and stop at the current beat.

### If verification fails

- Any difference in the live beat: take the fallback above and continue to Phase 5.

---

## Phase 5 — Docs, Final Verification, and Hand-Off

**Add:** nothing.
**Edit:** `doc/ux/replay-panel.md`, `doc/ux/resolution-playback.md`, `doc/ux/tactical-battle-controls.md`, `doc/ux/modes-and-transitions.md`, `doc/ux/control-tooltips.md`, `doc/ux/input-map.md`, `doc/ux-specification.md`, `doc/ui-style-guide.md`, `doc/how-to-play.md`

### Steps

1. Finish `doc/ux/replay-panel.md`: every control in both scopes, Play and Pause, and the Code Entry Points for the new files.
2. `doc/ux/resolution-playback.md`: resolution playback now also runs in replay, from a recorded result, and sends nothing to the main process there. Name `planResolutionPlayback`, `buildStrategicResolutionAnimation`, and `buildTacticalResolutionAnimation` in its Code Entry Points.
3. `doc/ux/tactical-battle-controls.md` and `doc/ux/modes-and-transitions.md`: replay can be entered from Tactical planning, and what is disabled there.
4. `doc/ux/control-tooltips.md`: the Play and Pause tips. `doc/ui-style-guide.md` section 2.10: update. `doc/how-to-play.md`: add Play and battles to the replay section.
5. Run `node scripts/check-doc-links.cjs` and fix what it reports in the documents you changed.
6. Search the whole diff for plan vocabulary and remove it: `git diff | Select-String -Pattern 'Phase \d|history-4|execution plan|locked decision' -CaseSensitive:$false`. Nothing under `src/`, `static/`, `scripts/`, or `doc/` may match.
7. Run the Verification Bar and `npm run ui:smoke` one last time.
8. Fill in the Completion Log.
9. In your final message, name every document you updated, every decision under "Decisions this plan makes", whether Phase 3 hit its stop rule, and whether Phase 4 took the fallback.

### Manual checklist for the user

1. Play a live strategic turn and a live battle beat. Expect both to look exactly as before this plan.
2. In a match of ten turns, enter replay, go to turn 1, and press Play. Expect every turn to hold for about a second with its dialogs, then animate, and a stop at the current turn.
3. Pause in the middle, step back twice, and press Play again.
4. Press `p` in the middle of an animation. Expect the present at once.
5. In a battle, step and play through its beats. Leave replay, then leave the battle, and step through the strategic turns. Expect no battle view.
6. Run an Observe match, enter replay, play from the start, and leave. Expect the match to carry on by itself.
7. Record a Cup-style video from replay of a finished match: enter replay from the game-over screen, go to turn 1, and press Play.

---

## Reliability Checklist

- [ ] The phase's files were backed up before the first edit.
- [ ] The Phase 0 inventory was written before any edit.
- [ ] Phases 1 and 4 moved statements without changing their order or text, and the live turn and the live beat were compared with the Phase 0 recording.
- [ ] Replay never sends the end-of-animation notification, and never calls an IPC channel that changes the match.
- [ ] The play loop's only timer is the one-second hold, and nothing else in it waits on time.
- [ ] Leaving replay cancels a running animation with `clearResolutionPlaybackAnimationState`.
- [ ] Queued marches and pending orders are the same after replay inside a battle as before it.
- [ ] `replayMode.ts` does not import `replayPlayback.ts`, and `check:circular` shows no new cycle.
- [ ] Every rule that can be wrong is a pure function under `src/shared` with a test.
- [ ] Every surface changed has its `doc/ux/` document updated in the same phase.
- [ ] Every new function, type, interface, field, and constant has a full orienting comment.
- [ ] `npm run check:renderer-types` shows no new error, `check:circular` shows only the baseline cycles, and no baseline file was edited.
- [ ] No commit, push, stash, merge, rebase, pull request, checkout, restore, reset, or clean was run.
- [ ] Every changed declaration whose comment was generic filler now has a specific comment.
- [ ] Every markdown file created or changed has one title, heading levels in order, and paragraph breaks where the topic changes.
- [ ] No plan vocabulary appears in `src/`, `static/`, `scripts/`, or `doc/`.

## Success Definition

- Play animates each recorded strategic turn in order, with its dialogs, holding each for one second, and stops at the current turn.
- Play becomes Pause while it runs, and `p` or Escape stops playback and leaves replay at once.
- In a battle, replay steps and plays that battle's beats and nothing else. In the strategic game it never shows a battle.
- The live turn and the live beat are unchanged.
- The Verification Bar and `ui:smoke` pass.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | |
| `npm test` | |
| `npm run build:renderer` | |
| `check:circular` cycle list | |
| Prerequisites | |
| Missing symbols | |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|

## Completion Log

| Phase | Result | Sketch differences | Files changed outside the Add/Edit lists | Docs updated | What you saw in the running app |
|-------|--------|--------------------|-------------------------------------------|--------------|---------------------------------|
