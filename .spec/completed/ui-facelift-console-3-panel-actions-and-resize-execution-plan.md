# UI Facelift Console, Plan 3 of 5: Greyed Actions and Panel Resize

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** When Ranged or Strike does not apply to the selection, show it greyed out with a one-line reason instead of hiding it. Add a grip at the panel's top-right corner that resizes it, from 320 × 140 px up to 640 px wide and the map height minus 24 px tall.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 3 of the five that build the spec's Phase 3; [ui-facelift-console-execution-plan.md](ui-facelift-console-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`: which button shows, whether it is enabled, and the reason when it is not ("Infantry can't fire on the world map." or "Strike needs a selection of air units only."). Unit-tested.
- `src/shared/selectionPanelSize.ts`: the size limits and the clamp. Unit-tested.
- `src/renderer/gameplay/selectionPanelResize.ts`: the grip's drag, with pointer capture. The panel's bottom-left corner stays put. The size lasts until the app closes.
- Game over no longer switches Ranged on and off by itself, because that would re-enable a greyed button. At game over the overlay hides the selection panel, so Ranged cannot be clicked then.
- The panel's content scrolls when the panel is small. The smoke run drags the grip to both limits, and at the 800 × 600 minimum it drags the panel as large as it goes, which must still fit the map. In the battle, Ranged must be enabled for the selected unit, with no reason.

**Out of scope:**

- The Reports tab and the toast band (plan 4), and the Opponent tab (plan 5).

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves. On the result, the fast loop and the full tests passed, and the smoke run passed against the real app in Electron. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 3", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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

- The run builds the app and takes about four minutes. It opens the app window three times: it closes the app twice to change its throwaway copy of the match, then reopens it. Do not use the mouse or keyboard in those windows while it runs.
- It prints one `PASS` or `FAIL` line per check, then a summary line: `ui-smoke <label>: P passed, F failed, E page errors, N screenshots in <folder>`.
- The window can show a "map tiles failed to load" toast when the network is slow. That toast is not a failure.
- After a smoke run the SQLite module is built for Electron. `npm test` rebuilds it for Node by itself, and `npm start` works as usual.

## Before You Start

- [ ] **Read**

1. [ui-facelift-spec.md](ui-facelift-spec.md): Selection Panel (Resize and Actions).
2. `doc/ux/selection-panel.md` and `doc/ux/right-panel-command-bar.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then:

```powershell
Test-Path src/renderer/gameplay/selectionPanel.ts
Test-Path src/shared/selectionPanelSize.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **855**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/selectionSupportButtonMode.ts`
- `src/shared/selectionSupportButtonMode.test.ts`
- `src/shared/selectionPanelSize.ts`
- `src/shared/selectionPanelSize.test.ts`
- `src/renderer/gameplay/selectionPanelResize.ts`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `static/index.html`
- `static/selectionChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-map.cjs`
- `scripts/ui-smoke/ui-smoke-console-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/selection-panel.md`
- `doc/ux/right-panel-command-bar.md`
- `doc/ux/selection-model.md`
- `doc/ux/control-tooltips.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Replace `src/shared/selectionSupportButtonMode.ts`**

Adds `selectionSupportAction`: whether Ranged or Strike applies to the selection and, when it does not, the reason shown under the greyed button.

Replace the whole file `src/shared/selectionSupportButtonMode.ts` with exactly this content:

```ts
import { unitHasDirectRangedPlanning } from './rangePerimeterModel';

/**
 * Which support action the current selection may start.
 *
 * Purpose: One result for the button's label and the button click, so those two gates cannot drift.
 * When to use: Branch on the value returned by `selectionSupportButtonMode`. Do not re-derive air versus ranged at the call site.
 * Expected outcome: `hidden` starts nothing (the button is greyed out, see `selectionSupportAction`), `ranged` shows
 *   Ranged or Cancel, and `strike` shows Strike.
 * Exceptions: None.
 */
export type SelectionSupportButtonMode = 'hidden' | 'ranged' | 'strike';

/**
 * Chooses whether the shared support button offers Ranged, Strike, or nothing.
 *
 * Purpose: Mixed selections must hide Ranged when any selected unit cannot fire one, including air. All-air stays Strike.
 * When to use: Sidebar visibility and the `#ranged-attack-btn` click gate, on the strategic map and in a tactical battle.
 * Expected outcome: `hidden` for empty, mixed, strategic infantry, unknown types, or air combined with anything else. `strike` when every unit is air. `ranged` when every unit is non-air and has direct ranged planning in this theater.
 * Exceptions: None.
 */
export function selectionSupportButtonMode(
  unitTypes: readonly string[],
  tacticalBattleActive: boolean
): SelectionSupportButtonMode {
  if (unitTypes.length === 0) return 'hidden';
  if (unitTypes.every((unitType) => unitType === 'air')) return 'strike';
  const everyUnitCanRangedAttack = unitTypes.every(
    (unitType) => unitType !== 'air' && unitHasDirectRangedPlanning(unitType, tacticalBattleActive)
  );
  return everyUnitCanRangedAttack ? 'ranged' : 'hidden';
}

/**
 * The reason shown beside a greyed-out Ranged when a world-map selection includes infantry.
 *
 * Purpose: Strategic infantry is melee-only, so Ranged cannot start.
 * When to use: Returned by `selectionSupportAction`.
 * Expected outcome: Shown as written.
 * Exceptions: None.
 */
export const INFANTRY_CANNOT_FIRE_REASON = "Infantry can't fire on the world map.";

/**
 * The reason shown beside a greyed-out Strike when air units are selected with other types.
 *
 * Purpose: A strike needs every selected unit to be air.
 * When to use: Returned by `selectionSupportAction`.
 * Expected outcome: Shown as written.
 * Exceptions: None.
 */
export const STRIKE_NEEDS_AIR_ONLY_REASON = 'Strike needs a selection of air units only.';

/**
 * What the support button shows for a selection: its label, whether it can be clicked, and why not.
 *
 * Purpose: The button stays visible while units are selected, so a selection that cannot fire still needs a label
 *   and a reason.
 * When to use: Returned by `selectionSupportAction`.
 * Expected outcome: `reason` is null whenever `enabled` is true.
 * Exceptions: None.
 */
export interface SelectionSupportAction {
  /**
   * The button's label before aiming starts.
   *
   * Contract: Strike whenever the selection has an air unit, Ranged otherwise.
   * When to use: The button's text while not aiming.
   * Expected outcome: Matches what a click would start.
   * Exceptions: None.
   */
  readonly label: 'Ranged' | 'Strike';
  /**
   * Whether a click can start aiming.
   *
   * Contract: Same answer as `selectionSupportButtonMode` not returning `hidden`.
   * When to use: The button's disabled state.
   * Expected outcome: False greys the button out.
   * Exceptions: None.
   */
  readonly enabled: boolean;
  /**
   * One sentence saying why the button cannot be used, or null.
   *
   * Contract: Null when enabled, and null when no sentence fits, such as an empty selection.
   * When to use: Shown beside the button.
   * Expected outcome: One of the reason constants in this file.
   * Exceptions: None.
   */
  readonly reason: string | null;
}

/**
 * Decides the support button's label, whether it can be clicked, and the reason it cannot.
 *
 * Purpose: The selection panel shows Ranged or Strike for every selection and explains a greyed-out button.
 * When to use: Each time the selection or the theater changes, next to `selectionSupportButtonMode`.
 * Expected outcome: All air: Strike, enabled. All able to fire: Ranged, enabled. Air with other types: Strike,
 *   disabled, `STRIKE_NEEDS_AIR_ONLY_REASON`. World-map infantry without air: Ranged, disabled,
 *   `INFANTRY_CANNOT_FIRE_REASON`. Anything else: Ranged, disabled, no reason.
 * Exceptions: None.
 */
export function selectionSupportAction(unitTypes: readonly string[], tacticalBattleActive: boolean): SelectionSupportAction {
  const mode = selectionSupportButtonMode(unitTypes, tacticalBattleActive);
  if (mode === 'strike') return { label: 'Strike', enabled: true, reason: null };
  if (mode === 'ranged') return { label: 'Ranged', enabled: true, reason: null };
  if (unitTypes.includes('air')) return { label: 'Strike', enabled: false, reason: STRIKE_NEEDS_AIR_ONLY_REASON };
  if (!tacticalBattleActive && unitTypes.includes('infantry')) {
    return { label: 'Ranged', enabled: false, reason: INFANTRY_CANNOT_FIRE_REASON };
  }
  return { label: 'Ranged', enabled: false, reason: null };
}
```

- [ ] **Step 2: Edit `src/shared/selectionSupportButtonMode.test.ts`**

Covers each case of the new function.

1. In `src/shared/selectionSupportButtonMode.test.ts`, find this line. It occurs exactly once:

```ts
import { selectionSupportButtonMode } from './selectionSupportButtonMode';
```

Replace it with:

```ts
import {
  INFANTRY_CANNOT_FIRE_REASON,
  selectionSupportAction,
  selectionSupportButtonMode,
  STRIKE_NEEDS_AIR_ONLY_REASON,
} from './selectionSupportButtonMode';
```

2. In `src/shared/selectionSupportButtonMode.test.ts`, find these lines. Together they occur exactly once:

```ts
    assert.equal(selectionSupportButtonMode(['infantry', 'air'], true), 'hidden');
  });
});
```

Replace them with:

```ts
    assert.equal(selectionSupportButtonMode(['infantry', 'air'], true), 'hidden');
  });
});

