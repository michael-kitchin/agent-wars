# Seat and Stack Callout Consolidation: Execution Plan

## What This Plan Does

This plan makes seven maintainability refactors in the seat and commander code from the multi-commander work, and splits the largest source file, `src/renderer/map/stackCallout.ts` (999 lines, one line under the hard limit).

| Phase | Refactor | Behavior change |
| --- | --- | --- |
| 1 | Named constants for the seat *kind* (`'human'` / `'ai'`), so a kind is never compared with the human seat *id* | None |
| 2 | Shared roster predicates: active human seat, observing, active AI seat ids | One: an empty roster is never "observing" in the commander popover |
| 3 | One argument type per post-resolution consult runner, the dead `opponentState` field removed, each handler builds its arguments once | None |
| 4 | Seat parameters that silently default to the first AI seat become required | None |
| 5 | One copy helper for callback subscriptions | None |
| 6 | Split `stackCallout.ts` into host, selection-toggle, and sealift modules | None |
| 7 | Stale "Opponent tab" names and plan identifiers removed from comments and two symbols | None |
| 8 | Documentation check and final verification | None |

Each phase can be verified on its own, with every earlier phase already done. Do the phases in order.

## Rules for the Implementing Agent

Read these before Phase 1. They apply to every phase.

### Hard Rules

1. **Never commit or push.** Do not run `git commit`, `git push`, `git stash`, `git reset`, or `git checkout -- <file>`. The user reviews every change.
2. **No plan identifiers in anything versioned.** Do not write "Phase 1", "Phase 6", "step 3", or the title of this plan into code, comments, test names, log messages, configuration, or `doc/`. This plan's labels exist only in this file.
3. **No secrets or personal data** in any file.
4. **Do not run `npm run check:circular`.** The layering in each phase is designed so that no new import cycle appears.
5. **Do not add entries to `scripts/renderer-typecheck-baseline.json`** to hide a new error. Fix the error. Removing entries for errors you fixed is required (Phase 6 does this).
6. **Do not edit** `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, `doc/release-notes/`, or anything under `.spec/completed/`.
7. **Do not change frozen strings:** IPC channel names, LLM tool names, SQL column names and the SQL `CHECK (kind IN ('human', 'ai'))` in `src/main/gameDb/schema.ts`, and DOM ids.
8. **Keep the source-contract comment** `// .filter((move) => move.player === 'human')` in `src/renderer/renderer.ts`.
9. The ESLint rule `no-seat-id-literals` forbids `'opponent'`, `'opponent2'`, `'opponent3'`, `'opponent4'`, and `'neutral'` as values outside `src/shared/seatIds.ts`, test files, and `testSupport` folders. Use `AI_SEAT_IDS`, `aiSeatIdForIndex`, or `NEUTRAL_OWNER_ID` in production code.
10. If a phase cannot be made green after two honest attempts, **stop and report** what failed, with the command and its output. Do not weaken a test to make it pass, and do not revert files you did not change in this plan.

### Shell (Windows PowerShell)

- Run each command on its own. Do not chain with `&&`.
- Do not use `node -e` with complex quoting.
- Do not write files with `Set-Content -Encoding utf8`. Use the editor tools.
- Run every command from the repository root, `f:\Projects\Personal\agent-wars-public`. The source-contract tests read `src/` relative to the current directory.

### Commands

| Purpose | Command | Time |
| --- | --- | --- |
| Main-process typecheck, no output files | `npx tsc -p tsconfig.main.json --pretty false --noEmit` | about 1 minute |
| Compile main and shared code, including tests, into `dist/` | `npx tsc -p tsconfig.main.json --pretty false` | about 1 minute |
| Run one compiled test file | `node dist/main/<path>.test.js` or `node dist/shared/<path>.test.js` | seconds |
| Renderer typecheck against the baseline | `npm run check:renderer-types` | about 1 minute |
| Bundle the renderer | `npm run build:renderer` | seconds |
| Lint | `npm run lint` | a few minutes |
| Full suite | `npm test` | 12 to 15 minutes |
| UI smoke | `npm run ui:smoke -- --label refactor` | several minutes |

A targeted test file path mirrors its source path: `src/shared/seatRoster.test.ts` runs as `node dist/shared/seatRoster.test.js`.

If a database test fails with `ERR_DLOPEN_FAILED` or a `NODE_MODULE_VERSION` mismatch, the native SQLite module was last built for Electron (`ui:smoke` does that). Run `npm run rebuild:native:node`, then run the test again. `npm test` does this rebuild itself.

`npm test` stops at the first failing test file. When it fails, fix that file's failure and run `npm test` again.

### Code Standards

- **Orienting comments.** Every new or changed function, field, interface member, and module-level variable gets an orienting comment in the house format:

  ```ts
  /**
   * One sentence that says what this is.
   *
   * Purpose: Why it exists.
   * When to use: Who calls it, and when.
   * Expected outcome: What it returns or changes.
   * Exceptions: What it throws, or "None."
   */
  ```

  Interface members use `Contract:` in place of `Purpose:`. `CommanderReadyGatherArgs` in `src/main/openRouter/commanderReadyGather.ts` is a good model for interface members.

- **Placeholder comments.** Many files contain generated placeholder comments. Recognize them by any of these phrases:

  - `Supports maintainability by documenting why`
  - `Use per team conventions`
  - `Describes stable behavior for callers`
  - `Callers and maintainers can rely on the described behavior`
  - `function shape (`
  - `as a named contract surface`
  - `Documents the module-scope binding`
  - `Specifies the contract for the`

  When a phase changes **executable code** in a file, rewrite every placeholder comment in that file into a real orienting comment. Read the function body first, and describe what it actually does. Change only the comment. Leave the code under that comment as it is, apart from the edits the phase names.

  A phase that only rewords comments does not trigger this rewrite. Phase 7 is that phase, including `src/main/gameDb.ts` (26 placeholder blocks) and `src/main/callbackEvaluation.ts` (40). Rewriting those blocks is a separate sweep, listed under "Not in This Plan".

  Each phase lists the files and their placeholder counts. The phase is not done until this search returns no matches in those files:

  ```text
  Supports maintainability by documenting why|Use per team conventions|Describes stable behavior for callers|Callers and maintainers can rely on the described behavior|function shape \(|as a named contract surface|Documents the module-scope binding|Specifies the contract for the
  ```

- **Logging.** In `src/main/`, use `logDebug`, `logError`, and `logTrace` from `src/main/logger.ts`. A new main-process function that only reads state logs at `logTrace`. A function that changes state logs at `logDebug`. A caught exception logs at `logError`. Modules under `src/shared/` must not import the main logger and do not log. Renderer code under `src/renderer/` uses `console` and does not log routine calls.
- **Immutability.** Use `const` unless the variable is reassigned. Mark interface fields `readonly` when callers never assign them.
- **Imports.** After each edit, remove imports that became unused. `npm run lint` and `tsc` report them.
- **Size.** Keep files under 600 lines where you can, and never above 1000. Keep functions to six parameters or fewer.
- **Line numbers** in this plan come from commit `bae03b1`. They drift as you edit. Always find code by the quoted text, not by the line number alone.

### Before Phase 1

1. Run `git status --porcelain` and save the list. These are files you must not touch or revert.
2. Run `npm test` once and write down the result. If it already fails, stop and report: the plan assumes a green start.

## Phase 1: Seat-Kind Constants

### Why

A roster seat has a *kind*, `'human'` or `'ai'`. Many call sites compare `seat.kind === HUMAN_SEAT_ID`. That works only because the human seat's *id* happens to be the string `'human'` too. The two ideas are different, and the code should say which one it means. Other sites spell `'ai'` as a bare literal.

### Steps

1. In `src/shared/seatRoster.ts`, replace the `SeatKind` declaration (about line 21) with two constants and a type built from them. Give each constant an orienting comment.

   ```ts
   export const HUMAN_SEAT_KIND = 'human' as const;

   export const AI_SEAT_KIND = 'ai' as const;

   export type SeatKind = typeof HUMAN_SEAT_KIND | typeof AI_SEAT_KIND;
   ```

   - The constant comments say: the kind stored on a roster row; the value is frozen because the SQL `CHECK` in `schema.ts` stores it; compare `seat.kind` with this constant, and never with `HUMAN_SEAT_ID`.
   - Update the `SeatKind` comment's `Expected outcome` to "`HUMAN_SEAT_KIND` or `AI_SEAT_KIND`."
   - Update the comments in `SeatRecord` (about lines 145 to 181) that say ``kind` is `HUMAN_SEAT_ID`` or `` `'ai'` `` so they name `HUMAN_SEAT_KIND` and `AI_SEAT_KIND`. Leave line 145 alone: it talks about seat ids.
   - Update the `activeAiSeats` comment (about line 305) and the `findHumanSeat` comment (about line 319) the same way.
