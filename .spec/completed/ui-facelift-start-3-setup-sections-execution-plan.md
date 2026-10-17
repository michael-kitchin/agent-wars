# UI Facelift Start Screen, Plan 3 of 3: Setup Panel Sections

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Rebuild the setup panel's choices as the mockup's three sections. Map: the Global and Regional tabs, then rows of label, dropdown, and randomize button (Human and AI, or Region, Your side, and Opponent), then Add another opponent as a disabled placeholder. Forces: the Advanced tech line beside the title, Game size, and one row of the four unit types with their caps and prices. Rules: the four bonuses in two columns, the starting month, and Fog of war. Every control keeps its id, its tip, its options, and its behavior.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 3 of the three that build the spec's Phase 7; [ui-facelift-start-execution-plan.md](ui-facelift-start-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- Markup: the panel body becomes three `<section>` elements with titles. The labels follow the mockup and lose their colons, the slashes go, and each unit's icon names its type in its alternative text.
- `static/newGameChrome.css`: the rules for the controls are replaced by the sections' styles. Controls are 30 px tall. A grid gives every map dropdown one left edge and width, and another lines up the bonus dropdowns and the starting month. The map rows' label column is at least 5em, so a wider system font cannot run "Opponent" into its dropdown.
- `formatUnitCostLabel` returns `$20` instead of `($20)`, and its test follows.
- Two helpers that the old layout needed are removed: the slash watcher in `newGameOptionsUi.ts`, and `newGameRegionSelectWidth.ts`, which measured one shared dropdown width. The grids now do that.
- The smoke run records the Regional tab before the regional match starts. New checks cover the sections, the rows in either tab, the placeholder, the unit row, and the Rules layout.
- `doc/` describes the sections, including `doc/game-size-unit-caps.md` and `doc/region-vs-region.md`, which described the old layout. The new-game document's code entry points correct the Origin bonus dropdown's id.

**Out of scope:**

- What any choice does when a match starts. Only the layout and the wording change.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop, the full tests, and the smoke run against the real app in Electron passed. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 7", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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

1. [ui-facelift-spec.md](ui-facelift-spec.md): New Game and Game Over, and the mockups [ui-facelift-new-game-global.png](ui-facelift-new-game-global.png) and [ui-facelift-new-game-regional.png](ui-facelift-new-game-regional.png).
2. `doc/ux/new-game-dialog.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 2 is in and this plan is not:

```powershell
[bool](Select-String -Path static/index.html -Pattern 'new-game-panel-header' -SimpleMatch -Quiet)
Test-Path src/renderer/gameplay/newGameRegionSelectWidth.ts
[bool](Select-String -Path static/index.html -Pattern 'new-game-section-map' -SimpleMatch -Quiet)
```

Expected: `True`, `True`, `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **896**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/gameMapList.ts`
- `src/shared/gameMapList.test.ts`
- `src/shared/gameSize.ts`
- `src/renderer/gameplay/newGameOptionsUi.ts`
- `src/renderer/gameplay/newGame.ts`
- `src/renderer/gameplay/newGameRegionUi.ts`
- `src/renderer/gameplay/newGameMapUi.ts`
- `src/renderer/gameplay/newGameSizeUi.ts`
- `src/renderer/gameplay/newGameRegionSelectWidth.ts` (deleted)
- `src/renderer/core/constants.ts`
- `static/index.html`
- `static/newGameChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/new-game-dialog.md`
- `doc/ux/control-tooltips.md`
- `doc/ui-style-guide.md`
- `doc/game-size-unit-caps.md`
- `doc/region-vs-region.md`

- [ ] **Step 1: Edit `src/shared/gameMapList.ts`**

`formatUnitCostLabel` returns `$20` instead of `($20)`, for the unit row's compact form. Comments put the Advanced line beside the Forces title.

1. In `src/shared/gameMapList.ts`, find this line. It occurs exactly once:

```ts
   * When to use: The Advanced line under the game size selector, for the tab that is showing.
```

Replace it with:

```ts
   * When to use: The Advanced line beside the Forces title on the start screen, for the tab that is showing.
```

2. In `src/shared/gameMapList.ts`, find these lines. Together they occur exactly once:

```ts
 * When to use: After each unit type on the start menu, for the selected tab and region.
 * Expected outcome: The price in parentheses, such as `($20)`.
 * Exceptions: None.
 */
