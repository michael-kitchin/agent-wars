# Playback, Charts, Menu, and Game Options Polish Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Nine user-requested changes:

1. How to play opens the guide on GitHub in the system browser.
2. Replay playback holds each step for 0.5 s instead of 1 s.
3. Dragging the replay slider shows steps as the thumb moves.
4. The charts' relationship stacks sit in content-width, centered columns.
5. No stack is shown for a side that no commander reports on.
6. The charts' dropdowns are readable.
7. The game menu gains Playback… and Metrics… items.
8. The top bar's settings button opens Game Options as a centered modal that can change some options mid-match.
9. The replay panel gains a "follow units" camera toggle.

**Shape:** Phase 0 records a baseline. Phases 1–8 each deliver one or two requests and can each be verified in order, using only what earlier phases built. Phase 9 adds the smoke scene, sweeps the docs, and runs the final verification.

**Tech:** Electron, TypeScript, CSS, `node:test`, source-contract tests (`src/main/renderer*Contracts.test.ts` with `src/main/rendererSourceAssertions.ts`), `scripts/ui-smoke/`.

---

## How to Use This Plan

- **Order.** Run the phases in order.
- **Stopping.** Stop only when a verification fails and the phase's own fix steps do not resolve it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop.
- **Git.** Never commit, push, stash, merge, rebase, or run `git checkout`, `git restore`, `git reset`, or `git clean`. Read-only git commands are fine. The user reviews every change.
- **Finding code.** Find code by the quoted text, not by line number. Line numbers here are hints from when the plan was written. Code sketches are sketches: the file wins, and any difference goes in the Completion Log.
- **Tests first.** Write the test change, run it, watch it fail, then make the change and watch it pass.
- **No paid calls.** Make no paid model calls. Never set an OpenRouter key.
- **Files you must not touch:**
  - `doc/match-video.md`;
  - `doc/release-notes/*`;
  - `scripts/match_video/*`;
  - `scripts/compose_match_comparison.py`;
  - `.claude/`.
- **`static/renderer.js`.** It is a build artifact. It changes when you build, which is fine, but never hand-edit it.
- **Line endings.** Keep each file's line endings. Many files under `src/`, `static/`, and `scripts/` are CRLF. Check the bytes before editing (for example `python -c "print(b'\r\n' in open('<path>','rb').read())"`). If your editor would change them, edit with a small Python script in binary mode.

### Backup and Revert

Before each phase, copy every file the phase lists under **Edit** to `$env:TEMP\aw-polish\phase-N\`, keeping the same relative paths from the repo root. To revert a phase, copy them back and delete every file the phase lists under **Create**.

---

## Verification Bar

- **Between phases:** targeted checks only.
  - `npm run build:main` compiles `src/main` and `src/shared` to `dist/`. `npm test` finds every `dist/main/**/*.test.js` and `dist/shared/**/*.test.js` by itself (`scripts/run-main-node-tests.cjs`), so a new test file needs no registration.
  - Run one test with `node dist/<path>.test.js`. If a test fails with `NODE_MODULE_VERSION` for `better-sqlite3`, run `npm run rebuild:native:node` and retry.
  - Also run `npm run check:renderer-types`, `npm run lint`, `npm run naming:check`, and `node --test scripts/ui-smoke/ui-smoke-checks.test.cjs`.
- **End of the plan only:**
  - `npm test` (about 20 minutes);
  - `npm run build:renderer`;
  - `npm run check:circular`, which must print only the three cycles Phase 0 records;
  - `npm run ui:smoke` (about 15 minutes; it rebuilds the native module for Electron).
- **Baselines.** Never refresh a baseline file to make a gate pass.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Read every file in `.cursor/rules/` once before Phase 1.

- **Orienting comments.** Every new or changed function, constant, type, and module gets a JSDoc block: a one-line summary, then `Purpose:`, `When to use:`, `Expected outcome:`, and `Exceptions:`. If a declaration you change has filler text, replace it with specific text.
- **Logging.**
  - Main-process code logs through `src/main/logger` (`logDebug`, `logInfo`, `logError`, `logTrace`), following rule 02.
  - `src/shared` never logs.
  - In `src/renderer`, use `console.error` only for caught failures, as the nearby files do.
- **File size.** Rule 09 sets a target of 600 lines.
  - Put new behavior in a new, well-named file instead of growing a large one.
  - These files are already at or near the limit: `replayMode.ts` (592), `chartsDialog.ts` (605), `initCore.ts` (714), `main.ts` (691), `state.ts` (971).
  - If a step must add lines to one of them, keep the addition small and record the final line count in the Completion Log.
- **Argument limits.** Follow rule 10: a function with more than three parameters takes an options object.
- **Naming.** Follow `doc/naming-conventions-contract-v1.md`.
- **Import cycles.**
  - Run `npm run check:circular` after every phase that adds a renderer import.
  - A new cycle is a failure. Fix it the way this plan does elsewhere: inject the function through a wiring call, or put the shared piece in a leaf module with no imports.
- **Docs.**
  - `AGENTS.md` requires `doc/` to change in the same change as the code, and each phase lists its docs.
  - Keep plan vocabulary out of `src/`, `static/`, `scripts/`, and `doc/`: phase numbers, this file's name, and "item N".
  - A Markdown file has one title, and its heading levels go in order.
- **Final message.** It names every document you updated.

---

## Locked Decisions

The user made these.

1. **How to play** opens `https://github.com/michael-kitchin/agent-wars/blob/main/doc/how-to-play.md` in the platform's default browser, never inside the app.
2. **Playback hold** is 500 ms per step (`REPLAY_PLAYBACK_DWELL_MS`).
3. **Slider drag.**
   - While you drag, the map, the top bar, and the panels show the step under the thumb, at most about every 250 ms, always moving toward the latest position.
   - A step's dialogs (the turn update and the battle result) open only for the step where you let go.
4. **Stacks.** The relationship stacks are content-width columns, spread across the row and centered. A single stack sits centered in the row.
5. **No self stacks.** A side that no AI commander reports on gets no stack. Rows already leave out the subject itself. With one AI opponent and the human, only the human's stack shows.
6. **Charts dropdowns.** They use the field colors of the top bar's "View as" select (`.topbar-view-as select` in `static/frameChrome.css`). Text stays readable on the closed control and in the open list.
7. **Game menu section.**
   - A new section sits below Load game… and above Offer tactical battles.
   - It holds Playback… (enters replay, the `P` key) and Metrics… (opens the charts dialog, the `C` key).
   - Each item shows its key on the right.
8. **Settings dialog.**
   - The top bar's settings button opens the Game Options content as a modal dialog centered over the window.
   - **Editable:**
     - Victory rule;
     - Turn limit, limited to limits not earlier than the current turn (a limit equal to the current turn ends the match after that turn resolves);
     - AI-only battles;
     - Beat limit;
     - Sight cues;
     - the four bonuses: Origin, Tech, Terrain, Weather.
   - **Shown but disabled:** Nickname, Fog of war, Auto-start AI. Disabled controls still show the match's current values.
   - **Buttons:** Apply and Cancel.
   - **When it is editable:** only while the live match is in world-map planning, with no battle open, no Ready in progress, no replay, and the match not over. Otherwise every control is disabled and only Cancel works, relabelled Close.
   - **When a change takes effect:** from the next turn's resolution. An AI consult that is already running keeps the old rules.
   - **What it shows:** always the live match's current settings, including during replay. Settings are not stored per turn for this dialog.
9. **Follow units.**
   - A toggle button with a magnifying-glass icon sits left of the replay panel's label, styled like the panel's other buttons.
   - While it is on, the camera fits the visible units after:
     - every step Step back or Step forward shows;
     - every step during playback;
     - every step the slider or the turn field shows, including drag previews;
     - turning the toggle on.
   - The fit is the one the automatic watch uses (`unitFrameCamera.ts`). Only the gate differs.

### Decisions This Plan Makes

- **How to play.** The renderer sends no URL. Main opens one constant URL with `shell.openExternal`, so a compromised renderer cannot open arbitrary URLs.
- **Auto-start AI.** A running match does not store it. Its disabled checkbox shows whether commander planning is on now (`S.runButtonOn`), and its tooltip says to use the Commanders Start/Stop button.
- **Stance strip select.** The strip's "How they see" select lists only the sides that have a stack, which keeps it consistent with the stacks.
- **Playback… enters, never leaves.**
  - Opening the game menu already leaves replay (`openGameMenu` calls `requestReplayLeave`).
  - Playback… calls a new `openReplay()` that waits for that leave and then enters.
  - `toggleReplay()` would not work here: it waits for a running leave and then does not enter.