2. Replace every kind comparison and kind value in production code. `HUMAN_SEAT_ID` becomes `HUMAN_SEAT_KIND` and `'ai'` becomes `AI_SEAT_KIND` **only where the expression is a kind**. Import the constants from the `seatRoster` module with the correct relative path.

   | File | Line (approx.) | Current text |
   | --- | --- | --- |
   | `src/shared/seatRoster.ts` | 311 | `seat.kind === 'ai'` |
   | `src/shared/seatRoster.ts` | 323 | `seat.kind === HUMAN_SEAT_ID` |
   | `src/shared/observeModeControls.ts` | 182, 206, 228 | `seat.kind === HUMAN_SEAT_ID` |
   | `src/shared/standings.ts` | 390 | `seat.kind === HUMAN_SEAT_ID` |
   | `src/shared/sideLabels.ts` | 59 | `seat.kind === HUMAN_SEAT_ID` |
   | `src/shared/newGameSides.ts` | 174 | `kind: index === 0 ? HUMAN_SEAT_ID : 'ai'` |
   | `src/shared/newGameSides.ts` | 198, 199, 220 | `kind: 'ai'`, `kind: HUMAN_SEAT_ID`, `kind: 'ai'` |
   | `src/shared/newGameSides.ts` | 289, 303, 318, 319, 408 | `.kind !== 'ai'`, `.kind === 'ai'`, `.kind === HUMAN_SEAT_ID` |
   | `src/main/gameDb/resetGame.ts` | 285, 286 | `{ kind: HUMAN_SEAT_ID, ... }`, `{ kind: 'ai', ... }` |
   | `src/main/gameDb/resetGame.ts` | 360 | `seat.kind === HUMAN_SEAT_ID ? null : ...` |
   | `src/main/gameDb/seatRosterStore.ts` | 108 | `row.kind !== HUMAN_SEAT_ID && row.kind !== 'ai'` |
   | `src/main/gameDb/seatRosterStore.ts` | 123 | `kind === HUMAN_SEAT_ID` (a local variable named `kind`) |
   | `src/main/gameDb/seatRosterStore.ts` | 291 | `seat.kind !== 'ai'` |
   | `src/main/gameDb/seatResolution.ts` | 73, 163, 164, 173 | `seat.kind === HUMAN_SEAT_ID`, `seat.kind === 'ai'` |
   | `src/main/gameDb/seatResolution.ts` | 169 | `seatId: seat.kind === HUMAN_SEAT_ID ? HUMAN_SEAT_ID : aiSeatIdForIndex(aiNumber)` |
   | `src/main/testSupport/withRegionVsRegionTempGameDb.ts` | 29, 30 | `{ kind: HUMAN_SEAT_ID, ... }`, `{ kind: 'ai', ... }` |
   | `src/main/ipc/readyIpcResolutionMapping.ts` | 391 | `seat.kind === 'ai'` |
   | `src/main/gameActions/captureTurnLossNote.ts` | 193 | `seat.kind === 'ai'` |
   | `src/main/openRouter/commanderPool.ts` | 234 | `seat.kind !== 'ai'` |
   | `src/main/openRouter/commanderReadyGather.ts` | 116 | `seat.kind === 'ai'` |
   | `src/renderer/openRouter/commanderCardsUi.ts` | 72, 230, 270 | `seat.kind === 'ai'`, `row.kind === HUMAN_SEAT_ID` |
   | `src/renderer/openRouter/openRouterUiHelpers.ts` | 102 | `seat.kind === HUMAN_SEAT_ID` |
   | `src/renderer/openRouter/commanderPoolClient.ts` | 251 | `row.kind === HUMAN_SEAT_ID` |
   | `src/renderer/gameplay/meleeInterceptModal.ts` | 274 | `seat.kind === HUMAN_SEAT_ID` |
   | `src/renderer/gameplay/knockoutNotices.ts` | 102 | `victim?.kind === HUMAN_SEAT_ID` |
   | `src/renderer/gameplay/newGameSidesUi.ts` | 321, 382, 400 | `row.kind !== 'ai'`, `row.kind === 'ai'` |
   | `src/renderer/chrome/topBar.ts` | 69 | `seat.kind === HUMAN_SEAT_ID` |
   | `src/renderer/chrome/consoleReports.ts` | 127 | `row.kind === HUMAN_SEAT_ID` |
   | `src/renderer/chrome/consoleFrame.ts` | 111, 113 | `seat.kind === HUMAN_SEAT_ID`, `seat.kind === 'ai'` |

   In `seatResolution.ts` line 169, only the **first** `HUMAN_SEAT_ID` is a kind. The result must read `seatId: seat.kind === HUMAN_SEAT_KIND ? HUMAN_SEAT_ID : aiSeatIdForIndex(aiNumber)`.

   Several of these lines are replaced again in Phase 2. Change them here anyway, so this phase stands on its own.
3. Replace the three inline kind types with `SeatKind`, and update each field's `Contract:` to "`HUMAN_SEAT_KIND` or `AI_SEAT_KIND`."
   - `src/shared/observeModeControls.ts` about line 38, comment at line 33.
   - `src/shared/topBarSides.ts` about line 51, comment at line 46 (`HUMAN_SEAT_ID` or `'ai'`).
   - `src/shared/newGameSides.ts` about line 50, comment at line 45.

   Check that `seatRoster.ts` does not import from any of these three files before you add the import, so no cycle appears. Today it imports only from `./seatIds`.
4. Remove `HUMAN_SEAT_ID` imports that became unused. In `src/shared/seatRoster.ts` the value import goes away and `import { type SeatId } from './seatIds';` stays, because `seatId`, `outBy`, and `enemySeatIdsOf` still use `SeatId`. In `src/shared/newGameSides.ts` the `HUMAN_SEAT_ID` import goes away; `MAX_SEATS` and `MIN_SEATS` stay. In `src/main/gameDb/seatResolution.ts` the import stays: line 169's result is still the seat id `HUMAN_SEAT_ID`.

   Do not edit tests in this phase. `kind: 'ai'` and `seat.kind === 'ai'` in test files still typecheck, because the constants hold the same strings.
5. Rewrite the placeholder comments in `src/main/gameDb/resetGame.ts` (10 blocks). The other files in this phase have none.

### Done When

- This search over `src/`, excluding `*.test.ts`, returns no matches:

  ```text
  kind\s*[!=]==\s*(HUMAN_SEAT_ID|'ai'|'human')|kind:\s*(HUMAN_SEAT_ID|'ai'|'human')|index === 0 \? HUMAN_SEAT_ID|'human' \| 'ai'
  ```

- `npx tsc -p tsconfig.main.json --pretty false --noEmit` exits 0.
- `npm run check:renderer-types` passes.
- After `npx tsc -p tsconfig.main.json --pretty false`, these pass: `dist/shared/seatRoster.test.js`, `dist/shared/observeModeControls.test.js`, `dist/shared/newGameSides.test.js`, `dist/shared/standings.test.js`, `dist/shared/sideLabels.test.js`, `dist/shared/topBarSides.test.js`, `dist/main/gameDb/resetGameSeats.test.js`, `dist/main/gameDb/newMatchSeats.test.js`, `dist/main/openRouter/commanderPool.test.js`.
- `npm test` passes.

### Documentation

None expected. Search `doc/` for `kind === HUMAN_SEAT_ID` and `SeatKind` to confirm.

## Phase 2: Shared Roster Predicates

### Why

Seven places compute "no human seat is still playing" or "the active human seat's id", each by hand. Four places compute "active AI seat ids in seat order", one of them as a private helper. The copies differ in small ways: `commanderCardsUi.ts` treats an empty roster as observing, and every other copy does not.

### The One Intended Behavior Change

`openSeatCommander` in `src/renderer/openRouter/commanderCardsUi.ts` labels its apply-all button "Use for every side" while observing and "Use for every opponent" otherwise. Today an empty roster counts as observing there. After this phase, an empty roster is never observing, which matches `observeModeControls` and the other copies. In practice the popover opens only from a seat card, so a roster exists whenever this runs.

### Steps

1. In `src/shared/observeModeControls.ts`, add two exported functions after the `ObserveSeat` interface, each with an orienting comment:

   ```ts
   export function activeHumanSeatId(seats: readonly ObserveSeat[]): string | null {
     return seats.find((seat) => seat.kind === HUMAN_SEAT_KIND && seat.outTurn == null)?.seatId ?? null;
   }

   export function isObservingRoster(seats: readonly ObserveSeat[]): boolean {
     return seats.length > 0 && activeHumanSeatId(seats) === null;
   }
   ```

   - `activeHumanSeatId`: the seat that can still give orders. Returns null when the roster has no human seat or the human seat is knocked out. Use `== null`, the same test this file already uses. Do not "correct" it to `=== null`, and do not change `isSeatActive` in `seatRoster.ts`, which uses `=== null`. On `number | null` the two tests agree. `== null` also treats a missing `outTurn` as active, which is the contract of this file.
   - `isObservingRoster`: true when a roster is loaded and no human seat is active. An empty roster is not observing.

   Then use them inside the same file:
   - In `observeModeControls`, `const observing = seats.length > 0 && !seats.some(...)` becomes `const observing = isObservingRoster(seats);`.
   - In `readoutViewerSeatId`, the `return seats.find(...)?.seatId ?? null;` line becomes `return activeHumanSeatId(seats);`.
   - In `resolveMatchView`, `const humanActive = args.seats.some(...)` becomes `const humanActive = activeHumanSeatId(args.seats) !== null;`.
2. In `src/shared/seatRoster.ts`, add an exported function after `activeAiSeats`, with an orienting comment:

   ```ts
   export function activeAiSeatIds(
     seats: readonly Pick<SeatRecord, 'seatId' | 'outTurn' | 'seatOrder' | 'kind'>[]
   ): AiSeatId[] {
     return activeAiSeats(seats)
       .map((seat) => seat.seatId)
       .filter((seatId): seatId is AiSeatId => isAiSeatId(seatId));
   }
   ```

   Add `isAiSeatId` and `type AiSeatId` to the existing import from `./seatIds`. The result is in seat order, because `activeAiSeats` sorts by `seatOrder`. `getSeatRoster()` already returns rows in seat order, so the main-process callers below keep their order.
