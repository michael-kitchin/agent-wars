# UI Facelift Start Screen, Plan 1 of 3: New-Game Bar

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Keep the top bar on screen while the new-game overlay is open, as the new-game bar: the menu button, the title "New game", Load game… (a disabled placeholder), Settings, and Help. The game menu works there, with New game… disabled and a tip that says why. The console stays hidden. The dialog itself does not change until plan 2.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 1 of the three that build the spec's Phase 7; [ui-facelift-start-execution-plan.md](ui-facelift-start-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- Markup: the title `#topbar-new-game-title` and Load game… (`#topbar-load-btn`, in a tip host) join the top bar, both marked `new-game-only`. The game menu's New game item gets a tip host that explains why it is disabled.
- `static/frameChrome.css`: the rule that hid the top bar and the game menu during the overlay now hides only the console. A new stylesheet, `static/newGameChrome.css`, switches the bar to the new-game bar while `#game-over-overlay` is open, keyed on the overlay's `hidden` class, so it follows every way the overlay opens or closes, including from a battle. `frameChrome.css` is close to the 600-line limit, and plan 2 adds the setup panel to the new file.
- `setMainUIControlsEnabled` keeps the top bar taking the pointer while the new-game overlay is open, and `syncGameMenuNewGameItem` (in `gameMenu.ts`) disables New game there. Opening the overlay still closes the menu.
- A click on any menu button closes the menu. Before, the menu checked that the item was enabled, and New game disables itself by opening the new-game screen before the menu sees the click, so the menu stayed open.
- The smoke run opens the game menu on the startup screen. A new file, `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, holds the new-game screen's checks.
- `doc/` describes the new-game bar.

**Out of scope:**

- Where the dialog sits and how it looks (plans 2 and 3). While its choices show, the map still takes no pointer input until plan 2.

**How this plan was checked:** every step below was applied to a copy of the repository at commit `d4f986d`, and the result matched the verified files exactly. On that result, the fast loop, the full tests, and the smoke run against the real app in Electron passed. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

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

1. `AGENTS.md` and each file in `.cursor/rules/`.
2. [ui-facelift-spec.md](ui-facelift-spec.md): How to Read This Document, Frame (Visibility by mode), Top Bar, Game Menu, and New Game and Game Over.
3. `doc/ux/top-bar.md` and `doc/ux/game-menu.md`.
4. `setMainUIControlsEnabled` and `updateGameOverUI` in `src/renderer/core/uiState.ts`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected:

- `git status --short` prints nothing, or only `.spec/` files.
- The last commit is `d4f986d Doc moves.`, or a later commit of yours that changes only `.spec/`. If it is anything else, stop and report: every block in this plan was checked against `d4f986d`.

Then check that the spec's Phase 6 is in, this plan is not, and `.spec/` holds this phase's spec:

```powershell
Test-Path src/renderer/gameplay/selectionPanelExpand.ts
[bool](Select-String -Path static/index.html -Pattern 'topbar-new-game-title' -SimpleMatch -Quiet)
[bool](Select-String -Path .spec/ui-facelift-spec.md -Pattern 'ui-facelift-start-execution-plan.md' -SimpleMatch -Quiet)
```

Expected: `True`, `False`, `True`. Any other result: stop and report. A `False` from the last one means the reviewer has not yet copied this phase's spec into `.spec/`.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **896**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/renderer/chrome/gameMenu.ts`
- `src/renderer/core/uiState.ts`
- `static/index.html`
- `static/frameChrome.css`
- `static/newGameChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/top-bar.md`
- `doc/ux/game-menu.md`
- `doc/ux/new-game-dialog.md`
- `doc/ux/modes-and-transitions.md`
- `doc/ux/right-panel.md`
- `doc/ux/map-surface.md`
- `doc/ux-specification.md`
- `doc/ux/control-tooltips.md`
- `doc/ui-style-guide.md`

- [ ] **Step 1: Edit `src/renderer/chrome/gameMenu.ts`**

Adds `syncGameMenuNewGameItem`, which disables New game while the new-game overlay is open, and calls it each time the menu opens. A click on any menu button now closes the menu: a disabled button gets no clicks, and New game disables itself by opening the new-game screen before the menu sees the click.

1. In `src/renderer/chrome/gameMenu.ts`, find these lines. Together they occur exactly once:

```ts
 * New game and Offer tactical battles keep their own handlers in `openRouterControls.ts`; this module only opens
 * and closes the menu and handles Quit.
 */
```

Replace them with:

```ts
 * New game and Offer tactical battles keep their own handlers in `openRouterControls.ts`; this module opens and
 * closes the menu, disables New game while the new-game screen is open, and handles Quit.
 */
import { newGameOverlayIsOpen } from '../gameplay/newGameDialogCollapse';
```

2. In `src/renderer/chrome/gameMenu.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * Reports whether the game menu is open.
```

Replace them with:

```ts
/**
 * Id of the menu's New game item.
 *
 * Purpose: One place for the id shared with `static/index.html`.
 * When to use: Every lookup of the New game item in this module.
 * Expected outcome: Matches the markup.
 * Exceptions: None.
 */
const NEW_GAME_ITEM_ID = 'openrouter-new-btn';

/**
 * Reports whether the game menu is open.
```

