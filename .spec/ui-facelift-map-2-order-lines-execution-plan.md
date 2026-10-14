# UI Facelift Map, Plan 2 of 3: Order Line Casing and Arrowheads

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Draw every order line (movement, ranged, and air strike; queued, previewed, and played back) over a pale casing, so it stays readable on any terrain. Give ranged and air-strike lines, including the shot lines drawn during playback, the movement arrowhead. Colors and dash patterns stay as they are.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 2 of the three that build the spec's Phase 4; [ui-facelift-map-execution-plan.md](ui-facelift-map-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `src/shared/orderArrowGeometry.ts`: where a line stops and where its arrowhead's corners are. Unit-tested. The old arrow functions each repeated this math.
- `src/renderer/rendering/orderLineStroke.ts`: the one drawing path for order lines. It draws every casing first, then the colored runs and the arrowhead, so the outline never cuts across a line where a dash or an arrowhead begins.
- Movement routes and their previews keep their solid part for this turn or beat and their dashed part beyond. A move played back for the player, other than an air strike's flight, still has no arrowhead.
- Ranged and air-strike lines now stop where their arrowhead begins, a unit radius plus the arrow's length short of the target's center. The aiming preview draws through the same function as a queued attack.
- One contract test follows the new drawing path. `doc/` describes the casing and the arrowheads.

**Out of scope:**

- The range perimeter shown while aiming. It is an outline, not an order line, and keeps its style.
- The selection ring (plan 3).

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop and the smoke run passed against the real app in Electron. The full tests ran once, after the last plan, and the test total below adds this plan's new tests to the starting total. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Decisions (item 11) and Map Chrome (Order lines).
2. `doc/ux/map-overlays.md` and `doc/ux/order-lifecycle.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 1 is in and this plan is not:

```powershell
Test-Path src/shared/mapViewMode.ts
Test-Path src/shared/orderArrowGeometry.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **879**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/orderArrowGeometry.ts`
- `src/shared/orderArrowGeometry.test.ts`
- `src/renderer/core/constants.ts`
- `src/renderer/rendering/orderLineStroke.ts`
- `src/renderer/rendering/pathDrawing.ts`
- `src/renderer/rendering/orderDrawing.ts`
- `src/renderer/rendering/hoverPreview.ts`
- `src/main/rangePerimeterStroke.test.ts`
- `doc/ux/map-overlays.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Create `src/shared/orderArrowGeometry.ts`**

Where an order line stops and where its arrowhead's three corners are, for any line and any target inset. The geometry the old arrow functions repeated, written once.

Create `src/shared/orderArrowGeometry.ts` with exactly this content:

```ts
/**
 * A point on the map canvas, in CSS pixels.
 *
 * Purpose: Order lines and their arrowheads are worked out in canvas pixels.
 * When to use: Inputs and results of `orderArrowGeometry`.
 * Expected outcome: Plain `x` and `y` numbers.
 * Exceptions: None.
 */
export type CanvasPoint = { readonly x: number; readonly y: number };

/**
 * How wide an arrowhead's base is, as a share of its length on each side of the line.
 *
 * Purpose: Keeps the movement arrow's proportions for every order line that gets an arrowhead.
 * When to use: Only by `orderArrowGeometry`.
 * Expected outcome: 0.6, so a 10 px arrow has a 12 px base.
 * Exceptions: None.
 */
const ARROW_HALF_BASE_RATIO = 0.6;

/**
 * Works out where an order line stops and where its arrowhead's three corners are.
 *
 * Purpose: Movement, ranged, and air-strike lines share one arrow shape, so the geometry is written once and tested.
 * When to use: For a line from `from` toward `to`. `tipInset` is how far short of `to` the arrow's tip stops: the unit
 *   radius when a unit marker sits at `to`, or 0 for a route that ends at a hex center.
 * Expected outcome: `tip` lies on the line, `tipInset` short of `to`. `lineEnd`, where the line stops, is
 *   `arrowSize` further back, in the middle of the arrow's base; `left` and `right` are the base's corners. When
 *   `from` and `to` are the same point, the arrow points along +x.
 * Exceptions: None.
 */
export function orderArrowGeometry(
  from: CanvasPoint,
  to: CanvasPoint,
  sizes: { readonly arrowSize: number; readonly tipInset: number }
): { readonly lineEnd: CanvasPoint; readonly tip: CanvasPoint; readonly left: CanvasPoint; readonly right: CanvasPoint } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const ux = length > 0 ? dx / length : 1;
  const uy = length > 0 ? dy / length : 0;
  const tip = { x: to.x - ux * sizes.tipInset, y: to.y - uy * sizes.tipInset };
  const lineEnd = { x: tip.x - ux * sizes.arrowSize, y: tip.y - uy * sizes.arrowSize };
  const halfBase = sizes.arrowSize * ARROW_HALF_BASE_RATIO;
  return {
    lineEnd,
    tip,
    left: { x: lineEnd.x + uy * halfBase, y: lineEnd.y - ux * halfBase },
    right: { x: lineEnd.x - uy * halfBase, y: lineEnd.y + ux * halfBase },
  };
}
```

- [ ] **Step 2: Create `src/shared/orderArrowGeometry.test.ts`**

Covers an arrow stopping short of a unit marker, an arrow ending on a hex center, and a zero-length line.