3. Replace the renderer copies. Import from `../../shared/observeModeControls` or `../../shared/seatRoster`.

   | File | Before | After |
   | --- | --- | --- |
   | `src/renderer/openRouter/commanderCardsUi.ts`, `openSeatCommander` | `const observing = !(S.gameState?.seats ?? []).some(...)` | `const observing = isObservingRoster(S.gameState?.seats ?? []);` |
   | `src/renderer/openRouter/commanderCardsUi.ts`, `saveEveryCommander` | the `filter(...)` line and the `for` loop with its `isAiSeatId` check | `for (const seatId of activeAiSeatIds(S.gameState?.seats ?? [])) await saveCommander(seatId, commander);` |
   | `src/renderer/openRouter/openRouterUiHelpers.ts`, `renderOpponentStatus` | `const observing = seats.length > 0 && !seats.some(...)` | `const observing = isObservingRoster(seats);` |
   | `src/renderer/openRouter/commanderPoolClient.ts`, `matchIsObserving` | the two-line body | `return isObservingRoster(S.gameState?.seats ?? []);` |
   | `src/renderer/chrome/consoleReports.ts` | `const observing = seats.length > 0 && !seats.some(...)` | `const observing = isObservingRoster(seats);` |
   | `src/renderer/chrome/consoleFrame.ts`, `commandersSubtitle` | `const humanPlaying = ...` and `if (!humanPlaying && seats.length > 0)` | `if (isObservingRoster(seats))` |
   | `src/renderer/gameplay/meleeInterceptModal.ts`, `hexDetailLine` | `const viewer = seats.find(...)?.seatId ?? null;` | `const viewer = activeHumanSeatId(seats);` |
   | `src/renderer/chrome/topBar.ts`, `viewerSeatId` | `return seats.find(...)?.seatId ?? null;` | `return activeHumanSeatId(seats);` (keep the empty-roster `return undefined` line above it) |

   The helper already means "no human is playing". Do not keep the old `!`. `const observing = !isObservingRoster(...)` and `if (!isObservingRoster(seats))` are wrong and swap the labels. Import `isObservingRoster` and `activeHumanSeatId` from `../../shared/observeModeControls`, and `activeAiSeatIds` from `../../shared/seatRoster`.

   Update `matchIsObserving`'s comment if it no longer matches. Keep `matchIsObserving` itself, because it reads renderer state. The opponents count in `commandersSubtitle` stays a count of every AI seat, including knocked-out seats, with its `|| 1` fallback. Do not replace that count with `activeAiSeatIds`.
4. Replace the main-process copies. `src/shared/` must not import the main logger, so `activeAiSeatIds` does not log. The trace line on the private helper disappears with it. Do not add a logger call to replace it.
   - `src/main/ipc/readyIpcResolutionMapping.ts`: delete the private `activeAiSeatIds()` function and its comment (about lines 380 to 395). At its two call sites (about lines 256 and 333), call the shared helper with the roster: `activeAiSeatIds(getSeatRoster())`. Import `activeAiSeatIds` from `../../shared/seatRoster`. Delete the private function **before** adding the import, or the names collide.
   - `src/main/gameActions/captureTurnLossNote.ts` (about lines 193 to 211): replace the filter and the loop with `for (const seatId of activeAiSeatIds(getSeatRoster()))`. Import `activeAiSeatIds` from `../../shared/seatRoster`. Inside the loop, replace all four `seat.seatId` uses (`perspectivePlayerId`, `summary.byOwner`, the owner filter, and the first argument of `upsertTurnLossNote`) with `seatId`. Delete the `if (!isAiSeatId(seat.seatId)) continue;` line. Remove the `isAiSeatId` import if nothing else in the file uses it.
   - `src/main/openRouter/commanderReadyGather.ts` (about lines 116 to 125): `const active = getSeatRoster().filter(...)` becomes `const active = activeAiSeatIds(getSeatRoster());`. Import `activeAiSeatIds` from `../../shared/seatRoster`. The loop becomes `for (const seatId of active) {`, and the line `const seatId = seat.seatId as AiSeatId;` is deleted. The `seatCount: active.length` log field stays. Keep the `AiSeatId` import; it still types the orders map. Remove `isAiSeatId` if nothing else in the file uses it.
5. Add tests. Test only these contracts:
   - `src/shared/observeModeControls.test.ts`: one test named `'the active human seat counts only while it plays, and an empty roster is not observing'`. Assert `activeHumanSeatId` returns `HUMAN_SEAT_ID` for an active human plus `ai()`, and null when that human has `outTurn: 4`. Assert `isObservingRoster([])` is false, and `isObservingRoster([ai()])` is true.
   - `src/shared/seatRoster.test.ts`: a `describe('activeAiSeatIds', ...)` with one `it` that builds, with the file's `seat()` helper, a human at order 1, `'opponent2'` at order 3, `'opponent'` at order 2, and `'opponent3'` at order 4 with `outTurn: 5`. Expect `['opponent', 'opponent2']`.
6. Rewrite the placeholder comments in `src/renderer/openRouter/openRouterUiHelpers.ts` (8 blocks). The other files in this phase have none.

### Done When

- In `src/`, excluding tests, this search finds matches only inside `src/shared/observeModeControls.ts` and `src/shared/seatRoster.ts`:

  ```text
  kind === HUMAN_SEAT_KIND && \w+\.outTurn|kind === AI_SEAT_KIND && \w+\.outTurn === null
  ```

- `npx tsc -p tsconfig.main.json --pretty false --noEmit` exits 0, and `npm run check:renderer-types` passes.
- After `npx tsc -p tsconfig.main.json --pretty false`, these pass: `dist/shared/observeModeControls.test.js`, `dist/shared/seatRoster.test.js`, `dist/main/openRouter/commanderReadyGather.test.js`, `dist/main/ipc/readyIpcResolutionMapping.test.js`, `dist/main/ipc/deferredResolutionPlaybackConsult.test.js`, `dist/main/gameDb/turnNotesHistorySeats.test.js`, `dist/main/gameIpcHandlers.test.js`.
- `npm test` passes.

### Documentation

`doc/ux/opponent-tab-commander.md` and `doc/ux/new-game-dialog.md` describe the "Use for every side" label while Observe is on. They stay correct. Confirm by reading those lines; no edit is expected.

## Phase 3: Post-Resolution Consult Arguments

### Why

- The argument object for `runEventDrivenAfterResolutionConsultation` is declared twice: inline on the runner in `readyIpcResolutionMapping.ts`, and again as `DeferredStrategicResolutionConsultArgs` in `deferredResolutionPlaybackConsult.ts`. The tactical runner has the same duplication.
- Both declare `opponentState`, which no runner reads. Each caller builds a whole game state for the first AI seat only to discard it.
- `handleGameReady` and `handleResolveMeleeIntercept` each build the same ten-field object twice, once for the deferred branch and once for the inline branch.
- Three handlers repeat the same two lines to pick a fallback model.

### Steps

1. In `src/main/ipc/readyIpcResolutionMapping.ts`, add exported types near the top, after `optionalConsultToastFields`. Every member gets an orienting comment with `Contract:`.

   `requestOrders` stays on the two specific interfaces, with the option objects copied from the runners as they are today. Do not merge them into one function type. `ReadyDeps.requestOrders` has no `tacticalAiBattle` field, and the tactical runner does. One combined options type makes that assignment fail or tempts a cast. No `as any` and no `as never`.

   ```ts
   export interface PostResolutionConsultArgs {
     readonly useEventDrivenConsultation: boolean;
     readonly aiPlanningRunEnabled: boolean;
     readonly modelId: string;
     readonly enabledToolNames: string[];
     readonly hasKey: () => boolean;
     readonly timeoutMs: number;
     readonly errorLogMessage: string;
   }

   export interface StrategicConsultArgs extends PostResolutionConsultArgs {
     readonly resolutionSuccess: boolean;
     readonly resolution: ReadyResult;
     readonly requestOrders: (
       state: GameStateSnapshot,
       modelId: string,
       options: { seatId: AiSeatId; enabledToolNames: string[]; usePrecomputation?: boolean; signal?: AbortSignal }
     ) => Promise<RequestAiOrdersResult>;
   }

   export interface TacticalBeatConsultArgs extends PostResolutionConsultArgs {
     readonly tacticalBattle: TacticalBattleSnapshot;
     readonly tacticalResolutionPlayback: TacticalCommitResolutionPlayback;
     readonly requestOrders: (
       state: GameStateSnapshot,
       modelId: string,
       options: {
         seatId: AiSeatId;
         enabledToolNames: string[];
         usePrecomputation?: boolean;
         tacticalAiBattle?: TacticalBattleSnapshot;
         signal?: AbortSignal;
       }
     ) => Promise<RequestAiOrdersResult>;
   }
   ```

   - `modelId` contract: the fallback model for a seat whose `commanderModelId` returns null. A stored commander model always wins (see `modelIdForSeat`).
   - `StrategicConsultArgs` comment: also stored by the deferred-playback mutex and replayed at notify time.
   - These types replace text that is already in this file, plus the comments the rules require. Keep them in this file even if the file passes 600 lines. Do not split them into a new module. Stay under 1000 lines.
