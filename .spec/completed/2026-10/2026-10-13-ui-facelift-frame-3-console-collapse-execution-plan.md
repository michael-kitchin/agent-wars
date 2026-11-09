# UI Facelift Frame, Plan 3 of 5: Console Collapse and Live Map Resize

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Let the console collapse to its tab rail and expand again, and make the map, its canvas, and Leaflet follow every change in the map container's size, not only window resizes.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 3 of the five that build the spec's Phase 2; [ui-facelift-frame-execution-plan.md](ui-facelift-frame-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- A collapse button in the console header. Clicking the active tab also collapses; clicking any tab while collapsed expands on that tab. Collapsing lasts for the app session only.
- A shared watcher, `src/renderer/map/mapContainerResize.ts`, that resizes the map on the next animation frame after its container changes size. The tactical battles dialog's frame now uses the same watcher.
- The smoke harness gains the collapse scenes, and `doc/` describes collapsing.

**Out of scope:**

- The top-bar readouts (plan 4) and the game menu (plan 5).

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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Frame and Console (the Collapse list).
2. `doc/ux/right-panel.md` and `doc/ux/tactical-battles-list.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then:

```powershell
Test-Path src/renderer/chrome/consoleFrame.ts
Test-Path src/renderer/map/mapContainerResize.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **834**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files:

- `doc/ux-specification.md`
- `doc/ux/ai-activity-log.md`
- `doc/ux/control-tooltips.md`
- `doc/ux/right-panel-command-bar.md`
- `doc/ux/right-panel-selection-and-orders.md`
- `doc/ux/right-panel.md`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/map/mapContainerResize.ts`
- `src/renderer/map/visibleMapFrame.ts`
- `src/shared/consoleTabState.test.ts`
- `src/shared/consoleTabState.ts`
- `static/frameChrome.css`
- `static/index.html`

- [ ] **Step 1: Create `src/shared/consoleTabState.ts`**

The tab-click rules as a pure function: clicking the active tab collapses the console, and any click while collapsed expands it on the clicked tab.

Create `src/shared/consoleTabState.ts` with exactly this content:

```ts
/**
 * Which console tab is active and whether the console is collapsed to its rail.
 *
 * Purpose: The tab-click rules are small but easy to get wrong; a pure function keeps them testable.
 * When to use: Held by the renderer's console module and passed to `nextConsoleTabState`.
 * Expected outcome: Exactly one tab is active at all times, including while collapsed.
 * Exceptions: None.
 */
export interface ConsoleTabState {
  /**
   * Id of the active tab button.
   *
   * Contract: Always one of the console's enabled tab ids.
   * When to use: Selecting the panel to show.
   * Expected outcome: Stays set while the console is collapsed.
   * Exceptions: None.
   */
  readonly activeTabId: string;
  /**
   * Whether only the rail and the footer are shown.
   *
   * Contract: The console starts expanded.
   * When to use: Writing the console's `data-collapsed` attribute.
   * Expected outcome: True hides the content column.
   * Exceptions: None.
   */
  readonly collapsed: boolean;
}

/**
 * Applies one click on a console tab.
 *
 * Purpose: A click on the active tab of an expanded console collapses it; any click on a collapsed console expands it.
 * When to use: From the rail's click handler, with the clicked tab's id.
 * Expected outcome: Collapsed: expand on the clicked tab. Expanded and the active tab clicked: collapse.
 *   Expanded and another tab clicked: switch to that tab.
 * Exceptions: None.
 */
export function nextConsoleTabState(current: ConsoleTabState, clickedTabId: string): ConsoleTabState {
  if (current.collapsed) return { activeTabId: clickedTabId, collapsed: false };
  if (clickedTabId === current.activeTabId) return { activeTabId: current.activeTabId, collapsed: true };
  return { activeTabId: clickedTabId, collapsed: false };
}
```

- [ ] **Step 2: Create `src/shared/consoleTabState.test.ts`**

Covers switching, collapsing, and expanding.

Create `src/shared/consoleTabState.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextConsoleTabState } from './consoleTabState';