Create `src/shared/orderArrowGeometry.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderArrowGeometry } from './orderArrowGeometry';

test('orderArrowGeometry stops the tip short of a unit marker and the line at the arrow base', () => {
  assert.deepEqual(orderArrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, { arrowSize: 10, tipInset: 18 }), {
    tip: { x: 82, y: 0 },
    lineEnd: { x: 72, y: 0 },
    left: { x: 72, y: -6 },
    right: { x: 72, y: 6 },
  });
});

test('orderArrowGeometry puts the tip on the target when the inset is 0', () => {
  const arrow = orderArrowGeometry({ x: 10, y: 10 }, { x: 10, y: 60 }, { arrowSize: 10, tipInset: 0 });
  assert.deepEqual(arrow.tip, { x: 10, y: 60 });
  assert.deepEqual(arrow.lineEnd, { x: 10, y: 50 });
  assert.deepEqual(arrow.left, { x: 16, y: 50 });
  assert.deepEqual(arrow.right, { x: 4, y: 50 });
});

test('orderArrowGeometry points along +x when both ends are the same point', () => {
  const arrow = orderArrowGeometry({ x: 5, y: 5 }, { x: 5, y: 5 }, { arrowSize: 10, tipInset: 0 });
  assert.deepEqual(arrow.tip, { x: 5, y: 5 });
  assert.deepEqual(arrow.lineEnd, { x: -5, y: 5 });
});
```

- [ ] **Step 3: Edit `src/renderer/core/constants.ts`**

Adds the casing's color and width next to the other order-line constants.

In `src/renderer/core/constants.ts`, find this line. It occurs exactly once:

```ts
export const AI_ORDER_LINE_COLOR = PLAYER_COLORS.opponent;
```

Replace it with:

```ts
export const AI_ORDER_LINE_COLOR = PLAYER_COLORS.opponent;
/**
 * The pale outline drawn under every order line, in CSS color.
 *
 * Purpose: A dashed teal, amber, or purple line can vanish on similar terrain; the casing keeps it readable anywhere.
 * When to use: Only by `drawOrderLine` in `src/renderer/rendering/orderLineStroke.ts`.
 * Expected outcome: White at 80% opacity.
 * Exceptions: None.
 */
export const ORDER_LINE_CASING_COLOR = 'rgba(255, 255, 255, 0.8)';
/**
 * How far the order-line casing shows on each side of the line, in CSS pixels.
 *
 * Purpose: Wide enough to read as an outline, narrow enough not to look like a second line.
 * When to use: Only by `drawOrderLine` in `src/renderer/rendering/orderLineStroke.ts`.
 * Expected outcome: 1.5.
 * Exceptions: None.
 */
export const ORDER_LINE_CASING_PAD = 1.5;
```

- [ ] **Step 4: Create `src/renderer/rendering/orderLineStroke.ts`**

The one drawing path for order lines: every casing first, then the colored runs and the arrowhead, so the outline never cuts across a line where an arrowhead or a dash begins. Also the solid and later-turn dash patterns, and builders for a straight line with an arrow and for a route's end arrow.

Create `src/renderer/rendering/orderLineStroke.ts` with exactly this content:

```ts
/**
 * Draws order lines (movement, ranged, and air strike; queued, previewed, and played back) the same way: a light casing
 * first, then the colored line, and an optional arrowhead.
 *
 * Purpose: One drawing path, so every order line keeps the same outline and arrow.
 * When to use: Build an `OrderLineShape` and pass it to `drawOrderLine`.
 * Expected outcome: Canvas drawing only; nothing here reads game state.
 * Exceptions: None.
 */
import { ORDER_ARROW_SIZE, ORDER_LINE_CASING_COLOR, ORDER_LINE_CASING_PAD, ORDER_LINE_WIDTH } from '../core/constants';
import { orderArrowGeometry, type CanvasPoint } from '../../shared/orderArrowGeometry';

/**
 * The dash pattern for the part of a route beyond this turn or beat, in CSS pixels.
 *
 * Purpose: Movement routes and their previews draw this turn's part solid and the rest with this dash.
 * When to use: As the `dash` of a run that lies beyond this turn or beat.
 * Expected outcome: 6 px drawn, 4 px skipped.
 * Exceptions: None.
 */
export const ORDER_LINE_LATER_DASH: readonly number[] = [6, 4];

/**
 * The dash pattern for a solid run.
 *
 * Purpose: Names the empty pattern so a run's style reads plainly.
 * When to use: As the `dash` of a run drawn solid.
 * Expected outcome: An empty array.
 * Exceptions: None.
 */
export const ORDER_LINE_SOLID: readonly number[] = [];

/**
 * One drawn run of an order line: canvas points joined in order, and the run's dash pattern.
 *
 * Purpose: A route can switch from solid to dashed part way; each part is its own run.
 * When to use: The `runs` of an `OrderLineShape`.
 * Expected outcome: Two or more points draw a line; fewer draw nothing.
 * Exceptions: None.
 */
export type OrderLineRun = { readonly points: readonly CanvasPoint[]; readonly dash: readonly number[] };

/**
 * Everything one order line draws: its runs and, optionally, an arrowhead from `orderArrowGeometry`.
 *
 * Purpose: The casing and the colored line must trace the same shape.
 * When to use: Build one per order line and pass it to `drawOrderLine`.
 * Expected outcome: Plain data; nothing is drawn until `drawOrderLine`.
 * Exceptions: None.
 */
export type OrderLineShape = {
  readonly runs: readonly OrderLineRun[];
  readonly arrow: ReturnType<typeof orderArrowGeometry> | null;
};

/**
 * Traces a run as one path, starting a new piece wherever it jumps across the map's date line.
 *
 * Purpose: A route that crosses the date line would otherwise draw a line across the whole map.
 * When to use: Only by `drawOrderLine`, once for the casing and once for the line.
 * Expected outcome: The current path holds the run; nothing is stroked here.
 * Exceptions: None.
 */
function traceRun(ctx: CanvasRenderingContext2D, points: readonly CanvasPoint[]): void {
  const wrapJumpPx = ctx.canvas.width * 0.5;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const current = points[i]!;
    if (Math.abs(current.x - points[i - 1]!.x) > wrapJumpPx) ctx.moveTo(current.x, current.y);
    else ctx.lineTo(current.x, current.y);
  }
}

/**
 * Traces an arrowhead as a closed triangle.
 *
 * Purpose: The casing and the colored arrowhead use the same outline.
 * When to use: Only by `drawOrderLine`.
 * Expected outcome: The current path holds the triangle; nothing is filled or stroked here.
 * Exceptions: None.
 */
function traceArrow(ctx: CanvasRenderingContext2D, arrow: ReturnType<typeof orderArrowGeometry>): void {
  ctx.beginPath();
  ctx.moveTo(arrow.tip.x, arrow.tip.y);
  ctx.lineTo(arrow.left.x, arrow.left.y);
  ctx.lineTo(arrow.right.x, arrow.right.y);
  ctx.closePath();
}

/**
 * Draws one order line: the whole casing first, then the colored runs and the arrowhead.
 *
 * Purpose: Drawing every casing before any color keeps the outline from cutting across the line where an arrowhead or
 *   a dashed run begins.
 * When to use: For every movement, ranged, and air-strike line, queued, previewed, or played back. Set
 *   `globalAlpha` on the context first when the line is translucent.
 * Expected outcome: The runs are stroked with `style.color` at `style.width`, each with its own dash, and the
 *   arrowhead is filled and outlined in the same color at the movement line's width. Under all of it is a solid pale
 *   casing `ORDER_LINE_CASING_PAD` wider on each side. The context's line settings are restored afterwards.
 * Exceptions: None. Runs with fewer than two points are skipped.
 */
export function drawOrderLine(
  ctx: CanvasRenderingContext2D,
  shape: OrderLineShape,
  style: { readonly color: string; readonly width: number; readonly cap?: CanvasLineCap }
): void {
  const runs = shape.runs.filter((run) => run.points.length >= 2);
  if (runs.length === 0 && !shape.arrow) return;
  ctx.save();
  ctx.lineJoin = 'round';

  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = ORDER_LINE_CASING_COLOR;
  ctx.fillStyle = ORDER_LINE_CASING_COLOR;
  ctx.lineWidth = style.width + ORDER_LINE_CASING_PAD * 2;
  for (const run of runs) {
    traceRun(ctx, run.points);
    ctx.stroke();
  }
  if (shape.arrow) {
    ctx.lineWidth = ORDER_LINE_WIDTH + ORDER_LINE_CASING_PAD * 2;
    traceArrow(ctx, shape.arrow);
    ctx.fill();
    ctx.stroke();
  }

  ctx.lineCap = style.cap ?? 'round';
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.width;
  for (const run of runs) {
    ctx.setLineDash([...run.dash]);
    traceRun(ctx, run.points);
    ctx.stroke();
  }
  if (shape.arrow) {
    ctx.setLineDash([]);
    ctx.lineWidth = ORDER_LINE_WIDTH;
    traceArrow(ctx, shape.arrow);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Builds the shape of a straight order line with an arrowhead at its far end.
 *
 * Purpose: Most order lines are one straight run; this keeps their arrow geometry in one place.
 * When to use: For a line from `from` to `to` in canvas pixels. `tipInset` is the unit radius when a unit marker
 *   sits at `to`, or 0 for a hex center.
 * Expected outcome: One run from `from` to the arrow's base, with `dash`, and the arrowhead.
 * Exceptions: None.
 */
export function straightOrderLineShape(
  from: CanvasPoint,
  to: CanvasPoint,
  tipInset: number,
  dash: readonly number[] = ORDER_LINE_SOLID
): OrderLineShape {
  const arrow = orderArrowGeometry(from, to, { arrowSize: ORDER_ARROW_SIZE, tipInset });
  return { runs: [{ points: [from, arrow.lineEnd], dash }], arrow };
}

/**
 * Builds the arrowhead for the end of a route, pointing from its second-to-last point to its last.
 *
 * Purpose: Route arrows end on the destination hex's center, as the movement arrows always have.
 * When to use: For the last two points of a route's last run.
 * Expected outcome: An arrowhead whose tip is `to`.
 * Exceptions: None.
 */
export function routeEndArrow(from: CanvasPoint, to: CanvasPoint): ReturnType<typeof orderArrowGeometry> {
  return orderArrowGeometry(from, to, { arrowSize: ORDER_ARROW_SIZE, tipInset: 0 });
}
```

