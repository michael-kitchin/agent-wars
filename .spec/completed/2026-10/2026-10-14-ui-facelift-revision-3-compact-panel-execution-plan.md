# UI Facelift Revision, Plan 3 of 3: Compact Selection Panel

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Make the selection panel open compact, as its summary bar alone. A 32 px expand control at the bar's left edge, with a chevron, expands the panel upward: the panel's bottom edge stays put, the bar slides up over about 150 ms, and the details open under it. A second click collapses it. The state lasts for the app session, and the resize grip shows only while the panel is expanded.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 3 of the three that build the spec's Phase 6; [ui-facelift-revision-execution-plan.md](ui-facelift-revision-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `src/renderer/gameplay/selectionPanelExpand.ts`: the panel's `data-state` (`compact`, `expanding`, `expanded`, or `collapsing`), the expand control's `aria-expanded`, label, and tip, and the slide, which uses the Web Animations API on the panel's height. Reduced motion skips the slide, and a click during a slide starts from the current height.
- `selectionPanelResize.ts` keeps the dragged height apart from the panel's style: the compact panel is just its bar, and the dragged height comes back when it expands. The dragged width applies in both states. The grip ignores a press unless the panel is expanded.
- `selectionPanel.ts` wires the expand control at startup, and settles a running slide when the panel hides.
- Markup: `data-state="compact"` on the panel, and the expand control as the first item in the bar. Styles hide the details while compact and the grip unless expanded, and turn the chevron.
- Two new tips, in `frameTooltipText.ts`.
- The smoke run records the panel expanded and, later, collapsed again. Two new checks cover the two states.
- `doc/` describes the two states and the expand control.

**Out of scope:**

- Moving the panel. The bar stays the panel's top row in both states, so a later version can add that.
- Saving the state between app sessions.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop, the full tests, and the smoke run against the real app in Electron passed. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Selection Panel, especially Placement, Expanding and collapsing, and Resize.
2. `doc/ux/selection-panel.md`.
3. `src/renderer/gameplay/selectionPanelResize.ts`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 2 is in and this plan is not:

```powershell
Test-Path src/shared/selectionBarText.ts
Test-Path src/renderer/gameplay/selectionPanelExpand.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **896**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/renderer/chrome/frameTooltipText.ts`
- `src/renderer/gameplay/selectionPanelResize.ts`
- `src/renderer/gameplay/selectionPanelExpand.ts`
- `src/renderer/gameplay/selectionPanel.ts`
- `static/index.html`
- `static/selectionChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `scripts/ui-smoke/ui-smoke-console-checks.cjs`
- `doc/ux/selection-panel.md`
- `doc/ux/control-tooltips.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Edit `src/renderer/chrome/frameTooltipText.ts`**

Adds the expand control's two tips: one while compact, one while expanded.

In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * The Reports tab's tip.
```

Replace them with:

```ts
/**
 * The selection panel expand control's tip while the panel is compact.
 *
 * Purpose: Says what expanding the panel shows.
 * When to use: `#selection-panel-expand` while the panel shows only its summary bar.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const selectionPanelExpandTooltipText = "Show the hex, its terrain, and each selected unit's orders.";

/**
 * The selection panel expand control's tip while the panel is expanded.
 *
 * Purpose: Says that collapsing hides the details and keeps the summary bar.
 * When to use: `#selection-panel-expand` while the panel shows its details.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const selectionPanelCollapseTooltipText = 'Hide the details. The bar stays.';

/**
 * The Reports tab's tip.
```

- [ ] **Step 2: Edit `src/renderer/gameplay/selectionPanelResize.ts`**

Keeps the dragged height apart from the panel's style, so the compact panel can be just its bar and an expanding panel can get the dragged height back. Exports `applyDraggedPanelHeight` and `clearPanelHeight` for that. The grip ignores a press unless the panel is expanded.

1. In `src/renderer/gameplay/selectionPanelResize.ts`, find these lines. Together they occur exactly once:

```ts
 * The selection panel's resize grip at its top-right corner.
 *
 * The panel is anchored at the map's bottom-left, so dragging the grip right widens it and dragging it up makes it taller.
```

Replace them with:

```ts
 * The selection panel's resize grip at its top-right corner, shown only while the panel is expanded.
 *
 * The panel is anchored at the map's bottom-left, so dragging the grip right widens it and dragging it up makes it taller.
 * A dragged width applies to both of the panel's states; a dragged height applies only while it is expanded.
```

2. In `src/renderer/gameplay/selectionPanelResize.ts`, find these lines. Together they occur exactly once:

```ts
 * Applies a size to the panel for the rest of the session.
 *
 * Purpose: A dragged size replaces the panel's fit-to-rows height.
 * When to use: On each pointer move during a drag.
 * Expected outcome: Inline width and height on `#selection-panel`. The height may then grow to the map height minus
 *   24 px instead of half the map. The size stays while the panel hides and shows again, until the app closes.
```

Replace them with:

```ts
 * The height the player last dragged the expanded panel to, in CSS pixels.
 *
 * Purpose: The compact panel is the bar's height, so the dragged height must be kept apart from the panel's style while
 *   it is compact, and given back when it expands.
 * When to use: Set by drags; read by `applyDraggedPanelHeight`.
 * Expected outcome: Null until the first drag, then kept until the app closes.
 * Exceptions: None.
 */