describe('selectionSupportAction', () => {
  it('enables Ranged or Strike when the selection can use it', () => {
    assert.deepEqual(selectionSupportAction(['armor'], false), { label: 'Ranged', enabled: true, reason: null });
    assert.deepEqual(selectionSupportAction(['air', 'air'], false), { label: 'Strike', enabled: true, reason: null });
    assert.deepEqual(selectionSupportAction(['infantry'], true), { label: 'Ranged', enabled: true, reason: null });
  });

  it('greys out Ranged with a reason when a world-map selection includes infantry', () => {
    assert.deepEqual(selectionSupportAction(['armor', 'infantry'], false), {
      label: 'Ranged',
      enabled: false,
      reason: INFANTRY_CANNOT_FIRE_REASON,
    });
  });

  it('greys out Strike with a reason when air is mixed with other types', () => {
    assert.deepEqual(selectionSupportAction(['infantry', 'air'], false), {
      label: 'Strike',
      enabled: false,
      reason: STRIKE_NEEDS_AIR_ONLY_REASON,
    });
    assert.deepEqual(selectionSupportAction(['armor', 'air'], true), {
      label: 'Strike',
      enabled: false,
      reason: STRIKE_NEEDS_AIR_ONLY_REASON,
    });
  });

  it('greys out Ranged without a reason for an empty selection', () => {
    assert.deepEqual(selectionSupportAction([], false), { label: 'Ranged', enabled: false, reason: null });
  });
});
```

- [ ] **Step 3: Create `src/shared/selectionPanelSize.ts`**

The panel's size limits (320 to 640 px wide, 140 px to the map height minus 24 px tall) and the clamp.

Create `src/shared/selectionPanelSize.ts` with exactly this content:

```ts
/**
 * The narrowest the panel can be dragged, in CSS pixels. This module holds the selection panel's size limits and the
 * rule that keeps a dragged size inside them, so a reviewer can read and test them in one place.
 *
 * Purpose: Keeps the header, the chips, and an order chip readable.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 320.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MIN_WIDTH = 320;

/**
 * The widest the panel can be dragged, in CSS pixels.
 *
 * Purpose: Keeps the panel from covering most of the map.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 640.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MAX_WIDTH = 640;

/**
 * The shortest the panel can be dragged, in CSS pixels.
 *
 * Purpose: Keeps the header and at least one unit row visible.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 140.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MIN_HEIGHT = 140;

/**
 * How much shorter than the map the panel must stay, in CSS pixels.
 *
 * Purpose: The panel sits 12 px in from the map's edges at the top and the bottom.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 24.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MAP_MARGIN = 24;

/**
 * Keeps a dragged panel size inside its limits.
 *
 * Purpose: The grip can be dragged anywhere; the panel must stay usable and inside the map.
 * When to use: On every pointer move while the grip is dragged, with the map container's current height.
 * Expected outcome: Width from 320 to 640. Height from 140 to the map height minus 24; on a map too short for
 *   that range the height is 140.
 * Exceptions: None.
 */
