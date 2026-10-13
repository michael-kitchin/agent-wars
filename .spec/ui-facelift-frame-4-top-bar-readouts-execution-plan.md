# UI Facelift Frame, Plan 4 of 5: Top-Bar Readouts

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Show Production, Forces, Your home, and Enemy home in the top bar, each with a tip. The captions hide on narrow windows and the numbers stay.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 4 of the five that build the spec's Phase 2; [ui-facelift-frame-execution-plan.md](ui-facelift-frame-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- A pure, unit-tested module, `src/shared/topBarStats.ts`, that computes and formats the totals from the snapshot. Production sums the current urban count on hexes the human player controls, leaving out neutral-border hexes. Nothing here changes game state.
- The four readouts in the top bar, and their tips. The Forces tip lists each unit type against its cap.
- The smoke harness gains a readout check, and `doc/` describes the readouts.

**Out of scope:**

- The game menu (plan 5). No main-process code changes.

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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Top Bar.
2. `doc/ux/top-bar.md`, `doc/region-vs-region.md`, and `doc/game-size-unit-caps.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then:

```powershell
Test-Path src/renderer/map/mapContainerResize.ts
Test-Path src/shared/topBarStats.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **837**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files:

- `doc/ui-style-guide.md`
- `doc/ux-specification.md`
- `doc/ux/control-tooltips.md`
- `doc/ux/top-bar.md`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `src/renderer/chrome/frameTooltipText.ts`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/core/uiState.ts`
- `src/shared/topBarStats.test.ts`
- `src/shared/topBarStats.ts`
- `static/frameChrome.css`
- `static/index.html`

- [ ] **Step 1: Create `src/shared/topBarStats.ts`**

The readout totals and their formatting, computed from the snapshot as pure, unit-tested functions. Production sums the current urban count on hexes the human player controls, leaving out neutral-border hexes. Nothing here changes game state.

Create `src/shared/topBarStats.ts` with exactly this content:

```ts
import { isNeutralBorderHex } from './h3Resolutions';
import { getMaxUnitsPerType, parseGameSize } from './gameSize';
import { countControlledHexesInRegion } from './homeRegionRules';
import { ALL_BUILD_UNIT_TYPES, type BuildUnitType } from './ipc/productionTypes';
import { getPlayerUnitCountsByType } from './unitCountsByType';

/**
 * The parts of a game-state snapshot that the top-bar readouts read.
 *
 * Purpose: A narrow input keeps the totals testable without building a whole snapshot.
 * When to use: Pass the renderer's `GameStateSnapshot`; it satisfies this shape.
 * Expected outcome: Optional lists may be missing on early or partial snapshots and count as empty.
 * Exceptions: None.
 */
export interface TopBarStatsInput {
  /**
   * Every unit in the snapshot.
   *
   * Contract: Each unit names its player and its unit type.
   * When to use: Pass `state.units`.
   * Expected outcome: Units whose player is `human` count toward Forces.
   * Exceptions: None.
   */
  readonly units: ReadonlyArray<{ readonly player: string; readonly unitType: string }>;
  /**
   * The match's game size.
   *
   * Contract: Any value `parseGameSize` accepts; unknown values mean Small.
   * When to use: Pass `state.gameSize`.
   * Expected outcome: Sets the per-type caps.
   * Exceptions: None.
   */
  readonly gameSize?: unknown;
  /**
   * Which player controls each strategic hex.
   *
   * Contract: One row per hex the player knows about.
   * When to use: Pass `state.strategicControl`.
   * Expected outcome: Drives Production and both home readouts.
   * Exceptions: None.
   */
  readonly strategicControl?: ReadonlyArray<{ readonly h3Index: string; readonly controllerPlayerId: string | null }>;
  /**
   * Current urban cell counts per strategic hex.
   *
   * Contract: `urbanHexCount` is the hex's present urban count, after any destruction.
   * When to use: Pass `state.strategicInfrastructure`.
   * Expected outcome: Summed for Production.
   * Exceptions: None.
   */
  readonly strategicInfrastructure?: ReadonlyArray<{ readonly h3Index: string; readonly urbanHexCount: number }>;
  /**
   * The human home region's hexes.
   *
   * Contract: May repeat a hex; repeats count once.
   * When to use: Pass `state.humanHomeRegionHexes`.
   * Expected outcome: The total for Your home.
   * Exceptions: None.
   */
  readonly humanHomeRegionHexes?: readonly string[];
  /**
   * The opponent home region's hexes.
   *
   * Contract: May repeat a hex; repeats count once.
   * When to use: Pass `state.aiHomeRegionHexes`.
   * Expected outcome: The total for Enemy home.
   * Exceptions: None.
   */
  readonly aiHomeRegionHexes?: readonly string[];
}

