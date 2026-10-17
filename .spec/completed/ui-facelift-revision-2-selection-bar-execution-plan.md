# UI Facelift Revision, Plan 2 of 3: Selection Bar

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Turn the selection panel's header and its action row into one 50 px summary bar across the panel's top: the hex code and the count (or the single unit's flag and name), a hint that says what the next map gesture does, a divider, Ranged or Strike, and Close. While Ranged or Strike is aimed, the panel's border takes that order's color. The hex caption, the chips, and the unit rows move under the bar, into the details. In this plan the details always show; plan 3 adds the compact state.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 2 of the three that build the spec's Phase 6; [ui-facelift-revision-execution-plan.md](ui-facelift-revision-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `src/shared/selectionBarText.ts`: the five hints, the rule that picks one (playback, then targeting, then what a double-click does with this selection), and the "+K elsewhere" note, as pure, unit-tested functions.
- `src/renderer/gameplay/selectionBar.ts`: `renderSelectionBarState` writes the hint and sets `data-aim` on the panel while targeting is on. The selection panel, the Ranged or Strike code, and `updateGameStateSidebar` call it, so the hint follows the selection, targeting, and the start and end of playback.
- `selectionPanel.ts` writes the bar's first line and moves the hex caption into the details. `#selection-panel-count` is removed; its count is now on the first line.
- Ranged or Strike sits in a tip host, `#ranged-attack-tip-host`. The host is what shows and hides, and while the control is greyed out the host carries the reason as its tip. The source-reading test in `rendererConsolidation.test.ts` and its anchor comment in `renderer.ts` follow that change.
- The panel opens 440 px wide, and the narrowest dragged width goes from 320 to 400 px. Two new tokens, `--order-ranged` and `--order-strike`, carry the map's order colors.
- The smoke run's selection checks follow the bar, and a new check, `selection-bar-layout`, checks its place and height.
- `doc/` describes the bar.

**Out of scope:**

- The compact state, the expand control, and the slide (plan 3). The resize grip works as it does now, with the new 400 px minimum width.
- What the chips and the unit rows show.

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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Selection Panel. Skip Expanding and collapsing; plan 3 builds it.
2. `doc/ux/selection-panel.md` and `doc/ux/control-tooltips.md`.
3. `src/renderer/gameplay/selectionPanel.ts`, and `updateRangedSidebar` in `src/renderer/gameplay/tacticalOrders.ts`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 1 is in and this plan is not:

```powershell
Test-Path src/renderer/map/mapModeTabs.ts
Test-Path src/shared/selectionBarText.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **889**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/selectionBarText.ts`
- `src/shared/selectionBarText.test.ts`
- `src/shared/selectionPanelSize.ts`
- `src/shared/selectionPanelSize.test.ts`
- `src/main/rendererConsolidation.test.ts`
- `src/renderer/gameplay/selectionBar.ts`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/gameplay/selectionPanelResize.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/renderer.ts`
- `static/index.html`
- `static/shellChrome.css`
- `static/selectionChrome.css`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-console-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`
- `doc/ux/selection-panel.md`
- `doc/ux/right-panel-command-bar.md`
- `doc/ux/control-tooltips.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Create `src/shared/selectionBarText.ts`**

A new file: the selection bar's hint, which says what the next map gesture does, and the "+K elsewhere" note for selected units in other hexes. Pure functions with no page access, so the rules are unit-tested.

Create `src/shared/selectionBarText.ts` with exactly this content:

```ts
/**
 * The hint while a turn or a battle beat plays back. This module holds the text for the selection bar at the top of the
 * selection panel: the hint on its second line, which says what the next map gesture does, and the note on its first
 * line for selected units in other hexes. The hint must stay true to the map's gestures in every state, so its rules
 * live here with tests. Nothing here touches the page.
 *
 * Purpose: Map gestures that change orders wait until playback ends; right-click still clears the selection.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_PLAYBACK = 'Playback is running · right-click to deselect';

/**
 * The hint while Ranged or Strike targeting is on.
 *
 * Purpose: The next double-click places the attack.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_TARGETING = 'Double-click a target in range';

/**
 * The hint for a selection of air units only.
 *
 * Purpose: A double-click with an all-air selection plans a ferry.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_FERRY = 'Double-click a hex to ferry · right-click to deselect';

/**
 * The hint for air units selected with other types.
 *
 * Purpose: A double-click with that selection is rejected, so the hint says why instead of naming a gesture.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_MIXED = "Air units can't move with other units";

/**
 * The hint for any other selection.
 *
 * Purpose: A double-click plans a march.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_MOVE = 'Double-click a hex to move · right-click to deselect';

/**
 * What decides the selection bar's hint.
 *
 * Purpose: The renderer reads these from its state; the rule stays testable.
 * When to use: Pass to `selectionBarHint`.
 * Expected outcome: Only these fields are read.
 * Exceptions: None.
 */
export interface SelectionBarHintInput {
  /**
   * Whether a turn or a battle beat is playing back.
   *
   * Contract: True while resolution playback ignores gestures that change orders.
   * When to use: Always.
   * Expected outcome: True wins over every other field.
   * Exceptions: None.
   */
  readonly playbackRunning: boolean;
  /**
   * Whether Ranged or Strike targeting is on.
   *
   * Contract: True while the next double-click places a ranged attack or an air strike.
   * When to use: Always.
   * Expected outcome: True wins over the unit types.
   * Exceptions: None.
   */
  readonly targetingOn: boolean;
  /**
   * The types of the selected units, such as `air` or `infantry`.
   *
   * Contract: One entry per selected unit or battle sub-unit.
   * When to use: Always.
   * Expected outcome: Decides between move, ferry, and the mixed-selection hint.
   * Exceptions: None.
   */
  readonly unitTypes: readonly string[];
}

/**
 * Chooses the selection bar's hint: playback, then targeting, then what a double-click does with this selection.
 *
 * Purpose: One rule for the world map and battles, which share these gestures.
 * When to use: Each time the selection, targeting, or playback changes.
 * Expected outcome: One of the `SELECTION_HINT_*` sentences. An empty selection gets the move hint, though the panel is
 *   hidden then.
 * Exceptions: None.
 */
export function selectionBarHint(input: SelectionBarHintInput): string {
  if (input.playbackRunning) return SELECTION_HINT_PLAYBACK;
  if (input.targetingOn) return SELECTION_HINT_TARGETING;
  const airCount = input.unitTypes.filter((unitType) => unitType === 'air').length;
  if (airCount > 0 && airCount === input.unitTypes.length) return SELECTION_HINT_FERRY;
  if (airCount > 0) return SELECTION_HINT_MIXED;
  return SELECTION_HINT_MOVE;
}

/**
 * Counts the selected units that stand outside the hex the bar names, as the end of the bar's first line.
 *
 * Purpose: The compact bar hides the unit rows, so the first line must say when the selection reaches other hexes.
 * When to use: With the rows from `summarizeSelectionPanel`.
 * Expected outcome: `+1 elsewhere` for one such unit, `+2 elsewhere` for two, and null when every selected unit stands
 *   in that hex.
 * Exceptions: None.
 */
export function selectionElsewhereText(rows: readonly { readonly inPanelHex: boolean }[]): string | null {
  const elsewhere = rows.filter((row) => !row.inPanelHex).length;
  return elsewhere > 0 ? `+${elsewhere} elsewhere` : null;
}
```

- [ ] **Step 2: Create `src/shared/selectionBarText.test.ts`**

Covers each hint, the order in which they win (playback, then targeting, then the selection), and the elsewhere note.

Create `src/shared/selectionBarText.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SELECTION_HINT_FERRY,
  SELECTION_HINT_MIXED,
  SELECTION_HINT_MOVE,
  SELECTION_HINT_PLAYBACK,
  SELECTION_HINT_TARGETING,
  selectionBarHint,
  selectionElsewhereText,
} from './selectionBarText';

describe('selectionBarHint', () => {
  it('names the move gesture for land and naval units', () => {
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: false, unitTypes: ['armor', 'infantry', 'naval'] }), SELECTION_HINT_MOVE);
  });

  it('names the ferry gesture when every selected unit is air', () => {
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: false, unitTypes: ['air', 'air'] }), SELECTION_HINT_FERRY);
  });

  it('says why air units mixed with other types cannot move', () => {
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: false, unitTypes: ['air', 'armor'] }), SELECTION_HINT_MIXED);
  });

  it('puts targeting ahead of the selection', () => {
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: true, unitTypes: ['air'] }), SELECTION_HINT_TARGETING);
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: true, unitTypes: ['armor'] }), SELECTION_HINT_TARGETING);
  });

  it('puts playback ahead of targeting and the selection', () => {
    assert.equal(selectionBarHint({ playbackRunning: true, targetingOn: true, unitTypes: ['air'] }), SELECTION_HINT_PLAYBACK);
    assert.equal(selectionBarHint({ playbackRunning: true, targetingOn: false, unitTypes: ['armor'] }), SELECTION_HINT_PLAYBACK);
  });
});

