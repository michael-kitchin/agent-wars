# Strike Target List, Compact Start Game, and Minimap Border

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Three UI changes, built in three phases that each end in a working, checked app:

1. The minimap overview's inner border is 2 px instead of 1 px.
2. Aiming an air strike opens the target list to the left of the reticle, and the reticle stays where it was.
3. Collapsing the new-game panel replaces the header message with the existing Start game button. Expanding puts that button back in the footer, as it is now.

**Requirements (locked):**

- **Minimap.** Double the overview's inner border only. It stays `--chrome-border` (`#5a7090`), still drawn by `.minimap-overview::after`, still above the map and the tabs toggle, and it still takes no pointer input. The panel's own 1 px border and the map-mode tabs do not change.
- **Air strike.** In the selection bar the order is: summary text, divider, target list, reticle, close. The list shows only while a strike is aimed. The reticle's right edge stays 10 px left of the close control, the same gap as when the list is hidden, so opening the list does not move the reticle. Do not change the tooltip sentence. "Beside it" in that sentence is still true.
- **Collapsed new-game panel.** One `#new-game-btn`, moved in the document. Do not add a second button. Its click listener, label, tip, and enabled or disabled state move with the element. `newGame.ts`, `uiState.ts`, and `newGameMapUi.ts` keep setting those by id. Do not edit those files.
  - Startup and New game from the menu: the button reads "Start game".
  - Game over: the button reads "New game", and "You win!" or "You lose." is hidden. This includes game over. Do not special-case the win or loss text.
  - The button is the footer's teal button, inset in the 50 px header: 6 px from the expand control, 6 px from the close control when that control is showing or else 6 px from the bar's right edge, and 6 px from the top and bottom of the bar (38 px tall). It is not a full-height square-cornered bar.
  - Expanded, including during the expand and collapse slides, the panel looks as it does now: the message in the header, the button in the footer.
  - The swap happens when the panel settles on compact, in the same turn as `data-state` becoming `compact`. During the 150 ms collapse the message stays and the button stays in the footer. Reduced motion swaps immediately because the slide is skipped. Do not animate the swap, and do not move the button at the start of the collapse. That would change the height the slide measures.
  - Every open still starts expanded, with the button in the footer.
- **Accepted, do not "fix":** the move grip already covers the top-right corner of the close control. With no close control it covers the top-right corner of the header button the same way. A click in that 14 px corner moves the panel. The button's center still starts the match.

**What this plan changes:**

- `static/shellChrome.css`: the overview border, 1 px to 2 px.
- `static/index.html`: the target list before the reticle, and an id on the new-game footer.
- `static/selectionChrome.css` and `src/renderer/gameplay/tacticalOrders.ts`: comments only. The show and hide logic in `updateRangedSidebar` stays.
- `static/newGameChrome.css` and `src/renderer/gameplay/newGameDialogCollapse.ts`: the compact header and the button move.
- The UI smoke run: a measured border width, the list's new place, two collapsed new-game scenes, and one collapsed game-over scene. No node test is added. The behavior needs a document, and the smoke run is the contract check. The test total stays at T0.
- `doc/`: the documents named in each phase.

**Out of scope:**

- A second Start button, or any change to what Start does.
- The reticle's tooltip wording, and the same sentence in `doc/ux/control-tooltips.md`.
- Saving the collapsed state. Every open is still expanded.
- The minimap panel's outer border, and any border other than `.minimap-overview::after`.
- Moving the grip off the button.

**How this plan was checked:** The plan was not pre-built, and its steps have not been run. Every Find block was copied from the files as they stood when the plan was written, and each was checked to occur exactly once. Test-count expectations are relative to the total you record in Before You Start. If a step cannot be applied as written, or a check gives an unexpected result, stop and report it. Do not work around it.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no phase numbers, no step numbers, and nothing from this file's name. Every block in this plan already follows this.
  - Do not add, reword, or "improve" anything this plan does not ask for. The blocks already meet the orienting-comment, file-size, naming, logging, and documentation rules. Renderer code logs only in `catch` blocks, with `console.error`, as the existing renderer does. None of the new functions catch. If you think something is wrong, finish the step as written and say so in your report.
- **Shell:** Windows PowerShell, at the repository root `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain commands with `&&`.
- **Line endings:** the working tree uses Windows line endings (CRLF). The blocks in this plan show plain lines. Treat each line break in a block as the file's own line break, and keep each file's existing line endings. If your editing tool matches text byte for byte, convert a block to CRLF before matching, or edit line by line.
- **How to apply a step:**
  - "Find ... Replace ...": the Find text occurs exactly once in the file at that moment, unless the step says otherwise. Match it exactly, including leading spaces. A Find block can be part of a single line.
  - "Replace the comment block above X": replace every line from the `/**` line directly above X down to its `*/` line, including any empty line between them, with the block given. Leave X itself alone.
  - Every code block starts at the left margin of this document, so every space inside a block is part of the text.
  - If a Find text is missing, or occurs a different number of times than the step says, stop and report the step, the file, and what you found. Do not adapt the edit.
- Some Find texts and new code contain non-ASCII characters (`·`, `…`). Copy them exactly. PowerShell may print them garbled. The files are fine.
- `static/renderer.js` is a committed build output. It changes whenever `npm run build:renderer` or `npm run ui:smoke` runs. Leave it changed. Do not revert it.
- No step needs an API key, and the smoke run makes no model calls.
- Moving `#new-game-btn` in the document keeps the listener `registerNewGameButton` already added. Do not add another click listener.

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
- It prints one `PASS` or `FAIL` line per check, then a summary line: `ui-smoke <label>: P passed, F failed, E page errors, N screenshots in <folder>`. Screenshots are named `<NN>-<scene>.png`. This plan names them by the `<scene>` part, because adding scenes renumbers them.
- The window can show a "map tiles failed to load" toast when the network is slow. That toast is not a failure.
- After a smoke run the SQLite module is built for Electron. `npm test` rebuilds it for Node by itself, and `npm start` works as usual.

## Before You Start

- [ ] **Read**

1. `AGENTS.md` and each file in `.cursor/rules/`.
2. `doc/ux/minimap.md`, `doc/ux/selection-panel.md`, `doc/ux/console-command-bar.md`, `doc/ux/new-game-dialog.md`, and `doc/ux/modes-and-transitions.md`.
3. `src/renderer/gameplay/newGameDialogCollapse.ts` and `src/renderer/chrome/panelSlideHelpers.ts`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files and `static/renderer.js`. Then:

