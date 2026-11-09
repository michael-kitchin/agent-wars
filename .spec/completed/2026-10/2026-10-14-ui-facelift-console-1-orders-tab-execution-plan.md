# UI Facelift Console, Plan 1 of 5: Orders Tab Groups and Rows

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Restyle the Orders tab into three groups (Movement, Ranged attacks, Air strikes), each with a count, and rows that show the unit's name over the target's hex code and distance. Clicking a row selects its unit. The console header gains a subtitle, and the Orders rail tab a count.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 1 of the five that build the spec's Phase 3; [ui-facelift-console-execution-plan.md](ui-facelift-console-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- Pure, unit-tested formatting in `src/shared/orderRowDetail.ts` and `src/shared/orderTargetHexCode.ts`. A row's second line reads like "→ E5 · 1h". An air strike adds its target type ("→ GK · 2h · Airports") and a ferry adds "Ferry". Inside a battle the code names the battle's hex and the cell, like "E8.K3".
- One row builder for all three groups, in `src/renderer/gameplay/sidebarOrderRow.ts`. A row is one button (the name and the second line) plus the cancel ×. Clicking the row selects its unit and Shift-click toggles it, so the old ⊕ button goes away. Rows of selected units are highlighted.
- A small registry, `src/renderer/gameplay/queuedOrderRows.ts`. The header subtitle ("N queued for turn T", or "for beat B") and the rail badge read the count from it. The selection panel in plan 2 reads each unit's order from it.
- The smoke harness gains a file of console checks, map helpers that click units the way a player does, and an "orders-queued" scene. It also gains scenes that the later plans extend: the 800 × 600 minimum window; the match reopened after the app restarts; a battle, with a march queued inside it; a new regional match; and a finished match reopened on its game-over screen. To reach them, the run starts the app three times on the same throwaway user-data folder, and between starts it changes only that folder's saved match (`scripts/ui-smoke/ui-smoke-session.cjs` and `scripts/ui-smoke/ui-smoke-db-edit.cjs`). Their checks are in the new `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`.
- `doc/` describes the groups, the rows, and the smoke run's sessions.

**Out of scope:**

- The "Selected unit" line and the Ranged/Strike controls stay on the Orders tab. Plan 2 moves them into the selection panel.
- The Reports tab (plan 4) and the Opponent tab (plan 5).

**How this plan was checked:** every step below was applied to a copy of the repository at commit `9794169`. On the result, the fast loop and the full tests passed, and the smoke run passed against the real app in Electron. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

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

1. `AGENTS.md` and each file in `.cursor/rules/`.
2. [ui-facelift-spec.md](ui-facelift-spec.md): How to Read This Document, Decisions, Console, and Orders tab.
3. `doc/ux/right-panel-selection-and-orders.md`, `doc/ux/right-panel.md`, and `doc/ux/selection-model.md`.
4. `scripts/ui-smoke/ui-smoke.cjs` and `scripts/ui-smoke/ui-smoke-checks.cjs`, to see how scenes and checks fit together.
5. `src/main/gameDb/gameConfigKv.ts`, for the `game_over` and `winner` keys the smoke run writes to mark its match as lost.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected:

- `git status --short` prints nothing, or only `.spec/` files.
- The last commit is `9794169 Doc move.`, or a later commit of yours that changes only `.spec/`. If it is anything else, stop and report: every block in this plan was checked against `9794169`.

Then check that the spec's Phase 2 is in and this plan is not:

```powershell
Test-Path src/renderer/chrome/gameMenu.ts
Test-Path src/renderer/gameplay/queuedOrderRows.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **843**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/orderRowDetail.ts`
- `src/shared/orderRowDetail.test.ts`
- `src/shared/orderTargetHexCode.ts`
- `src/shared/orderTargetHexCode.test.ts`
- `src/shared/pendingMovementSidebarLabels.ts`
- `src/main/pendingMovementSidebarLabels.test.ts`
- `src/main/tacticalMarchHoverPreview.test.ts`
- `src/renderer/gameplay/orderLabelFormatting.ts`
- `src/renderer/gameplay/queuedOrderRows.ts`
- `src/renderer/gameplay/sidebarOrderRow.ts`
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/gameplay/tacticalOrderDeps.ts`
- `src/renderer/entryCallbacks.ts`
- `src/renderer/wiredEntryCallbacks.ts`
- `src/renderer/renderer.ts`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/core/uiState.ts`
- `src/main/rendererConsolidation.test.ts`
- `static/index.html`
- `static/consoleChrome.css`
- `static/shellChrome.css`
- `static/frameChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-map.cjs`
- `scripts/ui-smoke/ui-smoke-session.cjs`
- `scripts/ui-smoke/ui-smoke-db-edit.cjs`
- `scripts/ui-smoke/ui-smoke-console-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/right-panel-selection-and-orders.md`
- `doc/ux/right-panel.md`
- `doc/ux/control-tooltips.md`
- `doc/ux/order-lifecycle.md`
- `doc/ux/selection-model.md`
- `doc/how-to-play.md`
- `doc/ux-specification.md`
- `doc/ui-style-guide.md`

- [ ] **Step 1: Create `src/shared/orderRowDetail.ts`**

The text under a queued order's unit name, such as "→ E5 · 1h" or "→ GK · 2h · Airports", and the Orders subtitle, such as "3 queued for turn 4". Pure functions with no page access.

Create `src/shared/orderRowDetail.ts` with exactly this content:

```ts
/**
 * Text for queued-order rows: the line under a unit's name, and the Orders tab's subtitle.
 *
 * The Orders tab and the selection panel show the same line for an order, so both read it from here.
 */
import type { AirStrikeTargetType } from './ipcTypes';

/**
 * Words for each air-strike target type, as the target-type list shows them.
 *
 * Purpose: A strike row names its target type in the player's words, not the stored value.
 * When to use: The extra part of an air-strike row's line.
 * Expected outcome: Matches the option labels of `#air-strike-target-type` in `static/index.html`.
 * Exceptions: None.
 */
export const AIR_STRIKE_TARGET_TYPE_LABELS: Readonly<Record<AirStrikeTargetType, string>> = Object.freeze({
  units: 'Enemy Units',
  urban: 'Production',
  airport: 'Airports',
  seaport: 'Seaports',
});

/**
 * What one order row's line says.
 *
 * Purpose: Keeps the three parts of the line named, so callers cannot swap them.
 * When to use: The argument of `formatOrderRowDetail`.
 * Expected outcome: Null parts show as a question mark.
 * Exceptions: None.
 */
export interface OrderRowDetailParts {
  /**
   * The target hex's code, such as `E5`, or `E8.K3` inside a battle.
   *
   * Contract: Null when the code cannot be found.
   * When to use: Always.
   * Expected outcome: Shown after the arrow.
   * Exceptions: None.
   */
  readonly targetCode: string | null;
  /**
   * Hex steps from the unit to the target.
   *
   * Contract: A non-negative whole number, or null when it cannot be measured.
   * When to use: Always.
   * Expected outcome: Shown as `Nh`.
   * Exceptions: None.
   */
  readonly distanceHexes: number | null;
  /**
   * A last part, such as `Ferry` or a strike's target type.
   *
   * Contract: Null or empty adds nothing.
   * When to use: Ferry rows and air-strike rows.
   * Expected outcome: Shown after a separator.
   * Exceptions: None.
   */
  readonly note: string | null;
}

/**
 * Formats the line under a unit's name in an order row.
 *
 * Purpose: Every queued order names its target hex the same way in the Orders tab and the selection panel.
 * When to use: For movement, ferry, ranged, and air-strike rows on the world map and in battles.
 * Expected outcome: For example `→ E5 · 1h`, `→ GK · 2h · Airports`, or `→ ? · ?h` when nothing is known.
 * Exceptions: None.
 */
export function formatOrderRowDetail(parts: OrderRowDetailParts): string {
  const code = parts.targetCode && parts.targetCode.length > 0 ? parts.targetCode : '?';
  const distance = parts.distanceHexes == null ? '?' : String(parts.distanceHexes);
  const note = parts.note ? ` · ${parts.note}` : '';
  return `→ ${code} · ${distance}h${note}`;
}

/**
 * Formats the Orders tab's subtitle.
 *
 * Purpose: Says how many orders Ready will send, and for which turn or beat.
 * When to use: Whenever the queued orders or the turn change. Pass the battle's beat number during a battle.
 * Expected outcome: `6 queued for turn 7`, or `2 queued for beat 3` while `battleBeat` is a number.
 * Exceptions: None.
 */
export function formatQueuedOrdersSubtitle(queuedCount: number, turnNumber: number, battleBeat: number | null): string {
  const when = battleBeat == null ? `turn ${turnNumber}` : `beat ${battleBeat}`;
  return `${queuedCount} queued for ${when}`;
}
```

- [ ] **Step 2: Create `src/shared/orderRowDetail.test.ts`**

Covers the sub-line with and without a note, the unknown-value fallback "?", and both subtitle forms.

Create `src/shared/orderRowDetail.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIR_STRIKE_TARGET_TYPE_LABELS, formatOrderRowDetail, formatQueuedOrdersSubtitle } from './orderRowDetail';

test('formatOrderRowDetail names the target code and the distance', () => {
  assert.equal(formatOrderRowDetail({ targetCode: 'E5', distanceHexes: 1, note: null }), '→ E5 · 1h');
  assert.equal(formatOrderRowDetail({ targetCode: 'E8.K3', distanceHexes: 0, note: null }), '→ E8.K3 · 0h');
});

test('formatOrderRowDetail adds a ferry or strike note', () => {
  assert.equal(formatOrderRowDetail({ targetCode: 'E8', distanceHexes: 1, note: 'Ferry' }), '→ E8 · 1h · Ferry');
  assert.equal(
    formatOrderRowDetail({ targetCode: 'GK', distanceHexes: 2, note: AIR_STRIKE_TARGET_TYPE_LABELS.airport }),
    '→ GK · 2h · Airports'
  );
});

test('formatOrderRowDetail shows a question mark for an unknown code or distance', () => {
  assert.equal(formatOrderRowDetail({ targetCode: null, distanceHexes: null, note: null }), '→ ? · ?h');
  assert.equal(formatOrderRowDetail({ targetCode: '', distanceHexes: 3, note: '' }), '→ ? · 3h');
});

test('formatQueuedOrdersSubtitle names the turn, or the beat during a battle', () => {
  assert.equal(formatQueuedOrdersSubtitle(6, 7, null), '6 queued for turn 7');
  assert.equal(formatQueuedOrdersSubtitle(0, 7, 2), '0 queued for beat 2');
});
```

- [ ] **Step 3: Create `src/shared/orderTargetHexCode.ts`**

Turns an order's target cell into the code the player sees: the two-character world hex code, or a code like "E8.K3" (the battle's hex, then the cell) inside a battle. It returns null when no code can be made, and the row then shows "?".

Create `src/shared/orderTargetHexCode.ts` with exactly this content:

```ts
/**
 * The hex code an order or a selection names: `E5` on the world map, `E8.K3` for a cell inside a battle.
 *
 * The codes are the ones the hex tooltip shows in parentheses, so a player can match a row to a hex.
 */
import { getStrategicHexCode } from './hexLlmCodeAssignment';
import { tacticalBattleHexCode } from './tacticalBattleFootprint';

/**
 * The part of a battle snapshot that a cell's code depends on.
 *
 * Purpose: Callers pass the live battle snapshot; tests pass only this field.
 * When to use: While a battle is active.
 * Expected outcome: The enclosing world hex of the battle.
 * Exceptions: None.
 */
export interface OrderHexCodeBattle {
  /**
   * The world hex the battle is fought in.
   *
   * Contract: A strategic H3 index.
   * When to use: Always.
   * Expected outcome: Its code is the part before the dot.
   * Exceptions: None.
   */
  readonly enclosingStrategicH3Index: string;
}

/**
 * Returns the code for the hex an order targets, or for the hex a selected unit stands in.
 *
 * Purpose: Order rows and the selection panel name hexes the way the hex tooltip does.
 * When to use: Pass the active battle during a battle, otherwise null.
 * Expected outcome: The world hex's two-character code, or `XX.YY` for a battle cell. Null when the index is
 *   missing or is not a hex of the current map or battle.
 * Exceptions: None. An invalid index returns null.
 */