2. Change the runner signatures to `runEventDrivenAfterResolutionConsultation(args: StrategicConsultArgs)` and `runEventDrivenAfterTacticalBeatConsultation(args: TacticalBeatConsultArgs)`. Delete their inline argument types, including `opponentState`. The bodies do not change, because neither reads `opponentState`.
3. In the same file, add an exported getter with an orienting comment:

   ```ts
   export function fallbackConsultModelId(getSelectedModel: () => string): string {
     const stored = commanderModelId(AI_SEAT_IDS[0]);
     const modelId = stored === null ? getSelectedModel() : stored;
     logTrace('readyIpcResolutionMapping fallbackConsultModelId', { hasStoredModel: stored !== null });
     return modelId;
   }
   ```

   Copy this null test. Do not write `stored || getSelectedModel()` or `stored ? stored : getSelectedModel()`. `commanderModelId` returns `null` when the seat or its commander is missing, and `''` when the commander exists and has no model. Only `null` may fall back to the app-wide model. `''` must stay `''`, or a seat with a blank model starts being called with the app-wide model.

   The orienting comment says: the first AI seat's stored model when `commanderModelId` returns a string, including `''`, and the app-wide selection only when it returns null. `modelIdForSeat` still prefers each seat's own model. This fallback is used only for a seat that has no commander row.
4. In `src/main/ipc/deferredResolutionPlaybackConsult.ts`:
   - Delete `DeferredStrategicResolutionConsultArgs` and `DeferredTacticalBeatConsultArgs` with their comments (about lines 39 to 95).
   - Import `type StrategicConsultArgs` and `type TacticalBeatConsultArgs` from `./readyIpcResolutionMapping`, which this file already imports from.
   - Replace every use of the deleted names (in `PendingPlaybackConsult` and the three `setPending*` functions).
   - Remove imports that became unused. `GameStateSnapshot`, `RequestAiOrdersResult`, `ReadyResult`, `TacticalCommitResolutionPlayback`, `TacticalBattleSnapshot`, and `AiSeatId` are likely candidates. Check each with a search before removing it.
   - Do **not** change `deferredConsultStamp` or `skipDeferredConsultBecausePlayerStopped`. See "Not in This Plan".
5. In `src/main/gameIpcHandlers.ts`, `handleGameReady`. Import `fallbackConsultModelId` and `type StrategicConsultArgs` from `./ipc/readyIpcResolutionMapping` (add them to the existing import from that module).
   - Replace the two `fromSeat` / `modelId` lines (about 186 and 187) with `const modelId = fallbackConsultModelId(deps.getSelectedModel);`. Pass the function. `deps.getSelectedModel()` is a string and does not typecheck in that argument.
   - Leave the two lines that set `shouldDeferPostResolutionConsult` and `planningTurnNumberAfterResolution` where they are. Replace only the `if` / `else` that follows them, so the arguments are built once. The `else` branch must keep this copying. `turnCost` is added to any cost already recorded:

     ```ts
     const consultArgs: StrategicConsultArgs = {
       useEventDrivenConsultation,
       resolutionSuccess: readyResult.success,
       aiPlanningRunEnabled,
       resolution: readyResult,
       modelId,
       enabledToolNames,
       hasKey: deps.hasKey,
       requestOrders: deps.requestOrders,
       timeoutMs: POST_RESOLUTION_CONSULT_TIMEOUT_MS,
       errorLogMessage: 'handleGameReady: afterResolution failed or timed out',
     };
     if (shouldDeferPostResolutionConsult) {
       setPendingStrategicReadyConsult(planningTurnNumberAfterResolution, consultArgs);
     } else {
       const postConsult = await runEventDrivenAfterResolutionConsultation(consultArgs);
       if (postConsult.aiStrategy) {
         aiStrategy = postConsult.aiStrategy;
       }
       if (postConsult.aiMessage) {
         aiMessage = postConsult.aiMessage;
       }
       if (postConsult.toolInvocationCounts) {
         toolInvocationCounts = postConsult.toolInvocationCounts;
       }
       if (typeof postConsult.cost === 'number' && Number.isFinite(postConsult.cost)) {
         turnCost = (turnCost ?? 0) + postConsult.cost;
       }
     }
     ```

   - Remove the `commanderModelId` import if it became unused. `AI_SEAT_IDS` is still used elsewhere in this file.
6. In `src/main/ipc/meleeInterceptResolveIpc.ts`, `handleResolveMeleeIntercept`, make the same two changes. Import `fallbackConsultModelId` and `type StrategicConsultArgs` from `./readyIpcResolutionMapping`. The timeout stays `AI_CONSULTATION_WAIT_TIMEOUT_MS` and the error message stays `'handleResolveMeleeIntercept: afterResolution failed or timed out'`. The local names stay `resolveResult` and `resolvePostConsult`. Keep `turnCost = resolvePostConsult.cost`. This handler does not add the consult cost to a previous cost. Remove the `AI_SEAT_IDS` and `commanderModelId` imports. `hasKey: deps.hasKey` passes the function, as it does today. Do not call `deps.hasKey()`.
7. In `src/main/main.ts`, the `commitHumanTacticalDraftOrders` handler (about lines 455 to 472). This file does not import `readyIpcResolutionMapping` today. Add `fallbackConsultModelId` and `type TacticalBeatConsultArgs` to a new import from `./ipc/readyIpcResolutionMapping`. Nothing imports `main.ts`, so that import does not cycle.
   - The two `fromSeat` / `modelId` lines become `const modelId = fallbackConsultModelId(getSelectedModel);`. Pass the function, not `getSelectedModel()`.
   - `const consultArgs = {` becomes `const consultArgs: TacticalBeatConsultArgs = {`. Delete the `opponentState` line, and change `modelId: modelId ?? ''` to `modelId`.
   - Remove the `commanderModelId` import. `getGameStateForPlayer` and `AI_SEAT_IDS` are still used elsewhere in `main.ts`. Do not edit `static/renderer.js`; it is generated.
8. Update tests:
   - `src/main/ipc/deferredResolutionPlaybackConsult.test.ts`: import `type StrategicConsultArgs` and `type TacticalBeatConsultArgs` from `./readyIpcResolutionMapping`, and replace the old names. Delete the `opponentState` line in `minimalConsultArgs`.
   - Delete the `opponentState` lines in `src/main/gameIpcHandlers.test.ts` (about line 388), `src/main/ipc/readyIpcResolutionMapping.test.ts` (about line 62), and `src/main/openRouter/afterResolutionTacticalBeat.test.ts` (about line 450).
   - `tsc` flags any `opponentState` you missed as an excess property.
9. Rewrite the placeholder comments in `src/main/gameIpcHandlers.ts` (11 blocks, including the `ReadyDeps` members), `src/main/main.ts` (8 blocks), and `src/main/gameIpcHandlers.test.ts` (11 blocks).

### Done When

- This search over `src/` returns no matches: `opponentState:|DeferredStrategicResolutionConsultArgs|DeferredTacticalBeatConsultArgs|fromSeat`. Matches for the local variable `opponentState` in `src/main/gameDb.test.ts` and `src/main/tools/pathfinding.test.ts` are unrelated and may remain; the colon in the pattern skips them.
- `commanderModelId(AI_SEAT_IDS[0])` appears only inside `fallbackConsultModelId`.
- `npx tsc -p tsconfig.main.json --pretty false --noEmit` exits 0.
- After `npx tsc -p tsconfig.main.json --pretty false`, these pass: `dist/main/ipc/readyIpcResolutionMapping.test.js`, `dist/main/ipc/deferredResolutionPlaybackConsult.test.js`, `dist/main/gameIpcHandlers.test.js`, `dist/main/openRouter/afterResolutionTacticalBeat.test.js`, `dist/main/openRouter/tacticalPromptSectionParity.test.js`.
- `npm test` passes.

### Documentation

`doc/hybrid-ai.md` names both runners. Their names and behavior do not change. Confirm by reading lines 30 and 34; no edit is expected.

## Phase 4: Required Seat Parameters

### Why

Five functions take a seat or player parameter that silently defaults to the first AI seat. Every production caller already passes the right seat, so the default only hides mistakes: a new caller that forgets the argument plays as the wrong commander. One more spot repeats `opposingPartyIdOf` by hand.

### Steps

1. Remove the default, keeping the parameter and its type:

   | File | Approx. line | Before | After |
   | --- | --- | --- | --- |
   | `src/main/openRouter/afterResolution.ts` | 171 | `seatId: AiSeatId = AI_SEAT_IDS[0]` | `seatId: AiSeatId` |
   | `src/main/openRouter/afterResolution.ts` | 475 | `requestedSeatId: AiSeatId = AI_SEAT_IDS[0]` | `requestedSeatId: AiSeatId` |
   | `src/main/tools/pathfindingDistanceHelpers.ts` | 331 | `ownPlayerId: string = AI_SEAT_IDS[0]` | `ownPlayerId: string` |
   | `src/main/tacticalBattle/tacticalRangedTargetResolve.ts` | 174 | `playerId: string = AI_SEAT_IDS[0]` | `playerId: string` |
   | `src/main/tacticalBattle/tacticalSnapshotGuards.ts` | 574 | `expectedPlayer: OwnerId = AI_SEAT_IDS[0]` | `expectedPlayer: OwnerId` |

   Update each function's comment to say the seat is required and whose units it selects.