test('nextConsoleTabState switches tabs while expanded', () => {
  assert.deepEqual(nextConsoleTabState({ activeTabId: 'orders', collapsed: false }, 'opponent'), {
    activeTabId: 'opponent',
    collapsed: false,
  });
});

test('nextConsoleTabState collapses when the active tab is clicked', () => {
  assert.deepEqual(nextConsoleTabState({ activeTabId: 'orders', collapsed: false }, 'orders'), {
    activeTabId: 'orders',
    collapsed: true,
  });
});

test('nextConsoleTabState expands on the clicked tab while collapsed', () => {
  assert.deepEqual(nextConsoleTabState({ activeTabId: 'orders', collapsed: true }, 'opponent'), {
    activeTabId: 'opponent',
    collapsed: false,
  });
  assert.deepEqual(nextConsoleTabState({ activeTabId: 'orders', collapsed: true }, 'orders'), {
    activeTabId: 'orders',
    collapsed: false,
  });
});
```

- [ ] **Step 3: Replace `src/renderer/chrome/consoleFrame.ts`**

Adds collapsing. Compared with the previous version, the file imports `nextConsoleTabState`, keeps a collapsed flag, writes `data-collapsed` and the collapse button's `aria-expanded`, runs the tab's `onShow` only while expanded, and wires the collapse button.

Replace the whole file `src/renderer/chrome/consoleFrame.ts` with exactly this content:

```ts
/**
 * The console docked on the right: its tab rail, its title, and collapsing it to the rail.
 *
 * The console root keeps the id `sidebar` so existing lookups keep working.
 */
import { nextConsoleTabState, type ConsoleTabState } from '../../shared/consoleTabState';
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
 * The console's current tab and collapsed state for this app session.
 *
 * Purpose: Collapsing and the tab choice are per-session view choices; they are not saved.
 * When to use: Read and replaced only inside this module.
 * Expected outcome: Starts expanded on the first tab.
 * Exceptions: None.
 */
let consoleState: ConsoleTabState = { activeTabId: CONSOLE_TABS[0].tabId, collapsed: false };

/**
 * Writes `consoleState` to the page.
 *
 * Purpose: The rail, the panels, the title, the collapse attribute, and the collapse button change together.
 * When to use: After every change to `consoleState`, and once at startup.
 * Expected outcome: The active panel shows, the others hide, the title matches, and `#sidebar` carries
 *   `data-collapsed="true"` or `"false"`. While expanded, the active tab's `onShow` runs. The map resizes on its
 *   own through its resize observer.
 * Exceptions: None; missing elements are skipped.
 */
function applyConsoleState(): void {
  selectTabPanel(consoleState.activeTabId, CONSOLE_TABS);
  const active = CONSOLE_TABS.find((tab) => tab.tabId === consoleState.activeTabId);
  const title = document.getElementById('console-title');
  if (title && active) title.textContent = active.title;
  document.getElementById('sidebar')?.setAttribute('data-collapsed', consoleState.collapsed ? 'true' : 'false');
  document.getElementById('console-collapse-btn')?.setAttribute('aria-expanded', consoleState.collapsed ? 'false' : 'true');
  if (!consoleState.collapsed) active?.onShow?.();
}

/**
 * Wires the rail's tabs and the collapse button.
 *
 * Purpose: One bootstrap for the console's own behavior.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: A tab click follows `nextConsoleTabState`. The collapse button collapses the console. The console
 *   starts expanded on Orders.
 * Exceptions: None; missing elements are skipped.
 */
