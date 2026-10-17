# UI Facelift Map, Plan 3 of 3: Selection Ring

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Draw a 3 px `#f2c14e` ring around the top marker of every hex that holds a selected unit, on the world map and in battles. The existing selection highlights stay.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 3 of the three that build the spec's Phase 4; [ui-facelift-map-execution-plan.md](ui-facelift-map-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `SELECTION_RING_COLOR` and `SELECTION_RING_WIDTH` in `src/renderer/core/constants.ts`, next to the unit radius. The color is the console's `--selection-mark` gold.
- `drawUnits` in `src/renderer/rendering/unitDrawing.ts` reads the current selection and rings the top marker of each hex that holds a selected unit. It now draws in three passes, markers, then rings, then count badges, so a ring stays visible over a neighboring marker and every badge stays readable.
- `doc/` describes the ring.

**Out of scope:**

- Anything else on the map. A unit drawn moving during playback, or hidden at battle-detail zoom, shows no ring.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop and the full tests passed, and the smoke run passed against the real app in Electron. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 4", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Decisions (item 4) and Map Chrome (Selection ring).
2. `doc/ux/selection-model.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 2 is in and this plan is not:

```powershell
Test-Path src/shared/orderArrowGeometry.ts
[bool](Select-String -Path src/renderer/core/constants.ts -Pattern 'SELECTION_RING_COLOR' -Quiet)
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **882**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/renderer/core/constants.ts`
- `src/renderer/rendering/unitDrawing.ts`
- `doc/ux/selection-model.md`
- `doc/ux/map-surface.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Edit `src/renderer/core/constants.ts`**

Adds the selection ring's color and width next to the unit radius.

In `src/renderer/core/constants.ts`, find this line. It occurs exactly once:

```ts
export const UNIT_RADIUS = 18;
```

Replace it with:

```ts
export const UNIT_RADIUS = 18;
/**
 * The color of the ring around the top marker of a hex that holds a selected unit.
 *
 * Purpose: Shows on the map which hexes hold the selection, in the same gold that marks selected rows in the console.
 * When to use: Only by `drawSelectionRing` in `src/renderer/rendering/unitDrawing.ts`.
 * Expected outcome: `#f2c14e`, the same color as the `--selection-mark` token in `static/shellChrome.css`.
 * Exceptions: None.
 */
export const SELECTION_RING_COLOR = '#f2c14e';
/**
 * The width of the selection ring, in CSS pixels.
 *
 * Purpose: Thick enough to read at a glance, thin enough to leave the unit glyph clear.
 * When to use: Only by `drawSelectionRing`.
 * Expected outcome: 3.
 * Exceptions: None.
 */