```powershell
[bool](Select-String -Path static/shellChrome.css -Pattern 'border: 1px solid var(--chrome-border);' -Context 5,0 | Select-String -Pattern 'minimap-overview::after' -SimpleMatch -Quiet)
[bool](Select-String -Path static/index.html -Pattern 'id="new-game-panel-footer"' -SimpleMatch -Quiet)
$html = Get-Content static/index.html -Raw
$html.IndexOf('id="ranged-attack-tip-host"') -lt $html.IndexOf('id="air-strike-target-type"')
```

Expected: `True`, `False`, `True`. The target list is still after the reticle, and the footer has no id. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0 and failure total **0**. Write down the test total. This plan calls it **T0**. A failure means the starting point is broken: stop and report.

---

## Phase 1: Minimap Border at 2 px

The overview's inner border doubles. Nothing else about the minimap changes. The smoke run reads the computed width, so this phase does not depend on a later phase.

- [ ] **Step 1.1: Thicken the border in `static/shellChrome.css`**

Find:

```css
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

Replace with:

```css
   Leaflet's panes stay under the toggle. A 2 px border runs around the overview's inside edge, over the map and the
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
  border: 2px solid var(--chrome-border);
  pointer-events: none;
}
```

Leave the panel's own `border: 1px solid var(--chrome-border)` on `.minimap-panel` as it is.

- [ ] **Step 1.2: Read the border width in `scripts/ui-smoke/ui-smoke-checks.cjs`**

`probePage` runs inside the page. The helper that reads the pseudo-element must stay inside `probePage`. A pseudo-element has no selector the other checks can name.

Replace the comment block above `function probePage` with:

```javascript
/**
 * Collects what the checks read from the renderer page.
 *
 * Purpose: Runs inside the page through `page.evaluate`, so it may only use browser globals and its argument.
 * When to use: Once per scene, after the scene has settled, with every selector that any check reads.
 * Expected outcome: A plain object that can be passed back to Node. `elements` has one entry per selector:
 *   null when the selector matches nothing, otherwise the first match's box, text, font size, border color, pointer
 *   events, tip, and the attributes the checks use, plus the text of every match in `allTexts`.
 *   `minimapBorderWidth` is the computed top border width of `.minimap-overview::after`, such as `2px`, or `''` when
 *   the overview is missing.
 * Exceptions: None.
 */
```

Find:

```javascript
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    activeElementId: document.activeElement ? document.activeElement.id : '',
    elements,
  };
```

Replace with:

```javascript
  const overview = document.querySelector('.minimap-overview');
  const minimapBorderWidth = overview ? getComputedStyle(overview, '::after').borderTopWidth : '';
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    activeElementId: document.activeElement ? document.activeElement.id : '',
    minimapBorderWidth,
    elements,
  };
```

- [ ] **Step 1.3: Check the width in `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`**

Find:

```javascript
      return shown.length === 0 ? null : `shown on the new-game screen: ${shown.join(', ')}`;
    },
  },
]);
```

Replace with:

```javascript
      return shown.length === 0 ? null : `shown on the new-game screen: ${shown.join(', ')}`;
    },
  },
  {
    name: 'minimap-overview-border',
    scenes: [SCENES.strategic],
    needs: ['.minimap-overview'],
    run: (p, el) => {
      if (!el('.minimap-overview').shown) return 'the minimap overview is not shown';
      return p.minimapBorderWidth === '2px'
        ? null
        : `the overview's inner border is ${p.minimapBorderWidth}, expected 2px`;
    },
  },
]);
```

`SCENES.strategic` is recorded at three window sizes. The check runs on each. The width is in CSS pixels, so the size does not matter.

- [ ] **Step 1.4: Update the docs**

In `doc/ux/minimap.md`, find:

```markdown
- A thin border in the chrome's border color (`--chrome-border`) on the overview's inside edge, over the map and the tabs toggle. It does not take the pointer (`.minimap-overview::after` in `static/shellChrome.css`).
```

Replace with:

```markdown
- A 2 px border in the chrome's border color (`--chrome-border`) on the overview's inside edge, over the map and the tabs toggle. It does not take the pointer (`.minimap-overview::after` in `static/shellChrome.css`).
```

In `doc/ui-style-guide.md`, find:

```markdown
and a thin `--chrome-border` line on its inside edge
```

Replace with:

```markdown
and a 2 px `--chrome-border` line on its inside edge
```

That text occurs once.

- [ ] **Verify Phase 1**

Run the fast loop. Then:

```powershell
[bool](Select-String -Path static/shellChrome.css -Pattern 'border: 2px solid var(--chrome-border);' -SimpleMatch -Quiet)
```

Expected: `True`. Then the smoke run:

```powershell
npm run ui:smoke -- --label minimap-border
```

Expected: the summary line reports 0 failed and 0 page errors, and the output has a `PASS` line for `minimap-overview-border`. Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/minimap-border/report.json`.

Open `strategic-1280x720` in `.test/ui-smoke/minimap-border/` and describe the overview's inner edge in your report.

---

## Phase 2: Target List to the Left of the Reticle

The list is a sibling that shows and hides. It sits after the reticle today, inside `.selection-panel-actions`, and that group is the flex item before the close control. The group's `gap` is `0.35rem`, and the bar's `gap` is `10px`. Putting the list first makes the group grow left, into the summary text. The reticle stays the group's last item, so it stays 10 px from the close control. `updateRangedSidebar` already sets the list's `display`. Do not change that function's code. Comments only.

- [ ] **Step 2.1: Reorder the controls in `static/index.html`**

Find:

```html
        <div class="selection-panel-actions">
          <span id="ranged-attack-tip-host" class="control-tooltip-host" style="display: none;"><button type="button" id="ranged-attack-btn" class="selection-panel-reticle" aria-label="Ranged attack" aria-pressed="false"><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5"></circle><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"></path></svg></button></span>
          <select id="air-strike-target-type" class="ranged-btn" style="display: none;" data-control-tooltip="Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you stop aiming.">
            <option value="units">Enemy Units</option>
            <option value="urban">Production</option>
            <option value="airport">Airports</option>
            <option value="seaport">Seaports</option>
          </select>
        </div>
```

Replace with:

```html
        <div class="selection-panel-actions">
          <select id="air-strike-target-type" class="ranged-btn" style="display: none;" data-control-tooltip="Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you stop aiming.">
            <option value="units">Enemy Units</option>
            <option value="urban">Production</option>
            <option value="airport">Airports</option>
            <option value="seaport">Seaports</option>
          </select>
          <span id="ranged-attack-tip-host" class="control-tooltip-host" style="display: none;"><button type="button" id="ranged-attack-btn" class="selection-panel-reticle" aria-label="Ranged attack" aria-pressed="false"><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5"></circle><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"></path></svg></button></span>
        </div>
```