2. In `src/main/tacticalBattle/tacticalSnapshotGuards.ts`, `tacticalComputeMovementOrderOutcome` (about line 497): replace `const party = args.battle.opposingPartyId ?? AI_SEAT_IDS[0];` with `const party = opposingPartyIdOf(args.battle);`. Import `opposingPartyIdOf` from `./opposingParty`. `args.battle` already includes `battleId` and `opposingPartyId`, which is what `opposingPartyIdOf` needs. `opposingParty.ts` imports only shared code and the logger, so no cycle appears.
3. Fix the callers that relied on a default. Production callers already pass a seat. These test calls do not:
   - `src/main/openRouter/afterResolutionTacticalBeat.test.ts`: the six `afterTacticalBeatResolution(` calls (about lines 101, 162, 222, 278, 326, 381). Add `AI_SEAT_IDS[0]` as the last argument, after the deps object. The file already imports `AI_SEAT_IDS`.
   - `src/main/tacticalBattle/tacticalRangedTargetResolve.test.ts`: the two `withTacticalTempoAttacks(` calls (about lines 186 and 207), both in the test `collectTacticalTempoAttacks emits ranged for non-air and air strike for air`. Add `AI_SEAT_IDS[0]` as the last argument. The battle fixture in that test sets the armor and air sub-units' `player` to `'opponent'`, which is `AI_SEAT_IDS[0]`. Passing any other id makes the test fail, because those units are no longer selected. Import `AI_SEAT_IDS` from `../../shared/seatIds`. Leave the fixture's `'opponent'` and `'human'` player strings as they are. Test files may contain those literals.
   - `tsc` reports any other caller that omitted the argument. Fix each one by passing the seat the caller means, never by restoring a default.
4. Remove `AI_SEAT_IDS` from the import in each of the five source files when nothing else in that file uses it. In `afterResolution.ts`, keep `isAiSeatId`, `isNeutralOwnerId`, and `type AiSeatId`. In `pathfindingDistanceHelpers.ts` and `tacticalRangedTargetResolve.ts`, the `AI_SEAT_IDS` import is the whole import from `seatIds`, so delete that import line. In `tacticalSnapshotGuards.ts`, keep `HUMAN_SEAT_ID`, `isNeutralOwnerId`, and `type OwnerId`.
5. **Leave these first-seat fallbacks alone.** Each one handles legacy data, a missing perspective, or the app-wide model on purpose:
   - `src/main/briefing/briefingPerspective.ts` (lines 28 and 43);
   - `src/shared/unitIds.ts:267`;
   - `src/main/tacticalBattle/opposingParty.ts:21`;
   - `src/main/openRouter/openRouter.ts` (lines 307 to 319, 419, and 486);
   - `src/main/openRouter/requestOrdersFlow.ts:89`;
   - `src/main/main.ts` (lines 229 and 232);
   - `src/main/briefing/recentTurnNotesSection.ts:132`;
   - `src/main/briefing/map/coordinateContext.ts:79`;
   - `src/main/openRouter/possibleUnitActionsBestOptionsInterest.ts:435`;
   - `src/shared/newGameMapPreviewCore.ts` (lines 54 and 55);
   - `src/shared/lossSummaryFromResolution.ts:363`;
   - `src/renderer/rendering/unitDrawing.ts` (lines 451 and 456);
   - `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts:211`;
   - `src/main/gameActions/readyStrategicResolutionPipeline.ts:150`;
   - `src/main/ipc/deferredResolutionPlaybackConsult.ts` (lines 129 and 335);
   - the defaults in `src/main/openRouter/tacticalCallbackSubscriptionLifecycle.ts`;
   - `src/main/tacticalBattle/tacticalCallbackStashPersistence.ts:144`;
   - `fallbackConsultModelId` from Phase 3.
6. Rewrite the placeholder comments in `src/main/openRouter/afterResolution.ts` (10 blocks) and `src/main/tools/pathfindingDistanceHelpers.ts` (9 blocks).

### Done When

- This search over `src/` finds a parameter default only in the two lifecycle functions in `tacticalCallbackSubscriptionLifecycle.ts`: `[^=!]=\s*AI_SEAT_IDS\[0\]\s*([,)]|$)`. The `[^=!]` keeps comparisons such as `=== AI_SEAT_IDS[0])` in tests out of the results.
- `args.battle.opposingPartyId ?? AI_SEAT_IDS[0]` no longer appears.
- `npx tsc -p tsconfig.main.json --pretty false --noEmit` exits 0.
- After `npx tsc -p tsconfig.main.json --pretty false`, these pass: `dist/main/openRouter/afterResolutionTacticalBeat.test.js`, `dist/main/openRouter/requestOrdersSeats.test.js`, `dist/main/tacticalBattle/tacticalRangedTargetResolve.test.js`, `dist/main/tacticalBattle/tacticalPartiesSeats.test.js`, `dist/main/tools/tacticalPathfinding.test.js`, `dist/main/tools/pathfinding.test.js`, `dist/main/pathfinding.test.js`.
- `npm test` passes.

### Documentation

`doc/ai-tools.md` describes how `check_distance` picks the AI's own unit. The behavior does not change. No edit is expected.

## Phase 5: Callback Subscription Copy Helper

### Why

Two modules copy callback subscriptions field by field: the private `cloneSubscriptions` in `tacticalCallbackSubscriptionLifecycle.ts`, and the write path in `tacticalCallbackStashPersistence.ts`. A new field on `CallbackSubscription` would have to be added in both. `callbackSubscriptions.ts` also carries a plan identifier in its header and placeholder comments on every declaration.

### Steps

1. In `src/main/callbackSubscriptions.ts`, add an exported function after the `CallbackSubscription` interface, with an orienting comment:

   ```ts
   export function copyCallbackSubscriptions(rows: readonly CallbackSubscription[]): CallbackSubscription[] {
     logTrace('callbackSubscriptions copyCallbackSubscriptions', { count: rows.length });
     return rows.map((row) => ({
       event: row.event,
       params: { ...(row.params ?? {}) },
       subscribedTurn: row.subscribedTurn,
     }));
   }
   ```

   The comment says: a new array and new `params` objects, so a stash cannot share objects with the live list; `subscribedTurn` is kept as given, including undefined.
2. In `src/main/openRouter/tacticalCallbackSubscriptionLifecycle.ts`, delete the private `cloneSubscriptions` and its comment. Replace its two uses (in `stashOpponentCallbackSubscriptionsForTacticalBattle` and `hydrateOpponentCallbackStashFromGameConfig`) with `copyCallbackSubscriptions`, imported from `../callbackSubscriptions`, which the file already imports from.
3. In `src/main/tacticalBattle/tacticalCallbackStashPersistence.ts`, in the write path (about lines 60 to 64), replace the inline `stash.subscriptions.map((s) => ({ ... }))` with `copyCallbackSubscriptions(stash.subscriptions)`. Change the existing `import type { CallbackSubscription }` to `import { copyCallbackSubscriptions, type CallbackSubscription }`. This adds no cycle: `callbackSubscriptions.ts` imports only `gameDb` and the logger, and this file already imports `gameDb`.
4. In `src/main/callbackSubscriptions.ts`:
   - Rewrite the module header. Remove "(Milestone 0.7)". Keep the description: storage for event subscriptions the model asked for, evaluated after each resolution, with replace-all semantics per player.
   - Rewrite all 7 placeholder blocks, including the three `CallbackSubscription` members. `event` is the subscription's event name, such as `turns` or `unit_arrived`. `params` is the event's parameters as stored JSON. `subscribedTurn` is the turn the subscription was stored, set by `replaceSubscriptions` and read back by `getSubscriptions`.
5. In `tacticalCallbackSubscriptionLifecycle.ts`, rewrite the `restoreOpponentCallbackSubscriptionsAfterTacticalExit` summary line (about line 224). It currently ends "or applies missing-stash path C." Replace that with words: "or, with no stash, removes only the first AI seat's sub-unit subscriptions." The `Expected outcome` line below it already says this. Do not change the behavior.

### Done When

- This search over `src/main/` returns matches only in the new helper: `params: \{ \.\.\.\(\w+\.params \?\? \{\}\) \}`.
- `cloneSubscriptions`, `Milestone 0.7`, and `path C` no longer appear in `src/`.
- `npx tsc -p tsconfig.main.json --pretty false --noEmit` exits 0.
- After `npx tsc -p tsconfig.main.json --pretty false`, these pass: `dist/main/callbackSubscriptions.test.js` and `dist/main/openRouter/tacticalPromptSectionParity.test.js`. The second covers the tactical stash and restore.
- `npm test` passes.

### Documentation

None expected. Search `doc/` for `cloneSubscriptions` and `callbackSubscriptions.ts` to confirm.

## Phase 6: Split `stackCallout.ts`

### Why

`src/renderer/map/stackCallout.ts` is 999 lines, one under the hard limit. It mixes four concerns: the entry-module host bindings, the stack list, the selection toggles for embarked units, and the sealift cargo section. It also carries four renderer typecheck errors in the baseline (`'window.gameApi' is possibly 'undefined'`).

### Target Layout

Each file imports only from files above it in this list, so no import cycle can form:

| File | Contents | Imports from |
| --- | --- | --- |
| `src/renderer/map/stackCalloutHost.ts` | `StackCalloutHost`, `bindStackCalloutHost`, and one wrapper per host member | none of the other three |
| `src/renderer/map/stackCalloutSelectionToggles.ts` | the non-selectable unit set and the three toggle functions | host |
| `src/renderer/map/stackCalloutSealift.ts` | the render-generation counter and the sealift section | host, toggles |
| `src/renderer/map/stackCallout.ts` | everything else: open, close, refresh, the list, and the popover rules | host, toggles, sealift |