- **Metrics…** opens the charts dialog only when it is closed. It never toggles it shut.
- **Follow-units state.** The toggle is remembered for the app session in renderer state. It starts off and is not saved to disk.
- **One set of Game Options controls.**
  - The dialog reuses the existing `#new-game-options-popover` element and its control ids, so there is one set of controls. In match mode it is centered over a backdrop.
  - It saves the controls on open and puts them back on close.
  - The new-game screen also resets them each time it shows (`resetNewGameOptionControls`, `resetNewGameVictory`), so edits made in match mode cannot reach a new match.
- **Settings button.**
  - It is disabled while no match is loaded or the new-game screen is showing.
  - The charts dialog and other modals cover it, so it cannot be clicked under them. `openMatchOptionsDialog` also refuses when one is open.
- **Fog of war and Nickname stay locked.**
  - Turning fog off deletes the explored-memory tables (`fogState.ts`).
  - Turning fog on leaves the map dark.
  - No channel can rename the human seat mid-match.
- **No "settings changed" recording event.**
  - Recording frames already copy `game_config`, so the next frame records the new settings.
  - The current turn's frame keeps the old ones until then.
  - The dialog reads the live match, not the replayed one.
- **No autosave wrapper.** The turn-start autosave runs only when the turn key changes, so wrapping the write in `withAutoSaveAfter` would do nothing. The next turn's autosave carries the change.

---

## Non-Goals

- No change to how replay chooses, loads, or animates steps, beyond the hold time, the drag previews, and the follow-units fit.
- No change to the new-game screen's own Game Options popover: it stays anchored under its button.
- No rename of the charts dialog. Its title stays "Charts".
- No change to the Help (?) button in the top bar. It stays disabled.
- No in-match change to Nickname, Fog of war, Auto-start AI, the map, the sides, or the commanders.
- No change to the start month or the weather calendar.

---

## Phase 0 — Baseline

**Edit:** none. **Create:** none.

### Steps

1. Run `git status --short` and `git log --oneline -3`. Record both in the Phase 0 Inventory.
2. Run each of these and record the result, copying the cycle list exactly:
   - `npm run build:main`;
   - `npm run check:renderer-types`;
   - `npm run lint`;
   - `npm run naming:check`;
   - `npm run check:circular`;
   - `node --test scripts/ui-smoke/ui-smoke-checks.test.cjs`.
3. Read these once:
   - `doc/ux/game-menu.md`;
   - `doc/ux/top-bar.md`;
   - `doc/ux/new-game-dialog.md`;
   - `doc/ux/replay-panel.md`;
   - `doc/ux/charts-dialog.md`;
   - `doc/ux/input-map.md`;
   - `doc/ux/control-tooltips.md`;
   - `doc/how-to-play.md`;
   - `doc/ux-specification.md`;
   - `doc/ui-style-guide.md`.

### Verification

Every command succeeds, or its failure is recorded as already present.

---

## Phase 1 — Playback Hold of 0.5 s

**Edit:** `src/shared/replayNavigation.ts`, `src/shared/replayNavigation.test.ts`, `doc/ux/replay-panel.md`.

### Steps

1. **Test first.** In `replayNavigation.test.ts`, change `assert.equal(REPLAY_PLAYBACK_DWELL_MS, 1000);` to `500`. Build and run it; it must fail.
2. **Change the constant.** In `replayNavigation.ts`, set `export const REPLAY_PLAYBACK_DWELL_MS = 500;`. Update its JSDoc if it states a duration.
3. **Docs.** In `doc/ux/` and `doc/how-to-play.md` only, search for `1000`, `1 s`, `one second`, `a second`, `that second`, and `REPLAY_PLAYBACK_DWELL_MS`. Change every sentence about the replay hold to half a second (500 ms). `replay-panel.md` has "that second" near line 30.

### Verification

- `npm run build:main`, then `node dist/shared/replayNavigation.test.js` passes.
- No replay sentence in `doc/ux/` still says one second.

---

## Phase 2 — How to Play Opens the Guide in the Browser