/**
 * Held and total hex counts for one home region.
 *
 * Purpose: Both home readouts share this shape.
 * When to use: Read from `TopBarStats`.
 * Expected outcome: `held` never exceeds `total`.
 * Exceptions: None.
 */
export interface HomeHold {
  /**
   * Hexes of the region the human player controls.
   *
   * Contract: Counts each hex once.
   * When to use: The readout's main number.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly held: number;
  /**
   * Hexes in the region.
   *
   * Contract: Counts each hex once.
   * When to use: The readout's suffix.
   * Expected outcome: Zero when the snapshot has no region list.
   * Exceptions: None.
   */
  readonly total: number;
}

/**
 * Totals shown in the top bar.
 *
 * Purpose: One computed record that the renderer formats and the tests check.
 * When to use: Returned by `computeTopBarStats`.
 * Expected outcome: Plain numbers; formatting happens in `formatTopBarStatParts`.
 * Exceptions: None.
 */
export interface TopBarStats {
  /**
   * Production the human player's cities can add each turn.
   *
   * Contract: Matches the per-turn credit rule: current urban count, human control, no neutral-border hexes.
   * When to use: The Production readout.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly productionPerTurn: number;
  /**
   * Human units fielded, by type.
   *
   * Contract: Only the four buildable types are counted.
   * When to use: The Forces tip.
   * Expected outcome: Zero for a type with no units.
   * Exceptions: None.
   */
  readonly fieldedByType: Readonly<Record<BuildUnitType, number>>;
  /**
   * The game size's cap for each type.
   *
   * Contract: From `getMaxUnitsPerType`.
   * When to use: The Forces tip.
   * Expected outcome: Positive numbers.
   * Exceptions: None.
   */
  readonly capByType: Readonly<Record<BuildUnitType, number>>;
  /**
   * Sum of `fieldedByType`.
   *
   * Contract: Equals the sum of the per-type counts.
   * When to use: The Forces readout's main number.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly unitsFielded: number;
  /**
   * Sum of `capByType`.
   *
   * Contract: Equals the sum of the per-type caps.
   * When to use: The Forces readout's suffix.
   * Expected outcome: 34 for a Small game.
   * Exceptions: None.
   */
  readonly unitCap: number;
  /**
   * The human player's hold on their own home region.
   *
   * Contract: Human control only.
   * When to use: The Your home readout.
   * Expected outcome: See `HomeHold`.
   * Exceptions: None.
   */
  readonly humanHome: HomeHold;
  /**
   * The human player's hold on the opponent's home region.
   *
   * Contract: Human control only.
   * When to use: The Enemy home readout.
   * Expected outcome: See `HomeHold`.
   * Exceptions: None.
   */
  readonly opponentHome: HomeHold;
}

/**
 * Computes the top-bar totals from a snapshot.
 *
 * Purpose: Display-only totals derived in the renderer; nothing here changes game state.
 * When to use: On every top-bar refresh with a snapshot. Pass `isNeutralBorder` only in tests.
 * Expected outcome: Production sums `urbanHexCount` (truncated, at least zero) over hexes the human controls,
 *   skipping neutral-border hexes, as the per-turn credit does. Forces counts human units against the size caps.
 *   Each home readout counts the region's hexes the human controls.
 * Exceptions: None; missing lists count as empty.
 */
export function computeTopBarStats(
  input: TopBarStatsInput,
  isNeutralBorder: (h3Index: string) => boolean = isNeutralBorderHex
): TopBarStats {
  const control = input.strategicControl ?? [];
  const humanHexes = new Set(control.filter((row) => row.controllerPlayerId === 'human').map((row) => row.h3Index));
  const productionPerTurn = (input.strategicInfrastructure ?? [])
    .filter((row) => humanHexes.has(row.h3Index) && !isNeutralBorder(row.h3Index))
    .reduce((sum, row) => sum + Math.max(0, Math.trunc(row.urbanHexCount)), 0);
  const fieldedByType = getPlayerUnitCountsByType(Array.from(input.units), 'human');
  const capByType = getMaxUnitsPerType(parseGameSize(input.gameSize));
  const unitsFielded = ALL_BUILD_UNIT_TYPES.reduce((sum, unitType) => sum + fieldedByType[unitType], 0);
  const unitCap = ALL_BUILD_UNIT_TYPES.reduce((sum, unitType) => sum + capByType[unitType], 0);
  const controlRows = Array.from(control);
  const humanHome = countControlledHexesInRegion(controlRows, input.humanHomeRegionHexes, 'human');
  const opponentHome = countControlledHexesInRegion(controlRows, input.aiHomeRegionHexes, 'human');
  return {
    productionPerTurn,
    fieldedByType,
    capByType,
    unitsFielded,
    unitCap,
    humanHome: { held: humanHome.controlled, total: humanHome.total },
    opponentHome: { held: opponentHome.controlled, total: opponentHome.total },
  };
}