export function wireConsoleFrame(): void {
  for (const tab of CONSOLE_TABS) {
    document.getElementById(tab.tabId)?.addEventListener('click', () => {
      consoleState = nextConsoleTabState(consoleState, tab.tabId);
      applyConsoleState();
    });
  }
  document.getElementById('console-collapse-btn')?.addEventListener('click', () => {
    consoleState = { activeTabId: consoleState.activeTabId, collapsed: true };
    applyConsoleState();
  });
  applyConsoleState();
}
```

- [ ] **Step 4: Edit `src/renderer/chrome/frameTooltipText.ts`**

Adds the collapse button's tip.

In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
  return `${name} is not available in this version.`;
}
```

Replace them with:

```ts
  return `${name} is not available in this version.`;
}

/**
 * Purpose: Says collapsing widens the map and how to bring the console back.
 * When to use: `#console-collapse-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const collapseConsoleTooltipText = 'Hide the console to widen the map. Click a tab to show it again.';
```

- [ ] **Step 5: Create `src/renderer/map/mapContainerResize.ts`**

Today the map resizes only on a window resize. Collapsing the console changes the map's width without one, so this module watches the map container itself and batches notifications to one per animation frame.

Create `src/renderer/map/mapContainerResize.ts` with exactly this content:

```ts
/**
 * Watches the map container's size, so the map and anything aligned to it follow every size change, not only
 * window resizes.
 */

/**
 * Element id of the map area: under the top bar and beside the console.
 *
 * Purpose: Single source for the container that the map fills and that map-centered frames measure.
 * When to use: Looking up or measuring the visible map area.
 * Expected outcome: Matches the id in `static/index.html`.
 * Exceptions: None.
 */
export const MAP_CONTAINER_ID = 'canvas-container';

/**
 * Calls `onResize` once per animation frame after the map container or the window changes size.
 *
 * Purpose: Collapsing the console, opening the new-game overlay, and window resizes all change the map's size.
 *   Leaflet, the canvas overlay, and map-centered frames keep their old size until they are told.
 * When to use: Once per consumer, with the function that brings it up to date.
 * Expected outcome: `onResize` runs on the next animation frame after a container resize or a window `resize`
 *   event (which also covers a device-pixel-ratio change), at most once per frame. Returns a function that stops
 *   watching; calling it again does nothing.
 * Exceptions: None. Without `ResizeObserver` only window resizes are watched.
 */
export function observeMapContainerResize(onResize: () => void): () => void {
  let frameId = 0;
  /**
   * Schedules one `onResize` call for the next animation frame.
   *
   * Purpose: Several size notifications in one frame lead to one resize.
   * When to use: As the window `resize` listener and the `ResizeObserver` callback.
   * Expected outcome: At most one pending frame at a time.
   * Exceptions: None.
   */
  const schedule = (): void => {
    if (frameId !== 0) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      onResize();
    });
  };
  window.addEventListener('resize', schedule);
  const container = document.getElementById(MAP_CONTAINER_ID);
  const observer = container && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  if (container) observer?.observe(container);
  return () => {
    window.removeEventListener('resize', schedule);
    observer?.disconnect();
    if (frameId !== 0) window.cancelAnimationFrame(frameId);
    frameId = 0;
  };
}
```

- [ ] **Step 6: Edit `src/renderer/map/visibleMapFrame.ts`**

The tactical battles dialog already watched the map container. It now uses the shared watcher and the shared id instead of its own copies.

1. In `src/renderer/map/visibleMapFrame.ts`, find these lines. Together they occur exactly once:

```ts

/**
 * Element id of the map area that excludes the right-hand sidebar.
 *
 * Purpose: Single source for the container lookup used to size map-centered frames.
 * When to use: Only inside this module when measuring the visible map.
 * Expected outcome: Matches the id in `index.html` and `shellChrome.css`.
 * Exceptions: None.
 */
