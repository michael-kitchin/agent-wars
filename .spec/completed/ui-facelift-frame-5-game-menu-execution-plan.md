# UI Facelift Frame, Plan 5 of 5: Game Menu and Electron Menu Bar

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Add a game menu under a top-bar button: New game… and Offer tactical battles (moved from the Model tab), disabled Save game…, Load game…, and How to play, and Quit. Hide Electron's File/Edit/View menu bar.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 5 of the five that build the spec's Phase 2; [ui-facelift-frame-execution-plan.md](ui-facelift-frame-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- A menu button at the left of the top bar, and the menu under it. Escape, a press outside, or switching pointer input off closes it.
- New and Tactical battles move into the menu with their ids, so their existing handlers keep working. Tactical battles is renamed "Offer tactical battles".
- Electron's menu bar auto-hides. Alt still shows it, and its shortcuts still work.
- The smoke harness gains the menu scenes, and `doc/` describes the menu. This completes the frame.

**Out of scope:**

- Restyling the console's contents, the selection panel, and Reports. Those are the next phase of the spec.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves. On the result, the fast loop and the full tests passed, and the smoke run passed against the real app in Electron. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 2", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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

- `check:renderer-types` prints `check-renderer-typecheck: ok`.
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

- The run builds the app, opens an app window, and takes about two minutes. Do not use the mouse or keyboard in that window while it runs.
- It prints one `PASS` or `FAIL` line per check, then a summary line: `ui-smoke <label>: P passed, F failed, E page errors, N screenshots in <folder>`.
- The window can show a "map tiles failed to load" toast when the network is slow. That toast is not a failure.
- After a smoke run the SQLite module is built for Electron. `npm test` rebuilds it for Node by itself, and `npm start` works as usual.

## Before You Start

- [ ] **Read**

1. [ui-facelift-spec.md](ui-facelift-spec.md): Game Menu and Decisions 12 to 14.
2. `doc/ux/top-bar.md`, `doc/ux/right-panel-model-tab.md`, `doc/ux/input-map.md`, `doc/ux/new-game-dialog.md`, and `doc/ux/tactical-battles-list.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then:

```powershell
Test-Path src/shared/topBarStats.ts
Test-Path src/renderer/chrome/gameMenu.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **843**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files:

- `doc/how-to-play.md`
- `doc/ui-style-guide.md`
- `doc/ux-specification.md`
- `doc/ux/ai-activity-log.md`
- `doc/ux/control-tooltips.md`
- `doc/ux/game-menu.md`
- `doc/ux/input-map.md`
- `doc/ux/modes-and-transitions.md`
- `doc/ux/new-game-dialog.md`
- `doc/ux/right-panel-model-tab.md`
- `doc/ux/tactical-battles-list.md`
- `doc/ux/top-bar.md`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `src/main/main.ts`
- `src/renderer/chrome/controlTooltipText.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `src/renderer/chrome/gameMenu.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/entryCallbacks.ts`
- `src/renderer/gameplay/newGame.ts`
- `src/renderer/gameplay/newGameRegionUi.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/renderer.ts`
- `static/frameChrome.css`
- `static/index.html`
- `static/shellChrome.css`

- [ ] **Step 1: Create `src/renderer/chrome/gameMenu.ts`**

Opens and closes the menu, handles Escape and presses outside it, and runs Quit. New game and Offer tactical battles keep their existing handlers in `openRouterControls.ts`, which find their elements by id.

Create `src/renderer/chrome/gameMenu.ts` with exactly this content:

```ts
/**
 * The game menu under the top bar's menu button: New game, the placeholders, Offer tactical battles, and Quit.
 *
 * The menu is a disclosure popup. The button's `aria-expanded` and the menu's `hidden` attribute always agree.
 * New game and Offer tactical battles keep their own handlers in `openRouterControls.ts`; this module only opens
 * and closes the menu and handles Quit.
 */
import { dismissStaleControlTooltip } from './controlTooltip';

/**
 * Id of the menu element.
 *
 * Purpose: One place for the id shared with `static/index.html`.
 * When to use: Every lookup of the menu in this module.
 * Expected outcome: Matches the markup.
 * Exceptions: None.
 */
const GAME_MENU_ID = 'game-menu';

/**
 * Id of the top-bar button that opens the menu.
 *
 * Purpose: One place for the id shared with `static/index.html`.
 * When to use: Every lookup of the button in this module.
 * Expected outcome: Matches the markup.
 * Exceptions: None.
 */
const GAME_MENU_BUTTON_ID = 'game-menu-btn';

/**
 * Reports whether the game menu is open.
 *
 * Purpose: Key and pointer handlers act only while the menu shows.
 * When to use: Before handling Escape or an outside press.
 * Expected outcome: True when the menu element exists and is not hidden.
 * Exceptions: None.
 */
export function isGameMenuOpen(): boolean {
  const menu = document.getElementById(GAME_MENU_ID);
  return menu !== null && !menu.hidden;
}

/**
 * Opens the game menu.
 *
 * Purpose: Shows the menu under its button.
 * When to use: From the menu button's click handler.
 * Expected outcome: The menu shows and the button reports `aria-expanded="true"`.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function openGameMenu(): void {
  const menu = document.getElementById(GAME_MENU_ID);
  const button = document.getElementById(GAME_MENU_BUTTON_ID);
  if (!menu || !button) return;
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
}

/**
 * Closes the game menu.
 *
 * Purpose: Every way of leaving the menu ends here, so the button and the menu never disagree.
 * When to use: After a menu item runs, on Escape, on a press outside the menu, and when pointer input is switched off.
 *   Pass `restoreFocus` only for Escape.
 * Expected outcome: The menu hides, the button reports `aria-expanded="false"`, and a tip for a hidden item is dismissed.
 *   With `restoreFocus`, focus returns to the menu button. Calling it while the menu is closed changes nothing.
 * Exceptions: None.
 */
export function closeGameMenu(options: { readonly restoreFocus?: boolean } = {}): void {
  const menu = document.getElementById(GAME_MENU_ID);
  const button = document.getElementById(GAME_MENU_BUTTON_ID);
  if (!menu || !button || menu.hidden) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  dismissStaleControlTooltip();
  if (options.restoreFocus) button.focus();
}

/**
 * Wires the menu button, the menu items, Escape, outside presses, and Quit.
 *
 * Purpose: One bootstrap for the menu's own behavior.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: The button toggles the menu. It does not open while the top bar ignores the pointer. An enabled
 *   menu button closes it after its own handler runs; the checkbox leaves it open. Escape closes it first, before
 *   the map's Escape handling, and returns focus to the button. A press outside the menu and its button closes it.
 *   Quit closes the window.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function wireGameMenu(): void {
  const menu = document.getElementById(GAME_MENU_ID);
  const button = document.getElementById(GAME_MENU_BUTTON_ID);
  if (!menu || !button) return;

  button.addEventListener('click', () => {
    const topbar = document.getElementById('app-topbar');
    if (topbar instanceof HTMLElement && topbar.style.pointerEvents === 'none') return;
    if (isGameMenuOpen()) closeGameMenu();
    else openGameMenu();
  });

  menu.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest('button');
    if (item && !(item as HTMLButtonElement).disabled) closeGameMenu();
  });

  document.getElementById('game-menu-quit-btn')?.addEventListener('click', () => {
    window.close();
  });

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isGameMenuOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      closeGameMenu({ restoreFocus: true });
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!isGameMenuOpen()) return;
      const target = event.target instanceof Node ? event.target : null;
      if (target && (menu.contains(target) || button.contains(target))) return;
      closeGameMenu();
    },
    true
  );
}
```

- [ ] **Step 2: Edit `src/renderer/chrome/frameTooltipText.ts`**

Adds the tips for the menu button, Quit, and Save game.

In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
export const opponentHomeStatTooltipText = "Hexes of the opponent's home region that you hold, out of all its hexes.";
```

Replace it with:

```ts
export const opponentHomeStatTooltipText = "Hexes of the opponent's home region that you hold, out of all its hexes.";

/**
 * Purpose: Names what the game menu holds.
 * When to use: `#game-menu-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const gameMenuButtonTooltipText =
  'Open the game menu to start a new game, choose whether Ready offers tactical battles, or quit.';

/**
 * Purpose: Says Quit closes the app.
 * When to use: `#game-menu-quit-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const quitTooltipText = 'Close Agent Wars.';

/**
 * Purpose: Says saving to a file is not available, and that the match in progress is still kept.
 * When to use: The tip host around `#game-menu-save-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const saveGameUnavailableTooltipText =
  'Saving to a file is not available in this version. The match in progress is kept on disk between sessions.';
```

- [ ] **Step 3: Edit `static/index.html`**

Edit 1 adds the menu button at the left of the top bar. Edit 2 adds the menu after the top bar. Edit 3 changes the Model tab's tip. Edit 4 removes New and Tactical battles from the Model tab; both now live in the menu, with their ids.

1. In `static/index.html`, find this line. It occurs exactly once:

```html
  <header id="app-topbar" aria-label="Match status">
```

Replace it with:

```html
  <header id="app-topbar" aria-label="Match status">
    <button type="button" id="game-menu-btn" class="topbar-icon-btn topbar-menu-btn" aria-label="Game menu" aria-haspopup="true" aria-expanded="false" aria-controls="game-menu" data-control-tooltip="Open the game menu to start a new game, choose whether Ready offers tactical battles, or quit."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12"></path></svg></button>
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
  </header>
  <!-- #app-body holds the map (#canvas-container) and the console (#sidebar) side by side. -->
```

Replace them with:

```html
  </header>
  <div id="game-menu" class="game-menu" role="group" aria-label="Game menu" hidden>
    <button type="button" id="openrouter-new-btn" class="game-menu-item" data-control-tooltip="Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"></path></svg>New game…</button>
    <span class="control-tooltip-host game-menu-host" data-control-tooltip="Saving to a file is not available in this version. The match in progress is kept on disk between sessions."><button type="button" id="game-menu-save-btn" class="game-menu-item" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h8l3 3v8h-11zM5 2.5v3.5h5V2.5M5 13.5V9.5h6v4"></path></svg>Save game…</button></span>
    <span class="control-tooltip-host game-menu-host" data-control-tooltip="Load game is not available in this version."><button type="button" id="game-menu-load-btn" class="game-menu-item" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h4.5l1.5 1.5h7v7.5h-13z"></path></svg>Load game…</button></span>
    <div class="game-menu-separator" aria-hidden="true"></div>
    <label class="game-menu-item game-menu-check" data-control-tooltip="Leave this checked if you want Ready to let you fight one melee. Uncheck it to skip that list and resolve melee as Ignore."><input type="checkbox" id="openrouter-tactical-battles" checked />Offer tactical battles</label>
    <span class="control-tooltip-host game-menu-host" data-control-tooltip="How to play is not available in this version."><button type="button" id="game-menu-how-to-play-btn" class="game-menu-item" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3h4.5a1.5 1.5 0 0 1 1.5 1.5V14a1.5 1.5 0 0 0-1.5-1.5H2.5zM13.5 3H9a1.5 1.5 0 0 0-1.5 1.5M13.5 3v9.5H9a1.5 1.5 0 0 0-1.5 1.5"></path></svg>How to play</button></span>
    <div class="game-menu-separator" aria-hidden="true"></div>
    <button type="button" id="game-menu-quit-btn" class="game-menu-item" data-control-tooltip="Close Agent Wars."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8v6M4.4 4.3a5 5 0 1 0 7.2 0"></path></svg>Quit</button>
  </div>
  <!-- #app-body holds the map (#canvas-container) and the console (#sidebar) side by side. -->
```

3. In `static/index.html`, find this line. It occurs exactly once:

```html
          <button type="button" id="openrouter-tab-model" role="tab" aria-selected="true" aria-controls="openrouter-model-panel" data-control-tooltip="Show the API key, model, reasoning effort, and the controls for opponent planning and a new match.">Model</button>
```

Replace it with:

```html
          <button type="button" id="openrouter-tab-model" role="tab" aria-selected="true" aria-controls="openrouter-model-panel" data-control-tooltip="Show the API key, model, reasoning effort, and the Run control for opponent planning.">Model</button>
```

4. In `static/index.html`, find these lines. Together they occur exactly once:

```html
              <button type="button" id="openrouter-new-btn" class="openrouter-tool-toggle" aria-label="Start a new game" data-control-tooltip="Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one.">New</button>
              <span class="control-tooltip-host" data-control-tooltip="Choose how much reasoning this model uses. You only see levels this model offers, its default is marked, and the list stays unavailable when it has fewer than two."><select id="openrouter-reasoning-effort" aria-label="Reasoning effort" disabled>
                <option value="">Model default</option>
              </select></span>
              <div class="openrouter-inline-checkbox openrouter-model-grid-checkbox" data-control-tooltip="Leave this checked if you want Ready to let you fight one melee. Uncheck it to skip that list and resolve melee as Ignore.">
                <input
                  type="checkbox"
                  id="openrouter-tactical-battles"
                  checked
                />
                <label for="openrouter-tactical-battles">Tactical battles</label>
              </div>
```

Replace them with:

```html
              <span class="control-tooltip-host" data-control-tooltip="Choose how much reasoning this model uses. You only see levels this model offers, its default is marked, and the list stays unavailable when it has fewer than two."><select id="openrouter-reasoning-effort" aria-label="Reasoning effort" disabled>
                <option value="">Model default</option>
              </select></span>
```

- [ ] **Step 4: Edit `static/shellChrome.css`**

The model row loses its New button and checkbox, so its grid drops a column and the checkbox rules go.

1. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  grid-template-columns: minmax(0, 1fr) auto auto auto;
```

Replace it with:

```css
  grid-template-columns: minmax(0, 1fr) auto auto;
```

2. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
.openrouter-model-grid-checkbox {
  grid-column: 2 / -1;
}
.openrouter-model-grid-checkbox label {
  white-space: nowrap;
}
.openrouter-inline-checkbox {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.45rem;
}
.openrouter-inline-checkbox input[type="checkbox"] {
  margin: 0;
  flex-shrink: 0;
}
.openrouter-inline-checkbox label {
  margin: 0;
  font-weight: normal;
}
/* The model dropdown sets this row's height. Refresh, Run, and New stretch to that border box. */
```

Replace them with:

```css
/* The model dropdown sets this row's height. Refresh and Run stretch to that border box. */
```

- [ ] **Step 5: Edit `static/frameChrome.css`**

Adds the menu button and menu styles, and hides the menu with the rest of the frame while the new-game overlay is open.

1. In `static/frameChrome.css`, find this line. It occurs exactly once:

```css
/* App frame: the top bar, the row that holds the map and the console, and the console's tab rail and footer. Colors and sizes come from the tokens in shellChrome.css. */
```

Replace it with:

```css
/* App frame: the top bar, the row that holds the map and the console, the console's tab rail and footer, and the game menu. Colors and sizes come from the tokens in shellChrome.css. */
```

2. In `static/frameChrome.css`, find this line. It occurs exactly once:

```css
body:has(#game-over-overlay:not(.hidden)) #app-topbar,
```

Replace it with:

```css
body:has(#game-over-overlay:not(.hidden)) #app-topbar,
body:has(#game-over-overlay:not(.hidden)) #game-menu,
```

3. In `static/frameChrome.css`, find this line. It occurs exactly once:

```css
  border-color: var(--chrome-divider);
```

Replace it with:

```css
  border-color: var(--chrome-divider);
}
.topbar-menu-btn {
  border-left: 0;
  border-right: 1px solid var(--button-border);
  background: var(--button-bg);
}
.topbar-menu-btn:hover,
.topbar-menu-btn[aria-expanded="true"] {
  background: var(--button-bg-hover);
```

4. In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
    max-width: 120px;
  }
}
```

Replace them with:

```css
    max-width: 120px;
  }
}

/* ---------- Game menu ---------- */
.game-menu {
  position: fixed;
  left: 0;
  top: var(--topbar-height);
  z-index: 7050;
  width: 248px;
  padding: 6px 0;
  display: flex;
  flex-direction: column;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  color-scheme: dark;
  border: 1px solid var(--chrome-border);
  border-top: 0;
  border-radius: 0 0 6px 0;
  box-shadow: 0 8px 28px rgba(8, 14, 22, 0.45);
}
/* `display: flex` above would otherwise override the hidden attribute. */
.game-menu[hidden] {
  display: none;
}
.game-menu-host {
  display: flex;
}
.game-menu-item {
  width: 100%;
  height: 34px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--chrome-text);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.game-menu-item:hover {
  background: var(--chrome-bg-raised);
}
.game-menu-item:disabled {
  background: transparent;
  color: var(--chrome-disabled);
}
.game-menu-check input[type="checkbox"] {
  width: 15px;
  height: 15px;
}
.game-menu-separator {
  height: 1px;
  margin: 6px 0;
  background: var(--chrome-divider);
}
```

- [ ] **Step 6: Edit `src/renderer/core/uiState.ts`**

Switching pointer input off closes the menu, and the overlay's focus handling covers the menu.

1. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
import { renderTopBarStatus } from '../chrome/topBar';
```

Replace it with:

```ts
import { renderTopBarStatus } from '../chrome/topBar';
import { closeGameMenu } from '../chrome/gameMenu';
```

2. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: The minimap, the legend, the top bar, and the console are not on screen while that overlay is open. A focused control would still take keys, and a tip for the New button would stay up over the map.
 * When to use: When that overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: Focus leaves the minimap, the legend, the top bar, or the console. A dialog control that already has focus is left alone. A tip whose control has no box is dismissed.
```

Replace them with:

```ts
 * Purpose: The minimap, the legend, the top bar, the game menu, and the console are not on screen while that overlay is open. A focused control would still take keys, and a tip for New game would stay up over the map.
 * When to use: When that overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: Focus leaves the minimap, the legend, the top bar, the game menu, or the console. A dialog control that already has focus is left alone. A tip whose control has no box is dismissed.
```

3. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
      || active.closest('#app-topbar') != null
```

Replace it with:

```ts
      || active.closest('#app-topbar') != null
      || active.closest('#game-menu') != null
```

4. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Children of the map pane other than those two overlays ignore the pointer while `enabled` is false. The top bar and the console match. While the new-game form is hidden, the main map takes the pointer again so drag and the wheel still move the preview.
```

Replace it with:

```ts
 * Expected outcome: Children of the map pane other than those two overlays ignore the pointer while `enabled` is false. The top bar and the console match, and the game menu closes. While the new-game form is hidden, the main map takes the pointer again so drag and the wheel still move the preview.
```

5. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
  }
  syncNewGameDialogMapPointer();
```

Replace them with:

```ts
  }
  if (!enabled) closeGameMenu();
  syncNewGameDialogMapPointer();
```

- [ ] **Step 7: Edit `src/renderer/map/initCore.ts`**

The map's hover tooltip also clears when the pointer enters the menu.

1. In `src/renderer/map/initCore.ts`, find this line. It occurs exactly once:

```ts
   * Dismisses map hover tooltip state when the pointer enters the console or the top bar.
```

Replace it with:

```ts
   * Dismisses map hover tooltip state when the pointer enters the console, the top bar, or the game menu.
```

2. In `src/renderer/map/initCore.ts`, find these lines. Together they occur exactly once:

```ts
   * When to use: Wired once at init; runs on every `pointerenter` into the console or the top bar.
   * Expected outcome: Tooltip timer cleared, `#hex-tooltip` hidden, and map hover preview state cleared.
   * Exceptions: None.
   */
  for (const chromeId of ['sidebar', 'app-topbar']) {
```

Replace them with:

```ts
   * When to use: Wired once at init; runs on every `pointerenter` into the console, the top bar, or the game menu.
   * Expected outcome: Tooltip timer cleared, `#hex-tooltip` hidden, and map hover preview state cleared.
   * Exceptions: None.
   */
  for (const chromeId of ['sidebar', 'app-topbar', 'game-menu']) {
```

- [ ] **Step 8: Edit `src/renderer/renderer.ts`**

Wires the menu once at startup.

1. In `src/renderer/renderer.ts`, find this line. It occurs exactly once:

```ts
import { wireConsoleFrame } from './chrome/consoleFrame';
```

Replace it with:

```ts
import { wireConsoleFrame } from './chrome/consoleFrame';
import { wireGameMenu } from './chrome/gameMenu';
```

2. In `src/renderer/renderer.ts`, find this line. It occurs exactly once:

```ts
  wireConsoleFrame();
```

Replace it with:

```ts
  wireConsoleFrame();
  wireGameMenu();
```

- [ ] **Step 9: Edit `src/renderer/chrome/controlTooltipText.ts`**

The Model tab's tip no longer mentions a new match, and two comments name the menu.

1. In `src/renderer/chrome/controlTooltipText.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Says which opponent and match controls the tab shows.
```

Replace it with:

```ts
 * Purpose: Says which opponent controls the tab shows.
```

2. In `src/renderer/chrome/controlTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
export const modelTabTooltipText =
  'Show the API key, model, reasoning effort, and the controls for opponent planning and a new match.';
```

Replace them with:

```ts
export const modelTabTooltipText = 'Show the API key, model, reasoning effort, and the Run control for opponent planning.';
```

3. In `src/renderer/chrome/controlTooltipText.ts`, find this line. It occurs exactly once:

```ts
 * When to use: `#openrouter-new-btn`.
```

Replace it with:

```ts
 * When to use: `#openrouter-new-btn`, the game menu's New game item.
```

4. In `src/renderer/chrome/controlTooltipText.ts`, find this line. It occurs exactly once:

```ts
 * When to use: The wrapper around `#openrouter-tactical-battles`.
```

Replace it with:

```ts
 * When to use: The game-menu label around `#openrouter-tactical-battles`.
```

- [ ] **Step 10: Edit `src/renderer/entryCallbacks.ts`**

Comments only: New now lives in the game menu. `openNewGameOverlayFromModelTab` keeps its name; renaming it is outside this milestone.

1. In `src/renderer/entryCallbacks.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: The overlay and the right panel share the window width. Leaflet keeps the previous container size until a resize.
```

Replace it with:

```ts
 * Purpose: The overlay hides the top bar and the console, so the map's size changes. Leaflet keeps the previous container size until a resize.
```

2. In `src/renderer/entryCallbacks.ts`, find these lines. Together they occur exactly once:

```ts
 * Opens the new-game dialog from the Model tab, and resizes the map when it actually opens.
 *
 * Purpose: The right panel leaves the layout when that dialog opens. The map has to take the freed width before the preview fits.
 * When to use: The Model tab's New button.
```

Replace them with:

```ts
 * Opens the new-game dialog from the game menu, and resizes the map when it actually opens.
 *
 * Purpose: The top bar and the console leave the layout when that dialog opens. The map has to take the freed space before the preview fits.
 * When to use: The game menu's New game item (`#openrouter-new-btn`).
```

- [ ] **Step 11: Edit `src/renderer/gameplay/newGame.ts`**

Comments only.

In `src/renderer/gameplay/newGame.ts`, find these lines. Together they occur exactly once:

```ts
 * Opens the new-game dialog mid-match from the Model tab.
 *
 * Purpose: Lets the player abandon the current match; stops pending AI work first so it cannot land on the new one.
 * When to use: The Model tab's New game button.
```

Replace them with:

```ts
 * Opens the new-game dialog mid-match from the game menu.
 *
 * Purpose: Lets the player abandon the current match; stops pending AI work first so it cannot land on the new one.
 * When to use: The game menu's New game item.
```

- [ ] **Step 12: Edit `src/renderer/gameplay/newGameRegionUi.ts`**

Comment only.

In `src/renderer/gameplay/newGameRegionUi.ts`, find this line. It occurs exactly once:

```ts
 * When to use: At renderer startup, when the overlay goes from hidden to shown, and when New opens it from the Model tab.
```

Replace it with:

```ts
 * When to use: At renderer startup, when the overlay goes from hidden to shown, and when New game in the game menu opens it.
```

- [ ] **Step 13: Edit `src/main/main.ts`**

Hides Electron's File/Edit/View bar. Alt still shows it, and its keyboard shortcuts still work.

In `src/main/main.ts`, find this line. It occurs exactly once:

```ts
    minHeight: MIN_WINDOW_HEIGHT,
```

Replace it with:

```ts
    minHeight: MIN_WINDOW_HEIGHT,
    // The game menu in the top bar replaces Electron's default menu bar. Alt still shows it, and its shortcuts still work.
    autoHideMenuBar: true,
```

- [ ] **Step 14: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

Adds the menu scenes and checks, the three menu placeholders, and the menu to the elements hidden during a new game.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
  consoleExpandedAgain: 'console-expanded-again',
```

Replace it with:

```js
  consoleExpandedAgain: 'console-expanded-again',
  gameMenuOpen: 'game-menu-open',
  gameMenuEscape: 'game-menu-escape',
  gameMenuOutside: 'game-menu-outside',
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
    needs: ['#sidebar', '#app-topbar'],
```

Replace it with:

```js
    needs: ['#sidebar', '#app-topbar', '#game-menu'],
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
    scenes: [SCENES.strategic],
    needs: ['#topbar-settings-btn', '#topbar-help-btn', '#console-tab-build', '#console-tab-forces'],
```

Replace them with:

```js
    scenes: [SCENES.strategic, SCENES.gameMenuOpen],
    needs: [
      '#topbar-settings-btn',
      '#topbar-help-btn',
      '#console-tab-build',
      '#console-tab-forces',
      '#game-menu-save-btn',
      '#game-menu-load-btn',
      '#game-menu-how-to-play-btn',
    ],
```

4. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
      return problems.length === 0 ? null : problems.join('; ');
    },
  },
]);

