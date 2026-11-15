# Charts Dialog Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Pressing `c` opens a dialog that shows how the match has gone: a relationship graph for each side, a stance timeline, and line charts of units, hexes, production, credits, upkeep, losses, and model cost for every side over every turn.

**Shape:** Phase 0 records a baseline. Phases 1 through 7 each add one piece that can be verified on its own or with earlier phases. Phase 8 runs the final verification, the doc check, and hands the user a manual checklist.

**Tech:** TypeScript (esbuild-bundled renderer), uPlot, plain DOM, SVG, canvas, and CSS, `node:test`, ESLint with the local `orienting-comments` rule, `scripts/ui-smoke/`.

**Order:** This is the second of four plans. It needs the match statistics plan finished first. `2026-11-15-history-0-meta-plan.md` explains the order.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names (record that file in the Completion Log).
- Find code by the quoted text, not by a line number. Line numbers in this plan are approximate.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. **User-facing strings and prompt text in this plan are not sketches.** Copy them exactly.
- **Tests come first.** Tests under `src/renderer` are not run by `npm test`. So every rule that can be wrong lives in a pure function under `src/shared` (or a main-process module), with a test, written and run before anything calls it. Renderer files only read the DOM and state, call those functions, and write the DOM.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/main/gameDb.ts')
$backup = Join-Path $env:TEMP "aw-charts-dialog\step-$step"
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

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new function, constant, type, interface, and field needs a JSDoc block with a one-line summary, then `Purpose:` (or `Contract:` for types and interfaces), `When to use:`, `Expected outcome:`, and `Exceptions:`. **Do not copy the generic filler** that many existing blocks contain. Write what the code does, when to call it, what it returns, and what it throws.
- **Logging in `src/main`.** A new **exported** function that changes state logs `logDebug` on entry. A new exported getter or pure builder logs `logTrace`. Log context carries ids, keys, and counts only. Never log message text, a prompt body, a payload body, or an API key. New **private** helpers add no log lines. A caught exception logs `logError`.
- **No logging in `src/shared` or `src/renderer`** (the renderer may use `console.error` in a `catch`, as `commanderPoolClient.ts` does).
- **Names.** camelCase files, directories, and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`: the only role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`, and `Utils`, `Impl`, `Manager`, `Service`, `Processor`, and `Controller` are banned. Use the file names this plan gives. Names from this plan (phase numbers, plan file names) must never appear in code, comments, test names, or `doc/`.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, and the guards in `src/shared/seatIds.ts`, never string literals. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. Functions take 6 or fewer named parameters. Use a parameter object for more. Files already past 600 lines get call lines only. Put logic in new files.
- **`readonly`.** Mark parameter arrays and object fields `readonly` where they are not reassigned. Use `const` unless a value is reassigned.
- **Tests.** Test happy paths and essential failures only. A new test file copies the imports and structure of the nearest sibling test file.
- **Database access in the main process.** Modules under `src/main/recorder/` and `src/main/matchStatistics/` use `gameDbOps` and `hasDbHandle` from `src/main/gameDb/dbConnection.ts` and leaf files under `src/main/gameDb/`. They never import the barrel `src/main/gameDb.ts`. IPC handlers may import the barrel.
- **Save format.** `EXPECTED_USER_VERSION` and `GAME_DB_REQUIRED_TABLES` do not change. A new column is added on open, the way `ensureSeatAddedColumns` does it.
- **Side names, flags, and colors.** A side's name on screen is `sideDisplayName` (`src/shared/sideNicknames.ts`). Its flag is `createSideNumberFlag` (`src/renderer/chrome/toastInlineMarks.ts`). Its color is the color the top bar and the unit tokens already use for that side. Find it before drawing anything (read `src/renderer/chrome/topBar.ts` and `src/shared/topBarSides.ts`) and reuse it. Do not invent side colors.
- **Text reaches the DOM through `textContent`.** Never build HTML from match text.
- **Docs.** `AGENTS.md` requires `doc/` to change in the same change as the code, and the UX suite is normative. Before changing a surface, read its `doc/ux/` document and the cross-cutting documents `doc/ux-specification.md` routes it through. A new element document uses the fixed heading set (copy the headings of `doc/ux/selection-panel.md` exactly), gets a row in the routing table of `doc/ux-specification.md`, and lists its Code Entry Points. A phase that changes what a model is told updates `doc/ai-commander-prompts/` in that phase. Your final message names every document you updated.

---

## Non-Goals

- No new statistic. This plan draws what `game:readMatchCharts` returns.
- No replay, no map scrubbing, and no link between a chart and the map.
- No export of a chart as an image or a file.
- No chart of tactical battles.
- No change to `README.md`.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **One dialog.** Pressing `c` opens the chart view. Pressing `c` again, or Escape, closes it. It is modal, centered over the whole window including the top bar and the console, and shows every chart in one scrollable pane, in the order below.
2. **No fog, and for the player only.** Every chart shows every side, every turn, whatever fog of war is set to. Commanders are never shown chart values.
3. **Line charts** are as wide as the pane allows. Each one, with its title, ticks, and labels, is at most one quarter of the dialog's height. The X axis is the strategic turn and the Y axis is the count. Hovering shows a tooltip with the nearest turn's value for each side and a total. The mouse wheel over a chart zooms the X axis.
4. **Charts 2 and 3 have a selector:** total, or one unit type.
5. **Relationship graphs:** one stack per side, up to four, in one row. Each stack is a spoke graph on top and a row card under it. Both show how the AI commanders regard that side.
6. **Relationship timeline:** one strip, as wide as a line chart, with a selector for the subject side, zoomable and scrollable like the line charts.
7. **Missing or old data is marked.** A commander that never reported, and a report that is several turns old, each look different from a fresh report.
8. **The charting library is uPlot.**