const MAP_CONTAINER_ID = 'canvas-container';
```

Replace them with:

```ts
import { MAP_CONTAINER_ID, observeMapContainerResize } from './mapContainerResize';
```

2. In `src/renderer/map/visibleMapFrame.ts`, find these lines. Together they occur exactly once:

```ts
 * Pins a fixed-position frame over the visible map area and keeps it there while the window resizes.
 *
 * Purpose: Centers modal panels on the map (not on the map plus the sidebar) without duplicating layout math.
 * When to use: After the frame is attached to the document; call the returned function when the frame is removed.
 * Expected outcome: The frame is sized immediately and re-sized on container and window resizes. The returned
 *   function stops all tracking and is safe to call more than once.
 * Exceptions: None. Falls back to covering the window when the map container is missing.
 */
export function attachFrameToVisibleMap(frame: HTMLElement): () => void {
  const sync = (): void => syncFrameToVisibleMap(frame);
  sync();
  const container = document.getElementById(MAP_CONTAINER_ID);
  const observer = container && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
  if (container) observer?.observe(container);
  window.addEventListener('resize', sync);
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    observer?.disconnect();
    window.removeEventListener('resize', sync);
  };
```

Replace them with:

```ts
 * Pins a fixed-position frame over the visible map area and keeps it there while the map's size changes.
 *
 * Purpose: Centers modal panels on the map (not on the map plus the console) without duplicating layout math.
 * When to use: After the frame is attached to the document; call the returned function when the frame is removed.
 * Expected outcome: The frame is sized immediately, then again on the next animation frame after the map container
 *   or the window resizes. The returned function stops all tracking and is safe to call more than once.
 * Exceptions: None. Falls back to covering the window when the map container is missing.
 */
export function attachFrameToVisibleMap(frame: HTMLElement): () => void {
  syncFrameToVisibleMap(frame);
  return observeMapContainerResize(() => syncFrameToVisibleMap(frame));
```

- [ ] **Step 7: Edit `src/renderer/map/initCore.ts`**

The map resizes through the watcher.

1. In `src/renderer/map/initCore.ts`, find this line. It occurs exactly once:

```ts
import { clearMapKeyboardPan, mapPanKeyDown, mapPanKeyUp } from './mapKeyboardPan';
```

Replace it with:

```ts
import { clearMapKeyboardPan, mapPanKeyDown, mapPanKeyUp } from './mapKeyboardPan';
import { observeMapContainerResize } from './mapContainerResize';
```

2. In `src/renderer/map/initCore.ts`, find these lines. Together they occur exactly once:

```ts
  window.addEventListener('resize', () => {
    deps.resizeAndRedraw();
  });
```

Replace them with:

```ts
  observeMapContainerResize(() => deps.resizeAndRedraw());
```

- [ ] **Step 8: Edit `static/index.html`**

Adds the collapse button and the console's starting `data-collapsed` value.

In `static/index.html`, find these lines. Together they occur exactly once:

```html
  <aside id="sidebar" class="console" aria-label="Console">
    <div id="console-main" class="console-main">
      <div class="console-header">
        <h2 id="console-title" class="console-title">Orders</h2>
```

Replace them with:

```html
  <aside id="sidebar" class="console" aria-label="Console" data-collapsed="false">
    <div id="console-main" class="console-main">
      <div class="console-header">
        <h2 id="console-title" class="console-title">Orders</h2>
        <button type="button" id="console-collapse-btn" class="console-collapse-btn" aria-label="Collapse the console" aria-controls="sidebar" aria-expanded="true" data-control-tooltip="Hide the console to widen the map. Click a tab to show it again."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5"></path></svg></button>
```

- [ ] **Step 9: Edit `static/frameChrome.css`**

Adds the collapse button's style and the collapsed layout.

1. In `static/frameChrome.css`, find this line. It occurs exactly once:

```css
/* Each grid cell draws its own left edge. */
```

Replace it with:

```css
/* Each grid cell draws its own left edge, so the edge beside the map stays visible when the content column hides. */
```

2. In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
  font-size: 15px;
  font-weight: 600;
}
```

Replace them with:

```css
  font-size: 15px;
  font-weight: 600;
}
.console-collapse-btn {
  flex: none;
  width: 28px;
  height: 28px;
  margin-left: auto;
  padding: 0;
  border: 1px solid var(--chrome-border);
  border-radius: 4px;
  background: transparent;
  color: var(--chrome-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.console-collapse-btn:hover {
  background: var(--chrome-bg-raised);
}
```

3. In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
  border-radius: 4px;
}
```

Replace them with:

```css
  border-radius: 4px;
}