let draggedHeight: number | null = null;

/**
 * Gives the panel the height the player dragged it to, if there is one.
 *
 * Purpose: A dragged height replaces the expanded panel's fit-to-rows height.
 * When to use: During a drag, and when the panel expands.
 * Expected outcome: Inline height on `#selection-panel`, which may then grow to the map height minus 24 px instead of
 *   half the map. Nothing changes before the first drag.
 * Exceptions: None.
 */
export function applyDraggedPanelHeight(panel: HTMLElement): void {
  if (draggedHeight === null) return;
  panel.style.height = `${draggedHeight}px`;
  panel.style.maxHeight = 'calc(100% - 24px)';
}

/**
 * Takes the dragged height off the panel, and keeps it for the next expand.
 *
 * Purpose: The compact panel is exactly its summary bar.
 * When to use: When the panel starts to collapse, and when it settles compact.
 * Expected outcome: No inline height or max height on `#selection-panel`; the dragged width stays.
 * Exceptions: None.
 */
export function clearPanelHeight(panel: HTMLElement): void {
  panel.style.height = '';
  panel.style.maxHeight = '';
}

/**
 * Applies a dragged size to the panel for the rest of the session.
 *
 * Purpose: A dragged size replaces the panel's default width and fit-to-rows height.
 * When to use: On each pointer move during a drag.
 * Expected outcome: Inline width, which both states use, and the dragged height. The size stays while the panel hides,
 *   shows again, collapses, and expands, until the app closes.
```

3. In `src/renderer/gameplay/selectionPanelResize.ts`, find these lines. Together they occur exactly once:

```ts
  panel.style.height = `${height}px`;
  panel.style.maxHeight = 'calc(100% - 24px)';
```

Replace them with:

```ts
  draggedHeight = height;
  applyDraggedPanelHeight(panel);
```

4. In `src/renderer/gameplay/selectionPanelResize.ts`, find this line. It occurs exactly once:

```ts
    if (event.button !== 0) return;
```

Replace it with:

```ts
    // The grip only shows while the panel is expanded; a press during a slide does nothing.
    if (event.button !== 0 || panel.dataset.state !== 'expanded') return;
```

- [ ] **Step 3: Create `src/renderer/gameplay/selectionPanelExpand.ts`**

A new file: the panel's compact and expanded states. The expand control flips the state, sets its own `aria-expanded`, label, and tip, and slides the panel's height for 150 ms with the Web Animations API, so the bar moves up as the details open. Reduced motion skips the slide. A click during a slide starts from the current height.

Create `src/renderer/gameplay/selectionPanelExpand.ts` with exactly this content:

```ts
/**
 * The selection panel's two states: compact, the summary bar alone, and expanded, the bar over the details. The expand
 * control at the bar's left edge switches them, and the panel slides between them from its bottom edge, so the bar
 * moves up as the details open under it.
 *
 * Purpose: Keeps the map clear by default, while the full panel stays one click away.
 * When to use: `wireSelectionPanelExpand` once at startup; `settleSelectionPanelSlide` when the panel hides.
 * Expected outcome: `data-state` on `#selection-panel` is `compact`, `expanding`, `expanded`, or `collapsing`. The
 *   styles hide the details only while compact, turn the chevron down while expanded or collapsing, and show the grip
 *   only while expanded. The state the player picks lasts for the app session; the app opens compact.
 * Exceptions: None; missing elements are skipped.
 */
import { selectionPanelCollapseTooltipText, selectionPanelExpandTooltipText } from '../chrome/frameTooltipText';
import { applyDraggedPanelHeight, clearPanelHeight } from './selectionPanelResize';

/**
 * How long the panel takes to slide between its states, in milliseconds.
 *
 * Purpose: Long enough to show where the details come from, short enough not to slow the player down.
 * When to use: The slide's duration.
 * Expected outcome: 150.
 * Exceptions: None.
 */
