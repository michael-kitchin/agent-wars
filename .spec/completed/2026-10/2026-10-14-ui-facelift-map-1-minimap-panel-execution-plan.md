# UI Facelift Map, Plan 1 of 3: Minimap Panel and Map Controls

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Turn the minimap into the minimap panel: the 200 × 200 overview with a 96 px column of five map-mode buttons beside it. Weather is the normal view and Tech keeps the view that holding T shows. Control and Production are disabled placeholders, and Legend opens the terrain legend as a popover beside the panel. Move Leaflet's zoom buttons to the map's top-right and the scale beside the attribution at its bottom-right. Fit the toast band between the panel and the zoom buttons.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 1 of the three that build the spec's Phase 4; [ui-facelift-map-execution-plan.md](ui-facelift-map-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- Pure, unit-tested rules in `src/shared/mapViewMode.ts` (when the map shows its inspection view) and `src/shared/mapChromePlacement.ts` (where the legend and the toast band go).
- The Tech view: `isMapInspectionModeHeld` in `src/renderer/gameplay/productionOverlayHelpers.ts` now answers true while T is held, or while Tech is chosen on the world map. A battle, the new-game preview, and the game-over screen keep their normal view, and holding T works as before everywhere. Every drawing path that followed a held T follows Tech too, without other changes.
- The mode column, `src/renderer/map/mapModeColumn.ts`, and the session's chosen view, `src/renderer/map/mapViewModeState.ts`. The choice and whether the legend is open last until the app closes; neither is saved.
- `src/renderer/map/mapChromeLayout.ts` measures the panel, the open legend, and the zoom buttons, and places the legend and the toast band. It runs at startup, when the legend opens or closes, and whenever the map changes size. On a map too narrow for the band beside the panel, as at the 800 × 600 minimum window with the console expanded, the band runs from the map's left inset to the zoom buttons and covers the panel while a toast shows.
- Leaflet's zoom buttons, which Leaflet put at the top-left under the minimap, now sit at the top-right; the scale moves from the bottom-left to beside the attribution. Both keep the map's 12 px inset. The zoom buttons use the navy chrome, and a button is dimmed at the zoom limit.
- The smoke harness gains a file of map chrome checks and three scenes: the Tech view, the open legend, and the legend at the 800 × 600 minimum. The toast band check follows the new rule. The battle-beat Reports check is fixed: it failed whenever the dice gave the battle's first beat nothing to report.
- `doc/` describes the panel, the views, the legend popover, the controls' new places, and the band.

**Out of scope:**

- The Control and Production views. They stay disabled placeholders.
- Order line casing and arrowheads (plan 2), and the selection ring (plan 3).
- Minimap zoom buttons, which the spec defers.

**How this plan was checked:** every step below was applied to a copy of the repository at commit `b1b2d6f`, and the result matched the verified files exactly. On that result, the fast loop and the smoke run passed against the real app in Electron. The full tests ran once, after the last plan, and the test total below adds this plan's new tests to the starting total. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 4", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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
2. [ui-facelift-spec.md](ui-facelift-spec.md): How to Read This Document, Decisions, Frame, and Map Chrome.
3. `doc/ux/minimap.md`, `doc/ux/terrain-legend.md`, `doc/ux/map-surface.md`, and `doc/ux/input-map.md`.
4. `scripts/ui-smoke/ui-smoke.cjs` and `scripts/ui-smoke/ui-smoke-checks.cjs`, to see how scenes and checks fit together.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected:

- `git status --short` prints nothing, or only `.spec/` files.
- The last commit is `b1b2d6f Doc management.`, or a later commit of yours that changes only `.spec/`. If it is anything else, stop and report: every block in this plan was checked against `b1b2d6f`.

Then check that the spec's Phase 3 is in and this plan is not:

```powershell
Test-Path src/shared/opponentPlanningStatus.ts
Test-Path src/shared/mapViewMode.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **869**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/mapViewMode.ts`
- `src/shared/mapViewMode.test.ts`
- `src/shared/mapChromePlacement.ts`
- `src/shared/mapChromePlacement.test.ts`
- `src/renderer/map/mapViewModeState.ts`
- `src/renderer/map/mapChromeLayout.ts`
- `src/renderer/map/mapModeColumn.ts`
- `src/renderer/gameplay/productionOverlayHelpers.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `static/index.html`
- `static/shellChrome.css`
- `static/feedbackChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`
- `scripts/ui-smoke/ui-smoke-console-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`
- `scripts/ui-smoke/ui-smoke-map.cjs`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/minimap.md`
- `doc/ux/terrain-legend.md`
- `doc/ux/map-surface.md`
- `doc/ux/input-map.md`
- `doc/ux/modes-and-transitions.md`
- `doc/ux/new-game-dialog.md`
- `doc/ux/notifications-and-feedback.md`
- `doc/ux/control-tooltips.md`
- `doc/ux-specification.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Create `src/shared/mapViewMode.ts`**

The two map views the mode column offers, Weather and Tech, and the rule that decides when the map shows its inspection view: while T is held, or while Tech is chosen on the world map, outside a battle and outside the new-game or game-over overlay. A pure function with no page access.

Create `src/shared/mapViewMode.ts` with exactly this content:

```ts
/**
 * The map views the mode column offers. Weather is the map as it always looked; Tech keeps the view that holding T
 * shows: no terrain fill, with hex codes and tech icons.
 *
 * Purpose: The mode column, the drawing code, and the tests name the views the same way.
 * When to use: Where the renderer stores or reads the chosen view.
 * Expected outcome: `'weather'` or `'tech'`.
 * Exceptions: None.
 */
export type MapViewMode = 'weather' | 'tech';

/**
 * The view a session starts with.
 *
 * Purpose: The app opens on the normal map; the player's choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored view.
 * Expected outcome: `'weather'`.
 * Exceptions: None.
 */
export const DEFAULT_MAP_VIEW_MODE: MapViewMode = 'weather';

/**
 * Decides whether the map shows its inspection view: no terrain fill, and on the world map the hex codes and tech icons.
 *
 * Purpose: Holding T shows that view everywhere, as before. Choosing Tech in the mode column keeps it on, but only on
 *   the world map: a battle and the new-game preview keep their normal view, and Tech applies again when they close.
 * When to use: Wherever the renderer used to ask whether T is held. `tKeyHeld` is true while the player holds T,
 *   `inBattle` while a tactical battle is open, and `newGameOverlayOpen` while the new-game or game-over overlay is open.
 * Expected outcome: True while T is held, or while Tech is chosen outside a battle and outside the new-game overlay.
 * Exceptions: None.
 */
export function isTerrainInspectionShown(input: {
  readonly tKeyHeld: boolean;
  readonly mapViewMode: MapViewMode;
  readonly inBattle: boolean;
  readonly newGameOverlayOpen: boolean;
}): boolean {
  if (input.tKeyHeld) return true;
  return input.mapViewMode === 'tech' && !input.inBattle && !input.newGameOverlayOpen;
}
```

- [ ] **Step 2: Create `src/shared/mapViewMode.test.ts`**

Covers the default view, holding T, Tech on the world map, and Tech in a battle and under the new-game overlay.

Create `src/shared/mapViewMode.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MAP_VIEW_MODE, isTerrainInspectionShown } from './mapViewMode';

/**
 * The world map with the normal view and no key held.
 *
 * Purpose: Each test changes only the inputs it is about.
 * When to use: Spread into each test's input.
 * Expected outcome: An input for which the inspection view is off.
 * Exceptions: None.
 */
const WORLD_MAP: Parameters<typeof isTerrainInspectionShown>[0] = {
  tKeyHeld: false,
  mapViewMode: 'weather',
  inBattle: false,
  newGameOverlayOpen: false,
};

test('a session starts on the Weather view', () => {
  assert.equal(DEFAULT_MAP_VIEW_MODE, 'weather');
});

test('the Weather view shows the inspection view only while T is held', () => {
  assert.equal(isTerrainInspectionShown(WORLD_MAP), false);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true }), true);
});

test('the Tech view shows the inspection view on the world map', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, mapViewMode: 'tech' }), true);
});

test('the Tech view does not apply in a battle or under the new-game overlay', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, mapViewMode: 'tech', inBattle: true }), false);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, mapViewMode: 'tech', newGameOverlayOpen: true }), false);
});

test('holding T shows the inspection view in a battle and under the overlay, whatever the view', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true, inBattle: true }), true);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true, mapViewMode: 'tech', newGameOverlayOpen: true }), true);
});
```

- [ ] **Step 3: Create `src/shared/mapChromePlacement.ts`**

The placement rules for the chrome at the top of the map: the legend opens beside the minimap panel when it fits and under it otherwise, and the toast band sits between the panel (or the open legend) and the zoom buttons, or runs from the map's left inset to the zoom buttons when that gap is under 280 px. Pure functions with no page access.

Create `src/shared/mapChromePlacement.ts` with exactly this content:

```ts
/**
 * How far map chrome stays from the map's edges, in CSS pixels. This module holds the placement rules for the chrome
 * that shares the top of the map: the minimap panel at the top-left, the terrain legend beside or under it, the zoom
 * buttons at the top-right, and the toast band between them.
 *
 * Purpose: The minimap panel, the legend, the zoom buttons, and the toast band keep the same inset.
 * When to use: Through `legendPopoverPosition` and `toastBandSpan`.
 * Expected outcome: 12.
 * Exceptions: None.
 */
export const MAP_CHROME_INSET = 12;

/**
 * The space between the minimap panel and the legend, in CSS pixels.
 *
 * Purpose: The legend reads as a separate panel that the Legend button opened.
 * When to use: Through `legendPopoverPosition`.
 * Expected outcome: 8.
 * Exceptions: None.
 */
export const MAP_CHROME_GAP = 8;

/**
 * The narrowest the toast band may be beside the panel, in CSS pixels.
 *
 * Purpose: Below this width a toast wraps into a thin column; the band then spans the top of the map instead.
 * When to use: Through `toastBandSpan`.
 * Expected outcome: 280.
 * Exceptions: None.
 */
export const TOAST_BAND_MIN_WIDTH = 280;

/**
 * Places the terrain legend beside the minimap panel, or under it when the map is too narrow.
 *
 * Purpose: The legend opens to the right of the panel, as the layout asks, without running off a narrow map.
 * When to use: Each time the legend opens and each time the map changes size, with boxes measured relative to the
 *   map's top-left corner.
 * Expected outcome: `beside` is true when the legend fits right of the panel with the inset to spare; it then sits
 *   `MAP_CHROME_GAP` right of the panel, level with the map's top inset. Otherwise it sits at the left inset,
 *   `MAP_CHROME_GAP` under the panel.
 * Exceptions: None.
 */