Expected sizes: the host file about 230 lines, toggles about 90, sealift about 270, and `stackCallout.ts` about 470.

### Steps

1. **Create `stackCalloutHost.ts`.**
   - Move the `StackCalloutHost` interface and its comment (about lines 28 to 127) unchanged.
   - Add a module variable with an orienting comment: `let boundStackCalloutHost: StackCalloutHost | null = null;`.
   - Move `bindStackCalloutHost`. Its body becomes `boundStackCalloutHost = host;`. Keep its comment, which explains the cycle it avoids.
   - Add a private `requireStackCalloutHost(): StackCalloutHost` that returns the bound host or throws `new Error('stack callout host is not bound')`. Keep that exact message.
   - Add one exported wrapper per interface member, **with the same name and parameters**, so the moved code calls them without edits:

     ```ts
     export function hideBuildPopup(): void {
       requireStackCalloutHost().hideBuildPopup();
     }

     export function scheduleTerrainTooltipRestoreAfterPopoverClose(): void {
       requireStackCalloutHost().scheduleTerrainTooltipRestoreAfterPopoverClose();
     }

     export function syncUiAfterSelectionChange(options?: { refreshHoverPreview?: boolean; refreshStackCallout?: boolean }): void {
       requireStackCalloutHost().syncUiAfterSelectionChange(options);
     }

     export async function refreshGameStateAfterSealiftChange(options?: { refreshStandingOrders?: boolean }): Promise<void> {
       await requireStackCalloutHost().refreshGameStateAfterSealiftChange(options);
     }

     export function formatUnitDisplayName(unitId: string): string {
       return requireStackCalloutHost().formatUnitDisplayName(unitId);
     }

     export function formatTargetingValidationReason(reason: string | undefined, fallbackMessage: string): string {
       return requireStackCalloutHost().formatTargetingValidationReason(reason, fallbackMessage);
     }

     export async function refreshHumanStandingOrders(): Promise<void> {
       await requireStackCalloutHost().refreshHumanStandingOrders();
     }

     export function updatePendingOrdersSidebar(): void {
       requireStackCalloutHost().updatePendingOrdersSidebar();
     }

     export function requestRedraw(): void {
       requireStackCalloutHost().requestRedraw();
     }

     export async function refreshHoverRoutePreview(): Promise<void> {
       await requireStackCalloutHost().refreshHoverRoutePreview();
     }
     ```

     Each wrapper gets an orienting comment. Reuse the purpose text of the `let` binding it replaces, such as "Sealift slot edits call this name directly", and say it throws when the host is not bound.
   - Delete the ten `let` bindings and `bindStackCalloutHost` from `stackCallout.ts` (about lines 129 to 268).
2. **Create `stackCalloutSelectionToggles.ts`.**
   - Move `let stackCalloutNonSelectableUnitIds: ReadonlySet<string> = new Set<string>();` and rewrite its placeholder comment. It holds the units whose selection toggle is hidden because they are embarked. The sealift section sets it, and each open or close of the popup clears it.
   - Add two exported functions with orienting comments:

     ```ts
     export function resetStackCalloutNonSelectableUnitIds(): void {
       stackCalloutNonSelectableUnitIds = new Set<string>();
     }

     export function currentStackCalloutNonSelectableUnitIds(): ReadonlySet<string> {
       return stackCalloutNonSelectableUnitIds;
     }
     ```

   - Move these unchanged: `applyStackCalloutSelectionButtonVisibility`, `setStackPopupNonSelectableUnitIds`, and `getSelectableHumanIdsForStackCallout`. Rewrite the placeholder comments on the last two.
   - Imports: `UNIT_DESELECT_GLYPH` and `UNIT_SELECT_GLYPH` from `../core/constants`; `rendererSharedState as S` from `../core/state`; `removeUnitsFromSelection` from `../core/selection`; `HUMAN_SEAT_ID` from `../../shared/seatIds`; `type GameStateSnapshot` from `../../shared/ipcTypes`; `syncUiAfterSelectionChange` from `./stackCalloutHost`.
3. **Create `stackCalloutSealift.ts`.**
   - Move `let sealiftSectionRenderGeneration = 0;` with its comment. **Keep that variable name**: a contract test looks for `generation !== sealiftSectionRenderGeneration`.
   - Add an exported function with an orienting comment:

     ```ts
     export function invalidateSealiftSectionRenders(): void {
       sealiftSectionRenderGeneration += 1;
     }
     ```

   - Move `removeSealiftSection`, `buildSealiftUnitLabel`, and `renderSealiftSection` at the same indentation they have now. Do not rewrap or reindent `renderSealiftSection`. A contract test matches the exact text `removeSealiftSection(calloutEl);\n    calloutEl.appendChild(section);`, including the four spaces before `calloutEl`. Rewrite the placeholder comment on `buildSealiftUnitLabel` only.
   - Fix the `window.gameApi` typecheck errors in `renderSealiftSection`. Directly after the `if (!h3Index) { ... }` block, add:

     ```ts
     const api = window.gameApi;
     if (!api) {
       removeSealiftSection(calloutEl);
       return;
     }
     ```

     Then, in the rest of the function, make these three replacements in this order: `window.gameApi?.` to `api.`, then `window.gameApi!.` to `api.`, then `window.gameApi.` to `api.`. Keep every `!` that follows a **method** name, such as `api.getTacticalSealiftStackState!(...)`. Doing the shortest form first would also rewrite the `?.` and `!.` spellings. This matches today's behavior: with no `gameApi`, the old code also removed the section and returned.
   - Do not change anything else in `renderSealiftSection`. The contract test looks for exact strings, including `removeSealiftSection(calloutEl);` followed on the next line by `    calloutEl.appendChild(section);`, plus `await refreshGameStateAfterSealiftChange()` and `setStackPopupNonSelectableUnitIds(calloutEl, nonSelectableEmbarkedIds);`.
   - Imports: `UNIT_DESELECT_GLYPH` from `../core/constants`; `S` from `../core/state`; `setUnitNameContent` from `../core/unitOriginFlags`; `mergePendingTacticalEmbarkOrdersIntoSealiftState` from `../tactical/tacticalEmbarkSealiftMerge`; `sealiftDebarkTooltipText` and `sealiftSelectTooltipText` from `../chrome/controlTooltipText`; `showMapToast` from `../openRouter/openRouterUiHelpers`; `type GameStateSnapshot` and `type SealiftStackState` from `../../shared/ipcTypes`; the seven host wrappers it calls from `./stackCalloutHost`; `setStackPopupNonSelectableUnitIds` from `./stackCalloutSelectionToggles`. Do not import `stackCallout.ts` from `openRouterUiHelpers` or from any file that module already imports. The edge is sealift to the helpers, which is the direction `stackCallout.ts` uses today.
4. **Edit what remains in `stackCallout.ts`.**
   - In `hideStackCallout`, replace `stackCalloutNonSelectableUnitIds = new Set<string>();` with `resetStackCalloutNonSelectableUnitIds();`, and `sealiftSectionRenderGeneration += 1;` with `invalidateSealiftSectionRenders();`. Update its comment, which names `sealiftSectionRenderGeneration`.
   - In `showStackCallout`, replace `stackCalloutNonSelectableUnitIds = new Set<string>();` with `resetStackCalloutNonSelectableUnitIds();`, and `applyStackCalloutSelectionButtonVisibility(calloutEl, stackCalloutNonSelectableUnitIds);` with `applyStackCalloutSelectionButtonVisibility(calloutEl, currentStackCalloutNonSelectableUnitIds());`.
   - Import what the remaining code calls: `hideBuildPopup`, `scheduleTerrainTooltipRestoreAfterPopoverClose`, `syncUiAfterSelectionChange`, and `formatUnitDisplayName` from `./stackCalloutHost`; the toggle functions from `./stackCalloutSelectionToggles`; and `invalidateSealiftSectionRenders` and `renderSealiftSection` from `./stackCalloutSealift`.
   - Remove imports that are no longer used here, such as `mergePendingTacticalEmbarkOrdersIntoSealiftState`, the sealift tooltip texts, `showMapToast`, `setUnitNameContent` if unused, and `SealiftStackState`.
   - Rewrite the remaining placeholder comments in this file. There are 10 blocks before the split; some move with their functions. Rewrite each one in whichever file it ends up in.
5. **Update the one importer that used a moved name.** In `src/renderer/renderer.ts` (about lines 6 to 13), remove `bindStackCalloutHost` from the `./map/stackCallout` import, and add `import { bindStackCalloutHost } from './map/stackCalloutHost';`. `wiredEntryCallbacks.ts`, `entryCallbacks.ts`, and `rendering/gameScene.ts` import only names that stay in `stackCallout.ts`. Leave them alone.
6. **Update the source-contract test.** In `src/main/rendererStackPopoverContracts.test.ts`, the function `testStackSealiftEmbarkedSelectionAndDebarkControls` (about line 41) reads functions that moved. Change its source to the three files joined together, and keep every assertion string unchanged:

   ```ts
   const source = ['stackCallout.ts', 'stackCalloutSelectionToggles.ts', 'stackCalloutSealift.ts']
     .map((fileName) => fs.readFileSync(path.resolve(process.cwd(), 'src', 'renderer', 'map', fileName), 'utf8'))
     .join('\n');
   ```

   Delete the now-unused `stackCalloutPath` variable in that function. The other three test functions in this file read only functions that stay in `stackCallout.ts`, and so do `src/main/rendererDrawConsolidation.test.ts` and `src/main/mapGestureWiring.test.ts`. Leave those unchanged. Rewrite the 3 placeholder blocks in `rendererStackPopoverContracts.test.ts`.