- [ ] **Step 5: Edit `src/renderer/rendering/pathDrawing.ts`**

Movement routes, straight movement arrows, and played-back moves now draw through `drawOrderLine`. `drawArrowheadOnly` and `strokePolylineSkippingWrap` are removed; their work is in `orderLineStroke.ts`.

1. In `src/renderer/rendering/pathDrawing.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  ORDER_ARROW_SIZE,
```

2. In `src/renderer/rendering/pathDrawing.ts`, find these lines. Together they occur exactly once:

```ts
import { drawOneUnitMarker } from './unitDrawing';

/**
 * Defines the `drawLineArrow` function shape (export function drawLineArrow().

 * Purpose: Supports maintainability by documenting why `drawLineArrow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
```

Replace them with:

```ts
import { drawOneUnitMarker } from './unitDrawing';
import {
  ORDER_LINE_LATER_DASH,
  ORDER_LINE_SOLID,
  drawOrderLine,
  routeEndArrow,
  straightOrderLineShape,
  type OrderLineRun,
} from './orderLineStroke';

/**
 * Draws a straight movement line from one unit marker toward another, with the movement arrowhead.
 *
 * Purpose: Standing orders without a route, and played-back moves that need an arrow, share this look.
 * When to use: `from` and `to` are hex centers in canvas pixels, and a unit marker may sit at `to`.
 * Expected outcome: A cased line in `color` that stops at the arrow's base, and an arrowhead whose tip stops a unit
 *   radius short of `to`.
```

3. In `src/renderer/rendering/pathDrawing.ts`, find these lines. Together they occur exactly once:

```ts
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const inset = UNIT_RADIUS + ORDER_ARROW_SIZE;
  const endX = to.x - ux * inset;
  const endY = to.y - uy * inset;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = color;
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  const ax = endX + ux * ORDER_ARROW_SIZE;
  const ay = endY + uy * ORDER_ARROW_SIZE;
  const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
  const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX - perpX, endY - perpY);
  ctx.lineTo(endX + perpX, endY + perpY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.stroke();
}

/**
 * Defines the `drawArrowheadOnly` function shape (export function drawArrowheadOnly( ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, color: string, op).

 * Purpose: Supports maintainability by documenting why `drawArrowheadOnly` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawArrowheadOnly(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  options?: { tipAtTargetCenter?: boolean }
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const inset = options?.tipAtTargetCenter ? ORDER_ARROW_SIZE : UNIT_RADIUS + ORDER_ARROW_SIZE;
  const endX = to.x - ux * inset;
  const endY = to.y - uy * inset;
  const ax = endX + ux * ORDER_ARROW_SIZE;
  const ay = endY + uy * ORDER_ARROW_SIZE;
  const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
  const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX - perpX, endY - perpY);
  ctx.lineTo(endX + perpX, endY + perpY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.stroke();
}

/**
 * Defines the `strokePolylineSkippingWrap` function shape (export function strokePolylineSkippingWrap( ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, wrapJumpThresholdPx: number ): voi).

 * Purpose: Supports maintainability by documenting why `strokePolylineSkippingWrap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
```

Replace them with:

```ts
  drawOrderLine(ctx, straightOrderLineShape(from, to, UNIT_RADIUS), { color, width: ORDER_LINE_WIDTH });
}

/**
```

4. In `src/renderer/rendering/pathDrawing.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Polylines at `ORDER_LINE_COLOR` / `ORDER_LINE_WIDTH`; arrowhead at route end with `tipAtTargetCenter`.
```

Replace it with:

```ts
 * Expected outcome: One cased line at `ORDER_LINE_COLOR` / `ORDER_LINE_WIDTH`, solid for turn 1 and dashed after, with an
 *   arrowhead whose tip is the route's last hex center.
```

5. In `src/renderer/rendering/pathDrawing.ts`, find these lines. Together they occur exactly once:

```ts
  ctx.save();
  if (options?.globalAlpha !== undefined) {
    ctx.globalAlpha = options.globalAlpha;
  }
  let lastPenultimate: { x: number; y: number } | null = null;
  let lastPoint: { x: number; y: number } | null = null;
```

Replace them with:

```ts
  const runs: OrderLineRun[] = [];
```

6. In `src/renderer/rendering/pathDrawing.ts`, find these lines. Together they occur exactly once:

```ts
    ctx.setLineDash(seg.turn <= 1 ? [] : [6, 4]);
    ctx.strokeStyle = ORDER_LINE_COLOR;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
    lastPenultimate = points[points.length - 2] ?? null;
    lastPoint = points[points.length - 1] ?? null;
  }
  ctx.setLineDash([]);
  if (lastPenultimate && lastPoint) {
    drawArrowheadOnly(ctx, lastPenultimate, lastPoint, ORDER_LINE_COLOR, { tipAtTargetCenter: true });
  }
  ctx.restore();
}

export function strokePolylineSkippingWrap(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  wrapJumpThresholdPx: number
): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const current = points[i]!;
    if (Math.abs(current.x - prev.x) > wrapJumpThresholdPx) {
      ctx.moveTo(current.x, current.y);
      continue;
    }
    ctx.lineTo(current.x, current.y);
  }
  ctx.stroke();
```

Replace them with:

```ts
    runs.push({ points, dash: seg.turn <= 1 ? ORDER_LINE_SOLID : ORDER_LINE_LATER_DASH });
  }
  const lastPoints = runs[runs.length - 1]?.points;
  const arrow = lastPoints ? routeEndArrow(lastPoints[lastPoints.length - 2]!, lastPoints[lastPoints.length - 1]!) : null;
  ctx.save();
  if (options?.globalAlpha !== undefined) {
    ctx.globalAlpha = options.globalAlpha;
  }
  drawOrderLine(ctx, { runs, arrow }, { color: ORDER_LINE_COLOR, width: ORDER_LINE_WIDTH });
  ctx.restore();
```

7. In `src/renderer/rendering/pathDrawing.ts`, find these lines. Together they occur exactly once:

```ts
 * Defines the `drawResolutionMoveLines` function shape (export function drawResolutionMoveLines( ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, moves: ResolutionPlaybackMove[],).

 * Purpose: Supports maintainability by documenting why `drawResolutionMoveLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
```

Replace them with:

```ts
 * Draws the lines of the moves being played back, each from its origin along its path.
 *
 * Purpose: During playback the player sees where every unit, theirs and the opponent's, is going.
 * When to use: From the scene draw while a resolution playback is running.
 * Expected outcome: One cased line per move, in the mover's color, at `opacity`. A move with a path follows it; one
 *   without runs straight between hex centers. The opponent's moves end in an arrowhead. The player's moves end in one
 *   only when `includeArrowForHuman` is set (air-strike flights); otherwise their line runs to the destination's center.
 * Exceptions: None. Draws nothing without moves, a hex list, or a positive opacity.
```

8. In `src/renderer/rendering/pathDrawing.ts`, find this line. It occurs exactly once:

```ts
    const lineColor = move.player === 'human' ? ORDER_LINE_COLOR : AI_ORDER_LINE_COLOR;
```

Replace it with:

```ts
    const withArrow = !isHumanMove || includeArrowForHuman;
    const style = { color: isHumanMove ? ORDER_LINE_COLOR : AI_ORDER_LINE_COLOR, width: ORDER_LINE_WIDTH };
```

9. In `src/renderer/rendering/pathDrawing.ts`, find these lines. Together they occur exactly once:

```ts
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = ORDER_LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      const hPen = path[path.length - 2]!;
      const hLast = path[path.length - 1]!;
      const fromPt = hexCenterPx(hPen);
      const toPt = hexCenterPxRelativeTo(hPen, hLast);
      if (isHumanMove && includeArrowForHuman) {
        drawArrowheadOnly(ctx, fromPt, toPt, lineColor, { tipAtTargetCenter: true });
        continue;
      }
      if (isHumanMove) {
        continue;
      }
      drawArrowheadOnly(ctx, fromPt, toPt, lineColor, { tipAtTargetCenter: true });
```

Replace them with:

```ts
      const hPen = path[path.length - 2]!;
      const arrow = withArrow ? routeEndArrow(hexCenterPx(hPen), hexCenterPxRelativeTo(hPen, path[path.length - 1]!)) : null;
      drawOrderLine(ctx, { runs: [{ points, dash: ORDER_LINE_SOLID }], arrow }, style);
```

10. In `src/renderer/rendering/pathDrawing.ts`, find these lines. Together they occur exactly once:

```ts
    if (isHumanMove && includeArrowForHuman) {
      drawLineArrow(ctx, from, to, lineColor);
      continue;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const inset = isHumanMove ? 0 : UNIT_RADIUS + ORDER_ARROW_SIZE;
    const endX = to.x - ux * inset;
    const endY = to.y - uy * inset;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (isHumanMove) continue;
    drawArrowheadOnly(ctx, from, to, lineColor);
```

Replace them with:

```ts
    const shape = withArrow
      ? straightOrderLineShape(from, to, UNIT_RADIUS)
      : { runs: [{ points: [from, to], dash: ORDER_LINE_SOLID }], arrow: null };
    drawOrderLine(ctx, shape, style);
```

- [ ] **Step 6: Edit `src/renderer/rendering/orderDrawing.ts`**

Queued ranged attacks, air strikes, and playback shot lines draw through `drawOrderLine`, with the movement arrowhead stopping a unit radius short of the target. `strokeSupportOrderLines` is now exported for the hover preview.

1. In `src/renderer/rendering/orderDrawing.ts`, find these lines. Together they occur exactly once:

```ts
} from '../core/constants';
import { hexCenterPx, hexCenterPxRelativeTo } from '../map/mapHelpers';
import { drawHumanMarchStyleRouteSegments } from './pathDrawing';
```

Replace them with:

```ts
  UNIT_RADIUS,
} from '../core/constants';
import { hexCenterPx, hexCenterPxRelativeTo } from '../map/mapHelpers';
import { drawHumanMarchStyleRouteSegments } from './pathDrawing';
import { drawOrderLine, straightOrderLineShape } from './orderLineStroke';
```

2. In `src/renderer/rendering/orderDrawing.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Single save/alpha/dash/stroke/restore path for planned and resolution shot lines.
 * When to use: From `drawRangedAttackLines`, `drawAirStrikeLines`, and `drawRangedResolutionShotLines`.
 * Expected outcome: Each unequal endpoint pair is stroked; equal endpoints are skipped.
 * Exceptions: None.
 */