```

Replace them with:

```js
      return problems.length === 0 ? null : problems.join('; ');
    },
  },
  {
    name: 'game-menu-opens',
    scenes: [SCENES.gameMenuOpen],
    needs: ['#game-menu', '#game-menu-btn', '#openrouter-new-btn', '#openrouter-tactical-battles'],
    run: (p, el) => {
      const m = el('#game-menu');
      if (!m.shown) return 'the game menu is not shown';
      if (el('#game-menu-btn').expanded !== 'true') return `menu button aria-expanded is "${el('#game-menu-btn').expanded}"`;
      if (!(near(m.x, 0) && near(m.y, TOPBAR_HEIGHT))) return `game menu is at ${fmt(m)}, expected its top-left at 0,${TOPBAR_HEIGHT}`;
      const moved = ['#openrouter-new-btn', '#openrouter-tactical-battles'].filter((selector) => !el(selector).ancestorIds.includes('game-menu'));
      return moved.length === 0 ? null : `not inside #game-menu: ${moved.join(', ')}`;
    },
  },
  {
    name: 'game-menu-escape-closes',
    scenes: [SCENES.gameMenuEscape],
    needs: ['#game-menu', '#game-menu-btn'],
    run: (p, el) => {
      if (el('#game-menu').shown) return 'Escape left the game menu open';
      if (el('#game-menu-btn').expanded !== 'false') return `menu button aria-expanded is "${el('#game-menu-btn').expanded}"`;
      return p.activeElementId === 'game-menu-btn' ? null : `focus is on "${p.activeElementId}", expected the menu button`;
    },
  },
  {
    name: 'game-menu-outside-click-closes',
    scenes: [SCENES.gameMenuOutside],
    needs: ['#game-menu', '#game-menu-btn'],
    run: (p, el) => (!el('#game-menu').shown && el('#game-menu-btn').expanded === 'false' ? null : 'a click outside the menu left it open'),
  },
]);