3. In `src/renderer/chrome/gameMenu.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * Opens the game menu.
```

Replace them with:

```ts
/**
 * Disables the menu's New game item while the new-game screen is open.
 *
 * Purpose: The menu also works on the new-game screen, where opening that screen again would only throw away the
 *   choices the player has made.
 * When to use: When the menu opens, and whenever pointer input for the match controls is switched on or off, which
 *   happens each time the new-game overlay opens or closes.
 * Expected outcome: New game is disabled while `#game-over-overlay` is open and enabled otherwise. Its tip host says
 *   why while it is disabled.
 * Exceptions: None; does nothing when the item is missing.
 */
export function syncGameMenuNewGameItem(): void {
  const item = document.getElementById(NEW_GAME_ITEM_ID);
  if (item instanceof HTMLButtonElement) item.disabled = newGameOverlayIsOpen();
}

/**
 * Opens the game menu.
```

4. In `src/renderer/chrome/gameMenu.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: The menu shows and the button reports `aria-expanded="true"`.
```

Replace it with:

```ts
 * Expected outcome: The menu shows with New game enabled or disabled for the current screen, and the button reports
 *   `aria-expanded="true"`.
```

5. In `src/renderer/chrome/gameMenu.ts`, find these lines. Together they occur exactly once:

```ts
  if (!menu || !button) return;
  menu.hidden = false;
```

Replace them with:

```ts
  if (!menu || !button) return;
  syncGameMenuNewGameItem();
  menu.hidden = false;
```

6. In `src/renderer/chrome/gameMenu.ts`, find these lines. Together they occur exactly once:

```ts
  menu.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest('button');
    if (item && !(item as HTMLButtonElement).disabled) closeGameMenu();
```

Replace them with:

```ts
  // A disabled button gets no clicks, so a click that reaches the menu from a button came from an enabled item. That
  // item's own handler has already run and may have disabled it: New game does, by opening the new-game screen.
  menu.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button')) closeGameMenu();
```

- [ ] **Step 2: Edit `src/renderer/core/uiState.ts`**

`setMainUIControlsEnabled` keeps the top bar taking the pointer while the new-game overlay is open, closes the game menu only when the top bar stops taking the pointer, and syncs New game. Opening the overlay from a state refresh closes the game menu, as opening it from the menu already does.

1. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
import { expandNewGameDialog, syncNewGameDialogMapPointer } from '../gameplay/newGameDialogCollapse';
import { renderTopBarStatus } from '../chrome/topBar';
import { closeGameMenu } from '../chrome/gameMenu';
```

Replace them with:

```ts
import { expandNewGameDialog, newGameOverlayIsOpen, syncNewGameDialogMapPointer } from '../gameplay/newGameDialogCollapse';
import { renderTopBarStatus } from '../chrome/topBar';
import { closeGameMenu, syncGameMenuNewGameItem } from '../chrome/gameMenu';
```

2. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Children of the map pane other than those two overlays ignore the pointer while `enabled` is false. The top bar and the console match, and the game menu closes. While the new-game form is hidden, the main map takes the pointer again so drag and the wheel still move the preview.
```

Replace it with:

```ts
 * Expected outcome: Children of the map pane other than those two overlays, and the console, ignore the pointer while
 *   `enabled` is false. The top bar does too, except while the new-game overlay is open: it is the new-game bar then,
 *   and its game menu keeps working. The game menu closes whenever the top bar stops taking the pointer, and its New
 *   game item follows the overlay. While the new-game form is hidden, the main map takes the pointer again so drag and
 *   the wheel still move the preview.
```

3. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
  for (const id of ['app-topbar', 'sidebar']) {
    const chrome = document.getElementById(id);
    if (!chrome) continue;
    chrome.style.pointerEvents = enabled ? '' : 'none';
    chrome.classList.toggle('main-ui-disabled', !enabled);
  }
  if (!enabled) closeGameMenu();
```

Replace them with:

```ts
  const topBarEnabled = enabled || newGameOverlayIsOpen();
  const chromeEnabled: readonly (readonly [string, boolean])[] = [
    ['app-topbar', topBarEnabled],
    ['sidebar', enabled],
  ];
  for (const [id, on] of chromeEnabled) {
    const chrome = document.getElementById(id);
    if (!chrome) continue;
    chrome.style.pointerEvents = on ? '' : 'none';
    chrome.classList.toggle('main-ui-disabled', !on);
  }
  if (!topBarEnabled) closeGameMenu();
  syncGameMenuNewGameItem();
```

4. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
 *   drawn only when the overlay opens. The form starts showing only on that open. A later refresh leaves a hidden
 *   form hidden.
```

Replace them with:

```ts
 *   drawn only when the overlay opens, and that open closes the game menu. The form starts showing only on that open.
 *   A later refresh leaves a hidden form hidden.
```

5. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
  if (wasHidden) {
```

Replace it with:

```ts
  if (wasHidden) {
    closeGameMenu();
```

- [ ] **Step 3: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 4: Edit `static/index.html`**

Adds the title "New game" after the battle header's title block, and Load game…, a disabled placeholder in a tip host, before Settings. Both carry `new-game-only`. Wraps the game menu's New game item in a tip host that explains why it is disabled. Links `newGameChrome.css` after `feedbackChrome.css`; a later step creates it.

1. In `static/index.html`, find this line. It occurs exactly once:

```html
  <link rel="stylesheet" href="feedbackChrome.css" />
```

Replace it with:

```html
  <link rel="stylesheet" href="feedbackChrome.css" />
  <link rel="stylesheet" href="newGameChrome.css" />
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
    </div>
    <div class="topbar-sides">
```

Replace them with:

```html
    </div>
    <span id="topbar-new-game-title" class="topbar-new-game-title new-game-only">New game</span>
    <div class="topbar-sides">
```

3. In `static/index.html`, find these lines. Together they occur exactly once:

```html
    </div>
    <span class="control-tooltip-host" data-control-tooltip="Settings is not available in this version."><button type="button" id="topbar-settings-btn" class="topbar-icon-btn" aria-label="Settings" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h6.5M12.5 4H14M2 8h1.5M7.5 8H14M2 12h8.5"></path><circle cx="10.5" cy="4" r="1.8"></circle><circle cx="5.5" cy="8" r="1.8"></circle><circle cx="12.3" cy="12" r="1.8"></circle></svg></button></span>
```

Replace them with:

```html
    </div>
    <span class="control-tooltip-host new-game-only" data-control-tooltip="Load game is not available in this version."><button type="button" id="topbar-load-btn" class="topbar-text-btn" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h4.5l1.5 1.5h7v7.5h-13z"></path></svg>Load game…</button></span>
    <span class="control-tooltip-host" data-control-tooltip="Settings is not available in this version."><button type="button" id="topbar-settings-btn" class="topbar-icon-btn" aria-label="Settings" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h6.5M12.5 4H14M2 8h1.5M7.5 8H14M2 12h8.5"></path><circle cx="10.5" cy="4" r="1.8"></circle><circle cx="5.5" cy="8" r="1.8"></circle><circle cx="12.3" cy="12" r="1.8"></circle></svg></button></span>
```

4. In `static/index.html`, find this line. It occurs exactly once:

```html
    <button type="button" id="openrouter-new-btn" class="game-menu-item" data-control-tooltip="Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"></path></svg>New game…</button>
```

Replace it with:

```html
    <span class="control-tooltip-host game-menu-host" data-control-tooltip="The new-game screen is already open."><button type="button" id="openrouter-new-btn" class="game-menu-item" data-control-tooltip="Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"></path></svg>New game…</button></span>
```

- [ ] **Step 5: Edit `static/frameChrome.css`**

The rule that hid the top bar and the game menu during the new-game overlay now hides only the console. Its comment points at the stylesheet the next step creates.

In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
/* The match chrome leaves the window while the new-game overlay is open, so the map fills it as before. */
body:has(#game-over-overlay:not(.hidden)) #app-topbar,
body:has(#game-over-overlay:not(.hidden)) #game-menu,
```

Replace them with:

```css
/* The console leaves the window while the new-game overlay is open. The top bar becomes the new-game bar
   (static/newGameChrome.css). */
```

- [ ] **Step 6: Create `static/newGameChrome.css`**

A new stylesheet for the new-game screen. Its first section switches the top bar to the new-game bar while the overlay is open: the match status and the battle header hide, the `new-game-only` parts show, and a battle's darker face gives way. The overlay's own `hidden` class drives it, so the bar follows however the overlay opens. It also styles the title and Load game…. These rules are not in `frameChrome.css`, which is close to the 600-line limit; plan 2 adds the setup panel here.

Create `static/newGameChrome.css` with exactly this content:

```css
/* The new-game screen. While the new-game overlay is open, the top bar becomes the new-game bar. */

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
```

- [ ] **Step 7: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the scene with the game menu open on the new-game screen.

1. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  newGameStartup: 'new-game-startup',
```

Replace it with:

```js
  newGameStartup: 'new-game-startup',
  newGameMenu: 'new-game-menu',
```

2. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
 * Purpose: The overlay hides the match chrome, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while the overlay is open.
 * Expected outcome: The first scene, the overlay opened from a match, and the finished match reopened.
 * Exceptions: None.
 */
const NEW_GAME_SCENES = Object.freeze([SCENES.newGameStartup, SCENES.newGameReopened, SCENES.gameOverReopened]);
```

Replace them with:

```js
 * Purpose: The overlay replaces the match chrome with the new-game screen, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while the overlay is open.
 * Expected outcome: The first scene, the game menu opened on it, the overlay opened from a match, and the finished
 *   match reopened.
 * Exceptions: None.
 */
const NEW_GAME_SCENES = Object.freeze([
  SCENES.newGameStartup,
  SCENES.newGameMenu,
  SCENES.newGameReopened,
  SCENES.gameOverReopened,
]);
```

- [ ] **Step 8: Create `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`**

A new file: the checks of the new-game screen. The map fills the window under the top bar, the console is hidden, the top bar is the new-game bar and takes the pointer, and the game menu there has New game disabled with its tip.

Create `scripts/ui-smoke/ui-smoke-new-game-checks.cjs` with exactly this content:

```js
/**
 * Checks of the new-game screen for the UI smoke run: the top bar while the new-game overlay is open, the game menu
 * there, and where the map sits.
 *
 * Purpose: Keeps the new-game screen's checks apart from the frame, console, scenario, map chrome, and battle checks,
 *   so each table stays readable.
 * When to use: Required by `ui-smoke-checks.cjs`, which adds these rows to the run.
 * Expected outcome: Rows in the same shape as the other check tables.
 * Exceptions: None.
 */
'use strict';

const { TOPBAR_HEIGHT, SCENES, NEW_GAME_SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');

/**
 * The top bar's parts that the new-game screen shows, and the parts it hides.
 *
 * Purpose: The new-game bar is the menu button, the title, Load game…, Settings, and Help; the match status and the
 *   battle header stay hidden, even when the overlay was opened from a battle.
 * When to use: The new-game top bar check.
 * Expected outcome: Selectors only.
 * Exceptions: None.
 */
const NEW_GAME_BAR = Object.freeze({
  shown: ['#game-menu-btn', '#topbar-new-game-title', '#topbar-load-btn', '#topbar-settings-btn', '#topbar-help-btn'],
  hidden: ['#app-topbar .topbar-sides', '#app-topbar .topbar-stat', '#app-topbar .topbar-date-block', '#battle-header-place', '#battle-header-center', '#tactical-exit-btn'],
});

/**
 * The tip host around the game menu's New game item, and its tip while the new-game screen is open.
 *
 * Purpose: A disabled button gets no pointer events, so the host carries the reason.
 * When to use: The new-game menu check.
 * Expected outcome: Matches the host and its `data-control-tooltip` in `static/index.html`.
 * Exceptions: None.
 */
const NEW_GAME_ITEM_HOST = '#game-menu .control-tooltip-host:has(#openrouter-new-btn)';
const NEW_GAME_ITEM_OPEN_TIP = 'The new-game screen is already open.';

/**
 * The new-game screen's checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a rule of the new-game screen needs a machine check. `needs` lists every selector the
 *   row reads; `run(p, el)` gets the probe and a lookup for those selectors, and returns null on success or a failure
 *   message.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const NEW_GAME_CHECKS = Object.freeze([
  {
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
  },
  {
    name: 'new-game-console-hidden',
    scenes: NEW_GAME_SCENES,
    needs: ['#sidebar'],
    run: (p, el) => (el('#sidebar').shown ? 'the console is shown on the new-game screen' : null),
  },
  {
    name: 'new-game-top-bar',
    scenes: NEW_GAME_SCENES,
    needs: ['#app-topbar', ...NEW_GAME_BAR.shown, ...NEW_GAME_BAR.hidden],
    run: (p, el) => {
      const bar = el('#app-topbar');
      if (!bar.shown || !near(bar.y, 0) || !near(bar.h, TOPBAR_HEIGHT)) return `the top bar is at ${fmt(bar)}, expected a ${TOPBAR_HEIGHT} px bar at the top`;
      if (bar.pointerEvents === 'none') return 'the top bar ignores the pointer on the new-game screen';
      const missing = NEW_GAME_BAR.shown.filter((selector) => !el(selector).shown);
      if (missing.length > 0) return `not shown on the new-game bar: ${missing.join(', ')}`;
      const extra = NEW_GAME_BAR.hidden.filter((selector) => el(selector).shown);
      if (extra.length > 0) return `shown on the new-game bar: ${extra.join(', ')}`;
      const title = el('#topbar-new-game-title').text;
      if (title !== 'New game') return `the title reads "${title}", expected "New game"`;
      return el('#topbar-load-btn').disabled ? null : 'Load game… is enabled';
    },
  },
  {
    name: 'new-game-menu',
    scenes: [SCENES.newGameMenu],
    needs: ['#game-menu', '#openrouter-new-btn', NEW_GAME_ITEM_HOST, '#openrouter-tactical-battles', '#game-menu-quit-btn'],
    run: (p, el) => {
      if (!el('#game-menu').shown) return 'the game menu is not shown on the new-game screen';
      if (!el('#openrouter-new-btn').disabled) return 'New game… is enabled on the new-game screen';
      const tip = el(NEW_GAME_ITEM_HOST).tip;
      if (tip !== NEW_GAME_ITEM_OPEN_TIP) return `New game…'s host tip reads "${tip}", expected "${NEW_GAME_ITEM_OPEN_TIP}"`;
      if (el('#openrouter-tactical-battles').disabled || el('#game-menu-quit-btn').disabled) {
        return 'Offer tactical battles or Quit is disabled on the new-game screen';
      }
      return null;
    },
  },
]);

module.exports = { NEW_GAME_CHECKS };
```

- [ ] **Step 9: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

The page probe also reads each element's pointer events. The two old checks that expected the whole frame hidden during the overlay move, rewritten, to the new file, which joins the run.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
const { BATTLE_CHECKS } = require('./ui-smoke-battle-checks.cjs');
```

Replace it with:

```js
const { BATTLE_CHECKS } = require('./ui-smoke-battle-checks.cjs');
const { NEW_GAME_CHECKS } = require('./ui-smoke-new-game-checks.cjs');
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
 *   null when the selector matches nothing, otherwise the first match's box, text, font size, border color, tip, and
 *   the attributes the checks use, plus the text of every match in `allTexts`.
```

Replace them with:

```js
 *   null when the selector matches nothing, otherwise the first match's box, text, font size, border color, pointer
 *   events, tip, and the attributes the checks use, plus the text of every match in `allTexts`.
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
   * Expected outcome: The first match's box, whether it is shown, its trimmed text, its computed font size and top
   *   border color, its control tip sentence, and selected attributes, and the trimmed text of every match, or null when
   *   the selector matches nothing.
```

Replace them with:

```js
   * Expected outcome: The first match's box, whether it is shown, its trimmed text, its computed font size, top
   *   border color, and pointer events, its control tip sentence, and selected attributes, and the trimmed text of every
   *   match, or null when the selector matches nothing.
```

4. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
      borderColor: getComputedStyle(el).borderTopColor,
```

Replace it with:

```js
      borderColor: getComputedStyle(el).borderTopColor,
      pointerEvents: getComputedStyle(el).pointerEvents,
```

5. In `scripts/ui-smoke/ui-smoke-checks.cjs`, delete these lines, including the line break at the end. Together they occur exactly once:

```js
    },
  },
  {
    name: 'new-game-fills-window',
    scenes: NEW_GAME_SCENES,
    needs: ['#canvas-container', '#game-over-overlay'],
    run: (p, el) => {
      const c = el('#canvas-container');
      if (!el('#game-over-overlay').shown) return 'the new-game overlay is not shown';
      return near(c.x, 0) && near(c.y, 0) && near(c.w, p.viewport.w) && near(c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} does not fill the ${p.viewport.w}x${p.viewport.h} window`;
    },
  },
  {
    name: 'frame-hidden-during-new-game',
    scenes: NEW_GAME_SCENES,
    needs: ['#sidebar', '#app-topbar', '#game-menu'],
    run: (p) => {
      const shown = Object.entries(p.elements).filter(([, e]) => e.shown).map(([selector]) => selector);
      return shown.length === 0 ? null : `still shown during the new-game overlay: ${shown.join(', ')}`;
```

6. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
 * the battle header's.
```

Replace it with:

```js
 * the battle header's, then the new-game screen's.
```

7. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
const CHECKS = Object.freeze([...FRAME_CHECKS, ...CONSOLE_CHECKS, ...SCENARIO_CHECKS, ...MAP_CHROME_CHECKS, ...BATTLE_CHECKS]);
```

Replace it with:

```js
const CHECKS = Object.freeze([
  ...FRAME_CHECKS,
  ...CONSOLE_CHECKS,
  ...SCENARIO_CHECKS,
  ...MAP_CHROME_CHECKS,
  ...BATTLE_CHECKS,
  ...NEW_GAME_CHECKS,
]);
```

- [ ] **Step 10: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Opens the game menu on the startup new-game screen, records it, and closes it with Escape.

In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  await recordScene(page, report, outDir, SCENES.newGameStartup);
```

Replace it with:

```js
  await recordScene(page, report, outDir, SCENES.newGameStartup);
  // The game menu works on the new-game screen, with New game disabled there.
  await page.click('#game-menu-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.newGameMenu);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS.click);
```

- [ ] **Step 11: Edit `doc/ux/top-bar.md`**

Describes the new-game bar, and names its stylesheet in the code entry points.

1. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
The bar across the top of the window. It holds the game menu button, the two sides, four match readouts, the date block, and the Settings and Help buttons. In a battle it becomes the battle header.
````

Replace it with:

````markdown
The bar across the top of the window. It holds the game menu button, the two sides, four match readouts, the date block, and the Settings and Help buttons. In a battle it becomes the battle header, and on the new-game screen it becomes the new-game bar.
````

2. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
Shown in Strategic planning, Resolution playback, Tactical planning, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list or the annihilation dialog is open, it stays visible and does not receive pointer input.
````

Replace it with:

````markdown
Shown in every mode. In New game and Game over it is the new-game bar, including while the new-game form is hidden. It accepts pointer input in Strategic planning, Tactical planning, Resolution playback, New game, and Game over. While the tactical battles list or the annihilation dialog is open, it stays visible and does not receive pointer input.
````

3. In `doc/ux/top-bar.md`, find these lines. Together they occur exactly once:

````markdown
- Settings and Help.

## Inputs and Responses
````

Replace them with:

````markdown
- Settings and Help.

While the new-game overlay is open, in New game and Game over, the bar is the new-game bar, on the usual face. The sides, the readouts, the date block, and the battle header are hidden, even when the overlay was opened from a battle. The overlay's own visibility switches the bar, so it follows every way the overlay opens or closes. From left to right:

- The game menu button. The menu works there, with New game… disabled. See [game-menu.md](game-menu.md).
- The title "New game", also on the game-over screen.
- Load game…, with a folder icon, disabled in this version.
- Settings and Help.

## Inputs and Responses
````

4. In `doc/ux/top-bar.md`, find these lines. Together they occur exactly once:

````markdown
- No match: em dashes, and the readout suffixes are empty.
- Pointer input off: the tactical battles list or Tactical annihilation.
- Absent: New game and Game over.
````

Replace them with:

````markdown
- No match: em dashes, and the readout suffixes are empty. The new-game bar covers this case while the new-game overlay is open.
- New game bar: New game and Game over.
- Pointer input off: the tactical battles list or Tactical annihilation.
````

5. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- The match status and the battle header never show together. The date block always describes the world-map turn.
````

Replace it with:

````markdown
- The match status, the battle header, and the new-game bar never show together. The date block always describes the world-map turn.
````

6. In `doc/ux/top-bar.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`, `#battle-header-place`, `#battle-header-title`, `#battle-header-caption`, `#battle-header-status`, `#battle-header-center`, `#battle-force-bar`, `#battle-force-human-count`, `#battle-force-opponent-count`, `#battle-force-human-fill`, `#tactical-exit-host`, `#tactical-exit-btn`)
- `static/frameChrome.css`
````

Replace them with:

````markdown
- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`, `#topbar-new-game-title`, `#topbar-load-btn`, `#battle-header-place`, `#battle-header-title`, `#battle-header-caption`, `#battle-header-status`, `#battle-header-center`, `#battle-force-bar`, `#battle-force-human-count`, `#battle-force-opponent-count`, `#battle-force-human-fill`, `#tactical-exit-host`, `#tactical-exit-btn`)
- `static/frameChrome.css`
- `static/newGameChrome.css`
````

- [ ] **Step 12: Edit `doc/ux/game-menu.md`**

The menu works on the new-game screen, with New game… disabled there.

1. In `doc/ux/game-menu.md`, find this line. It occurs exactly once:

````markdown
The menu button is on the [top bar](top-bar.md), so the menu can open wherever the top bar accepts pointer input: Strategic planning, Tactical planning, and Resolution playback. It closes, and cannot open, while the tactical battles list or the annihilation dialog is open. It is not on screen in New game or Game over.
````

Replace it with:

````markdown
The menu button is on the [top bar](top-bar.md), so the menu can open wherever the top bar accepts pointer input: Strategic planning, Tactical planning, Resolution playback, New game, and Game over. It closes, and cannot open, while the tactical battles list or the annihilation dialog is open.
````

2. In `doc/ux/game-menu.md`, find these lines. Together they occur exactly once:

````markdown
A popup under the menu button, in this order:

- New game…
````

Replace them with:

````markdown
A popup under the menu button, in this order:

- New game…, disabled while the new-game overlay is open.
````

3. In `doc/ux/game-menu.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks New game…, the menu closes and the new-game overlay opens. New game works during strategic planning, tactical planning, and resolution playback. Opponent planning and playback stop immediately. See [new-game-dialog.md](new-game-dialog.md).
````

Replace it with:

````markdown
- When the player clicks New game…, the menu closes and the new-game overlay opens. New game works during strategic planning, tactical planning, and resolution playback. Opponent planning and playback stop immediately. See [new-game-dialog.md](new-game-dialog.md). While that overlay is open, in New game and Game over, New game… is disabled, and its tip says the new-game screen is already open (`syncGameMenuNewGameItem`).
````

4. In `doc/ux/game-menu.md`, find this line. It occurs exactly once:

````markdown
- `src/renderer/chrome/gameMenu.ts`
````

Replace it with:

````markdown
- `src/renderer/chrome/gameMenu.ts` (`syncGameMenuNewGameItem`)
````

- [ ] **Step 13: Edit `doc/ux/new-game-dialog.md`**

The top bar is the new-game bar while the overlay is open, and shows the match status again after a start.

1. In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
The top bar, the right panel, and the selection panel are not on screen while it is open, including while the form is hidden, and the map fills the window.
````

Replace it with:

````markdown
The right panel and the selection panel are not on screen while it is open, including while the form is hidden. The top bar is the new-game bar ([top-bar.md](top-bar.md)), and the map fills the window under it.
````

2. In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
The top bar and the right panel are on screen, and the view then frames the new match in the map beside the panel, as in [map-surface.md](map-surface.md).
````

Replace it with:

````markdown
The top bar shows the match status again, the right panel is on screen, and the view then frames the new match in the map beside the right panel, as in [map-surface.md](map-surface.md).
````

- [ ] **Step 14: Edit `doc/ux/modes-and-transitions.md`**

New game and Game over show the new-game bar.

1. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
The player sees the new-game overlay. The message is "Start the global game when ready." or "Start the regional game when ready." when no match is loaded, and "Start a new global game when ready." or "Start a new regional game when ready." when the player opened the overlay from the game menu during a match. The sentence follows the selected tab. A win or loss does not. The button reads "Start game". Global and Regional tabs sit under the message. Global chooses a home region for each side. Regional chooses one region and a different side group for each side. Game size, fog of war, a level (Off, Low, or High) for each of the origin bonus, tech bonus, terrain bonus, and weather bonus, and a starting month sit outside the tabs. The top bar, the right panel, and the selection panel are not on screen, and the map fills the window. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview, and a click, double-click, or right-click does not select, order, or change the selection. Ready is disabled. The map behind the overlay shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md). The dialog sits at the minimap's usual corner, with no dark veil. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden. This mode ends when Start game succeeds and a match is loaded.
````

Replace it with:

````markdown
The player sees the new-game overlay. The message is "Start the global game when ready." or "Start the regional game when ready." when no match is loaded, and "Start a new global game when ready." or "Start a new regional game when ready." when the player opened the overlay from the game menu during a match. The sentence follows the selected tab. A win or loss does not. The button reads "Start game". Global and Regional tabs sit under the message. Global chooses a home region for each side. Regional chooses one region and a different side group for each side. Game size, fog of war, a level (Off, Low, or High) for each of the origin bonus, tech bonus, terrain bonus, and weather bonus, and a starting month sit outside the tabs. The right panel and the selection panel are not on screen. The top bar is the new-game bar: the game menu button, the title "New game", Load game…, Settings, and Help, and the game menu works with New game… disabled. The map fills the window under it. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview, and a click, double-click, or right-click does not select, order, or change the selection. Ready is disabled. The map behind the overlay shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md). The dialog sits at the minimap's usual corner, with no dark veil. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden. This mode ends when Start game succeeds and a match is loaded.
````

2. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
The top bar, the right panel, and the selection panel are not on screen, and the map fills the window.
````

Replace it with:

````markdown
The right panel and the selection panel are not on screen, and the top bar is the same new-game bar, so the map fills the window under it.
````

- [ ] **Step 15: Edit `doc/ux/right-panel.md`**

The map widens to the window's right edge in New game and Game over, rather than filling the window.

1. In `doc/ux/right-panel.md`, find this text. It occurs exactly once:

````markdown
It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window.
````

Replace it with:

````markdown
It is not on screen in New game or Game over, including while the new-game form is hidden, and the map widens to the window's right edge.
````

2. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- Absent: New game and Game over, including while the new-game form is hidden. The map fills the window.
````

Replace it with:

````markdown
- Absent: New game and Game over, including while the new-game form is hidden. The map widens to the window's right edge.
````

- [ ] **Step 16: Edit `doc/ux/map-surface.md`**

In New game and Game over the map fills the window under the top bar, rather than the whole window.

In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
In New game and Game over the map fills the window.
````

Replace it with:

````markdown
In New game and Game over the map fills the window under the top bar.
````

- [ ] **Step 17: Edit `doc/ux-specification.md`**

The top bar and the game menu change on the new-game screen, and the new checks file is named.

1. In `doc/ux-specification.md`, find this text. It occurs exactly once:

````markdown
The frame's checks are in `scripts/ui-smoke/ui-smoke-checks.cjs`, the console's are in `scripts/ui-smoke/ui-smoke-console-checks.cjs`, the checks for the later scenarios (the small window, the reopened match, the battle, the regional match, and the finished match) are in `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, the checks of the minimap panel, the legend, and Leaflet's controls are in `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, and the checks of the battle header are in `scripts/ui-smoke/ui-smoke-battle-checks.cjs`; add one to the matching file when a layout rule needs a machine check.
````

Replace it with:

````markdown
The frame's checks are in `scripts/ui-smoke/ui-smoke-checks.cjs`, the console's are in `scripts/ui-smoke/ui-smoke-console-checks.cjs`, the checks for the later scenarios (the small window, the reopened match, the battle, the regional match, and the finished match) are in `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, the checks of the minimap panel, the legend, and Leaflet's controls are in `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, the checks of the battle header are in `scripts/ui-smoke/ui-smoke-battle-checks.cjs`, and the checks of the new-game screen are in `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`; add one to the matching file when a layout rule needs a machine check.
````

2. In `doc/ux-specification.md`, find these lines. Together they occur exactly once:

````markdown
| Top bar | Hidden | Shown | Disabled | Changed | Changed | Disabled | Hidden |
| Game menu | Hidden | Shown | Hidden | Shown | Shown | Hidden | Hidden |
````

Replace them with:

````markdown
| Top bar | Changed | Shown | Disabled | Changed | Changed | Disabled | Changed |
| Game menu | Changed | Shown | Hidden | Shown | Shown | Hidden | Changed |
````

- [ ] **Step 18: Edit `doc/ux/control-tooltips.md`**

Adds the tip of New game while the new-game screen is open, and Load game on the new-game bar.

1. In `doc/ux/control-tooltips.md`, find this text. It occurs exactly once:

````markdown
It also includes every disabled placeholder: Settings and Help in the top bar, Save game, Load game, and How to play in the game menu, the Build and Forces tabs, and Replay on a turn report.
````

Replace it with:

````markdown
It also includes New game in the game menu while the new-game screen is open, and every disabled placeholder: Settings and Help in the top bar, Load game on the new-game bar, Save game, Load game, and How to play in the game menu, the Build and Forces tabs, and Replay on a turn report.
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- New game in the game menu: Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one.
````

Replace it with:

````markdown
- New game in the game menu: Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one.
- New game in the game menu while the new-game screen is open, on its tip host: The new-game screen is already open.
````

- [ ] **Step 19: Edit `doc/ui-style-guide.md`**

The new-game line describes the new-game bar, and the list of stylesheets names `static/newGameChrome.css`.

1. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
Toasts and the new-game box are in `static/feedbackChrome.css`.
````

Replace it with:

````markdown
Toasts and the new-game box are in `static/feedbackChrome.css`, and the new-game bar is in `static/newGameChrome.css`.
````

2. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
The right panel is not on screen, and the map fills the window.
````

Replace it with:

````markdown
The right panel is not on screen. The top bar becomes the new-game bar: the menu button, the title "New game", and the disabled Load game…, Settings, and Help. The map fills the window under it.
````

3. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
In a battle the bar is the battle header, and Exit Battle sits beside Settings. See [ux/top-bar.md](ux/top-bar.md).
````

Replace it with:

````markdown
In a battle the bar is the battle header, and Exit Battle sits beside Settings. On the new-game screen the bar is the new-game bar. See [ux/top-bar.md](ux/top-bar.md).
````

## Verify

- [ ] **Step 20: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 21: Full tests**

Run the full tests. Expected: exit 0, test total **896**, failure total **0**.

- [ ] **Step 22: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/renderer/chrome/gameMenu.ts src/renderer/core/uiState.ts static/index.html static/frameChrome.css static/newGameChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-new-game-checks.cjs scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/top-bar.md doc/ux/game-menu.md doc/ux/new-game-dialog.md doc/ux/modes-and-transitions.md doc/ux/right-panel.md doc/ux/map-surface.md doc/ux-specification.md doc/ux/control-tooltips.md doc/ui-style-guide.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/renderer/chrome/gameMenu.ts` | `24fab9b7ed0ba557` |
| `src/renderer/core/uiState.ts` | `f1766149f714b50d` |
| `static/index.html` | `5b89aebd855e1106` |
| `static/frameChrome.css` | `2c9e2268b5ee08cc` |
| `static/newGameChrome.css` | `32a962e799185914` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `aa5a2c2c59cb51c9` |
| `scripts/ui-smoke/ui-smoke-new-game-checks.cjs` | `222c8e2a570c8aba` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `76478f9d960f7531` |
| `scripts/ui-smoke/ui-smoke.cjs` | `c3ede8f008f89244` |
| `doc/ux/top-bar.md` | `a6910c240290ab5c` |
| `doc/ux/game-menu.md` | `0131bfc95fe1b85e` |
| `doc/ux/new-game-dialog.md` | `58748ff54927400a` |
| `doc/ux/modes-and-transitions.md` | `38ef7baebefedf93` |
| `doc/ux/right-panel.md` | `1f4d3f3419cfc4e6` |
| `doc/ux/map-surface.md` | `3d44d92319cbfa2b` |
| `doc/ux-specification.md` | `6f85a705cb3fbb73` |
| `doc/ux/control-tooltips.md` | `5cd90448bc120333` |
| `doc/ui-style-guide.md` | `99878b5aec92ee64` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 23: Smoke run**

```powershell
npm run ui:smoke -- --label new-game-bar
```

Expected summary line:

```text
ui-smoke new-game-bar: 466 passed, 0 failed, 0 page errors, 37 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\new-game-bar
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/new-game-bar/report.json`.

- [ ] **Step 24: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/new-game-bar/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The new-game screen draws random home regions and a random month each time it opens, so the choices shown differ from run to run.

- `01-new-game-startup.png` against [ui-facelift-start-1-expected-new-game-bar.png](ui-facelift-start-1-expected-new-game-bar.png): the startup new-game screen. The top bar reads "New game" beside the menu button, with Load game… (dimmed, with a folder icon), Settings, and Help at the right. No sides, readouts, or date. The dialog is still today's box near the map's top-left corner, and the console is hidden.
- `02-new-game-menu.png` against [ui-facelift-start-1-expected-menu.png](ui-facelift-start-1-expected-menu.png): the same screen with the game menu open under the menu button. New game… is dimmed like the placeholders; Offer tactical battles and Quit are not.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 21.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 24.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With `npm start`, open the game menu during a match and click New game…: the menu closes, the new-game screen opens, and the top bar reads "New game" with Load game…, Settings, and Help. The console is hidden.
2. Open the game menu on that screen: New game… is dimmed, and pointing at it shows "The new-game screen is already open." Toggle Offer tactical battles: it changes and the menu stays open. Press Escape: the menu closes.
3. Point at Load game… on the bar: its "not available in this version" tip shows.
4. Enter a battle, then choose New game… from the game menu: the bar is the new-game bar, on the usual face, not the battle header.
5. Start a match: the bar shows the sides, the readouts, and the date again, and New game… is enabled in the menu.

## Next

Plan 2 docks the dialog at the left as the setup panel, with the map beside it.