7. **Update the renderer baseline.** Delete the four identical lines in `scripts/renderer-typecheck-baseline.json` that read `"src/renderer/map/stackCallout.ts|TS18048|'window.gameApi' is possibly 'undefined'."`. They sit between the `openRouterControls.ts` entry and the `wiredEntryCallbacks.ts` entries, so the comma on the preceding entry stays. Add nothing. Do not edit `static/renderer.js`. `npm run build:renderer` regenerates it. Do not delete `stackCallout.ts`.

### Done When

- `stackCallout.ts` is under 600 lines, and each new file is under 600 lines.
- The placeholder-comment search from the rules section matches nothing in `stackCallout.ts`, `stackCalloutHost.ts`, `stackCalloutSelectionToggles.ts`, `stackCalloutSealift.ts`, or `rendererStackPopoverContracts.test.ts`.
- `npm run check:renderer-types` passes, and its output names no `stackCallout` file.
- `scripts/renderer-typecheck-baseline.json` contains no `stackCallout` line. A stale allowlist entry does not by itself fail the checker, so the file has to be read.
- `npm run build:renderer` succeeds.
- After `npx tsc -p tsconfig.main.json --pretty false`, these pass: `dist/main/rendererStackPopoverContracts.test.js`, `dist/main/rendererDrawConsolidation.test.js`, `dist/main/mapGestureWiring.test.js`.
- `npm run naming:check` passes.
- `npm test` passes.
- `npm run ui:smoke -- --label refactor` completes without new failures. Its map checks open the stack callout. Afterward, run `npm run rebuild:native:node` before running any more node tests.

### Documentation

- `doc/ux/stack-callout.md`, Code Entry Points (about line 81): keep `src/renderer/map/stackCallout.ts`, and add `src/renderer/map/stackCalloutHost.ts`, `src/renderer/map/stackCalloutSelectionToggles.ts`, and `src/renderer/map/stackCalloutSealift.ts` below it.
- `doc/ux/order-lifecycle.md`, Code Entry Points (about line 89): it lists `stackCallout.ts` for sealift embark orders. Add `src/renderer/map/stackCalloutSealift.ts` below it.
- Search `doc/` for `renderSealiftSection`, `bindStackCalloutHost`, and `setStackPopupNonSelectableUnitIds`, and update any path a match names.

## Phase 7: Stale Names and Plan Identifiers

### Why

The console tab that was "Opponent" is now the Commanders tab (labeled "Command" on the rail), and the model choice lives in a hidden app-wide select (`#openrouter-model`) plus each commander's popover. Many comments and two symbols still say "Opponent tab". Separately, many comments carry development-plan milestone or phase numbers, which the project rules forbid in versioned files.

These edits are comment text and two symbol renames, so the placeholder rewrite does not apply in this phase.

### Steps

1. **Rename two symbols.**
   - In `src/shared/startMatchAiChoice.ts`, rename every `openOpponentTab` to `openCommandersTab`: the field, both `return` statements, and the comments at about lines 34, 44, 50, 53, 64, 66, and 67. Then update `src/renderer/gameplay/newGameAiStart.ts` (the comment about line 84 and the `if` about line 96) and `src/shared/startMatchAiChoice.test.ts` (the four expected objects, and the three test titles that say "opens the Opponent tab", which become "opens the Commanders tab").
   - In `src/renderer/chrome/frameTooltipText.ts` line 31, rename `opponentTabTooltipText` to `commandersTabTooltipText`. Nothing imports it.
   - Leave the UI-smoke scene key `SCENES.opponentTab` and its value `'opponent-tab'` alone. They name screenshot files.
   - Do not edit `static/renderer.js`. Phase 8's smoke build regenerates it. The done-when search below is limited to `src/` and `scripts/ui-smoke/` so the stale bundle does not look like a miss.
2. **Reword "Opponent tab" in comments.** Use "Commanders tab" for the console tab. Use "the app-wide model select" for the hidden model list.

   | File | Line | New wording (keep the rest of the sentence) |
   | --- | --- | --- |
   | `src/main/gameDb/seatRosterStore.ts` | 275 | "Purpose: Commander settings belong on the seat. The app-wide model and effort are copied into the first AI seat." |
   | `src/main/gameDb.ts` | 697 | "Consults follow the seat, not the app-wide model, once a roster exists." |
   | `src/renderer/openRouter/openRouterUiHelpers.ts` | 86, 242 | "Commanders tab" |
   | `src/renderer/openRouter/commanderPoolClient.ts` | 90, 158 | "Commanders tab" |
   | `src/renderer/chrome/consoleFrame.ts` | 184 | "Commanders tab" |
   | `src/shared/commanderPlanningStatus.ts` | 3, 72 | "Commanders tab" |
   | `src/shared/consoleTabState.ts` | 33, 46 | "Commanders tab" |
   | `src/renderer/gameplay/newGameSidesUi.ts` | 81 | "A new side follows the app-wide model and effort, with Balanced doctrine." |
   | `src/renderer/gameplay/newGameAiStart.ts` | 80 | "Commanders tab" |
   | `src/renderer/gameplay/newGame.ts` | 284 | "Commanders tab" |
   | `src/renderer/openRouter/openRouterControls.ts` | 265, 267 | "Commanders tab" |
   | `src/main/openRouter/openRouter.ts` | 244 | "Purpose: Keeps the app-wide model selection across restarts; a different model starts on its own default effort." |
   | `src/main/openRouter/openRouter.ts` | 245 | "When to use: When the app-wide model changes, from a commander popover (via IPC)." |
   | `src/renderer/openRouter/commanderPopover.ts` | 246 | "A model change also updates the app-wide model." |
   | `src/renderer/openRouter/commanderPopover.ts` | 297 | "Copies the options of the app-wide model select (`#openrouter-model`)." |
   | `src/renderer/openRouter/commanderPopover.ts` | 302 | "A missing app-wide select leaves one empty option." |
   | `src/renderer/openRouter/commanderPopover.ts` | 371 | "The app-wide model select changes when the id differs, which saves it." |
   | `src/renderer/openRouter/openRouterModelCatalog.ts` | 6 | "The app-wide model select and the commander popover share one list." |
   | `src/shared/startMatchAiChoice.ts` | 44, 50, 53, 64 | "Commanders tab" |
   | `src/shared/openRouterReasoningEffort.ts` | 42 | "the reasoning selects show them as names" |
   | `src/renderer/openRouter/modelDescriptionTooltip.ts` | 7 | "Construct once when the app-wide model select is available." |
   | `src/main/openRouter/buildOpenRouterModelList.ts` | 7 | "the sorted list shown in the model selects" |
   | `src/main/openRouter/buildOpenRouterModelList.test.ts` | 12 | "the list shown in the model selects" |
   | `scripts/ui-smoke/ui-smoke-console-checks.cjs` | 81 | "The Commanders tab's parts, top to bottom." |