export function clampSelectionPanelSize(
  size: { readonly width: number; readonly height: number },
  mapHeight: number
): { readonly width: number; readonly height: number } {
  const maxHeight = Math.max(SELECTION_PANEL_MIN_HEIGHT, mapHeight - SELECTION_PANEL_MAP_MARGIN);
  return {
    width: Math.min(SELECTION_PANEL_MAX_WIDTH, Math.max(SELECTION_PANEL_MIN_WIDTH, Math.round(size.width))),
    height: Math.min(maxHeight, Math.max(SELECTION_PANEL_MIN_HEIGHT, Math.round(size.height))),
  };
}
```

- [ ] **Step 4: Create `src/shared/selectionPanelSize.test.ts`**

Covers sizes inside, below, and above the limits.

Create `src/shared/selectionPanelSize.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampSelectionPanelSize } from './selectionPanelSize';

test('clampSelectionPanelSize keeps a size that is inside the limits', () => {
  assert.deepEqual(clampSelectionPanelSize({ width: 500, height: 300 }, 676), { width: 500, height: 300 });
});

test('clampSelectionPanelSize holds the width between 320 and 640 and the height inside the map', () => {
  assert.deepEqual(clampSelectionPanelSize({ width: 100, height: 50 }, 676), { width: 320, height: 140 });
  assert.deepEqual(clampSelectionPanelSize({ width: 900, height: 900 }, 676), { width: 640, height: 652 });
});

test('clampSelectionPanelSize uses the minimum height on a map too short for it', () => {
  assert.deepEqual(clampSelectionPanelSize({ width: 400, height: 300 }, 100), { width: 400, height: 140 });
});
```

- [ ] **Step 5: Create `src/renderer/gameplay/selectionPanelResize.ts`**

Drags the panel's corner grip to resize it, held inside the limits. The size lasts until the app closes.

Create `src/renderer/gameplay/selectionPanelResize.ts` with exactly this content:

```ts
/**
 * The selection panel's resize grip at its top-right corner.
 *
 * The panel is anchored at the map's bottom-left, so dragging the grip right widens it and dragging it up makes it taller.
 */
import { clampSelectionPanelSize } from '../../shared/selectionPanelSize';
import { MAP_CONTAINER_ID } from '../map/mapContainerResize';

/**
 * Where a drag started: the pointer and the panel's size at that moment.
 *
 * Purpose: Each pointer move is measured from the start, so rounding never drifts.
 * When to use: Set on pointer down, cleared on pointer up or cancel.
 * Expected outcome: Null while no drag is in progress.
 * Exceptions: None.
 */
let dragStart: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null = null;

/**
 * Applies a size to the panel for the rest of the session.
 *
 * Purpose: A dragged size replaces the panel's fit-to-rows height.
 * When to use: On each pointer move during a drag.
 * Expected outcome: Inline width and height on `#selection-panel`. The height may then grow to the map height minus
 *   24 px instead of half the map. The size stays while the panel hides and shows again, until the app closes.
 * Exceptions: None.
 */
function applyPanelSize(panel: HTMLElement, width: number, height: number): void {
  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
  panel.style.maxHeight = 'calc(100% - 24px)';
}