The tooltip attribute stays on the list. Do not edit `strikeAimTooltipText` in `src/renderer/chrome/controlTooltipText.ts`.

- [ ] **Step 2.2: Update the two comments**

In `static/selectionChrome.css`, find:

```css
/* One 50 px row that never scrolls: the expand control, two lines of text, a divider, the reticle, and the close
   control. The controls keep their size and the text gives way. */
```

Replace with:

```css
/* One 50 px row that never scrolls: the expand control, two lines of text, a divider, the reticle, and the close
   control. While a strike is aimed, the target list sits between the divider and the reticle. The controls keep
   their size and the text gives way. */
```

Find:

```css
/* The reticle that aims a ranged attack or an air strike, and while a strike is aimed, the target list beside it. The
```

Replace with:

```css
/* The reticle that aims a ranged attack or an air strike, and while a strike is aimed, the target list to its left. The
```

In `src/renderer/gameplay/tacticalOrders.ts`, find `the strike target list shows beside it only while a strike is aimed` and replace with `the strike target list shows to its left only while a strike is aimed`. That sentence occurs once. Leave the rest of the comment.

- [ ] **Step 2.3: Check the place and the gap in `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

Find:

```javascript
const SELECTION_PANEL_LIMITS = Object.freeze({ minWidth: 400, maxWidth: 640, minHeight: 140, mapMargin: 24 });
```

Replace with:

```javascript
const SELECTION_PANEL_LIMITS = Object.freeze({ minWidth: 400, maxWidth: 640, minHeight: 140, mapMargin: 24 });

/**
 * The gap between the reticle and the close control, in CSS pixels.
 *
 * Purpose: Opening the strike target list must not push the reticle. The list grows to the reticle's left.
 * When to use: The strike aiming and strike stopped checks.
 * Expected outcome: Matches `gap` on `.selection-panel-bar` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const RETICLE_CLOSE_GAP = 10;
```

Find:

```javascript
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#sidebar-selected-unit', '#selection-panel-hint', '#selection-panel'],
    run: (p, el) => {
      const strike = el('#ranged-attack-btn');
      const problem = reticleProblem(strike, { name: SELECTION_BAR.strikeName, enabled: true, pressed: true });
      if (problem) return problem;
      const list = el('#air-strike-target-type');
      if (!list.shown || !list.ancestorIds.includes('selection-panel-bar')) return 'the strike target list is not shown in the summary bar';
      if (list.x < strike.x + strike.w) return `the target list ${fmt(list)} is not to the right of the reticle ${fmt(strike)}`;
```

Replace with:

```javascript
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#sidebar-selected-unit', '#selection-panel-hint', '#selection-panel', '#selection-panel .selection-panel-divider', '#selection-panel-close'],
    run: (p, el) => {
      const strike = el('#ranged-attack-btn');
      const problem = reticleProblem(strike, { name: SELECTION_BAR.strikeName, enabled: true, pressed: true });
      if (problem) return problem;
      const list = el('#air-strike-target-type');
      const divider = el('#selection-panel .selection-panel-divider');
      const close = el('#selection-panel-close');
      const panel = el('#selection-panel');
      if (!list.shown || !list.ancestorIds.includes('selection-panel-bar')) return 'the strike target list is not shown in the summary bar';
      if (divider.x + divider.w > list.x + 1) return `the target list ${fmt(list)} is not to the right of the divider ${fmt(divider)}`;
      if (list.x + list.w > strike.x + 1) return `the target list ${fmt(list)} is not to the left of the reticle ${fmt(strike)}`;
      if (!near(close.x - (strike.x + strike.w), RETICLE_CLOSE_GAP)) {
        return `the reticle ${fmt(strike)} is not ${RETICLE_CLOSE_GAP} px left of the close control ${fmt(close)}`;
      }
      if (close.x + close.w > panel.x + panel.w + 1) return `the close control ${fmt(close)} falls outside the panel ${fmt(panel)}`;
```

In the `strike-stopped-by-reticle` check, find:

```javascript
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#selection-panel-hint', '#selection-panel'],
    run: (p, el) => {
      const problem = reticleProblem(el('#ranged-attack-btn'), { name: SELECTION_BAR.strikeName, enabled: true, pressed: false });
      if (problem) return problem;
      if (el('#air-strike-target-type').shown) return 'the strike target list still shows after the reticle stopped aiming';
```

Replace with:

```javascript
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#selection-panel-hint', '#selection-panel', '#selection-panel-close'],
    run: (p, el) => {
      const strike = el('#ranged-attack-btn');
      const problem = reticleProblem(strike, { name: SELECTION_BAR.strikeName, enabled: true, pressed: false });
      if (problem) return problem;
      if (el('#air-strike-target-type').shown) return 'the strike target list still shows after the reticle stopped aiming';
      const close = el('#selection-panel-close');
      if (!near(close.x - (strike.x + strike.w), RETICLE_CLOSE_GAP)) {
        return `the reticle ${fmt(strike)} is not ${RETICLE_CLOSE_GAP} px left of the close control ${fmt(close)}`;
      }
```

The same gap in both scenes is what shows the reticle did not move. `near` allows one CSS pixel.

- [ ] **Step 2.4: Update the docs**

In `doc/ux/selection-panel.md`, find:

```markdown
  - A divider, then the reticle, and the air-strike target list beside it while a strike is aimed. See [console-command-bar.md](console-command-bar.md).
```

Replace with:

```markdown
  - A divider, then the air-strike target list, then the reticle, while a strike is aimed. The list is hidden otherwise, and the reticle stays against the close control. See [console-command-bar.md](console-command-bar.md).
```

In `doc/ux/console-command-bar.md`, find `a target-type choice beside the pressed reticle` and replace with `a target-type choice to the left of the pressed reticle`. Find `and the target-type choice shows beside it` and replace with `and the target-type choice shows to its left`. Find `with the target-type choice beside it` and replace with `with the target-type choice to its left`. Each occurs once.

In `doc/how-to-play.md`, find `and a list beside it picks the target type` and replace with `and a list to its left picks the target type`. That sentence occurs once.

Do not change `doc/ux/control-tooltips.md` or `strikeAimTooltipText`. Both quote the tooltip, which still says "beside it".

- [ ] **Verify Phase 2**

Run the fast loop. Then:

```powershell
$html = Get-Content static/index.html -Raw
$html.IndexOf('id="air-strike-target-type"') -lt $html.IndexOf('id="ranged-attack-tip-host"')
```

Expected: `True`. Then the smoke run:

```powershell
npm run ui:smoke -- --label strike-list
```

Expected: 0 failed and 0 page errors, with `PASS` lines for `minimap-overview-border`, `strike-aiming-in-panel`, and `strike-stopped-by-reticle`. Any `FAIL`, `PAGE-ERROR`, or `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/strike-list/report.json`.

Open `strike-aiming` and `strike-stopped` in `.test/ui-smoke/strike-list/` and describe where the list and the reticle sit in your report.

---

## Phase 3: Start Game in the Collapsed Header

The footer gains an id. `setPanelState` becomes the only writer of `data-state`, and it puts `#new-game-btn` in the header only for `compact`. `expanding`, `expanded`, and `collapsing` leave it in the footer. Callers measure height after `setPanelState` returns. Both writes happen before the function returns, so the browser paints the settled placement once.

The compact CSS hides the message and the footer. Until the button has been moved, a compact panel would show an empty header. Land the script and the CSS before the smoke run. Do not stop between them to try the app.

The regional match in the smoke run is chosen, then the panel is collapsed, then Start is clicked in the header. The game-over screen is collapsed, checked, and expanded again before the small-window scene, so that scene stays expanded.

- [ ] **Step 3.1: Name the footer in `static/index.html`**

Find:

```html
    <div class="new-game-panel-footer">
```

Replace with:

```html
    <div id="new-game-panel-footer" class="new-game-panel-footer">
```

Keep the class. The existing footer rules use it.

- [ ] **Step 3.2: Move the button from `src/renderer/gameplay/newGameDialogCollapse.ts`**

Replace the comment block above `import { startPanelHeightSlide }` with:

```typescript
/**
 * The new-game setup panel's two states: expanded, the header bar over the choices and Start, and compact, the header
 * bar alone with Start in place of the message. The expand control at the bar's left edge switches them, and the panel
 * slides between them from its top edge, so the choices open downward under the bar.
 *
 * Purpose: Lets the player see more of the preview map without closing the screen, and start the match from the bar
 *   while the choices are hidden.
 * When to use: `expandNewGameDialog` whenever the overlay opens; `toggleNewGameDialogCollapsed` from the expand control.
 * Expected outcome: `data-state` on `#game-over-overlay` is `compact`, `expanding`, `expanded`, or `collapsing`. The
 *   styles hide the body, the footer, and the message only while compact, and turn the chevron up while expanded or
 *   collapsing. `#new-game-btn` is in the header only while compact. While expanding, expanded, or collapsing it is in
 *   the footer, so a collapse slide still shows the message and the button until the panel settles. Moving the button
 *   keeps the listener, label, tip, and enabled state already set on it.
 * Exceptions: None; missing elements are skipped.
 */