**Edit:**
- `static/index.html`;
- `src/shared/ipc/channels.ts`;
- `src/main/preload.ts`;
- `src/shared/ipc/gameApiTypes.ts` (the renderer's `GameApi` type);
- `src/main/main.ts` (one registration line and its import);
- `src/renderer/chrome/gameMenu.ts`;
- `scripts/ui-smoke/ui-smoke-checks.cjs`;
- `scripts/ui-smoke/ui-smoke-checks.test.cjs`, if it lists the placeholder selectors;
- `doc/ux/game-menu.md`;
- `doc/ux/control-tooltips.md`.

**Create:** `src/main/ipc/howToPlayIpcHandler.ts`, `src/main/ipc/howToPlayIpcHandler.test.ts`, `src/main/rendererGameMenuContracts.test.ts`.

### Steps

1. **Test first: the handler.** `howToPlayIpcHandler.test.ts` imports `HOW_TO_PLAY_URL` and `openHowToPlay(openExternal: (url: string) => Promise<void>): Promise<boolean>` from `./howToPlayIpcHandler`. It asserts:
   - `HOW_TO_PLAY_URL === 'https://github.com/michael-kitchin/agent-wars/blob/main/doc/how-to-play.md'`;
   - with a fake `openExternal` that records its argument, the call resolves `true` and the fake received exactly that URL;
   - with a fake that rejects, the call resolves `false` and does not throw.

   Build and run it; it must fail.
2. **Implement `howToPlayIpcHandler.ts`.**
   - Export the constant and `openHowToPlay`. The function logs `logInfo('howToPlay open', { url })` and awaits `openExternal(HOW_TO_PLAY_URL)`. It returns `true` on success. On a rejection it logs with `logError` and returns `false`.
   - Also export `registerHowToPlayIpcHandler(ipcMain: Pick<IpcMain, 'handle'>, openExternal: (url: string) => Promise<void>): void`. It calls `ipcMain.handle(IPC_GAME.openHowToPlay, () => openHowToPlay(openExternal))`.
   - Copy the shape of an existing `register*IpcHandler`; see the calls near `registerOpenRouterIpcHandler(ipcMain)` in `main.ts`.
3. **Channel.**
   - Add `openHowToPlay: 'game:openHowToPlay'` to `IPC_GAME` in `channels.ts`.
   - Add the same entry to the literal channel table near the top of `preload.ts`; the preload cannot import the shared file.
   - `src/main/preloadIpcChannelParity.test.ts` and `preloadChannelParity.test.ts` compare the two tables. Run both after the build.
4. **Register.**
   - In `main.ts`, import `shell` from `electron`; line 7 imports `app, BrowserWindow, ipcMain, protocol, screen` and not `shell`.
   - Import `registerHowToPlayIpcHandler`.
   - Next to the other `register*IpcHandler(ipcMain)` calls, add `registerHowToPlayIpcHandler(ipcMain, (url) => shell.openExternal(url));`.
5. **Expose.**
   - In `preload.ts`, add `openHowToPlay: (): Promise<boolean> => ipcRenderer.invoke(IPC_GAME.openHowToPlay)` to the `gameApi` object, with JSDoc.
   - Add `openHowToPlay: () => Promise<boolean>;` with JSDoc to `GameApi` in `gameApiTypes.ts`.
6. **Enable the menu item.** In `static/index.html`, on `#game-menu-how-to-play-btn`:
   - remove `disabled`;
   - change the host span's tooltip from "How to play is not available in this version." to "Open the How to play guide on GitHub in your web browser.".
7. **Wire the click.**
   - In `wireGameMenu` in `gameMenu.ts`, add a click listener on `game-menu-how-to-play-btn` that calls `void window.gameApi?.openHowToPlay()`.
   - The menu's delegated click listener already closes the menu after any item is clicked; read `wireGameMenu` and confirm. Do not close it twice.
8. **Smoke placeholder check.**
   - In `scripts/ui-smoke/ui-smoke-checks.cjs`, the `placeholders-disabled` check (about line 219) lists `#game-menu-how-to-play-btn` as a disabled placeholder. Remove that selector.
   - Update `ui-smoke-checks.test.cjs` if it expects the old list.
9. **Contract test.** In `rendererGameMenuContracts.test.ts`, copy the pattern of `rendererChartsDialogContracts.test.ts` and assert:
   - the `game-menu-how-to-play-btn` tag in `static/index.html` has no `disabled`;
   - `gameMenu.ts` contains `openHowToPlay()`.
10. **Docs.**
    - `doc/ux/game-menu.md`: How to play is enabled and opens the guide on GitHub in the default browser.
    - `doc/ux/control-tooltips.md`: remove How to play from the placeholder list (near lines 11 and 67) and record its new tooltip.
    - Search `doc/ux/` and `doc/how-to-play.md` for other "not available" mentions of How to play.

### Verification

- `npm run build:main`, then each of these passes:
  - `node dist/main/ipc/howToPlayIpcHandler.test.js`;
  - `node dist/main/rendererGameMenuContracts.test.js`;
  - `node dist/main/preloadIpcChannelParity.test.js`;
  - `node dist/main/preloadChannelParity.test.js`.
- `npm run check:renderer-types`, `npm run lint`, `npm run naming:check`, and `node --test scripts/ui-smoke/ui-smoke-checks.test.cjs` pass.

---

## Phase 3 — Charts: Dropdown Colors, Stack Layout, No Self Stacks

**Edit:** `static/chartsChrome.css`, `src/shared/matchChartSeries.ts`, `src/shared/matchChartSeries.test.ts`, `src/renderer/charts/chartsDialog.ts`, `src/main/rendererChartsDialogContracts.test.ts`, `doc/ux/charts-dialog.md`.

### Steps

1. **Test first.**
   - In `matchChartSeries.test.ts`, which has a three-seat fixture, add tests for a new export `relationshipSubjectSeatIds(snapshot: MatchChartsSnapshot): string[]`.
   - It returns the seat ids, in `seatOrder`, for which `relationshipRows(snapshot, seatId)` has at least one row.
   - Cases, built by reusing and trimming the existing fixture:
     - human and one AI → `['human']`;
     - human and two AIs → all three;
     - no AI seats → `[]`.
   - Run it; it must fail.
2. **Implement.** Add `relationshipSubjectSeatIds` in `matchChartSeries.ts` next to `relationshipRows`. Use the existing private `reporterSeatIds` so the rule lives in one place. Do not copy the rule.
3. **Stacks.** In `fillStacks` (`chartsDialog.ts`):
   - map over `relationshipSubjectSeatIds(snapshot)`, looking up each seat for its order, instead of over every seat;
   - delete the `host.style.gridTemplateColumns = …` line;
   - remove the `MAX_SEATS` import if nothing else in the file uses it;
   - when the list is empty, put one `<p class="charts-empty">No AI commander reports on any side.</p>` in the host. In a real match there is always at least one AI seat, so this only guards a malformed snapshot. Say so in the JSDoc;
   - rewrite the function's JSDoc: one stack per side that at least one commander reports on, in content-width columns.

   `chartsDialog.ts` is at 605 lines. Keep this change line-neutral or smaller, and record the count.
4. **Stance strip select.**
   - The "How they see" options are built once in `buildBody` (about line 298) and are not refilled on refresh. The set depends only on the seats, which cannot change mid-match.
   - Build the options from `relationshipSubjectSeatIds(snapshot)` instead of every seat.
   - No refresh handling is needed. With an empty list, the timeline already shows its own empty message (`relationshipTimeline.ts`, about line 346).
5. **Stack layout (CSS)** in `static/chartsChrome.css`:
   - Replace `.charts-stack-grid { display: grid; gap: 0.75rem; }` with:

     ```css
     /* One content-width column per stack, spread across the row and centered. A narrow dialog wraps them. */
     .charts-stack-grid { display: flex; flex-wrap: wrap; justify-content: space-evenly; align-items: flex-start; gap: 0.75rem; }
     ```

     Delete the old comment above it, which says "up to four".
   - Add to `.charts-stack`: `flex: 0 0 auto; width: max-content; max-width: 100%; display: flex; flex-direction: column; align-items: center;`. Keep `min-width: 0` and the existing border and background.
   - Add `justify-content: center;` to `.charts-stack-heading`.
   - Change `.charts-spoke-graph`'s `width: 100%` to `width: 240px; max-width: 100%;`. Add a comment that 240 is `GRAPH_BOX.width` in `relationshipStack.ts`.
   - In `.charts-row-card`, change `width: 100%; … table-layout: fixed;` to `width: auto; … table-layout: auto;`. Read every `.charts-row-card th, td` rule. If a cell ellipsis rule needs a fixed table width, give that cell `max-width: 10rem` so long names still end in an ellipsis. Record what you did.
6. **Dropdown colors (CSS).**
   - `.charts-select, .charts-select-label { font-size: 12px; color: var(--chrome-muted); }` is one combined rule. Split it:
     - `.charts-select-label { font-size: 12px; color: var(--chrome-muted); }`;
     - `.charts-select { font: inherit; font-size: 12px; color: var(--field-text); background: var(--field-bg); border: 1px solid var(--field-border); border-radius: 4px; color-scheme: light; max-width: 12rem; }`;
     - `.charts-select option { color: var(--field-text); background: var(--field-bg); }`;
     - `.charts-select option:disabled { color: var(--field-disabled-text); }`.
   - Remove the old `.charts-select { max-width: 12rem; }` line.
   - Add a comment: the open list uses the light scheme, so its text must use the field color. This copies `.topbar-view-as select` in `frameChrome.css`.
   - Both selects in the dialog already have the `charts-select` class.
7. **Contract tests.** In `rendererChartsDialogContracts.test.ts`, assert:
   - `fillStacks` calls `relationshipSubjectSeatIds`;
   - `chartsDialog.ts` no longer contains `gridTemplateColumns`;
   - `chartsChrome.css` gives `.charts-select` both `color: var(--field-text)` and `background: var(--field-bg)`;
   - `.charts-stack-grid` uses `display: flex`.

   Update any existing assertion that expected the grid.
8. **Docs.** In `doc/ux/charts-dialog.md`:
   - describe the content-width, centered columns;
   - say a side with no reporting commander has no stack and is not in the strip's select;
   - say the dropdowns use the field colors.

### Verification

- `npm run build:main`, then `node dist/shared/matchChartSeries.test.js` and `node dist/main/rendererChartsDialogContracts.test.js` pass.
- `npm run check:renderer-types` and `npm run lint` pass.

---

## Phase 4 — Game Menu: Playback… and Metrics…

**Edit:** `static/index.html`, the stylesheet that defines `.game-menu-item` (find it with `grep -rn "\.game-menu-item" static/*.css`), `src/renderer/chrome/gameMenu.ts`, `src/renderer/renderer.ts` (the `wireGameMenu` call, about line 734), `src/renderer/replay/replayMode.ts`, `src/renderer/charts/chartsDialog.ts`, `src/main/rendererGameMenuContracts.test.ts`, `doc/ux/game-menu.md`, `doc/ux/input-map.md`, `doc/ux/replay-panel.md`, `doc/ux/charts-dialog.md`.

### Steps

1. **Add `openReplay()` to `replayMode.ts`.**
   - Move today's entry branch of `toggleReplay`, unchanged, into a private `async function enterReplay(): Promise<void>`. That branch includes `entryDecision()`, the refusal sentence, and the failure handling.
   - `toggleReplay` keeps its leave branch and then calls `enterReplay()`.
   - Add an exported `openReplay()` with full JSDoc. It is the game menu's Playback…: it enters replay after a running leave finishes, and does nothing when replay is already on.

     ```ts
     export async function openReplay(): Promise<void> {
       if (replayLeaving !== null) await replayLeaving;
       if (replayActive()) return;
       await enterReplay();
     }
     ```

   - Do not move `enterReplay` to another file: it writes this module's private state.
   - Record `replayMode.ts`'s line count in the Completion Log.
2. **Add `openChartsDialog()` to `chartsDialog.ts`.**
   - Add it with JSDoc: `export function openChartsDialog(): void { if (!chartsDialogIsOpen()) toggleChartsDialog(); }`.
   - Do not change `toggleChartsDialog`.
3. **Inject the actions.** This step is required.
   - `gameMenu.ts` must not import `replayMode.ts` or `chartsDialog.ts`. Both imports create cycles:
     - gameMenu → replayMode → tacticalUiOrchestration → core/uiState → gameMenu;
     - gameMenu → chartsDialog → blockingDialogGuards → gameMenu.
   - Change `wireGameMenu()` to `wireGameMenu(actions: GameMenuActions)`, with `interface GameMenuActions { readonly openReplay: () => void; readonly openCharts: () => void; }` in `gameMenu.ts`. Document the interface and the parameter.
   - In `renderer.ts`, pass `{ openReplay: () => { void openReplay(); }, openCharts: openChartsDialog }`.
4. **Markup.** In `static/index.html`, between the `game-menu-load-btn` host span and the separator before "Offer tactical battles", insert a `<div class="game-menu-separator" aria-hidden="true"></div>` and two items. Build each like the Save game… item: a host span with a tooltip around a `button.game-menu-item`.
   - **Playback…**
     - `id="game-menu-playback-btn"`, `aria-keyshortcuts="P"`;
     - tooltip: "Step through the turns already played. Same as the P key.";
     - icon `<path d="M5 3.5v9l7-4.5z"></path>`;
     - after the label: `<kbd class="game-menu-shortcut" aria-hidden="true">P</kbd>`.
   - **Metrics…**
     - `id="game-menu-metrics-btn"`, `aria-keyshortcuts="C"`;
     - tooltip: "Open the match charts. Same as the C key.";
     - icon `<path d="M2.5 13.5h11M4.5 13.5V8M8 13.5V4.5M11.5 13.5V10"></path>`;
     - after the label: `<kbd class="game-menu-shortcut" aria-hidden="true">C</kbd>`.

   Both icons use the same `svg.chrome-icon` wrapper as the other items. The existing separator before "Offer tactical battles" stays, so the pair forms its own section.
5. **CSS.** `.game-menu-item` is already a flex row. Add:

   ```css
   .game-menu-shortcut { margin-left: auto; padding-left: 1.5rem; font: inherit; font-size: 11px; color: var(--chrome-muted); }
   ```

6. **Wire.** In `wireGameMenu`, add click listeners:
   - `game-menu-playback-btn` → `actions.openReplay()`;
   - `game-menu-metrics-btn` → `actions.openCharts()`.

   The delegated listener closes the menu.
7. **Contract test.** In `rendererGameMenuContracts.test.ts`, assert:
   - `static/index.html` has both ids, each with `aria-keyshortcuts`, after `game-menu-load-btn` and before `openrouter-tactical-battles`;
   - `gameMenu.ts` does not import from `../replay/replayMode` or `../charts/chartsDialog`;
   - `renderer.ts` passes `openReplay` and `openChartsDialog` to `wireGameMenu`.
8. **Docs.**
   - `game-menu.md`: the new section, its items, what each does, and its key.
   - `input-map.md`: P and C also have menu items.
   - `replay-panel.md`: the menu entry point, and that Playback… waits for a running leave and does nothing when replay is already on.
   - `charts-dialog.md`: the menu entry point.

### Verification

- `npm run check:renderer-types`, `npm run lint`, and `npm run check:circular` pass, with only the baseline cycles.
- `npm run build:main`, then `node dist/main/rendererGameMenuContracts.test.js` passes.

---

## Phase 5 — Slider Shows Steps While Dragging

**Edit:** `src/renderer/replay/replayMode.ts`, `src/renderer/replay/replayPlayback.ts`, `src/renderer/replay/replayPanel.ts`, `static/index.html` (the slider's tooltip), `src/main/rendererReplayContracts.test.ts`, `doc/ux/replay-panel.md`.

**Create:** `src/shared/replaySliderPreview.ts`, `src/shared/replaySliderPreview.test.ts`, `src/renderer/replay/replayStepPreview.ts`.

### Design

- **The scheduler.** A scheduler decides when a preview runs. It has no DOM, so it can live in `src/shared` and be unit-tested with fake timers.
- **A preview.** A preview shows a step without its dialogs.
- **On release** (`change`):
  - the scheduler settles, so a preview in flight finishes and a pending one is dropped;
  - the code then waits until no step is loading or showing;
  - then it shows the released step in full, with its dialogs, even when the last preview showed the same index.
- **While dragging,** the panel's redraw must not move the thumb or rewrite the turn field. Each preview redraws the panel, which today sets `slider.value = String(state.index)` (`replayPanel.ts`, about line 316). That would snap the thumb back to the last shown step mid-drag.

### Steps

1. **Test first: `replaySliderPreview.test.ts`.**
   - It tests `createSliderPreviewScheduler(options)`, where `options` is an options object:

     ```ts
     {
       intervalMs: number;
       show: (index: number) => Promise<void>;
       now: () => number;
       setTimer: (fn: () => void, ms: number) => unknown;
       clearTimer: (handle: unknown) => void;
     }
     ```

   - It returns:

     ```ts
     {
       request(index: number): void;
       settle(): Promise<void>;
       cancel(): void;
     }
     ```

   - Using a fake clock and fake timers, the tests check that:
     - the first `request` calls `show` at once;
     - requests within `intervalMs` of the last show collapse to the latest index, which is shown when the interval ends;
     - a request made while `show` is still running is shown after it finishes, and only the latest such request;
     - a request for the index last shown, or last requested, does nothing;
     - `settle()` resolves after a running `show` finishes and never starts the pending one;
     - `cancel()` drops the pending one and makes later timer callbacks do nothing;
     - a `show` that rejects does not stop later requests. The scheduler catches the rejection and goes on; `src/shared` does not log.
   - Run it; it must fail.
2. **Implement `replaySliderPreview.ts`** to pass the tests. Also export `REPLAY_SLIDER_PREVIEW_INTERVAL_MS = 250`, with JSDoc saying the user allowed a slight delay while dragging.
3. **Dialogs become optional in `replayMode.ts`.**
   - Add `readonly showDialogs: boolean` to `PresentReplayStepOptions`, documented.
   - In `presentReplayStep`, call `showReplayStepDialogs` only when `options.showDialogs` is true.
   - Update its two callers:
     - `showReplayStep` passes `showDialogs: true`;
     - `playReplayStep` in `replayPlayback.ts` passes `showDialogs: true`.
   - Export the private `waitForStepToSettle()` with full JSDoc.
     - Its comment explains why: the busy flag clears between loading and showing, so waiting for one idle event is not enough.
     - `loadReplayStep` refuses while another step is busy (`if (!state || state.busy || !ref) return null;`), so the release must wait for the step to settle first.
   - Keep the additions to `replayMode.ts` to a few lines.
4. **`replayStepPreview.ts`.** Create this file. Importing `replayMode.ts` from it is a one-way import, so it adds no cycle. It exports:
   - `previewReplayStep(index: number): Promise<void>`. It returns at once when replay is off, playing, or leaving. Otherwise it awaits `loadReplayStep(index)` and, when that returns a view, `presentReplayStep(index, view, { forPlayback: false, showDialogs: false })`.
     - To know when replay is leaving, add a small exported `replayIsLeaving(): boolean` to `replayMode.ts` that returns `replayLeaving !== null`.
     - A preview sets the current index, as a full show does, so the label follows.
   - `showReleasedReplayStep(index: number, settle: () => Promise<void>): Promise<void>`. It awaits `settle()`, then `waitForStepToSettle()`. It returns if replay is now off or leaving. Otherwise it awaits `showReplayStep(index)`.
5. **Wire the slider in `replayPanel.ts`.**
   - Module state: `let sliderDragging = false;`, documented.
   - In `wireSlider`, create one scheduler with `show: previewReplayStep`, `intervalMs: REPLAY_SLIDER_PREVIEW_INTERVAL_MS`, `now: () => performance.now()`, and `window.setTimeout` / `window.clearTimeout` as the timer functions.
   - `pointerdown` on the slider: `sliderDragging = true`.
   - `input`: keep today's field update, then `scheduler.request(Number(slider.value))`.
   - `change`:
     - `sliderDragging = false`;
     - remove the old "ignore while busy" branch;
     - call `void showReleasedReplayStep(Number(slider.value), () => scheduler.settle()).then(() => renderReplayPanel())`.
   - `pointercancel`, and a `pointerup` that fired no `change`: set `sliderDragging = false` and call `renderReplayPanel()` so the thumb returns to the step on screen.
   - In `renderReplayPanel`, when `sliderDragging` is true, skip `slider.value = …` and skip writing the turn field's value. Still update `max`, `disabled`, and the label.
   - In the panel's replay-change listener, when `currentReplay()` is null:
     - call `scheduler.cancel()`;
     - set `sliderDragging = false`.

     Keep the scheduler in a module variable the listener can reach.
   - Keyboard arrows on the slider fire `input` and then `change` without a pointer. The preview and the full show both run, and the dialogs open once. `sliderDragging` stays false, so the panel follows normally.
6. **Tooltip.** Change the slider's tooltip in `index.html` from "Drag to a turn. The map changes when you let go." to "Drag to a turn. The map follows the thumb, and the turn's dialogs open when you let go.".
7. **Contract test.** In `rendererReplayContracts.test.ts`:
   - Assert that:
     - `replayPanel.ts` uses `createSliderPreviewScheduler` and `showReleasedReplayStep`;
     - `renderReplayPanel` checks `sliderDragging` before writing `slider.value`;
     - `presentReplayStep` checks `showDialogs` before `showReplayStepDialogs`;
     - `replayStepPreview.ts` calls `waitForStepToSettle` before `showReplayStep`, and `previewReplayStep` returns when `replayIsLeaving()`.
   - Update or delete any old assertion about the change-while-busy branch, and record which.
8. **Docs.** In `replay-panel.md`:
   - while dragging, the map follows the thumb at most every 250 ms (`REPLAY_SLIDER_PREVIEW_INTERVAL_MS`);
   - dialogs open on release;
   - keyboard steps behave the same.

   Update the Mouse and Keyboard bullets that say the map changes on release, and add the new symbols to Code Entry Points.

### Verification

- `npm run build:main`, then `node dist/shared/replaySliderPreview.test.js` and `node dist/main/rendererReplayContracts.test.js` pass.
- `npm run check:renderer-types`, `npm run lint`, `npm run check:circular`, and `npm run naming:check` pass.

---

## Phase 6 — Follow Units in Replay

**Edit:**
- `src/renderer/map/unitFrameCamera.ts`;
- `src/renderer/core/state.ts`, where `S` is declared; find `automaticFramedTurnNumber`;
- `src/renderer/replay/replayMode.ts`;
- `src/renderer/replay/replayStepPreview.ts`;
- `src/renderer/replay/replayPlayback.ts`;
- `src/renderer/replay/replayPanel.ts`;
- `static/index.html`;
- `static/replayChrome.css`;
- `src/main/rendererReplayContracts.test.ts`;
- `doc/ux/replay-panel.md`.

**Create:** `src/renderer/replay/replayCamera.ts`.

### Steps

1. **Ungated fits in `unitFrameCamera.ts`.**
   - Add two exports that reuse the private `frameForIndexes` and `fitMainMapToFrame`. Do not copy them.
     - `fitStrategicUnitsNow(indexes: readonly string[]): boolean` fits these cells with no gate and no turn memory, and returns whether the camera moved.
     - `fitBattleUnitsNow(indexes: readonly string[], battleLimit: LatLngFrameBox): boolean` does the same inside the battle area.
   - Each catches a failure and reports it with `console.error`, as `frameAutomaticStrategicUnits` does, and then returns `false`.
   - Change the gated `frameStrategicUnits` and `frameBattleUnits` to call the new pair after their gates, so the box math lives in one place. The automatic watch's behavior must not change. Keep their turn and beat memory updates, done only when the fit moved the camera, and their `console.debug` lines.
   - Keep the existing early returns on `replayActive()` in the gated functions. They belong to the automatic watch.
2. **State.**
   - In `src/renderer/core/state.ts`, add `replayFollowUnits: boolean` to `S`, defaulting to `false`.
   - Its JSDoc: it lasts for the app session, is not saved, and is not reset by a new match or by leaving replay.
3. **`replayCamera.ts`** exports two functions.
   - `frameReplayStepIfFollowing(): void`.
     - Return unless both `S.replayFollowUnits` and `replayActive()` are true.
     - If `S.tacticalBattleSnapshot` is set (a replayed beat), take the non-empty `h3Index` of each of its `subUnits`. Compute `const limit = tacticalBattleAreaFrameBox(S.tacticalBattleSnapshot.tacticalChildH3Indexes)`; it is already exported from `tacticalMapView.ts`. When `limit` is non-null, call `fitBattleUnitsNow(indexes, limit)`.
     - Otherwise call `fitStrategicUnitsNow` with the non-empty `h3Index` of every unit in `S.gameState.units`. These are the units visible in the replayed view, because each stored snapshot is already filtered to its view.
     - `applyGameStateSnapshot` with `replay: 'step'` puts the replayed snapshot in `S.gameState`, and a beat in `S.tacticalBattleSnapshot`. Confirm this by reading `stateSnapshot.ts`, and note it in the Completion Log.
   - `setReplayFollowUnits(on: boolean): void`. It sets `S.replayFollowUnits`, then calls `frameReplayStepIfFollowing()` when `on` is true.

   Run `npm run check:circular` after this step.
4. **Hook points.** Call `frameReplayStepIfFollowing()` in exactly these places, once per shown step:
   - in `showReplayStep` (`replayMode.ts`), after `presentReplayStep` resolves. This covers Step back, Step forward, the turn field, and the slider release;
   - in `previewReplayStep` (`replayStepPreview.ts`), after `presentReplayStep` resolves;
   - in `playReplayStep` (`replayPlayback.ts`):
     - after `await finished` when the step had an animation;
     - right after `presentReplayStep` when it had none;
     - never both for one step.

     This frames each played step on its final positions, the same moment the automatic watch frames after playback.

   Do not hook inside `presentReplayStep`: playback steps without an animation go through it too, and would be framed twice.
5. **Button.**
   - In `static/index.html`, inside `#replay-panel-bar`, put this button after `#replay-panel-expand`, which stays first, and before `#replay-panel-label`:

     ```html
     <button type="button" id="replay-follow-units" class="replay-panel-btn" aria-pressed="false" aria-label="Follow units" data-control-tooltip="Fit the map to the visible units on every step. Click again to stop."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.3"></circle><path d="M10 10l4 4"></path></svg></button>
     ```

   - In `replayPanel.ts`, wire a click that calls `setReplayFollowUnits(!S.replayFollowUnits)` and then `renderReplayPanel()`. In `renderReplayPanel`, set the button's `aria-pressed` from `S.replayFollowUnits`.
   - In `replayChrome.css`, add a `.replay-panel-btn[aria-pressed="true"]` rule. Copy the colors from `.map-mode-btn[aria-pressed="true"]` in `static/shellChrome.css` (about line 248).
6. **Contract test.** Assert that:
   - the button sits between `replay-panel-expand` and `replay-panel-label`, with `aria-pressed`;
   - `showReplayStep`, `previewReplayStep`, and `playReplayStep` call `frameReplayStepIfFollowing`;
   - `presentReplayStep` does not call it;
   - `unitFrameCamera.ts` exports `fitStrategicUnitsNow` and `fitBattleUnitsNow`;
   - `frameStrategicUnits` calls `fitStrategicUnitsNow`, and `frameBattleUnits` calls `fitBattleUnitsNow`.
7. **Docs.** In `replay-panel.md`:
   - the toggle, its icon, and its position;
   - when it fits: the four triggers in Locked Decision 9;
   - that the fit matches the automatic watch's fit;
   - that it is remembered until the app closes.

   Add the new symbols to Code Entry Points.

### Verification

- `npm run check:renderer-types`, `npm run lint`, `npm run check:circular`, and `npm run naming:check` pass.
- `npm run build:main`, then `node dist/main/rendererReplayContracts.test.js` passes, as does every `dist/shared/unitFrame*.test.js`. The box math is unchanged, so those must still pass.

---

## Phase 7 — Game Options: Main Process

**Edit:**
- `src/shared/ipc/gameStateTypes.ts`;
- the snapshot builder `getGameStateSnapshot` in `src/main/gameDb/fogState.ts`;
- an existing snapshot test (find one with `grep -rln "aiOnlyBeatLimit" src/main --include=*.test.ts`);
- `src/shared/ipc/channels.ts`;
- `src/main/preload.ts`;
- `src/shared/ipc/gameApiTypes.ts`;
- `src/main/main.ts` (one registration line and its import);
- `doc/save-files.md`;
- `doc/match-recording.md`.

**Create:** `src/shared/ipc/matchOptionsTypes.ts`, `src/main/gameDb/matchOptionsWrite.ts`, `src/main/gameDb/matchOptionsWrite.test.ts`, `src/main/ipc/matchOptionsIpcHandler.ts`, `src/main/ipc/matchOptionsIpcHandler.test.ts`.

### Steps

1. **The snapshot carries Sight cues.**
   - Add `sightCues?: boolean` to the snapshot type, with JSDoc: stored as `sight_cues`; a missing value means on.
   - In the snapshot builder, set it with `readSightCuesEnabled`, the reader `sightCueReadyStage.ts` imports. Do not write new SQL.
   - Add an assertion to the existing snapshot test that a fresh match has `sightCues: true`.
2. **Request type.** In `matchOptionsTypes.ts`, export two types and document every member.
   - `MatchOptionsUpdate`:

     ```ts
     {
       victoryRule: VictoryRule;
       turnLimit: number | null;
       aiOnlyBattles: AiOnlyBattleMode;
       aiOnlyBeatLimit: number | null;
       sightCues: boolean;
       originBonusLevel: BonusLevel;
       techBonusLevel: BonusLevel;
       terrainBonusLevel: BonusLevel;
       weatherBonusLevel: BonusLevel;
     }
     ```

     Use the same imported types `NewGameIpcPayload` uses in `ordersTypes.ts`.
   - `MatchOptionsResult`: `{ ok: true } | { ok: false; reason: string }`. The renderer re-reads the state itself, keeping its View as choice.
3. **Test first: `matchOptionsWrite.test.ts`.** Copy the in-memory database setup of an existing `src/main/gameDb/*.test.ts` that calls `resetGameForNewMatch`. Then cover:
   - a valid update writes each value, and a fresh snapshot reports it;
   - Deathmatch → city hexes with limit 40 at turn 3 writes `turn_limit` = 40;
   - city hexes → Deathmatch deletes the `turn_limit` row;
   - a limit equal to the current turn is accepted (at turn 30, limit 30), and a limit earlier than the current turn is refused (at turn 30, limit 20), and nothing is written (compare every `game_config` row before and after);
   - a limit outside `TURN_LIMIT_OPTIONS` (`src/shared/victoryRules.ts`) is refused;
   - city hexes when the current turn is later than 50 is refused, and at turn 50 only limit 50 is accepted;
   - **the start month is unchanged after a bonus write.** `persistOriginBonusSettings` also writes the start month, so a careless write resets the calendar to month 1;
   - Sight cues going off and then on deletes the `game_config` row keyed `SIGHT_CUE_SEEN_UNITS_CONFIG_KEY` (`src/shared/sightCueSettings.ts`), while on → on keeps it;
   - a bad enum value is refused.

   Run it; it must fail.
4. **Implement `matchOptionsWrite.ts`.** It exports two functions.
   - `validateMatchOptionsUpdate(update: unknown, currentTurn: number): { ok: true; update: MatchOptionsUpdate } | { ok: false; reason: string }`. It is pure. Use the existing value checks: `victorySettingsForRequest`, the AI-only mode list, the beat-limit list, and the bonus-level list. Return plain-English reasons.
   - `writeMatchOptions(update: MatchOptionsUpdate): void` runs one transaction, with `BEGIN`, `COMMIT`, and `ROLLBACK` on error, as `resetGame.ts` does. Inside it:
     - read the current settings first: `const before = readPersistedOriginBonusSettings(ops)` and the current sight-cue flag;
     - write the victory rule and the turn limit exactly as `resetGameForNewMatch` does: `victorySettingsForRequest`, `upsertGameConfigValue`, and the `turn_limit` delete for Deathmatch;
     - write `ai_only_battles`, and the beat limit with `aiOnlyBeatLimitToStored`;
     - write `SIGHT_CUES_CONFIG_KEY`;
     - build the bonus settings with `originBonusSettingsFromLevels` (`src/shared/originBonusRules.ts`) from the four levels, passing `startMonth: before.startMonth`. Write them with `persistOriginBonusSettings`;
     - when Sight cues goes from off to on, call `deleteGameConfigRow({ run }, SIGHT_CUE_SEEN_UNITS_CONFIG_KEY)`, as `resetGame.ts` (about line 532) does;
     - log the before and after values with `logInfo('matchOptions write', …)`.

   Every writer named here is already exported. Copy none of them.
5. **IPC handler (test first).** `matchOptionsIpcHandler.ts` exports `handleSetMatchOptions(payload: unknown, deps: MatchOptionsDeps): MatchOptionsResult`. `MatchOptionsDeps` is an options object of functions, so the test needs no Electron:

   ```ts
   {
     matchLoaded(): boolean;
     gameOver(): boolean;
     phase(): string;
     readyInFlight(): boolean;
     battleOpen(): boolean;
     currentTurn(): number;
     write(update: MatchOptionsUpdate): void;
   }
   ```

   - It refuses with a plain sentence when:
     - no match is loaded;
     - the game is over;
     - the phase is not `'planning'`;
     - Ready is in flight;
     - a battle is open;
     - validation fails.
   - Otherwise it writes and returns `{ ok: true }`.
   - It catches a thrown error, logs it with `logError`, and returns `{ ok: false, reason: 'The settings could not be saved.' }`.
   - Also export `registerMatchOptionsIpcHandler(ipcMain)`, which builds the real deps:
     - `readyInFlight`: `isReadyInFlight` from `src/main/ipc/readyInFlight.ts`;
     - `battleOpen`: `isTacticalBattleActive` from `src/main/tacticalBattle/tacticalBattleSession.ts`;
     - `phase`, `gameOver`, and `currentTurn`: the same readers the snapshot builder uses;
     - `write`: `writeMatchOptions`.
   - Test each refusal and the success path with fakes.
6. **Channel and registration.**
   - Add `setMatchOptions: 'game:setMatchOptions'` to `IPC_GAME` and to the preload's literal table.
   - Add `registerMatchOptionsIpcHandler(ipcMain);` beside the other registrations in `main.ts`.
   - Expose `setMatchOptions(update: MatchOptionsUpdate): Promise<MatchOptionsResult>` in `preload.ts` and in `GameApi`.
   - Do not wrap the write in `withAutoSaveAfter`. The turn-start autosave only writes when the turn changes (`maybeWriteTurnStartAutoSave`), so the next turn's autosave carries the change.
7. **Docs.**
   - `doc/save-files.md`: one sentence saying options changed mid-match are `game_config` rows, so they travel with the save with no format change.
   - `doc/match-recording.md`: one sentence saying the current turn's frame keeps the settings it was recorded with, and the next frame records the new ones.

### Verification

- `npm run build:main`, then these pass:
  - `node dist/main/gameDb/matchOptionsWrite.test.js`;
  - `node dist/main/ipc/matchOptionsIpcHandler.test.js`;
  - the extended snapshot test;
  - both preload parity tests.
- `npm run lint` and `npm run naming:check` pass.

---

## Phase 8 — Game Options: The Settings Dialog

**Edit:**
- `static/index.html`;
- `static/newGameChrome.css`;
- `src/renderer/gameplay/newGameOptionsPopover.ts`;
- `src/renderer/core/uiState.ts`;
- `src/renderer/gameplay/observeChrome.ts`;
- `src/renderer/gameplay/saveLoadMenu.ts` (button sync only);
- `src/renderer/renderer.ts` (one wiring call);
- `scripts/ui-smoke/ui-smoke-checks.cjs`;
- `scripts/ui-smoke/ui-smoke-checks.test.cjs`;
- `doc/ux/top-bar.md`, `doc/ux/new-game-dialog.md`, `doc/ux/control-tooltips.md`, `doc/how-to-play.md`.

**Create:**
- `src/renderer/gameplay/matchOptionsDialogState.ts` (a leaf with no imports);
- `src/renderer/gameplay/matchOptionsControls.ts`;
- `src/renderer/gameplay/matchOptionsDialog.ts`;
- `src/main/rendererMatchOptionsContracts.test.ts`.

### Steps

1. **Leaf state module: `matchOptionsDialogState.ts`.** It imports nothing, so any module can use it without a cycle. Export:
   - `matchOptionsDialogIsOpen(): boolean`. It returns true when `#new-game-options-popover` has `data-mode="match"` and is not hidden.
   - `registerMatchOptionsDialogCloser(close: () => void): void`.
   - `closeMatchOptionsDialogIfOpen(): void`. It calls the registered closer when the dialog is open.
2. **Markup.**
   - Add `<div id="match-options-backdrop" class="match-options-backdrop" hidden></div>` immediately before `#new-game-options-popover`.
   - Inside the popover, after the Other section, add:

     ```html
     <p id="match-options-note" class="match-options-note" hidden></p>
     <div id="match-options-footer" class="match-options-footer" hidden><button type="button" id="match-options-cancel">Cancel</button><button type="button" id="match-options-apply">Apply</button></div>
     ```

     The confirm dialog's buttons have no class, so these have none either.
   - On `#topbar-settings-btn`:
     - remove `disabled`;
     - add `aria-haspopup="dialog"`;
     - change the host span's tooltip to "Show the game options for this match. Some can be changed while you plan a turn.".
3. **CSS** (`newGameChrome.css`).
   - The rule `.new-game-options-popover .new-game-section:last-child` (about line 569) stops matching once the note and footer follow the last section. Change `:last-child` to `:last-of-type`. Sections are the only `section` elements in the popover. Check that the new-game popover looks the same afterwards.
   - `.match-options-backdrop`: `position: fixed; inset: 0; z-index: 7080;`. Use the charts overlay's background color; read `.charts-overlay` in `chartsChrome.css`.
   - `.new-game-options-popover[data-mode="match"]`: `position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); max-height: calc(100vh - 2rem); overflow: auto; z-index: 7090;`.
   - Layer order: the popover is normally 7060 (about line 535), tooltips are 7100, and the charts overlay is 7080.
   - `.match-options-footer`: a right-aligned flex row with `gap: 0.5rem; margin-top: 0.75rem;`.
   - `.match-options-note`: muted 12 px text with a small top margin.
   - Check that disabled selects and checkboxes inside the popover show their value in the existing disabled colors. If they are hard to read, add `color: var(--field-disabled-text)` for `:disabled` under `[data-mode="match"]` only.
4. **`matchOptionsControls.ts`** holds DOM helpers only, with no IPC. Export the following.
   - `captureOptionControls(): OptionControlsMemo`. It records `value`, `checked`, and `disabled` for every `select` and `input` in `#new-game-options-popover`, plus each control's `data-control-tooltip`.
   - `restoreOptionControls(memo): void`. Order matters:
     1. Restore the victory rule's value.
     2. Call `renderNewGameVictory()`, which rebuilds the turn-limit options.
     3. Restore every other control's value, `checked`, `disabled`, and tooltip.
     4. Restore the turn limit's `disabled` and each limit option's `disabled`.
   - `fillOptionControlsFromMatch(live: GameStateSnapshot, runButtonOn: boolean): void`:
     - **Victory rule and turn limit:** set the rule from `live.victory.rule`, call `renderNewGameVictory()`, then set the limit from `live.victory.turnLimit`, as a string or `''`.
     - **AI-only battles and beat limit:** set them from `live.aiOnlyBattles` and `live.aiOnlyBeatLimit`. A missing beat limit means Unlimited; use the select's existing Unlimited value.
     - **Sight cues:** `live.sightCues !== false`.
     - **Bonuses:** each bonus select gets `'off'` when its flag is false. Otherwise it gets the level, read through these readers:
       - Origin: `live.originBonusLevel ?? 'low'`;
       - Terrain: `live.terrainBonusLevel ?? 'low'`;
       - Weather: `weatherBonusLevelOf(live)` (`src/shared/weatherBonusRules.ts`);
       - Tech: `techBonusLevelOf(originBonusSettingsFromSnapshot(live))` (`src/shared/techBonusRules.ts`, `src/shared/originBonusRules.ts`).

       The flags are `originBonusEnabled`, `terrainBonusEnabled`, `weatherBonusEnabled`, and `techBonusEnabled`. The snapshot type's comments say to read weather and tech only through those readers. No `terrainBonusLevelOf` exists.
     - **Fog:** `live.fogOfWarEnabled !== false`.
     - **Nickname:** the human seat's nickname, read through the helper the top bar uses for the human side's name.
     - **Auto-start:** `runButtonOn`.
   - `lockOptionControls(editable: boolean, currentTurn: number): void`:
     - always disable Nickname, Fog, and Auto-start. Set Auto-start's `data-control-tooltip` to "Use the Commanders Start/Stop button to turn planning on or off during a match.";
     - when `editable` is false, disable every control;
     - when it is true:
       - enable the editable ones;
       - disable each turn-limit option whose number is less than `currentTurn`;
       - disable the city-hexes rule option when no limit is left;
       - when the selected limit is disabled, select the first enabled one.
   - `readMatchOptionsUpdate(): MatchOptionsUpdate`. It reuses `readNewGameVictory`, `readNewGameAiOnlyBattles`, `readNewGameAiOnlyBeatLimit`, `readNewGameSightCues`, and `readNewGameOptionChoices`, and maps their results to the update type. Read each signature first; do not re-read the DOM yourself.
5. **`matchOptionsDialog.ts`.** Export `wireMatchOptionsDialog()`, `openMatchOptionsDialog()`, and `closeMatchOptionsDialog()`.
   - **Wiring.** `wireMatchOptionsDialog` does three things:
     - calls `registerMatchOptionsDialogCloser(closeMatchOptionsDialog)`;
     - wires the settings button, Apply, Cancel, and the popover's `.commander-popover-close` ×. This × listener is separate from the new-game one, which ignores match mode (step 7);
     - adds the keyboard and backdrop handling.
   - **Opening.** `openMatchOptionsDialog` runs these steps in order.
     1. **Refusals.** Return when the dialog is already open, when the new-game overlay is showing (`newGameOverlayIsOpen`), when `blockingDialogIsOpen()` is true, or when the charts dialog is open. If that last check adds an import cycle, check the `#charts-overlay` element's `hidden` instead.
     2. **Read the live match.** Call `const live = await fetchMatchSnapshot()` (`src/renderer/core/matchSnapshotClient.ts`). Do not use `S.gameState`: during replay it holds a past step.
     3. **Capture, then fill.** Capture the controls, then `fillOptionControlsFromMatch(live, S.runButtonOn)`.
     4. **Editability.** `const editable = !replayActive() && live.phase === 'planning' && !S.tacticalBattleSnapshot && !S.readyRequestInFlight && !live.gameOver;`. Then `lockOptionControls(editable, live.turnNumber)`.
     5. **Read-only mode.** When not editable:
        - show the note "These are the settings in force. They can be changed while you plan a turn on the world map.";
        - hide Apply;
        - label Cancel "Close".
     6. **Show.** Set `data-mode="match"` on the popover and clear the inline `left`, `top`, `right`, and `bottom` styles the anchored mode leaves. Unhide the backdrop, the footer, and the popover.
     7. **Focus.** Move focus to the first enabled control, or to Cancel.
   - **Victory and AI-only changes.** In match mode, listen for `change` on the victory and AI-only selects and re-run `lockOptionControls(true, liveTurn)`. Their own listeners call `renderNewGameVictory()` and the beat-limit renderer, which re-enable options.
   - **Keys.** Add a `keydown` listener on the popover:
     - Escape: close, `preventDefault()`, `stopPropagation()`;
     - Tab: trap inside the popover, copying `trapTabKey` from `chartsDialog.ts`;
     - every other key: `stopPropagation()` while in match mode, so map keys (zoom, pan, P, C) do not reach the window handler. The window handler is a bubble listener, so this works.
   - **Backdrop.** A click on the backdrop closes the dialog, but only when the press started on the backdrop, as `chartsDialog.ts` does.
   - **Apply.**
     1. Disable Apply and await `window.gameApi?.setMatchOptions(readMatchOptionsUpdate())`.
     2. On `{ ok: true }`, apply `await fetchMatchSnapshot()` through the same snapshot applier `leaveReplay` uses, with the same options except `replay`; leave `replay` unset. `applyGameStateSnapshot` already clears the tooltip caches. Then close.
     3. On `{ ok: false }`, or when the call throws, show the reason in the note (log a throw with `console.error`), re-enable Apply, and stay open.
   - **Closing.** `closeMatchOptionsDialog`, used by Cancel, ×, Escape, and the backdrop:
     - restores the captured controls;
     - removes `data-mode`;
     - hides the backdrop, the footer, the note, and the popover;
     - returns focus to `#topbar-settings-btn`.

     It does nothing when the dialog is not open.
   - **Match changes.** Remember the match epoch on open. If it differs at Apply, close without writing. Copy the epoch pattern from `chartsDialog.ts`.
   - Run `npm run check:circular` after this step.
6. **Close the dialog when the new-game overlay shows.**
   - In `uiState.ts`, where the overlay is shown (just before `resetNewGameOptionControls()`, about line 164), call `closeMatchOptionsDialogIfOpen()` from the leaf module.
   - Game over shows that overlay, so the dialog cannot stay open over it, and its restore runs before the reset.
7. **Keep the new-game close paths away from match mode.**
   - In `newGameOptionsPopover.ts`, make `closeNewGameOptionsPopover` return early when the popover has `data-mode="match"`. Document this in its JSDoc.
   - Do the same in its `toggleNewGameOptionsPopover` and in its × and outside-press listeners. The match dialog has its own.
8. **Block auto-advance.** In `observeChrome.ts`, make the "nothing in the way" check (`autoAdvanceReady`) return false when `matchOptionsDialogIsOpen()` (leaf import). The backdrop already covers the Ready button.
9. **Settings button state.**
   - In `saveLoadMenu.ts`, where the save and load items are synced (`syncSaveLoadItems`), also set `#topbar-settings-btn.disabled` true when no match is loaded or the new-game overlay is showing. Use whatever those items already check.
   - Do not import the charts dialog there; `openMatchOptionsDialog` refuses in that case.
10. **Wire** `wireMatchOptionsDialog()` once from `renderer.ts`, next to `wireGameMenu`.
11. **Smoke placeholder check.** In `ui-smoke-checks.cjs`, remove `#topbar-settings-btn` from `placeholders-disabled`, and update its test.
12. **Contract test.** In `rendererMatchOptionsContracts.test.ts`, assert:
    - `topbar-settings-btn` has no `disabled` in `index.html`;
    - `matchOptionsDialog.ts` reads `fetchMatchSnapshot` and does not read `S.gameState`;
    - `captureOptionControls` runs before `fillOptionControlsFromMatch`, and `restoreOptionControls` runs in `closeMatchOptionsDialog`;
    - `lockOptionControls` always disables `new-game-human-nickname`, `new-game-fog-checkbox`, and `new-game-auto-start-checkbox`;
    - `closeNewGameOptionsPopover` checks `data-mode`;
    - `uiState.ts` calls `closeMatchOptionsDialogIfOpen`;
    - `observeChrome.ts` checks `matchOptionsDialogIsOpen`;
    - `matchOptionsDialogState.ts` has no `import`.
13. **Docs.**
    - `top-bar.md`: the settings button is enabled, opens the dialog, and is disabled while no match is loaded or the new-game screen shows.
    - `new-game-dialog.md`: add a section "During a Match". It covers:
      - which options can change, and which are shown locked;
      - when they can change;
      - Apply and Cancel;
      - the turn-limit rule;
      - that changes take effect from the next turn's resolution;
      - that a running AI consult keeps the old rules;
      - that during replay the dialog shows the live settings, read-only.
    - `control-tooltips.md`: remove Settings from the placeholder list, and record the new and changed tooltips.
    - `how-to-play.md`: one sentence where Game Options is described.

### Verification

- `npm run check:renderer-types`, `npm run lint`, `npm run check:circular`, and `npm run naming:check` pass.
- `node --test scripts/ui-smoke/ui-smoke-checks.test.cjs` passes.
- `npm run build:main`, then `node dist/main/rendererMatchOptionsContracts.test.js` passes.

---

## Phase 9 — Smoke Scene, Docs Sweep, Final Verification

**Edit:** `scripts/ui-smoke/ui-smoke.cjs`, `scripts/ui-smoke/ui-smoke-checks.cjs`, `scripts/ui-smoke/ui-smoke-checks.test.cjs`, plus any stale doc the sweep finds.

### Steps

1. **Smoke scene.** In `ui-smoke.cjs`, right after `recordScene(page, report, outDir, SCENES.chartsClosed)` (about line 234), add a scene. Use condition waits (`waitForSelector`, `waitForFunction`), not fixed timeouts.
   1. Open the game menu with `#game-menu-btn`.
   2. Assert that `#game-menu-playback-btn` and `#game-menu-metrics-btn` are visible and enabled, and that their `kbd` texts are `P` and `C`.
   3. Assert that `#game-menu-how-to-play-btn` is enabled. Do not click it: it would open a real browser.
   4. Close the menu with Escape.
   5. Click `#topbar-settings-btn`.
   6. Wait for `#new-game-options-popover[data-mode="match"]` to be visible.
   7. Assert that `#new-game-human-nickname` and `#new-game-fog-checkbox` are disabled.
   8. Click `#match-options-cancel`.
   9. Wait for the popover to be hidden and for the `data-mode` attribute to be gone.

   Add matching check functions in `ui-smoke-checks.cjs` and a unit test for any new pure helper.
2. **Docs sweep.**
   - Search `doc/ux/`, `doc/how-to-play.md`, `doc/ux-specification.md`, and `doc/ui-style-guide.md` for these phrases, and fix every stale sentence:
     - `not available in this version`;
     - `when you let go`;
     - `1000`;
     - `How to play`;
     - `Settings`;
     - `relationship stack`.
   - Do not search or edit `doc/release-notes/` or the historical docs listed in `AGENTS.md`.
3. **Final verification.**
   - Run `npm test`, `npm run build:renderer`, `npm run check:circular` (baseline cycles only), then `npm run ui:smoke`.
   - If `ui:smoke` stops in a scene this plan did not touch, run it once more. If it stops in the same place again, record both runs in the Completion Log and judge by the scenes that ran.

### Manual Checklist for the User

1. **How to play.** Game menu → How to play opens the GitHub page in the system browser.
2. **Playback hold.** Play a few turns, press P, then press Play. Each step holds for about half a second.
3. **Slider drag.**
   - Drag the slider slowly: the map follows the thumb, the thumb never jumps back, and the dialogs open once, where you let go.
   - Arrow keys on the slider still step it.
4. **Charts.**
   - With one AI opponent there is one stack, centered and narrow.
   - With three sides, the stacks spread across the row.
   - Open each dropdown: the text is readable.
5. **Game menu.** Playback… and Metrics… open replay and the charts, each with its key shown.
6. **Settings.**
   - During planning, change a bonus and press Apply. The next turn uses it, and the calendar month is unchanged.
   - Open the dialog during replay or a battle: it is read-only and shows the live settings.
   - You cannot pick a turn limit earlier than the current turn. A limit equal to the current turn can be picked and ends the match after that turn.
   - Cancel leaves everything as it was.
   - Start a new game afterwards: its options are the defaults.
7. **Follow units.** In replay, turn on the magnifying glass.
   - The map fits the units at once.
   - Step forward, Play, and the slider each refit.
   - Turn it off, and the camera stays where you leave it.

---

## Reliability Checklist

Confirm each before the final message:

- [ ] No URL travels from the renderer to `shell.openExternal`.
- [ ] Every new main-process function logs, and every new IPC handler catches and logs its errors.
- [ ] The options write is one transaction. It refuses invalid input before writing anything, and it keeps the start month.
- [ ] Locked controls are locked in the renderer and refused in main. Main checks the phase, Ready, battle, game-over, and turn-limit rules itself.
- [ ] Shared-control edits made in match mode are restored on every close path: Apply, Cancel, ×, Escape, backdrop, and the new-game overlay showing.
- [ ] The slider never snaps back mid-drag. A preview cannot run after replay starts leaving. The release always shows the dialogs once.
- [ ] Follow units reuses the automatic watch's box code, frames each step exactly once, and leaves the automatic watch unchanged.
- [ ] No new import cycle. Every file pushed past 600 lines is noted in the Completion Log.
- [ ] Every doc listed in each phase is updated, and no plan vocabulary appears in `src/`, `static/`, `scripts/`, or `doc/`.

---

## Success Definition

- All nine requests behave as the Locked Decisions say.
- `npm test`, `npm run build:renderer`, `npm run check:circular` (baseline cycles only), and `npm run ui:smoke` pass, or a pre-existing smoke flake is documented.
- The final message names the documents updated, every ruling that departed from this plan with its reason, and the Completion Log.

---

## Phase 0 Inventory

(Fill in: git status, last commits, each command's result, and the cycle list.)

## Defect Inventory

(Fill in: any failure that stopped a phase, what was tried, and what was reverted.)

## Completion Log

(Fill in per phase: what changed, test results, sketch differences, line counts of files near 600 lines, and any rulings.)