function strokeSupportOrderLines(
```

Replace them with:

```ts
 * Purpose: Single path for planned, previewed, and resolution shot lines, so every ranged and air-strike line has the
 *   same color, dash, casing, and arrowhead.
 * When to use: From `drawRangedAttackLines`, `drawAirStrikeLines`, `drawRangedResolutionShotLines`, and the hover
 *   preview while Ranged or Strike is aiming.
 * Expected outcome: Each unequal endpoint pair is drawn from the origin's center toward the target, cased, dashed, at
 *   `RANGE_PERIMETER_ALPHA`, ending in the movement arrowhead whose tip stops a unit radius short of the target's center.
 *   Equal endpoints are skipped.
 * Exceptions: None.
 */
export function strokeSupportOrderLines(
```

3. In `src/renderer/rendering/orderDrawing.ts`, find these lines. Together they occur exactly once:

```ts
  ctx.save();
  ctx.globalAlpha = RANGE_PERIMETER_ALPHA;
  ctx.setLineDash(style.dash);
  ctx.strokeStyle = style.strokeColor;
  ctx.lineWidth = style.lineWidth;
  ctx.lineCap = style.lineCap;
  ctx.lineJoin = 'round';
```

Replace them with:

```ts
  const lineStyle = { color: style.strokeColor, width: style.lineWidth, cap: style.lineCap };
  ctx.save();
  ctx.globalAlpha = RANGE_PERIMETER_ALPHA;
```

4. In `src/renderer/rendering/orderDrawing.ts`, find these lines. Together they occur exactly once:

```ts
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
```

Replace them with:

```ts
    drawOrderLine(ctx, straightOrderLineShape(from, to, UNIT_RADIUS, style.dash), lineStyle);
```

- [ ] **Step 7: Edit `src/renderer/rendering/hoverPreview.ts`**

The aiming preview reuses `strokeSupportOrderLines`, so it matches a queued attack, and the march preview builds its solid and dashed runs for `drawOrderLine`.

1. In `src/renderer/rendering/hoverPreview.ts`, find these lines. Together they occur exactly once:

```ts
import {
  ORDER_LINE_COLOR,
  ORDER_LINE_WIDTH,
  RANGE_PERIMETER_ALPHA,
} from '../core/constants';
import { clampLatForWebMercatorDisplay } from '../map/hexGrid';
import { rangePerimeterStaticLineStyle } from './orderDrawing';
import { drawArrowheadOnly, strokePolylineSkippingWrap } from './pathDrawing';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal, hexCenterPx, hexCenterPxRelativeTo } from '../map/mapHelpers';
```

Replace them with:

```ts
import { ORDER_LINE_COLOR, ORDER_LINE_WIDTH } from '../core/constants';
import { clampLatForWebMercatorDisplay } from '../map/hexGrid';
import { strokeSupportOrderLines } from './orderDrawing';
import {
  ORDER_LINE_LATER_DASH,
  ORDER_LINE_SOLID,
  drawOrderLine,
  routeEndArrow,
  type OrderLineRun,
} from './orderLineStroke';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal, hexCenterPx } from '../map/mapHelpers';
```

2. In `src/renderer/rendering/hoverPreview.ts`, find these lines. Together they occur exactly once:

```ts
 * Expected outcome: Ranged and strike targeting draw one dashed line per origin to the hovered target. Otherwise each
 *   origin stack draws its route solid for the part it covers this turn or beat and dashed beyond, with an arrowhead
 *   at the end. Air routes are solid throughout. On the strategic map the solid part is the slowest selected unit's
 *   weather-adjusted movement; in battle it comes from `tacticalHoverSolidEdgeCapByOriginH3`. An X marks the hovered
 *   hex when the preview says the order is invalid. Nothing is drawn without a preview or a map.
