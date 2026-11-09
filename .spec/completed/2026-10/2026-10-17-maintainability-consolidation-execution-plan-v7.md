# Maintainability consolidation and reuse — execution plan (v7)

Audience: a **lower-quality coding agent**. Prefer mechanical, copy-exact refactors. Avoid cleverness, generics gymnastics, and opportunistic cleanup.

Goal: improve maintainability through **consolidation, reuse, and one over-limit test split**, with **no intended behavior change** in Phases 1–9. Phase 10 may fix only defects recorded during those phases.

This plan continues `.spec/completed/maintainability-consolidation-execution-plan-v{1..6}.md`. Everything those plans already consolidated is out of scope and must not be redone.

Shape: Phases 0 through 10. Phase 0 is a baseline. Phases 1–5 are tested main-process consolidations. Phase 6 splits an over-limit test file. Phases 7–8 are renderer consolidations guarded by source assertions and the existing renderer type-check. Phase 9 adds a parity test and edits no production code. Phase 10 is a recorded-defect phase.

---

## How to use this document

1. Work **one phase per change set**, in the order given.
2. Run the **full verification bar** (below) at the end of every phase. Phase 6 also runs `npm run verify:modularization`.
3. **Stop and report** after each phase: files touched, grep results, test outcome, before/after line counts. Wait for human go-ahead before starting the next phase.
4. If a phase fails verification, **revert that phase entirely**. Do not patch forward into the next phase.
5. If a phase's diff grows beyond the files that phase lists, **stop and report** instead of expanding scope.
6. If reality disagrees with a line number, count, or claim in this document, **trust the code and stop to report the discrepancy**. Line numbers here were accurate when the plan was written and will shift as you work.
7. Never commit or push. The human reviews every change.

Every phase is verifiable by automated commands alone. **No manual smoke test is required or expected.**

---

## Verification bar (run at the end of every phase)

```bash
npm test
npm run build:renderer
npm run check:circular
```

Notes:

- `npm test` already runs `rebuild:native:node`, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every discovered `dist/**/*.test.js`, and `notices:check`. New `*.test.ts` files under `src/main` or `src/shared` are discovered automatically after `build:main`. **No `package.json` wiring is needed for new tests.**
- `npm run verify:modularization` runs a **curated subset** listed in `scripts/verify-modularization-tests.manifest`. It does not discover new tests. Edit that manifest only in Phase 6, and run `npm run verify:modularization` in Phase 6 and in the final verification.
- If `check:circular` is already red in Phase 0, save its disallowed `- ` lines. Later phases pass the circular gate when that set is unchanged. A new `- ` line is a failure. **Do not refresh `scripts/circular-deps-baseline.json`.** Fix a new cycle by changing an import direction.
- Do not refresh `scripts/renderer-typecheck-baseline.json`. If `check:renderer-types` fails after a renderer edit, fix the type error. Do not run `dump:renderer-types-baseline`.

---

## Non-goals (explicit)

1. No gameplay rule changes: no movement costs, combat math, pathfinding, fog, or production changes.
2. No change to emitted **prompt text**, briefing text, toast text, log message text, or IPC **channel name strings**. Copy strings verbatim when moving code.
3. No import of `src/shared/ipc/channels.ts` from `src/main/preload.ts`. The preload copies stay.
4. No merge of `tempoBullet`. The strategic and tactical sentences are different (`the shot resolves from the turn-start position` versus `attacks resolve from beat-start positions`).
5. No unification of `initDatabase` and `openGameDatabaseAtPathForTests`. The test opener recovers silently. Startup also handles native-load failure, `includeReconciliation: false`, backfill, and fog refresh.
6. No unification of the terrain metadata and terrain naming envelope parsers. Naming uses `readIntOrNull` and different error text.
7. No split of `src/shared/subdivisionFlagCodes.ts` (generated flag codes), `src/renderer/core/state.ts`, `src/renderer/map/stackCallout.ts`, `src/main/briefingFormatter.ts`, `src/main/tools/pathfinding.ts`, `src/renderer/entryCallbacks.ts`, `src/main/gameDb/controlInfrastructure.ts`, `src/main/gameActions/humanMarchPreview/humanMarchPreviewResolve.ts`, or `src/renderer/map/mainMapInteractions.ts`. `renderSealiftSection` stays in `stackCallout.ts`.
8. No use of `unreachedTacticalMarch` for `failureReason: 'air_no_march'` or `failureReason: 'outside_footprint'`.
9. No dependency upgrades and no `doc/` edits. None of these phases change a symbol in the engine-constants table in `doc/README.md`. If you discover that you did, stop and report.
10. No plan, phase, or opportunity identifiers in source, comments, configuration, or `doc/`. This `.spec` file is the only place they may appear.
11. Do not edit files under `.spec/completed/`.

---

## Baseline facts (re-measure in Phase 0)

Observed while planning. Physical line counts are `(Get-Content <file>).Count`.

| Area | File | Lines | Why it matters here |
|------|------|------:|---------------------|
| Briefing map | `src/main/briefing/map/hexBoundingBox.ts` | ~100 | Private longitude helpers, duplicated |
| Briefing map | `src/main/briefing/map/hexGridProjection.ts` | ~240 | Same two private helpers |
| IPC guards | `src/main/ipcPayloadGuards.ts` | ~405 | Tactical commit parser repeats five row loops |
| Tactical embark | `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts` | ~238 | Human and opponent embark validators match |
| Tactical march | `src/shared/tacticalMovementPlanner.ts` | ~510 | Land and naval budget walks match |
| Coaching | `src/main/openRouter/promptSpec/coachingTextStrategic.ts` | ~330 | Private `optionCopyOrRoutingBullet` |
| Coaching | `src/main/openRouter/promptSpec/coachingTextTactical.ts` | ~193 | Same function, two noun differences |
| Renderer assertions | `src/main/rendererConsolidation.test.ts` | 1007 | Over the 1000-line hard limit |
| Hover preview | `src/renderer/gameplay/hoverRoutePreviewRefresh.ts` | ~351 | Ranged and air blocks repeated |
| Build queue | `src/renderer/gameplay/buildQueuePopup.ts` | ~780 | Type and count edit handlers match |
| Preload | `src/main/preload.ts` | ~655 | Local copies of the IPC channel maps |