```

- [ ] **Step 15: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Opens the menu, closes it with Escape and with a click outside, and opens New through the menu.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * Expected outcome: The console's Opponent tab and its Model sub-tab are selected, New is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
  await page.click('#console-tab-opponent');
  await page.click('#openrouter-tab-model');
```

Replace them with:

```js
 * Expected outcome: The game menu is opened, New game is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
  await page.click('#game-menu-btn');
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js

  await openNewGameOverlay(page);
```

Replace them with:

```js

  await page.click('#game-menu-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.gameMenuOpen);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.gameMenuEscape);
  await page.click('#game-menu-btn');
  await page.waitForTimeout(SETTLE_MS.click);
  // Empty top-bar space is outside the menu, and a click there does nothing else.
  await page.click('#app-topbar .topbar-spacer');
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.gameMenuOutside);

  await openNewGameOverlay(page);
```

- [ ] **Step 16: Create `doc/ux/game-menu.md`**

From here to the end, the steps update `doc/` in the same change. This step adds the element document for the game menu.

Create `doc/ux/game-menu.md` with exactly this content:

````markdown
# Game Menu

The menu under the top bar's menu button: New game, Save game, Load game, Offer tactical battles, How to play, and Quit.

## Purpose

Keep match-level actions that the player uses rarely in one place, out of the way of turn play.