```

Find:

```typescript
/**
 * Ends the panel in the state the player chose, with no slide running.
```

Replace with the following, which inserts the new helpers in front of that comment. Leave the `settle` function's comment and body to the next replacement. The Find text is only the first line of the comment, and it occurs once.

```typescript
/**
 * The panel's slide states.
 *
 * Purpose: One value for both `data-state` and where Start sits.
 * When to use: `setPanelState`.
 * Expected outcome: `compact` is the settled state with the choices hidden. The other three show the choices,
 *   including during a slide.
 * Exceptions: None.
 */
type NewGamePanelState = 'compact' | 'expanding' | 'expanded' | 'collapsing';

/**
 * Puts Start in the header or the footer for this state.
 *
 * Purpose: One button, so its click listener, label, tip, and enabled state stay with it. The header shows it only
 *   once the choices are hidden. During a collapse it stays in the footer until the panel settles.
 * When to use: From `setPanelState`, before `data-state` changes, in the same turn.
 * Expected outcome: Compact inserts `#new-game-btn` before the close control, or at the end of the header when that
 *   control is absent. Every other state appends it to `#new-game-panel-footer`. Does nothing when the button is
 *   already in that parent, or when the button or the destination is missing.
 * Exceptions: None.
 */
function placeStartButton(state: NewGamePanelState): void {
  const button = document.getElementById('new-game-btn');
  const parent = document.getElementById(state === 'compact' ? 'new-game-panel-header' : 'new-game-panel-footer');
  if (!(button instanceof HTMLButtonElement) || !parent || button.parentElement === parent) return;
  if (state === 'compact') {
    const close = document.getElementById('new-game-dialog-close');
    parent.insertBefore(button, close && close.parentElement === parent ? close : null);
    return;
  }
  parent.appendChild(button);
}

/**
 * Records the panel's state and puts Start where that state shows it.
 *
 * Purpose: The only writer of `data-state`, so the button cannot be left in the wrong bar.
 * When to use: From `settle` and from both branches of `toggleNewGameDialogCollapsed`. Callers that measure the
 *   panel's height do it after this returns.
 * Expected outcome: The button is moved, then `data-state` is set, both before this returns.
 * Exceptions: None. A missing button or destination still sets `data-state`.
 */
function setPanelState(panel: HTMLElement, state: NewGamePanelState): void {
  placeStartButton(state);
  panel.dataset.state = state;
}

/**
 * Ends the panel in the state the player chose, with no slide running.
```

Find:

```typescript
function settle(panel: HTMLElement): void {
  slide?.cancel();
  slide = null;
  panel.dataset.state = expanded ? 'expanded' : 'compact';
}
```

Replace with:

```typescript
function settle(panel: HTMLElement): void {
  slide?.cancel();
  slide = null;
  setPanelState(panel, expanded ? 'expanded' : 'compact');
}
```

Replace the comment block above `export function expandNewGameDialog` with:

```typescript
/**
 * Shows the new-game choices at once, with no slide.
 *
 * Purpose: Opening the overlay always starts expanded, including after the player had collapsed it.
 * When to use: Only when the overlay goes from hidden to shown, and before pointer input is disabled for that open.
 * Expected outcome: The panel is expanded, Start is in the footer, and the expand control says it hides the choices.
 *   The camera does not move.
 * Exceptions: None. Missing elements leave the panel unchanged.
 */
