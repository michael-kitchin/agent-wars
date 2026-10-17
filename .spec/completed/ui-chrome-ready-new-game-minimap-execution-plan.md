# Ready Check Mark, Floating New-Game Panel, Minimap Border, and Map Layer Toggles

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Four UI changes, built in six phases that each end in a working, checked app:

1. A thin border on the inside edge of the minimap overview.
2. A check mark on the Ready button whenever its label reads "Ready": the mark and the word with the console expanded, the mark alone with it collapsed.
3. Real Control and Production map-mode toggles, and a Tech toggle that shows only the tech icons.
4. The new-game screen becomes a floating panel over the map, in the selection panel's style, that can be collapsed to its header bar, moved by a grip, and, when it was opened over a match, closed to go back to that match.

**Requirements (the user's decisions):**

- **Ready.** The check mark shows whenever the label reads "Ready", enabled or disabled. With the console expanded: the check mark, then "Ready". With the console collapsed: the check mark only. The "AI: MM:SS" label is unchanged and has no check mark. Ready stays in the console footer.
- **New-game panel.**
  - It floats over the map, 12 px in from the map's top-left corner, in the selection panel's chrome. The map is always the full width of the window.
  - Its header bar holds a chevron expand control at the left, the message, and a close control at the right. A grip on the top-right corner moves the panel.
  - Collapsed shows the header bar only. Expanded adds the choices and Start, no taller than the map less both insets; the choices scroll past that.
  - The panel goes back to the corner, expanded, every time it opens.
  - Close shows only when the screen was opened from the game menu over a live match. The match keeps running under the screen, and nothing is torn down until Start is clicked. Close hides the screen and returns to the match as it is, with the camera where the player left it.
  - At game over and at startup with no match, close is hidden. At game over the player can still collapse the panel to its header bar, which keeps the win or loss message.
- **Minimap.** A thin border on the inside edge of the overview only, not the map-mode tabs.
- **Map layers.**
  - Control is on by default; it shows or hides the borders that mark who controls each hex and the home-region outlines.
  - Production is off by default; on, it shows production labels on every world hex, the way holding T does. Labels keep their default position, and move to the lower band only while T is held or when the hex has infrastructure or units.
  - Tech shows or hides only the tech icons. It no longer hides terrain fill or shows hex codes.
  - Weather is unchanged. Holding T works exactly as it does now.

**What this plan changes:**

- `static/shellChrome.css`, `static/frameChrome.css`, `static/newGameChrome.css`, and `static/index.html`: the minimap border, the Ready check mark, the layer buttons, and the floating panel's markup and styles.
- `src/renderer/openRouter/openRouterUiHelpers.ts`: the Ready label builds its check mark.
- `src/shared/mapViewMode.ts`, `src/renderer/map/mapViewModeState.ts`, `src/renderer/gameplay/productionOverlayHelpers.ts`, and the drawing code: two new stored choices, and one predicate, `isMapLayerShown`, for the layers that T also shows. `isMapInspectionModeHeld` becomes "T is held" only. `src/renderer/map/mapModeTabs.ts` drives the four layer tabs from one table.
- New `src/renderer/chrome/panelSlideHelpers.ts`: the height slide the selection panel uses, shared with the new-game panel.
- New `src/renderer/gameplay/newGameDialogMove.ts`, `src/renderer/gameplay/newGameReturn.ts`, and `src/renderer/map/mainMapCameraReturn.ts`: moving the panel, the close-and-return flow, and the saved camera. `src/shared/mapChromePlacement.ts` gains `floatingPanelOffset`.
- `src/renderer/gameplay/newGame.ts`: opening the screen from the game menu no longer stops the match; Start does.
- Unit tests: `mapViewMode.test.ts` is rewritten (same count), two field renames in `inspectionStatusIconLine.test.ts` and `rendererConsolidation.test.ts`, and three new `floatingPanelOffset` tests. The test total goes up by 3.
- The UI smoke run: new checks and four new scenes.
- `doc/`: the documents listed in each phase.

**Out of scope:**

- Saving the layer choices or the panel position between sessions.
- Escape closing the new-game screen.
- Pausing the opponent's planning cost while the new-game screen is open. A background plan that was already running finishes and applies to the match under the screen.
- Moving or styling any other panel.

**How this plan was checked:** The plan was not pre-built, and its steps have not been run. Every Find block was copied from the files as they stood when the plan was written, and each was checked to occur exactly once, except where a step says otherwise. Code blocks were written against the APIs they call, read from the source. Test-count expectations are relative to the total you record in Before You Start. If a step cannot be applied as written, or a check gives an unexpected result, stop and report it; do not work around it.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no phase numbers, no step numbers, and nothing from this file's name. Every block in this plan already follows this.
  - Do not add, reword, or "improve" anything this plan does not ask for. The blocks already meet the orienting-comment, file-size, naming, logging, and documentation rules. Renderer code logs only in `catch` blocks, with `console.error`, as the existing renderer does. If you think something is wrong, finish the step as written and say so in your report.
- **Shell:** Windows PowerShell, at the repository root `F:\Projects\Personal\agent-wars-public`. Run one command at a time; do not chain commands with `&&`.
- **Line endings:** your working tree uses Windows line endings (CRLF). The blocks in this plan show plain lines. Treat each line break in a block as the file's own line break, and keep each file's existing line endings. New files use CRLF too. If your editing tool matches text byte for byte, convert a block to CRLF before matching, or edit line by line.
- **How to apply a step:**
  - "Create" and "Replace the whole file": write exactly the block's content.
  - "Find ... Replace ...": the Find text occurs exactly once in the file at that moment, unless the step says otherwise. Match it exactly, including leading spaces. A Find block can be part of a single line.
  - "Replace the comment block above X": replace every line from the `/**` line directly above X down to its `*/` line, including any empty line between them, with the block given. Leave X itself alone.
  - "Delete from line A up to line B": remove line A and every line after it, stopping before line B. Line B stays.
  - Every code block starts at the left margin of this document, so every space inside a block is part of the text.
  - If a Find text is missing, or occurs a different number of times than the step says, stop and report the step, the file, and what you found. Do not adapt the edit.
- Some Find texts and new code contain non-ASCII characters (`·`, `…`). Copy them exactly. PowerShell may print them garbled; the files are fine.
- `static/renderer.js` is a committed build output. It changes whenever `npm run build:renderer` or `npm run ui:smoke` runs. Leave it changed; do not revert it.
- No step needs an API key, and the smoke run makes no model calls.

## Verification Commands

These are used in Before You Start and at the end of each phase.

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
- It prints one `PASS` or `FAIL` line per check, then a summary line: `ui-smoke <label>: P passed, F failed, E page errors, N screenshots in <folder>`. Screenshots are named `<NN>-<scene>.png`; this plan names them by the `<scene>` part, because adding scenes renumbers them.
- The window can show a "map tiles failed to load" toast when the network is slow. That toast is not a failure.
- After a smoke run the SQLite module is built for Electron. `npm test` rebuilds it for Node by itself, and `npm start` works as usual.

## Before You Start

- [ ] **Read**

1. `AGENTS.md` and each file in `.cursor/rules/`.
2. `doc/ux/minimap.md`, `doc/ux/map-surface.md`, `doc/ux/console-command-bar.md`, `doc/ux/new-game-dialog.md`, `doc/ux/modes-and-transitions.md`, and `doc/ux/selection-panel.md`.
3. `src/renderer/gameplay/selectionPanelExpand.ts` and `src/renderer/gameplay/selectionPanelResize.ts`, the pattern the new-game panel follows.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files and `static/renderer.js`. Then:

```powershell
[bool](Select-String -Path static/index.html -Pattern 'id="map-mode-control" class="map-mode-btn" disabled' -SimpleMatch -Quiet)
[bool](Select-String -Path src/shared/mapViewMode.ts -Pattern 'isMapLayerShown' -SimpleMatch -Quiet)
Test-Path src/renderer/gameplay/newGameReturn.ts
```

Expected: `True`, `False`, `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0 and failure total **0**. Write down the test total; this plan calls it **T0**. A failure means the starting point is broken: stop and report.

---

## Phase 1: Minimap Inner Border

A 1 px border in the chrome's border color on the inside edge of the overview. It is drawn by a pseudo-element over the map and the tabs toggle, and it takes no pointer input. The color is one token, so the reviewer can change it in one place.

- [ ] **Step 1.1: Add the border in `static/shellChrome.css`**

Find:

```css
/* The overview, with the tabs toggle laid over its lower-left corner. The overview is its own stacking context, so
   Leaflet's panes stay under the toggle. */
.minimap-overview {
  flex: none;
  position: relative;
}
```

Replace with:

```css
/* The overview, with the tabs toggle laid over its lower-left corner. The overview is its own stacking context, so
   Leaflet's panes stay under the toggle. A thin border runs around the overview's inside edge, over the map and the
   toggle, and takes no pointer input. */
.minimap-overview {
  flex: none;
  position: relative;
}
.minimap-overview::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 1px solid var(--chrome-border);
  pointer-events: none;
}
```

- [ ] **Step 1.2: Update `doc/ux/minimap.md`**

In the section that lists what the panel displays (Information Displayed), add this bullet after the bullet that describes the overview:

```markdown
- A thin border in the chrome's border color (`--chrome-border`) on the overview's inside edge, over the map and the tabs toggle. It does not take the pointer (`.minimap-overview::after` in `static/shellChrome.css`).
```

If that section has no bullet for the overview, add it as the section's first bullet. In Code Entry Points, in the `static/shellChrome.css` bullet, change `` `.minimap-overview` `` to `` `.minimap-overview` and its `::after` border ``.

- [ ] **Step 1.3: Update `doc/ui-style-guide.md`**

Find:

```markdown
- **Minimap:** Implemented. A 280 × 200 px Leaflet overview with a viewport rectangle, in a navy panel
```

Replace with:

```markdown
- **Minimap:** Implemented. A 280 × 200 px Leaflet overview with a viewport rectangle and a thin `--chrome-border` line on its inside edge, in a navy panel
```

- [ ] **Verify Phase 1**

Run the fast loop. Then:

```powershell
[bool](Select-String -Path static/shellChrome.css -Pattern '.minimap-overview::after' -SimpleMatch -Quiet)
```

Expected: `True`. The border is checked by eye in the Phase 2 smoke screenshots.

---

## Phase 2: Ready Check Mark

The label is a check mark icon and a `span` holding the word. `setReadyButtonLabelReady` rebuilds both after the AI wait label has replaced them. With the console collapsed, the word is hidden visually but stays in the accessibility tree, so the button's name is still "Ready".

- [ ] **Step 2.1: Ready's markup in `static/index.html`**

Find:

```html
<button type="button" id="ready-btn" class="ready-btn">Ready</button>
```

Replace with:

```html
<button type="button" id="ready-btn" class="ready-btn"><svg class="chrome-icon ready-btn-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"></path></svg><span class="ready-btn-label">Ready</span></button>
```

- [ ] **Step 2.2: The Ready label in `src/renderer/openRouter/openRouterUiHelpers.ts`**

Replace the comment block above `export function setReadyButtonLabelReady(` and the whole function (from that `/**` line down to the function's closing `}` line) with:

```ts
/**
 * Path of the check mark drawn left of "Ready", in a 16 x 16 view box.
 *
 * Purpose: The markup in `static/index.html` and the label rebuilt here draw the same mark.
 * When to use: `buildReadyCheckIcon`.
 * Expected outcome: A stroked tick in the chrome icon style.
 * Exceptions: None.
 */
const READY_CHECK_ICON_PATH = 'M3 8.5l3.2 3.2L13 4.8';

/**
 * Builds the check mark icon for the Ready label.
 *
 * Purpose: The AI wait label replaces the button's content, so the Ready label has to be rebuilt with its icon.
 * When to use: From `setReadyButtonLabelReady`.
 * Expected outcome: A new `svg.chrome-icon.ready-btn-check`, hidden from assistive technology.
 * Exceptions: None.
 */
function buildReadyCheckIcon(): SVGSVGElement {
  const svgNs = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(svgNs, 'svg');
  icon.setAttribute('class', 'chrome-icon ready-btn-check');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('d', READY_CHECK_ICON_PATH);
  icon.appendChild(path);
  return icon;
}

/**
 * Shows the Ready label: the check mark, then the word.
 *
 * Purpose: Ready's label whenever opponent planning is not holding the button, enabled or disabled.
 * When to use: From `updateReadyButtonState` whenever the AI wait label does not apply.
 * Expected outcome: The button holds `svg.ready-btn-check` and then `span.ready-btn-label` reading "Ready". A button
 *   that already shows the mark is left alone, so repeated refreshes do not rebuild it. The collapsed console's styles
 *   hide the word and keep the mark.
 * Exceptions: None.
 */
export function setReadyButtonLabelReady(readyBtn: HTMLButtonElement): void {
  if (readyBtn.querySelector('.ready-btn-check')) return;
  const label = document.createElement('span');
  label.className = 'ready-btn-label';
  label.textContent = 'Ready';
  readyBtn.replaceChildren(buildReadyCheckIcon(), label);
}
```

Then replace the comment block above `export function setReadyButtonLabelAiWait(` with:

```ts
/**
 * Shows the AI wait label: "AI:" in bold, then the elapsed wait.
 *
 * Purpose: Tells the player that Ready is waiting on opponent planning, and for how long.
 * When to use: From `updateReadyButtonState` while opponent planning holds the button.
 * Expected outcome: The button's content becomes `<strong>AI: </strong>` and the time as MM:SS, with no check mark.
 *   `setReadyButtonLabelReady` rebuilds the Ready label afterwards.
 * Exceptions: None.
 */
```

The file grows by about 30 lines, to about 591.

- [ ] **Step 2.3: The check mark's styles in `static/frameChrome.css`**

Find:

```css
.console-footer #ready-btn {
  width: 100%;
  height: 46px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 4px;
}
```

Replace with:

```css
.console-footer #ready-btn {
  width: 100%;
  height: 46px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 4px;
}
/* The check mark left of "Ready". The "AI:" label has none. A margin, not a gap, so "AI:" and its timer stay together. */
.console-footer #ready-btn .ready-btn-check {
  width: 18px;
  height: 18px;
  margin-right: 8px;
}
```

Then find:

```css
  padding: 0 2px;
  font-size: 12px;
  line-height: 1.15;
  white-space: normal;
}
```

Replace with:

```css
  padding: 0 2px;
  font-size: 12px;
  line-height: 1.15;
  white-space: normal;
}
/* The rail is too narrow for the word, so only the check mark shows. The word stays as the button's accessible name. */
#sidebar.console[data-collapsed="true"] #ready-btn .ready-btn-check {
  margin-right: 0;
}
#sidebar.console[data-collapsed="true"] #ready-btn .ready-btn-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

- [ ] **Step 2.4: A smoke check in `scripts/ui-smoke/ui-smoke-checks.cjs`**

Find:

```js
      const inside = r.shown && r.x >= f.x - 1 && r.y >= f.y - 1 && r.x + r.w <= f.x + f.w + 1 && r.y + r.h <= f.y + f.h + 1;
      return inside ? null : `#ready-btn ${fmt(r)} is not inside #console-footer ${fmt(f)}`;
    },
  },
```

Replace with:

```js
      const inside = r.shown && r.x >= f.x - 1 && r.y >= f.y - 1 && r.x + r.w <= f.x + f.w + 1 && r.y + r.h <= f.y + f.h + 1;
      return inside ? null : `#ready-btn ${fmt(r)} is not inside #console-footer ${fmt(f)}`;
    },
  },
  {
    name: 'ready-check-mark',
    scenes: [SCENES.strategic, SCENES.consoleCollapsed, SCENES.consoleExpandedAgain],
    needs: ['#sidebar', '#ready-btn', '#ready-btn .ready-btn-check', '#ready-btn .ready-btn-label'],
    run: (p, el) => {
      const check = el('#ready-btn .ready-btn-check');
      const label = el('#ready-btn .ready-btn-label');
      if (!check.shown) return 'the check mark is not shown on Ready';
      if (el('#sidebar').collapsed === 'true') {
        return label.w <= 1 ? null : `the Ready label is ${Math.round(label.w)} px wide while the console is collapsed, expected only the check mark`;
      }
      if (label.text !== 'Ready') return `the Ready label reads "${label.text}"`;
      return check.x + check.w <= label.x + 1 ? null : `the check mark ${fmt(check)} is not left of the label ${fmt(label)}`;
    },
  },
```

- [ ] **Step 2.5: Update `doc/ux/console-command-bar.md`**

Find:

```markdown
Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running. While the console is collapsed, the status line is hidden, Ready narrows to the tab rail's width, and the "AI:" label takes two lines.
```

Replace with:

```markdown
Its label is a check mark and "Ready", enabled or disabled, or "AI:" plus the elapsed wait, with no check mark, while opponent planning is still running. While the console is collapsed, the status line is hidden, Ready narrows to the tab rail's width, the Ready label shows only its check mark, and the "AI:" label takes two lines. The word stays as the button's accessible name (`setReadyButtonLabelReady` in `src/renderer/openRouter/openRouterUiHelpers.ts`).
```

- [ ] **Step 2.6: Update `doc/ux/console.md`**

Find:

```markdown
- While collapsed, only the tab rail and a smaller Ready show. The opponent status line is hidden. While Ready reads "AI:" and a time, that label takes two lines.
```

Replace with:

```markdown
- While collapsed, only the tab rail and a smaller Ready show. The opponent status line is hidden. Ready shows only its check mark while its label is "Ready". While Ready reads "AI:" and a time, that label takes two lines.
```

- [ ] **Verify Phase 2**

Run the fast loop. Then the smoke run:

```powershell
npm run ui:smoke -- --label ready-check
```

Expected: the summary line reports 0 failed and 0 page errors, and the output has `PASS` lines for `ready-check-mark`. Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/ready-check/report.json`.

Open these screenshots in `.test/ui-smoke/ready-check/` and describe them in your report:

- `strategic-1280x720`: Ready reads check mark, then "Ready", centered in the footer. The minimap overview has a thin steel-blue line on all four inside edges, also over the tabs toggle's left and bottom edges.
- `console-collapsed`: Ready on the rail shows only the check mark.

---

## Phase 3: Map Layer Toggles

Two new stored choices: control borders shown (on at start) and production detail chosen (off at start). `isMapLayerShown` decides the layers that holding T also shows: the tech icons and production on every hex. `isMapInspectionModeHeld` now means "T is held" only, so the terrain fill, the hex codes, the label band, and the airport and tactical paths follow T alone, as they do today without Tech. Control gates the ownership borders and the home-region outlines.

- [ ] **Step 3.1: Replace `src/shared/mapViewMode.ts`**

Replace the whole file with:

```ts
/**
 * The map's layer choices in the minimap panel's map-mode tabs, each a toggle on its own: Weather shows or hides the
 * weather icons, Tech the tech tier icons, Control the borders that mark who controls each hex and the home-region
 * outlines, and Production the production labels on every world hex. Holding T is separate: while the key is down it
 * hides terrain fill and shows hex codes, the tech icons, and every production label.
 *
 * Purpose: The mode tabs, the drawing code, and the tests name the choices and their starting values the same way.
 * When to use: Where the renderer stores or reads the choices, and where it decides whether a chosen layer shows.
 * Expected outcome: Plain constants and one pure function.
 * Exceptions: None.
 */

/**
 * Whether weather icons show when the app opens.
 *
 * Purpose: The map shows each hex's weather until the player turns Weather off; the choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored Weather choice.
 * Expected outcome: `true`.
 * Exceptions: None.
 */
export const DEFAULT_WEATHER_ICONS_SHOWN = true;

/**
 * Whether Tech is on when the app opens.
 *
 * Purpose: The app opens with the tech icons hidden until T is held or Tech is turned on; the choice lasts until the
 *   app closes.
 * When to use: The initial value of the renderer's stored Tech choice.
 * Expected outcome: `false`.
 * Exceptions: None.
 */
export const DEFAULT_TECH_VIEW_CHOSEN = false;

/**
 * Whether Control is on when the app opens.
 *
 * Purpose: Who holds each hex is part of the normal map, so the control borders show until the player turns Control
 *   off; the choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored Control choice.
 * Expected outcome: `true`.
 * Exceptions: None.
 */
export const DEFAULT_CONTROL_BORDERS_SHOWN = true;

/**
 * Whether Production is on when the app opens.
 *
 * Purpose: The app opens showing production only on the player's own hexes; the choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored Production choice.
 * Expected outcome: `false`.
 * Exceptions: None.
 */
export const DEFAULT_PRODUCTION_DETAIL_CHOSEN = false;

/**
 * Decides whether a layer that holding T also shows is on screen: the tech icons, or production on every hex.
 *
 * Purpose: Holding T shows these layers everywhere, as before. Turning a layer's tab on keeps it on, but only on the
 *   world map: a battle and the new-game preview keep their normal view, and the choice applies again when they close.
 * When to use: For the Tech and Production layers. `tKeyHeld` is true while the player holds T, `layerChosen` while
 *   that layer's tab is on, `inBattle` while a tactical battle is open, and `newGameOverlayOpen` while the new-game or
 *   game-over overlay is open.
 * Expected outcome: True while T is held, or while the layer is chosen outside a battle and outside that overlay.
 * Exceptions: None.
 */
export function isMapLayerShown(input: {
  readonly tKeyHeld: boolean;
  readonly layerChosen: boolean;
  readonly inBattle: boolean;
  readonly newGameOverlayOpen: boolean;
}): boolean {
  if (input.tKeyHeld) return true;
  return input.layerChosen && !input.inBattle && !input.newGameOverlayOpen;
}
```

- [ ] **Step 3.2: Replace `src/shared/mapViewMode.test.ts`**

Replace the whole file with:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_CONTROL_BORDERS_SHOWN,
  DEFAULT_PRODUCTION_DETAIL_CHOSEN,
  DEFAULT_TECH_VIEW_CHOSEN,
  DEFAULT_WEATHER_ICONS_SHOWN,
  isMapLayerShown,
} from './mapViewMode';

/**
 * The world map with the layer off and no key held.
 *
 * Purpose: Each test changes only the inputs it is about.
 * When to use: Spread into each test's input.
 * Expected outcome: An input for which the layer is off.
 * Exceptions: None.
 */
const WORLD_MAP: Parameters<typeof isMapLayerShown>[0] = {
  tKeyHeld: false,
  layerChosen: false,
  inBattle: false,
  newGameOverlayOpen: false,
};

test('a session starts with weather icons and control borders on, and tech icons and production detail off', () => {
  assert.equal(DEFAULT_WEATHER_ICONS_SHOWN, true);
  assert.equal(DEFAULT_TECH_VIEW_CHOSEN, false);
  assert.equal(DEFAULT_CONTROL_BORDERS_SHOWN, true);
  assert.equal(DEFAULT_PRODUCTION_DETAIL_CHOSEN, false);
});

test('with the layer off, it shows only while T is held', () => {
  assert.equal(isMapLayerShown(WORLD_MAP), false);
  assert.equal(isMapLayerShown({ ...WORLD_MAP, tKeyHeld: true }), true);
});

test('a chosen layer shows on the world map', () => {
  assert.equal(isMapLayerShown({ ...WORLD_MAP, layerChosen: true }), true);
});

test('a chosen layer does not apply in a battle or under the new-game overlay', () => {
  assert.equal(isMapLayerShown({ ...WORLD_MAP, layerChosen: true, inBattle: true }), false);
  assert.equal(isMapLayerShown({ ...WORLD_MAP, layerChosen: true, newGameOverlayOpen: true }), false);
});

test('holding T shows the layer in a battle and under the overlay, whether or not it is chosen', () => {
  assert.equal(isMapLayerShown({ ...WORLD_MAP, tKeyHeld: true, inBattle: true }), true);
  assert.equal(isMapLayerShown({ ...WORLD_MAP, tKeyHeld: true, layerChosen: true, newGameOverlayOpen: true }), true);
});
```

- [ ] **Step 3.3: Replace `src/renderer/map/mapViewModeState.ts`**

Replace the whole file with:

```ts
/**
 * The layer choices the player made in the map-mode tabs: weather icons, tech icons, control borders, and production
 * detail. This module holds them for the rest of the session; they are not saved, so the app opens with the defaults
 * in `src/shared/mapViewMode.ts` each time.
 *
 * Purpose: The mode tabs write the choices and the drawing code reads them, without either importing the other.
 * When to use: Through the getters and setters below.
 * Expected outcome: The `DEFAULT_*` values until the player changes them.
 * Exceptions: None.
 */
import {
  DEFAULT_CONTROL_BORDERS_SHOWN,
  DEFAULT_PRODUCTION_DETAIL_CHOSEN,
  DEFAULT_TECH_VIEW_CHOSEN,
  DEFAULT_WEATHER_ICONS_SHOWN,
} from '../../shared/mapViewMode';

/**
 * Whether Weather is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `areWeatherIconsShown` and `setWeatherIconsShown`.
 * Expected outcome: Starts as `DEFAULT_WEATHER_ICONS_SHOWN`.
 * Exceptions: None.
 */
let weatherIconsShown = DEFAULT_WEATHER_ICONS_SHOWN;

/**
 * Whether Tech is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `isTechViewChosen` and `setTechViewChosen`.
 * Expected outcome: Starts as `DEFAULT_TECH_VIEW_CHOSEN`.
 * Exceptions: None.
 */
let techViewChosen = DEFAULT_TECH_VIEW_CHOSEN;

/**
 * Whether Control is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `areControlBordersShown` and `setControlBordersShown`.
 * Expected outcome: Starts as `DEFAULT_CONTROL_BORDERS_SHOWN`.
 * Exceptions: None.
 */
let controlBordersShown = DEFAULT_CONTROL_BORDERS_SHOWN;

/**
 * Whether Production is on in the mode tabs.
 *
 * Purpose: The single record of that choice for this session.
 * When to use: Only through `isProductionDetailChosen` and `setProductionDetailChosen`.
 * Expected outcome: Starts as `DEFAULT_PRODUCTION_DETAIL_CHOSEN`.
 * Exceptions: None.
 */
let productionDetailChosen = DEFAULT_PRODUCTION_DETAIL_CHOSEN;

/**
 * Returns whether the world map shows weather icons.
 *
 * Purpose: The status-icon pass and the Weather tab follow the same choice.
 * When to use: Each time the status icons are drawn, and when the mode tabs redraw their pressed state.
 * Expected outcome: True while Weather is on.
 * Exceptions: None.
 */
export function areWeatherIconsShown(): boolean {
  return weatherIconsShown;
}

/**
 * Records whether the world map shows weather icons.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Weather tab.
 * Expected outcome: Later calls to `areWeatherIconsShown` return `shown`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setWeatherIconsShown(shown: boolean): void {
  weatherIconsShown = shown;
}

/**
 * Returns whether the player turned Tech on.
 *
 * Purpose: The tech-icon pass and the Tech tab follow the same choice.
 * When to use: Through `areTechIconsShown`, which adds the T key and the battle and overlay rules, and when the mode
 *   tabs redraw their pressed state.
 * Expected outcome: True while Tech is on.
 * Exceptions: None.
 */
export function isTechViewChosen(): boolean {
  return techViewChosen;
}

/**
 * Records whether the player turned Tech on.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Tech tab.
 * Expected outcome: Later calls to `isTechViewChosen` return `chosen`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setTechViewChosen(chosen: boolean): void {
  techViewChosen = chosen;
}

/**
 * Returns whether the world map shows the borders that mark who controls each hex, and the home-region outlines.
 *
 * Purpose: The terrain pass and the Control tab follow the same choice.
 * When to use: Each time the world map's hexes or the home-region outlines are drawn, and when the mode tabs redraw
 *   their pressed state.
 * Expected outcome: True while Control is on.
 * Exceptions: None.
 */
export function areControlBordersShown(): boolean {
  return controlBordersShown;
}

/**
 * Records whether the world map shows the control borders and the home-region outlines.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Control tab.
 * Expected outcome: Later calls to `areControlBordersShown` return `shown`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setControlBordersShown(shown: boolean): void {
  controlBordersShown = shown;
}

/**
 * Returns whether the player turned Production on.
 *
 * Purpose: The production labels and the Production tab follow the same choice.
 * When to use: Through `isProductionDetailShown`, which adds the T key and the battle and overlay rules, and when the
 *   mode tabs redraw their pressed state.
 * Expected outcome: True while Production is on.
 * Exceptions: None.
 */
export function isProductionDetailChosen(): boolean {
  return productionDetailChosen;
}

/**
 * Records whether the player turned Production on.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the Production tab.
 * Expected outcome: Later calls to `isProductionDetailChosen` return `chosen`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setProductionDetailChosen(chosen: boolean): void {
  productionDetailChosen = chosen;
}
```

- [ ] **Step 3.4: Edit `src/renderer/gameplay/productionOverlayHelpers.ts`**

(a) Find:

```ts
import { isTerrainInspectionShown } from '../../shared/mapViewMode';
import { isTechViewChosen } from '../map/mapViewModeState';
```

Replace with:

```ts
import { isMapLayerShown } from '../../shared/mapViewMode';
import { isProductionDetailChosen, isTechViewChosen } from '../map/mapViewModeState';
```

(b) Find:

```ts
   * Contract: True while the inspection view is on: T is held, or Tech is on, on the world map outside a battle and outside the new-game or game-over overlay.
   * When to use: Read by `drawStrategicProductionOverlays` and `syncBuildEntryButton` each frame.
   * Expected outcome: Matches `isMapInspectionModeHeld`.
   * Exceptions: None.
   */
mapInspectionHeld: boolean;
```

Replace with:

```ts
   * Contract: True while the player holds T.
   * When to use: Read by `drawStrategicProductionOverlays` each frame, to move labels to the lower band.
   * Expected outcome: Matches `isMapInspectionModeHeld`.
   * Exceptions: None.
   */
mapInspectionHeld: boolean;
    /**
   * Whether production labels show on every world hex, not only on the player's own.
   *
   * Contract: True while T is held, or while Production is on, on the world map outside a battle and outside the new-game or game-over overlay.
   * When to use: Read by `drawStrategicProductionOverlays` each frame, to choose which hexes get a label.
   * Expected outcome: Matches `isProductionDetailShown`.
   * Exceptions: None.
   */
productionDetailShown: boolean;
```

(c) Find:

```ts
   * Expected outcome: True only when inspection mode and FoW-off snapshot align.
```

Replace with:

```ts
   * Expected outcome: True only while production detail is shown and the snapshot has fog of war off.
```

(d) Find this whole block:

```ts
/**
 * Reports whether the map shows its inspection view: terrain fill hidden and, on the world map, hex codes and tech icons.
 *
 * Purpose: Every drawing path that used to ask whether T is held asks here. The name stays because many callers pass
 *   it along; the answer now also covers the Tech view turned on in the mode tabs.
 * When to use: Wherever drawing depends on the inspection view.
 * Expected outcome: True while T is held, or while the Tech view is on outside a battle and outside the new-game or
 *   game-over overlay. See `isTerrainInspectionShown`.
 * Exceptions: None.
 */
export function isMapInspectionModeHeld(): boolean {
  const techViewChosen = isTechViewChosen();
  return isTerrainInspectionShown({
    tKeyHeld: S.hideTerrainFillWhileHeld,
    techViewChosen,
    inBattle: S.tacticalBattleSnapshot != null,
    // Drawing asks this for every hex, so the page is read only while the answer can depend on it.
    newGameOverlayOpen: techViewChosen && isNewGameOverlayOpen(),
  });
}
```

Replace with:

```ts
/**
 * Reports whether the player is holding T, the map's inspection gesture.
 *
 * Purpose: Holding T hides terrain fill, shows hex codes, and moves production labels to the lower band, everywhere.
 *   No map-mode tab turns these on, so this is the key alone. The tech icons and the production labels that T also
 *   shows follow `areTechIconsShown` and `isProductionDetailShown`.
 * When to use: Wherever drawing depends on T being held.
 * Expected outcome: True while T is held.
 * Exceptions: None.
 */
export function isMapInspectionModeHeld(): boolean {
  return S.hideTerrainFillWhileHeld;
}

/**
 * Reports whether a layer that holding T also shows is on screen, given whether its tab is on.
 *
 * Purpose: The tech icons and production detail share one rule. See `isMapLayerShown`.
 * When to use: From `areTechIconsShown` and `isProductionDetailShown`.
 * Expected outcome: True while T is held, or while the layer is chosen outside a battle and outside the new-game or
 *   game-over overlay.
 * Exceptions: None.
 */
function isChosenLayerShown(layerChosen: boolean): boolean {
  return isMapLayerShown({
    tKeyHeld: S.hideTerrainFillWhileHeld,
    layerChosen,
    inBattle: S.tacticalBattleSnapshot != null,
    // Drawing asks this for every hex, so the page is read only while the answer can depend on it.
    newGameOverlayOpen: layerChosen && isNewGameOverlayOpen(),
  });
}

/**
 * Reports whether the world map shows the tech tier icons.
 *
 * Purpose: The status-icon pass shows them while T is held or while Tech is on.
 * When to use: Once per status-icon pass.
 * Expected outcome: True while T is held, or while Tech is on outside a battle and outside the new-game or game-over
 *   overlay.
 * Exceptions: None.
 */
export function areTechIconsShown(): boolean {
  return isChosenLayerShown(isTechViewChosen());
}

/**
 * Reports whether production labels show on every world hex, not only on the player's own.
 *
 * Purpose: Holding T or turning Production on reveals the labels on opponent, neutral, and unexplored hexes.
 * When to use: Once per production-label pass and once per status-icon pass.
 * Expected outcome: True while T is held, or while Production is on outside a battle and outside the new-game or
 *   game-over overlay.
 * Exceptions: None.
 */