describe('selectionElsewhereText', () => {
  it('is null when every selected unit stands in the named hex', () => {
    assert.equal(selectionElsewhereText([{ inPanelHex: true }, { inPanelHex: true }]), null);
  });

  it('counts the selected units in other hexes', () => {
    assert.equal(selectionElsewhereText([{ inPanelHex: true }, { inPanelHex: false }]), '+1 elsewhere');
    assert.equal(selectionElsewhereText([{ inPanelHex: true }, { inPanelHex: false }, { inPanelHex: false }]), '+2 elsewhere');
  });
});
```

- [ ] **Step 3: Edit `src/shared/selectionPanelSize.ts`**

The narrowest dragged width goes from 320 to 400 px, so the bar keeps room for its text beside the strike controls. Comments name the summary bar instead of the header.

1. In `src/shared/selectionPanelSize.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Keeps the header, the chips, and an order chip readable.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 320.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MIN_WIDTH = 320;
```

Replace them with:

```ts
 * Purpose: Leaves the summary bar room for its two lines of text beside the strike target list, Cancel, and the close
 *   control.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 400.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MIN_WIDTH = 400;
```

2. In `src/shared/selectionPanelSize.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Keeps the header and at least one unit row visible.
```

Replace it with:

```ts
 * Purpose: Keeps the summary bar and at least one unit row visible.
```

3. In `src/shared/selectionPanelSize.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Width from 320 to 640. Height from 140 to the map height minus 24; on a map too short for
```

Replace it with:

```ts
 * Expected outcome: Width from 400 to 640. Height from 140 to the map height minus 24; on a map too short for