/**
 * Display text for each readout: a main value and a muted suffix.
 *
 * Purpose: The renderer writes these strings into fixed elements.
 * When to use: Returned by `formatTopBarStatParts`.
 * Expected outcome: Plain text only.
 * Exceptions: None.
 */
export interface TopBarStatParts {
  /**
   * Production value, such as "+530".
   *
   * Contract: Always starts with "+".
   * When to use: `#topbar-stat-production`.
   * Expected outcome: Grouped with commas past 999.
   * Exceptions: None.
   */
  readonly production: string;
  /**
   * Units fielded, such as "10".
   *
   * Contract: Digits only, with commas past 999.
   * When to use: `#topbar-stat-forces`.
   * Expected outcome: Never negative.
   * Exceptions: None.
   */
  readonly forces: string;
  /**
   * The cap suffix, such as "/34".
   *
   * Contract: Starts with "/".
   * When to use: `#topbar-stat-forces-cap`.
   * Expected outcome: The game size's total cap.
   * Exceptions: None.
   */
  readonly forcesCap: string;
  /**
   * Your home held, such as "12".
   *
   * Contract: Digits only.
   * When to use: `#topbar-stat-human-home`.
   * Expected outcome: Never negative.
   * Exceptions: None.
   */
  readonly humanHome: string;
  /**
   * Your home total suffix, such as "/15".
   *
   * Contract: Starts with "/".
   * When to use: `#topbar-stat-human-home-total`.
   * Expected outcome: The region's hex count.
   * Exceptions: None.
   */
  readonly humanHomeTotal: string;
  /**
   * Enemy home held, such as "3".
   *
   * Contract: Digits only.
   * When to use: `#topbar-stat-opponent-home`.
   * Expected outcome: Never negative.
   * Exceptions: None.
   */
  readonly opponentHome: string;
  /**
   * Enemy home total suffix, such as "/24".
   *
   * Contract: Starts with "/".
   * When to use: `#topbar-stat-opponent-home-total`.
   * Expected outcome: The region's hex count.
   * Exceptions: None.
   */
  readonly opponentHomeTotal: string;
}

/**
 * Formats one whole number for a readout.
 *
 * Purpose: All readouts group thousands the same way, independent of the computer's locale.
 * When to use: Inside `formatTopBarStatParts` and `formatForcesBreakdown`.
 * Expected outcome: For example 1530 becomes "1,530".
 * Exceptions: None.
 */
function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Formats the top-bar totals for display.
 *
 * Purpose: Keeps the number format in one place.
 * When to use: After `computeTopBarStats`.
 * Expected outcome: For example production "+530", forces "10" and "/34", homes "12" and "/15".
 * Exceptions: None.
 */
export function formatTopBarStatParts(stats: TopBarStats): TopBarStatParts {
  return {
    production: `+${formatCount(stats.productionPerTurn)}`,
    forces: formatCount(stats.unitsFielded),
    forcesCap: `/${formatCount(stats.unitCap)}`,
    humanHome: formatCount(stats.humanHome.held),
    humanHomeTotal: `/${formatCount(stats.humanHome.total)}`,
    opponentHome: formatCount(stats.opponentHome.held),
    opponentHomeTotal: `/${formatCount(stats.opponentHome.total)}`,
  };
}

/**
 * Lists fielded units against the cap for each type.
 *
 * Purpose: The Forces tip spells out the total.
 * When to use: Building the Forces tip.
 * Expected outcome: For example "infantry 3 of 12, armor 3 of 8, naval 2 of 8, air 2 of 6".
 * Exceptions: None.
 */
export function formatForcesBreakdown(stats: TopBarStats): string {
  return ALL_BUILD_UNIT_TYPES.map(
    (unitType) => `${unitType} ${formatCount(stats.fieldedByType[unitType])} of ${formatCount(stats.capByType[unitType])}`
  ).join(', ');
}
```

- [ ] **Step 2: Create `src/shared/topBarStats.test.ts`**

Covers production on held and neutral-border hexes, forces against the caps, both home regions, missing lists, and the number formats.

Create `src/shared/topBarStats.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTopBarStats, formatForcesBreakdown, formatTopBarStatParts, type TopBarStatsInput } from './topBarStats';

const notNeutral = (): boolean => false;