```

Replace them with:

```ts
 * Expected outcome: Ranged and strike targeting draw one dashed line per origin toward the hovered target, as a queued
 *   ranged or strike line looks. Otherwise each origin stack draws its route solid for the part it covers this turn or
 *   beat and dashed beyond, with an arrowhead at the end. Every line has the order-line casing. Air routes are solid
 *   throughout. On the strategic map the solid part is the slowest selected unit's weather-adjusted movement; in battle
 *   it comes from `tacticalHoverSolidEdgeCapByOriginH3`. An X marks the hovered hex when the preview says the order is
 *   invalid. Nothing is drawn without a preview or a map.
```

3. In `src/renderer/rendering/hoverPreview.ts`, find this line. It occurs exactly once:

```ts
    const style = rangePerimeterStaticLineStyle(supportMode === 'ranged' ? 'ranged' : 'airStrike');
```

Replace it with:

```ts
    const segments: Array<{ fromH3Index: string; toH3Index: string }> = [];
```

4. In `src/renderer/rendering/hoverPreview.ts`, find these lines. Together they occur exactly once:

```ts
      const from = hexCenterPx(originH3);
      const to = hexCenterPxRelativeTo(originH3, targetH3);
      ctx.save();
      ctx.globalAlpha = RANGE_PERIMETER_ALPHA;
      ctx.setLineDash(style.dash);
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.lineWidth;
      ctx.lineCap = style.lineCap;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }
```

Replace them with:

```ts
      segments.push({ fromH3Index: originH3, toH3Index: targetH3 });
    }
    strokeSupportOrderLines(ctx, supportMode === 'ranged' ? 'ranged' : 'airStrike', segments);