/**
 * Wires the grip: pointer down starts a drag, pointer moves resize the panel, and pointer up ends the drag.
 *
 * Purpose: Lets the player make the panel wider for long captions or taller for many units.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: Width stays from 320 to 640 px and height from 140 px to the map height minus 24 px
 *   (`clampSelectionPanelSize`). The size is not saved.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function wireSelectionPanelResize(): void {
  const panel = document.getElementById('selection-panel');
  const grip = document.getElementById('selection-panel-grip');
  if (!panel || !grip) return;
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const box = panel.getBoundingClientRect();
    dragStart = { x: event.clientX, y: event.clientY, width: box.width, height: box.height };
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    const mapHeight = document.getElementById(MAP_CONTAINER_ID)?.clientHeight ?? 0;
    const size = clampSelectionPanelSize(
      { width: dragStart.width + (event.clientX - dragStart.x), height: dragStart.height - (event.clientY - dragStart.y) },
      mapHeight
    );
    applyPanelSize(panel, size.width, size.height);
  });
  const endDrag = (event: PointerEvent): void => {
    if (!dragStart) return;
    dragStart = null;
    if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
}
```

- [ ] **Step 6: Edit `src/renderer/gameplay/selectionPanel.ts`**

Wires the grip.

1. In `src/renderer/gameplay/selectionPanel.ts`, find this line. It occurs exactly once:

```ts
import { onQueuedOrdersChanged, queuedOrderForUnit } from './queuedOrderRows';
```

Replace it with:

```ts
import { onQueuedOrdersChanged, queuedOrderForUnit } from './queuedOrderRows';
import { wireSelectionPanelResize } from './selectionPanelResize';
```

2. In `src/renderer/gameplay/selectionPanel.ts`, find these lines. Together they occur exactly once:

```ts
 * Keeps the panel's order chips in step with the Orders tab.
 *
 * Purpose: A queued or cancelled order changes the panel without a selection change.
 * When to use: Once during renderer startup.
 * Expected outcome: The panel redraws after every change to the queued orders.
```

Replace them with:

```ts
 * Keeps the panel's order chips in step with the Orders tab, and wires its resize grip.
 *
 * Purpose: A queued or cancelled order changes the panel without a selection change.
 * When to use: Once during renderer startup.
 * Expected outcome: The panel redraws after every change to the queued orders, and its grip resizes it.
```

3. In `src/renderer/gameplay/selectionPanel.ts`, find this line. It occurs exactly once:

```ts
  onQueuedOrdersChanged(() => renderSelectionPanel(deps));
```

Replace it with:

```ts
  onQueuedOrdersChanged(() => renderSelectionPanel(deps));
  wireSelectionPanelResize();
```

- [ ] **Step 7: Edit `src/renderer/gameplay/tacticalOrders.ts`**

When neither action applies, the button stays visible but disabled, with its reason under it.

1. In `src/renderer/gameplay/tacticalOrders.ts`, find this line. It occurs exactly once:

```ts
import { selectionSupportButtonMode } from '../../shared/selectionSupportButtonMode';
```

Replace it with:

```ts
import { selectionSupportAction, selectionSupportButtonMode } from '../../shared/selectionSupportButtonMode';
```

2. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
 * Rebuilds the pending ranged and air-strike rows and chooses Ranged, Strike, or neither for the current selection.
 *
 * Purpose: The shared button follows `selectionSupportButtonMode`. Clearing a targeting flag here must also drop a hover preview that sampled the old flag.
 * When to use: After a selection change, a pending-order change, or a targeting-mode toggle.
 * Expected outcome: Pending rows match the draft arrays. The button is hidden unless every resolved unit can range, or every resolved unit is air. `Cancel` stays while ranged mode is still valid. A true-to-false flag change nulls the hover preview, hides the block and slower tooltips, redraws, and starts one hover refresh.
```

Replace them with:

```ts
 * Rebuilds the pending ranged and air-strike rows and sets Ranged or Strike for the current selection.
 *
 * Purpose: The shared button follows `selectionSupportButtonMode`, and `selectionSupportAction` labels and explains it
 *   when it cannot be used. Clearing a targeting flag here must also drop a hover preview that sampled the old flag.
 * When to use: After a selection change, a pending-order change, or a targeting-mode toggle.
 * Expected outcome: Pending rows match the draft arrays. The button shows while units are selected. It is enabled
 *   when every resolved unit can range, or every resolved unit is air; otherwise it is greyed out with its reason in
 *   `#selection-panel-action-note`. `Cancel` stays while ranged mode is still valid. A true-to-false flag change nulls
 *   the hover preview, hides the block and slower tooltips, redraws, and starts one hover refresh.
```

3. In `src/renderer/gameplay/tacticalOrders.ts`, find this line. It occurs exactly once:

```ts
  const strikeCancelEl = document.getElementById('air-strike-cancel-btn') as HTMLButtonElement | null;
```

Replace it with:

```ts
  const strikeCancelEl = document.getElementById('air-strike-cancel-btn') as HTMLButtonElement | null;
  const actionNoteEl = document.getElementById('selection-panel-action-note');
```

4. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
    const mode = selectionSupportButtonMode(
      selectedUnits.map((unit) => unit.unitType),
      !!tb
    );
```

Replace them with:

```ts
    const unitTypes = selectedUnits.map((unit) => unit.unitType);
    const mode = selectionSupportButtonMode(unitTypes, !!tb);
    const action = selectionSupportAction(unitTypes, !!tb);
    btnEl.disabled = !action.enabled;
    if (actionNoteEl) actionNoteEl.textContent = action.reason ?? '';
```

5. In `src/renderer/gameplay/tacticalOrders.ts`, find this line. It occurs exactly once:

```ts
      btnEl.style.display = 'none';
```

Replace it with:

```ts
      // Greyed out with its reason: the button stays visible so the player can see why it cannot be used.
      btnEl.style.display = '';
      btnEl.textContent = action.label;
      btnEl.removeAttribute('data-control-tooltip');
```

- [ ] **Step 8: Edit `src/renderer/core/uiState.ts`**

Game over no longer toggles Ranged by itself, because that would re-enable a greyed button.

1. In `src/renderer/core/uiState.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  const rangedBtn = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;
```

2. In `src/renderer/core/uiState.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
    if (rangedBtn) rangedBtn.disabled = false;
```

3. In `src/renderer/core/uiState.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  if (rangedBtn) rangedBtn.disabled = true;
```

- [ ] **Step 9: Edit `src/renderer/chrome/frameTooltipText.ts`**

Adds the grip's tip.

In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
export const selectionPanelCloseTooltipText = 'Clear the selection. Queued orders stay.';
```

Replace it with:

```ts
export const selectionPanelCloseTooltipText = 'Clear the selection. Queued orders stay.';

/**
 * The selection panel grip's tip.
 *
 * Purpose: Says how the selection panel's grip resizes it, and that the size is not saved.
 * When to use: `#selection-panel-grip`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const selectionPanelGripTooltipText = 'Drag to resize this panel. The size lasts until the app closes.';
```

- [ ] **Step 10: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 11: Edit `static/index.html`**

Adds the grip and the reason line, and wraps the panel's content so it scrolls when small.

In `static/index.html`, find these lines. Together they occur exactly once:

```html
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
        <select id="air-strike-target-type" class="ranged-btn" style="display: none;" data-control-tooltip="Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you cancel.">
          <option value="units">Enemy Units</option>
          <option value="urban">Production</option>
          <option value="airport">Airports</option>
          <option value="seaport">Seaports</option>
        </select>
        <button type="button" id="air-strike-cancel-btn" class="ranged-btn" style="display: none;" data-control-tooltip="Stop aiming an air strike and show Strike again. Strikes already in the list stay there.">Cancel</button>
```

Replace them with:

```html
      <div id="selection-panel-grip" class="selection-panel-grip" aria-hidden="true" data-control-tooltip="Drag to resize this panel. The size lasts until the app closes."></div>
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
          <select id="air-strike-target-type" class="ranged-btn" style="display: none;" data-control-tooltip="Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you cancel.">
            <option value="units">Enemy Units</option>
            <option value="urban">Production</option>
            <option value="airport">Airports</option>
            <option value="seaport">Seaports</option>
          </select>
          <button type="button" id="air-strike-cancel-btn" class="ranged-btn" style="display: none;" data-control-tooltip="Stop aiming an air strike and show Strike again. Strikes already in the list stay there.">Cancel</button>
          <span id="selection-panel-action-note" class="selection-panel-action-note"></span>
        </div>
```

- [ ] **Step 12: Edit `static/selectionChrome.css`**

Styles for the grip, the reason line, and the scrolling body.

1. In `static/selectionChrome.css`, find this line. It occurs exactly once:

```css
/* The selection panel at the map's bottom-left: header, chips, count, unit rows, and the Ranged and Strike row. */
```

Replace it with:

```css
/* The selection panel at the map's bottom-left: header, chips, count, unit rows, the Ranged and Strike row, and the resize grip. */
```

2. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
  gap: 8px;
  box-sizing: border-box;
  padding: 10px 12px 12px;
```