export function legendPopoverPosition(input: {
  readonly mapWidth: number;
  readonly panelRight: number;
  readonly panelBottom: number;
  readonly legendWidth: number;
}): { readonly left: number; readonly top: number; readonly beside: boolean } {
  const besideLeft = input.panelRight + MAP_CHROME_GAP;
  if (besideLeft + input.legendWidth + MAP_CHROME_INSET <= input.mapWidth) {
    return { left: besideLeft, top: MAP_CHROME_INSET, beside: true };
  }
  return { left: MAP_CHROME_INSET, top: input.panelBottom + MAP_CHROME_GAP, beside: false };
}

/**
 * Finds the toast band's left and right offsets inside the map.
 *
 * Purpose: Toasts sit between the chrome at the top-left (the minimap panel, or the legend when it is open beside the
 *   panel) and the zoom buttons at the top-right. On a map too narrow for that, a toast is better wide and briefly
 *   over the panel than squeezed into a thin column.
 * When to use: Each time the map changes size and each time the legend opens or closes, with x positions measured from
 *   the map's left edge. Pass the map width as `rightObstacleLeft` when there are no zoom buttons.
 * Expected outcome: `left` and `right` are CSS offsets from the map's left and right edges, each keeping
 *   `MAP_CHROME_INSET` from the chrome beside it. When the space between is narrower than `TOAST_BAND_MIN_WIDTH`,
 *   `left` is the map's own inset instead and `overChrome` is true.
 * Exceptions: None.
 */
export function toastBandSpan(input: {
  readonly mapWidth: number;
  readonly leftObstacleRight: number;
  readonly rightObstacleLeft: number;
}): { readonly left: number; readonly right: number; readonly overChrome: boolean } {
  const right = Math.max(MAP_CHROME_INSET, input.mapWidth - input.rightObstacleLeft + MAP_CHROME_INSET);
  const left = input.leftObstacleRight + MAP_CHROME_INSET;
  if (input.mapWidth - left - right < TOAST_BAND_MIN_WIDTH) {
    return { left: MAP_CHROME_INSET, right, overChrome: true };
  }
  return { left, right, overChrome: false };
}
```

- [ ] **Step 4: Create `src/shared/mapChromePlacement.test.ts`**

Covers the legend beside and under the panel, the band between the chrome, the band on a narrow map, and a map without zoom buttons.

Create `src/shared/mapChromePlacement.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legendPopoverPosition, toastBandSpan } from './mapChromePlacement';

test('legendPopoverPosition puts the legend right of the panel when it fits', () => {
  assert.deepEqual(legendPopoverPosition({ mapWidth: 904, panelRight: 310, panelBottom: 214, legendWidth: 110 }), {
    left: 318,
    top: 12,
    beside: true,
  });
});

test('legendPopoverPosition puts the legend under the panel on a narrow map', () => {
  assert.deepEqual(legendPopoverPosition({ mapWidth: 424, panelRight: 310, panelBottom: 214, legendWidth: 110 }), {
    left: 12,
    top: 222,
    beside: false,
  });
});

test('toastBandSpan keeps the band between the chrome on the left and the zoom buttons', () => {
  assert.deepEqual(toastBandSpan({ mapWidth: 904, leftObstacleRight: 310, rightObstacleLeft: 858 }), {
    left: 322,
    right: 58,
    overChrome: false,
  });
});

test('toastBandSpan spans the top of a map too narrow for the band beside the chrome', () => {
  assert.deepEqual(toastBandSpan({ mapWidth: 424, leftObstacleRight: 310, rightObstacleLeft: 378 }), {
    left: 12,
    right: 58,
    overChrome: true,
  });
});

test('toastBandSpan keeps the inset at the right edge when there are no zoom buttons', () => {
  assert.deepEqual(toastBandSpan({ mapWidth: 904, leftObstacleRight: 310, rightObstacleLeft: 904 }), {
    left: 322,
    right: 12,
    overChrome: false,
  });
});
```

- [ ] **Step 5: Create `src/renderer/map/mapViewModeState.ts`**

Holds the view chosen in the mode column for the rest of the session. It is not saved.

Create `src/renderer/map/mapViewModeState.ts` with exactly this content:

```ts
/**
 * The map view the player chose in the mode column. This module holds that choice for the rest of the session; it is
 * not saved, so the app opens on the Weather view each time.
 *
 * Purpose: The mode column writes the choice and the drawing code reads it, without either importing the other.
 * When to use: Through `getMapViewMode` and `setMapViewMode`.
 * Expected outcome: `DEFAULT_MAP_VIEW_MODE` until the player picks another view.
 * Exceptions: None.
 */
import { DEFAULT_MAP_VIEW_MODE, type MapViewMode } from '../../shared/mapViewMode';

/**
 * The view chosen in the mode column.
 *
 * Purpose: The single record of the choice for this session.
 * When to use: Only through `getMapViewMode` and `setMapViewMode`.
 * Expected outcome: Starts as `DEFAULT_MAP_VIEW_MODE`.
 * Exceptions: None.
 */
let mapViewMode: MapViewMode = DEFAULT_MAP_VIEW_MODE;

/**
 * Returns the map view the player chose.
 *
 * Purpose: Drawing code and the mode column's buttons follow the same choice.
 * When to use: Each time the inspection view is decided, and when the mode column redraws its buttons.
 * Expected outcome: `'weather'` or `'tech'`.
 * Exceptions: None.
 */
export function getMapViewMode(): MapViewMode {
  return mapViewMode;
}

/**
 * Records the map view the player chose.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the mode column's Weather and Tech buttons.
 * Expected outcome: Later calls to `getMapViewMode` return `mode`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setMapViewMode(mode: MapViewMode): void {
  mapViewMode = mode;
}
```

- [ ] **Step 6: Create `src/renderer/map/mapChromeLayout.ts`**

Measures the minimap panel, the open legend, and the zoom buttons, then applies the placement rules to the legend and the toast band.

Create `src/renderer/map/mapChromeLayout.ts` with exactly this content:

```ts
/**
 * Places the terrain legend and the toast band among the chrome at the top of the map. The rules are in
 * `src/shared/mapChromePlacement.ts`; this module measures the page and applies them.
 *
 * Purpose: The legend's width and the zoom buttons' position come from the page, so they are measured, not assumed.
 * When to use: Through `layoutMapChrome`.
 * Expected outcome: Inline `left`, `top`, and `right` on `#terrain-legend` and `#map-toast-band`.
 * Exceptions: None; missing elements are skipped.
 */
import { legendPopoverPosition, toastBandSpan } from '../../shared/mapChromePlacement';

/**
 * Moves the open legend beside or under the minimap panel, then fits the toast band between the chrome on the left
 * and the zoom buttons.
 *
 * Purpose: Keeps the legend on the map and the toasts clear of the panel, the legend, and the zoom buttons at any size.
 * When to use: After the maps are created, after the legend opens or closes, and whenever the map changes size.
 * Expected outcome: An open legend sits beside the panel when it fits, otherwise under it. The band sits right of the
 *   panel, or of the legend when the legend is beside it, and left of the zoom buttons; on a narrow map it spans the top
 *   of the map instead. A closed legend is left where it was.
 * Exceptions: None. Does nothing without `#canvas-container` or `#minimap-panel`.
 */
export function layoutMapChrome(): void {
  const map = document.getElementById('canvas-container');
  const panel = document.getElementById('minimap-panel');
  if (!map || !panel) return;
  const mapBox = map.getBoundingClientRect();
  const panelBox = panel.getBoundingClientRect();
  const panelRight = panelBox.right - mapBox.left;
  let leftObstacleRight = panelRight;

  const legend = document.getElementById('terrain-legend');
  if (legend && !legend.hidden) {
    const place = legendPopoverPosition({
      mapWidth: mapBox.width,
      panelRight,
      panelBottom: panelBox.bottom - mapBox.top,
      legendWidth: legend.offsetWidth,
    });
    legend.style.left = `${place.left}px`;
    legend.style.top = `${place.top}px`;
    if (place.beside) leftObstacleRight = place.left + legend.offsetWidth;
  }

  const band = document.getElementById('map-toast-band');
  if (!band) return;
  const zoomBox = document.querySelector('#main-map .leaflet-control-zoom')?.getBoundingClientRect();
  const span = toastBandSpan({
    mapWidth: mapBox.width,
    leftObstacleRight,
    rightObstacleLeft: zoomBox && zoomBox.width > 0 ? zoomBox.left - mapBox.left : mapBox.width,
  });
  band.style.left = `${span.left}px`;
  band.style.right = `${span.right}px`;
}
```

- [ ] **Step 7: Create `src/renderer/map/mapModeColumn.ts`**

Wires the Weather, Tech, and Legend buttons: Weather and Tech store the view and redraw the map, Legend opens and closes the legend, and every button's pressed state follows.

Create `src/renderer/map/mapModeColumn.ts` with exactly this content:

```ts
/**
 * The column of map-mode buttons beside the minimap: Weather and Tech choose the map view, Control and Production are
 * disabled placeholders in the markup, and Legend opens or closes the terrain legend.
 *
 * Purpose: Keeps the buttons, the stored view, and the legend in step.
 * When to use: `wireMapModeColumn` once at startup.
 * Expected outcome: Exactly one of Weather and Tech reads as pressed, and Legend reads as pressed while the legend is
 *   open.
 * Exceptions: None; missing elements are skipped.
 */
import type { MapViewMode } from '../../shared/mapViewMode';
import { layoutMapChrome } from './mapChromeLayout';
import { getMapViewMode, setMapViewMode } from './mapViewModeState';

/**
 * Sets each button's pressed state from the stored view and the legend.
 *
 * Purpose: The buttons are the only sign of which view is on, so they must never disagree with it.
 * When to use: After the view changes or the legend opens or closes.
 * Expected outcome: `aria-pressed` on Weather and Tech matches the stored view; `aria-pressed` and `aria-expanded` on
 *   Legend match whether `#terrain-legend` is shown.
 * Exceptions: None.
 */
