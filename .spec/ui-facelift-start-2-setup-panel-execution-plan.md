# UI Facelift Start Screen, Plan 2 of 3: Docked Setup Panel

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Turn the new-game dialog into the setup panel: a 432 px column docked at the left of the window, from the top bar to the bottom, with the map preview beside it. The header holds the hide-choices button and then the message, the body holds today's controls and scrolls when the window is short, and the footer holds Start game across the panel. The map beside the panel takes drag and the wheel at all times. Hiding the choices takes the panel out of the row, so the map widens to the window's left edge, and the button stays in the same spot. The controls inside keep today's look until plan 3.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 2 of the three that build the spec's Phase 7; [ui-facelift-start-execution-plan.md](ui-facelift-start-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `static/index.html`: `#game-over-overlay` moves out of `#canvas-container` to the start of `#app-body`, so the map really is the area right of it. Every fit, the map's bounds and minimum zoom, the toast band, and the attribution then work unchanged, and the preview frame centres on the map the player can see. The overlay's markup becomes a header, a body, and a footer; every id stays.
- `static/newGameChrome.css`, which plan 1 created for the new-game bar, gains the panel. The dialog's rules move there from `static/feedbackChrome.css`, which keeps the toasts and the battle-result dialog. One rule inside changes: the two sides wrap onto two lines in the narrower panel.
- The rules that hide the minimap panel, the legend, the zoom buttons, and the selection panel during the overlay look for it anywhere in the page, since it is no longer inside the map pane. `--new-game-panel-width` is a new token.
- `newGameDialogCollapse.ts`: the map takes the pointer whenever the overlay is open, and the hide-choices button's tip says it widens the map. `newGameMapPreviewUi.ts` brings Leaflet's size up to date before a fit.
- The smoke run records the choices hidden, and the game-over screen at the 800 × 600 minimum. New checks cover the panel, the header, the footer, the hidden state, and the map taking the pointer.
- `doc/` describes the docked panel. Code comments and docs say "choices" where they said "form".

**Out of scope:**

- The look and wording of the controls inside the panel (plan 3).
- Clicks on the preview map still do not select or order, as today.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop, the full tests, and the smoke run against the real app in Electron passed. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 7", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
  - Do not add, reword, or "improve" anything this plan does not ask for. The blocks already meet the orienting-comment, file-size, naming, logging, and documentation rules. If you think something is wrong, finish the plan as written and say so in your report.
- **Shell:** Windows PowerShell, at the repository root `F:\Projects\Personal\agent-wars-public`. Run one command at a time; do not chain commands with `&&`.
- **Line endings:** your working tree uses Windows line endings (CRLF). The blocks in this plan show plain lines. Treat each line break in a block as the file's own line break, and keep each file's existing line endings. If your editing tool matches text byte for byte, convert a block to CRLF before matching, or edit line by line.
- **How to apply a step:**
  - "Create" and "Replace the whole file": write exactly the block's content.
  - "Find ... Replace ...": the Find text occurs exactly once in the file at that moment. Match it exactly, including leading spaces. A Find block can be part of a single line.
  - Every code block starts at the left margin of this document, so every space inside a block is part of the text.
  - If a Find text is missing, or occurs more than once, stop and report the step number, the file, and what you found. Do not adapt the edit.
- `static/renderer.js` is a committed build output. It changes whenever `npm run build:renderer` or `npm run ui:smoke` runs. Leave it changed; do not revert it.
- No step needs an API key, and the smoke run makes no model calls.

## Verification Commands

These are used in Before You Start and in Verify.

**Fast loop.** Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
npm run naming:check
npm run build:renderer
npm run check:circular
```

Each command exits 0, with two expected outputs and one exception:

- `check:renderer-types` prints `check-renderer-typecheck: ok`. It also prints an `entries=` count, a `resolved baseline entries=` count, and the baseline lines it no longer finds. Those are notes from the check, not failures.
- `naming:check` prints `naming check: ok`.
- `check:circular` is the exception. It exits 1 and prints `check-circular-deps: found circular dependencies`, then exactly two cycle lines starting with ` - `, both through `src/main/tools/standingOrders.ts`. Those two cycles already exist. A third line means this plan added a cycle: stop and report.

**Full tests.** Run these one at a time. `clean:dist` removes compiled copies of deleted tests, so the count is exact.

```powershell
npm run clean:dist
npm test 2>&1 | Tee-Object -FilePath "$env:TEMP\agent-wars-npm-test.log"
$testLog = Get-Content "$env:TEMP\agent-wars-npm-test.log"
($testLog | Select-String -Pattern '^\S+ tests (\d+)$' | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Measure-Object -Sum).Sum
($testLog | Select-String -Pattern '^\S+ fail (\d+)$' | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Measure-Object -Sum).Sum
```

The `npm test` output ends with the notices check, and the last two commands print the test total and the failure total. Error-looking log lines such as `hex-code-translator h3ToCode: missing mapping` come from tests that check failure paths and are expected.

**Smoke run.**

```powershell
npm run ui:smoke -- --label <label>
```

- The run builds the app and takes about four minutes. It opens the app window three times: it closes the app twice to change its throwaway copy of the match, then reopens it. Do not use the mouse or keyboard in those windows while it runs.
- It prints one `PASS` or `FAIL` line per check, then a summary line: `ui-smoke <label>: P passed, F failed, E page errors, N screenshots in <folder>`.
- The window can show a "map tiles failed to load" toast when the network is slow. That toast is not a failure.
- After a smoke run the SQLite module is built for Electron. `npm test` rebuilds it for Node by itself, and `npm start` works as usual.

## Before You Start

- [ ] **Read**

1. [ui-facelift-spec.md](ui-facelift-spec.md): New Game and Game Over.
2. `doc/ux/new-game-dialog.md`.
3. `src/renderer/gameplay/newGameDialogCollapse.ts`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 1 is in and this plan is not:

```powershell
[bool](Select-String -Path static/index.html -Pattern 'topbar-new-game-title' -SimpleMatch -Quiet)
Test-Path static/newGameChrome.css
[bool](Select-String -Path static/index.html -Pattern 'new-game-panel-header' -SimpleMatch -Quiet)
```

Expected: `True`, `True`, `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **896**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/renderer/gameplay/newGameDialogCollapse.ts`
- `src/renderer/gameplay/newGameMapPreviewUi.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/gameplay/newGame.ts`
- `static/index.html`
- `static/newGameChrome.css`
- `static/feedbackChrome.css`
- `static/shellChrome.css`
- `static/selectionChrome.css`
- `static/frameChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/new-game-dialog.md`
- `doc/ux/modes-and-transitions.md`
- `doc/ux/input-map.md`
- `doc/ux/map-surface.md`
- `doc/ux/top-bar.md`
- `doc/ux/right-panel.md`
- `doc/ux/notifications-and-feedback.md`
- `doc/ux/control-tooltips.md`
- `doc/ui-style-guide.md`
- `doc/ux-specification.md`

- [ ] **Step 1: Edit `src/renderer/gameplay/newGameDialogCollapse.ts`**

The hide-choices button now widens the map. Its tip says so, the scroll reset is gone because the header never scrolls, and `syncNewGameDialogMapPointer` lets the map take drag and the wheel whenever the overlay is open, not only while the choices are hidden. Comments say "choices" and "hide-choices button" instead of "form" and "corner button".

1. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
 * Class on `#game-over-overlay` while only the corner button is showing.
 *
 * Purpose: Hides the form and lets drag and wheel reach the preview without treating the overlay as closed.
 * When to use: Add it when the player hides the form. Remove it when the form is shown, including every time the overlay opens.
 * Expected outcome: The form is not displayed, and the overlay no longer takes the pointer except for the corner button.
```

Replace them with:

```ts
 * Class on `#game-over-overlay` while only the hide-choices button is showing.
 *
 * Purpose: Hides the choices and widens the map without treating the overlay as closed.
 * When to use: Add it when the player hides the choices. Remove it when they are shown, including every time the overlay
 *   opens.
 * Expected outcome: The panel leaves the row beside the map, so the map widens to the window's left edge. Only the
 *   hide-choices button stays, in the same spot, and only it takes the pointer.
```

2. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
 * Accessible name and tip while the form is showing.
 *
 * Purpose: The dash means the player can hide the form. The tip says the map stays up.
 * When to use: When applying the expanded corner button.
```

Replace them with:

```ts
 * Accessible name and tip while the choices are showing.
 *
 * Purpose: The dash means the player can hide the choices. The tip says the map widens.
 * When to use: When applying the expanded hide-choices button.
```

3. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
const EXPANDED_TOOLTIP = 'Hide the new game choices. The map stays up.';

/**
 * Accessible name and tip while the form is hidden.
 *
 * Purpose: The plus means the player can show the form again.
 * When to use: When applying the collapsed corner button.
```

Replace them with:

```ts
const EXPANDED_TOOLTIP = 'Hide the new game choices and widen the map.';

/**
 * Accessible name and tip while the choices are hidden.
 *
 * Purpose: The plus means the player can show the choices again.
 * When to use: When applying the collapsed hide-choices button.
```

4. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Map clicks and the unit cursor must stay off for the whole time that overlay is up, including while its form is hidden.
```

Replace it with:

```ts
 * Purpose: Map clicks and the unit cursor must stay off for the whole time that overlay is up, with its choices showing or hidden.
```

5. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
 * Copies the visible randomize square onto the corner button.
 *
 * Purpose: That square matches the dropdown beside it, so a fixed rem size would not.
 * When to use: After the form is visible. A hidden tab's button has no height, so the other tab's button is used.
```

Replace them with:

```ts
 * Copies the visible randomize square onto the hide-choices button.
 *
 * Purpose: That square matches the dropdown beside it, so a fixed rem size would not.
 * When to use: After the choices are visible. A hidden tab's button has no height, so the other tab's button is used.
```

6. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
 * Shows the new-game form and the dash on the corner button.
 *
 * Purpose: Expanded is the state every open starts in, and the state the corner button returns to.
 * When to use: When the overlay opens, and when the player shows the form again.
```

Replace them with:

```ts
 * Shows the new-game choices and the dash on the hide-choices button.
 *
 * Purpose: Expanded is the state every open starts in, and the state the hide-choices button returns to.
 * When to use: When the overlay opens, and when the player shows the choices again.
```

7. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
 * Hides the new-game form and shows the plus on the corner button.
 *
 * Purpose: The player can see the preview map without the form covering that corner.
 * When to use: When the player clicks the corner button while the form is showing.
 * Expected outcome: Focus leaves a dropdown inside the form, the form is hidden, and the overlay scrolls back to the button.
```

Replace them with:

```ts
 * Hides the new-game choices and shows the plus on the hide-choices button.
 *
 * Purpose: The player can see more of the preview map, across the whole window.
 * When to use: When the player clicks the hide-choices button while the choices are showing.
 * Expected outcome: Focus leaves a control inside the panel, the panel's header message, body, and footer are hidden,
 *   and the map widens.
```

8. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
  const dialog = document.getElementById('game-over-dialog');
  if (active instanceof HTMLElement && dialog?.contains(active)) active.blur();
```

Replace them with:

```ts
  if (active instanceof HTMLElement && active !== button && overlay.contains(active)) active.blur();
```

9. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
  overlay.scrollTop = 0;
  overlay.scrollLeft = 0;
}

/**
 * Shows the new-game form.
 *
 * Purpose: Opening the overlay always starts with the form visible, including after the player had hidden it.
 * When to use: Only when the overlay goes from hidden to shown, and before pointer input is disabled for that open.
 * Expected outcome: The form is showing and the corner button shows a dash. The camera does not move.
```

Replace them with:

```ts
}

/**
 * Shows the new-game choices.
 *
 * Purpose: Opening the overlay always starts with the choices visible, including after the player had hidden them.
 * When to use: Only when the overlay goes from hidden to shown, and before pointer input is disabled for that open.
 * Expected outcome: The choices are showing and the hide-choices button shows a dash. The camera does not move.
```

10. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
 * Switches the new-game form between shown and hidden.
 *
 * Purpose: The corner button is the only control that hides or shows that form.
 * When to use: From the corner button's click.
 * Expected outcome: The other state is applied, then the main map's pointer follows that state.
```

Replace them with:

```ts
 * Switches the new-game choices between shown and hidden.
 *
 * Purpose: The hide-choices button is the only control that hides or shows them.
 * When to use: From the hide-choices button's click.
 * Expected outcome: The other state is applied. The map keeps the pointer either way, so drag and the wheel still move the preview.
```

11. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find these lines. Together they occur exactly once:

```ts
 * Lets the main map take drag and wheel only while the new-game form is hidden.
 *
 * Purpose: Disabling the match controls writes `pointer-events: none` onto the map on every refresh. The expand click does not go through that disable call.
 * When to use: After that disable or enable call, and after the corner button toggles.
 * Expected outcome: An open collapsed dialog sets the map to `auto`. An open expanded dialog sets it to `none`. A closed dialog is left as the enable or disable call wrote it, so a leftover collapse class cannot turn the map on for another dialog.
```

Replace them with:

```ts
 * Lets the main map take drag and wheel while the new-game overlay is open.
 *
 * Purpose: The setup panel sits beside the map, not over it, so the player can pan and zoom the preview with the
 *   choices showing or hidden. Disabling the match controls writes `pointer-events: none` onto the map on every
 *   refresh, so this runs after that call.
 * When to use: After that disable or enable call, and after the hide-choices button toggles.
 * Expected outcome: An open overlay sets the map to `auto`. A closed overlay leaves the map as the enable or disable
 *   call wrote it, so the annihilation dialog keeps the map off. Map gestures still do not select or order while the
 *   overlay is open; the gesture handlers check `newGameOverlayIsOpen`.
```

12. In `src/renderer/gameplay/newGameDialogCollapse.ts`, find this line. It occurs exactly once:

```ts
  map.style.pointerEvents = overlay.classList.contains(COLLAPSED_CLASS) ? 'auto' : 'none';
```

Replace it with:

```ts
  map.style.pointerEvents = 'auto';
```

- [ ] **Step 2: Edit `src/renderer/gameplay/newGameMapPreviewUi.ts`**

Before fitting a preview, brings Leaflet's size up to date with `invalidateLeafletMapSizes`, because the setup panel has just taken the left of the window.

1. In `src/renderer/gameplay/newGameMapPreviewUi.ts`, find this line. It occurs exactly once:

```ts
import { getMainLeafletMap } from '../map/worldLeafletMap';
```

Replace it with:

```ts
import { getMainLeafletMap, invalidateLeafletMapSizes } from '../map/worldLeafletMap';
```

2. In `src/renderer/gameplay/newGameMapPreviewUi.ts`, find this text. It occurs exactly once:

```ts
 * Expected outcome: The camera fits when the extent changes or the dialog has just opened.
```

Replace it with:

```ts
 * Expected outcome: The camera fits the map beside the setup panel when the extent changes or the dialog has just opened.
```

3. In `src/renderer/gameplay/newGameMapPreviewUi.ts`, find these lines. Together they occur exactly once:

```ts
    if (key !== framedExtentKey && applyLoadedMapExtent(preview.extent, true)) {
      framedExtentKey = key;
      if (preview.gameMapId === 'global') zoomGlobalPreviewInOneLevel();
```

Replace them with:

```ts
    if (key !== framedExtentKey) {
      // The setup panel takes the left of the window as the overlay opens, so fit to the map's size now rather than the
      // size Leaflet last measured.
      invalidateLeafletMapSizes();
      if (applyLoadedMapExtent(preview.extent, true)) {
        framedExtentKey = key;
        if (preview.gameMapId === 'global') zoomGlobalPreviewInOneLevel();
      }
```

- [ ] **Step 3: Edit `src/renderer/core/uiState.ts`**

The new-game overlay is no longer inside the map pane, so `setMainUIControlsEnabled` skips only the annihilation dialog there. Comments follow, and say "choices" rather than "form".

1. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
 * Expected outcome: Children of the map pane other than those two overlays, and the console, ignore the pointer while
 *   `enabled` is false. The top bar does too, except while the new-game overlay is open: it is the new-game bar then,
 *   and its game menu keeps working. The game menu closes whenever the top bar stops taking the pointer, and its New
 *   game item follows the overlay. While the new-game form is hidden, the main map takes the pointer again so drag and
 *   the wheel still move the preview.
```

Replace them with:

```ts
 * Expected outcome: Children of the map pane other than the annihilation dialog, and the console, ignore the pointer
 *   while `enabled` is false. The top bar does too, except while the new-game overlay is open: it is the new-game bar
 *   then, and its game menu keeps working. The game menu closes whenever the top bar stops taking the pointer, and its
 *   New game item follows the overlay. The new-game overlay sits beside the map pane, not in it, so this never turns
 *   it off. While it is open, the main map takes the pointer again so drag and the wheel move the preview.
```

2. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
      if (id === 'game-over-overlay' || id === 'tactical-annihilation-overlay') continue;
```

Replace it with:

```ts
      if (id === 'tactical-annihilation-overlay') continue;
```

3. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
 *   drawn only when the overlay opens, and that open closes the game menu. The form starts showing only on that open.
 *   A later refresh leaves a hidden form hidden.
```

Replace them with:

```ts
 *   drawn only when the overlay opens, and that open closes the game menu. The choices start showing only on that
 *   open. A later refresh leaves hidden choices hidden.
```

- [ ] **Step 4: Edit `src/renderer/gameplay/newGame.ts`**

A comment only: opening the overlay shows the choices, not "the form".

In `src/renderer/gameplay/newGame.ts`, find this line. It occurs exactly once:

```ts
 *   again, the form starts showing, and the overlay opens. Returns true only when this call removes `hidden` from
```

Replace it with:

```ts
 *   again, the choices start showing, and the overlay opens. Returns true only when this call removes `hidden` from
```

- [ ] **Step 5: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 6: Edit `static/index.html`**

Moves `#game-over-overlay` out of `#canvas-container` to the start of `#app-body`, so the map sits beside it. The overlay becomes the setup panel: a header with the hide-choices button and then the message, the body (`#game-over-dialog`) with today's controls unchanged, and a footer with Start game. Every id stays.

1. In `static/index.html`, find these lines. Together they occur exactly once:

```html
  <!-- #app-body holds the map (#canvas-container) and the console (#sidebar) side by side. -->
  <div id="app-body">
```

Replace them with:

```html
  <!-- #app-body holds the new-game setup panel while it is open, the map (#canvas-container), and the console (#sidebar), side by side. -->
  <div id="app-body">
  <!-- The new-game setup panel: docked at the left, beside the map, while the new-game overlay is open. -->
  <div id="game-over-overlay" class="new-game-panel hidden" aria-live="polite">
    <div class="new-game-panel-header">
      <button type="button" id="new-game-dialog-collapse" class="compact-blue-btn compact-square-btn" aria-expanded="true" aria-controls="game-over-dialog" aria-label="Hide the new game choices" data-control-tooltip="Hide the new game choices and widen the map.">-</button>
      <p id="game-over-message"></p>
    </div>
    <div class="new-game-panel-body" id="game-over-dialog">
      <div class="openrouter-tab-bar game-over-tab-bar" role="tablist">
        <button type="button" id="new-game-tab-global" role="tab" aria-selected="true" aria-controls="new-game-panel-global" data-control-tooltip="Start on the world map and pick a home region for each side.">Global</button>
        <button type="button" id="new-game-tab-regional" role="tab" aria-selected="false" aria-controls="new-game-panel-regional" data-control-tooltip="Start on one region and pick a different side group for each player.">Regional</button>
      </div>
      <div id="new-game-panel-global" class="openrouter-tab-panel active" role="tabpanel" aria-labelledby="new-game-tab-global">
      <div class="game-over-region-row">
        <div class="game-over-region-cell">
          <label for="new-game-human-region-select">Human Player:</label>
          <div class="game-over-region-controls">
            <select id="new-game-human-region-select" data-control-tooltip="Pick your side's home region. The opponent may start in the same region."></select>
            <button type="button" id="new-game-human-region-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize human home region" data-control-tooltip="Pick one of the listed regions at random for your side, including the region already shown.">↻</button>
          </div>
        </div>
        <div class="game-over-region-cell">
          <label for="new-game-ai-region-select">AI Player:</label>
          <div class="game-over-region-controls">
            <select id="new-game-ai-region-select" data-control-tooltip="Pick the opponent's home region. It may be the same as yours."></select>
            <button type="button" id="new-game-ai-region-randomize" class="compact-blue-btn compact-square-btn compact-opponent-btn game-over-region-randomize" aria-label="Randomize AI home region" data-control-tooltip="Pick one of the listed regions at random for the opponent, including the region already shown.">↻</button>
          </div>
        </div>
      </div>
      </div>
      <div id="new-game-panel-regional" class="openrouter-tab-panel" role="tabpanel" aria-labelledby="new-game-tab-regional" hidden>
        <div class="game-over-regional-region">
          <div class="game-over-region-cell">
            <label for="new-game-region-select">Region:</label>
            <div class="game-over-region-controls">
              <select id="new-game-region-select" data-control-tooltip="Pick the region both sides fight over. Changing it draws two different sides again."></select>
              <button type="button" id="new-game-region-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize region" data-control-tooltip="Pick one of the listed regions at random, including the region already shown.">↻</button>
            </div>
          </div>
        </div>
        <div class="game-over-region-row">
          <div class="game-over-region-cell">
            <label for="new-game-human-side-select">Human Player:</label>
            <div class="game-over-region-controls">
              <select id="new-game-human-side-select" data-control-tooltip="Pick your side. It stays different from the opponent's side."></select>
              <button type="button" id="new-game-human-side-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize human side" data-control-tooltip="Pick one of the other sides at random for your side.">↻</button>
            </div>
          </div>
          <div class="game-over-region-cell">
            <label for="new-game-ai-side-select">AI Player:</label>
            <div class="game-over-region-controls">
              <select id="new-game-ai-side-select" data-control-tooltip="Pick the opponent's side. It stays different from yours."></select>
              <button type="button" id="new-game-ai-side-randomize" class="compact-blue-btn compact-square-btn compact-opponent-btn game-over-region-randomize" aria-label="Randomize AI side" data-control-tooltip="Pick one of the other sides at random for the opponent.">↻</button>
            </div>
          </div>
        </div>
      </div>
      <div class="game-over-size-row">
        <label for="new-game-size-select">Game size:
          <select id="new-game-size-select" data-control-tooltip="Set how many units each side may field. Small is the baseline, Medium doubles it, and Large triples it, without changing the map or the starting forces.">
            <option value="small" selected>Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
      </div>
      <p id="new-game-advanced-tech" class="game-over-advanced-tech"></p>
      <div class="game-over-size-caps" aria-live="polite">
        <div class="game-over-size-cap">
          <div class="game-over-size-token">
            <img src="units/infantry.svg" alt="" />
            <span id="new-game-size-cap-infantry" class="game-over-size-badge">12</span>
          </div>
          <div class="game-over-size-name">Infantry <span id="new-game-cost-infantry">($20)</span></div>
        </div>
        <div class="game-over-size-cap">
          <div class="game-over-size-token">
            <img src="units/armor.svg" alt="" />
            <span id="new-game-size-cap-armor" class="game-over-size-badge">8</span>
          </div>
          <div class="game-over-size-name">Armor <span id="new-game-cost-armor">($40)</span></div>
        </div>
        <div class="game-over-size-cap">
          <div class="game-over-size-token">
            <img src="units/naval.svg" alt="" />
            <span id="new-game-size-cap-naval" class="game-over-size-badge">8</span>
          </div>
          <div class="game-over-size-name">Naval <span id="new-game-cost-naval">($100)</span></div>
        </div>
        <div class="game-over-size-cap">
          <div class="game-over-size-token">
            <img src="units/air.svg" alt="" />
            <span id="new-game-size-cap-air" class="game-over-size-badge">6</span>
          </div>
          <div class="game-over-size-name">Air <span id="new-game-cost-air">($60)</span></div>
        </div>
      </div>
      <div class="game-over-options">
        <div class="game-over-options-line">
          <label for="new-game-origin-bonus-select">Origin bonus:
            <select id="new-game-origin-bonus-select" data-control-tooltip="Low adds 2 and High adds 4 when a unit fights in the area where it was built: a country in a global game, and the origin area in a regional game.">
              <option value="off">Off</option>
              <option value="low" selected>Low</option>
              <option value="high">High</option>
            </select>
          </label>
          <span class="game-over-options-separator" aria-hidden="true">/</span>
          <label for="new-game-tech-bonus-select">Tech bonus:
            <select id="new-game-tech-bonus-select" data-control-tooltip="Choose Off, Low, or High. Advanced units gain 2 attack at either level, High also adds 2 defense, and Basic units gain nothing.">
              <option value="off">Off</option>
              <option value="low" selected>Low</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <div class="game-over-options-line">
          <label for="new-game-terrain-bonus-select">Terrain bonus:
            <select id="new-game-terrain-bonus-select" data-control-tooltip="In a battle, Low adds 2 and High adds 4 when a unit fights on the terrain where it was built. Off adds nothing, and a unit that also gets the origin bonus receives only the larger of the two.">
              <option value="off">Off</option>
              <option value="low" selected>Low</option>
              <option value="high">High</option>
            </select>
          </label>
          <span class="game-over-options-separator" aria-hidden="true">/</span>
          <label for="new-game-weather-bonus-select">Weather bonus:
            <select id="new-game-weather-bonus-select" data-control-tooltip="Choose Off to ignore weather. Low and High slow movement and cut some attacks for units that lack that weather, and High is the harsher penalty.">
              <option value="off">Off</option>
              <option value="low" selected>Low</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
      </div>
      <div class="game-over-start-month">
        <label for="new-game-fog-checkbox"><input type="checkbox" id="new-game-fog-checkbox" checked data-control-tooltip="Leave this checked to hide places and enemy units you have not seen. Uncheck it to show the whole map for the next match." /> Fog of war</label>
        <span aria-hidden="true">/</span>
        <label for="new-game-start-month">Starting month:</label>
        <div class="game-over-region-controls">
          <select id="new-game-start-month" data-control-tooltip="Pick the month the match starts in. A global turn is one month. A regional turn is one week, starting on the 1st. Weather changes when the date enters a new month, and a battle stays on the date that is current.">
            <option value="1" selected>January</option>
            <option value="2">February</option>
            <option value="3">March</option>
            <option value="4">April</option>
            <option value="5">May</option>
            <option value="6">June</option>
            <option value="7">July</option>
            <option value="8">August</option>
            <option value="9">September</option>
            <option value="10">October</option>
            <option value="11">November</option>
            <option value="12">December</option>
          </select>
          <button type="button" id="new-game-start-month-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize starting month" data-control-tooltip="Pick a month at random, including the month already shown.">↻</button>
        </div>
      </div>
    </div>
    <div class="new-game-panel-footer">
      <button type="button" id="new-game-btn" data-control-tooltip="Start the match with the choices on this screen. If the start fails, the screen stays open.">Start game</button>
    </div>
  </div>
```

2. In `static/index.html`, delete these lines, including the line break at the end. Together they occur exactly once:

```html
    </div>
    <div id="game-over-overlay" class="game-over-overlay hidden" aria-live="polite">
      <button type="button" id="new-game-dialog-collapse" class="compact-blue-btn compact-square-btn" aria-expanded="true" aria-controls="game-over-dialog" aria-label="Hide the new game choices" data-control-tooltip="Hide the new game choices. The map stays up.">-</button>
      <div class="game-over-box" id="game-over-dialog">
        <p id="game-over-message"></p>
        <div class="openrouter-tab-bar game-over-tab-bar" role="tablist">
          <button type="button" id="new-game-tab-global" role="tab" aria-selected="true" aria-controls="new-game-panel-global" data-control-tooltip="Start on the world map and pick a home region for each side.">Global</button>
          <button type="button" id="new-game-tab-regional" role="tab" aria-selected="false" aria-controls="new-game-panel-regional" data-control-tooltip="Start on one region and pick a different side group for each player.">Regional</button>
        </div>
        <div id="new-game-panel-global" class="openrouter-tab-panel active" role="tabpanel" aria-labelledby="new-game-tab-global">
        <div class="game-over-region-row">
          <div class="game-over-region-cell">
            <label for="new-game-human-region-select">Human Player:</label>
            <div class="game-over-region-controls">
              <select id="new-game-human-region-select" data-control-tooltip="Pick your side's home region. The opponent may start in the same region."></select>
              <button type="button" id="new-game-human-region-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize human home region" data-control-tooltip="Pick one of the listed regions at random for your side, including the region already shown.">↻</button>
            </div>
          </div>
          <div class="game-over-region-cell">
            <label for="new-game-ai-region-select">AI Player:</label>
            <div class="game-over-region-controls">
              <select id="new-game-ai-region-select" data-control-tooltip="Pick the opponent's home region. It may be the same as yours."></select>
              <button type="button" id="new-game-ai-region-randomize" class="compact-blue-btn compact-square-btn compact-opponent-btn game-over-region-randomize" aria-label="Randomize AI home region" data-control-tooltip="Pick one of the listed regions at random for the opponent, including the region already shown.">↻</button>
            </div>
          </div>
        </div>
        </div>
        <div id="new-game-panel-regional" class="openrouter-tab-panel" role="tabpanel" aria-labelledby="new-game-tab-regional" hidden>
          <div class="game-over-regional-region">
            <div class="game-over-region-cell">
              <label for="new-game-region-select">Region:</label>
              <div class="game-over-region-controls">
                <select id="new-game-region-select" data-control-tooltip="Pick the region both sides fight over. Changing it draws two different sides again."></select>
                <button type="button" id="new-game-region-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize region" data-control-tooltip="Pick one of the listed regions at random, including the region already shown.">↻</button>
              </div>
            </div>
          </div>
          <div class="game-over-region-row">
            <div class="game-over-region-cell">
              <label for="new-game-human-side-select">Human Player:</label>
              <div class="game-over-region-controls">
                <select id="new-game-human-side-select" data-control-tooltip="Pick your side. It stays different from the opponent's side."></select>
                <button type="button" id="new-game-human-side-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize human side" data-control-tooltip="Pick one of the other sides at random for your side.">↻</button>
              </div>
            </div>
            <div class="game-over-region-cell">
              <label for="new-game-ai-side-select">AI Player:</label>
              <div class="game-over-region-controls">
                <select id="new-game-ai-side-select" data-control-tooltip="Pick the opponent's side. It stays different from yours."></select>
                <button type="button" id="new-game-ai-side-randomize" class="compact-blue-btn compact-square-btn compact-opponent-btn game-over-region-randomize" aria-label="Randomize AI side" data-control-tooltip="Pick one of the other sides at random for the opponent.">↻</button>
              </div>
            </div>
          </div>
        </div>
        <div class="game-over-size-row">
          <label for="new-game-size-select">Game size:
            <select id="new-game-size-select" data-control-tooltip="Set how many units each side may field. Small is the baseline, Medium doubles it, and Large triples it, without changing the map or the starting forces.">
              <option value="small" selected>Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
        </div>
        <p id="new-game-advanced-tech" class="game-over-advanced-tech"></p>
        <div class="game-over-size-caps" aria-live="polite">
          <div class="game-over-size-cap">
            <div class="game-over-size-token">
              <img src="units/infantry.svg" alt="" />
              <span id="new-game-size-cap-infantry" class="game-over-size-badge">12</span>
            </div>
            <div class="game-over-size-name">Infantry <span id="new-game-cost-infantry">($20)</span></div>
          </div>
          <div class="game-over-size-cap">
            <div class="game-over-size-token">
              <img src="units/armor.svg" alt="" />
              <span id="new-game-size-cap-armor" class="game-over-size-badge">8</span>
            </div>
            <div class="game-over-size-name">Armor <span id="new-game-cost-armor">($40)</span></div>
          </div>
          <div class="game-over-size-cap">
            <div class="game-over-size-token">
              <img src="units/naval.svg" alt="" />
              <span id="new-game-size-cap-naval" class="game-over-size-badge">8</span>
            </div>
            <div class="game-over-size-name">Naval <span id="new-game-cost-naval">($100)</span></div>
          </div>
          <div class="game-over-size-cap">
            <div class="game-over-size-token">
              <img src="units/air.svg" alt="" />
              <span id="new-game-size-cap-air" class="game-over-size-badge">6</span>
            </div>
            <div class="game-over-size-name">Air <span id="new-game-cost-air">($60)</span></div>
          </div>
        </div>
        <div class="game-over-options">
          <div class="game-over-options-line">
            <label for="new-game-origin-bonus-select">Origin bonus:
              <select id="new-game-origin-bonus-select" data-control-tooltip="Low adds 2 and High adds 4 when a unit fights in the area where it was built: a country in a global game, and the origin area in a regional game.">
                <option value="off">Off</option>
                <option value="low" selected>Low</option>
                <option value="high">High</option>
              </select>
            </label>
            <span class="game-over-options-separator" aria-hidden="true">/</span>
            <label for="new-game-tech-bonus-select">Tech bonus:
              <select id="new-game-tech-bonus-select" data-control-tooltip="Choose Off, Low, or High. Advanced units gain 2 attack at either level, High also adds 2 defense, and Basic units gain nothing.">
                <option value="off">Off</option>
                <option value="low" selected>Low</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <div class="game-over-options-line">
            <label for="new-game-terrain-bonus-select">Terrain bonus:
              <select id="new-game-terrain-bonus-select" data-control-tooltip="In a battle, Low adds 2 and High adds 4 when a unit fights on the terrain where it was built. Off adds nothing, and a unit that also gets the origin bonus receives only the larger of the two.">
                <option value="off">Off</option>
                <option value="low" selected>Low</option>
                <option value="high">High</option>
              </select>
            </label>
            <span class="game-over-options-separator" aria-hidden="true">/</span>
            <label for="new-game-weather-bonus-select">Weather bonus:
              <select id="new-game-weather-bonus-select" data-control-tooltip="Choose Off to ignore weather. Low and High slow movement and cut some attacks for units that lack that weather, and High is the harsher penalty.">
                <option value="off">Off</option>
                <option value="low" selected>Low</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        </div>
        <div class="game-over-start-month">
          <label for="new-game-fog-checkbox"><input type="checkbox" id="new-game-fog-checkbox" checked data-control-tooltip="Leave this checked to hide places and enemy units you have not seen. Uncheck it to show the whole map for the next match." /> Fog of war</label>
          <span aria-hidden="true">/</span>
          <label for="new-game-start-month">Starting month:</label>
          <div class="game-over-region-controls">
            <select id="new-game-start-month" data-control-tooltip="Pick the month the match starts in. A global turn is one month. A regional turn is one week, starting on the 1st. Weather changes when the date enters a new month, and a battle stays on the date that is current.">
              <option value="1" selected>January</option>
              <option value="2">February</option>
              <option value="3">March</option>
              <option value="4">April</option>
              <option value="5">May</option>
              <option value="6">June</option>
              <option value="7">July</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
            <button type="button" id="new-game-start-month-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize starting month" data-control-tooltip="Pick a month at random, including the month already shown.">↻</button>
          </div>
        </div>
        <button type="button" id="new-game-btn" data-control-tooltip="Start the match with the choices on this screen. If the start fails, the screen stays open.">Start game</button>
      </div>
```

- [ ] **Step 7: Replace `static/newGameChrome.css`**

Adds the setup panel after the new-game bar: the docked column, the header, the scrolling body, the footer, and the hidden-choices state, then today's rules for the controls inside, moved here from `feedbackChrome.css`. The one change inside is that the two sides wrap onto two lines in the narrower panel. The opening comment now covers both parts.

Replace the whole file `static/newGameChrome.css` with exactly this content:

```css
/* The new-game screen. While the new-game overlay is open, the top bar becomes the new-game bar, and the setup panel is
   docked at the left of the window, under the top bar, with the map preview beside it. The panel's header holds the
   hide-choices button and the message, the body scrolls, and the footer holds Start game. Hiding the choices leaves only
   that button, in the same spot over the map's top-left corner, and the map widens under it. */

/* ---------- New-game bar ---------- */
/* While the new-game overlay is open, the bar shows only the menu button, the title "New game", Load game…, Settings,
   and Help. The overlay's `hidden` class switches it, so the bar follows the overlay however it opens or closes,
   including from a battle. */
body:not(:has(#game-over-overlay:not(.hidden))) #app-topbar .new-game-only,
body:has(#game-over-overlay:not(.hidden)) #app-topbar .topbar-sides,
body:has(#game-over-overlay:not(.hidden)) #app-topbar .topbar-stat,
body:has(#game-over-overlay:not(.hidden)) #app-topbar .topbar-date-block,
body:has(#game-over-overlay:not(.hidden)) #app-topbar .battle-header-only {
  display: none;
}
body:has(#game-over-overlay:not(.hidden)) #app-topbar .topbar-spacer {
  display: block;
}
body:has(#game-over-overlay:not(.hidden)) #app-topbar.topbar-battle {
  background: var(--chrome-bg-deep);
  border-bottom-color: var(--chrome-border);
}
.topbar-new-game-title {
  display: flex;
  align-items: center;
  flex: none;
  padding: 0 16px;
  font-size: 15px;
  font-weight: 600;
}
/* Load game…, a disabled placeholder that names itself beside its icon. */
.topbar-text-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 16px;
  border: 0;
  border-left: 1px solid var(--chrome-divider);
  border-radius: 0;
  background: transparent;
  color: var(--chrome-text);
  font-size: 13px;
  font-weight: 500;
}
/* Keeps the divider: the shared disabled-button rule would recolor it. */
.topbar-text-btn:disabled {
  background: transparent;
  color: var(--chrome-disabled);
  border-color: var(--chrome-divider);
}

/* ---------- Panel ---------- */
.new-game-panel {
  position: relative;
  z-index: 7002;
  flex: none;
  width: var(--new-game-panel-width);
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  color-scheme: dark;
  border-right: 1px solid var(--chrome-border);
  box-shadow: 4px 0 12px rgba(8, 14, 22, 0.35);
}
.new-game-panel.hidden {
  display: none;
}
.new-game-panel-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--chrome-border);
}
#game-over-message {
  min-width: 0;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
/* The square matches a randomize button (`--new-game-collapse-size`). It keeps the pointer while the choices are
   hidden and the rest of the panel does not. */
#new-game-dialog-collapse {
  flex: none;
  width: var(--new-game-collapse-size, 1.75rem);
  height: var(--new-game-collapse-size, 1.75rem);
  min-width: 0;
  margin-left: 0;
  padding: 0;
  box-sizing: border-box;
  pointer-events: auto;
}
.new-game-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 16px 18px;
  text-align: center;
}
.new-game-panel-body button {
  padding: 0.5rem 1rem;
  font-size: 14px;
}
.new-game-panel-footer {
  flex: none;
  padding: 12px 18px;
  border-top: 1px solid var(--chrome-border);
}
#new-game-btn {
  width: 100%;
  height: 42px;
  font-size: 14px;
  font-weight: 600;
}