export function orderTargetHexCode(h3Index: string | null, battle: OrderHexCodeBattle | null): string | null {
  if (!h3Index) return null;
  try {
    if (!battle) return getStrategicHexCode(h3Index) ?? null;
    const parentCode = getStrategicHexCode(battle.enclosingStrategicH3Index);
    const cellCode = tacticalBattleHexCode(battle.enclosingStrategicH3Index, h3Index);
    return parentCode && cellCode ? `${parentCode}.${cellCode}` : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Create `src/shared/orderTargetHexCode.test.ts`**

Covers a world code, a battle code, and the null cases.

Create `src/shared/orderTargetHexCode.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import { getStrategicHexCode } from './hexLlmCodeAssignment';
import { orderTargetHexCode } from './orderTargetHexCode';
import { tacticalBattleFootprint, tacticalBattleHexCode } from './tacticalBattleFootprint';

/**
 * A world hex of the global map that has a code and a battle footprint.
 *
 * Purpose: Both theaters' codes are checked against the same hex.
 * When to use: The tests in this file, inside `withGameMap(GLOBAL_GAME_MAP, ...)`.
 * Expected outcome: A valid strategic H3 index.
 * Exceptions: None.
 */
const SAMPLE_HEX = '81263ffffffffff';

test('orderTargetHexCode names a world hex by its two-character code', () => {
  withGameMap(GLOBAL_GAME_MAP, () => {
    const code = getStrategicHexCode(SAMPLE_HEX);
    assert.ok(code);
    assert.equal(orderTargetHexCode(SAMPLE_HEX, null), code);
  });
});

test('orderTargetHexCode names a battle cell by its parent code and its cell code', () => {
  withGameMap(GLOBAL_GAME_MAP, () => {
    const cell = tacticalBattleFootprint(SAMPLE_HEX).h3Indexes[0];
    const expected = `${getStrategicHexCode(SAMPLE_HEX)}.${tacticalBattleHexCode(SAMPLE_HEX, cell)}`;
    assert.equal(orderTargetHexCode(cell, { enclosingStrategicH3Index: SAMPLE_HEX }), expected);
  });
});

test('orderTargetHexCode returns null for a missing or invalid index', () => {
  assert.equal(orderTargetHexCode(null, null), null);
  assert.equal(orderTargetHexCode('not-a-cell', { enclosingStrategicH3Index: 'not-a-cell' }), null);
});
```

- [ ] **Step 5: Replace `src/shared/pendingMovementSidebarLabels.ts`**

Movement rows now use the shared sub-line. The old "Moving to <cell>" wording and its status constant go away.

Replace the whole file `src/shared/pendingMovementSidebarLabels.ts` with exactly this content:

```ts
/**
 * Lines for pending movement rows: strategic standing orders and tactical march drafts.
 *
 * Purpose: Both kinds of movement row name the destination hex and the hex steps the same way as every other order row.
 * When to use: Rendering the Movement group of the Orders tab and the order chips of the selection panel.
 * Expected outcome: Lines such as `→ E5 · 3h`, built by `formatOrderRowDetail`.
 * Exceptions: None; an unknown code or distance shows a question mark.
 */

import { gridDistance } from 'h3-js';
import { formatOrderRowDetail } from './orderRowDetail';
import { orderTargetHexCode } from './orderTargetHexCode';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';

/**
 * Formats the line for a strategic standing movement order.
 *
 * Purpose: One formatter for every strategic march row.
 * When to use: Strategic rows of the Movement group, with the hex steps the route has left.
 * Expected outcome: `→ <destination code> · <steps>h`. A missing destination shows `?`.
 * Exceptions: None.
 */
export function formatPendingMovementSidebarTargetLabel(destinationH3Index: string | null, distanceHexSteps: number): string {
  return formatOrderRowDetail({
    targetCode: orderTargetHexCode(destinationH3Index, null),
    distanceHexes: distanceHexSteps,
    note: null,
  });
}

/**
 * Formats the line for a tactical march draft, using battle cell codes and battle grid steps.
 *
 * Purpose: Battle marches read like world-map marches, with the destination cell's code.
 * When to use: While a battle is active, for each row of `tacticalPendingMarches`.
 * Expected outcome: `→ <battle cell code> · <steps>h`. The steps are `?` when the sub-unit is missing or the
 *   destination is not a valid cell.
 * Exceptions: None; H3 errors are caught.
 */
export function formatTacticalDraftMarchPendingOrderTargetLabel(
  battle: TacticalBattleSnapshot,
  subUnitId: string,
  destinationH3Index: string
): string {
  const origin = battle.subUnits.find((u) => u.id === subUnitId)?.h3Index;
  let steps: number | null = null;
  if (origin) {
    try {
      steps = gridDistance(origin, destinationH3Index);
    } catch {
      steps = null;
    }
  }
  return formatOrderRowDetail({
    targetCode: orderTargetHexCode(destinationH3Index, battle),
    distanceHexes: steps,
    note: null,
  });
}
```

- [ ] **Step 6: Edit `src/main/pendingMovementSidebarLabels.test.ts`**

The expected strings follow the new movement wording.

1. In `src/main/pendingMovementSidebarLabels.test.ts`, find these lines. Together they occur exactly once:

```ts
import {
  formatPendingMovementSidebarTargetLabel,
  formatTacticalDraftMarchPendingOrderTargetLabel,
  TACTICAL_DRAFT_MARCH_DISPLAY_STATUS,
} from '../shared/pendingMovementSidebarLabels';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';

test('formatPendingMovementSidebarTargetLabel formats Nh (status)', () => {
  assert.equal(formatPendingMovementSidebarTargetLabel(3, 'en_route'), '3h (en_route)');
});

test('formatTacticalDraftMarchPendingOrderTargetLabel returns zero distance when sub-unit is missing', () => {
```

Replace them with:

```ts
import { GLOBAL_GAME_MAP, withGameMap } from '../shared/activeGameMap';
import { getStrategicHexCode } from '../shared/hexLlmCodeAssignment';
import {
  formatPendingMovementSidebarTargetLabel,
  formatTacticalDraftMarchPendingOrderTargetLabel,
} from '../shared/pendingMovementSidebarLabels';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';

test('formatPendingMovementSidebarTargetLabel names the destination code and the steps left', () => {
  withGameMap(GLOBAL_GAME_MAP, () => {
    const destination = '81263ffffffffff';
    assert.equal(formatPendingMovementSidebarTargetLabel(destination, 3), `→ ${getStrategicHexCode(destination)} · 3h`);
  });
  assert.equal(formatPendingMovementSidebarTargetLabel(null, 3), '→ ? · 3h');
});

test('formatTacticalDraftMarchPendingOrderTargetLabel shows unknown steps when the sub-unit is missing', () => {
```

2. In `src/main/pendingMovementSidebarLabels.test.ts`, find these lines. Together they occur exactly once:

```ts
  const label = formatTacticalDraftMarchPendingOrderTargetLabel(battle, 'missing', center);
  assert.equal(label, `0h (${TACTICAL_DRAFT_MARCH_DISPLAY_STATUS})`);
```

Replace them with:

```ts
  const label = formatTacticalDraftMarchPendingOrderTargetLabel(battle, 'missing', center);
  assert.equal(label, '→ ? · ?h');
```

3. In `src/main/pendingMovementSidebarLabels.test.ts`, find this line. It occurs exactly once:

```ts
  assert.equal(label, `0h (${TACTICAL_DRAFT_MARCH_DISPLAY_STATUS})`);
```

Replace it with:

```ts
  assert.equal(label, '→ ? · ?h');
```

- [ ] **Step 7: Edit `src/main/tacticalMarchHoverPreview.test.ts`**

The expected march label follows the new wording: an arrow, a battle hex code, and "1h".

1. In `src/main/tacticalMarchHoverPreview.test.ts`, find this line. It occurs exactly once:

```ts
test('formatTacticalDraftMarchPendingOrderTargetLabel reports res4 grid steps with strategic-style status', () => {
```

Replace it with:

```ts
test('formatTacticalDraftMarchPendingOrderTargetLabel reports res4 grid steps', () => {
```

2. In `src/main/tacticalMarchHoverPreview.test.ts`, find this line. It occurs exactly once:

```ts
  assert.match(label, /^1h \(en_route\)$/);
```

Replace it with:

```ts
  assert.match(label, /^→ \S+ · 1h$/);
```

- [ ] **Step 8: Edit `src/renderer/gameplay/orderLabelFormatting.ts`**

Ranged attack, air strike, and ferry rows use the same sub-line. An air strike adds its target type, using the dropdown's option label; a ferry adds "Ferry".

1. In `src/renderer/gameplay/orderLabelFormatting.ts`, find these lines. Together they occur exactly once:

```ts
} from '../../shared/ipcTypes';

/**
 * Minimal id→hex rows for resolving an attacker's cell when `GameStateSnapshot.units` keys strategic ids only.
 *
 * Purpose: Tactical pending orders reference `TacticalSubUnitSnapshot.id` while `S.gameState.units` stays on the strategic roster.
 * When to use: Pass `tacticalBattleSnapshot.subUnits` from the renderer when formatting tactical draft order labels.
 * Expected outcome: Same `h3Index` resolution the map uses for sub-units (tactical during tactical play).
 * Exceptions: None.
 */
export type UnitH3PositionLookup = readonly { id: string; h3Index: string }[];

/**
 * Defines the `resolveAttackerH3ForOrderLabel` function shape (function resolveAttackerH3ForOrderLabel(unitId: string, state: GameStateSnapshot | null, tacticalPositions?: UnitH3PositionLookup | null): string | null).

 * Purpose: Picks the origin hex for grid-distance labels whether the unit is keyed on the strategic snapshot or tactical sub-units.
 * When to use: Before calling `computeGridDistanceForLabel` for ranged, strike, or ferry sidebar strings.
 * Expected outcome: Tactical rows win when present and contain `unitId`; otherwise falls back to `state.units`.
```

Replace them with:

```ts
} from '../../shared/ipcTypes';
import { AIR_STRIKE_TARGET_TYPE_LABELS, formatOrderRowDetail } from '../../shared/orderRowDetail';
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * The parts of a battle snapshot that order lines read.
 *
 * Purpose: Tactical pending orders reference `TacticalSubUnitSnapshot.id`, while `S.gameState.units` stays on the
 *   strategic roster, and a battle cell's code depends on the battle's world hex.
 * When to use: Pass `S.tacticalBattleSnapshot` while a battle is active; omit it on the world map.
 * Expected outcome: Sub-unit positions win over strategic positions, and target codes read `XX.YY`.
 * Exceptions: None.
 */
export type OrderLabelBattle = Pick<TacticalBattleSnapshot, 'enclosingStrategicH3Index' | 'subUnits'>;

/**
 * Picks the origin hex for an order line's distance.
 *
 * Purpose: The unit may be a battle sub-unit or a strategic unit.
 * When to use: Before calling `computeGridDistanceForLabel` for ranged, strike, or ferry lines.
 * Expected outcome: The battle sub-unit's cell when the battle lists `unitId`; otherwise the strategic unit's hex.
```

2. In `src/renderer/gameplay/orderLabelFormatting.ts`, find these lines. Together they occur exactly once:

```ts
  tacticalPositions?: UnitH3PositionLookup | null
): string | null {
  if (tacticalPositions && tacticalPositions.length > 0) {
    const tactical = tacticalPositions.find((u) => u.id === unitId);
    if (tactical) return tactical.h3Index;
  }
```

Replace them with:

```ts
  battle?: OrderLabelBattle | null
): string | null {
  const tactical = battle?.subUnits.find((u) => u.id === unitId);
  if (tactical) return tactical.h3Index;
```

3. In `src/renderer/gameplay/orderLabelFormatting.ts`, find this line. It occurs exactly once:

```ts
 * Renderer-only H3 edge count for **sidebar / UI distance labels** (strategic or tactical resolution of the hex ids).
```

Replace it with:

```ts
 * Renderer-only H3 edge count for order-row distance labels (strategic or tactical resolution of the hex ids).
```

4. In `src/renderer/gameplay/orderLabelFormatting.ts`, find this line. It occurs exactly once:

```ts
 * When to use: Pending-order labels (`…Nh`) next to ranged, ferry, and strike rows in the tactical UI.
```

Replace it with:

```ts
 * When to use: The distance part of ranged, ferry, and strike rows.
```

5. In `src/renderer/gameplay/orderLabelFormatting.ts`, find these lines. Together they occur exactly once:

```ts
 * Defines the `formatDistanceLabelForPlannedAttack` function shape (function formatDistanceLabelForPlannedAttack(state: GameStateSnapshot | null, unitId: string, targetH3Index: string, tacticalPositions?: UnitH3PositionLookup | null): string).

 * Purpose: Supports maintainability by documenting why `formatDistanceLabelForPlannedAttack` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: `Nh` where `N` is H3 grid edge count at the snapshot resolution (strategic or tactical).
 * Exceptions: None.
 */
function formatDistanceLabelForPlannedAttack(
  state: GameStateSnapshot | null,
  unitId: string,
  targetH3Index: string,
  tacticalPositions?: UnitH3PositionLookup | null
): string {
  const originH3 = resolveAttackerH3ForOrderLabel(unitId, state, tacticalPositions);
  if (!originH3) return '?h';
  const distance = computeGridDistanceForLabel(originH3, targetH3Index);
  return distance == null ? '?h' : `${distance}h`;
}

/**
 * Defines the `formatPendingRangedAttackSidebarLabel` function shape (export function formatPendingRangedAttackSidebarLabel().

 * Purpose: Supports maintainability by documenting why `formatPendingRangedAttackSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
```

Replace them with:

```ts
 * Builds the line for an order that goes from a unit to a target hex.
 *
 * Purpose: Ranged, strike, and ferry rows share the code, the distance, and the layout.
 * When to use: From the three exported formatters below.
 * Expected outcome: `→ <code> · <steps>h`, plus ` · <note>` when a note is given. Unknown parts show `?`.
 * Exceptions: None.
 */
function formatUnitToTargetDetail(
  state: GameStateSnapshot | null,
  unitId: string,
  targetH3Index: string,
  battle: OrderLabelBattle | null | undefined,
  note: string | null
): string {
  const originH3 = resolveAttackerH3ForOrderLabel(unitId, state, battle);
  return formatOrderRowDetail({
    targetCode: orderTargetHexCode(targetH3Index, battle ?? null),
    distanceHexes: originH3 ? computeGridDistanceForLabel(originH3, targetH3Index) : null,
    note,
  });
}

/**
 * Formats the line for a queued ranged attack.
 *
 * Purpose: The Ranged attacks group and the selection panel show the same line.
 * When to use: For each row of `S.pendingRangedAttacks`. Pass the battle snapshot during a battle.
 * Expected outcome: For example `→ GD · 1h`.
```

6. In `src/renderer/gameplay/orderLabelFormatting.ts`, find these lines. Together they occur exactly once:

```ts
  tacticalPositions?: UnitH3PositionLookup | null
): string {
  return formatDistanceLabelForPlannedAttack(state, order.unitId, order.targetH3Index, tacticalPositions);
}

/**
 * Defines the `formatPendingAirStrikeSidebarLabel` function shape (export function formatPendingAirStrikeSidebarLabel().

 * Purpose: Supports maintainability by documenting why `formatPendingAirStrikeSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
```

Replace them with:

```ts
  battle?: OrderLabelBattle | null
): string {
  return formatUnitToTargetDetail(state, order.unitId, order.targetH3Index, battle, null);
}

/**
 * Formats the line for a queued air strike, naming the target type as the target-type list does.
 *
 * Purpose: The Air strikes group and the selection panel show the same line.
 * When to use: For each row of `S.pendingAirStrikes`. Pass the battle snapshot during a battle.
 * Expected outcome: For example `→ GK · 2h · Airports`.
```

7. In `src/renderer/gameplay/orderLabelFormatting.ts`, find these lines. Together they occur exactly once:

```ts
  tacticalPositions?: UnitH3PositionLookup | null
): string {
  const targetTypeLabel =
    order.targetType === 'units'
      ? 'units'
      : order.targetType === 'urban'
        ? 'urban'
        : order.targetType === 'airport'
          ? 'airport'
          : 'seaport';
  return `${formatDistanceLabelForPlannedAttack(state, order.unitId, order.targetH3Index, tacticalPositions)} (${targetTypeLabel})`;
}

/**
 * Defines the `formatPendingFerryOrderSidebarLabel` function shape (export function formatPendingFerryOrderSidebarLabel().

 * Purpose: Supports maintainability by documenting why `formatPendingFerryOrderSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
```

Replace them with:

```ts
  battle?: OrderLabelBattle | null
): string {
  return formatUnitToTargetDetail(
    state,
    order.unitId,
    order.targetH3Index,
    battle,
    AIR_STRIKE_TARGET_TYPE_LABELS[order.targetType] ?? null
  );
}

/**
 * Formats the line for a queued ferry.
 *
 * Purpose: Ferry rows sit in the Movement group and say they are ferries.
 * When to use: For each row of `S.pendingFerryOrders`. Pass the battle snapshot during a battle.
 * Expected outcome: For example `→ E8 · 1h · Ferry`.
```

8. In `src/renderer/gameplay/orderLabelFormatting.ts`, find these lines. Together they occur exactly once:

```ts
  tacticalPositions?: UnitH3PositionLookup | null
): string {
  const originH3 = resolveAttackerH3ForOrderLabel(order.unitId, state, tacticalPositions);
  if (!originH3) return '?h (ferry)';
  const ferryDistance = computeGridDistanceForLabel(originH3, order.destinationH3Index);
  return `${ferryDistance == null ? '?' : ferryDistance}h (ferry)`;
```

Replace them with:

```ts
  battle?: OrderLabelBattle | null
): string {
  return formatUnitToTargetDetail(state, order.unitId, order.destinationH3Index, battle, 'Ferry');
```

- [ ] **Step 9: Create `src/renderer/gameplay/queuedOrderRows.ts`**

A small registry of what each order group shows. Each group publishes its rows after it renders; the console header, the rail badge, and (in the next plan) the selection panel read the count and each unit's order from here.

Create `src/renderer/gameplay/queuedOrderRows.ts` with exactly this content:

```ts
/**
 * The three groups of the Orders tab, in display order. This module keeps the orders the next Ready will send, as the
 * Orders tab last listed them: the Orders tab writes each group here when it redraws it, and other views, such as the
 * console header's count, read from here instead of rebuilding the lists, so every view shows the same rows.
 *
 * Purpose: Names the groups once for the lists, their counts, and readers.
 * When to use: Passing a group to `publishQueuedOrders`.
 * Expected outcome: Movement holds marches and ferries; the other two hold their drafts.
 * Exceptions: None.
 */
export type QueuedOrderGroup = 'movement' | 'ranged' | 'strike';

/**
 * One queued order, as other views need it.
 *
 * Purpose: Lets a view name a unit's order and cancel it without knowing which list it came from.
 * When to use: Values passed to `publishQueuedOrders` and returned by `queuedOrderForUnit`.
 * Expected outcome: `detail` is the row's line under the unit name; `cancel` does what the row's × does.
 * Exceptions: None.
 */
export interface QueuedOrderSummary {
  /**
   * The unit or battle sub-unit the order belongs to.
   *
   * Contract: One summary per unit and group.
   * When to use: Matching an order to a selected unit.
   * Expected outcome: An id from the active theater.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The row's line, such as `→ E5 · 1h`.
   *
   * Contract: Built by the shared order-line formatters.
   * When to use: Showing the order outside the Orders tab.
   * Expected outcome: Plain text.
   * Exceptions: None.
   */
  readonly detail: string;
  /**
   * Cancels this order, exactly as the row's × does.
   *
   * Contract: Refreshes the lists itself.
   * When to use: A cancel control outside the Orders tab.
   * Expected outcome: Only this unit's order is removed.
   * Exceptions: None.
   */
  readonly cancel: () => void;
}

/**
 * The last published rows of each group.
 *
 * Purpose: The single copy readers use.
 * When to use: Written by `publishQueuedOrders` only.
 * Expected outcome: A group never drawn yet counts as empty.
 * Exceptions: None.
 */
const ordersByGroup = new Map<QueuedOrderGroup, readonly QueuedOrderSummary[]>();

/**
 * Callbacks run after any group changes.
 *
 * Purpose: Views that show counts or orders refresh when the lists do.
 * When to use: Added by `onQueuedOrdersChanged`.
 * Expected outcome: Each runs once per publish.
 * Exceptions: None.
 */
const listeners: Array<() => void> = [];

/**
 * Records one group's rows and tells every listener.
 *
 * Purpose: Called by the Orders tab each time it redraws a group.
 * When to use: After the group's list element is filled.
 * Expected outcome: Readers see the new rows, and each listener runs once.
 * Exceptions: A listener that throws stops the later listeners.
 */
export function publishQueuedOrders(group: QueuedOrderGroup, orders: readonly QueuedOrderSummary[]): void {
  ordersByGroup.set(group, orders);
  for (const listener of listeners) listener();
}

/**
 * Counts the queued orders in every group.
 *
 * Purpose: The Orders badge and subtitle show this number.
 * When to use: From a listener or when the console header is drawn.
 * Expected outcome: The sum of the three groups' last published lengths.
 * Exceptions: None.
 */
export function queuedOrderCount(): number {
  let count = 0;
  for (const orders of ordersByGroup.values()) count += orders.length;
  return count;
}

/**
 * Finds a unit's queued order.
 *
 * Purpose: Other views show a unit's order with the Orders tab's wording.
 * When to use: For each unit a view lists.
 * Expected outcome: The first match in Movement, then Ranged, then Strike order, or null.
 * Exceptions: None.
 */
export function queuedOrderForUnit(unitId: string): QueuedOrderSummary | null {
  for (const group of ['movement', 'ranged', 'strike'] as const) {
    const match = ordersByGroup.get(group)?.find((order) => order.unitId === unitId);
    if (match) return match;
  }
  return null;
}

/**
 * Adds a callback that runs whenever a group is published.
 *
 * Purpose: Keeps views that depend on the orders in step without the Orders tab knowing them.
 * When to use: Once per view, during renderer startup.
 * Expected outcome: The callback runs after every later publish.
 * Exceptions: None.
 */
export function onQueuedOrdersChanged(listener: () => void): void {
  listeners.push(listener);
}
```

- [ ] **Step 10: Replace `src/renderer/gameplay/sidebarOrderRow.ts`**

The new row: one button holding the unit's name and the sub-line, then the cancel ×. Clicking the row selects the unit and Shift-click toggles it, so the old ⊕ button goes away. `renderSidebarOrderGroup` fills a group, its count, and "None", and publishes the rows. `syncSidebarOrderRowSelection` refreshes the highlight after a selection change.

Replace the whole file `src/renderer/gameplay/sidebarOrderRow.ts` with exactly this content:

```ts
import { rendererSharedState as S } from '../core/state';
import { setUnitNameContent } from '../core/unitOriginFlags';
import { publishQueuedOrders, type QueuedOrderGroup } from './queuedOrderRows';
import { appendMutedPlaceholder } from './sidebarListHelpers';

/**
 * Arguments for one order row (movement, ferry, ranged, or air-strike order).
 *
 * Purpose: One shared shape for `createSidebarOrderRow` and `renderSidebarOrderGroup`.
 * When to use: When building the rows of an Orders tab group.
 * Expected outcome: Describes the unit, the order's line, the selection state, and the row's callbacks.
 * Exceptions: None.
 */
export type SidebarOrderRowArgs = {
  /**
   * Id of the unit the order belongs to.
   *
   * Contract: A strategic unit id, or a battle sub-unit id during a battle.
   * When to use: Always.
   * Expected outcome: The row shows the unit's origin flag when its origin is known.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The unit's display name.
   *
   * Contract: Plain text; it is never parsed as HTML.
   * When to use: Always.
   * Expected outcome: The row's first line.
   * Exceptions: None.
   */
  readonly unitName: string;
  /**
   * The order's line, such as `→ E5 · 1h`.
   *
   * Contract: Built by the shared order-line formatters; plain text.
   * When to use: Always.
   * Expected outcome: The row's second line.
   * Exceptions: None.
   */
  readonly detail: string;
  /**
   * Whether the row's unit is currently selected.
   *
   * Contract: Marks the row as pressed.
   * When to use: Always.
   * Expected outcome: A selected row is highlighted.
   * Exceptions: None.
   */
  readonly selected: boolean;
  /**
   * Called when the row is clicked.
   *
   * Contract: Receives the click event so Shift can add or remove the unit.
   * When to use: Always.
   * Expected outcome: The caller updates the selection.
   * Exceptions: Whatever the callback throws.
   */
  readonly onToggleSelect: (event: MouseEvent) => void;
  /**
   * Called when the row's × is clicked.
   *
   * Contract: Removes the order the row represents.
   * When to use: Always.
   * Expected outcome: The caller cancels the order and refreshes the list.
   * Exceptions: Whatever the callback throws.
   */
  readonly onCancel: () => void;
};

/**
 * Renderer callbacks every order row needs.
 *
 * Purpose: Lets the Movement, Ranged attacks, and Air strikes renderers build rows the same way.
 * When to use: Pass the renderer's dependency bundle to `sidebarOrderRowArgs`.
 * Expected outcome: Names come from the shared display-name lookup; a row click goes through the shared selection rule.
 * Exceptions: None.
 */
export interface SidebarOrderRowDeps {
  /**
   * Returns a unit's display name.
   *
   * Contract: Same names the map and the stack callout show.
   * When to use: The first line of each row.
   * Expected outcome: The name, or a fallback built from the id.
   * Exceptions: None.
   */
  readonly formatUnitDisplayName: (unitId: string) => string;
  /**
   * Selects a row's unit: a plain click replaces the selection, and Shift adds or removes the unit.
   *
   * Contract: Same rule as the stack callout's unit buttons.
   * When to use: The row's click handler.
   * Expected outcome: The selection and the views that follow it are refreshed.
   * Exceptions: None.
   */
  readonly applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;
}

/**
 * Builds the arguments for one order row.
 *
 * Purpose: The three group renderers share the name lookup, the selected state, and the click rule.
 * When to use: Once per queued order, with that order's line and cancel action.
 * Expected outcome: Arguments for `renderSidebarOrderGroup`; `selected` is true when the unit is in the current selection.
 * Exceptions: None.
 */
export function sidebarOrderRowArgs(
  unitId: string,
  detail: string,
  onCancel: () => void,
  deps: SidebarOrderRowDeps
): SidebarOrderRowArgs {
  return {
    unitId,
    unitName: deps.formatUnitDisplayName(unitId),
    detail,
    selected: S.selectedUnitIds.includes(unitId),
    onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(unitId, event),
    onCancel,
  };
}

/**
 * The list and count elements of each Orders tab group.
 *
 * Purpose: Keeps the group ids in one place for the renderers.
 * When to use: Through `renderSidebarOrderGroup`.
 * Expected outcome: Every id exists in `static/index.html`.
 * Exceptions: None.
 */
const ORDER_GROUP_ELEMENT_IDS: Readonly<Record<QueuedOrderGroup, { readonly listId: string; readonly countId: string }>> =
  Object.freeze({
    movement: { listId: 'pending-orders-list', countId: 'pending-orders-count' },
    ranged: { listId: 'ranged-attacks-list', countId: 'ranged-attacks-count' },
    strike: { listId: 'air-strikes-list', countId: 'air-strikes-count' },
  });

/**
 * Builds one order row: the unit and its order's line in one select button, then a cancel button.
 *
 * Purpose: Gives every order group the same row layout and controls.
 * When to use: From `renderSidebarOrderGroup`.
 * Expected outcome: An unattached row. Clicking the row's main part selects its unit; × cancels the order.
 * Exceptions: None.
 */
export function createSidebarOrderRow(args: SidebarOrderRowArgs): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'console-order-row';
  row.dataset.unitId = args.unitId;
  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = 'console-order-select';
  selectBtn.setAttribute('aria-pressed', args.selected ? 'true' : 'false');
  const name = document.createElement('span');
  name.className = 'console-order-name';
  setUnitNameContent(name, args.unitId, args.unitName);
  const detail = document.createElement('span');
  detail.className = 'console-order-detail';
  detail.textContent = args.detail;
  selectBtn.append(name, detail);
  selectBtn.addEventListener('click', (event) => args.onToggleSelect(event));
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'console-order-cancel';
  cancelBtn.setAttribute('aria-label', `Cancel the order for ${args.unitName}`);
  cancelBtn.textContent = '×';
  cancelBtn.addEventListener('click', args.onCancel);
  row.append(selectBtn, cancelBtn);
  return row;
}

/**
 * Redraws one Orders tab group: its rows, its count, and its published copy.
 *
 * Purpose: The three groups fill their lists the same way, and other views read the result.
 * When to use: Each time a group's drafts or the selection change.
 * Expected outcome: The list shows one row per order, or "None" when there are none. The heading count shows
 *   the number of rows. `publishQueuedOrders` receives the same orders. A missing list element changes nothing.
 * Exceptions: None.
 */
export function renderSidebarOrderGroup(group: QueuedOrderGroup, rows: readonly SidebarOrderRowArgs[]): void {
  const ids = ORDER_GROUP_ELEMENT_IDS[group];
  const list = document.getElementById(ids.listId);
  if (!list) return;
  list.replaceChildren();
  if (rows.length === 0) appendMutedPlaceholder(list, 'None');
  for (const row of rows) list.appendChild(createSidebarOrderRow(row));
  const count = document.getElementById(ids.countId);
  if (count) count.textContent = String(rows.length);
  publishQueuedOrders(
    group,
    rows.map((row) => ({ unitId: row.unitId, detail: row.detail, cancel: row.onCancel }))
  );
}

/**
 * Marks the order rows whose unit is selected, without rebuilding the lists.
 *
 * Purpose: Some selection changes refresh only the selected-unit readout, so the rows would keep an old highlight.
 * When to use: After every selection change; `updateSidebar` calls it.
 * Expected outcome: Each row's select button is pressed exactly when its unit is in `S.selectedUnitIds`.
 * Exceptions: None.
 */
export function syncSidebarOrderRowSelection(): void {
  const selected = new Set(S.selectedUnitIds);
  document.querySelectorAll<HTMLElement>('.console-order-row').forEach((row) => {
    const pressed = row.dataset.unitId !== undefined && selected.has(row.dataset.unitId);
    row.querySelector('.console-order-select')?.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });
}
```

- [ ] **Step 11: Edit `src/renderer/gameplay/sidebarSupport.ts`**

The Movement group is built with the shared row helpers. `formatUnitArrowLabel` is no longer needed and is removed.

1. In `src/renderer/gameplay/sidebarSupport.ts`, find these lines. Together they occur exactly once:

```ts
import { appendMutedPlaceholder } from './sidebarListHelpers';
import { rendererSharedState as S } from '../core/state';
import type { SidebarOrderRowArgs } from './sidebarOrderRow';
```

Replace them with:

```ts
import { rendererSharedState as S } from '../core/state';
import { renderSidebarOrderGroup, sidebarOrderRowArgs, type SidebarOrderRowArgs } from './sidebarOrderRow';
```

2. In `src/renderer/gameplay/sidebarSupport.ts`, find these lines. Together they occur exactly once:

```ts
   * Specifies the contract for the `formatPendingOrderSidebarLabel` member (formatPendingOrderSidebarLabel: (order: HumanStandingOrderSnapshot) => string;).

   * Contract: Describes stable behavior for callers of `formatPendingOrderSidebarLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatPendingOrderSidebarLabel: (order: HumanStandingOrderSnapshot) => string;
    /**
   * Builds one sidebar order row.
   *
   * Contract: Same behavior as the exported `createSidebarOrderRow`.
   * When to use: For each pending movement or ferry order in the list.
   * Expected outcome: An unattached row element; the label carries a unit flag when `unitId` is given.
   * Exceptions: None.
   */
createSidebarOrderRow: (args: SidebarOrderRowArgs) => HTMLElement;
```

Replace them with:

```ts
   * Builds the line under a strategic march row's unit name.
   *
   * Contract: Same behavior as the exported `formatPendingOrderSidebarLabel`.
   * When to use: For each standing movement order shown in the Movement group.
   * Expected outcome: For example `→ E5 · 1h`.
   * Exceptions: None.
   */
formatPendingOrderSidebarLabel: (order: HumanStandingOrderSnapshot) => string;
```

3. In `src/renderer/gameplay/sidebarSupport.ts`, find these lines. Together they occur exactly once:

```ts
   * Specifies the contract for the `formatUnitArrowLabel` member (formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;).

   * Contract: Describes stable behavior for callers of `formatUnitArrowLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;
```

Replace them with:

```ts
   * Returns a unit's display name.
   *
   * Contract: Same names the map and the stack callout show.
   * When to use: The first line of each Movement row.
   * Expected outcome: The name, or a fallback built from the id.
   * Exceptions: None.
   */
formatUnitDisplayName: (unitId: string) => string;
```

4. In `src/renderer/gameplay/sidebarSupport.ts`, find these lines. Together they occur exactly once:

```ts
 * Defines the `formatUnitArrowLabel` function shape (export function formatUnitArrowLabel(unitId: string, targetLabel: string, formatUnitDisplayName: (unitId: string) => string): string).

 * Purpose: Supports maintainability by documenting why `formatUnitArrowLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatUnitArrowLabel(unitId: string, targetLabel: string, formatUnitDisplayName: (unitId: string) => string): string {
  return `${formatUnitDisplayName(unitId)} → ${targetLabel}`;
}

/**
 * Defines the `formatPendingOrderSidebarLabel` function shape (export function formatPendingOrderSidebarLabel( order: HumanStandingOrderSnapshot, formatUnitArrowLabelFn: (unitId: string, targetLabel: string) => string).

 * Purpose: Supports maintainability by documenting why `formatPendingOrderSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatPendingOrderSidebarLabel(
  order: HumanStandingOrderSnapshot,
  formatUnitArrowLabelFn: (unitId: string, targetLabel: string) => string
): string {
  return formatUnitArrowLabelFn(
    order.unitId,
    formatPendingMovementSidebarTargetLabel(estimateHexesLeftForOrder(order), order.status)
  );
```

Replace them with:

```ts
 * Builds the line under a strategic march row's unit name.
 *
 * Purpose: A standing movement order names its destination hex and the hex steps its route has left.
 * When to use: For each standing movement order shown in the Movement group.
 * Expected outcome: For example `→ E5 · 3h`; a missing destination shows `?`.
 * Exceptions: None.
 */
export function formatPendingOrderSidebarLabel(order: HumanStandingOrderSnapshot): string {
  return formatPendingMovementSidebarTargetLabel(order.destinationH3Index, estimateHexesLeftForOrder(order));
```

5. In `src/renderer/gameplay/sidebarSupport.ts`, find these lines. Together they occur exactly once:

```ts
 * Rebuilds the Movement orders list from the active theater's drafts.
 *
 * When to use: after a march or ferry draft is added, cancelled, or cleared.
 * Expected outcome: the list shows "None" when that theater has no movement rows, otherwise one row per march and ferry. During a battle, sealift embark drafts are omitted. A missing list element leaves the document unchanged.
 * Exceptions: Selection and cancel callbacks may throw. A missing list element returns without throwing.
 */
export function updatePendingOrdersSidebar(deps: PendingOrdersDeps): void {
  const container = document.getElementById('pending-orders-list');
  if (!container) return;
  container.innerHTML = '';
  if (S.tacticalBattleSnapshot) {
    if (S.tacticalPendingMarches.length === 0 && S.pendingFerryOrders.length === 0) {
      appendMutedPlaceholder(container, 'None');
      return;
    }
    for (const row of S.tacticalPendingMarches) {
      const rowEl = deps.createSidebarOrderRow({
        labelText: deps.formatUnitArrowLabel(
          row.subUnitId,
          formatTacticalDraftMarchPendingOrderTargetLabel(S.tacticalBattleSnapshot, row.subUnitId, row.destinationH3Index)
        ),
        unitId: row.subUnitId,
        selected: S.selectedUnitIds.includes(row.subUnitId),
        onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(row.subUnitId, event),
        onCancel: () => {
          S.tacticalPendingMarches = S.tacticalPendingMarches.filter((r) => r.subUnitId !== row.subUnitId);
          deps.updatePendingOrdersSidebar?.();
          deps.redraw?.();
        },
        compactBlueButtons: true,
      });
      container.appendChild(rowEl);
    }
    for (const ferry of S.pendingFerryOrders) {
      const rowEl = deps.createSidebarOrderRow({
        labelText: deps.formatUnitArrowLabel(
          ferry.unitId,
          formatPendingFerryOrderSidebarLabel(S.gameState, ferry, S.tacticalBattleSnapshot.subUnits)
        ),
        unitId: ferry.unitId,
        selected: S.selectedUnitIds.includes(ferry.unitId),
        onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(ferry.unitId, event),
        onCancel: () => {
          deps.cancelFerryForUnit(ferry.unitId);
          deps.refreshStackCalloutIfOpen?.();
        },
        compactBlueButtons: true,
      });
      container.appendChild(rowEl);
    }
    return;
  }
  const pendingOrders = S.humanStandingOrders.filter((order) => deps.isPendingMovementOrderForDisplay(order));
  if (pendingOrders.length === 0 && S.pendingFerryOrders.length === 0) {
    appendMutedPlaceholder(container, 'None');
    return;
  }
  for (const order of pendingOrders) {
    const row = deps.createSidebarOrderRow({
      labelText: deps.formatPendingOrderSidebarLabel(order),
      unitId: order.unitId,
      selected: S.selectedUnitIds.includes(order.unitId),
      onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(order.unitId, event),
      onCancel: () => {
        void deps.cancelOrderForUnit(order.unitId);
      },
      compactBlueButtons: true,
    });
    container.appendChild(row);
  }
  for (const ferry of S.pendingFerryOrders) {
    const row = deps.createSidebarOrderRow({
      labelText: deps.formatUnitArrowLabel(ferry.unitId, formatPendingFerryOrderSidebarLabel(S.gameState, ferry)),
      unitId: ferry.unitId,
      selected: S.selectedUnitIds.includes(ferry.unitId),
      onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(ferry.unitId, event),
      onCancel: () => deps.cancelFerryForUnit(ferry.unitId),
      compactBlueButtons: true,
    });
    container.appendChild(row);
  }
```

Replace them with:

```ts
 * Rebuilds the Movement group from the active theater's drafts.
 *
 * Purpose: Lists every march and ferry the next Ready will send, with each unit's destination code and distance.
 * When to use: After a march or ferry draft is added, cancelled, or cleared, and after the selection changes.
 * Expected outcome: One row per march and ferry, or "None". During a battle, battle marches and ferries are listed
 *   and sealift embark drafts are omitted. Rows for selected units are highlighted. The group's count and its
 *   published copy match. A missing list element leaves the document unchanged.
 * Exceptions: Selection and cancel callbacks may throw.
 */
export function updatePendingOrdersSidebar(deps: PendingOrdersDeps): void {
  const battle = S.tacticalBattleSnapshot;
  const rows: SidebarOrderRowArgs[] = [];
  const rowFor = (unitId: string, detail: string, onCancel: () => void): SidebarOrderRowArgs =>
    sidebarOrderRowArgs(unitId, detail, onCancel, deps);
  if (battle) {
    for (const row of S.tacticalPendingMarches) {
      const detail = formatTacticalDraftMarchPendingOrderTargetLabel(battle, row.subUnitId, row.destinationH3Index);
      rows.push(rowFor(row.subUnitId, detail, () => {
        S.tacticalPendingMarches = S.tacticalPendingMarches.filter((r) => r.subUnitId !== row.subUnitId);
        deps.updatePendingOrdersSidebar?.();
        deps.redraw?.();
      }));
    }
    for (const ferry of S.pendingFerryOrders) {
      rows.push(rowFor(ferry.unitId, formatPendingFerryOrderSidebarLabel(S.gameState, ferry, battle), () => {
        deps.cancelFerryForUnit(ferry.unitId);
        deps.refreshStackCalloutIfOpen?.();
      }));
    }
  } else {
    for (const order of S.humanStandingOrders.filter((o) => deps.isPendingMovementOrderForDisplay(o))) {
      rows.push(rowFor(order.unitId, deps.formatPendingOrderSidebarLabel(order), () => {
        void deps.cancelOrderForUnit(order.unitId);
      }));
    }
    for (const ferry of S.pendingFerryOrders) {
      rows.push(rowFor(ferry.unitId, formatPendingFerryOrderSidebarLabel(S.gameState, ferry), () => deps.cancelFerryForUnit(ferry.unitId)));
    }
  }
  renderSidebarOrderGroup('movement', rows);
```

- [ ] **Step 12: Edit `src/renderer/gameplay/tacticalOrders.ts`**

The Ranged attacks and Air strikes groups are built with the same helpers.

1. In `src/renderer/gameplay/tacticalOrders.ts`, find this line. It occurs exactly once:

```ts
import { appendMutedPlaceholder } from './sidebarListHelpers';
```

Replace it with:

```ts
import { renderSidebarOrderGroup, sidebarOrderRowArgs } from './sidebarOrderRow';
```

2. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
  const tacticalPositions = S.tacticalBattleSnapshot?.subUnits;
  listEl.innerHTML = '';
  if (S.pendingRangedAttacks.length === 0) {
    appendMutedPlaceholder(listEl, 'None');
  } else {
    for (const r of S.pendingRangedAttacks) {
      const row = deps.createSidebarOrderRow({
        labelText: deps.formatUnitArrowLabel(
          r.unitId,
          formatPendingRangedAttackSidebarLabel(S.gameState, r, tacticalPositions)
        ),
        unitId: r.unitId,
        selected: S.selectedUnitIds.includes(r.unitId),
        onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(r.unitId, event),
        onCancel: () => cancelRangedForUnit(r.unitId, deps),
        compactBlueButtons: true,
      });
      listEl.appendChild(row);
    }
  }
  if (strikeListEl) {
    strikeListEl.innerHTML = '';
    if (S.pendingAirStrikes.length === 0) {
      appendMutedPlaceholder(strikeListEl, 'None');
    } else {
      for (const strike of S.pendingAirStrikes) {
        const row = deps.createSidebarOrderRow({
          labelText: deps.formatUnitArrowLabel(
            strike.unitId,
            formatPendingAirStrikeSidebarLabel(S.gameState, strike, tacticalPositions)
          ),
          unitId: strike.unitId,
          selected: S.selectedUnitIds.includes(strike.unitId),
          onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(strike.unitId, event),
          onCancel: () => cancelAirStrikeForUnit(strike.unitId, deps),
          compactBlueButtons: true,
        });
        strikeListEl.appendChild(row);
      }
    }
```

Replace them with:

```ts
  const battle = S.tacticalBattleSnapshot;
  renderSidebarOrderGroup(
    'ranged',
    S.pendingRangedAttacks.map((r) =>
      sidebarOrderRowArgs(
        r.unitId,
        formatPendingRangedAttackSidebarLabel(S.gameState, r, battle),
        () => cancelRangedForUnit(r.unitId, deps),
        deps
      )
    )
  );
  if (strikeListEl) {
    renderSidebarOrderGroup(
      'strike',
      S.pendingAirStrikes.map((strike) =>
        sidebarOrderRowArgs(
          strike.unitId,
          formatPendingAirStrikeSidebarLabel(S.gameState, strike, battle),
          () => cancelAirStrikeForUnit(strike.unitId, deps),
          deps
        )
      )
    );
```

- [ ] **Step 13: Edit `src/renderer/gameplay/tacticalOrderDeps.ts`**

The dependency list trades the two removed row helpers for `formatUnitDisplayName`.

1. In `src/renderer/gameplay/tacticalOrderDeps.ts`, find these lines. Together they occur exactly once:

```ts
import type { SidebarOrderRowArgs } from './sidebarOrderRow';

/**
```

Replace them with:

```ts
/**
```

2. In `src/renderer/gameplay/tacticalOrderDeps.ts`, find these lines. Together they occur exactly once:

```ts
   * Builds one sidebar order row for a ranged attack or air strike.
   *
   * Contract: Same behavior as `createSidebarOrderRow` in `sidebarSupport.ts`.
   * When to use: For each pending ranged attack or air strike in the sidebar lists.
   * Expected outcome: An unattached row element; the label carries a unit flag when `unitId` is given.
   * Exceptions: None.
   */
  createSidebarOrderRow: (args: SidebarOrderRowArgs) => HTMLElement;
  /**
   * Specifies the contract for the `formatUnitArrowLabel` member (formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;).
   *
   * Contract: Describes stable behavior for callers of `formatUnitArrowLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;
```

Replace them with:

```ts
   * Returns a unit's display name.
   *
   * Contract: Same names the map and the stack callout show.
   * When to use: The first line of each Ranged attacks and Air strikes row.
   * Expected outcome: The name, or a fallback built from the id.
   * Exceptions: None.
   */
  formatUnitDisplayName: (unitId: string) => string;
```

- [ ] **Step 14: Edit `src/renderer/entryCallbacks.ts`**

Removes the `formatUnitArrowLabel` wrapper and passes `formatUnitDisplayName` instead.

1. In `src/renderer/entryCallbacks.ts`, find these lines. Together they occur exactly once:

```ts
import { applySelectionFromSidebarUnitButton as applySelectionFromSidebarUnitButtonFromModule, clearSidebarError, formatUnitArrowLabel as formatUnitArrowLabelFromModule, showSidebarError as showSidebarErrorFromModule, syncUiAfterSelectionChange as syncUiAfterSelectionChangeFromModule } from './gameplay/sidebarSupport';
import { createSidebarOrderRow } from './gameplay/sidebarOrderRow';
```

Replace them with:

```ts
import { applySelectionFromSidebarUnitButton as applySelectionFromSidebarUnitButtonFromModule, clearSidebarError, showSidebarError as showSidebarErrorFromModule, syncUiAfterSelectionChange as syncUiAfterSelectionChangeFromModule } from './gameplay/sidebarSupport';
```

2. In `src/renderer/entryCallbacks.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
 * Defines the `formatUnitArrowLabel` function shape (function formatUnitArrowLabel(unitId: string, targetLabel: string): string).

 * Purpose: Supports maintainability by documenting why `formatUnitArrowLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatUnitArrowLabel(unitId: string, targetLabel: string): string {
  return formatUnitArrowLabelFromModule(unitId, targetLabel, formatUnitDisplayName);
}

/**
```

3. In `src/renderer/entryCallbacks.ts`, find these lines. Together they occur exactly once:

```ts
    createSidebarOrderRow,
    formatUnitArrowLabel,
```

Replace them with:

```ts
    formatUnitDisplayName,
```

- [ ] **Step 15: Edit `src/renderer/wiredEntryCallbacks.ts`**

The same rewiring for the callbacks built at startup.

1. In `src/renderer/wiredEntryCallbacks.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  formatUnitArrowLabel,
```

2. In `src/renderer/wiredEntryCallbacks.ts`, find this line. It occurs exactly once:

```ts
  return formatPendingOrderSidebarLabelFromModule(order, formatUnitArrowLabel);
```

Replace it with:

```ts
  return formatPendingOrderSidebarLabelFromModule(order);
```

- [ ] **Step 16: Edit `src/renderer/renderer.ts`**

The same rewiring in the renderer entry point.

1. In `src/renderer/renderer.ts`, find these lines. Together they occur exactly once:

```ts
  applySelectionFromSidebarUnitButton,
  formatUnitArrowLabel,
```

Replace them with:

```ts
  applySelectionFromSidebarUnitButton,
```

2. In `src/renderer/renderer.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
import {
  createSidebarOrderRow,
} from './gameplay/sidebarOrderRow';
```

3. In `src/renderer/renderer.ts`, find these lines. Together they occur exactly once:

```ts
  // formatPendingRangedAttackSidebarLabel(S.gameState, r, tacticalPositions)
  // formatPendingAirStrikeSidebarLabel(S.gameState, strike, tacticalPositions)
```

Replace them with:

```ts
  // formatPendingRangedAttackSidebarLabel(S.gameState, r, battle)
  // formatPendingAirStrikeSidebarLabel(S.gameState, strike, battle)
```

4. In `src/renderer/renderer.ts`, find these lines. Together they occur exactly once:

```ts
    createSidebarOrderRow,
    applySelectionFromSidebarUnitButton,
    cancelOrderForUnit,
    cancelFerryForUnit,
    formatUnitArrowLabel,
```

Replace them with:

```ts
    formatUnitDisplayName,
    applySelectionFromSidebarUnitButton,
    cancelOrderForUnit,
    cancelFerryForUnit,
```

- [ ] **Step 17: Edit `src/renderer/chrome/consoleFrame.ts`**

Each tab now has a subtitle. On Orders it reads "N queued for turn T" (or "for beat B"), and the Orders rail tab shows N as a badge. `refreshConsoleHeader` updates both and runs whenever the order rows change.

1. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
import { nextConsoleTabState, type ConsoleTabState } from '../../shared/consoleTabState';
```

Replace it with:

```ts
import { nextConsoleTabState, type ConsoleTabState } from '../../shared/consoleTabState';
import { formatQueuedOrdersSubtitle } from '../../shared/orderRowDetail';
import { rendererSharedState as S } from '../core/state';
import { onQueuedOrdersChanged, queuedOrderCount } from '../gameplay/queuedOrderRows';
```

2. In `src/renderer/chrome/consoleFrame.ts`, find these lines. Together they occur exactly once:

```ts
  /**
   * Work to redo each time the tab's panel is shown, if any.
```

Replace them with:

```ts
  /**
   * Builds the header subtitle shown beside the title while this tab is active.
   *
   * Contract: Reads the current state each time it is called.
   * When to use: Called by `refreshConsoleHeader`.
   * Expected outcome: Plain text; an empty string shows no subtitle.
   * Exceptions: None.
   */
  readonly subtitle: () => string;
  /**
   * Work to redo each time the tab's panel is shown, if any.
```

3. In `src/renderer/chrome/consoleFrame.ts`, find these lines. Together they occur exactly once:

```ts
  { tabId: 'console-tab-orders', panelId: 'console-panel-orders', title: 'Orders' },
  { tabId: 'console-tab-opponent', panelId: 'console-panel-opponent', title: 'Opponent', onShow: scrollOpenRouterLogToEnd },
```

Replace them with:

```ts
  { tabId: 'console-tab-orders', panelId: 'console-panel-orders', title: 'Orders', subtitle: ordersSubtitle },
  {
    tabId: 'console-tab-opponent',
    panelId: 'console-panel-opponent',
    title: 'Opponent',
    subtitle: () => '',
    onShow: scrollOpenRouterLogToEnd,
  },
```

4. In `src/renderer/chrome/consoleFrame.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * Writes `consoleState` to the page.
```

Replace them with:

```ts
/**
 * Builds the Orders tab's subtitle.
 *
 * Purpose: Says how many orders Ready will send, and for which turn or beat.
 * When to use: As the Orders entry's `subtitle`.
 * Expected outcome: For example "6 queued for turn 7", or "2 queued for beat 3" during a battle.
 * Exceptions: None.
 */
function ordersSubtitle(): string {
  return formatQueuedOrdersSubtitle(
    queuedOrderCount(),
    S.gameState?.turnNumber ?? 0,
    S.tacticalBattleSnapshot ? S.tacticalBattleSnapshot.tacticalTurnNumber : null
  );
}

/**
 * Shows a count on a rail tab, or hides the count when it is zero.
 *
 * Purpose: Rail badges share one look and one rule.
 * When to use: From `refreshConsoleHeader`, once per badge.
 * Expected outcome: The badge shows the number when it is above zero, and is hidden otherwise.
 * Exceptions: None; a missing badge is skipped.
 */
function setRailBadge(badgeId: string, count: number): void {
  const badge = document.getElementById(badgeId);
  if (!badge) return;
  badge.textContent = count > 0 ? String(count) : '';
  badge.hidden = count <= 0;
}

/**
 * Redraws the header subtitle and the rail badges.
 *
 * Purpose: They depend on the queued orders and the turn, which change while the tab stays the same.
 * When to use: After the queued orders change, after the turn or beat changes, and when the tab changes.
 * Expected outcome: `#console-subtitle` shows the active tab's subtitle, and the Orders badge shows the number of
 *   queued orders.
 * Exceptions: None; missing elements are skipped.
 */
export function refreshConsoleHeader(): void {
  const active = CONSOLE_TABS.find((tab) => tab.tabId === consoleState.activeTabId);
  const subtitle = document.getElementById('console-subtitle');
  if (subtitle) subtitle.textContent = active ? active.subtitle() : '';
  setRailBadge('console-tab-orders-badge', queuedOrderCount());
}

/**
 * Writes `consoleState` to the page.
```

5. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: The active panel shows, the others hide, the title matches, and `#sidebar` carries
```

Replace it with:

```ts
 * Expected outcome: The active panel shows, the others hide, the title and subtitle match, and `#sidebar` carries
```

6. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
  document.getElementById('console-collapse-btn')?.setAttribute('aria-expanded', consoleState.collapsed ? 'false' : 'true');
```

Replace it with:

```ts
  document.getElementById('console-collapse-btn')?.setAttribute('aria-expanded', consoleState.collapsed ? 'false' : 'true');
  refreshConsoleHeader();
```

7. In `src/renderer/chrome/consoleFrame.ts`, find these lines. Together they occur exactly once:

```ts
 * Expected outcome: A tab click follows `nextConsoleTabState`. The collapse button collapses the console. The console
 *   starts expanded on Orders.
 * Exceptions: None; missing elements are skipped.
 */
export function wireConsoleFrame(): void {
```

Replace them with:

```ts
 * Expected outcome: A tab click follows `nextConsoleTabState`. The collapse button collapses the console. The header
 *   and badges follow every change to the queued orders. The console starts expanded on Orders.
 * Exceptions: None; missing elements are skipped.
 */
export function wireConsoleFrame(): void {
  onQueuedOrdersChanged(refreshConsoleHeader);
```

- [ ] **Step 18: Edit `src/renderer/core/uiState.ts`**

Refreshes the console header with each new snapshot, and the row highlight with each selection change.

1. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
import { closeGameMenu } from '../chrome/gameMenu';

/**
 * Refreshes the selected-unit line in the right sidebar.
```

Replace them with:

```ts
import { closeGameMenu } from '../chrome/gameMenu';
import { refreshConsoleHeader } from '../chrome/consoleFrame';
import { syncSidebarOrderRowSelection } from '../gameplay/sidebarOrderRow';

/**
 * Refreshes the selected-unit line and the selection highlight of the order rows.
```

2. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
 *   an em dash when nothing is selected.
```

Replace it with:

```ts
 *   an em dash when nothing is selected. Order rows of selected units are highlighted.
```

3. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
): void {
  const selectedUnitEl = document.getElementById('sidebar-selected-unit');
```

Replace them with:

```ts
): void {
  syncSidebarOrderRowSelection();
  const selectedUnitEl = document.getElementById('sidebar-selected-unit');
```

4. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
 * Refreshes the match status in the top bar from the latest snapshot.
 *
 * Purpose: Keeps the name every caller already uses; the old Phase and Turn lines now live in the top bar.
 * When to use: After `applyGameStateSnapshot`, tactical entry/exit, tactical Ready commit, and when beat playback ends.
 * Expected outcome: The top bar's sides, readouts, and date block match `state` and the current battle. Null shows em dashes.
```

Replace them with:

```ts
 * Refreshes the match status in the top bar, and the console header that names the turn, from the latest snapshot.
 *
 * Purpose: Keeps the name every caller already uses; the old Phase and Turn lines now live in the top bar.
 * When to use: After `applyGameStateSnapshot`, tactical entry/exit, tactical Ready commit, and when beat playback ends.
 * Expected outcome: The top bar's sides, readouts, and date block match `state` and the current battle, and the
 *   console subtitle names the current turn or beat. Null shows em dashes.
```

5. In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
  renderTopBarStatus(state);
```

Replace it with:

```ts
  renderTopBarStatus(state);
  refreshConsoleHeader();
```

- [ ] **Step 19: Edit `src/main/rendererConsolidation.test.ts`**

This contract test reads exact call strings from the renderer source. Its anchors follow the new calls.

1. In `src/main/rendererConsolidation.test.ts`, find these lines. Together they occur exactly once:

```ts
    formatPendingFerryOrderSidebarLabelFn.includes('?h (ferry)') &&
      !formatPendingFerryOrderSidebarLabelFn.includes('destinationH3Index} (ferry)'),
    'ferry sidebar labels should avoid raw H3 fallback and stay in Nh notation'
```

Replace them with:

```ts
    formatPendingFerryOrderSidebarLabelFn.includes("order.destinationH3Index, battle, 'Ferry')") &&
      !formatPendingFerryOrderSidebarLabelFn.includes('${order.destinationH3Index}'),
    'ferry sidebar labels should name the destination code through the shared order line, never the raw H3 index'
```

2. In `src/main/rendererConsolidation.test.ts`, find these lines. Together they occur exactly once:

```ts
        'formatPendingRangedAttackSidebarLabel(S.gameState, r, tacticalPositions)'
      ) &&
      tacticalOrdersSource.includes(
        'formatPendingAirStrikeSidebarLabel(S.gameState, strike, tacticalPositions)'
```

Replace them with:

```ts
        'formatPendingRangedAttackSidebarLabel(S.gameState, r, battle)'
      ) &&
      tacticalOrdersSource.includes(
        'formatPendingAirStrikeSidebarLabel(S.gameState, strike, battle)'
```

3. In `src/main/rendererConsolidation.test.ts`, find this line. It occurs exactly once:

```ts
        'formatPendingFerryOrderSidebarLabel(S.gameState, ferry, S.tacticalBattleSnapshot.subUnits)'
```

Replace it with:

```ts
        'formatPendingFerryOrderSidebarLabel(S.gameState, ferry, battle)'
```

- [ ] **Step 20: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 21: Edit `static/index.html`**

Adds the header subtitle and the Orders badge, and rebuilds the three order lists as groups with a heading and a count.

1. In `static/index.html`, find this line. It occurs exactly once:

```html
  <link rel="stylesheet" href="frameChrome.css" />
```

Replace it with:

```html
  <link rel="stylesheet" href="frameChrome.css" />
  <link rel="stylesheet" href="consoleChrome.css" />
```

2. In `static/index.html`, find this line. It occurs exactly once:

```html
        <h2 id="console-title" class="console-title">Orders</h2>
```

Replace it with:

```html
        <h2 id="console-title" class="console-title">Orders</h2>
        <span id="console-subtitle" class="console-subtitle"></span>
```

3. In `static/index.html`, find these lines. Together they occur exactly once:

```html
        <p><strong>Movement orders</strong></p>
        <div id="pending-orders-list"></div>
        <p><strong>Ranged attacks</strong></p>
        <div id="ranged-attacks-list"></div>
        <p><strong>Air strikes</strong></p>
        <div id="air-strikes-list"></div>
```

Replace them with:

```html
        <div class="console-order-group">
          <h3 class="console-group-heading">Movement <span id="pending-orders-count" class="console-group-count">0</span></h3>
          <div id="pending-orders-list" class="console-order-list"></div>
        </div>
        <div class="console-order-group">
          <h3 class="console-group-heading">Ranged attacks <span id="ranged-attacks-count" class="console-group-count">0</span></h3>
          <div id="ranged-attacks-list" class="console-order-list"></div>
        </div>
        <div class="console-order-group">
          <h3 class="console-group-heading">Air strikes <span id="air-strikes-count" class="console-group-count">0</span></h3>
          <div id="air-strikes-list" class="console-order-list"></div>
        </div>
```

4. In `static/index.html`, find this line. It occurs exactly once:

```html
      <button type="button" id="console-tab-orders" class="console-tab" role="tab" aria-selected="true" aria-controls="console-panel-orders" data-control-tooltip="Show the selected unit and the orders queued for this turn or beat."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path></svg><span>Orders</span></button>
```

Replace it with:

```html
      <button type="button" id="console-tab-orders" class="console-tab" role="tab" aria-selected="true" aria-controls="console-panel-orders" data-control-tooltip="Show the selected unit and the orders queued for this turn or beat."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path></svg><span>Orders</span><span id="console-tab-orders-badge" class="console-tab-badge" hidden></span></button>
```

- [ ] **Step 22: Create `static/consoleChrome.css`**

Styles for the console's contents: the subtitle, the rail badges, the order groups, and the rows.

Create `static/consoleChrome.css` with exactly this content:

```css
/* Console contents: the header subtitle, the rail badges, and the Orders tab's groups and rows. The frame itself is in frameChrome.css. */

/* ---------- Header subtitle and rail badges ---------- */
.console-subtitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--chrome-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
/* The badge sits on the tab icon's upper-right corner; `.console-tab` is its positioning box. */
.console-tab-badge {
  position: absolute;
  top: 6px;
  left: calc(50% + 4px);
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--button-bg);
  border: 1px solid var(--chrome-accent-edge);
  color: var(--button-text);
  font-size: 10px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.console-tab-badge[hidden] {
  display: none;
}

/* ---------- Orders tab groups ---------- */
.console-order-group + .console-order-group {
  margin-top: 14px;
}
.console-group-heading {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--chrome-muted);
}
.console-group-count {
  margin-left: 6px;
  color: var(--chrome-text);
  font-variant-numeric: tabular-nums;
}
.console-order-list > .chrome-muted {
  display: block;
  padding: 2px 0;
}

/* ---------- Order rows ---------- */
/* One row: a select button holding the unit's name and its order's line, then the cancel ×. */
.console-order-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--chrome-divider);
  border-radius: 3px;
}
.console-order-row:has(> .console-order-select[aria-pressed="true"]) {
  background: color-mix(in srgb, var(--selection-mark) 12%, transparent);
}
.console-order-select {
  flex: 1 1 auto;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 0 14px 0 0;
  border: 0;
  background: transparent;
  color: var(--chrome-text);
  text-align: left;
}
.console-order-select:hover {
  background: transparent;
  color: var(--chrome-accent-edge);
}
/* A gold dot marks a row whose unit is selected, matching the map's selection color. */
.console-order-select[aria-pressed="true"]::after {
  content: "";
  position: absolute;
  right: 2px;
  top: 50%;
  width: 7px;
  height: 7px;
  margin-top: -3.5px;
  border-radius: 50%;
  background: var(--selection-mark);
}
.console-order-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.console-order-detail {
  color: var(--chrome-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.console-order-cancel {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--chrome-border);
  border-radius: 3px;
  background: transparent;
  color: var(--chrome-text);
  font-size: 14px;
  line-height: 1;
}
.console-order-cancel:hover {
  background: var(--chrome-bg-raised);
}
```

- [ ] **Step 23: Edit `static/shellChrome.css`**

Adds the `--selection-mark` color token for selected rows.

In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  --console-rail-width: 56px;
```

Replace it with:

```css
  --console-rail-width: 56px;
  /* Marks what the player has selected, in lists and on the map. */
  --selection-mark: #f2c14e;
```

- [ ] **Step 24: Edit `static/frameChrome.css`**

Lets a rail tab position its badge.

In `static/frameChrome.css`, find this line. It occurs exactly once:

```css
.console-tab {
```

Replace it with:

```css
.console-tab {
  position: relative;
```

- [ ] **Step 25: Create `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Moves the scene names and the shared sizes out of the checks file, so the frame checks, the new console and scenario checks, and the runner share them. Adds the names of the new scenes.

Create `scripts/ui-smoke/ui-smoke-scenes.cjs` with exactly this content:

```js
/**
 * Scene names, sizes, and small helpers shared by the UI smoke checks and the runner.
 *
 * Purpose: The frame checks, the console checks, the scenario checks, and the runner name scenes and compare boxes the
 *   same way.
 * When to use: Required by `ui-smoke-checks.cjs`, `ui-smoke-console-checks.cjs`, `ui-smoke-scenario-checks.cjs`, and
 *   `ui-smoke.cjs`.
 * Expected outcome: Plain constants and pure functions; nothing runs on load.
 * Exceptions: None.
 */
'use strict';

/**
 * Height of the top bar in CSS pixels.
 *
 * Purpose: The top bar, the map, and the console are all placed against this edge.
 * When to use: Geometry checks for the top bar, the map, the console, and the game menu.
 * Expected outcome: Matches `--topbar-height` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const TOPBAR_HEIGHT = 44;

/**
 * Width of the expanded console in CSS pixels: the content column plus the tab rail.
 *
 * Purpose: The map must end where the console starts.
 * When to use: The expanded-console geometry check.
 * Expected outcome: Matches `--console-content-width` plus `--console-rail-width` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const CONSOLE_EXPANDED_WIDTH = 376;

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
 *
 * Purpose: Keeps scene names in one place for the runner and the checks.
 * When to use: The runner passes one of these, optionally followed by `@<width>x<height>`, to `runChecks`.
 * Expected outcome: Strings only; the runner owns the order.
 * Exceptions: None.
 */
const SCENES = Object.freeze({
  newGameStartup: 'new-game-startup',
  strategic: 'strategic',
  opponentTab: 'opponent-tab',
  consoleCollapsed: 'console-collapsed',
  consoleExpandedAgain: 'console-expanded-again',
  gameMenuOpen: 'game-menu-open',
  gameMenuEscape: 'game-menu-escape',
  gameMenuOutside: 'game-menu-outside',
  readyTip: 'ready-tip',
  ordersQueued: 'orders-queued',
  smallWindow: 'small-window',
  matchReopened: 'match-reopened',
  battleStart: 'battle-start',
  battleSelection: 'battle-selection',
  battleOrders: 'battle-orders',
  newGameReopened: 'new-game-reopened',
  regionalStart: 'regional-start',
  regionalSelection: 'regional-selection',
  gameOverReopened: 'game-over-reopened',
});

/**
 * Scenes that show the new-game overlay.
 *
 * Purpose: The overlay hides the match chrome, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while the overlay is open.
 * Expected outcome: The first scene, the overlay opened from a match, and the finished match reopened.
 * Exceptions: None.
 */
const NEW_GAME_SCENES = Object.freeze([SCENES.newGameStartup, SCENES.newGameReopened, SCENES.gameOverReopened]);

/**
 * Scenes that show a match: every scene that is not a new-game scene.
 *
 * Purpose: A scene added to `SCENES` is covered by the match checks without editing them.
 * When to use: The `scenes` list of a check that applies while a match is on screen.
 * Expected outcome: Derived from `SCENES` and `NEW_GAME_SCENES`.
 * Exceptions: None.
 */
const MATCH_SCENES = Object.freeze(Object.values(SCENES).filter((scene) => !NEW_GAME_SCENES.includes(scene)));

/**
 * Reports whether two numbers are within one CSS pixel.
 *
 * Purpose: Layout boxes can land on fractional pixels; a one-pixel tolerance keeps checks stable.
 * When to use: Every geometry comparison in the check files.
 * Expected outcome: True when `|a - b| <= 1`.
 * Exceptions: None.
 */
function near(a, b) {
  return Math.abs(a - b) <= 1;
}

/**
 * Formats a box for a failure message.
 *
 * Purpose: Failure lines should show the numbers that failed.
 * When to use: Inside check failure messages.
 * Expected outcome: `x,y wxh` rounded to whole pixels, with ` (hidden)` when the element is not shown.
 * Exceptions: None.
 */
function fmt(b) {
  return `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}${b.shown ? '' : ' (hidden)'}`;
}

module.exports = {
  TOPBAR_HEIGHT,
  CONSOLE_EXPANDED_WIDTH,
  CONSOLE_COLLAPSED_WIDTH,
  SCENES,
  NEW_GAME_SCENES,
  MATCH_SCENES,
  near,
  fmt,
};
```

- [ ] **Step 26: Create `scripts/ui-smoke/ui-smoke-map.cjs`**

Lets the smoke run click units on the main map: it finds the map, finds a hex's point on screen, and selects or moves units the way a player would. It also opens a battle from its marker, queues a march inside it, and works out the saved-match change that puts both sides in one hex.

Create `scripts/ui-smoke/ui-smoke-map.cjs` with exactly this content:

```js
/**
 * Map actions for the UI smoke run: find the hexes of the fixed scenario, and click them the way a player would.
 *
 * Purpose: Scenes that need a selection or a queued order must click real units on the map. Units are drawn on a
 *   canvas, so the runner works out where a hex is from the game state and the main Leaflet map.
 * When to use: From `ui-smoke.cjs`, after the scenario match has started.
 * Expected outcome: Each action waits until the page shows its result, or throws an error naming what was missing.
 * Exceptions: Throws when the main map cannot be found, or when the scenario has no hex the action needs.
 */
'use strict';

const h3 = require('h3-js');

/**
 * Name of the page global that holds the main Leaflet map after `captureMainMap`.
 *
 * Purpose: Leaflet keeps no list of its maps, so the smoke run keeps its own handle. The app never reads it.
 * When to use: Only inside this file's `page.evaluate` calls.
 * Expected outcome: Set once per run.
 * Exceptions: None.
 */
const MAP_HANDLE = '__uiSmokeMainMap';

/**
 * How long each map action may take, in milliseconds.
 *
 * Purpose: Selection uses a short deferred timer, a march order makes a round trip to the main process, and a battle
 *   builds its own map when it opens.
 * When to use: `settle` after a click, `order` while waiting for a selection or a queued order to appear, `capture`
 *   while finding the main map, and `battle` while a battle opens.
 * Expected outcome: Generous fixed limits; the waits end as soon as the page shows the result.
 * Exceptions: None.
 */
const MAP_WAIT_MS = Object.freeze({ settle: 700, order: 8000, capture: 300, battle: 60000 });

/**
 * The unit types that march over land, in the order the smoke run tries them.
 *
 * Purpose: Marches and battles use land units; armor comes first because the scenario's lone armor unit is the
 *   one the first march scene moves.
 * When to use: The default unit types of `queueLoneUnitMarch`, and choosing the battle's units.
 * Expected outcome: Armor, then infantry.
 * Exceptions: None.
 */
const LAND_UNIT_TYPES = Object.freeze(['armor', 'infantry']);

/**
 * How many mouse-wheel notches the run may zoom in to reveal a battle marker.
 *
 * Purpose: Battle markers show only when the map is zoomed in past its starting zoom.
 * When to use: Only by `enterBattleAt`.
 * Expected outcome: Enough notches for the marker at any window size the run uses.
 * Exceptions: None.
 */
const MAX_BATTLE_ZOOM_NOTCHES = 6;

/**
 * Finds the main Leaflet map and keeps a handle to it in the page.
 *
 * Purpose: Turning a hex into a window point needs the map's projection.
 * When to use: Once, after the match has started and before any other action in this file.
 * Expected outcome: The handle is set. Leaflet map methods are wrapped only for the moment it takes to see which
 *   map answers for `#main-map`, then restored.
 * Exceptions: Throws when no map answers for `#main-map`.
 */
async function captureMainMap(page) {
  const found = await page.evaluate(async ({ handle, waitMs }) => {
    const proto = window.L.Map.prototype;
    const names = ['latLngToContainerPoint', 'containerPointToLatLng', 'mouseEventToContainerPoint', 'getZoom', 'getBounds', 'getContainer', 'getSize'];
    const originals = new Map(names.map((name) => [name, proto[name]]));
    const seen = new Set();
    for (const name of names) {
      const original = originals.get(name);
      proto[name] = function wrapped(...args) {
        seen.add(this);
        return original.apply(this, args);
      };
    }
    try {
      // Any redraw or hover asks the map for its projection; a pointer move over the map causes both.
      const mapEl = document.getElementById('main-map');
      const box = mapEl.getBoundingClientRect();
      mapEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }));
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } finally {
      for (const name of names) proto[name] = originals.get(name);
    }
    const main = [...seen].find((map) => map.getContainer().id === 'main-map');
    if (main) window[handle] = main;
    return Boolean(main);
  }, { handle: MAP_HANDLE, waitMs: MAP_WAIT_MS.capture });
  if (!found) throw new Error('the main Leaflet map did not answer for #main-map');
}

/**
 * Returns the window point at the center of a hex.
 *
 * Purpose: Units are drawn at their hex's center, so a click there hits the unit.
 * When to use: After `captureMainMap`.
 * Expected outcome: `{ x, y }` in CSS pixels of the window.
 * Exceptions: Throws when the hex index is not valid.
 */
async function hexClientPoint(page, h3Index) {
  const [lat, lng] = h3.cellToLatLng(h3Index);
  return page.evaluate(({ handle, latLng }) => {
    const map = window[handle];
    const point = map.latLngToContainerPoint(latLng);
    const box = map.getContainer().getBoundingClientRect();
    return { x: box.x + point.x, y: box.y + point.y };
  }, { handle: MAP_HANDLE, latLng: [lat, lng] });
}

/**
 * Reads the game state the renderer reads.
 *
 * Purpose: The scenario's units and hexes come from the running match, not from fixed numbers.
 * When to use: Before choosing which hex to click.
 * Expected outcome: The same snapshot `window.gameApi.getGameState()` returns.
 * Exceptions: Propagates IPC errors.
 */
async function readGameState(page) {
  return page.evaluate(() => window.gameApi.getGameState());
}

/**
 * Counts every unit, of either side, in each hex.
 *
 * Purpose: A click on a hex with one unit selects it; a click on a hex with more opens the unit list.
 * When to use: Choosing which hex to click, on the world map or in a battle.
 * Expected outcome: A map from hex index to unit count.
 * Exceptions: None.
 */
function unitCountByHex(units) {
  const countByHex = new Map();
  for (const unit of units) countByHex.set(unit.h3Index, (countByHex.get(unit.h3Index) || 0) + 1);
  return countByHex;
}

/**
 * Lists the player's units that stand alone in their hex, of the given types, in type order.
 *
 * Purpose: A plain click on such a hex selects that unit without opening the unit list.
 * When to use: Before selecting a lone unit, on the world map or in a battle. Pass one type or a list.
 * Expected outcome: Every unit of the first type, then of the next, each in the units' own order.
 * Exceptions: None; the list may be empty.
 */
function loneHumanUnits(units, unitTypes) {
  const countByHex = unitCountByHex(units);
  return [].concat(unitTypes).flatMap((unitType) => units.filter((u) => u.player === 'human' && u.unitType === unitType && countByHex.get(u.h3Index) === 1));
}

/**
 * Finds the player's first unit that stands alone in its hex, of the given types.
 *
 * Purpose: Scenes that need one selected unit start from such a unit.
 * When to use: Before `selectLoneUnit`.
 * Expected outcome: The first unit `loneHumanUnits` lists.
 * Exceptions: Throws when there is none.
 */
function loneHumanUnit(units, unitTypes) {
  const unit = loneHumanUnits(units, unitTypes)[0];
  if (!unit) throw new Error(`no hex holds a single human unit of type ${[].concat(unitTypes).join(' or ')}`);
  return unit;
}

/**
 * Clicks a lone unit's hex and waits until it is selected.
 *
 * Purpose: Starts every scene that needs one selected unit.
 * When to use: After `captureMainMap`, while nothing is selected.
 * Expected outcome: The selected-unit line names a unit. Returns the unit's hex.
 * Exceptions: Throws when the scenario has no such unit, or the selection does not appear.
 */
async function selectLoneUnit(page, state, unitType) {
  const unit = loneHumanUnit(state.units, unitType);
  await selectUnitInItsHex(page, unit);
  return unit.h3Index;
}

/**
 * Clicks a unit that stands alone in its hex and waits until a unit is selected.
 *
 * Purpose: World-map units and battle units are selected the same way.
 * When to use: For a unit `loneHumanUnits` returned, while nothing else is selected.
 * Expected outcome: The selected-unit line names a unit instead of an em dash.
 * Exceptions: Throws a Playwright timeout when the selection does not appear.
 */
async function selectUnitInItsHex(page, unit) {
  const point = await hexClientPoint(page, unit.h3Index);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => {
    const readout = document.getElementById('sidebar-selected-unit');
    return readout !== null && readout.textContent.trim() !== '' && readout.textContent.trim() !== '—';
  }, null, { timeout: MAP_WAIT_MS.order });
  await page.waitForTimeout(MAP_WAIT_MS.settle);
}

/**
 * Lists empty neighbors of a hex inside the player's home region, land first.
 *
 * Purpose: A march into an empty home hex next door is always a legal short order in the scenario.
 * When to use: Choosing where to send a selected land unit.
 * Expected outcome: Neighbor indexes that hold no unit, are in the human home region, and are not water.
 * Exceptions: None.
 */
function marchDestinations(state, fromHex) {
  const home = new Set(state.humanHomeRegionHexes || []);
  const occupied = new Set(state.units.map((u) => u.h3Index));
  const kindByHex = new Map(state.hexes.map((hex) => [hex.h3Index, hex.terrainKind]));
  return h3.gridDisk(fromHex, 1).filter((hex) => hex !== fromHex && home.has(hex) && !occupied.has(hex) && kindByHex.get(hex) !== 'water');
}

/**
 * Selects a unit and double-clicks each destination in turn until the Movement group counts one order.
 *
 * Purpose: World-map and battle marches are queued the same way; a destination the rules refuse is skipped.
 * When to use: While nothing is queued in the Movement group, after `captureMainMap`.
 * Expected outcome: True once the Movement count reads 1; false when no destination took the order.
 * Exceptions: Throws a Playwright timeout when the unit cannot be selected.
 */
async function queueMarchToFirstFree(page, unit, destinations) {
  for (const destination of destinations) {
    await selectUnitInItsHex(page, unit);
    const point = await hexClientPoint(page, destination);
    await page.mouse.dblclick(point.x, point.y);
    const queued = await page.waitForFunction(() => document.getElementById('pending-orders-count')?.textContent === '1', null, { timeout: MAP_WAIT_MS.order })
      .then(() => true, () => false);
    if (queued) return true;
  }
  return false;
}

/**
 * Queues a one-hex march with the first lone land unit that can make one.
 *
 * Purpose: Gives the Orders tab one movement row to show.
 * When to use: After `captureMainMap`, while nothing is queued. Armor is tried first, then infantry.
 * Expected outcome: The Movement count reads 1. Returns the unit.
 * Exceptions: Throws when no lone land unit has a neighbor that takes the order.
 */
async function queueLoneUnitMarch(page, unitTypes = LAND_UNIT_TYPES) {
  const state = await readGameState(page);
  for (const unit of loneHumanUnits(state.units, unitTypes)) {
    if (await queueMarchToFirstFree(page, unit, marchDestinations(state, unit.h3Index))) return unit;
  }
  throw new Error('no lone land unit could queue a one-hex march');
}

/**
 * Reads the active battle from the game state.
 *
 * Purpose: Battle units are drawn on a canvas, so the run finds them through the battle's own record.
 * When to use: While a battle is open.
 * Expected outcome: The battle record, with `subUnits` and `tacticalChildH3Indexes`, or null outside a battle.
 * Exceptions: Propagates IPC errors.
 */
async function readBattle(page) {
  return page.evaluate(() => window.gameApi.getGameState().then((state) => state.tacticalBattleSession || null));
}

/**
 * Zooms the map in on a hex until its battle marker shows, then opens the battle.
 *
 * Purpose: A player starts a battle from the marker on a hex both sides hold; the marker shows only when zoomed in.
 * When to use: During world-map planning, on a hex that holds units of both sides, after `captureMainMap`.
 * Expected outcome: The top bar reads "Beat 1 · Tactical planning".
 * Exceptions: Throws when the marker never shows or the battle does not open within a minute.
 */
async function enterBattleAt(page, h3Index) {
  const marker = `#tactical-entry-layer .tactical-entry-btn[data-h3-index="${h3Index}"]`;
  for (let notch = 0; notch < MAX_BATTLE_ZOOM_NOTCHES && !(await page.isVisible(marker)); notch += 1) {
    const point = await hexClientPoint(page, h3Index);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(MAP_WAIT_MS.settle);
  }
  await page.click(marker);
  await page.waitForFunction(() => document.getElementById('topbar-turn-phase')?.textContent === 'Beat 1 · Tactical planning', null, { timeout: MAP_WAIT_MS.battle });
  await page.waitForTimeout(MAP_WAIT_MS.settle);
}

/**
 * Selects one of the player's battle units that stands alone in its cell, infantry first.
 *
 * Purpose: Battle scenes check the selection and a battle march for one unit.
 * When to use: While a battle is in planning, after `enterBattleAt`.
 * Expected outcome: The unit is the only selected unit. Returns it.
 * Exceptions: Throws when no battle unit of the player stands alone.
 */
async function selectLoneBattleUnit(page) {
  const battle = await readBattle(page);
  const unit = loneHumanUnit(battle.subUnits, ['infantry', ...LAND_UNIT_TYPES]);
  await selectUnitInItsHex(page, unit);
  return unit;
}

/**
 * Queues a one-cell battle march for a battle unit.
 *
 * Purpose: Gives the Orders tab a battle row to show.
 * When to use: While a battle is in planning and nothing is queued.
 * Expected outcome: The Movement count reads 1.
 * Exceptions: Throws when no neighboring cell takes the order.
 */
async function queueBattleMarch(page, unit) {
  const battle = await readBattle(page);
  const cells = new Set(battle.tacticalChildH3Indexes);
  const occupied = new Set(battle.subUnits.map((u) => u.h3Index));
  const kindByCell = battle.tacticalTerrainKindByH3 || {};
  const destinations = h3.gridDisk(unit.h3Index, 1)
    .filter((cell) => cell !== unit.h3Index && cells.has(cell) && !occupied.has(cell) && kindByCell[cell] !== 'water');
  if (!(await queueMarchToFirstFree(page, unit, destinations))) throw new Error('no neighboring cell took a battle march');
}

/**
 * Works out the saved-match change that gives the reopened match a hex both sides hold.
 *
 * Purpose: A battle starts only on such a hex, and play cannot make one on cue. The change moves every enemy land unit
 *   into the hex where the player has the most land units.
 * When to use: With the game state read just before the app closes; pass the result to `editSavedMatch`.
 * Expected outcome: `{ h3Index, statements }`, where `h3Index` is the hex that will hold both sides.
 * Exceptions: Throws when either side has no land unit left.
 */
function contestedHexEdit(state) {
  const isLand = (u) => LAND_UNIT_TYPES.includes(u.unitType);
  const landCountByHex = unitCountByHex(state.units.filter((u) => u.player === 'human' && isLand(u)));
  const [h3Index] = [...landCountByHex.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [null, 0]);
  const enemies = state.units.filter((u) => u.player !== 'human' && isLand(u));
  if (!h3Index || enemies.length === 0) throw new Error('a battle needs a land unit on each side');
  return { h3Index, statements: enemies.map((enemy) => ({ sql: 'UPDATE units SET h3_index = ? WHERE id = ?', params: [h3Index, enemy.id] })) };
}

module.exports = {
  LAND_UNIT_TYPES,
  captureMainMap,
  contestedHexEdit,
  enterBattleAt,
  queueBattleMarch,
  selectLoneBattleUnit,
  readGameState,
  selectLoneUnit,
  queueLoneUnitMarch,
};
```

- [ ] **Step 27: Create `scripts/ui-smoke/ui-smoke-session.cjs`**

A new file. It starts the app on the run's throwaway user-data folder, and changes the saved match while the app is closed, retrying for a few seconds while the closed app still holds the file.

Create `scripts/ui-smoke/ui-smoke-session.cjs` with exactly this content:

```js
/**
 * Starts the app for the UI smoke run, and changes its saved match between launches.
 *
 * Purpose: The run plays more than one session on the same throwaway user-data folder, so a reopened match, a battle,
 *   and a finished match can be checked as a player would meet them.
 * When to use: From `ui-smoke.cjs`.
 * Expected outcome: Each launch returns the app and its window, with page errors collected in the run's report.
 * Exceptions: Launch and edit failures are thrown to the runner, which stops the run and reports them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { _electron: electron } = require('playwright-core');

/**
 * Repository root, two levels above this file.
 *
 * Purpose: The app is launched from the repository, and the run's output folder lives under it.
 * When to use: Launch arguments, the working directory, and the output path.
 * Expected outcome: An absolute path.
 * Exceptions: None.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * The saved match's file name inside the user-data folder, such as `game-baseline-v12.sqlite`.
 *
 * Purpose: The version in the name changes with the schema, so the file is found by pattern, not by a fixed name.
 * When to use: Only by `savedMatchFile`.
 * Expected outcome: Matches the name `src/main/gameDb.ts` gives the file.
 * Exceptions: None.
 */
const SAVED_MATCH_FILE = /^game-baseline-v\d+\.sqlite$/;

/**
 * The saved-match change that ends the match with the opponent as the winner.
 *
 * Purpose: The game-over scene needs a finished match, and play cannot finish one in a smoke run.
 * When to use: Pass to `editSavedMatch` before the last session.
 * Expected outcome: The reopened match opens on the game-over screen with a loss message. The keys are the ones
 *   `src/main/gameDb/gameConfigKv.ts` writes when a match ends.
 * Exceptions: None.
 */
const FINISHED_MATCH_EDIT = Object.freeze([
  { sql: "INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_over', '1')", params: [] },
  { sql: "INSERT OR REPLACE INTO game_config (key, value) VALUES ('winner', 'opponent')", params: [] },
]);

/**
 * Starts the built app on a user-data folder and waits for its window.
 *
 * Purpose: Every session of the run starts the same way, and every page error lands in the report.
 * When to use: Once per session. Pass the same folder to reopen the match the previous session left.
 * Expected outcome: `{ app, page }` once the window's document has loaded. Uncaught page errors are added to
 *   `report.pageErrors`, and console errors to `report.consoleErrors`.
 * Exceptions: Throws when the app does not start within 60 seconds.
 */
async function launchApp(userDataDir, report) {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [REPO_ROOT],
    cwd: REPO_ROOT,
    env: { ...process.env, AGENT_WARS_USER_DATA_DIR: userDataDir },
    timeout: 60000,
  });
  const page = await app.firstWindow();
  page.on('pageerror', (err) => report.pageErrors.push(err && err.message ? err.message : String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text());
  });
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

/**
 * Finds the saved match's file in a user-data folder.
 *
 * Purpose: The edit must change the file the app reopens.
 * When to use: Only by `editSavedMatch`, after the app has closed.
 * Expected outcome: The file's absolute path.
 * Exceptions: Throws unless exactly one file matches `SAVED_MATCH_FILE`.
 */
function savedMatchFile(userDataDir) {
  const matches = fs.readdirSync(userDataDir).filter((name) => SAVED_MATCH_FILE.test(name));
  if (matches.length !== 1) throw new Error(`expected one saved match in ${userDataDir}, found ${matches.length}`);
  return path.join(userDataDir, matches[0]);
}

/**
 * How many times, and how far apart, the run tries to change the saved match.
 *
 * Purpose: On some systems the closed app's files stay locked for a moment after it exits.
 * When to use: Only by `editSavedMatch`.
 * Expected outcome: A few short retries before the run gives up.
 * Exceptions: None.
 */
const EDIT_ATTEMPTS = Object.freeze({ count: 5, delayMs: 1000 });

/**
 * Changes the saved match while the app is closed.
 *
 * Purpose: Sets up a state that play cannot reach on cue, such as a hex both sides hold or a finished match.
 * When to use: Between two sessions, after `app.close()` has returned. Only on the run's throwaway folder.
 * Expected outcome: Every statement runs in one transaction under Electron's own Node, which can load the SQLite
 *   module the smoke run built for Electron. A failed attempt is retried after a short wait.
 * Exceptions: Throws, with the script's output, when the file is missing or the last attempt fails.
 */
async function editSavedMatch(userDataDir, statements) {
  const script = path.join(__dirname, 'ui-smoke-db-edit.cjs');
  const args = [script, savedMatchFile(userDataDir), JSON.stringify(statements)];
  for (let attempt = 1; ; attempt += 1) {
    try {
      execFileSync(require('electron'), args, { cwd: REPO_ROOT, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' });
      return;
    } catch (err) {
      if (attempt >= EDIT_ATTEMPTS.count) {
        const output = `${err.stdout || ''}${err.stderr || ''}`.trim();
        throw new Error(`could not change the saved match: ${output || err.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, EDIT_ATTEMPTS.delayMs));
    }
  }
}

module.exports = {
  FINISHED_MATCH_EDIT,
  REPO_ROOT,
  launchApp,
  editSavedMatch,
};
```

- [ ] **Step 28: Create `scripts/ui-smoke/ui-smoke-db-edit.cjs`**

A new file: the small script that makes that change. The run starts it under Electron's own Node, because the smoke run builds the SQLite module for Electron. It runs the given statements in one transaction.

Create `scripts/ui-smoke/ui-smoke-db-edit.cjs` with exactly this content:

```js
/**
 * Changes a saved match for the UI smoke run, between two launches of the app.
 *
 * Purpose: Some scenes need a match state that play cannot reach on cue: a hex both sides hold, so a battle can
 *   start, or a finished match. This script writes that state into the smoke run's throwaway copy of the match.
 * When to use: Only from `editSavedMatch` in `ui-smoke-session.cjs`, while the app is closed. It runs under Electron's
 *   own Node (`ELECTRON_RUN_AS_NODE=1`), because the smoke run builds the SQLite module for Electron.
 * Expected outcome: Runs every statement in one transaction, prints how many rows each changed, and exits 0.
 * Exceptions: Exits 1, printing the error, when the file cannot be opened or a statement fails. Nothing is written then.
 *
 * Arguments: the database file, then a JSON array of `{ "sql": string, "params": array }`.
 */
'use strict';

const Database = require('better-sqlite3');

/**
 * Opens the match file and runs the statements in one transaction.
 *
 * Purpose: Either every change lands or none does, so a failed edit cannot leave a half-changed match.
 * When to use: Once, from the command line.
 * Expected outcome: One output line per statement with its changed-row count.
 * Exceptions: Throws when the file or a statement is invalid; the caller turns that into exit code 1.
 */
function main() {
  const [dbPath, statementsJson] = process.argv.slice(2);
  const statements = JSON.parse(statementsJson);
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    const runAll = db.transaction(() => statements.map(({ sql, params }) => db.prepare(sql).run(...(params || [])).changes));
    runAll().forEach((changes, i) => console.log(`statement ${i + 1}: ${changes} row(s) changed`));
  } finally {
    db.close();
  }
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
}
```

- [ ] **Step 29: Create `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

The checks of what the console shows, starting with the Orders tab's groups and rows.

Create `scripts/ui-smoke/ui-smoke-console-checks.cjs` with exactly this content:

```js
/**
 * Checks of what the console's tabs show, for the UI smoke run.
 *
 * Purpose: Keeps the content checks apart from the frame checks, so each table stays readable.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the frame's rows.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES } = require('./ui-smoke-scenes.cjs');

/**
 * The line under a queued order's unit name: an arrow, a two-character hex code, and the distance in hexes.
 *
 * Purpose: The runner queues a short march, so its row must read like `→ E5 · 1h`.
 * When to use: Checks of a world-map movement row.
 * Expected outcome: Matches a world-map row with no ferry or strike note.
 * Exceptions: None.
 */
const WORLD_ORDER_DETAIL = /^→ [0-9A-Z]{2} · \d+h$/;

/**
 * The console's content checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a rule about a console tab needs a machine check.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const CONSOLE_CHECKS = Object.freeze([
  {
    name: 'orders-header-empty',
    scenes: [SCENES.strategic],
    needs: ['#console-subtitle', '#console-tab-orders-badge'],
    run: (p, el) => {
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== '0 queued for turn 1') return `subtitle reads "${subtitle}", expected "0 queued for turn 1"`;
      return el('#console-tab-orders-badge').shown ? 'the Orders badge shows while nothing is queued' : null;
    },
  },
  {
    name: 'order-groups-empty',
    scenes: [SCENES.strategic],
    needs: [
      '#pending-orders-count',
      '#ranged-attacks-count',
      '#air-strikes-count',
      '#pending-orders-list',
      '#ranged-attacks-list',
      '#air-strikes-list',
    ],
    run: (p, el) => {
      const problems = [];
      for (const group of ['pending-orders', 'ranged-attacks', 'air-strikes']) {
        const count = el(`#${group}-count`).text;
        const list = el(`#${group}-list`).text;
        if (count !== '0' || list !== 'None') problems.push(`${group} count "${count}" list "${list}"`);
      }
      return problems.length === 0 ? null : `expected count "0" and "None": ${problems.join('; ')}`;
    },
  },
  {
    name: 'orders-header-queued',
    scenes: [SCENES.ordersQueued],
    needs: ['#console-subtitle', '#console-tab-orders-badge'],
    run: (p, el) => {
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== '1 queued for turn 1') return `subtitle reads "${subtitle}", expected "1 queued for turn 1"`;
      const badge = el('#console-tab-orders-badge');
      return badge.shown && badge.text === '1' ? null : `the Orders badge reads "${badge.text}"${badge.shown ? '' : ' and is hidden'}`;
    },
  },
  {
    name: 'movement-row-selected',
    scenes: [SCENES.ordersQueued],
    needs: [
      '#pending-orders-count',
      '#pending-orders-list .console-order-select',
      '#pending-orders-list .console-order-name',
      '#pending-orders-list .console-order-detail',
      '#sidebar-selected-unit',
    ],
    run: (p, el) => {
      const count = el('#pending-orders-count').text;
      if (count !== '1') return `the Movement count reads "${count}", expected "1"`;
      const detail = el('#pending-orders-list .console-order-detail').text;
      if (!WORLD_ORDER_DETAIL.test(detail)) return `the row's line reads "${detail}", expected something like "→ E5 · 1h"`;
      if (el('#pending-orders-list .console-order-select').pressed !== 'true') return 'the clicked row is not marked as selected';
      const name = el('#pending-orders-list .console-order-name').text;
      const selected = el('#sidebar-selected-unit').text;
      return name !== '' && name === selected ? null : `the row names "${name}" but the selected unit is "${selected}"`;
    },
  },
]);

module.exports = { CONSOLE_CHECKS };
```

- [ ] **Step 30: Create `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`**

A new file: the checks of the later scenes. The Orders tab must fit the 800 × 600 minimum window, keep its march after the app restarts, read "beat 1" and a code like "E8.K3" inside a battle, and start empty in a regional match. The finished match must open on "You lose."

Create `scripts/ui-smoke/ui-smoke-scenario-checks.cjs` with exactly this content:

```js
/**
 * Checks for the UI smoke run's later scenarios: the small window, the reopened match, a battle, a regional match, and
 * a finished match.
 *
 * Purpose: The console must hold up beyond the first world-map turn. These rows check them in
 *   the scenes that the second and third sessions of the run add.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the console's rows.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES } = require('./ui-smoke-scenes.cjs');

/**
 * A world-map order row's line: an arrow, a two-character hex code, and the distance in hexes.
 *
 * Purpose: The reopened match lists the march queued before the app closed.
 * When to use: Checks of a world-map movement row.
 * Expected outcome: Matches a row with no ferry or strike note, such as `→ E5 · 1h`.
 * Exceptions: None.
 */
const WORLD_ORDER_DETAIL = /^→ [0-9A-Z]{2} · \d+h$/;

/**
 * A battle order row's line: an arrow, the battle's hex code and the cell's code, and the distance in cells.
 *
 * Purpose: Battle rows name the cell inside the battle, such as `→ E8.K3 · 1h`.
 * When to use: Checks of a battle movement row.
 * Expected outcome: Matches a battle row with no note.
 * Exceptions: None.
 */
const BATTLE_ORDER_DETAIL = /^→ [0-9A-Z]{2}\.[0-9A-Z]{2} · \d+h$/;

/**
 * Reads the turn number from the top bar's turn line, such as "Turn 2 · Planning".
 *
 * Purpose: The reopened match's turn depends on how far the first session got.
 * When to use: Checks that compare the Orders subtitle with the turn.
 * Expected outcome: The number, or null when the line is not a world-map planning line.
 * Exceptions: None.
 */
function planningTurnNumber(turnLine) {
  const match = /^Turn (\d+) · Planning$/.exec(turnLine);
  return match ? Number(match[1]) : null;
}

/**
 * The scenario checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a later scenario needs a machine check.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const SCENARIO_CHECKS = Object.freeze([
  {
    name: 'orders-fit-small-window',
    scenes: [SCENES.smallWindow],
    needs: ['#console-panel-orders'],
    run: (p, el) => {
      const panel = el('#console-panel-orders');
      return panel.scrollWidth <= panel.clientWidth + 1 ? null : `the Orders tab is ${panel.scrollWidth}px wide in ${panel.clientWidth}px`;
    },
  },
  {
    name: 'orders-after-reopen',
    scenes: [SCENES.matchReopened],
    needs: ['#topbar-turn-phase', '#console-subtitle', '#pending-orders-list .console-order-detail', '#console-tab-orders-badge'],
    run: (p, el) => {
      const turn = planningTurnNumber(el('#topbar-turn-phase').text);
      if (turn === null) return `the top bar reads "${el('#topbar-turn-phase').text}", expected world-map planning`;
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== `1 queued for turn ${turn}`) return `the subtitle reads "${subtitle}", expected "1 queued for turn ${turn}"`;
      const detail = el('#pending-orders-list .console-order-detail').text;
      if (!WORLD_ORDER_DETAIL.test(detail)) return `the Movement row reads "${detail}"`;
      const badge = el('#console-tab-orders-badge');
      return badge.shown && badge.text === '1' ? null : `the Orders badge reads "${badge.text}"${badge.shown ? '' : ' and is hidden'}`;
    },
  },
  {
    name: 'orders-battle-start',
    scenes: [SCENES.battleStart],
    needs: ['#topbar-turn-phase', '#console-subtitle'],
    run: (p, el) => {
      const line = `${el('#topbar-turn-phase').text} / ${el('#console-subtitle').text}`;
      return line === 'Beat 1 · Tactical planning / 0 queued for beat 1'
        ? null
        : `the top bar and the Orders subtitle read "${line}", expected "Beat 1 · Tactical planning / 0 queued for beat 1"`;
    },
  },
  {
    name: 'orders-battle-march',
    scenes: [SCENES.battleOrders],
    needs: ['#console-subtitle', '#pending-orders-list .console-order-detail'],
    run: (p, el) => {
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== '1 queued for beat 1') return `the subtitle reads "${subtitle}", expected "1 queued for beat 1"`;
      const detail = el('#pending-orders-list .console-order-detail').text;
      return BATTLE_ORDER_DETAIL.test(detail) ? null : `the battle row reads "${detail}", expected a line like "→ E8.K3 · 1h"`;
    },
  },
  {
    name: 'orders-regional-start',
    scenes: [SCENES.regionalStart],
    needs: ['#topbar-turn-phase', '#console-subtitle', '#pending-orders-list'],
    run: (p, el) => {
      const line = `${el('#topbar-turn-phase').text} / ${el('#console-subtitle').text}`;
      if (line !== 'Turn 1 · Planning / 0 queued for turn 1') return `the top bar and the Orders subtitle read "${line}"`;
      return el('#pending-orders-list').text === 'None' ? null : `the Movement group reads "${el('#pending-orders-list').text}"`;
    },
  },
  {
    name: 'game-over-message',
    scenes: [SCENES.gameOverReopened],
    needs: ['#game-over-overlay', '#game-over-message'],
    run: (p, el) => {
      if (!el('#game-over-overlay').shown) return 'the game-over screen is not shown';
      const message = el('#game-over-message').text;
      return message === 'You lose.' ? null : `the game-over message reads "${message}", expected "You lose."`;
    },
  },
  {
    name: 'selection-readout',
    scenes: [SCENES.battleSelection, SCENES.regionalSelection],
    needs: ['#sidebar-selected-unit'],
    run: (p, el) => {
      const readout = el('#sidebar-selected-unit').text;
      return readout !== '' && readout !== '—' ? null : `the selected-unit line reads "${readout}"`;
    },
  },
]);

module.exports = { SCENARIO_CHECKS };
```

- [ ] **Step 31: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

Reads the shared scene module, adds the console and scenario checks to the run, and probes `aria-pressed`.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Height of the top bar in CSS pixels.
 *
 * Purpose: The top bar, the map, and the console are all placed against this edge.
 * When to use: Geometry checks for the top bar, the map, the console, and the game menu.
 * Expected outcome: Matches `--topbar-height` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const TOPBAR_HEIGHT = 44;

/**
 * Width of the expanded console in CSS pixels: the content column plus the tab rail.
 *
 * Purpose: The map must end where the console starts.
 * When to use: The expanded-console geometry check.
 * Expected outcome: Matches `--console-content-width` plus `--console-rail-width` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const CONSOLE_EXPANDED_WIDTH = 376;

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
 *
 * Purpose: Keeps scene names in one place for the runner and the checks.
 * When to use: The runner passes one of these, optionally followed by `@<width>x<height>`, to `runChecks`.
 * Expected outcome: Strings only; the runner owns the order.
 * Exceptions: None.
 */
const SCENES = Object.freeze({
  newGameStartup: 'new-game-startup',
  strategic: 'strategic',
  opponentTab: 'opponent-tab',
  consoleCollapsed: 'console-collapsed',
  consoleExpandedAgain: 'console-expanded-again',
  gameMenuOpen: 'game-menu-open',
  gameMenuEscape: 'game-menu-escape',
  gameMenuOutside: 'game-menu-outside',
  readyTip: 'ready-tip',
  newGameReopened: 'new-game-reopened',
});

/**
 * Scenes that show the new-game overlay.
 *
 * Purpose: The overlay hides the match chrome, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while the overlay is open.
 * Expected outcome: The first scene and the last scene of every run.
 * Exceptions: None.
 */
const NEW_GAME_SCENES = Object.freeze([SCENES.newGameStartup, SCENES.newGameReopened]);

/**
 * Scenes that show a match: every scene that is not a new-game scene.
 *
 * Purpose: A scene added to `SCENES` is covered by the match checks without editing them.
 * When to use: The `scenes` list of a check that applies while a match is on screen.
 * Expected outcome: Derived from `SCENES` and `NEW_GAME_SCENES`.
 * Exceptions: None.
 */
const MATCH_SCENES = Object.freeze(Object.values(SCENES).filter((scene) => !NEW_GAME_SCENES.includes(scene)));
```

Replace them with:

```js
const {
  TOPBAR_HEIGHT,
  CONSOLE_EXPANDED_WIDTH,
  CONSOLE_COLLAPSED_WIDTH,
  SCENES,
  NEW_GAME_SCENES,
  MATCH_SCENES,
  near,
  fmt,
} = require('./ui-smoke-scenes.cjs');
const { CONSOLE_CHECKS } = require('./ui-smoke-console-checks.cjs');
const { SCENARIO_CHECKS } = require('./ui-smoke-scenario-checks.cjs');
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
 *   null when the selector matches nothing, otherwise its box, text, and the attributes the checks use.
```

Replace it with:

```js
 *   null when the selector matches nothing, otherwise the first match's box, text, and the attributes the checks use.
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
      expanded: el.getAttribute('aria-expanded'),
```

Replace it with:

```js
      expanded: el.getAttribute('aria-expanded'),
      pressed: el.getAttribute('aria-pressed'),
```

4. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
 * Reports whether two numbers are within one CSS pixel.
 *
 * Purpose: Layout boxes can land on fractional pixels; a one-pixel tolerance keeps checks stable.
 * When to use: Every geometry comparison in this file.
 * Expected outcome: True when `|a - b| <= 1`.
 * Exceptions: None.
 */
function near(a, b) {
  return Math.abs(a - b) <= 1;
}

/**
 * Formats a box for a failure message.
 *
 * Purpose: Failure lines should show the numbers that failed.
 * When to use: Inside check failure messages.
 * Expected outcome: `x,y wxh` rounded to whole pixels, with ` (hidden)` when the element is not shown.
 * Exceptions: None.
 */
function fmt(b) {
  return `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}${b.shown ? '' : ' (hidden)'}`;
}

/**
 * The checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a layout rule needs a machine check. `needs` lists every selector the row reads;
 *   `run(p, el)` gets the probe and a lookup for those selectors, and returns null on success or a failure message.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const CHECKS = Object.freeze([
```

Replace them with:

```js
 * The frame's checks, one row each: the top bar, the map, the console's shell, and the game menu.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a frame layout rule needs a machine check. `needs` lists every selector the row reads;
 *   `run(p, el)` gets the probe and a lookup for those selectors, and returns null on success or a failure message.
 *   Checks of what the console's tabs show belong in `ui-smoke-console-checks.cjs`, and checks of the later scenes in
 *   `ui-smoke-scenario-checks.cjs`.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const FRAME_CHECKS = Object.freeze([
```

5. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Lists every selector the checks read.
```

Replace them with:

```js
/**
 * Every check the run applies: the frame's, then the console's, then the later scenarios'.
 *
 * Purpose: The runner and `probeSelectors` read one list.
 * When to use: The default `checks` argument of `probeSelectors` and `runChecks`.
 * Expected outcome: Frame checks first, so the report reads from the outside in.
 * Exceptions: None.
 */
const CHECKS = Object.freeze([...FRAME_CHECKS, ...CONSOLE_CHECKS, ...SCENARIO_CHECKS]);

/**
 * Lists every selector the checks read.
```

- [ ] **Step 32: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Plays three sessions on one throwaway user-data folder. The first adds the "orders-queued" scene (queue a one-hex march with the lone armor unit, then select it again from its row) and the small-window scene. Between sessions the run moves the enemy's land units into one of the player's hexes. The second session reopens the match, opens the battle there, queues a march in it, and starts a regional match. Before the third, the run marks that match as lost, and the third reopens it.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
 * UI smoke run: starts the built app in Electron, plays one fixed scenario, and records screenshots plus layout checks.
```

Replace it with:

```js
 * UI smoke run: starts the built app in Electron, plays fixed scenarios over three sessions, and records screenshots
 * plus layout checks.
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
 * changes the player's saved match, API key, or model choice, and it never calls a model.
```

Replace it with:

```js
 * changes the player's saved match, API key, or model choice, and it never calls a model. The three sessions share
 * that folder: the first plays a new global match, the second reopens it with a hex both sides hold, queues an order
 * in a battle there, and starts a regional match, and the third reopens that match after the run marks it as lost.
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
const { _electron: electron } = require('playwright-core');
const { SCENES, probePage, probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');

/**
 * Repository root, two levels above this file.
 *
 * Purpose: The app is launched from the repository, and the output folder lives under it.
 * When to use: Launch arguments, the working directory, and the output path.
 * Expected outcome: An absolute path.
 * Exceptions: None.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
```

Replace them with:

```js
const { SCENES, probePage, probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');
const {
  LAND_UNIT_TYPES,
  captureMainMap,
  contestedHexEdit,
  enterBattleAt,
  queueBattleMarch,
  queueLoneUnitMarch,
  readGameState,
  selectLoneBattleUnit,
  selectLoneUnit,
} = require('./ui-smoke-map.cjs');
const { FINISHED_MATCH_EDIT, REPO_ROOT, editSavedMatch, launchApp } = require('./ui-smoke-session.cjs');
```

4. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  gameSize: 'small',
});

/**
```

Replace them with:

```js
  gameSize: 'small',
});

/**
 * The fixed regional scenario, as option values on the new-game overlay's Regional tab.
 *
 * Purpose: The regional scenes always show the same region and sides, so their checks can compare known values.
 * When to use: Only by `startRegionalMatch`.
 * Expected outcome: Southern Mexico and the isthmus against NE Mexico and the Bajio in Central America, a small game,
 *   starting in April.
 * Exceptions: None.
 */
const REGIONAL_SCENARIO = Object.freeze({
  region: 'central_america',
  humanSide: 'southern_mexico_isthmus',
  aiSide: 'ne_mexico_bajio',
  startMonth: '4',
  gameSize: 'small',
});

/**
 * The window size of the small-window scene: the app's minimum.
 *
 * Purpose: The console's contents must still fit there.
 * When to use: The small-window scene.
 * Expected outcome: The last entry of `VIEWPORTS`.
 * Exceptions: None.
 */
const SMALL_WINDOW = VIEWPORTS[VIEWPORTS.length - 1];

/**
```

5. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * Purpose: The last scene checks the overlay opened from a match, not only at startup.
 * When to use: For the last scene.
```

Replace them with:

```js
 * Purpose: One scene checks the overlay opened from a match, not only at startup, and the regional match starts from it.
 * When to use: In the second session, before the regional match.
```

6. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * Runs every scene in order.
 *
 * Purpose: The scene order is part of the contract with the checks. The match starts after the first scene, and
 *   the new-game overlay is opened last because it ends the match view.
 * When to use: Once, after the app window exists.
 * Expected outcome: One recorded scene per step below, in this order.
 * Exceptions: Propagates Playwright and scenario errors.
 */
async function runScenes(app, page, report, outDir) {
```

Replace them with:

```js
 * Chooses the fixed regional scenario on the open new-game overlay and starts the match.
 *
 * Purpose: The regional scenes check the console on a map other than the world map.
 * When to use: While the new-game overlay is open.
 * Expected outcome: The overlay closes with `REGIONAL_SCENARIO`'s region and sides.
 * Exceptions: Throws when a choice does not hold or the match does not start within 90 seconds.
 */
async function startRegionalMatch(page) {
  await page.click('#new-game-tab-regional');
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-region-select', REGIONAL_SCENARIO.region);
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-human-side-select', REGIONAL_SCENARIO.humanSide);
  await page.selectOption('#new-game-ai-side-select', REGIONAL_SCENARIO.aiSide);
  await page.selectOption('#new-game-start-month', REGIONAL_SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', REGIONAL_SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    region: document.getElementById('new-game-region-select').value,
    human: document.getElementById('new-game-human-side-select').value,
    ai: document.getElementById('new-game-ai-side-select').value,
  }));
  if (chosen.region !== REGIONAL_SCENARIO.region || chosen.human !== REGIONAL_SCENARIO.humanSide || chosen.ai !== REGIONAL_SCENARIO.aiSide) {
    throw new Error(`regional choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 90000 });
  await page.waitForTimeout(SETTLE_MS.start);
}

/**
 * Runs the first session: a new match, the frame scenes, the console scenes, and the small window.
 *
 * Purpose: The scene order is part of the contract with the checks. The match starts after the first scene. Scenes
 *   that select units or queue orders come after the frame scenes, so the frame screenshots show an untouched match.
 *   The session ends with the Orders scene's march still queued, which the reopened match must still show.
 * When to use: Once, on a fresh user-data folder.
 * Expected outcome: One recorded scene per step below, in this order. Returns the game state at the end.
 * Exceptions: Propagates Playwright and scenario errors.
 */
async function runFirstSession(app, page, report, outDir) {
```

7. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await openNewGameOverlay(page);
  await recordScene(page, report, outDir, SCENES.newGameReopened);
```

Replace them with:

```js
  // Queue a one-hex march with the lone armor unit, then select it again from its row in the Orders tab.
  await captureMainMap(page);
  await queueLoneUnitMarch(page);
  await page.click('#pending-orders-list .console-order-select');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.ordersQueued);

  // At the minimum window size, the Orders tab must still fit the console.
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.smallWindow);

  await setViewport(app, page, first);
  await page.waitForTimeout(SETTLE_MS.resize);
  return readGameState(page);
}

/**
 * Runs the second session: the reopened match, a battle on the hex both sides now hold, and a new regional match.
 *
 * Purpose: Checks what a player sees after restarting the app, inside a battle, and on a regional map.
 * When to use: After `runFirstSession` and the saved-match change from `contestedHexEdit`, on the same folder.
 * Expected outcome: One recorded scene per step below, in this order.
 * Exceptions: Propagates Playwright and scenario errors.
 */
async function runReopenedSession(app, page, report, outDir, battleHex) {
  await setViewport(app, page, VIEWPORTS[0]);
  await page.waitForFunction(() => document.getElementById('game-over-overlay')?.classList.contains('hidden')
    && /· Planning$/.test(document.getElementById('topbar-turn-phase')?.textContent || ''), null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.start);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.matchReopened);

  await captureMainMap(page);
  await enterBattleAt(page, battleHex);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleStart);
  const unit = await selectLoneBattleUnit(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleSelection);
  await queueBattleMarch(page, unit);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.battleOrders);

  await openNewGameOverlay(page);
  await recordScene(page, report, outDir, SCENES.newGameReopened);
  await startRegionalMatch(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.regionalStart);
  await captureMainMap(page);
  await selectLoneUnit(page, await readGameState(page), LAND_UNIT_TYPES);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.regionalSelection);
}

/**
 * Runs the last session: the reopened match after it was marked as lost.
 *
 * Purpose: A finished match must open on the game-over screen, with the match's chrome out of the way.
 * When to use: After `runReopenedSession` and `FINISHED_MATCH_EDIT`, on the same folder.
 * Expected outcome: One recorded scene.
 * Exceptions: Propagates Playwright errors.
 */
async function runFinishedMatchSession(app, page, report, outDir) {
  await setViewport(app, page, VIEWPORTS[0]);
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.overlay);
  await recordScene(page, report, outDir, SCENES.gameOverReopened);
```

8. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
 * Purpose: Owns the app's lifetime and the temporary user-data folder.
```

Replace it with:

```js
 * Purpose: Owns the app's lifetime and the temporary user-data folder. The three sessions share the folder, so each
 *   one reopens the match the previous one left, changed as the scenes need.
```

9. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  let app = null;
  let exitCode = 1;
  try {
    app = await electron.launch({
      executablePath: require('electron'),
      args: [REPO_ROOT],
      cwd: REPO_ROOT,
      env: { ...process.env, AGENT_WARS_USER_DATA_DIR: userDataDir },
      timeout: 60000,
    });
    const page = await app.firstWindow();
    page.on('pageerror', (err) => report.pageErrors.push(err && err.message ? err.message : String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text());
    });
    await page.waitForLoadState('domcontentloaded');
    await runScenes(app, page, report, outDir);
```

Replace them with:

```js
  let session = null;
  let exitCode = 1;
  try {
    session = await launchApp(userDataDir, report);
    const lastState = await runFirstSession(session.app, session.page, report, outDir);
    await session.app.close();
    session = null;
    const contested = contestedHexEdit(lastState);
    await editSavedMatch(userDataDir, contested.statements);

    session = await launchApp(userDataDir, report);
    await runReopenedSession(session.app, session.page, report, outDir, contested.h3Index);
    await session.app.close();
    session = null;
    await editSavedMatch(userDataDir, FINISHED_MATCH_EDIT);

    session = await launchApp(userDataDir, report);
    await runFinishedMatchSession(session.app, session.page, report, outDir);
```

10. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
    if (app) await app.close().catch(() => undefined);
```

Replace it with:

```js
    if (session) await session.app.close().catch(() => undefined);
```

- [ ] **Step 33: Edit `doc/ux/right-panel-selection-and-orders.md`**

Describes the three groups and the new rows.

1. In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
The selected-unit readout and the three order lists.
````

Replace it with:

````markdown
The selected-unit readout and the three order groups.
````

2. In `doc/ux/right-panel-selection-and-orders.md`, find these lines. Together they occur exactly once:

````markdown
- "Movement orders". Each row names the unit and then shows the distance in hexes plus the status, target type, or `ferry`. An empty list shows "None".
- "Ranged attacks". Each row names the unit and then shows the distance in hexes plus the status, target type, or `ferry`. An empty list shows "None".
- "Air strikes". Each row names the unit and then shows the distance in hexes plus the status, target type, or `ferry`. An empty list shows "None".
````

Replace them with:

````markdown
- Three groups, each with a heading and the number of orders in it: "Movement", "Ranged attacks", and "Air strikes". An empty group shows "None".
- Each row shows the unit's name on its first line. Its second line shows an arrow, the target hex's code, a dot, and the distance in hexes, for example "→ E5 · 1h". A ferry adds "· Ferry". An air strike adds its target type as the target-type list names it, for example "→ GK · 2h · Airports". In a battle the code names the battle cell, for example "→ E8.K3 · 2h". A code or a distance that cannot be found shows "?". The codes are the ones the [hex tooltip](hex-tooltips.md) shows in parentheses (`orderTargetHexCode` in `src/shared/orderTargetHexCode.ts`). A strategic march's distance is the hexes its route has left.
- A row whose unit is selected is highlighted and marked with a gold dot.
- Each row ends with a cancel control (×).
````

3. In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks a row's select control, a plain click calls `replaceSelection` with that unit, and Shift toggles it. See [selection-model.md](selection-model.md).
````

Replace it with:

````markdown
- When the player clicks a row, a plain click calls `replaceSelection` with that row's unit, and Shift toggles it. See [selection-model.md](selection-model.md).
````

4. In `doc/ux/right-panel-selection-and-orders.md`, find these lines. Together they occur exactly once:

````markdown
- The lists refresh when a draft is added, cancelled, committed, stashed, or restored.

## States

- Empty list: the list shows "None".
- Rows present: one row per queued order of that kind.
- Row selected: the row's unit is in the current selection.
````

Replace them with:

````markdown
- The lists refresh when a draft is added, cancelled, committed, stashed, or restored.
- The row highlight follows every selection change, including one made on the map.
- The header's subtitle and the Orders tab's count follow the lists. See [right-panel.md](right-panel.md).

## States

- Empty group: the group shows "None" and the count 0.
- Rows present: one row per queued order of that kind.
- Row selected: the row's unit is in the current selection; the row is highlighted and marked with a gold dot.
````

5. In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
- An empty list never hides its heading. It shows "None".
````

Replace it with:

````markdown
- An empty group never hides its heading. It shows "None".
- A group's count always equals its number of rows.
````

6. In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
| Movement rows | Standing movement and ferries | Battle marches and ferries |
````

Replace it with:

````markdown
| Movement rows | Standing movement and ferries | Battle marches and ferries |
| Target codes | World hex, such as `E5` | Battle cell, such as `E8.K3` |
````

7. In `doc/ux/right-panel-selection-and-orders.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#sidebar-selected-unit`, `#pending-orders-list`, `#ranged-attacks-list`, `#air-strikes-list`, `#sidebar-error`)
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/gameplay/sidebarOrderRow.ts`
- `src/renderer/core/unitOriginFlags.ts`
- `src/renderer/gameplay/orderLabelFormatting.ts`
````

Replace them with:

````markdown
- `static/index.html` (`#sidebar-selected-unit`, `#pending-orders-list`, `#pending-orders-count`, `#ranged-attacks-list`, `#ranged-attacks-count`, `#air-strikes-list`, `#air-strikes-count`, `#sidebar-error`)
- `static/consoleChrome.css`
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/gameplay/sidebarOrderRow.ts`
- `src/renderer/gameplay/queuedOrderRows.ts`
- `src/renderer/core/unitOriginFlags.ts`
- `src/renderer/gameplay/orderLabelFormatting.ts`
- `src/shared/orderRowDetail.ts`
- `src/shared/orderTargetHexCode.ts`
- `src/shared/pendingMovementSidebarLabels.ts`
````

- [ ] **Step 34: Edit `doc/ux/right-panel.md`**

Describes the Orders subtitle and the rail badge.

1. In `doc/ux/right-panel.md`, find these lines. Together they occur exactly once:

````markdown
- A header with the selected tab's name and a button that collapses the panel.
- The Orders tab: the selected-unit readout, the Ranged and Strike controls, and the order lists. See [right-panel-command-bar.md](right-panel-command-bar.md) and [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
````

Replace them with:

````markdown
- A header with the selected tab's name, a subtitle, and a button that collapses the panel. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). The Opponent tab has no subtitle.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- The Orders tab: the selected-unit readout, the Ranged and Strike controls, and the order groups. See [right-panel-command-bar.md](right-panel-command-bar.md) and [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
````

2. In `doc/ux/right-panel.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
- `static/frameChrome.css`
- `src/renderer/chrome/consoleFrame.ts`
````

Replace them with:

````markdown
- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
- `static/frameChrome.css`
- `static/consoleChrome.css`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/gameplay/queuedOrderRows.ts`
````

- [ ] **Step 35: Edit `doc/ux/control-tooltips.md`**

Names the order rows and their cancel controls in its list.

In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Sidebar order select and cancel controls.
````

Replace it with:

````markdown
- Order rows in the Orders tab, and their cancel controls.
````

- [ ] **Step 36: Edit `doc/ux/order-lifecycle.md`**

Uses the new row wording.

In `doc/ux/order-lifecycle.md`, find this line. It occurs exactly once:

````markdown
- Draft: the order sits in a pending list on the right panel. Movement orders, ranged attacks, and air strikes are separate lists. Ferries are listed with movement orders in both theaters, with the same select and cancel controls.
````

Replace it with:

````markdown
- Draft: the order sits in a group on the right panel's Orders tab. Movement, ranged attacks, and air strikes are separate groups. Ferries are listed in the Movement group in both theaters, and their rows select and cancel the same way.
````

- [ ] **Step 37: Edit `doc/ux/selection-model.md`**

Shift-click on an Orders tab row toggles its unit.

In `doc/ux/selection-model.md`, find this line. It occurs exactly once:

````markdown
- When that hex has two or more selectable human units, or none, Shift-click schedules the callout and does not toggle a unit from the icon. A plain click on a unit icon still schedules the callout, except a hex with exactly one stationary selectable human unit. Releasing Shift closes an open callout, including one that is scheduled but not open yet. Sidebar Shift-click and a callout row's Shift toggle still toggle. See [input-map.md](input-map.md).
````

Replace it with:

````markdown
- When that hex has two or more selectable human units, or none, Shift-click schedules the callout and does not toggle a unit from the icon. A plain click on a unit icon still schedules the callout, except a hex with exactly one stationary selectable human unit. Releasing Shift closes an open callout, including one that is scheduled but not open yet. Shift-click on an Orders tab row and a callout row's Shift toggle still toggle. See [input-map.md](input-map.md).
````

- [ ] **Step 38: Edit `doc/how-to-play.md`**

Uses the new row wording.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
4. **Issue a move order:** With units selected, double-click a destination hex (land/water/terrain rules apply). The order appears under "Movement orders." A destination beyond this turn's reach becomes a march that continues on later turns.
````

Replace it with:

````markdown
4. **Issue a move order:** With units selected, double-click a destination hex (land/water/terrain rules apply). The order appears in the Movement group of the Orders tab, with the destination's hex code and its distance, such as "→ E5 · 1h". Click a row to select that unit again. A destination beyond this turn's reach becomes a march that continues on later turns.
````

- [ ] **Step 39: Edit `doc/ux-specification.md`**

Describes the smoke run's three sessions and tells developers where the console and scenario checks live.

In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
`npm run ui:smoke` checks the layout after a change. It builds the app, starts it in Electron with a throwaway user-data folder (the `AGENT_WARS_USER_DATA_DIR` environment variable), plays one fixed global match, and writes numbered screenshots and `report.json` to `.test/ui-smoke/<label>/`. Pass `-- --label <name>` to name that folder. It prints one PASS or FAIL line per check and exits with an error when any check fails. The checks are in `scripts/ui-smoke/ui-smoke-checks.cjs`; add one there when a layout rule needs a machine check.
````

Replace it with:

````markdown
`npm run ui:smoke` checks the layout after a change. It builds the app and starts it in Electron with a throwaway user-data folder (the `AGENT_WARS_USER_DATA_DIR` environment variable), three times over that folder. The first session starts one fixed global match and records its scenes, one of them at the 800 × 600 minimum window. The second reopens that match, opens a battle in it, and then starts a new regional match. The third reopens the regional match as a finished one. Between sessions the run changes only its throwaway copy of the match: before the second it moves the enemy's land units into the hex where the player has the most, so a battle can start there, and before the third it marks the match as lost (`scripts/ui-smoke/ui-smoke-session.cjs`, which runs `scripts/ui-smoke/ui-smoke-db-edit.cjs` under Electron's own Node). The run writes numbered screenshots and `report.json` to `.test/ui-smoke/<label>/`. Pass `-- --label <name>` to name that folder. It prints one PASS or FAIL line per check and exits with an error when any check fails. The frame's checks are in `scripts/ui-smoke/ui-smoke-checks.cjs`, the console's are in `scripts/ui-smoke/ui-smoke-console-checks.cjs`, and the checks for the later scenarios (the small window, the reopened match, the battle, the regional match, and the finished match) are in `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`; add one to the matching file when a layout rule needs a machine check. Scenes that click units find them through the game state and the main map (`scripts/ui-smoke/ui-smoke-map.cjs`).
````

- [ ] **Step 40: Edit `doc/ui-style-guide.md`**

Names `static/consoleChrome.css` and the selection color.

In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar, the right panel's frame and tab rail, and the game menu are in `static/frameChrome.css`. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

Replace it with:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar, the right panel's frame and tab rail, and the game menu are in `static/frameChrome.css`. The right panel's contents, such as the order groups and the rail counts, are in `static/consoleChrome.css`. `--selection-mark` (`#f2c14e`) marks what the player has selected. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

## Verify

- [ ] **Step 41: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 42: Full tests**

Run the full tests. Expected: exit 0, test total **850**, failure total **0**.

- [ ] **Step 43: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/orderRowDetail.ts src/shared/orderRowDetail.test.ts src/shared/orderTargetHexCode.ts src/shared/orderTargetHexCode.test.ts src/shared/pendingMovementSidebarLabels.ts src/main/pendingMovementSidebarLabels.test.ts src/main/tacticalMarchHoverPreview.test.ts src/renderer/gameplay/orderLabelFormatting.ts src/renderer/gameplay/queuedOrderRows.ts src/renderer/gameplay/sidebarOrderRow.ts src/renderer/gameplay/sidebarSupport.ts src/renderer/gameplay/tacticalOrders.ts src/renderer/gameplay/tacticalOrderDeps.ts src/renderer/entryCallbacks.ts src/renderer/wiredEntryCallbacks.ts src/renderer/renderer.ts src/renderer/chrome/consoleFrame.ts src/renderer/core/uiState.ts src/main/rendererConsolidation.test.ts static/index.html static/consoleChrome.css static/shellChrome.css static/frameChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-map.cjs scripts/ui-smoke/ui-smoke-session.cjs scripts/ui-smoke/ui-smoke-db-edit.cjs scripts/ui-smoke/ui-smoke-console-checks.cjs scripts/ui-smoke/ui-smoke-scenario-checks.cjs scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/right-panel-selection-and-orders.md doc/ux/right-panel.md doc/ux/control-tooltips.md doc/ux/order-lifecycle.md doc/ux/selection-model.md doc/how-to-play.md doc/ux-specification.md doc/ui-style-guide.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/orderRowDetail.ts` | `37ea41462c60883d` |
| `src/shared/orderRowDetail.test.ts` | `6676f01f41a76131` |
| `src/shared/orderTargetHexCode.ts` | `b00ee2c0ce696ca5` |
| `src/shared/orderTargetHexCode.test.ts` | `c04e30e0873b278f` |
| `src/shared/pendingMovementSidebarLabels.ts` | `90fc23ba8fd9d608` |
| `src/main/pendingMovementSidebarLabels.test.ts` | `5582e39f124dea39` |
| `src/main/tacticalMarchHoverPreview.test.ts` | `3c2e10efa143bb73` |
| `src/renderer/gameplay/orderLabelFormatting.ts` | `932a3a2ed95fe8ff` |
| `src/renderer/gameplay/queuedOrderRows.ts` | `ee7358054a6bd13c` |
| `src/renderer/gameplay/sidebarOrderRow.ts` | `46c35c4299d3c538` |
| `src/renderer/gameplay/sidebarSupport.ts` | `06ffb5c8f1cd712f` |
| `src/renderer/gameplay/tacticalOrders.ts` | `8c2c298d51e6113f` |
| `src/renderer/gameplay/tacticalOrderDeps.ts` | `724f845f2fe8c90b` |
| `src/renderer/entryCallbacks.ts` | `6406bb379d03be28` |
| `src/renderer/wiredEntryCallbacks.ts` | `82b893ee66157f0a` |
| `src/renderer/renderer.ts` | `bd3ce7c73e7b42fc` |
| `src/renderer/chrome/consoleFrame.ts` | `fb3e7a541fefdf3b` |
| `src/renderer/core/uiState.ts` | `93fdac4fc4e635db` |
| `src/main/rendererConsolidation.test.ts` | `f16c161788111349` |
| `static/index.html` | `35b0ff0fd36894fc` |
| `static/consoleChrome.css` | `c2648a75e107f188` |
| `static/shellChrome.css` | `3b967a8d2777a2b8` |
| `static/frameChrome.css` | `c9d43a5a65187d95` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `0001a1b81c6ba660` |
| `scripts/ui-smoke/ui-smoke-map.cjs` | `7d4d877f01fe3db2` |
| `scripts/ui-smoke/ui-smoke-session.cjs` | `cdefd4ef9e3cc096` |
| `scripts/ui-smoke/ui-smoke-db-edit.cjs` | `c99daa2b2cf1839a` |
| `scripts/ui-smoke/ui-smoke-console-checks.cjs` | `068175a57c4a1809` |
| `scripts/ui-smoke/ui-smoke-scenario-checks.cjs` | `6f3e1655ce5801b2` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `c0fa89502e6992a5` |
| `scripts/ui-smoke/ui-smoke.cjs` | `c2b748ca888c5ba9` |
| `doc/ux/right-panel-selection-and-orders.md` | `806a76e5936d8669` |
| `doc/ux/right-panel.md` | `48d5108b3e42d514` |
| `doc/ux/control-tooltips.md` | `43b82204fed7cc78` |
| `doc/ux/order-lifecycle.md` | `323615cb236b42b4` |
| `doc/ux/selection-model.md` | `4a760edca0e5660d` |
| `doc/how-to-play.md` | `f1c9557ec8c5a8fc` |
| `doc/ux-specification.md` | `1d36461895aa7ba3` |
| `doc/ui-style-guide.md` | `3c92143cfa4b2cfa` |

Five doc hashes are the files after a wording pass that followed these steps. That pass says "order groups" wherever it means the Movement, Ranged attacks, and Air strikes groups, and the player guide names the ferry and strike row endings. The steps above still show the sentences they replaced. `doc/ux/modes-and-transitions.md` got the same wording and is not in this table.

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.


- [ ] **Step 44: Smoke run**

```powershell
npm run ui:smoke -- --label orders-tab
```

Expected summary line:

```text
ui-smoke orders-tab: 195 passed, 0 failed, 0 page errors, 21 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\orders-tab
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/orders-tab/report.json`.

- [ ] **Step 45: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/orders-tab/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The battle's units are placed when it opens, so the battle screenshots can differ in where the units stand, which unit the run moves, and the codes. The new-game overlay draws its region, sides, and month at random.

- `12-orders-queued.png` against [ui-facelift-console-1-expected-orders.png](ui-facelift-console-1-expected-orders.png): The header reads "Orders" and "1 queued for turn 1", and the Orders rail tab shows a 1. "Selected unit" names 2nd Armored, with Ranged under it. MOVEMENT 1 holds one highlighted row: the flag and "2nd Armored", then "→ C5 · 1h" under it, a yellow dot, and ×. RANGED ATTACKS 0 and AIR STRIKES 0 each show "None".
- `14-match-reopened.png` against [ui-facelift-console-1-expected-reopened.png](ui-facelift-console-1-expected-reopened.png): After the app restarts: the same match, still "Turn 1 · Planning". The header reads "1 queued for turn 1", the Orders rail tab shows a 1, and MOVEMENT still lists 2nd Armored with "→ C5 · 1h". Nothing is selected, so "Selected unit" shows a dash and the row is not highlighted.
- `17-battle-orders.png` against [ui-facelift-console-1-expected-battle.png](ui-facelift-console-1-expected-battle.png): Inside the battle: the date block reads "Beat 1 · Tactical planning", the header reads "1 queued for beat 1", and the MOVEMENT row names a unit over a line like "→ E8.ML · 1h": the battle's hex code, a dot, and the cell's code. The map shows the battle's cells with units of both sides, and Exit Battle at the bottom.
- `21-game-over-reopened.png` against [ui-facelift-console-1-expected-game-over.png](ui-facelift-console-1-expected-game-over.png): The finished match, reopened: the new-game overlay is headed "You lose.", over a map of the region it offers. No top bar or console shows.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 42.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 45.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With your own match (`npm start`), queue a move, a ranged attack, and an air strike. Each group shows its count and its rows. Each row reads the unit's name over "→ <code> · <N>h", and the strike row ends with the target type you chose in the dropdown.
2. Click a row: its unit is selected on the map and the row is highlighted. Shift-click another row: both units are selected. Right-click the map: the highlights clear.
3. The header reads "N queued for turn T" and the Orders rail tab shows N. Cancel a row with its ×: both drop by one, and an empty group shows "None".
4. Queue a ferry by selecting an air unit and double-clicking one of your airports: its row ends with "· Ferry".
5. If your match has a tactical entry marker, enter the battle and queue a march: the subtitle reads "N queued for beat B", and the row's code reads like "E8.K3".

## Next

Plan 2 adds the selection panel on the map, and moves the "Selected unit" line and Ranged/Strike into it.
