# UI Facelift Frame, Plan 2 of 5: Top Bar and Docked Console

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Move the app into its new frame: a 44 px top bar with the two sides and the date block, and a console docked on the right with a tab rail (Orders, Opponent, and disabled Build and Forces) and a footer that holds Ready. Today's right-panel contents move in unchanged.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 2 of the five that build the spec's Phase 2; [ui-facelift-frame-execution-plan.md](ui-facelift-frame-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- The page becomes a column: the top bar, then a row with the map and the console.
- The top bar shows the sides, the date block ("September, Year 1" over "Turn 1 · Planning"), and disabled Settings and Help buttons.
- The console keeps the id `sidebar`. Orders holds today's upper panel, Opponent holds today's lower panel, and Ready sits in the footer.
- Two fixes the new layout needs: the AI activity log scrolls to its newest line when the Opponent tab is shown, and control tips near the window's right or bottom edge open toward the inside of the window.
- The old Phase and Turn lines and `src/shared/sidebarPhaseLabel.ts` are replaced by `src/shared/topBarDateBlock.ts`.
- The smoke harness gains the frame's checks, and `doc/` describes the new frame.

**Out of scope:**

- Collapsing the console (plan 3), the top-bar readouts (plan 4), and the game menu (plan 5). New and Tactical battles stay on the Model tab until plan 5.

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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Decisions, Compatibility Names, Frame, Top Bar, and Console.
2. In `doc/`: `ux-specification.md`, then `ux/right-panel.md`, `ux/right-panel-command-bar.md`, `ux/modes-and-transitions.md`, `ux/control-tooltips.md`, and `ui-style-guide.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 1 is in and this plan is not:

```powershell
Test-Path scripts/ui-smoke/ui-smoke.cjs
Test-Path src/renderer/chrome/consoleFrame.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **834**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files:

- `doc/how-to-play.md`
- `doc/ui-style-guide.md`
- `doc/ux-specification.md`
- `doc/ux/ai-activity-log.md`
- `doc/ux/control-tooltips.md`
- `doc/ux/modes-and-transitions.md`
- `doc/ux/new-game-dialog.md`
- `doc/ux/resolution-playback.md`
- `doc/ux/right-panel-command-bar.md`
- `doc/ux/right-panel-model-tab.md`
- `doc/ux/right-panel-selection-and-orders.md`
- `doc/ux/right-panel-tools-tab.md`
- `doc/ux/right-panel.md`
- `doc/ux/tactical-battles-list.md`
- `doc/ux/top-bar.md`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/chrome/controlTooltip.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `src/renderer/chrome/selectTabPanel.ts`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/renderer.ts`
- `src/shared/topBarDateBlock.test.ts`
- `src/shared/topBarDateBlock.ts`
- `static/frameChrome.css`
- `static/index.html`
- `static/shellChrome.css`
- `src/shared/sidebarPhaseLabel.test.ts` (deleted)
- `src/shared/sidebarPhaseLabel.ts` (deleted)

- [ ] **Step 1: Create `static/frameChrome.css`**

All styles for the new frame live in this new file: the top bar, the row that holds the map and the console, the console grid, its tab rail, and its footer. Later plans add the collapse, readout, and game-menu rules.

Create `static/frameChrome.css` with exactly this content:

```css
/* App frame: the top bar, the row that holds the map and the console, and the console's tab rail and footer. Colors and sizes come from the tokens in shellChrome.css. */

/* ---------- Shared ---------- */
/* Line icons in the frame: 16px, drawn with the text color so disabled and hover states need no extra rules. */
.chrome-icon {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* The match chrome leaves the window while the new-game overlay is open, so the map fills it as before. */
body:has(#game-over-overlay:not(.hidden)) #app-topbar,
body:has(#game-over-overlay:not(.hidden)) #sidebar {
  display: none;
}

/* ---------- Top bar ---------- */
#app-topbar {
  flex: 0 0 var(--topbar-height);
  height: var(--topbar-height);
  position: relative;
  z-index: 6300;
  display: flex;
  align-items: stretch;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  background: var(--chrome-bg-deep);
  color: var(--chrome-text);
  color-scheme: dark;
  border-bottom: 1px solid var(--chrome-border);
}
#app-topbar.main-ui-disabled {
  opacity: 0.65;
  transition: opacity 0.15s ease;
}
/* A tip host in the bar takes the full bar height so its button does too. */
#app-topbar > .control-tooltip-host {
  display: flex;
  align-items: stretch;
  flex: none;
}
.topbar-icon-btn {
  flex: none;
  width: var(--topbar-height);
  height: 100%;
  padding: 0;
  border: 0;
  border-left: 1px solid var(--chrome-divider);
  border-radius: 0;
  background: transparent;
  color: var(--chrome-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.topbar-icon-btn:hover {
  background: var(--chrome-bg-raised);
}
.topbar-icon-btn:disabled {
  background: transparent;
  color: var(--chrome-disabled);
  border-color: var(--chrome-divider);
}
.topbar-sides {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
  padding: 0 14px;
}
.topbar-side-name {
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13.5px;
  font-weight: 600;
}
.topbar-vs {
  color: var(--chrome-muted);
  font-size: 12px;
}
.topbar-side-mark {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.topbar-side-mark-human {
  background: var(--player-human);
  box-shadow: 0 0 0 2px var(--chrome-accent-edge);
}
.topbar-side-mark-opponent {
  background: var(--player-opponent);
  box-shadow: 0 0 0 2px var(--chrome-opponent-edge);
}
.topbar-spacer {
  flex: 1 1 auto;
  min-width: 8px;
}
.topbar-date-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  padding: 0 14px;
  border-left: 1px solid var(--chrome-divider);
}
.topbar-date {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}
.topbar-turn-phase {
  color: var(--chrome-muted);
  font-size: 11px;
  line-height: 1;
}
/* Narrow windows shorten each side's name sooner. */
@media (max-width: 1099px) {
  .topbar-side-name {
    max-width: 120px;
  }
}

/* ---------- Map and console row ---------- */
#app-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: row;
}

/* ---------- Console ---------- */
/* Two columns while expanded: the active tab's content, then the tab rail on the outer edge. The footer sits under the content. */
#sidebar.console {
  width: calc(var(--console-content-width) + var(--console-rail-width));
  min-width: calc(var(--console-content-width) + var(--console-rail-width));
  height: 100%;
  flex-shrink: 0;
  position: relative;
  z-index: 6000;
  display: grid;
  grid-template-columns: var(--console-content-width) var(--console-rail-width);
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas:
    "main rail"
    "footer rail";
  background: var(--chrome-bg);
  color: var(--chrome-text);
  color-scheme: dark;
  overflow: hidden;
}
#sidebar.main-ui-disabled {
  opacity: 0.65;
  transition: opacity 0.15s ease;
}
/* Each grid cell draws its own left edge. */
.console-main {
  grid-area: main;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--chrome-border);
}
.console-header {
  flex: 0 0 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid var(--chrome-border);
}
.console-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.console-panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 1rem;
}
.console-panel[hidden] {
  display: none;
}
#console-panel-opponent:not([hidden]) {
  display: flex;
  flex-direction: column;
}
#console-panel-opponent .openrouter-log {
  min-height: 120px;
}
.console-panel > p:first-child {
  margin-top: 0;
}
/* Ranged, the strike target list, and its Cancel share one row. The row takes no space while all three are hidden. */
.console-ranged-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.35rem;
}
.console-ranged-row:not(:has(> :not([style*="display: none"]))) {
  display: none;
}
.console-rail {
  grid-area: rail;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--chrome-rail-bg);
  border-left: 1px solid var(--chrome-border);
}
.console-tab-host {
  display: flex;
  align-items: stretch;
}
.console-tab {
  flex: none;
  width: 100%;
  height: 58px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--chrome-divider);
  border-radius: 0;
  background: transparent;
  color: var(--chrome-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
}
.console-tab .chrome-icon {
  width: 18px;
  height: 18px;
}
.console-tab:hover {
  background: var(--chrome-bg-raised);
  color: var(--chrome-text);
}
.console-tab[aria-selected="true"] {
  background: var(--chrome-bg);
  color: var(--chrome-text);
  box-shadow: inset -3px 0 0 var(--chrome-accent-edge);
}
.console-tab:disabled {
  background: transparent;
  color: var(--chrome-disabled);
  opacity: 0.6;
}
.console-tab:focus {
  outline-offset: -2px;
}
.console-footer {
  grid-area: footer;
  padding: 12px;
  border-top: 1px solid var(--chrome-border);
  border-left: 1px solid var(--chrome-border);
  background: var(--chrome-bg-deep);
}
.console-footer > .control-tooltip-host {
  display: flex;
  width: 100%;
}
.console-footer #ready-btn {
  width: 100%;
  height: 46px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 4px;
}
```

- [ ] **Step 2: Edit `static/shellChrome.css`**

Edit 1 updates the file's opening comment. Edit 2 adds the frame's color and size tokens. Edit 3 makes the page a column: the top bar above, the map and the console below. Edits 4 and 5 remove the old right-panel rules, which either move to `frameChrome.css` or style ids that no longer exist.

1. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
/* Page shell: navy chrome tokens, the right-hand panel, and shared controls. */
```

Replace it with:

```css
/* Page shell: navy chrome tokens, the map pane, the AI panel's controls, and shared controls. The top bar, the console frame, and the game menu are in frameChrome.css. */
```

2. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  --field-disabled-border: #6b8a87;
```

Replace it with:

```css
  --field-disabled-border: #6b8a87;
  /* App frame: the top bar and console footer, the console's tab rail, dividers inside those bars, and the side marks. */
  --chrome-bg-deep: #121b27;
  --chrome-rail-bg: #141f2d;
  --chrome-divider: #243246;
  --player-human: #115e59;
  --player-opponent: #9d174d;
  --topbar-height: 44px;
  --console-content-width: 320px;
  --console-rail-width: 56px;
```

3. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
  display: flex;
  flex-direction: row;
  width: 100vw;
```

Replace them with:

```css
  display: flex;
  flex-direction: column;
  width: 100vw;
```

4. In `static/shellChrome.css`, delete these lines, including the line break at the end. Together they occur exactly once:

```css
#sidebar {
  width: 320px;
  min-width: 320px;
  height: 100%;
  flex-shrink: 0;
  position: relative;
  z-index: 6000;
  display: flex;
  flex-direction: column;
  padding: 0;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  color-scheme: dark;
  border-left: 1px solid var(--chrome-border);
  overflow: hidden;
}
/* Out of the row for the whole time #game-over-overlay is open, including while its form is collapsed. The map pane takes that width. The battle-result dialog is a different element. */
body:has(#game-over-overlay:not(.hidden)) #sidebar {
  display: none;
}
#sidebar.main-ui-disabled {
  opacity: 0.65;
  transition: opacity 0.15s ease;
}
#sidebar-top {
  flex: 1 1 auto;
  min-height: 0;
  padding: 1rem;
  overflow: auto;
}
#sidebar-bottom {
  flex: 0 0 40%;
  min-height: 180px;
  padding: 1rem;
  border-top: 1px solid var(--chrome-border);
  background: var(--chrome-bg);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
```

5. In `static/shellChrome.css`, delete these lines, including the line break at the end. Together they occur exactly once:

```css
}
/* Ready sits in a tip host. A shown control clears its inline display so this rule can center its label. The host and Ranged share one top edge and one height, including Strike's list and Cancel. */
#sidebar-top p:has(#ready-btn) {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  column-gap: 0.35rem;
  row-gap: 0.35rem;
}
#sidebar-top p:has(#ready-btn) > .control-tooltip-host {
  height: 1.75rem;
  align-items: stretch;
```

- [ ] **Step 3: Edit `static/index.html`**

Edit 1 loads the new stylesheet. Edit 2 adds the top bar and opens `#app-body`. Edit 3 replaces the right panel with the console and closes `#app-body`. Every existing id stays, so code that finds elements by id keeps working. The Opponent panel holds the old lower panel unchanged, Ready moves to the footer, and the Ranged row moves under "Selected unit". The map's markup keeps its indentation, which keeps this change small.

1. In `static/index.html`, find this line. It occurs exactly once:

```html
  <link rel="stylesheet" href="shellChrome.css" />
```

