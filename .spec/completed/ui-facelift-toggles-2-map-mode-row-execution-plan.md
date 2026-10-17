# UI Facelift Toggles, Plan 2 of 3: Map-Mode Tabs Under the Minimap

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Move the row of map-mode tabs (Weather, Tech, Control, Production, Legend) from above the minimap's overview to below it, and hide the row until the player asks for it. A 32 px toggle on the overview's lower-left corner, in the selection bar's expand-control style, shows and hides the row; its chevron points down while the row is hidden and up while it shows. Hiding the row also closes the terrain legend.

**Requirements:** [ui-facelift-toggles-execution-plan.md](ui-facelift-toggles-execution-plan.md) lists the requested changes and the decisions made for them. This plan is part 2 of the three that build them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and that index disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `static/index.html`: `#minimap` moves to the top of `#minimap-panel`, wrapped in `.minimap-overview` with the new `#map-mode-tabs-toggle` on its lower-left corner. `#map-mode-tabs` moves under it, with `hidden` set.
- `static/shellChrome.css`: the wrapper, the toggle, a rule that hides the row while `hidden` is set, and the pressed mark on the tabs' top edge, next to the overview.
- `mapModeTabs.ts`: the toggle shows and hides the row, keeps its `aria-expanded`, name, and tip in step, closes the legend when the row hides, and places the legend and the toast band again. The row's `hidden` attribute is the stored state, so the choice lasts until the app closes.
- `frameTooltipText.ts`: the toggle's two tips.
- The smoke run shows the row before it uses the tabs, and hides it in the small window while the legend is open; one new scene. The panel check reads both layouts.
- `doc/` follows.

**Out of scope:**

- What Weather and Tech do (plan 3). In this plan they still choose one view or the other.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop, the full tests, and the smoke run against the real app in Electron passed. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no phase names, and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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
2. [ui-facelift-toggles-execution-plan.md](ui-facelift-toggles-execution-plan.md): Requested Changes and Decisions.
3. `doc/ux/minimap.md` and `doc/ux/terrain-legend.md`.
4. `src/renderer/map/mapModeTabs.ts`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 1 is in and this plan is not:

```powershell
[bool](Select-String -Path static/index.html -Pattern 'selection-panel-reticle' -SimpleMatch -Quiet)
[bool](Select-String -Path static/index.html -Pattern 'map-mode-tabs-toggle' -SimpleMatch -Quiet)
```

Expected: `True`, `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **896**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/renderer/chrome/frameTooltipText.ts`
- `src/renderer/map/mapModeTabs.ts`
- `static/index.html`
- `static/shellChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/minimap.md`
- `doc/ux/terrain-legend.md`
- `doc/ux/input-map.md`
- `doc/ux/control-tooltips.md`
- `doc/ux-specification.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Edit `src/renderer/chrome/frameTooltipText.ts`**

Two tips for the new toggle on the overview's corner: one while the tabs are hidden, one while they show.

In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * The Weather map mode's tip.
```

Replace them with:

```ts
/**
 * The tip of the toggle on the minimap overview's corner while the map-mode tabs are hidden.
 *
 * Purpose: Says what the toggle shows and where.
 * When to use: `#map-mode-tabs-toggle` while `#map-mode-tabs` is hidden. The static markup starts with this sentence.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapModeTabsShowTooltipText = 'Show the Weather, Tech, and Legend buttons under the overview.';