```

5. In `src/renderer/rendering/hoverPreview.ts`, find these lines. Together they occur exactly once:

```ts
    ctx.save();
    ctx.globalAlpha = preview.valid ? 0.55 : 0.75;
```

Replace them with:

```ts
    const runs: OrderLineRun[] = [];
```

6. In `src/renderer/rendering/hoverPreview.ts`, find these lines. Together they occur exactly once:

```ts
        ctx.setLineDash([]);
        ctx.strokeStyle = ORDER_LINE_COLOR;
        ctx.lineWidth = ORDER_LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      } else if (remainingSolidEdges <= 0) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = ORDER_LINE_COLOR;
        ctx.lineWidth = ORDER_LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      } else {
        const splitIndex = Math.min(points.length - 1, remainingSolidEdges);
        const solidPoints = points.slice(0, splitIndex + 1);
        if (solidPoints.length >= 2) {
          ctx.setLineDash([]);
          ctx.strokeStyle = ORDER_LINE_COLOR;
          ctx.lineWidth = ORDER_LINE_WIDTH;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          strokePolylineSkippingWrap(ctx, solidPoints, ctx.canvas.width * 0.5);
        }
        const dashedPoints = points.slice(splitIndex);
        if (dashedPoints.length >= 2) {
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = ORDER_LINE_COLOR;
          ctx.lineWidth = ORDER_LINE_WIDTH;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          strokePolylineSkippingWrap(ctx, dashedPoints, ctx.canvas.width * 0.5);
        }
```

Replace them with:

```ts
        runs.push({ points, dash: ORDER_LINE_SOLID });
      } else if (remainingSolidEdges <= 0) {
        runs.push({ points, dash: ORDER_LINE_LATER_DASH });
      } else {
        // The solid part ends where this turn's movement runs out; the rest of the segment is dashed.
        const splitIndex = Math.min(points.length - 1, remainingSolidEdges);
        runs.push({ points: points.slice(0, splitIndex + 1), dash: ORDER_LINE_SOLID });
        runs.push({ points: points.slice(splitIndex), dash: ORDER_LINE_LATER_DASH });
```

7. In `src/renderer/rendering/hoverPreview.ts`, find these lines. Together they occur exactly once:

```ts
    ctx.setLineDash([]);
    if (lastSegmentPenultimate && lastSegmentLast) {
      drawArrowheadOnly(ctx, lastSegmentPenultimate, lastSegmentLast, ORDER_LINE_COLOR, {
        tipAtTargetCenter: true,
      });
    } else if (preview.arrowLatLng && preview.segments.length > 0) {
```

Replace them with:

```ts
    let arrow = lastSegmentPenultimate && lastSegmentLast ? routeEndArrow(lastSegmentPenultimate, lastSegmentLast) : null;
    if (!arrow && preview.arrowLatLng && preview.segments.length > 0) {
```

8. In `src/renderer/rendering/hoverPreview.ts`, find these lines. Together they occur exactly once:

```ts
        drawArrowheadOnly(
          ctx,
          { x: fromPoint.x, y: fromPoint.y },
          { x: toPoint.x, y: toPoint.y },
          ORDER_LINE_COLOR,
          { tipAtTargetCenter: true }
        );
      }
    }
```

Replace them with:

```ts
        arrow = routeEndArrow({ x: fromPoint.x, y: fromPoint.y }, { x: toPoint.x, y: toPoint.y });
      }
    }
    ctx.save();
    ctx.globalAlpha = preview.valid ? 0.55 : 0.75;
    drawOrderLine(ctx, { runs, arrow }, { color: ORDER_LINE_COLOR, width: ORDER_LINE_WIDTH });
```

- [ ] **Step 8: Edit `src/main/rangePerimeterStroke.test.ts`**

This contract test reads the drawing sources. Its anchors follow the shared drawer: the hover preview now draws through `strokeSupportOrderLines`, and the line cap reaches `drawOrderLine` as `cap: style.lineCap`.

1. In `src/main/rangePerimeterStroke.test.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Width helper returns `ORDER_LINE_WIDTH` in tactical battles and home-border multipliers on the strategic map; overlay, hover, and shot drawers share `rangePerimeterStaticLineStyle`.
```

Replace it with:

```ts
 * Expected outcome: Width helper returns `ORDER_LINE_WIDTH` in tactical battles and home-border multipliers on the strategic map; overlay and shot drawers share `rangePerimeterStaticLineStyle`, and hover draws through the shared `strokeSupportOrderLines`.
```

2. In `src/main/rangePerimeterStroke.test.ts`, find these lines. Together they occur exactly once:

```ts
      hover.includes('rangePerimeterStaticLineStyle'),
    'perimeter overlay should request perimeter width; hover should reuse the shared style helper'
```

Replace them with:

```ts
      hover.includes('strokeSupportOrderLines'),
    'perimeter overlay should request perimeter width; hover should draw through the shared support-line drawer'
```

3. In `src/main/rangePerimeterStroke.test.ts`, find these lines. Together they occur exactly once:

```ts
      orderDrawing.includes('ctx.lineCap = style.lineCap') &&
      hover.includes('ctx.lineCap = style.lineCap'),