/* ---------- Collapsed console ---------- */
/* Only the tab rail and a compact Ready stay; the map takes the freed width. */
#sidebar.console[data-collapsed="true"] {
  width: var(--console-rail-width);
  min-width: var(--console-rail-width);
  grid-template-columns: var(--console-rail-width);
  grid-template-areas:
    "rail"
    "footer";
}
#sidebar.console[data-collapsed="true"] .console-main {
  display: none;
}
#sidebar.console[data-collapsed="true"] .console-tab[aria-selected="true"] {
  background: transparent;
  color: var(--chrome-muted);
  box-shadow: none;
}
#sidebar.console[data-collapsed="true"] .console-footer {
  padding: 6px;
}
/* The "AI:" label and its timer are separate flex items, so wrapping puts them on two lines. */
#sidebar.console[data-collapsed="true"] #ready-btn {
  flex-wrap: wrap;
  align-content: center;
  height: 44px;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1.15;
  white-space: normal;
}
```

- [ ] **Step 10: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

Adds the collapsed and expanded-again scenes and their checks.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Scene names. Each check lists the scenes it applies to; the runner records one probe per scene.
```

Replace them with:

```js
/**
 * Width of the collapsed console in CSS pixels: the tab rail alone.
 *
 * Purpose: A collapsed console must give the rest of the width to the map.
 * When to use: The collapsed-console geometry check.
 * Expected outcome: Matches `--console-rail-width` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const CONSOLE_COLLAPSED_WIDTH = 56;

/**
 * Scene names. Each check lists the scenes it applies to; the runner records one probe per scene.
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
  opponentTab: 'opponent-tab',
```

Replace it with:

```js
  opponentTab: 'opponent-tab',
  consoleCollapsed: 'console-collapsed',
  consoleExpandedAgain: 'console-expanded-again',
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
    name: 'console-expanded-geometry',
    scenes: MATCH_SCENES,
```

Replace them with:

```js
    name: 'console-expanded-geometry',
    scenes: MATCH_SCENES.filter((scene) => scene !== SCENES.consoleCollapsed),
```

4. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
    name: 'orders-tab-shows-panel',
    scenes: [SCENES.strategic],
```

Replace them with:

```js
    name: 'orders-tab-shows-panel',
    scenes: [SCENES.strategic, SCENES.consoleExpandedAgain],
```

5. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
        : `the Ready tip is at ${fmt(t)}, outside the ${p.viewport.w}x${p.viewport.h} window`;
    },
  },
```

Replace them with:

```js
        : `the Ready tip is at ${fmt(t)}, outside the ${p.viewport.w}x${p.viewport.h} window`;
    },
  },
  {
    name: 'console-collapsed-geometry',
    scenes: [SCENES.consoleCollapsed],
    needs: ['#sidebar', '#console-main', '#ready-btn'],
    run: (p, el) => {
      const s = el('#sidebar');
      if (s.collapsed !== 'true') return `#sidebar data-collapsed is "${s.collapsed}"`;
      if (!(near(s.w, CONSOLE_COLLAPSED_WIDTH) && near(s.x + s.w, p.viewport.w))) {
        return `#sidebar is ${fmt(s)}, expected ${CONSOLE_COLLAPSED_WIDTH} wide on the right edge`;
      }
      if (el('#console-main').shown) return 'the console content column is still shown';
      return el('#ready-btn').shown ? null : 'Ready is not shown while collapsed';
    },
  },
  {
    name: 'console-expands-on-tab-click',
    scenes: [SCENES.consoleExpandedAgain],
    needs: ['#sidebar'],
    run: (p, el) => (el('#sidebar').collapsed === 'false' ? null : `#sidebar data-collapsed is "${el('#sidebar').collapsed}"`),
  },
