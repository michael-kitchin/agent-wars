# UI Facelift Console, Plan 2 of 5: Selection Panel

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Add the selection panel at the map's bottom-left. It names the hex of the first selected unit, shows that hex's terrain, weather, tech, production, and home chips, counts the selection, lists each selected unit with its order, and holds Ranged and Strike. Its × clears the selection the way right-click does.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 2 of the five that build the spec's Phase 3; [ui-facelift-console-execution-plan.md](ui-facelift-console-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- A pure, unit-tested summary in `src/shared/selectionPanelSummary.ts`: the hex the panel describes, "N selected of M", one row per unit, and the chips.
- The panel itself, `src/renderer/gameplay/selectionPanel.ts`, redrawn on every selection change. Its header uses the same place line as the hex tooltip. In a battle it describes the battle hex.
- The "Selected unit" line (`#sidebar-selected-unit`, now the panel's header line), the error line, and the Ranged/Strike controls move into the panel with their ids, so their handlers keep working. The Orders tab keeps only the three groups.
- What right-click does to clear the selection moves into one shared function, `clearSelectionLikeRightClick`, which the panel's × also calls.
- The smoke harness gains the selection scenes and checks. The later scenes check the panel too: it stays on the map at the 800 × 600 minimum, names a battle cell like "(E8.K3)" in the battle, and reads "1 selected of 1" in the regional match. It is hidden after a restart, at the start of a battle or a match, and on the game-over screen.
- `doc/` gains `doc/ux/selection-panel.md`.

**Out of scope:**

- Greying out Ranged or Strike with a reason, and resizing the panel. Plan 3 adds both. Until then, Ranged and Strike still hide when they do not apply.

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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Compatibility Names and Selection Panel.
2. `doc/ux/selection-model.md`, `doc/ux/right-panel-command-bar.md`, and `doc/ux/hex-tooltips.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 1 is in and this plan is not:

```powershell
Test-Path src/renderer/gameplay/queuedOrderRows.ts
Test-Path src/renderer/gameplay/selectionPanel.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **850**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/selectionPanelSummary.ts`
- `src/shared/selectionPanelSummary.test.ts`
- `src/renderer/rendering/unitDrawing.ts`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/entryCallbacks.ts`
- `src/renderer/renderer.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `src/main/mapGestureWiring.test.ts`
- `static/index.html`
- `static/selectionChrome.css`
- `static/frameChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-map.cjs`
- `scripts/ui-smoke/ui-smoke-console-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/selection-panel.md`
- `doc/ux/right-panel-selection-and-orders.md`
- `doc/ux/right-panel-command-bar.md`
- `doc/ux/right-panel.md`
- `doc/ux/selection-model.md`
- `doc/ux/control-tooltips.md`
- `doc/ux-specification.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Create `src/shared/selectionPanelSummary.ts`**

What the selection panel lists, worked out without touching the page: the hex the panel describes, the "N selected of M" count, and one row per selected unit; and the chips for that hex (terrain, weather, tech, production, home).

Create `src/shared/selectionPanelSummary.ts` with exactly this content:

```ts
/**
 * What the selection panel lists: the hex it describes, its count line, its unit rows, and its chips.
 *
 * Purpose: The panel's rules are easy to get wrong in DOM code, so they live here as pure functions with tests.
 * When to use: From the renderer's selection panel each time the selection, the units, or the orders change.
 * Expected outcome: Plain data and HTML strings; nothing touches the page.
 * Exceptions: None.
 */
import { escapeHtmlText } from './htmlTextFormatting';
import { formatTechTierHtml } from './featureIconHtml';
import type { TechLevel } from './techBonusTypes';
import { formatTerrainKindHtml } from './terrainSwatchHtml';
import type { WeatherState } from './weatherBonusTypes';
import { formatWeatherIconHtml } from './weatherIcons';

/**
 * One unit the panel may describe: a strategic unit, or a battle sub-unit during a battle.
 *
 * Purpose: Strategic units and battle sub-units share these fields.
 * When to use: Pass `state.units` on the world map and `battle.subUnits` in a battle.
 * Expected outcome: Only these fields are read.
 * Exceptions: None.
 */
export interface SelectionPanelUnitInput {
  /**
   * The unit's id.
   *
   * Contract: Unique within the list passed in.
   * When to use: Always.
   * Expected outcome: Matched against the selected ids.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * The unit's type, such as `armor`.
   *
   * Contract: One of the game's unit types.
   * When to use: Always.
   * Expected outcome: Chooses the row's type token.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * The hex or battle cell the unit stands in.
   *
   * Contract: An H3 index.
   * When to use: Always.
   * Expected outcome: Decides which hex the panel describes and which rows show another hex's code.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Which side owns the unit.
   *
   * Contract: `human` for the player's units.
   * When to use: Always.
   * Expected outcome: Only the player's units count toward the panel's total.
   * Exceptions: None.
   */
  readonly player: string;
}

/**
 * One row of the panel's unit list.
 *
 * Purpose: Says which unit the row shows and whether it stands in the hex the panel describes.
 * When to use: Returned by `summarizeSelectionPanel`.
 * Expected outcome: One row per selected unit, in selection order.
 * Exceptions: None.
 */
export interface SelectionPanelRow {
  /**
   * The selected unit's id.
   *
   * Contract: One of the selected ids.
   * When to use: Name, flag, and order lookups.
   * Expected outcome: Unique within the rows.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The unit's type.
   *
   * Contract: Copied from the unit.
   * When to use: The row's type token.
   * Expected outcome: For example `infantry`.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * The hex or cell the unit stands in.
   *
   * Contract: Copied from the unit.
   * When to use: The code shown after the name when `inPanelHex` is false.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Whether the unit stands in the hex the panel describes.
   *
   * Contract: True for the first selected unit.
   * When to use: Deciding whether to show the unit's own hex code.
   * Expected outcome: False marks a unit selected in another hex.
   * Exceptions: None.
   */
  readonly inPanelHex: boolean;
}

/**
 * The panel's hex, count line, and rows.
 *
 * Purpose: One value the renderer draws from.
 * When to use: Returned by `summarizeSelectionPanel`.
 * Expected outcome: Null from that function means the panel hides.
 * Exceptions: None.
 */
export interface SelectionPanelSummary {
  /**
   * The hex or cell of the first selected unit, which the header and chips describe.
   *
   * Contract: An H3 index.
   * When to use: The header's code and caption, and the chips.
   * Expected outcome: The first selected unit's hex.
   * Exceptions: None.
   */
  readonly panelHex: string;
  /**
   * The count line, such as `3 selected of 3`.
   *
   * Contract: Counts only units in `panelHex`.
   * When to use: Shown above the rows.
   * Expected outcome: Selected units there, out of the player's selectable units there.
   * Exceptions: None.
   */
  readonly countText: string;
  /**
   * One row per selected unit that still exists, in selection order.
   *
   * Contract: Never empty.
   * When to use: The unit list.
   * Expected outcome: See `SelectionPanelRow`.
   * Exceptions: None.
   */
  readonly rows: readonly SelectionPanelRow[];
}

/**
 * Works out what the selection panel shows for the current selection.
 *
 * Purpose: The panel describes the first selected unit's hex and lists every selected unit.
 * When to use: Each time the panel is drawn. `isSelectable` says whether a unit can be selected now; embarked land
 *   units cannot.
 * Expected outcome: Null when no selected id matches a unit. Otherwise the first selected unit's hex, the count line
 *   "N selected of M" (N: selected units in that hex; M: the player's selectable units there), and the rows.
 * Exceptions: None.
 */
export function summarizeSelectionPanel(
  selectedIds: readonly string[],
  units: readonly SelectionPanelUnitInput[],
  isSelectable: (unitId: string) => boolean
): SelectionPanelSummary | null {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const selected = selectedIds.map((id) => byId.get(id)).filter((unit): unit is SelectionPanelUnitInput => unit !== undefined);
  if (selected.length === 0) return null;
  const panelHex = selected[0].h3Index;
  const selectedHere = selected.filter((unit) => unit.h3Index === panelHex).length;
  const selectableHere = units.filter((unit) => unit.h3Index === panelHex && unit.player === 'human' && isSelectable(unit.id)).length;
  return {
    panelHex,
    countText: `${selectedHere} selected of ${Math.max(selectableHere, selectedHere)}`,
    rows: selected.map((unit) => ({
      unitId: unit.id,
      unitType: unit.unitType,
      h3Index: unit.h3Index,
      inPanelHex: unit.h3Index === panelHex,
    })),
  };
}

/**
 * What the panel's chips describe about its hex.
 *
 * Purpose: The renderer gathers these from the snapshot; this file decides which chips show and how they read.
 * When to use: The argument of `buildSelectionPanelChips`.
 * Expected outcome: A null field shows no chip.
 * Exceptions: None.
 */
export interface SelectionPanelChipInput {
  /**
   * The hex's terrain kind, such as `wetlands`.
   *
   * Contract: Null when unknown.
   * When to use: Always.
   * Expected outcome: A terrain chip with the map key's swatch.
   * Exceptions: None.
   */
  readonly terrainKind: string | null;
  /**
   * The hex's weather.
   *
   * Contract: Null while the weather bonus is off or the weather is not known.
   * When to use: Always.
   * Expected outcome: A weather chip with its icon.
   * Exceptions: None.
   */
  readonly weather: WeatherState | null;
  /**
   * The tech tier of units built in the hex.
   *
   * Contract: Null while the tech bonus is off, in a battle, or when the hex builds nothing.
   * When to use: Always.
   * Expected outcome: A Basic or Advanced chip with its icon.
   * Exceptions: None.
   */
  readonly techLevel: TechLevel | null;
  /**
   * The production the hex adds each turn.
   *
   * Contract: Null or zero shows no chip.
   * When to use: World hexes with urban cells, off the neutral border.
   * Expected outcome: A chip such as `$94/turn`.
   * Exceptions: None.
   */
  readonly productionPerTurn: number | null;
  /**
   * Whose home region the hex is in.
   *
   * Contract: Null outside both home regions and in a battle.
   * When to use: Always.
   * Expected outcome: A `Home` or `Enemy home` chip.
   * Exceptions: None.
   */
  readonly homeSide: 'human' | 'opponent' | null;
}

/**
 * One chip: what it describes, and its HTML.
 *
 * Purpose: The kind lets the stylesheet mark the home chips by side.
 * When to use: Returned by `buildSelectionPanelChips`.
 * Expected outcome: `html` is safe to assign as inner HTML.
 * Exceptions: None.
 */
export interface SelectionPanelChip {
  /**
   * Which fact the chip shows.
   *
   * Contract: `home` and `enemy-home` are the two home chips.
   * When to use: The chip's class name.
   * Expected outcome: For example `production`.
   * Exceptions: None.
   */
  readonly kind: 'terrain' | 'weather' | 'tech' | 'production' | 'home' | 'enemy-home';
  /**
   * The chip's content.
   *
   * Contract: Escaped HTML; swatches and icons come from the shared tooltip helpers.
   * When to use: Assign as the chip's inner HTML.
   * Expected outcome: Matches the words the hex tooltip uses.
   * Exceptions: None.
   */
  readonly html: string;
}

/**
 * Builds the panel's chips in display order: terrain, weather, tech, production, then home.
 *
 * Purpose: The panel shows the same facts as the hex tooltip, in short form.
 * When to use: Each time the panel's hex or the snapshot changes.
 * Expected outcome: One chip per known fact; unknown facts are left out.
 * Exceptions: None.
 */
export function buildSelectionPanelChips(input: SelectionPanelChipInput): SelectionPanelChip[] {
  const chips: SelectionPanelChip[] = [];
  if (input.terrainKind) chips.push({ kind: 'terrain', html: formatTerrainKindHtml(input.terrainKind) });
  if (input.weather) chips.push({ kind: 'weather', html: formatWeatherIconHtml(input.weather) });
  if (input.techLevel) chips.push({ kind: 'tech', html: formatTechTierHtml(input.techLevel) });
  if (input.productionPerTurn != null && input.productionPerTurn > 0) {
    chips.push({ kind: 'production', html: escapeHtmlText(`$${input.productionPerTurn.toLocaleString('en-US')}/turn`) });
  }
  if (input.homeSide === 'human') chips.push({ kind: 'home', html: 'Home' });
  if (input.homeSide === 'opponent') chips.push({ kind: 'enemy-home', html: 'Enemy home' });
  return chips;
}
```

- [ ] **Step 2: Create `src/shared/selectionPanelSummary.test.ts`**

Covers one unit, a stack, units in two hexes, an empty selection, and the chips.

Create `src/shared/selectionPanelSummary.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSelectionPanelChips, summarizeSelectionPanel, type SelectionPanelUnitInput } from './selectionPanelSummary';

/**
 * Units of both sides in two hexes, as the panel receives them.
 *
 * Purpose: One stack, a unit in another hex, and an enemy unit cover the panel's counting rules.
 * When to use: The tests in this file.
 * Expected outcome: Three player units and one enemy unit in `hexA`, and one player air unit in `hexB`.
 * Exceptions: None.
 */
const UNITS: readonly SelectionPanelUnitInput[] = [
  { id: 'h1-t1', unitType: 'armor', h3Index: 'hexA', player: 'human' },
  { id: 'h1-t2', unitType: 'armor', h3Index: 'hexA', player: 'human' },
  { id: 'h1-i1', unitType: 'infantry', h3Index: 'hexA', player: 'human' },
  { id: 'h1-a1', unitType: 'air', h3Index: 'hexB', player: 'human' },
  { id: 'o1-t1', unitType: 'armor', h3Index: 'hexA', player: 'opponent' },
];

test('summarizeSelectionPanel describes the first selected unit\'s hex and counts the player\'s units there', () => {
  const summary = summarizeSelectionPanel(['h1-t1', 'h1-i1'], UNITS, () => true);
  assert.ok(summary);
  assert.equal(summary.panelHex, 'hexA');
  assert.equal(summary.countText, '2 selected of 3');
  assert.deepEqual(summary.rows.map((row) => row.unitId), ['h1-t1', 'h1-i1']);
});

test('summarizeSelectionPanel marks a unit selected in another hex and leaves out units that cannot be selected', () => {
  const summary = summarizeSelectionPanel(['h1-t1', 'h1-a1'], UNITS, (unitId) => unitId !== 'h1-i1');
  assert.ok(summary);
  assert.equal(summary.countText, '1 selected of 2');
  assert.deepEqual(summary.rows.map((row) => [row.unitId, row.inPanelHex]), [['h1-t1', true], ['h1-a1', false]]);
});

test('summarizeSelectionPanel returns null when no selected id matches a unit', () => {
  assert.equal(summarizeSelectionPanel([], UNITS, () => true), null);
  assert.equal(summarizeSelectionPanel(['gone'], UNITS, () => true), null);
});

test('buildSelectionPanelChips lists the known facts in order', () => {
  const chips = buildSelectionPanelChips({
    terrainKind: 'wetlands',
    weather: 'mild',
    techLevel: 'advanced',
    productionPerTurn: 1094,
    homeSide: 'human',
  });
  assert.deepEqual(chips.map((chip) => chip.kind), ['terrain', 'weather', 'tech', 'production', 'home']);
  assert.match(chips[0].html, /Wetlands$/);
  assert.match(chips[2].html, /Advanced$/);
  assert.equal(chips[3].html, '$1,094/turn');
  assert.equal(chips[4].html, 'Home');
});

test('buildSelectionPanelChips leaves out unknown facts and zero production', () => {
  const chips = buildSelectionPanelChips({
    terrainKind: null,
    weather: null,
    techLevel: null,
    productionPerTurn: 0,
    homeSide: 'opponent',
  });
  assert.deepEqual(chips, [{ kind: 'enemy-home', html: 'Enemy home' }]);
});
```

- [ ] **Step 3: Edit `src/renderer/rendering/unitDrawing.ts`**

Exports the icon path for a unit type, so the panel's rows use the same icons as the map.

In `src/renderer/rendering/unitDrawing.ts`, find this line. It occurs exactly once:

```ts
  return `units/${UNIT_ICON_FILE_BY_TYPE[unitType]}`;
```

Replace it with:

```ts
  return `units/${UNIT_ICON_FILE_BY_TYPE[unitType]}`;
}

/**
 * Path of the glyph for a unit type, for page elements that show a unit's type.
 *
 * Purpose: A list row and the map token use the same glyph.
 * When to use: As an `<img>` source in panel markup.
 * Expected outcome: `units/<type>.svg`; a type with no glyph of its own uses the mixed glyph.
 * Exceptions: None.
 */
export function unitIconPathForUnitType(unitType: string): string {
  const known = Object.prototype.hasOwnProperty.call(UNIT_ICON_FILE_BY_TYPE, unitType);
  return iconPathForType(known ? (unitType as UnitIconType) : 'mixed');
```

- [ ] **Step 4: Create `src/renderer/gameplay/selectionPanel.ts`**

The panel itself: its header names the hex, then the chips, the count, a row per unit with its order or "No orders", and the Ranged/Strike controls. It shows while at least one of the player's units is selected.

Create `src/renderer/gameplay/selectionPanel.ts` with exactly this content:

```ts
/**
 * The selection panel at the map's bottom-left: the selected units' hex, its chips, the units, and their orders.
 *
 * The panel replaces the Orders tab's "Selected unit" line. Its header keeps the id `sidebar-selected-unit`.
 */
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { formatHexNamingCaptionHtml } from '../../shared/hexNamingCaption';
import { escapeHtmlText } from '../../shared/htmlTextFormatting';
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import {
  buildSelectionPanelChips,
  summarizeSelectionPanel,
  type SelectionPanelChipInput,
  type SelectionPanelRow,
} from '../../shared/selectionPanelSummary';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { techLevelFromUrbanHexCount } from '../../shared/techBonusRules';
import { isEmbarkedLandUnitBlockedForSelection } from '../core/selection';
import { rendererSharedState as S } from '../core/state';
import { setUnitNameContent } from '../core/unitOriginFlags';
import { getCachedNamingLineForTarget } from '../map/terrainTooltipStrategicState';
import { baselineUrbanHexCountForStrategicHex } from '../rendererTacticalHydration';
import { paintTerrainSwatches } from '../rendering/terrainVisualStyles';
import { unitIconPathForUnitType } from '../rendering/unitDrawing';
import { onQueuedOrdersChanged, queuedOrderForUnit } from './queuedOrderRows';

/**
 * Renderer callbacks the panel needs.
 *
 * Purpose: Keeps the panel free of a dependency on the renderer entry module.
 * When to use: Pass to `renderSelectionPanel` and `wireSelectionPanel`.
 * Expected outcome: Names come from the shared display-name lookup.
 * Exceptions: None.
 */
export interface SelectionPanelDeps {
  /**
   * Returns a unit's display name.
   *
   * Contract: Same names the map and the stack callout show.
   * When to use: Each unit row.
   * Expected outcome: The name, or a fallback built from the id.
   * Exceptions: None.
   */
  readonly formatUnitDisplayName: (unitId: string) => string;
}

/**
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
  });
}

/**
 * Gathers the chip facts for a world hex from the snapshot.
 *
 * Purpose: Uses the same sources as the hex tooltip and the top bar.
 * When to use: For the panel's hex outside a battle.
 * Expected outcome: Terrain kind, weather (present only while the weather bonus is on), the tech tier of units built
 *   there (only while the tech bonus is on), the production per turn (none on the neutral border), and the home side.
 * Exceptions: None.
 */
function worldChipInput(hex: string): SelectionPanelChipInput {
  const state = S.gameState;
  const row = state?.hexes.find((h) => h.h3Index === hex);
  const baselineUrban = baselineUrbanHexCountForStrategicHex(hex);
  const urban = state?.strategicInfrastructure?.find((r) => r.h3Index === hex)?.urbanHexCount ?? 0;
  const homeSide = state?.humanHomeRegionHexes?.includes(hex)
    ? 'human'
    : state?.aiHomeRegionHexes?.includes(hex)
      ? 'opponent'
      : null;
  return {
    terrainKind: row?.terrainKind ?? null,
    weather: row?.weather ?? null,
    techLevel: state?.techBonusEnabled === true && baselineUrban > 0 ? techLevelFromUrbanHexCount(baselineUrban) : null,
    productionPerTurn: isNeutralBorderHex(hex) ? null : Math.max(0, Math.trunc(urban)),
    homeSide,
  };
}

/**
 * Gathers the chip facts for a battle cell.
 *
 * Purpose: A battle cell has its own terrain and the battle's weather; production, tech, and home belong to world hexes.
 * When to use: For the panel's cell during a battle.
 * Expected outcome: The cell's terrain kind (the battle hex's kind when the cell has none) and, while the weather bonus
 *   is on, the battle's weather.
 * Exceptions: None.
 */
function battleChipInput(cell: string, battle: TacticalBattleSnapshot): SelectionPanelChipInput {
  return {
    terrainKind: battle.tacticalTerrainKindByH3?.[cell] ?? battle.strategicHexTerrainKind ?? null,
    weather: battle.weatherBonusEnabled === true ? battle.weather ?? null : null,
    techLevel: null,
    productionPerTurn: null,
    homeSide: null,
  };
}

/**
 * Writes the chips for the panel's hex.
 *
 * Purpose: Shows the hex's facts in short form.
 * When to use: From `renderSelectionPanel`.
 * Expected outcome: `#selection-panel-chips` holds one chip per known fact, with terrain swatches painted.
 * Exceptions: None.
 */
function renderSelectionPanelChips(panelHex: string, battle: TacticalBattleSnapshot | null): void {
  const host = document.getElementById('selection-panel-chips');
  if (!host) return;
  const chips = buildSelectionPanelChips(battle ? battleChipInput(panelHex, battle) : worldChipInput(panelHex));
  host.replaceChildren(
    ...chips.map((chip) => {
      const span = document.createElement('span');
      span.className = `selection-panel-chip selection-panel-chip-${chip.kind}`;
      span.innerHTML = chip.html;
      return span;
    })
  );
  paintTerrainSwatches(host);
}

/**
 * Builds a unit row's order chip: the order's line and a cancel ×, or "No orders".
 *
 * Purpose: Shows each selected unit's queued order with the Orders tab's wording.
 * When to use: For each unit row.
 * Expected outcome: The × cancels the order exactly as the Orders tab's × does.
 * Exceptions: None.
 */
function createOrderChip(unitId: string, unitName: string): HTMLElement {
  const chip = document.createElement('span');
  const order = queuedOrderForUnit(unitId);
  if (!order) {
    chip.className = 'selection-panel-order selection-panel-order-none';
    chip.textContent = 'No orders';
    return chip;
  }
  chip.className = 'selection-panel-order';
  const detail = document.createElement('span');
  detail.textContent = order.detail;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'selection-panel-order-cancel';
  cancel.setAttribute('aria-label', `Cancel the order for ${unitName}`);
  cancel.textContent = '×';
  cancel.addEventListener('click', order.cancel);
  chip.append(detail, cancel);
  return chip;
}

/**
 * Builds one unit row: the type token, the flag and name, the unit's hex when it differs, and the order chip.
 *
 * Purpose: Lists each selected unit with its order.
 * When to use: From `renderSelectionPanel`, once per row.
 * Expected outcome: An unattached list item.
 * Exceptions: None.
 */
function createUnitRow(row: SelectionPanelRow, battle: TacticalBattleSnapshot | null, deps: SelectionPanelDeps): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'selection-panel-unit';
  item.dataset.unitId = row.unitId;
  const token = document.createElement('img');
  token.className = 'selection-panel-unit-type';
  token.src = unitIconPathForUnitType(row.unitType);
  token.alt = '';
  const unitName = deps.formatUnitDisplayName(row.unitId);
  const name = document.createElement('span');
  name.className = 'selection-panel-unit-name';
  setUnitNameContent(name, row.unitId, unitName);
  item.append(token, name);
  if (!row.inPanelHex) {
    const where = document.createElement('span');
    where.className = 'selection-panel-unit-hex';
    where.textContent = `(${orderTargetHexCode(row.h3Index, battle) ?? '?'})`;
    item.append(where);
  }
  item.append(createOrderChip(row.unitId, unitName));
  return item;
}