Replace them with:

```css
  box-sizing: border-box;
  overflow: hidden;
```

3. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
#canvas-container:has(#game-over-overlay:not(.hidden)) #selection-panel {
  display: none;
}
```

Replace them with:

```css
#canvas-container:has(#game-over-overlay:not(.hidden)) #selection-panel {
  display: none;
}
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
```

4. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
/* The rows take the height that is left and scroll past it. */
.selection-panel-units {
  flex: 1 1 auto;
  min-height: 0;
```

Replace them with:

```css
/* The rows take the height that is left and scroll past it, keeping room for one row. */
.selection-panel-units {
  flex: 1 1 auto;
  min-height: 35px;
```

5. In `static/selectionChrome.css`, find this line. It occurs exactly once:

```css
/* Ranged, the strike target list, and its Cancel share one row. The row takes no space while all three are hidden. */
```

Replace it with:

```css
/* Ranged or Strike, the strike target list, its Cancel, and the reason a greyed-out button cannot be used share one row. */
```

6. In `static/selectionChrome.css`, find this line. It occurs exactly once:

```css
.selection-panel-actions:not(:has(> :not([style*="display: none"]))) {
```

Replace it with:

```css
.selection-panel-action-note {
  flex: 1 1 160px;
  min-width: 0;
  color: var(--chrome-muted);
  font-size: 12px;
}
.selection-panel-action-note:empty {
```

7. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
.selection-panel #sidebar-error {
  margin: 0;
}
```

Replace them with:

```css
.selection-panel #sidebar-error {
  margin: 0;
}

/* ---------- Resize grip ---------- */
/* The panel is anchored at its bottom-left, so the grip sits at the opposite, top-right corner. */
.selection-panel-grip {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 0;
  width: 14px;
  height: 14px;
  cursor: nesw-resize;
  touch-action: none;
  background: linear-gradient(225deg, transparent 0 3px, var(--chrome-border) 3px 4px, transparent 4px 6px, var(--chrome-border) 6px 7px, transparent 7px);
  border-top-right-radius: 6px;
}
```

- [ ] **Step 13: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the two resize scenes.

In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  strikeAiming: 'strike-aiming',
```

Replace it with:

```js
  strikeAiming: 'strike-aiming',
  selectionResized: 'selection-resized',
  selectionResizedMin: 'selection-resized-min',
```

- [ ] **Step 14: Edit `scripts/ui-smoke/ui-smoke-map.cjs`**

Adds a helper that drags the grip.

1. In `scripts/ui-smoke/ui-smoke-map.cjs`, find these lines. Together they occur exactly once:

```js
}

module.exports = {
```

Replace them with:

```js
}

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
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(MAP_WAIT_MS.settle);
}

module.exports = {
```

2. In `scripts/ui-smoke/ui-smoke-map.cjs`, find this line. It occurs exactly once:

```js
  selectLoneBattleUnit,
```

Replace it with:

```js
  selectLoneBattleUnit,
  dragSelectionPanelGrip,
```

- [ ] **Step 15: Edit `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

Adds the greyed-button check and the two dragged-size checks, and requires an enabled Ranged with no reason for armor.

1. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Default width of the selection panel in CSS pixels.
```

Replace them with:

```js
/**
 * The selection panel's size limits while its grip is dragged, in CSS pixels.
 *
 * Purpose: Dragged sizes stop at these limits.
 * When to use: The dragged-size geometry checks.
 * Expected outcome: Matches `src/shared/selectionPanelSize.ts`.
 * Exceptions: None.
 */
const SELECTION_PANEL_LIMITS = Object.freeze({ minWidth: 320, maxWidth: 640, minHeight: 140, mapMargin: 24 });

/**
 * Default width of the selection panel in CSS pixels.
```

2. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
const MAP_OVERLAY_INSET = 12;
```

Replace it with:

```js
const MAP_OVERLAY_INSET = 12;

/**
 * Checks that the selection panel is anchored at the map's bottom-left at the given size.
 *
 * Purpose: The default size and both dragged sizes share one geometry rule.
 * When to use: From the selection panel geometry rows below.
 * Expected outcome: Null when the panel is shown, 12 px in from the map's left and bottom edges, and the given size
 *   (within one pixel); otherwise a failure message.
 * Exceptions: None.
 */
function selectionPanelPlacement(c, s, width, height) {
  if (!s.shown) return 'the selection panel is not shown';
  const anchored = near(s.x, c.x + MAP_OVERLAY_INSET) && near(s.y + s.h, c.y + c.h - MAP_OVERLAY_INSET);
  const sized = near(s.w, width) && (height === null || near(s.h, height));
  const expected = `${width}${height === null ? '' : `x${height}`}`;
  return anchored && sized ? null : `the selection panel is at ${fmt(s)}, expected ${expected} at the map's bottom-left, ${MAP_OVERLAY_INSET} px in`;
}
```

3. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      if (!s.shown) return 'the selection panel is not shown';
      const placed = near(s.x, c.x + MAP_OVERLAY_INSET) && near(s.y + s.h, c.y + c.h - MAP_OVERLAY_INSET) && near(s.w, SELECTION_PANEL_WIDTH);
      if (!placed) return `the selection panel is at ${fmt(s)}, expected ${SELECTION_PANEL_WIDTH} wide at the map's bottom-left, ${MAP_OVERLAY_INSET} px in`;
      return s.h <= c.h / 2 + 1 ? null : `the selection panel is ${Math.round(s.h)} tall, more than half the map's ${Math.round(c.h)}`;
    },