```

Replace the comment block above `export function toggleNewGameDialogCollapsed` with:

```typescript
/**
 * Switches the panel between expanded and compact.
 *
 * Purpose: The expand control's single action.
 * When to use: On a click on `#new-game-dialog-collapse`, which also covers Enter and Space.
 * Expected outcome: The choice flips at once. Expanding puts Start in the footer, shows the choices, and grows the
 *   panel to its content, held inside the map. Collapsing drops focus from the choices and shrinks the panel to the
 *   header bar; Start moves into that bar, and the message hides, when the panel settles. A click during a slide
 *   starts from the panel's current height. The map keeps the pointer either way.
 * Exceptions: None. Missing elements leave the panel unchanged.
 */
```

Find:

```typescript
  if (expanded) {
    panel.dataset.state = 'expanding';
    const to = panel.getBoundingClientRect().height;
```

Replace with:

```typescript
  if (expanded) {
    setPanelState(panel, 'expanding');
    const to = panel.getBoundingClientRect().height;
```

The height read stays after `setPanelState`, so it includes the button in the footer. Do not move that read above the call.

Find:

```typescript
  panel.dataset.state = 'collapsing';
```

Replace with:

```typescript
  setPanelState(panel, 'collapsing');
```

`collapsing` leaves the button in the footer. `settle` is what moves it, when the slide ends or when there is no slide.

- [ ] **Step 3.3: Style the header button in `static/newGameChrome.css`**

Find:

```css
   expand control, the message, and, while a match waits under the screen, the close control. The body holds the Map,
   Forces, and Rules sections and scrolls, and the footer holds Start. Hiding the choices leaves only the header
   bar. The grip on the panel's top-right corner moves it. */
```

Replace with:

```css
   expand control, the message, and, while a match waits under the screen, the close control. The body holds the Map,
   Forces, and Rules sections and scrolls, and the footer holds Start. Hiding the choices leaves the header bar, with
   Start in place of the message. The grip on the panel's top-right corner moves it. */
```

Find:

```css
/* Compact is the header bar alone. The body and the footer show in every other state, including during a slide. */
```

Replace with:

```css
/* Compact is the header bar alone, with Start in it and the message hidden. The body and the footer show in every
   other state, including during a slide, and Start is in the footer then. */
```

Find:

```css
.new-game-panel[data-state="compact"] .new-game-panel-header {
  border-bottom-color: transparent;
}
```

Replace with:

```css
.new-game-panel[data-state="compact"] .new-game-panel-header {
  border-bottom-color: transparent;
  gap: 0;
}
.new-game-panel[data-state="compact"] #game-over-message {
  display: none;
}
/* The same Start button, filling the header while the choices are hidden. 6 px from the expand control, from the
   close control or the bar's right edge, and from the top and bottom of the 50 px bar. `align-self: stretch` and
   `height: auto` are both required: the header centers its items, and the footer's `#new-game-btn` rule sets a fixed
   height, which would stop the stretch. This rule is the more specific of the two. */
.new-game-panel-header #new-game-btn {
  flex: 1 1 auto;
  align-self: stretch;
  width: auto;
  min-width: 0;
  height: auto;
  margin: 6px;
}
```

Do not change `#new-game-btn`'s footer rule (`width: 100%`, `height: 42px`). It still applies while the button is in the footer, and the font size and weight still apply in the header.

The message's `:has(+ .new-game-panel-close)` margin rule stops matching while the button sits between them. That is only while compact, when the message is `display: none`. Expanded, the button is back in the footer and the rule matches again. Do not edit that rule.

- [ ] **Step 3.4: Add the collapsed scenes in `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Find:

```javascript
  newGameRegional: 'new-game-regional',
```

Replace with:

```javascript
  newGameRegional: 'new-game-regional',
  newGameRegionalHidden: 'new-game-regional-hidden',
```

Find:

```javascript
  gameOverReopened: 'game-over-reopened',
```

Replace with:

```javascript
  gameOverReopened: 'game-over-reopened',
  gameOverHidden: 'game-over-hidden',
```

Find:

```javascript
  SCENES.newGameRegional,
  SCENES.gameOverReopened,
```

Replace with:

```javascript
  SCENES.newGameRegional,
  SCENES.newGameRegionalHidden,
  SCENES.gameOverReopened,
  SCENES.gameOverHidden,
```

Replace the comment block above `const NEW_GAME_SCENES` with:

```javascript
/**
 * Scenes that show the new-game overlay.
 *
 * Purpose: The overlay replaces the match chrome with the new-game screen, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while the overlay is open.
 * Expected outcome: The first scene, the game menu opened on it, the choices hidden, the panel moved by its grip, the
 *   overlay opened from a match, its Regional tab, that tab with the choices hidden, and the finished match reopened,
 *   with the choices hidden, then at the 800 x 600 minimum.
 * Exceptions: None.
 */
```

- [ ] **Step 3.5: Start from the header in `scripts/ui-smoke/ui-smoke-new-game.cjs`**

Find:

```javascript
 * Purpose: Keeps the overlay's choices and their checks together, apart from the scene order in `ui-smoke.cjs`.
 * When to use: Required by `ui-smoke.cjs`.
 * Expected outcome: Async helpers that drive the overlay the way a player would; nothing runs on load.
```

Replace with:

```javascript
 * Purpose: Keeps the overlay's choices and their checks together, apart from the scene order in `ui-smoke.cjs`.
 * When to use: Required by `ui-smoke.cjs`.
 * Expected outcome: Async helpers that drive the overlay the way a player would. Choosing a regional match and
 *   clicking Start are separate, so the runner can hide the choices between them. Nothing runs on load.
```

Find:

```javascript
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.start);
}
```

Replace with:

```javascript
  await clickStartGame(page, 60000);
}
```

That ending belongs to `startScenarioMatch` only. The regional function's timeout is 90000. If the Find matches more than once, stop.

Insert the following directly above the comment block that begins `Chooses the fixed scenario on the new-game overlay`:

```javascript
/**
 * Clicks Start and waits until the overlay has closed.
 *
 * Purpose: One click for both matches. The button is the same element in the footer and in the collapsed header.
 * When to use: After the scenario's choices are set, whether or not the choices are hidden.
 * Expected outcome: `#game-over-overlay` has `hidden`, and the match has had time to fit the map.
 * Exceptions: Throws a Playwright timeout when the overlay does not close within `timeoutMs`.
 */
async function clickStartGame(page, timeoutMs) {
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: timeoutMs });
  await page.waitForTimeout(SETTLE_MS.start);
}

```

Replace the comment block above `async function startRegionalMatch` with:

```javascript
/**
 * Chooses the fixed regional scenario on the open new-game overlay.
 *
 * Purpose: The runner records that tab, then hides the choices, then starts. Choosing stops before the click.
 * When to use: While the new-game overlay is open.
 * Expected outcome: Regional is selected, with `REGIONAL_SCENARIO`'s region and sides. The overlay stays open.
 * Exceptions: Throws when a choice does not hold.
 */