## Availability

The menu button is on the [top bar](top-bar.md), so the menu can open wherever the top bar accepts pointer input: Strategic planning, Tactical planning, and Resolution playback. It closes, and cannot open, while the tactical battles list or the annihilation dialog is open. It is not on screen in New game or Game over.

## Information Displayed

A popup under the menu button, in this order:

- New game…
- Save game…, disabled in this version.
- Load game…, disabled in this version.
- A separator.
- Offer tactical battles, a checkbox, checked by default.
- How to play, disabled in this version.
- A separator.
- Quit.

Control tips for these items are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks the menu button, the menu opens. A second click closes it.
- When the player clicks New game…, the menu closes and the new-game overlay opens. New game works during strategic planning, tactical planning, and resolution playback. Opponent planning and playback stop immediately. See [new-game-dialog.md](new-game-dialog.md).
- When the player changes Offer tactical battles, the menu stays open. Later Ready resolutions either show the tactical battles list or skip it and resolve melee as Ignore. The choice survives a restart. See [tactical-battles-list.md](tactical-battles-list.md).
- When the player clicks Quit, the menu closes and the window closes. On Windows and Linux the app quits. On macOS the app stays in the dock.
- A press anywhere outside the menu and its button closes the menu.
- The disabled items do nothing.

### Keyboard

- Escape closes the menu and moves focus to the menu button. While the menu is open, Escape does not also close a build popup or a stack callout. See [input-map.md](input-map.md).

### Other

- Opening the new-game overlay closes the menu.
- When the tactical battles list or the annihilation dialog opens, the menu closes.

## States

- Closed: the start state. The menu button reports that the menu is collapsed.
- Open: the popup shows under the button, and the button reports that it is expanded.

## Invariants

- The menu button's expanded state and the popup's visibility always agree.
- Unchecking Offer tactical battles never opens the tactical battles list.
- A disabled item never runs an action.

## Strategic and Tactical Differences

None. The menu works the same in both theaters.

## Related Documents