export function formatUnitCostLabel(cost: number): string {
  return `($${cost})`;
```

Replace them with:

```ts
 * When to use: After each unit type's cap on the start screen, for the selected tab and region.
 * Expected outcome: The price with a dollar sign, such as `$20`.
 * Exceptions: None.
 */
export function formatUnitCostLabel(cost: number): string {
  return `$${cost}`;
```

3. In `src/shared/gameMapList.ts`, find this line. It occurs exactly once:

```ts
 * When to use: Under the game size selector, for the Global map or the selected region.
```

Replace it with:

```ts
 * When to use: Beside the Forces title on the start screen, for the Global map or the selected region.
```

- [ ] **Step 2: Edit `src/shared/gameMapList.test.ts`**

Follows the new price format.

In `src/shared/gameMapList.test.ts`, find these lines. Together they occur exactly once:

```ts
  assert.equal(formatUnitCostLabel(20), '($20)');
  assert.equal(formatUnitCostLabel(65), '($65)');
```

Replace them with:

```ts
  assert.equal(formatUnitCostLabel(20), '$20');
  assert.equal(formatUnitCostLabel(65), '$65');
```

- [ ] **Step 3: Edit `src/shared/gameSize.ts`**

A comment only: the caps are in the unit row, not badges.

In `src/shared/gameSize.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Lets the dialog show stack-style numbers without duplicating type order in HTML/JS.
 * When to use: Rendering or refreshing the four cap badges under the Game size dropdown.
```

Replace them with:

```ts
 * Purpose: Lets the start screen's unit row show each cap without duplicating type order in HTML/JS.
 * When to use: Rendering or refreshing the four caps in the unit row under the Game size dropdown.
```

- [ ] **Step 4: Edit `src/renderer/gameplay/newGameOptionsUi.ts`**

Removes the code that hid a slash at the edge of a wrapped bonus line. The bonuses are a grid now, with no slashes.

1. In `src/renderer/gameplay/newGameOptionsUi.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * Selector for the bonus options block.
 *
 * Purpose: Its slash separators are hidden when a line wraps a slash to the edge of that line.
 * When to use: `registerNewGameOptionSeparators`.
 * Expected outcome: Matches the block in `static/index.html`. That block is two lines: Country with Tech, then Terrain with Weather.
 * Exceptions: None.
 */
const NEW_GAME_OPTIONS_BLOCK_SELECTOR = '.game-over-options';

/**
 * Class of the slash separators between the bonus dropdowns.
 *
 * Purpose: Finds the separators without depending on their position on a line.
 * When to use: `syncNewGameOptionSeparators`.
 * Expected outcome: Matches the separator spans in `static/index.html`.
 * Exceptions: None.
 */
const NEW_GAME_OPTION_SEPARATOR_CLASS = 'game-over-options-separator';

/**
```

Replace them with:

```ts
/**
```

2. In `src/renderer/gameplay/newGameOptionsUi.ts`, find these lines. Together they occur exactly once:

```ts
}

/**
 * Returns true when an element shares a flex line with a separator.
 *
 * Purpose: Items on one flex line can differ in height, so the test uses the separator's vertical midpoint
 *   instead of comparing tops.
 * When to use: `syncNewGameOptionSeparators`.
 * Expected outcome: True when the midpoint falls inside the neighbor's vertical extent. A missing neighbor counts as
 *   a different line.
 * Exceptions: None.
 */
function isOnSeparatorLine(separatorMidY: number, neighbor: Element | null): boolean {
  if (!neighbor) return false;
  const rect = neighbor.getBoundingClientRect();
  return separatorMidY >= rect.top && separatorMidY <= rect.bottom;
}

/**
 * Hides each slash separator that a line wrapped to its start or end.
 *
 * Purpose: A narrow window can wrap one bonus line, and a slash left at a line edge separates nothing.
 * When to use: Through `registerNewGameOptionSeparators`, whenever the block changes size.
 * Expected outcome: A separator stays visible only when both neighbors are on its line. Hidden separators keep their
 *   space, so hiding one never re-wraps the line.
 * Exceptions: None.
 */
function syncNewGameOptionSeparators(block: Element): void {
  for (const separator of block.querySelectorAll<HTMLElement>(`.${NEW_GAME_OPTION_SEPARATOR_CLASS}`)) {
    const rect = separator.getBoundingClientRect();
    const midY = (rect.top + rect.bottom) / 2;
    const joinsNeighbors =
      isOnSeparatorLine(midY, separator.previousElementSibling) && isOnSeparatorLine(midY, separator.nextElementSibling);
    separator.style.visibility = joinsNeighbors ? '' : 'hidden';
  }
}

/**
 * Keeps each bonus line's slash in step with how that line wraps.
 *
 * Purpose: Line width depends on the window and on the region lists, which load after the dialog opens.
 * When to use: Once while the renderer is starting.
 * Expected outcome: The separators are checked now and again each time the block changes size, including when the
 *   dialog opens. A missing block or a missing `ResizeObserver` leaves every separator visible.
 * Exceptions: None.
 */
export function registerNewGameOptionSeparators(): void {
  const block = document.querySelector(NEW_GAME_OPTIONS_BLOCK_SELECTOR);
  if (!block || typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => syncNewGameOptionSeparators(block)).observe(block);
}
```

Replace them with:

```ts
}
```

- [ ] **Step 5: Edit `src/renderer/gameplay/newGame.ts`**

No longer registers the slash watcher, and its comment no longer mentions the separators.

1. In `src/renderer/gameplay/newGame.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  registerNewGameOptionSeparators,
```

2. In `src/renderer/gameplay/newGame.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: The randomize buttons, game-size preview, and bonus-line separators are live. Clicking Start sends
```

Replace it with:

```ts
 * Expected outcome: The randomize buttons and the game-size caps are live. Clicking Start sends
```

3. In `src/renderer/gameplay/newGame.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  registerNewGameOptionSeparators();
```

- [ ] **Step 6: Edit `src/renderer/gameplay/newGameRegionUi.ts`**

No longer measures a shared dropdown width. The rows' grid gives every dropdown the same width.

1. In `src/renderer/gameplay/newGameRegionUi.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
import { syncNewGameRegionSelectWidths } from './newGameRegionSelectWidth';
```

2. In `src/renderer/gameplay/newGameRegionUi.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: The two home lists stay the same, and their closed width stays aligned with the regional region dropdown.
 * When to use: When the new-game overlay opens.
 * Expected outcome: The first successful load writes the options. A later call leaves those options in place and measures the shared width again. A missing control or an empty list leaves the options unchanged.
```

Replace them with:

```ts
 * Purpose: The two home lists stay the same.
 * When to use: When the new-game overlay opens.
 * Expected outcome: The first successful load writes the options. A later call leaves those options in place. A missing control or an empty list leaves the options unchanged.
```

3. In `src/renderer/gameplay/newGameRegionUi.ts`, find these lines. Together they occur exactly once:

```ts
  if (humanSelect.options.length > 0 && aiSelect.options.length > 0) {
    syncNewGameRegionSelectWidths();
    return;
  }
```

Replace them with:

```ts
  if (humanSelect.options.length > 0 && aiSelect.options.length > 0) return;
```

4. In `src/renderer/gameplay/newGameRegionUi.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  syncNewGameRegionSelectWidths();
```

- [ ] **Step 7: Edit `src/renderer/gameplay/newGameMapUi.ts`**

The same, for the region list. Comments follow the new price format and the Advanced line's new place beside the Forces title.

1. In `src/renderer/gameplay/newGameMapUi.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
import { syncNewGameRegionSelectWidths } from './newGameRegionSelectWidth';
```

2. In `src/renderer/gameplay/newGameMapUi.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: One option per regional row, in the list's order. The place dropdowns then share the width of the widest region name currently listed.
```

Replace it with:

```ts
 * Expected outcome: One option per regional row, in the list's order.
```

3. In `src/renderer/gameplay/newGameMapUi.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  syncNewGameRegionSelectWidths();
```

4. In `src/renderer/gameplay/newGameMapUi.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Each unit type reads like `Infantry ($20)` on Global and the catalog price the same way on Regional. The Advanced line under the game size selector uses that same map's threshold, or is cleared when that map is missing.
```

Replace it with:

```ts
 * Expected outcome: Each unit type's price reads like `$20`, from the global catalog on Global and the region's catalog on Regional. The Advanced line beside the Forces title uses that same map's threshold, or is cleared when that map is missing.
```

5. In `src/renderer/gameplay/newGameMapUi.ts`, find this line. It occurs exactly once:

```ts
 * Writes the Advanced threshold under the game size selector.
```

Replace it with:

```ts
 * Writes the Advanced threshold beside the Forces title.
```

6. In `src/renderer/gameplay/newGameMapUi.ts`, find these lines. Together they occur exactly once:

```ts
 * Writes one parenthetical unit price.
 *
 * Purpose: The four labels share one format.
 * When to use: `applyVisibleCosts`.
 * Expected outcome: The element's text is the parenthetical price, such as `($20)`.
```

Replace them with:

```ts
 * Writes one unit price.
 *
 * Purpose: The four prices share one format.
 * When to use: `applyVisibleCosts`.
 * Expected outcome: The element's text is the price, such as `$20`.
```

- [ ] **Step 8: Edit `src/renderer/gameplay/newGameSizeUi.ts`**

Comments describe the caps in the unit row rather than badges, and a local variable is renamed to match.

1. In `src/renderer/gameplay/newGameSizeUi.ts`, find these lines. Together they occur exactly once:

```ts
 * Writes stack-style cap numbers for the currently selected size onto the preview badges.
 *
 * Purpose: The four tokens must match the dropdown without duplicating cap tables in HTML.
 * When to use: Init, select `change`, and whenever the new-game overlay is shown.
 * Expected outcome: Badge text equals `gameSizeCapPreviewRows` caps; missing nodes are skipped.
```

Replace them with:

```ts
 * Writes the cap for the currently selected size beside each unit type in the unit row.
 *
 * Purpose: The four caps must match the dropdown without duplicating cap tables in HTML.
 * When to use: Init, select `change`, and whenever the new-game overlay is shown.
 * Expected outcome: Each cap's text equals its `gameSizeCapPreviewRows` cap; missing nodes are skipped.
```

2. In `src/renderer/gameplay/newGameSizeUi.ts`, find these lines. Together they occur exactly once:

```ts
    const badge = document.getElementById(`new-game-size-cap-${row.unitType}`);
    if (badge) badge.textContent = String(row.cap);
```

Replace them with:

```ts
    const capText = document.getElementById(`new-game-size-cap-${row.unitType}`);
    if (capText) capText.textContent = String(row.cap);
```

3. In `src/renderer/gameplay/newGameSizeUi.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Change events must update badges before Start is clicked.
 * When to use: Once from `registerNewGameButton`.
 * Expected outcome: `change` listener installed; badges match the current select value.
```

Replace them with:

```ts
 * Purpose: Change events must update the caps before Start is clicked.
 * When to use: Once from `registerNewGameButton`.
 * Expected outcome: `change` listener installed; the caps match the current select value.
```

- [ ] **Step 9: Delete `src/renderer/gameplay/newGameRegionSelectWidth.ts`**

Delete the old width module. Nothing imports it after the two steps before this one.

Delete `src/renderer/gameplay/newGameRegionSelectWidth.ts`:

```powershell
Remove-Item src/renderer/gameplay/newGameRegionSelectWidth.ts
```

- [ ] **Step 10: Edit `src/renderer/core/constants.ts`**

A comment only: it names the unit row's token class.

In `src/renderer/core/constants.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Stacked mixed-side tokens use this for the circle stroke; keep `.game-over-size-token` in `static/index.html` on the same hex.
```

Replace it with:

```ts
 * Purpose: Stacked mixed-side tokens use this for the circle stroke; keep `.new-game-unit-token` in `static/newGameChrome.css` on the same hex.
```

- [ ] **Step 11: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 12: Edit `static/index.html`**

Rebuilds the panel's body as three sections, Map, Forces, and Rules, with the mockup's wording: rows labeled Human and AI, or Region, Your side, and Opponent; Add another opponent as a disabled placeholder; the unit row with named icons; the bonuses in a grid; then the starting month and Fog of war. Every control keeps its id, its tip, and its options.

1. In `static/index.html`, find these lines. Together they occur exactly once:

```html
      <div class="openrouter-tab-bar game-over-tab-bar" role="tablist">
        <button type="button" id="new-game-tab-global" role="tab" aria-selected="true" aria-controls="new-game-panel-global" data-control-tooltip="Start on the world map and pick a home region for each side.">Global</button>
        <button type="button" id="new-game-tab-regional" role="tab" aria-selected="false" aria-controls="new-game-panel-regional" data-control-tooltip="Start on one region and pick a different side group for each player.">Regional</button>
      </div>
      <div id="new-game-panel-global" class="openrouter-tab-panel active" role="tabpanel" aria-labelledby="new-game-tab-global">
      <div class="game-over-region-row">
        <div class="game-over-region-cell">
          <label for="new-game-human-region-select">Human Player:</label>
          <div class="game-over-region-controls">
            <select id="new-game-human-region-select" data-control-tooltip="Pick your side's home region. The opponent may start in the same region."></select>
            <button type="button" id="new-game-human-region-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize human home region" data-control-tooltip="Pick one of the listed regions at random for your side, including the region already shown.">↻</button>
          </div>
        </div>
        <div class="game-over-region-cell">
          <label for="new-game-ai-region-select">AI Player:</label>
          <div class="game-over-region-controls">
            <select id="new-game-ai-region-select" data-control-tooltip="Pick the opponent's home region. It may be the same as yours."></select>
            <button type="button" id="new-game-ai-region-randomize" class="compact-blue-btn compact-square-btn compact-opponent-btn game-over-region-randomize" aria-label="Randomize AI home region" data-control-tooltip="Pick one of the listed regions at random for the opponent, including the region already shown.">↻</button>
          </div>
        </div>
      </div>
      </div>
      <div id="new-game-panel-regional" class="openrouter-tab-panel" role="tabpanel" aria-labelledby="new-game-tab-regional" hidden>
        <div class="game-over-regional-region">
          <div class="game-over-region-cell">
            <label for="new-game-region-select">Region:</label>
            <div class="game-over-region-controls">
              <select id="new-game-region-select" data-control-tooltip="Pick the region both sides fight over. Changing it draws two different sides again."></select>
              <button type="button" id="new-game-region-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize region" data-control-tooltip="Pick one of the listed regions at random, including the region already shown.">↻</button>
            </div>
          </div>
        </div>
        <div class="game-over-region-row">
          <div class="game-over-region-cell">
            <label for="new-game-human-side-select">Human Player:</label>
            <div class="game-over-region-controls">
              <select id="new-game-human-side-select" data-control-tooltip="Pick your side. It stays different from the opponent's side."></select>
              <button type="button" id="new-game-human-side-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize human side" data-control-tooltip="Pick one of the other sides at random for your side.">↻</button>
            </div>
          </div>
          <div class="game-over-region-cell">
            <label for="new-game-ai-side-select">AI Player:</label>
            <div class="game-over-region-controls">
              <select id="new-game-ai-side-select" data-control-tooltip="Pick the opponent's side. It stays different from yours."></select>
              <button type="button" id="new-game-ai-side-randomize" class="compact-blue-btn compact-square-btn compact-opponent-btn game-over-region-randomize" aria-label="Randomize AI side" data-control-tooltip="Pick one of the other sides at random for the opponent.">↻</button>
            </div>
          </div>
        </div>
      </div>
      <div class="game-over-size-row">
        <label for="new-game-size-select">Game size:
```

Replace them with:

```html
      <section class="new-game-section" aria-labelledby="new-game-section-map">
        <h2 id="new-game-section-map" class="new-game-section-title">Map</h2>
        <div class="openrouter-tab-bar new-game-tabs" role="tablist">
          <button type="button" id="new-game-tab-global" role="tab" aria-selected="true" aria-controls="new-game-panel-global" data-control-tooltip="Start on the world map and pick a home region for each side.">Global</button>
          <button type="button" id="new-game-tab-regional" role="tab" aria-selected="false" aria-controls="new-game-panel-regional" data-control-tooltip="Start on one region and pick a different side group for each player.">Regional</button>
        </div>
        <div id="new-game-panel-global" class="openrouter-tab-panel active" role="tabpanel" aria-labelledby="new-game-tab-global">
          <div class="new-game-rows">
            <label for="new-game-human-region-select">Human</label>
            <select id="new-game-human-region-select" data-control-tooltip="Pick your side's home region. The opponent may start in the same region."></select>
            <button type="button" id="new-game-human-region-randomize" class="compact-blue-btn compact-square-btn new-game-randomize" aria-label="Randomize human home region" data-control-tooltip="Pick one of the listed regions at random for your side, including the region already shown.">↻</button>
            <label for="new-game-ai-region-select">AI</label>
            <select id="new-game-ai-region-select" data-control-tooltip="Pick the opponent's home region. It may be the same as yours."></select>
            <button type="button" id="new-game-ai-region-randomize" class="compact-blue-btn compact-square-btn compact-opponent-btn new-game-randomize" aria-label="Randomize AI home region" data-control-tooltip="Pick one of the listed regions at random for the opponent, including the region already shown.">↻</button>
          </div>
        </div>
        <div id="new-game-panel-regional" class="openrouter-tab-panel" role="tabpanel" aria-labelledby="new-game-tab-regional" hidden>
          <div class="new-game-rows">
            <label for="new-game-region-select">Region</label>
            <select id="new-game-region-select" data-control-tooltip="Pick the region both sides fight over. Changing it draws two different sides again."></select>
            <button type="button" id="new-game-region-randomize" class="compact-blue-btn compact-square-btn new-game-randomize" aria-label="Randomize region" data-control-tooltip="Pick one of the listed regions at random, including the region already shown.">↻</button>
            <label for="new-game-human-side-select">Your side</label>
            <select id="new-game-human-side-select" data-control-tooltip="Pick your side. It stays different from the opponent's side."></select>
            <button type="button" id="new-game-human-side-randomize" class="compact-blue-btn compact-square-btn new-game-randomize" aria-label="Randomize human side" data-control-tooltip="Pick one of the other sides at random for your side.">↻</button>
            <label for="new-game-ai-side-select">Opponent</label>
            <select id="new-game-ai-side-select" data-control-tooltip="Pick the opponent's side. It stays different from yours."></select>
            <button type="button" id="new-game-ai-side-randomize" class="compact-blue-btn compact-square-btn compact-opponent-btn new-game-randomize" aria-label="Randomize AI side" data-control-tooltip="Pick one of the other sides at random for the opponent.">↻</button>
          </div>
        </div>
        <span class="control-tooltip-host new-game-add-opponent-host" data-control-tooltip="Add another opponent is not available in this version."><button type="button" id="new-game-add-opponent-btn" class="new-game-add-opponent" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"></path></svg>Add another opponent</button></span>
      </section>
      <section class="new-game-section" aria-labelledby="new-game-section-forces">
        <div class="new-game-section-head">
          <h2 id="new-game-section-forces" class="new-game-section-title">Forces</h2>
          <p id="new-game-advanced-tech" class="new-game-advanced-tech"></p>
        </div>
        <div class="new-game-size-row">
          <label for="new-game-size-select">Game size</label>
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
        </label>
      </div>
      <p id="new-game-advanced-tech" class="game-over-advanced-tech"></p>
      <div class="game-over-size-caps" aria-live="polite">
        <div class="game-over-size-cap">
          <div class="game-over-size-token">
            <img src="units/infantry.svg" alt="" />
            <span id="new-game-size-cap-infantry" class="game-over-size-badge">12</span>
          </div>
          <div class="game-over-size-name">Infantry <span id="new-game-cost-infantry">($20)</span></div>
        </div>
        <div class="game-over-size-cap">
          <div class="game-over-size-token">
            <img src="units/armor.svg" alt="" />
            <span id="new-game-size-cap-armor" class="game-over-size-badge">8</span>
          </div>
          <div class="game-over-size-name">Armor <span id="new-game-cost-armor">($40)</span></div>
        </div>
        <div class="game-over-size-cap">
          <div class="game-over-size-token">
            <img src="units/naval.svg" alt="" />
            <span id="new-game-size-cap-naval" class="game-over-size-badge">8</span>
          </div>
          <div class="game-over-size-name">Naval <span id="new-game-cost-naval">($100)</span></div>
        </div>
        <div class="game-over-size-cap">
          <div class="game-over-size-token">
            <img src="units/air.svg" alt="" />
            <span id="new-game-size-cap-air" class="game-over-size-badge">6</span>
          </div>
          <div class="game-over-size-name">Air <span id="new-game-cost-air">($60)</span></div>
        </div>
      </div>
      <div class="game-over-options">
        <div class="game-over-options-line">
          <label for="new-game-origin-bonus-select">Origin bonus:
            <select id="new-game-origin-bonus-select" data-control-tooltip="Low adds 2 and High adds 4 when a unit fights in the area where it was built: a country in a global game, and the origin area in a regional game.">
              <option value="off">Off</option>
              <option value="low" selected>Low</option>
              <option value="high">High</option>
            </select>
          </label>
          <span class="game-over-options-separator" aria-hidden="true">/</span>
          <label for="new-game-tech-bonus-select">Tech bonus:
            <select id="new-game-tech-bonus-select" data-control-tooltip="Choose Off, Low, or High. Advanced units gain 2 attack at either level, High also adds 2 defense, and Basic units gain nothing.">
              <option value="off">Off</option>
              <option value="low" selected>Low</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <div class="game-over-options-line">
          <label for="new-game-terrain-bonus-select">Terrain bonus:
            <select id="new-game-terrain-bonus-select" data-control-tooltip="In a battle, Low adds 2 and High adds 4 when a unit fights on the terrain where it was built. Off adds nothing, and a unit that also gets the origin bonus receives only the larger of the two.">
              <option value="off">Off</option>
              <option value="low" selected>Low</option>
              <option value="high">High</option>
            </select>
          </label>
          <span class="game-over-options-separator" aria-hidden="true">/</span>
          <label for="new-game-weather-bonus-select">Weather bonus:
            <select id="new-game-weather-bonus-select" data-control-tooltip="Choose Off to ignore weather. Low and High slow movement and cut some attacks for units that lack that weather, and High is the harsher penalty.">
              <option value="off">Off</option>
              <option value="low" selected>Low</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
      </div>
      <div class="game-over-start-month">
        <label for="new-game-fog-checkbox"><input type="checkbox" id="new-game-fog-checkbox" checked data-control-tooltip="Leave this checked to hide places and enemy units you have not seen. Uncheck it to show the whole map for the next match." /> Fog of war</label>
        <span aria-hidden="true">/</span>
        <label for="new-game-start-month">Starting month:</label>
        <div class="game-over-region-controls">
          <select id="new-game-start-month" data-control-tooltip="Pick the month the match starts in. A global turn is one month. A regional turn is one week, starting on the 1st. Weather changes when the date enters a new month, and a battle stays on the date that is current.">
            <option value="1" selected>January</option>
            <option value="2">February</option>
            <option value="3">March</option>
            <option value="4">April</option>
            <option value="5">May</option>
            <option value="6">June</option>
            <option value="7">July</option>
            <option value="8">August</option>
            <option value="9">September</option>
            <option value="10">October</option>
            <option value="11">November</option>
            <option value="12">December</option>
          </select>
          <button type="button" id="new-game-start-month-randomize" class="compact-blue-btn compact-square-btn game-over-region-randomize" aria-label="Randomize starting month" data-control-tooltip="Pick a month at random, including the month already shown.">↻</button>
        </div>
      </div>
```

Replace them with:

```html
        </div>
        <ul class="new-game-units" aria-live="polite">
          <li class="new-game-unit"><span class="new-game-unit-token"><img src="units/infantry.svg" alt="Infantry" /></span><span id="new-game-size-cap-infantry" class="new-game-unit-cap">12</span><span class="new-game-unit-dot" aria-hidden="true">·</span><span id="new-game-cost-infantry" class="new-game-unit-cost">$20</span></li>
          <li class="new-game-unit"><span class="new-game-unit-token"><img src="units/armor.svg" alt="Armor" /></span><span id="new-game-size-cap-armor" class="new-game-unit-cap">8</span><span class="new-game-unit-dot" aria-hidden="true">·</span><span id="new-game-cost-armor" class="new-game-unit-cost">$40</span></li>
          <li class="new-game-unit"><span class="new-game-unit-token"><img src="units/naval.svg" alt="Naval" /></span><span id="new-game-size-cap-naval" class="new-game-unit-cap">8</span><span class="new-game-unit-dot" aria-hidden="true">·</span><span id="new-game-cost-naval" class="new-game-unit-cost">$100</span></li>
          <li class="new-game-unit"><span class="new-game-unit-token"><img src="units/air.svg" alt="Air" /></span><span id="new-game-size-cap-air" class="new-game-unit-cap">6</span><span class="new-game-unit-dot" aria-hidden="true">·</span><span id="new-game-cost-air" class="new-game-unit-cost">$60</span></li>
        </ul>
      </section>
      <section class="new-game-section" aria-labelledby="new-game-section-rules">
        <h2 id="new-game-section-rules" class="new-game-section-title">Rules</h2>
        <div class="new-game-rules">
          <label for="new-game-origin-bonus-select">Origin bonus</label>
          <select id="new-game-origin-bonus-select" data-control-tooltip="Low adds 2 and High adds 4 when a unit fights in the area where it was built: a country in a global game, and the origin area in a regional game.">
            <option value="off">Off</option>
            <option value="low" selected>Low</option>
            <option value="high">High</option>
          </select>
          <label for="new-game-tech-bonus-select">Tech bonus</label>
          <select id="new-game-tech-bonus-select" data-control-tooltip="Choose Off, Low, or High. Advanced units gain 2 attack at either level, High also adds 2 defense, and Basic units gain nothing.">
            <option value="off">Off</option>
            <option value="low" selected>Low</option>
            <option value="high">High</option>
          </select>
          <label for="new-game-terrain-bonus-select">Terrain bonus</label>
          <select id="new-game-terrain-bonus-select" data-control-tooltip="In a battle, Low adds 2 and High adds 4 when a unit fights on the terrain where it was built. Off adds nothing, and a unit that also gets the origin bonus receives only the larger of the two.">
            <option value="off">Off</option>
            <option value="low" selected>Low</option>
            <option value="high">High</option>
          </select>
          <label for="new-game-weather-bonus-select">Weather bonus</label>
          <select id="new-game-weather-bonus-select" data-control-tooltip="Choose Off to ignore weather. Low and High slow movement and cut some attacks for units that lack that weather, and High is the harsher penalty.">
            <option value="off">Off</option>
            <option value="low" selected>Low</option>
            <option value="high">High</option>
          </select>
          <label for="new-game-start-month">Starting month</label>
          <div class="new-game-month-controls">
            <select id="new-game-start-month" data-control-tooltip="Pick the month the match starts in. A global turn is one month. A regional turn is one week, starting on the 1st. Weather changes when the date enters a new month, and a battle stays on the date that is current.">
              <option value="1" selected>January</option>
              <option value="2">February</option>
              <option value="3">March</option>
              <option value="4">April</option>
              <option value="5">May</option>
              <option value="6">June</option>
              <option value="7">July</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
            <button type="button" id="new-game-start-month-randomize" class="compact-blue-btn compact-square-btn new-game-randomize" aria-label="Randomize starting month" data-control-tooltip="Pick a month at random, including the month already shown.">↻</button>
          </div>
        </div>
        <label class="new-game-check" for="new-game-fog-checkbox"><input type="checkbox" id="new-game-fog-checkbox" checked data-control-tooltip="Leave this checked to hide places and enemy units you have not seen. Uncheck it to show the whole map for the next match." /> Fog of war</label>
      </section>
```

- [ ] **Step 13: Replace `static/newGameChrome.css`**

Replaces the rules for the controls with the sections' styles: section titles, 30 px controls, the rows' grid, the dashed placeholder, the unit row, and the Rules layout. The map rows' label column is at least 5em, so a wider system font cannot run a label into its dropdown, and the unit row wraps rather than widening the panel. The new-game bar, and the panel, header, footer, and hidden-choices rules, stay as they were.

Replace the whole file `static/newGameChrome.css` with exactly this content:

```css
/* The new-game screen. While the new-game overlay is open, the top bar becomes the new-game bar, and the setup panel is
   docked at the left of the window, under the top bar, with the map preview beside it. The panel's header holds the
   hide-choices button and the message, the body holds the Map, Forces, and Rules sections and scrolls, and the footer
   holds Start game. Hiding the choices leaves only that button, in the same spot over the map's top-left corner, and
   the map widens under it. */

/* ---------- New-game bar ---------- */
/* While the new-game overlay is open, the bar shows only the menu button, the title "New game", Load game…, Settings,
   and Help. The overlay's `hidden` class switches it, so the bar follows the overlay however it opens or closes,
   including from a battle. */
body:not(:has(#game-over-overlay:not(.hidden))) #app-topbar .new-game-only,
body:has(#game-over-overlay:not(.hidden)) #app-topbar .topbar-sides,
body:has(#game-over-overlay:not(.hidden)) #app-topbar .topbar-stat,
body:has(#game-over-overlay:not(.hidden)) #app-topbar .topbar-date-block,
body:has(#game-over-overlay:not(.hidden)) #app-topbar .battle-header-only {
  display: none;
}
body:has(#game-over-overlay:not(.hidden)) #app-topbar .topbar-spacer {
  display: block;
}
body:has(#game-over-overlay:not(.hidden)) #app-topbar.topbar-battle {
  background: var(--chrome-bg-deep);
  border-bottom-color: var(--chrome-border);
}
.topbar-new-game-title {
  display: flex;
  align-items: center;
  flex: none;
  padding: 0 16px;
  font-size: 15px;
  font-weight: 600;
}
/* Load game…, a disabled placeholder that names itself beside its icon. */
.topbar-text-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 16px;
  border: 0;
  border-left: 1px solid var(--chrome-divider);
  border-radius: 0;
  background: transparent;
  color: var(--chrome-text);
  font-size: 13px;
  font-weight: 500;
}
/* Keeps the divider: the shared disabled-button rule would recolor it. */
.topbar-text-btn:disabled {
  background: transparent;
  color: var(--chrome-disabled);
  border-color: var(--chrome-divider);
}

/* ---------- Panel ---------- */
.new-game-panel {
  position: relative;
  z-index: 7002;
  flex: none;
  width: var(--new-game-panel-width);
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  color-scheme: dark;
  border-right: 1px solid var(--chrome-border);
  box-shadow: 4px 0 12px rgba(8, 14, 22, 0.35);
}
.new-game-panel.hidden {
  display: none;
}
.new-game-panel-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--chrome-border);
}
#game-over-message {
  min-width: 0;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
/* The square matches a randomize button (`--new-game-collapse-size`). It keeps the pointer while the choices are
   hidden and the rest of the panel does not. */
#new-game-dialog-collapse {
  flex: none;
  width: var(--new-game-collapse-size, 1.75rem);
  height: var(--new-game-collapse-size, 1.75rem);
  min-width: 0;
  margin-left: 0;
  padding: 0;
  box-sizing: border-box;
  pointer-events: auto;
}
.new-game-panel-body {
  flex: 1 1 auto;
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

/* ---------- Hidden choices ---------- */
/* Only the hide-choices button stays. The panel leaves the row, so the map widens to the window's left edge, and the
   header keeps its padding, so the button does not move. #app-body is the containing block. */
.new-game-panel.game-over-dialog-collapsed {
  position: absolute;
  top: 0;
  left: 0;
  width: auto;
  height: auto;
  background: transparent;
  border: 0;
  box-shadow: none;
  pointer-events: none;
}
.new-game-panel.game-over-dialog-collapsed .new-game-panel-header {
  border-bottom: 0;
}
.new-game-panel.game-over-dialog-collapsed #game-over-message,
.new-game-panel.game-over-dialog-collapsed .new-game-panel-body,
.new-game-panel.game-over-dialog-collapsed .new-game-panel-footer {
  display: none;
}

/* ---------- Sections ---------- */
/* Map, Forces, and Rules, each under a small title and a divider. Controls are 30 px tall, the same as a randomize
   square, so every row lines up. */
.new-game-section {
  padding: 14px 18px 16px;
  border-bottom: 1px solid var(--chrome-divider);
  font-size: 13px;
}
.new-game-section:last-child {
  border-bottom: 0;
}
.new-game-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.new-game-section-title {
  margin: 0 0 10px;
  color: var(--chrome-muted);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.new-game-panel-body select {
  height: 30px;
  padding: 0 8px;
  box-sizing: border-box;
  font-size: 13px;
}
/* A square the height of the dropdown beside it. `--new-game-collapse-size` copies this size onto the hide-choices
   button. */
.new-game-panel-body .compact-square-btn.new-game-randomize {
  width: 30px;
  min-width: 30px;
  height: 30px;
  margin-left: 0;
  font-size: 13px;
}

/* ---------- Map ---------- */
.new-game-tabs {
  margin: 0 0 12px;
}
.new-game-tabs button {
  width: 110px;
  height: 30px;
  font-size: 13px;
}
/* Label, dropdown, randomize. Each tab has its own grid, so the label column has one width in both: 5em fits "Your side"
   and "Opponent" in common system fonts, and every dropdown in both tabs then has the same left edge and width. A wider
   font grows the column rather than running a label into its dropdown. */
.new-game-rows {
  display: grid;
  grid-template-columns: minmax(5em, max-content) minmax(0, 1fr) 30px;
  align-items: center;
  gap: 8px 6px;
}
.new-game-rows select {
  width: 100%;
  min-width: 0;
}
/* Two classes, so the shared tip host's inline display does not win: the slot spans the section. */
.control-tooltip-host.new-game-add-opponent-host {
  display: flex;
  width: 100%;
  margin-top: 10px;
}
/* A disabled placeholder drawn as a dashed slot, so it reads as room for a later feature rather than a broken button. */
.new-game-add-opponent,
.new-game-add-opponent:disabled {
  flex: 1 1 auto;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0;
  background: transparent;
  color: var(--chrome-muted);
  border: 1px dashed var(--chrome-border);
  border-radius: 2px;
  font-size: 12.5px;
}

/* ---------- Forces ---------- */
.new-game-advanced-tech {
  margin: 0;
  color: var(--chrome-muted);
  font-size: 11px;
}
.new-game-advanced-tech:empty {
  display: none;
}
.new-game-size-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 0 0 12px;
}
.new-game-size-row select {
  width: max-content;
}
/* One row of the four unit types: the map glyph on a gray disk, the cap for the game size, and the price. A wide font
   wraps the row rather than widening the panel. */
.new-game-units {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.new-game-unit {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.new-game-unit-token {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #b0b0b0;
  border: 1px solid #222;
  display: flex;
  align-items: center;
  justify-content: center;
}
.new-game-unit-token img {
  width: 18px;
  height: 18px;
  pointer-events: none;
  filter: brightness(0.133);
}
.new-game-unit-cap {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.new-game-unit-dot,
.new-game-unit-cost {
  color: var(--chrome-muted);
  font-size: 12px;
}

/* ---------- Rules ---------- */
/* One grid of label and dropdown pairs: Origin and Tech, then Terrain and Weather, then the starting month across the
   last three columns. Each label column is as wide as its longest label and the two dropdown columns share what is
   left, so every dropdown in a column starts at the same edge however the system font measures the labels. */
.new-game-rules {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content minmax(0, 1fr);
  align-items: center;
  gap: 8px 6px;
}
.new-game-rules > label {
  white-space: nowrap;
}
/* Tech and Weather open the second pair, set a little apart from the first pair's dropdowns. */
.new-game-rules > label:nth-of-type(2n) {
  padding-left: 10px;
}
.new-game-rules > select {
  width: 100%;
  min-width: 0;
}
.new-game-month-controls {
  grid-column: 2 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
}
.new-game-month-controls select {
  width: max-content;
}
.new-game-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
```

- [ ] **Step 14: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the scene of the Regional tab, before the regional match starts.

1. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  newGameReopened: 'new-game-reopened',
```

Replace it with:

```js
  newGameReopened: 'new-game-reopened',
  newGameRegional: 'new-game-regional',
```

2. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
 * Expected outcome: The first scene, the game menu opened on it, the choices hidden, the overlay opened from a match,
 *   and the finished match reopened, then at the 800 x 600 minimum.
```

Replace them with:

```js
 * Expected outcome: The first scene, the game menu opened on it, the choices hidden, the overlay opened from a match
 *   and its Regional tab, and the finished match reopened, then at the 800 x 600 minimum.
```

3. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  SCENES.newGameReopened,
```

Replace it with:

```js
  SCENES.newGameReopened,
  SCENES.newGameRegional,
```

- [ ] **Step 15: Edit `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`**

Adds the section checks: the titles in order, the map rows lined up at one fixed inset in either tab, the placeholder, the unit row, and the Rules layout.

1. In `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, find this line. It occurs exactly once:

```js
 * there, the setup panel docked at the left, and the map beside it.
```

Replace it with:

```js
 * there, the setup panel docked at the left with its Map, Forces, and Rules sections, and the map beside it.
```

2. In `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, find these lines. Together they occur exactly once:

```js
 *   and Start game spans the footer inside its 18 px padding.
 * When to use: The panel and hidden-choices checks.
 * Expected outcome: Matches `--new-game-panel-width` in `static/shellChrome.css` and the padding in
 *   `static/newGameChrome.css`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({ width: 432, headerInset: 12, footerInset: 18 });
```

Replace them with:

```js
 *   Start game spans the footer inside its 18 px padding, and each section's content sits inside 18 px of padding. A
 *   map row's dropdown starts after that padding, the 5em label column (65 px at the rows' 13 px text), and a 6 px gap.
 * When to use: The panel, hidden-choices, and section checks.
 * Expected outcome: Matches `--new-game-panel-width` in `static/shellChrome.css` and the padding, the label column,
 *   and the gap in `static/newGameChrome.css`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({ width: 432, headerInset: 12, footerInset: 18, sectionInset: 18, rowSelectInset: 89 });

/**
 * The rows of each map tab: the label of each row, then each row's dropdown and randomize button, top to bottom.
 *
 * Purpose: Both tabs line their dropdowns up on one left edge with one width, and their randomize buttons on the
 *   panel's inner right edge. The left edge is the same fixed inset in both tabs, so it also shows that no label is
 *   wider than its column.
 * When to use: The map rows check.
 * Expected outcome: Matches the rows in `static/index.html`.
 * Exceptions: None.
 */
const MAP_TABS = Object.freeze({
  global: {
    panel: '#new-game-panel-global',
    labels: ['Human', 'AI'],
    rows: [
      ['#new-game-human-region-select', '#new-game-human-region-randomize'],
      ['#new-game-ai-region-select', '#new-game-ai-region-randomize'],
    ],
  },
  regional: {
    panel: '#new-game-panel-regional',
    labels: ['Region', 'Your side', 'Opponent'],
    rows: [
      ['#new-game-region-select', '#new-game-region-randomize'],
      ['#new-game-human-side-select', '#new-game-human-side-randomize'],
      ['#new-game-ai-side-select', '#new-game-ai-side-randomize'],
    ],
  },
});

/**
 * The unit types in the Forces row, left to right, with each icon's name.
 *
 * Purpose: The row shows icons without words, so each icon names its type for assistive technology.
 * When to use: The unit row check.
 * Expected outcome: Infantry, Armor, Naval, Air.
 * Exceptions: None.
 */
const UNIT_ICONS = Object.freeze(['Infantry', 'Armor', 'Naval', 'Air'].map((name) => `.new-game-unit-token img[alt="${name}"]`));

/**
 * The four bonus dropdowns, in reading order: Origin and Tech on the first row, Terrain and Weather on the second.
 *
 * Purpose: The Rules section lays them out in two columns.
 * When to use: The rules check.
 * Expected outcome: Matches the ids in `static/index.html`.
 * Exceptions: None.
 */
const BONUS_SELECTS = Object.freeze([
  '#new-game-origin-bonus-select',
  '#new-game-tech-bonus-select',
  '#new-game-terrain-bonus-select',
  '#new-game-weather-bonus-select',
]);
```

3. In `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, find this line. It occurs exactly once:

```js
const NEW_GAME_ITEM_OPEN_TIP = 'The new-game screen is already open.';
```

Replace it with:

```js
const NEW_GAME_ITEM_OPEN_TIP = 'The new-game screen is already open.';

/**
 * The tip host around the setup panel's Add another opponent placeholder.
 *
 * Purpose: The placeholder is disabled, so its host carries the tip.
 * When to use: The Add another opponent check.
 * Expected outcome: Matches the host in `static/index.html`.
 * Exceptions: None.
 */
const ADD_OPPONENT_HOST = '.control-tooltip-host:has(#new-game-add-opponent-btn)';

/**
 * Finds the right edge of a section's content in the panel's body.
 *
 * Purpose: The body scrolls when the window is short, and its scrollbar then takes width from the sections.
 * When to use: Checks of controls that reach a section's right edge.
 * Expected outcome: The body's left edge plus its client width, less the sections' padding.
 * Exceptions: None.
 */
function sectionInnerRight(body) {
  return body.x + body.clientWidth - PANEL.sectionInset;
}
```

4. In `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, find these lines. Together they occur exactly once:

```js
  {
    name: 'new-game-map-takes-pointer',
```

Replace them with:

```js
  {
    name: 'new-game-sections',
    scenes: PANEL_SCENES,
    needs: ['#new-game-section-map', '#new-game-section-forces', '#new-game-section-rules'],
    run: (p, el) => {
      const titles = ['#new-game-section-map', '#new-game-section-forces', '#new-game-section-rules'].map(el);
      const text = titles.map((title) => title.text).join(', ');
      if (text !== 'Map, Forces, Rules') return `the section titles read "${text}", expected "Map, Forces, Rules"`;
      return titles[0].y < titles[1].y && titles[1].y < titles[2].y ? null : 'the sections are not in the order Map, Forces, Rules';
    },
  },
  {
    name: 'new-game-map-rows',
    scenes: PANEL_SCENES,
    needs: [
      '#game-over-dialog',
      ...Object.values(MAP_TABS).flatMap((tab) => [tab.panel, `${tab.panel} label`, ...tab.rows.flat()]),
    ],
    run: (p, el) => {
      const tab = el(MAP_TABS.global.panel).shown ? MAP_TABS.global : MAP_TABS.regional;
      const labels = el(`${tab.panel} label`).allTexts.join(', ');
      if (labels !== tab.labels.join(', ')) return `the ${tab.panel} labels read "${labels}", expected "${tab.labels.join(', ')}"`;
      const body = el('#game-over-dialog');
      const innerRight = sectionInnerRight(body);
      const selectLeft = body.x + PANEL.rowSelectInset;
      for (const [selectId, buttonId] of tab.rows) {
        const select = el(selectId);
        const button = el(buttonId);
        if (!near(select.x, selectLeft) || !near(select.x + select.w, button.x - 6)) {
          return `${selectId} is at ${fmt(select)}, expected from x=${selectLeft} to the randomize button, in either tab`;
        }
        if (!near(button.x + button.w, innerRight) || !near(button.h, select.h)) return `${buttonId} is at ${fmt(button)}, expected a square the dropdown's height at the panel's inner right edge`;
      }
      return null;
    },
  },
  {
    name: 'new-game-add-opponent',
    scenes: PANEL_SCENES,
    needs: ['#game-over-dialog', '#new-game-add-opponent-btn', ADD_OPPONENT_HOST],
    run: (p, el) => {
      const body = el('#game-over-dialog');
      const button = el('#new-game-add-opponent-btn');
      if (!button.disabled) return 'Add another opponent is enabled';
      const tip = el(ADD_OPPONENT_HOST).tip;
      if (tip !== 'Add another opponent is not available in this version.') return `Add another opponent's host tip reads "${tip}"`;
      return near(button.x, body.x + PANEL.sectionInset) && near(button.x + button.w, sectionInnerRight(body))
        ? null
        : `Add another opponent is at ${fmt(button)}, expected the section's inner width`;
    },
  },
  {
    name: 'new-game-unit-row',
    scenes: PANEL_SCENES,
    needs: ['.new-game-unit', '.new-game-unit:first-child', '.new-game-unit:last-child', ...UNIT_ICONS],
    run: (p, el) => {
      const texts = el('.new-game-unit').allTexts;
      const bad = texts.filter((text) => !/^\d+·\$\d+$/.test(text));
      if (texts.length !== 4 || bad.length > 0) return `the unit row reads "${texts.join(' | ')}", expected four "cap·$price" entries`;
      return near(el('.new-game-unit:first-child').y, el('.new-game-unit:last-child').y) ? null : 'the four unit types are not on one row';
    },
  },
  {
    name: 'new-game-rules',
    scenes: PANEL_SCENES,
    needs: [...BONUS_SELECTS, '#new-game-start-month', '#new-game-start-month-randomize', '#new-game-fog-checkbox'],
    run: (p, el) => {
      const [origin, tech, terrain, weather] = BONUS_SELECTS.map(el);
      if (!near(origin.y, tech.y) || !near(terrain.y, weather.y) || terrain.y <= origin.y) return 'the bonuses are not two rows of two';
      if (!near(origin.x, terrain.x) || !near(tech.x, weather.x) || tech.x <= origin.x) return 'the bonuses are not two columns';
      const month = el('#new-game-start-month');
      if (!near(month.x, origin.x) || month.y <= terrain.y) return `the starting month ${fmt(month)} should sit under the bonuses, on the first column's edge`;
      const fog = el('#new-game-fog-checkbox');
      return fog.shown && fog.y > month.y ? null : 'Fog of war is not under the starting month';
    },
  },
  {
    name: 'new-game-map-takes-pointer',
```

- [ ] **Step 16: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Records the Regional tab before starting the regional match.

In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  await recordScene(page, report, outDir, SCENES.newGameReopened);
```

Replace it with:

```js
  await recordScene(page, report, outDir, SCENES.newGameReopened);
  await page.click('#new-game-tab-regional');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.overlay);
  await recordScene(page, report, outDir, SCENES.newGameRegional);
```

- [ ] **Step 17: Edit `doc/ux/new-game-dialog.md`**

Describes the three sections, the new wording, and the unit row, whose caps follow Game size. The code entry points drop the width module, name the placeholder, and correct the Origin bonus dropdown's id.

1. In `doc/ux/new-game-dialog.md`, find these lines. Together they occur exactly once:

````markdown
- Global and Regional tabs. Opening the overlay selects Global when no match is loaded or the loaded match is global, and Regional when the loaded match is a region. Game size, the four bonuses, fog of war, and the starting month stay outside the tabs.
- On Global: a human home-region choice and a randomize control labeled "Randomize human home region". That dropdown, the AI home-region dropdown, and the regional region dropdown share one closed width, wide enough for the longest name in any of those three lists. Choosing a shorter name does not shrink the dropdown. The randomize control is a square button the same height as that dropdown.
- On Global: an AI home-region choice and a randomize control labeled "Randomize AI home region". The dropdown is the same width as the human home-region dropdown. The randomize control is a square button the same height as that dropdown, in the opponent rose from the [UI style guide](../ui-style-guide.md). The two home regions may match.
- On Regional: one region selector, centered, the same width as the global home-region dropdowns, above a human side-group choice and an AI side-group choice. Those side-group dropdowns use that same closed width, so a longer side name does not widen them past the region dropdown. The open list still shows that full name. Beside the region selector is a randomize control labeled "Randomize region", the same teal square as the human home-region randomize button. Each side has a randomize button. Opening the overlay draws a region, then two different sides. Changing the region, or clicking its randomize control, draws two different sides again. The region draw includes the region already shown. One side's randomize button picks any group except the other side's current group.
- After each unit type, that unit's price in parentheses, such as `Infantry ($20)`, for the selected tab and, on Regional, the selected region. Cap badges stay driven by game size.
- A game-size choice. The dropdown sits on the same line as its label, to the right, with the same gap as each bonus dropdown, and only as wide as its longest item. Under that dropdown, a line reads `Advanced tech: $N+ hexes`. On Global, N is the world map's threshold. On Regional, N is the selected region's threshold, and it changes with the region.
- Cap badges for infantry, armor, naval, and air: gray disks with the map glyphs drawn dark. The numbers are in [game size and unit caps](../game-size-unit-caps.md).
- Two option lines. The first line is Origin bonus, a slash (/) with a small space on each side, then Tech bonus. The second line is Terrain bonus, a slash the same way, then Weather bonus. When a narrow window wraps a line, a slash that would sit at the start or end of that line is hidden. Each label ends with a colon, for example "Tech bonus:". Each dropdown lists Off, Low, and High. Whenever the overlay opens, every dropdown is set to Low. Each dropdown is independent. The next row starts with a Fog of war checkbox, then a slash (/) with a small space on each side, then a "Starting month:" control that lists the full English month names and is only as wide as its longest month. Whenever the overlay opens, Fog of war is checked and that control shows a random month, the same way the home regions are drawn. To the right of the month is a randomize control labeled "Randomize starting month", a square button the same height and color as the human home-region randomize button. The bonus rules for each level are in [combat rules §4.9](../combat-rules-v3.md).
````

Replace them with:

````markdown
- The panel's body has three sections, each under a small uppercase title: Map, Forces, and Rules.
- Map: Global and Regional tabs. Opening the overlay selects Global when no match is loaded or the loaded match is global, and Regional when the loaded match is a region. Under the tabs, one row per choice: a label, the dropdown, and a square randomize button the dropdown's height. The label column fits the longest label, so every dropdown in both tabs starts at the same edge, has the same width, and fills the row up to its randomize button. A long name is cut off in the closed dropdown; the open list shows it in full. Game size, the four bonuses, fog of war, and the starting month stay outside the tabs.
- On Global: Human, the human home-region choice, and a randomize control labeled "Randomize human home region".
- On Global: AI, the AI home-region choice, and a randomize control labeled "Randomize AI home region", in the opponent rose from the [UI style guide](../ui-style-guide.md). The two home regions may match.
- On Regional: Region, the region selector, with a randomize control labeled "Randomize region", the same teal square as the human home-region randomize button; then Your side, the human side-group choice; then Opponent, the AI side-group choice, with a rose randomize button. Each side has a randomize button. Opening the overlay draws a region, then two different sides. Changing the region, or clicking its randomize control, draws two different sides again. The region draw includes the region already shown. One side's randomize button picks any group except the other side's current group.
- Under the Map rows, Add another opponent, a dashed slot across the section, disabled in this version.
- Forces: on the title's line, at the right, `Advanced tech: $N+ hexes`. On Global, N is the world map's threshold. On Regional, N is the selected region's threshold, and it changes with the region.
- Forces: Game size, its dropdown only as wide as its longest item.
- Forces: one row of the four unit types, infantry, armor, naval, and air. Each shows the map glyph drawn dark on a small gray disk, the cap for the chosen game size in bold, a dot, and the unit's price, such as `12 · $20` (`formatUnitCostLabel`). The glyph's alternative text names the type. The price follows the selected tab and, on Regional, the selected region. The caps are in [game size and unit caps](../game-size-unit-caps.md).
- Rules: the four bonuses in two columns. The first row is Origin bonus, then Tech bonus. The second row is Terrain bonus, then Weather bonus. Each dropdown lists Off, Low, and High. Whenever the overlay opens, every dropdown is set to Low. Each dropdown is independent. Under them, Starting month, a control that lists the full English month names and is only as wide as its longest month, starting at the same edge as the bonus dropdowns, with a randomize control labeled "Randomize starting month" to its right, a square button the same height and color as the human home-region randomize button. Then the Fog of war checkbox. Whenever the overlay opens, Fog of war is checked and the month control shows a random month, the same way the home regions are drawn. The bonus rules for each level are in [combat rules §4.9](../combat-rules-v3.md).
````

2. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- When the player changes game size, the cap badges update to that size.
````

Replace it with:

````markdown
- When the player changes game size, the caps in the unit row update to that size.
````

3. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#game-over-overlay`, `#new-game-dialog-collapse`, `#game-over-dialog`, `#game-over-message`, `#new-game-tab-global`, `#new-game-tab-regional`, `#new-game-human-region-select`, `#new-game-human-region-randomize`, `#new-game-ai-region-select`, `#new-game-ai-region-randomize`, `#new-game-region-select`, `#new-game-region-randomize`, `#new-game-human-side-select`, `#new-game-human-side-randomize`, `#new-game-ai-side-select`, `#new-game-ai-side-randomize`, `#new-game-advanced-tech`, `#new-game-cost-infantry`, `#new-game-cost-armor`, `#new-game-cost-naval`, `#new-game-cost-air`, `#new-game-size-select`, `#new-game-size-cap-infantry`, `#new-game-size-cap-armor`, `#new-game-size-cap-naval`, `#new-game-size-cap-air`, `#new-game-fog-checkbox`, `#new-game-country-bonus-select`, `#new-game-terrain-bonus-select`, `#new-game-weather-bonus-select`, `#new-game-tech-bonus-select`, `#new-game-start-month`, `#new-game-start-month-randomize`, `#new-game-btn`)
````

Replace it with:

````markdown
- `static/index.html` (`#game-over-overlay`, `#new-game-dialog-collapse`, `#game-over-dialog`, `#game-over-message`, `#new-game-tab-global`, `#new-game-tab-regional`, `#new-game-human-region-select`, `#new-game-human-region-randomize`, `#new-game-ai-region-select`, `#new-game-ai-region-randomize`, `#new-game-region-select`, `#new-game-region-randomize`, `#new-game-human-side-select`, `#new-game-human-side-randomize`, `#new-game-ai-side-select`, `#new-game-ai-side-randomize`, `#new-game-add-opponent-btn`, `#new-game-advanced-tech`, `#new-game-cost-infantry`, `#new-game-cost-armor`, `#new-game-cost-naval`, `#new-game-cost-air`, `#new-game-size-select`, `#new-game-size-cap-infantry`, `#new-game-size-cap-armor`, `#new-game-size-cap-naval`, `#new-game-size-cap-air`, `#new-game-fog-checkbox`, `#new-game-origin-bonus-select`, `#new-game-terrain-bonus-select`, `#new-game-weather-bonus-select`, `#new-game-tech-bonus-select`, `#new-game-start-month`, `#new-game-start-month-randomize`, `#new-game-btn`)
````

4. In `doc/ux/new-game-dialog.md`, delete this line, including the line break at the end. It occurs exactly once:

````markdown
- `src/renderer/gameplay/newGameRegionSelectWidth.ts`
````

5. In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- `src/shared/gameSize.ts`
````

Replace it with:

````markdown
- `src/shared/gameSize.ts`
- `src/shared/gameMapList.ts` (`formatUnitCostLabel`, `formatAdvancedTechLine`)
````

- [ ] **Step 18: Edit `doc/ux/control-tooltips.md`**

Adds Add another opponent to the placeholders.

1. In `doc/ux/control-tooltips.md`, find this text. It occurs exactly once:

````markdown
It also includes New game in the game menu while the new-game screen is open, and every disabled placeholder: Settings and Help in the top bar, Load game on the new-game bar, Save game, Load game, and How to play in the game menu, the Build and Forces tabs, and Replay on a turn report.
````

Replace it with:

````markdown
It also includes New game in the game menu while the new-game screen is open, and every disabled placeholder: Settings and Help in the top bar, Load game on the new-game bar, Add another opponent on the new-game screen, Save game, Load game, and How to play in the game menu, the Build and Forces tabs, and Replay on a turn report.
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Settings, Help, Load game, How to play, Build, Forces, Replay, and the Control and Production map modes: "<name> is not available in this version.", for example "Settings is not available in this version."
````

Replace it with:

````markdown
- Settings, Help, Load game, How to play, Add another opponent, Build, Forces, Replay, and the Control and Production map modes: "<name> is not available in this version.", for example "Settings is not available in this version."
````

- [ ] **Step 19: Edit `doc/ui-style-guide.md`**

The new-game line describes the sections.

In `doc/ui-style-guide.md`, find this text. It occurs exactly once:

````markdown
The panel holds Global and Regional tabs. Global has human/AI home-region selectors, each with a randomize button. Regional has one centered region selector with the same teal square randomize button, and human/AI side-group selectors, each with a randomize button. The two home-region dropdowns, the region dropdown, and the two side-group dropdowns share one closed width, wide enough for the longest name in the home-region lists and the region list. A longer side name does not widen a side dropdown. After each unit type, its price in parentheses, such as Infantry ($20), follows the selected tab and region. The game size dropdown sits above an Advanced tech line for the map that is showing, and the cap badges draw the map glyphs dark on gray disks. Two option lines (Origin bonus / Tech bonus, then Terrain bonus / Weather bonus) of dropdowns (Off, Low, High, default Low) whose labels end in colons sit outside the tabs, then a row with Fog of war, a slash separator, and a "Starting month:" dropdown only as wide as its longest month, and a square randomize button matching the human home-region button, and New game.
````

Replace it with:

````markdown
The body has three sections under small uppercase titles, divided by rules. Map: Global and Regional tabs, then one row per choice: a label, a dropdown that fills the row, and a 30 px square randomize button (rose for the AI side). The label column is 5em, which fits the longest label, so every dropdown in both tabs has one left edge and one width. Global's rows are Human and AI; Regional's are Region, Your side, and Opponent. Under them, Add another opponent is a dashed, disabled slot. Forces: the Advanced tech line for the map that is showing sits at the right of the title; then Game size; then one row of the four unit types, each the map glyph dark on a small gray disk, the cap in bold, a dot, and the price, such as 12 · $20, following the selected tab and region. Rules: the four bonus dropdowns (Off, Low, High, default Low) in two columns, Origin and Tech, then Terrain and Weather; then Starting month, only as wide as its longest month, with its randomize square; then Fog of war. Labels have no colons. Controls are 30 px tall. The footer's Start game reads New game after a match ends.
````

- [ ] **Step 20: Edit `doc/game-size-unit-caps.md`**

Describes where Game size sits and the unit row under it, in place of the old layout.

In `doc/game-size-unit-caps.md`, find this line. It occurs exactly once:

````markdown
The player chooses size on the new-game dialog from a **Game size** dropdown (Small / Medium / Large). The dropdown sits on the same line as its label, to the right of that label, with the same gap as the bonus dropdowns, and only as wide as its longest item. It is placed between the home-region selectors and the bonus options (Country and Tech on one line, Terrain and Weather on the next). Fog of war sits on the following row, to the left of Starting month. A row of unit tokens under the dropdown shows the selected size’s caps on gray disks, with the map glyphs drawn dark, and the same numbering style as map stack counts.
````

Replace it with:

````markdown
The player chooses size on the new-game dialog from a **Game size** dropdown (Small / Medium / Large), in the Forces section, between the Map section's home or side choices and the Rules section's bonuses. The dropdown sits on the same line as its label, to the right of that label, and is only as wide as its longest item. Under it, one row of the four unit types shows each type's map glyph drawn dark on a gray disk, the selected size's cap in bold, and that map's price. The layout is in [new-game-dialog.md](ux/new-game-dialog.md).
````

- [ ] **Step 21: Edit `doc/region-vs-region.md`**

Fog of war is on the line after the starting month, not beside it.

In `doc/region-vs-region.md`, find this line. It occurs exactly once:

````markdown
- Fog of war (default on), on the same row as the starting month and to its left. The month is a random month whenever the new-game dialog opens, with a square randomize button beside the list.
````

Replace it with:

````markdown
- Fog of war (default on), on the line after the starting month. The month is a random month whenever the new-game dialog opens, with a square randomize button beside the list.
````

## Verify

- [ ] **Step 22: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 23: Full tests**

Run the full tests. Expected: exit 0, test total **896**, failure total **0**.

- [ ] **Step 24: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/gameMapList.ts src/shared/gameMapList.test.ts src/shared/gameSize.ts src/renderer/gameplay/newGameOptionsUi.ts src/renderer/gameplay/newGame.ts src/renderer/gameplay/newGameRegionUi.ts src/renderer/gameplay/newGameMapUi.ts src/renderer/gameplay/newGameSizeUi.ts src/renderer/core/constants.ts static/index.html static/newGameChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-new-game-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/new-game-dialog.md doc/ux/control-tooltips.md doc/ui-style-guide.md doc/game-size-unit-caps.md doc/region-vs-region.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/gameMapList.ts` | `b0d2868f636b47c9` |
| `src/shared/gameMapList.test.ts` | `27b5f08b6a09c520` |
| `src/shared/gameSize.ts` | `4a9b75ec206fdbfb` |
| `src/renderer/gameplay/newGameOptionsUi.ts` | `8585cb51c968f7f0` |
| `src/renderer/gameplay/newGame.ts` | `efc65ec7ab34d7a9` |
| `src/renderer/gameplay/newGameRegionUi.ts` | `1c230b294cf90cac` |
| `src/renderer/gameplay/newGameMapUi.ts` | `e1b797c73f8d9219` |
| `src/renderer/gameplay/newGameSizeUi.ts` | `cefcb19af4c5aac2` |
| `src/renderer/core/constants.ts` | `2fe988150c15868d` |
| `static/index.html` | `bc0543e1dfc5072a` |
| `static/newGameChrome.css` | `79d1ecfb3c7d1090` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `e18a9bc0e13fc81f` |
| `scripts/ui-smoke/ui-smoke-new-game-checks.cjs` | `561403b5052012c6` |
| `scripts/ui-smoke/ui-smoke.cjs` | `85a238cb47e5752d` |
| `doc/ux/new-game-dialog.md` | `02bd8aa84b13b022` |
| `doc/ux/control-tooltips.md` | `e646b5b7d2e7b6f3` |
| `doc/ui-style-guide.md` | `dec0fae19cee95a0` |
| `doc/game-size-unit-caps.md` | `2d68e3c81baf0e2d` |
| `doc/region-vs-region.md` | `273d2a6290fa60e3` |

This must print `False`, because this plan deletes it:

```powershell
Test-Path src/renderer/gameplay/newGameRegionSelectWidth.ts
```

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 25: Smoke run**

```powershell
npm run ui:smoke -- --label setup-sections
```

Expected summary line:

```text
ui-smoke setup-sections: 527 passed, 0 failed, 0 page errors, 40 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\setup-sections
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/setup-sections/report.json`.

- [ ] **Step 26: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/setup-sections/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The new-game screen draws random home regions and a random month each time it opens, so the choices shown and the map's highlighted homes differ from run to run.

- `01-new-game-startup.png` against [ui-facelift-start-3-expected-global.png](ui-facelift-start-3-expected-global.png): the Global tab. MAP, FORCES, and RULES titles; the Global and Regional tabs; Human and AI rows with their dropdowns and randomize squares lined up; the dashed Add another opponent slot across the section; Advanced tech at the right of FORCES; Game size; the four unit types in one row; the bonuses in two columns; Starting month with its randomize square; Fog of war.
- `36-new-game-regional.png` against [ui-facelift-start-3-expected-regional.png](ui-facelift-start-3-expected-regional.png): the Regional tab, opened from a match: Region, Your side, and Opponent rows lined up the same way. The body scrolls when the window is too short for it.
- `40-game-over-small-window.png` against [ui-facelift-start-3-expected-small-window.png](ui-facelift-start-3-expected-small-window.png): the game-over screen at 800 × 600 on the Regional tab, with the same sections in the same panel width.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 23.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 26.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. Open New game… with `npm start`: the sections match the mockup [ui-facelift-new-game-global.png](ui-facelift-new-game-global.png), apart from the map, the stand-in font, and the hide-choices button, which sits at the header's left as decided for this phase.
2. Switch to Regional: the rows read Region, Your side, and Opponent, and the dropdowns line up with Global's. Change the region: the prices, the Advanced tech line, and the preview follow.
3. Change Game size: the caps in the unit row follow.
4. Click each randomize square, including the starting month's: each draws a new choice, as before.
5. Point at Add another opponent: its "not available in this version" tip shows. Point at a bonus dropdown: its tip is unchanged.
6. Press Tab from the − button: focus moves through the tabs, the rows, Game size, the bonuses, the starting month, Fog of war, and Start game, in that order.
7. Start a match with Fog of war unchecked: the whole map shows. Start one from the Regional tab: the chosen sides play.

## Next

This completes the spec's Phase 7. Phase 8 refreshes the docs and screenshots and prepares the release.