/**
 * Redraws the selection panel from the current selection, units, and orders.
 *
 * Purpose: The panel follows every selection change on the map, in the stack callout, and in the Orders tab.
 * When to use: From `updateSidebar` after any selection change or snapshot, and whenever the queued orders change.
 * Expected outcome: Hidden when no selected unit exists. Otherwise the header, chips, count line, and one row per
 *   selected unit describe the first selected unit's hex. During a battle the panel describes battle cells.
 * Exceptions: None; missing elements are skipped.
 */
export function renderSelectionPanel(deps: SelectionPanelDeps): void {
  const panel = document.getElementById('selection-panel');
  if (!panel) return;
  const battle = S.tacticalBattleSnapshot;
  const units = battle ? battle.subUnits : S.gameState?.units ?? [];
  const summary = summarizeSelectionPanel(S.selectedUnitIds, units, (unitId) => !isEmbarkedLandUnitBlockedForSelection(unitId));
  panel.hidden = summary === null;
  if (!summary) return;
  renderSelectionPanelHeader(summary.panelHex, battle);
  renderSelectionPanelChips(summary.panelHex, battle);
  const count = document.getElementById('selection-panel-count');
  if (count) count.textContent = summary.countText;
  const list = document.getElementById('selection-panel-units');
  list?.replaceChildren(...summary.rows.map((row) => createUnitRow(row, battle, deps)));
}