function syncMapModeColumn(): void {
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
 * When to use: From the Weather and Tech buttons.
 * Expected outcome: The view is stored, the buttons follow, and the map is redrawn.
 * Exceptions: None.
 */
function chooseMapView(mode: MapViewMode, requestRedraw: () => void): void {
  if (getMapViewMode() === mode) return;
  setMapViewMode(mode);
  syncMapModeColumn();
  requestRedraw();
}

/**
 * Opens the terrain legend, or closes it if it is open.
 *
 * Purpose: The legend is a popover now, closed until the player asks for it.
 * When to use: From the Legend button.
 * Expected outcome: The legend shows or hides, the button follows, and the legend and the toast band are placed again.
 * Exceptions: None.
 */
function toggleTerrainLegend(): void {
  const legend = document.getElementById('terrain-legend');
  if (!legend) return;
  legend.hidden = !legend.hidden;
  syncMapModeColumn();
  layoutMapChrome();
}

/**
 * Wires the Weather, Tech, and Legend buttons.
 *
 * Purpose: The mode column's single setup point.
 * When to use: Once at startup, after the maps and the legend are built.
 * Expected outcome: Clicks change the view or the legend, and the buttons show the session's starting state.
 * Exceptions: None.
 */
export function wireMapModeColumn(requestRedraw: () => void): void {
  document.getElementById('map-mode-weather')?.addEventListener('click', () => chooseMapView('weather', requestRedraw));
  document.getElementById('map-mode-tech')?.addEventListener('click', () => chooseMapView('tech', requestRedraw));
  document.getElementById('map-legend-toggle')?.addEventListener('click', toggleTerrainLegend);
  syncMapModeColumn();
}
```

- [ ] **Step 8: Edit `src/renderer/gameplay/productionOverlayHelpers.ts`**

`isMapInspectionModeHeld` now asks `isTerrainInspectionShown`, so every drawing path that followed a held T also follows the Tech view. The name stays because many callers pass it along.

1. In `src/renderer/gameplay/productionOverlayHelpers.ts`, find this line. It occurs exactly once:

```ts
import { rendererSharedState as S } from '../core/state';
```

Replace it with:

```ts
import { rendererSharedState as S } from '../core/state';
import { isTerrainInspectionShown } from '../../shared/mapViewMode';
import { getMapViewMode } from '../map/mapViewModeState';
import { isNewGameOverlayOpen } from './newGameBanner';
```

2. In `src/renderer/gameplay/productionOverlayHelpers.ts`, find these lines. Together they occur exactly once:

```ts
 * True while map inspection mode suppresses terrain fill (T key held).
 */
export function isMapInspectionModeHeld(): boolean {
  return S.hideTerrainFillWhileHeld;
```

Replace them with:

```ts
 * Reports whether the map shows its inspection view: terrain fill hidden and, on the world map, hex codes and tech icons.
 *
 * Purpose: Every drawing path that used to ask whether T is held asks here. The name stays because many callers pass
 *   it along; the answer now also covers the Tech view chosen in the mode column.
 * When to use: Wherever drawing depends on the inspection view.
 * Expected outcome: True while T is held, or while the Tech view is chosen outside a battle and outside the new-game
 *   overlay. See `isTerrainInspectionShown`.
 * Exceptions: None.
 */
export function isMapInspectionModeHeld(): boolean {
  const mapViewMode = getMapViewMode();
  return isTerrainInspectionShown({
    tKeyHeld: S.hideTerrainFillWhileHeld,
    mapViewMode,
    inBattle: S.tacticalBattleSnapshot != null,
    // Drawing asks this for every hex, so the page is read only while the answer can depend on it.
    newGameOverlayOpen: mapViewMode === 'tech' && isNewGameOverlayOpen(),
  });
```

- [ ] **Step 9: Edit `src/renderer/map/initCore.ts`**

Wires the mode column after the legend is built, places the chrome once, and places it again whenever the map changes size.

1. In `src/renderer/map/initCore.ts`, find this line. It occurs exactly once:

```ts
import { installControlTooltip } from '../chrome/controlTooltip';
```

Replace it with:

```ts
import { installControlTooltip } from '../chrome/controlTooltip';
import { layoutMapChrome } from './mapChromeLayout';
import { wireMapModeColumn } from './mapModeColumn';
```

2. In `src/renderer/map/initCore.ts`, find these lines. Together they occur exactly once:

```ts
    }
  } catch (err) {
```

Replace them with:

```ts
    }
    wireMapModeColumn(() => deps.requestRedraw());
    layoutMapChrome();
  } catch (err) {
```

3. In `src/renderer/map/initCore.ts`, find this line. It occurs exactly once:

```ts
  observeMapContainerResize(() => deps.resizeAndRedraw());
```

Replace it with:

```ts
  observeMapContainerResize(() => {
    deps.resizeAndRedraw();
    layoutMapChrome();
  });
```

- [ ] **Step 10: Edit `src/renderer/map/worldLeafletMap.ts`**

Adds the zoom buttons at the map's top-right instead of Leaflet's top-left default, where the minimap covered them, and puts the scale at the bottom-right beside the attribution.

1. In `src/renderer/map/worldLeafletMap.ts`, find this line. It occurs exactly once:

```ts
    scale: (options?: Record<string, unknown>) => { addTo: (map: VendorLeafletMap) => void };
```

Replace it with:

```ts
    scale: (options?: Record<string, unknown>) => { addTo: (map: VendorLeafletMap) => void };
    zoom: (options?: Record<string, unknown>) => { addTo: (map: VendorLeafletMap) => void };
```

2. In `src/renderer/map/worldLeafletMap.ts`, find these lines. Together they occur exactly once:

```ts
    keyboard: false,
    /* Keep raster tiles and canvas overlay in lockstep (no CSS zoom/pan lag vs hex draw). */
```

Replace them with:

```ts
    keyboard: false,
    /* Added below at the top-right, clear of the minimap panel. */
    zoomControl: false,
    /* Keep raster tiles and canvas overlay in lockstep (no CSS zoom/pan lag vs hex draw). */
```

3. In `src/renderer/map/worldLeafletMap.ts`, find these lines. Together they occur exactly once:

```ts
  try {
    // Show real-world distance context when Leaflet scale control is available.
    leafletRef.control
      .scale({
```

Replace them with:

```ts
  leafletRef.control.zoom({ position: 'topright' }).addTo(mainMap);
  try {
    // Show real-world distance context when Leaflet scale control is available, beside the attribution.
    leafletRef.control
      .scale({
        position: 'bottomright',
```

- [ ] **Step 11: Edit `src/renderer/core/uiState.ts`**

Focus leaves the whole minimap panel, not only the overview, when the new-game overlay opens.

1. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: The minimap, the legend, the top bar, the game menu, and the console are not on screen while that overlay is open. A focused control would still take keys, and a tip for New game would stay up over the map.
 * When to use: When that overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: Focus leaves the minimap, the legend, the top bar, the game menu, or the console. A dialog control that already has focus is left alone. A tip whose control has no box is dismissed.
```

Replace them with:

```ts
 * Purpose: The minimap panel, the legend, the top bar, the game menu, and the console are not on screen while that overlay is open. A focused control would still take keys, and a tip for New game would stay up over the map.
 * When to use: When that overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: Focus leaves the minimap panel, the legend, the top bar, the game menu, or the console. A dialog control that already has focus is left alone. A tip whose control has no box is dismissed.
```

2. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
    const insideHiddenChrome = active.closest('#minimap') != null
```

Replace it with:

```ts
    const insideHiddenChrome = active.closest('#minimap-panel') != null
```

- [ ] **Step 12: Edit `src/renderer/chrome/frameTooltipText.ts`**

Adds the tips of the Weather, Tech, and Legend buttons.

In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
export const reportsTabTooltipText = 'Show the turn reports, opponent messages, and notices from this match, newest first.';
```

Replace it with:

```ts
export const reportsTabTooltipText = 'Show the turn reports, opponent messages, and notices from this match, newest first.';

/**
 * The Weather map mode's tip.
 *
 * Purpose: Says Weather is the map's normal view.
 * When to use: `#map-mode-weather`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapWeatherModeTooltipText =
  "Show the map as usual: terrain, and each hex's weather while the weather bonus is on.";

/**
 * The Tech map mode's tip.
 *
 * Purpose: Says what Tech shows, where it applies, how long it lasts, and how it relates to holding T.
 * When to use: `#map-mode-tech`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapTechModeTooltipText =
  "Show each hex's code, production, and tech tier instead of terrain on the world map, until you choose Weather. Holding T shows the same view while the key is down.";

/**
 * The Legend button's tip.
 *
 * Purpose: Says the button opens and closes the terrain legend, which holds the terrain style choice.
 * When to use: `#map-legend-toggle`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapLegendToggleTooltipText = 'Show or hide the terrain legend and its style choice.';
```

- [ ] **Step 13: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 14: Edit `static/index.html`**

Wraps the minimap in the minimap panel with its column of five map-mode buttons, and hides the terrain legend until the Legend button opens it.

In `static/index.html`, find these lines. Together they occur exactly once:

```html
    <div id="minimap" aria-label="World overview"></div>
    <div id="terrain-legend" aria-label="Terrain legend"></div>
```

Replace them with:

```html
    <div id="minimap-panel" class="minimap-panel">
      <div id="minimap" aria-label="World overview"></div>
      <div id="map-mode-column" class="map-mode-column" role="group" aria-label="Map modes">
        <button type="button" id="map-mode-weather" class="map-mode-btn" aria-pressed="true" data-control-tooltip="Show the map as usual: terrain, and each hex's weather while the weather bonus is on."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 12.5h7a2.6 2.6 0 0 0 .3-5.2 4 4 0 0 0-7.6.9 2.2 2.2 0 0 0 .3 4.3z"></path></svg>Weather</button>
        <button type="button" id="map-mode-tech" class="map-mode-btn" aria-pressed="false" data-control-tooltip="Show each hex's code, production, and tech tier instead of terrain on the world map, until you choose Weather. Holding T shows the same view while the key is down."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5h6v6H5zM7 2.5V5M9 2.5V5M7 11v2.5M9 11v2.5M2.5 7H5M2.5 9H5M11 7h2.5M11 9h2.5"></path></svg>Tech</button>
        <span class="control-tooltip-host map-mode-host" data-control-tooltip="Control is not available in this version."><button type="button" id="map-mode-control" class="map-mode-btn" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5M4 3h7.5L9.7 5.8l1.8 2.7H4"></path></svg>Control</button></span>
        <span class="control-tooltip-host map-mode-host" data-control-tooltip="Production is not available in this version."><button type="button" id="map-mode-production" class="map-mode-btn" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M10.8 4.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.6 5.8 4.6 0 1.3-1.2 2.2-3 2.2-1.4 0-2.5-.6-3-1.5"></path></svg>Production</button></span>
        <button type="button" id="map-legend-toggle" class="map-mode-btn" aria-pressed="false" aria-expanded="false" aria-controls="terrain-legend" data-control-tooltip="Show or hide the terrain legend and its style choice."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h2M2.5 8h2M2.5 12h2M6.5 4h7M6.5 8h7M6.5 12h7"></path></svg>Legend</button>
      </div>
    </div>
    <div id="terrain-legend" aria-label="Terrain legend" hidden></div>
```

- [ ] **Step 15: Edit `static/shellChrome.css`**

Styles the minimap panel, the mode buttons, and the legend popover, and places Leaflet's zoom buttons, scale, and attribution 12 px in from the map's right-hand corners in the chrome colors.

1. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
#minimap {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 200px;
  height: 200px;
  z-index: 6200;
  border: 1px solid #999;
  border-radius: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  overflow: hidden;
```

Replace them with:

```css
/* The minimap panel at the map's top-left: the 200px overview, then a 96px column of five 40px map-mode buttons. */
.minimap-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 6200;
  display: flex;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  border: 1px solid var(--chrome-border);
  border-radius: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}
#minimap {
  flex: none;
  width: 200px;
  height: 200px;
```

2. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
#terrain-legend {
  position: absolute;
  top: 220px;
```

Replace them with:

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
}
.map-mode-btn:disabled {
  background: transparent;
  color: var(--chrome-disabled);
  cursor: default;
}
/* Opened by the Legend button. mapChromeLayout.ts places it beside the minimap panel, or under it on a narrow map. */
#terrain-legend {
  position: absolute;
  top: 12px;
```

3. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
/* Hidden, not removed, so the minimap keeps its 200px box while the start dialog is open. */
#canvas-container:has(#game-over-overlay:not(.hidden)) #minimap,
```

Replace them with:

```css
#terrain-legend[hidden] {
  display: none;
}
/* Hidden, not removed, so the panel and the legend keep their boxes while the start dialog is open. */
#canvas-container:has(#game-over-overlay:not(.hidden)) #minimap-panel,
```

4. In `static/shellChrome.css`, find these lines. Together they occur exactly once:

```css
#canvas-container:has(#game-over-overlay:not(.hidden)) #main-map .leaflet-control-zoom {
  visibility: hidden;
}
```

Replace them with:

```css
#canvas-container:has(#game-over-overlay:not(.hidden)) #main-map .leaflet-control-zoom {
  visibility: hidden;
}
/* Leaflet's right-hand corners keep the map's 12px inset: the zoom buttons at the top, and the scale right of the attribution at the bottom. */
#main-map .leaflet-top.leaflet-right {
  top: 12px;
  right: 12px;
}
#main-map .leaflet-bottom.leaflet-right {
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-end;
  gap: 6px;
}
#main-map .leaflet-right .leaflet-control {
  margin: 0;
  float: none;
  clear: none;
}
#main-map .leaflet-control-zoom {
  border: 1px solid var(--chrome-border);
  border-radius: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
}
#main-map .leaflet-control-zoom a {
  background: var(--chrome-bg);
  color: var(--chrome-text);
  border-bottom-color: var(--chrome-divider);
}
#main-map .leaflet-control-zoom a:hover {
  background: var(--chrome-bg-raised);
}
/* At the zoom limit Leaflet marks that button disabled; dim it like the other disabled chrome. */
#main-map .leaflet-control-zoom a.leaflet-disabled,
#main-map .leaflet-control-zoom a.leaflet-disabled:hover {
  background: var(--chrome-bg);
  color: var(--chrome-disabled);
  cursor: default;
}
```

- [ ] **Step 16: Edit `static/feedbackChrome.css`**

The toast band's left and right offsets now come from `mapChromeLayout.ts`.

In `static/feedbackChrome.css`, find these lines. Together they occur exactly once:

```css
/* The two toasts stack in one band at the top centre of the map, right of the minimap's 200 px and its 12 px insets. The band is only as wide as its widest toast, so it does not block the map beside them. */
.map-toast-band {
  position: absolute;
  top: 12px;
  left: 224px;
```

Replace them with:

```css
/* The two toasts stack in one band at the top centre of the map, between the minimap panel (or the legend beside it) and the zoom buttons. mapChromeLayout.ts sets left and right; on a narrow map the band spans the top of the map. The band is only as wide as its widest toast, so it does not block the map beside them. */
.map-toast-band {
  position: absolute;
  top: 12px;
  left: 12px;
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the Tech view, open legend, and small-window legend scenes.

1. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
 * Purpose: The frame checks, the console checks, the scenario checks, and the runner name scenes and compare boxes the
 *   same way.
 * When to use: Required by `ui-smoke-checks.cjs`, `ui-smoke-console-checks.cjs`, `ui-smoke-scenario-checks.cjs`, and
 *   `ui-smoke.cjs`.
```

Replace them with:

```js
 * Purpose: The frame checks, the console checks, the scenario checks, the map chrome checks, and the runner name scenes
 *   and compare boxes the same way.
 * When to use: Required by `ui-smoke-checks.cjs`, `ui-smoke-console-checks.cjs`, `ui-smoke-scenario-checks.cjs`,
 *   `ui-smoke-map-chrome-checks.cjs`, and `ui-smoke.cjs`.
```

2. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  gameMenuOutside: 'game-menu-outside',
```

Replace it with:

```js
  gameMenuOutside: 'game-menu-outside',
  mapTech: 'map-tech',
  legendOpen: 'legend-open',
```

3. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  smallWindow: 'small-window',
```

Replace it with:

```js
  smallWindow: 'small-window',
  legendSmallWindow: 'legend-small-window',
```

- [ ] **Step 18: Create `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`**

A new file: the checks of the minimap panel and its buttons, the legend's placement, the zoom buttons, the scale and attribution, and the panel hidden on the new-game screen.

Create `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs` with exactly this content:

```js
/**
 * Checks of the chrome on the map for the UI smoke run: the minimap panel and its mode buttons, the terrain legend, and
 * Leaflet's zoom buttons, scale, and attribution.
 *
 * Purpose: Keeps the map chrome checks apart from the frame, console, and scenario checks, so each table stays readable.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the scenario checks.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES, NEW_GAME_SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');

/**
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
 * When to use: The panel geometry check.
 * Expected outcome: Weather, Tech, Control, Production, Legend.
 * Exceptions: None.
 */
const MODE_BUTTONS = Object.freeze(['#map-mode-weather', '#map-mode-tech', '#map-mode-control', '#map-mode-production', '#map-legend-toggle']);

/**
 * Leaflet's zoom buttons, scale, and attribution on the main map.
 *
 * Purpose: One place for the selectors the position checks read.
 * When to use: The zoom, scale, and attribution checks.
 * Expected outcome: Leaflet's own class names inside `#main-map`.
 * Exceptions: None.
 */
const LEAFLET = Object.freeze({
  zoom: '#main-map .leaflet-control-zoom',
  scale: '#main-map .leaflet-control-scale',
  attribution: '#main-map .leaflet-control-attribution',
});

/**
 * Scenes on the world map and in a battle, at each size, where the map chrome must be in its usual place.
 *
 * Purpose: The chrome must hold its place at every size, in a battle, and in a regional match.
 * When to use: The placement checks.
 * Expected outcome: The strategic scene at each size, the reopened match, the battle's first scene, and the regional
 *   match's first scene.
 * Exceptions: None.
 */
const PLACEMENT_SCENES = Object.freeze([SCENES.strategic, SCENES.matchReopened, SCENES.battleStart, SCENES.regionalStart]);

/**
 * The map chrome checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a map chrome rule needs a machine check.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const MAP_CHROME_CHECKS = Object.freeze([
  {
    name: 'minimap-panel-layout',
    scenes: PLACEMENT_SCENES,
    needs: ['#canvas-container', '#minimap-panel', '#minimap', '#map-mode-column', ...MODE_BUTTONS],
    run: (p, el) => {
      const c = el('#canvas-container');
      const panel = el('#minimap-panel');
      const mini = el('#minimap');
      const column = el('#map-mode-column');
      if (!panel.shown) return 'the minimap panel is not shown';
      if (!near(panel.x, c.x + PANEL.inset) || !near(panel.y, c.y + PANEL.inset)) {
        return `the minimap panel is at ${fmt(panel)}, expected its corner ${PANEL.inset} px in from the map's top-left`;
      }
      if (!near(mini.w, PANEL.minimap) || !near(mini.h, PANEL.minimap)) return `the minimap is ${fmt(mini)}, expected ${PANEL.minimap}x${PANEL.minimap}`;
      if (!near(column.w, PANEL.column) || column.x < mini.x + mini.w - 1) return `the mode column is ${fmt(column)}, expected ${PANEL.column} px wide right of the minimap`;
      for (const [i, selector] of MODE_BUTTONS.entries()) {
        const button = el(selector);
        if (!near(button.h, PANEL.button) || !near(button.y, column.y + i * PANEL.button)) {
          return `${selector} is at ${fmt(button)}, expected button ${i + 1} of the column, ${PANEL.button} px tall`;
        }
      }
      return null;
    },
  },
  {
    name: 'map-mode-weather-default',
    scenes: [...PLACEMENT_SCENES, SCENES.ordersQueued],
    needs: [...MODE_BUTTONS, '#terrain-legend'],
    run: (p, el) => {
      const state = MODE_BUTTONS.map((selector) => `${selector} ${el(selector).disabled ? 'disabled' : `pressed=${el(selector).pressed}`}`);
      const expected = [
        '#map-mode-weather pressed=true',
        '#map-mode-tech pressed=false',
        '#map-mode-control disabled',
        '#map-mode-production disabled',
        '#map-legend-toggle pressed=false',
      ];
      if (state.join(', ') !== expected.join(', ')) return `the mode buttons read "${state.join(', ')}"`;
      return el('#terrain-legend').shown ? 'the terrain legend is open' : null;
    },
  },
  {
    name: 'map-mode-tech-chosen',
    scenes: [SCENES.mapTech],
    needs: ['#map-mode-weather', '#map-mode-tech'],
    run: (p, el) => {
      const line = `Weather pressed=${el('#map-mode-weather').pressed}, Tech pressed=${el('#map-mode-tech').pressed}`;
      return line === 'Weather pressed=false, Tech pressed=true' ? null : `the view buttons read "${line}"`;
    },
  },
  {
    name: 'legend-beside-or-under-panel',
    scenes: [SCENES.legendOpen, SCENES.legendSmallWindow],
    needs: ['#canvas-container', '#minimap-panel', '#terrain-legend', '#map-legend-toggle'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const panel = el('#minimap-panel');
      const legend = el('#terrain-legend');
      const toggle = el('#map-legend-toggle');
      if (toggle.pressed !== 'true' || toggle.expanded !== 'true') return `the Legend button reads pressed=${toggle.pressed}, expanded=${toggle.expanded}`;
      if (!legend.shown) return 'the terrain legend is not shown';
      const besideX = panel.x + panel.w + PANEL.legendGap;
      if (besideX + legend.w + PANEL.inset <= c.x + c.w + 1) {
        return near(legend.x, besideX) && near(legend.y, c.y + PANEL.inset)
          ? null
          : `the terrain legend is at ${fmt(legend)}, expected ${PANEL.legendGap} px right of the panel ${fmt(panel)}, level with its top`;
      }
      return near(legend.x, c.x + PANEL.inset) && near(legend.y, panel.y + panel.h + PANEL.legendGap)
        ? null
        : `the terrain legend is at ${fmt(legend)}, expected ${PANEL.legendGap} px under the panel ${fmt(panel)}, which leaves no room beside it`;
    },
  },
  {
    name: 'zoom-buttons-top-right',
    scenes: PLACEMENT_SCENES,
    needs: ['#canvas-container', LEAFLET.zoom],
    run: (p, el) => {
      const c = el('#canvas-container');
      const zoom = el(LEAFLET.zoom);
      if (!zoom.shown) return 'the zoom buttons are not shown';
      const placed = near(zoom.x + zoom.w, c.x + c.w - PANEL.inset) && near(zoom.y, c.y + PANEL.inset);
      return placed ? null : `the zoom buttons are at ${fmt(zoom)}, expected ${PANEL.inset} px in from the map's top-right ${fmt(c)}`;
    },
  },
  {
    name: 'scale-and-attribution-bottom-right',
    scenes: PLACEMENT_SCENES,
    needs: ['#canvas-container', LEAFLET.scale, LEAFLET.attribution],
    run: (p, el) => {
      const c = el('#canvas-container');
      const scale = el(LEAFLET.scale);
      const attribution = el(LEAFLET.attribution);
      if (!scale.shown) return 'the scale is not shown';
      const bottom = c.y + c.h - PANEL.inset;
      if (!near(scale.x + scale.w, c.x + c.w - PANEL.inset) || !near(scale.y + scale.h, bottom)) {
        return `the scale is at ${fmt(scale)}, expected ${PANEL.inset} px in from the map's bottom-right ${fmt(c)}`;
      }
      if (!attribution.shown) return null;
      return attribution.x + attribution.w <= scale.x + 1 && near(attribution.y + attribution.h, bottom)
        ? null
        : `the attribution is at ${fmt(attribution)}, expected left of the scale ${fmt(scale)} on the same bottom line`;
    },
  },
  {
    name: 'map-chrome-hidden-during-new-game',
    scenes: NEW_GAME_SCENES,
    needs: ['#minimap-panel', '#terrain-legend', LEAFLET.zoom],
    run: (p, el) => {
      const shown = ['#minimap-panel', '#terrain-legend', LEAFLET.zoom].filter((selector) => el(selector).shown);
      return shown.length === 0 ? null : `shown on the new-game screen: ${shown.join(', ')}`;
    },
  },
]);

module.exports = { MAP_CHROME_CHECKS };
```

- [ ] **Step 19: Edit `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

The toast band check now works out the band's space from the panel, the legend, and the zoom buttons, including the narrow-map case, and runs on both the turn-resolved and Reports scenes.

1. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
 * The left edge of the toast band, measured from the map's left edge, in CSS pixels.
 *
 * Purpose: The band starts right of the minimap so a toast never covers it.
 * When to use: The toast band check.
 * Expected outcome: Matches `.map-toast-band` in `static/feedbackChrome.css`.
 * Exceptions: None.
 */
const TOAST_BAND_LEFT = 224;
```

Replace them with:

```js
 * The narrowest the toast band may be beside the minimap panel, in CSS pixels.
 *
 * Purpose: Below this width the band spans the top of the map instead, over the panel.
 * When to use: Only by `toastBandSpace`.
 * Expected outcome: Matches `TOAST_BAND_MIN_WIDTH` in `src/shared/mapChromePlacement.ts`.
 * Exceptions: None.
 */
const TOAST_BAND_MIN_WIDTH = 280;

/**
 * Works out where the toast band may sit, from the boxes of the chrome around it.
 *
 * Purpose: The band sits between the minimap panel (or the legend, when it is open beside the panel) and the zoom
 *   buttons, each 12 px away; on a map too narrow for that it spans the top of the map from the left inset.
 * When to use: The toast band check, with probed boxes in window coordinates.
 * Expected outcome: `{ left, right }`, the x range the band must fit in.
 * Exceptions: None.
 */
function toastBandSpace(map, panel, legend, zoom) {
  const legendBeside = legend.shown && legend.y < panel.y + panel.h;
  const left = (legendBeside ? legend.x + legend.w : panel.x + panel.w) + MAP_OVERLAY_INSET;
  const right = (zoom.shown ? zoom.x : map.x + map.w) - MAP_OVERLAY_INSET;
  return right - left >= TOAST_BAND_MIN_WIDTH ? { left, right } : { left: map.x + MAP_OVERLAY_INSET, right };
}
```

2. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
 * Purpose: The selection panel sits this far from the map's left and bottom edges.
 * When to use: The selection panel geometry check.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css`.
```

Replace them with:

```js
 * Purpose: The selection panel sits this far from the map's left and bottom edges, and the toast band this far from the
 *   map's top and from the chrome beside it.
 * When to use: The selection panel and toast band checks.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css` and `MAP_CHROME_INSET` in
 *   `src/shared/mapChromePlacement.ts`.
```

3. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
    scenes: [SCENES.turnResolved],
    needs: ['#canvas-container', '#map-toast-band', '#map-toast'],
```

Replace them with:

```js
    scenes: [SCENES.turnResolved, SCENES.reportsTab],
    needs: ['#canvas-container', '#map-toast-band', '#map-toast', '#minimap-panel', '#terrain-legend', '#main-map .leaflet-control-zoom'],
```

4. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      if (band.x < c.x + TOAST_BAND_LEFT - 1 || band.x + band.w > c.x + c.w - MAP_OVERLAY_INSET + 1) {
        return `the toast band is at ${fmt(band)}, outside the space right of the minimap on the map ${fmt(c)}`;
      }
      const centre = c.x + (TOAST_BAND_LEFT + c.w - MAP_OVERLAY_INSET) / 2;
```

Replace them with:

```js
      const space = toastBandSpace(c, el('#minimap-panel'), el('#terrain-legend'), el('#main-map .leaflet-control-zoom'));
      if (band.x < space.left - 1 || band.x + band.w > space.right + 1) {
        return `the toast band is at ${fmt(band)}, outside x=${Math.round(space.left)} to x=${Math.round(space.right)}`;
      }
      const centre = (space.left + space.right) / 2;
```

- [ ] **Step 20: Edit `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`**

The battle-beat Reports check no longer needs the beat to have fighting: a beat files a turn report only when the dice give it something to report, which made the old check fail now and then. Any turn report listed must still be tagged B1.

In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find these lines. Together they occur exactly once:

```js
    needs: ['#reports-list .console-report-turn'],
    run: (p, el) => {
      const turns = el('#reports-list .console-report-turn').allTexts;
      return turns.some((text) => text.startsWith('B1Turn report')) ? null : `no turn report is tagged B1: ${JSON.stringify(turns)}`;
```

Replace them with:

```js
    needs: ['#reports-list'],
    run: (p, el) => {
      // Reports are not kept across a restart, so every turn report listed here came from the beat just played. The
      // beat files one only when the dice give it fighting to report, so an empty list also passes.
      const tags = [...el('#reports-list').text.matchAll(/([TB]\d+)Turn report/g)].map((match) => match[1]);
      return tags.every((tag) => tag === 'B1') ? null : `the turn reports are tagged ${tags.join(', ')}, expected only B1`;
```

- [ ] **Step 21: Edit `scripts/ui-smoke/ui-smoke-map.cjs`**

A comment update that says the battle edit usually, not always, gives the first beat fighting.

In `scripts/ui-smoke/ui-smoke-map.cjs`, find these lines. Together they occur exactly once:

```js
 *   into the hex where the player has the most land units, so the battle's first beat almost always has fighting to
 *   report.
```

Replace them with:

```js
 *   into the hex where the player has the most land units, so the battle's first beat usually has fighting to report.
```

- [ ] **Step 22: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

Adds the map chrome checks to the run.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
const { SCENARIO_CHECKS } = require('./ui-smoke-scenario-checks.cjs');
```

Replace it with:

```js
const { SCENARIO_CHECKS } = require('./ui-smoke-scenario-checks.cjs');
const { MAP_CHROME_CHECKS } = require('./ui-smoke-map-chrome-checks.cjs');
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
 *   Checks of what the console's tabs show belong in `ui-smoke-console-checks.cjs`, and checks of the later scenes in
 *   `ui-smoke-scenario-checks.cjs`.
```

Replace them with:

```js
 *   Checks of what the console's tabs show belong in `ui-smoke-console-checks.cjs`, checks of the later scenes in
 *   `ui-smoke-scenario-checks.cjs`, and checks of the chrome on the map in `ui-smoke-map-chrome-checks.cjs`.
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
 * Every check the run applies: the frame's, then the console's, then the later scenarios'.
```

Replace it with:

```js
 * Every check the run applies: the frame's, then the console's, then the later scenarios', then the map chrome's.
```

4. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
const CHECKS = Object.freeze([...FRAME_CHECKS, ...CONSOLE_CHECKS, ...SCENARIO_CHECKS]);
```

Replace it with:

```js
const CHECKS = Object.freeze([...FRAME_CHECKS, ...CONSOLE_CHECKS, ...SCENARIO_CHECKS, ...MAP_CHROME_CHECKS]);
```

- [ ] **Step 23: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Records the Tech view and the open legend after the game-menu scenes, and the legend at the 800 × 600 minimum after the small-window scene.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
 * Runs the first session: a new match, the frame scenes, the console scenes, the small window, and one played turn.
```

Replace it with:

```js
 * Runs the first session: a new match, the frame scenes, the map views and the legend, the console scenes, the small
 * window, and one played turn.
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await recordScene(page, report, outDir, SCENES.gameMenuOutside);

  // Queue a one-hex march with the lone armor unit, then select it again from its row in the Orders tab.
```

Replace them with:

```js
  await recordScene(page, report, outDir, SCENES.gameMenuOutside);

  // Choose the Tech view and record it, then go back to Weather.
  await page.click('#map-mode-tech');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.mapTech);
  await page.click('#map-mode-weather');

  // Open the terrain legend beside the minimap panel and record it, then close it.
  await page.click('#map-legend-toggle');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.legendOpen);
  await page.click('#map-legend-toggle');

  // Queue a one-hex march with the lone armor unit, then select it again from its row in the Orders tab.
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  await dragSelectionPanelGrip(page, -380, 480);
```

Replace it with:

```js
  await dragSelectionPanelGrip(page, -380, 480);

  // At the minimum size the legend opens beside the minimap panel only if it fits, and under it otherwise. Close the
  // selection panel first so it cannot cover the legend.
  await page.click('#selection-panel-close');
  await page.click('#map-legend-toggle');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.legendSmallWindow);
  await page.click('#map-legend-toggle');
```

- [ ] **Step 24: Edit `doc/ux/minimap.md`**

Describes the minimap panel, its mode buttons, and the Tech view.

1. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
The loaded-map overview beside the main map.

## Purpose

Show where the main view sits in the loaded map once the player has zoomed in.

## Availability

Shown with the map in every mode where the map container is visible, except New game and Game over, where it is hidden. It shows again when that overlay closes. After a successful start it shows the new match. It does not accept pointer input. In Tactical annihilation, and while the tactical battles list is open, it stays visible and pointer input on the whole map container is off, which includes the minimap.

## Information Displayed

- An overview of the loaded map, the Mercator world in a global match and the region's hexes in a regional match, using the same basemap family as the main map.
- A rectangle for the main view when the main view covers less of the world than the overview. When the main view is wide enough, the rectangle is removed.
````

Replace them with:

````markdown
The minimap panel at the map's top-left: the loaded-map overview, and the column of map-mode buttons beside it.

## Purpose

Show where the main view sits in the loaded map once the player has zoomed in, and let the player choose the map's view and open the terrain legend.

## Availability

Shown with the map in every mode where the map container is visible, except New game and Game over, where the whole panel is hidden. It shows again when that overlay closes. After a successful start it shows the new match. The overview does not accept pointer input. In Tactical annihilation, and while the tactical battles list is open, the panel stays visible and pointer input on the whole map container is off, which includes the panel and its buttons.

## Information Displayed

- The panel sits 12 px in from the map's top-left corner, in the navy chrome. The overview is 200 × 200 px on the left; the mode column is 96 px wide on the right, with five 40 px buttons, each with an icon and a label.
- An overview of the loaded map, the Mercator world in a global match and the region's hexes in a regional match, using the same basemap family as the main map.
- A rectangle for the main view when the main view covers less of the world than the overview. When the main view is wide enough, the rectangle is removed.
- The mode buttons, top to bottom:
  - Weather: the map's normal view. Chosen when the app opens.
  - Tech: the view that holding T shows, kept on. On the world map, terrain fill is hidden, and each hex shows its code and its tech icon where one applies, as described in [map-surface.md](map-surface.md). A battle, the new-game preview, and the game-over screen keep their normal view; Tech applies again when they close.
  - Control and Production: disabled placeholders with the tip "<name> is not available in this version."
  - Legend: opens or closes the [terrain legend](terrain-legend.md).
- The chosen view, Weather or Tech, and Legend while the legend is open, read as pressed: a lighter row with a teal mark on its left edge.
````

2. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
- When the player clicks, drags, or uses the wheel on the minimap, nothing happens. Dragging, wheel zoom, double-click zoom, and keyboard on the minimap are off.

### Keyboard

- None.
````

Replace them with:

````markdown
- When the player clicks, drags, or uses the wheel on the overview, nothing happens. Dragging, wheel zoom, double-click zoom, and keyboard on the overview are off.
- When the player clicks Weather or Tech, the map switches to that view and the button reads as pressed. Clicking the view already chosen does nothing.
- When the player clicks Legend, the terrain legend opens, or closes if it is open.

### Keyboard

- Holding T shows the Tech view while the key is down, as described in [input-map.md](input-map.md). It does not change the chosen view.
````

3. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- Rectangle shown: the main view is zoomed in. The rectangle follows the main bounds.
````

Replace it with:

````markdown
- Rectangle shown: the main view is zoomed in. The rectangle follows the main bounds.
- Weather view or Tech view: chosen with the mode buttons. The choice lasts until the app closes, across turns, battles, and new matches. It is not saved.
````

4. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
- The minimap never zooms itself from the wheel.

## Strategic and Tactical Differences

In Strategic planning and Tactical planning the overview is the loaded map. During a battle the main view is the battle area, so the view rectangle shows where the battle is in that extent. In New game and Game over the overview is hidden.
````

Replace them with:

````markdown
- The minimap never zooms itself from the wheel.
- Exactly one of Weather and Tech reads as pressed.
- Choosing a view never changes the match, the selection, or queued orders.

## Strategic and Tactical Differences

In Strategic planning and Tactical planning the overview is the loaded map. During a battle the main view is the battle area, so the view rectangle shows where the battle is in that extent. The Tech view applies only on the world map, including its Resolution playback. In a battle, including a beat's playback, the mode buttons still work, and the map keeps its normal view until the player leaves the battle. In New game and Game over the panel is hidden.
````

5. In `doc/ux/minimap.md`, find this line. It occurs exactly once:

````markdown
- [input-map.md](input-map.md)
````

Replace it with:

````markdown
- [input-map.md](input-map.md)
- [terrain-legend.md](terrain-legend.md)
````

6. In `doc/ux/minimap.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#minimap`)
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/map/mapExtent.ts`
````

Replace them with:

````markdown
- `static/index.html` (`#minimap-panel`, `#minimap`, `#map-mode-column`)
- `static/shellChrome.css` (`.minimap-panel`, `.map-mode-btn`)
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/map/mapExtent.ts`
- `src/renderer/map/mapModeColumn.ts`
- `src/renderer/map/mapViewModeState.ts`
- `src/shared/mapViewMode.ts` (`isTerrainInspectionShown`)
- `src/renderer/gameplay/productionOverlayHelpers.ts` (`isMapInspectionModeHeld`)
````

- [ ] **Step 25: Edit `doc/ux/terrain-legend.md`**

The legend is a popover now: closed by default, opened beside or under the panel.

1. In `doc/ux/terrain-legend.md`, find these lines. Together they occur exactly once:

````markdown
Shown with the map. It stays available in Strategic planning and Tactical planning. It is hidden in New game and Game over, and shown again when that overlay closes. In Tactical annihilation, and while the tactical battles list is open, it stays visible and pointer input on the map container is off, so the style dropdown cannot be used.

## Information Displayed

- A terrain style dropdown, left-aligned, with no label beside it. The choices are Default, Atlas, Wargame, and Scientific. The key is only as wide as that dropdown and the rows under it. Its tip is in [control-tooltips.md](control-tooltips.md).
````

Replace them with:

````markdown
Closed until the player clicks Legend in the [minimap panel](minimap.md), and closed again by the next click. Whether it is open lasts until the app closes; it is not saved. While open it stays available in Strategic planning and Tactical planning. It is hidden in New game and Game over, and shown again when that overlay closes if it was open. In Tactical annihilation, and while the tactical battles list is open, it stays visible and pointer input on the map container is off, so the style dropdown cannot be used.

## Information Displayed

- The legend opens 8 px right of the minimap panel, level with the panel's top. When the map is too narrow for it there, with 12 px to spare at the map's right edge, it opens at the map's left inset, 8 px under the panel instead (`legendPopoverPosition` in `src/shared/mapChromePlacement.ts`). It moves when the map changes size.
- A terrain style dropdown, left-aligned, with no label beside it. The choices are Default, Atlas, Wargame, and Scientific. The key is only as wide as that dropdown and the rows under it. Its tip is in [control-tooltips.md](control-tooltips.md).
````

2. In `doc/ux/terrain-legend.md`, find these lines. Together they occur exactly once:

````markdown
- None.

## States

- Interactive: the map container accepts pointer input, and the dropdown can change style.
````

Replace them with:

````markdown
- When the player clicks Legend in the minimap panel, the legend opens, or closes if it is open.

## States

- Closed: the default. Legend in the minimap panel does not read as pressed.
- Interactive: open, the map container accepts pointer input, and the dropdown can change style.
````

3. In `doc/ux/terrain-legend.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#terrain-legend`)
````

Replace it with:

````markdown
- `static/index.html` (`#terrain-legend`, `#map-legend-toggle`)
- `src/renderer/map/mapModeColumn.ts`
- `src/renderer/map/mapChromeLayout.ts`
- `src/shared/mapChromePlacement.ts`
````

- [ ] **Step 26: Edit `doc/ux/map-surface.md`**

Places the zoom buttons and the scale, adds the Tech view beside held T, and names the code behind both.

1. In `doc/ux/map-surface.md`, find these lines. Together they occur exactly once:

````markdown
- A scale in metric and imperial units.
- Terrain fill, unless the player is holding T. While the new-game overlay is open, that fill follows [new-game-dialog.md](new-game-dialog.md). See [input-map.md](input-map.md).
- While T is held on the strategic map, and the view is not at battle-detail zoom, each visible world hex shows its code and a production label. The label is the dollars-per-turn line, or the build marker when that marker is already showing.
- On the strategic map, outside a battle and outside battle-detail zoom, one icon sits on the band above the hex center, whether or not that hex is showing a production label. While T is not held, the icon is that hex's weather, when the weather bonus is on and the hex has weather. Fog of war leaves an unexplored hex without that icon. While T is held, the weather icon is hidden, and the icon is that hex's tech tier when the tech bonus is on and the hex's original urban count can produce units. Fog of war does not hide the tech icon. A hex that does not qualify shows no icon during the hold. The two icons are the same size, one and a half times the height of that hex's production text. That height is the shorter production text when the hex shows a build button, an airport or seaport glyph, or a unit, and the plain height otherwise, including a hex that is not showing the text. The icon is centered. The glyphs match the Tech and Weather icons in the [hex tooltip](hex-tooltips.md). These icons have no tooltip of their own. The hex tooltip still appears on hover.
- Overlays from [map-overlays.md](map-overlays.md).

When no match is loaded, the basemap can still be visible under the new-game overlay. While that overlay is open, the canvas draws the dialog's map preview instead of the loaded match, as in [new-game-dialog.md](new-game-dialog.md). Units, hex codes, production labels, build markers, battle-entry markers, road and rail lines, and other match chrome stay hidden. The minimap, the terrain legend, and the map's + and − zoom control are hidden. Opening the overlay frames the main view. On Global that frame is one zoom level closer than the world fit. Changing a home does not move it. Changing the tab or the regional region does. Fog of war does not hide the preview icons. Holding T draws the global preview's strategic hex grid, hides the weather icons, and does not show hex codes or production labels. Releasing T hides that global grid and leaves the home regions drawn. A regional preview keeps its hex grid. While Tech bonus is Low or High, that hold shows the previewed map's tech icons on every strategic hex that can produce units. Basic and Advanced use that map's Advanced threshold. Off hides them. Battle-detail zoom of that map's strategic hexes hides both icons.
````

Replace them with:

````markdown
- The + and − zoom buttons at the map's top-right, and a scale in metric and imperial units beside the map attribution at its bottom-right, each 12 px in from the map's edges. A zoom button is dimmed while the map cannot zoom further that way.
- Terrain fill, unless the inspection view is on: while the player holds T, and on the world map while the Tech view is chosen in the [minimap panel](minimap.md). While the new-game overlay is open, that fill follows [new-game-dialog.md](new-game-dialog.md). See [input-map.md](input-map.md).
- While T is held or the Tech view is chosen on the strategic map, and the view is not at battle-detail zoom, each visible world hex shows its code and a production label. The label is the dollars-per-turn line, or the build marker when that marker is already showing.
- On the strategic map, outside a battle and outside battle-detail zoom, one icon sits on the band above the hex center, whether or not that hex is showing a production label. While the inspection view is off, the icon is that hex's weather, when the weather bonus is on and the hex has weather. Fog of war leaves an unexplored hex without that icon. While T is held or the Tech view is chosen, the weather icon is hidden, and the icon is that hex's tech tier when the tech bonus is on and the hex's original urban count can produce units. Fog of war does not hide the tech icon. A hex that does not qualify shows no icon during the hold. The two icons are the same size, one and a half times the height of that hex's production text. That height is the shorter production text when the hex shows a build button, an airport or seaport glyph, or a unit, and the plain height otherwise, including a hex that is not showing the text. The icon is centered. The glyphs match the Tech and Weather icons in the [hex tooltip](hex-tooltips.md). These icons have no tooltip of their own. The hex tooltip still appears on hover.
- Overlays from [map-overlays.md](map-overlays.md).

When no match is loaded, the basemap can still be visible under the new-game overlay. While that overlay is open, the canvas draws the dialog's map preview instead of the loaded match, as in [new-game-dialog.md](new-game-dialog.md). Units, hex codes, production labels, build markers, battle-entry markers, road and rail lines, and other match chrome stay hidden. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden. Opening the overlay frames the main view. On Global that frame is one zoom level closer than the world fit. Changing a home does not move it. Changing the tab or the regional region does. Fog of war does not hide the preview icons. Holding T draws the global preview's strategic hex grid, hides the weather icons, and does not show hex codes or production labels. Releasing T hides that global grid and leaves the home regions drawn. A regional preview keeps its hex grid. While Tech bonus is Low or High, that hold shows the previewed map's tech icons on every strategic hex that can produce units. Basic and Advanced use that map's Advanced threshold. Off hides them. Battle-detail zoom of that map's strategic hexes hides both icons.
````

2. In `doc/ux/map-surface.md`, find this line. It occurs exactly once:

````markdown
- When the player uses the wheel, the map zooms. Double-click does not zoom. While the new-game overlay is open, drag and the wheel reach the map only while that form is hidden, as in [new-game-dialog.md](new-game-dialog.md).
````

Replace it with:

````markdown
- When the player uses the wheel, or clicks + or −, the map zooms. Double-click does not zoom. While the new-game overlay is open, drag and the wheel reach the map only while that form is hidden, as in [new-game-dialog.md](new-game-dialog.md).
````

3. In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
- Terrain fill hidden: T is held.
````

Replace it with:

````markdown
- Terrain fill hidden: T is held, or the Tech view is chosen and the player is on the world map.
````

4. In `doc/ux/map-surface.md`, find this line. It occurs exactly once:

````markdown
| Held T | Hides terrain fill. Outside battle-detail zoom, shows hex codes, hides the weather icon, and shows the tech icon where it applies | Hides terrain fill |
````

Replace it with:

````markdown
| Held T | Hides terrain fill. Outside battle-detail zoom, shows hex codes, hides the weather icon, and shows the tech icon where it applies | Hides terrain fill |
| Tech view | The same as held T, until the player chooses Weather. No effect while the new-game or game-over overlay is open; Tech applies again when it closes | No effect; the battle keeps its normal view, and Tech applies again after the battle |
````

5. In `doc/ux/map-surface.md`, find this line. It occurs exactly once:

````markdown
- `src/renderer/map/worldLeafletMap.ts`
````

Replace it with:

````markdown
- `src/renderer/map/worldLeafletMap.ts`
- `static/shellChrome.css` (`#main-map .leaflet-control-zoom`)
````

6. In `doc/ux/map-surface.md`, find this line. It occurs exactly once:

````markdown
- `src/shared/inspectionStatusIconLine.ts`
````

Replace it with:

````markdown
- `src/shared/inspectionStatusIconLine.ts`
- `src/renderer/gameplay/productionOverlayHelpers.ts` (`isMapInspectionModeHeld`)
- `src/shared/mapViewMode.ts` (`isTerrainInspectionShown`)
````

- [ ] **Step 27: Edit `doc/ux/input-map.md`**

Adds the mode buttons and the zoom buttons, and how T and the Tech view combine.

1. In `doc/ux/input-map.md`, find this line. It occurs exactly once:

````markdown
| Click, drag, wheel, double-click | Minimap | No pan, zoom, or click-to-recenter. The minimap only shows the current view. | [minimap.md](minimap.md) |
````

Replace it with:

````markdown
| Click, drag, wheel, double-click | Minimap | No pan, zoom, or click-to-recenter. The minimap only shows the current view. | [minimap.md](minimap.md) |
| Click | Map mode buttons beside the minimap | Weather or Tech chooses the map view. Legend opens or closes the terrain legend. | [minimap.md](minimap.md) |
| Click | Zoom buttons at the map's top-right | Zooms the map in or out. | [map-surface.md](map-surface.md) |
````

2. In `doc/ux/input-map.md`, find this text. It occurs exactly once:

````markdown
Terrain fill stays hidden while the key is down.
````

Replace it with:

````markdown
While the Tech view is chosen in the [minimap panel](minimap.md), the world map already shows that view, so holding T there changes nothing; in a battle, or under the new-game or game-over overlay, T works as below. Window blur releases the key but keeps the Tech view. Terrain fill stays hidden while the key is down.
````

- [ ] **Step 28: Edit `doc/ux/modes-and-transitions.md`**

The new-game and game-over overlays hide the whole minimap panel.

1. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
The minimap, the terrain legend, and the map's + and − zoom control are hidden.
````

Replace it with:

````markdown
The minimap panel, the terrain legend, and the map's + and − zoom control are hidden.
````

2. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
The dialog, the missing veil, and the hidden minimap, legend, and + and − zoom control match New game.
````

Replace it with:

````markdown
The dialog, the missing veil, and the hidden minimap panel, legend, and + and − zoom control match New game.
````

- [ ] **Step 29: Edit `doc/ux/new-game-dialog.md`**

The overlay hides the whole minimap panel.

In `doc/ux/new-game-dialog.md`, find this text. It occurs exactly once:

````markdown
The minimap, the terrain legend, and the map's + and − zoom control are hidden until the overlay closes.
````

Replace it with:

````markdown
The minimap panel, the terrain legend, and the map's + and − zoom control are hidden until the overlay closes.
````

- [ ] **Step 30: Edit `doc/ux/notifications-and-feedback.md`**

The toast band's new placement rule, and the code that applies it.

1. In `doc/ux/notifications-and-feedback.md`, find this text. It occurs exactly once:

````markdown
The band is centred in the space from 224 px right of the map's left edge, clear of the minimap, to 12 px short of the map's right edge.
````

Replace it with:

````markdown
The band is centred in the space between the minimap panel and the zoom buttons, 12 px from each. While the terrain legend is open beside the panel, the space starts 12 px right of the legend instead. When that space is narrower than 280 px, as at the 800 × 600 minimum window, the band is centred between the map's left inset and the zoom buttons, and covers the panel while a toast shows (`toastBandSpan` in `src/shared/mapChromePlacement.ts`).
````

2. In `doc/ux/notifications-and-feedback.md`, find this line. It occurs exactly once:

````markdown
- `src/renderer/map/worldLeafletMap.ts`
````

Replace it with:

````markdown
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/map/mapChromeLayout.ts` (`layoutMapChrome`)
- `src/shared/mapChromePlacement.ts` (`toastBandSpan`)
````

- [ ] **Step 31: Edit `doc/ux/control-tooltips.md`**

Adds the new tips, the two placeholders, and the zoom buttons among the controls with no tip.

1. In `doc/ux/control-tooltips.md`, find these lines. Together they occur exactly once:

````markdown
- Settings, Help, Load game, How to play, Build, Forces, and Replay: "<name> is not available in this version.", for example "Settings is not available in this version."
- Collapse the console: Hide the console to widen the map. Click a tab to show it again.
- Selection panel close: Clear the selection. Queued orders stay.
- Selection panel grip: Drag to resize this panel. The size lasts until the app closes.
````

Replace them with:

````markdown
- Settings, Help, Load game, How to play, Build, Forces, Replay, and the Control and Production map modes: "<name> is not available in this version.", for example "Settings is not available in this version."
- Collapse the console: Hide the console to widen the map. Click a tab to show it again.
- Selection panel close: Clear the selection. Queued orders stay.
- Selection panel grip: Drag to resize this panel. The size lasts until the app closes.
- Weather map mode: Show the map as usual: terrain, and each hex's weather while the weather bonus is on.
- Tech map mode: Show each hex's code, production, and tech tier instead of terrain on the world map, until you choose Weather. Holding T shows the same view while the key is down.
- Legend: Show or hide the terrain legend and its style choice.
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- The model dropdown. It uses the model description tooltip.
````

Replace it with:

````markdown
- The model dropdown. It uses the model description tooltip.
- The map's + and − zoom buttons. They keep the map library's own "Zoom in" and "Zoom out" titles.
````

- [ ] **Step 32: Edit `doc/ux-specification.md`**

Renames the minimap rows, marks the panel as changed during Resolution playback, where a battle keeps its normal view, and names the new smoke check file.

1. In `doc/ux-specification.md`, find this text. It occurs exactly once:

````markdown
The frame's checks are in `scripts/ui-smoke/ui-smoke-checks.cjs`, the console's are in `scripts/ui-smoke/ui-smoke-console-checks.cjs`, and the checks for the later scenarios (the small window, the reopened match, the battle, the regional match, and the finished match) are in `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`; add one to the matching file when a layout rule needs a machine check.
````

Replace it with:

````markdown
The frame's checks are in `scripts/ui-smoke/ui-smoke-checks.cjs`, the console's are in `scripts/ui-smoke/ui-smoke-console-checks.cjs`, the checks for the later scenarios (the small window, the reopened match, the battle, the regional match, and the finished match) are in `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, and the checks of the minimap panel, the legend, and Leaflet's controls are in `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`; add one to the matching file when a layout rule needs a machine check.
````

2. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| The minimap | [map-surface.md](ux/map-surface.md) | [minimap.md](ux/minimap.md) |
````

Replace it with:

````markdown
| The minimap panel or its map-mode buttons | [map-surface.md](ux/map-surface.md) | [minimap.md](ux/minimap.md) |
````

3. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [minimap.md](ux/minimap.md): the world overview and how it relates to the main map view.
````

Replace it with:

````markdown
- [minimap.md](ux/minimap.md): the minimap panel: the world overview, how it relates to the main map view, and the map-mode buttons beside it.
````

4. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| Minimap | Hidden | Shown | Disabled | Shown | Shown | Disabled | Hidden |
````

Replace it with:

````markdown
| Minimap panel | Hidden | Shown | Disabled | Changed | Changed | Disabled | Hidden |
````

- [ ] **Step 33: Edit `doc/ui-style-guide.md`**

Describes the minimap panel and the map controls, and names the panel among the chrome the new-game overlay hides.

1. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
- **Minimap:** Implemented. Small Leaflet overview with a viewport rectangle. Same terrain coloring at low detail. Corner placement.
````

Replace it with:

````markdown
- **Minimap:** Implemented. Small Leaflet overview with a viewport rectangle, in a navy panel at the map's top-left with a 96 px column of map-mode buttons (Weather, Tech, Control, Production, Legend). A chosen mode gets the console's selected-tab mark: a lighter row with a teal left edge. The terrain legend opens as a panel beside it. Leaflet's zoom buttons use the navy chrome at the map's top-right, with a button dimmed at the zoom limit; the scale and attribution sit at its bottom-right.
````

2. In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
The minimap, the terrain legend, and the map's + and − zoom control are hidden while it is open.
````

Replace it with:

````markdown
The minimap panel, the terrain legend, and the map's + and − zoom control are hidden while it is open.
````

- [ ] **Step 34: Edit `doc/how-to-play.md`**

Points to the Tech button beside the minimap.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Seeing them:** the flag tooltip lists a unit's bonuses. A hex tooltip shows that hex's weather and terrain effects. Hold T to see each hex's tech tier.
````

Replace it with:

````markdown
- **Seeing them:** the flag tooltip lists a unit's bonuses. A hex tooltip shows that hex's weather and terrain effects. Choose **Tech** beside the minimap, or hold T, to see each hex's tech tier.
````

## Verify

- [ ] **Step 35: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 36: Full tests**

Run the full tests. Expected: exit 0, test total **879**, failure total **0**.

- [ ] **Step 37: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/mapViewMode.ts src/shared/mapViewMode.test.ts src/shared/mapChromePlacement.ts src/shared/mapChromePlacement.test.ts src/renderer/map/mapViewModeState.ts src/renderer/map/mapChromeLayout.ts src/renderer/map/mapModeColumn.ts src/renderer/gameplay/productionOverlayHelpers.ts src/renderer/map/initCore.ts src/renderer/map/worldLeafletMap.ts src/renderer/core/uiState.ts src/renderer/chrome/frameTooltipText.ts static/index.html static/shellChrome.css static/feedbackChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs scripts/ui-smoke/ui-smoke-console-checks.cjs scripts/ui-smoke/ui-smoke-scenario-checks.cjs scripts/ui-smoke/ui-smoke-map.cjs scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/minimap.md doc/ux/terrain-legend.md doc/ux/map-surface.md doc/ux/input-map.md doc/ux/modes-and-transitions.md doc/ux/new-game-dialog.md doc/ux/notifications-and-feedback.md doc/ux/control-tooltips.md doc/ux-specification.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/mapViewMode.ts` | `0dce56f4d3915fba` |
| `src/shared/mapViewMode.test.ts` | `04ea282d97d5495f` |
| `src/shared/mapChromePlacement.ts` | `96a270d9a97a85d8` |
| `src/shared/mapChromePlacement.test.ts` | `404a19077d079012` |
| `src/renderer/map/mapViewModeState.ts` | `6920f53905abddd8` |
| `src/renderer/map/mapChromeLayout.ts` | `38e799ffaa1d10eb` |
| `src/renderer/map/mapModeColumn.ts` | `48217acaee20329e` |
| `src/renderer/gameplay/productionOverlayHelpers.ts` | `083f01f1fbf8bd26` |
| `src/renderer/map/initCore.ts` | `b9c7575fc94945e4` |
| `src/renderer/map/worldLeafletMap.ts` | `4b31787c06db7874` |
| `src/renderer/core/uiState.ts` | `949fc29a754a4a2a` |
| `src/renderer/chrome/frameTooltipText.ts` | `cb2582a955975b46` |
| `static/index.html` | `45c157034cff20e1` |
| `static/shellChrome.css` | `2a9d8b1b35c9d52d` |
| `static/feedbackChrome.css` | `d3db1b54e18fd422` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `bb6ea0fe33971c52` |
| `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs` | `ed89c2ece4ed1a5b` |
| `scripts/ui-smoke/ui-smoke-console-checks.cjs` | `d86fb07272ea643f` |
| `scripts/ui-smoke/ui-smoke-scenario-checks.cjs` | `58ba3618d6d1ace1` |
| `scripts/ui-smoke/ui-smoke-map.cjs` | `66b26f62d744b6c9` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `e10b587efaf0a64d` |
| `scripts/ui-smoke/ui-smoke.cjs` | `04b706fa9f9e794e` |
| `doc/ux/minimap.md` | `f6efc3391011525a` |
| `doc/ux/terrain-legend.md` | `51df02b270094b36` |
| `doc/ux/map-surface.md` | `4c5b6733d9f41a63` |
| `doc/ux/input-map.md` | `c8bf0af36bb9724f` |
| `doc/ux/modes-and-transitions.md` | `4814b64148b2f523` |
| `doc/ux/new-game-dialog.md` | `64f5cb698e021758` |
| `doc/ux/notifications-and-feedback.md` | `956291981789c4ea` |
| `doc/ux/control-tooltips.md` | `93d87ea081e126df` |
| `doc/ux-specification.md` | `3a67af3d5a89f8f4` |
| `doc/ui-style-guide.md` | `204be012361a1203` |
| `doc/how-to-play.md` | `3a51df2c23b1517d` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 38: Smoke run**

```powershell
npm run ui:smoke -- --label minimap-panel
```

Expected summary line:

```text
ui-smoke minimap-panel: 352 passed, 0 failed, 0 page errors, 32 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\minimap-panel
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/minimap-panel/report.json`.

- [ ] **Step 39: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/minimap-panel/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The played turn depends on the dice, so the scenes after it can differ in their losses, readouts, and toast text.

- `02-strategic-1280x720.png` against [ui-facelift-map-1-expected-strategic.png](ui-facelift-map-1-expected-strategic.png): the minimap panel at the map's top-left: the overview, then the column of Weather (pressed), Tech, Control and Production (dimmed), and Legend. The zoom buttons sit at the map's top-right, and the attribution and the scale at its bottom-right. The expected image's tile toast sits between the panel and the zoom buttons.
- `12-map-tech.png` against [ui-facelift-map-1-expected-tech.png](ui-facelift-map-1-expected-tech.png): Tech pressed. The terrain fill is gone, and each hex shows its code and production, with a tech icon where one applies.
- `13-legend-open.png` against [ui-facelift-map-1-expected-legend.png](ui-facelift-map-1-expected-legend.png): Weather and Legend pressed, and the legend open beside the panel, level with its top.
- `21-legend-small-window.png` against [ui-facelift-map-1-expected-legend-small-window.png](ui-facelift-map-1-expected-legend-small-window.png): the 800 × 600 window with the console expanded and a march queued. The legend still fits beside the panel.
- `22-turn-resolved.png` against [ui-facelift-map-1-expected-toast-small-window.png](ui-facelift-map-1-expected-toast-small-window.png): the same window after the turn. The turn's toast runs from the map's left inset to the zoom buttons, over the panel.
- `23-reports-tab.png` against [ui-facelift-map-1-expected-toast.png](ui-facelift-map-1-expected-toast.png): the 1280 × 720 window with Reports open. The turn's toast sits between the panel and the zoom buttons.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 36.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 39.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With your own match, click Tech: terrain fill hides, and each world hex shows its code and, where it applies, its tech icon. Click Weather: the map returns to normal. Hold T under Weather: the same view shows while the key is down. Choose Tech and hold T: nothing changes.
2. Choose Tech, then enter a battle from a tactical entry marker: the battle shows its normal terrain, and Tech still reads as pressed. Exit the battle: the world map shows the Tech view again.
3. Choose Tech, then New game… in the game menu: the preview behind the overlay shows its normal view. Start the match: the Tech view is back. On a finished match the game-over screen does the same: the map keeps its normal view while that overlay is open.
4. Click Legend: the legend opens beside the panel; click it again: it closes. Change the terrain style in it: the map follows, as before.
5. Point at Weather and at Tech: each tip describes its view. Point at Control and at Production: each tip says it is not available in this version.
6. Zoom with + and −: the map zooms, and at the zoom limit that button dims. Collapse the console and expand it again: the zoom buttons, scale, and attribution follow the map's right edge, and the open legend and the toasts stay clear of the panel.
7. Shrink the window to its 800 × 600 minimum with the console expanded, open the legend, and play a turn: the legend stays on the map, and the turn's toast runs from the map's left edge to the zoom buttons, over the panel.

## Next

Plan 2 gives every order line a pale casing, and ranged and air-strike lines the movement arrowhead.