export function isProductionDetailShown(): boolean {
  return isChosenLayerShown(isProductionDetailChosen());
}
```

(e) Find:

```ts
  const mapInspectionHeld = isMapInspectionModeHeld();
  const revealAllControllerQueues = mapInspectionHeld && isFogOfWarDisabledForSnapshot(state);
  return {
    mapInspectionHeld,
    revealAllControllerQueues,
```

Replace with:

```ts
  const mapInspectionHeld = isMapInspectionModeHeld();
  const productionDetailShown = isProductionDetailShown();
  const revealAllControllerQueues = productionDetailShown && isFogOfWarDisabledForSnapshot(state);
  return {
    mapInspectionHeld,
    productionDetailShown,
    revealAllControllerQueues,
```

- [ ] **Step 3.5: Rename two inputs in `src/shared/inspectionStatusIconLine.ts`**

(a) Find:

```ts
   * Contract: The build button requires this. Inspection can still show a canvas label when it is false.
   * When to use: Pass the exploration predicate used by the production overlay.
   * Expected outcome: An unexplored hex outside inspection yields `'none'`.
```

Replace with:

```ts
   * Contract: The build button requires this. Production detail can still show a canvas label when it is false.
   * When to use: Pass the exploration predicate used by the production overlay.
   * Expected outcome: An unexplored hex without production detail yields `'none'`.
```

(b) Find:

```ts
   * Whether map inspection is held.
   *
   * Contract: True is the T key. It reveals labels that are otherwise hidden.
   * When to use: Pass `isMapInspectionModeHeld`.
   * Expected outcome: Opponent and unexplored hexes can return `'canvas'`.
   * Exceptions: None.
   */
  readonly mapInspectionHeld: boolean;
```

Replace with:

```ts
   * Whether production labels show on every hex.
   *
   * Contract: True while T is held or Production is on. It reveals labels that are otherwise hidden.
   * When to use: Pass `isProductionDetailShown`.
   * Expected outcome: Opponent and unexplored hexes can return `'canvas'`.
   * Exceptions: None.
   */
  readonly productionDetailShown: boolean;
```

(c) Find:

```ts
   * Contract: A human non-urban hex still shows a canvas label outside inspection.
```

Replace with:

```ts
   * Contract: A human non-urban hex still shows a canvas label without production detail.
```

(d) Find:

```ts
   * Whether the inspection view is on: T is held, or the Tech tab is on.
   *
   * Contract: True allows a tech icon. It does not affect the weather icon.
   * When to use: Pass `isMapInspectionModeHeld`.
   * Expected outcome: False never returns a tech icon.
   * Exceptions: None.
   */
  readonly mapInspectionHeld: boolean;
```

Replace with:

```ts
   * Whether tech icons are shown: T is held, or the Tech tab is on.
   *
   * Contract: True allows a tech icon. It does not affect the weather icon.
   * When to use: Pass `areTechIconsShown`.
   * Expected outcome: False never returns a tech icon.
   * Exceptions: None.
   */
  readonly techIconsShown: boolean;
```

(e) Find:

```ts
and only while the inspection view is on. Low and High use the same icon.
```

Replace with:

```ts
and only while tech icons are shown. Low and High use the same icon.
```

(f) Find:

```ts
  if (!input.explored && !input.mapInspectionHeld) return 'none';
  if (!input.mapInspectionHeld && !input.humanUrbanProduction && !input.controlledByHuman) return 'none';
```

Replace with:

```ts
  if (!input.explored && !input.productionDetailShown) return 'none';
  if (!input.productionDetailShown && !input.humanUrbanProduction && !input.controlledByHuman) return 'none';
```

(g) Find:

```ts
 * Purpose: The inspection view allows tech. The Weather tab allows weather. Each is decided on its own, so a hex can
```

Replace with:

```ts
 * Purpose: T and the Tech tab allow tech. The Weather tab allows weather. Each is decided on its own, so a hex can
```

(h) Find:

```ts
  if (input.mapInspectionHeld && input.techBonusEnabled === true
```

Replace with:

```ts
  if (input.techIconsShown && input.techBonusEnabled === true
```

Then check:

```powershell
Select-String -Path src/shared/inspectionStatusIconLine.ts -Pattern 'mapInspectionHeld' -SimpleMatch
```

Expected: no output.

- [ ] **Step 3.6: Follow the renames in `src/shared/inspectionStatusIconLine.test.ts`**

(a) Find:

```ts
    tacticalRendered: false,
    explored: true,
    mapInspectionHeld: false,
```

Replace with:

```ts
    tacticalRendered: false,
    explored: true,
    productionDetailShown: false,
```

(b) Find:

```ts
  assert.equal(strategicProductionLabelSurface({ ...base, mapInspectionHeld: true }), 'button');
```

Replace with:

```ts
  assert.equal(strategicProductionLabelSurface({ ...base, productionDetailShown: true }), 'button');
```

(c) Find:

```ts
    strategicProductionLabelSurface({ ...base, explored: false, mapInspectionHeld: true }),
```

Replace with:

```ts
    strategicProductionLabelSurface({ ...base, explored: false, productionDetailShown: true }),
```

(d) This Find occurs **exactly twice**. Replace both occurrences. Any other count: stop and report.

Find:

```ts
      buildEntryZoom: false,
      mapInspectionHeld: true,
```

Replace with:

```ts
      buildEntryZoom: false,
      productionDetailShown: true,
```

(e) Find:

```ts
    mapInspectionHeld: true,
    weatherIconsShown: true,
```

Replace with:

```ts
    techIconsShown: true,
    weatherIconsShown: true,
```

(f) Find:

```ts
{ ...both, mapInspectionHeld: false }
```

Replace with:

```ts
{ ...both, techIconsShown: false }
```

(g) Find:

```ts
 * Expected outcome: Tactical, hidden hexes, and opponent hexes outside inspection are `'none'`. The build button wins when it is shown. Inspection reveals a canvas label on the remaining hexes.
```

Replace with:

```ts
 * Expected outcome: Tactical, hidden hexes, and opponent hexes without production detail are `'none'`. The build button wins when it is shown. Production detail reveals a canvas label on the remaining hexes.
```

(h) Find:

```ts
 * Purpose: The inspection view allows tech, and the Weather tab allows weather, each on its own. A missing bonus or a
```

Replace with:

```ts
 * Purpose: The tech icon choice allows tech, and the Weather tab allows weather, each on its own. A missing bonus or a
```

(i) Find:

```ts
test('status icons follow the inspection view, the Weather tab, and the bonuses', () => {
```

Replace with:

```ts
test('status icons follow the tech icon choice, the Weather tab, and the bonuses', () => {
```

Then check:

```powershell
Select-String -Path src/shared/inspectionStatusIconLine.test.ts -Pattern 'mapInspectionHeld' -SimpleMatch
```

Expected: no output.

- [ ] **Step 3.7: Edit `src/renderer/rendering/inspectionStatusIcons.ts`**

(a) Find:

```ts
 * while the inspection view is on (T held or the Tech tab on).
```

Replace with:

```ts
 * while tech icons are shown (T held or the Tech tab on).
```

(b) Find:

```ts
import {
  getControllerForHex,
  isMapInspectionModeHeld,
  isStrategicHexHumanUrbanProduction,
} from '../gameplay/productionOverlayHelpers';
```

Replace with:

```ts
import {
  areTechIconsShown,
  getControllerForHex,
  isProductionDetailShown,
  isStrategicHexHumanUrbanProduction,
} from '../gameplay/productionOverlayHelpers';
```

(c) Find:

```ts
 * Purpose: Weather shows while the Weather tab is on. Tech shows while the inspection view is on. Neither requires a
```

Replace with:

```ts
 * Purpose: Weather shows while the Weather tab is on. Tech shows while tech icons are shown. Neither requires a
```

(d) Find:

```ts
  const mapInspectionHeld = isMapInspectionModeHeld();
  const weatherIconsShown = areWeatherIconsShown();
```

Replace with:

```ts
  const productionDetailShown = isProductionDetailShown();
  const techIconsShown = areTechIconsShown();
  const weatherIconsShown = areWeatherIconsShown();
```

(e) Find:

```ts
        explored,
        mapInspectionHeld,
        controlledByHuman,
```

Replace with:

```ts
        explored,
        productionDetailShown,
        controlledByHuman,
```

(f) Find:

```ts
      const icons = inspectionStatusIconsForHex({
        mapInspectionHeld,
```

Replace with:

```ts
      const icons = inspectionStatusIconsForHex({
        techIconsShown,
```

- [ ] **Step 3.8: Edit `drawStrategicProductionOverlays` in `src/renderer/renderer.ts`**

(a) Replace the comment block above `function drawStrategicProductionOverlays(ctx: CanvasRenderingContext2D): void {` with:

```ts
/**
 * Draws the production label on each world hex that shows one.
 *
 * Purpose: The player's own production always shows; holding T or turning Production on shows it on every hex.
 * When to use: Once per strategic frame, from the scene pass.
 * Expected outcome: No labels at battle-detail zoom or without a map. Otherwise a label on each explored hex the human
 *   controls, and on every hex while production detail is shown, unexplored ones as plain `$N`. A hex whose build
 *   button shows gets no canvas label. A label moves to the lower band while T is held or when its hex has
 *   infrastructure or units.
 * Exceptions: None.
 */
```

(b) Find:

```ts
    if (!explored && !overlayContext.mapInspectionHeld) continue;
```

Replace with:

```ts
    if (!explored && !overlayContext.productionDetailShown) continue;
```

(c) Find:

```ts
    if (!overlayContext.mapInspectionHeld) {
```

Replace with:

```ts
    if (!overlayContext.productionDetailShown) {
```

(d) Find:

```ts
    // Inspection mode shows centered hex codes on strategic; push production text to the same lower band as infra-heavy hexes.
```

Replace with:

```ts
    // Holding T shows centered hex codes on strategic; push production text to the same lower band as infra-heavy hexes.
```

Leave `overlayContext.mapInspectionHeld || hasInfraSymbols || hasVisibleUnits` as it is: the band follows T alone.

- [ ] **Step 3.9: Follow the field in `src/main/rendererConsolidation.test.ts`**

(a) Find:

```ts
    /if\s*\(!explored\s*&&\s*!overlayContext\.mapInspectionHeld\)\s*continue;/,
    'drawStrategicProductionOverlays should only show unexplored production labels while T is held'
```

Replace with:

```ts
    /if\s*\(!explored\s*&&\s*!overlayContext\.productionDetailShown\)\s*continue;/,
    'drawStrategicProductionOverlays should only show unexplored production labels while production detail is shown'
```

(b) Find:

```ts
    drawProductionFn.includes('!overlayContext.mapInspectionHeld') &&
```

Replace with:

```ts
    drawProductionFn.includes('!overlayContext.productionDetailShown') &&
```

- [ ] **Step 3.10: Gate the control borders in `src/renderer/rendering/terrainRendering.ts`**

(a) Find:

```ts
import { getMainLeafletMap } from '../map/worldLeafletMap';
```

Replace with:

```ts
import { getMainLeafletMap } from '../map/worldLeafletMap';
import { areControlBordersShown } from '../map/mapViewModeState';
```

(b) Replace the comment block above `export function drawTerrainHexes(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void {` with:

```ts
/**
 * Draws the world map's hexes: terrain fill, the grid stroke, and the borders that mark who controls each hex.
 *
 * Purpose: The base layer of the strategic map, under units, labels, and icons.
 * When to use: Once per strategic frame. A battle and battle-detail zoom draw their own hexes.
 * Expected outcome: Nothing in a battle, at battle-detail zoom, or without a map. Explored hexes are filled unless T
 *   is held. While Control is on, ownership borders follow `resolveOwnershipBorderStyle`; while it is off, every hex
 *   gets only the normal grid stroke.
 * Exceptions: None.
 */
```

(c) Find:

```ts
  const controlByHex = buildControlByHex(S.gameState);
  const perspective = S.gameState.playerPerspective === 'opponent' ? 'opponent' : 'human';
```

Replace with:

```ts
  const controlByHex = buildControlByHex(S.gameState);
  const perspective = S.gameState.playerPerspective === 'opponent' ? 'opponent' : 'human';
  const controlBordersShown = areControlBordersShown();
```

(d) Find:

```ts
    const ownershipStyle = resolveOwnershipBorderStyle({
      h3Index: hx.h3Index,
      controllerPlayerId: controlByHex.get(hx.h3Index),
      isOwnershipVisible: ownershipVisible,
      humanHomeRegionHexes: S.gameState.humanHomeRegionHexes,
      aiHomeRegionHexes: S.gameState.aiHomeRegionHexes,
      intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
    });
```

Replace with:

```ts
    const ownershipStyle: OwnershipBorderStyle = controlBordersShown
      ? resolveOwnershipBorderStyle({
          h3Index: hx.h3Index,
          controllerPlayerId: controlByHex.get(hx.h3Index),
          isOwnershipVisible: ownershipVisible,
          humanHomeRegionHexes: S.gameState.humanHomeRegionHexes,
          aiHomeRegionHexes: S.gameState.aiHomeRegionHexes,
          intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
        })
      : 'none';
```

(e) Replace the comment block above `export function drawScenarioHomeRegionOutlines(ctx: CanvasRenderingContext2D): void {` with:

```ts
/**
 * Outlines the human and AI home regions at battle-detail zoom.
 *
 * Purpose: The world map's ownership borders are not drawn at that zoom, so the home regions get their own outline.
 * When to use: Once per frame from the scene pass.
 * Expected outcome: Nothing without a match, while Control is off, without home regions, or outside battle-detail
 *   zoom. Otherwise each home-region hex gets its outlined border.
 * Exceptions: None.
 */
```

(f) Find:

```ts
export function drawScenarioHomeRegionOutlines(ctx: CanvasRenderingContext2D): void {
  const state = S.gameState;
  if (!state) return;
```

Replace with:

```ts
export function drawScenarioHomeRegionOutlines(ctx: CanvasRenderingContext2D): void {
  const state = S.gameState;
  if (!state || !areControlBordersShown()) return;
```

The file ends at about 606 lines, a few over the 600-line target and well under the limit; it was 597.

- [ ] **Step 3.11: Replace `src/renderer/map/mapModeTabs.ts`**

Replace the whole file with:

```ts
/**
 * The row of map-mode tabs under the minimap overview: Weather, Tech, Control, and Production each show or hide one map
 * layer, and Legend opens or closes the terrain legend. The row starts hidden, and the toggle on the overview's
 * lower-left corner shows and hides it.
 *
 * Purpose: Keeps the tabs, the row's toggle, the stored choices, and the legend in step.
 * When to use: `wireMapModeTabs` once at startup.
 * Expected outcome: Each layer tab reads as pressed while its layer is chosen, and Legend while the legend is open.
 *   The toggle reads as expanded while the row shows.
 * Exceptions: None; missing elements are skipped.
 */
import { mapModeTabsHideTooltipText, mapModeTabsShowTooltipText } from '../chrome/frameTooltipText';
import { layoutMapChrome } from './mapChromeLayout';
import {
  areControlBordersShown,
  areWeatherIconsShown,
  isProductionDetailChosen,
  isTechViewChosen,
  setControlBordersShown,
  setProductionDetailChosen,
  setTechViewChosen,
  setWeatherIconsShown,
} from './mapViewModeState';

/**
 * One layer tab: its element id and the stored choice it reads and writes.
 *
 * Purpose: The four layer tabs behave the same way, so one table drives them.
 * When to use: Entries of `LAYER_TABS`.
 * Expected outcome: `read` returns the stored choice; `write` records a new one without redrawing.
 * Exceptions: None.
 */
interface MapLayerTab {
  /** The tab's id in `static/index.html`. */
  readonly id: string;
  /** Returns whether the layer is chosen. */
  readonly read: () => boolean;
  /** Records whether the layer is chosen. */
  readonly write: (chosen: boolean) => void;
}

/**
 * The layer tabs, left to right.
 *
 * Purpose: A layer tab is one row here, plus its markup and its stored choice.
 * When to use: `syncMapModeTabs` and `wireMapModeTabs`.
 * Expected outcome: Weather, Tech, Control, Production.
 * Exceptions: None.
 */
const LAYER_TABS: readonly MapLayerTab[] = Object.freeze([
  { id: 'map-mode-weather', read: areWeatherIconsShown, write: setWeatherIconsShown },
  { id: 'map-mode-tech', read: isTechViewChosen, write: setTechViewChosen },
  { id: 'map-mode-control', read: areControlBordersShown, write: setControlBordersShown },
  { id: 'map-mode-production', read: isProductionDetailChosen, write: setProductionDetailChosen },
]);

/**
 * Sets each tab's pressed state from the stored choices and the legend.
 *
 * Purpose: The tabs are the only sign of which choices are on, so they must never disagree with them.
 * When to use: After a choice changes or the legend opens or closes.
 * Expected outcome: `aria-pressed` on each layer tab matches its stored choice; `aria-pressed` and `aria-expanded` on
 *   Legend match whether `#terrain-legend` is shown.
 * Exceptions: None.
 */
function syncMapModeTabs(): void {
  for (const tab of LAYER_TABS) {
    document.getElementById(tab.id)?.setAttribute('aria-pressed', String(tab.read()));
  }
  const legendOpen = document.getElementById('terrain-legend')?.hidden === false;
  const legendToggle = document.getElementById('map-legend-toggle');
  legendToggle?.setAttribute('aria-pressed', String(legendOpen));
  legendToggle?.setAttribute('aria-expanded', String(legendOpen));
}

/**
 * Turns one map layer on or off.
 *
 * Purpose: The canvas draws each layer from its stored choice, so a click only flips the choice and redraws.
 * When to use: From a layer tab's click.
 * Expected outcome: The choice flips, the tabs follow, and the map is redrawn. The other layers are not touched.
 * Exceptions: None.
 */
function toggleMapLayer(tab: MapLayerTab, requestRedraw: () => void): void {
  tab.write(!tab.read());
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
 * Wires the row's toggle, the layer tabs, and the Legend tab.
 *
 * Purpose: The mode tabs' single setup point.
 * When to use: Once at startup, after the maps and the legend are built.
 * Expected outcome: Clicks show or hide the row, turn a layer on or off, or open or close the legend, and the tabs
 *   show the session's starting state. The row's starting state, hidden, comes from the markup.
 * Exceptions: None.
 */
export function wireMapModeTabs(requestRedraw: () => void): void {
  document.getElementById('map-mode-tabs-toggle')?.addEventListener('click', () => {
    setMapModeTabsShown(document.getElementById('map-mode-tabs')?.hidden === true);
  });
  for (const tab of LAYER_TABS) {
    document.getElementById(tab.id)?.addEventListener('click', () => toggleMapLayer(tab, requestRedraw));
  }
  document.getElementById('map-legend-toggle')?.addEventListener('click', toggleTerrainLegend);
  syncMapModeTabs();
}
```

- [ ] **Step 3.12: Tips in `src/renderer/chrome/frameTooltipText.ts`**

(a) Find:

```ts
export const mapModeTabsShowTooltipText = 'Show the Weather, Tech, and Legend buttons under the overview.';
```

Replace with:

```ts
export const mapModeTabsShowTooltipText = 'Show the map-mode buttons under the overview.';
```

(b) Find:

```ts
  'Hide the Weather, Tech, and Legend buttons. Hiding them also closes the terrain legend.';
```

Replace with:

```ts
  'Hide the map-mode buttons. Hiding them also closes the terrain legend.';
```

(c) Find:

```ts
 * Purpose: Says Tech is a toggle, what its view shows and where, and how it relates to holding T.
```

Replace with:

```ts
 * Purpose: Says Tech is a toggle for the tech tier icons, when they can show, and how it relates to holding T.
```

(d) Find:

```ts
  "Turn the Tech view on or off: each hex's code, production, and tech tier instead of terrain on the world map. Holding T shows the same view while the key is down.";
```

Replace with:

```ts
  "Show or hide each hex's tech tier icon on the world map, while the tech bonus is on. Holding T shows them too, while the key is down.";

/**
 * The Control map mode's tip.
 *
 * Purpose: Says Control is a toggle for the control borders and the home-region outlines.
 * When to use: `#map-mode-control`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const mapControlModeTooltipText =
  'Show or hide the borders that mark who controls each hex, and the home-region outlines.';

/**
 * The Production map mode's tip.
 *
 * Purpose: Says Production shows labels on every hex, as holding T does, and what Off shows.
 * When to use: `#map-mode-production`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const mapProductionModeTooltipText =
  'Show or hide production on every world hex, the way holding T does. Off shows it only on hexes you control.';
```

- [ ] **Step 3.13: The tabs' markup in `static/index.html`**

(a) Find:

```html
data-control-tooltip="Show the Weather, Tech, and Legend buttons under the overview."
```

Replace with:

```html
data-control-tooltip="Show the map-mode buttons under the overview."
```

(b) Find:

```html
data-control-tooltip="Turn the Tech view on or off: each hex's code, production, and tech tier instead of terrain on the world map. Holding T shows the same view while the key is down."
```

Replace with:

```html
data-control-tooltip="Show or hide each hex's tech tier icon on the world map, while the tech bonus is on. Holding T shows them too, while the key is down."
```

(c) Find:

```html
        <span class="control-tooltip-host map-mode-host" data-control-tooltip="Control is not available in this version."><button type="button" id="map-mode-control" class="map-mode-btn" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5M4 3h7.5L9.7 5.8l1.8 2.7H4"></path></svg><span>Control</span></button></span>
```

Replace with:

```html
        <button type="button" id="map-mode-control" class="map-mode-btn" aria-pressed="true" data-control-tooltip="Show or hide the borders that mark who controls each hex, and the home-region outlines."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5M4 3h7.5L9.7 5.8l1.8 2.7H4"></path></svg><span>Control</span></button>
```

(d) Find:

```html
        <span class="control-tooltip-host map-mode-host" data-control-tooltip="Production is not available in this version."><button type="button" id="map-mode-production" class="map-mode-btn" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M10.8 4.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.6 5.8 4.6 0 1.3-1.2 2.2-3 2.2-1.4 0-2.5-.6-3-1.5"></path></svg><span>Production</span></button></span>
```

Replace with:

```html
        <button type="button" id="map-mode-production" class="map-mode-btn" aria-pressed="false" data-control-tooltip="Show or hide production on every world hex, the way holding T does. Off shows it only on hexes you control."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M10.8 4.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.8.8-2.8 2.1 0 2.9 5.8 1.6 5.8 4.6 0 1.3-1.2 2.2-3 2.2-1.4 0-2.5-.6-3-1.5"></path></svg><span>Production</span></button>
```

- [ ] **Step 3.14: Remove the placeholder host style from `static/shellChrome.css`**

Find:

```css
.map-mode-host {
  display: flex;
  min-width: 0;
}
```

Replace with nothing: delete those four lines.

Then check:

```powershell
Select-String -Path static/index.html,static/shellChrome.css,static/frameChrome.css,static/newGameChrome.css,static/selectionChrome.css -Pattern 'map-mode-host' -SimpleMatch
```

Expected: no output. If a line prints, stop and report it.

- [ ] **Step 3.15: Smoke scenes and checks**

(a) In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find:

```js
  mapWeatherOff: 'map-weather-off',
```

Replace with:

```js
  mapWeatherOff: 'map-weather-off',
  mapLayersSwapped: 'map-layers-swapped',
```

(b) In `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, find:

```js
 * Expected outcome: The Tech view, Weather turned off, and the open legend, all chosen from the shown row.
 * Exceptions: None.
 */
const TABS_SHOWN_SCENES = Object.freeze([SCENES.mapTech, SCENES.mapWeatherOff, SCENES.legendOpen]);
```

Replace with:

```js
 * Expected outcome: Tech turned on, Weather turned off, Control and Production swapped, and the open legend, all chosen
 *   from the shown row.
 * Exceptions: None.
 */
const TABS_SHOWN_SCENES = Object.freeze([SCENES.mapTech, SCENES.mapWeatherOff, SCENES.mapLayersSwapped, SCENES.legendOpen]);
```

(c) In the same file, find:

```js
    name: 'map-mode-weather-default',
```

Replace with:

```js
    name: 'map-mode-defaults',
```

(d) In the same file, find:

```js
        '#map-mode-control disabled',
        '#map-mode-production disabled',
```

Replace with:

```js
        '#map-mode-control pressed=true',
        '#map-mode-production pressed=false',
```

(e) In the same file, find:

```js
  {
    name: 'map-mode-weather-off',
```

Replace with:

```js
  {
    name: 'map-mode-layers-swapped',
    scenes: [SCENES.mapLayersSwapped],
    needs: ['#map-mode-weather', '#map-mode-tech', '#map-mode-control', '#map-mode-production'],
    run: (p, el) => {
      const line = ['#map-mode-weather', '#map-mode-tech', '#map-mode-control', '#map-mode-production']
        .map((selector) => `${selector} pressed=${el(selector).pressed}`)
        .join(', ');
      const expected = '#map-mode-weather pressed=true, #map-mode-tech pressed=false, #map-mode-control pressed=false, #map-mode-production pressed=true';
      return line === expected ? null : `the layer tabs read "${line}"`;
    },
  },
  {
    name: 'map-mode-weather-off',
```

(f) In `scripts/ui-smoke/ui-smoke.cjs`, find:

```js
  // Show the map-mode tabs from the toggle on the overview's corner; they start hidden and stay shown until the toggle
  // hides them in the small window below. Turn the Tech view on and record it with the weather icons still on, then
  // turn it off. Turn Weather off and record the map without weather icons, then turn it back on.
```

Replace with:

```js
  // Show the map-mode tabs from the toggle on the overview's corner; they start hidden and stay shown until the toggle
  // hides them in the small window below. Turn Tech on and record it with the weather icons still on, then turn it
  // off. Turn Weather off and record the map without weather icons, then turn it back on. Turn Control off and
  // Production on and record that, then put both back.
```

(g) In the same file, find:

```js
  await recordScene(page, report, outDir, SCENES.mapWeatherOff);
  await page.click('#map-mode-weather');
```

Replace with:

```js
  await recordScene(page, report, outDir, SCENES.mapWeatherOff);
  await page.click('#map-mode-weather');
  await page.click('#map-mode-control');
  await page.click('#map-mode-production');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.mapLayersSwapped);
  await page.click('#map-mode-control');
  await page.click('#map-mode-production');
```

- [ ] **Step 3.16: Update `doc/`**

These facts replace the old ones. Write them in each document's voice, in place.

- Tech shows or hides each hex's tech tier icon on the world map while the tech bonus is Low or High. It is off when the app opens. It no longer hides terrain fill or shows hex codes or production.
- Control is on when the app opens. It shows or hides the borders that mark who controls each world hex, and the home-region outlines at battle-detail zoom (`drawTerrainHexes` and `drawScenarioHomeRegionOutlines` in `src/renderer/rendering/terrainRendering.ts`). With it off, every hex keeps the normal grid stroke. It does not change the new-game preview's home-region rings.
- Production is off when the app opens. On, it shows production labels on every world hex, the way holding T does: opponent and neutral hexes too, unexplored hexes as plain `$N`, and, with fog of war off, both sides' queue timing. A label stays in its default place, and moves to the lower band only while T is held or when its hex has infrastructure or units.
- Tech and Production apply only on the world map: not in a battle and not under the new-game or game-over overlay (`isMapLayerShown` in `src/shared/mapViewMode.ts`, through `areTechIconsShown` and `isProductionDetailShown` in `src/renderer/gameplay/productionOverlayHelpers.ts`). Control and Weather work the same in every view where their layer is drawn.
- Every choice lasts until the app closes; none is saved.
- Holding T is unchanged: while the key is down it hides terrain fill, shows hex codes, the tech icons, and every production label, and moves labels to the lower band. Releasing it removes what T added; the tech icons stay while Tech is on, and the production labels on other hexes stay while Production is on. `isMapInspectionModeHeld` is now true only while T is held.
- The map-mode toggle's tips are "Show the map-mode buttons under the overview." and "Hide the map-mode buttons. Hiding them also closes the terrain legend."
- The tips of Tech, Control, and Production are the strings in Step 3.13.

Edit these documents:

1. `doc/ux/minimap.md`: Purpose (line 7), the tab list (Control and Production are no longer placeholders), the interaction bullets that describe Weather, Tech, and holding T, the paragraph on where the Tech view applies, States, and Code Entry Points: replace `` `isTerrainInspectionShown` `` with `` `isMapLayerShown` ``, list `` `isMapInspectionModeHeld`, `areTechIconsShown`, `isProductionDetailShown` `` for `productionOverlayHelpers.ts`, and add `src/renderer/map/mapViewModeState.ts` and `src/renderer/rendering/terrainRendering.ts` (`drawTerrainHexes`, `drawScenarioHomeRegionOutlines`) if they are not listed.
2. `doc/ux/map-surface.md`: every statement about the inspection view and the Tech view, including the terrain fill, hex code, tech icon, and production label bullets and the table rows that name Tech. Add the Control rule beside the ownership borders, and the Production rule beside the production labels.
3. `doc/ux/input-map.md`: the map-mode tabs row (Control and Production now toggle their layers) and the T rows and bullets (lines 21, 31, 45, and 50 when this plan was written). T no longer "changes nothing" while Tech is chosen.
4. `doc/ux/control-tooltips.md`: in the "is not available in this version" list, remove "and the Control and Production map modes"; replace the two toggle tips and the Tech tip; add a Control map mode line and a Production map mode line after the Tech line.
5. `doc/ui-style-guide.md`, `doc/how-to-play.md`, `doc/region-vs-region.md`, and `doc/ux/new-game-dialog.md`: any sentence the search below finds.

Then search:

```powershell
Select-String -Path doc\*.md,doc\ux\*.md,doc\ai-commander-prompts\*.md -Pattern 'Tech view','Tech tab is on','inspection view','Control and Production','isTerrainInspectionShown','map-mode-host','Weather, Tech, and Legend' -SimpleMatch
```

Each line it prints must either be gone or describe the new behavior. Leave `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, and `doc/market-research.md` alone. List any line you left as it is, and why, in your report.

- [ ] **Verify Phase 3**

Run the fast loop. Then the full tests. Expected: exit 0, test total **T0**, failure total **0**.

Then the smoke run:

```powershell
npm run ui:smoke -- --label map-layers
```

Expected: 0 failed and 0 page errors, with `PASS` lines for `map-mode-defaults` and `map-mode-layers-swapped`. Open these screenshots in `.test/ui-smoke/map-layers/` and describe them in your report:

- `map-tech`: terrain fill is still drawn and no hex codes show. Hexes that can produce units show the tech icon beside the weather icon.
- `map-layers-swapped`: no control borders on any hex; production labels on opponent and unexplored hexes as well as the player's own, in the same place they sit on the player's hexes.
- `strategic-1280x720`: control borders as before.

---

## Phase 4: Shared Panel Slide

The selection panel's height slide moves to a helper the new-game panel will also use. Behavior does not change.

- [ ] **Step 4.1: Create `src/renderer/chrome/panelSlideHelpers.ts`**

```ts
/**
 * The height slide that floating panels use between their compact and expanded states.
 *
 * Purpose: The selection panel and the new-game setup panel slide the same way and for the same time, and both skip the
 *   slide when the player asks for reduced motion.
 * When to use: `startPanelHeightSlide` from a panel's expand or collapse handler.
 * Expected outcome: One Web Animations slide per call; the caller keeps the returned handle.
 * Exceptions: None.
 */

/**
 * How long a panel takes to slide between its states, in milliseconds.
 *
 * Purpose: Long enough to show where the content comes from, short enough not to slow the player down.
 * When to use: The slide's duration.
 * Expected outcome: 150.
 * Exceptions: None.
 */
const PANEL_SLIDE_MS = 150;

/**
 * Reports whether the system asks for reduced motion.
 *
 * Purpose: The slide is skipped for players who turn motion off.
 * When to use: Before each slide.
 * Expected outcome: True when `prefers-reduced-motion: reduce` matches.
 * Exceptions: None; false when the media query cannot be read.
 */
function reducedMotionRequested(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Slides a panel's height from `from` to `to`.
 *
 * Purpose: One slide for every floating panel, so they all move alike.
 * When to use: After the panel's `data-state` shows the content the slide reveals, and the target height is measured.
 * Expected outcome: Returns the running animation, and calls `onFinish` with it when it ends on its own; a cancelled
 *   slide does not call it. Returns null, without calling `onFinish`, when motion is reduced, the heights are within a
 *   pixel, or the page cannot animate; the caller then settles the panel itself.
 * Exceptions: None.
 */
export function startPanelHeightSlide(
  panel: HTMLElement,
  from: number,
  to: number,
  onFinish: (slide: Animation) => void
): Animation | null {
  if (reducedMotionRequested() || Math.abs(from - to) < 1 || typeof panel.animate !== 'function') return null;
  const running = panel.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: PANEL_SLIDE_MS,
    easing: 'ease-out',
  });
  running.onfinish = () => onFinish(running);
  return running;
}
```

- [ ] **Step 4.2: Use it in `src/renderer/gameplay/selectionPanelExpand.ts`**

(a) Find:

```ts
import { applyDraggedPanelHeight, clearPanelHeight } from './selectionPanelResize';
```

Replace with:

```ts
import { applyDraggedPanelHeight, clearPanelHeight } from './selectionPanelResize';
import { startPanelHeightSlide } from '../chrome/panelSlideHelpers';
```

(b) Find:

```ts
/**
 * How long the panel takes to slide between its states, in milliseconds.
 *
 * Purpose: Long enough to show where the details come from, short enough not to slow the player down.
 * When to use: The slide's duration.
 * Expected outcome: 150.
 * Exceptions: None.
 */
const SELECTION_PANEL_SLIDE_MS = 150;

```

Replace with nothing: delete those lines, including the empty line after the constant.

(c) Find:

```ts
/**
 * Reports whether the system asks for reduced motion.
 *
 * Purpose: The slide is skipped for players who turn motion off.
 * When to use: Before each slide.
 * Expected outcome: True when `prefers-reduced-motion: reduce` matches.
 * Exceptions: None; false when the media query cannot be read.
 */
function reducedMotionRequested(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

```

Replace with nothing: delete those lines, including the empty line after the function.

(d) Find:

```ts
 * Expected outcome: The panel settles at once when motion is reduced, the heights match, or the page cannot animate.
 * Exceptions: None.
 */
function slidePanel(panel: HTMLElement, from: number, to: number): void {
  if (reducedMotionRequested() || Math.abs(from - to) < 1 || typeof panel.animate !== 'function') {
    settle(panel);
    return;
  }
  const running = panel.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    duration: SELECTION_PANEL_SLIDE_MS,
    easing: 'ease-out',
  });
  slide = running;
  running.onfinish = () => {
    if (slide === running) settle(panel);
  };
}
```

Replace with:

```ts
 * Expected outcome: The panel settles at once when `startPanelHeightSlide` declines to slide: motion is reduced, the
 *   heights match, or the page cannot animate. A slide that a later click replaced does not settle the panel.
 * Exceptions: None.
 */
function slidePanel(panel: HTMLElement, from: number, to: number): void {
  slide = startPanelHeightSlide(panel, from, to, (finished) => {
    if (slide === finished) settle(panel);
  });
  if (!slide) settle(panel);
}
```

- [ ] **Step 4.3: Update `doc/ux/selection-panel.md`**

In Code Entry Points, add this bullet after the bullet for `selectionPanelExpand.ts`:

```markdown
- `src/renderer/chrome/panelSlideHelpers.ts` (`startPanelHeightSlide`: the 150 ms height slide and the reduced-motion rule)
```

If there is no bullet for `selectionPanelExpand.ts`, add it as the section's last bullet.

- [ ] **Verify Phase 4**

Run the fast loop. Then:

```powershell
Select-String -Path src/renderer/gameplay/selectionPanelExpand.ts -Pattern 'SELECTION_PANEL_SLIDE_MS','reducedMotionRequested' -SimpleMatch
```

Expected: no output. Then the smoke run:

```powershell
npm run ui:smoke -- --label panel-slide
```

Expected: 0 failed and 0 page errors. The selection checks on `selection-expanded`, `selection-resized`, `selection-resized-min`, and `selection-collapsed` are the ones this phase can affect.

---

## Phase 5: Floating New-Game Panel

The setup panel becomes an absolutely positioned panel inside `#app-body`, over the map's top-left corner. The map no longer narrows for it. The panel has a 50 px header bar, slides between expanded and compact with the shared helper, and moves by a grip. Every open puts it back at the corner, expanded. The open panel is also an obstacle for the toast band. There is no close control yet; Phase 6 adds it.

- [ ] **Step 5.1: Add `floatingPanelOffset` to `src/shared/mapChromePlacement.ts`**

(a) Find:

```ts
 * buttons at the top-right, and the toast band between them.
```

Replace with:

```ts
 * buttons at the top-right, the toast band between them, and the new-game setup panel that floats over the map.
```

(b) Find:

```ts
 * When to use: Through `legendPopoverPosition` and `toastBandSpan`.
 * Expected outcome: 12.
```

Replace with:

```ts
 * When to use: Through `legendPopoverPosition`, `toastBandSpan`, and `floatingPanelOffset`.
 * Expected outcome: 12.
```

(c) At the end of the file, after the closing `}` of `toastBandSpan`, add an empty line and then:

```ts
/**
 * Keeps a floating panel inside the map, with the inset to spare.
 *
 * Purpose: A panel the player drags must stay reachable: its header and grip never leave the map.
 * When to use: While the new-game setup panel is dragged, when its height changes, and when the window changes size,
 *   with the wanted offsets measured from the map's top-left corner.
 * Expected outcome: `left` and `top` clamped to at least `MAP_CHROME_INSET`, and to at most the map's size less the
 *   panel's size and the inset. A panel larger than the map on an axis sits at the inset on that axis.
 * Exceptions: None.
 */
export function floatingPanelOffset(input: {
  readonly left: number;
  readonly top: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
}): { readonly left: number; readonly top: number } {
  const maxLeft = Math.max(MAP_CHROME_INSET, input.mapWidth - input.panelWidth - MAP_CHROME_INSET);
  const maxTop = Math.max(MAP_CHROME_INSET, input.mapHeight - input.panelHeight - MAP_CHROME_INSET);
  return {
    left: Math.min(maxLeft, Math.max(MAP_CHROME_INSET, input.left)),
    top: Math.min(maxTop, Math.max(MAP_CHROME_INSET, input.top)),
  };
}
```

- [ ] **Step 5.2: Test it in `src/shared/mapChromePlacement.test.ts`**

(a) Find:

```ts
import { legendPopoverPosition, toastBandSpan } from './mapChromePlacement';
```

Replace with:

```ts
import { floatingPanelOffset, legendPopoverPosition, toastBandSpan } from './mapChromePlacement';
```

(b) At the end of the file, add an empty line and then:

```ts
test('floatingPanelOffset leaves a panel that fits where it was dragged', () => {
  assert.deepEqual(
    floatingPanelOffset({ left: 212, top: 112, panelWidth: 432, panelHeight: 400, mapWidth: 1280, mapHeight: 756 }),
    { left: 212, top: 112 }
  );
});

test('floatingPanelOffset keeps a dragged panel the inset inside every edge', () => {
  assert.deepEqual(
    floatingPanelOffset({ left: 2000, top: -50, panelWidth: 432, panelHeight: 400, mapWidth: 1280, mapHeight: 756 }),
    { left: 836, top: 12 }
  );
  assert.deepEqual(
    floatingPanelOffset({ left: -50, top: 900, panelWidth: 432, panelHeight: 400, mapWidth: 1280, mapHeight: 756 }),
    { left: 12, top: 344 }
  );
});

test('floatingPanelOffset puts a panel larger than the map at the inset', () => {
  assert.deepEqual(
    floatingPanelOffset({ left: 200, top: 200, panelWidth: 432, panelHeight: 800, mapWidth: 800, mapHeight: 556 }),
    { left: 200, top: 12 }
  );
});
```

- [ ] **Step 5.3: Create `src/renderer/gameplay/newGameDialogMove.ts`**

```ts
/**
 * Moving the new-game setup panel by its grip.
 *
 * Purpose: The panel floats over the map's top-left corner; the player can drag it aside to see the preview under it.
 *   It goes back to the corner each time the overlay opens.
 * When to use: `wireNewGameDialogMove` once at startup, `placeNewGameDialogAtInset` on each open, and
 *   `keepNewGameDialogOnMap` when the panel's height or the window changes.
 * Expected outcome: Inline `left` and `top` on `#game-over-overlay` once it has been moved, always inside `#app-body`
 *   with `MAP_CHROME_INSET` to spare; no inline position while it sits at the corner.
 * Exceptions: None; missing elements are skipped.
 */
import { floatingPanelOffset } from '../../shared/mapChromePlacement';
import { layoutMapChrome } from '../map/mapChromeLayout';

/**
 * Where a drag started: the pointer, and the panel's offset inside `#app-body`.
 *
 * Purpose: Each move places the panel by the pointer's distance from the start, so the panel never drifts.
 * When to use: Recorded on the grip's pointer down; read on each pointer move.
 * Expected outcome: CSS pixels.
 * Exceptions: None.
 */
interface DragStart {
  /** The pointer's x when the drag started, in viewport pixels. */
  readonly x: number;
  /** The pointer's y when the drag started, in viewport pixels. */
  readonly y: number;
  /** The panel's left offset inside `#app-body` when the drag started. */
  readonly left: number;
  /** The panel's top offset inside `#app-body` when the drag started. */
  readonly top: number;
}

/**
 * The drag in progress, if any.
 *
 * Purpose: Pointer moves only move the panel between the grip's pointer down and pointer up.
 * When to use: Set on pointer down; cleared on pointer up, on pointer cancel, and when the overlay opens.
 * Expected outcome: Null while no drag is running.
 * Exceptions: None.
 */
let dragStart: DragStart | null = null;

/**
 * Finds the panel and the area it floats in.
 *
 * Purpose: Every function here needs both.
 * When to use: At the start of each function in this module.
 * Expected outcome: `#game-over-overlay` and `#app-body`, or null when either is missing.
 * Exceptions: None.
 */
function dialogAndArea(): { readonly panel: HTMLElement; readonly area: HTMLElement } | null {
  const panel = document.getElementById('game-over-overlay');
  const area = document.getElementById('app-body');
  if (!panel || !area) return null;
  return { panel, area };
}

/**
 * Places the panel at a wanted offset, held inside the area.
 *
 * Purpose: Dragging, a height change, and a window change all place the panel through the same rule.
 * When to use: From the drag and from `keepNewGameDialogOnMap`. Pass `panelHeight` when the panel is about to change
 *   height, so the clamp uses the height it is about to have.
 * Expected outcome: Inline `left` and `top` from `floatingPanelOffset`.
 * Exceptions: None.
 */
function applyOffset(panel: HTMLElement, area: HTMLElement, left: number, top: number, panelHeight = panel.offsetHeight): void {
  const place = floatingPanelOffset({
    left,
    top,
    panelWidth: panel.offsetWidth,
    panelHeight,
    mapWidth: area.clientWidth,
    mapHeight: area.clientHeight,
  });
  panel.style.left = `${place.left}px`;
  panel.style.top = `${place.top}px`;
}

/**
 * Puts the panel back at the map's top-left corner.
 *
 * Purpose: Every open starts at the corner, wherever the player left the panel last time.
 * When to use: Each time the overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: No drag is running, the panel has no inline position, so the stylesheet's 12 px inset applies, and
 *   the toast band is placed again around it.
 * Exceptions: None.
 */
export function placeNewGameDialogAtInset(): void {
  dragStart = null;
  const parts = dialogAndArea();
  if (!parts) return;
  parts.panel.style.removeProperty('left');
  parts.panel.style.removeProperty('top');
  layoutMapChrome();
}

/**
 * Pulls a moved panel back inside the map.
 *
 * Purpose: A panel dragged low can run off the map when it expands or when the window shrinks.
 * When to use: Before an expand slide, with the expanded height, and on every window resize.
 * Expected outcome: A panel at the corner, or a hidden one, is left alone. A moved panel keeps its offset when it fits,
 *   and otherwise moves just enough to keep the inset.
 * Exceptions: None.
 */
export function keepNewGameDialogOnMap(panelHeight?: number): void {
  const parts = dialogAndArea();
  if (!parts || parts.panel.style.left === '' || parts.panel.classList.contains('hidden')) return;
  applyOffset(parts.panel, parts.area, parts.panel.offsetLeft, parts.panel.offsetTop, panelHeight ?? parts.panel.offsetHeight);
}

/**
 * Ends a drag.
 *
 * Purpose: The toast band avoids the panel, so it is placed again once the panel stops moving.
 * When to use: On the grip's pointer up and pointer cancel.
 * Expected outcome: No drag is running and the toast band is placed again. Nothing happens when no drag was running.
 * Exceptions: None.
 */
function endDrag(): void {
  if (!dragStart) return;
  dragStart = null;
  layoutMapChrome();
}

/**
 * Wires the grip and the window resize.
 *
 * Purpose: The move feature's single setup point, in the same pattern as the selection panel's resize grip.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: A primary-button drag on `#new-game-panel-grip` moves the panel with the pointer, held inside the
 *   map. A window resize keeps a moved panel inside the map.
 * Exceptions: None; does nothing when the grip is missing.
 */
export function wireNewGameDialogMove(): void {
  const grip = document.getElementById('new-game-panel-grip');
  if (!grip) return;
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const parts = dialogAndArea();
    if (!parts) return;
    event.preventDefault();
    dragStart = { x: event.clientX, y: event.clientY, left: parts.panel.offsetLeft, top: parts.panel.offsetTop };
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener('pointermove', (event) => {
    const parts = dialogAndArea();
    if (!dragStart || !parts) return;
    applyOffset(parts.panel, parts.area, dragStart.left + event.clientX - dragStart.x, dragStart.top + event.clientY - dragStart.y);
  });
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => keepNewGameDialogOnMap());
}
```

- [ ] **Step 5.4: Replace `src/renderer/gameplay/newGameDialogCollapse.ts`**

Replace the whole file with:

```ts
/**
 * The new-game setup panel's two states: expanded, the header bar over the choices and Start, and compact, the header
 * bar alone. The expand control at the bar's left edge switches them, and the panel slides between them from its top
 * edge, so the choices open downward under the bar.
 *
 * Purpose: Lets the player see more of the preview map without closing the screen.
 * When to use: `expandNewGameDialog` whenever the overlay opens; `toggleNewGameDialogCollapsed` from the expand control.
 * Expected outcome: `data-state` on `#game-over-overlay` is `compact`, `expanding`, `expanded`, or `collapsing`. The
 *   styles hide the body and the footer only while compact, and turn the chevron up while expanded or collapsing.
 * Exceptions: None; missing elements are skipped.
 */
import { startPanelHeightSlide } from '../chrome/panelSlideHelpers';
import { keepNewGameDialogOnMap } from './newGameDialogMove';

/**
 * Accessible name and tip while the choices are showing.
 *
 * Purpose: Says that the next click hides the choices, and why the player would.
 * When to use: When the expand control is synced while expanded.
 * Expected outcome: `aria-label` is the short name and `data-control-tooltip` is the longer tip.
 * Exceptions: None.
 */
const EXPANDED_LABEL = 'Hide the new game choices';
const EXPANDED_TOOLTIP = 'Hide the new game choices to see more of the map.';

/**
 * Accessible name and tip while the choices are hidden.
 *
 * Purpose: Says that the next click shows the choices again.
 * When to use: When the expand control is synced while compact.
 * Expected outcome: `aria-label` and `data-control-tooltip` both say to show the choices.
 * Exceptions: None.
 */
const COLLAPSED_LABEL = 'Show the new game choices';
const COLLAPSED_TOOLTIP = 'Show the new game choices.';

/**
 * Whether the player last chose the expanded state.
 *
 * Purpose: The state a slide ends in, and the state the expand control describes.
 * When to use: Read and written only in this module.
 * Expected outcome: True whenever the overlay has just opened.
 * Exceptions: None.
 */
let expanded = true;

/**
 * The slide in progress, if any.
 *
 * Purpose: A click during a slide starts the next slide from where this one is.
 * When to use: Set when a slide starts; cleared when it ends or is cancelled.
 * Expected outcome: Null while the panel is settled.
 * Exceptions: None.
 */
let slide: Animation | null = null;

/**
 * Reports whether the new-game overlay is on screen.
 *
 * Purpose: Map clicks and the unit cursor must stay off for the whole time that overlay is up, expanded or compact.
 * When to use: From map gesture handlers and the map cursor update.
 * Expected outcome: True when `#game-over-overlay` is present and does not have `hidden`. Compact does not count as closed.
 * Exceptions: None.
 */
export function newGameOverlayIsOpen(): boolean {
  const overlay = document.getElementById('game-over-overlay');
  return overlay != null && !overlay.classList.contains('hidden');
}

/**
 * Finds the panel, its header bar, and the expand control.
 *
 * Purpose: Both exported actions need all three.
 * When to use: At the start of `expandNewGameDialog` and `toggleNewGameDialogCollapsed`.
 * Expected outcome: The three elements, or null when any is missing.
 * Exceptions: None.
 */
function dialogParts(): { readonly panel: HTMLElement; readonly header: HTMLElement; readonly button: HTMLButtonElement } | null {
  const panel = document.getElementById('game-over-overlay');
  const header = document.getElementById('new-game-panel-header');
  const button = document.getElementById('new-game-dialog-collapse');
  if (!panel || !header || !(button instanceof HTMLButtonElement)) return null;
  return { panel, header, button };
}

/**
 * Sets the expand control's state, name, and tip from the player's choice.
 *
 * Purpose: Assistive technology and the tip must say what the next click does as soon as it is clicked.
 * When to use: After the choice changes.
 * Expected outcome: `aria-expanded`, `aria-label`, and the tip match `expanded`.
 * Exceptions: None.
 */
function syncCollapseControl(button: HTMLButtonElement): void {
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', expanded ? EXPANDED_LABEL : COLLAPSED_LABEL);
  button.setAttribute('data-control-tooltip', expanded ? EXPANDED_TOOLTIP : COLLAPSED_TOOLTIP);
}

/**
 * Ends the panel in the state the player chose, with no slide running.
 *
 * Purpose: One place that leaves the panel settled, after a slide or without one.
 * When to use: When a slide finishes, when no slide is needed, and when the overlay opens.
 * Expected outcome: `data-state` is `expanded` or `compact`.
 * Exceptions: None.
 */
function settle(panel: HTMLElement): void {
  slide?.cancel();
  slide = null;
  panel.dataset.state = expanded ? 'expanded' : 'compact';
}

/**
 * Slides the panel's height from `from` to `to`, then settles it.
 *
 * Purpose: The panel's top edge stays put, so a changing height opens or closes the choices under the bar.
 * When to use: From `toggleNewGameDialogCollapsed`, after `data-state` shows the content and the target height is known.
 * Expected outcome: The panel settles at once when `startPanelHeightSlide` declines to slide. A slide that a later click
 *   replaced does not settle the panel.
 * Exceptions: None.
 */
function slideTo(panel: HTMLElement, from: number, to: number): void {
  slide = startPanelHeightSlide(panel, from, to, (finished) => {
    if (slide === finished) settle(panel);
  });
  if (!slide) settle(panel);
}

/**
 * Shows the new-game choices at once, with no slide.
 *
 * Purpose: Opening the overlay always starts expanded, including after the player had collapsed it.
 * When to use: Only when the overlay goes from hidden to shown, and before pointer input is disabled for that open.
 * Expected outcome: The panel is expanded and the expand control says it hides the choices. The camera does not move.
 * Exceptions: None. Missing elements leave the panel unchanged.
 */
export function expandNewGameDialog(): void {
  const parts = dialogParts();
  if (!parts) return;
  expanded = true;
  syncCollapseControl(parts.button);
  settle(parts.panel);
}

/**
 * Switches the panel between expanded and compact.
 *
 * Purpose: The expand control's single action.
 * When to use: On a click on `#new-game-dialog-collapse`, which also covers Enter and Space.
 * Expected outcome: The choice flips at once. Expanding shows the choices and grows the panel to its content, held
 *   inside the map; collapsing drops focus from the choices and shrinks the panel to the header bar. A click during a
 *   slide starts from the panel's current height. The map keeps the pointer either way.
 * Exceptions: None. Missing elements leave the panel unchanged.
 */
export function toggleNewGameDialogCollapsed(): void {
  const parts = dialogParts();
  if (!parts) return;
  const { panel, header, button } = parts;
  const from = panel.getBoundingClientRect().height;
  slide?.cancel();
  slide = null;
  expanded = !expanded;
  syncCollapseControl(button);
  if (expanded) {
    panel.dataset.state = 'expanding';
    const to = panel.getBoundingClientRect().height;
    keepNewGameDialogOnMap(to);
    slideTo(panel, from, to);
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && panel.contains(active) && !header.contains(active)) active.blur();
  panel.dataset.state = 'collapsing';
  const borders = panel.offsetHeight - panel.clientHeight;
  slideTo(panel, from, header.offsetHeight + borders);
}

/**
 * Lets the main map take drag and wheel while the new-game overlay is open.
 *
 * Purpose: The setup panel floats over the map's corner, and the rest of the map stays live, so the player can pan and
 *   zoom the preview with the panel expanded or compact. Disabling the match controls writes `pointer-events: none`
 *   onto the map on every refresh, so this runs after that call.
 * When to use: After that disable or enable call.
 * Expected outcome: An open overlay sets the map to `auto`. A closed overlay leaves the map as the enable or disable
 *   call wrote it, so the annihilation dialog keeps the map off. Map gestures still do not select or order while the
 *   overlay is open; the gesture handlers check `newGameOverlayIsOpen`.
 * Exceptions: None.
 */
export function syncNewGameDialogMapPointer(): void {
  const overlay = document.getElementById('game-over-overlay');
  const map = document.getElementById('main-map');
  if (!(overlay instanceof HTMLElement) || !(map instanceof HTMLElement)) return;
  if (overlay.classList.contains('hidden')) return;
  map.style.pointerEvents = 'auto';
}
```

- [ ] **Step 5.5: Make the open panel a toast obstacle in `src/renderer/map/mapChromeLayout.ts`**

(a) Find:

```ts
 * Expected outcome: Inline `left`, `top`, and `right` on `#terrain-legend` and `#map-toast-band`.
```

Replace with:

```ts
 * Expected outcome: Inline `left`, `top`, and `right` on `#terrain-legend` and `#map-toast-band`. While the new-game
 *   setup panel is open over the map, the band also keeps clear of it.
```

(b) Find:

```ts
    if (place.beside) leftObstacleRight = place.left + legend.offsetWidth;
  }
```

Replace with:

```ts
    if (place.beside) leftObstacleRight = place.left + legend.offsetWidth;
  }
  const dialog = document.getElementById('game-over-overlay');
  if (dialog && !dialog.classList.contains('hidden')) {
    leftObstacleRight = Math.max(leftObstacleRight, dialog.getBoundingClientRect().right - mapBox.left);
  }
```

(c) Find:

```ts
 *   panel, or of the legend when the legend is beside it, and left of the zoom buttons; on a narrow map it spans the top
 *   of the map instead. A closed legend is left where it was.
```

Replace with:

```ts
 *   panel, or of the legend when the legend is beside it, or of the open new-game panel when that reaches farther, and
 *   left of the zoom buttons; on a narrow map it spans the top of the map instead. A closed legend is left where it was.
```

- [ ] **Step 5.6: Wire the move and reset the position in `src/renderer/gameplay/newGame.ts`**

(a) Find:

```ts
import { expandNewGameDialog, toggleNewGameDialogCollapsed } from './newGameDialogCollapse';
```

Replace with:

```ts
import { expandNewGameDialog, toggleNewGameDialogCollapsed } from './newGameDialogCollapse';
import { placeNewGameDialogAtInset, wireNewGameDialogMove } from './newGameDialogMove';
```

(b) Find:

```ts
  document.getElementById('new-game-dialog-collapse')?.addEventListener('click', () => {
    toggleNewGameDialogCollapsed();
  });
  registerRegionRandomizeButtons();
```

Replace with:

```ts
  document.getElementById('new-game-dialog-collapse')?.addEventListener('click', () => {
    toggleNewGameDialogCollapsed();
  });
  wireNewGameDialogMove();
  registerRegionRandomizeButtons();
```

(c) Find:

```ts
 * Expected outcome: The randomize buttons and the game-size caps are live. Clicking Start sends
```

Replace with:

```ts
 * Expected outcome: The randomize buttons, the game-size caps, and the panel's grip are live. Clicking Start sends
```

(d) Find:

```ts
  overlay?.classList.remove('hidden');
  expandNewGameDialog();
  blurMapChromeIfFocused();
```

Replace with:

```ts
  overlay?.classList.remove('hidden');
  expandNewGameDialog();
  placeNewGameDialogAtInset();
  blurMapChromeIfFocused();
```

- [ ] **Step 5.7: Reset the position in `src/renderer/core/uiState.ts`**

(a) Find:

```ts
import { expandNewGameDialog, newGameOverlayIsOpen, syncNewGameDialogMapPointer } from '../gameplay/newGameDialogCollapse';
```

Replace with:

```ts
import { expandNewGameDialog, newGameOverlayIsOpen, syncNewGameDialogMapPointer } from '../gameplay/newGameDialogCollapse';
import { placeNewGameDialogAtInset } from '../gameplay/newGameDialogMove';
```

(b) Find:

```ts
    closeGameMenu();
    expandNewGameDialog();
    blurMapChromeIfFocused();
```

Replace with:

```ts
    closeGameMenu();
    expandNewGameDialog();
    placeNewGameDialogAtInset();
    blurMapChromeIfFocused();
```

(c) Find:

```ts
 *   New game item follows the overlay. The new-game overlay sits beside the map pane, not in it, so this never turns
 *   it off. While it is open, the main map takes the pointer again so drag and the wheel move the preview.
```

Replace with:

```ts
 *   New game item follows the overlay. The new-game overlay floats over the map pane but is not inside it, so this
 *   never turns it off. While it is open, the main map takes the pointer again so drag and the wheel move the preview.
```

(d) Find:

```ts
 *   drawn only when the overlay opens, and that open closes the game menu. The choices start showing only on that
 *   open. A later refresh leaves hidden choices hidden.
```

Replace with:

```ts
 *   drawn only when the overlay opens, and that open closes the game menu. The panel starts expanded, at the map's
 *   top-left corner, only on that open. A later refresh leaves a collapsed or moved panel as it is.
```

- [ ] **Step 5.8: The panel's markup in `static/index.html`**

Find:

```html
  <!-- #app-body holds the new-game setup panel while it is open, the map (#canvas-container), and the console (#sidebar), side by side. -->
  <div id="app-body">
  <!-- The new-game setup panel: docked at the left, beside the map, while the new-game overlay is open. -->
  <div id="game-over-overlay" class="new-game-panel hidden" aria-live="polite">
    <div class="new-game-panel-header">
      <button type="button" id="new-game-dialog-collapse" class="compact-blue-btn compact-square-btn" aria-expanded="true" aria-controls="game-over-dialog" aria-label="Hide the new game choices" data-control-tooltip="Hide the new game choices and widen the map.">-</button>
      <p id="game-over-message"></p>
    </div>
```

Replace with:

```html
  <!-- #app-body holds the map (#canvas-container) and the console (#sidebar), side by side, and the new-game setup panel, which floats over the map's top-left corner while it is open. -->
  <div id="app-body">
  <!-- The new-game setup panel: floats over the map while the new-game overlay is open. The grip moves it; each open puts it back in the corner. -->
  <div id="game-over-overlay" class="new-game-panel hidden" data-state="expanded" aria-live="polite">
    <div id="new-game-panel-grip" class="new-game-panel-grip" aria-hidden="true" data-control-tooltip="Drag to move this screen. It goes back to the corner each time it opens."></div>
    <div id="new-game-panel-header" class="new-game-panel-header">
      <button type="button" id="new-game-dialog-collapse" class="new-game-panel-expand" aria-expanded="true" aria-controls="game-over-dialog" aria-label="Hide the new game choices" data-control-tooltip="Hide the new game choices to see more of the map."><svg class="chrome-icon new-game-panel-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5 4.5-4.5"></path></svg></button>
      <p id="game-over-message"></p>
    </div>
```

- [ ] **Step 5.9: The panel's styles in `static/newGameChrome.css`**

(a) Find:

```css
/* The new-game screen. While the new-game overlay is open, the top bar becomes the new-game bar, and the setup panel is
   docked at the left of the window, under the top bar, with the map preview beside it. The panel's header holds the
   hide-choices button and the message, the body holds the Map, Forces, and Rules sections and scrolls, and the footer
   holds Start game. Hiding the choices leaves only that button, in the same spot over the map's top-left corner, and
   the map widens under it. */
```

Replace with:

```css
/* The new-game screen. While the new-game overlay is open, the top bar becomes the new-game bar, and the setup panel
   floats over the map's top-left corner, with the map preview under and around it. The panel's header bar holds the
   expand control and the message, the body holds the Map, Forces, and Rules sections and scrolls, and the footer holds
   Start game. Hiding the choices leaves only the header bar. The grip on the panel's top-right corner moves it. */
```

(b) Delete from the line `/* ---------- Panel ---------- */` up to the line `/* ---------- Sections ---------- */`. That removes the old Panel and Hidden choices sections and keeps the Sections line. Put this block in their place, followed by one empty line before `/* ---------- Sections ---------- */`:

```css
/* ---------- Panel ---------- */
/* A floating panel 12 px in from the map's top-left corner, in the selection panel's chrome. It is as tall as its
   content, up to the map's height less both insets, and the body scrolls past that. newGameDialogMove.ts writes inline
   `left` and `top` once the player drags the grip, and clears them each time the overlay opens. */
.new-game-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 7002;
  width: var(--new-game-panel-width);
  max-width: calc(100% - 24px);
  max-height: calc(100% - 24px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  color-scheme: dark;
  border: 1px solid var(--chrome-border);
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
.new-game-panel.hidden {
  display: none;
}
/* Compact is the header bar alone. The body and the footer show in every other state, including during a slide. */
.new-game-panel[data-state="compact"] .new-game-panel-body,
.new-game-panel[data-state="compact"] .new-game-panel-footer {
  display: none;
}
/* One 50 px bar, the selection bar's height. Its bottom border turns transparent while compact, so the compact panel is
   the bar inside the panel's own border. */
.new-game-panel-header {
  flex: none;
  height: 50px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  border-bottom: 1px solid var(--chrome-border);
}
.new-game-panel[data-state="compact"] .new-game-panel-header {
  border-bottom-color: transparent;
}
#game-over-message {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0 10px 0 0;
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The expand control at the bar's left edge, like the selection panel's: a full-height 32 px column with a divider on
   its inner side. The chevron points down while the choices are hidden and turns up while they show. */
.new-game-panel-expand {
  flex: none;
  align-self: stretch;
  width: 32px;
  min-width: 0;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-right: 1px solid var(--chrome-divider);
  border-radius: 0;
  background: transparent;
  color: var(--chrome-text);
}
.new-game-panel-expand:hover {
  background: var(--chrome-bg-raised);
}
.new-game-panel-expand:focus {
  outline-offset: -2px;
}
.new-game-panel[data-state="expanded"] .new-game-panel-chevron,
.new-game-panel[data-state="collapsing"] .new-game-panel-chevron {
  transform: rotate(180deg);
}
.new-game-panel-body {
  flex: 0 1 auto;
  min-height: 0;
  overflow: auto;
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
/* The move grip on the panel's top-right corner, drawn like the selection panel's resize grip. It shows in both
   states, so the header bar alone can be moved too. */
.new-game-panel-grip {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 0;
  width: 14px;
  height: 14px;
  cursor: move;
  touch-action: none;
  background: linear-gradient(225deg, transparent 0 3px, var(--chrome-border) 3px 4px, transparent 4px 6px, var(--chrome-border) 6px 7px, transparent 7px);
  border-top-right-radius: 6px;
}
```

(c) Find:

```css
/* A square the height of the dropdown beside it. `--new-game-collapse-size` copies this size onto the hide-choices
   button. */
```

Replace with:

```css
/* A square the height of the dropdown beside it. */
```

Then check:

```powershell
Select-String -Path static/newGameChrome.css,static/index.html,src/renderer/gameplay/newGameDialogCollapse.ts -Pattern 'game-over-dialog-collapsed','new-game-collapse-size','compact-square-btn" aria-expanded' -SimpleMatch
```

Expected: no output.

- [ ] **Step 5.10: The panel width's comment in `static/shellChrome.css`**

Find:

```css
  /* The new-game setup panel's width, docked at the left of the window while the new-game overlay is open. */
```

Replace with:

```css
  /* The new-game setup panel's width. The panel floats over the map's top-left corner while the new-game overlay is open. */
```

- [ ] **Step 5.11: The grip's tip in `src/renderer/chrome/frameTooltipText.ts`**

Find:

```ts
export const mapLegendToggleTooltipText = 'Show or hide the terrain legend and its style choice.';
```

Replace with:

```ts
export const mapLegendToggleTooltipText = 'Show or hide the terrain legend and its style choice.';

/**
 * The new-game setup panel's grip tip.
 *
 * Purpose: Says the grip moves the panel, and that each open puts it back in the corner.
 * When to use: `#new-game-panel-grip`. The static markup holds this sentence.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const newGameGripTooltipText = 'Drag to move this screen. It goes back to the corner each time it opens.';
```

- [ ] **Step 5.12: Comments in `src/renderer/gameplay/newGameMapPreviewUi.ts`**

(a) Find:

```ts
 * Expected outcome: The camera fits the map beside the setup panel when the extent changes
```

Replace with:

```ts
 * Expected outcome: The camera fits the map under the setup panel when the extent changes
```

(b) Find:

```ts
      // The setup panel takes the left of the window as the overlay opens, so fit to the map's size now rather than the
      // size Leaflet last measured.
```

Replace with:

```ts
      // The console leaves the window as the overlay opens, so fit to the map's size now rather than the size Leaflet
      // last measured.
```

- [ ] **Step 5.13: Smoke helpers, scene, and checks**

(a) In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find:

```js
  newGameHidden: 'new-game-hidden',
  strategic: 'strategic',
```

Replace with:

```js
  newGameHidden: 'new-game-hidden',
  newGameMoved: 'new-game-moved',
  strategic: 'strategic',
```

(b) In the same file, find:

```js
 * Expected outcome: The first scene, the game menu opened on it, the choices hidden, the overlay opened from a match
 *   and its Regional tab, and the finished match reopened, then at the 800 x 600 minimum.
 * Exceptions: None.
 */
const NEW_GAME_SCENES = Object.freeze([
  SCENES.newGameStartup,
  SCENES.newGameMenu,
  SCENES.newGameHidden,
```

Replace with:

```js
 * Expected outcome: The first scene, the game menu opened on it, the choices hidden, the panel moved by its grip, the
 *   overlay opened from a match and its Regional tab, and the finished match reopened, then at the 800 x 600 minimum.
 * Exceptions: None.
 */
const NEW_GAME_SCENES = Object.freeze([
  SCENES.newGameStartup,
  SCENES.newGameMenu,
  SCENES.newGameHidden,
  SCENES.newGameMoved,
```

(c) In the same file, find:

```js
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500, tip: 1500, turn: 120000 });
```

Replace with:

```js
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500, tip: 1500, turn: 120000 });

/**
 * How far the run drags the new-game panel by its grip, in CSS pixels.
 *
 * Purpose: The runner drags by this offset and the moved-panel check expects it, held inside the map.
 * When to use: The new-game moved scene and its check.
 * Expected outcome: 200 right and 100 down.
 * Exceptions: None.
 */
const NEW_GAME_MOVE = Object.freeze({ x: 200, y: 100 });
```

(d) In the same file, find:

```js
  MATCH_SCENES,
  SETTLE_MS,
```

Replace with:

```js
  MATCH_SCENES,
  SETTLE_MS,
  NEW_GAME_MOVE,
```

(e) In `scripts/ui-smoke/ui-smoke-map.cjs`, find:

```js
/**
 * Drags the selection panel's resize grip by an offset and lets go.
 *
 * Purpose: Exercises the grip the way a player would, including its size limits.
 * When to use: While the selection panel is shown. Keep the end point inside the window.
 * Expected outcome: The panel takes the dragged size, held inside its limits.
 * Exceptions: Throws when the grip is not on screen.
 */
async function dragSelectionPanelGrip(page, dx, dy) {
  const box = await page.locator('#selection-panel-grip').boundingBox();
  if (!box) throw new Error('the selection panel grip is not on screen');
```

Replace with:

```js
/**
 * Drags the selection panel's resize grip by an offset and lets go.
 *
 * Purpose: Exercises the grip the way a player would, including its size limits.
 * When to use: While the selection panel is shown. Keep the end point inside the window.
 * Expected outcome: The panel takes the dragged size, held inside its limits.
 * Exceptions: Throws when the grip is not on screen.
 */
async function dragSelectionPanelGrip(page, dx, dy) {
  await dragGrip(page, '#selection-panel-grip', dx, dy);
}

/**
 * Drags a panel grip by an offset and lets go.
 *
 * Purpose: The selection panel's resize grip and the new-game panel's move grip are dragged the same way a player would.
 * When to use: While the grip is on screen. Keep the end point inside the window.
 * Expected outcome: The pointer presses the grip's center, moves by the offset in eight steps, and lets go; then the
 *   map settles.
 * Exceptions: Throws when the grip is not on screen.
 */
async function dragGrip(page, gripSelector, dx, dy) {
  const box = await page.locator(gripSelector).boundingBox();
  if (!box) throw new Error(`${gripSelector} is not on screen`);
```

(f) In the same file, find:

```js
  dragSelectionPanelGrip,
  readGameState,
```

Replace with:

```js
  dragGrip,
  dragSelectionPanelGrip,
  readGameState,
```

(g) In `scripts/ui-smoke/ui-smoke.cjs`, find:

```js
const { SETTLE_MS } = require('./ui-smoke-scenes.cjs');
```

Replace with:

```js
const { NEW_GAME_MOVE, SETTLE_MS } = require('./ui-smoke-scenes.cjs');
```

(h) In the same file, find:

```js
  contestedHexEdit,
  dragSelectionPanelGrip,
```

Replace with:

```js
  contestedHexEdit,
  dragGrip,
  dragSelectionPanelGrip,
```

(i) In the same file, find:

```js
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

Replace with:

```js
  // Hiding the choices leaves only the header bar over the map. Show them again, then move the panel by its grip; the
  // next open puts it back in the corner.
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameHidden);
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await dragGrip(page, '#new-game-panel-grip', NEW_GAME_MOVE.x, NEW_GAME_MOVE.y);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.newGameMoved);

  await startScenarioMatch(page);
```

(j) In `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, find:

```js
 * Checks of the new-game screen for the UI smoke run: the top bar while the new-game overlay is open, the game menu
 * there, the setup panel docked at the left with its Map, Forces, and Rules sections, and the map beside it.
```

Replace with:

```js
 * Checks of the new-game screen for the UI smoke run: the top bar while the new-game overlay is open, the game menu
 * there, the setup panel floating over the map with its Map, Forces, and Rules sections, and the map under it.
```

(k) In the same file, find:

```js
const { TOPBAR_HEIGHT, SCENES, NEW_GAME_SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');
```

Replace with:

```js
const { TOPBAR_HEIGHT, SCENES, NEW_GAME_SCENES, NEW_GAME_MOVE, near, fmt } = require('./ui-smoke-scenes.cjs');
```

(l) In the same file, find:

```js
 * Purpose: The panel is docked at the left, the hide-choices button sits 12 px in from the panel's top-left corner,
 *   Start game spans the footer inside its 18 px padding, and each section's content sits inside 18 px of padding. A
 *   map row's dropdown starts after that padding, the 5em label column (65 px at the rows' 13 px text), and a 6 px gap.
 * When to use: The panel, hidden-choices, and section checks.
 * Expected outcome: Matches `--new-game-panel-width` in `static/shellChrome.css` and the padding, the label column,
 *   and the gap in `static/newGameChrome.css`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({ width: 432, headerInset: 12, footerInset: 18, sectionInset: 18, rowSelectInset: 89 });
```

Replace with:

```js
 * Purpose: The panel floats 12 px in from the map's top-left corner, inside a 1 px border. Its header bar is 50 px
 *   tall, with the 32 px expand control at its left edge. Start game spans the footer inside 18 px of side padding and
 *   12 px of bottom padding, and each section's content sits inside 18 px of padding. A map row's dropdown starts
 *   after that padding, the 5em label column (65 px at the rows' 13 px text), and a 6 px gap.
 * When to use: The panel, hidden-choices, moved-panel, and section checks.
 * Expected outcome: Matches `--new-game-panel-width` in `static/shellChrome.css`, `MAP_CHROME_INSET` in
 *   `src/shared/mapChromePlacement.ts`, and the sizes in `static/newGameChrome.css`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({
  width: 432,
  inset: 12,
  border: 1,
  barHeight: 50,
  controlWidth: 32,
  footerInset: 18,
  footerBottom: 12,
  sectionInset: 18,
  rowSelectInset: 89,
});
```

(m) In the same file, find:

```js
 * The new-game scenes that show the setup panel: every new-game scene except the one with the choices hidden.
```

Replace with:

```js
 * The new-game scenes that show the setup panel expanded: every new-game scene except the one with the choices hidden.
```

(n) In the same file, delete from the line `    name: 'new-game-panel-beside-map',` up to the line `    name: 'new-game-sections',`, and also delete the `  {` line directly above `    name: 'new-game-panel-beside-map',`. That removes the three old panel checks and keeps the `new-game-sections` line. Put this block in their place, so that the `  {` line directly above `    name: 'new-game-sections',` is the block's last line:

```js
  {
    name: 'new-game-panel-over-map',
    scenes: PANEL_SCENES.filter((scene) => scene !== SCENES.newGameMoved),
    needs: ['#game-over-overlay', '#canvas-container'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const c = el('#canvas-container');
      if (!panel.shown) return 'the setup panel is not shown';
      if (!near(panel.x, PANEL.inset) || !near(panel.y, TOPBAR_HEIGHT + PANEL.inset) || !near(panel.w, PANEL.width)) {
        return `the setup panel is at ${fmt(panel)}, expected ${PANEL.width} px wide, ${PANEL.inset} px in from the map's top-left corner`;
      }
      if (panel.y + panel.h > p.viewport.h - PANEL.inset + 1) return `the setup panel ${fmt(panel)} runs into the map's bottom inset`;
      return near(c.x, 0) && near(c.y, TOPBAR_HEIGHT) && near(c.w, p.viewport.w) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should fill the window under the top bar, with the panel over it`;
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
      const innerX = panel.x + PANEL.border;
      const innerY = panel.y + PANEL.border;
      const innerRight = panel.x + panel.w - PANEL.border;
      const innerBottom = panel.y + panel.h - PANEL.border;
      if (!near(collapse.x, innerX) || !near(collapse.y, innerY) || !near(collapse.w, PANEL.controlWidth)) {
        return `the expand control is at ${fmt(collapse)}, expected a ${PANEL.controlWidth} px column at the header bar's left edge`;
      }
      if (collapse.expanded !== 'true') return `the expand control reads aria-expanded=${collapse.expanded}`;
      if (!message.shown || message.x < collapse.x + collapse.w) return `the message ${fmt(message)} is not right of the expand control`;
      if (!start.shown || !near(start.x, innerX + PANEL.footerInset) || !near(start.x + start.w, innerRight - PANEL.footerInset)) {
        return `Start game is at ${fmt(start)}, expected the footer's width inside ${PANEL.footerInset} px of padding`;
      }
      if (!near(start.y + start.h, innerBottom - PANEL.footerBottom)) {
        return `Start game is at ${fmt(start)}, expected ${PANEL.footerBottom} px above the panel's bottom edge`;
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
      const panel = el('#game-over-overlay');
      const c = el('#canvas-container');
      const collapse = el('#new-game-dialog-collapse');
      if (!near(c.x, 0) || !near(c.y, TOPBAR_HEIGHT) || !near(c.w, p.viewport.w)) {
        return `#canvas-container ${fmt(c)} should fill the window's width under the top bar`;
      }
      if (!collapse.shown || !near(collapse.x, PANEL.inset + PANEL.border) || !near(collapse.y, TOPBAR_HEIGHT + PANEL.inset + PANEL.border)) {
        return `the expand control is at ${fmt(collapse)}, expected where it sits while the choices show`;
      }
      if (collapse.expanded !== 'false') return `the expand control reads aria-expanded=${collapse.expanded}`;
      if (!el('#game-over-message').shown) return 'the message is hidden with the choices';
      const shown = ['#game-over-dialog', '#new-game-btn'].filter((selector) => el(selector).shown);
      if (shown.length > 0) return `still shown with the choices hidden: ${shown.join(', ')}`;
      return near(panel.h, PANEL.barHeight + 2 * PANEL.border)
        ? null
        : `the panel is ${Math.round(panel.h)} px tall with the choices hidden, expected the ${PANEL.barHeight} px bar inside its border`;
    },
  },
  {
    name: 'new-game-panel-moved',
    scenes: [SCENES.newGameMoved],
    needs: ['#game-over-overlay'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const mapHeight = p.viewport.h - TOPBAR_HEIGHT;
      const x = PANEL.inset + NEW_GAME_MOVE.x;
      const y = TOPBAR_HEIGHT + Math.min(PANEL.inset + NEW_GAME_MOVE.y, Math.max(PANEL.inset, mapHeight - panel.h - PANEL.inset));
      return Math.abs(panel.x - x) <= 2 && Math.abs(panel.y - y) <= 2
        ? null
        : `the moved panel is at ${fmt(panel)}, expected ${Math.round(x)},${Math.round(y)}: dragged by ${NEW_GAME_MOVE.x},${NEW_GAME_MOVE.y} and kept ${PANEL.inset} px inside the map`;
    },
  },
  {
```

Then check that no old name is left:

```powershell
Select-String -Path scripts/ui-smoke/ui-smoke-new-game-checks.cjs -Pattern 'headerInset','new-game-panel-beside-map' -SimpleMatch
```

Expected: no output.

- [ ] **Step 5.14: Update `doc/`**

These facts replace the old ones. Write them in each document's voice, in place.

- The setup panel floats over the map, 12 px in from the map's top-left corner, `--new-game-panel-width` (432 px) wide, in the selection panel's chrome: navy, a 1 px `--chrome-border` border, 6 px corners, and a shadow (`static/newGameChrome.css`). The map fills the whole window under the top bar, and the console is not on screen.
- Its header bar is 50 px tall: the chevron expand control (a 32 px column with a divider) at the left, then the message. The body holds the choices and scrolls. The footer holds Start game, or New game.
- The panel is as tall as its content, up to the map's height less the 12 px inset at the top and the bottom.
- Collapsing leaves only the header bar, 52 px with the border, at the same spot, and it still shows the message. The panel slides between the two states over 150 ms from its top edge, or changes at once when the system asks for reduced motion (`startPanelHeightSlide`).
- The chevron points down while the choices are hidden and up while they show. The tips are "Hide the new game choices to see more of the map." and "Show the new game choices."
- A grip on the panel's top-right corner moves the panel with a primary-button drag. The panel stays inside the map with the 12 px inset to spare (`floatingPanelOffset` in `src/shared/mapChromePlacement.ts`). Its tip is "Drag to move this screen. It goes back to the corner each time it opens."
- Every open puts the panel back at the corner, expanded (`placeNewGameDialogAtInset` and `expandNewGameDialog`).
- Drag and the wheel pan and zoom the preview anywhere outside the panel.
- The preview fit centres on the whole map, so the panel covers part of the framed area.
- While the panel is open, the toast band also keeps clear of it (`layoutMapChrome`).

Edit these documents:

1. `doc/ux/new-game-dialog.md`: the opening paragraph (line 11), the panel and hide-choices bullets (lines 27 and 28), the preview bullet's last sentences (line 30: "The map is beside the panel, not under it, so the frame centres on the map the player can see."), the drag and hide-choices interaction bullets (lines 36 and 37), any other "beside the panel" wording, States, Invariants, and Code Entry Points. In Code Entry Points, add `src/renderer/gameplay/newGameDialogMove.ts`, `src/renderer/chrome/panelSlideHelpers.ts`, `src/shared/mapChromePlacement.ts` (`floatingPanelOffset`), and the ids `#new-game-panel-grip` and `#new-game-panel-header`.
2. `doc/ux/modes-and-transitions.md`: the New game mode paragraph ("The setup panel is docked at the left ... Hiding the choices leaves only the hide-choices button, and the map widens to the window's left edge.") and the Game over paragraph ("The setup panel, the hide-choices button, ...").
3. `doc/ui-style-guide.md`: the **New game (live)** bullet (line 198): the docked-panel sentences, the teal square hide-choices button, "While they are hidden, only the square remains...", and "beside the panel".
4. `doc/ux/console.md`: "including while the new-game choices are hidden, and the map widens to the window's right edge" stays true; change nothing there unless a sentence says the panel is docked.
5. `doc/ux/control-tooltips.md`: replace the "Hide the new game choices" line with "Hide the new game choices: Hide the new game choices to see more of the map."; add "New-game panel grip: Drag to move this screen. It goes back to the corner each time it opens." after the "Show the new game choices" line.
6. `doc/ux/notifications-and-feedback.md`: in the toast band bullet, add that while the new-game setup panel is open, the band also starts 12 px right of that panel.
7. `doc/ux/map-surface.md`: any sentence that says the map sits beside the setup panel.

Then search:

```powershell
Select-String -Path doc\*.md,doc\ux\*.md -Pattern 'docked at the left','beside the panel','hide-choices','widen the map.','widens to the window''s left edge','beside the setup panel' -SimpleMatch
```

Each line it prints must either be gone or describe the new behavior. The console's own "widen the map" tips for its tabs are correct and stay. List any line you left as it is, and why, in your report.

- [ ] **Verify Phase 5**

Run the fast loop. Then the full tests. Expected: exit 0, test total **T0 + 3**, failure total **0**.

Then the smoke run:

```powershell
npm run ui:smoke -- --label new-game-float
```

Expected: 0 failed and 0 page errors, with `PASS` lines for `new-game-panel-over-map`, `new-game-panel-layout`, `new-game-choices-hidden`, and `new-game-panel-moved`. Open these screenshots in `.test/ui-smoke/new-game-float/` and describe them in your report:

- `new-game-startup`: the panel floats over the map's top-left corner with rounded corners and a shadow; the map runs under it to the window's left edge.
- `new-game-hidden`: only the header bar shows, with the chevron pointing down and the message.
- `new-game-moved`: the panel sits to the right of the corner, the grip at its top-right corner.
- `new-game-reopened`: the panel is back at the corner.
- `game-over-small-window`: the panel fits the 800 x 600 window, its choices scroll, and Start game sits at the bottom of the panel.

---

## Phase 6: Close and Return to the Match

Opening the new-game screen from the game menu no longer stops anything. If a live match is loaded, it is marked as waiting, the main map's camera and loaded extent are saved, the renderer match epoch moves forward so a reply still in flight cannot write the old match back later, and the close control shows. Close hides the screen and puts the match back as it was. Start is the only path that stops the waiting match. Five guards keep the waiting match safe:

- New game is unavailable while a Ready is being resolved.
- A refresh of the live match no longer closes the screen.
- Opponent pushes still apply to the waiting match.
- Background planning restarts after close.
- A match that ends under the screen is forgotten, so close hides.

- [ ] **Step 6.1: Expose the loaded extent in `src/renderer/map/mapExtent.ts`**

(a) Find:

```ts
 * When to use: Read from `restoreLoadedMapExtent` only.
 * Expected outcome: `'world'` until a regional snapshot is applied.
 * Exceptions: None.
 */
let active: 'world' | MapExtentBox = 'world';
```

Replace with:

```ts
 * When to use: Read from `restoreLoadedMapExtent`, and through `loadedMapExtentTarget`.
 * Expected outcome: `'world'` until a regional snapshot is applied.
 * Exceptions: None.
 */
let active: 'world' | MapExtentBox = 'world';

/**
 * Returns the extent last applied to the maps.
 *
 * Purpose: The new-game preview applies its own extent, so the camera saved for going back to a match records the
 *   match's extent first.
 * When to use: From `saveMainMapCameraForReturn`, before the preview loads.
 * Expected outcome: `'world'`, or the regional box last passed to `applyLoadedMapExtent`.
 * Exceptions: None.
 */
export function loadedMapExtentTarget(): 'world' | MapExtentBox {
  return active;
}
```

- [ ] **Step 6.2: Create `src/renderer/map/mainMapCameraReturn.ts`**

```ts
/**
 * The main map's camera and loaded extent, saved when the new-game screen opens over a match and put back when the
 * player closes that screen.
 *
 * Purpose: The new-game preview frames its own map and changes the pan and zoom limits. Closing the screen must show
 *   the match as the player left it, on the world map or in a battle.
 * When to use: `saveMainMapCameraForReturn` as the screen opens over a match, `returnMainMapCamera` when the player
 *   closes it, and `forgetMainMapCameraForReturn` when the match under it is replaced or ends.
 * Expected outcome: At most one saved camera at a time.
 * Exceptions: None; a missing map is skipped.
 */
import type { MapExtentBox } from '../../shared/mapExtent';
import { applyLoadedMapExtent, loadedMapExtentTarget } from './mapExtent';
import { getMainLeafletMap } from './worldLeafletMap';

/**
 * The Leaflet calls this module makes on the main map.
 *
 * Purpose: Encodes only the methods and options used here, without depending on the full map type.
 * When to use: Cast `getMainLeafletMap()` to it.
 * Expected outcome: Missing methods are skipped.
 * Exceptions: None.
 */
type CameraMap = {
  getCenter?: () => unknown;
  getZoom?: () => number;
  getMinZoom?: () => number;
  getMaxZoom?: () => number;
  setMinZoom?: (zoom: number) => void;
  setMaxZoom?: (zoom: number) => void;
  setMaxBounds?: (bounds: unknown) => void;
  setView?: (center: unknown, zoom: number, options?: { animate?: boolean }) => void;
  options?: { maxBounds?: unknown; worldCopyJump?: boolean };
};

/**
 * Everything needed to put the main map back as the match had it.
 *
 * Purpose: In a battle the pan limit and the zoom limits are the battle's, not the loaded map's, so all are saved.
 * When to use: Written by `saveMainMapCameraForReturn`; read by `returnMainMapCamera`.
 * Expected outcome: Values read from Leaflet and from `loadedMapExtentTarget`.
 * Exceptions: None.
 */
interface SavedCamera {
  /** The loaded extent the match had applied. */
  readonly extent: 'world' | MapExtentBox;
  /** The map's centre, as Leaflet returned it. */
  readonly center: unknown;
  /** The map's zoom. */
  readonly zoom: number;
  /** The lowest zoom the match allowed. */
  readonly minZoom: number;
  /** The highest zoom the match allowed. */
  readonly maxZoom: number;
  /** The pan limit the match had set, or null for none. */
  readonly maxBounds: unknown;
  /** Whether the map jumped between world copies. */
  readonly worldCopyJump: boolean;
}

/**
 * The camera saved for the match waiting under the new-game screen.
 *
 * Purpose: One saved camera, for the one match that can be waiting.
 * When to use: Only through the functions below.
 * Expected outcome: Null while no match is waiting.
 * Exceptions: None.
 */
let saved: SavedCamera | null = null;

/**
 * Saves the main map's camera, limits, and loaded extent.
 *
 * Purpose: The new-game preview is about to move the camera and change the limits.
 * When to use: As the new-game screen opens over a live match, before the preview loads.
 * Expected outcome: The current camera is saved, replacing any earlier one. Without a map, nothing is saved.
 * Exceptions: None.
 */
export function saveMainMapCameraForReturn(): void {
  const map = getMainLeafletMap() as CameraMap | null;
  if (!map?.getCenter || !map.getZoom || !map.getMinZoom || !map.getMaxZoom) {
    saved = null;
    return;
  }
  saved = {
    extent: loadedMapExtentTarget(),
    center: map.getCenter(),
    zoom: map.getZoom(),
    minZoom: map.getMinZoom(),
    maxZoom: map.getMaxZoom(),
    maxBounds: map.options?.maxBounds ?? null,
    worldCopyJump: map.options?.worldCopyJump === true,
  };
}

/**
 * Puts the saved camera, limits, and loaded extent back, and drops the saved copy.
 *
 * Purpose: Closing the new-game screen shows the match as the player left it.
 * When to use: After the screen has closed and the map has taken its new size.
 * Expected outcome: Returns true when a camera was put back. The loaded extent is applied again, then the saved pan
 *   limit, zoom limits, and world-copy setting, then the centre and zoom, without animation. Returns false, and changes
 *   nothing, when no camera was saved or the map is missing.
 * Exceptions: None.
 */
export function returnMainMapCamera(): boolean {
  const camera = saved;
  saved = null;
  const map = getMainLeafletMap() as CameraMap | null;
  if (!camera || !map) return false;
  applyLoadedMapExtent(camera.extent, true);
  if (map.options) map.options.worldCopyJump = camera.worldCopyJump;
  map.setMaxBounds?.(camera.maxBounds);
  map.setMinZoom?.(camera.minZoom);
  map.setMaxZoom?.(camera.maxZoom);
  map.setView?.(camera.center, camera.zoom, { animate: false });
  return true;
}

/**
 * Drops the saved camera without using it.
 *
 * Purpose: A replaced or finished match must not pull the camera back later.
 * When to use: When the match under the new-game screen is replaced or ends.
 * Expected outcome: No camera is saved.
 * Exceptions: None.
 */
export function forgetMainMapCameraForReturn(): void {
  saved = null;
}
```

- [ ] **Step 6.3: Create `src/renderer/gameplay/newGameReturn.ts`**

```ts
/**
 * Going back to the match from the new-game screen.
 *
 * Purpose: Opening the new-game screen from the game menu leaves the match running under it. The player can close the
 *   screen and carry on, or start a new match, which replaces it. This module records whether a match is waiting and
 *   performs the close.
 * When to use: `holdMatchUnderNewGame` as the screen opens over a live match, `forgetMatchUnderNewGame` when that match
 *   is replaced or ends, and `closeNewGameOverlayToMatch` from the close control.
 * Expected outcome: The close control `#new-game-dialog-close` shows only while a match is waiting.
 * Exceptions: None; missing elements are skipped.
 */
import { dismissStaleControlTooltip } from '../chrome/controlTooltip';
import { rendererSharedState as S } from '../core/state';
import { forgetMainMapCameraForReturn, returnMainMapCamera, saveMainMapCameraForReturn } from '../map/mainMapCameraReturn';
import { invalidateLeafletMapSizes } from '../map/worldLeafletMap';
import { newGameOverlayIsOpen } from './newGameDialogCollapse';

/**
 * Whether a live match is waiting under the new-game screen.
 *
 * Purpose: Decides whether close shows, whether a refresh may close the screen, and whether Start must stop a match.
 * When to use: Only through the functions below.
 * Expected outcome: False at startup, at game over, and after close or Start.
 * Exceptions: None.
 */
let matchWaiting = false;

/**
 * Shows the close control only while a match is waiting.
 *
 * Purpose: At startup and at game over there is no match to go back to.
 * When to use: After `matchWaiting` changes.
 * Expected outcome: `hidden` on `#new-game-dialog-close` is the opposite of `matchWaiting`.
 * Exceptions: None.
 */
function syncCloseControl(): void {
  const close = document.getElementById('new-game-dialog-close');
  if (close instanceof HTMLButtonElement) close.hidden = !matchWaiting;
}

/**
 * Reports whether a live match is waiting under the new-game screen.
 *
 * Purpose: The refresh, push, and Start paths treat a waiting match differently from no match.
 * When to use: From `updateGameOverUI`, the consultation push listeners, and the Start handler.
 * Expected outcome: True between `holdMatchUnderNewGame` and the next close, Start, or match end.
 * Exceptions: None.
 */
export function isMatchWaitingUnderNewGame(): boolean {
  return matchWaiting;
}

/**
 * Marks the live match as waiting under the new-game screen and saves its camera.
 *
 * Purpose: The match keeps running, and close can return to it.
 * When to use: As the screen opens from the game menu over a match that is loaded and not over, before the preview
 *   loads.
 * Expected outcome: A match is waiting, its camera is saved, and the close control shows.
 * Exceptions: None.
 */
export function holdMatchUnderNewGame(): void {
  matchWaiting = true;
  saveMainMapCameraForReturn();
  syncCloseControl();
}

/**
 * Forgets the match that was waiting under the new-game screen.
 *
 * Purpose: Start replaces that match, and a match that ends there has nothing to go back to.
 * When to use: From the Start handler before it stops the match, and from `updateGameOverUI` when the match ends.
 * Expected outcome: No match is waiting, the saved camera is dropped, and the close control hides.
 * Exceptions: None.
 */
export function forgetMatchUnderNewGame(): void {
  matchWaiting = false;
  forgetMainMapCameraForReturn();
  syncCloseControl();
}

/**
 * What closing the new-game screen needs from the renderer's entry module.
 *
 * Purpose: Keeps this module free of the entry module's imports.
 * When to use: Pass the same callbacks `registerNewGameButton` receives.
 * Expected outcome: Each callback does what the entry module does for any other state change.
 * Exceptions: None.
 */
export interface NewGameCloseDeps {
  /** Turns pointer input for the map, the top bar, and the console on or off. */
  setMainUIControlsEnabled(enabled: boolean): void;
  /** Recomputes Ready's label and whether it can be clicked. */
  updateReadyButtonState(): void;
  /** Starts a background opponent plan when Run is on and nothing blocks it. */
  startBackgroundRequestIfAllowed(): void;
  /** Resizes the canvas to the map and redraws the frame. */
  resizeAndRedraw(): void;
}

/**
 * Closes the new-game screen and goes back to the match waiting under it.
 *
 * Purpose: The close control's single action.
 * When to use: On a click on `#new-game-dialog-close`.
 * Expected outcome: Nothing unless a match is waiting and the screen is open. Otherwise the screen hides, its tip goes,
 *   the match controls take the pointer again, the map takes its new size and goes back to the saved camera, Ready is
 *   recomputed, background planning resumes when Run is on, and the frame redraws. The match's state, orders, and
 *   selection are as the player left them.
 * Exceptions: None.
 */
export function closeNewGameOverlayToMatch(deps: NewGameCloseDeps): void {
  if (!matchWaiting || !newGameOverlayIsOpen()) return;
  matchWaiting = false;
  syncCloseControl();
  document.getElementById('game-over-overlay')?.classList.add('hidden');
  dismissStaleControlTooltip();
  deps.setMainUIControlsEnabled(true);
  invalidateLeafletMapSizes();
  returnMainMapCamera();
  deps.updateReadyButtonState();
  if (S.runButtonOn) deps.startBackgroundRequestIfAllowed();
  deps.resizeAndRedraw();
}
```

- [ ] **Step 6.4: Move the teardown to Start in `src/renderer/gameplay/newGame.ts`**

(a) Find:

```ts
import { placeNewGameDialogAtInset, wireNewGameDialogMove } from './newGameDialogMove';
```

Replace with:

```ts
import { placeNewGameDialogAtInset, wireNewGameDialogMove } from './newGameDialogMove';
import {
  closeNewGameOverlayToMatch,
  forgetMatchUnderNewGame,
  holdMatchUnderNewGame,
  isMatchWaitingUnderNewGame,
} from './newGameReturn';
```

(b) Find:

```ts
/**
 * Wires the new-game dialog's controls and its Start button.
```

Replace with:

```ts
/**
 * Stops the match that was left running under the new-game screen, just before a new one starts.
 *
 * Purpose: Opening the screen no longer stops the match, so the player can close it and carry on. Starting replaces the
 *   match, so its planning, playback, and battle must stop first, or their results could land on the new one.
 * When to use: From the Start handler, after the match epoch advances and before the start request.
 * Expected outcome: Nothing when no match is waiting. Otherwise the close control hides, the saved camera is dropped,
 *   opponent planning and playback stop, a battle under the screen is released, and the planning flags are cleared.
 * Exceptions: None.
 */
function stopMatchWaitingUnderNewGame(): void {
  if (!isMatchWaitingUnderNewGame()) return;
  forgetMatchUnderNewGame();
  void stopOpponentPlanning('new_game');
  clearResolutionPlaybackAnimationState();
  if (S.tacticalBattleSnapshot && S.gameState) {
    tacticalReleaseRendererSessionForNewStrategicMatch(S.gameState, false);
  }
  resetPrecomputedAiState('null');
  S.pendingDeferredStrategicPostResolutionConsult = false;
  S.pendingDeferredTacticalPostBeatConsult = false;
  S.backgroundRequestInFlight = false;
  S.readyRequestInFlight = false;
  S.eventDrivenInitialConsultationDone = false;
}

/**
 * Wires the new-game dialog's controls and its Start button.
```

(c) Find:

```ts
 * Expected outcome: The randomize buttons, the game-size caps, and the panel's grip are live. Clicking Start sends
```

Replace with:

```ts
 * Expected outcome: The randomize buttons, the game-size caps, the panel's grip, and its close control are live. Close
 *   goes back to a match waiting under the screen. Clicking Start stops that match, if any, then sends
```

(d) Find:

```ts
  wireNewGameDialogMove();
  registerRegionRandomizeButtons();
```

Replace with:

```ts
  wireNewGameDialogMove();
  document.getElementById('new-game-dialog-close')?.addEventListener('click', () => {
    closeNewGameOverlayToMatch(deps);
  });
  registerRegionRandomizeButtons();
```

(e) Find:

```ts
    if (!window.gameApi?.newGame) return;
    const matchEpoch = advanceRendererMatchEpoch();
    if (regionalStartBlocked()) {
      showMapToast('This map has no two sides.');
      return;
    }
    const cameraHold = holdNewGameMapPreviewCamera();
```

Replace with:

```ts
    if (!window.gameApi?.newGame) return;
    if (regionalStartBlocked()) {
      showMapToast('This map has no two sides.');
      return;
    }
    const matchEpoch = advanceRendererMatchEpoch();
    stopMatchWaitingUnderNewGame();
    const cameraHold = holdNewGameMapPreviewCamera();
```

The epoch still moves at open time too, but only when a match is actually held. See the comment in the function below.

(f) Replace the comment block above `export function openNewGameOverlayFromModelTab(` and the whole function (from that `/**` line down to the function's closing `}` line, the `}` after `  return opened;`) with:

```ts
/**
 * Opens the new-game dialog mid-match from the game menu.
 *
 * Purpose: Lets the player set up a new match while the current one keeps running underneath, then either start the
 *   new match or close the dialog and carry on.
 * When to use: The game menu's New game item.
 * Expected outcome: Returns false, and changes nothing, while the annihilation dialog is open or a Ready is being
 *   resolved. Otherwise, when the overlay was hidden and a live match is loaded, that match is marked as waiting, its
 *   camera is saved, and the renderer match epoch moves forward; nothing about the match stops. Moving the epoch
 *   retires a Ready, battle-exit, or battle-start handler that is still awaiting its reply, so its result cannot land
 *   on the match after close or on the new match after Start. A reply already in flight when the screen opened is
 *   discarded rather than applied. Fog of war and the bonus dropdowns return to their defaults, the home regions,
 *   starting month, and map preview are drawn again, the panel opens expanded at the map's corner, and the overlay
 *   opens. Returns true only when this call removes `hidden` from `#game-over-overlay`.
 * Exceptions: None.
 */
export function openNewGameOverlayFromModelTab(setMainUIControlsEnabled: (enabled: boolean) => void, updateReadyButtonState: () => void): boolean {
  if (S.tacticalAnnihilationOutcomeDialog != null) return false;
  if (S.readyRequestInFlight) return false;
  const overlay = document.getElementById('game-over-overlay');
  const newGameBtn = document.getElementById('new-game-btn');
  const opened = overlay?.classList.contains('hidden') === true;
  if (opened && S.gameState && S.gameState.hexes.length > 0 && !S.gameState.gameOver) {
    holdMatchUnderNewGame();
    advanceRendererMatchEpoch();
  }
  showNewGameBanner('newGame', selectedNewGameTab());
  if (newGameBtn) {
    newGameBtn.textContent = 'Start game';
    newGameBtn.setAttribute('data-control-tooltip', newGameButtonTooltipText(true));
  }
  resetNewGameOptionControls();
  void (async () => {
    await Promise.all([initializeScenarioRegionSelectorsOnOverlayOpen(), prepareNewGameMapPanel()]);
    await refreshNewGameMapPreview();
  })();
  syncGameSizeCapPreview();
  overlay?.classList.remove('hidden');
  expandNewGameDialog();
  placeNewGameDialogAtInset();
  blurMapChromeIfFocused();
  resetNewGameMapPreviewFrame();
  repaintNewGameMapPreview();
  setMainUIControlsEnabled(false);
  updateReadyButtonState();
  return opened;
}
```

- [ ] **Step 6.5: Keep the screen open for the waiting match in `src/renderer/core/uiState.ts`**

(a) Find:

```ts
import { placeNewGameDialogAtInset } from '../gameplay/newGameDialogMove';
```

Replace with:

```ts
import { placeNewGameDialogAtInset } from '../gameplay/newGameDialogMove';
import { forgetMatchUnderNewGame, isMatchWaitingUnderNewGame } from '../gameplay/newGameReturn';
```

(b) Find:

```ts
  const showOverlay = noGame || gameOver;

  const wasHidden = overlay?.classList.contains('hidden') !== false;
```

Replace with:

```ts
  const showOverlay = noGame || gameOver;
  if (isMatchWaitingUnderNewGame()) {
    if (!showOverlay) {
      updateReadyButtonState();
      return false;
    }
    forgetMatchUnderNewGame();
  }

  const wasHidden = overlay?.classList.contains('hidden') !== false;
```

(c) Find:

```ts
 *   top-left corner, only on that open. A later refresh leaves a collapsed or moved panel as it is.
 * Exceptions: None.
```

Replace with:

```ts
 *   top-left corner, only on that open. A later refresh leaves a collapsed or moved panel as it is. While a match
 *   waits under the screen the player opened from the game menu, a refresh of that live match leaves the screen and
 *   the controls as they are and returns false; a refresh in which that match has ended forgets it, so the close
 *   control hides, and the screen shows the result.
 * Exceptions: None.
```

- [ ] **Step 6.6: Let pushes reach the waiting match in `src/renderer/openRouter/openRouterControls.ts`**

(a) Find:

```ts
import { isNewGameOverlayOpen } from '../gameplay/newGameBanner';
```

Replace with:

```ts
import { isNewGameOverlayOpen } from '../gameplay/newGameBanner';
import { isMatchWaitingUnderNewGame } from '../gameplay/newGameReturn';
```

(b) Find:

```ts
 * `openRouter:log`.
 */
function initDeferredResolutionPlaybackPushListeners(deps: OpenRouterUiDeps): void {
```

Replace with:

```ts
 * `openRouter:log`. While the new-game screen is open with no match waiting under it, a push only clears its latch;
 * while a match is waiting under that screen, the push applies to that match as usual.
 */
function initDeferredResolutionPlaybackPushListeners(deps: OpenRouterUiDeps): void {
```

(c) Find:

```ts
  window.gameApi?.registerPostResolutionConsultationListener?.((payload: PostResolutionConsultationPushPayload) => {
    if (isNewGameOverlayOpen()) {
```

Replace with:

```ts
  window.gameApi?.registerPostResolutionConsultationListener?.((payload: PostResolutionConsultationPushPayload) => {
    if (isNewGameOverlayOpen() && !isMatchWaitingUnderNewGame()) {
```

(d) Find:

```ts
  window.gameApi?.registerPostTacticalBeatConsultationListener?.((fields) => {
    if (isNewGameOverlayOpen()) {
```

Replace with:

```ts
  window.gameApi?.registerPostTacticalBeatConsultationListener?.((fields) => {
    if (isNewGameOverlayOpen() && !isMatchWaitingUnderNewGame()) {
```

- [ ] **Step 6.7: Disable New game while a Ready resolves, in `src/renderer/chrome/gameMenu.ts`**

(a) Find:

```ts
 * closes the menu, disables New game while the new-game screen is open, and handles Quit.
 */
import { newGameOverlayIsOpen } from '../gameplay/newGameDialogCollapse';
import { dismissStaleControlTooltip } from './controlTooltip';
```

Replace with:

```ts
 * closes the menu, disables New game while the new-game screen is open or a Ready is resolving, and handles Quit.
 */
import { rendererSharedState as S } from '../core/state';
import { newGameOverlayIsOpen } from '../gameplay/newGameDialogCollapse';
import { dismissStaleControlTooltip } from './controlTooltip';
import { newGameItemBusyTooltipText, newGameItemOpenTooltipText } from './controlTooltipText';
```

(b) Find:

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
```

Replace with:

```ts
/**
 * Disables the menu's New game item while the new-game screen is open or a Ready is resolving.
 *
 * Purpose: The menu also works on the new-game screen, where opening that screen again would only throw away the
 *   choices the player has made. While a Ready is being sent and answered, the match under the screen could not be
 *   returned to safely, so New game waits for it.
 * When to use: When the menu opens, and whenever pointer input for the match controls is switched on or off, which
 *   happens each time the new-game overlay opens or closes.
 * Expected outcome: New game is disabled while `#game-over-overlay` is open or `S.readyRequestInFlight` is set, and
 *   enabled otherwise. Its tip host names the reason that applies, the open screen first.
 * Exceptions: None; does nothing when the item is missing.
 */
export function syncGameMenuNewGameItem(): void {
  const item = document.getElementById(NEW_GAME_ITEM_ID);
  if (!(item instanceof HTMLButtonElement)) return;
  const screenOpen = newGameOverlayIsOpen();
  item.disabled = screenOpen || S.readyRequestInFlight;
  item.parentElement?.setAttribute('data-control-tooltip', screenOpen ? newGameItemOpenTooltipText : newGameItemBusyTooltipText);
}
```

- [ ] **Step 6.8: Tips in `src/renderer/chrome/controlTooltipText.ts`**

Find:

```ts
/**
 * Purpose: Says New opens the new-game screen and stops planning and playback immediately.
 * When to use: `#openrouter-new-btn`, the game menu's New game item.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const newButtonTooltipText =
  'Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one.';
```

Replace with:

```ts
/**
 * Purpose: Says New opens the new-game screen over the match, which keeps going until a new one starts.
 * When to use: `#openrouter-new-btn`, the game menu's New game item.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const newButtonTooltipText =
  'Open the new-game screen. The current match keeps going underneath; close the screen to return to it, or start a new match to replace it.';

/**
 * Purpose: Says why New game is disabled while the new-game screen is open.
 * When to use: The tip host around `#openrouter-new-btn`, from `syncGameMenuNewGameItem`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const newGameItemOpenTooltipText = 'The new-game screen is already open.';

/**
 * Purpose: Says why New game is disabled while a Ready is being resolved.
 * When to use: The tip host around `#openrouter-new-btn`, from `syncGameMenuNewGameItem`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const newGameItemBusyTooltipText = 'New game is available again once this turn or beat finishes resolving.';
```

- [ ] **Step 6.9: The close tip in `src/renderer/chrome/frameTooltipText.ts`**

Find:

```ts
export const newGameGripTooltipText = 'Drag to move this screen. It goes back to the corner each time it opens.';
```

Replace with:

```ts
export const newGameGripTooltipText = 'Drag to move this screen. It goes back to the corner each time it opens.';

/**
 * The new-game setup panel's close tip.
 *
 * Purpose: Says close goes back to the match that kept running under the screen.
 * When to use: `#new-game-dialog-close`, which shows only while a match is waiting. The static markup holds this
 *   sentence.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const newGameCloseTooltipText = 'Close this screen and go back to the match in progress.';
```

- [ ] **Step 6.10: The close control's markup in `static/index.html`**

(a) Find:

```html
      <p id="game-over-message"></p>
    </div>
```

Replace with:

```html
      <p id="game-over-message"></p>
      <button type="button" id="new-game-dialog-close" class="new-game-panel-close" aria-label="Close the new-game screen" data-control-tooltip="Close this screen and go back to the match in progress." hidden><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"></path></svg></button>
    </div>
```

(b) Find:

```html
data-control-tooltip="Open the new-game screen. Opponent planning and any playback stop right away; the current match is replaced when you start the new one."
```

Replace with:

```html
data-control-tooltip="Open the new-game screen. The current match keeps going underneath; close the screen to return to it, or start a new match to replace it."
```

- [ ] **Step 6.11: The close control's styles in `static/newGameChrome.css`**

(a) Find:

```css
   expand control and the message, the body holds the Map, Forces, and Rules sections and scrolls, and the footer holds
   Start game. Hiding the choices leaves only the header bar. The grip on the panel's top-right corner moves it. */
```

Replace with:

```css
   expand control, the message, and, while a match waits under the screen, the close control. The body holds the Map,
   Forces, and Rules sections and scrolls, and the footer holds Start game. Hiding the choices leaves only the header
   bar. The grip on the panel's top-right corner moves it. */
```

(b) Find:

```css
/* The expand control at the bar's left edge, like the selection panel's: a full-height 32 px column with a divider on
   its inner side. The chevron points down while the choices are hidden and turns up while they show. */
.new-game-panel-expand {
  flex: none;
  align-self: stretch;
  width: 32px;
  min-width: 0;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-right: 1px solid var(--chrome-divider);
  border-radius: 0;
  background: transparent;
  color: var(--chrome-text);
}
.new-game-panel-expand:hover {
  background: var(--chrome-bg-raised);
}
.new-game-panel-expand:focus {
  outline-offset: -2px;
}
```

Replace with:

```css
/* The end controls, like the selection panel's: full-height 32 px columns with a divider on the inner side, expand at
   the bar's left edge and close at its right edge. Close shows only while a match waits under the screen. The chevron
   points down while the choices are hidden and turns up while they show. */
.new-game-panel-expand,
.new-game-panel-close {
  flex: none;
  align-self: stretch;
  width: 32px;
  min-width: 0;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--chrome-text);
}
.new-game-panel-expand {
  border-right: 1px solid var(--chrome-divider);
}
.new-game-panel-close {
  border-left: 1px solid var(--chrome-divider);
}
.new-game-panel-close[hidden] {
  display: none;
}
.new-game-panel-expand:hover,
.new-game-panel-close:hover {
  background: var(--chrome-bg-raised);
}
.new-game-panel-expand:focus,
.new-game-panel-close:focus {
  outline-offset: -2px;
}
/* The close control's divider separates it from the message, so the message needs no margin of its own then. */
#game-over-message:has(+ .new-game-panel-close:not([hidden])) {
  margin-right: 0;
}
```

- [ ] **Step 6.12: The menu callback's comment in `src/renderer/entryCallbacks.ts`**

Find:

```ts
 * Expected outcome: The annihilation dialog ignores the click. Otherwise opponent planning and playback stop, the dialog opens, and the map resizes only when the overlay was hidden.
```

Replace with:

```ts
 * Expected outcome: The annihilation dialog and a Ready that is still resolving ignore the click. Otherwise the dialog opens over the match, which keeps running; when a live match is held, the renderer match epoch moves forward so a reply still in flight is discarded. The map resizes only when the overlay was hidden.
```

- [ ] **Step 6.13: Smoke scene and checks**

(a) In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find:

```js
  newGameReopened: 'new-game-reopened',
```

Replace with:

```js
  newGameReopened: 'new-game-reopened',
  newGameClosed: 'new-game-closed',
```

`newGameClosed` is not added to `NEW_GAME_SCENES`, so it is a match scene and every match check runs on it.

(b) In `scripts/ui-smoke/ui-smoke.cjs`, find:

```js
  await recordScene(page, report, outDir, SCENES.newGameReopened);
  await page.click('#new-game-tab-regional');
```

Replace with:

```js
  await recordScene(page, report, outDir, SCENES.newGameReopened);
  // Close the screen and go back to the match that kept running under it, then open the screen again for the regional
  // match.
  await page.click('#new-game-dialog-close');
  await page.waitForFunction(() => document.getElementById('game-over-overlay')?.classList.contains('hidden'), null, { timeout: 10000 });
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameClosed);
  await openNewGameOverlay(page);
  await page.click('#new-game-tab-regional');
```

(c) In the same file, find the comment block above `async function runReopenedSession(`. Find:

```js
 * Runs the second session: the reopened match, a battle on the hex both sides now hold, leaving that battle, and a new
 * regional match.
```

Replace with:

```js
 * Runs the second session: the reopened match, a battle on the hex both sides now hold, leaving that battle, the
 * new-game screen opened over the match and closed again, and a new regional match.
```

(d) In `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, find:

```js
  {
    name: 'new-game-sections',
```

Replace with:

```js
  {
    name: 'new-game-close-hidden-without-match',
    scenes: [SCENES.newGameStartup, SCENES.newGameMenu, SCENES.newGameHidden, SCENES.newGameMoved, SCENES.gameOverReopened, SCENES.gameOverSmallWindow],
    needs: ['#new-game-dialog-close'],
    run: (p, el) => (el('#new-game-dialog-close').shown ? 'the close control shows with no match to go back to' : null),
  },
  {
    name: 'new-game-close-over-match',
    scenes: [SCENES.newGameReopened, SCENES.newGameRegional],
    needs: ['#game-over-overlay', '#new-game-dialog-close', '#game-over-message'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const close = el('#new-game-dialog-close');
      const message = el('#game-over-message');
      if (!close.shown) return 'the close control is hidden while a match waits under the screen';
      const atRightEdge = near(close.x + close.w, panel.x + panel.w - PANEL.border) && near(close.y, panel.y + PANEL.border) && near(close.w, PANEL.controlWidth);
      if (!atRightEdge) return `the close control is at ${fmt(close)}, expected a ${PANEL.controlWidth} px column at the header bar's right edge`;
      return message.x + message.w <= close.x + 1 ? null : `the message ${fmt(message)} runs under the close control ${fmt(close)}`;
    },
  },
  {
    name: 'new-game-closed-returns-to-match',
    scenes: [SCENES.newGameClosed],
    needs: ['#game-over-overlay', '#sidebar', '#topbar-turn-phase'],
    run: (p, el) => {
      if (el('#game-over-overlay').shown) return 'the new-game screen still shows after Close';
      if (!el('#sidebar').shown) return 'the console is not back after Close';
      const phase = el('#topbar-turn-phase').text;
      return /· Planning$/.test(phase) ? null : `the top bar reads "${phase}", expected the match's planning step`;
    },
  },
  {
    name: 'new-game-sections',
```

The last of these rows runs on a match scene. The table holds any check about the new-game screen, including what closing it leaves behind.

- [ ] **Step 6.14: Update `doc/`**

These facts replace the old ones. Write them in each document's voice, in place.

- New game in the game menu opens the new-game screen over the match. Nothing stops: planning that was already running finishes and applies to the match, and playback continues under the screen. A new background plan does not start while the screen is open.
- New game is unavailable while a Ready is being sent and answered. Its tip host then says "New game is available again once this turn or beat finishes resolving." While the screen is open, it says "The new-game screen is already open." (`syncGameMenuNewGameItem`).
- While a match is waiting under the screen, the header bar's right edge holds a close control: an X in a 32 px column with a divider, tip "Close this screen and go back to the match in progress." (`#new-game-dialog-close`).
- Close hides the screen and returns to the match as it was: the same mode (Strategic planning, Tactical planning, or Resolution playback), orders, selection, and camera, with the camera and the pan and zoom limits restored (`closeNewGameOverlayToMatch` in `src/renderer/gameplay/newGameReturn.ts`, `src/renderer/map/mainMapCameraReturn.ts`). Background planning resumes when Run is on.
- Start is the only step that stops the match: it stops opponent planning and playback, releases a battle, and then replaces the match (`stopMatchWaitingUnderNewGame` in `newGame.ts`). If Start fails, the screen stays open with no close control, as before.
- At startup with no match, and at game over, there is no close control; the screen cannot be dismissed without starting a match. At game over the panel can still be collapsed to the header bar, which keeps the win or loss message.
- If the match ends while the screen is open over it, the close control goes and the screen shows the result.
- The game menu item's tip is "Open the new-game screen. The current match keeps going underneath; close the screen to return to it, or start a new match to replace it."

Edit these documents:

1. `doc/ux/new-game-dialog.md`: "It cannot be dismissed without starting a match." (line 11) and every other sentence on dismissal, the header contents, States (add the waiting-match case), Invariants, the game-over collapse rule, and Code Entry Points: add `src/renderer/gameplay/newGameReturn.ts`, `src/renderer/map/mainMapCameraReturn.ts`, and `#new-game-dialog-close`.
2. `doc/ux/modes-and-transitions.md`: the New game mode paragraph, the transitions list ("Strategic planning -> New game: New game in the game menu. Opponent planning and any playback stop immediately. The match is replaced when Start succeeds." and the tactical and playback equivalents), and the mermaid diagram. In the diagram, add a `close` edge from the New game node back to each mode the menu can open it from, using the node ids the diagram already has. Add the close transitions to the list. Add `src/renderer/gameplay/newGameReturn.ts` to Code Entry Points.
3. `doc/ux/game-menu.md` (line 33): New game opens the screen over the match, which keeps running; New game is disabled while a Ready is resolving, with the busy tip, as well as while the screen is open.
4. `doc/ux/control-tooltips.md`: replace the "New game in the game menu:" line with the new tip; add "New game in the game menu while a Ready is resolving, on its tip host: New game is available again once this turn or beat finishes resolving."; add "New-game panel close, shown only while a match is waiting under the screen: Close this screen and go back to the match in progress."
5. `doc/ux/console-command-bar.md` and `doc/ux/top-bar.md`: any sentence that says opening New game stops planning or playback.
6. `doc/ui-style-guide.md`: in the **New game (live)** bullet, add the close control to the header's contents.

Then search:

```powershell
Select-String -Path doc\*.md,doc\ux\*.md -Pattern 'stop right away','stop immediately','cannot be dismissed','is replaced when Start' -SimpleMatch
```

Each line it prints must either be gone or describe the new behavior. List any line you left as it is, and why, in your report.

- [ ] **Verify Phase 6**

Run the fast loop. Then the full tests. Expected: exit 0, test total **T0 + 3**, failure total **0**.

Then the smoke run:

```powershell
npm run ui:smoke -- --label new-game-close
```

Expected: 0 failed and 0 page errors, with `PASS` lines for `new-game-close-hidden-without-match`, `new-game-close-over-match`, and `new-game-closed-returns-to-match`. If an existing match check fails only on the `new-game-closed` scene, stop and report it: it means the match did not come back as it was.

Open these screenshots in `.test/ui-smoke/new-game-close/` and describe them in your report:

- `new-game-reopened`: the X sits at the right end of the header bar.
- `new-game-closed`: the match is back: the console, the minimap panel, the zoom buttons, the units, and the same map view as `battle-exited`.
- `game-over-reopened`: no X.

---

## Final Check

- [ ] **File sizes**

```powershell
foreach ($f in 'src/renderer/openRouter/openRouterUiHelpers.ts','src/renderer/rendering/terrainRendering.ts','src/renderer/gameplay/newGame.ts','src/renderer/core/uiState.ts','scripts/ui-smoke/ui-smoke.cjs','scripts/ui-smoke/ui-smoke-new-game-checks.cjs','static/newGameChrome.css') { "{0} {1}" -f (Get-Content $f).Count, $f }
```

Expected: every count is under 1000. `terrainRendering.ts` is about 606; every other file is under 600.

- [ ] **No leftover names**

```powershell
Get-ChildItem -Path src,static,scripts\ui-smoke -Recurse -Include *.ts,*.html,*.css,*.cjs | Select-String -Pattern 'isTerrainInspectionShown','game-over-dialog-collapsed','map-mode-host','SELECTION_PANEL_SLIDE_MS' -SimpleMatch
```

Expected: no output. `static/renderer.js` is not searched, because it is a build output.

- [ ] **Final status**

```powershell
git status --short
```

## Report

Report, in this order:

1. The final `git status --short`.
2. T0, and the test total and failure total after Phases 3, 5, and 6.
3. Each smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
4. What you saw in each screenshot named in the Verify sections.
5. Every `doc/` line the searches printed that you left unchanged, and why.
6. The `doc/` files you changed.
7. Anything you think is wrong in this plan, without having changed it.

Do not commit.

## For the Reviewer

These checks need a person at the app. Run `npm start` after the report is in.

1. **Minimap border.** The border uses `--chrome-border` (`#5a7090`). If you want a more saturated blue, change the one `border` line in `.minimap-overview::after` in `static/shellChrome.css`, and the token named in `doc/ux/minimap.md` and `doc/ui-style-guide.md`.
2. **Ready.** Turn Run on with a key and a model: the label counts "AI: MM:SS" with no check mark, then returns to the check mark and "Ready". Collapse the console: only the check mark shows; a screen reader still names the button "Ready".
3. **Layers.** Tech shows only the tech icons, with terrain fill and no hex codes. Control off removes the ownership borders, and the home-region outlines at battle-detail zoom. Production on shows labels on opponent and unexplored hexes in their default place; holding T moves them to the lower band and shows the hex codes. In a battle, Tech and Production have no effect. Under the new-game screen, the preview ignores all four.
4. **Floating panel.** Collapse and expand: the panel slides from its top edge. Drag the grip to the bottom-right, then expand: the panel moves up to stay on the map. Resize the window smaller: a moved panel stays inside. Close and reopen: the panel is back at the corner, expanded. Toasts start right of the open panel.
5. **Close and return.** In Strategic planning with Run on, open New game…, wait for a background plan to finish, then close: the match, the camera, and the selection are as they were, and the plan applied. In a battle, open New game… and close: the battle view, its zoom limits, and its pan limit are back. During resolution playback, open and close: playback has finished or continues. Click Ready, then open the game menu while it resolves: New game is disabled with the busy tip.
6. **Start replaces.** Open New game… over a battle, then Start: the battle is released and the new match starts. The map can show the strategic view for a moment between the release and the new match's fit; that is expected.
7. **Accepted behavior.** Strategy toasts from the match under the screen can show over the panel. Opponent planning cost keeps accruing while the screen is open. Opening New game… within the battle fly-in can leave the fly-in's end position as the saved camera. A Ready click begun in the moment before `readyRequestInFlight` is set, and before New game is opened, is discarded: its reply does not apply when the screen closes, and it cannot land on the new match after Start.

## Next

This completes the requested changes.