### The charts, in order

| # | Id | Title | Value per side | Selector |
| --- | --- | --- | --- | --- |
| 1 | `relationships` | Relationships | The stacks (not a line chart) | none |
| 2 | `relationship-timeline` | Stance over time | The strip (not a line chart) | Subject side |
| 3 | `built-units` | Built units | `builtUnits` | Total, Infantry, Armor, Naval, Air, Missile |
| 4 | `mercenary-units` | Mercenary units | `mercenaryUnits` | Total, Infantry, Armor, Naval, Air |
| 5 | `hexes` | Hexes held | `hexes` | none |
| 6 | `production` | Production per turn | `productionPerTurn` | none |
| 7 | `stored-points` | Stored production points | `storedPoints` | none |
| 8 | `treasury` | Credits | `treasury` | none |
| 9 | `upkeep` | Upkeep per turn | `upkeepPerTurn` | none |
| 10 | `units-lost` | Units lost per turn | `unitsLost` | none |
| 11 | `model-cost` | Model cost so far (USD) | `costUsd`, AI sides only | none |

### Decisions this plan makes

Tell the user about these in your final message.

- **Dragging pans.** The wheel zooms around the pointer, dragging left or right pans a zoomed chart, and a double-click shows every turn again. The strip behaves the same way.
- **A report is "old" after three turns** (`RELATIONSHIP_OLD_AFTER_TURNS`).
- **Colors are never the only signal.** The row card prints the stance word, the spoke graph labels each spoke, and a strip cell shows the stance's first letter when it is wide enough and the full word in its tooltip.
- **The human player is a subject and never a reporter,** because the player reports no stance. A side with no AI commander to report on it shows one sentence instead of a graph.
- **The dialog reads the data when it opens, and again after each turn resolves while it is open.** There is no timer.
- **Five stance colors are new.** They are added as CSS variables and recorded in `doc/ui-style-guide.md`.

---

## Design

### Shapes the renderer draws from

All of these are pure functions in `src/shared/matchChartSeries.ts`, tested, with no DOM:

```ts
export interface LineChartData {
  readonly turns: readonly number[];
  readonly series: readonly { readonly seatId: string; readonly values: readonly (number | null)[] }[];
}
export type LineChartId = 'built-units' | 'mercenary-units' | 'hexes' | 'production' | 'stored-points' | 'treasury' | 'upkeep' | 'units-lost' | 'model-cost';
export function lineChartData(snapshot: MatchChartsSnapshot, chartId: LineChartId, unitType: string | null): LineChartData
export function chartTooltip(data: LineChartData, index: number, nameOf: (seatId: string) => string, decimals: number): { readonly heading: string; readonly lines: readonly string[]; readonly total: string }

export interface TurnRange { readonly min: number; readonly max: number }
export function zoomedTurnRange(args: { range: TurnRange; full: TurnRange; anchor: number; factor: number; minSpan: number }): TurnRange
export function pannedTurnRange(args: { range: TurnRange; full: TurnRange; deltaTurns: number }): TurnRange

export type ReportAge = 'fresh' | 'old' | 'none';
export interface RelationshipRow {
  readonly reporterSeatId: string;
  readonly stance: SideStance | null;
  readonly trust: number | null;
  readonly threat: number | null;
  readonly hexesTaken: number | null;      // reporter took from subject, last HEXES_TAKEN_WINDOW_TURNS recorded turns
  readonly reportedTurn: number | null;
  readonly age: ReportAge;
}
export function relationshipRows(snapshot: MatchChartsSnapshot, subjectSeatId: string): RelationshipRow[]
export interface StripCell { readonly stance: SideStance | null; readonly reportedThisTurn: boolean }
export function relationshipStrip(snapshot: MatchChartsSnapshot, subjectSeatId: string): { readonly turns: readonly number[]; readonly rows: readonly { readonly reporterSeatId: string; readonly cells: readonly StripCell[] }[] }
export function spokePositions(count: number, radius: number): { readonly x: number; readonly y: number }[]
```

### The dialog

```
┌──────────────────────────────────────────────────────────────────────┐
│ Charts                                                          [×]  │
├──────────────────────────────────────────────────────────────────────┤
│ Relationships                                                        │
│ ┌ You ──────┐ ┌ Iberia ───┐ ┌ Maghreb ──┐ ┌ Levant ───┐              │
│ │  spoke    │ │  spoke    │ │  spoke    │ │  spoke    │              │
│ │  rows     │ │  rows     │ │  rows     │ │  rows     │              │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘              │
│ Stance over time                         [How they see: You ▾]       │
│ ▇▇▇▇▇▇░░▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  │
│ Built units                                        [Total ▾]         │
│ ╱╲╱──────────────────────────────────────────────────────────────    │
│ …                                                          (scrolls) │
└──────────────────────────────────────────────────────────────────────┘
```