3. **Remove plan identifiers from comments and test titles.** Delete the identifier and keep the sentence grammatical. Do not change code.

   | File | Line | Remove or reword |
   | --- | --- | --- |
   | `src/main/tacticalBattle/tacticalBattleSession.ts` | 401 | delete "(milestone 2.1+ human parity)" |
   | `src/shared/tacticalAnnihilation.ts` | 2 | delete "(milestone 2.1 annihilation slice)" |
   | `src/main/openRouter/promptHexExclusiveAudit.test.ts` | 3 | "Phase 5E-style audit:" becomes "Audit:" |
   | `src/main/openRouter/promptHexExclusiveAudit.test.ts` | 28 | "when Phase 5E migration remains intact" becomes "while the hex-only prompt stays intact" |
   | `src/main/preload.ts` | 413 | "milestone-2.1 tactical battle entry" becomes "tactical battle entry" |
   | `src/shared/ipc/gameApiTypes.ts` | 556 | "Starts a milestone-2.1 tactical battle" becomes "Starts a tactical battle" |
   | `src/main/briefingFormatter.ts` | 2 | delete "for Milestone 0.6/0.7" |
   | `src/main/callbackEvaluation.ts` | 2 | delete "(Milestone 0.7)" |
   | `src/main/callbackEvaluation.test.ts` | 2 | delete "(Phase 2)" |
   | `src/main/openRouter/consultationPolicyTacticalRangedAirActivity.test.ts` | 2 | "Phase 1 regression:" becomes "Regression:" |
   | `src/main/precomputation.ts` | 2 | delete "for Milestone 0.6" |
   | `src/main/precomputation.test.ts` | 2 | delete "(Milestone 0.6)" |
   | `src/main/tacticalBattle/tacticalMovementApply.ts` | 2 | delete "(milestone 2.1)" |
   | `src/shared/tacticalBattleTypes.ts` | 2 | "for milestone 2.1 tactical battle entry" becomes "for tactical battle entry" |
   | `src/shared/tacticalBattleTypes.ts` | 244 | "Starts at 1 for milestone 2.1 entry slice; may increment later." becomes "Starts at 1 on entry; may increment later." |
   | `src/shared/tacticalBattleTypes.ts` | 423 | "Normally true for milestone 2.1 synchronous handler." becomes "Normally true for the synchronous handler." |
   | `src/shared/tacticalBattleTypes.ts` | 432 | "Usually omitted in milestone 2.1." becomes "Usually omitted." |
   | `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts` | 136 | "Enforces milestone-2.1 start rules" becomes "Enforces tactical start rules" |
   | `src/main/unitDisplayNames.test.ts` | 277 | "Locks milestone-2.1 tactical sub-label formatting" becomes "Locks tactical sub-label formatting" |
   | `src/shared/unitDisplayNames.ts` | 317 | becomes "Purpose: Keeps tactical sub-unit names consistent with strategic ordinals and roman labels." |
   | `src/renderer/tactical/tacticalIpcHandlers.ts` | 49 | becomes "Expected outcome: The tactical view becomes active; skipped-parent toasts are shown." |
   | `src/renderer/tactical/tacticalEntryFlow.ts` | 4 | "preserving milestone-2.1 tactical activation sequencing" becomes "preserving the tactical activation sequence" |
   | `src/renderer/tactical/tacticalEntryFlow.ts` | 124 | becomes "Expected outcome: Tactical mode on success; error toasts on failure." |
   | `src/main/briefing/map/hexGridProjection.ts` | 4 | "Phase 2 spatial backbone:" becomes "Spatial backbone:" |
   | `src/main/briefing/map/hexBoundingBox.ts` | 18 | "Phase 2 bounding box selection" becomes "Bounding box selection" |
   | `src/main/openRouter/openRouterToolResultHex.ts` | 77 | "Implements Phase 5B-style outbound translation" becomes "Implements outbound hex translation" |
   | `src/main/openRouter/openRouterToolResultHex.test.ts` | 45 | "the optional Phase 5B path" becomes "the optional hex translation path" |
   | `src/main/tacticalBattle/tacticalMovementPlanningCache.ts` | 2 | delete "(milestone 2.2)" |
   | `src/main/tacticalBattle/tacticalMovementPlanningCache.ts` | 21 | "Milestone 2.2 §3.4: bounded memo entries" becomes "Bounded memo entries" |
   | `src/main/tacticalBattle/tacticalMovementPlanningCache.ts` | 172 | "Implements milestone 2.2 bounded caching" becomes "Implements bounded caching" |
   | `src/main/tacticalBattle/tacticalMovementPlanningCache.test.ts` | 119 | "Regression guard for Phase 3 cache identity" becomes "Regression guard for cache identity" |
   | `src/main/tacticalBattle/tacticalRulesAdapter.ts` | 36 | delete "(milestone 2.2)"; leave "§12.4" |
   | `src/main/visibility.ts` | 2 | delete "for Milestone 1.3" |
   | `src/main/tacticalBattle/tacticalTransportLink.test.ts` | 28 | "Phase 1 adjacency precompute" becomes "adjacency precompute" |
   | `src/main/tacticalBattle/tacticalStrategicOrderingAlignment.test.ts` | 2 | "Phase 1 / 2.5 / 3 ordering contracts:" becomes "Ordering contracts:" |
   | `src/main/tacticalBattle/tacticalStrategicOrderingAlignment.test.ts` | 107, 115 | delete "(Phase 2.5 smoke)" and "(Phase 2.5)" from the test titles |
   | `src/main/tacticalBattle/tacticalSpatialAdapter.ts` | 6 | delete "(milestone-2.1 adapter seed)" |
   | `src/main/tacticalBattle/tacticalBattlePersistence.ts` | 4 | "Milestone 2.1 tactical mode" becomes "Tactical mode" |
   | `src/main/strategicUnitPreviousHex.ts` | 3 | delete "(milestone 2.1 scope)" |
   | `src/main/productionRules.ts` | 2 | delete "for milestone 1.4" |
   | `src/main/openRouter/tacticalPromptProjection.ts` | 2 | delete "(milestone 2.1)" |
   | `src/main/hybridTurnPipeline.ts` | 2 | delete "(milestone 1.1)" |
   | `src/main/callbackSubscriptions.test.ts` | 2 | delete "(Phase 1)" |
   | `src/main/briefingFormatter.test.ts` | 2 | delete "(Milestone 0.6 Phase 3)" |
   | `src/main/briefing/map/hexMapRenderer.ts` | 4 | "Phase 3 visualization" becomes "Visualization" |
   | `src/main/briefing/map/hexMapRenderer.ts` | 114 | "Main Phase 3 entry point." becomes "Main entry point." |

   Leave these alone: "operational milestones" in `src/main/logger.ts`, the word "milestones" in `tacticalBattleTypes.ts` line 242, SVG path strings that begin with `M` in `topBar.ts` and `terrainInfrastructureIconPaths.ts`, and `§` section references (see "Not in This Plan").

### Done When

- These searches return no matches:
  - in `src/` and `scripts/ui-smoke/`: `Opponent tab|openOpponentTab|opponentTabTooltipText`
  - in `src/`: `[Mm]ilestone[ -][0-9]|\bPhase [0-9]`
- `npx tsc -p tsconfig.main.json --pretty false --noEmit` exits 0, and `npm run check:renderer-types` passes.
- After `npx tsc -p tsconfig.main.json --pretty false`, `dist/shared/startMatchAiChoice.test.js` passes.
- `npm test` passes.

### Documentation

None expected. `doc/ux/opponent-tab-commander.md` keeps its file name. `doc/release-notes/v2.6.0.md` is historical and stays as written.

## Phase 8: Documentation Check and Final Verification

### Steps

1. Search `doc/` for every symbol and path this plan added, renamed, or removed, and fix any stale mention you find. The terms to search for:
   - `HUMAN_SEAT_KIND`, `AI_SEAT_KIND`, `SeatKind`;
   - `activeHumanSeatId`, `isObservingRoster`, `activeAiSeatIds`, `matchIsObserving`;
   - `StrategicConsultArgs`, `TacticalBeatConsultArgs`, `DeferredStrategicResolutionConsultArgs`, `opponentState`, `fallbackConsultModelId`;
   - `copyCallbackSubscriptions`, `cloneSubscriptions`;
   - `stackCalloutHost`, `stackCalloutSealift`, `stackCalloutSelectionToggles`;
   - `openOpponentTab`, `opponentTabTooltipText`.
2. Confirm that `doc/ux/stack-callout.md` and `doc/ux/order-lifecycle.md` list the new files (Phase 6).
3. Confirm no plan identifier leaked. Search `src/`, `scripts/`, and `doc/` for this plan's file name and for the words "Phase 1" through "Phase 8". The only expected matches are in this plan file.
4. Run `git status --porcelain`. Compare with the list you saved before Phase 1. Every new entry should be a file this plan names. Report any other file.
5. Run `npm test` and confirm that it passes.
6. Run `npm run ui:smoke -- --label refactor` and confirm that it completes without new failures. Then run `npm run rebuild:native:node`, so the next node test run works.
7. Report to the user, without committing:
   - the files changed in each phase;
   - the documents updated (`doc/ux/stack-callout.md`, `doc/ux/order-lifecycle.md`) and the documents checked without changes;
   - the four renderer-baseline entries removed;
   - the commander popover's empty-roster normalization from Phase 2;
   - any step you could not complete, with the command output.

## Not in This Plan

These came up during research. Each needs its own decision, so this plan leaves it alone.

- **Deferred consult cancellation checks only the first AI seat.** In `src/main/ipc/deferredResolutionPlaybackConsult.ts`, `deferredConsultStamp` stores `getModelCallCancelEpoch(AI_SEAT_IDS[0])`, and `skipDeferredConsultBecausePlayerStopped` checks `hasModelCallCancelSince(pending.cancelEpoch, AI_SEAT_IDS[0])`. A stop that cancels only another seat's calls does not skip the deferred consult. Whether that is right depends on how Stop is meant to work with several commanders. This is a behavior question, not a refactor.
- **Placeholder comments in files no phase changes, and in files Phase 7 only rewords.** About 1,480 placeholder lines in about 180 files remain. The large leftovers include `src/main/gameDb.ts` (26 blocks) and `src/main/callbackEvaluation.ts` (40). Rewriting them is a separate sweep. A comment-only edit was not treated as a reason to rewrite a whole file, because that rewrite is most of the risk in those files and none of the consolidation.
- **Section references (`§12.4`, `§3.4`, and others)** in about 20 source files. Some of these are combat-rules sections: `doc/combat-rules-v3.md` uses §12.4 for tactical terrain costs. Others were sections of the historical development plan. Do not delete or reword them here. Telling them apart is a separate pass, and deleting a combat-rules citation would make the comment wrong.
- **Other files near the limit.** These are all under 1000 lines, with no split planned:

  | File | Lines |
  | --- | --- |
  | `humanMarchPreviewResolve.ts` | 967 |
  | `mainMapInteractions.ts` | 959 |
  | `entryCallbacks.ts` | 939 |
  | `briefingFormatter.ts` | 937 |
  | `controlInfrastructure.ts` | 929 |
  | `pathfinding.ts` | 914 |
  | `state.ts` | 905 |
  | `sealift.ts` | 898 |

- **`subdivisionFlagCodes.ts`** (1,838 lines) is generated data and is exempt.
- **UI-smoke scene key `opponentTab`** keeps its name, because it names screenshot files that earlier runs produced.