---

## Conventions the executing agent must follow

### Orienting comments (enforced by ESLint)

`eslint-rules/require-orienting-block.cjs` runs as an **error** on `src/**/*.ts`. Every new module-level function, class member, interface member, and enum member needs exactly **one** `/** ... */` block immediately before it, with:

- A first summary line that does **not** contain `Purpose:`, `Contract:`, or `When to use:`.
- Then four labeled lines, each with non-empty text: `Purpose:` (or `Contract:` for interface and abstract members), `When to use:`, `Expected outcome:`, `Exceptions:`.

When this plan says to **move** an existing function, move its existing comment with it. Do not invent a second comment. New functions need a new comment in that shape.

### Logging

Use `logDebug` / `logTrace` / `logError` from `src/main/logger.ts`.

- New **main-process** public functions: `logDebug` once on entry, unless this plan names `logTrace` for a pure getter.
- New main-process getter-style functions that do not modify state: `logTrace`.
- Every new `catch`: `logError`. These phases add no new `catch`.
- **`src/shared` must not log.** `src/main/logger.ts` imports `fs`, and `src/shared` is bundled into the renderer.
- **`src/renderer` must not log.**
- Private helpers do not get a new log line. Where this plan says an existing `tacticalLogQuery` stays, do not also add `logDebug`.

### Tests

- Colocate `*.test.ts` next to the module under `src/main`. Renderer files cannot host tests.
- New files use `node:test` and `node:assert/strict`, except Phase 6, which keeps the moved file's existing `run()` style.
- Test **happy paths and essential failure cases only**. Do not add a test whose only assertion is that a function exists.
- Where a phase says "add the test first", run that test and confirm it passes **before** editing the production function. If it fails on the unmodified function, stop. The expected string in this document was wrong. Do not change production code to satisfy a new test that failed first.

### Renderer source-text assertions

Renderer code is guarded by `npm run check:renderer-types` and by source-text assertions. Use `readRendererSource` from `src/main/testSupport/rendererSourceAssertions.ts`. Put new assertions in the new test files named below. **Do not append to `rendererConsolidation.test.ts`.** Phase 6 deletes that file.

### Documentation impact

`doc/README.md` lists the engine symbols that product docs must track. **None of these phases change those symbols or their values.** Before reporting a phase complete, confirm you have not renamed or moved a symbol listed there. If you have, stop and report.

### Argument and file size

Named parameters stay at or below 6. This plan uses a parameter object where a call would otherwise pass more. Every new file stays under 600 physical lines. Phase 6's three files must each stay under 600. If a Phase 6 group would exceed 600, stop and report. Do not invent a fourth file.

---

## Opportunities, in execution order

1. **Longitude circle math.** Two identical private helpers in the briefing map.
2. **Tactical commit row parsers.** Five order-row loops, each written twice.
3. **Embark validation.** Human and opponent copies differ by player id and two reason strings.
4. **Tactical march stop walk.** Land and naval copies of the budget walk and the `no_path` result.
5. **Option-copy coaching bullet.** Strategic and tactical copies differ by `unit` / `sub-unit` and `this-turn` / `this-beat`.
6. **Renderer assertion split.** `rendererConsolidation.test.ts` is over the hard limit. Its tests are independent.
7. **Hover support-targeting preview.** Four ranged/air blocks share one publisher. Eight stale checks share one wrapper.
8. **Build-queue row edit.** The type `change` handler and the count `input` handler share one mutation.
9. **Preload channel parity.** The sandbox preload cannot import the shared channel module. A test locks the copies.

---

## Phases

### Phase 0 — Baseline (no source change)

**Intent:** Prove the tree is green and record numbers so later diffs are provably mechanical.

**Files:** this document only (fill in the inventory section at the bottom).

**Steps:**

1. Run the verification bar. If `npm test` or `npm run build:renderer` is already red, stop. Do not start Phase 1.
2. If `npm run check:circular` is red, copy every disallowed `- ` line into the inventory. If it prints `check-circular-deps: ok`, write "green".
3. Record physical line counts with `(Get-Content <file>).Count` for every file in the baseline table.
4. Record these grep counts:
   - `rg -n "function wrapLongitudeDeltaDegrees" src`
   - `rg -n "function circularMeanLongitudeDegrees" src`
   - `rg -n "function optionCopyOrRoutingBullet" src`
   - `rg -n "failureReason: 'no_path'" src/shared/tacticalMovementPlanner.ts`
   - `rg -n "function validateTacticalHumanEmbarkOrder|function validateTacticalOpponentEmbarkOrder" src`
5. Record `npm run check:renderer-types` as ok, and do not copy the baseline file.

**Verification:** bar result recorded. Zero source changes.

**Stop gate:** Report the inventory. Wait for go-ahead.

---

### Phase 1 — Longitude circle math

**Intent:** One implementation of antimeridian wrap and circular mean longitude.

**Files:**

- **Add** `src/main/briefing/map/longitudeCircle.ts`
- **Add** `src/main/briefing/map/longitudeCircle.test.ts`
- **Edit** `src/main/briefing/map/hexBoundingBox.ts`
- **Edit** `src/main/briefing/map/hexGridProjection.ts`

**Steps:**

1. Create `longitudeCircle.ts`. Import only `logTrace` from `../../logger`. Move `wrapLongitudeDeltaDegrees` and `circularMeanLongitudeDegrees` from `hexBoundingBox.ts`, including that file's orienting comments. Export both. Make `logTrace` the first statement in each, with the function name and the argument. Leave the arithmetic unchanged:

```ts
export function wrapLongitudeDeltaDegrees(delta: number): number {
  logTrace('wrapLongitudeDeltaDegrees', { delta });
  let d = delta;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}
```

```ts
export function circularMeanLongitudeDegrees(longitudes: number[]): number {
  logTrace('circularMeanLongitudeDegrees', { count: longitudes.length });
  if (longitudes.length === 0) return 0;
  let sx = 0;
  let sy = 0;
  for (const lng of longitudes) {
    const rad = (lng * Math.PI) / 180;
    sx += Math.cos(rad);
    sy += Math.sin(rad);
  }
  const mean = Math.atan2(sy / longitudes.length, sx / longitudes.length);
  return (mean * 180) / Math.PI;
}
```

2. Delete both private copies from `hexBoundingBox.ts` and `hexGridProjection.ts`, including the comments that belonged to those copies. Import the two functions from `./longitudeCircle`. Do not change call sites other than the import.

3. Add `longitudeCircle.test.ts` with `node:test`. Assert exactly:

   - `wrapLongitudeDeltaDegrees(190)` is `-170`
   - `wrapLongitudeDeltaDegrees(-190)` is `170`
   - `wrapLongitudeDeltaDegrees(180)` is `180`
   - `wrapLongitudeDeltaDegrees(-180)` is `180`
   - `circularMeanLongitudeDegrees([])` is `0`
   - `circularMeanLongitudeDegrees([10, -10])` is `0`
   - `circularMeanLongitudeDegrees([170, -170])` is within `1e-6` of `180`

**Verification:** full bar. `rg -n "function wrapLongitudeDeltaDegrees|function circularMeanLongitudeDegrees" src` shows one of each, both in `longitudeCircle.ts`.

**Stop gate:** Report. Wait for go-ahead.

---

### Phase 2 — Tactical commit row parsers

**Intent:** One parser for a unit id plus one string field, and one parser for air-strike rows, shared by the human payload and `opponentTacticalDraft`.

**Files:**

- **Edit** `src/main/ipcPayloadGuards.ts`
- **Edit** `src/main/ipcPayloadGuardsTacticalCommit.test.ts`

**Steps:**

1. Add a module-level test function with an orienting comment, and add one row to the existing `tests` array in `ipcPayloadGuardsTacticalCommit.test.ts`. That file runs the array itself. Do not add `node:test`. Then run the test file. It must pass **before** step 2. If it fails, stop.

   Payload: `{ movementOrders: [], opponentTacticalDraft: { airStrikes: [{ unitId: 'a', targetH3Index: 'h', targetType: 'road' }] } }`.

   Expect `ok: false` and reason `Invalid tactical commit payload`.

2. Add two private functions in `ipcPayloadGuards.ts`, above `parseHumanTacticalCommitPayload`. Each gets an orienting comment. Neither logs.

```ts
function parseUnitIdFieldRows(
  raw: unknown,
  fieldName: 'toH3Index' | 'targetH3Index' | 'destinationH3Index' | 'navalUnitId',
  invalid: string
): { ok: true; rows: { unitId: string; value: string }[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) return { ok: false, reason: invalid };
  const rows: { unitId: string; value: string }[] = [];
  for (const row of raw) {
    if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
    const record = row as Record<string, unknown>;
    const unitId = record.unitId;
    const value = record[fieldName];
    if (typeof unitId !== 'string' || typeof value !== 'string') {
      return { ok: false, reason: invalid };
    }
    rows.push({ unitId, value });
  }
  return { ok: true, rows };
}
```

```ts
function parseAirStrikeRows(
  raw: unknown,
  invalid: string
): { ok: true; rows: AirStrikeOrder[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) return { ok: false, reason: invalid };
  const rows: AirStrikeOrder[] = [];
  for (const row of raw) {
    if (typeof row !== 'object' || row === null) return { ok: false, reason: invalid };
    const record = row as Record<string, unknown>;
    const targetType = record.targetType;
    if (
      typeof record.unitId !== 'string' ||
      typeof record.targetH3Index !== 'string' ||
      (targetType !== 'units' &&
        targetType !== 'urban' &&
        targetType !== 'airport' &&
        targetType !== 'seaport')
    ) {
      return { ok: false, reason: invalid };
    }
    rows.push({
      unitId: record.unitId,
      targetH3Index: record.targetH3Index,
      targetType,
    });
  }
  return { ok: true, rows };
}
```

3. Replace each inline loop inside `parseHumanTacticalCommitPayload` with a call. Map `value` onto the original property name. Rules:

   - Human `movementOrders`: pass `p.movementOrders` with **no** `?? []`. Field `toH3Index`.
   - Human ranged, ferry, and embark: pass `p.<field> ?? []` as today.
   - Human air: `parseAirStrikeRows(p.airStrikes ?? [], invalid)`.
   - Opponent block: same helpers. Opponent movement uses `o.movementOrders ?? []`. Other opponent arrays use `?? []`.
   - On `ok: false`, return that result immediately.
   - Leave `useEventDrivenConsultation`, `aiPlanningRunEnabled`, and the final return object as they are.
   - Reason string stays `Invalid tactical commit payload`.

**Verification:** full bar. The new test passes. Existing tactical-commit tests pass. `rg -c "targetType !== 'seaport'" src/main/ipcPayloadGuards.ts` is 1.

**Stop gate:** Report. Wait for go-ahead.

---

### Phase 3 — Human and opponent embark validation

**Intent:** One embark rule. The two exports keep their reason strings and their log labels.

**Files:**

- **Add** `src/main/tacticalBattle/tacticalEmbarkOrderValidation.test.ts`
- **Edit** `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts`

**Steps:**