```

Replace them with:

```js
      const placement = selectionPanelPlacement(c, s, SELECTION_PANEL_WIDTH, null);
      if (placement) return placement;
      return s.h <= c.h / 2 + 1 ? null : `the selection panel is ${Math.round(s.h)} tall, more than half the map's ${Math.round(c.h)}`;
    },
  },
  {
    name: 'selection-panel-dragged-large',
    scenes: [SCENES.selectionResized],
    needs: ['#canvas-container', '#selection-panel'],
    run: (p, el) => {
      const c = el('#canvas-container');
      return selectionPanelPlacement(c, el('#selection-panel'), SELECTION_PANEL_LIMITS.maxWidth, c.h - SELECTION_PANEL_LIMITS.mapMargin);
    },
  },
  {
    name: 'selection-panel-dragged-small',
    scenes: [SCENES.selectionResizedMin],
    needs: ['#canvas-container', '#selection-panel'],
    run: (p, el) => selectionPanelPlacement(el('#canvas-container'), el('#selection-panel'), SELECTION_PANEL_LIMITS.minWidth, SELECTION_PANEL_LIMITS.minHeight),
```

4. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      '#ranged-attack-btn',
    ],
```

Replace them with:

```js
      '#ranged-attack-btn',
      '#selection-panel-action-note',
    ],
```

5. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      return ranged.shown && ranged.text === 'Ranged' && ranged.ancestorIds.includes('selection-panel')
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}, expected it shown in the selection panel`;
```

Replace them with:

```js
      if (el('#selection-panel-action-note').shown) return `a reason shows for an armor unit: "${el('#selection-panel-action-note').text}"`;
      return ranged.shown && !ranged.disabled && ranged.text === 'Ranged' && ranged.ancestorIds.includes('selection-panel')
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? ' and is disabled' : ''}, expected it enabled in the selection panel`;
```

6. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
      return none === 'No orders' ? null : `a unit without orders reads "${none}"`;
```

Replace it with:

```js
      return none === 'No orders' ? null : `a unit without orders reads "${none}"`;
    },
  },
  {
    name: 'support-button-greyed',
    scenes: [SCENES.selectionStack],
    needs: ['#ranged-attack-btn', '#selection-panel-action-note'],
    run: (p, el) => {
      const ranged = el('#ranged-attack-btn');
      if (!(ranged.shown && ranged.disabled && ranged.text === 'Ranged')) {
        return `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? '' : ' and is enabled'}, expected it greyed out`;
      }
      const note = el('#selection-panel-action-note').text;
      return note === "Infantry can't fire on the world map." ? null : `the reason reads "${note}"`;
```

- [ ] **Step 16: Edit `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`**

Adds a check that Ranged is enabled, with no reason, for a battle unit.

In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find these lines. Together they occur exactly once:

```js
    },
  },
]);

module.exports = { SCENARIO_CHECKS };
```

Replace them with:

```js
    },
  },
  {
    name: 'support-button-battle',
    scenes: [SCENES.battleSelection],
    needs: ['#ranged-attack-btn', '#selection-panel-action-note'],
    run: (p, el) => {
      const ranged = el('#ranged-attack-btn');
      if (el('#selection-panel-action-note').shown) return `a reason shows in a battle: "${el('#selection-panel-action-note').text}"`;
      return ranged.shown && !ranged.disabled && ranged.text === 'Ranged'
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? ' and is disabled' : ''}, expected it enabled`;
    },
  },
]);

module.exports = { SCENARIO_CHECKS };
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Drags the grip to both limits after the Strike scene. In the small-window scene, drags the panel as large as it goes, which must still fit the map.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  contestedHexEdit,
```

Replace it with:

```js
  contestedHexEdit,
  dragSelectionPanelGrip,
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Runs the first session: a new match, the frame scenes, the console scenes, and the small window.
```

Replace them with:

```js
/**
 * Drags the selection panel's grip to the window's top-right corner.
 *
 * Purpose: The largest size a player can drag to must still fit inside the map.
 * When to use: While the selection panel is shown.
 * Expected outcome: The panel is as large as its limits and the map allow.
 * Exceptions: Throws when the grip is not on screen.
 */
async function dragSelectionPanelToCorner(page, size) {
  const box = await page.locator('#selection-panel-grip').boundingBox();
  if (!box) throw new Error('the selection panel grip is not on screen');
  await dragSelectionPanelGrip(page, size.w - 8 - (box.x + box.width / 2), 8 - (box.y + box.height / 2));
}