### Module map

| File | Holds |
| --- | --- |
| `src/shared/matchChartSeries.ts` | Every rule: series, tooltips, zoom and pan ranges, relationship rows and strip, spoke positions |
| `src/shared/chartsDialogState.ts` | When the dialog may open, and sizing arithmetic |
| `src/renderer/chrome/blockingDialogGuards.ts` | `blockingDialogIsOpen()`: whether a dialog is showing that the charts dialog, and later the replay panel, must not open over |
| `src/renderer/charts/chartsDialog.ts` | Opens, closes, fetches, and lays out the dialog |
| `src/renderer/charts/lineChart.ts` | One uPlot chart with wheel zoom, drag pan, and a tooltip |
| `src/renderer/charts/relationshipStack.ts` | One side's spoke graph and row card |
| `src/renderer/charts/relationshipTimeline.ts` | The strip |
| `static/chartsChrome.css` | The dialog's styles and the stance color variables |
| `scripts/copy-uplot.cjs` | Copies uPlot's stylesheet and license into `static/vendor/uplot` |

---

## Phase 0 — Baseline and Prerequisites

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory.
2. Run the Verification Bar and `npm run ui:smoke`. Record pass or fail for each, and the exact cycle list `check:circular` prints.
3. **Prerequisite.** Confirm the statistics plan is done: `src/shared/matchStatistics.ts` exports `MatchChartsSnapshot`, `TurnStatistics`, `STATISTIC_UNIT_TYPES`, `STATISTIC_MERCENARY_TYPES`, and `HEXES_TAKEN_WINDOW_TURNS`, and `window.gameApi.readMatchCharts` is typed in `src/shared/ipc/gameApiTypes.ts`. **If not, stop** and tell the user.
4. Read, and do not edit: `src/renderer/map/initCore.ts` (the `window.addEventListener('keydown', ...)` handler), `src/renderer/map/mapHelpers.ts` (`shouldIgnoreGlobalKeydown`), `scripts/copy-leaflet.cjs`, the `h3-js` and Leaflet sections of `THIRD-PARTY-NOTICES.md`, `scripts/thirdPartyNotices/noticeCheck.cjs` (`dependencyRequirements`), the `files` list in `electron-builder.config.cjs`, `doc/ui-style-guide.md`, `doc/ux/input-map.md`, `doc/ux/modes-and-transitions.md`, and how one existing dialog is built and styled (`src/renderer/gameplay/knockoutDialog.ts` and its markup in `static/index.html`).
5. Find and record how the top bar colors a side (see Conventions). Every chart uses that color for that side's line.

**Stop if** the bar fails before any edit.

---

## Phase 1 — Chart Data Rules

Pure functions turn the snapshot into what each chart draws.

**Add:** `src/shared/matchChartSeries.ts`, `src/shared/matchChartSeries.test.ts`
**Edit:** nothing.

### Steps

Write the functions from the Design section. Rules:

1. `lineChartData`:
   - `turns` is every turn in the snapshot, in order.
   - One series per seat, in side order. For `model-cost`, AI seats only.
   - `built-units` and `mercenary-units`: with `unitType` null, the value is the sum over that chart's types. Otherwise it is that type's count.
   - `units-lost`: a null stays null.
   - A turn in which a seat has no entry gives null for that seat.
2. `chartTooltip`: `heading` is `Turn {n}`. One line per series, `{name}: {value}`, with `no data` for null. `total` is `Total: {sum}`, summing the non-null values. `decimals` is 0 for counts and 2 for `model-cost`. Numbers print with `toFixed(decimals)`.
3. `zoomedTurnRange`: scales the range's span by `factor` (below 1 zooms in) keeping `anchor` at the same relative position, never narrower than `minSpan`, never outside `full`. When the result would be wider than `full`, it is `full`.
4. `pannedTurnRange`: shifts the range by `deltaTurns`, clamped so it stays inside `full` with its span unchanged.
5. `relationshipRows`, for the last turn in the snapshot: one row per AI seat other than the subject, in side order. A reporter with a report on the subject fills stance, trust, threat, and `reportedTurn`. `age` is `fresh` when the report is at most `RELATIONSHIP_OLD_AFTER_TURNS` (3, exported from this file) turns older than the last turn, `old` otherwise, and `none` with no report. `hexesTaken` sums that reporter's captures from the subject over the last `HEXES_TAKEN_WINDOW_TURNS` turns whose `hexesTaken` is not null, and is null when every one of those turns is null.
6. `relationshipStrip`: one row per AI seat other than the subject. A cell's stance is the reporter's stance toward the subject in that turn's `relationships`, or null. `reportedThisTurn` is true when that report's `reportedTurn` equals the cell's turn.
7. `spokePositions(count, radius)`: `count` points evenly spaced on a circle around the origin, the first one straight up, going clockwise. `count` 0 gives an empty list.

### Tests

`matchChartSeries.test.ts`, with one hand-built snapshot of three seats (one human, two AI) over four turns:

- `built-units` with null sums the types, and with `'armor'` returns that type.
- `model-cost` has two series.
- A null `unitsLost` stays null, and the tooltip prints `no data` and leaves it out of the total.
- The tooltip total for `treasury` is the sum, and for `model-cost` prints two decimals.
- Zoom in at the middle halves the span around the anchor. Zoom at the left edge keeps the left edge. Zoom never goes below `minSpan`. Zoom out past the full range returns the full range.
- Pan right at the right edge does not move. Pan keeps the span.
- `relationshipRows` for the human subject returns two rows, with `fresh`, `old`, and `none` each produced by the right data, and `hexesTaken` summed and null as specified.
- `relationshipStrip` marks `reportedThisTurn` only on the turn of the report, and carries the stance into later turns as not reported.
- `spokePositions(4, 10)` gives up, right, down, left, each within 0.001.

### Verification

Run the Verification Bar.

---

## Phase 2 — The Charting Library

uPlot is installed, its stylesheet and license ship with the app, and the notices file credits it. Nothing uses it yet.

**Add:** `scripts/copy-uplot.cjs`, `static/vendor/uplot/uPlot.min.css` and uPlot's license file (both written by the script)
**Edit:** `package.json`, `package-lock.json`, `THIRD-PARTY-NOTICES.md`, `static/index.html`

### Steps

How the two existing libraries ship, so you can tell them apart: Leaflet is **not** an npm package here. Its files are committed under `static/vendor/leaflet/`, and `scripts/copy-leaflet.cjs` only refreshes them when someone has installed the package by hand. `h3-js` **is** in `dependencies`, and esbuild bundles it. uPlot follows `h3-js` for its code and Leaflet for its stylesheet.

1. Run `npm install uplot`. It goes in `dependencies`. `npm run notices:check` reads `dependencies` (`dependencyRequirements` in `noticeCheck.cjs`), so this is what makes the check require uPlot's credit. Record the installed version. The JavaScript is not copied anywhere: `src/renderer` imports it (`import uPlot from 'uplot';`) and esbuild bundles it into `static/renderer.js`.
2. `scripts/copy-uplot.cjs`, modelled on `scripts/copy-leaflet.cjs`: copy `node_modules/uplot/dist/uPlot.min.css` and the package's license file into `static/vendor/uplot/`. When `node_modules/uplot` is missing, keep the existing copy and warn, as `copy-leaflet.cjs` does. Run it once.
3. `package.json`: add `node scripts/copy-uplot.cjs` after `node scripts/copy-leaflet.cjs` in `build:renderer` and in `postinstall`, and add `"copy:uplot": "node scripts/copy-uplot.cjs"` beside `copy:leaflet`.
4. The two copied files stay in the tree, like `static/vendor/leaflet/`. Do not add them to `.gitignore`. Packaging needs no change: `electron-builder.config.cjs` ships the whole `static` folder.
5. `static/index.html`: add `<link rel="stylesheet" href="vendor/uplot/uPlot.min.css" />` after the Leaflet stylesheet link. The Content-Security-Policy already allows local styles and scripts. Do not change it.
6. `THIRD-PARTY-NOTICES.md`: add a section directly after `## h3-js`, in the same form. Its heading must be exactly `## uplot`, the package name, because the check matches headings to package names. Its text must contain the installed version and every line of the license file that starts with `Copyright`, copied exactly. Say what it does here (it draws the line charts) and that its stylesheet is in `static/vendor/uplot/`. Run `npm run notices:check` until it passes.
7. Read `node_modules/uplot/README.md` and `node_modules/uplot/dist/uPlot.d.ts`. Later phases name these members: the constructor `new uPlot(options, data, element)`, `setData`, `setScale`, `setSize`, `destroy`, `cursor.idx`, the `hooks` option, `scales.x.time`, `posToVal`, and the `cursor.drag` option. Confirm each exists in the installed version and record any that differs in the Completion Log, with the member that replaces it.

### Verification

Run the Verification Bar. `npm run build:renderer` must leave `static/vendor/uplot/uPlot.min.css` in place. `npm run notices:check` passes.

### If verification fails

- The install fails for lack of network: stop and tell the user. Do not vendor a hand-copied file.
- `notices:check` fails on a version or copyright line: copy the exact line from the package's license file.

---

## Phase 3 — The Dialog Shell

`c` opens an empty, scrollable, modal dialog, and `c` or Escape closes it.

**Add:** `src/shared/chartsDialogState.ts`, `src/shared/chartsDialogState.test.ts`, `src/renderer/chrome/blockingDialogGuards.ts`, `src/renderer/charts/chartsDialog.ts`, `static/chartsChrome.css`, `src/main/rendererChartsDialogContracts.test.ts`, `doc/ux/charts-dialog.md`
**Edit:** `static/index.html`, `src/renderer/map/initCore.ts`, `src/renderer/renderer.ts`, `doc/ux/input-map.md`, `doc/ux/modes-and-transitions.md`, `doc/ux-specification.md`

### Steps