/* ---------- Hidden choices ---------- */
/* Only the hide-choices button stays. The panel leaves the row, so the map widens to the window's left edge, and the
   header keeps its padding, so the button does not move. #app-body is the containing block. */
.new-game-panel.game-over-dialog-collapsed {
  position: absolute;
  top: 0;
  left: 0;
  width: auto;
  height: auto;
  background: transparent;
  border: 0;
  box-shadow: none;
  pointer-events: none;
}
.new-game-panel.game-over-dialog-collapsed .new-game-panel-header {
  border-bottom: 0;
}
.new-game-panel.game-over-dialog-collapsed #game-over-message,
.new-game-panel.game-over-dialog-collapsed .new-game-panel-body,
.new-game-panel.game-over-dialog-collapsed .new-game-panel-footer {
  display: none;
}

/* ---------- Choices ---------- */
/* Two lines: Country with Tech, then Terrain with Weather. Each line keeps the slash gap. */
.game-over-options {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.9rem 0;
  font-size: 0.95rem;
  color: var(--chrome-text);
}
.game-over-options-line {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
/* Bonus labels and the Game size label. Change the gap here so those dropdowns stay aligned with each other. */
.game-over-options label,
.game-over-size-row label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.game-over-start-month {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0 0 0.9rem 0;
  font-size: 0.95rem;
  color: var(--chrome-text);
}
/* The two sides wrap onto two lines when the panel is too narrow for them side by side. */
.game-over-region-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: 0.7rem 0.9rem;
  margin: 0 0 0.7rem 0;
}
/* Centers the Game size label and dropdown. The gap lives on the shared label rule above. */
.game-over-size-row {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 0 0.2rem 0;
}
.game-over-region-cell {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  text-align: left;
}
.game-over-region-cell label,
.game-over-size-row label {
  font-size: 0.88rem;
  color: var(--chrome-text);
  font-weight: 600;
}
/* Select column shares one closed width. The randomize button sits in the next column at the same height. */
.game-over-region-controls {
  display: grid;
  width: max-content;
  grid-template-columns: auto auto;
  align-items: stretch;
  column-gap: 0.3rem;
}
.new-game-panel-body select {
  font-size: 12px;
  padding: 0.16rem 0.28rem;
}
/* Longest option, not the selected one, so Medium still fits while Small is selected. Regular weight so the bold label does not inherit onto the control and change that width. */
.game-over-size-row select {
  width: max-content;
  flex-shrink: 0;
  font-weight: 400;
}
/* One closed width for home-region, region, and side selectors. The variable is the widest region option, so a short selection does not shrink a control and a long side name does not widen one. */
.game-over-region-controls select {
  box-sizing: border-box;
  width: var(--new-game-region-select-width, max-content);
  min-width: var(--new-game-region-select-width, max-content);
  max-width: var(--new-game-region-select-width, none);
}
/* Size to the longest month. Overrides the shared region width so a long region name does not widen this control and a short region list does not clip a month name. */
.game-over-start-month .game-over-region-controls select {
  width: max-content;
  min-width: max-content;
  max-width: none;
}
/* Matches the dropdown beside it. The fixed square size on `.compact-square-btn` is for other buttons. */
.new-game-panel-body .compact-square-btn.game-over-region-randomize {
  align-self: stretch;
  justify-self: center;
  width: auto;
  min-width: 0;
  height: auto;
  margin-left: 0;
  aspect-ratio: 1;
  padding: 0;
  line-height: 1;
  font-size: 11px;
  font-weight: 700;
}
.game-over-size-caps {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 1.1rem;
  margin: 0 0 0.9rem 0;
}
.game-over-size-cap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.28rem;
}
.game-over-size-token {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #b0b0b0;
  border: 2px solid #222;
  box-sizing: content-box;
  display: flex;
  align-items: center;
  justify-content: center;
}
.game-over-size-token img {
  width: 32px;
  height: 32px;
  pointer-events: none;
  filter: brightness(0.133);
}
.game-over-size-badge {
  position: absolute;
  left: calc(50% + 16px);
  top: calc(50% - 16px);
  transform: translate(-50%, -50%);
  font: bold 13px system-ui, sans-serif;
  color: #000;
  -webkit-text-stroke: 2px #fff;
  paint-order: stroke fill;
  pointer-events: none;
}
.game-over-size-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--chrome-text);
  white-space: nowrap;
}
.game-over-tab-bar {
  margin: 0 0 0.75rem 0;
}
.game-over-regional-region {
  display: flex;
  justify-content: center;
  margin: 0 0 0.75rem 0;
}
.new-game-panel-body p.game-over-advanced-tech {
  text-align: center;
  margin: 0 0 0.55rem 0;
  font-size: 0.78rem;
  font-weight: 600;
}
.new-game-panel-body p.game-over-advanced-tech:empty {
  display: none;
  margin: 0;
}
```

- [ ] **Step 8: Replace `static/feedbackChrome.css`**

Removes the new-game rules, which the previous step moved. What stays is the toasts and the battle-result dialog that shares `.game-over-overlay` and `.game-over-box`.

Replace the whole file `static/feedbackChrome.css` with exactly this content:

```css
/* Toasts, and the dialog that reports a battle's result. */
/* The two toasts stack in one band at the top centre of the map, between the minimap panel (or the legend beside it) and the zoom buttons. mapChromeLayout.ts sets left and right; on a narrow map the band spans the top of the map. The band is only as wide as its widest toast, so it does not block the map beside them. */
.map-toast-band {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 7000;
  width: fit-content;
  max-width: 560px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.map-toast {
  max-height: 40vh;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  color-scheme: dark;
  border: 1px solid var(--chrome-error);
  border-radius: 2px;
  font-size: 12px;
  opacity: 1;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.map-toast.toast-info {
  border-color: var(--chrome-border);
}
.map-toast.hidden { display: none; }
.game-over-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 7002;
}
.game-over-overlay.hidden { display: none; }
/* Stacks above tactical HUD (6600) for annihilation results. */
.tactical-annihilation-overlay.game-over-overlay {
  z-index: 7010;
}
.game-over-box {
  background: var(--chrome-bg);
  color: var(--chrome-text);
  color-scheme: dark;
  padding: 1.5rem 2rem;
  border-radius: 4px;
  border: 1px solid var(--chrome-border);
  text-align: center;
}
.game-over-box p { margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; }
.game-over-box button { padding: 0.5rem 1rem; font-size: 14px; }
.map-toast p { margin: 0; flex: 1; white-space: pre-line; }
#map-toast-dismiss {
  flex-shrink: 0;
  padding: 0.1rem 0.35rem;
  font-size: 1.1rem;
  line-height: 1;
}
#ai-strategy-toast-dismiss {
  flex-shrink: 0;
  padding: 0.1rem 0.35rem;
  font-size: 1.1rem;
  line-height: 1;
}
```

- [ ] **Step 9: Edit `static/shellChrome.css`**

Adds the panel's width token. The rules that hide the minimap panel, the legend, and the zoom buttons during the overlay now look for it anywhere in the page, since it is no longer inside the map pane. One comment says "choices" rather than "form".

1. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  --minimap-width: 280px;
```