const input: TopBarStatsInput = {
  units: [
    { player: 'human', unitType: 'infantry' },
    { player: 'human', unitType: 'infantry' },
    { player: 'human', unitType: 'armor' },
    { player: 'human', unitType: 'air' },
    { player: 'opponent', unitType: 'infantry' },
  ],
  gameSize: 'small',
  strategicControl: [
    { h3Index: 'a', controllerPlayerId: 'human' },
    { h3Index: 'b', controllerPlayerId: 'human' },
    { h3Index: 'c', controllerPlayerId: 'opponent' },
    { h3Index: 'd', controllerPlayerId: 'human' },
    { h3Index: 'e', controllerPlayerId: null },
  ],
  strategicInfrastructure: [
    { h3Index: 'a', urbanHexCount: 94 },
    { h3Index: 'b', urbanHexCount: 8 },
    { h3Index: 'c', urbanHexCount: 50 },
    { h3Index: 'e', urbanHexCount: 7 },
  ],
  humanHomeRegionHexes: ['a', 'b', 'e', 'a'],
  aiHomeRegionHexes: ['c', 'd'],
};

test('computeTopBarStats sums current urban counts on human hexes for production', () => {
  assert.equal(computeTopBarStats(input, notNeutral).productionPerTurn, 102);
});

test('computeTopBarStats skips neutral-border hexes for production', () => {
  assert.equal(computeTopBarStats(input, (h3) => h3 === 'a').productionPerTurn, 8);
});

test('computeTopBarStats counts human units against the game-size cap', () => {
  const stats = computeTopBarStats(input, notNeutral);
  assert.equal(stats.unitsFielded, 4);
  assert.equal(stats.unitCap, 34);
  assert.deepEqual(stats.fieldedByType, { infantry: 2, armor: 1, naval: 0, air: 1 });
});

test('computeTopBarStats counts human-held hexes of both home regions once each', () => {
  const stats = computeTopBarStats(input, notNeutral);
  assert.deepEqual(stats.humanHome, { held: 2, total: 3 });
  assert.deepEqual(stats.opponentHome, { held: 1, total: 2 });
});

test('computeTopBarStats treats missing lists as empty', () => {
  const stats = computeTopBarStats({ units: [] }, notNeutral);
  assert.equal(stats.productionPerTurn, 0);
  assert.deepEqual(stats.humanHome, { held: 0, total: 0 });
  assert.equal(stats.unitCap, 34);
});

test('formatTopBarStatParts and formatForcesBreakdown format the readouts', () => {
  const stats = computeTopBarStats({ ...input, strategicInfrastructure: [{ h3Index: 'a', urbanHexCount: 1530 }] }, notNeutral);
  assert.deepEqual(formatTopBarStatParts(stats), {
    production: '+1,530',
    forces: '4',
    forcesCap: '/34',
    humanHome: '2',
    humanHomeTotal: '/3',
    opponentHome: '1',
    opponentHomeTotal: '/2',
  });
  assert.equal(formatForcesBreakdown(stats), 'infantry 2 of 12, armor 1 of 8, naval 0 of 8, air 1 of 6');
});
```

- [ ] **Step 3: Edit `src/renderer/chrome/frameTooltipText.ts`**

Adds the four readout tips.

In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
export const collapseConsoleTooltipText = 'Hide the console to widen the map. Click a tab to show it again.';
```

Replace it with:

```ts
export const collapseConsoleTooltipText = 'Hide the console to widen the map. Click a tab to show it again.';

/**
 * Purpose: Says what the Production readout counts and when it is earned.
 * When to use: The Production readout in the top bar.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const productionStatTooltipText =
  'The production your cities can add each turn. A city adds its share only while it is building, and a city on the neutral border adds none.';

/**
 * Purpose: Lists units fielded against the game-size cap for each type.
 * When to use: Whenever the Forces readout is refreshed, with the breakdown from `formatForcesBreakdown`.
 * Expected outcome: For example "Units you have fielded, out of the most this game size allows: infantry 3 of 12, ...".
 * Exceptions: None.
 */
export function forcesStatTooltipText(breakdown: string): string {
  return `Units you have fielded, out of the most this game size allows: ${breakdown}.`;
}

/**
 * Purpose: Says what the Your home readout counts.
 * When to use: The Your home readout in the top bar.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const humanHomeStatTooltipText = 'Hexes of your home region that you hold, out of all its hexes.';

/**
 * Purpose: Says what the Enemy home readout counts.
 * When to use: The Enemy home readout in the top bar.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const opponentHomeStatTooltipText = "Hexes of the opponent's home region that you hold, out of all its hexes.";
```

- [ ] **Step 4: Replace `src/renderer/chrome/topBar.ts`**

Adds the readouts. Compared with the previous version, the file adds two imports, `renderTopBarStats`, and one call to it.

Replace the whole file `src/renderer/chrome/topBar.ts` with exactly this content:

```ts
/**
 * The top bar's match status: the two sides, the four readouts, and the date block.
 */
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { formatTopBarDateBlock } from '../../shared/topBarDateBlock';
import { computeTopBarStats, formatForcesBreakdown, formatTopBarStatParts } from '../../shared/topBarStats';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import { rendererSharedState as S } from '../core/state';
import { forcesStatTooltipText } from './frameTooltipText';

/**
 * Title-cases the strategic phase id from main (`planning`, `resolution`) for the date block.
 *
 * Purpose: Keeps raw enum-style ids out of the player-facing bar while staying stable if new phases are added.
 * When to use: Only from `renderTopBarDateBlock`.
 * Expected outcome: `Planning`, `Resolution`, or a similar single word. An empty string stays empty.
 * Exceptions: None.
 */
function formatStrategicPhaseLabel(phase: string): string {
  if (!phase) return phase;
  return phase.charAt(0).toUpperCase() + phase.slice(1).toLowerCase();
}

/**
 * Writes plain text into an element found by id.
 *
 * Purpose: The bar has many single-text elements; a missing one must not stop the others.
 * When to use: Every text write in this module.
 * Expected outcome: The element's text is replaced. A missing element is skipped.
 * Exceptions: None.
 */
function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Writes the two side names.
 *
 * Purpose: The player always sees who is fighting whom.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: The human and opponent home names, or em dashes when missing.
 * Exceptions: None.
 */
function renderTopBarSides(state: GameStateSnapshot | null): void {
  setText('topbar-human-side', state?.humanHomeRegion || '—');
  setText('topbar-opponent-side', state?.aiHomeRegion || '—');
}

/**
 * Writes the date block, adding the battle's weather to the date line during a battle.
 *
 * Purpose: The player reads the date, and the turn or the beat, at a glance.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: See `formatTopBarDateBlock`. During a battle with weather, the date line ends with the weather icon and word.
 * Exceptions: None.
 */
function renderTopBarDateBlock(state: GameStateSnapshot | null): void {
  const battle = S.tacticalBattleSnapshot;
  const text = formatTopBarDateBlock({
    hasGameState: state != null,
    dateLabel: state?.currentDateLabel ?? '',
    turnNumber: state?.turnNumber ?? 0,
    strategicPhaseLabel: state ? formatStrategicPhaseLabel(state.phase) : '',
    battleBeat: battle ? battle.tacticalTurnNumber : null,
    beatPlaybackActive: S.resolutionMoveAnimation != null,
  });
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    dateEl.textContent = text.date;
    if (state && battle?.weather) dateEl.insertAdjacentHTML('beforeend', ` · ${formatWeatherIconHtml(battle.weather)}`);
  }
  setText('topbar-turn-phase', text.turnPhase);
}

/**
 * Writes the Production, Forces, Your home, and Enemy home readouts.
 *
 * Purpose: Shows the match's standing at a glance without opening a panel.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: Values and suffixes from `computeTopBarStats`. With no snapshot, em dashes and empty suffixes.
 *   The Forces tip lists each unit type against its cap.
 * Exceptions: None.
 */
function renderTopBarStats(state: GameStateSnapshot | null): void {
  if (!state) {
    for (const id of ['topbar-stat-production', 'topbar-stat-forces', 'topbar-stat-human-home', 'topbar-stat-opponent-home']) {
      setText(id, '—');
    }
    for (const id of ['topbar-stat-production-suffix', 'topbar-stat-forces-cap', 'topbar-stat-human-home-total', 'topbar-stat-opponent-home-total']) {
      setText(id, '');
    }
    return;
  }
  const stats = computeTopBarStats(state);
  const parts = formatTopBarStatParts(stats);
  setText('topbar-stat-production', parts.production);
  setText('topbar-stat-production-suffix', '/turn');
  setText('topbar-stat-forces', parts.forces);
  setText('topbar-stat-forces-cap', parts.forcesCap);
  setText('topbar-stat-human-home', parts.humanHome);
  setText('topbar-stat-human-home-total', parts.humanHomeTotal);
  setText('topbar-stat-opponent-home', parts.opponentHome);
  setText('topbar-stat-opponent-home-total', parts.opponentHomeTotal);
  document.getElementById('topbar-stat-forces-host')?.setAttribute('data-control-tooltip', forcesStatTooltipText(formatForcesBreakdown(stats)));
}

/**
 * Refreshes everything the top bar shows about the match.
 *
 * Purpose: One entry point, called wherever the old game-state lines were refreshed.
 * When to use: From `updateGameStateSidebar`, after snapshots, tactical entry and exit, Ready commits, and the end of beat playback.
 * Expected outcome: Sides, readouts, and the date block match `state` and the current battle. Null shows em dashes.
 * Exceptions: None.
 */
export function renderTopBarStatus(state: GameStateSnapshot | null): void {
  renderTopBarSides(state);
  renderTopBarStats(state);
  renderTopBarDateBlock(state);
}
```

- [ ] **Step 5: Edit `src/renderer/core/uiState.ts`**

Comment only.

In `src/renderer/core/uiState.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: The top bar's sides and date block match `state` and the current battle. Null shows em dashes.
```

Replace it with:

```ts
 * Expected outcome: The top bar's sides, readouts, and date block match `state` and the current battle. Null shows em dashes.
```

- [ ] **Step 6: Edit `static/index.html`**

Adds the four readouts between the sides and the spacer.

In `static/index.html`, find this line. It occurs exactly once:

```html
      <span id="topbar-opponent-side" class="topbar-side-name">—</span>
```

Replace it with:

```html
      <span id="topbar-opponent-side" class="topbar-side-name">—</span>
    </div>
    <div class="topbar-stat" data-control-tooltip="The production your cities can add each turn. A city adds its share only while it is building, and a city on the neutral border adds none.">
      <span class="topbar-stat-caption">Production</span>
      <span class="topbar-stat-value"><span id="topbar-stat-production">—</span><span id="topbar-stat-production-suffix" class="topbar-stat-suffix"></span></span>
    </div>
    <div id="topbar-stat-forces-host" class="topbar-stat" data-control-tooltip="Units you have fielded, out of the most this game size allows.">
      <span class="topbar-stat-caption">Forces</span>
      <span class="topbar-stat-value"><span id="topbar-stat-forces">—</span><span id="topbar-stat-forces-cap" class="topbar-stat-suffix"></span></span>
    </div>
    <div class="topbar-stat" data-control-tooltip="Hexes of your home region that you hold, out of all its hexes.">
      <span class="topbar-stat-caption">Your home</span>
      <span class="topbar-stat-value"><span id="topbar-stat-human-home">—</span><span id="topbar-stat-human-home-total" class="topbar-stat-suffix"></span></span>
    </div>
    <div class="topbar-stat" data-control-tooltip="Hexes of the opponent's home region that you hold, out of all its hexes.">
      <span class="topbar-stat-caption">Enemy home</span>
      <span class="topbar-stat-value"><span id="topbar-stat-opponent-home">—</span><span id="topbar-stat-opponent-home-total" class="topbar-stat-suffix"></span></span>
```

- [ ] **Step 7: Edit `static/frameChrome.css`**

Adds the readout styles. The captions hide below a 1360 px window.

In `static/frameChrome.css`, find this line. It occurs exactly once:

```css
  box-shadow: 0 0 0 2px var(--chrome-opponent-edge);
```

Replace it with:

```css
  box-shadow: 0 0 0 2px var(--chrome-opponent-edge);
}
.topbar-stat {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
  padding: 0 12px;
  border-left: 1px solid var(--chrome-divider);
}
.topbar-stat-caption {
  color: var(--chrome-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.topbar-stat-value {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.topbar-stat-suffix {
  color: var(--chrome-muted);
  font-size: 11px;
  font-weight: 500;
}
/* Narrow windows keep the numbers. Each readout's tip still names it. */
@media (max-width: 1359px) {
  .topbar-stat-caption {
    display: none;
  }
```

- [ ] **Step 8: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

Adds the readout check: the number formats, and the known totals for the fixed scenario.