```

- [ ] **Step 11: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Collapses the console, then expands it again from the Orders tab.

In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js

  await openNewGameOverlay(page);
```

Replace them with:

```js

  await page.click('#console-collapse-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.consoleCollapsed);
  await page.click('#console-tab-orders');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.consoleExpandedAgain);

  await openNewGameOverlay(page);
```

- [ ] **Step 12: Replace `doc/ux/right-panel.md`**

From here to the end, the steps update `doc/` in the same change. The right panel document now describes collapsing.

Replace the whole file `doc/ux/right-panel.md` with exactly this content:

````markdown
# Right Panel

The console docked on the right of the map. It holds the Orders tab, the Opponent tab, a tab rail, and a footer with Ready.

## Purpose

Keep orders, the opponent's model controls, and Ready in one place that stays usable during both theaters, and let the player fold it away to widen the map.

## Availability

Shown in Strategic planning, Tactical planning, Resolution playback, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list is open, the panel stays visible and does not receive pointer input. In Tactical annihilation, pointer input on the panel is off except the annihilation dialog, which is not part of this panel.

## Information Displayed

- A tab rail on the panel's outer edge, with Orders, Opponent, Build, and Forces. Build and Forces are disabled in this version. The selected tab is marked.
- A header with the selected tab's name and a button that collapses the panel.
- The Orders tab: the selected-unit readout, the Ranged and Strike controls, and the order lists. See [right-panel-command-bar.md](right-panel-command-bar.md) and [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
- The Opponent tab: the Tools tab and the Model tab, one shown at a time, with the AI activity log under them. See [right-panel-tools-tab.md](right-panel-tools-tab.md), [right-panel-model-tab.md](right-panel-model-tab.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer with Ready, under the tab content. See [right-panel-command-bar.md](right-panel-command-bar.md).
- While collapsed, only the tab rail and a smaller Ready show. While Ready reads "AI:" and a time, that label takes two lines.
- Control tips for the tabs and the collapse button are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks a tab other than the selected one, that tab's content shows and the header names it.
- When the player clicks the selected tab, the panel collapses to its rail.
- When the player clicks the collapse button, the panel collapses to its rail.
- When the player clicks any tab while the panel is collapsed, the panel expands on that tab.
- The map takes the width the panel gives up, and gives it back when the panel expands.
- Inside the Opponent tab, clicking Tools or Model shows that sub-tab. Turning Run on also selects the Tools sub-tab. See [right-panel-model-tab.md](right-panel-model-tab.md).

### Keyboard

- None for the panel as a whole. Fields inside a tab follow [input-map.md](input-map.md).

### Other

- The panel starts expanded on the Orders tab. Inside the Opponent tab, the Model sub-tab is selected first.
- Collapsing lasts until the app closes. It is not saved.

## States

- Expanded on Orders: the start state.
- Expanded on Opponent.
- Collapsed: only the rail and Ready show. The last selected tab is remembered.
- Absent: New game and Game over, including while the new-game form is hidden. The map fills the window.
- Pointer input off: the tactical battles list, and Tactical annihilation.

## Invariants

- The panel is never hidden just because a tactical battle is active.
- The panel is absent for the whole New game and Game over overlay, and present again as soon as that overlay closes.
- Exactly one tab's content shows while the panel is expanded.
- Ready is on screen whenever the panel is, expanded or collapsed.
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

- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
- `static/frameChrome.css`
- `src/renderer/chrome/consoleFrame.ts`
- `src/shared/consoleTabState.ts`
- `src/renderer/map/mapContainerResize.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
````

- [ ] **Step 13: Edit `doc/ux/right-panel-command-bar.md`**

In `doc/ux/right-panel-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
Ready shows whenever the right panel does. Ranged and the air-strike controls show while the Orders tab is selected. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the panel is absent, so these controls are absent with it. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The Ready button, across the width of the right panel's footer. Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running.
````

Replace them with:

````markdown
Ready shows whenever the right panel does. Ranged and the air-strike controls show while the Orders tab is selected and the panel is expanded. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the panel is absent, so these controls are absent with it. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The Ready button, across the width of the right panel's footer. Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running. While the right panel is collapsed, Ready narrows to the tab rail's width and the "AI:" label takes two lines.
````

- [ ] **Step 14: Edit `doc/ux/ai-activity-log.md`**

1. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
Shown on the right panel's Opponent tab, under the Tools and Model sub-tabs, whichever sub-tab is selected, in every mode where the panel is visible. While the tactical battles list is open, the log stays visible and does not receive pointer input. The log itself has no mode of its own. The log is absent in New game and Game over because the panel is absent.
````

Replace it with:

````markdown
Shown on the right panel's Opponent tab, under the Tools and Model sub-tabs, whichever sub-tab is selected, in every mode where the panel is visible and expanded. While the tactical battles list is open, the log stays visible while the panel is expanded and does not receive pointer input. The log itself has no mode of its own. The log is absent in New game and Game over because the panel is absent.
````

2. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
- A new line is appended at the end, and the log scrolls to that line while it is shown. Showing the Opponent tab scrolls the log to its newest line, so lines added while it was hidden are in view.
````

Replace it with:

````markdown
- A new line is appended at the end, and the log scrolls to that line while it is shown. Showing the Opponent tab, or expanding the panel on it, scrolls the log to its newest line, so lines added while it was hidden are in view.
````

- [ ] **Step 15: Edit `doc/ux/right-panel-selection-and-orders.md`**

In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
Shown on the right panel's Orders tab. The player can use the lists in Strategic planning and Tactical planning, and they follow the active theater. While the tactical battles list is open, the lists stay visible and do not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md). In New game and Game over the panel is absent, so these lists are absent with it.
````

Replace it with:

````markdown
Shown on the right panel's Orders tab while the panel is expanded. The player can use the lists in Strategic planning and Tactical planning, and they follow the active theater. While the tactical battles list is open, the lists stay visible while the panel is expanded and do not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md). In New game and Game over the panel is absent, so these lists are absent with it.
````

- [ ] **Step 16: Edit `doc/ux/control-tooltips.md`**

In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Settings, Help, Build, and Forces: "<name> is not available in this version.", for example "Settings is not available in this version."
````

Replace it with:

````markdown
- Settings, Help, Build, and Forces: "<name> is not available in this version.", for example "Settings is not available in this version."
- Collapse the console: Hide the console to widen the map. Click a tab to show it again.
````

- [ ] **Step 17: Edit `doc/ux-specification.md`**

1. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| The right panel as a whole or its tabs | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel.md](ux/right-panel.md) |
````

Replace it with:

````markdown
| The right panel as a whole, its tabs, or collapsing it | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel.md](ux/right-panel.md) |
````

2. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [right-panel.md](ux/right-panel.md): the console docked on the right: its tab rail and the footer that holds Ready.
````

Replace it with:

````markdown
- [right-panel.md](ux/right-panel.md): the console docked on the right: its tab rail, collapsing it, and the footer that holds Ready.
````

## Verify

- [ ] **Step 18: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 19: Full tests**

Run the full tests. Expected: exit 0, test total **837**, failure total **0**.

- [ ] **Step 20: Exact match**

This proves that every file this plan creates or edits, except the three named after the table, matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" doc/ux-specification.md doc/ux/control-tooltips.md doc/ux/right-panel-command-bar.md doc/ux/right-panel.md scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke.cjs src/renderer/chrome/consoleFrame.ts src/renderer/map/initCore.ts src/renderer/map/mapContainerResize.ts src/renderer/map/visibleMapFrame.ts src/shared/consoleTabState.test.ts src/shared/consoleTabState.ts static/frameChrome.css static/index.html
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `doc/ux-specification.md` | `daa8b22ff96a740d` |
| `doc/ux/control-tooltips.md` | `96b284de86955f92` |
| `doc/ux/right-panel-command-bar.md` | `8ea71a69aaa364c8` |
| `doc/ux/right-panel.md` | `c04632f084d39f60` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `f72230ed087e8a4e` |
| `scripts/ui-smoke/ui-smoke.cjs` | `3c9e4818925a53db` |
| `src/renderer/chrome/consoleFrame.ts` | `1d6d5f8d8258a103` |
| `src/renderer/map/initCore.ts` | `49a3c0fe082c1cb8` |
| `src/renderer/map/mapContainerResize.ts` | `50834c70a836855e` |
| `src/renderer/map/visibleMapFrame.ts` | `5123ce6df3b49b9f` |
| `src/shared/consoleTabState.test.ts` | `3a3c4cdb8202d10d` |
| `src/shared/consoleTabState.ts` | `ed5f99fea59db775` |
| `static/frameChrome.css` | `a379ace2148149c9` |
| `static/index.html` | `fe5a892d0c76bb44` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