const SELECTION_PANEL_SLIDE_MS = 150;

/**
 * Whether the player last chose the expanded state.
 *
 * Purpose: The choice lasts across selection changes, while the panel is hidden, and in and out of battles.
 * When to use: Read and written only in this module.
 * Expected outcome: False when the app opens. Not saved.
 * Exceptions: None.
 */
let expanded = false;

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
 * Sets the expand control's state, name, and tip from the player's choice.
 *
 * Purpose: Assistive technology and the tip must say what the next click does as soon as it is clicked.
 * When to use: After the choice changes, and once at startup.
 * Expected outcome: `aria-expanded`, `aria-label`, and the tip match `expanded`.
 * Exceptions: None.
 */
function syncExpandControl(button: HTMLElement): void {
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', expanded ? 'Hide selection details' : 'Show selection details');
  const tip = expanded ? selectionPanelCollapseTooltipText : selectionPanelExpandTooltipText;
  button.setAttribute('data-control-tooltip', tip);
}

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
 * Ends the panel in the state the player chose, with no slide running.
 *
 * Purpose: One place that leaves the panel settled, after a slide or without one.
 * When to use: When a slide finishes, when no slide is needed, and when the panel hides.
 * Expected outcome: `data-state` is `expanded` or `compact`. A compact panel has no inline height.
 * Exceptions: None.
 */
function settle(panel: HTMLElement): void {
  slide?.cancel();
  slide = null;
  panel.dataset.state = expanded ? 'expanded' : 'compact';
  if (!expanded) clearPanelHeight(panel);
}

/**
 * Slides the panel's height from `from` to `to`, then settles it.
 *
 * Purpose: The panel's bottom edge stays put, so a changing height moves the bar up or down.
 * When to use: From `toggleSelectionPanel`, after `data-state` shows the details and the target height is in place.
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

/**
 * Switches the panel between compact and expanded.
 *
 * Purpose: The expand control's single action.
 * When to use: On a click on `#selection-panel-expand`, which also covers Enter and Space.
 * Expected outcome: The choice flips at once. Expanding shows the details and grows the panel to its fit-to-rows or
 *   dragged height; collapsing shrinks it to the bar. A click during a slide starts from the panel's current height.
 * Exceptions: None.
 */
function toggleSelectionPanel(panel: HTMLElement, bar: HTMLElement, button: HTMLElement): void {
  const from = panel.getBoundingClientRect().height;
  slide?.cancel();
  slide = null;
  expanded = !expanded;
  syncExpandControl(button);
  if (expanded) {
    panel.dataset.state = 'expanding';
    applyDraggedPanelHeight(panel);
    slidePanel(panel, from, panel.getBoundingClientRect().height);
    return;
  }
  panel.dataset.state = 'collapsing';
  clearPanelHeight(panel);
  const borders = panel.offsetHeight - panel.clientHeight;
  slidePanel(panel, from, bar.offsetHeight + borders);
}

/**
 * Settles a slide that is still running, so the panel is ready when it shows again.
 *
 * Purpose: A panel that hides during a slide keeps the state the last click chose.
 * When to use: When the selection panel hides.
 * Expected outcome: No slide is running, and `data-state` is `expanded` or `compact`.
 * Exceptions: None.
 */
export function settleSelectionPanelSlide(): void {
  const panel = document.getElementById('selection-panel');
  if (panel && slide) settle(panel);
}