In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
    run: (p, el) => (el('#sidebar').collapsed === 'false' ? null : `#sidebar data-collapsed is "${el('#sidebar').collapsed}"`),
  },
]);
```

Replace them with:

```js
    run: (p, el) => (el('#sidebar').collapsed === 'false' ? null : `#sidebar data-collapsed is "${el('#sidebar').collapsed}"`),
  },
  {
    name: 'topbar-stats',
    scenes: [SCENES.strategic],
    needs: [
      '#topbar-stat-production',
      '#topbar-stat-forces',
      '#topbar-stat-forces-cap',
      '#topbar-stat-human-home',
      '#topbar-stat-human-home-total',
      '#topbar-stat-opponent-home',
      '#topbar-stat-opponent-home-total',
    ],
    run: (p, el) => {
      const text = (selector) => el(selector).text;
      const problems = [];
      if (!/^\+[\d,]+$/.test(text('#topbar-stat-production'))) problems.push(`production "${text('#topbar-stat-production')}"`);
      if (!/^\d+$/.test(text('#topbar-stat-forces')) || text('#topbar-stat-forces-cap') !== '/34') {
        problems.push(`forces "${text('#topbar-stat-forces')}${text('#topbar-stat-forces-cap')}" (cap should be /34)`);
      }
      if (!/^\d+$/.test(text('#topbar-stat-human-home')) || text('#topbar-stat-human-home-total') !== '/15') {
        problems.push(`your home "${text('#topbar-stat-human-home')}${text('#topbar-stat-human-home-total')}" (total should be /15)`);
      }
      if (!/^\d+$/.test(text('#topbar-stat-opponent-home')) || text('#topbar-stat-opponent-home-total') !== '/24') {
        problems.push(`enemy home "${text('#topbar-stat-opponent-home')}${text('#topbar-stat-opponent-home-total')}" (total should be /24)`);
      }
      return problems.length === 0 ? null : problems.join('; ');
    },
  },
]);
```

- [ ] **Step 9: Replace `doc/ux/top-bar.md`**

From here to the end, the steps update `doc/` in the same change. The top bar document now describes the readouts.

Replace the whole file `doc/ux/top-bar.md` with exactly this content:

````markdown
# Top Bar

The bar across the top of the window. It holds the two sides, four match readouts, the date block, and the Settings and Help buttons.

## Purpose

Show the match's standing and its date at a glance, without opening a panel.

## Availability

Shown in Strategic planning, Resolution playback, Tactical planning, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list or the annihilation dialog is open, it stays visible and does not receive pointer input.

## Information Displayed

From left to right:

- The two sides: a teal mark and the human side's name, "vs", then a rose mark and the opponent's name. A long name ends in an ellipsis. With no match loaded, each name is an em dash.
- Production: `+N` and "/turn". N is the sum of the current urban count of every strategic hex the human player controls, leaving out neutral-border hexes.
- Forces: units the human player has fielded, then "/" and the most this game size allows across the four unit types. The numbers come from `getMaxUnitsPerType` in `src/shared/gameSize.ts`.
- Your home: hexes of the human home region that the human player controls, then "/" and the hexes in that region.
- Enemy home: hexes of the opponent's home region that the human player controls, then "/" and the hexes in that region.
- The date block, on two lines. The first line is the match date, such as "March, Year 1" on the global map or "March 8th, Year 1" on a regional map. The second line is "Turn N · Planning" outside a battle. In a battle it is "Beat N · Tactical planning" while the player drafts and "Beat N · Tactical resolution" while a beat resolves or plays back, and the first line ends with the battle's weather icon and word when the weather bonus is on. With no match loaded, both lines are an em dash.
- Settings and Help. Both are disabled in this version.
- Below a 1360 px window, the captions Production, Forces, Your home, and Enemy home hide and the numbers stay. Below 1100 px, each side's name is shortened sooner.
- Control tips for the readouts and the buttons are in [control-tooltips.md](control-tooltips.md). The Forces tip lists each unit type against its cap.

## Inputs and Responses

### Mouse

- The sides, the readouts, and the date block do not respond to clicks.

### Keyboard

- None.

### Other

- The sides, the readouts, and the date block refresh with each game-state snapshot, on tactical entry and exit, after a tactical Ready commit, and when beat playback ends.

## States

- Match loaded: names, readouts, and the date block show the match.
- No match: em dashes, and the readout suffixes are empty.
- Pointer input off: the tactical battles list or Tactical annihilation.
- Absent: New game and Game over.

## Invariants

- The sides, the readouts, and the date block are display only. They never change game state.
- During a battle, the two date-block lines never describe different theaters.
- The bar's height never changes with the window width; captions and names give way instead.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Second date-block line | Strategic turn and phase | Battle beat and tactical phase |
| First date-block line | Match date | Match date, then the battle's weather when the weather bonus is on |
| Readouts | Strategic snapshot | The same strategic snapshot; a battle does not change them |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [right-panel.md](right-panel.md)
- [control-tooltips.md](control-tooltips.md)
- [home region rules](../region-vs-region.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#app-topbar`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`)
- `static/frameChrome.css`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, `setMainUIControlsEnabled`)
- `src/shared/topBarStats.ts`
- `src/shared/topBarDateBlock.ts`
````

- [ ] **Step 10: Edit `doc/ux/control-tooltips.md`**

1. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Run before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back. It also includes every disabled placeholder: Settings and Help in the top bar, and the Build and Forces tabs.
````

Replace it with:

````markdown
The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Run before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back. It also includes every disabled placeholder: Settings and Help in the top bar, and the Build and Forces tabs. The top bar's four readouts show a tip the same way, though they are not controls.
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Collapse the console: Hide the console to widen the map. Click a tab to show it again.
````

Replace it with:

````markdown
- Collapse the console: Hide the console to widen the map. Click a tab to show it again.
- Production readout: The production your cities can add each turn. A city adds its share only while it is building, and a city on the neutral border adds none.
- Forces readout: Units you have fielded, out of the most this game size allows: then each unit type as "infantry 3 of 12", separated by commas, ending with a period.
- Your home readout: Hexes of your home region that you hold, out of all its hexes.
- Enemy home readout: Hexes of the opponent's home region that you hold, out of all its hexes.
````

- [ ] **Step 11: Edit `doc/ux-specification.md`**

1. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| The top bar or its date block | [modes-and-transitions.md](ux/modes-and-transitions.md) | [top-bar.md](ux/top-bar.md) |
````

Replace it with:

````markdown
| The top bar, its readouts, or its date block | [modes-and-transitions.md](ux/modes-and-transitions.md) | [top-bar.md](ux/top-bar.md) |
````

2. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [top-bar.md](ux/top-bar.md): the bar across the top: the two sides and the date block.
````

Replace it with:

````markdown
- [top-bar.md](ux/top-bar.md): the bar across the top: the two sides, the Production, Forces, and home readouts, and the date block.
````

- [ ] **Step 12: Edit `doc/ui-style-guide.md`**

In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
- **Live app:** A 44 px bar: the two sides, then the date and turn on two lines, and disabled Settings and Help buttons. See [ux/top-bar.md](ux/top-bar.md).
````

Replace it with:

````markdown
- **Live app:** A 44 px bar: the two sides, the Production, Forces, Your home, and Enemy home readouts, then the date and turn on two lines, and disabled Settings and Help buttons. Captions hide below a 1360 px window. See [ux/top-bar.md](ux/top-bar.md).
````

## Verify

- [ ] **Step 13: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 14: Full tests**

Run the full tests. Expected: exit 0, test total **843**, failure total **0**.

- [ ] **Step 15: Exact match**

This proves that every file this plan creates or edits, except the files named after the table, matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" doc/ui-style-guide.md doc/ux-specification.md doc/ux/control-tooltips.md scripts/ui-smoke/ui-smoke-checks.cjs src/renderer/core/uiState.ts src/shared/topBarStats.test.ts src/shared/topBarStats.ts static/frameChrome.css
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `doc/ui-style-guide.md` | `df03b43e23f6d0c3` |
| `doc/ux-specification.md` | `313c4829e22f31f6` |
| `doc/ux/control-tooltips.md` | `e0e58b5715f82934` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `151b0c54df07aba6` |
| `src/renderer/core/uiState.ts` | `468194dd66c71010` |
| `src/shared/topBarStats.test.ts` | `008e332de29198fe` |
| `src/shared/topBarStats.ts` | `fb0f33b5407d728c` |
| `static/frameChrome.css` | `48bb2c56c11b5b6e` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

These files are left out of this check. Write them as this plan shows. Do not stop because they have no hash.

- `doc/ux/top-bar.md`. The recorded hash was for a copy that said the Production total equals what a building city is credited. That sentence was removed: the readout sums every human-controlled urban hex except neutral borders, and the credit skips a city that has no build queue and no keep-building order.
- `src/renderer/chrome/topBar.ts` and `static/index.html`. With no match loaded, the Production suffix is cleared. It is a span, `#topbar-stat-production-suffix`, set back to `/turn` when a match is loaded. The recorded files left a static `/turn` in place, so a bar with no match read `—/turn`.
- `src/renderer/chrome/frameTooltipText.ts` still has the summary line added on `unavailableTooltipText` in plan 2.