1. `chartsDialogState.ts`:
   - `chartsDialogMayOpen(input: { matchLoaded: boolean; otherModalOpen: boolean }): boolean`, true when a match is loaded and no other modal is open.
   - `chartBlockHeight(dialogHeight: number): number`, `Math.floor(dialogHeight / 4)`. This is the whole height one line chart may take, title included.
   - `chartPlotHeight(dialogHeight: number, titleRowHeight: number): number`, `Math.max(60, chartBlockHeight(dialogHeight) - titleRowHeight)`, and never more than `chartBlockHeight(dialogHeight)`.
2. Markup, in `static/index.html`, as the last child of `<body>` before the script tag, with a stylesheet link for `chartsChrome.css` after `selectionChrome.css`:

   ```html
   <div id="charts-overlay" class="charts-overlay" hidden>
     <section id="charts-dialog" class="charts-dialog" role="dialog" aria-modal="true" aria-labelledby="charts-dialog-title">
       <header class="charts-dialog-header">
         <h2 id="charts-dialog-title">Charts</h2>
         <button type="button" id="charts-dialog-close" class="charts-dialog-close" aria-label="Close the charts" data-control-tooltip="Close the charts. You can also press C or Escape.">×</button>
       </header>
       <div id="charts-dialog-body" class="charts-dialog-body"></div>
     </section>
   </div>
   ```

3. `chartsChrome.css`: the overlay is `position: fixed; inset: 0`, above the top bar, the console, and every panel (read the `z-index` values in the other stylesheets and go above the highest that is not a tooltip), with a dimmed backdrop. The dialog is centered, 90% of the window's width and height, with the face, border, and header style of the existing dialogs. The body scrolls vertically and never horizontally. Use existing color variables only.
4. `chartsDialog.ts`:
   - `export function wireChartsDialog(): void` binds the close button and a click on the backdrop (outside the dialog) to close.
   - `export function chartsDialogIsOpen(): boolean`.
   - `export function toggleChartsDialog(): void` opens when closed and `chartsDialogMayOpen` allows it, and closes when open.
   - Opening: remove `hidden`, remember the focused element, focus the close button, then call a private `renderCharts()`. In this phase `renderCharts` fetches `window.gameApi.readMatchCharts()` and, when the snapshot has no turns, puts one paragraph in the body: `No turns have been recorded yet.` Otherwise it leaves the body empty. Later phases fill it.
   - Closing: add `hidden`, empty the body, and return focus to the remembered element.
   - `matchLoaded` is true when `S.gameState` has seats. It stays true at game over. `otherModalOpen` is `blockingDialogIsOpen()`.
5. `blockingDialogGuards.ts`: `export function blockingDialogIsOpen(): boolean`, true when any of these is showing:
   - the tactical battles list: move the private `tacticalBattlesDialogIsOpen` out of `initCore.ts` into this file, export it, and import it back into `initCore.ts`. Its text does not change;
   - the melee intercept modal: an element with the class `melee-intercept-frame` is in the document (`meleeInterceptModal.ts` builds it);
   - `#knockout-dialog`, `#start-confirm-dialog`, or `#load-confirm-dialog` without the class `hidden`;
   - the game menu (`isGameMenuOpen()`) or the commander popover (`commanderPopoverIsOpen()`).
   **The new-game panel is not on the list.** At game over it is the panel that shows the standings, and the charts must open then. The charts overlay sits above it.
6. `initCore.ts`, in the `keydown` handler. Add only these lines:
   - As the first statement inside `if (e.key === 'Escape') {`: when `chartsDialogIsOpen()`, call `e.preventDefault()`, `toggleChartsDialog()`, and `return`.
   - Directly after the `if (shouldIgnoreGlobalKeydown(e)) return;` line: when `chartsDialogIsOpen()`, close the dialog if the key is `c` or `C` with no modifier and it is not a repeat, then `return` in every case. No map key acts while the dialog is open.
   - Directly after `const key = e.key.toLowerCase();`: when `key === 'c'`, call `e.preventDefault()`, `toggleChartsDialog()`, and `return`.
   Call `wireChartsDialog()` in `renderer.ts`, directly after `wireGameMenu();`. `renderer.ts` and `initCore.ts` are past 600 lines: add only these calls and their imports.
7. Docs: write `doc/ux/charts-dialog.md` with the fixed heading set, covering what exists after this phase. Add `C` and Escape to `doc/ux/input-map.md`. Add the dialog to `doc/ux/modes-and-transitions.md` as an overlay that does not change the mode. Add its routing-table row and list entry in `doc/ux-specification.md`.

### Tests

- `chartsDialogState.test.ts`: `chartsDialogMayOpen` is true only with a match and no other modal; `chartBlockHeight(800)` is 200; `chartPlotHeight(800, 32)` is 168; `chartPlotHeight(200, 32)` is 50, because the quarter rule wins over the 60 px floor.
- `rendererChartsDialogContracts.test.ts`: `static/index.html` contains each id above once and links `chartsChrome.css` and `vendor/uplot/uPlot.min.css`; the `keydown` handler in `initCore.ts` calls `chartsDialogIsOpen` and `toggleChartsDialog`; `chartsDialog.ts` does not contain `innerHTML`; `blockingDialogGuards.ts` names each id and function in step 5 and does not name `game-over-overlay`; `initCore.ts` no longer defines `tacticalBattlesDialogIsOpen`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app: `c` opens the dialog over the top bar and the console, the map does not pan with WASD while it is open, `c` and Escape and the × each close it, and typing `c` in the chat field types a letter. With the game menu open, `c` does nothing. At game over, `c` opens the dialog over the standings.