1. Add the test file first, using `node:test`. Do not open a database. Build rows with only `id`, `parentUnitId`, `player`, `unitType`, `h3Index`, and `displayName`. A naval row uses `unitType: 'naval'`. Pass `'unused-hex'` as the enclosing strategic index.

   For `validateTacticalHumanEmbarkOrder` and `validateTacticalOpponentEmbarkOrder`, assert these four outcomes:

   - Unknown unit id: `valid` is false and `reason` includes `Embark units not found`.
   - Both rows owned by the other player: human export returns `Embark orders must target your own units`; opponent export returns `Embark orders must target opponent units`.
   - Land and naval on different `h3Index` values, both owned by the export's player: reason is `Embark requires co-located land and naval units`.
   - Land `embarkedOnSubUnitId` equals the naval id, same cell, both owned by the export's player: `{ valid: true }`.

   Run the test file. It must pass **before** step 2. If it fails, stop.

2. Add private `validateTacticalEmbarkOrderForPlayer` in `tacticalOpponentOrderValidation.ts`. It takes one object: `order`, `subUnits`, `enclosingStrategicH3Index`, `player` (`'human' | 'opponent'`), `wrongPlayerReason`, and `logLabel`. Move the current opponent function body into it.

   - Entry log: `tacticalLogQuery(logLabel, { unitId: order.unitId, navalUnitId: order.navalUnitId })`.
   - Player check uses `player` and returns `tacticalInvalidResult(wrongPlayerReason)`.
   - `canPlayerEmbarkFromTacticalHex` receives `player`.
   - The early `return tacticalValidResult()` when cargo is already on that carrier stays **without** an ok log.
   - Only the final success path logs `tacticalLogQuery(\`${logLabel} ok\`, { unitId: order.unitId })`.

3. Replace both exports with one call each. Opponent passes `player: 'opponent'`, `wrongPlayerReason: 'Embark orders must target opponent units'`, and `logLabel: 'validateTacticalOpponentEmbarkOrder'`. Human passes `player: 'human'`, `wrongPlayerReason: 'Embark orders must target your own units'`, and `logLabel: 'validateTacticalHumanEmbarkOrder'`. Do not add `logDebug`.

**Verification:** full bar. The four outcomes still pass for both exports. `rg -n "Embark orders must target" src/main/tacticalBattle/tacticalOpponentOrderValidation.ts` shows each reason string once.

**Stop gate:** Report. Wait for go-ahead.

---

### Phase 4 — Tactical march stop walk

**Intent:** One budget walk and one `no_path` result inside `planTacticalMarchWithoutTerrainBonus`.

**Files:**

- **Edit** `src/shared/tacticalMovementPlanner.ts`

**Steps:**

1. Add private `unreachedTacticalMarch(fromH3: string)` returning the object that today uses `failureReason: 'no_path'`:

```ts
return {
  reachable: false,
  reachableThisTurn: false,
  totalCostToDestination: Infinity,
  pathToDestination: null,
  firstStopWithinBudget: { stopH3: fromH3, consumedFullPath: false },
  failureReason: 'no_path',
};
```

   Replace the five `no_path` returns in this function with `return unreachedTacticalMarch(fromH3)`. Leave the `air_no_march` return and the `outside_footprint` return inline.

2. Add private `firstStopIndexWithinBudget(path, movementPointBudget, stepCostAt)` where `stepCostAt` is `(index: number) => number`. It returns `{ ok: true, stopIdx: number }` or `{ ok: false }`. Body:

```ts
let cum = 0;
let stopIdx = 0;
for (let i = 1; i < path.length; i++) {
  const stepCost = stepCostAt(i);
  if (!Number.isFinite(stepCost)) return { ok: false };
  if (cum + stepCost > movementPointBudget) break;
  cum += stepCost;
  stopIdx = i;
}
return { ok: true, stopIdx };
```

3. Replace the land `for` loop with a call whose callback contains the existing `landInfantryArmorEnterCost({ ... })` arguments, including `prevOfFrom`. Replace the naval `for` loop with a call whose callback is the existing `enterCostForHex(...)` call. On `{ ok: false }`, `return unreachedTacticalMarch(fromH3)`. On success, still call `stopIdxWithMinimumOneHexProgress` with `stopIdx`, `path.length`, and `movementPointBudget`, then build the same success object as today (`total` for land, `totalNaval` for naval).

4. Do not export the helpers. Do not log. Do not add a test.

**Verification:** full bar, including `tacticalMovementPlanner.test.ts`. `rg -c "failureReason: 'no_path'" src/shared/tacticalMovementPlanner.ts` is 1. `rg -n "failureReason: 'air_no_march'|failureReason: 'outside_footprint'" src/shared/tacticalMovementPlanner.ts` still finds both.

**Stop gate:** Report. Wait for go-ahead.

---

### Phase 5 — Option-copy coaching bullet

**Intent:** One option-copy bullet. Prompt bytes stay the same.

**Files:**

- **Edit** `src/main/openRouter/promptSpec/coachingText.test.ts`
- **Edit** `src/main/openRouter/promptSpec/optionCopyText.ts`
- **Edit** `src/main/openRouter/promptSpec/coachingTextStrategic.ts`
- **Edit** `src/main/openRouter/promptSpec/coachingTextTactical.ts`

**Steps:**

1. Add tests first, using the existing `joined`, `strategicGates`, and `tacticalGates` helpers. Run `coachingText.test.ts`. These assertions must pass **before** step 2. If one fails, stop.

   - `joined(strategicGates())` includes `already this-turn legal destinations` and `Call plan_route only for a destination the table does not list for that unit.`
   - `joined(tacticalGates())` includes `already this-beat legal destinations` and `Call plan_route only for a destination the table does not list for that sub-unit.`
   - `joined(strategicGates({ hasBestOptionsTable: false }))` and the tactical equivalent include `No options are listed this period. Destinations must come from the routing tool, not from an absent options table.`
   - `joined(strategicGates({ hasBestOptionsTable: false, planningEnabled: false }))` includes `the unit's own cell means hold.`
   - `joined(tacticalGates({ hasBestOptionsTable: false, planningEnabled: false }))` includes `the sub-unit's own cell means hold.`