/**
 * Keeps the panel's order chips in step with the Orders tab.
 *
 * Purpose: A queued or cancelled order changes the panel without a selection change.
 * When to use: Once during renderer startup.
 * Expected outcome: The panel redraws after every change to the queued orders.
 * Exceptions: None.
 */
export function wireSelectionPanel(deps: SelectionPanelDeps): void {
  onQueuedOrdersChanged(() => renderSelectionPanel(deps));
}
```

- [ ] **Step 5: Edit `src/renderer/map/mapClickSelectionPolicy.ts`**

Moves what right-click does to clear the selection into one shared function, so the panel's × does the same.

1. In `src/renderer/map/mapClickSelectionPolicy.ts`, find these lines. Together they occur exactly once:

```ts
import {
  shouldBlockEmbarkedLandUnitSelect,
```

Replace them with:

```ts
import {
  clearMapSelectionChrome,
  shouldBlockEmbarkedLandUnitSelect,
```

2. In `src/renderer/map/mapClickSelectionPolicy.ts`, find these lines. Together they occur exactly once:

```ts
    S.pendingStackCalloutTimeout = null;
  }
}
```

Replace them with:

```ts
    S.pendingStackCalloutTimeout = null;
  }
}

/**
 * Renderer callbacks that refresh the views after the selection is cleared.
 *
 * Purpose: Keeps `clearSelectionLikeRightClick` free of a dependency on the renderer entry module.
 * When to use: Pass the main-map interaction dependencies, which include all three.
 * Expected outcome: The selection panel, the Ranged and Strike row, and the map follow the cleared selection.
 * Exceptions: None.
 */
export interface SelectionClearRefreshDeps {
  /**
   * Redraws the selection panel and the order-row highlight.
   *
   * Contract: Same as `updateSidebar` in the renderer entry module.
   * When to use: After the selection changes.
   * Expected outcome: The panel hides when nothing is selected.
   * Exceptions: None.
   */
  readonly updateSidebar: () => void;
  /**
   * Redraws the ranged and air-strike groups and the Ranged and Strike controls.
   *
   * Contract: Same as `updateRangedSidebar` in the renderer entry module.
   * When to use: After the selection changes.
   * Expected outcome: The controls match the cleared selection.
   * Exceptions: None.
   */
  readonly updateRangedSidebar: () => void;
  /**
   * Redraws the map.
   *
   * Contract: Same as `redraw` in the renderer entry module.
   * When to use: After the selection changes.
   * Expected outcome: Selection marks and previews disappear.
   * Exceptions: None.
   */
  readonly redraw: () => void;
}

/**
 * Clears the selection the way a right-click on the map does, and leaves queued orders alone.
 *
 * Purpose: A right-click on the map and the selection panel's × must drop the same things.
 * When to use: From those two controls, while no new-game overlay is open.
 * Expected outcome: Pending select and callout timers stop. With nothing selected and no hover preview, only the
 *   gesture snapshot resets. Otherwise the selection, the gesture snapshot, the selected hex, the hover preview, and
 *   both targeting modes clear, and the selection views and the map redraw.
 * Exceptions: None.
 */