---

## Phase 4 — Line Charts

Charts 3 through 11 draw, zoom, pan, and show tooltips.

**Add:** `src/renderer/charts/lineChart.ts`
**Edit:** `src/renderer/charts/chartsDialog.ts`, `static/chartsChrome.css`, `src/main/rendererChartsDialogContracts.test.ts`, `doc/ux/charts-dialog.md`

### Steps

1. `lineChart.ts`:

   ```ts
   export interface LineChartHandle { update(data: LineChartData): void; resize(width: number, height: number): void; destroy(): void }
   export function createLineChart(args: {
     readonly host: HTMLElement;
     readonly data: LineChartData;
     readonly width: number;
     readonly height: number;
     readonly colorOf: (seatId: string) => string;
     readonly nameOf: (seatId: string) => string;
     readonly decimals: number;
   }): LineChartHandle
   ```

   - It builds one uPlot instance: the X scale is not time (`scales.x.time` false), X values are the turns, one series per seat with that side's color and name, integer ticks on X, and uPlot's built-in legend turned off (the dialog draws one legend).
   - uPlot's data is `[turns, ...series.map(s => s.values)]`. A null is a gap.
   - **Wheel:** on `wheel` over the plot, call `preventDefault`, compute the turn under the pointer with `posToVal`, call `zoomedTurnRange` with factor 0.8 for scrolling up and 1.25 for scrolling down and `minSpan` 2, and apply the result with `setScale('x', range)`. The wheel must not scroll the dialog while the pointer is over a plot.
   - **Drag:** turn off uPlot's own drag-to-zoom (`cursor.drag`). On pointer down, move, and up over the plot, convert the horizontal movement to turns and apply `pannedTurnRange`.
   - **Double-click:** show the full range.
   - **Tooltip:** one `div` per chart, absolutely positioned inside the host, hidden when the pointer leaves. In the `setCursor` hook, when `cursor.idx` is a number, fill it from `chartTooltip(...)`: the heading, one line per side with a color swatch, and the total. Build it with elements and `textContent`. Keep it inside the host's edges.
   - With one turn or none, the chart still draws (one point, or an empty plot). It must not throw.
   - `destroy` removes listeners and calls uPlot's `destroy`.
2. `chartsDialog.ts`, `renderCharts()`: for each line chart in the table under Locked Decisions, in order, append a block: a title row (an `h3` with the title, and for charts 3 and 4 a `<select>` with the options from the table), then the plot host. The plot's width is the body's inner width. Its height is `chartPlotHeight(dialogHeight, titleRowHeight)`, so the block is never more than a quarter of the dialog. A selector change calls `handle.update(lineChartData(snapshot, id, type))`. Keep every handle in a list, and destroy them all on close.
3. Above the first line chart, one shared legend: each side's color swatch, flag, and name.
4. On window resize while open, call `resize` on every handle with the new sizes.
5. `chartsChrome.css`: the title row, the selector, the tooltip, and uPlot's axis and grid colors, using the chrome's text and border variables so the plots read on the dark chrome.
6. Docs: extend `doc/ux/charts-dialog.md` with the nine charts, the selectors, the tooltip, wheel, drag, and double-click.

### Tests

`rendererChartsDialogContracts.test.ts`: `lineChart.ts` calls `zoomedTurnRange`, `pannedTurnRange`, and `chartTooltip`, registers a `wheel` listener, and does not contain `innerHTML`; `chartsDialog.ts` calls `chartPlotHeight` and `lineChartData`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app on a match with at least six turns (an Observe match is quickest): each of the nine charts shows one line per side in that side's color; the Built units selector changes the lines; hovering shows a turn, a value per side, and a total; the wheel zooms around the pointer and does not scroll the dialog; dragging pans; double-click resets; no chart block is taller than a quarter of the dialog.

### If verification fails

- A uPlot member named above does not exist in the installed version: use the replacement you recorded in Phase 2. If you recorded none, read the typings again. Do not guess.
- The plots are invisible on the dark chrome: uPlot draws axes on a canvas, so axis and grid colors are options (`axes[].stroke`, `axes[].grid.stroke`), not CSS. Set them from `getComputedStyle` of the dialog.

---

## Phase 5 — Relationship Stacks

Chart 1: one spoke graph and one row card per side.

**Add:** `src/renderer/charts/relationshipStack.ts`
**Edit:** `src/renderer/charts/chartsDialog.ts`, `static/chartsChrome.css`, `src/main/rendererChartsDialogContracts.test.ts`, `doc/ux/charts-dialog.md`, `doc/ui-style-guide.md`

### Steps