```

Replace them with:

```ts
      orderDrawing.includes('cap: style.lineCap') &&
      hover.includes('strokeSupportOrderLines'),
```

- [ ] **Step 9: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 10: Edit `doc/ux/map-overlays.md`**

Describes the casing and which lines end in an arrowhead.

1. In `doc/ux/map-overlays.md`, find this line. It occurs exactly once:

````markdown
- A draft march path during Tactical planning.
````

Replace it with:

````markdown
- A draft march path during Tactical planning.
- Every movement, ranged, and air-strike line above, queued, previewed, or played back, is drawn over a pale casing that keeps it readable on any terrain, and keeps its color and dash: teal for the player's moves, rose for the opponent's, amber for ranged, and purple for strikes. Movement lines end in an arrowhead on the destination hex's center. Ranged and air-strike lines, including the playback shot lines, end in the same arrowhead, its tip a unit radius short of the target's center. A move played back for the player, other than an air strike's flight, has no arrowhead. See `drawOrderLine` in `src/renderer/rendering/orderLineStroke.ts`.
````

2. In `doc/ux/map-overlays.md`, find this line. It occurs exactly once:

````markdown
- `src/renderer/rendering/rangePerimeterOverlay.ts`
````

Replace it with:

````markdown
- `src/renderer/rendering/rangePerimeterOverlay.ts`
- `src/renderer/rendering/orderLineStroke.ts`
- `src/shared/orderArrowGeometry.ts`
````

- [ ] **Step 11: Edit `doc/ui-style-guide.md`**

Adds the casing to the palette.

In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged |
````

Replace it with:

````markdown
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged |
| Order-line casing | `#ffffff` at 80% | A solid outline 1.5 px wider than the line on each side, under every movement, ranged, and air-strike line and its arrowhead (`ORDER_LINE_CASING_COLOR`, `ORDER_LINE_CASING_PAD`) |
````

- [ ] **Step 12: Edit `doc/how-to-play.md`**

An aiming line ends in an arrowhead, and a queued attack keeps it.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Hovering a valid target:** a dashed line in the same color runs from each selected unit to the target.
````

Replace it with:

````markdown
- **Hovering a valid target:** a dashed line in the same color runs from each selected unit to the target and ends in an arrowhead. A queued attack keeps that line.
````

## Verify

- [ ] **Step 13: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 14: Full tests**

Run the full tests. Expected: exit 0, test total **882**, failure total **0**.

- [ ] **Step 15: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/orderArrowGeometry.ts src/shared/orderArrowGeometry.test.ts src/renderer/core/constants.ts src/renderer/rendering/orderLineStroke.ts src/renderer/rendering/pathDrawing.ts src/renderer/rendering/orderDrawing.ts src/renderer/rendering/hoverPreview.ts src/main/rangePerimeterStroke.test.ts doc/ux/map-overlays.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/orderArrowGeometry.ts` | `593971027eaed991` |
| `src/shared/orderArrowGeometry.test.ts` | `9c562ee542dda6e7` |
| `src/renderer/core/constants.ts` | `9a5bd36f5b31204d` |
| `src/renderer/rendering/orderLineStroke.ts` | `ebbbc25db68c1c33` |
| `src/renderer/rendering/pathDrawing.ts` | `1c09e54493c346c8` |
| `src/renderer/rendering/orderDrawing.ts` | `e22c9620218b4d72` |
| `src/renderer/rendering/hoverPreview.ts` | `9931cfa957d212e9` |
| `src/main/rangePerimeterStroke.test.ts` | `4394be0ac0d9b502` |
| `doc/ux/map-overlays.md` | `94371a41c199b1b4` |
| `doc/ui-style-guide.md` | `86f274781371d77b` |
| `doc/how-to-play.md` | `bc3a6ea5f074f06e` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 16: Smoke run**

```powershell
npm run ui:smoke -- --label order-lines
```

Expected summary line:

```text
ui-smoke order-lines: 352 passed, 0 failed, 0 page errors, 32 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\order-lines
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/order-lines/report.json`.

- [ ] **Step 17: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/order-lines/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The casing is thin at the zoom the smoke run uses: zoom in on the image and look for a pale edge along each side of the teal line and around its arrowhead. The smoke run queues no ranged attack or air strike, so the reviewer checks those below.

- `14-orders-queued.png` against [ui-facelift-map-2-expected-march.png](ui-facelift-map-2-expected-march.png): the march queued from 2nd Armored's hex: a short teal line from its marker, ending in an arrowhead in the next hex, with a pale edge along both sides and around the arrowhead.

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

1. With your own match, queue a march too long to finish this turn: the line is teal, solid for this turn's part and dashed beyond, with a pale edge on both sides and the arrowhead at the destination.
2. Select an armor or naval unit, click Ranged, and point at an enemy in range: an amber dashed line with a pale edge runs toward it and ends in an arrowhead just short of the enemy marker. Double-click to queue it: the queued line looks the same.
3. Do the same with an air unit and Strike: a purple line with the same casing and arrowhead.
4. Press Ready and watch the playback: ranged shot lines end in arrowheads; your air units' strike flights show teal lines with arrowheads; your other moves show teal lines without one; the opponent's moves show rose lines with arrowheads. Every line is cased.
5. In a battle, queue a march and a ranged attack: the lines look as on the world map.

## Next

Plan 3 adds the gold selection ring.