export function clearSelectionLikeRightClick(deps: SelectionClearRefreshDeps): void {
  clearDeferredHumanUnitSingleSelectTimer();
  clearDeferredStackCalloutTimer();
  if (S.selectedUnitIds.length === 0 && !S.hoverRoutePreview) {
    S.selectedUnitIdsAtMouseDown = [];
    S.gestureSelectionSnapshotAtMs = 0;
    return;
  }
  clearMapSelectionChrome();
  deps.updateSidebar();
  deps.updateRangedSidebar();
  deps.redraw();
}
```

- [ ] **Step 6: Edit `src/renderer/map/mainMapInteractions.ts`**

Right-click and the panel's × both call the shared clear.

1. In `src/renderer/map/mainMapInteractions.ts`, find this line. It occurs exactly once:

```ts
import { clearMapSelectionChrome, isEmbarkedLandUnitBlockedForSelection } from '../core/selection';
```

Replace it with:

```ts
import { isEmbarkedLandUnitBlockedForSelection } from '../core/selection';
```

2. In `src/renderer/map/mainMapInteractions.ts`, find this line. It occurs exactly once:

```ts
  clearDeferredStackCalloutTimer,
```

Replace it with:

```ts
  clearSelectionLikeRightClick,
```

3. In `src/renderer/map/mainMapInteractions.ts`, find these lines. Together they occur exactly once:

```ts
    clearDeferredHumanUnitSingleSelectTimer();
    clearDeferredStackCalloutTimer();
    if (S.selectedUnitIds.length === 0 && !S.hoverRoutePreview) {
      S.selectedUnitIdsAtMouseDown = [];
      S.gestureSelectionSnapshotAtMs = 0;
      return;
    }
    clearMapSelectionChrome();
    deps.updateSidebar();
    deps.updateRangedSidebar();
    deps.redraw();
  });
```

Replace them with:

```ts
    clearSelectionLikeRightClick(deps);
  });
  document.getElementById('selection-panel-close')?.addEventListener('click', () => clearSelectionLikeRightClick(deps));
```

- [ ] **Step 7: Edit `src/renderer/map/initCore.ts`**

Pointing at the panel dismisses map popovers, as the other map panels do.

1. In `src/renderer/map/initCore.ts`, find this line. It occurs exactly once:

```ts
   * Dismisses map hover tooltip state when the pointer enters the console, the top bar, or the game menu.
```

Replace it with:

```ts
   * Dismisses map hover tooltip state when the pointer enters the console, the top bar, the game menu, or the
   * selection panel.