Replace it with:

```html
  <link rel="stylesheet" href="shellChrome.css" />
  <link rel="stylesheet" href="frameChrome.css" />
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
<body>
  <div id="canvas-container">
```

Replace them with:

```html
<body>
  <header id="app-topbar" aria-label="Match status">
    <div class="topbar-sides">
      <span class="topbar-side-mark topbar-side-mark-human" aria-hidden="true"></span>
      <span id="topbar-human-side" class="topbar-side-name">—</span>
      <span class="topbar-vs">vs</span>
      <span class="topbar-side-mark topbar-side-mark-opponent" aria-hidden="true"></span>
      <span id="topbar-opponent-side" class="topbar-side-name">—</span>
    </div>
    <div class="topbar-spacer"></div>
    <div class="topbar-date-block">
      <span id="topbar-date" class="topbar-date">—</span>
      <span id="topbar-turn-phase" class="topbar-turn-phase">—</span>
    </div>
    <span class="control-tooltip-host" data-control-tooltip="Settings is not available in this version."><button type="button" id="topbar-settings-btn" class="topbar-icon-btn" aria-label="Settings" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h6.5M12.5 4H14M2 8h1.5M7.5 8H14M2 12h8.5"></path><circle cx="10.5" cy="4" r="1.8"></circle><circle cx="5.5" cy="8" r="1.8"></circle><circle cx="12.3" cy="12" r="1.8"></circle></svg></button></span>
    <span class="control-tooltip-host" data-control-tooltip="Help is not available in this version."><button type="button" id="topbar-help-btn" class="topbar-icon-btn" aria-label="Help" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3"></circle><path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.5M8 11.4v.1"></path></svg></button></span>
  </header>
  <!-- #app-body holds the map (#canvas-container) and the console (#sidebar) side by side. -->
  <div id="app-body">
  <div id="canvas-container">
```

3. In `static/index.html`, find these lines. Together they occur exactly once:

```html
  <aside id="sidebar">
    <div id="sidebar-top">
      <h2 style="margin-top: 0;">Selected hex</h2>
      <p><strong>Game state</strong><br><span id="sidebar-phase">—</span><br><span id="sidebar-turn">—</span></p>
      <p>
        <span class="control-tooltip-host" data-control-tooltip="End this planning step and play out the orders you have queued, on the world map or in a battle. It stays unavailable while the match is over, while the opponent is still planning, or while playback is already running."><button type="button" id="ready-btn" class="ready-btn">Ready</button></span>
        <button type="button" id="ranged-attack-btn" class="ranged-btn" style="display: none;">Ranged</button>
        <select id="air-strike-target-type" class="ranged-btn" style="display: none;" data-control-tooltip="Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you cancel.">
          <option value="units">Enemy Units</option>
          <option value="urban">Production</option>
          <option value="airport">Airports</option>
          <option value="seaport">Seaports</option>
        </select>
        <button type="button" id="air-strike-cancel-btn" class="ranged-btn" style="display: none;" data-control-tooltip="Stop aiming an air strike and show Strike again. Strikes already in the list stay there.">Cancel</button>
      </p>
      <p><strong>Selected unit</strong><br><span id="sidebar-selected-unit">—</span></p>
      <p><strong>Movement orders</strong></p>
      <div id="pending-orders-list"></div>
      <p><strong>Ranged attacks</strong></p>
      <div id="ranged-attacks-list"></div>
      <p><strong>Air strikes</strong></p>
      <div id="air-strikes-list"></div>
      <p id="sidebar-error" class="chrome-error" style="font-size: 0.9em; display: none;"></p>
    </div>
    <div id="sidebar-bottom">
      <div class="openrouter-tab-bar" role="tablist" aria-label="AI panel">
        <button type="button" id="openrouter-tab-tools" role="tab" aria-selected="false" aria-controls="openrouter-tools-panel" data-control-tooltip="Show the tools the opponent can use, and turn each group on or off.">Tools</button>
        <button type="button" id="openrouter-tab-model" role="tab" aria-selected="true" aria-controls="openrouter-model-panel" data-control-tooltip="Show the API key, model, reasoning effort, and the controls for opponent planning and a new match.">Model</button>
      </div>
      <div id="openrouter-tools-panel" class="openrouter-tab-panel" role="tabpanel" aria-labelledby="openrouter-tab-tools" hidden>
        <div id="openrouter-tools-list" class="openrouter-tools-list"></div>
      </div>
      <div id="openrouter-model-panel" class="openrouter-tab-panel active" role="tabpanel" aria-labelledby="openrouter-tab-model">
        <div class="openrouter-row">
          <label for="openrouter-key">API key</label>
          <div class="openrouter-key-row">
            <input type="password" id="openrouter-key" placeholder="Set key and blur to save" autocomplete="off" data-control-tooltip="Enter your OpenRouter key, then click away or press Enter to save it. The key stays hidden after that; clear the field and leave it to forget the saved key." />
            <span id="openrouter-cost" class="openrouter-cost">$0.00</span>
          </div>
        </div>
        <div class="openrouter-row">
          <label for="openrouter-model">Model</label>
          <div class="openrouter-model-grid">
            <select id="openrouter-model">
              <option value="">— Select model —</option>
            </select>
            <button type="button" id="openrouter-refresh-models" class="openrouter-refresh-btn" aria-label="Refresh model list" data-control-tooltip="Load the model list again. If that fails, the message appears in the AI activity log."></button>
            <span class="control-tooltip-host" data-control-tooltip="Turn opponent planning on or off. Enter an API key and choose a model first."><button type="button" id="openrouter-run-btn" class="openrouter-tool-toggle" aria-pressed="false" disabled>Run</button></span>
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
          </div>
        </div>
      </div>
      <div class="openrouter-row openrouter-status-row">
        <div id="openrouter-log" class="openrouter-log" aria-label="AI interactions and errors"></div>
      </div>
    </div>
  </aside>
```

Replace them with:

```html
  <aside id="sidebar" class="console" aria-label="Console">
    <div id="console-main" class="console-main">
      <div class="console-header">
        <h2 id="console-title" class="console-title">Orders</h2>
      </div>
      <section id="console-panel-orders" class="console-panel active" role="tabpanel" aria-labelledby="console-tab-orders">
        <p><strong>Selected unit</strong><br><span id="sidebar-selected-unit">—</span></p>
        <p class="console-ranged-row">
          <button type="button" id="ranged-attack-btn" class="ranged-btn" style="display: none;">Ranged</button>
          <select id="air-strike-target-type" class="ranged-btn" style="display: none;" data-control-tooltip="Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you cancel.">
            <option value="units">Enemy Units</option>
            <option value="urban">Production</option>
            <option value="airport">Airports</option>
            <option value="seaport">Seaports</option>
          </select>
          <button type="button" id="air-strike-cancel-btn" class="ranged-btn" style="display: none;" data-control-tooltip="Stop aiming an air strike and show Strike again. Strikes already in the list stay there.">Cancel</button>
        </p>
        <p><strong>Movement orders</strong></p>
        <div id="pending-orders-list"></div>
        <p><strong>Ranged attacks</strong></p>
        <div id="ranged-attacks-list"></div>
        <p><strong>Air strikes</strong></p>
        <div id="air-strikes-list"></div>
        <p id="sidebar-error" class="chrome-error" style="font-size: 0.9em; display: none;"></p>
      </section>
      <section id="console-panel-opponent" class="console-panel" role="tabpanel" aria-labelledby="console-tab-opponent" hidden>
        <div class="openrouter-tab-bar" role="tablist" aria-label="AI panel">
          <button type="button" id="openrouter-tab-tools" role="tab" aria-selected="false" aria-controls="openrouter-tools-panel" data-control-tooltip="Show the tools the opponent can use, and turn each group on or off.">Tools</button>
          <button type="button" id="openrouter-tab-model" role="tab" aria-selected="true" aria-controls="openrouter-model-panel" data-control-tooltip="Show the API key, model, reasoning effort, and the controls for opponent planning and a new match.">Model</button>
        </div>
        <div id="openrouter-tools-panel" class="openrouter-tab-panel" role="tabpanel" aria-labelledby="openrouter-tab-tools" hidden>
          <div id="openrouter-tools-list" class="openrouter-tools-list"></div>
        </div>
        <div id="openrouter-model-panel" class="openrouter-tab-panel active" role="tabpanel" aria-labelledby="openrouter-tab-model">
          <div class="openrouter-row">
            <label for="openrouter-key">API key</label>
            <div class="openrouter-key-row">
              <input type="password" id="openrouter-key" placeholder="Set key and blur to save" autocomplete="off" data-control-tooltip="Enter your OpenRouter key, then click away or press Enter to save it. The key stays hidden after that; clear the field and leave it to forget the saved key." />
              <span id="openrouter-cost" class="openrouter-cost">$0.00</span>
            </div>
          </div>
          <div class="openrouter-row">
            <label for="openrouter-model">Model</label>
            <div class="openrouter-model-grid">
              <select id="openrouter-model">
                <option value="">— Select model —</option>
              </select>
              <button type="button" id="openrouter-refresh-models" class="openrouter-refresh-btn" aria-label="Refresh model list" data-control-tooltip="Load the model list again. If that fails, the message appears in the AI activity log."></button>
              <span class="control-tooltip-host" data-control-tooltip="Turn opponent planning on or off. Enter an API key and choose a model first."><button type="button" id="openrouter-run-btn" class="openrouter-tool-toggle" aria-pressed="false" disabled>Run</button></span>
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
            </div>
          </div>
        </div>
        <div class="openrouter-row openrouter-status-row">
          <div id="openrouter-log" class="openrouter-log" aria-label="AI interactions and errors"></div>
        </div>
      </section>
    </div>
    <nav id="console-rail" class="console-rail" role="tablist" aria-orientation="vertical" aria-label="Console tabs">
      <button type="button" id="console-tab-orders" class="console-tab" role="tab" aria-selected="true" aria-controls="console-panel-orders" data-control-tooltip="Show the selected unit and the orders queued for this turn or beat."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path></svg><span>Orders</span></button>
      <button type="button" id="console-tab-opponent" class="console-tab" role="tab" aria-selected="false" aria-controls="console-panel-opponent" data-control-tooltip="Show the opponent's model, its tools, and the AI activity log."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1"></rect><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"></path></svg><span>Opponent</span></button>
      <span class="control-tooltip-host console-tab-host" data-control-tooltip="Build is not available in this version."><button type="button" id="console-tab-build" class="console-tab" role="tab" aria-selected="false" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 14V7l4 2.2V7l4 2.2V3.5h4.5V14z"></path></svg><span>Build</span></button></span>
      <span class="control-tooltip-host console-tab-host" data-control-tooltip="Forces is not available in this version."><button type="button" id="console-tab-forces" class="console-tab" role="tab" aria-selected="false" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l5.2 2v4.1c0 3-2.2 5.3-5.2 6.3-3-1-5.2-3.3-5.2-6.3V3.8z"></path></svg><span>Forces</span></button></span>
    </nav>
    <div id="console-footer" class="console-footer">
      <span class="control-tooltip-host" data-control-tooltip="End this planning step and play out the orders you have queued, on the world map or in a battle. It stays unavailable while the match is over, while the opponent is still planning, or while playback is already running."><button type="button" id="ready-btn" class="ready-btn">Ready</button></span>
    </div>
  </aside>
  </div><!-- #app-body -->
```

- [ ] **Step 4: Create `src/shared/topBarDateBlock.ts`**

The wording rules for the top bar's two date lines, kept free of the DOM so they can be unit-tested.

Create `src/shared/topBarDateBlock.ts` with exactly this content:

```ts
/**
 * Inputs for the two lines of the top bar's date block.
 *
 * Purpose: Keeps the wording rules in one pure function that tests can cover without a DOM.
 * When to use: Built by the renderer from the latest snapshot and the battle state before each top-bar refresh.
 * Expected outcome: Every field is a plain value; no field is read from renderer state inside the formatter.
 * Exceptions: None.
 */
export interface TopBarDateBlockArgs {
  /**
   * Whether a game-state snapshot exists.
   *
   * Contract: False before the first snapshot arrives.
   * When to use: Pass `state != null`.
   * Expected outcome: False makes both lines an em dash.
   * Exceptions: None.
   */
  readonly hasGameState: boolean;
  /**
   * The match date from the snapshot, such as "March, Year 1".
   *
   * Contract: May be empty when the snapshot has no date.
   * When to use: Pass `state.currentDateLabel ?? ''`.
   * Expected outcome: Shown as the first line; an empty value shows an em dash.
   * Exceptions: None.
   */
  readonly dateLabel: string;
  /**
   * The strategic turn number.
   *
   * Contract: Used only outside a battle.
   * When to use: Pass `state.turnNumber`.
   * Expected outcome: Shown as "Turn N".
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The title-cased strategic phase, such as "Planning".
   *
   * Contract: Used only outside a battle.
   * When to use: Pass the snapshot phase after title-casing it.
   * Expected outcome: Shown after the turn number.
   * Exceptions: None.
   */
  readonly strategicPhaseLabel: string;
  /**
   * The tactical beat number while a battle is active, otherwise null.
   *
   * Contract: Non-null exactly while a tactical battle snapshot is set.
   * When to use: Pass the battle snapshot's beat number, or null.
   * Expected outcome: A number switches the second line to the battle wording.
   * Exceptions: None.
   */
  readonly battleBeat: number | null;
  /**
   * Whether a beat is resolving or playing back.
   *
   * Contract: Only read while `battleBeat` is not null.
   * When to use: Pass true while beat playback runs.
   * Expected outcome: True shows "Tactical resolution"; false shows "Tactical planning".
   * Exceptions: None.
   */
  readonly beatPlaybackActive: boolean;
}

/**
 * The two lines of the date block.
 *
 * Purpose: Lets the renderer write both lines from one call.
 * When to use: Returned by `formatTopBarDateBlock`.
 * Expected outcome: Plain text for each line.
 * Exceptions: None.
 */
export interface TopBarDateBlockText {
  /**
   * The first line: the match date.
   *
   * Contract: Plain text, never HTML.
   * When to use: Write with `textContent`.
   * Expected outcome: The date, or an em dash.
   * Exceptions: None.
   */
  readonly date: string;
  /**
   * The second line: turn and phase, or beat and battle phase.
   *
   * Contract: Plain text, never HTML.
   * When to use: Write with `textContent`.
   * Expected outcome: For example "Turn 7 · Planning" or "Beat 2 · Tactical planning".
   * Exceptions: None.
   */
  readonly turnPhase: string;
}

/**
 * Formats the top bar's date block.
 *
 * Purpose: The player reads the date first and the turn and phase second, in both theaters.
 * When to use: Every top-bar refresh.
 * Expected outcome: Em dashes with no snapshot. Outside a battle, the date and "Turn N · Phase". In a battle, the
 *   date and "Beat N · Tactical planning" or "Beat N · Tactical resolution".
 * Exceptions: None.
 */
export function formatTopBarDateBlock(args: TopBarDateBlockArgs): TopBarDateBlockText {
  if (!args.hasGameState) return { date: '—', turnPhase: '—' };
  const date = args.dateLabel.length > 0 ? args.dateLabel : '—';
  if (args.battleBeat !== null) {
    const battlePhase = args.beatPlaybackActive ? 'Tactical resolution' : 'Tactical planning';
    return { date, turnPhase: `Beat ${args.battleBeat} · ${battlePhase}` };
  }
  return { date, turnPhase: `Turn ${args.turnNumber} · ${args.strategicPhaseLabel}` };
}
```

- [ ] **Step 5: Create `src/shared/topBarDateBlock.test.ts`**

Covers no match, strategic play, both battle phases, and a missing date.

Create `src/shared/topBarDateBlock.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTopBarDateBlock, type TopBarDateBlockArgs } from './topBarDateBlock';

const strategicArgs: TopBarDateBlockArgs = {
  hasGameState: true,
  dateLabel: 'March, Year 1',
  turnNumber: 7,
  strategicPhaseLabel: 'Planning',
  battleBeat: null,
  beatPlaybackActive: false,
};

test('formatTopBarDateBlock shows em dashes when there is no game state', () => {
  assert.deepEqual(formatTopBarDateBlock({ ...strategicArgs, hasGameState: false }), { date: '—', turnPhase: '—' });
});

test('formatTopBarDateBlock shows the date and the strategic turn outside a battle', () => {
  assert.deepEqual(formatTopBarDateBlock(strategicArgs), { date: 'March, Year 1', turnPhase: 'Turn 7 · Planning' });
});

test('formatTopBarDateBlock names the beat and tactical planning in a battle', () => {
  assert.deepEqual(formatTopBarDateBlock({ ...strategicArgs, battleBeat: 2 }), {
    date: 'March, Year 1',
    turnPhase: 'Beat 2 · Tactical planning',
  });
});

test('formatTopBarDateBlock names tactical resolution while a beat plays back', () => {
  assert.equal(formatTopBarDateBlock({ ...strategicArgs, battleBeat: 2, beatPlaybackActive: true }).turnPhase, 'Beat 2 · Tactical resolution');
});

test('formatTopBarDateBlock shows an em dash for a missing date', () => {
  assert.equal(formatTopBarDateBlock({ ...strategicArgs, dateLabel: '' }).date, '—');
});
```

- [ ] **Step 6: Delete `src/shared/sidebarPhaseLabel.ts`**

`topBarDateBlock.ts` replaces this module.

Delete `src/shared/sidebarPhaseLabel.ts`:

```powershell
Remove-Item src/shared/sidebarPhaseLabel.ts
```

- [ ] **Step 7: Delete `src/shared/sidebarPhaseLabel.test.ts`**

`topBarDateBlock.test.ts` replaces this test.

Delete `src/shared/sidebarPhaseLabel.test.ts`:

```powershell
Remove-Item src/shared/sidebarPhaseLabel.test.ts
```

- [ ] **Step 8: Create `src/renderer/chrome/frameTooltipText.ts`**

Tip sentences for the new frame. They sit beside the existing catalog in `controlTooltipText.ts`, which is close to the file-size limit. As in that catalog, the static markup repeats the same characters.

Create `src/renderer/chrome/frameTooltipText.ts` with exactly this content:

```ts
/**
 * Purpose: Control tips for the app frame around the map.
 * When to use: Set `data-control-tooltip` from these values. Static markup in `static/index.html` repeats the same characters.
 * Expected outcome: The player sees the sentence unchanged.
 * Exceptions: None.
 */

/**
 * Purpose: Says what the Orders tab shows.
 * When to use: `#console-tab-orders`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const ordersTabTooltipText = 'Show the selected unit and the orders queued for this turn or beat.';

/**
 * Purpose: Says what the Opponent tab shows.
 * When to use: `#console-tab-opponent`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const opponentTabTooltipText = "Show the opponent's model, its tools, and the AI activity log.";

/**
 * Builds the tip for a control this version does not offer.
 *
 * Purpose: Says a disabled placeholder is not a broken control.
 * When to use: The tip host around each disabled placeholder, with the control's visible name, such as "Settings".
 * Expected outcome: For example "Settings is not available in this version."
 * Exceptions: None.
 */
export function unavailableTooltipText(name: string): string {
  return `${name} is not available in this version.`;
}
```

- [ ] **Step 9: Create `src/renderer/chrome/topBar.ts`**

Writes the sides and the date block. `updateGameStateSidebar` calls it, so every place that refreshed the old game-state lines now refreshes the top bar.

Create `src/renderer/chrome/topBar.ts` with exactly this content:

```ts
/**
 * The top bar's match status: the two sides and the date block.
 */
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { formatTopBarDateBlock } from '../../shared/topBarDateBlock';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import { rendererSharedState as S } from '../core/state';

/**
 * Title-cases the strategic phase id from main (`planning`, `resolution`) for the date block.
 *
 * Purpose: Keeps raw enum-style ids out of the player-facing bar while staying stable if new phases are added.
 * When to use: Only from `renderTopBarDateBlock`.
 * Expected outcome: `Planning`, `Resolution`, or a similar single word. An empty string stays empty.
 * Exceptions: None.
 */
function formatStrategicPhaseLabel(phase: string): string {
  if (!phase) return phase;
  return phase.charAt(0).toUpperCase() + phase.slice(1).toLowerCase();
}

/**
 * Writes plain text into an element found by id.
 *
 * Purpose: The bar has many single-text elements; a missing one must not stop the others.
 * When to use: Every text write in this module.
 * Expected outcome: The element's text is replaced. A missing element is skipped.
 * Exceptions: None.
 */
function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Writes the two side names.
 *
 * Purpose: The player always sees who is fighting whom.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: The human and opponent home names, or em dashes when missing.
 * Exceptions: None.
 */
function renderTopBarSides(state: GameStateSnapshot | null): void {
  setText('topbar-human-side', state?.humanHomeRegion || '—');
  setText('topbar-opponent-side', state?.aiHomeRegion || '—');
}

/**
 * Writes the date block, adding the battle's weather to the date line during a battle.
 *
 * Purpose: The player reads the date, and the turn or the beat, at a glance.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: See `formatTopBarDateBlock`. During a battle with weather, the date line ends with the weather icon and word.
 * Exceptions: None.
 */
function renderTopBarDateBlock(state: GameStateSnapshot | null): void {
  const battle = S.tacticalBattleSnapshot;
  const text = formatTopBarDateBlock({
    hasGameState: state != null,
    dateLabel: state?.currentDateLabel ?? '',
    turnNumber: state?.turnNumber ?? 0,
    strategicPhaseLabel: state ? formatStrategicPhaseLabel(state.phase) : '',
    battleBeat: battle ? battle.tacticalTurnNumber : null,
    beatPlaybackActive: S.resolutionMoveAnimation != null,
  });
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    dateEl.textContent = text.date;
    if (state && battle?.weather) dateEl.insertAdjacentHTML('beforeend', ` · ${formatWeatherIconHtml(battle.weather)}`);
  }
  setText('topbar-turn-phase', text.turnPhase);
}

/**
 * Refreshes everything the top bar shows about the match.
 *
 * Purpose: One entry point, called wherever the old game-state lines were refreshed.
 * When to use: From `updateGameStateSidebar`, after snapshots, tactical entry and exit, Ready commits, and the end of beat playback.
 * Expected outcome: The sides and the date block match `state` and the current battle. Null shows em dashes.
 * Exceptions: None.
 */
export function renderTopBarStatus(state: GameStateSnapshot | null): void {
  renderTopBarSides(state);
  renderTopBarDateBlock(state);
}
```

- [ ] **Step 10: Edit `src/renderer/openRouter/openRouterUiHelpers.ts`**

A log line added while the Opponent tab is hidden cannot scroll the log, so the newest lines would be out of view when the tab opens. `scrollOpenRouterLogToEnd` scrolls the log; the console calls it when the tab is shown, and the append path reuses it.

1. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find these lines. Together they occur exactly once:

```ts
 * Defines the `appendOpenRouterLog` function shape (export function appendOpenRouterLog(line: string, isError = false): void).

 * Purpose: Supports maintainability by documenting why `appendOpenRouterLog` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
```

Replace them with:

```ts
 * Adds one timestamped line to the AI activity log and scrolls to it.
 *
 * Purpose: The player reads model calls, retries, and errors in one running list.
 * When to use: For every AI interaction or error line the renderer reports.
 * Expected outcome: A new line with the local time and `line`, styled as an error when `isError` is true. The log
 *   scrolls to that line while it is shown. A missing log is a no-op.
```

2. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find this line. It occurs exactly once:

```ts
  el.scrollTop = el.scrollHeight;
```

Replace it with:

```ts
  scrollOpenRouterLogToEnd();
}

/**
 * Scrolls the AI activity log to its newest line.
 *
 * Purpose: A line added while the log is hidden cannot scroll it, so the log is scrolled again when it is shown.
 * When to use: After a line is appended, and each time the console's Opponent tab is shown.
 * Expected outcome: `#openrouter-log` shows its last line. A missing log is a no-op; a hidden log keeps its position.
 * Exceptions: None.
 */