Replace it with:

```css
  --minimap-width: 280px;
  /* The new-game setup panel's width, docked at the left of the window while the new-game overlay is open. */
  --new-game-panel-width: 432px;
```

2. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
#canvas-container:has(#game-over-overlay:not(.hidden)) #minimap-panel,
#canvas-container:has(#game-over-overlay:not(.hidden)) #terrain-legend {
  visibility: hidden;
}
/* Hidden for the whole time the start dialog is open, including while its form is collapsed. Not removed, so it shows again when that dialog closes. The battle-result dialog does not use this overlay. */
#canvas-container:has(#game-over-overlay:not(.hidden)) #main-map .leaflet-control-zoom {
```

Replace them with:

```css
body:has(#game-over-overlay:not(.hidden)) #minimap-panel,
body:has(#game-over-overlay:not(.hidden)) #terrain-legend {
  visibility: hidden;
}
/* Hidden for the whole time the start dialog is open, including while its choices are hidden. Not removed, so it shows again when that dialog closes. The battle-result dialog does not use this overlay. */
body:has(#game-over-overlay:not(.hidden)) #main-map .leaflet-control-zoom {
```

- [ ] **Step 10: Edit `static/selectionChrome.css`**

The rule that hides the selection panel during the overlay looks for it anywhere in the page.

In `static/selectionChrome.css`, find this line. It occurs exactly once:

```css
#canvas-container:has(#game-over-overlay:not(.hidden)) #selection-panel {
```

Replace it with:

```css
body:has(#game-over-overlay:not(.hidden)) #selection-panel {
```

- [ ] **Step 11: Edit `static/frameChrome.css`**

`#app-body` becomes the containing block for the hide-choices button while the choices are hidden.

In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
/* ---------- Map and console row ---------- */
#app-body {
```

Replace them with:

```css
/* ---------- Map and console row ---------- */
/* The containing block for the new-game panel's hide-choices button while the choices are hidden. */
#app-body {
  position: relative;
```

- [ ] **Step 12: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the scene with the choices hidden, and the game-over screen at the 800 × 600 minimum.

1. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  newGameMenu: 'new-game-menu',
```

Replace it with:

```js
  newGameMenu: 'new-game-menu',
  newGameHidden: 'new-game-hidden',
```

2. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  gameOverReopened: 'game-over-reopened',
```

Replace it with:

```js
  gameOverReopened: 'game-over-reopened',
  gameOverSmallWindow: 'game-over-small-window',
```

3. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
 * Expected outcome: The first scene, the game menu opened on it, the overlay opened from a match, and the finished
 *   match reopened.
```

Replace them with:

```js
 * Expected outcome: The first scene, the game menu opened on it, the choices hidden, the overlay opened from a match,
 *   and the finished match reopened, then at the 800 x 600 minimum.
```

4. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
  SCENES.newGameReopened,
  SCENES.gameOverReopened,
```

Replace them with:

```js
  SCENES.newGameHidden,
  SCENES.newGameReopened,
  SCENES.gameOverReopened,
  SCENES.gameOverSmallWindow,
```

- [ ] **Step 13: Edit `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`**

The panel checks: the panel docked at the left with the map beside it, the header, the footer, and no sideways overflow; the hidden-choices state with the map widened and the button in the same spot; and the map taking the pointer.

1. In `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, find this line. It occurs exactly once:

```js
 * there, and where the map sits.
```

Replace it with:

```js
 * there, the setup panel docked at the left, and the map beside it.
```

2. In `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, find this line. It occurs exactly once:

```js
const { TOPBAR_HEIGHT, SCENES, NEW_GAME_SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');
```

Replace it with:

```js
const { TOPBAR_HEIGHT, SCENES, NEW_GAME_SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');

/**
 * Sizes of the setup panel, in CSS pixels.
 *
 * Purpose: The panel is docked at the left, the hide-choices button sits 12 px in from the panel's top-left corner,
 *   and Start game spans the footer inside its 18 px padding.
 * When to use: The panel and hidden-choices checks.
 * Expected outcome: Matches `--new-game-panel-width` in `static/shellChrome.css` and the padding in
 *   `static/newGameChrome.css`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({ width: 432, headerInset: 12, footerInset: 18 });

/**
 * The new-game scenes that show the setup panel: every new-game scene except the one with the choices hidden.
 *
 * Purpose: The panel's layout checks apply only while the panel shows.
 * When to use: The `scenes` list of a panel layout check.
 * Expected outcome: Derived from `NEW_GAME_SCENES`.
 * Exceptions: None.
 */
const PANEL_SCENES = Object.freeze(NEW_GAME_SCENES.filter((scene) => scene !== SCENES.newGameHidden));
```

3. In `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, find these lines. Together they occur exactly once:

```js
    name: 'new-game-map-under-top-bar',
    scenes: NEW_GAME_SCENES,
    needs: ['#canvas-container', '#game-over-overlay'],
    run: (p, el) => {
      const c = el('#canvas-container');
      if (!el('#game-over-overlay').shown) return 'the new-game overlay is not shown';
      return near(c.x, 0) && near(c.y, TOPBAR_HEIGHT) && near(c.w, p.viewport.w) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should fill the window under the ${TOPBAR_HEIGHT} px top bar`;
    },
```

Replace them with:

```js
    name: 'new-game-panel-beside-map',
    scenes: PANEL_SCENES,
    needs: ['#game-over-overlay', '#canvas-container'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const c = el('#canvas-container');
      if (!panel.shown) return 'the setup panel is not shown';
      if (!near(panel.x, 0) || !near(panel.y, TOPBAR_HEIGHT) || !near(panel.w, PANEL.width) || !near(panel.y + panel.h, p.viewport.h)) {
        return `the setup panel is at ${fmt(panel)}, expected ${PANEL.width} px wide at the left, from the top bar to the window's bottom`;
      }
      return near(c.x, PANEL.width) && near(c.y, TOPBAR_HEIGHT) && near(c.x + c.w, p.viewport.w) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should fill the rest of the window, right of the panel and under the top bar`;
    },
  },
  {
    name: 'new-game-panel-layout',
    scenes: PANEL_SCENES,
    needs: ['#game-over-overlay', '#new-game-dialog-collapse', '#game-over-message', '#game-over-dialog', '#new-game-btn'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const collapse = el('#new-game-dialog-collapse');
      const message = el('#game-over-message');
      const body = el('#game-over-dialog');
      const start = el('#new-game-btn');
      if (!near(collapse.x, panel.x + PANEL.headerInset) || !near(collapse.y, panel.y + PANEL.headerInset)) {
        return `the hide-choices button is at ${fmt(collapse)}, expected ${PANEL.headerInset} px in from the panel's top-left corner`;
      }
      if (collapse.expanded !== 'true') return `the hide-choices button reads aria-expanded=${collapse.expanded}`;
      if (!message.shown || message.x < collapse.x + collapse.w) return `the message ${fmt(message)} is not right of the hide-choices button`;
      if (!start.shown || !near(start.x, panel.x + PANEL.footerInset) || !near(start.x + start.w, panel.x + panel.w - 1 - PANEL.footerInset)) {
        return `Start game is at ${fmt(start)}, expected the footer's width inside ${PANEL.footerInset} px of padding`;
      }
      if (start.y + start.h > p.viewport.h || start.y + start.h < p.viewport.h - 2 * PANEL.footerInset) {
        return `Start game is at ${fmt(start)}, expected at the bottom of the window`;
      }
      if (body.y < collapse.y + collapse.h || body.y + body.h > start.y) return `the choices ${fmt(body)} are not between the header and the footer`;
      return body.scrollWidth <= body.clientWidth + 1 ? null : `the choices are ${body.scrollWidth} px wide in a ${body.clientWidth} px panel`;
    },
  },
  {
    name: 'new-game-choices-hidden',
    scenes: [SCENES.newGameHidden],
    needs: ['#game-over-overlay', '#canvas-container', '#new-game-dialog-collapse', '#game-over-message', '#game-over-dialog', '#new-game-btn'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const collapse = el('#new-game-dialog-collapse');
      if (!near(c.x, 0) || !near(c.y, TOPBAR_HEIGHT) || !near(c.w, p.viewport.w)) {
        return `#canvas-container ${fmt(c)} should fill the window's width under the top bar while the choices are hidden`;
      }
      if (!collapse.shown || !near(collapse.x, PANEL.headerInset) || !near(collapse.y, TOPBAR_HEIGHT + PANEL.headerInset)) {
        return `the hide-choices button is at ${fmt(collapse)}, expected where it sits while the choices show`;
      }
      if (collapse.expanded !== 'false') return `the hide-choices button reads aria-expanded=${collapse.expanded}`;
      const shown = ['#game-over-message', '#game-over-dialog', '#new-game-btn'].filter((selector) => el(selector).shown);
      return shown.length === 0 ? null : `still shown with the choices hidden: ${shown.join(', ')}`;
    },
  },
  {
    name: 'new-game-map-takes-pointer',
    scenes: NEW_GAME_SCENES,
    needs: ['#main-map'],
    run: (p, el) => (el('#main-map').pointerEvents === 'none' ? 'the preview map ignores the pointer on the new-game screen' : null),
```

- [ ] **Step 14: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Hides the choices on the startup screen and records it, then shows them again. Records the game-over screen at the 800 × 600 minimum too.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await page.waitForTimeout(SETTLE_MS.click);

  await startScenarioMatch(page);
```

Replace them with:

```js
  await page.waitForTimeout(SETTLE_MS.click);
  // Hiding the choices widens the map under the hide-choices button. Show them again before starting the match.
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameHidden);
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);

  await startScenarioMatch(page);
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * Purpose: A finished match must open on the game-over screen, with the match's chrome out of the way.
 * When to use: After `runReopenedSession` and `FINISHED_MATCH_EDIT`, on the same folder.
 * Expected outcome: One recorded scene.
```

Replace them with:

```js
 * Purpose: A finished match must open on the game-over screen, with the match's chrome out of the way, and the setup
 *   panel must still fit the 800 x 600 minimum.
 * When to use: After `runReopenedSession` and `FINISHED_MATCH_EDIT`, on the same folder.
 * Expected outcome: Two recorded scenes: the game-over screen, then the same screen at the minimum window.
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  await recordScene(page, report, outDir, SCENES.gameOverReopened);
```

Replace it with:

```js
  await recordScene(page, report, outDir, SCENES.gameOverReopened);
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.gameOverSmallWindow);
```

- [ ] **Step 15: Edit `doc/ux/new-game-dialog.md`**

Describes the docked panel, the hide-choices button, and the map beside it, not behind it. Hiding the choices keeps the map's centre and zoom.

1. In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
The right panel and the selection panel are not on screen while it is open, including while the form is hidden. The top bar is the new-game bar ([top-bar.md](top-bar.md)), and the map fills the window under it. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview.
````

Replace it with:

````markdown
The right panel and the selection panel are not on screen while it is open, including while the choices are hidden. The top bar is the new-game bar ([top-bar.md](top-bar.md)). The setup panel is docked at the left, under the top bar, and the map fills the rest of the window beside it. Drag and the wheel pan and zoom the preview, with the choices showing or hidden.
````

2. In `doc/ux/new-game-dialog.md`, find these lines. Together they occur exactly once:

````markdown
- A square button in the dialog's upper-left corner, the same size as a randomize button. While the form is showing it displays a dash, the same mark as a remove-select button. While the form is hidden it displays a plus, the same mark as an add-select button, and it is the only part of the dialog still on screen. Whenever the overlay opens, the form is showing.
- Control tips for these choices and those buttons are in [control-tooltips.md](control-tooltips.md).
- The map behind the overlay shows the selected tab's preview. Global frames the Mercator world one zoom level closer than that world fit. Regional frames the selected region, including sea and neutral-border hexes. Global draws the selected home regions with the same terrain fills a started match uses on those hexes, and leaves the rest of the strategic hex grid undrawn until the player holds T. Holding T draws that grid, with those same fills and strokes. A regional preview always draws its strategic hex grid, with those same fills and strokes. The human and AI home areas are highlighted with the same rings a match in progress uses: an exclusive home uses that player's color for both rings, and a shared or identical home uses the gray overlap rings. Weather icons sit on the same band as in a match, on every strategic hex of the preview, and follow the selected starting month while Weather bonus is Low or High. Low and High use the same glyph. Off hides the icons. Holding T hides the weather icons. While T is held and Tech bonus is Low or High, each strategic hex whose original urban count can produce units shows that map's tech icon, Basic or Advanced, on the same band. Low and High use the same glyph. Off hides the tech icons. Battle-detail zoom of that map's strategic hexes hides the weather icons and the tech icons. The preview draws no units, hex codes, production labels, build markers, battle-entry markers, or other match chrome. Fog of war does not hide the preview icons. Basic and Advanced follow that map's Advanced threshold, the same N as the Advanced tech line. Opening the overlay frames the main map to that extent. Changing a home does not move the view. Changing the tab or the regional region does. The overlay has no dark veil. Its upper-left corner is the minimap's usual corner, 12px from the top and left of the map pane. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden until the overlay closes. A short or narrow map pane scrolls the dialog, and the form keeps its size.
````

Replace them with:

````markdown
- The setup panel, `--new-game-panel-width` (432 px) wide, from the top bar to the bottom of the window, on the panel chrome. Its header holds the hide-choices button, then the message. Its body holds the choices and scrolls when the window is too short for them. Its footer holds Start game, or New game, across the panel's width.
- The hide-choices button, a square the same size as a randomize button, 12 px in from the panel's top-left corner. While the choices are showing it displays a dash, the same mark as a remove-select button. While they are hidden it displays a plus, the same mark as an add-select button, and it is the only part of the panel still on screen, in the same spot, over the map's top-left corner. Whenever the overlay opens, the choices are showing.
- Control tips for these choices and those buttons are in [control-tooltips.md](control-tooltips.md).
- The map beside the panel shows the selected tab's preview. Global frames the Mercator world one zoom level closer than that world fit. Regional frames the selected region, including sea and neutral-border hexes. Global draws the selected home regions with the same terrain fills a started match uses on those hexes, and leaves the rest of the strategic hex grid undrawn until the player holds T. Holding T draws that grid, with those same fills and strokes. A regional preview always draws its strategic hex grid, with those same fills and strokes. The human and AI home areas are highlighted with the same rings a match in progress uses: an exclusive home uses that player's color for both rings, and a shared or identical home uses the gray overlap rings. Weather icons sit on the same band as in a match, on every strategic hex of the preview, and follow the selected starting month while Weather bonus is Low or High. Low and High use the same glyph. Off hides the icons. Holding T hides the weather icons. While T is held and Tech bonus is Low or High, each strategic hex whose original urban count can produce units shows that map's tech icon, Basic or Advanced, on the same band. Low and High use the same glyph. Off hides the tech icons. Battle-detail zoom of that map's strategic hexes hides the weather icons and the tech icons. The preview draws no units, hex codes, production labels, build markers, battle-entry markers, or other match chrome. Fog of war does not hide the preview icons. Basic and Advanced follow that map's Advanced threshold, the same N as the Advanced tech line. Opening the overlay frames the main map to that extent. Changing a home does not move the view. Changing the tab or the regional region does. The map is beside the panel, not under it, so the frame centres on the map the player can see. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden until the overlay closes.
````

3. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks the corner button while the form is showing, the form hides and the button shows a plus. If the pane had scrolled the dialog, the button returns to the dialog's upper-left corner. Drag and the wheel then pan and zoom the map behind the overlay, inside the extent already applied. The + and − zoom control stays hidden. A click, double-click, or right-click on that map does not select, order, or change the selection. Hover does not open a hex tooltip or an order preview, and the pointer does not show a unit cursor. Clicking the button again shows the form and the dash, and those pointer gestures no longer reach the map.
````

Replace it with:

````markdown
- When the player drags or turns the wheel over the map beside the panel, the preview pans and zooms, inside the extent already applied. The + and − zoom control stays hidden. A click, double-click, or right-click on that map does not select, order, or change the selection. Hover does not open a hex tooltip or an order preview, and the pointer does not show a unit cursor.
- When the player clicks the hide-choices button while the choices are showing, the panel hides and the button shows a plus, in the same spot. The map widens to the window's left edge and keeps its centre and zoom. Clicking the button again shows the panel and the dash, and the map narrows the same way.
````

4. In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
Changing the starting month or Weather bonus updates the weather icons on the map behind the overlay without reloading the grid.
````

Replace it with:

````markdown
Changing the starting month or Weather bonus updates the weather icons on the map beside the panel without reloading the grid.
````

5. In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
Hiding the form moves focus off a dropdown that had it, so those keys work again. Showing the form does not move focus onto a dropdown.
````

Replace it with:

````markdown
Hiding the choices moves focus off a dropdown that had it, so those keys work again. Showing the choices does not move focus onto a dropdown.
````

6. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- Whenever the overlay opens, the form is showing. A refresh while the overlay stays open leaves a hidden form hidden.
````

Replace it with:

````markdown
- Whenever the overlay opens, the choices are showing. A refresh while the overlay stays open leaves hidden choices hidden.
````

7. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#game-over-overlay`, `#new-game-dialog-collapse`, `#game-over-dialog`, `#game-over-message`, `#new-game-tab-global`, `#new-game-tab-regional`, `#new-game-human-region-select`, `#new-game-human-region-randomize`, `#new-game-ai-region-select`, `#new-game-ai-region-randomize`, `#new-game-region-select`, `#new-game-region-randomize`, `#new-game-human-side-select`, `#new-game-human-side-randomize`, `#new-game-ai-side-select`, `#new-game-ai-side-randomize`, `#new-game-advanced-tech`, `#new-game-cost-infantry`, `#new-game-cost-armor`, `#new-game-cost-naval`, `#new-game-cost-air`, `#new-game-size-select`, `#new-game-size-cap-infantry`, `#new-game-size-cap-armor`, `#new-game-size-cap-naval`, `#new-game-size-cap-air`, `#new-game-fog-checkbox`, `#new-game-country-bonus-select`, `#new-game-terrain-bonus-select`, `#new-game-weather-bonus-select`, `#new-game-tech-bonus-select`, `#new-game-start-month`, `#new-game-start-month-randomize`, `#new-game-btn`)
````

Replace it with:

````markdown
- `static/index.html` (`#game-over-overlay`, `#new-game-dialog-collapse`, `#game-over-dialog`, `#game-over-message`, `#new-game-tab-global`, `#new-game-tab-regional`, `#new-game-human-region-select`, `#new-game-human-region-randomize`, `#new-game-ai-region-select`, `#new-game-ai-region-randomize`, `#new-game-region-select`, `#new-game-region-randomize`, `#new-game-human-side-select`, `#new-game-human-side-randomize`, `#new-game-ai-side-select`, `#new-game-ai-side-randomize`, `#new-game-advanced-tech`, `#new-game-cost-infantry`, `#new-game-cost-armor`, `#new-game-cost-naval`, `#new-game-cost-air`, `#new-game-size-select`, `#new-game-size-cap-infantry`, `#new-game-size-cap-armor`, `#new-game-size-cap-naval`, `#new-game-size-cap-air`, `#new-game-fog-checkbox`, `#new-game-country-bonus-select`, `#new-game-terrain-bonus-select`, `#new-game-weather-bonus-select`, `#new-game-tech-bonus-select`, `#new-game-start-month`, `#new-game-start-month-randomize`, `#new-game-btn`)
- `static/newGameChrome.css`
````

- [ ] **Step 16: Edit `doc/ux/modes-and-transitions.md`**

New game and Game over describe the setup panel and the map beside it.

1. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
The map fills the window under it. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview, and a click, double-click, or right-click does not select, order, or change the selection. Ready is disabled. The map behind the overlay shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md). The dialog sits at the minimap's usual corner, with no dark veil.
````

Replace it with:

````markdown
The setup panel is docked at the left, under the top bar, and the map fills the rest of the window beside it. Drag and the wheel pan and zoom the preview, with the choices showing or hidden, and a click, double-click, or right-click does not select, order, or change the selection. Hiding the choices leaves only the hide-choices button, and the map widens to the window's left edge. Ready is disabled. The map shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md).
````

2. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
The right panel and the selection panel are not on screen, and the top bar is the same new-game bar, so the map fills the window under it. The map follows the same show and hide rules as New game, and Ready is disabled. The map behind the overlay shows the same preview as New game. The dialog, the missing veil, and the hidden minimap panel, legend, and + and − zoom control match New game.
````

Replace it with:

````markdown
The right panel and the selection panel are not on screen, and the top bar is the same new-game bar. The map follows the same show and hide rules as New game, and Ready is disabled. The map shows the same preview as New game. The setup panel, the hide-choices button, and the hidden minimap panel, legend, and + and − zoom control match New game.
````

- [ ] **Step 17: Edit `doc/ux/input-map.md`**

Drag and the wheel reach the preview whenever the new-game overlay is open, and T works "while the overlay is open" rather than "under" it.

1. In `doc/ux/input-map.md`, find this text. It occurs exactly once:

````markdown
- While the new-game overlay is open and its form is showing, drag, wheel, click, double-click, and right-click do not reach the map. While that form is hidden, drag and the wheel pan and zoom the preview.
````

Replace it with:

````markdown
- While the new-game overlay is open, drag and the wheel pan and zoom the preview beside the setup panel, with the choices showing or hidden.
````

2. In `doc/ux/input-map.md`, find this text. It occurs exactly once:

````markdown
While the Tech view is chosen in the [minimap panel](minimap.md), the world map already shows that view, so holding T there changes nothing; in a battle, or under the new-game or game-over overlay, T works as below.
````

Replace it with:

````markdown
While the Tech view is chosen in the [minimap panel](minimap.md), the world map already shows that view, so holding T there changes nothing; in a battle, or while the new-game or game-over overlay is open, T works as below.
````

- [ ] **Step 18: Edit `doc/ux/map-surface.md`**

The same change to pointer input. The map fills the space beside the setup panel, or the full width while the choices are hidden, and the basemap shows beside the panel.

1. In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
In New game and Game over, pointer input on the map is off while the new-game form is showing. While that form is hidden, drag and the wheel pan and zoom the preview, and a click, double-click, or right-click does not select, order, or change the selection. In Tactical annihilation the map is visible, pointer input is off, and pan keys and T still follow [input-map.md](input-map.md). In New game and Game over the map fills the window under the top bar.
````

Replace it with:

````markdown
In New game and Game over, drag and the wheel pan and zoom the preview, with the new-game choices showing or hidden, and a click, double-click, or right-click does not select, order, or change the selection. In Tactical annihilation the map is visible, pointer input is off, and pan keys and T still follow [input-map.md](input-map.md). In New game and Game over the map fills the space under the top bar beside the new-game setup panel, and the full width while the choices are hidden.
````

2. In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
When no match is loaded, the basemap can still be visible under the new-game overlay.
````

Replace it with:

````markdown
When no match is loaded, the basemap can still be visible beside the new-game setup panel.
````

3. In `doc/ux/map-surface.md`, find this line. It occurs exactly once:

````markdown
- When the player uses the wheel, or clicks + or −, the map zooms. Double-click does not zoom. While the new-game overlay is open, drag and the wheel reach the map only while that form is hidden, as in [new-game-dialog.md](new-game-dialog.md).
````

Replace it with:

````markdown
- When the player uses the wheel, or clicks + or −, the map zooms. Double-click does not zoom. While the new-game overlay is open, drag and the wheel still reach the map beside the setup panel, as in [new-game-dialog.md](new-game-dialog.md).
````

4. In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
Pointer input is off, except while the new-game overlay's form is hidden: drag and the wheel then pan and zoom that preview, and a click, double-click, or right-click still does not select, order, or change the selection.
````

Replace it with:

````markdown
Pointer input is off, except while the new-game overlay is open: drag and the wheel then pan and zoom that preview, and a click, double-click, or right-click still does not select, order, or change the selection.
````

- [ ] **Step 19: Edit `doc/ux/top-bar.md`**

Says "choices" instead of "form", as the rest of `doc/` now does.

In `doc/ux/top-bar.md`, find this text. It occurs exactly once:

````markdown
In New game and Game over it is the new-game bar, including while the new-game form is hidden.
````

Replace it with:

````markdown
In New game and Game over it is the new-game bar, including while the new-game choices are hidden.
````

- [ ] **Step 20: Edit `doc/ux/right-panel.md`**

The same wording change, in two places.

1. In `doc/ux/right-panel.md`, find this text. It occurs exactly once:

````markdown
It is not on screen in New game or Game over, including while the new-game form is hidden, and the map widens to the window's right edge.
````

Replace it with:

````markdown
It is not on screen in New game or Game over, including while the new-game choices are hidden, and the map widens to the window's right edge.
````

2. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- Absent: New game and Game over, including while the new-game form is hidden. The map widens to the window's right edge.
````

Replace it with:

````markdown
- Absent: New game and Game over, including while the new-game choices are hidden. The map widens to the window's right edge.
````

- [ ] **Step 21: Edit `doc/ux/notifications-and-feedback.md`**

Toasts stay in the map's band, clear of the setup panel.

In `doc/ux/notifications-and-feedback.md`, find this line. It occurs exactly once:

````markdown
The map toast and the AI strategy toast can appear in Strategic planning, Resolution playback, and Tactical planning. They do not require a mode change. While the new-game overlay is open, those toasts stay without pointer input, including while its form is hidden and the map can be dragged.
````

Replace it with:

````markdown
The map toast and the AI strategy toast can appear in Strategic planning, Resolution playback, and Tactical planning. They do not require a mode change. While the new-game overlay is open, those toasts stay without pointer input, though the map beside the setup panel can be dragged. They sit in the map's band, so they stay clear of the setup panel.
````

- [ ] **Step 22: Edit `doc/ux/control-tooltips.md`**

The hide-choices button's tip.

In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Hide the new game choices: Hide the new game choices. The map stays up.
````

Replace it with:

````markdown
- Hide the new game choices: Hide the new game choices and widen the map.
````

- [ ] **Step 23: Edit `doc/ui-style-guide.md`**

Describes the setup panel and its stylesheet.

1. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
Toasts and the new-game box are in `static/feedbackChrome.css`, and the new-game bar is in `static/newGameChrome.css`.
````

Replace it with:

````markdown
Toasts and the battle-result dialog are in `static/feedbackChrome.css`, and the new-game bar and the new-game setup panel are in `static/newGameChrome.css`.
````

2. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
| Panel, popup, tooltip, and toast bg | `#1b2838` | Right panel, game menu, legend, hex tooltip, control tips, stack callout, build popup, new-game box, tactical-battles dialog, update toast, message toast, and Reports tab |
````

Replace it with:

````markdown
| Panel, popup, tooltip, and toast bg | `#1b2838` | Right panel, game menu, legend, hex tooltip, control tips, stack callout, build popup, new-game setup panel, tactical-battles dialog, update toast, message toast, and Reports tab |
````

3. In `doc/ui-style-guide.md`, find these lines. Together they occur exactly once:

````markdown
- **New game (live):** Overlay with Global and Regional tabs. Global has human/AI home-region selectors, each with a randomize button. Regional has one centered region selector with the same teal square randomize button, and human/AI side-group selectors, each with a randomize button. The two home-region dropdowns, the region dropdown, and the two side-group dropdowns share one closed width, wide enough for the longest name in the home-region lists and the region list. A longer side name does not widen a side dropdown. After each unit type, its price in parentheses, such as Infantry ($20), follows the selected tab and region. The game size dropdown sits above an Advanced tech line for the map that is showing, and the cap badges draw the map glyphs dark on gray disks. Two option lines (Origin bonus / Tech bonus, then Terrain bonus / Weather bonus) of dropdowns (Off, Low, High, default Low) whose labels end in colons sit outside the tabs, then a row with Fog of war, a slash separator, and a "Starting month:" dropdown only as wide as its longest month, and a square randomize button matching the human home-region button, and New game. The overlay has no dark veil. Its upper-left corner is the minimap's usual corner, and a teal square there, the same size as a randomize button, hides the form or shows it again. The form is showing whenever the overlay opens. While the form is hidden, only that square remains, and drag and the wheel pan and zoom the map behind it. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden while it is open. The right panel is not on screen. The top bar becomes the new-game bar: the menu button, the title "New game", and the disabled Load game…, Settings, and Help. The map fills the window under it. The map behind it shows that tab's preview: Global is one zoom level closer than the world fit, and Regional frames the selected region. On Global, the preview draws the selected home regions and hides the strategic hex grid until T is held. Holding T draws that grid. A Regional preview always draws its strategic hex grid. Weather icons sit on every strategic hex until that hold, and tech icons replace them while it lasts. The live scenario id is `region_vs_region`. Details are in [new-game-dialog.md](ux/new-game-dialog.md).
- **Save/Load:** **Not shipped.** Target: named saves, overwrite confirmation, auto-save visibility.
- **End-game summary:** The same overlay reports the winner and offers New game, in that same corner, with the same hide and show button; territory-over-time charts are still target.
````

Replace them with:

````markdown
- **New game (live):** A setup panel docked at the left, 432 px wide (`--new-game-panel-width`), from the top bar to the window's bottom, on the panel chrome. Its header holds a teal square hide-choices button, the same size as a randomize button, then the message; its body scrolls; its footer holds Start game across its width. The styles are in `static/newGameChrome.css`. The panel holds Global and Regional tabs. Global has human/AI home-region selectors, each with a randomize button. Regional has one centered region selector with the same teal square randomize button, and human/AI side-group selectors, each with a randomize button. The two home-region dropdowns, the region dropdown, and the two side-group dropdowns share one closed width, wide enough for the longest name in the home-region lists and the region list. A longer side name does not widen a side dropdown. After each unit type, its price in parentheses, such as Infantry ($20), follows the selected tab and region. The game size dropdown sits above an Advanced tech line for the map that is showing, and the cap badges draw the map glyphs dark on gray disks. Two option lines (Origin bonus / Tech bonus, then Terrain bonus / Weather bonus) of dropdowns (Off, Low, High, default Low) whose labels end in colons sit outside the tabs, then a row with Fog of war, a slash separator, and a "Starting month:" dropdown only as wide as its longest month, and a square randomize button matching the human home-region button, and New game. The choices are showing whenever the overlay opens. While they are hidden, only the square remains, in the same spot, and the map widens to the window's left edge. Drag and the wheel pan and zoom the map beside the panel either way. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden while it is open. The right panel is not on screen. The top bar becomes the new-game bar: the menu button, the title "New game", and the disabled Load game…, Settings, and Help. The map fills the rest of the window, beside the panel, and shows that tab's preview: Global is one zoom level closer than the world fit, and Regional frames the selected region. On Global, the preview draws the selected home regions and hides the strategic hex grid until T is held. Holding T draws that grid. A Regional preview always draws its strategic hex grid. Weather icons sit on every strategic hex until that hold, and tech icons replace them while it lasts. The live scenario id is `region_vs_region`. Details are in [new-game-dialog.md](ux/new-game-dialog.md).
- **Save/Load:** **Not shipped.** Target: named saves, overwrite confirmation, auto-save visibility.
- **End-game summary:** The same setup panel reports the winner and offers New game, with the same hide and show button; territory-over-time charts are still target.
````

- [ ] **Step 24: Edit `doc/ux-specification.md`**

The smoke run also records the game-over screen at the 800 × 600 minimum.

In `doc/ux-specification.md`, find this text. It occurs exactly once:

````markdown
The third reopens the regional match as a finished one.
````

Replace it with:

````markdown
The third reopens the regional match as a finished one, and shows its game-over screen at the 800 × 600 minimum too.
````

The routing line still says the map preview sits behind the overlay. After this plan the setup panel is beside the map.

In `doc/ux-specification.md`, find this text. It occurs exactly once:

````markdown
and the map preview behind it.
````

Replace it with:

````markdown
and the map preview beside it.
````

## Verify

- [ ] **Step 25: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 26: Full tests**

Run the full tests. Expected: exit 0, test total **896**, failure total **0**.

- [ ] **Step 27: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/renderer/gameplay/newGameDialogCollapse.ts src/renderer/gameplay/newGameMapPreviewUi.ts src/renderer/core/uiState.ts src/renderer/gameplay/newGame.ts static/index.html static/newGameChrome.css static/feedbackChrome.css static/shellChrome.css static/selectionChrome.css static/frameChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-new-game-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/new-game-dialog.md doc/ux/modes-and-transitions.md doc/ux/input-map.md doc/ux/map-surface.md doc/ux/top-bar.md doc/ux/right-panel.md doc/ux/notifications-and-feedback.md doc/ux/control-tooltips.md doc/ui-style-guide.md doc/ux-specification.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/renderer/gameplay/newGameDialogCollapse.ts` | `d995e99c93522420` |
| `src/renderer/gameplay/newGameMapPreviewUi.ts` | `ceb742d6a33b70a8` |
| `src/renderer/core/uiState.ts` | `82a2f9b2335588f9` |
| `src/renderer/gameplay/newGame.ts` | `49bf8a50c4a59fd4` |
| `static/index.html` | `b25adcf58c0c127e` |
| `static/newGameChrome.css` | `0476151b8479fcac` |
| `static/feedbackChrome.css` | `ea3d78935c122d1e` |
| `static/shellChrome.css` | `8824c3b40e0a6673` |
| `static/selectionChrome.css` | `6d96747031f8164e` |
| `static/frameChrome.css` | `39c10d3997421ddd` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `dc0dd641ccb27e9d` |
| `scripts/ui-smoke/ui-smoke-new-game-checks.cjs` | `f214db118d2aa1db` |
| `scripts/ui-smoke/ui-smoke.cjs` | `0d84f74ca1293080` |
| `doc/ux/new-game-dialog.md` | `380b640aee3650bb` |
| `doc/ux/modes-and-transitions.md` | `805e4aa19060cdaa` |
| `doc/ux/input-map.md` | `c0d32e1bb5f0ba4a` |
| `doc/ux/map-surface.md` | `52069fd997e1db1e` |
| `doc/ux/top-bar.md` | `5638b4613671bf40` |
| `doc/ux/right-panel.md` | `e31b64585ddafac5` |
| `doc/ux/notifications-and-feedback.md` | `4e6fb6beef89b386` |
| `doc/ux/control-tooltips.md` | `da041e925943aad7` |
| `doc/ui-style-guide.md` | `fb63cf75d99d312b` |
| `doc/ux-specification.md` | `bfea3d268d9a457b` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 28: Smoke run**

```powershell
npm run ui:smoke -- --label setup-panel
```

Expected summary line:

```text
ui-smoke setup-panel: 489 passed, 0 failed, 0 page errors, 39 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\setup-panel
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/setup-panel/report.json`.

- [ ] **Step 29: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/setup-panel/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The new-game screen draws random home regions and a random month each time it opens, so the choices shown and the map's highlighted homes differ from run to run.

- `01-new-game-startup.png` against [ui-facelift-start-2-expected-panel.png](ui-facelift-start-2-expected-panel.png): the startup screen. The setup panel fills the left of the window under the top bar, with the − button and "Start the global game when ready." in its header and Start game across its footer. The controls inside keep today's look, with the two sides on two lines. The map preview fills the rest of the window, and the toast, if any, sits over the map.
- `03-new-game-hidden.png` against [ui-facelift-start-2-expected-hidden.png](ui-facelift-start-2-expected-hidden.png): the choices hidden: only the + button remains, where the − was, and the map fills the window's width under the top bar.
- `39-game-over-small-window.png` against [ui-facelift-start-2-expected-small-window.png](ui-facelift-start-2-expected-small-window.png): the game-over screen at 800 × 600: "You lose." in the header, New game in the footer, and the narrower map beside the panel.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 26.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 29.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. Open New game… with `npm start`: the panel docks at the left, the map preview fills the rest of the window, and the console is hidden.
2. Drag and turn the wheel over the map beside the panel: the preview pans and zooms. Click and double-click: nothing is selected or ordered.
3. Click −: the panel goes, the map widens and keeps its centre, and + sits where − was. Click +: the panel comes back.
4. Switch to Regional and change the region: the region is framed in the map beside the panel, not behind it.
5. Shrink the window to 800 × 600: the panel keeps its width, its body scrolls, and Start game stays at the bottom.
6. Start a match: the panel goes, the console comes back, and the map frames the new match.

## Next

Plan 3 rebuilds the panel's choices as the mockup's Map, Forces, and Rules sections.