/**
 * The tip of the toggle on the minimap overview's corner while the map-mode tabs show.
 *
 * Purpose: Says what the toggle hides, and that the terrain legend closes with the tabs.
 * When to use: `#map-mode-tabs-toggle` while `#map-mode-tabs` shows.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const mapModeTabsHideTooltipText =
  'Hide the Weather, Tech, and Legend buttons. Hiding them also closes the terrain legend.';

/**
 * The Weather map mode's tip.
```

- [ ] **Step 2: Edit `src/renderer/map/mapModeTabs.ts`**

The toggle shows and hides the row of tabs, keeps its name, tip, and `aria-expanded` in step, closes the legend when the row hides, and places the legend and the toast band again.

1. In `src/renderer/map/mapModeTabs.ts`, find these lines. Together they occur exactly once:

```ts
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
```

Replace them with:

```ts
 * The row of map-mode tabs under the minimap overview: Weather and Tech choose the map view, Control and Production are
 * disabled placeholders in the markup, and Legend opens or closes the terrain legend. The row starts hidden, and the
 * toggle on the overview's lower-left corner shows and hides it.
 *
 * Purpose: Keeps the tabs, the row's toggle, the stored view, and the legend in step.
 * When to use: `wireMapModeTabs` once at startup.
 * Expected outcome: Exactly one of Weather and Tech reads as pressed, and Legend reads as pressed while the legend is
 *   open. The toggle reads as expanded while the row shows.
 * Exceptions: None; missing elements are skipped.
 */
import type { MapViewMode } from '../../shared/mapViewMode';
import { mapModeTabsHideTooltipText, mapModeTabsShowTooltipText } from '../chrome/frameTooltipText';
```

2. In `src/renderer/map/mapModeTabs.ts`, find these lines. Together they occur exactly once:

```ts
 * Wires the Weather, Tech, and Legend tabs.
 *
 * Purpose: The mode tabs' single setup point.
 * When to use: Once at startup, after the maps and the legend are built.
 * Expected outcome: Clicks change the view or the legend, and the tabs show the session's starting state.
 * Exceptions: None.
 */