2. Add `buildOptionCopyOrRoutingBullet` to `optionCopyText.ts`. Import `CoachingGates` with `import type`. `logDebug` on entry with `periodWord`, `actorNoun`, `gates.hasBestOptionsTable`, `gates.planningEnabled`, and `gates.hasAirUnits`. Three parameters: `gates`, `periodWord` (`'this-turn' | 'this-beat'`), `actorNoun` (`'unit' | 'sub-unit'`).

```ts
if (gates.hasBestOptionsTable) {
  const routing = gates.planningEnabled
    ? ` Call plan_route only for a destination the table does not list for that ${actorNoun}.`
    : '';
  return (
    `- Best Options This Turn Target Hexes are already ${periodWord} legal destinations. ` +
    buildOptionCopyMappingClause({
      actorNoun,
      hasAirUnits: gates.hasAirUnits,
      includeFerryMapping: gates.hasAirUnits,
    }) +
    routing
  );
}
if (gates.planningEnabled) {
  return '- No options are listed this period. Destinations must come from the routing tool, not from an absent options table.';
}
return `- No options are listed this period. Destinations come only from the adjacent-cell listing; the ${actorNoun}'s own cell means hold.`;
```

3. In the strategic file, replace `optionCopyOrRoutingBullet(gates)` with `buildOptionCopyOrRoutingBullet(gates, 'this-turn', 'unit')` and delete the private function. In the tactical file, call `buildOptionCopyOrRoutingBullet(gates, 'this-beat', 'sub-unit')` and delete the private function. Do not edit `buildOptionCopyMappingClause` or either `tempoBullet`.

**Verification:** full bar. The new coaching assertions pass. `rg -n "function optionCopyOrRoutingBullet" src` finds nothing. `rg -n "function tempoBullet" src` still finds two.

**Stop gate:** Report. Wait for go-ahead.

---

### Phase 6 — Split the renderer assertion file

**Intent:** Remove the file that is over the 1000-line hard limit without changing any assertion.

**Files:**

- **Add** `src/main/rendererDrawConsolidation.test.ts`
- **Add** `src/main/rendererProductionAirConsolidation.test.ts`
- **Add** `src/main/rendererMapEntryConsolidation.test.ts`
- **Delete** `src/main/rendererConsolidation.test.ts`
- **Edit** `scripts/verify-modularization-tests.manifest`
- **Edit** the file-header comment in `src/main/tacticalPrefetchRestartContract.test.ts`

**Steps:**

1. Move each test function and the comment immediately above it, verbatim. Do not edit assertion text, strings, or the order of assertions inside a function. Each new file:

   - Starts with a short file comment and the imports that file's functions actually reference (`assert`, `fs`, `path`, `getFunctionSource`, `assertMatches`). Unused imports fail lint; delete those.
   - Defines `run()` that calls only its own tests, in the same relative order they had in the old `run()`.
   - Calls `run()` at the bottom, as the old file does.
   - Does not switch the moved tests to `node:test`.

2. Groups:

   - `rendererDrawConsolidation.test.ts`: `testRedrawAndResizeDelegateToSharedScene`, `testZoomHidesStrategicMapUnits`, `testCommittedPathsRemainVisibleDuringResolutionAnimation`, `testTacticalDrawBranchSkipsStrategicStaleIntel`, `testTacticalDrawingSkipsExploredGateWhenTactical`, `testStrategicAndTacticalBranchesShareOrderOverlayPipeline`, `testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves`, `testMaintainabilityConsolidationSeams`.
   - `rendererProductionAirConsolidation.test.ts`: `testProductionLabelContractsForExploredVsUnexploredHexes`, `testInfrastructureGlyphSetsComeFromTacticalOverrides`, `testAirFerryDoubleClickContracts`, `testAirStrikeAndAirGlyphContracts`, `testKillUpdateTextOmitsPlayerSuffixes`, `testTacticalRubbleTooltipAndTerrainVariantContracts`.
   - `rendererMapEntryConsolidation.test.ts`: `testTacticalEntryLayerPlanningAndContestedContracts`, `testMainMapInteractionsDelegatesHumanUnitIconSelectionToPolicyModule`, `testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries`, `testTacticalMapViewLocksZoomPanAndRestoresWorld`.

3. If any new file is over 600 physical lines, stop and report. Do not create a fourth file.

4. Delete `src/main/rendererConsolidation.test.ts`.

5. In `scripts/verify-modularization-tests.manifest`, replace the line `dist/main/rendererConsolidation.test.js` with:

```text
dist/main/rendererDrawConsolidation.test.js
dist/main/rendererProductionAirConsolidation.test.js
dist/main/rendererMapEntryConsolidation.test.js
```

   Do not add or remove any other manifest line.

6. In `tacticalPrefetchRestartContract.test.ts`, change the header sentence that names `rendererConsolidation.test.ts` so it names `rendererSourceAssertions.ts`. Change nothing else in that file.

**Verification:** full bar, plus `npm run verify:modularization`. Each of the 18 test names occurs in exactly one file under `src`. `rg -n "rendererConsolidation.test" src scripts` finds nothing. Each new test file is under 600 physical lines.

**Stop gate:** Report the three line counts and the manifest diff. Wait for go-ahead.

---

### Phase 7 — Hover support-targeting preview

**Intent:** One stale-check wrapper and one ranged/air preview publisher. Ferry, mixed-air, and march branches stay separate.

**Files:**

- **Edit** `src/renderer/gameplay/hoverRoutePreviewRefresh.ts`
- **Add** `src/main/hoverRoutePreviewSourceContracts.test.ts`

**Steps:**

1. Add private `hoverPreviewStillCurrent(seq: number, hoveredH3: string, unitIds: readonly string[])` with an orienting comment. It returns `hoverRoutePreviewAsyncContextStillValid({ seqAtStart: seq, hoveredH3, unitIdsAtStart: unitIds })`. Replace every call of that form in this file with `hoverPreviewStillCurrent(seq, hoveredH3, unitIds)`. Keep the surrounding `if` and `return`. Do not log.

2. Add private `publishGroupedSupportTargetingPreview` with one parameter object: `deps`, `hoveredH3`, `unitIds`, `validation` (`{ success: boolean; reason?: string | null }`), `supportKind` (`'ranged' | 'air'`), `originH3For` (`(unitId: string) => string | undefined`), and `allowBlockingOrderTooltip`. Orienting comment. No log. Body:

```ts
const valid = args.validation.success;
const reason = valid ? null : (args.validation.reason ?? null);
const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
  args.unitIds.map((id) => ({
    unitId: id,
    originH3: args.originH3For(id) ?? '',
  }))
);
const data = buildGroupedSupportTargetingLinePreview(
  previewUnitIds,
  args.hoveredH3,
  valid,
  args.validation.reason ?? null,
  args.originH3For
);
publishHoverRoutePreview(
  args.deps,
  { hoveredH3Index: args.hoveredH3, data, renderAsSupportTargeting: args.supportKind },
  args.supportKind === 'ranged' ? reason : null,
  args.supportKind === 'air' ? reason : null,
  args.allowBlockingOrderTooltip
);
```

3. Replace the four ranged/air blocks (tactical ranged, tactical air, strategic ranged, strategic air) with a stale check, then one call. Keep each block's validator, including air's `targetType: S.airStrikeTargetType`. Origin lookup stays at the call site:

   - Tactical: `(unitId) => tb.subUnits.find((s) => s.id === unitId && s.player === 'human')?.h3Index`
   - Strategic: `(unitId) => gs.units.find((u) => u.id === unitId && u.player === 'human')?.h3Index`

   Do not change the ferry, mixed-air, or march branches except for the stale-check wrapper in step 1.

4. Add `hoverRoutePreviewSourceContracts.test.ts` in the style of `readyHandlerSourceContracts.test.ts` (`node:test`, `readRendererSource('gameplay', 'hoverRoutePreviewRefresh.ts')`). Count these substrings. The import of `buildGroupedSupportTargetingLinePreview` has no parenthesis, so it does not affect the call count. A wrong count means the extraction is wrong. Do not weaken the assertion.

   - `buildGroupedSupportTargetingLinePreview(` occurs once
   - `publishGroupedSupportTargetingPreview(` occurs five times (one definition and four calls)
   - `seqAtStart:` occurs once

**Verification:** full bar. `git diff -- scripts/renderer-typecheck-baseline.json` is empty. The new source test passes.

**Stop gate:** Report. Wait for go-ahead.

---

### Phase 8 — Build-queue row edit

**Intent:** One submit path for a build-queue type change and a build-queue count change. The remove button stays separate.

**Files:**

- **Edit** `src/renderer/gameplay/buildQueuePopup.ts`
- **Add** `src/main/buildQueuePopupSourceContracts.test.ts`

**Steps:**

1. Inside the per-entry closure, after `readCurrentCount` is defined and before the type-select listener, add `async function submitBuildQueueEntryEdit(failureMessage: string)`. It must close over `mount`, `h3Index`, `entry`, `typeSelect`, `countInput`, and `readCurrentCount`. Do not move it to module scope. Orienting comment. No log.

   Move the shared body into it unchanged: playback guard, missing-API return, `submittedUnitType`, `submittedCount`, `submittedCountText`, `runBuildQueueMutation` with `updateHexBuildQueueEntry`, `refreshState: true`, and the `rejectedBuildQueueEditStillShown` / `restoreRejectedBuildQueueControls` / `renderBuildQueueIntoMount` failure path. The success path still calls `void renderBuildQueueIntoMount(mount, h3Index)`. The only parameter is `failureMessage`.

2. The type-select listener becomes a call with `'Failed to update build queue entry.'`. The count `input` listener becomes a call with `'Failed to update build count.'`. Leave the count `keydown` listener and the remove-button listener as they are, including `Failed to remove build queue entry.`

3. Add `buildQueuePopupSourceContracts.test.ts` using `readRendererSource('gameplay', 'buildQueuePopup.ts')`. `restoreRejectedBuildQueueControls` is already defined in the file, so a name count of one would be wrong and must not be "fixed" by deleting that function. Assert:

   - `function submitBuildQueueEntryEdit` occurs once
   - `restoreRejectedBuildQueueControls(` occurs twice (the existing definition and one call)
   - `Failed to update build queue entry.` and `Failed to update build count.` each occur once
   - `Failed to remove build queue entry.` still occurs once

**Verification:** full bar. `git diff -- scripts/renderer-typecheck-baseline.json` is empty.

**Stop gate:** Report. Wait for go-ahead.

---

### Phase 9 — Preload channel parity

**Intent:** Fail when the preload copies of the IPC channel maps drift from `src/shared/ipc/channels.ts`. Do not change preload.

**Files:**

- **Add** `src/main/preloadChannelParity.test.ts`

**Steps:**

1. Import `IPC_GAME` and `IPC_OPENROUTER` from `../shared/ipc/channels`. Read `src/main/preload.ts` as text. Do not import `preload.ts` (it imports Electron).

2. For a const name, find `const <name> = {` and take the object through its matching closing brace. From that block, collect lines matching `/^\s*([A-Za-z0-9_]+): '([^']+)',?\s*$/`.

3. Assert the collected map deep-equals the imported object, in both directions, for `IPC_GAME` and for `IPC_OPENROUTER`. Also assert each imported pair appears in the preload block as the exact text `` `${key}: '${value}'` ``.

4. Do not edit `preload.ts` or `channels.ts`.

**Verification:** full bar. `git diff -- src/main/preload.ts src/shared/ipc/channels.ts` is empty.

**Stop gate:** Report. Wait for go-ahead.

---

### Phase 10 — Recorded defects only

**Intent:** Fix defects that earlier phases proved already existed. Skip the phase when the list is empty.

**Files:** only files named in the defect inventory.

**Steps:**

1. Read the defect inventory at the bottom of this document. If it has no rows, write "Phase 10 skipped" in the completion log and stop.
2. A row is eligible only when an earlier phase recorded it because the verification bar failed on the unmodified tree, or a new test failed **before** that phase's production edit, and the cause is a defect in existing code. A failure caused by the refactor is not eligible: that phase should already have been reverted.
3. For each eligible row, add or keep the failing test named in the row, then make the smallest production change that turns that test green. Do not change prompt text, channel strings, or gameplay rules beyond what the row describes.
4. If the cause is unclear, do not fix the row. Report it and stop.

**Verification:** full bar. Every eligible row's test passes. Ineligible rows are untouched.

**Stop gate:** Report. Wait for go-ahead.

---

## Reliability checklist (run every phase)

1. Diff is limited to the files the phase lists.
2. Every moved error string, log message, prompt sentence, and channel string is byte-identical to the original.
3. Statement order and short-circuit conditions are unchanged, except where a phase gives a replacement body.
4. Orienting comments on every new function: exactly one block, in the required shape.
5. Main-process logging rules satisfied. No logging added under `src/renderer` or `src/shared`.
6. No phase, opportunity, or plan identifiers anywhere in source, comments, configuration, or `doc/`.
7. No symbol named in the `doc/README.md` tracking table was renamed or moved.
8. Every new module is under 600 physical lines. No new parameter list exceeds 6 named parameters.
9. New renderer source assertions went into the new test files named above.
10. `npm test`, `npm run build:renderer`, and `npm run check:circular` match the Phase 0 result, aside from new tests passing. The renderer type-check baseline file is unchanged.
11. Grep gates for the phase are recorded in the handoff report.
12. On any failure: revert the phase whole. Do not start the next phase.

---

## Success definition

1. `wrapLongitudeDeltaDegrees` and `circularMeanLongitudeDegrees` each have one implementation, in `longitudeCircle.ts`.
2. Air-strike `targetType` checking occurs once in `ipcPayloadGuards.ts`. Human `movementOrders` is still required. Other tactical-commit arrays still default with `?? []`.
3. Embark rules live in `validateTacticalEmbarkOrderForPlayer`. The two reason strings and the two log labels are unchanged. Already-embarked cargo still returns valid without the ok log.
4. `tacticalMovementPlanner.ts` contains one `failureReason: 'no_path'`. `air_no_march` and `outside_footprint` remain.
5. `optionCopyOrRoutingBullet` is gone. `buildOptionCopyOrRoutingBullet` is the one builder. `tempoBullet` still has two copies. The Phase 5 coaching substrings still match.
6. `rendererConsolidation.test.ts` is deleted. The 18 test names run from three files, each under 600 physical lines. The modularization manifest points at those three compiled files and nowhere at the deleted file.
7. `hoverRoutePreviewRefresh.ts` calls `buildGroupedSupportTargetingLinePreview` once and `publishGroupedSupportTargetingPreview` four times. Ferry, mixed-air, and march still use their own builders.
8. `buildQueuePopup.ts` defines `submitBuildQueueEntryEdit` once. The remove button still uses `Failed to remove build queue entry.`
9. Preload channel maps are unchanged and covered by `preloadChannelParity.test.ts`.
10. The renderer type-check baseline gained no entries. Circular dependencies gained no disallowed cycles.
11. No intended behavior change in Phases 1–9. Phase 10 either skipped or fixed only inventoried defects.

---

## Locked decisions

1. **Order:** tested leaf modules, then the assertion-file split, then renderer edits, then the preload test, then recorded defects. Do not reorder.
2. **Verification is automated.** No phase depends on a human clicking the game.
3. **Tests that lock current behavior are added before the refactor** in Phases 2, 3, and 5. A new test that fails on the unmodified code stops the phase.
4. **No baseline is refreshed** to hide a new type error or a new import cycle.
5. **Prompt bytes stay fixed** by the Phase 5 substrings. `tempoBullet` stays duplicated.
6. **Preload keeps its channel copies.** The sandbox comment forbids importing the shared module.
7. **Embark ok log stays on the final success path only.**
8. **`unreachedTacticalMarch` is only for `no_path`.**
9. **The build-queue helper is inside the row closure** so it can see `readCurrentCount`. It is not a module-level function.
10. **`rendererConsolidation.test.ts` is deleted**, not left as a stub. Its tests keep the `run()` style. The modularization manifest is updated only in Phase 6.
11. **Cadence:** one phase per change set, stop and report, wait for go-ahead. Revert rather than patch forward.
12. **Out of scope:** `tempoBullet`, database open/recover, metadata versus naming envelopes, `renderSealiftSection`, and splits of the other files near 900 lines.

---

## Final verification (after Phase 10)

```bash
npm test
npm run build:renderer
npm run check:circular
npm run verify:modularization
```

Then report, in one list: before and after physical line counts for the files in the baseline table; the three new assertion files' line counts; whether the renderer type-check baseline file changed; whether the circular-deps disallowed set changed; and the list of new modules and test files.

---

## Phase 0 inventory (fill in during Phase 0)

Physical line counts are `(Get-Content <file>).Count`. Before counts are the committed files. After counts are the working tree.

| File | Before | After |
|------|------:|------:|
| `src/main/briefing/map/hexBoundingBox.ts` | 100 | 65 |
| `src/main/briefing/map/hexGridProjection.ts` | 242 | 207 |
| `src/main/briefing/map/longitudeCircle.ts` | — | 48 |
| `src/main/ipcPayloadGuards.ts` | 404 | 374 |
| `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts` | 237 | 235 |
| `src/shared/tacticalMovementPlanner.ts` | 509 | 504 |
| `src/main/openRouter/promptSpec/coachingTextStrategic.ts` | 330 | 301 |
| `src/main/openRouter/promptSpec/coachingTextTactical.ts` | 192 | 164 |
| `src/main/rendererConsolidation.test.ts` | 1007 | deleted |
| `src/main/rendererDrawConsolidation.test.ts` | — | 427 |
| `src/main/rendererProductionAirConsolidation.test.ts` | — | 458 |
| `src/main/rendererMapEntryConsolidation.test.ts` | — | 165 |
| `src/renderer/gameplay/hoverRoutePreviewRefresh.ts` | 350 | 300 |
| `src/renderer/gameplay/buildQueuePopup.ts` | 780 | 761 |
| `src/main/preload.ts` | 654 | 654 |

Grep counts after the work:

| Pattern | Count |
|---------|------:|
| `function wrapLongitudeDeltaDegrees` under `src` | 1, in `longitudeCircle.ts` |
| `function circularMeanLongitudeDegrees` under `src` | 1, in `longitudeCircle.ts` |
| `function optionCopyOrRoutingBullet` under `src` | 0 |
| `function tempoBullet` under `src` | 2 |
| `failureReason: 'no_path'` in `tacticalMovementPlanner.ts` | 1 |
| Human and opponent embark function definitions | both remain; shared body is `validateTacticalEmbarkOrderForPlayer` |

`check:renderer-types`: passed inside `npm test`. `scripts/renderer-typecheck-baseline.json` has no diff.

`check:circular` disallowed lines (baseline file is `[]` and was not refreshed):

- `src/main/tools/productionTools.ts -> src/main/gameActions.ts -> src/main/gameActions/gameActionsCore.ts -> src/main/tools/standingOrders.ts -> src/main/tools/standingOrdersInjectionText.ts -> src/main/tools/orderlessUnitSuggestions.ts -> src/main/openRouter/promptText.ts -> src/main/openRouter/promptSpec/consultationText.ts -> src/main/openRouter/promptSpec/envelopeContract.ts -> src/main/openRouter/promptSpec/callbackVocabularyText.ts -> src/main/openRouter/orderResponseParsing.ts -> src/main/tools/productionTools.ts`
- `src/main/tools/standingOrders.ts -> src/main/tools/standingOrdersInjectionText.ts -> src/main/tools/orderlessUnitSuggestions.ts -> src/main/openRouter/promptText.ts -> src/main/openRouter/promptSpec/consultationText.ts -> src/main/openRouter/promptSpec/envelopeContract.ts -> src/main/openRouter/promptSpec/callbackVocabularyText.ts -> src/main/openRouter/orderResponseParsing.ts -> src/main/openRouter/envelopeOrderRows.ts -> src/main/tools/standingOrders.ts`

Neither cycle names a file this work edited.

### Defect inventory (append only under the Phase 10 rule)

| File | Symptom | Cause | Failing test |
|------|---------|-------|--------------|
| `src/shared/ordersHeldForPlayback.ts` | `npm test` stopped in `eslint src` with seven `orienting-comments/require-orienting-block` errors on interface fields | The three interfaces had block comments, and their fields did not. The file was already committed that way. | `eslint src` |

---

## Phase completion log (append one entry per phase)

### Phase 0

Before counts are the committed files, recorded above. `npm test` was red on committed `ordersHeldForPlayback.ts` field comments. `check:circular` was red with the two cycles listed above. Those cycles do not name a file this work edited.

### Phase 1

`wrapLongitudeDeltaDegrees` and `circularMeanLongitudeDegrees` now live in `src/main/briefing/map/longitudeCircle.ts`. The bounding-box and grid-projection modules import them. `longitudeCircle.test.ts` covers the seven expected numbers.

### Phase 2

`parseUnitIdFieldRows` and `parseAirStrikeRows` serve the human payload and `opponentTacticalDraft`. Human `movementOrders` is still passed without `?? []`. The new opponent air-target rejection is in `ipcPayloadGuardsTacticalCommit.test.ts`. `parseGroupedStrikePayload` still has its own target-type check, so a search for `targetType !== 'seaport'` in that file matches twice.

### Phase 3

`validateTacticalEmbarkOrderForPlayer` holds the shared embark rules. The two exports keep their player, reason, and log label. The already-embarked path still returns valid without the ok log. `tacticalEmbarkOrderValidation.test.ts` covers the four pre-database outcomes for each export.

### Phase 4

`unreachedTacticalMarch` is the one `no_path` result. `firstStopIndexWithinBudget` is the shared walk. `air_no_march` and `outside_footprint` stay inline.

### Phase 5

`buildOptionCopyOrRoutingBullet` is the one option-copy builder. Strategic passes `this-turn` and `unit`. Tactical passes `this-beat` and `sub-unit`. `tempoBullet` still has two copies. The coaching test locks the mode noun and the absent-table sentences.

### Phase 6

`rendererConsolidation.test.ts` is deleted. Its 18 contracts run from `rendererDrawConsolidation.test.ts`, `rendererProductionAirConsolidation.test.ts`, and `rendererMapEntryConsolidation.test.ts`, in the previous `run()` order. The modularization manifest points at those three compiled files. The prefetch contract comment now names `rendererSourceAssertions.ts`.

### Phase 7

`hoverPreviewStillCurrent` is the one stale check. `publishGroupedSupportTargetingPreview` is the one ranged/air publisher, called from the four branches. Ferry, mixed-air, and march stay separate. Grouping still uses the first matching unit. The preview line still uses the human unit.

### Phase 8

`submitBuildQueueEntryEdit` is nested in the row closure. The type-select and count-input listeners pass their own failure strings. The remove button is unchanged.

### Phase 9

`preloadChannelParity.test.ts` compares the preload copies of `IPC_GAME` and `IPC_OPENROUTER` with `src/shared/ipc/channels.ts`. `preload.ts` and `channels.ts` were not edited.

### Phase 10

The defect inventory had one row: missing field comments in `ordersHeldForPlayback.ts`. Those comments were added. No behavior in that file changed.