```

Find:

```javascript
async function startRegionalMatch(page) {
```

Replace with:

```javascript
async function chooseRegionalScenario(page) {
```

Find:

```javascript
  if (chosen.region !== REGIONAL_SCENARIO.region || chosen.human !== REGIONAL_SCENARIO.humanSide || chosen.ai !== REGIONAL_SCENARIO.aiSide) {
    throw new Error(`regional choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 90000 });
  await page.waitForTimeout(SETTLE_MS.start);
}
```

Replace with:

```javascript
  if (chosen.region !== REGIONAL_SCENARIO.region || chosen.human !== REGIONAL_SCENARIO.humanSide || chosen.ai !== REGIONAL_SCENARIO.aiSide) {
    throw new Error(`regional choices did not hold: ${JSON.stringify(chosen)}`);
  }
}
```

Find:

```javascript
module.exports = { openNewGameOverlay, startRegionalMatch, startScenarioMatch, waitForNewGameOverlay };
```

Replace with:

```javascript
module.exports = { chooseRegionalScenario, clickStartGame, openNewGameOverlay, startScenarioMatch, waitForNewGameOverlay };
```

- [ ] **Step 3.6: Record the collapsed scenes in `scripts/ui-smoke/ui-smoke.cjs`**

Find:

```javascript
const { openNewGameOverlay, startRegionalMatch, startScenarioMatch, waitForNewGameOverlay } = require('./ui-smoke-new-game.cjs');
```

Replace with:

```javascript
const { chooseRegionalScenario, clickStartGame, openNewGameOverlay, startScenarioMatch, waitForNewGameOverlay } = require('./ui-smoke-new-game.cjs');
```

Find:

```javascript
 * beat of a battle there, and starts a regional match, and the third reopens that match after the run marks it as lost.
```

Replace with:

```javascript
 * beat of a battle there, hides the new-game choices, and starts a regional match from the header button, and the
 * third reopens that match after the run marks it as lost.
```

Find:

```javascript
  // Hiding the choices leaves only the header bar over the map. Show them again, then move the panel by its grip; the
  // next open puts it back in the corner.
```

Replace with:

```javascript
  // Hiding the choices leaves the header bar, with Start in place of the message. Show them again, then move the
  // panel by its grip; the next open puts it back in the corner.
```

Find:

```javascript
  await page.click('#new-game-tab-regional');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.overlay);
  await recordScene(page, report, outDir, SCENES.newGameRegional);
  await startRegionalMatch(page);
```

Replace with:

```javascript
  await page.click('#new-game-tab-regional');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.overlay);
  await recordScene(page, report, outDir, SCENES.newGameRegional);
  // Choose the regional match, hide the choices, and start from the button in the header.
  await chooseRegionalScenario(page);
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameRegionalHidden);
  await clickStartGame(page, 90000);
```

Find:

```javascript
  await recordScene(page, report, outDir, SCENES.gameOverReopened);
  await setViewport(app, page, SMALL_WINDOW);
```

Replace with:

```javascript
  await recordScene(page, report, outDir, SCENES.gameOverReopened);
  // Hide the choices, so the header shows New game in place of the result, then show them again before the small window.
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.gameOverHidden);
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await setViewport(app, page, SMALL_WINDOW);
```

`SETTLE_MS.resize` is 1500 ms. The slide is 150 ms, so the scene is recorded after the panel has settled.

- [ ] **Step 3.7: Check the header button in `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`**

Find:

```javascript
  barHeight: 50,
  controlWidth: 32,
  footerInset: 18,
```

Replace with:

```javascript
  barHeight: 50,
  controlWidth: 32,
  headerStartMargin: 6,
  footerInset: 18,
```

Find:

```javascript
 * The new-game scenes that show the setup panel expanded: every new-game scene except the one with the choices hidden.
 *
 * Purpose: The panel's layout checks apply only while the panel shows.
 * When to use: The `scenes` list of a panel layout check.
 * Expected outcome: Derived from `NEW_GAME_SCENES`.
 * Exceptions: None.
 */
const PANEL_SCENES = Object.freeze(NEW_GAME_SCENES.filter((scene) => scene !== SCENES.newGameHidden));
```

Replace with:

```javascript
 * The new-game scenes that show the setup panel with its choices hidden.
 *
 * Purpose: Those scenes show Start in the header. The expanded layout checks must not run on them.
 * When to use: The hidden-choices check, and the filter that builds `PANEL_SCENES`.
 * Expected outcome: The startup screen and the regional screen, each after the expand control is clicked. Game over
 *   has its own check, because the button there reads "New game".
 * Exceptions: None.
 */
const HIDDEN_CHOICE_SCENES = Object.freeze([SCENES.newGameHidden, SCENES.newGameRegionalHidden]);

/**
 * The new-game scenes that show the setup panel expanded.
 *
 * Purpose: The panel's layout checks apply only while the choices and the footer show.
 * When to use: The `scenes` list of a panel layout check.
 * Expected outcome: Derived from `NEW_GAME_SCENES`, without the three scenes whose choices are hidden.
 * Exceptions: None.
 */
const PANEL_SCENES = Object.freeze(NEW_GAME_SCENES.filter((scene) => !HIDDEN_CHOICE_SCENES.includes(scene) && scene !== SCENES.gameOverHidden));
```

The `/**` line above that Find stays and opens the first replacement comment. If the Find does not match, stop. Do not delete the comment by hand.

Insert the following directly above the comment block whose first sentence is `The new-game screen's checks, one row each.` Do not insert it between that comment and `const NEW_GAME_CHECKS`.

```javascript
/**
 * Checks Start in the header bar while the choices are hidden.
 *
 * Purpose: The same button fills the bar between the expand control and the close control, or the bar's right edge.
 * When to use: The hidden-choices checks, with the label that screen shows.
 * Expected outcome: Null when the button is in the header, inset by `PANEL.headerStartMargin`, and reads `label`.
 *   A failure message otherwise. This does not check whether the button is enabled: at game over the Regional tab
 *   can be a map with fewer than two sides, and Start is disabled then.
 * Exceptions: None.
 */
function hiddenHeaderStartProblem(panel, collapse, start, close, label) {
  const innerY = panel.y + PANEL.border;
  const innerRight = panel.x + panel.w - PANEL.border;
  const margin = PANEL.headerStartMargin;
  if (!start.shown || !start.ancestorIds.includes('new-game-panel-header')) return `Start is not in the header (${fmt(start)})`;
  if (start.text !== label) return `the header button reads "${start.text}", expected "${label}"`;
  if (!near(start.x, collapse.x + collapse.w + margin)) {
    return `the header button is at ${fmt(start)}, expected ${margin} px right of the expand control ${fmt(collapse)}`;
  }
  const rightEdge = close.shown ? close.x : innerRight;
  const rightOf = close.shown ? 'the close control' : "the bar's right edge";
  if (!near(start.x + start.w, rightEdge - margin)) {
    return `the header button is at ${fmt(start)}, expected ${margin} px left of ${rightOf}`;
  }
  if (!near(start.y, innerY + margin) || !near(start.h, PANEL.barHeight - 2 * margin)) {
    return `the header button is at ${fmt(start)}, expected ${margin} px below the header's top and ${PANEL.barHeight - 2 * margin} px tall`;
  }
  return null;
}

```

In the `new-game-panel-layout` check, find:

```javascript
      if (!start.shown || !near(start.x, innerX + PANEL.footerInset) || !near(start.x + start.w, innerRight - PANEL.footerInset)) {
        return `Start game is at ${fmt(start)}, expected the footer's width inside ${PANEL.footerInset} px of padding`;
      }
```

Replace with:

```javascript
      if (!start.ancestorIds.includes('new-game-panel-footer')) return 'Start game is not in the footer while the choices show';
      if (!start.shown || !near(start.x, innerX + PANEL.footerInset) || !near(start.x + start.w, innerRight - PANEL.footerInset)) {
        return `Start game is at ${fmt(start)}, expected the footer's width inside ${PANEL.footerInset} px of padding`;
      }
```

Find:

```javascript
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
```

Replace with:

```javascript
  {
    name: 'new-game-choices-hidden',
    scenes: HIDDEN_CHOICE_SCENES,
    needs: ['#game-over-overlay', '#canvas-container', '#new-game-dialog-collapse', '#game-over-message', '#game-over-dialog', '#new-game-btn', '#new-game-dialog-close'],
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
      if (el('#game-over-message').shown) return 'the message is shown with the choices hidden';
      if (el('#game-over-dialog').shown) return 'the choices are shown';
      if (!near(panel.h, PANEL.barHeight + 2 * PANEL.border)) {
        return `the panel is ${Math.round(panel.h)} px tall with the choices hidden, expected the ${PANEL.barHeight} px bar inside its border`;
      }
      const start = el('#new-game-btn');
      const problem = hiddenHeaderStartProblem(panel, collapse, start, el('#new-game-dialog-close'), 'Start game');
      if (problem) return problem;
      return start.disabled ? 'Start game is disabled' : null;
    },
  },
  {
    name: 'game-over-choices-hidden',
    scenes: [SCENES.gameOverHidden],
    needs: ['#game-over-overlay', '#new-game-dialog-collapse', '#game-over-message', '#game-over-dialog', '#new-game-btn', '#new-game-dialog-close'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const close = el('#new-game-dialog-close');
      if (close.shown) return 'the close control shows at game over';
      if (el('#game-over-message').shown) return 'the result is shown with the choices hidden';
      if (el('#game-over-dialog').shown) return 'the choices are shown at game over';
      if (!near(panel.h, PANEL.barHeight + 2 * PANEL.border)) {
        return `the panel is ${Math.round(panel.h)} px tall with the choices hidden, expected the ${PANEL.barHeight} px bar inside its border`;
      }
      return hiddenHeaderStartProblem(panel, el('#new-game-dialog-collapse'), el('#new-game-btn'), close, 'New game');
    },
  },
```

In `new-game-close-hidden-without-match`, find:

```javascript
    scenes: [SCENES.newGameStartup, SCENES.newGameMenu, SCENES.newGameHidden, SCENES.newGameMoved, SCENES.gameOverReopened, SCENES.gameOverSmallWindow],
```

Replace with:

```javascript
    scenes: [SCENES.newGameStartup, SCENES.newGameMenu, SCENES.newGameHidden, SCENES.newGameMoved, SCENES.gameOverReopened, SCENES.gameOverHidden, SCENES.gameOverSmallWindow],
```

In `new-game-close-over-match`, find:

```javascript
    scenes: [SCENES.newGameReopened, SCENES.newGameRegional],
```

Replace with:

```javascript
    scenes: [SCENES.newGameReopened, SCENES.newGameRegional, SCENES.newGameRegionalHidden],
```

On `new-game-regional-hidden` the message is `display: none`, so its box is empty and the existing "message runs under the close control" comparison still passes. Do not change that comparison.

- [ ] **Step 3.8: Update the docs**

In `doc/ux/new-game-dialog.md`:

Find:

```markdown
Its header bar is 50 px tall: the chevron expand control (a 32 px column with a divider) at the left, then the message, and, while a match waits under the screen, a close control (a 32 px column) at the right. Its body holds the choices and scrolls. Its footer holds Start game, or New game.
```

Replace with:

```markdown
Its header bar is 50 px tall: the chevron expand control (a 32 px column with a divider) at the left, then the message, and, while a match waits under the screen, a close control (a 32 px column) at the right. Its body holds the choices and scrolls. Its footer holds Start game, or New game, while the choices show. While they are hidden, that same button fills the header between the expand control and the close control, or the bar's right edge, 6 px in from each side and from the top and bottom of the bar. It keeps its label, tip, and enabled state (`placeStartButton` in `src/renderer/gameplay/newGameDialogCollapse.ts`).
```

Find `and it still shows the message.` and replace with `and Start game, or New game, takes the message's place. During the 150 ms collapse the message stays and the button stays in the footer; they swap when the panel settles.`

Find:

```markdown
- When the player clicks the expand control while the choices are showing, the panel slides down to the header bar and the chevron points down.
```

Replace with:

```markdown
- When the player clicks the expand control while the choices are showing, the panel slides down to the header bar and the chevron points down. The settled bar shows Start game, or New game, in place of the message.
```

Find `When the player clicks Start game or New game, the match starts` and replace with `When the player clicks Start game or New game, in the footer or in the collapsed header, the match starts`.

Find:

```markdown
`#new-game-start-month-randomize`, `#new-game-btn`)
```

Replace with:

```markdown
`#new-game-start-month-randomize`, `#new-game-panel-footer`, `#new-game-btn`)
```

In `doc/ux/modes-and-transitions.md`, find `The panel can still be collapsed to the header bar, which keeps the win or loss message.` and replace with `The panel can still be collapsed to the header bar, where New game takes the place of the win or loss message.`

In `doc/ui-style-guide.md`, find `Collapsed, only that bar shows. Its body scrolls; its footer holds Start game across its width.` and replace with `Collapsed, that bar shows the Start game or New game button in place of the message, and the footer is hidden. While the choices show, the body scrolls and the footer holds that button across its width.`

Find `While they are hidden, only the square remains, in the same spot, and the map widens to the window's left edge.` and replace with `While they are hidden, the header bar shows that button in place of the message, in the same spot.` The map does not change width when the choices hide. It is already the full window under the top bar. Dropping that clause records that.