1. Stance colors. In `chartsChrome.css`, on `:root`: `--stance-hostile: #E24B4A; --stance-wary: #EF9F27; --stance-neutral: #9AA5A3; --stance-cordial: #5DCAA5; --stance-friendly: #7FB93A;`. Record them in the color section of `doc/ui-style-guide.md`, with what each means. These are the only new color values in this plan.
2. `relationshipStack.ts`: `export function buildRelationshipStack(args: { subjectSeatId: string; rows: readonly RelationshipRow[]; nameOf; flagOf; lastTurn: number }): HTMLElement`. It returns one card:
   - A heading: `How they see {flag} {name}`, or `How they see you` for the viewer's own seat.
   - With no rows: one paragraph, `No AI commander reports on this side.`, and nothing else.
   - **The spoke graph,** an inline SVG with a square `viewBox`: the subject in the center (a circle with its side number), and one node per row at `spokePositions(rows.length, radius)`, each a circle with that reporter's side number and its name beside it. One line from each reporter to the center:
     - Color: the stance's variable. Gray (`--stance-neutral`) when `age` is `none`.
     - Width: `1 + 1.5 × trust` pixels, and 1 when trust is null.
     - Dashed when `age` is `old` or `none`. Solid when `fresh`.
     - A reporter with `age` `none` has a dashed outline and the text `no report`.
     - Each node carries a `<title>` with the full sentence: `{reporter}: {stance}, trust {n}, threat {n}, reported turn {t}`, or `{reporter}: no report yet`.
   - **The row card,** a small table with the columns `Side`, `Stance`, `Trust`, `Threat`, `Taken`, `As of`:
     - `Stance`: the word, on a pill in the stance's color. `none` prints `no report`.
     - `Trust` and `Threat`: a five-step bar (0 to 4) with the number beside it. Null draws a dashed empty bar and `–`.
     - `Taken`: `{n} hexes`, the hexes that reporter took from the subject in the last five turns, or `–` for null.
     - `As of`: `turn {t}`, with ` (old)` when `age` is `old`, or `–`.
   - Build everything with `createElement`, `createElementNS`, and `textContent`.
3. `chartsDialog.ts`: the first block in the body is a row titled `Relationships` with one stack per seat, in side order, in a grid of equal columns (`grid-template-columns: repeat(N, minmax(0, 1fr))`, N the seat count, at most four). The human seat is a subject like any other.
4. `chartsChrome.css`: the grid, the card, the pill, and the bars.
5. Docs: extend `doc/ux/charts-dialog.md` with the stacks: what line color, line width, and dashes mean, the row card's columns, and how missing and old reports look.

### Tests

`rendererChartsDialogContracts.test.ts`: `relationshipStack.ts` calls `spokePositions`, uses `createElementNS`, and does not contain `innerHTML`; `chartsDialog.ts` calls `relationshipRows`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app with a key on an Observe match of three or four AI sides for five turns: one stack per side in one row; line colors match the pills; a commander that has not reported shows a dashed gray line and `no report`; hovering a node shows the sentence. In a two-side match with a human, the AI's own stack shows the one-sentence form.

---

## Phase 6 — Relationship Timeline

Chart 2: the strip, with its subject selector.

**Add:** `src/renderer/charts/relationshipTimeline.ts`
**Edit:** `src/renderer/charts/chartsDialog.ts`, `static/chartsChrome.css`, `src/main/rendererChartsDialogContracts.test.ts`, `doc/ux/charts-dialog.md`

### Steps

1. `relationshipTimeline.ts`: `export function createRelationshipTimeline(args: { host: HTMLElement; width: number; nameOf; flagOf }): { update(strip, fullRange): void; destroy(): void }`.
   - It draws on one `<canvas>` as wide as a line chart: a label column on the left with each reporter's flag and name (drawn as DOM beside the canvas, not on it), then one row of cells per reporter, one cell per turn in the visible range, and a turn axis under the rows with integer ticks.
   - A cell is filled with its stance color. A cell with `reportedThisTurn` false is the same color at 45% opacity, so a carried-over stance looks lighter than a fresh report. A null cell is an empty outline.
   - When a cell is at least 14 px wide, draw the stance's first letter in it, in upper case.
   - **Wheel, drag, and double-click** behave exactly as on a line chart, through `zoomedTurnRange` and `pannedTurnRange`. The wheel does not scroll the dialog while over the strip.
   - **Tooltip:** `Turn {n}`, then one line per reporter: `{name}: {stance} (reported this turn)`, `{name}: {stance} (from an earlier turn)`, or `{name}: no report`.
   - Row height is 22 px. The whole block, with its title row and axis, is at most `chartBlockHeight(dialogHeight)`. If the rows would not fit, the row height shrinks to fit, to a minimum of 10 px.
2. `chartsDialog.ts`: the second block is titled `Stance over time`, with a `<select>` labelled `How they see` listing every seat by name in side order (the first is selected). A change calls `update(relationshipStrip(snapshot, seatId), fullRange)`. A subject with no reporters shows `No AI commander reports on this side.` in place of the canvas.
3. Docs: extend `doc/ux/charts-dialog.md`.

### Tests

`rendererChartsDialogContracts.test.ts`: `relationshipTimeline.ts` calls `zoomedTurnRange` and `pannedTurnRange` and registers a `wheel` listener; `chartsDialog.ts` calls `relationshipStrip`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app on the same Observe match: the strip is as wide as the line charts; changing the subject redraws it; turns with no report are empty outlines; carried-over turns are lighter; the wheel zooms, dragging pans, and double-click resets.

---

## Phase 7 — Staying Current, and Polish