```

2. In `src/renderer/map/initCore.ts`, find these lines. Together they occur exactly once:

```ts
   * When to use: Wired once at init; runs on every `pointerenter` into the console, the top bar, or the game menu.
   * Expected outcome: Tooltip timer cleared, `#hex-tooltip` hidden, and map hover preview state cleared.
   * Exceptions: None.
   */
  for (const chromeId of ['sidebar', 'app-topbar', 'game-menu']) {
```

Replace them with:

```ts
   * When to use: Wired once at init; runs on every `pointerenter` into that chrome.
   * Expected outcome: Tooltip timer cleared, `#hex-tooltip` hidden, and map hover preview state cleared.
   * Exceptions: None.
   */
  for (const chromeId of ['sidebar', 'app-topbar', 'game-menu', 'selection-panel']) {
```

- [ ] **Step 8: Edit `src/renderer/core/uiState.ts`**

A selection change also redraws the panel.

1. In `src/renderer/core/uiState.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
import { rendererSharedState as S } from './state';
import { setUnitNameContent } from './unitOriginFlags';
```

2. In `src/renderer/core/uiState.ts`, find these lines. Together they occur exactly once:

```ts
import { syncSidebarOrderRowSelection } from '../gameplay/sidebarOrderRow';

/**
 * Refreshes the selected-unit line and the selection highlight of the order rows.
 *
 * Purpose: Shows which unit the player has selected, with its origin flag.
 * When to use: After any selection change or snapshot that can change unit names.
 * Expected outcome: The primary unit's flag and name, followed by ` (+N)` when more units are selected;
 *   an em dash when nothing is selected. Order rows of selected units are highlighted.
 * Exceptions: None.
 */
export function updateSidebar(
  getPrimarySelectedUnitId: () => string | null,
  formatUnitDisplayName: (unitId: string) => string
): void {
  syncSidebarOrderRowSelection();
  const selectedUnitEl = document.getElementById('sidebar-selected-unit');
  if (selectedUnitEl) {
    const primary = getPrimarySelectedUnitId();
    if (!primary) {
      selectedUnitEl.textContent = S.selectedUnitIds.length <= 1 ? '—' : `— (+${S.selectedUnitIds.length - 1})`;
      return;
    }
    const extraCount = S.selectedUnitIds.length - 1;
    const suffix = extraCount > 0 ? ` (+${extraCount})` : '';
    setUnitNameContent(selectedUnitEl, primary, `${formatUnitDisplayName(primary)}${suffix}`);
  }
```

Replace them with:

```ts
import { syncSidebarOrderRowSelection } from '../gameplay/sidebarOrderRow';
import { renderSelectionPanel } from '../gameplay/selectionPanel';

/**
 * Refreshes everything that shows the selection: the selection panel and the highlight of the order rows.
 *
 * Purpose: Keeps the name every caller already uses; the "Selected unit" line is now the selection panel.
 * When to use: After any selection change or snapshot that can change unit names.
 * Expected outcome: The selection panel describes the selected units, or hides when none are selected. Order rows of
 *   selected units are highlighted.
 * Exceptions: None.
 */
export function updateSidebar(formatUnitDisplayName: (unitId: string) => string): void {
  syncSidebarOrderRowSelection();
  renderSelectionPanel({ formatUnitDisplayName });
```

- [ ] **Step 9: Edit `src/renderer/entryCallbacks.ts`**

Passes the name formatter the panel needs.

In `src/renderer/entryCallbacks.ts`, find this line. It occurs exactly once:

```ts
  return updateSidebarFromModule(getPrimarySelectedUnitId, formatUnitDisplayName);
```

Replace it with:

```ts
  return updateSidebarFromModule(formatUnitDisplayName);
```

- [ ] **Step 10: Edit `src/renderer/renderer.ts`**

Wires the panel at startup.

1. In `src/renderer/renderer.ts`, find this line. It occurs exactly once:

```ts
} from './gameplay/sidebarSupport';
```

Replace it with:

```ts
} from './gameplay/sidebarSupport';
import { wireSelectionPanel } from './gameplay/selectionPanel';
```

2. In `src/renderer/renderer.ts`, find this line. It occurs exactly once:

```ts
  wireConsoleFrame();
```

Replace it with:

```ts
  wireConsoleFrame();
  wireSelectionPanel({ formatUnitDisplayName });
```

- [ ] **Step 11: Edit `src/renderer/chrome/frameTooltipText.ts`**

Adds the panel close button's tip.

1. In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Control tips for the app frame around the map.
 * When to use: Set `data-control-tooltip` from these values. Static markup in `static/index.html` repeats the same characters.
 * Expected outcome: The player sees the sentence unchanged.
 * Exceptions: None.
 */

/**
```

Replace them with:

```ts
 * The Orders tab's tip. This module holds the control tips for the app frame around the map: set
 * `data-control-tooltip` from these values, and keep the static markup in `static/index.html` the same, character for
 * character.
 *
```

2. In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
export const ordersTabTooltipText = 'Show the selected unit and the orders queued for this turn or beat.';
```

Replace it with:

```ts
export const ordersTabTooltipText = 'Show the orders queued for this turn or beat.';
```

3. In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
  'Saving to a file is not available in this version. The match in progress is kept on disk between sessions.';
```

Replace it with:

```ts
  'Saving to a file is not available in this version. The match in progress is kept on disk between sessions.';

/**
 * The selection panel close button's tip.
 *
 * Purpose: Says the selection panel's × clears the selection and keeps the orders.
 * When to use: `#selection-panel-close`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const selectionPanelCloseTooltipText = 'Clear the selection. Queued orders stay.';
```

- [ ] **Step 12: Edit `src/main/mapGestureWiring.test.ts`**

This contract test reads the right-click listener's source. It now expects the shared clear function.

In `src/main/mapGestureWiring.test.ts`, find these lines. Together they occur exactly once:

```ts
    listenerSource.includes('clearMapSelectionChrome()'),
    'right-click should clear selection chrome through the shared helper'
```

Replace them with:

```ts
    listenerSource.includes('clearSelectionLikeRightClick(deps)'),
    'right-click should clear the selection through the shared right-click helper'
  );
  const rightClickHelper = getFunctionSource(readRendererSource('map', 'mapClickSelectionPolicy.ts'), 'clearSelectionLikeRightClick');
  assert.ok(
    rightClickHelper.includes('clearMapSelectionChrome()'),
    'the shared right-click helper should clear selection chrome through the shared helper'
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

Adds the panel to the map container and moves the selected-unit line, the error line, and the Ranged/Strike controls into it. The Orders tab keeps only the order groups.

1. In `static/index.html`, find this line. It occurs exactly once:

```html
  <link rel="stylesheet" href="consoleChrome.css" />
```

Replace it with:

```html
  <link rel="stylesheet" href="consoleChrome.css" />
  <link rel="stylesheet" href="selectionChrome.css" />
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
      <button type="button" id="tactical-exit-btn" class="tactical-exit-btn" aria-label="Exit battle">Exit Battle</button>
    </div>
  </div>
```

Replace them with:

```html
      <button type="button" id="tactical-exit-btn" class="tactical-exit-btn" aria-label="Exit battle">Exit Battle</button>
    </div>
    <section id="selection-panel" class="selection-panel" aria-label="Selected units" hidden>
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
      </div>
    </section>
  </div>
```

3. In `static/index.html`, delete these lines, including the line break at the end. Together they occur exactly once:

```html
        <p><strong>Selected unit</strong><br><span id="sidebar-selected-unit">—</span></p>
        <p class="console-ranged-row">
          <button type="button" id="ranged-attack-btn" class="ranged-btn" style="display: none;">Ranged</button>
          <select id="air-strike-target-type" class="ranged-btn" style="display: none;" data-control-tooltip="Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you cancel.">
            <option value="units">Enemy Units</option>
            <option value="urban">Production</option>
            <option value="airport">Airports</option>
            <option value="seaport">Seaports</option>
          </select>
          <button type="button" id="air-strike-cancel-btn" class="ranged-btn" style="display: none;" data-control-tooltip="Stop aiming an air strike and show Strike again. Strikes already in the list stay there.">Cancel</button>
        </p>
```

4. In `static/index.html`, find these lines. Together they occur exactly once:

```html
        </div>
        <p id="sidebar-error" class="chrome-error" style="font-size: 0.9em; display: none;"></p>
```

Replace them with:

```html
        </div>
```

5. In `static/index.html`, find this line. It occurs exactly once:

```html
      <button type="button" id="console-tab-orders" class="console-tab" role="tab" aria-selected="true" aria-controls="console-panel-orders" data-control-tooltip="Show the selected unit and the orders queued for this turn or beat."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path></svg><span>Orders</span><span id="console-tab-orders-badge" class="console-tab-badge" hidden></span></button>
```

Replace it with:

```html
      <button type="button" id="console-tab-orders" class="console-tab" role="tab" aria-selected="true" aria-controls="console-panel-orders" data-control-tooltip="Show the orders queued for this turn or beat."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path></svg><span>Orders</span><span id="console-tab-orders-badge" class="console-tab-badge" hidden></span></button>
```

- [ ] **Step 15: Create `static/selectionChrome.css`**

Styles for the selection panel.

Create `static/selectionChrome.css` with exactly this content:

```css
/* The selection panel at the map's bottom-left: header, chips, count, unit rows, and the Ranged and Strike row. */

.selection-panel {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 6200;
  width: 400px;
  max-width: calc(100% - 24px);
  max-height: calc(50% - 12px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  padding: 10px 12px 12px;
  background: var(--chrome-bg);
  color: var(--chrome-text);
  color-scheme: dark;
  border: 1px solid var(--chrome-border);
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  font-size: 13px;
}
.selection-panel[hidden],
#canvas-container:has(#game-over-overlay:not(.hidden)) #selection-panel {
  display: none;
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
}
.selection-panel-close {
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
.selection-panel-close:hover {
  background: var(--chrome-bg-raised);
}

/* ---------- Chips and count ---------- */
.selection-panel-chips {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.selection-panel-chips:empty {
  display: none;
}
.selection-panel-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--chrome-border);
  border-radius: 10px;
  background: var(--chrome-bg-raised);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.selection-panel-chip-home {
  border-color: var(--chrome-accent-edge);
}
.selection-panel-chip-enemy-home {
  border-color: var(--chrome-opponent-edge);
}
.selection-panel-count {
  flex: none;
  margin: 2px 0 0;
  color: var(--chrome-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ---------- Unit rows ---------- */
/* The rows take the height that is left and scroll past it. */
.selection-panel-units {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.selection-panel-unit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--chrome-divider);
}
.selection-panel-unit-type {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 3px;
  box-sizing: border-box;
  border-radius: 50%;
  background: var(--player-human);
  border: 1px solid var(--chrome-accent-edge);
}
.selection-panel-unit-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selection-panel-unit-hex {
  flex: none;
  color: var(--chrome-muted);
  font-size: 12px;
}
.selection-panel-order {
  flex: none;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 1px 2px 1px 8px;
  border: 1px solid var(--chrome-accent-edge);
  border-radius: 3px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.selection-panel-order-none {
  padding: 2px 8px;
  border-color: var(--chrome-border);
  color: var(--chrome-muted);
}
.selection-panel-order-cancel {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--chrome-text);
  font-size: 13px;
  line-height: 1;
}
.selection-panel-order-cancel:hover {
  background: var(--chrome-bg-raised);
}

/* ---------- Ranged and Strike ---------- */
/* Ranged, the strike target list, and its Cancel share one row. The row takes no space while all three are hidden. */
.selection-panel-actions {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding-top: 8px;
  border-top: 1px solid var(--chrome-divider);
}
.selection-panel-actions:not(:has(> :not([style*="display: none"]))) {
  display: none;
}
.selection-panel #sidebar-error {
  margin: 0;
}
```

- [ ] **Step 16: Edit `static/frameChrome.css`**

Removes the rules for the controls that moved out of the Orders tab.

In `static/frameChrome.css`, delete these lines, including the line break at the end. Together they occur exactly once:

```css
.console-panel > p:first-child {
  margin-top: 0;
}
/* Ranged, the strike target list, and its Cancel share one row. The row takes no space while all three are hidden. */
.console-ranged-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.35rem;
}
.console-ranged-row:not(:has(> :not([style*="display: none"]))) {
  display: none;
}
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the selection scenes.

In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  ordersQueued: 'orders-queued',
```

Replace it with:

```js
  ordersQueued: 'orders-queued',
  selectionCleared: 'selection-cleared',
  selectionStack: 'selection-stack',
  strikeAiming: 'strike-aiming',
```

- [ ] **Step 18: Edit `scripts/ui-smoke/ui-smoke-map.cjs`**

Adds helpers that clear the selection, select the human stack, and wait for the panel's rows. Selecting a lone unit now clears the selection first and waits until the panel lists only that unit.

1. In `scripts/ui-smoke/ui-smoke-map.cjs`, find these lines. Together they occur exactly once:

```js
 * Clicks a lone unit's hex and waits until it is selected.
 *
 * Purpose: Starts every scene that needs one selected unit.
 * When to use: After `captureMainMap`, while nothing is selected.
 * Expected outcome: The selected-unit line names a unit. Returns the unit's hex.
```

Replace them with:

```js
 * Waits until the selection panel lists exactly these units.
 *
 * Purpose: Each selection action ends when the panel shows its result.
 * When to use: After a click that changes the selection.
 * Expected outcome: Resolves once the panel's rows are these unit ids, in any order.
 * Exceptions: Throws a Playwright timeout when the panel does not show them.
 */
async function waitForSelectedUnits(page, unitIds) {
  await page.waitForFunction((expected) => {
    const rows = [...document.querySelectorAll('#selection-panel-units .selection-panel-unit')].map((row) => row.dataset.unitId);
    return rows.length === expected.length && expected.every((id) => rows.includes(id));
  }, unitIds, { timeout: MAP_WAIT_MS.order });
  await page.waitForTimeout(MAP_WAIT_MS.settle);
}

/**
 * Clears the selection with the selection panel's ×, when anything is selected.
 *
 * Purpose: While units are selected, a click on another hex plans an order instead of selecting, so every
 *   selection action starts from an empty selection.
 * When to use: At the start of each selection action.
 * Expected outcome: The selection panel is hidden.
 * Exceptions: Throws a Playwright timeout when the panel stays open.
 */
async function clearSelection(page) {
  if (await page.isVisible('#selection-panel')) await page.click('#selection-panel-close');
  await page.waitForSelector('#selection-panel', { state: 'hidden', timeout: MAP_WAIT_MS.order });
}

/**
 * Clicks a lone unit's hex and waits until it is the only selected unit.
 *
 * Purpose: Starts every scene that needs one selected unit.
 * When to use: After `captureMainMap`.
 * Expected outcome: The selection panel lists only that unit. Returns the unit's hex.
```

2. In `scripts/ui-smoke/ui-smoke-map.cjs`, find these lines. Together they occur exactly once:

```js
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
```

Replace them with:

```js
 * Clicks a unit that stands alone in its hex and waits until it is the only selected unit.
 *
 * Purpose: World-map units and battle units are selected the same way.
 * When to use: For a unit `loneHumanUnits` returned.
 * Expected outcome: The selection panel lists only that unit.
 * Exceptions: Throws a Playwright timeout when the selection does not appear.
 */
async function selectUnitInItsHex(page, unit) {
  await clearSelection(page);
  const point = await hexClientPoint(page, unit.h3Index);
  await page.mouse.click(point.x, point.y);
  await waitForSelectedUnits(page, [unit.id]);
}

/**
 * Clicks a hex that holds two or more of the player's units and no enemy, and selects them all from the unit list.
 *
 * Purpose: Gives the selection panel several units in one hex.
 * When to use: After `captureMainMap`.
 * Expected outcome: Every unit in that hex is selected and the unit list is closed again.
 * Exceptions: Throws when the scenario has no such hex, or the list or the selection does not appear.
 */
async function selectHumanStack(page) {
  const state = await readGameState(page);
  const countByHex = unitCountByHex(state.units);
  const stack = state.units.find((u) => u.player === 'human' && countByHex.get(u.h3Index) >= 2
    && state.units.every((other) => other.h3Index !== u.h3Index || other.player === 'human'));
  if (!stack) throw new Error('the scenario has no hex holding two or more human units and no enemy');
  const unitIds = state.units.filter((u) => u.h3Index === stack.h3Index).map((u) => u.id);
  await clearSelection(page);
  const point = await hexClientPoint(page, stack.h3Index);
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector('#stack-callout:not(.hidden)', { timeout: MAP_WAIT_MS.order });
  await page.click('#stack-callout .stack-callout-actions button:not(.stack-close-btn)');
  await waitForSelectedUnits(page, unitIds);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#stack-callout.hidden', { state: 'attached', timeout: MAP_WAIT_MS.order });
```

3. In `scripts/ui-smoke/ui-smoke-map.cjs`, find this line. It occurs exactly once:

```js
  selectLoneUnit,
```

Replace it with:

```js
  selectLoneUnit,
  selectHumanStack,
```

- [ ] **Step 19: Edit `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

Adds the selection panel checks: hidden without a selection, placed at the map's bottom-left, one unit, a stack, and Strike aiming inside the panel. The panel must also be hidden when the match reopens, when a battle or a regional match starts, and on the game-over screen.

1. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
 * Checks of what the console's tabs show, for the UI smoke run.
```

Replace it with:

```js
 * Checks of what the console's tabs and the selection panel show, for the UI smoke run.
```

2. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
const { SCENES } = require('./ui-smoke-scenes.cjs');
```

Replace it with:

```js
const { SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');
```

3. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
 * The console's content checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a rule about a console tab needs a machine check.
```

Replace them with:

```js
 * Default width of the selection panel in CSS pixels.
 *
 * Purpose: The panel opens at this width until the player resizes it.
 * When to use: The selection panel geometry check.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const SELECTION_PANEL_WIDTH = 400;

/**
 * Inset of map overlays from the map's edges, in CSS pixels.
 *
 * Purpose: The selection panel sits this far from the map's left and bottom edges.
 * When to use: The selection panel geometry check.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const MAP_OVERLAY_INSET = 12;

/**
 * The content checks for the console and the selection panel, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a rule about a console tab or the selection panel needs a machine check.
```

4. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
      '#sidebar-selected-unit',
```

Replace it with:

```js
      '#selection-panel-units .selection-panel-unit-name',
```

5. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      const selected = el('#sidebar-selected-unit').text;
      return name !== '' && name === selected ? null : `the row names "${name}" but the selected unit is "${selected}"`;
    },
```

Replace them with:

```js
      const selected = el('#selection-panel-units .selection-panel-unit-name').text;
      return name !== '' && name === selected ? null : `the row names "${name}" but the selection panel lists "${selected}"`;
    },
  },
  {
    name: 'selection-panel-hidden',
    scenes: [SCENES.strategic, SCENES.selectionCleared, SCENES.matchReopened, SCENES.battleStart, SCENES.regionalStart, SCENES.gameOverReopened],
    needs: ['#selection-panel'],
    run: (p, el) => (el('#selection-panel').shown ? 'the selection panel shows while nothing is selected' : null),
  },
  {
    name: 'selection-panel-geometry',
    scenes: [SCENES.ordersQueued, SCENES.selectionStack, SCENES.strikeAiming],
    needs: ['#canvas-container', '#selection-panel'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const s = el('#selection-panel');
      if (!s.shown) return 'the selection panel is not shown';
      const placed = near(s.x, c.x + MAP_OVERLAY_INSET) && near(s.y + s.h, c.y + c.h - MAP_OVERLAY_INSET) && near(s.w, SELECTION_PANEL_WIDTH);
      if (!placed) return `the selection panel is at ${fmt(s)}, expected ${SELECTION_PANEL_WIDTH} wide at the map's bottom-left, ${MAP_OVERLAY_INSET} px in`;
      return s.h <= c.h / 2 + 1 ? null : `the selection panel is ${Math.round(s.h)} tall, more than half the map's ${Math.round(c.h)}`;
    },
  },
  {
    name: 'selection-panel-one-unit',
    scenes: [SCENES.ordersQueued],
    needs: [
      '#sidebar-selected-unit',
      '#selection-panel-count',
      '#selection-panel-units .selection-panel-order > span',
      '#pending-orders-list .console-order-detail',
      '#ranged-attack-btn',
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
      return ranged.shown && ranged.text === 'Ranged' && ranged.ancestorIds.includes('selection-panel')
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}, expected it shown in the selection panel`;
    },
  },
  {
    name: 'selection-panel-stack',
    scenes: [SCENES.selectionStack],
    needs: ['#selection-panel-count', '#selection-panel-units .selection-panel-unit:nth-child(2)', '#selection-panel-units .selection-panel-order-none'],
    run: (p, el) => {
      const count = el('#selection-panel-count').text;
      if (count !== '2 selected of 2') return `the count reads "${count}", expected "2 selected of 2"`;
      const none = el('#selection-panel-units .selection-panel-order-none').text;
      return none === 'No orders' ? null : `a unit without orders reads "${none}"`;
    },
  },
  {
    name: 'strike-aiming-in-panel',
    scenes: [SCENES.strikeAiming],
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#air-strike-cancel-btn', '#selection-panel-count'],
    run: (p, el) => {
      if (el('#ranged-attack-btn').shown) return 'Strike still shows while aiming';
      const missing = ['#air-strike-target-type', '#air-strike-cancel-btn']
        .filter((selector) => !el(selector).shown || !el(selector).ancestorIds.includes('selection-panel'));
      if (missing.length > 0) return `not shown in the selection panel: ${missing.join(', ')}`;
      const count = el('#selection-panel-count').text;
      return count === '1 selected of 1' ? null : `the count reads "${count}", expected "1 selected of 1"`;
    },
  },
  {
    name: 'selection-cleared-rows',
    scenes: [SCENES.selectionCleared],
    needs: ['#pending-orders-list .console-order-select'],
    run: (p, el) => (el('#pending-orders-list .console-order-select').pressed === 'false' ? null : 'the order row still shows as selected'),
```

- [ ] **Step 20: Edit `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`**

Replaces the selected-unit line check with selection panel checks: inside the map at the minimum window, a battle cell's code in a battle, and "1 selected of 1" in the regional match.

1. In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find this line. It occurs exactly once:

```js
 * Purpose: The console must hold up beyond the first world-map turn. These rows check them in
```

Replace it with:

```js
 * Purpose: The console and the selection panel must hold up beyond the first world-map turn. These rows check them in
```

2. In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find this line. It occurs exactly once:

```js
const { SCENES } = require('./ui-smoke-scenes.cjs');
```

Replace it with:

```js
const { SCENES, fmt } = require('./ui-smoke-scenes.cjs');

/**
 * Inset of map overlays from the map's edges, in CSS pixels.
 *
 * Purpose: The selection panel keeps this distance from every edge of the map, whatever its size.
 * When to use: The small-window check.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const MAP_OVERLAY_INSET = 12;
```

3. In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find these lines. Together they occur exactly once:

```js
    name: 'selection-readout',
    scenes: [SCENES.battleSelection, SCENES.regionalSelection],
    needs: ['#sidebar-selected-unit'],
    run: (p, el) => {
      const readout = el('#sidebar-selected-unit').text;
      return readout !== '' && readout !== '—' ? null : `the selected-unit line reads "${readout}"`;
```

Replace them with:

```js
    name: 'selection-panel-small-window',
    scenes: [SCENES.smallWindow],
    needs: ['#canvas-container', '#selection-panel'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const s = el('#selection-panel');
      if (!s.shown) return 'the selection panel is not shown';
      const inside = s.x >= c.x + MAP_OVERLAY_INSET - 1 && s.y >= c.y + MAP_OVERLAY_INSET - 1
        && s.x + s.w <= c.x + c.w - MAP_OVERLAY_INSET + 1 && s.y + s.h <= c.y + c.h - MAP_OVERLAY_INSET + 1;
      return inside ? null : `the selection panel is at ${fmt(s)}, outside the map ${fmt(c)} less ${MAP_OVERLAY_INSET} px on each side`;
    },
  },
  {
    name: 'selection-panel-battle',
    scenes: [SCENES.battleSelection],
    needs: ['#selection-panel', '#sidebar-selected-unit', '#selection-panel-count'],
    run: (p, el) => {
      if (!el('#selection-panel').shown) return 'the selection panel is not shown';
      const header = el('#sidebar-selected-unit').text;
      if (!/^\([0-9A-Z]{2}\.[0-9A-Z]{2}\)/.test(header)) return `the header reads "${header}", expected a battle cell code such as "(E8.K3)"`;
      const count = el('#selection-panel-count').text;
      return /^1 selected of \d+$/.test(count) ? null : `the count reads "${count}", expected "1 selected of N"`;
    },
  },
  {
    name: 'selection-panel-regional',
    scenes: [SCENES.regionalSelection],
    needs: ['#selection-panel', '#sidebar-selected-unit', '#selection-panel-count'],
    run: (p, el) => {
      if (!el('#selection-panel').shown) return 'the selection panel is not shown';
      const header = el('#sidebar-selected-unit').text;
      if (!/^\([0-9A-Z]{2}\) \S/.test(header)) return `the header reads "${header}", expected a hex code and its caption`;
      const count = el('#selection-panel-count').text;
      return count === '1 selected of 1' ? null : `the count reads "${count}", expected "1 selected of 1"`;
```

- [ ] **Step 21: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Runs the selection scenes after the Orders scene, and selects the stack in the small-window scene.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  readGameState,
```

Replace it with:

```js
  readGameState,
  selectHumanStack,
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
 * Purpose: The console's contents must still fit there.
```

Replace it with:

```js
 * Purpose: The console's contents and the selection panel must still fit there.
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  // At the minimum window size, the Orders tab must still fit the console.
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
```

Replace them with:

```js
  await page.click('#selection-panel-close');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.selectionCleared);

  await selectHumanStack(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.selectionStack);

  // Aim an air strike from the selection panel, record it, then stop aiming.
  await selectLoneUnit(page, await readGameState(page), 'air');
  await page.click('#ranged-attack-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.strikeAiming);
  await page.click('#air-strike-cancel-btn');

  // At the minimum window size, select the stack; the selection panel must stay on the map.
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await selectHumanStack(page);
```

- [ ] **Step 22: Create `doc/ux/selection-panel.md`**

The new element document for the panel.

Create `doc/ux/selection-panel.md` with exactly this content:

````markdown
# Selection Panel

The panel at the map's bottom-left that describes the selected units, their hex, and their orders.

## Purpose

Show what the player has selected, where it stands, and what it has been told to do, next to the map the player is working on, and hold the Ranged and Strike controls for that selection.

## Availability

Shown in Strategic planning, Resolution playback, and Tactical planning while at least one of the player's units is selected. Hidden while nothing is selected, and hidden for the whole New game and Game over overlay. While the tactical battles list is open, and in Tactical annihilation, the panel stays as it was and does not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

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
- The Ranged and Strike controls. See [right-panel-command-bar.md](right-panel-command-bar.md).
- The panel is 400 px wide, 12 px in from the map's left and bottom edges. Its height fits its rows, up to half the map's height; past that the unit rows scroll. Where it overlaps the terrain legend or the map scale, it draws above them.
- A control tip for the close control is in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks the close control, the selection clears exactly as a right-click on the map clears it. Queued orders stay. See [selection-model.md](selection-model.md).
- When the player clicks an order's cancel control, that order is cancelled exactly as its Orders tab row's cancel control does.
- Clicks on a unit row do nothing else.

### Keyboard

- None.

### Other

- The panel follows every selection change, every snapshot, and every change to the queued orders.

## States

- Hidden: nothing is selected, or the new-game overlay is open.
- One hex: every selected unit stands in the described hex.
- Several hexes: rows for units in other hexes show their hex code.

## Invariants

- The panel never shows while nothing is selected.
- An order shown in the panel always reads the same as its row on the Orders tab.
- The panel's close control never cancels a queued order.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Units | Strategic units | Battle sub-units |
| Codes | World hex, such as "(D4)" | Battle cell, such as "(E8.K3)" |
| Chips | Terrain, weather, tech tier, production, home | Terrain and weather |

## Related Documents

- [selection-model.md](selection-model.md)
- [right-panel-command-bar.md](right-panel-command-bar.md)
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
- [map-surface.md](map-surface.md)
- [hex-tooltips.md](hex-tooltips.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#selection-panel`, `#sidebar-selected-unit`, `#selection-panel-close`, `#selection-panel-chips`, `#selection-panel-count`, `#selection-panel-units`, `#sidebar-error`)
- `static/selectionChrome.css`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/shared/selectionPanelSummary.ts`
- `src/shared/orderTargetHexCode.ts`
- `src/renderer/gameplay/queuedOrderRows.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts` (`clearSelectionLikeRightClick`)
- `src/renderer/core/uiState.ts` (`updateSidebar`)
````

- [ ] **Step 23: Edit `doc/ux/right-panel-selection-and-orders.md`**

The selected-unit line has moved to the selection panel.

1. In `doc/ux/right-panel-selection-and-orders.md`, find these lines. Together they occur exactly once:

````markdown
The selected-unit readout and the three order groups.

## Purpose

Show which units are selected and which drafts are queued, and let the player select or cancel a queued order from the list.
````

Replace them with:

````markdown
The three order groups on the Orders tab. The selected units are shown in the [selection panel](selection-panel.md).

## Purpose

Show which drafts are queued, and let the player select a queued order's unit or cancel the order from the list.
````

2. In `doc/ux/right-panel-selection-and-orders.md`, delete this line, including the line break at the end. It occurs exactly once:

````markdown
- "Selected unit" and either an em dash, one unit name, or that name plus a count of the other selected units.
````

3. In `doc/ux/right-panel-selection-and-orders.md`, find these lines. Together they occur exactly once:

````markdown
- Each row ends with a cancel control (×).
- The sidebar error line, which stays hidden. Errors use the map toast only. See [notifications-and-feedback.md](notifications-and-feedback.md).

The selected unit's name and each row's unit name are preceded by the unit's origin flag, under the same rules as the [stack callout](stack-callout.md), including a battle unit using the strategic unit it came from. An em dash has no flag. A unit with no recorded origin shows no flag.
````

Replace them with:

````markdown
- Each row ends with a cancel control (×).

Each row's unit name is preceded by the unit's origin flag, under the same rules as the [stack callout](stack-callout.md), including a battle unit using the strategic unit it came from. A unit with no recorded origin shows no flag.
````

4. In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
- The header's subtitle and the Orders tab's count follow the lists. See [right-panel.md](right-panel.md).
````

Replace it with:

````markdown
- The header's subtitle and the Orders tab's count follow the lists. See [right-panel.md](right-panel.md).
- The [selection panel](selection-panel.md) shows each selected unit's order with the same words, read from these lists.
````

5. In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
- [right-panel.md](right-panel.md)
````

Replace it with:

````markdown
- [right-panel.md](right-panel.md)
- [selection-panel.md](selection-panel.md)
````

6. In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#sidebar-selected-unit`, `#pending-orders-list`, `#pending-orders-count`, `#ranged-attacks-list`, `#ranged-attacks-count`, `#air-strikes-list`, `#air-strikes-count`, `#sidebar-error`)
````