In `doc/ux-specification.md`, find `leaves it with Exit Battle, and then starts a new regional match.` and replace with `leaves it with Exit Battle, hides the new-game choices, and starts a new regional match from the header button.`

- [ ] **Verify Phase 3**

Run the fast loop. Then:

```powershell
[bool](Select-String -Path src/renderer/gameplay/newGameDialogCollapse.ts -Pattern 'panel.dataset.state' -SimpleMatch -Quiet)
[bool](Select-String -Path scripts/ui-smoke -Pattern 'startRegionalMatch' -SimpleMatch -Quiet)
```

Expected: `False`, `False`. `setPanelState` is the only writer of `data-state`, and nothing still calls the old regional helper. A `True` means a writer or a caller was left behind: stop and report the file and the line.

Then the smoke run:

```powershell
npm run ui:smoke -- --label compact-start
```

Expected: 0 failed and 0 page errors, with `PASS` lines for `minimap-overview-border`, `strike-aiming-in-panel`, `new-game-choices-hidden`, `game-over-choices-hidden`, `new-game-panel-layout`, and `new-game-close-over-match`. Any `FAIL`, `PAGE-ERROR`, or `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/compact-start/report.json`.

Open these screenshots in `.test/ui-smoke/compact-start/` and describe them in your report:

- `new-game-hidden`: the header is the chevron and a Start game button. No message.
- `new-game-regional-hidden`: the same, with the close control at the right and the button between them.
- `game-over-hidden`: the button reads New game. The result text is gone. No close control.
- `game-over-small-window`: the choices are back, and New game is in the footer.
- `regional-start`: the regional match has started.

---

## Final Check

- [ ] **Full tests**

Run the full tests from Verification Commands. Expected: exit 0, test total **T0**, failure total **0**.

- [ ] **File sizes**

```powershell
foreach ($f in 'src/renderer/gameplay/newGameDialogCollapse.ts','scripts/ui-smoke/ui-smoke.cjs','scripts/ui-smoke/ui-smoke-checks.cjs','scripts/ui-smoke/ui-smoke-console-checks.cjs','scripts/ui-smoke/ui-smoke-new-game-checks.cjs','scripts/ui-smoke/ui-smoke-new-game.cjs','static/newGameChrome.css') { "{0} {1}" -f (Get-Content $f).Count, $f }
```

Expected: every count is under 600. `ui-smoke.cjs` starts at 566 and should stay under 600. A count of 600 or more: stop and report it. Do not split a file unless the report says which one.

- [ ] **No leftover phrases**

```powershell
Get-ChildItem -Path doc,src,static,scripts/ui-smoke -Recurse -Include *.md,*.ts,*.css,*.html,*.cjs | Select-String -Pattern 'A thin border in the chrome','a thin `--chrome-border` line','not to the right of the reticle','still shows the message','keeps the win or loss message','only the square remains','startRegionalMatch'
```

Expected: no output. `static/renderer.js` may contain `startRegionalMatch` only if a source string did. It should not, because that name lived only in the smoke scripts. If the search prints a `renderer.js` line, say so. Do not treat it as a source failure, and do not edit `renderer.js` by hand.

These hits are expected if you search more broadly, and they stay:

- `doc/ux/control-tooltips.md` and `src/renderer/chrome/controlTooltipText.ts`: the tooltip still says "in the list beside it".
- Other "beside" sentences that are not the strike list, the minimap border, or the collapsed new-game message.

- [ ] **Final status**

```powershell
git status --short
```

Expected paths, and no others except further `.spec/` files that were already there:

- `static/shellChrome.css`, `static/selectionChrome.css`, `static/newGameChrome.css`, `static/index.html`, `static/renderer.js`
- `src/renderer/gameplay/newGameDialogCollapse.ts`, `src/renderer/gameplay/tacticalOrders.ts`
- `scripts/ui-smoke/ui-smoke.cjs`, `scripts/ui-smoke/ui-smoke-checks.cjs`, `scripts/ui-smoke/ui-smoke-console-checks.cjs`, `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, `scripts/ui-smoke/ui-smoke-new-game.cjs`, `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `doc/how-to-play.md`, `doc/ui-style-guide.md`, `doc/ux-specification.md`, `doc/ux/console-command-bar.md`, `doc/ux/minimap.md`, `doc/ux/modes-and-transitions.md`, `doc/ux/new-game-dialog.md`, `doc/ux/selection-panel.md`

## Report

Report, in this order:

1. The final `git status --short`.
2. T0, and the test total and failure total from the Final Check.
3. Each smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
4. What you saw in each screenshot named in the Verify sections.
5. Every leftover-phrase hit you left in place, and why.
6. The `doc/` files you changed.
7. Anything you think is wrong in this plan, without having changed it.

Do not commit.

## For the Reviewer

These checks need a person at the app. Run `npm start` after the report is in.

1. **Minimap.** The inner edge of the overview is a 2 px `#5a7090` line, over the map and over the tabs toggle. The toggle still clicks. The line does not cover the map-mode tabs.
2. **Air strike.** Select only air units and click the reticle. The list opens to its left and the reticle does not jump. Click the reticle again: the list hides and the reticle has not moved. A ranged selection still shows no list.
3. **Collapsed panel.** At startup, collapse: the message is gone and Start game fills the bar, inset, with the chevron at the left. Expand: the message and the footer button are back. Open New game over a match, collapse: the close control stays at the right and the button sits between the chevron and it. Close still returns to the match.
4. **Game over.** Collapse: the button reads New game and the win or loss text is gone. Expand: the text is back and the button is in the footer. Start still works from either place, including while a regional map has disabled the button (the header button stays disabled).
5. **Slide.** Collapse and watch the 150 ms: the message stays through the slide and the button replaces it at the end. Expand: the button is in the footer as the panel grows. A click during a slide reverses it.
6. **Grip.** With the panel collapsed and no close control, the top-right corner of Start game moves the panel. The rest of the button starts the match.