**Add:** nothing.
**Edit:** `src/renderer/charts/chartsDialog.ts`, `src/renderer/gameplay/readyHandler.ts`, `static/chartsChrome.css`, `scripts/ui-smoke/ui-smoke-checks.cjs` (or the file its neighbors use for dialog checks), `src/main/rendererChartsDialogContracts.test.ts`, `doc/ux/charts-dialog.md`

### Steps

1. **Refresh.** Export `refreshChartsDialogIfOpen(): Promise<void>` from `chartsDialog.ts`. When the dialog is open it fetches the snapshot again and calls `update` on every chart, keeping each chart's zoom range, each selector's choice, and the body's scroll position. In `readyHandler.ts`, call `void refreshChartsDialogIfOpen();` directly after the `if (!rendererMatchEpochCurrent(matchEpoch)) return;` that follows the `await deps.applyGameStateSnapshot(state, {` call after `announceKnockouts(`. That is where the resolved turn's state has arrived, after a melee choice too. One line. In practice only an Observe match resolves turns while the dialog is open.
2. **A new match or a loaded save** while the dialog is open: close the dialog. Use the match epoch (`currentRendererMatchEpoch`) captured at open, and compare it before each refresh.
3. **Focus.** Tab stays inside the dialog while it is open: from the last focusable element it returns to the close button, and Shift+Tab from the close button goes to the last.
4. **Small windows.** At the smallest window the app allows, the four stacks stay in one row and their text wraps or ends in an ellipsis. Nothing overflows the dialog horizontally.
5. **Pointer.** A click, wheel, or drag on the overlay never reaches the map.
6. **Smoke check.** Add one check in the style of the existing ones: after pressing `c`, `#charts-overlay` is not hidden and covers the window, and after pressing Escape it is hidden.
7. Record each rule a reader needs in `doc/ux/charts-dialog.md`.

### Tests

`rendererChartsDialogContracts.test.ts`: `readyHandler.ts` calls `refreshChartsDialogIfOpen`; `chartsDialog.ts` calls `currentRendererMatchEpoch`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Run the app: open the dialog in an Observe match, zoom one chart, and let a turn pass. The charts gain a point and the zoom is kept. Start a new match with the dialog open. It closes.

---

## Phase 8 — Docs, Final Verification, and Hand-Off

**Add:** nothing.
**Edit:** `doc/how-to-play.md`, `doc/match-statistics.md`, `doc/ux-specification.md`

### Steps

1. `doc/how-to-play.md`: a short section on the charts, in that document's voice: the key, what each chart shows, that they ignore fog of war, and that no AI commander is shown them.
2. `doc/match-statistics.md`: one paragraph pointing at the dialog and at `src/shared/matchChartSeries.ts`.
3. Confirm `doc/ux-specification.md` routes to `charts-dialog.md`.
4. Run `node scripts/check-doc-links.cjs` if the repo uses it.
5. Search the whole diff for plan vocabulary and remove it: `git diff | Select-String -Pattern 'Phase \d|history-2|execution plan|locked decision' -CaseSensitive:$false`. Nothing under `src/`, `static/`, `scripts/`, or `doc/` may match.
6. Run the Verification Bar and `npm run ui:smoke` one last time.
7. Fill in the Completion Log.
8. In your final message, name every document you updated, the uPlot version installed, and every decision under "Decisions this plan makes".

### Manual checklist for the user

1. Press `c` during a match, at game over, and while typing in the chat field. Expect the dialog in the first two cases and the letter `c` in the third.
2. Read each of the eleven charts against the top bar and the map for the current turn. Expect the same numbers.
3. With fog of war on, expect every side's credits and units on the charts.
4. Hover, wheel, drag, and double-click on a line chart and on the strip.
5. Resize the window while the dialog is open. Expect every chart to resize and no chart taller than a quarter of the dialog.
6. Load a save from before the statistics build. Expect `No turns have been recorded yet.` until a turn is played.

---

## Reliability Checklist

- [ ] The phase's files were backed up before the first edit.
- [ ] Every rule that can be wrong is a pure function under `src/shared` with a test.
- [ ] No text reaches the DOM through `innerHTML`.
- [ ] No timer or poll was added.
- [ ] The only new color values are the five stance variables, and the style guide records them.
- [ ] Every line chart block is at most a quarter of the dialog's height.
- [ ] Every surface changed has its `doc/ux/` document updated in the same phase.
- [ ] Every new function, type, interface, field, and constant has a full orienting comment.
- [ ] `npm run check:renderer-types` shows no new error, `check:circular` shows only the baseline cycles, and no baseline file was edited.
- [ ] `npm run notices:check` passes.
- [ ] No commit, push, stash, checkout, restore, reset, or clean was run.
- [ ] No plan vocabulary appears in `src/`, `static/`, `scripts/`, or `doc/`.

## Success Definition

- `c` opens a modal dialog over the whole window, and `c` or Escape closes it.
- The dialog shows, in order: a row of relationship stacks, the stance timeline, and nine line charts.
- Every line chart zooms with the wheel, pans by dragging, resets on double-click, and shows a per-side tooltip with a total.
- Missing and old relationship reports are visibly different from fresh ones.
- The charts ignore fog of war and stay current while the dialog is open.
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