- [top-bar.md](top-bar.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [new-game-dialog.md](new-game-dialog.md)
- [tactical-battles-list.md](tactical-battles-list.md)
- [right-panel-model-tab.md](right-panel-model-tab.md)
- [input-map.md](input-map.md)

## Known Deviations

None.

## Open Questions

- On macOS, Quit closes the window and leaves the app running in the dock. A full quit would need a main-process call.

## Code Entry Points

- `static/index.html` (`#game-menu-btn`, `#game-menu`, `#openrouter-new-btn`, `#game-menu-save-btn`, `#game-menu-load-btn`, `#openrouter-tactical-battles`, `#game-menu-how-to-play-btn`, `#game-menu-quit-btn`)
- `static/frameChrome.css`
- `src/renderer/chrome/gameMenu.ts`
- `src/renderer/openRouter/openRouterControls.ts` (New game and Offer tactical battles handlers)
- `src/renderer/gameplay/newGame.ts` (`openNewGameOverlayFromModelTab`)
- `src/renderer/gameplay/tacticalBattlePromptPreference.ts`
- `src/renderer/core/uiState.ts` (`setMainUIControlsEnabled`)
````

- [ ] **Step 17: Replace `doc/ux/top-bar.md`**

Replace the whole file `doc/ux/top-bar.md` with exactly this content:

````markdown
# Top Bar

The bar across the top of the window. It holds the game menu button, the two sides, four match readouts, the date block, and the Settings and Help buttons.

## Purpose

Show the match's standing and its date at a glance, without opening a panel, and give one place to reach the game menu.

## Availability

Shown in Strategic planning, Resolution playback, Tactical planning, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list or the annihilation dialog is open, it stays visible and does not receive pointer input.

## Information Displayed

From left to right:

- The game menu button. See [game-menu.md](game-menu.md).
- The two sides: a teal mark and the human side's name, "vs", then a rose mark and the opponent's name. A long name ends in an ellipsis. With no match loaded, each name is an em dash.
- Production: `+N` and "/turn". N is the sum of the current urban count of every strategic hex the human player controls, leaving out neutral-border hexes.
- Forces: units the human player has fielded, then "/" and the most this game size allows across the four unit types. The numbers come from `getMaxUnitsPerType` in `src/shared/gameSize.ts`.
- Your home: hexes of the human home region that the human player controls, then "/" and the hexes in that region.
- Enemy home: hexes of the opponent's home region that the human player controls, then "/" and the hexes in that region.
- The date block, on two lines. The first line is the match date, such as "March, Year 1" on the global map or "March 8th, Year 1" on a regional map. The second line is "Turn N · Planning" outside a battle. In a battle it is "Beat N · Tactical planning" while the player drafts and "Beat N · Tactical resolution" while a beat resolves or plays back, and the first line ends with the battle's weather icon and word when the weather bonus is on. With no match loaded, both lines are an em dash.
- Settings and Help. Both are disabled in this version.
- Below a 1360 px window, the captions Production, Forces, Your home, and Enemy home hide and the numbers stay. Below 1100 px, each side's name is shortened sooner.
- Control tips for the readouts and the buttons are in [control-tooltips.md](control-tooltips.md). The Forces tip lists each unit type against its cap.

## Inputs and Responses

### Mouse

- When the player clicks the game menu button, the game menu opens or closes. See [game-menu.md](game-menu.md).
- The sides, the readouts, and the date block do not respond to clicks.

### Keyboard

- None for the bar itself. Escape closes the game menu. See [input-map.md](input-map.md).

### Other

- The sides, the readouts, and the date block refresh with each game-state snapshot, on tactical entry and exit, after a tactical Ready commit, and when beat playback ends.

## States

- Match loaded: names, readouts, and the date block show the match.
- No match: em dashes, and the readout suffixes are empty.
- Pointer input off: the tactical battles list or Tactical annihilation.
- Absent: New game and Game over.

## Invariants

- The sides, the readouts, and the date block are display only. They never change game state.
- During a battle, the two date-block lines never describe different theaters.
- The bar's height never changes with the window width; captions and names give way instead.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Second date-block line | Strategic turn and phase | Battle beat and tactical phase |
| First date-block line | Match date | Match date, then the battle's weather when the weather bonus is on |
| Readouts | Strategic snapshot | The same strategic snapshot; a battle does not change them |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [game-menu.md](game-menu.md)
- [right-panel.md](right-panel.md)
- [control-tooltips.md](control-tooltips.md)
- [home region rules](../region-vs-region.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`)
- `static/frameChrome.css`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, `setMainUIControlsEnabled`)
- `src/shared/topBarStats.ts`
- `src/shared/topBarDateBlock.ts`
````

- [ ] **Step 18: Edit `doc/ux/right-panel-model-tab.md`**

1. In `doc/ux/right-panel-model-tab.md`, find these lines. Together they occur exactly once:

````markdown
The API key, model choice, reasoning effort, Run, New, and the Tactical battles checkbox, on the right panel's Opponent tab.

## Purpose

Let the player connect a model, start or stop opponent planning, and open a new match.
````

Replace them with:

````markdown
The API key, model choice, reasoning effort, and Run, on the right panel's Opponent tab. New game and Offer tactical battles are in the [game menu](game-menu.md).

## Purpose

Let the player connect a model and start or stop opponent planning.
````

2. In `doc/ux/right-panel-model-tab.md`, find these lines. Together they occur exactly once:

````markdown
- A refresh control labeled "Refresh model list". It, Run, and New are the same height as the model dropdown beside them.
- A Run button. It stays unavailable until both a key and a model are set.
- A New button labeled "New".
- A reasoning effort dropdown on the row directly below the model dropdown, at the same width. It lists only the selected model's reasoning levels, as "High" and so on, and marks the model's default level "(default)". When the model has no default level, or no levels at all, an extra first option reads "Model default". The dropdown is disabled when the model offers fewer than two levels, and before models load.
- A Tactical battles checkbox, checked by default, to the right of the reasoning dropdown and directly below the refresh control. When it is unchecked, the tactical battles list does not appear and melee resolves as if the player chose Ignore every time.
- Control tips for this tab's fields, buttons, checkbox, and dropdowns are in [control-tooltips.md](control-tooltips.md). The model dropdown keeps the model description tooltip and does not use those tips.
````

Replace them with:

````markdown
- A refresh control labeled "Refresh model list". It and Run are the same height as the model dropdown beside them.
- A Run button. It stays unavailable until both a key and a model are set.
- A reasoning effort dropdown on the row directly below the model dropdown, at the same width. It lists only the selected model's reasoning levels, as "High" and so on, and marks the model's default level "(default)". When the model has no default level, or no levels at all, an extra first option reads "Model default". The dropdown is disabled when the model offers fewer than two levels, and before models load.
- Control tips for this tab's fields, buttons, and dropdowns are in [control-tooltips.md](control-tooltips.md). The model dropdown keeps the model description tooltip and does not use those tips.
````

3. In `doc/ux/right-panel-model-tab.md`, delete these lines, including the line break at the end. Together they occur exactly once:

````markdown
- When the player clicks New, the new-game overlay opens. See [new-game-dialog.md](new-game-dialog.md). New works during strategic planning, tactical planning, and resolution playback. Opponent planning and playback stop immediately. The annihilation dialog and the tactical battles list still have to be answered first.
- When the player changes Tactical battles, later Ready resolutions either show the tactical battles list or skip it. See [tactical-battles-list.md](tactical-battles-list.md).
````

4. In `doc/ux/right-panel-model-tab.md`, delete this line, including the line break at the end. It occurs exactly once:

````markdown
- Tactical battles checked or unchecked: only the later melee prompt changes.
````

5. In `doc/ux/right-panel-model-tab.md`, delete this line, including the line break at the end. It occurs exactly once:

````markdown
- Unchecking Tactical battles never opens the tactical battles list.
````

6. In `doc/ux/right-panel-model-tab.md`, find these lines. Together they occur exactly once:

````markdown
- [new-game-dialog.md](new-game-dialog.md)
- [tactical-battles-list.md](tactical-battles-list.md)
````

Replace them with:

````markdown
- [game-menu.md](game-menu.md)
````

7. In `doc/ux/right-panel-model-tab.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#openrouter-model-panel`, `#openrouter-key`, `#openrouter-cost`, `#openrouter-model`, `#openrouter-refresh-models`, `#openrouter-run-btn`, `#openrouter-new-btn`, `#openrouter-reasoning-effort`, `#openrouter-tactical-battles`, `#model-description-tooltip`)
````

Replace it with:

````markdown
- `static/index.html` (`#openrouter-model-panel`, `#openrouter-key`, `#openrouter-cost`, `#openrouter-model`, `#openrouter-refresh-models`, `#openrouter-run-btn`, `#openrouter-reasoning-effort`, `#model-description-tooltip`)
````

8. In `doc/ux/right-panel-model-tab.md`, delete these lines, including the line break at the end. Together they occur exactly once:

````markdown
- `src/renderer/gameplay/tacticalBattlePromptPreference.ts`
- `src/renderer/gameplay/newGame.ts`
````

- [ ] **Step 19: Edit `doc/ux/ai-activity-log.md`**

1. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
- Stopping opponent planning writes one ordinary line, and only when that stop aborted a call, or when New found a deferred consult still waiting. A second stop that aborts nothing does not add another line. Leaving a battle does not add a line merely because a strategic consult is still pending. The sentences are `Opponent planning stopped: Run was turned off.`, `Opponent planning stopped: the model changed.`, `Opponent planning stopped for a new game.`, `Opponent planning stopped: you left the battle.`, and `Opponent planning stopped.`
````

Replace it with:

````markdown
- Stopping opponent planning writes one ordinary line, and only when that stop aborted a call, or when New game found a deferred consult still waiting. A second stop that aborts nothing does not add another line. Leaving a battle does not add a line merely because a strategic consult is still pending. The sentences are `Opponent planning stopped: Run was turned off.`, `Opponent planning stopped: the model changed.`, `Opponent planning stopped for a new game.`, `Opponent planning stopped: you left the battle.`, and `Opponent planning stopped.`
````

2. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
- When a new match starts, from startup, New, or game over, the log clears, together with the cost readout reset on the Model tab.
````

Replace it with:

````markdown
- When a new match starts, from startup, New game, or game over, the log clears, together with the cost readout reset on the Model tab.
````

- [ ] **Step 20: Edit `doc/ux/modes-and-transitions.md`**

1. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
The player sees the new-game overlay. The message is "Start the global game when ready." or "Start the regional game when ready." when no match is loaded, and "Start a new global game when ready." or "Start a new regional game when ready." when the player opened the overlay from the Model tab during a match. The sentence follows the selected tab. A win or loss does not. The button reads "Start game". Global and Regional tabs sit under the message. Global chooses a home region for each side. Regional chooses one region and a different side group for each side. Game size, fog of war, a level (Off, Low, or High) for each of the origin bonus, tech bonus, terrain bonus, and weather bonus, and a starting month sit outside the tabs. The top bar and the right panel are not on screen, and the map fills the window. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview, and a click, double-click, or right-click does not select, order, or change the selection. Ready is disabled. The map behind the overlay shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md). The dialog sits at the minimap's usual corner, with no dark veil. The minimap, the terrain legend, and the map's + and − zoom control are hidden. This mode ends when Start game succeeds and a match is loaded.
````

Replace it with:

````markdown
The player sees the new-game overlay. The message is "Start the global game when ready." or "Start the regional game when ready." when no match is loaded, and "Start a new global game when ready." or "Start a new regional game when ready." when the player opened the overlay from the game menu during a match. The sentence follows the selected tab. A win or loss does not. The button reads "Start game". Global and Regional tabs sit under the message. Global chooses a home region for each side. Regional chooses one region and a different side group for each side. Game size, fog of war, a level (Off, Low, or High) for each of the origin bonus, tech bonus, terrain bonus, and weather bonus, and a starting month sit outside the tabs. The top bar and the right panel are not on screen, and the map fills the window. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview, and a click, double-click, or right-click does not select, order, or change the selection. Ready is disabled. The map behind the overlay shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md). The dialog sits at the minimap's usual corner, with no dark veil. The minimap, the terrain legend, and the map's + and − zoom control are hidden. This mode ends when Start game succeeds and a match is loaded.
````

2. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
The player sees a dialog titled "Tactical Battles (N)", where N is the number of candidate hexes. Each row offers a choice, the hex information, a human unit summary, and an AI unit summary. Fight stays disabled until a row is chosen. Ignore is always available. A dimmed backdrop covers the window, and the dialog is centered on the visible map area rather than on the map plus the right panel. The map, the top bar, and the right panel stay as they were when Ready paused, and they do not receive pointer input. This dialog opens after Ready when the match reports melee candidates and the Tactical battles checkbox is checked. When that checkbox is unchecked, the dialog does not open and the turn continues as if the player chose Ignore.
````

Replace it with:

````markdown
The player sees a dialog titled "Tactical Battles (N)", where N is the number of candidate hexes. Each row offers a choice, the hex information, a human unit summary, and an AI unit summary. Fight stays disabled until a row is chosen. Ignore is always available. A dimmed backdrop covers the window, and the dialog is centered on the visible map area rather than on the map plus the right panel. The map, the top bar, and the right panel stay as they were when Ready paused, and they do not receive pointer input. This dialog opens after Ready when the match reports melee candidates and Offer tactical battles is checked in the game menu. When it is unchecked, the dialog does not open and the turn continues as if the player chose Ignore.
````

3. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
  StrategicPlanning --> NewGame: New
````

Replace it with:

````markdown
  StrategicPlanning --> NewGame: New game
````

4. In `doc/ux/modes-and-transitions.md`, find these lines. Together they occur exactly once:

````markdown
  ResolutionPlayback --> NewGame: New
  ResolutionPlayback --> TacticalPlanning: battle entry cancels playback
  TacticalPlanning --> NewGame: New
````

Replace them with:

````markdown
  ResolutionPlayback --> NewGame: New game
  ResolutionPlayback --> TacticalPlanning: battle entry cancels playback
  TacticalPlanning --> NewGame: New game
````

5. In `doc/ux/modes-and-transitions.md`, find these lines. Together they occur exactly once:

````markdown
- Strategic planning -> New game: New on the Model tab. Opponent planning and any playback stop immediately. The match is replaced when Start succeeds.
- Resolution playback -> New game: New on the Model tab, in either theater. Playback stops.
- Tactical planning -> New game: New on the Model tab. The battle preview stops. The annihilation dialog and the tactical battles list do not accept New.
- Strategic planning -> Tactical battles list: Ready reports melee candidates and the Tactical battles checkbox is checked.
- Strategic planning -> Resolution playback: Ready succeeds and the turn has movement or combat to animate. If the Tactical battles checkbox is unchecked, melee is ignored without the list.
````

Replace them with:

````markdown
- Strategic planning -> New game: New game in the game menu. Opponent planning and any playback stop immediately. The match is replaced when Start succeeds.
- Resolution playback -> New game: New game in the game menu, in either theater. Playback stops.
- Tactical planning -> New game: New game in the game menu. The battle preview stops. The annihilation dialog and the tactical battles list do not accept New game; the game menu closes and stays closed while either is open.
- Strategic planning -> Tactical battles list: Ready reports melee candidates and Offer tactical battles is checked in the game menu.
- Strategic planning -> Resolution playback: Ready succeeds and the turn has movement or combat to animate. If Offer tactical battles is unchecked, melee is ignored without the list.
````

6. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
- Opening New during a match discards the stash instead of restoring it.
````

Replace it with:

````markdown
- Opening New game during a match discards the stash instead of restoring it.
````

7. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
- The new-game overlay and the game-over overlay are the same surface. Only the message and the button label change. The three entry texts stay distinct so the player can tell startup, New, and game over apart.
````

Replace it with:

````markdown
- The new-game overlay and the game-over overlay are the same surface. Only the message and the button label change. The three entry texts stay distinct so the player can tell startup, New game, and game over apart.
````

8. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
- Unchecking Tactical battles never opens the tactical battles list. Melee resolves as Ignore.
````

Replace it with:

````markdown
- Unchecking Offer tactical battles never opens the tactical battles list. Melee resolves as Ignore.
````

- [ ] **Step 21: Edit `doc/ux/new-game-dialog.md`**

1. In `doc/ux/new-game-dialog.md`, find these lines. Together they occur exactly once:

````markdown
Opens in New game and in Game over. See [modes-and-transitions.md](modes-and-transitions.md). It opens at startup when no match is loaded, when the player clicks New, and when the match ends. It cannot be dismissed without starting a match. The top bar and the right panel are not on screen while it is open, including while the form is hidden, and the map fills the window. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview.

## Information Displayed

- A message: "Start the global game when ready." or "Start the regional game when ready." at startup, "Start a new global game when ready." or "Start a new regional game when ready." after New, and "You win!" or "You lose." The startup and New sentences follow the selected tab. Game over does not.
````

Replace them with:

````markdown
Opens in New game and in Game over. See [modes-and-transitions.md](modes-and-transitions.md). It opens at startup when no match is loaded, when the player clicks New game in the game menu, and when the match ends. It cannot be dismissed without starting a match. The top bar and the right panel are not on screen while it is open, including while the form is hidden, and the map fills the window. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview.

## Information Displayed

- A message: "Start the global game when ready." or "Start the regional game when ready." at startup, "Start a new global game when ready." or "Start a new regional game when ready." after New game, and "You win!" or "You lose." The startup and New game sentences follow the selected tab. Game over does not.
````

2. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- A button labeled "Start game" when no match is loaded or when New opened the overlay, and "New game" when the match is over.
````

Replace it with:

````markdown
- A button labeled "Start game" when no match is loaded or when New game opened the overlay, and "New game" when the match is over.
````

3. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- Open for a new match: no match, or the player clicked New.
````

Replace it with:

````markdown
- Open for a new match: no match, or the player clicked New game.
````

4. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- The startup, New, and game-over messages stay distinct from each other.
````

Replace it with:

````markdown
- The startup, New game, and game-over messages stay distinct from each other.
````

5. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
New opens this overlay during strategic planning, tactical planning, and resolution playback in either theater. It does not open while the tactical annihilation dialog is open, or while the tactical battles list is open, because those dialogs already take the window. Opening it stops opponent planning and playback immediately. The current match is replaced when Start succeeds. Starting a match ends any tactical session and returns to Strategic planning.
````

Replace it with:

````markdown
New game, in the game menu, opens this overlay during strategic planning, tactical planning, and resolution playback in either theater. It does not open while the tactical annihilation dialog is open, or while the tactical battles list is open, because those dialogs already take the window. Opening it stops opponent planning and playback immediately. The current match is replaced when Start succeeds. Starting a match ends any tactical session and returns to Strategic planning.
````

- [ ] **Step 22: Edit `doc/ux/tactical-battles-list.md`**

1. In `doc/ux/tactical-battles-list.md`, find this line. It occurs exactly once:

````markdown
Opens in the Tactical battles list mode, after Ready reports melee candidates and the Tactical battles checkbox is checked. A dimmed backdrop covers the window, and the panel is centered on the visible map area (not on the map plus the right panel). The panel follows the map area when the window resizes. On a small map area the panel shrinks to fit, and a long list scrolls inside it. The map, the top bar, and the right panel stay visible underneath and do not receive pointer input. Markers that were already on the map are not refreshed until the dialog closes. When that checkbox is unchecked, the dialog does not open and the turn continues as Ignore. See [modes-and-transitions.md](modes-and-transitions.md) and [right-panel-model-tab.md](right-panel-model-tab.md).
````

Replace it with:

````markdown
Opens in the Tactical battles list mode, after Ready reports melee candidates and Offer tactical battles is checked in the game menu. A dimmed backdrop covers the window, and the panel is centered on the visible map area (not on the map plus the right panel). The panel follows the map area when the window resizes. On a small map area the panel shrinks to fit, and a long list scrolls inside it. The map, the top bar, and the right panel stay visible underneath and do not receive pointer input. Markers that were already on the map are not refreshed until the dialog closes. When that checkbox is unchecked, the dialog does not open and the turn continues as Ignore. See [modes-and-transitions.md](modes-and-transitions.md) and [game-menu.md](game-menu.md).
````

2. In `doc/ux/tactical-battles-list.md`, find this line. It occurs exactly once:

````markdown
- The dialog never opens while the Tactical battles checkbox is unchecked.
````

Replace it with:

````markdown
- The dialog never opens while Offer tactical battles is unchecked.
````

- [ ] **Step 23: Edit `doc/ux/input-map.md`**

1. In `doc/ux/input-map.md`, find this line. It occurs exactly once:

````markdown
| Shift | Key down or up | Key down refreshes an open stack callout. Key up closes it, including one that is scheduled but not open yet. Shift-click on a unit icon whose hex has one selectable human unit toggles that unit and does not open the callout. Shift-click on an icon with two or more selectable human units, or with none, schedules the callout when a plain click would, and does not toggle a unit. | [selection-model.md](selection-model.md) |
````

Replace it with:

````markdown
| Shift | Key down or up | Key down refreshes an open stack callout. Key up closes it, including one that is scheduled but not open yet. Shift-click on a unit icon whose hex has one selectable human unit toggles that unit and does not open the callout. Shift-click on an icon with two or more selectable human units, or with none, schedules the callout when a plain click would, and does not toggle a unit. | [selection-model.md](selection-model.md) |
| Escape | Game menu open | Closes the game menu and moves focus to its button. Does nothing else. | [game-menu.md](game-menu.md) |
````

2. In `doc/ux/input-map.md`, find this line. It occurs exactly once:

````markdown
- Escape closes the build popup before the stack callout. While the tactical battles list is open, Escape only chooses Ignore. A build popup or stack callout under the dialog stays as it is.
````

Replace it with:

````markdown
- Escape closes the game menu first, then the build popup, then the stack callout. While the tactical battles list is open, Escape only chooses Ignore. A build popup or stack callout under the dialog stays as it is.
````

- [ ] **Step 24: Edit `doc/how-to-play.md`**

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Turning battles off:** uncheck **Tactical battles** on the Model tab. Every melee then resolves as if you chose **Ignore**.
````

Replace it with:

````markdown
- **Turning battles off:** open the game menu (top left) and uncheck **Offer tactical battles**. Every melee then resolves as if you chose **Ignore**.
````

- [ ] **Step 25: Edit `doc/ux/control-tooltips.md`**

1. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Run before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back. It also includes every disabled placeholder: Settings and Help in the top bar, and the Build and Forces tabs. The top bar's four readouts show a tip the same way, though they are not controls.
````

Replace it with:

````markdown
The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Run before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back. It also includes every disabled placeholder: Settings and Help in the top bar, Save game, Load game, and How to play in the game menu, and the Build and Forces tabs. The top bar's four readouts show a tip the same way, though they are not controls.
````

2. In `doc/ux/control-tooltips.md`, find these lines. Together they occur exactly once:

````markdown
- Model tab: Show the API key, model, reasoning effort, and the controls for opponent planning and a new match.
- Orders tab: Show the selected unit and the orders queued for this turn or beat.
- Opponent tab: Show the opponent's model, its tools, and the AI activity log.
- Settings, Help, Build, and Forces: "<name> is not available in this version.", for example "Settings is not available in this version."
````

Replace them with:

````markdown
- Model tab: Show the API key, model, reasoning effort, and the Run control for opponent planning.
- Orders tab: Show the selected unit and the orders queued for this turn or beat.
- Opponent tab: Show the opponent's model, its tools, and the AI activity log.
- Settings, Help, Load game, How to play, Build, and Forces: "<name> is not available in this version.", for example "Settings is not available in this version."
````

3. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Enemy home readout: Hexes of the opponent's home region that you hold, out of all its hexes.
````

Replace it with:

````markdown
- Enemy home readout: Hexes of the opponent's home region that you hold, out of all its hexes.
- Game menu button: Open the game menu to start a new game, choose whether Ready offers tactical battles, or quit.
- Quit: Close Agent Wars.
- Save game: Saving to a file is not available in this version. The match in progress is kept on disk between sessions.
````

4. In `doc/ux/control-tooltips.md`, find these lines. Together they occur exactly once:

````markdown
- New: Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one.
- Reasoning effort: Choose how much reasoning this model uses. You only see levels this model offers, its default is marked, and the list stays unavailable when it has fewer than two.
- Tactical battles: Leave this checked if you want Ready to let you fight one melee. Uncheck it to skip that list and resolve melee as Ignore.
````

Replace them with:

````markdown
- New game in the game menu: Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one.
- Reasoning effort: Choose how much reasoning this model uses. You only see levels this model offers, its default is marked, and the list stays unavailable when it has fewer than two.
- Offer tactical battles: Leave this checked if you want Ready to let you fight one melee. Uncheck it to skip that list and resolve melee as Ignore.
````

- [ ] **Step 26: Edit `doc/ux-specification.md`**

1. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| The top bar, its readouts, or its date block | [modes-and-transitions.md](ux/modes-and-transitions.md) | [top-bar.md](ux/top-bar.md) |
````

Replace it with:

````markdown
| The top bar, its readouts, or its date block | [modes-and-transitions.md](ux/modes-and-transitions.md) | [top-bar.md](ux/top-bar.md) |
| The game menu, New game, or Offer tactical battles | [modes-and-transitions.md](ux/modes-and-transitions.md), [input-map.md](ux/input-map.md) | [game-menu.md](ux/game-menu.md) |
````

2. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| API key, model, reasoning effort, Run, New, or Tactical battles | [modes-and-transitions.md](ux/modes-and-transitions.md), [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [right-panel-model-tab.md](ux/right-panel-model-tab.md) |
````

Replace it with:

````markdown
| API key, model, reasoning effort, or Run | [modes-and-transitions.md](ux/modes-and-transitions.md), [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [right-panel-model-tab.md](ux/right-panel-model-tab.md) |
````

3. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [top-bar.md](ux/top-bar.md): the bar across the top: the two sides, the Production, Forces, and home readouts, and the date block.
````

Replace it with:

````markdown
- [top-bar.md](ux/top-bar.md): the bar across the top: the two sides, the Production, Forces, and home readouts, and the date block.
- [game-menu.md](ux/game-menu.md): the menu under the top bar's menu button: New game, Offer tactical battles, Quit, and the disabled placeholders.
````

4. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [right-panel-model-tab.md](ux/right-panel-model-tab.md): API key, model, reasoning effort, Run, New, the Tactical battles checkbox, and the model description tooltip.
````

Replace it with:

````markdown
- [right-panel-model-tab.md](ux/right-panel-model-tab.md): API key, model, reasoning effort, Run, and the model description tooltip.
````

5. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| Top bar | Hidden | Shown | Disabled | Changed | Changed | Disabled | Hidden |
````

Replace it with:

````markdown
| Top bar | Hidden | Shown | Disabled | Changed | Changed | Disabled | Hidden |
| Game menu | Hidden | Shown | Hidden | Shown | Shown | Hidden | Hidden |
````

- [ ] **Step 27: Edit `doc/ui-style-guide.md`**

1. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar and the right panel's frame and tab rail are in `static/frameChrome.css`. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

Replace it with:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar, the right panel's frame and tab rail, and the game menu are in `static/frameChrome.css`. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

2. In `doc/ui-style-guide.md`, find these lines. Together they occur exactly once:

````markdown
| Panel, popup, tooltip, and toast bg | `#1b2838` | Right panel, legend, hex tooltip, control tips, stack callout, build popup, new-game box, tactical-battles dialog, lower-right update toast, and upper-right message toast |
| Chrome text / muted | `#f4f6f8` / `#b7c4d4` | Off-white body; blue-gray for secondary lines |
| Chrome error text | `#f0a8a8` | On the navy surfaces only |
| Button face / border / hover | `#115e59` / `#7dcec8` / `#3a6a8f` | Every button, styled like Ready, with white text. The Randomize AI home region button keeps the opponent rose. The home-region and starting-month randomize buttons match their dropdowns' height. The model-list refresh button matches the Run and New buttons beside it |
````

Replace them with:

````markdown
| Panel, popup, tooltip, and toast bg | `#1b2838` | Right panel, game menu, legend, hex tooltip, control tips, stack callout, build popup, new-game box, tactical-battles dialog, lower-right update toast, and upper-right message toast |
| Chrome text / muted | `#f4f6f8` / `#b7c4d4` | Off-white body; blue-gray for secondary lines |
| Chrome error text | `#f0a8a8` | On the navy surfaces only |
| Button face / border / hover | `#115e59` / `#7dcec8` / `#3a6a8f` | Every button, styled like Ready, with white text. The Randomize AI home region button keeps the opponent rose. The home-region and starting-month randomize buttons match their dropdowns' height. The model-list refresh button matches the Run button beside it |
````

3. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
- **Live app:** A 44 px bar: the two sides, the Production, Forces, Your home, and Enemy home readouts, then the date and turn on two lines, and disabled Settings and Help buttons. Captions hide below a 1360 px window. See [ux/top-bar.md](ux/top-bar.md).
````

Replace it with:

````markdown
- **Live app:** A 44 px bar: the game menu button, the two sides, the Production, Forces, Your home, and Enemy home readouts, then the date and turn on two lines, and disabled Settings and Help buttons. Captions hide below a 1360 px window. See [ux/top-bar.md](ux/top-bar.md).
````

## Verify

- [ ] **Step 28: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 29: Full tests**

Run the full tests. Expected: exit 0, test total **843**, failure total **0**.

- [ ] **Step 30: Exact match**

This proves that every file this plan creates or edits, except the files named after the table, matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" doc/how-to-play.md doc/ui-style-guide.md doc/ux-specification.md doc/ux/control-tooltips.md doc/ux/game-menu.md doc/ux/input-map.md doc/ux/new-game-dialog.md doc/ux/right-panel-model-tab.md doc/ux/tactical-battles-list.md scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke.cjs src/main/main.ts src/renderer/chrome/controlTooltipText.ts src/renderer/core/uiState.ts src/renderer/entryCallbacks.ts src/renderer/gameplay/newGame.ts src/renderer/gameplay/newGameRegionUi.ts src/renderer/map/initCore.ts src/renderer/renderer.ts static/frameChrome.css static/shellChrome.css
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `doc/how-to-play.md` | `13fdaa5192a47ff5` |
| `doc/ui-style-guide.md` | `bbde7b3e1912cef5` |
| `doc/ux-specification.md` | `55cbf67b4afb74c2` |
| `doc/ux/control-tooltips.md` | `34b2135d4a353dd3` |
| `doc/ux/game-menu.md` | `5193150b6d7c7da2` |
| `doc/ux/input-map.md` | `9abbc0b022b03ed7` |
| `doc/ux/new-game-dialog.md` | `07085649e886300d` |
| `doc/ux/right-panel-model-tab.md` | `59d7f79ef7adc219` |
| `doc/ux/tactical-battles-list.md` | `97a2bdbfdfc76e37` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `5779df7e8aa311be` |
| `scripts/ui-smoke/ui-smoke.cjs` | `5113dee589c67a60` |
| `src/main/main.ts` | `3d89fd53b2b3796e` |
| `src/renderer/chrome/controlTooltipText.ts` | `0b3a1e3e2c88fe42` |
| `src/renderer/core/uiState.ts` | `76d318659de9d6b9` |
| `src/renderer/entryCallbacks.ts` | `a38fe283dbe549ce` |
| `src/renderer/gameplay/newGame.ts` | `0db9e2445db9bd5e` |
| `src/renderer/gameplay/newGameRegionUi.ts` | `e592a7ca3ab4363b` |
| `src/renderer/map/initCore.ts` | `260fac71d839cfff` |
| `src/renderer/renderer.ts` | `91a069e6588f0248` |
| `static/frameChrome.css` | `e095031772c6f277` |
| `static/shellChrome.css` | `5e9426050a6cdf88` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

These files are left out of this check. Write them as this plan shows. Do not stop because they have no hash.

- `doc/ux/top-bar.md`. The recorded hash was for a copy that said the Production total equals what a building city is credited. That sentence was removed, as in plan 4. The code entry list also names `#topbar-stat-production-suffix`.
- `static/index.html` carries that suffix span from plan 4.
- `src/renderer/chrome/gameMenu.ts`. The menu button does not open while the top bar's pointer events are `none`, so the keyboard cannot open it during the tactical battles list or the annihilation dialog.
- `doc/ux/modes-and-transitions.md`. The invariant now says "Offer tactical battles", which is the checkbox's label.
- `doc/ux/ai-activity-log.md` still has plan 3's wording that the log stays visible while the panel is expanded.
- `src/renderer/chrome/frameTooltipText.ts` still has the summary line added on `unavailableTooltipText` in plan 2.

- [ ] **Step 31: Smoke run**

```powershell
npm run ui:smoke -- --label game-menu
```

Expected summary line. The recorded run used `F:\Projects\Personal\agent-wars-public`. Another checkout is fine when the counts match and the path ends in `.test\ui-smoke\game-menu`.

```text
ui-smoke game-menu: 111 passed, 0 failed, 0 page errors, 12 screenshots in <repository>\.test\ui-smoke\game-menu
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/game-menu/report.json`.

- [ ] **Step 32: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/game-menu/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast.

- `09-game-menu-open.png` against [ui-facelift-frame-5-expected-menu.png](ui-facelift-frame-5-expected-menu.png): The menu under its button: New game…, dimmed Save game… and Load game…, Offer tactical battles checked, dimmed How to play, and Quit.
- `05-opponent-tab.png` against [ui-facelift-frame-5-expected-opponent.png](ui-facelift-frame-5-expected-opponent.png): The model row holds the model list, refresh, and Run; the reasoning list sits under the model list. There is no New button and no Tactical battles checkbox.
- `02-strategic-1280x720.png` against [ui-facelift-frame-step.png](ui-facelift-frame-step.png): The final frame. Compare the arrangement only: the menu button, the top bar, the console on Orders with today's lists, the rail, Ready in the footer, and today's minimap and legend at the upper left. The mockup uses a stand-in font and a static map, so colors, fonts, and the map can differ.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 29.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 32.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. The menu opens and closes with its button, with Escape (focus returns to the button), and with a click outside it. The three disabled items show their tips.
2. Uncheck Offer tactical battles, then choose Quit. Start the app again with `npm start`: the box is still unchecked. Check it again.
3. New game… opens the new-game overlay; the top bar, the console, and the menu disappear. Start a Regional game: the top bar shows readable side names. Then use New game… again to start a Global game.
4. The File/Edit/View bar is hidden. Alt shows it, and Ctrl+R still reloads the window.
5. While the tactical battles list or the annihilation dialog is open, the menu button does not open the menu, with the mouse or the keyboard.
6. On macOS only, Quit closes the window and leaves the app in the dock (the spec's Open Questions). Do not add an IPC quit.

Spec disagreements. Follow this plan.

- Save game's tip is "Saving to a file is not available in this version. The match in progress is kept on disk between sessions." The spec's placeholder tip is "<Name> is not available in this version." Load game's tip drops the ellipsis in the name ("Load game is not available in this version."). How to play uses the short form with its own name.
- Production's number and its tip still disagree, as in plan 4. Do not reconcile them.
- The spec asks for a hand check that a pointer near the top of the map is converted with the map container's bounds. None of these five plans include that check.
- Step 32 compares the final frame's arrangement with the mockup. Colors, fonts, and the map may differ. That is this plan's gate.
- `src/renderer/gameplay/tacticalBattlePromptPreference.ts` still says the checkbox is on the Model tab. Do not edit that file. The checkbox keeps its id and its saved value.

## Next

This completes the spec's Phase 2. Keep the `.test/ui-smoke/game-menu/` screenshots: the plan for the next phase compares against them.