export function scrollOpenRouterLogToEnd(): void {
  const el = document.getElementById('openrouter-log');
  if (el) el.scrollTop = el.scrollHeight;
```

- [ ] **Step 11: Edit `src/renderer/chrome/controlTooltip.ts`**

The console's tab rail and Ready sit at the window's right and bottom edges. Today a tip always opens below and to the right of the pointer, so tips there would be squeezed against the edge or cut off. `placeTip` opens the tip on the side where it fits.

1. In `src/renderer/chrome/controlTooltip.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * Shows the sentence near the pointer, or beside the control when focus arrived without the pointer.
```

Replace them with:

```ts
/**
 * Places the visible tip below and to the right of a point, or above or to the left of it where it would leave the window.
 *
 * Purpose: Controls at the window's right and bottom edges, such as the console's tab rail and Ready, still get a
 *   readable tip instead of one squeezed against the edge or cut off below it.
 * When to use: Each time the tip is shown or follows the pointer, after its text is set and it is not hidden.
 * Expected outcome: The tip sits `TOOLTIP_OFFSET_PX` from the point on each axis, on the side where it fits. A tip
 *   too large for either side keeps to the window's left or top edge.
 * Exceptions: None.
 */
function placeTip(el: HTMLElement, x: number, y: number): void {
  el.style.left = '0px';
  el.style.top = '0px';
  const { width, height } = el.getBoundingClientRect();
  const fitsRight = x + TOOLTIP_OFFSET_PX + width <= window.innerWidth;
  const fitsBelow = y + TOOLTIP_OFFSET_PX + height <= window.innerHeight;
  const left = fitsRight ? x + TOOLTIP_OFFSET_PX : Math.max(0, x - TOOLTIP_OFFSET_PX - width);
  const top = fitsBelow ? y + TOOLTIP_OFFSET_PX : Math.max(0, y - TOOLTIP_OFFSET_PX - height);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/**
 * Shows the sentence near the pointer, or beside the control when focus arrived without the pointer.
```

2. In `src/renderer/chrome/controlTooltip.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: The tip is visible. The hex tooltip is cleared so it does not sit underneath.
```

Replace it with:

```ts
 * Expected outcome: The tip is visible, placed by `placeTip`. The hex tooltip is cleared so it does not sit underneath.
```

3. In `src/renderer/chrome/controlTooltip.ts`, find these lines. Together they occur exactly once:

```ts
  el.style.left = `${x + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${y + TOOLTIP_OFFSET_PX}px`;
  el.classList.remove('hidden');
```

Replace them with:

```ts
  el.classList.remove('hidden');
  placeTip(el, x, y);
```

4. In `src/renderer/chrome/controlTooltip.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: A visible tip is repositioned. A hidden tip is left hidden.
```

Replace it with:

```ts
 * Expected outcome: A visible tip is repositioned by `placeTip`. A hidden tip is left hidden.
```

5. In `src/renderer/chrome/controlTooltip.ts`, find these lines. Together they occur exactly once:

```ts
  el.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
```

Replace them with:

```ts
  placeTip(el, clientX, clientY);
```

- [ ] **Step 12: Create `src/renderer/chrome/consoleFrame.ts`**

Switches console tabs and keeps the header title in step. The next plan adds collapsing.

Create `src/renderer/chrome/consoleFrame.ts` with exactly this content:

```ts
/**
 * The console docked on the right: its tab rail and its title.
 *
 * The console root keeps the id `sidebar` so existing lookups keep working.
 */
import { scrollOpenRouterLogToEnd } from '../openRouter/openRouterUiHelpers';
import { selectTabPanel, type TabPanelBinding } from './selectTabPanel';

/**
 * One enabled console tab: its button, its panel, the title shown while it is active, and what to refresh on show.
 *
 * Purpose: The rail, the panels, and the header title stay in step from one table.
 * When to use: Entries of `CONSOLE_TABS`.
 * Expected outcome: Both ids exist in `static/index.html`.
 * Exceptions: None.
 */
interface ConsoleTabBinding extends TabPanelBinding {
  /**
   * Header title while this tab is active.
   *
   * Contract: Matches the tab's visible label.
   * When to use: Written to `#console-title` when the tab becomes active.
   * Expected outcome: Plain text.
   * Exceptions: None.
   */
  readonly title: string;
  /**
   * Work to redo each time the tab's panel is shown, if any.
   *
   * Contract: Runs after the panel is visible, so it can measure and scroll.
   * When to use: Content that changes while its panel is hidden, such as the AI activity log.
   * Expected outcome: The panel shows its current state.
   * Exceptions: None.
   */
  readonly onShow?: () => void;
}

/**
 * The console's enabled tabs, in rail order. Disabled placeholder tabs are not listed.
 *
 * Purpose: The single list of tabs that can be selected.
 * When to use: Building the click handlers and calling `selectTabPanel`.
 * Expected outcome: The first entry is the tab the console opens on.
 * Exceptions: None.
 */
const CONSOLE_TABS: readonly ConsoleTabBinding[] = Object.freeze([
  { tabId: 'console-tab-orders', panelId: 'console-panel-orders', title: 'Orders' },
  { tabId: 'console-tab-opponent', panelId: 'console-panel-opponent', title: 'Opponent', onShow: scrollOpenRouterLogToEnd },
]);

/**
 * Id of the active tab button for this app session.
 *
 * Purpose: The tab choice is a per-session view choice; it is not saved.
 * When to use: Read and replaced only inside this module.
 * Expected outcome: Starts on the first tab.
 * Exceptions: None.
 */
let activeTabId: string = CONSOLE_TABS[0].tabId;

/**
 * Shows the active tab's panel and title.
 *
 * Purpose: The rail, the panels, and the title change together.
 * When to use: After every change to `activeTabId`, and once at startup.
 * Expected outcome: The active panel shows, the others hide, the title matches, and the tab's `onShow` runs.
 * Exceptions: None; missing elements are skipped.
 */
function applyConsoleState(): void {
  selectTabPanel(activeTabId, CONSOLE_TABS);
  const active = CONSOLE_TABS.find((tab) => tab.tabId === activeTabId);
  const title = document.getElementById('console-title');
  if (title && active) title.textContent = active.title;
  active?.onShow?.();
}

/**
 * Wires the rail's tabs.
 *
 * Purpose: One bootstrap for the console's own behavior.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: A tab click shows that tab's panel and title. The console starts on Orders.
 * Exceptions: None; missing elements are skipped.
 */
export function wireConsoleFrame(): void {
  for (const tab of CONSOLE_TABS) {
    document.getElementById(tab.tabId)?.addEventListener('click', () => {
      activeTabId = tab.tabId;
      applyConsoleState();
    });
  }
  applyConsoleState();
}
```

- [ ] **Step 13: Edit `src/renderer/core/uiState.ts`**

`updateGameStateSidebar` keeps its name, because other code calls it, and now writes the top bar. Pointer-input switching and the overlay's focus handling cover the top bar as well as the console.

1. In `src/renderer/core/uiState.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
import { formatSidebarPhaseText } from '../../shared/sidebarPhaseLabel';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
```

2. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts

/**
 * Title-cases the strategic phase id from main (`planning` / `resolution`) for the sidebar line.
 *
 * Purpose: Keeps raw enum-style ids out of the player-facing panel while remaining stable if new phases are added.
 * When to use: Only from `updateGameStateSidebar` when `state.phase` is present.
 * Expected outcome: `Planning`, `Resolution`, or similar single-token labels.
 * Exceptions: None; empty string passes through unchanged.
 */
function formatStrategicPhaseLabelForSidebar(phase: string): string {
  if (!phase) return phase;
  return phase.charAt(0).toUpperCase() + phase.slice(1).toLowerCase();
}
```

Replace them with:

```ts
import { renderTopBarStatus } from '../chrome/topBar';
```

3. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
 * Defines the `updateGameStateSidebar` function shape (export function updateGameStateSidebar(state: GameStateSnapshot | null): void).

 * Purpose: Refreshes phase and turn lines in the right sidebar from the latest snapshot.
 * When to use: After `applyGameStateSnapshot`, tactical entry/exit, tactical Ready commit, and when beat playback ends.
 * Expected outcome: The phase line is tactical planning or tactical resolution while a battle snapshot is set, otherwise the strategic label, or an em dash when `state` is null. `Turn:` shows the beat number while a tactical session is active, otherwise `state.turnNumber`, then the strategic date when the snapshot has one.
 * Exceptions: None.
 */
export function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  const phaseEl = document.getElementById('sidebar-phase');
  const turnEl = document.getElementById('sidebar-turn');
  if (phaseEl) {
    phaseEl.textContent = formatSidebarPhaseText({
      hasGameState: state != null,
      strategicPhaseLabel: state ? formatStrategicPhaseLabelForSidebar(state.phase) : '',
      battleActive: S.tacticalBattleSnapshot != null,
      beatPlaybackActive: S.resolutionMoveAnimation != null,
    });
  }
  if (turnEl) {
    if (!state) {
      turnEl.textContent = '—';
    } else if (S.tacticalBattleSnapshot) {
      const date = state.currentDateLabel ? ` · ${state.currentDateLabel}` : '';
      const weather = S.tacticalBattleSnapshot.weather
        ? ` · ${formatWeatherIconHtml(S.tacticalBattleSnapshot.weather)}`
        : '';
      turnEl.innerHTML = `Turn: ${S.tacticalBattleSnapshot.tacticalTurnNumber}${date}${weather}`;
    } else {
      const date = state.currentDateLabel ? ` · ${state.currentDateLabel}` : '';
      turnEl.textContent = `Turn: ${state.turnNumber}${date}`;
    }
  }
```

Replace them with:

```ts
 * Refreshes the match status in the top bar from the latest snapshot.
 *
 * Purpose: Keeps the name every caller already uses; the old Phase and Turn lines now live in the top bar.
 * When to use: After `applyGameStateSnapshot`, tactical entry/exit, tactical Ready commit, and when beat playback ends.
 * Expected outcome: The top bar's sides and date block match `state` and the current battle. Null shows em dashes.
 * Exceptions: None.
 */
export function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  renderTopBarStatus(state);
```

4. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: The minimap, the legend, and the right panel are not on screen while that overlay is open. A focused control would still take keys, and a tip for the New button would stay up over the map.
 * When to use: When that overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: Focus leaves the minimap, the legend, or the right panel. A dialog control that already has focus is left alone. A tip whose control has no box is dismissed.
```

Replace them with:

```ts
 * Purpose: The minimap, the legend, the top bar, and the console are not on screen while that overlay is open. A focused control would still take keys, and a tip for the New button would stay up over the map.
 * When to use: When that overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: Focus leaves the minimap, the legend, the top bar, or the console. A dialog control that already has focus is left alone. A tip whose control has no box is dismissed.
```

5. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
      || active.closest('#terrain-legend') != null
```

Replace it with:

```ts
      || active.closest('#terrain-legend') != null
      || active.closest('#app-topbar') != null
```

6. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
 * Turns pointer input on or off for the map and the right panel.
 *
 * Purpose: The new-game overlay and the annihilation dialog stay clickable while the match controls do not.
 * When to use: When those overlays open or close, and when the tactical battles list opens or closes.
 * Expected outcome: Children of the map pane other than those two overlays ignore the pointer while `enabled` is false. The right panel matches. While the new-game form is hidden, the main map takes the pointer again so drag and the wheel still move the preview.
```

Replace them with:

```ts
 * Turns pointer input on or off for the map, the top bar, and the console.
 *
 * Purpose: The new-game overlay and the annihilation dialog stay clickable while the match controls do not.
 * When to use: When those overlays open or close, and when the tactical battles list opens or closes.
 * Expected outcome: Children of the map pane other than those two overlays ignore the pointer while `enabled` is false. The top bar and the console match. While the new-game form is hidden, the main map takes the pointer again so drag and the wheel still move the preview.
```

7. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    (sidebar as HTMLElement).style.pointerEvents = enabled ? '' : 'none';
    sidebar.classList.toggle('main-ui-disabled', !enabled);
```

Replace them with:

```ts
  for (const id of ['app-topbar', 'sidebar']) {
    const chrome = document.getElementById(id);
    if (!chrome) continue;
    chrome.style.pointerEvents = enabled ? '' : 'none';
    chrome.classList.toggle('main-ui-disabled', !enabled);
```

- [ ] **Step 14: Edit `src/renderer/map/initCore.ts`**

The map's hover tooltip also clears when the pointer enters the top bar.

In `src/renderer/map/initCore.ts`, find these lines. Together they occur exactly once:

```ts
   * Dismisses map hover tooltip state when the pointer enters the fixed sidebar.
   *
   * Purpose: `#hex-tooltip` uses `position: fixed` with a higher z-index than `#sidebar`, so the tooltip can
   * paint over the panel while the pointer is already over sidebar targets; `pointerleave` on `#main-map`
   * may not correlate with that visual in all paths (especially after tactical hover fixes).
   * When to use: Wired once at init; runs on every `pointerenter` into the primary right-hand UI column.
   * Expected outcome: Tooltip timer cleared, `#hex-tooltip` hidden, and map hover preview state cleared.
   * Exceptions: None.
   */
  const sidebarPanel = document.getElementById('sidebar');
  sidebarPanel?.addEventListener('pointerenter', () => {
    dismissTerrainTooltipWhenPointerLeavesMapPanel(deps);
  });
```

Replace them with:

```ts
   * Dismisses map hover tooltip state when the pointer enters the console or the top bar.
   *
   * Purpose: `#hex-tooltip` uses `position: fixed` with a higher z-index than that chrome, so the tooltip can
   * paint over it while the pointer is already over its controls; `pointerleave` on `#main-map`
   * may not correlate with that visual in all paths (especially after tactical hover fixes).
   * When to use: Wired once at init; runs on every `pointerenter` into the console or the top bar.
   * Expected outcome: Tooltip timer cleared, `#hex-tooltip` hidden, and map hover preview state cleared.
   * Exceptions: None.
   */
  for (const chromeId of ['sidebar', 'app-topbar']) {
    document.getElementById(chromeId)?.addEventListener('pointerenter', () => {
      dismissTerrainTooltipWhenPointerLeavesMapPanel(deps);
    });
  }
```

- [ ] **Step 15: Edit `src/renderer/renderer.ts`**

Wires the console once at startup.

1. In `src/renderer/renderer.ts`, find this line. It occurs exactly once:

```ts
} from './core/unitOriginTooltip';
```

Replace it with:

```ts
} from './core/unitOriginTooltip';
import { wireConsoleFrame } from './chrome/consoleFrame';
```

2. In `src/renderer/renderer.ts`, find this line. It occurs exactly once:

```ts
  installUnitOriginTooltip();
```

Replace it with:

```ts
  installUnitOriginTooltip();
  wireConsoleFrame();
```

- [ ] **Step 16: Edit `src/renderer/chrome/selectTabPanel.ts`**

Comments only: the console rail uses this switch too.

1. In `src/renderer/chrome/selectTabPanel.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Tools, Model, and the new-game dialog share one switch.
```

Replace it with:

```ts
 * Purpose: The console tabs, Tools and Model, and the new-game dialog share one switch.
```

2. In `src/renderer/chrome/selectTabPanel.ts`, find this line. It occurs exactly once:

```ts
 * When to use: A tab click in the new-game dialog or the Tools and Model bar.
```

Replace it with:

```ts
 * When to use: A tab click in the console rail, the new-game dialog, or the Tools and Model bar.
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

Adds the frame's checks: top-bar geometry and text, console geometry, Ready in the footer, both tabs, the placeholders, and a tip near the window's corner. The old turn-line check goes, because that element no longer exists.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Scene names. Each check lists the scenes it applies to; the runner records one probe per scene.
```

Replace them with:

```js
/**
 * Height of the top bar in CSS pixels.
 *
 * Purpose: The top bar, the map, and the console are all placed against this edge.
 * When to use: Geometry checks for the top bar, the map, the console, and the game menu.
 * Expected outcome: Matches `--topbar-height` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const TOPBAR_HEIGHT = 44;

/**
 * Width of the expanded console in CSS pixels: the content column plus the tab rail.
 *
 * Purpose: The map must end where the console starts.
 * When to use: The expanded-console geometry check.
 * Expected outcome: Matches `--console-content-width` plus `--console-rail-width` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const CONSOLE_EXPANDED_WIDTH = 376;

/**
 * Scene names. Each check lists the scenes it applies to; the runner records one probe per scene.
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
  strategic: 'strategic',
```

Replace it with:

```js
  strategic: 'strategic',
  opponentTab: 'opponent-tab',
  readyTip: 'ready-tip',
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
    needs: ['#sidebar'],
```

Replace it with:

```js
    needs: ['#sidebar', '#app-topbar'],
```

4. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
      return near(c.x, 0) && near(c.y, 0) && near(c.x + c.w, s.x) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should run from 0,0 to the right panel at x=${Math.round(s.x)} and the window bottom`;
    },
  },
  {
    name: 'scenario-turn-line',
    scenes: [SCENES.strategic],
    needs: ['#sidebar-turn'],
    run: (p, el) => {
      const turn = el('#sidebar-turn').text;
      return turn === 'Turn: 1 · September, Year 1' ? null : `#sidebar-turn reads "${turn}", expected "Turn: 1 · September, Year 1"`;
```

Replace them with:

```js
      return near(c.x, 0) && near(c.y, TOPBAR_HEIGHT) && near(c.x + c.w, s.x) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should run from 0,${TOPBAR_HEIGHT} to the console at x=${Math.round(s.x)} and the window bottom`;
    },
  },
  {
    name: 'topbar-geometry',
    scenes: MATCH_SCENES,
    needs: ['#app-topbar'],
    run: (p, el) => {
      const t = el('#app-topbar');
      return t.shown && near(t.x, 0) && near(t.y, 0) && near(t.w, p.viewport.w) && near(t.h, TOPBAR_HEIGHT)
        ? null
        : `#app-topbar is ${fmt(t)}, expected 0,0 ${p.viewport.w}x${TOPBAR_HEIGHT}`;
    },
  },
  {
    name: 'topbar-no-overflow',
    scenes: MATCH_SCENES,
    needs: ['#app-topbar'],
    run: (p, el) => {
      const t = el('#app-topbar');
      return t.scrollWidth <= t.clientWidth + 1 ? null : `top bar content is ${t.scrollWidth}px wide in ${t.clientWidth}px`;
    },
  },
  {
    name: 'topbar-sides',
    scenes: [SCENES.strategic],
    needs: ['#topbar-human-side', '#topbar-opponent-side'],
    run: (p, el) => {
      const human = el('#topbar-human-side').text;
      const opponent = el('#topbar-opponent-side').text;
      return human === 'Southern Europe' && opponent === 'Northern Africa' ? null : `sides read "${human}" vs "${opponent}"`;
    },
  },
  {
    name: 'topbar-date-block',
    scenes: [SCENES.strategic],
    needs: ['#topbar-date', '#topbar-turn-phase'],
    run: (p, el) => {
      const date = el('#topbar-date').text;
      const turn = el('#topbar-turn-phase').text;
      return date === 'September, Year 1' && turn === 'Turn 1 · Planning'
        ? null
        : `date block reads "${date}" / "${turn}", expected "September, Year 1" / "Turn 1 · Planning"`;
    },
  },
  {
    name: 'placeholders-disabled',
    scenes: [SCENES.strategic],
    needs: ['#topbar-settings-btn', '#topbar-help-btn', '#console-tab-build', '#console-tab-forces'],
    run: (p, el) => {
      const enabled = Object.entries(p.elements).filter(([, e]) => e && !e.disabled).map(([selector]) => selector);
      return enabled.length === 0 ? null : `placeholders that are not disabled: ${enabled.join(', ')}`;
    },
  },
  {
    name: 'console-expanded-geometry',
    scenes: MATCH_SCENES,
    needs: ['#sidebar', '#console-main', '#console-rail'],
    run: (p, el) => {
      const s = el('#sidebar');
      if (!el('#console-main').shown) return 'the console content column is not shown';
      return near(s.w, CONSOLE_EXPANDED_WIDTH) && near(s.x + s.w, p.viewport.w) && near(s.y, TOPBAR_HEIGHT) && near(s.y + s.h, p.viewport.h)
        ? null
        : `#sidebar is ${fmt(s)}, expected ${CONSOLE_EXPANDED_WIDTH} wide on the right edge from y=${TOPBAR_HEIGHT} to the bottom`;
    },
  },
  {
    name: 'ready-in-footer',
    scenes: MATCH_SCENES,
    needs: ['#console-footer', '#ready-btn'],
    run: (p, el) => {
      const f = el('#console-footer');
      const r = el('#ready-btn');
      const inside = r.shown && r.x >= f.x - 1 && r.y >= f.y - 1 && r.x + r.w <= f.x + f.w + 1 && r.y + r.h <= f.y + f.h + 1;
      return inside ? null : `#ready-btn ${fmt(r)} is not inside #console-footer ${fmt(f)}`;
    },
  },
  {
    name: 'orders-tab-shows-panel',
    scenes: [SCENES.strategic],
    needs: ['#console-panel-orders', '#console-panel-opponent', '#console-title'],
    run: (p, el) => {
      if (!el('#console-panel-orders').shown) return 'the Orders panel is not shown';
      if (el('#console-panel-opponent').shown) return 'the Opponent panel is shown with Orders';
      const title = el('#console-title').text;
      return title === 'Orders' ? null : `console title is "${title}"`;
    },
  },
  {
    name: 'opponent-tab-shows-panel',
    scenes: [SCENES.opponentTab],
    needs: ['#console-panel-orders', '#console-panel-opponent', '#openrouter-log', '#console-title'],
    run: (p, el) => {
      if (!el('#console-panel-opponent').shown) return 'the Opponent panel is not shown';
      if (el('#console-panel-orders').shown) return 'the Orders panel is still shown';
      if (!el('#openrouter-log').shown) return 'the AI activity log is not shown';
      const title = el('#console-title').text;
      return title === 'Opponent' ? null : `console title is "${title}"`;
    },
  },
  {
    name: 'control-tip-inside-window',
    scenes: [SCENES.readyTip],
    needs: ['#control-tooltip'],
    run: (p, el) => {
      const t = el('#control-tooltip');
      if (!t.shown) return 'the Ready tip is not shown';
      if (t.w < 100) return `the Ready tip is squeezed to ${Math.round(t.w)}px wide`;
      return t.x >= 0 && t.y >= 0 && t.x + t.w <= p.viewport.w + 1 && t.y + t.h <= p.viewport.h + 1
        ? null
        : `the Ready tip is at ${fmt(t)}, outside the ${p.viewport.w}x${p.viewport.h} window`;
```

- [ ] **Step 18: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Adds the Opponent-tab and Ready-tip scenes, parks the pointer after clicks so tips stay out of screenshots, and opens New through the console's Opponent tab.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * When to use: After a size change (`resize`), a click (`click`), the overlay opening (`overlay`), and a match
 *   start (`start`).
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500 });
```

Replace them with:

```js
 * When to use: After a size change (`resize`), a click (`click`), the overlay opening (`overlay`), a match start
 *   (`start`), and while the pointer rests on a control until its tip shows (`tip`, longer than the one-second dwell).
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500, tip: 1500 });
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * Expected outcome: The Model tab is selected, New is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
```

Replace them with:

```js
 * Expected outcome: The console's Opponent tab and its Model sub-tab are selected, New is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
  await page.click('#console-tab-opponent');
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await page.waitForTimeout(SETTLE_MS.click);
}
```

Replace them with:

```js
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Moves the pointer to empty space in the top bar.
 *
 * Purpose: After a click the pointer would rest on a control, and that control's tip would show up in the next screenshot.
 * When to use: After each click in a scene, and after a scene that shows a tip.
 * Expected outcome: The pointer is over the top bar's spacer, which has no tip and no click action.
 * Exceptions: Throws when the top bar has no spacer.
 */
async function parkPointer(page) {
  const box = await page.locator('#app-topbar .topbar-spacer').boundingBox();
  if (!box) throw new Error('the top bar spacer is not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}
```

4. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await page.waitForTimeout(SETTLE_MS.resize);

```

Replace them with:

```js
  await page.waitForTimeout(SETTLE_MS.resize);

  await page.click('#console-tab-opponent');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.opponentTab);
  await page.click('#console-tab-orders');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);

  // Ready sits at the window's bottom-right corner, so its tip has to open up and to the left.
  await page.hover('#console-footer .control-tooltip-host');
  await page.waitForTimeout(SETTLE_MS.tip);
  await recordScene(page, report, outDir, SCENES.readyTip);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);

```

- [ ] **Step 19: Create `doc/ux/top-bar.md`**

From here to the end, the steps update `doc/` in the same change, as `AGENTS.md` requires. This step adds the element document for the top bar.

Create `doc/ux/top-bar.md` with exactly this content:

````markdown
# Top Bar

The bar across the top of the window. It holds the two sides, the date block, and the Settings and Help buttons.

## Purpose

Show who is fighting and the match's date at a glance, without opening a panel.

## Availability

Shown in Strategic planning, Resolution playback, Tactical planning, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list or the annihilation dialog is open, it stays visible and does not receive pointer input.

## Information Displayed

From left to right:

- The two sides: a teal mark and the human side's name, "vs", then a rose mark and the opponent's name. A long name ends in an ellipsis. With no match loaded, each name is an em dash.
- The date block, on two lines. The first line is the match date, such as "March, Year 1" on the global map or "March 8th, Year 1" on a regional map. The second line is "Turn N · Planning" outside a battle. In a battle it is "Beat N · Tactical planning" while the player drafts and "Beat N · Tactical resolution" while a beat resolves or plays back, and the first line ends with the battle's weather icon and word when the weather bonus is on. With no match loaded, both lines are an em dash.
- Settings and Help. Both are disabled in this version.
- Below a 1100 px window, each side's name is shortened sooner.
- Control tips for the buttons are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- The sides and the date block do not respond to clicks.

### Keyboard

- None.

### Other

- The sides and the date block refresh with each game-state snapshot, on tactical entry and exit, after a tactical Ready commit, and when beat playback ends.

## States

- Match loaded: the names and the date block show the match.
- No match: em dashes.
- Pointer input off: the tactical battles list or Tactical annihilation.
- Absent: New game and Game over.

## Invariants

- The sides and the date block are display only. They never change game state.
- During a battle, the two date-block lines never describe different theaters.
- The bar's height never changes with the window width; names give way instead.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Second date-block line | Strategic turn and phase | Battle beat and tactical phase |
| First date-block line | Match date | Match date, then the battle's weather when the weather bonus is on |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [right-panel.md](right-panel.md)
- [control-tooltips.md](control-tooltips.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#app-topbar`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`)
- `static/frameChrome.css`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, `setMainUIControlsEnabled`)
- `src/shared/topBarDateBlock.ts`
````

- [ ] **Step 20: Replace `doc/ux/right-panel.md`**

The right panel document now describes the console. The UX documents keep the name "right panel"; a wording sweep belongs to a later phase.

Replace the whole file `doc/ux/right-panel.md` with exactly this content:

````markdown
# Right Panel

The console docked on the right of the map. It holds the Orders tab, the Opponent tab, a tab rail, and a footer with Ready.

## Purpose

Keep orders, the opponent's model controls, and Ready in one place that stays usable during both theaters.

## Availability

Shown in Strategic planning, Tactical planning, Resolution playback, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list is open, the panel stays visible and does not receive pointer input. In Tactical annihilation, pointer input on the panel is off except the annihilation dialog, which is not part of this panel.

## Information Displayed

- A tab rail on the panel's outer edge, with Orders, Opponent, Build, and Forces. Build and Forces are disabled in this version. The selected tab is marked.
- A header with the selected tab's name.
- The Orders tab: the selected-unit readout, the Ranged and Strike controls, and the order lists. See [right-panel-command-bar.md](right-panel-command-bar.md) and [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
- The Opponent tab: the Tools tab and the Model tab, one shown at a time, with the AI activity log under them. See [right-panel-tools-tab.md](right-panel-tools-tab.md), [right-panel-model-tab.md](right-panel-model-tab.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer with Ready, under the tab content. See [right-panel-command-bar.md](right-panel-command-bar.md).
- Control tips for the tabs are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks a tab other than the selected one, that tab's content shows and the header names it.
- When the player clicks the selected tab, nothing changes.
- Inside the Opponent tab, clicking Tools or Model shows that sub-tab. Turning Run on also selects the Tools sub-tab. See [right-panel-model-tab.md](right-panel-model-tab.md).

### Keyboard

- None for the panel as a whole. Fields inside a tab follow [input-map.md](input-map.md).

### Other

- The panel starts on the Orders tab. Inside the Opponent tab, the Model sub-tab is selected first.
- The selected tab lasts until the app closes. It is not saved.

## States

- Orders tab selected: the start state.
- Opponent tab selected.
- Absent: New game and Game over, including while the new-game form is hidden. The map fills the window.
- Pointer input off: the tactical battles list, and Tactical annihilation.

## Invariants

- The panel is never hidden just because a tactical battle is active.
- The panel is absent for the whole New game and Game over overlay, and present again as soon as that overlay closes.
- Exactly one tab's content shows.
- Ready is on screen whenever the panel is.
- Build and Forces never open a tab in this version.

## Strategic and Tactical Differences

The panel stays visible in both theaters. Its order lists follow the active theater. See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [input-map.md](input-map.md)
- [top-bar.md](top-bar.md)
- [right-panel-command-bar.md](right-panel-command-bar.md)
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
- [right-panel-tools-tab.md](right-panel-tools-tab.md)
- [right-panel-model-tab.md](right-panel-model-tab.md)
- [ai-activity-log.md](ai-activity-log.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-panel-orders`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
- `static/frameChrome.css`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
````

- [ ] **Step 21: Edit `doc/ux/right-panel-command-bar.md`**

1. In `doc/ux/right-panel-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
The game-state readout and the Ready, Ranged, and air-strike controls.

## Purpose

Show whose turn it is and give the player the buttons that end the turn or start a targeted order.

## Availability

Shown with the right panel. Ready, Ranged, and the air-strike controls follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the panel is absent, so these controls are absent with it. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The heading "Selected hex".
- Game state: "Phase:" and "Turn:". With no match loaded, both lines are an em dash. Outside a battle, the phase line shows the strategic phase label and the turn line shows the strategic turn and the match date, still one line: `Turn: N · November, Year 3` on the global map and `Turn: N · November 22nd, Year 1` on a regional map. While a battle is active, the phase line shows the tactical phase: "Phase: Tactical planning" while the player drafts a beat, and "Phase: Tactical resolution" while a beat resolves or plays back. The turn line shows the tactical beat and that same strategic date. With the weather bonus on it also shows a weather icon for the enclosing hex, still one line.
- The Ready button. Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running. Its top edge lines up with Ranged, and the two controls are the same height.
- The Ranged control. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
````

Replace them with:

````markdown
Ready, in the right panel's footer, and the Ranged and air-strike controls on the Orders tab. The game-state readout is the date block in the [top bar](top-bar.md).

## Purpose

Give the player the buttons that end the turn or start a targeted order.

## Availability

Ready shows whenever the right panel does. Ranged and the air-strike controls show while the Orders tab is selected. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the panel is absent, so these controls are absent with it. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The Ready button, across the width of the right panel's footer. Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running.
- The Ranged control, on the Orders tab under the selected-unit readout. The row takes no space while Ranged, the target list, and Cancel are all hidden. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
````

2. In `doc/ux/right-panel-command-bar.md`, delete this line, including the line break at the end. It occurs exactly once:

````markdown
- During a battle, the phase line and the turn line never describe different theaters.
````

3. In `doc/ux/right-panel-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
| Turn line | Strategic turn | Tactical turn |
| Ready | Resolves the strategic turn | Commits the battle beat |
| Ranged | Types that can fire on the strategic map | Types that can fire in a battle, including infantry |
| Phase line | Strategic phase | Tactical planning or Tactical resolution |
````

Replace them with:

````markdown
| Ready | Resolves the strategic turn | Commits the battle beat |
| Ranged | Types that can fire on the strategic map | Types that can fire in a battle, including infantry |
````

4. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#sidebar-phase`, `#sidebar-turn`, `#ready-btn`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`)
````

Replace it with:

````markdown
- `static/index.html` (`#console-footer`, `#ready-btn`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`)
````

- [ ] **Step 22: Edit `doc/ux/right-panel-model-tab.md`**

1. In `doc/ux/right-panel-model-tab.md`, find this line. It occurs exactly once:

````markdown
The API key, model choice, reasoning effort, Run, New, and the Tactical battles checkbox.
````

Replace it with:

````markdown
The API key, model choice, reasoning effort, Run, New, and the Tactical battles checkbox, on the right panel's Opponent tab.
````

2. In `doc/ux/right-panel-model-tab.md`, find this line. It occurs exactly once:

````markdown
Shown when the Model tab is selected. This is the tab the panel starts on. The model description tooltip can appear while this tab's model dropdown is in use. While the tactical battles list is open, the tab stays visible and does not receive pointer input. In New game and Game over the panel is absent, so this tab is absent with it.
````

Replace it with:

````markdown
Shown while the right panel's Opponent tab and its Model sub-tab are selected. The Opponent tab starts on this sub-tab. The model description tooltip can appear while this tab's model dropdown is in use. While the tactical battles list is open, the tab stays visible and does not receive pointer input. In New game and Game over the panel is absent, so this tab is absent with it.
````

- [ ] **Step 23: Edit `doc/ux/right-panel-tools-tab.md`**

In `doc/ux/right-panel-tools-tab.md`, find this line. It occurs exactly once:

````markdown
Shown when the Tools tab is selected. The right panel starts on the Model tab. Turning Run on selects this tab. While the tactical battles list is open, the tab stays visible and does not receive pointer input. See [right-panel.md](right-panel.md) and [right-panel-model-tab.md](right-panel-model-tab.md). In New game and Game over the panel is absent, so this tab is absent with it.
````

Replace it with:

````markdown
Shown while the right panel's Opponent tab and its Tools sub-tab are selected. The Opponent tab starts on the Model sub-tab. Turning Run on selects this tab. While the tactical battles list is open, the tab stays visible and does not receive pointer input. See [right-panel.md](right-panel.md) and [right-panel-model-tab.md](right-panel-model-tab.md). In New game and Game over the panel is absent, so this tab is absent with it.
````

- [ ] **Step 24: Edit `doc/ux/ai-activity-log.md`**

1. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
The log of AI interactions and errors under the right-panel tabs.
````

Replace it with:

````markdown
The log of AI interactions and errors on the right panel's Opponent tab.
````

2. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
Shown with the right panel in every mode where the panel is visible, whichever tab is selected. While the tactical battles list is open, the log stays visible and does not receive pointer input. The log itself has no mode of its own. The log is absent in New game and Game over because the panel is absent.
````

Replace it with:

````markdown
Shown on the right panel's Opponent tab, under the Tools and Model sub-tabs, whichever sub-tab is selected, in every mode where the panel is visible. While the tactical battles list is open, the log stays visible and does not receive pointer input. The log itself has no mode of its own. The log is absent in New game and Game over because the panel is absent.
````

3. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
- A new line is appended at the end, and the log scrolls to that line.
````

Replace it with:

````markdown
- A new line is appended at the end, and the log scrolls to that line while it is shown. Showing the Opponent tab scrolls the log to its newest line, so lines added while it was hidden are in view.
````

4. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
- `src/renderer/openRouter/openRouterUiHelpers.ts`
````

Replace it with:

````markdown
- `src/renderer/openRouter/openRouterUiHelpers.ts` (`appendOpenRouterLog`, `scrollOpenRouterLogToEnd`)
- `src/renderer/chrome/consoleFrame.ts`
````

- [ ] **Step 25: Edit `doc/ux/right-panel-selection-and-orders.md`**

In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
Shown with the right panel. The player can use the lists in Strategic planning and Tactical planning, and they follow the active theater. While the tactical battles list is open, the lists stay visible and do not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md). In New game and Game over the panel is absent, so these lists are absent with it.
````

Replace it with:

````markdown
Shown on the right panel's Orders tab. The player can use the lists in Strategic planning and Tactical planning, and they follow the active theater. While the tactical battles list is open, the lists stay visible and do not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md). In New game and Game over the panel is absent, so these lists are absent with it.
````

- [ ] **Step 26: Edit `doc/ux/modes-and-transitions.md`**

1. In `doc/ux/modes-and-transitions.md`, find these lines. Together they occur exactly once:

````markdown
The player sees the new-game overlay. The message is "Start the global game when ready." or "Start the regional game when ready." when no match is loaded, and "Start a new global game when ready." or "Start a new regional game when ready." when the player opened the overlay from the Model tab during a match. The sentence follows the selected tab. A win or loss does not. The button reads "Start game". Global and Regional tabs sit under the message. Global chooses a home region for each side. Regional chooses one region and a different side group for each side. Game size, fog of war, a level (Off, Low, or High) for each of the origin bonus, tech bonus, terrain bonus, and weather bonus, and a starting month sit outside the tabs. The right panel is not on screen, and the map fills the window. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview, and a click, double-click, or right-click does not select, order, or change the selection. Ready is disabled. The map behind the overlay shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md). The dialog sits at the minimap's usual corner, with no dark veil. The minimap, the terrain legend, and the map's + and − zoom control are hidden. This mode ends when Start game succeeds and a match is loaded.

### Strategic planning

The player sees the strategic world map and the right panel. The game-state readout shows "Phase: Planning" and the strategic turn. The player can pan and zoom, select units, draft orders, open build and stack popups, and press Ready when it is enabled. Strategic planning is blocked while the new-game overlay, the game-over overlay, or the tactical annihilation dialog is open, and it is replaced while a tactical battle is active or the tactical battles list is open.
````

Replace them with:

````markdown
The player sees the new-game overlay. The message is "Start the global game when ready." or "Start the regional game when ready." when no match is loaded, and "Start a new global game when ready." or "Start a new regional game when ready." when the player opened the overlay from the Model tab during a match. The sentence follows the selected tab. A win or loss does not. The button reads "Start game". Global and Regional tabs sit under the message. Global chooses a home region for each side. Regional chooses one region and a different side group for each side. Game size, fog of war, a level (Off, Low, or High) for each of the origin bonus, tech bonus, terrain bonus, and weather bonus, and a starting month sit outside the tabs. The top bar and the right panel are not on screen, and the map fills the window. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview, and a click, double-click, or right-click does not select, order, or change the selection. Ready is disabled. The map behind the overlay shows that tab's preview, as in [new-game-dialog.md](new-game-dialog.md). The dialog sits at the minimap's usual corner, with no dark veil. The minimap, the terrain legend, and the map's + and − zoom control are hidden. This mode ends when Start game succeeds and a match is loaded.

### Strategic planning

The player sees the top bar, the strategic world map, and the right panel. The top bar's date block shows the date and "Turn N · Planning". The player can pan and zoom, select units, draft orders, open build and stack popups, and press Ready when it is enabled. Strategic planning is blocked while the new-game overlay, the game-over overlay, or the tactical annihilation dialog is open, and it is replaced while a tactical battle is active or the tactical battles list is open.
````

2. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
The player sees a dialog titled "Tactical Battles (N)", where N is the number of candidate hexes. Each row offers a choice, the hex information, a human unit summary, and an AI unit summary. Fight stays disabled until a row is chosen. Ignore is always available. A dimmed backdrop covers the window, and the dialog is centered on the visible map area rather than on the map plus the right panel. The map and the right panel stay as they were when Ready paused, and they do not receive pointer input. This dialog opens after Ready when the match reports melee candidates and the Tactical battles checkbox is checked. When that checkbox is unchecked, the dialog does not open and the turn continues as if the player chose Ignore.
````

Replace it with:

````markdown
The player sees a dialog titled "Tactical Battles (N)", where N is the number of candidate hexes. Each row offers a choice, the hex information, a human unit summary, and an AI unit summary. Fight stays disabled until a row is chosen. Ignore is always available. A dimmed backdrop covers the window, and the dialog is centered on the visible map area rather than on the map plus the right panel. The map, the top bar, and the right panel stay as they were when Ready paused, and they do not receive pointer input. This dialog opens after Ready when the match reports melee candidates and the Tactical battles checkbox is checked. When that checkbox is unchecked, the dialog does not open and the turn continues as if the player chose Ignore.
````

3. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
Playback does not replace the underlying match: the game-state readout can already show the next planning turn while the animation is still running. Until the animation ends, map gestures that change orders or the selection are ignored. Pan, zoom, hex tooltips, and right-click still work, and the right panel keeps its own rules. Details are in [resolution-playback.md](resolution-playback.md). Starting a tactical battle cancels a strategic playback that is still running. Leaving a tactical battle also cancels playback.
````

Replace it with:

````markdown
Playback does not replace the underlying match: the top bar's date block can already show the next planning turn while the animation is still running. Until the animation ends, map gestures that change orders or the selection are ignored. Pan, zoom, hex tooltips, and right-click still work, and the right panel keeps its own rules. Details are in [resolution-playback.md](resolution-playback.md). Starting a tactical battle cancels a strategic playback that is still running. Leaving a tactical battle also cancels playback.
````

4. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
The player sees the battle map for one contested hex, the Exit Battle control, and the same right panel. The turn readout shows the tactical turn. The player drafts tactical orders and presses Ready to commit a beat. Exit Battle is enabled while the player drafts. It is disabled from the tactical Ready commit until that beat's playback ends, and hidden while the annihilation dialog is open. The phase line reads "Phase: Tactical planning" while drafting and "Phase: Tactical resolution" while a beat resolves.
````

Replace it with:

````markdown
The player sees the battle map for one contested hex, the Exit Battle control, the top bar, and the same right panel. The top bar's date block shows the beat. The player drafts tactical orders and presses Ready to commit a beat. Exit Battle is enabled while the player drafts. It is disabled from the tactical Ready commit until that beat's playback ends, and hidden while the annihilation dialog is open. Its second line reads "Beat N · Tactical planning" while drafting and "Beat N · Tactical resolution" while a beat resolves.
````

5. In `doc/ux/modes-and-transitions.md`, find these lines. Together they occur exactly once:

````markdown
The player sees an overlay with "You win!", "You lose.", or "All units destroyed.", and an Exit Battle button. The map and the right panel do not accept input. The in-battle Exit Battle control is hidden, and Ready is disabled. Any in-flight AI planning request is cancelled. This mode ends when the player presses Exit Battle, which leaves the battle, returns to strategic planning, and then runs Ready.

### Game over

The player sees the same overlay as New game. The message is "You win!" or "You lose." The button reads "New game". The right panel is not on screen, and the map fills the window. The map follows the same show and hide rules as New game, and Ready is disabled. The map behind the overlay shows the same preview as New game. The dialog, the missing veil, and the hidden minimap, legend, and + and − zoom control match New game. Starting a new match leaves this mode for strategic planning.
````

Replace them with:

````markdown
The player sees an overlay with "You win!", "You lose.", or "All units destroyed.", and an Exit Battle button. The map, the top bar, and the right panel do not accept input. The in-battle Exit Battle control is hidden, and Ready is disabled. Any in-flight AI planning request is cancelled. This mode ends when the player presses Exit Battle, which leaves the battle, returns to strategic planning, and then runs Ready.

### Game over

The player sees the same overlay as New game. The message is "You win!" or "You lose." The button reads "New game". The top bar and the right panel are not on screen, and the map fills the window. The map follows the same show and hide rules as New game, and Ready is disabled. The map behind the overlay shows the same preview as New game. The dialog, the missing veil, and the hidden minimap, legend, and + and − zoom control match New game. Starting a new match leaves this mode for strategic planning.
````

6. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
- New game and Game over into Strategic planning: selection, hex selection, draft orders, the strategic-order stash, hover preview, the running AI cost, and the AI activity log are cleared. The right panel is on screen, and the map view frames the new match beside it, as in [map-surface.md](map-surface.md).
````

Replace it with:

````markdown
- New game and Game over into Strategic planning: selection, hex selection, draft orders, the strategic-order stash, hover preview, the running AI cost, and the AI activity log are cleared. The top bar and the right panel are on screen, and the map view frames the new match beside the panel, as in [map-surface.md](map-surface.md).
````

7. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
On the map, tactical play limits orders to the battle area and shows the battle turn. The right panel stays visible in both theaters; its turn readout and order lists follow the active theater. Build markers are hidden when a battle starts. Tactical entry markers are a strategic-planning affordance. Exit Battle and the annihilation dialog exist only in a battle. Details live in [map-surface.md](map-surface.md), [right-panel.md](right-panel.md), [tactical-entry-markers.md](tactical-entry-markers.md), and [tactical-battle-controls.md](tactical-battle-controls.md).
````

Replace it with:

````markdown
On the map, tactical play limits orders to the battle area and shows the battle turn. The top bar and the right panel stay visible in both theaters; the top bar's date block and the panel's order lists follow the active theater. Build markers are hidden when a battle starts. Tactical entry markers are a strategic-planning affordance. Exit Battle and the annihilation dialog exist only in a battle. Details live in [map-surface.md](map-surface.md), [right-panel.md](right-panel.md), [tactical-entry-markers.md](tactical-entry-markers.md), and [tactical-battle-controls.md](tactical-battle-controls.md).
````

- [ ] **Step 27: Edit `doc/ux/new-game-dialog.md`**

1. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
Opens in New game and in Game over. See [modes-and-transitions.md](modes-and-transitions.md). It opens at startup when no match is loaded, when the player clicks New, and when the match ends. It cannot be dismissed without starting a match. The right panel is not on screen while it is open, including while the form is hidden, and the map fills the window. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview.
````

Replace it with:

````markdown
Opens in New game and in Game over. See [modes-and-transitions.md](modes-and-transitions.md). It opens at startup when no match is loaded, when the player clicks New, and when the match ends. It cannot be dismissed without starting a match. The top bar and the right panel are not on screen while it is open, including while the form is hidden, and the map fills the window. While the form is showing, the map does not accept pointer input either. While the form is hidden, drag and the wheel pan and zoom the preview.
````

2. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks Start game or New game, the match starts, drafts and the selection clear, the AI cost readout and the AI activity log clear, and the overlay closes on success. The right panel is on screen, and the view then frames the new match in the map beside it, as in [map-surface.md](map-surface.md). A failure leaves the overlay open.
````

Replace it with:

````markdown
- When the player clicks Start game or New game, the match starts, drafts and the selection clear, the AI cost readout and the AI activity log clear, and the overlay closes on success. The top bar and the right panel are on screen, and the view then frames the new match in the map beside the panel, as in [map-surface.md](map-surface.md). A failure leaves the overlay open.
````

- [ ] **Step 28: Edit `doc/ux/resolution-playback.md`**

In `doc/ux/resolution-playback.md`, find this line. It occurs exactly once:

````markdown
- Playing: one or more stages are on screen, or dice chips are still fading after the last stage. The game-state readout can already show the next planning turn.
````

Replace it with:

````markdown
- Playing: one or more stages are on screen, or dice chips are still fading after the last stage. The top bar's date block can already show the next planning turn.
````

- [ ] **Step 29: Edit `doc/ux/tactical-battles-list.md`**

In `doc/ux/tactical-battles-list.md`, find this line. It occurs exactly once:

````markdown
Opens in the Tactical battles list mode, after Ready reports melee candidates and the Tactical battles checkbox is checked. A dimmed backdrop covers the window, and the panel is centered on the visible map area (not on the map plus the right panel). The panel follows the map area when the window resizes. On a small map area the panel shrinks to fit, and a long list scrolls inside it. The map and the right panel stay visible underneath and do not receive pointer input. Markers that were already on the map are not refreshed until the dialog closes. When that checkbox is unchecked, the dialog does not open and the turn continues as Ignore. See [modes-and-transitions.md](modes-and-transitions.md) and [right-panel-model-tab.md](right-panel-model-tab.md).
````

Replace it with:

````markdown
Opens in the Tactical battles list mode, after Ready reports melee candidates and the Tactical battles checkbox is checked. A dimmed backdrop covers the window, and the panel is centered on the visible map area (not on the map plus the right panel). The panel follows the map area when the window resizes. On a small map area the panel shrinks to fit, and a long list scrolls inside it. The map, the top bar, and the right panel stay visible underneath and do not receive pointer input. Markers that were already on the map are not refreshed until the dialog closes. When that checkbox is unchecked, the dialog does not open and the turn continues as Ignore. See [modes-and-transitions.md](modes-and-transitions.md) and [right-panel-model-tab.md](right-panel-model-tab.md).
````

- [ ] **Step 30: Edit `doc/ux/control-tooltips.md`**

1. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Run before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back.
````

Replace it with:

````markdown
The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Run before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back. It also includes every disabled placeholder: Settings and Help in the top bar, and the Build and Forces tabs.
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- The tip appears one second after the pointer or keyboard focus arrives on the control or on its label. Moving on that same control does not start the wait again. It follows the pointer. Keyboard focus, with the pointer on a different control or on none, places the tip at the focused control.
````

Replace it with:

````markdown
- The tip appears one second after the pointer or keyboard focus arrives on the control or on its label. Moving on that same control does not start the wait again. It follows the pointer. Keyboard focus, with the pointer on a different control or on none, places the tip at the focused control. The tip opens below and to the right of that point, or above or to the left of it where it would otherwise leave the window.
````

3. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Model tab: Show the API key, model, reasoning effort, and the controls for opponent planning and a new match.
````

Replace it with:

````markdown
- Model tab: Show the API key, model, reasoning effort, and the controls for opponent planning and a new match.
- Orders tab: Show the selected unit and the orders queued for this turn or beat.
- Opponent tab: Show the opponent's model, its tools, and the AI activity log.
- Settings, Help, Build, and Forces: "<name> is not available in this version.", for example "Settings is not available in this version."
````

4. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- `src/renderer/chrome/controlTooltipText.ts`
````

Replace it with:

````markdown
- `src/renderer/chrome/controlTooltipText.ts`
- `src/renderer/chrome/frameTooltipText.ts`
````

- [ ] **Step 31: Edit `doc/ux-specification.md`**

1. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| The right panel as a whole | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel.md](ux/right-panel.md) |
````

Replace it with:

````markdown
| The top bar or its date block | [modes-and-transitions.md](ux/modes-and-transitions.md) | [top-bar.md](ux/top-bar.md) |
| The right panel as a whole or its tabs | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel.md](ux/right-panel.md) |
````

2. In `doc/ux-specification.md`, find these lines. Together they occur exactly once:

````markdown
- [right-panel.md](ux/right-panel.md): the right panel as a whole, including tab switching.
- [right-panel-command-bar.md](ux/right-panel-command-bar.md): game state readout, Ready, Ranged, and air strike controls.
````

Replace them with:

````markdown
- [top-bar.md](ux/top-bar.md): the bar across the top: the two sides and the date block.
- [right-panel.md](ux/right-panel.md): the console docked on the right: its tab rail and the footer that holds Ready.
- [right-panel-command-bar.md](ux/right-panel-command-bar.md): Ready, Ranged, and air strike controls.
````

3. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| Multi-hex build popup | Hidden | Shown | Disabled | Disabled | Hidden | Hidden | Hidden |
````

Replace it with:

````markdown
| Multi-hex build popup | Hidden | Shown | Disabled | Disabled | Hidden | Hidden | Hidden |
| Top bar | Hidden | Shown | Disabled | Changed | Changed | Disabled | Hidden |
````

- [ ] **Step 32: Edit `doc/ui-style-guide.md`**

1. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

Replace it with:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar and the right panel's frame and tab rail are in `static/frameChrome.css`. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

2. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
| Panel, popup, tooltip, and toast bg | `#1b2838` | Sidebar, legend, hex tooltip, control tips, stack callout, build popup, new-game box, tactical-battles dialog, lower-right update toast, and upper-right message toast |
````

Replace it with:

````markdown
| Top bar and right-panel footer bg | `#121b27` | `--chrome-bg-deep` |
| Right-panel tab rail bg | `#141f2d` | `--chrome-rail-bg` |
| Dividers inside the top bar and the rail | `#243246` | `--chrome-divider` |
| Panel, popup, tooltip, and toast bg | `#1b2838` | Right panel, legend, hex tooltip, control tips, stack callout, build popup, new-game box, tactical-battles dialog, lower-right update toast, and upper-right message toast |
````

3. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
- **Contents:** Turn number, phase (e.g., Planning / Resolving), and current player or “Your turn” indicator. Global resources (e.g., IPCs or equivalent) if applicable. Keep height minimal.
````

Replace it with:

````markdown
- **Contents:** Turn number, phase (e.g., Planning / Resolving), and current player or “Your turn” indicator. Global resources (e.g., IPCs or equivalent) if applicable. Keep height minimal.
- **Live app:** A 44 px bar: the two sides, then the date and turn on two lines, and disabled Settings and Help buttons. See [ux/top-bar.md](ux/top-bar.md).
````

- [ ] **Step 33: Edit `doc/how-to-play.md`**

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Right panel, below the Tools and Model tabs (AI activity log):** AI interaction lines and errors, including a retry, a line when opponent planning stops, and a one-line copy of each turn update. Starting a new match clears it.
````

Replace it with:

````markdown
- **Right panel, Opponent tab, below the Tools and Model tabs (AI activity log):** AI interaction lines and errors, including a retry, a line when opponent planning stops, and a one-line copy of each turn update. Starting a new match clears it.
````

## Verify

- [ ] **Step 34: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 35: Full tests**

Run the full tests. Expected: exit 0, test total **834**, failure total **0**.

- [ ] **Step 36: Exact match**

This proves that every file this plan creates or edits, except `src/renderer/chrome/frameTooltipText.ts`, matches the verified result character for character. It ignores line endings. The note after the table says why that file has no hash.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" doc/how-to-play.md doc/ui-style-guide.md doc/ux-specification.md doc/ux/ai-activity-log.md doc/ux/control-tooltips.md doc/ux/modes-and-transitions.md doc/ux/new-game-dialog.md doc/ux/resolution-playback.md doc/ux/right-panel-command-bar.md doc/ux/right-panel-model-tab.md doc/ux/right-panel-selection-and-orders.md doc/ux/right-panel-tools-tab.md doc/ux/right-panel.md doc/ux/tactical-battles-list.md doc/ux/top-bar.md scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke.cjs src/renderer/chrome/consoleFrame.ts src/renderer/chrome/controlTooltip.ts src/renderer/chrome/selectTabPanel.ts src/renderer/chrome/topBar.ts src/renderer/core/uiState.ts src/renderer/map/initCore.ts src/renderer/openRouter/openRouterUiHelpers.ts src/renderer/renderer.ts src/shared/topBarDateBlock.test.ts src/shared/topBarDateBlock.ts static/frameChrome.css static/index.html static/shellChrome.css
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `doc/how-to-play.md` | `b86d3856633057ce` |
| `doc/ui-style-guide.md` | `08d1ae8076d07b94` |
| `doc/ux-specification.md` | `a80d3cd2d836dafa` |
| `doc/ux/ai-activity-log.md` | `c29802deb4d2c27d` |
| `doc/ux/control-tooltips.md` | `d37cb4e93af5350c` |
| `doc/ux/modes-and-transitions.md` | `5358912cf04b2996` |
| `doc/ux/new-game-dialog.md` | `e31900a8eb64a42c` |
| `doc/ux/resolution-playback.md` | `1c9942907d032739` |
| `doc/ux/right-panel-command-bar.md` | `c8764b7b61a65386` |
| `doc/ux/right-panel-model-tab.md` | `23734562ea15e592` |
| `doc/ux/right-panel-selection-and-orders.md` | `dedc80cd66a2d9c1` |
| `doc/ux/right-panel-tools-tab.md` | `c5f6743d8b2eb5e4` |
| `doc/ux/right-panel.md` | `44aa1842254a13ce` |
| `doc/ux/tactical-battles-list.md` | `cd8e939a99cb5ddf` |
| `doc/ux/top-bar.md` | `c33969fef078233b` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `60588bb7f0881f75` |
| `scripts/ui-smoke/ui-smoke.cjs` | `72b3d7fc43095b4b` |
| `src/renderer/chrome/consoleFrame.ts` | `fb3432463f100910` |
| `src/renderer/chrome/controlTooltip.ts` | `8bbb73416b1d761e` |
| `src/renderer/chrome/selectTabPanel.ts` | `4f8e1445e3447ab5` |
| `src/renderer/chrome/topBar.ts` | `d97c03f9f44d6213` |
| `src/renderer/core/uiState.ts` | `0da838882740f9c8` |
| `src/renderer/map/initCore.ts` | `5d79e2cc571b4f5f` |
| `src/renderer/openRouter/openRouterUiHelpers.ts` | `75c3f3c394facb5e` |
| `src/renderer/renderer.ts` | `16a3b809e714cbd9` |
| `src/shared/topBarDateBlock.test.ts` | `2e7e7bae3e268998` |
| `src/shared/topBarDateBlock.ts` | `c02e9765141ce01e` |
| `static/frameChrome.css` | `664093b363c795a0` |
| `static/index.html` | `1f948d283625ed1c` |
| `static/shellChrome.css` | `b3f1e3f72e96f695` |

These must print `False`, because this plan deletes them:

```powershell
Test-Path src/shared/sidebarPhaseLabel.test.ts
Test-Path src/shared/sidebarPhaseLabel.ts
```

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

`src/renderer/chrome/frameTooltipText.ts` is left out of this check. `unavailableTooltipText` needed a summary line so lint accepts its comment. The recorded hash was taken before that line. Write the file as this plan shows. Do not stop because it has no hash.


- [ ] **Step 37: Smoke run**

```powershell
npm run ui:smoke -- --label top-bar-and-console
```

Expected summary line. The recorded run used `F:\Projects\Personal\agent-wars-public`. Another checkout is fine when the counts match and the path ends in `.test\ui-smoke\top-bar-and-console`.

```text
ui-smoke top-bar-and-console: 62 passed, 0 failed, 0 page errors, 7 screenshots in <repository>\.test\ui-smoke\top-bar-and-console
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/top-bar-and-console/report.json`.

- [ ] **Step 38: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/top-bar-and-console/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast.

- `02-strategic-1280x720.png` against [ui-facelift-frame-2-expected-strategic.png](ui-facelift-frame-2-expected-strategic.png): The top bar reads "Southern Europe vs Northern Africa" on the left and "September, Year 1" over "Turn 1 · Planning" on the right, with the Settings and Help icons. The console shows Orders with today's lists. The rail shows Orders, Opponent, and dimmed Build and Forces. Ready fills the footer. The map runs from under the top bar to the console.
- `05-opponent-tab.png` against [ui-facelift-frame-2-expected-opponent.png](ui-facelift-frame-2-expected-opponent.png): The Opponent tab: the Tools and Model sub-tabs, the API key, the model row with refresh, Run, New, and Tactical battles, and the AI activity log under them.
- `06-ready-tip.png` against [ui-facelift-frame-2-expected-ready-tip.png](ui-facelift-frame-2-expected-ready-tip.png): Ready's tip opens above and to the left of the pointer, fully inside the window, on several readable lines.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 35.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 38.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With your own match (`npm start`): the top bar shows both sides and the date block. Hovering Settings or Help for one second shows "… is not available in this version."
2. Click a unit token just below the top bar: the unit is selected and named under "Selected unit". Hover a hex there for one second: the hex tooltip describes that hex, not one 44 px lower.
3. Open a build popup and a stack callout near the top of the map. Each opens beside the pointer, and Escape closes it.
4. Queue a move, cancel it with its ×, queue it again, and press Ready. The turn plays, and the date block advances one turn.
5. Opponent tab: enter your API key, pick a model, and turn Run on. The Tools sub-tab shows. Switch to Orders while the opponent plans, wait for new log lines, then switch back: the log shows its newest line.
6. Hover each rail tab and Ready for one second: each tip is readable and fully on screen.
7. New on the Model tab opens the new-game overlay. The top bar and the console disappear, and the map fills the window.
8. If your match has a tactical entry marker, enter the battle: the second date line reads "Beat 1 · Tactical planning", with the weather on the date line when the weather bonus is on. Exit Battle still works.
9. Shrink the window to its minimum (800 × 600). Nothing in the top bar overlaps; long side names end in "…".

Spec disagreements. Follow this plan. The layout spec's Phase 2 end state also has the game menu button, the four readouts, and New game and Offer tactical battles in the game menu. This plan does not add them. The rail here is Orders, Opponent, Build, and Forces.

## Next

Plan 3 lets the console collapse to its rail and makes the map follow every change in its size.