export const SELECTION_RING_WIDTH = 3;
```

- [ ] **Step 2: Edit `src/renderer/rendering/unitDrawing.ts`**

Adds the gold ring around the top marker of each hex that holds a selected unit. `drawUnits` now draws in three passes, markers, then rings, then count badges, so a ring stays visible over a neighboring marker and a badge stays readable over a ring.

1. In `src/renderer/rendering/unitDrawing.ts`, find this line. It occurs exactly once:

```ts
import { COUNT_BADGE_OFFSET, MULTI_PLAYER_FILL, MULTI_PLAYER_GLYPH_FILTER, MULTI_PLAYER_STROKE, PLAYER_COLORS, STACK_OFFSET_X, STACK_OFFSET_Y, UNIT_RADIUS, UNIT_TYPE_LABELS } from '../core/constants';
```

Replace it with:

```ts
import {
  COUNT_BADGE_OFFSET,
  MULTI_PLAYER_FILL,
  MULTI_PLAYER_GLYPH_FILTER,
  MULTI_PLAYER_STROKE,
  PLAYER_COLORS,
  SELECTION_RING_COLOR,
  SELECTION_RING_WIDTH,
  STACK_OFFSET_X,
  STACK_OFFSET_Y,
  UNIT_RADIUS,
  UNIT_TYPE_LABELS,
} from '../core/constants';
```

2. In `src/renderer/rendering/unitDrawing.ts`, find these lines. Together they occur exactly once:

```ts
 * Defines the `drawUnits` function shape (export function drawUnits().

 * Purpose: Supports maintainability by documenting why `drawUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
```

Replace them with:

```ts
 * Draws the gold selection ring around one unit marker.
 *
 * Purpose: Marks a hex that holds a selected unit, on top of the marker's own white edge.
 * When to use: Only by `drawUnits`, at the top marker of a hex that holds a selected unit, after every marker and
 *   before every count badge.
 * Expected outcome: A `SELECTION_RING_WIDTH` ring in `SELECTION_RING_COLOR` just outside the marker's edge.
 * Exceptions: None.
 */
function drawSelectionRing(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.beginPath();
  // The marker's 2 px edge ends 1 px outside its radius; the ring starts there.
  ctx.arc(x, y, UNIT_RADIUS + 1 + SELECTION_RING_WIDTH / 2, 0, Math.PI * 2);
  ctx.strokeStyle = SELECTION_RING_COLOR;
  ctx.lineWidth = SELECTION_RING_WIDTH;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws one marker per hex for the given units, with a second offset marker and a count badge for a stack.
 *
 * Purpose: Units are drawn on the canvas, one token per hex, in both theaters.
 * When to use: From the scene draw, with the strategic units or the battle's sub-units. Pass the ids of units drawn
 *   elsewhere this frame, such as units moving in playback, as `movingUnitIds`.
 * Expected outcome: Each hex gets a marker in its side's color, or the mixed-side fill when both sides are there. A hex
 *   with two or more units gets a second marker offset up and right, and a count badge. The top marker of a hex that
 *   holds a unit in the current selection gets the gold selection ring. Markers are drawn first, then rings, then
 *   badges, so a ring stays visible over a neighboring marker and a badge stays readable over a ring.
```

3. In `src/renderer/rendering/unitDrawing.ts`, find these lines. Together they occur exactly once:

```ts
  for (const [h3Index, hexUnits] of byHex) {
    const { x, y } = hexCenterPx(h3Index);
    const count = hexUnits.length;
```

Replace them with:

```ts
  const selectedUnitIds = new Set(S.selectedUnitIds);
  const tokens = [...byHex].map(([h3Index, hexUnits]) => {
    const { x, y } = hexCenterPx(h3Index);
    const count = hexUnits.length;
    return {
      x,
      y,
      count,
      top: count > 1 ? { x: x + STACK_OFFSET_X, y: y + STACK_OFFSET_Y } : { x, y },
      selected: hexUnits.some((u) => selectedUnitIds.has(u.id)),
      units: hexUnits,
    };
  });

  for (const { x, y, count, top, units: hexUnits } of tokens) {
```

4. In `src/renderer/rendering/unitDrawing.ts`, find these lines. Together they occur exactly once:

```ts
    const label = mixedType ? '*' : (UNIT_TYPE_LABELS[hexUnits[0]!.unitType] ?? '?');

    drawOneUnitMarker(ctx, x, y, fillColor, label, strokeColor, hexUnits[0]!.player);
    if (count > 1) {
      drawOneUnitMarker(ctx, x + STACK_OFFSET_X, y + STACK_OFFSET_Y, fillColor, label, strokeColor, hexUnits[0]!.player);
      const badgeX = x + COUNT_BADGE_OFFSET;
      const badgeY = y - COUNT_BADGE_OFFSET;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeText(String(count), badgeX, badgeY);
      ctx.fillStyle = '#000';
      ctx.fillText(String(count), badgeX, badgeY);
    }
```

Replace them with:

```ts
    const label = mixedType ? '*' : (UNIT_TYPE_LABELS[hexUnits[0]!.unitType] ?? '?');
    drawOneUnitMarker(ctx, x, y, fillColor, label, strokeColor, hexUnits[0]!.player);
    if (count > 1) {
      drawOneUnitMarker(ctx, top.x, top.y, fillColor, label, strokeColor, hexUnits[0]!.player);
    }
  }
  for (const { top, selected } of tokens) {
    if (selected) drawSelectionRing(ctx, top.x, top.y);
  }
  for (const { x, y, count } of tokens) {
    if (count < 2) continue;
    const badgeX = x + COUNT_BADGE_OFFSET;
    const badgeY = y - COUNT_BADGE_OFFSET;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeText(String(count), badgeX, badgeY);
    ctx.fillStyle = '#000';
    ctx.fillText(String(count), badgeX, badgeY);
```

- [ ] **Step 3: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 4: Edit `doc/ux/selection-model.md`**

Describes the ring and names the code that draws it.

1. In `doc/ux/selection-model.md`, find this line. It occurs exactly once:

````markdown
One selection drives the [selection panel](selection-panel.md), the highlight on the Orders tab's rows, ranged and strike targeting, and double-click orders. Hex clicks also record the hex under the pointer for orders, which is separate from the unit selection.
````

Replace it with:

````markdown
One selection drives the [selection panel](selection-panel.md), the gold ring on the map around the top marker of each hex that holds a selected unit, the highlight on the Orders tab's rows, ranged and strike targeting, and double-click orders. Hex clicks also record the hex under the pointer for orders, which is separate from the unit selection.
````

2. In `doc/ux/selection-model.md`, find this line. It occurs exactly once:

````markdown
- The [selection panel](selection-panel.md) lists the selected units and describes the first selected unit's hex. It is hidden when nothing is selected.
````

Replace it with:

````markdown
- The [selection panel](selection-panel.md) lists the selected units and describes the first selected unit's hex. It is hidden when nothing is selected.
- On the map, the top marker of each hex that holds a selected unit gets a 3 px gold ring (`SELECTION_RING_COLOR`), in both theaters. The ring is drawn over neighboring markers, and every stack's count badge is drawn over the rings. A unit drawn moving during playback, or hidden at battle-detail zoom, shows no ring.
````

3. In `doc/ux/selection-model.md`, find this line. It occurs exactly once:

````markdown
- `src/renderer/core/selection.ts`
````

Replace it with:

````markdown
- `src/renderer/core/selection.ts`
- `src/renderer/rendering/unitDrawing.ts` (`drawSelectionRing`)
````

- [ ] **Step 5: Edit `doc/ux/map-surface.md`**

Mentions the ring among the unit glyphs.

In `doc/ux/map-surface.md`, find this text. It occurs exactly once:

````markdown
Units that are moving during playback are drawn along the playback, not only at the destination.
````

Replace it with:

````markdown
The top marker of a hex that holds a selected unit has a gold ring, as in [selection-model.md](selection-model.md). Units that are moving during playback are drawn along the playback, not only at the destination.
````

- [ ] **Step 6: Edit `doc/ui-style-guide.md`**

Adds the ring to the palette.

In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged |
````

Replace it with:

````markdown
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged |
| Selection ring | `#f2c14e` | 3 px ring around the top marker of each hex that holds a selected unit (`SELECTION_RING_COLOR`). The same gold as the `--selection-mark` token on selected order rows |
````

- [ ] **Step 7: Edit `doc/how-to-play.md`**

Mentions the ring when selecting units.

In `doc/how-to-play.md`, find this text. It occurs exactly once:

````markdown
The selection panel at the map's bottom-left names the hex and lists the selected units with their orders; its **×** clears the selection.
````

Replace it with:

````markdown
A gold ring marks each hex that holds a selected unit. The selection panel at the map's bottom-left names the hex and lists the selected units with their orders; its **×** clears the selection.
````

## Verify

- [ ] **Step 8: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 9: Full tests**

Run the full tests. Expected: exit 0, test total **882**, failure total **0**.

- [ ] **Step 10: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/renderer/core/constants.ts src/renderer/rendering/unitDrawing.ts doc/ux/selection-model.md doc/ux/map-surface.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/renderer/core/constants.ts` | `331be020aac67b71` |
| `src/renderer/rendering/unitDrawing.ts` | `cc19ad527eb289ff` |
| `doc/ux/selection-model.md` | `eb0efb4078b92c02` |
| `doc/ux/map-surface.md` | `3dd5ec2fc7097ba3` |
| `doc/ui-style-guide.md` | `6df64ad57520549c` |
| `doc/how-to-play.md` | `9fc81d645d6c12ee` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 11: Smoke run**

```powershell
npm run ui:smoke -- --label selection-ring
```

Expected summary line:

```text
ui-smoke selection-ring: 352 passed, 0 failed, 0 page errors, 32 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\selection-ring
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/selection-ring/report.json`.

- [ ] **Step 12: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/selection-ring/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The battle's units are placed when it opens, so the battle screenshot can differ in where the units stand and which unit is selected. The ring is 3 px wide; zoom in on the image if it is hard to see.

- `16-selection-stack.png` against [ui-facelift-map-3-expected-stack.png](ui-facelift-map-3-expected-stack.png): the two units of a stack selected through the stack callout. A gold ring circles the stack's top marker, and its count badge stays on top of the ring.
- `26-battle-selection.png` against [ui-facelift-map-3-expected-battle.png](ui-facelift-map-3-expected-battle.png): a battle with one of your units selected. A gold ring circles its marker.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 9.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 12.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With your own match, select a lone unit, then a stack through the stack callout: each hex that holds a selected unit gets a gold ring around its top marker, under the stack's count.
2. Shift-select units in two hexes: both hexes are ringed. Right-click the map: the rings go.
3. In a battle, select a unit: its marker is ringed.

## Next

This completes the spec's Phase 4. Phase 5 builds the battle header.