```

- [ ] **Step 4: Edit `src/shared/selectionPanelSize.test.ts`**

Follows the 400 px minimum, and uses the new 440 px default width.

1. In `src/shared/selectionPanelSize.test.ts`, find these lines. Together they occur exactly once:

```ts
test('clampSelectionPanelSize holds the width between 320 and 640 and the height inside the map', () => {
  assert.deepEqual(clampSelectionPanelSize({ width: 100, height: 50 }, 676), { width: 320, height: 140 });
```

Replace them with:

```ts
test('clampSelectionPanelSize holds the width between 400 and 640 and the height inside the map', () => {
  assert.deepEqual(clampSelectionPanelSize({ width: 100, height: 50 }, 676), { width: 400, height: 140 });
```

2. In `src/shared/selectionPanelSize.test.ts`, find this line. It occurs exactly once:

```ts
  assert.deepEqual(clampSelectionPanelSize({ width: 400, height: 300 }, 100), { width: 400, height: 140 });
```

Replace it with:

```ts
  assert.deepEqual(clampSelectionPanelSize({ width: 440, height: 300 }, 100), { width: 440, height: 140 });
```

- [ ] **Step 5: Edit `src/main/rendererConsolidation.test.ts`**

This source-reading test looks for the line that hides Ranged or Strike while a strike is aimed. That line now hides the button's tip host, `btnHostEl`, instead of the button.

In `src/main/rendererConsolidation.test.ts`, find these lines. Together they occur exactly once:

```ts
    source.includes("btnEl.style.display = S.airStrikeModeActive ? 'none' : '';") &&
      tacticalOrdersSource.includes("btnEl.style.display = S.airStrikeModeActive ? 'none' : '';"),
```

Replace them with:

```ts
    source.includes("btnHostEl.style.display = S.airStrikeModeActive ? 'none' : '';") &&
      tacticalOrdersSource.includes("btnHostEl.style.display = S.airStrikeModeActive ? 'none' : '';"),
```

- [ ] **Step 6: Create `src/renderer/gameplay/selectionBar.ts`**

A new file: writes the bar's hint and marks the panel with `data-aim` while Ranged or Strike targeting is on, so the styles can color the bar's border. It also holds `selectedUnitTypes`, which the hint and Ranged or Strike both use.

Create `src/renderer/gameplay/selectionBar.ts` with exactly this content:

```ts
/**
 * The selection bar's parts that follow targeting and playback rather than the selection alone: the hint on its second
 * line, and the border color while the player aims a ranged attack or an air strike.
 *
 * Purpose: Targeting and playback start and stop without a selection change, so the selection panel's redraw alone
 *   would leave the bar out of date.
 * When to use: `renderSelectionBarState` after the selection panel redraws, after Ranged or Strike targeting turns on
 *   or off, and when playback starts or ends.
 * Expected outcome: `#selection-panel-hint` and the panel's `data-aim` match the current state.
 * Exceptions: None; missing elements are skipped.
 */
import { resolutionPlaybackBlocksMapOrders } from '../../shared/mapOrderGestureGate';
import { selectionBarHint } from '../../shared/selectionBarText';
import { rendererSharedState as S } from '../core/state';

/**
 * Returns the types of the selected units: battle sub-units in a battle, strategic units on the world map.
 *
 * Purpose: The hint and the Ranged or Strike control decide from the same list.
 * When to use: After the selection or the snapshot changes.
 * Expected outcome: One type per selected id that still matches a unit, in selection order.
 * Exceptions: None.
 */
export function selectedUnitTypes(): string[] {
  const battle = S.tacticalBattleSnapshot;
  const units: readonly { readonly id: string; readonly unitType: string }[] = battle
    ? battle.subUnits
    : (S.gameState?.units ?? []);
  const byId = new Map(units.map((unit) => [unit.id, unit.unitType]));
  return S.selectedUnitIds.flatMap((id) => {
    const unitType = byId.get(id);
    return unitType === undefined ? [] : [unitType];
  });
}

/**
 * Writes the bar's hint and marks the panel while targeting is on.
 *
 * Purpose: Keeps the hint true to what the next map gesture does, and colors the bar's border with the order being aimed.
 * When to use: See the module comment.
 * Expected outcome: The hint follows `selectionBarHint`. `data-aim` on `#selection-panel` is `ranged` or `strike` while
 *   that targeting is on, and absent otherwise; the styles color the border from it.
 * Exceptions: None.
 */
export function renderSelectionBarState(): void {
  const aim = S.airStrikeModeActive ? 'strike' : S.rangedModeActive ? 'ranged' : null;
  const panel = document.getElementById('selection-panel');
  if (panel) {
    if (aim) panel.dataset.aim = aim;
    else delete panel.dataset.aim;
  }
  const hint = document.getElementById('selection-panel-hint');
  if (hint) {
    hint.textContent = selectionBarHint({
      playbackRunning: resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation),
      targetingOn: aim !== null,
      unitTypes: selectedUnitTypes(),
    });
  }
}
```

- [ ] **Step 7: Edit `src/renderer/gameplay/selectionPanel.ts`**

The header becomes the bar's first line: the hex code, then the count or the single unit's flag and name, then "+K elsewhere" when it applies. The hex caption moves to its own line at the top of the details. The count line is gone, and the panel refreshes the bar's hint after each redraw.

1. In `src/renderer/gameplay/selectionPanel.ts`, find these lines. Together they occur exactly once:

```ts
 * The selection panel at the map's bottom-left: the selected units' hex, its chips, the units, and their orders.
 *
 * The panel replaces the Orders tab's "Selected unit" line. Its header keeps the id `sidebar-selected-unit`.
 */
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { formatHexNamingCaptionHtml } from '../../shared/hexNamingCaption';
import { escapeHtmlText } from '../../shared/htmlTextFormatting';
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
```

Replace them with:

```ts
 * The selection panel at the map's bottom-left: a summary bar with the selection's hex and count, a hint, and Ranged or
 * Strike, then the hex's caption and chips, the units, and their orders.
 *
 * The panel replaces the Orders tab's "Selected unit" line. The bar's first line keeps the id `sidebar-selected-unit`.
 */
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { formatHexNamingCaptionHtml } from '../../shared/hexNamingCaption';
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import { selectionElsewhereText } from '../../shared/selectionBarText';
```

2. In `src/renderer/gameplay/selectionPanel.ts`, find this line. It occurs exactly once:

```ts
  type SelectionPanelRow,
```

Replace it with:

```ts
  type SelectionPanelRow,
  type SelectionPanelSummary,
```

3. In `src/renderer/gameplay/selectionPanel.ts`, find this line. It occurs exactly once:

```ts
import { onQueuedOrdersChanged, queuedOrderForUnit } from './queuedOrderRows';
```

Replace it with:

```ts
import { onQueuedOrdersChanged, queuedOrderForUnit } from './queuedOrderRows';
import { renderSelectionBarState } from './selectionBar';
```

4. In `src/renderer/gameplay/selectionPanel.ts`, find these lines. Together they occur exactly once:

```ts
 * Counts header redraws, so a slow caption lookup cannot overwrite a newer header.
 *
 * Purpose: The hex caption arrives asynchronously.
 * When to use: Incremented by `renderSelectionPanelHeader` only.
 * Expected outcome: Only the latest lookup writes the caption.
 * Exceptions: None.
 */
let headerRequestSeq = 0;

/**
 * Writes the header: the hex code in parentheses, then the hex caption once it arrives.
 *
 * Purpose: Names the hex the way the hex tooltip does.
 * When to use: From `renderSelectionPanel`.
 * Expected outcome: `#sidebar-selected-unit` shows `(D4)` at once, then `(D4)` and the caption. On the same hex the
 *   old caption stays until the new one is written, so the header does not flicker.
 * Exceptions: None; a failed lookup leaves the code alone.
 */
function renderSelectionPanelHeader(panelHex: string, battle: TacticalBattleSnapshot | null): void {
  const place = document.getElementById('sidebar-selected-unit');
  if (!place) return;
  const code = orderTargetHexCode(panelHex, battle);
  const codeHtml = code ? `<strong>(${escapeHtmlText(code)})</strong>` : '';
  const resolution = battle ? 4 : 1;
  const hexKey = `${resolution}:${panelHex}`;
  if (place.dataset.hexKey !== hexKey) {
    place.innerHTML = codeHtml;
    place.dataset.hexKey = hexKey;
  }
  const requestSeq = ++headerRequestSeq;
  void getCachedNamingLineForTarget({ h3Index: panelHex, resolution }).then((caption) => {
    if (requestSeq !== headerRequestSeq) return;
    const captionHtml = caption && caption.text.trim() !== '' ? ` ${formatHexNamingCaptionHtml(caption)}` : '';
    place.innerHTML = `${codeHtml}${captionHtml}`;
```

Replace them with:

```ts
 * Counts caption lookups, so a slow lookup cannot overwrite a newer caption.
 *
 * Purpose: The hex caption arrives asynchronously.
 * When to use: Incremented by `renderSelectionPanelCaption` only.
 * Expected outcome: Only the latest lookup writes the caption.
 * Exceptions: None.
 */
let captionRequestSeq = 0;

/**
 * Writes the bar's first line: the hex code in parentheses, then the count, or the unit's flag and name when one unit
 * is selected, then how many selected units stand in other hexes.
 *
 * Purpose: Says where the selection is and what it holds, even while the details are hidden.
 * When to use: From `renderSelectionPanel`.
 * Expected outcome: `#sidebar-selected-unit` reads like "(D4) · 3 selected of 3", "(D3) · 2nd Squadron" with the
 *   unit's flag, or "(D4) · 2 selected of 3 · +1 elsewhere". In a battle the code names the battle cell, such as
 *   "(E8.K3)". A code that cannot be found shows "?".
 * Exceptions: None.
 */
function renderSelectionPanelSummaryLine(
  summary: SelectionPanelSummary,
  battle: TacticalBattleSnapshot | null,
  deps: SelectionPanelDeps
): void {
  const line = document.getElementById('sidebar-selected-unit');
  if (!line) return;
  const code = document.createElement('strong');
  code.textContent = `(${orderTargetHexCode(summary.panelHex, battle) ?? '?'})`;
  const what = document.createElement('span');
  if (summary.rows.length === 1) {
    const unitId = summary.rows[0].unitId;
    setUnitNameContent(what, unitId, deps.formatUnitDisplayName(unitId));
  } else {
    what.textContent = summary.countText;
  }
  line.replaceChildren(code, ' · ', what);
  const elsewhere = selectionElsewhereText(summary.rows);
  if (elsewhere) line.append(` · ${elsewhere}`);
}

/**
 * Writes the hex's caption at the top of the details once it arrives.
 *
 * Purpose: Names the hex the way the hex tooltip does.
 * When to use: From `renderSelectionPanel`.
 * Expected outcome: `#selection-panel-caption` empties when the hex changes, then shows the caption with its flags. On
 *   the same hex the old caption stays until the new one is written, so it does not flicker.
 * Exceptions: None; a failed lookup leaves the caption as it was.
 */
function renderSelectionPanelCaption(panelHex: string, battle: TacticalBattleSnapshot | null): void {
  const caption = document.getElementById('selection-panel-caption');
  if (!caption) return;
  const resolution = battle ? 4 : 1;
  const hexKey = `${resolution}:${panelHex}`;
  if (caption.dataset.hexKey !== hexKey) {
    caption.replaceChildren();
    caption.dataset.hexKey = hexKey;
  }
  const requestSeq = ++captionRequestSeq;
  void getCachedNamingLineForTarget({ h3Index: panelHex, resolution }).then((line) => {
    if (requestSeq !== captionRequestSeq) return;
    caption.innerHTML = line && line.text.trim() !== '' ? formatHexNamingCaptionHtml(line) : '';
```

5. In `src/renderer/gameplay/selectionPanel.ts`, find these lines. Together they occur exactly once:

```ts
 * Expected outcome: Hidden when no selected unit exists. Otherwise the header, chips, count line, and one row per
 *   selected unit describe the first selected unit's hex. During a battle the panel describes battle cells.
```

Replace them with:

```ts
 * Expected outcome: Hidden when no selected unit exists. Otherwise the bar's first line, the caption, the chips, and one
 *   row per selected unit describe the first selected unit's hex, and the bar's hint and border follow targeting and
 *   playback. During a battle the panel describes battle cells.
```

6. In `src/renderer/gameplay/selectionPanel.ts`, find these lines. Together they occur exactly once:

```ts
  renderSelectionPanelHeader(summary.panelHex, battle);
  renderSelectionPanelChips(summary.panelHex, battle);
  const count = document.getElementById('selection-panel-count');
  if (count) count.textContent = summary.countText;
  const list = document.getElementById('selection-panel-units');
  list?.replaceChildren(...summary.rows.map((row) => createUnitRow(row, battle, deps)));
```

Replace them with:

```ts
  renderSelectionPanelSummaryLine(summary, battle, deps);
  renderSelectionPanelCaption(summary.panelHex, battle);
  renderSelectionPanelChips(summary.panelHex, battle);
  const list = document.getElementById('selection-panel-units');
  list?.replaceChildren(...summary.rows.map((row) => createUnitRow(row, battle, deps)));
  renderSelectionBarState();
```

- [ ] **Step 8: Edit `src/renderer/gameplay/tacticalOrders.ts`**

Ranged or Strike now sits in a tip host. The host is what shows and hides, and it carries the greyed-out reason as its tip, because a disabled button gets no pointer events. The unit types come from `selectedUnitTypes`. After any change to targeting, the bar's hint and border are refreshed.

1. In `src/renderer/gameplay/tacticalOrders.ts`, find this line. It occurs exactly once:

```ts
import { refreshHoverRoutePreview } from './hoverRoutePreviewRefresh';
```

Replace it with:

```ts
import { refreshHoverRoutePreview } from './hoverRoutePreviewRefresh';
import { renderSelectionBarState, selectedUnitTypes } from './selectionBar';
```

2. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
 * Expected outcome: Pending rows match the draft arrays. The button shows while units are selected. It is enabled
 *   when every resolved unit can range, or every resolved unit is air; otherwise it is greyed out with its reason in
 *   `#selection-panel-action-note`. `Cancel` stays while ranged mode is still valid. A true-to-false flag change nulls
 *   the hover preview, hides the block and slower tooltips, redraws, and starts one hover refresh.
```

Replace them with:

```ts
 * Expected outcome: Pending rows match the draft arrays. The button shows while units are selected; its tip host
 *   (`#ranged-attack-tip-host`) is what shows and hides. It is enabled when every resolved unit can range, or every
 *   resolved unit is air; otherwise it is greyed out, and its reason is in `#selection-panel-action-note` and is the
 *   tip host's tip. `Cancel` stays while ranged mode is still valid. A true-to-false flag change nulls the hover preview,
 *   hides the block and slower tooltips, redraws, and starts one hover refresh. The selection bar's hint and border then
 *   follow the flags (`renderSelectionBarState`).
```

3. In `src/renderer/gameplay/tacticalOrders.ts`, find this line. It occurs exactly once:

```ts
  const btnEl = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;
```

Replace it with:

```ts
  const btnEl = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;
  const btnHostEl = document.getElementById('ranged-attack-tip-host');
```

4. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
  if (btnEl) {
    const tb = S.tacticalBattleSnapshot;
    const selectedUnits = tb
      ? S.selectedUnitIds
          .map((id) => tb.subUnits.find((u) => u.id === id))
          .filter((unit): unit is NonNullable<typeof unit> => !!unit)
      : S.selectedUnitIds
          .map((id) => S.gameState?.units.find((u) => u.id === id))
          .filter((unit): unit is NonNullable<typeof unit> => !!unit);
    const rangedWasActive = S.rangedModeActive;
    const strikeWasActive = S.airStrikeModeActive;
    const unitTypes = selectedUnits.map((unit) => unit.unitType);
```

Replace them with:

```ts
  if (btnEl && btnHostEl) {
    const tb = S.tacticalBattleSnapshot;
    const rangedWasActive = S.rangedModeActive;
    const strikeWasActive = S.airStrikeModeActive;
    const unitTypes = selectedUnitTypes();
```

5. In `src/renderer/gameplay/tacticalOrders.ts`, find this line. It occurs exactly once:

```ts
    if (actionNoteEl) actionNoteEl.textContent = action.reason ?? '';
```

Replace it with:

```ts
    if (actionNoteEl) actionNoteEl.textContent = action.reason ?? '';
    // The host carries the reason, because a disabled button gets no pointer events.
    if (!action.enabled && action.reason) btnHostEl.setAttribute('data-control-tooltip', action.reason);
    else btnHostEl.removeAttribute('data-control-tooltip');
```

6. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
      // An empty display lets the command-row rule center the label in the shared height.
      btnEl.style.display = S.airStrikeModeActive ? 'none' : '';
```

Replace them with:

```ts
      // An empty display hands the host back to `.control-tooltip-host`, whose inline flex keeps the button centered.
      btnHostEl.style.display = S.airStrikeModeActive ? 'none' : '';
```

7. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
      S.airStrikeModeActive = false;
      btnEl.style.display = '';
```

Replace them with:

```ts
      S.airStrikeModeActive = false;
      btnHostEl.style.display = '';
```

8. In `src/renderer/gameplay/tacticalOrders.ts`, find this line. It occurs exactly once:

```ts
      btnEl.style.display = '';
```

Replace it with:

```ts
      btnHostEl.style.display = '';
```

9. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
      void refreshHoverRoutePreview(deps);
    }
  }
}
```

Replace them with:

```ts
      void refreshHoverRoutePreview(deps);
    }
  }
  renderSelectionBarState();
}
```

- [ ] **Step 9: Edit `src/renderer/gameplay/selectionPanelResize.ts`**

A comment only: the narrowest width is 400 px.

In `src/renderer/gameplay/selectionPanelResize.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Width stays from 320 to 640 px and height from 140 px to the map height minus 24 px
```

Replace it with:

```ts
 * Expected outcome: Width stays from 400 to 640 px and height from 140 px to the map height minus 24 px
```

- [ ] **Step 10: Edit `src/renderer/core/uiState.ts`**

`updateGameStateSidebar` also refreshes the bar's hint. It already runs when playback starts and ends, which is when the hint changes without a selection change.

1. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
import { renderSelectionPanel } from '../gameplay/selectionPanel';
```

Replace it with:

```ts
import { renderSelectionPanel } from '../gameplay/selectionPanel';
import { renderSelectionBarState } from '../gameplay/selectionBar';
```

2. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
 * Refreshes the match status in the top bar, and the console header, from the latest snapshot.
```

Replace it with:

```ts
 * Refreshes the match status in the top bar, the console header, and the selection bar's hint, from the latest snapshot.
```

3. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
 *   Null shows em dashes in the top bar.
```

Replace it with:

```ts
 *   The selection bar's hint follows playback, which starts and ends around these calls. Null shows em dashes in the
 *   top bar.
```

4. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
  refreshConsoleHeader();
```

Replace it with:

```ts
  refreshConsoleHeader();
  renderSelectionBarState();
```

- [ ] **Step 11: Edit `src/renderer/renderer.ts`**

The contract-anchor comment that `rendererConsolidation.test.ts` reads follows the `btnHostEl` change.

In `src/renderer/renderer.ts`, find this line. It occurs exactly once:

```ts
  // btnEl.style.display = S.airStrikeModeActive ? 'none' : '';
```

Replace it with:

```ts
  // btnHostEl.style.display = S.airStrikeModeActive ? 'none' : '';
```

- [ ] **Step 12: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 13: Edit `static/index.html`**

Rebuilds the panel's markup. The bar (`#selection-panel-bar`) holds the two lines of text, a divider, the Ranged or Strike controls with Ranged in its tip host, and Close. The details (`#selection-panel-details`) hold the caption, the chips, the unit rows, the greyed-out reason, and the error line. `#selection-panel-count` is removed. Every other id stays.

1. In `static/index.html`, find these lines. Together they occur exactly once:

```html
      <div class="selection-panel-body">
        <div class="selection-panel-header">
          <p id="sidebar-selected-unit" class="selection-panel-place">—</p>
          <button type="button" id="selection-panel-close" class="selection-panel-close" aria-label="Clear the selection" data-control-tooltip="Clear the selection. Queued orders stay.">×</button>
        </div>
        <div id="selection-panel-chips" class="selection-panel-chips"></div>
        <p id="selection-panel-count" class="selection-panel-count"></p>
        <ul id="selection-panel-units" class="selection-panel-units"></ul>
        <p id="sidebar-error" class="chrome-error" style="font-size: 0.9em; display: none;"></p>
        <div class="selection-panel-actions">
          <button type="button" id="ranged-attack-btn" class="ranged-btn" style="display: none;">Ranged</button>
```

Replace them with:

```html
      <div id="selection-panel-bar" class="selection-panel-bar">
        <div class="selection-panel-text">
          <p id="sidebar-selected-unit" class="selection-panel-summary">—</p>
          <p id="selection-panel-hint" class="selection-panel-hint"></p>
        </div>
        <span class="selection-panel-divider" aria-hidden="true"></span>
        <div class="selection-panel-actions">
          <span id="ranged-attack-tip-host" class="control-tooltip-host" style="display: none;"><button type="button" id="ranged-attack-btn" class="ranged-btn">Ranged</button></span>
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
          <span id="selection-panel-action-note" class="selection-panel-action-note"></span>
        </div>
```

Replace them with:

```html
        </div>
        <button type="button" id="selection-panel-close" class="selection-panel-close" aria-label="Clear the selection" data-control-tooltip="Clear the selection. Queued orders stay.">×</button>
      </div>
      <div id="selection-panel-details" class="selection-panel-details">
        <p id="selection-panel-caption" class="selection-panel-caption"></p>
        <div id="selection-panel-chips" class="selection-panel-chips"></div>
        <ul id="selection-panel-units" class="selection-panel-units"></ul>
        <p id="selection-panel-action-note" class="selection-panel-action-note"></p>
        <p id="sidebar-error" class="chrome-error" style="font-size: 0.9em; display: none;"></p>
```

- [ ] **Step 14: Edit `static/shellChrome.css`**

Adds the ranged and air-strike order colors as tokens, with the same values the map uses.

In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  --minimap-width: 280px;
```

Replace it with:

```css
  --minimap-width: 280px;
  /* The ranged and air-strike order colors the map draws (RANGE_PERIMETER_RANGED_COLOR, RANGE_PERIMETER_AIR_STRIKE_COLOR). */
  --order-ranged: #a06020;
  --order-strike: #7a3db5;
```

- [ ] **Step 15: Edit `static/selectionChrome.css`**

Styles the bar: 50 px tall, two lines that end in an ellipsis, a divider, and controls that keep their size. The border takes the order color while targeting is on. The details take over the old body's scrolling. The panel opens 440 px wide.

1. In `static/selectionChrome.css`, find this line. It occurs exactly once:

```css
/* The selection panel at the map's bottom-left: header, chips, count, unit rows, the Ranged and Strike row, and the resize grip. */
```

Replace it with:

```css
/* The selection panel at the map's bottom-left: the summary bar, the details under it, and the resize grip. */
```

2. In `static/selectionChrome.css`, find this line. It occurs exactly once:

```css
  width: 400px;
```

Replace it with:

```css
  width: 440px;
```

3. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
/* Everything but the grip. The unit rows scroll first; when the panel is dragged shorter than its fixed parts, the whole body scrolls. */
.selection-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 10px 12px 12px;
}

/* ---------- Header ---------- */
.selection-panel-header {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.selection-panel-place {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}
.selection-panel-place strong:first-child {
  font-size: 14px;
```

Replace them with:

```css
/* While the player aims, the border takes the color of the order being aimed. */
.selection-panel[data-aim="ranged"] {
  border-color: var(--order-ranged);
}
.selection-panel[data-aim="strike"] {
  border-color: var(--order-strike);
}

/* ---------- Summary bar ---------- */
/* One 50 px row that never scrolls: two lines of text, a divider, Ranged or Strike, and the close control. The controls
   keep their size and the text gives way. The right padding keeps the close control clear of the grip. */
.selection-panel-bar {
  flex: none;
  height: 50px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px 0 12px;
  box-sizing: border-box;
}
.selection-panel-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.selection-panel-summary,
.selection-panel-hint {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selection-panel-summary {
  font-size: 13px;
  font-weight: 600;
}
.selection-panel-hint {
  color: var(--chrome-muted);
  font-size: 11px;
}
.selection-panel-divider {
  flex: none;
  width: 1px;
  height: 30px;
  background: var(--chrome-divider);
```

4. In `static/selectionChrome.css`, find this line. It occurs exactly once:

```css
/* ---------- Chips and count ---------- */
```

Replace it with:

```css
/* ---------- Details ---------- */
/* Everything under the bar. The unit rows scroll first; when the panel is dragged shorter than the caption, the chips,
   and one row, the whole details scroll. */
.selection-panel-details {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--chrome-divider);
}
.selection-panel-caption {
  flex: none;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}
.selection-panel-caption:empty {
  display: none;
}
```

5. In `static/selectionChrome.css`, delete these lines, including the line break at the end. Together they occur exactly once:

```css
}
.selection-panel-count {
  flex: none;
  margin: 2px 0 0;
  color: var(--chrome-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
```

6. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
/* Ranged or Strike, the strike target list, its Cancel, and the reason a greyed-out button cannot be used share one row. */
.selection-panel-actions {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding-top: 8px;
  border-top: 1px solid var(--chrome-divider);
}
.selection-panel-action-note {
  flex: 1 1 160px;
  min-width: 0;
```

Replace them with:

```css
/* Ranged or Strike, or the strike target list and its Cancel, in the bar. The reason a greyed-out control cannot be used
   sits in the details under the unit rows. */
.selection-panel-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.selection-panel-action-note {
  flex: none;
  margin: 0;
```

- [ ] **Step 16: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

The page probe also reads each element's top border color and its tip sentence.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
 *   null when the selector matches nothing, otherwise the first match's box, text, font size, and the attributes the
 *   checks use, plus the text of every match in `allTexts`.
```

Replace them with:

```js
 *   null when the selector matches nothing, otherwise the first match's box, text, font size, border color, tip, and
 *   the attributes the checks use, plus the text of every match in `allTexts`.
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
   * Expected outcome: The first match's box, whether it is shown, its trimmed text, its computed font size, and selected
   *   attributes, and the trimmed text of every match, or null when the selector matches nothing.
```

Replace them with:

```js
   * Expected outcome: The first match's box, whether it is shown, its trimmed text, its computed font size and top
   *   border color, its control tip sentence, and selected attributes, and the trimmed text of every match, or null when
   *   the selector matches nothing.
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
      fontSize: getComputedStyle(el).fontSize,
```

Replace it with:

```js
      fontSize: getComputedStyle(el).fontSize,
      borderColor: getComputedStyle(el).borderTopColor,
      tip: el.getAttribute('data-control-tooltip'),
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the bar's expected hints and strike border color, and `readSummaryLine`, which splits the bar's first line into its code and the rest.

1. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
}

module.exports = {
```

Replace them with:

```js
}

/**
 * The selection bar's hints the smoke scenes reach, and the border color while a strike is aimed.
 *
 * Purpose: The checks compare the bar's second line and border with the rules in `src/shared/selectionBarText.ts` and
 *   `static/selectionChrome.css`.
 * When to use: The selection bar checks.
 * Expected outcome: The move hint, the targeting hint, and the strike purple as a computed color.
 * Exceptions: None.
 */
const SELECTION_BAR = Object.freeze({
  moveHint: 'Double-click a hex to move · right-click to deselect',
  targetingHint: 'Double-click a target in range',
  strikeBorder: 'rgb(122, 61, 181)',
});

/**
 * Reads the code and the rest of the selection bar's first line.
 *
 * Purpose: Every selection check reads that line the same way.
 * When to use: With the text of `#sidebar-selected-unit`.
 * Expected outcome: `{ code, rest }` for a line such as "(D4) · 2 selected of 2", or null when the line does not start
 *   with a code in parentheses and " · ".
 * Exceptions: None.
 */
function readSummaryLine(text) {
  const match = /^\(([0-9A-Z]{2}(?:\.[0-9A-Z]{2})?)\) · (.+)$/.exec(text);
  return match ? { code: match[1], rest: match[2] } : null;
}

module.exports = {
```

2. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
  MATCH_SCENES,
  SETTLE_MS,
  near,
  fmt,
};
```

Replace them with:

```js
  MATCH_SCENES,
  SETTLE_MS,
  SELECTION_BAR,
  near,
  fmt,
  readSummaryLine,
};
```

- [ ] **Step 18: Edit `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

The selection panel checks follow the bar: the 440 px width and 400 px minimum, a new `selection-bar-layout` check, the first line for one unit and for a stack, the greyed-out reason as the host's tip, and the purple border and targeting hint while a strike is aimed.

1. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
const { SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');
```

Replace it with:

```js
const { SCENES, SELECTION_BAR, near, fmt, readSummaryLine } = require('./ui-smoke-scenes.cjs');
```

2. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
const SELECTION_PANEL_LIMITS = Object.freeze({ minWidth: 320, maxWidth: 640, minHeight: 140, mapMargin: 24 });
```

Replace it with:

```js
const SELECTION_PANEL_LIMITS = Object.freeze({ minWidth: 400, maxWidth: 640, minHeight: 140, mapMargin: 24 });
```

3. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
const SELECTION_PANEL_WIDTH = 400;
```

Replace it with:

```js
const SELECTION_PANEL_WIDTH = 440;

/**
 * Height of the selection panel's summary bar in CSS pixels.
 *
 * Purpose: The bar is one row at the top of the panel.
 * When to use: The summary bar layout check.
 * Expected outcome: Matches `.selection-panel-bar` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const SELECTION_BAR_HEIGHT = 50;
```

4. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
  {
    name: 'selection-panel-one-unit',
```

Replace them with:

```js
  {
    name: 'selection-bar-layout',
    scenes: [SCENES.ordersQueued, SCENES.selectionStack, SCENES.strikeAiming],
    needs: ['#selection-panel', '#selection-panel-bar', '#selection-panel-close', '#selection-panel-details'],
    run: (p, el) => {
      const s = el('#selection-panel');
      const bar = el('#selection-panel-bar');
      if (!bar.shown || !near(bar.y, s.y + 1) || !near(bar.h, SELECTION_BAR_HEIGHT)) {
        return `the summary bar is at ${fmt(bar)}, expected a ${SELECTION_BAR_HEIGHT} px row at the top of the panel ${fmt(s)}`;
      }
      if (!el('#selection-panel-close').ancestorIds.includes('selection-panel-bar')) return 'the close control is not in the summary bar';
      const details = el('#selection-panel-details');
      return details.y >= bar.y + bar.h - 1 ? null : `the details start at ${fmt(details)}, above the bottom of the bar ${fmt(bar)}`;
    },
  },
  {
    name: 'selection-panel-one-unit',
```

5. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      '#sidebar-selected-unit',
      '#selection-panel-count',
```

Replace them with:

```js
      '#sidebar-selected-unit',
      '#selection-panel-hint',
      '#selection-panel-units .selection-panel-unit-name',
```

6. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
    ],
    run: (p, el) => {
      const place = el('#sidebar-selected-unit');
      if (!place.ancestorIds.includes('selection-panel')) return '#sidebar-selected-unit is not inside the selection panel';
      if (!/^\([0-9A-Z]{2}\)/.test(place.text)) return `the header reads "${place.text}", expected it to start with a hex code such as "(D4)"`;
      const count = el('#selection-panel-count').text;
      if (count !== '1 selected of 1') return `the count reads "${count}", expected "1 selected of 1"`;
      const chip = el('#selection-panel-units .selection-panel-order > span').text;
      const row = el('#pending-orders-list .console-order-detail').text;
      if (chip !== row) return `the order chip reads "${chip}" but the Orders row reads "${row}"`;
      const ranged = el('#ranged-attack-btn');
      if (el('#selection-panel-action-note').shown) return `a reason shows for an armor unit: "${el('#selection-panel-action-note').text}"`;
      return ranged.shown && !ranged.disabled && ranged.text === 'Ranged' && ranged.ancestorIds.includes('selection-panel')
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? ' and is disabled' : ''}, expected it enabled in the selection panel`;
```

Replace them with:

```js
      '#selection-panel',
    ],
    run: (p, el) => {
      const place = el('#sidebar-selected-unit');
      if (!place.ancestorIds.includes('selection-panel-bar')) return '#sidebar-selected-unit is not in the summary bar';
      const line = readSummaryLine(place.text);
      const name = el('#selection-panel-units .selection-panel-unit-name').text;
      if (!line || line.rest !== name) return `the first line reads "${place.text}", expected a hex code such as "(D4)", then "${name}"`;
      const hint = el('#selection-panel-hint').text;
      if (hint !== SELECTION_BAR.moveHint) return `the hint reads "${hint}", expected "${SELECTION_BAR.moveHint}"`;
      const chip = el('#selection-panel-units .selection-panel-order > span').text;
      const row = el('#pending-orders-list .console-order-detail').text;
      if (chip !== row) return `the order chip reads "${chip}" but the Orders row reads "${row}"`;
      if (el('#selection-panel').borderColor === SELECTION_BAR.strikeBorder) return 'the panel has the strike border while nothing is aimed';
      const ranged = el('#ranged-attack-btn');
      if (el('#selection-panel-action-note').shown) return `a reason shows for an armor unit: "${el('#selection-panel-action-note').text}"`;
      return ranged.shown && !ranged.disabled && ranged.text === 'Ranged' && ranged.ancestorIds.includes('selection-panel-bar')
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? ' and is disabled' : ''}, expected it enabled in the summary bar`;
```

7. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
    needs: ['#selection-panel-count', '#selection-panel-units .selection-panel-unit:nth-child(2)', '#selection-panel-units .selection-panel-order-none'],
    run: (p, el) => {
      const count = el('#selection-panel-count').text;
      if (count !== '2 selected of 2') return `the count reads "${count}", expected "2 selected of 2"`;
```

Replace them with:

```js
    needs: ['#sidebar-selected-unit', '#selection-panel-units .selection-panel-unit:nth-child(2)', '#selection-panel-units .selection-panel-order-none'],
    run: (p, el) => {
      const line = readSummaryLine(el('#sidebar-selected-unit').text);
      if (!line || line.rest !== '2 selected of 2') return `the first line reads "${el('#sidebar-selected-unit').text}", expected a hex code, then "2 selected of 2"`;
```

8. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
    needs: ['#ranged-attack-btn', '#selection-panel-action-note'],
```

Replace it with:

```js
    needs: ['#ranged-attack-btn', '#ranged-attack-tip-host', '#selection-panel-action-note'],
```

9. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      const note = el('#selection-panel-action-note').text;
      return note === "Infantry can't fire on the world map." ? null : `the reason reads "${note}"`;
```

Replace them with:

```js
      const reason = "Infantry can't fire on the world map.";
      const note = el('#selection-panel-action-note');
      if (note.text !== reason || !note.ancestorIds.includes('selection-panel-details')) return `the reason in the details reads "${note.text}"`;
      const tip = el('#ranged-attack-tip-host').tip;
      return tip === reason ? null : `the greyed-out control's tip reads "${tip}", expected "${reason}"`;
```

10. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#air-strike-cancel-btn', '#selection-panel-count'],
    run: (p, el) => {
      if (el('#ranged-attack-btn').shown) return 'Strike still shows while aiming';
      const missing = ['#air-strike-target-type', '#air-strike-cancel-btn']
        .filter((selector) => !el(selector).shown || !el(selector).ancestorIds.includes('selection-panel'));
      if (missing.length > 0) return `not shown in the selection panel: ${missing.join(', ')}`;
      const count = el('#selection-panel-count').text;
      return count === '1 selected of 1' ? null : `the count reads "${count}", expected "1 selected of 1"`;
```

Replace them with:

```js
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#air-strike-cancel-btn', '#sidebar-selected-unit', '#selection-panel-hint', '#selection-panel'],
    run: (p, el) => {
      if (el('#ranged-attack-btn').shown) return 'Strike still shows while aiming';
      const missing = ['#air-strike-target-type', '#air-strike-cancel-btn']
        .filter((selector) => !el(selector).shown || !el(selector).ancestorIds.includes('selection-panel-bar'));
      if (missing.length > 0) return `not shown in the summary bar: ${missing.join(', ')}`;
      if (!readSummaryLine(el('#sidebar-selected-unit').text)) return `the first line reads "${el('#sidebar-selected-unit').text}", expected a hex code, then the unit`;
      const hint = el('#selection-panel-hint').text;
      if (hint !== SELECTION_BAR.targetingHint) return `the hint reads "${hint}", expected "${SELECTION_BAR.targetingHint}"`;
      const border = el('#selection-panel').borderColor;
      return border === SELECTION_BAR.strikeBorder ? null : `the panel's border is ${border}, expected the strike purple ${SELECTION_BAR.strikeBorder}`;
```

- [ ] **Step 19: Edit `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`**

The battle and regional selection checks read the bar's first line instead of the old header and count, and check the hint in a battle and the caption in a regional match.

1. In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find this line. It occurs exactly once:

```js
const { SCENES, fmt } = require('./ui-smoke-scenes.cjs');
```

Replace it with:

```js
const { SCENES, SELECTION_BAR, fmt, readSummaryLine } = require('./ui-smoke-scenes.cjs');
```

2. In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find these lines. Together they occur exactly once:

```js
    needs: ['#selection-panel', '#sidebar-selected-unit', '#selection-panel-count'],
    run: (p, el) => {
      if (!el('#selection-panel').shown) return 'the selection panel is not shown';
      const header = el('#sidebar-selected-unit').text;
      if (!/^\([0-9A-Z]{2}\.[0-9A-Z]{2}\)/.test(header)) return `the header reads "${header}", expected a battle cell code such as "(E8.K3)"`;
      const count = el('#selection-panel-count').text;
      return /^1 selected of \d+$/.test(count) ? null : `the count reads "${count}", expected "1 selected of N"`;
```

Replace them with:

```js
    needs: ['#selection-panel', '#sidebar-selected-unit', '#selection-panel-units .selection-panel-unit-name', '#selection-panel-hint'],
    run: (p, el) => {
      if (!el('#selection-panel').shown) return 'the selection panel is not shown';
      const text = el('#sidebar-selected-unit').text;
      const line = readSummaryLine(text);
      const name = el('#selection-panel-units .selection-panel-unit-name').text;
      if (!line || !line.code.includes('.') || line.rest !== name) {
        return `the first line reads "${text}", expected a battle cell code such as "(E8.K3)", then "${name}"`;
      }
      const hint = el('#selection-panel-hint').text;
      return hint === SELECTION_BAR.moveHint ? null : `the hint reads "${hint}", expected "${SELECTION_BAR.moveHint}"`;
```

3. In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find these lines. Together they occur exactly once:

```js
    needs: ['#selection-panel', '#sidebar-selected-unit', '#selection-panel-count'],
    run: (p, el) => {
      if (!el('#selection-panel').shown) return 'the selection panel is not shown';
      const header = el('#sidebar-selected-unit').text;
      if (!/^\([0-9A-Z]{2}\) \S/.test(header)) return `the header reads "${header}", expected a hex code and its caption`;
      const count = el('#selection-panel-count').text;
      return count === '1 selected of 1' ? null : `the count reads "${count}", expected "1 selected of 1"`;
```

Replace them with:

```js
    needs: ['#selection-panel', '#sidebar-selected-unit', '#selection-panel-units .selection-panel-unit-name', '#selection-panel-caption'],
    run: (p, el) => {
      if (!el('#selection-panel').shown) return 'the selection panel is not shown';
      const text = el('#sidebar-selected-unit').text;
      const line = readSummaryLine(text);
      const name = el('#selection-panel-units .selection-panel-unit-name').text;
      if (!line || line.code.includes('.') || line.rest !== name) return `the first line reads "${text}", expected a hex code such as "(D4)", then "${name}"`;
      const caption = el('#selection-panel-caption').text;
      return caption !== '' ? null : 'the hex caption is empty';
```

- [ ] **Step 20: Edit `doc/ux/selection-panel.md`**

Describes the bar, its hints and border, and the details.

1. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
- A header with the hex code of the first selected unit's hex in parentheses, such as "(D4)", then that hex's caption, the same naming line the [hex tooltip](hex-tooltips.md) shows, with its flags. In a battle the code names the battle cell, such as "(E8.K3)". The caption appears once its lookup returns; until then the header shows the code alone.
- A close control (×) at the header's right.
- Chips describing that hex, in this order, each only when it applies:
  - The terrain kind, with the map key's swatch.
  - The weather, with its icon, while the weather bonus is on and the hex's weather is known.
  - The tech tier of units built there, Basic or Advanced with its icon, while the tech bonus is on and the hex can produce units. Not shown in a battle.
  - The production the hex adds each turn, such as "$94/turn", when it has urban cells and is not on the neutral border. Not shown in a battle.
  - "Home" in the player's home region, or "Enemy home" in the opponent's. Not shown in a battle.
- A count line, "N selected of M": N is the number of selected units in that hex, and M is the number of the player's units there that can be selected (`summarizeSelectionPanel` in `src/shared/selectionPanelSummary.ts`). An embarked land unit cannot be selected.
- One row per selected unit, in selection order. Each row shows the unit type's glyph, the unit's origin flag and name, and, for a unit in a different hex, that hex's code in parentheses. The row ends with the unit's queued order, in the same words as its row on the Orders tab, followed by a cancel control (×), or "No orders". See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
- The sidebar error line, which stays hidden. See [notifications-and-feedback.md](notifications-and-feedback.md).
- The Ranged and Strike controls, and the reason a greyed-out control cannot be used. See [right-panel-command-bar.md](right-panel-command-bar.md).
- A resize grip at the top-right corner.
- The panel opens 400 px wide, 12 px in from the map's left and bottom edges. Its height fits its rows, up to half the map's height; past that the unit rows scroll. When the panel is shorter than its header, chips, and one row, its whole content scrolls. Where it overlaps the terrain legend or the map scale, it draws above them.
- Control tips for the close control and the grip are in [control-tooltips.md](control-tooltips.md).
````

Replace them with:

````markdown
- A summary bar, one 50 px row across the top of the panel that never scrolls. From left to right:
  - Two lines of text. Each ends in an ellipsis when it does not fit, and the controls beside them keep their size.
  - The first line: the hex code of the first selected unit's hex in parentheses, such as "(D4)", then " · " and "N selected of M". N is the number of selected units in that hex, and M is the number of the player's units there that can be selected (`summarizeSelectionPanel` in `src/shared/selectionPanelSummary.ts`). An embarked land unit cannot be selected. When exactly one unit is selected, its origin flag and name take the place of the count. When selected units also stand in other hexes, the line ends with " · +K elsewhere", where K counts them (`selectionElsewhereText` in `src/shared/selectionBarText.ts`). In a battle the code names the battle cell, such as "(E8.K3)". A code that cannot be found shows "?".
  - The second line, a hint for the next map gesture (`selectionBarHint` in `src/shared/selectionBarText.ts`). The first that applies: "Playback is running · right-click to deselect" while a turn or a battle beat plays back; "Double-click a target in range" while Ranged or Strike targeting is on; "Double-click a hex to ferry · right-click to deselect" when every selected unit is air; "Air units can't move with other units" when air units are selected with other types; otherwise "Double-click a hex to move · right-click to deselect".
  - A divider, then the Ranged and Strike controls. See [right-panel-command-bar.md](right-panel-command-bar.md).
  - A close control (×).
- The details, under the bar:
  - That hex's caption, the same naming line the [hex tooltip](hex-tooltips.md) shows, with its flags. It appears once its lookup returns.
  - Chips describing that hex, in this order, each only when it applies:
    - The terrain kind, with the map key's swatch.
    - The weather, with its icon, while the weather bonus is on and the hex's weather is known.
    - The tech tier of units built there, Basic or Advanced with its icon, while the tech bonus is on and the hex can produce units. Not shown in a battle.
    - The production the hex adds each turn, such as "$94/turn", when it has urban cells and is not on the neutral border. Not shown in a battle.
    - "Home" in the player's home region, or "Enemy home" in the opponent's. Not shown in a battle.
  - One row per selected unit, in selection order. Each row shows the unit type's glyph, the unit's origin flag and name, and, for a unit in a different hex, that hex's code in parentheses. The row ends with the unit's queued order, in the same words as its row on the Orders tab, followed by a cancel control (×), or "No orders". See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
  - The reason a greyed-out Ranged or Strike cannot be used, when one applies.
  - The sidebar error line, which stays hidden. See [notifications-and-feedback.md](notifications-and-feedback.md).
- While Ranged targeting is on, the panel's border is the ranged amber, and while Strike targeting is on, the strike purple (`--order-ranged` and `--order-strike` in `static/shellChrome.css`).
- A resize grip at the top-right corner, clear of the close control.
- The panel opens 440 px wide, 12 px in from the map's left and bottom edges, and is never wider than the map minus 24 px. Its height fits the bar and the details, up to half the map's height; past that the unit rows scroll. When the panel is shorter than the bar, the caption, the chips, and one row, the details scroll as a whole. Where it overlaps the terrain legend, the map scale, or the minimap panel, it draws above them.
- Control tips for the close control, the grip, and a greyed-out Ranged or Strike are in [control-tooltips.md](control-tooltips.md).
````

2. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- When the player drags the grip, the panel resizes. Its bottom-left corner stays put. The width stays from 320 to 640 px and the height from 140 px to the map's height minus 24 px (`clampSelectionPanelSize` in `src/shared/selectionPanelSize.ts`). A dragged height replaces the half-the-map limit.
````

Replace it with:

````markdown
- When the player drags the grip, the panel resizes. Its bottom-left corner stays put. The width stays from 400 to 640 px and the height from 140 px to the map's height minus 24 px (`clampSelectionPanelSize` in `src/shared/selectionPanelSize.ts`). A dragged height replaces the half-the-map limit.
````

3. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- The panel follows every selection change, every snapshot, and every change to the queued orders.
````

Replace it with:

````markdown
- The panel follows every selection change, every snapshot, and every change to the queued orders. The hint and the border also follow Ranged and Strike targeting, and playback, as they start and stop (`renderSelectionBarState` in `src/renderer/gameplay/selectionBar.ts`).
````

4. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- Several hexes: rows for units in other hexes show their hex code.
````

Replace it with:

````markdown
- Several hexes: the first line ends with "+K elsewhere", and rows for units in other hexes show their hex code.
````

5. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
| Codes | World hex, such as "(D4)" | Battle cell, such as "(E8.K3)" |
````

Replace it with:

````markdown
| Codes on the first line | World hex, such as "(D4)" | Battle cell, such as "(E8.K3)" |
````

6. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#selection-panel`, `#selection-panel-grip`, `#sidebar-selected-unit`, `#selection-panel-close`, `#selection-panel-chips`, `#selection-panel-count`, `#selection-panel-units`, `#sidebar-error`, `#selection-panel-action-note`)
- `static/selectionChrome.css`
- `src/renderer/gameplay/selectionPanel.ts`
````

Replace them with:

````markdown
- `static/index.html` (`#selection-panel`, `#selection-panel-grip`, `#selection-panel-bar`, `#sidebar-selected-unit`, `#selection-panel-hint`, `#ranged-attack-tip-host`, `#selection-panel-close`, `#selection-panel-details`, `#selection-panel-caption`, `#selection-panel-chips`, `#selection-panel-units`, `#selection-panel-action-note`, `#sidebar-error`)
- `static/selectionChrome.css`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/renderer/gameplay/selectionBar.ts`
- `src/shared/selectionBarText.ts`
````

- [ ] **Step 21: Edit `doc/ux/right-panel-command-bar.md`**

Ranged or Strike sits in the selection bar, in a tip host.

1. In `doc/ux/right-panel-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
- The Ranged control, in the selection panel's last row, shown whenever the selection panel is. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
- While the selection cannot use it, the control is greyed out. Its label is "Strike" when the selection has an air unit and "Ranged" otherwise, and a reason shows beside it: "Infantry can't fire on the world map." when a world-map selection includes infantry and no air unit, or "Strike needs a selection of air units only." when air units are selected with other types (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`).
````

Replace them with:

````markdown
- The Ranged control, in the selection panel's summary bar, shown whenever the selection panel is. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
- While the selection cannot use it, the control is greyed out. Its label is "Strike" when the selection has an air unit and "Ranged" otherwise. Its reason is its tip, and also shows in the selection panel's details under the unit rows: "Infantry can't fire on the world map." when a world-map selection includes infantry and no air unit, or "Strike needs a selection of air units only." when air units are selected with other types (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`).
````

2. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- Ranged or Strike greyed out: the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. The reason shows beside it when one of the two sentences applies.
````

Replace it with:

````markdown
- Ranged or Strike greyed out: the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. When one of the two sentences applies, it is the control's tip and shows in the selection panel's details.
````

3. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#console-footer`, `#ready-btn`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`, `#selection-panel-action-note`)
````

Replace it with:

````markdown
- `static/index.html` (`#console-footer`, `#ready-btn`, `#ranged-attack-tip-host`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`, `#selection-panel-action-note`)
````

- [ ] **Step 22: Edit `doc/ux/control-tooltips.md`**

The greyed-out reason is now the tip of Ranged or Strike.

1. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Air-strike Cancel: Stop aiming an air strike and show Strike again. Strikes already in the list stay there.
````

Replace it with:

````markdown
- Air-strike Cancel: Stop aiming an air strike and show Strike again. Strikes already in the list stay there.
- Ranged or Strike while it is greyed out: its reason, "Infantry can't fire on the world map." or "Strike needs a selection of air units only." (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`). The tip sits on a host around the control (`#ranged-attack-tip-host`), because a disabled control gets no pointer events.
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Ranged or Strike while it is greyed out. Its reason shows beside it.
````

Replace it with:

````markdown
- Ranged or Strike while it is greyed out and neither reason applies.
````

- [ ] **Step 23: Edit `doc/ui-style-guide.md`**

The palette rows of the two order colors name their new use, and the selection panel gets a live-app line.

1. In `doc/ui-style-guide.md`, find these lines. Together they occur exactly once:

````markdown
| Selection / slower / warning | `#a06020` | Range perimeter (ranged) |
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged |
````

Replace them with:

````markdown
| Selection / slower / warning | `#a06020` | Range perimeter (ranged), and the selection panel's border while Ranged is aimed (`--order-ranged`) |
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged. Also the selection panel's border while Strike is aimed (`--order-strike`) |
````

2. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
- **Style:** Same typography and color system as the rest of the UI. Use sections or headings to separate identity, status, and orders. Keep lists scannable (e.g., one line per unit in a stack).
````

Replace it with:

````markdown
- **Style:** Same typography and color system as the rest of the UI. Use sections or headings to separate identity, status, and orders. Keep lists scannable (e.g., one line per unit in a stack).
- **Live app:** The selection panel at the map's bottom-left, 440 px wide by default. A 50 px summary bar across its top holds the hex code and count, a hint for the next map gesture, Ranged or Strike, and the close control. The hex's caption and chips and one row per unit sit under it. While an attack is aimed, the panel's border takes that order's color. See [ux/selection-panel.md](ux/selection-panel.md).
````

- [ ] **Step 24: Edit `doc/how-to-play.md`**

Pointing at a greyed-out Ranged or Strike says why, and the selection panel's border takes the order's color while the player aims.

1. In `doc/how-to-play.md`, find this text. It occurs exactly once:

````markdown
When the selection cannot fire, the button is greyed out and the panel says why.
````

Replace it with:

````markdown
When the selection cannot fire, the button is greyed out, and pointing at it says why.
````

2. In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
- **Greyed button:** mixing air with other types greys out Strike, and the panel says why. On the strategic map, infantry with no air unit greys out Ranged, and the panel says why. Infantry can fire in a battle.
- **The outline:** a dashed outline, with no fill, around the combined reach of every selected unit. Its dashes drift slowly.
- **Colors:** amber for ranged fire, purple for air strikes.
````

Replace them with:

````markdown
- **Greyed button:** mixing air with other types greys out Strike. On the strategic map, infantry with no air unit greys out Ranged. Point at the greyed button to see why. Infantry can fire in a battle.
- **The outline:** a dashed outline, with no fill, around the combined reach of every selected unit. Its dashes drift slowly.
- **Colors:** amber for ranged fire, purple for air strikes. While you aim, the selection panel's border takes the same color.
````

## Verify

- [ ] **Step 25: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 26: Full tests**

Run the full tests. Expected: exit 0, test total **896**, failure total **0**.

- [ ] **Step 27: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/selectionBarText.ts src/shared/selectionBarText.test.ts src/shared/selectionPanelSize.ts src/shared/selectionPanelSize.test.ts src/main/rendererConsolidation.test.ts src/renderer/gameplay/selectionBar.ts src/renderer/gameplay/selectionPanel.ts src/renderer/gameplay/tacticalOrders.ts src/renderer/gameplay/selectionPanelResize.ts src/renderer/core/uiState.ts src/renderer/renderer.ts static/index.html static/shellChrome.css static/selectionChrome.css scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-console-checks.cjs scripts/ui-smoke/ui-smoke-scenario-checks.cjs doc/ux/selection-panel.md doc/ux/right-panel-command-bar.md doc/ux/control-tooltips.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/selectionBarText.ts` | `285a77409b41de80` |
| `src/shared/selectionBarText.test.ts` | `88204b86d609af08` |
| `src/shared/selectionPanelSize.ts` | `72bf42a9ff2ab164` |
| `src/shared/selectionPanelSize.test.ts` | `48c2143a24c67ba2` |
| `src/main/rendererConsolidation.test.ts` | `b19bcf124ee3bf33` |
| `src/renderer/gameplay/selectionBar.ts` | `22d8dd8db7246df7` |
| `src/renderer/gameplay/selectionPanel.ts` | `f28b9d4476735927` |
| `src/renderer/gameplay/tacticalOrders.ts` | `3854ebdb8226bfc3` |
| `src/renderer/gameplay/selectionPanelResize.ts` | `de9615bac730ec7a` |
| `src/renderer/core/uiState.ts` | `b26cf2db86a544d8` |
| `src/renderer/renderer.ts` | `71fd3fab64f33dcb` |
| `static/index.html` | `99a2db1c588fcf85` |
| `static/shellChrome.css` | `fbcf8782e6397773` |
| `static/selectionChrome.css` | `b069eb25c60983da` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `cf78b5232f552313` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `d1de913b5e596ca4` |
| `scripts/ui-smoke/ui-smoke-console-checks.cjs` | `dae21bc646b0cf6f` |
| `scripts/ui-smoke/ui-smoke-scenario-checks.cjs` | `b74cdc105d6ec4f2` |
| `doc/ux/selection-panel.md` | `50ffc95274ada70e` |
| `doc/ux/right-panel-command-bar.md` | `5ffb1270c845283d` |
| `doc/ux/control-tooltips.md` | `4395b43f0feaf2a4` |
| `doc/ui-style-guide.md` | `fdfd9f4c13d745b1` |
| `doc/how-to-play.md` | `0a4b206028d344c2` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 28: Smoke run**

```powershell
npm run ui:smoke -- --label selection-bar
```

Expected summary line:

```text
ui-smoke selection-bar: 425 passed, 0 failed, 0 page errors, 34 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\selection-bar
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/selection-bar/report.json`.

- [ ] **Step 29: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/selection-bar/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The selected units' names and hex codes can differ from run to run.

- `14-orders-queued.png` against [ui-facelift-revision-2-expected-one-unit.png](ui-facelift-revision-2-expected-one-unit.png): one unit selected. The bar across the top of the panel reads "(code) ·" and the unit's flag and name, with "Double-click a hex to move · right-click to deselect" under it, then a divider, Ranged, and ×. Under the bar: the hex caption, the chips, and the unit's row.
- `16-selection-stack.png` against [ui-facelift-revision-2-expected-stack.png](ui-facelift-revision-2-expected-stack.png): a stack selected. The first line reads "(code) · N selected of M". The control is greyed out, and its reason shows under the unit rows.
- `17-strike-aiming.png` against [ui-facelift-revision-2-expected-strike.png](ui-facelift-revision-2-expected-strike.png): a strike being aimed. The panel's border is purple, the hint reads "Double-click a target in range", and the target list and Cancel sit in the bar where Strike was.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 26.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 29.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. Select one of your units: the bar reads "(code) ·" and the unit's flag and name, and the hint reads "Double-click a hex to move · right-click to deselect". The details under the bar show the hex caption, the chips, and the unit's row.
2. Shift-click one of your units that stands alone in another hex: the first line ends with "· +1 elsewhere", and that unit's row shows its hex code.
3. Select only air units: the hint reads "Double-click a hex to ferry · right-click to deselect". Shift-click a land unit that stands alone in its hex: the hint reads "Air units can't move with other units", Strike is greyed out, and pointing at it shows "Strike needs a selection of air units only."
4. Select infantry on the world map: Ranged is greyed out, and pointing at it shows "Infantry can't fire on the world map."
5. Select air units only and click Strike: the border turns purple, the hint reads "Double-click a target in range", and the target list and Cancel sit in the bar. Cancel restores the border and the hint. Ranged, with a selection that can fire, turns the border amber.
6. Queue an order and press Ready: while the turn plays back, the hint reads "Playback is running · right-click to deselect", and it goes back when playback ends.
7. In a battle, select a sub-unit: the first line names the battle cell, such as "(E8.K3)".
8. Shrink the window to 800 × 600: the bar's two lines end in an ellipsis, and the controls keep their size.

## Next

Plan 3 makes the panel open compact, as the bar alone, with a control that expands it upward.