/**
 * Wires the expand control and puts the panel in its opening state.
 *
 * Purpose: The expand feature's single setup point.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: The panel starts compact, and each click on the expand control switches its state.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function wireSelectionPanelExpand(): void {
  const panel = document.getElementById('selection-panel');
  const bar = document.getElementById('selection-panel-bar');
  const button = document.getElementById('selection-panel-expand');
  if (!panel || !bar || !button) return;
  settle(panel);
  syncExpandControl(button);
  button.addEventListener('click', () => toggleSelectionPanel(panel, bar, button));
}
```

- [ ] **Step 4: Edit `src/renderer/gameplay/selectionPanel.ts`**

Wires the expand control at startup, and settles a running slide when the panel hides.

1. In `src/renderer/gameplay/selectionPanel.ts`, find this line. It occurs exactly once:

```ts
import { renderSelectionBarState } from './selectionBar';
```

Replace it with:

```ts
import { renderSelectionBarState } from './selectionBar';
import { settleSelectionPanelSlide, wireSelectionPanelExpand } from './selectionPanelExpand';
```

2. In `src/renderer/gameplay/selectionPanel.ts`, find these lines. Together they occur exactly once:

```ts
 * Expected outcome: Hidden when no selected unit exists. Otherwise the bar's first line, the caption, the chips, and one
 *   row per selected unit describe the first selected unit's hex, and the bar's hint and border follow targeting and
 *   playback. During a battle the panel describes battle cells.
```

Replace them with:

```ts
 * Expected outcome: Hidden when no selected unit exists, with any slide between its states settled. Otherwise the bar's
 *   first line, the caption, the chips, and one row per selected unit describe the first selected unit's hex, and the
 *   bar's hint and border follow targeting and playback. During a battle the panel describes battle cells.
```

3. In `src/renderer/gameplay/selectionPanel.ts`, find this line. It occurs exactly once:

```ts
  if (!summary) return;
```

Replace it with:

```ts
  if (!summary) {
    settleSelectionPanelSlide();
    return;
  }
```

4. In `src/renderer/gameplay/selectionPanel.ts`, find these lines. Together they occur exactly once:

```ts
 * Keeps the panel's order chips in step with the Orders tab, and wires its resize grip.
 *
 * Purpose: A queued or cancelled order changes the panel without a selection change.
 * When to use: Once during renderer startup.
 * Expected outcome: The panel redraws after every change to the queued orders, and its grip resizes it.
```

Replace them with:

```ts
 * Keeps the panel's order chips in step with the Orders tab, and wires its expand control and resize grip.
 *
 * Purpose: A queued or cancelled order changes the panel without a selection change.
 * When to use: Once during renderer startup.
 * Expected outcome: The panel redraws after every change to the queued orders, opens compact, expands and collapses
 *   from its expand control, and resizes from its grip while expanded.
```

5. In `src/renderer/gameplay/selectionPanel.ts`, find this line. It occurs exactly once:

```ts
  onQueuedOrdersChanged(() => renderSelectionPanel(deps));
```

Replace it with:

```ts
  onQueuedOrdersChanged(() => renderSelectionPanel(deps));
  wireSelectionPanelExpand();
```

- [ ] **Step 5: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 6: Edit `static/index.html`**

The panel opens with `data-state="compact"`. The expand control, with its chevron, becomes the first item in the bar.

In `static/index.html`, find these lines. Together they occur exactly once:

```html
    <section id="selection-panel" class="selection-panel" aria-label="Selected units" hidden>
      <div id="selection-panel-grip" class="selection-panel-grip" aria-hidden="true" data-control-tooltip="Drag to resize this panel. The size lasts until the app closes."></div>
      <div id="selection-panel-bar" class="selection-panel-bar">
```

Replace them with:

```html
    <section id="selection-panel" class="selection-panel" aria-label="Selected units" data-state="compact" hidden>
      <div id="selection-panel-grip" class="selection-panel-grip" aria-hidden="true" data-control-tooltip="Drag to resize this panel. The size lasts until the app closes."></div>
      <div id="selection-panel-bar" class="selection-panel-bar">
        <button type="button" id="selection-panel-expand" class="selection-panel-expand" aria-expanded="false" aria-controls="selection-panel-details" aria-label="Show selection details" data-control-tooltip="Show the hex, its terrain, and each selected unit's orders."><svg class="chrome-icon selection-panel-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 10l4.5-4.5 4.5 4.5"></path></svg></button>
```

- [ ] **Step 7: Edit `static/selectionChrome.css`**

Hides the details while compact and the grip unless expanded. Styles the expand control at the bar's full height and 32 px wide, and turns the chevron down while expanded or collapsing.

1. In `static/selectionChrome.css`, find this line. It occurs exactly once:

```css
/* The selection panel at the map's bottom-left: the summary bar, the details under it, and the resize grip. */
```

Replace it with:

```css
/* The selection panel at the map's bottom-left: the summary bar, the details under it, and the resize grip. The panel is
   compact (the bar alone) or expanded; selectionPanelExpand.ts sets data-state and slides between the two. */
```

2. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
/* ---------- Summary bar ---------- */
/* One 50 px row that never scrolls: two lines of text, a divider, Ranged or Strike, and the close control. The controls
   keep their size and the text gives way. The right padding keeps the close control clear of the grip. */
```

Replace them with:

```css
/* The details show while the panel is expanded and while it slides; the grip only once it is fully expanded. */
.selection-panel[data-state="compact"] .selection-panel-details,
.selection-panel:not([data-state="expanded"]) .selection-panel-grip {
  display: none;
}

/* ---------- Summary bar ---------- */
/* One 50 px row that never scrolls: the expand control, two lines of text, a divider, Ranged or Strike, and the close
   control. The controls keep their size and the text gives way. The right padding keeps the close control clear of the
   grip. */
```

3. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
  padding: 0 16px 0 12px;
  box-sizing: border-box;
```

Replace them with:

```css
  padding: 0 16px 0 0;
  box-sizing: border-box;
}
/* The bar's full height on its left edge. The chevron points up while the panel is compact or expanding, and turns down
   once it is expanded, until it is compact again. */
.selection-panel-expand {
  flex: none;
  align-self: stretch;
  width: 32px;
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
.selection-panel-expand:hover {
  background: var(--chrome-bg-raised);
}
.selection-panel-expand:focus {
  outline-offset: -2px;
}
.selection-panel[data-state="expanded"] .selection-panel-chevron,
.selection-panel[data-state="collapsing"] .selection-panel-chevron {
  transform: rotate(180deg);
```

- [ ] **Step 8: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the expanded and collapsed scenes.

In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
  selectionResized: 'selection-resized',
  selectionResizedMin: 'selection-resized-min',
  smallWindow: 'small-window',
```

Replace them with:

```js
  selectionExpanded: 'selection-expanded',
  selectionResized: 'selection-resized',
  selectionResizedMin: 'selection-resized-min',
  smallWindow: 'small-window',
  selectionCollapsed: 'selection-collapsed',
```

- [ ] **Step 9: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Expands the panel on the stack after the strike scene and records it, then collapses it after the small-window scene and records that. Collapsing replaces the drag that used to shrink the panel there.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Drags the selection panel's grip to the window's top-right corner.
```

Replace them with:

```js
/**
 * Clicks the selection panel's expand control and waits for the panel to settle.
 *
 * Purpose: The panel slides between compact and expanded for 150 ms; the click wait is longer.
 * When to use: While the selection panel is shown.
 * Expected outcome: The panel has switched between compact and expanded, and the pointer is parked.
 * Exceptions: Propagates Playwright errors.
 */
async function toggleSelectionPanel(page) {
  await page.click('#selection-panel-expand');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Drags the selection panel's grip to the window's top-right corner.
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await page.click('#air-strike-cancel-btn');

  // Drag the grip far up and right, then far down and left: both ends stop at the panel's size limits.
```

Replace them with:

```js
  await page.click('#air-strike-cancel-btn');

  // Expand the panel on the stack and record it. It stays expanded for the rest of this session, so its grip shows.
  await selectHumanStack(page);
  await toggleSelectionPanel(page);
  await recordScene(page, report, outDir, SCENES.selectionExpanded);

  // Drag the grip far up and right, then far down and left: both ends stop at the panel's size limits.
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  // Shrink the panel again, so it cannot cover the units that the march after the turn clicks.
  await dragSelectionPanelGrip(page, -380, 480);
```

Replace them with:

```js
  // Collapse the panel to its bar and record it, so it cannot cover the units that the march after the turn clicks. It
  // stays compact for the rest of this session.
  await toggleSelectionPanel(page);
  await recordScene(page, report, outDir, SCENES.selectionCollapsed);
```

- [ ] **Step 10: Edit `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

Adds `selection-panel-compact` and `selection-panel-expanded`. They check the expand control's `aria-expanded` and whether the details and the grip show; the compact check also checks that the panel is just its bar. The bar's layout check finds the expand control at the bar's left edge and skips hidden details, and the stack and greyed-out checks also run on the expanded scene.

1. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
    scenes: [SCENES.ordersQueued, SCENES.selectionStack, SCENES.strikeAiming],
    needs: ['#selection-panel', '#selection-panel-bar', '#selection-panel-close', '#selection-panel-details'],
```

Replace them with:

```js
    scenes: [SCENES.ordersQueued, SCENES.selectionStack, SCENES.strikeAiming, SCENES.selectionExpanded],
    needs: ['#selection-panel', '#selection-panel-bar', '#selection-panel-expand', '#selection-panel-close', '#selection-panel-details'],
```

2. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      if (!el('#selection-panel-close').ancestorIds.includes('selection-panel-bar')) return 'the close control is not in the summary bar';
      const details = el('#selection-panel-details');
      return details.y >= bar.y + bar.h - 1 ? null : `the details start at ${fmt(details)}, above the bottom of the bar ${fmt(bar)}`;
```

Replace them with:

```js
      const expand = el('#selection-panel-expand');
      if (!near(expand.x, s.x + 1) || !near(expand.h, SELECTION_BAR_HEIGHT)) return `the expand control is at ${fmt(expand)}, expected the bar's full height at its left edge`;
      if (!el('#selection-panel-close').ancestorIds.includes('selection-panel-bar')) return 'the close control is not in the summary bar';
      const details = el('#selection-panel-details');
      if (!details.shown) return null;
      return details.y >= bar.y + bar.h - 1 ? null : `the details start at ${fmt(details)}, above the bottom of the bar ${fmt(bar)}`;
    },
  },
  {
    name: 'selection-panel-compact',
    scenes: [SCENES.ordersQueued, SCENES.selectionStack, SCENES.strikeAiming, SCENES.selectionCollapsed, SCENES.battleSelection, SCENES.regionalSelection],
    needs: ['#selection-panel', '#selection-panel-expand', '#selection-panel-details', '#selection-panel-grip'],
    run: (p, el) => {
      const s = el('#selection-panel');
      const expand = el('#selection-panel-expand');
      if (expand.expanded !== 'false') return `the expand control reads aria-expanded=${expand.expanded}, expected false while the panel is compact`;
      if (el('#selection-panel-details').shown || el('#selection-panel-grip').shown) return 'the details or the grip show while the panel is compact';
      return near(s.h, SELECTION_BAR_HEIGHT + 2) ? null : `the compact panel is ${fmt(s)}, expected only the ${SELECTION_BAR_HEIGHT} px bar inside its border`;
    },
  },
  {
    name: 'selection-panel-expanded',
    scenes: [SCENES.selectionExpanded, SCENES.selectionResized, SCENES.selectionResizedMin, SCENES.smallWindow],
    needs: ['#selection-panel-expand', '#selection-panel-details', '#selection-panel-grip'],
    run: (p, el) => {
      const expand = el('#selection-panel-expand');
      if (expand.expanded !== 'true') return `the expand control reads aria-expanded=${expand.expanded}, expected true while the panel is expanded`;
      return el('#selection-panel-details').shown && el('#selection-panel-grip').shown ? null : 'the details or the grip are hidden while the panel is expanded';
```

3. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
    name: 'selection-panel-stack',
    scenes: [SCENES.selectionStack],
```

Replace them with:

```js
    name: 'selection-panel-stack',
    scenes: [SCENES.selectionStack, SCENES.selectionExpanded],
```

4. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
    scenes: [SCENES.selectionStack],
```

Replace it with:

```js
    scenes: [SCENES.selectionStack, SCENES.selectionExpanded],
```

- [ ] **Step 11: Edit `doc/ux/selection-panel.md`**

Describes the two states, the expand control, its keys, and the slide.

1. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- A summary bar, one 50 px row across the top of the panel that never scrolls. From left to right:
````

Replace it with:

````markdown
- Two states. Compact: the summary bar alone. Expanded: the summary bar on top and the details under it. The app opens compact (`src/renderer/gameplay/selectionPanelExpand.ts`).
- A summary bar, one 50 px row across the top of the panel in both states, that never scrolls. From left to right:
  - The expand control, the bar's full height and 32 px wide, with a chevron that points up while the panel is compact and down while it is expanded.
````

2. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- The details, under the bar:
````

Replace it with:

````markdown
- The details, under the bar, shown only while the panel is expanded:
````

3. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
- A resize grip at the top-right corner, clear of the close control.
- The panel opens 440 px wide, 12 px in from the map's left and bottom edges, and is never wider than the map minus 24 px. Its height fits the bar and the details, up to half the map's height; past that the unit rows scroll. When the panel is shorter than the bar, the caption, the chips, and one row, the details scroll as a whole. Where it overlaps the terrain legend, the map scale, or the minimap panel, it draws above them.
- Control tips for the close control, the grip, and a greyed-out Ranged or Strike are in [control-tooltips.md](control-tooltips.md).
````

Replace them with:

````markdown
- A resize grip at the top-right corner, clear of the close control, shown only while the panel is expanded.
- The panel opens 440 px wide, 12 px in from the map's left and bottom edges, and is never wider than the map minus 24 px; both states share that width. Compact, it is the bar's height. Expanded, its height fits the bar and the details, up to half the map's height; past that the unit rows scroll. When the panel is shorter than the bar, the caption, the chips, and one row, the details scroll as a whole. Where it overlaps the terrain legend, the map scale, or the minimap panel, it draws above them.
- Control tips for the expand control, the close control, the grip, and a greyed-out Ranged or Strike are in [control-tooltips.md](control-tooltips.md).
````

4. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
- When the player clicks the close control, the selection clears exactly as a right-click on the map clears it. Queued orders stay. See [selection-model.md](selection-model.md).
- When the player clicks an order's cancel control, that order is cancelled exactly as its Orders tab row's cancel control does.
- When the player drags the grip, the panel resizes. Its bottom-left corner stays put. The width stays from 400 to 640 px and the height from 140 px to the map's height minus 24 px (`clampSelectionPanelSize` in `src/shared/selectionPanelSize.ts`). A dragged height replaces the half-the-map limit.
````

Replace them with:

````markdown
- When the player clicks the expand control, the panel switches between compact and expanded. Its bottom-left corner stays put, so expanding slides the bar up as the details open under it, and collapsing slides it back down, over 150 ms. When the system asks for reduced motion, the change is immediate. A click during a slide sends the panel back the other way from where it is.
- When the player clicks the close control, the selection clears exactly as a right-click on the map clears it. Queued orders stay. See [selection-model.md](selection-model.md).
- When the player clicks an order's cancel control, that order is cancelled exactly as its Orders tab row's cancel control does.
- When the player drags the grip, which shows only while the panel is expanded, the panel resizes. Its bottom-left corner stays put. The width stays from 400 to 640 px and the height from 140 px to the map's height minus 24 px (`clampSelectionPanelSize` in `src/shared/selectionPanelSize.ts`). A dragged width applies to both states. A dragged height applies while the panel is expanded and replaces the half-the-map limit.
````

5. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
### Keyboard

- None.
````

Replace them with:

````markdown
### Keyboard

- Enter or Space on the focused expand control switches the panel, as a click does. There is no other key.
````

6. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- A dragged size lasts until the app closes, including while the panel is hidden. It is not saved.
````

Replace it with:

````markdown
- The state the player picks, compact or expanded, lasts until the app closes: across selection changes, while the panel is hidden, and in and out of battles. It is not saved. If the panel hides during a slide, it keeps the state the last click chose.
- A dragged size lasts until the app closes, including while the panel is hidden or compact. It is not saved.
- `aria-expanded` and the expand control's name and tip change on the click; the chevron turns when the slide ends.
````

7. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- Hidden: nothing is selected, or the new-game overlay is open.
````

Replace it with:

````markdown
- Hidden: nothing is selected, or the new-game overlay is open.
- Compact: the summary bar alone. The app opens in this state.
- Expanded: the summary bar and the details, with the grip.
````

8. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#selection-panel`, `#selection-panel-grip`, `#selection-panel-bar`, `#sidebar-selected-unit`, `#selection-panel-hint`, `#ranged-attack-tip-host`, `#selection-panel-close`, `#selection-panel-details`, `#selection-panel-caption`, `#selection-panel-chips`, `#selection-panel-units`, `#selection-panel-action-note`, `#sidebar-error`)
- `static/selectionChrome.css`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/renderer/gameplay/selectionBar.ts`
````

Replace them with:

````markdown
- `static/index.html` (`#selection-panel`, `#selection-panel-grip`, `#selection-panel-bar`, `#selection-panel-expand`, `#sidebar-selected-unit`, `#selection-panel-hint`, `#ranged-attack-tip-host`, `#selection-panel-close`, `#selection-panel-details`, `#selection-panel-caption`, `#selection-panel-chips`, `#selection-panel-units`, `#selection-panel-action-note`, `#sidebar-error`)
- `static/selectionChrome.css`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/renderer/gameplay/selectionBar.ts`
- `src/renderer/gameplay/selectionPanelExpand.ts`
````

- [ ] **Step 12: Edit `doc/ux/control-tooltips.md`**

Adds the expand control's tips.

In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Selection panel grip: Drag to resize this panel. The size lasts until the app closes.
````

Replace it with:

````markdown
- Selection panel grip: Drag to resize this panel. The size lasts until the app closes.
- Selection panel expand control, while the panel is compact: Show the hex, its terrain, and each selected unit's orders.
- Selection panel expand control, while the panel is expanded: Hide the details. The bar stays.
````

- [ ] **Step 13: Edit `doc/ui-style-guide.md`**

The selection panel's live-app line describes the compact and expanded states.

In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
A 50 px summary bar across its top holds the hex code and count, a hint for the next map gesture, Ranged or Strike, and the close control. The hex's caption and chips and one row per unit sit under it.
````

Replace it with:

````markdown
It opens compact: a 50 px summary bar with an expand control, the hex code and count, a hint for the next map gesture, Ranged or Strike, and the close control. A click on the expand control slides the bar up, and the hex's caption and chips and one row per unit open under it; the state lasts for the session.
````

- [ ] **Step 14: Edit `doc/how-to-play.md`**

The selection panel opens as a bar with a hint, the chevron shows and hides its details, and the grip resizes it while they show.

In `doc/how-to-play.md`, find this text. It occurs exactly once:

````markdown
The selection panel at the map's bottom-left names the hex and lists the selected units with their orders; its **×** clears the selection. Drag its corner grip to resize the panel. The size lasts until you close the app.
````

Replace it with:

````markdown
The selection panel at the map's bottom-left opens as a bar that names the hex and the selection, with a hint for what a double-click does next; its **×** clears the selection. Click the chevron at the bar's left edge to show the hex's terrain and each selected unit's orders, and click it again to hide them. While they show, drag the panel's corner grip to resize it. The panel's state and size last until you close the app.
````

## Verify

- [ ] **Step 15: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 16: Full tests**

Run the full tests. Expected: exit 0, test total **896**, failure total **0**.

- [ ] **Step 17: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/renderer/chrome/frameTooltipText.ts src/renderer/gameplay/selectionPanelResize.ts src/renderer/gameplay/selectionPanelExpand.ts src/renderer/gameplay/selectionPanel.ts static/index.html static/selectionChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke.cjs scripts/ui-smoke/ui-smoke-console-checks.cjs doc/ux/selection-panel.md doc/ux/control-tooltips.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/renderer/chrome/frameTooltipText.ts` | `1864a61b10104101` |
| `src/renderer/gameplay/selectionPanelResize.ts` | `e565493746797e77` |
| `src/renderer/gameplay/selectionPanelExpand.ts` | `6b14fb19d37d31d8` |
| `src/renderer/gameplay/selectionPanel.ts` | `efccbf7b870b1e7f` |
| `static/index.html` | `7f78ec227b8bc3de` |
| `static/selectionChrome.css` | `df07e6c1b6a777e7` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `9ce2e443510aa4d5` |
| `scripts/ui-smoke/ui-smoke.cjs` | `ab83d5af63894cce` |
| `scripts/ui-smoke/ui-smoke-console-checks.cjs` | `ebc1c0beb1428493` |
| `doc/ux/selection-panel.md` | `06845749a4c62e23` |
| `doc/ux/control-tooltips.md` | `b4bc08a3d7656064` |
| `doc/ui-style-guide.md` | `053cb33806c3f06a` |
| `doc/how-to-play.md` | `d7164c96d8ece97d` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 18: Smoke run**

```powershell
npm run ui:smoke -- --label compact-panel
```

Expected summary line:

```text
ui-smoke compact-panel: 456 passed, 0 failed, 0 page errors, 36 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\compact-panel
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/compact-panel/report.json`.

- [ ] **Step 19: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/compact-panel/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The selected units' names and hex codes can differ from run to run, and the battle's units are placed when it opens.

- `18-selection-expanded.png` against [ui-facelift-revision-3-expected-expanded.png](ui-facelift-revision-3-expected-expanded.png): a stack selected with the panel expanded. The expand control is a column at the bar's left edge, with its chevron pointing down. Under the bar: the hex caption, the chips, the unit rows, and the greyed-out reason. The grip shows at the top-right corner.
- `22-selection-collapsed.png` against [ui-facelift-revision-3-expected-compact.png](ui-facelift-revision-3-expected-compact.png): the same stack at 800 × 600, compact: only the bar shows, its hint ends in an ellipsis, the chevron points up, and there is no grip.
- `28-battle-selection.png` against [ui-facelift-revision-3-expected-battle.png](ui-facelift-revision-3-expected-battle.png): a battle with one sub-unit selected, compact: the bar names the battle cell, such as "(E8.K3)", then the sub-unit's flag and name.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 16.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 19.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. Select a unit: the panel opens compact, as the bar alone, with the chevron pointing up and no grip.
2. Click the chevron: the bar slides up as the details open under it, and the chevron turns down when the slide ends. Click it again: the panel slides back to the bar.
3. Click the chevron twice quickly: the second click sends the slide back from where it is, without a jump.
4. Expanded, drag the grip to make the panel wider and taller. Collapse it: the bar keeps the new width. Expand it: the dragged height comes back.
5. Press Tab until the chevron has focus, then Enter, then Space: each switches the state.
6. Expand the panel, click × to clear the selection, then select another unit: the panel opens expanded. Enter a battle and select a sub-unit: it is still expanded.
7. Turn off animation effects in Windows (Settings, Accessibility, Visual effects), then restart the app: expanding and collapsing are immediate.
8. Point at the chevron while compact and while expanded: the tip says what the next click does.

## Next

This completes the spec's Phase 6. Phase 7 builds the new-game and game-over screens.