Three files are left out of this check. Write them as this plan shows. Do not stop because they have no hash.

- `src/renderer/chrome/frameTooltipText.ts` still has the summary line added on `unavailableTooltipText` in the previous plan.
- `doc/ux/ai-activity-log.md` and `doc/ux/right-panel-selection-and-orders.md` now say the log and the order lists stay visible while the panel is expanded. Collapse hides that content, so the old "stays visible" wording was wrong.

- [ ] **Step 21: Smoke run**

```powershell
npm run ui:smoke -- --label console-collapse
```

Expected summary line. The recorded run used `F:\Projects\Personal\agent-wars-public`. Another checkout is fine when the counts match and the path ends in `.test\ui-smoke\console-collapse`.

```text
ui-smoke console-collapse: 80 passed, 0 failed, 0 page errors, 9 screenshots in <repository>\.test\ui-smoke\console-collapse
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/console-collapse/report.json`.

- [ ] **Step 22: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/console-collapse/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast.

- `07-console-collapsed.png` against [ui-facelift-frame-3-expected-collapsed.png](ui-facelift-frame-3-expected-collapsed.png): Only the rail and a small Ready remain on the right. The map reaches the rail with no blank strip, and hexes are drawn across the whole width. A blank strip, or hexes cut off at the old edge, means the resize did not reach the canvas: stop and report.
- `08-console-expanded-again.png` against [ui-facelift-frame-2-expected-strategic.png](ui-facelift-frame-2-expected-strategic.png): The console is back on Orders, as in that image, now with the collapse button at the right of its header.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 19.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 22.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. Click the collapse button: the map widens to the rail with no blank strip, and the map still pans and zooms. Click Orders: the console expands on Orders. Click Orders again: it collapses. Click Opponent while collapsed: it expands on Opponent.
2. With Run on and Ready reading "AI:", collapse the console: the small Ready shows "AI:" and the time on two lines.
3. If a turn offers the tactical battles list, open it once with the console expanded and once collapsed: the dialog is centered on the map area each time, and it follows the map when you resize the window.
4. Resize the window slowly: the map and its hexes follow without a blank strip.

Spec disagreements. Follow this plan. While the console is collapsed, the selected tab's accent and selected background are cleared. The layout spec keeps a 3 px accent on the selected tab's outer edge. Do not put that accent back.

## Next

Plan 4 adds the Production, Forces, Your home, and Enemy home readouts to the top bar.