/**
 * Runs the first session: a new match, the frame scenes, the console scenes, and the small window.
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  // At the minimum window size, select the stack; the selection panel must stay on the map.
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await selectHumanStack(page);
```

Replace them with:

```js
  // Drag the grip far up and right, then far down and left: both ends stop at the panel's size limits.
  await dragSelectionPanelGrip(page, 800, -500);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.selectionResized);
  await dragSelectionPanelGrip(page, -600, 600);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.selectionResizedMin);

  // At the minimum window size, select the stack and drag the panel as large as it goes; it must stay on the map.
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await selectHumanStack(page);
  await dragSelectionPanelToCorner(page, SMALL_WINDOW);
```

- [ ] **Step 18: Edit `doc/ux/selection-panel.md`**

Describes the grip, the limits, and the greyed actions.

1. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
- The Ranged and Strike controls. See [right-panel-command-bar.md](right-panel-command-bar.md).
- The panel is 400 px wide, 12 px in from the map's left and bottom edges. Its height fits its rows, up to half the map's height; past that the unit rows scroll. Where it overlaps the terrain legend or the map scale, it draws above them.
- A control tip for the close control is in [control-tooltips.md](control-tooltips.md).
````

Replace them with:

````markdown
- The Ranged and Strike controls, and the reason a greyed-out control cannot be used. See [right-panel-command-bar.md](right-panel-command-bar.md).
- A resize grip at the top-right corner.
- The panel opens 400 px wide, 12 px in from the map's left and bottom edges. Its height fits its rows, up to half the map's height; past that the unit rows scroll. When the panel is shorter than its header, chips, and one row, its whole content scrolls. Where it overlaps the terrain legend or the map scale, it draws above them.
- Control tips for the close control and the grip are in [control-tooltips.md](control-tooltips.md).
````

2. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks an order's cancel control, that order is cancelled exactly as its Orders tab row's cancel control does.
````

Replace it with:

````markdown
- When the player clicks an order's cancel control, that order is cancelled exactly as its Orders tab row's cancel control does.
- When the player drags the grip, the panel resizes. Its bottom-left corner stays put. The width stays from 320 to 640 px and the height from 140 px to the map's height minus 24 px (`clampSelectionPanelSize` in `src/shared/selectionPanelSize.ts`). A dragged height replaces the half-the-map limit.
````

3. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- The panel follows every selection change, every snapshot, and every change to the queued orders.
````

Replace it with:

````markdown
- The panel follows every selection change, every snapshot, and every change to the queued orders.
- A dragged size lasts until the app closes, including while the panel is hidden. It is not saved.
````

4. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- Several hexes: rows for units in other hexes show their hex code.
````

Replace it with:

````markdown
- Several hexes: rows for units in other hexes show their hex code.
- Resized: the panel keeps the size the player dragged it to.
````

5. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#selection-panel`, `#sidebar-selected-unit`, `#selection-panel-close`, `#selection-panel-chips`, `#selection-panel-count`, `#selection-panel-units`, `#sidebar-error`)
- `static/selectionChrome.css`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/shared/selectionPanelSummary.ts`
````

Replace them with:

````markdown
- `static/index.html` (`#selection-panel`, `#selection-panel-grip`, `#sidebar-selected-unit`, `#selection-panel-close`, `#selection-panel-chips`, `#selection-panel-count`, `#selection-panel-units`, `#sidebar-error`, `#selection-panel-action-note`)
- `static/selectionChrome.css`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/renderer/gameplay/selectionPanelResize.ts`
- `src/shared/selectionPanelSummary.ts`
- `src/shared/selectionPanelSize.ts`
````

- [ ] **Step 19: Edit `doc/ux/right-panel-command-bar.md`**

Ranged and Strike grey out with a reason instead of hiding.

1. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- The Ranged control, in the selection panel's last row. The row takes no space while Ranged, the target list, and Cancel are all hidden. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
````

Replace it with:

````markdown
- The Ranged control, in the selection panel's last row, shown whenever the selection panel is. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
- While the selection cannot use it, the control is greyed out. Its label is "Strike" when the selection has an air unit and "Ranged" otherwise, and a reason shows beside it: "Infantry can't fire on the world map." when a world-map selection includes infantry, or "Strike needs a selection of air units only." when air units are selected with other types (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`).
````

2. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- The Ranged control hides when the selection is empty, mixed, or not entirely capable. See [selection-model.md](selection-model.md).
````

Replace it with:

````markdown
- Ranged or Strike greys out when the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. It is not on screen while nothing is selected, because the selection panel is hidden. See [selection-model.md](selection-model.md).
````

3. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- Ranged hidden: the selection is empty, mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater.
````

Replace it with:

````markdown
- Ranged or Strike greyed out: the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. The reason shows beside it when one of the two sentences applies.
````

4. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- Strategic infantry never shows Ranged. Tactical infantry can.
````

Replace it with:

````markdown
- A world-map selection with infantry never enables Ranged. Tactical infantry can fire.
- A greyed-out control never starts targeting.
````

5. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#console-footer`, `#ready-btn`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`)
````

Replace it with:

````markdown
- `static/index.html` (`#console-footer`, `#ready-btn`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`, `#selection-panel-action-note`)
- `src/shared/selectionSupportButtonMode.ts`
- `src/renderer/gameplay/tacticalOrders.ts` (`updateRangedSidebar`)
````

- [ ] **Step 20: Edit `doc/ux/selection-model.md`**

The same, from the selection's side.

In `doc/ux/selection-model.md`, find this line. It occurs exactly once:

````markdown
- The support control is hidden when the selection is empty, when the selection mixes air with other types, or when any selected unit cannot make a direct ranged attack in the current theater.
````

Replace it with:

````markdown
- The support control is greyed out, with its reason, when the selection mixes air with other types, or when any selected unit cannot make a direct ranged attack in the current theater. It is not on screen while the selection is empty, because the selection panel is hidden. See [right-panel-command-bar.md](right-panel-command-bar.md).
````

- [ ] **Step 21: Edit `doc/ux/control-tooltips.md`**

Adds the grip's tip, and notes that a greyed Ranged or Strike shows its reason beside it.

1. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Selection panel close: Clear the selection. Queued orders stay.
````

Replace it with:

````markdown
- Selection panel close: Clear the selection. Queued orders stay.
- Selection panel grip: Drag to resize this panel. The size lasts until the app closes.
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- The cancel control on an order in the selection panel.
````

Replace it with:

````markdown
- The cancel control on an order in the selection panel.
- Ranged or Strike while it is greyed out. Its reason shows beside it.
````

- [ ] **Step 22: Edit `doc/how-to-play.md`**

Mentions the reason line and the grip.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
5. **Ranged attack (armor or naval on strategic; broader types on tactical):** With capable units selected, click **Ranged** in the selection panel, then double-click an enemy hex within range. An all-air selection shows **Strike** instead. Attacks are submitted with Ready. See [Aiming ranged attacks and air strikes](#aiming-ranged-attacks-and-air-strikes).
````

Replace it with:

````markdown
5. **Ranged attack (armor or naval on strategic; broader types on tactical):** With capable units selected, click **Ranged** in the selection panel, then double-click an enemy hex within range. An all-air selection shows **Strike** instead. When the selection cannot fire, the button is greyed out and the panel says why. Attacks are submitted with Ready. See [Aiming ranged attacks and air strikes](#aiming-ranged-attacks-and-air-strikes).
````

## Verify

- [ ] **Step 23: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 24: Full tests**

Run the full tests. Expected: exit 0, test total **862**, failure total **0**.

- [ ] **Step 25: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/selectionSupportButtonMode.ts src/shared/selectionSupportButtonMode.test.ts src/shared/selectionPanelSize.ts src/shared/selectionPanelSize.test.ts src/renderer/gameplay/selectionPanelResize.ts src/renderer/gameplay/selectionPanel.ts src/renderer/gameplay/tacticalOrders.ts src/renderer/core/uiState.ts src/renderer/chrome/frameTooltipText.ts static/index.html static/selectionChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-map.cjs scripts/ui-smoke/ui-smoke-console-checks.cjs scripts/ui-smoke/ui-smoke-scenario-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/selection-panel.md doc/ux/right-panel-command-bar.md doc/ux/selection-model.md doc/ux/control-tooltips.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/selectionSupportButtonMode.ts` | `aef5f757daca9699` |
| `src/shared/selectionSupportButtonMode.test.ts` | `70c755d1900cffc9` |
| `src/shared/selectionPanelSize.ts` | `d20aa1670b8d45f2` |
| `src/shared/selectionPanelSize.test.ts` | `ef38537ad22ecf78` |
| `src/renderer/gameplay/selectionPanelResize.ts` | `788a57047cffc3c9` |
| `src/renderer/gameplay/selectionPanel.ts` | `f39af005b800acc5` |
| `src/renderer/gameplay/tacticalOrders.ts` | `1a5f7c89937c017e` |
| `src/renderer/core/uiState.ts` | `7020a6a511249716` |
| `src/renderer/chrome/frameTooltipText.ts` | `3ae0061fd5a9e2d1` |
| `static/index.html` | `e175ad290ff97ca7` |
| `static/selectionChrome.css` | `9a17e4128420d68e` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `4fda7d30b76ed081` |
| `scripts/ui-smoke/ui-smoke-map.cjs` | `5e9a26a740ca0943` |
| `scripts/ui-smoke/ui-smoke-console-checks.cjs` | `25f0ebfe298a53f5` |
| `scripts/ui-smoke/ui-smoke-scenario-checks.cjs` | `7fee54b8da89ef40` |
| `scripts/ui-smoke/ui-smoke.cjs` | `681b7a605a22a151` |
| `doc/ux/selection-panel.md` | `842e451f5554a3fa` |
| `doc/ux/right-panel-command-bar.md` | `592db7805b8ce382` |
| `doc/ux/selection-model.md` | `5df018c44f36d275` |
| `doc/ux/control-tooltips.md` | `3a760b542c50f275` |
| `doc/how-to-play.md` | `f162490148e8b72f` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.


- [ ] **Step 26: Smoke run**

```powershell
npm run ui:smoke -- --label panel-actions
```

Expected summary line:

```text
ui-smoke panel-actions: 255 passed, 0 failed, 0 page errors, 26 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\panel-actions
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/panel-actions/report.json`.

- [ ] **Step 27: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/panel-actions/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The battle's units are placed when it opens, so the battle screenshots can differ in where the units stand, which unit the run selects, and the codes. The new-game overlay draws its region, sides, and month at random.

- `14-selection-stack.png` against [ui-facelift-console-3-expected-greyed.png](ui-facelift-console-3-expected-greyed.png): The infantry and armor stack: at the bottom of the panel, Ranged is greyed out, with "Infantry can't fire on the world map." beside it.
- `16-selection-resized.png` against [ui-facelift-console-3-expected-resized-large.png](ui-facelift-console-3-expected-resized-large.png): After dragging the grip up and to the right: the panel is 640 px wide and runs from 12 px below the map's top to 12 px above its bottom. The 1st Squadron row is at the top and Strike is at the bottom.
- `17-selection-resized-min.png` against [ui-facelift-console-3-expected-resized-small.png](ui-facelift-console-3-expected-resized-small.png): After dragging down and to the left: the panel is at its smallest, 320 × 140 px, and its content scrolls, with a scroll bar at the right.
- `18-small-window.png` against [ui-facelift-console-3-expected-small-window.png](ui-facelift-console-3-expected-small-window.png): At the 800 × 600 minimum, after dragging the grip as far up and right as it goes: the panel fills the map, 12 px inside each of its edges, and stays clear of the console. It lists the stack, with the greyed Ranged and its reason at the bottom.
- `21-battle-selection.png` against [ui-facelift-console-3-expected-battle.png](ui-facelift-console-3-expected-battle.png): Inside the battle, with one infantry unit selected: Ranged is enabled at the bottom of the panel, with no reason beside it, because infantry can fire in a battle.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 24.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 27.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. On the world map, select a stack that includes infantry: Ranged is greyed out, with its reason beside it. Point at it: no tip shows, because the reason already says why.
2. Select air and armor together: Strike is greyed out with "Strike needs a selection of air units only."
3. Drag the grip: the panel resizes, its bottom-left corner stays put, and it stops at its limits. Make the window smaller: the panel never runs past the map.
4. Restart the app: the panel is back to its default size.
5. If your match has a tactical entry marker, enter the battle and select infantry: Ranged is enabled there.
6. Point at the grip for one second: its tip reads "Drag to resize this panel. The size lasts until the app closes."

## Next

Plan 4 adds the Reports tab and moves the map toasts to the top centre of the map.