Replace it with:

````markdown
- `static/index.html` (`#pending-orders-list`, `#pending-orders-count`, `#ranged-attacks-list`, `#ranged-attacks-count`, `#air-strikes-list`, `#air-strikes-count`)
````

7. In `doc/ux/right-panel-selection-and-orders.md`, find this line. It occurs exactly once:

````markdown
- `src/renderer/core/uiState.ts`
````

Replace it with:

````markdown
- `src/renderer/core/uiState.ts` (`updateSidebar`)
````

- [ ] **Step 24: Edit `doc/ux/right-panel-command-bar.md`**

Ranged and Strike now live in the selection panel.

1. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
Ready, in the right panel's footer, and the Ranged and air-strike controls on the Orders tab. The game-state readout is the date block in the [top bar](top-bar.md).
````

Replace it with:

````markdown
Ready, in the right panel's footer, and the Ranged and air-strike controls in the [selection panel](selection-panel.md). The game-state readout is the date block in the [top bar](top-bar.md).
````

2. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
Ready shows whenever the right panel does. Ranged and the air-strike controls show while the Orders tab is selected and the panel is expanded. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the panel is absent, so these controls are absent with it. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).
````

Replace it with:

````markdown
Ready shows whenever the right panel does. Ranged and the air-strike controls show in the selection panel, which shows while units are selected. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the right panel and the selection panel are absent, so these controls are absent with them. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).
````

3. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- The Ranged control, on the Orders tab under the selected-unit readout. The row takes no space while Ranged, the target list, and Cancel are all hidden. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
````

Replace it with:

````markdown
- The Ranged control, in the selection panel's last row. The row takes no space while Ranged, the target list, and Cancel are all hidden. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
````

4. In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
- [right-panel.md](right-panel.md)
````

Replace it with:

````markdown
- [right-panel.md](right-panel.md)
- [selection-panel.md](selection-panel.md)
````

- [ ] **Step 25: Edit `doc/ux/right-panel.md`**

Points to the selection panel.

In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- The Orders tab: the selected-unit readout, the Ranged and Strike controls, and the order groups. See [right-panel-command-bar.md](right-panel-command-bar.md) and [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
````

Replace it with:

````markdown
- The Orders tab: the order groups. See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md). The selected units, and the Ranged and Strike controls, are in the [selection panel](selection-panel.md) on the map.
````

- [ ] **Step 26: Edit `doc/ux/selection-model.md`**

The panel's × clears the selection like right-click.

1. In `doc/ux/selection-model.md`, find this line. It occurs exactly once:

````markdown
One selection drives the right-panel readout, ranged and strike targeting, and double-click orders. Hex clicks also record the hex under the pointer for orders, which is separate from the unit selection.
````

Replace it with:

````markdown
One selection drives the [selection panel](selection-panel.md), the highlight on the Orders tab's rows, ranged and strike targeting, and double-click orders. Hex clicks also record the hex under the pointer for orders, which is separate from the unit selection.
````

2. In `doc/ux/selection-model.md`, find these lines. Together they occur exactly once:

````markdown
- The selected-unit readout shows one unit name, or that name plus a count of the other selected units. It shows an em dash when nothing is selected.

## Clearing and Keeping a Selection

- When the player right-clicks the map while units are selected or a hover preview is showing, the selection, the gesture snapshot, the selected hex, the hover preview, and both targeting modes clear. Orders already queued stay queued.
````

Replace them with:

````markdown
- The [selection panel](selection-panel.md) lists the selected units and describes the first selected unit's hex. It is hidden when nothing is selected.

## Clearing and Keeping a Selection

- When the player right-clicks the map, or clicks the selection panel's close control, while units are selected or a hover preview is showing, the selection, the gesture snapshot, the selected hex, the hover preview, and both targeting modes clear. Orders already queued stay queued.
````

- [ ] **Step 27: Edit `doc/ux/control-tooltips.md`**

Rewords the Orders tab's tip, adds the close button's tip, and lists the panel's order cancel controls.

1. In `doc/ux/control-tooltips.md`, find these lines. Together they occur exactly once:

````markdown
- Orders tab: Show the selected unit and the orders queued for this turn or beat.
- Opponent tab: Show the opponent's model, its tools, and the AI activity log.
- Settings, Help, Load game, How to play, Build, and Forces: "<name> is not available in this version.", for example "Settings is not available in this version."
- Collapse the console: Hide the console to widen the map. Click a tab to show it again.
````

Replace them with:

````markdown
- Orders tab: Show the orders queued for this turn or beat.
- Opponent tab: Show the opponent's model, its tools, and the AI activity log.
- Settings, Help, Load game, How to play, Build, and Forces: "<name> is not available in this version.", for example "Settings is not available in this version."
- Collapse the console: Hide the console to widen the map. Click a tab to show it again.
- Selection panel close: Clear the selection. Queued orders stay.
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Order rows in the Orders tab, and their cancel controls.
````

Replace it with:

````markdown
- Order rows in the Orders tab, and their cancel controls.
- The cancel control on an order in the selection panel.
````

- [ ] **Step 28: Edit `doc/ux-specification.md`**

Adds the panel to the routing table, the element list, and the mode matrix.

1. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| Selected unit or order lists | [order-lifecycle.md](ux/order-lifecycle.md), [selection-model.md](ux/selection-model.md) | [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md) |
````

Replace it with:

````markdown
| Order lists on the Orders tab | [order-lifecycle.md](ux/order-lifecycle.md), [selection-model.md](ux/selection-model.md) | [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md) |
| The selection panel | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md) | [selection-panel.md](ux/selection-panel.md) |
````

2. In `doc/ux-specification.md`, find these lines. Together they occur exactly once:

````markdown
- [right-panel-command-bar.md](ux/right-panel-command-bar.md): Ready, Ranged, and air strike controls.
- [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md): the selected-unit readout and the movement, ranged, and air-strike lists.
````

Replace them with:

````markdown
- [right-panel-command-bar.md](ux/right-panel-command-bar.md): Ready, and the Ranged and air strike controls in the selection panel.
- [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md): the Movement, Ranged attacks, and Air strikes groups on the Orders tab.
- [selection-panel.md](ux/selection-panel.md): the panel at the map's bottom-left that describes the selected units, their hex, and their orders, and holds Ranged and Strike.
````

3. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| Selection and orders | Hidden | Shown | Disabled | Shown | Changed | Disabled | Hidden |
````

Replace it with:

````markdown
| Selection and orders | Hidden | Shown | Disabled | Shown | Changed | Disabled | Hidden |
| Selection panel | Hidden | Shown | Disabled | Shown | Changed | Disabled | Hidden |
````

- [ ] **Step 29: Edit `doc/ui-style-guide.md`**

Names `static/selectionChrome.css`.

In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar, the right panel's frame and tab rail, and the game menu are in `static/frameChrome.css`. The right panel's contents, such as the order groups and the rail counts, are in `static/consoleChrome.css`. `--selection-mark` (`#f2c14e`) marks what the player has selected. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

Replace it with:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar, the right panel's frame and tab rail, and the game menu are in `static/frameChrome.css`. The right panel's contents, such as the order groups and the rail counts, are in `static/consoleChrome.css`. The selection panel is in `static/selectionChrome.css`. `--selection-mark` (`#f2c14e`) marks what the player has selected. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

- [ ] **Step 30: Edit `doc/how-to-play.md`**

Mentions the panel.

In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
3. **Select units:** Click a teal (human) unit's icon. A lone unit is selected right away. A stack opens a list of its units, where you can pick one or use **+ All**.
4. **Issue a move order:** With units selected, double-click a destination hex (land/water/terrain rules apply). The order appears in the Movement group of the Orders tab, with the destination's hex code and its distance, such as "→ E5 · 1h". Click a row to select that unit again. A destination beyond this turn's reach becomes a march that continues on later turns.
5. **Ranged attack (armor or naval on strategic; broader types on tactical):** With capable units selected, click **Ranged**, then double-click an enemy hex within range. An all-air selection shows **Strike** instead. Attacks are submitted with Ready. See [Aiming ranged attacks and air strikes](#aiming-ranged-attacks-and-air-strikes).
````

Replace them with:

````markdown
3. **Select units:** Click a teal (human) unit's icon. A lone unit is selected right away. A stack opens a list of its units, where you can pick one or use **+ All**. The selection panel at the map's bottom-left names the hex and lists the selected units with their orders; its **×** clears the selection.
4. **Issue a move order:** With units selected, double-click a destination hex (land/water/terrain rules apply). The order appears in the Movement group of the Orders tab, with the destination's hex code and its distance, such as "→ E5 · 1h". Click a row to select that unit again. A destination beyond this turn's reach becomes a march that continues on later turns.
5. **Ranged attack (armor or naval on strategic; broader types on tactical):** With capable units selected, click **Ranged** in the selection panel, then double-click an enemy hex within range. An all-air selection shows **Strike** instead. Attacks are submitted with Ready. See [Aiming ranged attacks and air strikes](#aiming-ranged-attacks-and-air-strikes).
````

## Verify

- [ ] **Step 31: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 32: Full tests**

Run the full tests. Expected: exit 0, test total **855**, failure total **0**.

- [ ] **Step 33: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/selectionPanelSummary.ts src/shared/selectionPanelSummary.test.ts src/renderer/rendering/unitDrawing.ts src/renderer/gameplay/selectionPanel.ts src/renderer/map/mapClickSelectionPolicy.ts src/renderer/map/mainMapInteractions.ts src/renderer/map/initCore.ts src/renderer/core/uiState.ts src/renderer/entryCallbacks.ts src/renderer/renderer.ts src/renderer/chrome/frameTooltipText.ts src/main/mapGestureWiring.test.ts static/index.html static/selectionChrome.css static/frameChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-map.cjs scripts/ui-smoke/ui-smoke-console-checks.cjs scripts/ui-smoke/ui-smoke-scenario-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/selection-panel.md doc/ux/right-panel-selection-and-orders.md doc/ux/right-panel-command-bar.md doc/ux/right-panel.md doc/ux/selection-model.md doc/ux/control-tooltips.md doc/ux-specification.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/selectionPanelSummary.ts` | `1c266aaec9613b6f` |
| `src/shared/selectionPanelSummary.test.ts` | `a3b9f5fb7fd7d9b2` |
| `src/renderer/rendering/unitDrawing.ts` | `b08d1cd79a6ced74` |
| `src/renderer/gameplay/selectionPanel.ts` | `304eb69748dbca2d` |
| `src/renderer/map/mapClickSelectionPolicy.ts` | `e00f6a83e3bb8cad` |
| `src/renderer/map/mainMapInteractions.ts` | `6331faf78ca450c7` |
| `src/renderer/map/initCore.ts` | `cdbb705a19a39d77` |
| `src/renderer/core/uiState.ts` | `2b955871c8ea5156` |
| `src/renderer/entryCallbacks.ts` | `5c7074984b234c8f` |
| `src/renderer/renderer.ts` | `65eacc3eee667aec` |
| `src/renderer/chrome/frameTooltipText.ts` | `18e22010441786b3` |
| `src/main/mapGestureWiring.test.ts` | `f033e59f099c3f6a` |
| `static/index.html` | `150a2dbe930bb321` |
| `static/selectionChrome.css` | `83ec8fd894530e39` |
| `static/frameChrome.css` | `c1bf26600cd48511` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `5f3f7925312a588f` |
| `scripts/ui-smoke/ui-smoke-map.cjs` | `17b818243fd6b4b1` |
| `scripts/ui-smoke/ui-smoke-console-checks.cjs` | `b731bce59047fc65` |
| `scripts/ui-smoke/ui-smoke-scenario-checks.cjs` | `20f3f313d81888f9` |
| `scripts/ui-smoke/ui-smoke.cjs` | `6cc85949d5076452` |
| `doc/ux/selection-panel.md` | `fb76ba7e98792d66` |
| `doc/ux/right-panel-selection-and-orders.md` | `de4bd505cc25a585` |
| `doc/ux/right-panel-command-bar.md` | `b530da5cca4af271` |
| `doc/ux/right-panel.md` | `9426861a58641424` |
| `doc/ux/selection-model.md` | `450cacef2b687774` |
| `doc/ux/control-tooltips.md` | `d1646217c363c048` |
| `doc/ux-specification.md` | `ef2ca8c61dc33064` |
| `doc/ui-style-guide.md` | `fac2367c1e33800b` |
| `doc/how-to-play.md` | `b73b8666b7c53b92` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.


- [ ] **Step 34: Smoke run**

```powershell
npm run ui:smoke -- --label selection-panel
```

Expected summary line:

```text
ui-smoke selection-panel: 235 passed, 0 failed, 0 page errors, 24 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\selection-panel
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/selection-panel/report.json`.

- [ ] **Step 35: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/selection-panel/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The battle's units are placed when it opens, so the battle screenshots can differ in where the units stand, which unit the run selects, and the codes. The new-game overlay draws its region, sides, and month at random.

- `14-selection-stack.png` against [ui-facelift-console-2-expected-stack.png](ui-facelift-console-2-expected-stack.png): The panel at the map's bottom-left. Its header names the hex code and its countries, with a × at the right. Under it are chips for the terrain, the weather, the tech tier, the production per turn, and Home. Then "2 SELECTED OF 2", and two rows, 1st Infantry and 1st Armored, each with its type icon and "No orders". No Ranged button shows, because infantry cannot fire on the world map. The Orders tab shows only the three groups.
- `15-strike-aiming.png` against [ui-facelift-console-2-expected-strike.png](ui-facelift-console-2-expected-strike.png): The air unit is selected and Strike is aiming: "1 SELECTED OF 1", the 1st Squadron row, and, at the bottom of the panel, the target list reading "Enemy Units" beside Cancel.
- `16-small-window.png` against [ui-facelift-console-2-expected-small-window.png](ui-facelift-console-2-expected-small-window.png): At the 800 × 600 minimum, with the infantry and armor stack selected: the panel sits at the map's bottom-left, inside the map, with its header, chips, "2 SELECTED OF 2", and both rows. The Orders tab still fits the console.
- `19-battle-selection.png` against [ui-facelift-console-2-expected-battle.png](ui-facelift-console-2-expected-battle.png): Inside the battle, with one infantry unit selected: the panel's header starts with the cell's code in brackets, like "(E8.GC)", then the place. Its chips show the terrain and the weather. It reads "1 SELECTED OF 1" over the unit's row, with Ranged at the bottom. The Orders tab reads "0 queued for beat 1".

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 32.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 35.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. Select a lone unit, then a stack through the stack callout: the panel follows. The count reads "N selected of M", where M counts your selectable units in that hex.
2. Shift-select units in two different hexes: the rows of units outside the described hex show that hex's code in brackets.
3. Queue a move for a selected unit: its row shows the order's line, the same as on the Orders tab.
4. Click the panel's ×: the selection clears, queued orders stay, and the panel hides. Right-click does the same.
5. Use Ranged and Strike from the panel, including Cancel: they behave as before.
6. Point at the panel while a hex tooltip or the stack callout is open: it closes, as it does over the other map panels.
7. If your match has a tactical entry marker, enter the battle and select a unit: the panel describes the battle hex.
8. Choose New game… in the game menu: the panel hides with the rest of the match chrome.

## Next

Plan 3 greys out Ranged or Strike with a reason when it does not apply, and lets the player resize the panel.