export function wireMapModeTabs(requestRedraw: () => void): void {
```

Replace them with:

```ts
 * Shows or hides the row of map-mode tabs under the overview.
 *
 * Purpose: The panel is only the overview until the player asks for the tabs. The Legend tab is in the row, so hiding
 *   the row also closes the legend, which would otherwise have no control on screen to close it.
 * When to use: From the toggle on the overview's lower-left corner. The row's `hidden` attribute is the stored state, so
 *   the choice lasts until the app closes, including while the panel is hidden for the new-game overlay.
 * Expected outcome: The row shows or hides; the toggle's `aria-expanded`, name, and tip follow; a hidden row closes the
 *   legend; and the legend and the toast band are placed again for the panel's new height.
 * Exceptions: None; missing elements are skipped.
 */
function setMapModeTabsShown(shown: boolean): void {
  const row = document.getElementById('map-mode-tabs');
  const toggle = document.getElementById('map-mode-tabs-toggle');
  if (!row || !toggle) return;
  row.hidden = !shown;
  toggle.setAttribute('aria-expanded', String(shown));
  toggle.setAttribute('aria-label', shown ? 'Hide the map modes' : 'Show the map modes');
  toggle.setAttribute('data-control-tooltip', shown ? mapModeTabsHideTooltipText : mapModeTabsShowTooltipText);
  const legend = document.getElementById('terrain-legend');
  if (!shown && legend) legend.hidden = true;
  syncMapModeTabs();
  layoutMapChrome();
}

/**
 * Wires the row's toggle and the Weather, Tech, and Legend tabs.
 *
 * Purpose: The mode tabs' single setup point.
 * When to use: Once at startup, after the maps and the legend are built.
 * Expected outcome: Clicks show or hide the row, or change the view or the legend, and the tabs show the session's
 *   starting state. The row's starting state, hidden, comes from the markup.
 * Exceptions: None.
 */
export function wireMapModeTabs(requestRedraw: () => void): void {
  document.getElementById('map-mode-tabs-toggle')?.addEventListener('click', () => {
    setMapModeTabsShown(document.getElementById('map-mode-tabs')?.hidden === true);
  });
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

The overview moves to the top of the panel, wrapped with the new toggle on its lower-left corner. The row of tabs moves under it and starts hidden.

1. In `static/index.html`, find this line. It occurs exactly once:

```html
      <div id="map-mode-tabs" class="map-mode-tabs" role="group" aria-label="Map modes">
```

Replace it with:

```html
      <div class="minimap-overview">
        <div id="minimap" aria-label="World overview"></div>
        <button type="button" id="map-mode-tabs-toggle" class="minimap-tabs-toggle" aria-expanded="false" aria-controls="map-mode-tabs" aria-label="Show the map modes" data-control-tooltip="Show the Weather, Tech, and Legend buttons under the overview."><svg class="chrome-icon minimap-tabs-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5 4.5-4.5"></path></svg></button>
      </div>
      <div id="map-mode-tabs" class="map-mode-tabs" role="group" aria-label="Map modes" hidden>
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
      </div>
      <div id="minimap" aria-label="World overview"></div>
```

Replace them with:

```html
      </div>
```

- [ ] **Step 5: Edit `static/shellChrome.css`**

The overview wrapper, the toggle in the selection bar's expand-control style, the row's hidden rule, and the pressed mark on the tabs' top edge, next to the overview.

1. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  /* The minimap overview's width, and so the width of the tab row above it: five tabs of 56 px. */
```

Replace it with:

```css
  /* The minimap overview's width, and so the width of the tab row under it: five tabs of 56 px. */
```

2. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
/* The minimap panel at the map's top-left: five map-mode tabs over the 280 x 200 overview, which sets the width. */
```

Replace it with:

```css
/* The minimap panel at the map's top-left: the 280 x 200 overview, which sets the width, and under it a row of five
   map-mode tabs. The tabs start hidden; the toggle on the overview's lower-left corner shows and hides them. */
```

3. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
#minimap {
  flex: none;
  width: var(--minimap-width);
  height: 200px;
  background: #e8e4e0;
```

Replace them with:

```css
/* The overview, with the tabs toggle laid over its lower-left corner. The overview is its own stacking context, so
   Leaflet's panes stay under the toggle. */
.minimap-overview {
  flex: none;
  position: relative;
}
#minimap {
  width: var(--minimap-width);
  height: 200px;
  background: #e8e4e0;
  isolation: isolate;
}
/* The selection bar's expand control as a 32 px square, with dividers on its two inner edges. The chevron points down
   while the tabs are hidden and turns up while they show. */
.minimap-tabs-toggle {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 1;
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-top: 1px solid var(--chrome-divider);
  border-right: 1px solid var(--chrome-divider);
  border-radius: 0;
  background: var(--chrome-bg);
  color: var(--chrome-text);
}
.minimap-tabs-toggle:hover {
  background: var(--chrome-bg-raised);
}
.minimap-tabs-toggle:focus {
  outline-offset: -2px;
}
.minimap-tabs-toggle[aria-expanded="true"] .minimap-tabs-chevron {
  transform: rotate(180deg);
```

4. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
/* Five equal tabs in the console rail's tab size and colors. Each tab's right edge is the divider before the next. */
```

Replace it with:

```css
/* Five equal tabs in the console rail's tab size and colors, under the overview. Each tab's right edge is the divider
   before the next. */
```

5. In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  border-bottom: 1px solid var(--chrome-divider);
```

Replace it with:

```css
  border-top: 1px solid var(--chrome-divider);
}
.map-mode-tabs[hidden] {
  display: none;
```

6. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
/* The chosen view and an open legend get the console's selected-tab mark, on the edge next to the overview. */
.map-mode-btn[aria-pressed="true"] {
  background: var(--chrome-bg-raised);
  color: var(--chrome-text);
  box-shadow: inset 0 -3px 0 var(--chrome-accent-edge);
```

Replace them with:

```css
/* The chosen view and an open legend get the console's selected-tab mark, on the top edge, next to the overview. */
.map-mode-btn[aria-pressed="true"] {
  background: var(--chrome-bg-raised);
  color: var(--chrome-text);
  box-shadow: inset 0 3px 0 var(--chrome-accent-edge);
```

- [ ] **Step 6: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

A new scene: the tabs hidden while the legend was open.

In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  legendSmallWindow: 'legend-small-window',
```

Replace it with:

```js
  legendSmallWindow: 'legend-small-window',
  mapTabsHidden: 'map-tabs-hidden',
```

- [ ] **Step 7: Edit `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`**

The panel check reads the overview at the top, the toggle on its corner, and the row under it while it shows. New checks for the hidden start and for the legend closing with the row. The tab-size check runs while the row shows.

1. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find these lines. Together they occur exactly once:

```js
 * Purpose: The panel sits 12 px in from the map's top-left corner: a row of five 56 x 58 px tabs, then the 280 x 200 px
 *   overview under it. The legend opens 8 px from the panel.
 * When to use: The panel, tab, and legend checks.
 * Expected outcome: Matches `--minimap-width`, `--chrome-tab-height`, and `--chrome-tab-label-size` in
 *   `static/shellChrome.css`, and `MAP_CHROME_INSET` and `MAP_CHROME_GAP` in `src/shared/mapChromePlacement.ts`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({ inset: 12, minimapWidth: 280, minimapHeight: 200, tabWidth: 56, tabHeight: 58, labelSize: '9px', legendGap: 8 });
```

Replace them with:

```js
 * Purpose: The panel sits 12 px in from the map's top-left corner: the 280 x 200 px overview, with a 32 px square toggle
 *   on its lower-left corner, then, while the toggle has shown them, a row of five 56 x 58 px tabs under it. The legend
 *   opens 8 px from the panel.
 * When to use: The panel, tab, and legend checks.
 * Expected outcome: Matches `--minimap-width`, `--chrome-tab-height`, `--chrome-tab-label-size`, and
 *   `.minimap-tabs-toggle` in `static/shellChrome.css`, and `MAP_CHROME_INSET` and `MAP_CHROME_GAP` in
 *   `src/shared/mapChromePlacement.ts`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({
  inset: 12,
  minimapWidth: 280,
  minimapHeight: 200,
  toggleSize: 32,
  tabWidth: 56,
  tabHeight: 58,
  labelSize: '9px',
  legendGap: 8,
});
```

2. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * The map chrome checks, one row each.
```

Replace them with:

```js
/**
 * Scenes where the toggle has shown the map-mode tabs.
 *
 * Purpose: The tabs' own geometry and size can only be read while the row is on screen.
 * When to use: The checks that measure the tabs.
 * Expected outcome: The Tech view and the open legend, both chosen from the shown row.
 * Exceptions: None.
 */
const TABS_SHOWN_SCENES = Object.freeze([SCENES.mapTech, SCENES.legendOpen]);

/**
 * The map chrome checks, one row each.
```

3. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find these lines. Together they occur exactly once:

```js
    scenes: PLACEMENT_SCENES,
    needs: ['#canvas-container', '#minimap-panel', '#minimap', '#map-mode-tabs', ...MODE_TABS],
```

Replace them with:

```js
    scenes: [...PLACEMENT_SCENES, ...TABS_SHOWN_SCENES, SCENES.mapTabsHidden],
    needs: ['#canvas-container', '#minimap-panel', '#minimap', '#map-mode-tabs-toggle', '#map-mode-tabs', ...MODE_TABS],
```

4. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find this line. It occurs exactly once:

```js
      const mini = el('#minimap');
```

Replace it with:

```js
      const mini = el('#minimap');
      const toggle = el('#map-mode-tabs-toggle');
```

5. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find these lines. Together they occur exactly once:

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

Replace them with:

```js
      if (!near(mini.w, PANEL.minimapWidth) || !near(mini.h, PANEL.minimapHeight) || !near(mini.y, panel.y + 1)) {
        return `the minimap is at ${fmt(mini)}, expected ${PANEL.minimapWidth}x${PANEL.minimapHeight} at the top of the panel ${fmt(panel)}`;
      }
      const toggleOnCorner = near(toggle.w, PANEL.toggleSize) && near(toggle.h, PANEL.toggleSize)
        && near(toggle.x, mini.x) && near(toggle.y + toggle.h, mini.y + mini.h);
      if (!toggle.shown || !toggleOnCorner) {
        return `the tabs toggle is at ${fmt(toggle)}, expected a ${PANEL.toggleSize} px square on the overview's lower-left corner ${fmt(mini)}`;
      }
      if (toggle.expanded !== 'true') {
        if (tabs.shown) return 'the mode tabs show while the toggle reads aria-expanded=false';
        return near(panel.y + panel.h, mini.y + mini.h + 1) ? null : `the panel ${fmt(panel)} is taller than the overview ${fmt(mini)} while the tabs are hidden`;
      }
      if (!tabs.shown || !near(tabs.w, PANEL.minimapWidth) || !near(tabs.y, mini.y + mini.h)) {
        return `the mode tabs are at ${fmt(tabs)}, expected a ${PANEL.minimapWidth} px row under the overview ${fmt(mini)}`;
      }
      for (const [i, selector] of MODE_TABS.entries()) {
        const tab = el(selector);
        if (!near(tab.w, PANEL.tabWidth) || !near(tab.h, PANEL.tabHeight) || !near(tab.x, tabs.x + i * PANEL.tabWidth) || !near(tab.y, tabs.y + 1)) {
          return `${selector} is at ${fmt(tab)}, expected tab ${i + 1} of the row, ${PANEL.tabWidth}x${PANEL.tabHeight}`;
        }
```

6. In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find these lines. Together they occur exactly once:

```js
    name: 'map-mode-tabs-match-rail',
    scenes: PLACEMENT_SCENES,
```

Replace them with:

```js
    name: 'map-mode-tabs-hidden-at-start',
    scenes: [SCENES.strategic],
    needs: ['#map-mode-tabs-toggle', '#map-mode-tabs'],
    run: (p, el) => {
      const toggle = el('#map-mode-tabs-toggle');
      if (toggle.expanded !== 'false' || el('#map-mode-tabs').shown) return `the toggle reads aria-expanded=${toggle.expanded}, expected the tabs hidden at the start`;
      return toggle.label === 'Show the map modes' ? null : `the toggle is named "${toggle.label}", expected "Show the map modes"`;
    },
  },
  {
    name: 'map-mode-tabs-hide-closes-legend',
    scenes: [SCENES.mapTabsHidden],
    needs: ['#map-mode-tabs-toggle', '#map-mode-tabs', '#terrain-legend', '#map-legend-toggle'],
    run: (p, el) => {
      const toggle = el('#map-mode-tabs-toggle');
      if (toggle.expanded !== 'false' || el('#map-mode-tabs').shown) return `the toggle reads aria-expanded=${toggle.expanded}, expected the tabs hidden`;
      if (el('#terrain-legend').shown) return 'the terrain legend stays open after its tab was hidden';
      const legendTab = el('#map-legend-toggle');
      return legendTab.pressed === 'false' && legendTab.expanded === 'false'
        ? null
        : `the Legend tab reads pressed=${legendTab.pressed}, expanded=${legendTab.expanded} after the legend closed`;
    },
  },
  {
    name: 'map-mode-tabs-match-rail',
    scenes: TABS_SHOWN_SCENES,
```

- [ ] **Step 8: Edit `scripts/ui-smoke/ui-smoke.cjs`**

The run shows the row before it uses the tabs, and hides it in the small window while the legend is open.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  // Choose the Tech view and record it, then go back to Weather.
```

Replace it with:

```js
  // Show the map-mode tabs from the toggle on the overview's corner; they start hidden and stay shown until the toggle
  // hides them in the small window below. Choose the Tech view and record it, then go back to Weather.
  await page.click('#map-mode-tabs-toggle');
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await recordScene(page, report, outDir, SCENES.legendSmallWindow);
  await page.click('#map-legend-toggle');
```

Replace them with:

```js
  await recordScene(page, report, outDir, SCENES.legendSmallWindow);
  // Hide the tabs with the legend still open: the legend closes with them. The tabs stay hidden for the rest of the run.
  await page.click('#map-mode-tabs-toggle');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.mapTabsHidden);
```

- [ ] **Step 9: Edit `doc/ux/minimap.md`**

The overview is on top, the toggle on its corner, and the tabs under it.

1. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
The minimap panel at the map's top-left: a row of map-mode tabs, and the loaded-map overview under it.
````

Replace it with:

````markdown
The minimap panel at the map's top-left: the loaded-map overview, and under it a row of map-mode tabs that a toggle on the overview's corner shows and hides.
````

2. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
Shown with the map in every mode where the map container is visible, except New game and Game over, where the whole panel is hidden. It shows again when that overlay closes. After a successful start it shows the new match. The overview does not accept pointer input. In Tactical annihilation, and while the tactical battles list is open, the panel stays visible and pointer input on the whole map container is off, which includes the panel and its tabs.

## Information Displayed

- The panel sits 12 px in from the map's top-left corner, in the navy chrome, and is 280 px wide inside its border (`--minimap-width`). A row of five map-mode tabs runs across its top, and the 280 × 200 px overview sits under them.
````

Replace them with:

````markdown
Shown with the map in every mode where the map container is visible, except New game and Game over, where the whole panel is hidden. It shows again when that overlay closes. After a successful start it shows the new match. The overview does not accept pointer input. In Tactical annihilation, and while the tactical battles list is open, the panel stays visible and pointer input on the whole map container is off, which includes the panel, its toggle, and its tabs.

## Information Displayed

- The panel sits 12 px in from the map's top-left corner, in the navy chrome, and is 280 px wide inside its border (`--minimap-width`). The 280 × 200 px overview fills its top. A row of five map-mode tabs runs under the overview while the toggle shows it. The row is hidden when the app opens.
- A toggle on the overview's lower-left corner: a 32 px square in the selection panel's expand-control style, with dividers on its top and right edges and a chevron that points down while the tabs are hidden and up while they show.
````

3. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- The chosen view, Weather or Tech, and Legend while the legend is open, read as pressed: a lighter tab with a teal mark on its bottom edge, next to the overview.
````

Replace it with:

````markdown
- The chosen view, Weather or Tech, and Legend while the legend is open, read as pressed: a lighter tab with a teal mark on its top edge, next to the overview.
````

4. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks, drags, or uses the wheel on the overview, nothing happens. Dragging, wheel zoom, double-click zoom, and keyboard on the overview are off.
````

Replace it with:

````markdown
- When the player clicks, drags, or uses the wheel on the overview, nothing happens. Dragging, wheel zoom, double-click zoom, and keyboard on the overview are off.
- When the player clicks the toggle on the overview's corner, the tabs show under the overview, or hide if they show. Hiding them also closes the terrain legend, because its tab is hidden with them. The legend and the toast band are placed again for the panel's new height.
````

5. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- Weather view or Tech view: chosen with the map-mode tabs. The choice lasts until the app closes, across turns, battles, and new matches. It is not saved.
````

Replace it with:

````markdown
- Weather view or Tech view: chosen with the map-mode tabs. The choice lasts until the app closes, across turns, battles, and new matches. It is not saved.
- Tabs hidden: the start state. The panel is the overview and its toggle.
- Tabs shown: the row of map-mode tabs sits under the overview. Whether the tabs show lasts until the app closes, including while the panel is hidden for New game and Game over. It is not saved.
````

6. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- Choosing a view never changes the match, the selection, or queued orders.
````

Replace it with:

````markdown
- Choosing a view never changes the match, the selection, or queued orders.
- Hiding the tabs never changes the chosen view.
- The terrain legend is never open while the tabs are hidden.
````

7. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#minimap-panel`, `#map-mode-tabs`, `#minimap`)
- `static/shellChrome.css` (`--minimap-width`, `--chrome-tab-height`, `--chrome-tab-label-size`, `.minimap-panel`, `.map-mode-tabs`, `.map-mode-btn`)
````

Replace them with:

````markdown
- `static/index.html` (`#minimap-panel`, `#minimap`, `#map-mode-tabs-toggle`, `#map-mode-tabs`)
- `static/shellChrome.css` (`--minimap-width`, `--chrome-tab-height`, `--chrome-tab-label-size`, `.minimap-panel`, `.minimap-overview`, `.minimap-tabs-toggle`, `.map-mode-tabs`, `.map-mode-btn`)
````

- [ ] **Step 10: Edit `doc/ux/terrain-legend.md`**

Hiding the tabs closes the legend.

1. In `doc/ux/terrain-legend.md`, find this text. It occurs exactly once:

````markdown
Closed until the player clicks Legend in the [minimap panel](minimap.md), and closed again by the next click.
````

Replace it with:

````markdown
Closed until the player clicks Legend in the [minimap panel](minimap.md)'s map-mode tabs, which the toggle on the overview's corner shows, and closed again by the next click on Legend or by hiding those tabs.
````

2. In `doc/ux/terrain-legend.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks Legend in the minimap panel, the legend opens, or closes if it is open.
````

Replace it with:

````markdown
- When the player clicks Legend in the minimap panel, the legend opens, or closes if it is open.
- When the player hides the minimap panel's map-mode tabs with the toggle on the overview's corner, the legend closes.
````

- [ ] **Step 11: Edit `doc/ux/input-map.md`**

A row for the toggle; the tabs are under the minimap.

In `doc/ux/input-map.md`, find this line. It occurs exactly once:

````markdown
| Click | Map-mode tabs above the minimap | Weather or Tech chooses the map view. Legend opens or closes the terrain legend. | [minimap.md](minimap.md) |
````

Replace it with:

````markdown
| Click | Toggle on the minimap overview's lower-left corner | Shows or hides the map-mode tabs under the overview. Hiding them also closes the terrain legend. | [minimap.md](minimap.md) |
| Click | Map-mode tabs under the minimap | Weather or Tech chooses the map view. Legend opens or closes the terrain legend. | [minimap.md](minimap.md) |
````

- [ ] **Step 12: Edit `doc/ux/control-tooltips.md`**

The toggle's two tips.

In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Selection panel expand control, while the panel is expanded: Hide the details. The bar stays.
````

Replace it with:

````markdown
- Selection panel expand control, while the panel is expanded: Hide the details. The bar stays.
- Map-mode tabs toggle, while the tabs are hidden: Show the Weather, Tech, and Legend buttons under the overview.
- Map-mode tabs toggle, while the tabs show: Hide the Weather, Tech, and Legend buttons. Hiding them also closes the terrain legend.
````

- [ ] **Step 13: Edit `doc/ux-specification.md`**

The element list says the tabs are under the overview.

In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [minimap.md](ux/minimap.md): the minimap panel: the world overview, how it relates to the main map view, and the map-mode tabs above it.
````

Replace it with:

````markdown
- [minimap.md](ux/minimap.md): the minimap panel: the world overview, how it relates to the main map view, and the map-mode tabs under it, which a toggle on its corner shows and hides.
````

- [ ] **Step 14: Edit `doc/ui-style-guide.md`**

The minimap note describes the toggle and the row under the overview.

In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
A 280 × 200 px Leaflet overview with a viewport rectangle, in a navy panel at the map's top-left, under a row of five map-mode tabs (Weather, Tech, Control, Production, Legend).
````

Replace it with:

````markdown
A 280 × 200 px Leaflet overview with a viewport rectangle, in a navy panel at the map's top-left, over a row of five map-mode tabs (Weather, Tech, Control, Production, Legend). The row is hidden when the app opens; a 32 px square toggle on the overview's lower-left corner, in the selection panel's expand-control style, shows and hides it, and its chevron points down while the row is hidden.
````

- [ ] **Step 15: Edit `doc/how-to-play.md`**

Finding Tech: open the row with the toggle first.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Seeing them:** the flag tooltip lists a unit's bonuses. A hex tooltip shows that hex's weather and terrain effects. Choose **Tech** above the minimap, or hold T, to see each hex's tech tier.
````

Replace it with:

````markdown
- **Seeing them:** the flag tooltip lists a unit's bonuses. A hex tooltip shows that hex's weather and terrain effects. Click the toggle on the minimap's lower-left corner to show the Weather, Tech, and Legend buttons under it, then choose **Tech**, or hold T, to see each hex's tech tier.
````

## Verify

- [ ] **Step 16: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 17: Full tests**

Run the full tests. Expected: exit 0, test total **896**, failure total **0**.

- [ ] **Step 18: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/renderer/chrome/frameTooltipText.ts src/renderer/map/mapModeTabs.ts static/index.html static/shellChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/minimap.md doc/ux/terrain-legend.md doc/ux/input-map.md doc/ux/control-tooltips.md doc/ux-specification.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/renderer/chrome/frameTooltipText.ts` | `3a9b9bbf9c8e9b92` |
| `src/renderer/map/mapModeTabs.ts` | `2b965d0f30c5244e` |
| `static/index.html` | `cfb6eb3c02d442ba` |
| `static/shellChrome.css` | `7299f8f9bf72e379` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `3d2add2d26b95a1e` |
| `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs` | `c80969530a18df86` |
| `scripts/ui-smoke/ui-smoke.cjs` | `474ac1844fd4dede` |
| `doc/ux/minimap.md` | `c1fb8663e4a46e39` |
| `doc/ux/terrain-legend.md` | `27ff0183440cc8f4` |
| `doc/ux/input-map.md` | `b9104608e9eb8f08` |
| `doc/ux/control-tooltips.md` | `0a9b2e6a428fd630` |
| `doc/ux-specification.md` | `680576d9a9bc13b3` |
| `doc/ui-style-guide.md` | `0db15ce7671e94b4` |
| `doc/how-to-play.md` | `7333e8a41fc865c2` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 19: Smoke run**

```powershell
npm run ui:smoke -- --label map-mode-row
```

Expected summary line:

```text
ui-smoke map-mode-row: 563 passed, 0 failed, 0 page errors, 43 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\map-mode-row
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/map-mode-row/report.json`.

- [ ] **Step 20: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/map-mode-row/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run.

- `04-strategic-1280x720.png` against [ui-facelift-toggles-2-expected-strategic.png](ui-facelift-toggles-2-expected-strategic.png): a strategic turn. The minimap panel at the top left is the overview alone, with a small dark square on its lower-left corner holding a chevron that points down. No tabs.
- `14-map-tech.png` against [ui-facelift-toggles-2-expected-tabs.png](ui-facelift-toggles-2-expected-tabs.png): the Tech view chosen from the shown row. The five tabs sit under the overview, Tech pressed with its teal mark on the top edge, and the corner chevron points up.
- `28-map-tabs-hidden.png` against [ui-facelift-toggles-2-expected-tabs-hidden.png](ui-facelift-toggles-2-expected-tabs-hidden.png): the 800 x 600 window after the toggle hid the row while the legend was open: the overview alone, the chevron pointing down, and no legend.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 17.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 20.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With `npm start`, start or reopen a match. The minimap is the overview alone, with the chevron square on its lower-left corner. Rest the pointer on it: "Show the Weather, Tech, and Legend buttons under the overview."
2. Click it: the tabs show under the overview, and the chevron points up. Weather, Tech, and Legend work. The legend opens beside the panel, level with its top.
3. With the legend open, click the toggle: the tabs and the legend close together.
4. Show the tabs, open New game… from the game menu, and start a match: the tabs are still shown. Quit and restart the app: they are hidden again.
5. Shrink the window to 800 x 600 and open the legend: it opens under the panel, clear of the tabs.

## Next

Plan 3 makes Weather and Tech two toggles, and draws both status icons side by side when both apply.