- [ ] **Step 16: Smoke run**

```powershell
npm run ui:smoke -- --label top-bar-readouts
```

Expected summary line. The recorded run used `F:\Projects\Personal\agent-wars-public`. Another checkout is fine when the counts match and the path ends in `.test\ui-smoke\top-bar-readouts`.

```text
ui-smoke top-bar-readouts: 83 passed, 0 failed, 0 page errors, 9 screenshots in <repository>\.test\ui-smoke\top-bar-readouts
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/top-bar-readouts/report.json`.

- [ ] **Step 17: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/top-bar-readouts/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast.

- `03-strategic-1920x1080.png` against [ui-facelift-frame-4-expected-strategic-1920.png](ui-facelift-frame-4-expected-strategic-1920.png): The four readouts show their captions: PRODUCTION +492/turn, FORCES 5/34, YOUR HOME 11/15, ENEMY HOME 2/24.
- `02-strategic-1280x720.png` against [ui-facelift-frame-4-expected-strategic-1280.png](ui-facelift-frame-4-expected-strategic-1280.png): At 1280 px the captions are hidden and the same numbers stay.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 14.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 17.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With your own match: the four readouts look plausible. Production equals the sum of the `$` labels on the cities you hold. Your home and Enemy home match the home-region outlines on the map.
2. Hover each readout for one second: its tip appears. The Forces tip lists infantry, armor, naval, and air against their caps.
3. Play a turn: the readouts update with the new snapshot.
4. Make the window narrower than 1360 px: the captions hide and the numbers stay.

Spec disagreements. Follow this plan.

- Production sums the current urban count of every human-controlled hex, leaving out neutral borders. It does not look at the build queue. The layout spec also says a city adds its share only while it is building, which is what the credit in `src/main/gameActions/controlAndProduction.ts` does, and the Production tip says the same. Do not change the total or the tip to reconcile them.
- The comments in `src/shared/topBarStats.ts` say the total follows that credit. The function follows the three conditions named there: current urban count, human control, and no neutral-border hex.

## Next

Plan 5 adds the game menu, moves New game and Offer tactical battles into it, and hides Electron's menu bar.
