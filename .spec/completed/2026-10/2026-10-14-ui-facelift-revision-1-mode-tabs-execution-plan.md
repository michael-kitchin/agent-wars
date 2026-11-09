# UI Facelift Revision, Plan 1 of 3: Map-Mode Tabs

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Move the five map-mode buttons from the column right of the minimap into a row of tabs across the top of the minimap panel, and widen the overview from 200 × 200 to 280 × 200 under them. Each tab takes the console rail's tab cell: 56 × 58 px, an 18 px icon above a 9 px label, in the rail's colors. The console rail's labels drop from 10 px to 9 px, so the two sets match.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 1 of the three that build the spec's Phase 6; [ui-facelift-revision-execution-plan.md](ui-facelift-revision-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `src/renderer/map/mapModeColumn.ts` becomes `src/renderer/map/mapModeTabs.ts`, and `wireMapModeColumn` becomes `wireMapModeTabs`. The code does not change. Comments that said "mode column" in three other modules say "mode tabs".
- Markup: the group `#map-mode-column` becomes `#map-mode-tabs` and moves above `#minimap`. Each label is wrapped in a `<span>`. The five button ids, their tips, and their icons stay.
- Styles: three new tokens, `--chrome-tab-height` (58px), `--chrome-tab-label-size` (9px), and `--minimap-width` (280px). The map-mode tabs and the console rail's tabs both use the first two. A pressed tab keeps the teal accent bar, now on its bottom edge, next to the overview.
- The smoke run's page probe reads font sizes. The panel check expects the tab row over the wider overview, and a new check, `map-mode-tabs-match-rail`, compares a map-mode tab with a console tab.
- `doc/` describes the tab row and the wider overview.

**Out of scope:**

- The selection panel (plans 2 and 3).
- What the overview shows and how it follows the main map. Only its box gets wider.
- Where the terrain legend opens. `mapChromeLayout.ts` already measures the panel, so the legend follows the new width by itself.

**How this plan was checked:** every step below was applied to a copy of the repository at commit `e3b6e05`, and the result matched the verified files exactly. On that result, the fast loop, the full tests, and the smoke run against the real app in Electron passed. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 6", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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
2. [ui-facelift-spec.md](ui-facelift-spec.md): How to Read This Document, Compatibility Names, Console (the tab rail), Map Chrome, and Colors and Tokens.
3. `doc/ux/minimap.md`.
4. `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, to see how a check reads the page.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected:

- `git status --short` prints nothing, or only `.spec/` files.
- The last commit is `e3b6e05 Dog move.`, or a later commit of yours that changes only `.spec/`. If it is anything else, stop and report: every block in this plan was checked against `e3b6e05`.

Then check that the spec's Phase 5 is in, this plan is not, and `.spec/` holds the spec and the mockups for this phase:

```powershell
Test-Path src/shared/battleForceCounts.ts
Test-Path src/renderer/map/mapModeTabs.ts
[bool](Select-String -Path .spec/ui-facelift-spec.md -Pattern 'ui-facelift-revision-execution-plan.md' -SimpleMatch -Quiet)
Test-Path .spec/ui-facelift-selection-expanded.png
```

Expected: `True`, `False`, `True`, `True`. Any other result: stop and report. A `False` from either of the last two means the reviewer has not yet copied this phase's spec and mockups into `.spec/`.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **889**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/mapViewMode.ts`
- `src/renderer/map/mapModeTabs.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/map/mapModeColumn.ts` (deleted)
- `src/renderer/map/mapViewModeState.ts`
- `src/renderer/gameplay/productionOverlayHelpers.ts`
- `static/index.html`
- `static/shellChrome.css`
- `static/frameChrome.css`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`
- `doc/ux/minimap.md`
- `doc/ux/terrain-legend.md`
- `doc/ux/input-map.md`
- `doc/ux-specification.md`
- `doc/ux/right-panel.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Edit `src/shared/mapViewMode.ts`**

Comments only: they say "mode tabs" instead of "mode column".

1. In `src/shared/mapViewMode.ts`, find these lines. Together they occur exactly once:

```ts
 * The map views the mode column offers. Weather is the map as it always looked; Tech keeps the view that holding T
 * shows: no terrain fill, with hex codes and tech icons.
 *
 * Purpose: The mode column, the drawing code, and the tests name the views the same way.
```

Replace them with:

```ts
 * The map views the mode tabs offer. Weather is the map as it always looked; Tech keeps the view that holding T
 * shows: no terrain fill, with hex codes and tech icons.
 *
 * Purpose: The mode tabs, the drawing code, and the tests name the views the same way.
```

2. In `src/shared/mapViewMode.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Holding T shows that view everywhere, as before. Choosing Tech in the mode column keeps it on, but only on
```

Replace it with:

```ts
 * Purpose: Holding T shows that view everywhere, as before. Choosing Tech in the mode tabs keeps it on, but only on
```

- [ ] **Step 2: Create `src/renderer/map/mapModeTabs.ts`**

A new file that replaces `mapModeColumn.ts`. The code is the same, with the names changed: `wireMapModeColumn` becomes `wireMapModeTabs`, `syncMapModeColumn` becomes `syncMapModeTabs`, and the comments say tabs instead of buttons.

Create `src/renderer/map/mapModeTabs.ts` with exactly this content:

```ts
/**
 * The row of map-mode tabs across the top of the minimap panel: Weather and Tech choose the map view, Control and
 * Production are disabled placeholders in the markup, and Legend opens or closes the terrain legend.
 *
 * Purpose: Keeps the tabs, the stored view, and the legend in step.
 * When to use: `wireMapModeTabs` once at startup.
 * Expected outcome: Exactly one of Weather and Tech reads as pressed, and Legend reads as pressed while the legend is
 *   open.
 * Exceptions: None; missing elements are skipped.
 */
import type { MapViewMode } from '../../shared/mapViewMode';
import { layoutMapChrome } from './mapChromeLayout';
import { getMapViewMode, setMapViewMode } from './mapViewModeState';

/**
 * Sets each tab's pressed state from the stored view and the legend.
 *
 * Purpose: The tabs are the only sign of which view is on, so they must never disagree with it.
 * When to use: After the view changes or the legend opens or closes.
 * Expected outcome: `aria-pressed` on Weather and Tech matches the stored view; `aria-pressed` and `aria-expanded` on
 *   Legend match whether `#terrain-legend` is shown.
 * Exceptions: None.
 */
function syncMapModeTabs(): void {
  const mode = getMapViewMode();
  document.getElementById('map-mode-weather')?.setAttribute('aria-pressed', String(mode === 'weather'));
  document.getElementById('map-mode-tech')?.setAttribute('aria-pressed', String(mode === 'tech'));
  const legendOpen = document.getElementById('terrain-legend')?.hidden === false;
  const legendToggle = document.getElementById('map-legend-toggle');
  legendToggle?.setAttribute('aria-pressed', String(legendOpen));
  legendToggle?.setAttribute('aria-expanded', String(legendOpen));
}

/**
 * Switches the map to a view, unless it is already showing.
 *
 * Purpose: The view decides the terrain fill, the hex codes, and the status icons, which the canvas draws.
 * When to use: From the Weather and Tech tabs.
 * Expected outcome: The view is stored, the tabs follow, and the map is redrawn.
 * Exceptions: None.
 */
function chooseMapView(mode: MapViewMode, requestRedraw: () => void): void {
  if (getMapViewMode() === mode) return;
  setMapViewMode(mode);
  syncMapModeTabs();
  requestRedraw();
}

/**
 * Opens the terrain legend, or closes it if it is open.
 *
 * Purpose: The legend is a popover now, closed until the player asks for it.
 * When to use: From the Legend tab.
 * Expected outcome: The legend shows or hides, the tab follows, and the legend and the toast band are placed again.
 * Exceptions: None.
 */
function toggleTerrainLegend(): void {
  const legend = document.getElementById('terrain-legend');
  if (!legend) return;
  legend.hidden = !legend.hidden;
  syncMapModeTabs();
  layoutMapChrome();
}

/**
 * Wires the Weather, Tech, and Legend tabs.
 *
 * Purpose: The mode tabs' single setup point.
 * When to use: Once at startup, after the maps and the legend are built.
 * Expected outcome: Clicks change the view or the legend, and the tabs show the session's starting state.
 * Exceptions: None.
 */
export function wireMapModeTabs(requestRedraw: () => void): void {
  document.getElementById('map-mode-weather')?.addEventListener('click', () => chooseMapView('weather', requestRedraw));
  document.getElementById('map-mode-tech')?.addEventListener('click', () => chooseMapView('tech', requestRedraw));
  document.getElementById('map-legend-toggle')?.addEventListener('click', toggleTerrainLegend);
  syncMapModeTabs();
}
```

- [ ] **Step 3: Edit `src/renderer/map/initCore.ts`**

Imports and calls `wireMapModeTabs` instead of `wireMapModeColumn`.

1. In `src/renderer/map/initCore.ts`, find this line. It occurs exactly once:

```ts
import { wireMapModeColumn } from './mapModeColumn';
```

Replace it with:

```ts
import { wireMapModeTabs } from './mapModeTabs';
```

2. In `src/renderer/map/initCore.ts`, find this line. It occurs exactly once:

```ts
    wireMapModeColumn(() => deps.requestRedraw());
```

Replace it with:

```ts
    wireMapModeTabs(() => deps.requestRedraw());
```

- [ ] **Step 4: Delete `src/renderer/map/mapModeColumn.ts`**

Delete the old file. `mapModeTabs.ts` replaces it, and nothing imports it after the step before this one.

Delete `src/renderer/map/mapModeColumn.ts`:

```powershell
Remove-Item src/renderer/map/mapModeColumn.ts
```

- [ ] **Step 5: Edit `src/renderer/map/mapViewModeState.ts`**

Comments only: they say "mode tabs" instead of "mode column".

1. In `src/renderer/map/mapViewModeState.ts`, find these lines. Together they occur exactly once:

```ts
 * The map view the player chose in the mode column. This module holds that choice for the rest of the session; it is
 * not saved, so the app opens on the Weather view each time.
 *
 * Purpose: The mode column writes the choice and the drawing code reads it, without either importing the other.
```

Replace them with:

```ts
 * The map view the player chose in the mode tabs. This module holds that choice for the rest of the session; it is
 * not saved, so the app opens on the Weather view each time.
 *
 * Purpose: The mode tabs write the choice and the drawing code reads it, without either importing the other.
```

2. In `src/renderer/map/mapViewModeState.ts`, find this line. It occurs exactly once:

```ts
 * The view chosen in the mode column.
```

Replace it with:

```ts
 * The view chosen in the mode tabs.
```

3. In `src/renderer/map/mapViewModeState.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Drawing code and the mode column's buttons follow the same choice.
 * When to use: Each time the inspection view is decided, and when the mode column redraws its buttons.
```

Replace them with:

```ts
 * Purpose: Drawing code and the mode tabs follow the same choice.
 * When to use: Each time the inspection view is decided, and when the mode tabs redraw their pressed state.
```

4. In `src/renderer/map/mapViewModeState.ts`, find this line. It occurs exactly once:

```ts
 * When to use: Only from the mode column's Weather and Tech buttons.
```

Replace it with:

```ts
 * When to use: Only from the Weather and Tech tabs.
```

- [ ] **Step 6: Edit `src/renderer/gameplay/productionOverlayHelpers.ts`**

A comment only: it says "mode tabs" instead of "mode column".

In `src/renderer/gameplay/productionOverlayHelpers.ts`, find this line. It occurs exactly once:

```ts
 *   it along; the answer now also covers the Tech view chosen in the mode column.
```

Replace it with:

```ts
 *   it along; the answer now also covers the Tech view chosen in the mode tabs.
```

- [ ] **Step 7: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 8: Edit `static/index.html`**

Renames the group `#map-mode-column` to `#map-mode-tabs` and moves it above `#minimap`, so the tabs sit on top of the overview. Each label is wrapped in a `<span>`. The five button ids, their tips, and their icons do not change.

In `static/index.html`, find these lines. Together they occur exactly once:

```html
      <div id="minimap" aria-label="World overview"></div>
      <div id="map-mode-column" class="map-mode-column" role="group" aria-label="Map modes">
        <button type="button" id="map-mode-weather" class="map-mode-btn" aria-pressed="true" data-control-tooltip="Show the map as usual: terrain, and each hex's weather while the weather bonus is on."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 12.5h7a2.6 2.6 0 0 0 .3-5.2 4 4 0 0 0-7.6.9 2.2 2.2 0 0 0 .3 4.3z"></path></svg>Weather</button>
        <button type="button" id="map-mode-tech" class="map-mode-btn" aria-pressed="false" data-control-tooltip="Show each hex's code, production, and tech tier instead of terrain on the world map, until you choose Weather. Holding T shows the same view while the key is down."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5h6v6H5zM7 2.5V5M9 2.5V5M7 11v2.5M9 11v2.5M2.5 7H5M2.5 9H5M11 7h2.5M11 9h2.5"></path></svg>Tech</button>
        <span class="control-tooltip-host map-mode-host" data-control-tooltip="Control is not available in this version."><button type="button" id="map-mode-control" class="map-mode-btn" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5M4 3h7.5L9.7 5.8l1.8 2.7H4"></path></svg>Control</button></span>
        <span class="control-tooltip-host map-mode-host" data-control-tooltip="Production is not available in this version."><button type="button" id="map-mode-production" class="map-mode-btn" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M10.8 4.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.6 5.8 4.6 0 1.3-1.2 2.2-3 2.2-1.4 0-2.5-.6-3-1.5"></path></svg>Production</button></span>
        <button type="button" id="map-legend-toggle" class="map-mode-btn" aria-pressed="false" aria-expanded="false" aria-controls="terrain-legend" data-control-tooltip="Show or hide the terrain legend and its style choice."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h2M2.5 8h2M2.5 12h2M6.5 4h7M6.5 8h7M6.5 12h7"></path></svg>Legend</button>
      </div>
```

Replace them with:

```html
      <div id="map-mode-tabs" class="map-mode-tabs" role="group" aria-label="Map modes">
        <button type="button" id="map-mode-weather" class="map-mode-btn" aria-pressed="true" data-control-tooltip="Show the map as usual: terrain, and each hex's weather while the weather bonus is on."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 12.5h7a2.6 2.6 0 0 0 .3-5.2 4 4 0 0 0-7.6.9 2.2 2.2 0 0 0 .3 4.3z"></path></svg><span>Weather</span></button>
        <button type="button" id="map-mode-tech" class="map-mode-btn" aria-pressed="false" data-control-tooltip="Show each hex's code, production, and tech tier instead of terrain on the world map, until you choose Weather. Holding T shows the same view while the key is down."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5h6v6H5zM7 2.5V5M9 2.5V5M7 11v2.5M9 11v2.5M2.5 7H5M2.5 9H5M11 7h2.5M11 9h2.5"></path></svg><span>Tech</span></button>
        <span class="control-tooltip-host map-mode-host" data-control-tooltip="Control is not available in this version."><button type="button" id="map-mode-control" class="map-mode-btn" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5M4 3h7.5L9.7 5.8l1.8 2.7H4"></path></svg><span>Control</span></button></span>
        <span class="control-tooltip-host map-mode-host" data-control-tooltip="Production is not available in this version."><button type="button" id="map-mode-production" class="map-mode-btn" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M10.8 4.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.6 5.8 4.6 0 1.3-1.2 2.2-3 2.2-1.4 0-2.5-.6-3-1.5"></path></svg><span>Production</span></button></span>
        <button type="button" id="map-legend-toggle" class="map-mode-btn" aria-pressed="false" aria-expanded="false" aria-controls="terrain-legend" data-control-tooltip="Show or hide the terrain legend and its style choice."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h2M2.5 8h2M2.5 12h2M6.5 4h7M6.5 8h7M6.5 12h7"></path></svg><span>Legend</span></button>
      </div>
      <div id="minimap" aria-label="World overview"></div>
```

- [ ] **Step 9: Edit `static/shellChrome.css`**

Adds three tokens: the tab height and label size that the console rail and the map-mode tabs share, and the minimap's 280 px width. The minimap panel stacks the tab row over the overview, and the overview, not the panel, sets the width. The tabs take the console rail's look: an 18 px icon over a 9 px label, the rail's colors, a divider between tabs, and the accent bar on the bottom edge of a pressed tab, next to the overview.

1. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  --force-bar-opponent: #b02a62;
```

Replace it with:

```css
  --force-bar-opponent: #b02a62;
  /* One tab size for the console's rail and the map-mode tabs on the minimap panel, so the two sets match. */
  --chrome-tab-height: 58px;
  --chrome-tab-label-size: 9px;
  /* The minimap overview's width, and so the width of the tab row above it: five tabs of 56 px. */
  --minimap-width: 280px;
```

2. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
/* The minimap panel at the map's top-left: the 200px overview, then a 96px column of five 40px map-mode buttons. */
```

Replace it with:

```css
/* The minimap panel at the map's top-left: five map-mode tabs over the 280 x 200 overview, which sets the width. */
```

3. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
  display: flex;
  background: var(--chrome-bg);
```

Replace them with:

```css
  display: flex;
  flex-direction: column;
  background: var(--chrome-bg);
```

4. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  width: 200px;
```

Replace it with:

```css
  width: var(--minimap-width);
```

5. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
.map-mode-column {
  flex: none;
  width: 96px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--chrome-divider);
}
.map-mode-host {
  display: flex;
}
.map-mode-btn {
  width: 100%;
  height: 40px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-bottom: 1px solid var(--chrome-divider);
  border-radius: 0;
  background: transparent;
  color: var(--chrome-text);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.map-mode-column > :last-child {
  border-bottom: 0;
}
.map-mode-btn:hover {
  background: var(--chrome-bg-raised);
}
/* The chosen view and an open legend get the same mark as the console's selected tab, on the panel's inner edge. */
.map-mode-btn[aria-pressed="true"] {
  background: var(--chrome-bg-raised);
  box-shadow: inset 3px 0 0 var(--chrome-accent-edge);
```

Replace them with:

```css
/* Five equal tabs in the console rail's tab size and colors. Each tab's right edge is the divider before the next. */
.map-mode-tabs {
  flex: none;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  background: var(--chrome-rail-bg);
  border-bottom: 1px solid var(--chrome-divider);
}
.map-mode-host {
  display: flex;
  min-width: 0;
}
.map-mode-btn {
  width: 100%;
  min-width: 0;
  height: var(--chrome-tab-height);
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  border-right: 1px solid var(--chrome-divider);
  border-radius: 0;
  background: transparent;
  color: var(--chrome-muted);
  font-size: var(--chrome-tab-label-size);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.map-mode-tabs > :last-child {
  border-right: 0;
}
.map-mode-btn .chrome-icon {
  width: 18px;
  height: 18px;
}
.map-mode-btn:hover {
  background: var(--chrome-bg-raised);
  color: var(--chrome-text);
}
/* The chosen view and an open legend get the console's selected-tab mark, on the edge next to the overview. */
.map-mode-btn[aria-pressed="true"] {
  background: var(--chrome-bg-raised);
  color: var(--chrome-text);
  box-shadow: inset 0 -3px 0 var(--chrome-accent-edge);
```

6. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
  cursor: default;
}
/* Opened by the Legend button. mapChromeLayout.ts places it beside the minimap panel, or under it on a narrow map. */
```

Replace them with:

```css
  opacity: 0.6;
  cursor: default;
}
.map-mode-btn:focus {
  outline-offset: -2px;
}
/* Opened by the Legend tab. mapChromeLayout.ts places it beside the minimap panel, or under it on a narrow map. */
```

- [ ] **Step 10: Edit `static/frameChrome.css`**

The console rail's tabs take their height and label size from the new tokens, so the label drops from 10 px to 9 px.

1. In `static/frameChrome.css`, find this line. It occurs exactly once:

```css
  height: 58px;
```

Replace it with:

```css
  height: var(--chrome-tab-height);
```

2. In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
  gap: 5px;
  font-size: 10px;
```

Replace them with:

```css
  gap: 5px;
  font-size: var(--chrome-tab-label-size);
```

- [ ] **Step 11: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

The page probe also reads each element's computed font size.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
 *   null when the selector matches nothing, otherwise the first match's box, text, and the attributes the checks use,
 *   plus the text of every match in `allTexts`.
```

Replace them with:

```js
 *   null when the selector matches nothing, otherwise the first match's box, text, font size, and the attributes the
 *   checks use, plus the text of every match in `allTexts`.
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
   * Expected outcome: The first match's box, whether it is shown, its trimmed text, and selected attributes, and the
   *   trimmed text of every match, or null when the selector matches nothing.
```

Replace them with:

```js
   * Expected outcome: The first match's box, whether it is shown, its trimmed text, its computed font size, and selected
   *   attributes, and the trimmed text of every match, or null when the selector matches nothing.
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
      pressed: el.getAttribute('aria-pressed'),
```

Replace it with:

```js
      pressed: el.getAttribute('aria-pressed'),
      fontSize: getComputedStyle(el).fontSize,
```

- [ ] **Step 12: Edit `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`**

The panel check now expects the row of five 56 × 58 px tabs at the top of the panel and the 280 × 200 overview under it. A new check, `map-mode-tabs-match-rail`, compares a map-mode tab with a console tab: both 9 px labels, and the same height. The messages say tabs.

1. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
 * Checks of the chrome on the map for the UI smoke run: the minimap panel and its mode buttons, the terrain legend, and
```

Replace it with:

```js
 * Checks of the chrome on the map for the UI smoke run: the minimap panel and its map-mode tabs, the terrain legend, and
```

2. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find these lines. Together they occur exactly once:

```js
 * Sizes of the minimap panel, in CSS pixels.
 *
 * Purpose: The panel keeps today's 200 px minimap and adds a 96 px column of five 40 px buttons, 12 px in from the map's
 *   top-left corner. The legend opens 8 px from it.
 * When to use: The panel and legend geometry checks.
 * Expected outcome: Matches `.minimap-panel` and `.map-mode-btn` in `static/shellChrome.css`, and `MAP_CHROME_INSET`
 *   and `MAP_CHROME_GAP` in `src/shared/mapChromePlacement.ts`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({ inset: 12, minimap: 200, column: 96, button: 40, legendGap: 8 });

/**
 * The map-mode buttons, top to bottom.
 *
 * Purpose: The panel's column must hold exactly these, in this order.
```

Replace them with:

```js
 * Sizes of the minimap panel, in CSS pixels, and the label size its tabs share with the console rail.
 *
 * Purpose: The panel sits 12 px in from the map's top-left corner: a row of five 56 x 58 px tabs, then the 280 x 200 px
 *   overview under it. The legend opens 8 px from the panel.
 * When to use: The panel, tab, and legend checks.
 * Expected outcome: Matches `--minimap-width`, `--chrome-tab-height`, and `--chrome-tab-label-size` in
 *   `static/shellChrome.css`, and `MAP_CHROME_INSET` and `MAP_CHROME_GAP` in `src/shared/mapChromePlacement.ts`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({ inset: 12, minimapWidth: 280, minimapHeight: 200, tabWidth: 56, tabHeight: 58, labelSize: '9px', legendGap: 8 });

/**
 * The map-mode tabs, left to right.
 *
 * Purpose: The panel's tab row must hold exactly these, in this order.
```

3. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
const MODE_BUTTONS = Object.freeze(['#map-mode-weather', '#map-mode-tech', '#map-mode-control', '#map-mode-production', '#map-legend-toggle']);
```

Replace it with:

```js
const MODE_TABS = Object.freeze(['#map-mode-weather', '#map-mode-tech', '#map-mode-control', '#map-mode-production', '#map-legend-toggle']);
```

4. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
    needs: ['#canvas-container', '#minimap-panel', '#minimap', '#map-mode-column', ...MODE_BUTTONS],
```

Replace it with:

```js
    needs: ['#canvas-container', '#minimap-panel', '#minimap', '#map-mode-tabs', ...MODE_TABS],
```

5. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
      const column = el('#map-mode-column');
```

Replace it with:

```js
      const tabs = el('#map-mode-tabs');
```

6. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find these lines. Together they occur exactly once:

```js
      if (!near(mini.w, PANEL.minimap) || !near(mini.h, PANEL.minimap)) return `the minimap is ${fmt(mini)}, expected ${PANEL.minimap}x${PANEL.minimap}`;
      if (!near(column.w, PANEL.column) || column.x < mini.x + mini.w - 1) return `the mode column is ${fmt(column)}, expected ${PANEL.column} px wide right of the minimap`;
      for (const [i, selector] of MODE_BUTTONS.entries()) {
        const button = el(selector);
        if (!near(button.h, PANEL.button) || !near(button.y, column.y + i * PANEL.button)) {
          return `${selector} is at ${fmt(button)}, expected button ${i + 1} of the column, ${PANEL.button} px tall`;
        }
```

Replace them with:

```js
      if (!near(tabs.w, PANEL.minimapWidth) || !near(tabs.y, panel.y + 1)) {
        return `the mode tabs are at ${fmt(tabs)}, expected a ${PANEL.minimapWidth} px row at the top of the panel ${fmt(panel)}`;
      }
      for (const [i, selector] of MODE_TABS.entries()) {
        const tab = el(selector);
        if (!near(tab.w, PANEL.tabWidth) || !near(tab.h, PANEL.tabHeight) || !near(tab.x, tabs.x + i * PANEL.tabWidth) || !near(tab.y, tabs.y)) {
          return `${selector} is at ${fmt(tab)}, expected tab ${i + 1} of the row, ${PANEL.tabWidth}x${PANEL.tabHeight}`;
        }
      }
      if (!near(mini.w, PANEL.minimapWidth) || !near(mini.h, PANEL.minimapHeight) || mini.y < tabs.y + tabs.h - 1) {
        return `the minimap is at ${fmt(mini)}, expected ${PANEL.minimapWidth}x${PANEL.minimapHeight} under the tabs ${fmt(tabs)}`;
```

7. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find these lines. Together they occur exactly once:

```js
    name: 'map-mode-weather-default',
    scenes: [...PLACEMENT_SCENES, SCENES.ordersQueued],
    needs: [...MODE_BUTTONS, '#terrain-legend'],
    run: (p, el) => {
      const state = MODE_BUTTONS.map((selector) => `${selector} ${el(selector).disabled ? 'disabled' : `pressed=${el(selector).pressed}`}`);
```

Replace them with:

```js
    name: 'map-mode-tabs-match-rail',
    scenes: PLACEMENT_SCENES,
    needs: ['#map-mode-weather', '#console-tab-orders'],
    run: (p, el) => {
      const tab = el('#map-mode-weather');
      const rail = el('#console-tab-orders');
      if (tab.fontSize !== PANEL.labelSize || rail.fontSize !== PANEL.labelSize) {
        return `the tab labels are ${tab.fontSize} on the minimap panel and ${rail.fontSize} on the console rail, expected ${PANEL.labelSize} on both`;
      }
      return near(tab.h, rail.h) ? null : `a map-mode tab is ${tab.h} px tall and a console tab ${rail.h} px, expected the same height`;
    },
  },
  {
    name: 'map-mode-weather-default',
    scenes: [...PLACEMENT_SCENES, SCENES.ordersQueued],
    needs: [...MODE_TABS, '#terrain-legend'],
    run: (p, el) => {
      const state = MODE_TABS.map((selector) => `${selector} ${el(selector).disabled ? 'disabled' : `pressed=${el(selector).pressed}`}`);
```

8. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
      if (state.join(', ') !== expected.join(', ')) return `the mode buttons read "${state.join(', ')}"`;
```

Replace it with:

```js
      if (state.join(', ') !== expected.join(', ')) return `the mode tabs read "${state.join(', ')}"`;
```

9. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
      return line === 'Weather pressed=false, Tech pressed=true' ? null : `the view buttons read "${line}"`;
```

Replace it with:

```js
      return line === 'Weather pressed=false, Tech pressed=true' ? null : `the view tabs read "${line}"`;
```

10. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
      if (toggle.pressed !== 'true' || toggle.expanded !== 'true') return `the Legend button reads pressed=${toggle.pressed}, expanded=${toggle.expanded}`;
```

Replace it with:

```js
      if (toggle.pressed !== 'true' || toggle.expanded !== 'true') return `the Legend tab reads pressed=${toggle.pressed}, expanded=${toggle.expanded}`;
```

- [ ] **Step 13: Edit `doc/ux/minimap.md`**

Describes the tab row, the 280 × 200 overview, and the renamed module.

1. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
The minimap panel at the map's top-left: the loaded-map overview, and the column of map-mode buttons beside it.
````

Replace it with:

````markdown
The minimap panel at the map's top-left: a row of map-mode tabs, and the loaded-map overview under it.
````

2. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
Shown with the map in every mode where the map container is visible, except New game and Game over, where the whole panel is hidden. It shows again when that overlay closes. After a successful start it shows the new match. The overview does not accept pointer input. In Tactical annihilation, and while the tactical battles list is open, the panel stays visible and pointer input on the whole map container is off, which includes the panel and its buttons.

## Information Displayed

- The panel sits 12 px in from the map's top-left corner, in the navy chrome. The overview is 200 × 200 px on the left; the mode column is 96 px wide on the right, with five 40 px buttons, each with an icon and a label.
- An overview of the loaded map, the Mercator world in a global match and the region's hexes in a regional match, using the same basemap family as the main map.
- A rectangle for the main view when the main view covers less of the world than the overview. When the main view is wide enough, the rectangle is removed.
- The mode buttons, top to bottom:
````

Replace them with:

````markdown
Shown with the map in every mode where the map container is visible, except New game and Game over, where the whole panel is hidden. It shows again when that overlay closes. After a successful start it shows the new match. The overview does not accept pointer input. In Tactical annihilation, and while the tactical battles list is open, the panel stays visible and pointer input on the whole map container is off, which includes the panel and its tabs.

## Information Displayed

- The panel sits 12 px in from the map's top-left corner, in the navy chrome, and is 280 px wide inside its border (`--minimap-width`). A row of five map-mode tabs runs across its top, and the 280 × 200 px overview sits under them.
- Each tab is 56 × 58 px, the same size as a tab on the console's rail (`--chrome-tab-height`): an 18 px icon above a 9 px label (`--chrome-tab-label-size`), in the rail's colors. A label never wraps.
- An overview of the loaded map, the Mercator world in a global match and the region's hexes in a regional match, using the same basemap family as the main map. In a global match it shows the whole width of the world; its height cuts the world off at about 80° north and south.
- A rectangle for the main view when the main view covers less of the world than the overview. When the main view is wide enough, the rectangle is removed.
- The map-mode tabs, left to right:
````

3. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- The chosen view, Weather or Tech, and Legend while the legend is open, read as pressed: a lighter row with a teal mark on its left edge.
````

Replace it with:

````markdown
- The chosen view, Weather or Tech, and Legend while the legend is open, read as pressed: a lighter tab with a teal mark on its bottom edge, next to the overview.
````

4. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks Weather or Tech, the map switches to that view and the button reads as pressed. Clicking the view already chosen does nothing.
````

Replace it with:

````markdown
- When the player clicks Weather or Tech, the map switches to that view and the tab reads as pressed. Clicking the view already chosen does nothing.
````

5. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- Weather view or Tech view: chosen with the mode buttons. The choice lasts until the app closes, across turns, battles, and new matches. It is not saved.
````

Replace it with:

````markdown
- Weather view or Tech view: chosen with the map-mode tabs. The choice lasts until the app closes, across turns, battles, and new matches. It is not saved.
````

6. In `doc/ux/minimap.md`, find this text. It occurs exactly once:

````markdown
In a battle, including a beat's playback, the mode buttons still work, and the map keeps its normal view until the player leaves the battle.
````

Replace it with:

````markdown
In a battle, including a beat's playback, the map-mode tabs still work, and the map keeps its normal view until the player leaves the battle.
````

7. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#minimap-panel`, `#minimap`, `#map-mode-column`)
- `static/shellChrome.css` (`.minimap-panel`, `.map-mode-btn`)
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/map/mapExtent.ts`
- `src/renderer/map/mapModeColumn.ts`
````

Replace them with:

````markdown
- `static/index.html` (`#minimap-panel`, `#map-mode-tabs`, `#minimap`)
- `static/shellChrome.css` (`--minimap-width`, `--chrome-tab-height`, `--chrome-tab-label-size`, `.minimap-panel`, `.map-mode-tabs`, `.map-mode-btn`)
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/map/mapExtent.ts`
- `src/renderer/map/mapModeTabs.ts`
````

- [ ] **Step 14: Edit `doc/ux/terrain-legend.md`**

Names `mapModeTabs.ts` in its code entry points.

In `doc/ux/terrain-legend.md`, find this line. It occurs exactly once:

````markdown
- `src/renderer/map/mapModeColumn.ts`
````

Replace it with:

````markdown
- `src/renderer/map/mapModeTabs.ts`
````

- [ ] **Step 15: Edit `doc/ux/input-map.md`**

Says the map-mode tabs are above the minimap.

In `doc/ux/input-map.md`, find this line. It occurs exactly once:

````markdown
| Click | Map mode buttons beside the minimap | Weather or Tech chooses the map view. Legend opens or closes the terrain legend. | [minimap.md](minimap.md) |
````

Replace it with:

````markdown
| Click | Map-mode tabs above the minimap | Weather or Tech chooses the map view. Legend opens or closes the terrain legend. | [minimap.md](minimap.md) |
````

- [ ] **Step 16: Edit `doc/ux-specification.md`**

Says "map-mode tabs".

1. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| The minimap panel or its map-mode buttons | [map-surface.md](ux/map-surface.md) | [minimap.md](ux/minimap.md) |
````

Replace it with:

````markdown
| The minimap panel or its map-mode tabs | [map-surface.md](ux/map-surface.md) | [minimap.md](ux/minimap.md) |
````

2. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [minimap.md](ux/minimap.md): the minimap panel: the world overview, how it relates to the main map view, and the map-mode buttons beside it.
````

Replace it with:

````markdown
- [minimap.md](ux/minimap.md): the minimap panel: the world overview, how it relates to the main map view, and the map-mode tabs above it.
````

- [ ] **Step 17: Edit `doc/ux/right-panel.md`**

Gives the rail tabs' 9 px label size.

In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- A tab rail on the panel's outer edge, with Orders, Reports, Opponent, Build, and Forces. Build and Forces are disabled in this version. The selected tab is marked while the panel is expanded, and the mark is cleared while the panel is collapsed.
````

Replace it with:

````markdown
- A tab rail on the panel's outer edge, with Orders, Reports, Opponent, Build, and Forces. Build and Forces are disabled in this version. Each tab is 56 × 58 px, an icon above a 9 px label, the same size as the map-mode tabs on the [minimap panel](minimap.md). The selected tab is marked while the panel is expanded, and the mark is cleared while the panel is collapsed.
````

- [ ] **Step 18: Edit `doc/ui-style-guide.md`**

Updates the minimap line for the tab row and the wider overview.

In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
Small Leaflet overview with a viewport rectangle, in a navy panel at the map's top-left with a 96 px column of map-mode buttons (Weather, Tech, Control, Production, Legend). A chosen mode gets the console's selected-tab mark: a lighter row with a teal left edge.
````

Replace it with:

````markdown
A 280 × 200 px Leaflet overview with a viewport rectangle, in a navy panel at the map's top-left, under a row of five map-mode tabs (Weather, Tech, Control, Production, Legend). The tabs are the console rail's tabs: 56 × 58 px, an 18 px icon above a 9 px label, in the rail's colors (`--chrome-tab-height`, `--chrome-tab-label-size`). A chosen mode gets the console's selected-tab mark: a lighter tab with a teal edge, here on the edge next to the overview.
````

- [ ] **Step 19: Edit `doc/how-to-play.md`**

Says to choose Tech above the minimap.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Seeing them:** the flag tooltip lists a unit's bonuses. A hex tooltip shows that hex's weather and terrain effects. Choose **Tech** beside the minimap, or hold T, to see each hex's tech tier.
````

Replace it with:

````markdown
- **Seeing them:** the flag tooltip lists a unit's bonuses. A hex tooltip shows that hex's weather and terrain effects. Choose **Tech** above the minimap, or hold T, to see each hex's tech tier.
````

## Verify

- [ ] **Step 20: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 21: Full tests**

Run the full tests. Expected: exit 0, test total **889**, failure total **0**.

- [ ] **Step 22: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/mapViewMode.ts src/renderer/map/mapModeTabs.ts src/renderer/map/initCore.ts src/renderer/map/mapViewModeState.ts src/renderer/gameplay/productionOverlayHelpers.ts static/index.html static/shellChrome.css static/frameChrome.css scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs doc/ux/minimap.md doc/ux/terrain-legend.md doc/ux/input-map.md doc/ux-specification.md doc/ux/right-panel.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/mapViewMode.ts` | `e9130d887257dbd5` |
| `src/renderer/map/mapModeTabs.ts` | `03d13e27b664ba36` |
| `src/renderer/map/initCore.ts` | `dc25b8f650722c00` |
| `src/renderer/map/mapViewModeState.ts` | `91fd15af633bfc2a` |
| `src/renderer/gameplay/productionOverlayHelpers.ts` | `b68303bc97ec0d66` |
| `static/index.html` | `703275575d1e438b` |
| `static/shellChrome.css` | `5c8e10e35c0b4239` |
| `static/frameChrome.css` | `3aa711da7e09b3f1` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `11f85dac6eb5504b` |
| `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs` | `fcf87e89fbab2122` |
| `doc/ux/minimap.md` | `1cb9c822e5d65dd9` |
| `doc/ux/terrain-legend.md` | `107d4e99cb9f75e9` |
| `doc/ux/input-map.md` | `c864be8baa1d1917` |
| `doc/ux-specification.md` | `8885a06d3e30b382` |
| `doc/ux/right-panel.md` | `bcb0cbd725024f4c` |
| `doc/ui-style-guide.md` | `8be0aaca31356ec6` |
| `doc/how-to-play.md` | `b7306dad4797bce5` |

This must print `False`, because this plan deletes it:

```powershell
Test-Path src/renderer/map/mapModeColumn.ts
```

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 23: Smoke run**

```powershell
npm run ui:smoke -- --label mode-tabs
```

Expected summary line:

```text
ui-smoke mode-tabs: 422 passed, 0 failed, 0 page errors, 34 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\mode-tabs
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/mode-tabs/report.json`.

- [ ] **Step 24: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/mode-tabs/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run.

- `02-strategic-1280x720.png` against [ui-facelift-revision-1-expected-strategic.png](ui-facelift-revision-1-expected-strategic.png): the minimap panel at the map's top-left: five tabs, Weather, Tech, Control, Production, and Legend, across its top, with Weather lighter and a teal bar on its bottom edge. Control and Production are dimmed. The overview under them is wider than it is tall. The console rail on the right has the same tab height and label size.
- `13-legend-open.png` against [ui-facelift-revision-1-expected-legend.png](ui-facelift-revision-1-expected-legend.png): Legend is pressed, with its teal bar, and the terrain legend is open to the right of the minimap panel.
- `21-legend-small-window.png` against [ui-facelift-revision-1-expected-legend-small-window.png](ui-facelift-revision-1-expected-legend-small-window.png): the same at 800 × 600. Every label fits its tab without wrapping, and the legend sits beside the panel.

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

1. Start a global match: the minimap panel shows the five tabs across its top over the wider overview, and the overview shows the whole width of the world. No label wraps; "Production" fits its tab.
2. Click Tech: it turns lighter with a teal bar on its bottom edge, and the map shows hex codes and tech tiers. Click Weather to return. Hold T under Weather: the same view shows while the key is down.
3. Click Legend, then click it again: the legend opens beside the panel and closes.
4. Point at Control and at Production: each shows its "not available in this version" tip.
5. Press Tab until a map-mode tab has focus: the focus ring sits inside the tab and is not cut off.
6. Compare the tab row with the console rail on the right: the labels are the same size, and the tabs the same height.
7. Start a regional match: the overview fits the region into the wider box.

## Next

Plan 2 turns the selection panel's header and action row into the summary bar.
