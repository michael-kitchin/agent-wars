# Maintainability Consolidation Execution Plan v8

**Audience:** A coding agent that executes this plan from start to finish without asking questions.

**Goal:** Remove twelve groups of duplicated code. Each group becomes one helper, and the callers delegate to it. Behavior stays identical.

**Shape:** Phase 0 records a baseline. Phases 1 through 12 each make one consolidation. Phase 13 handles recorded defects and runs the final verification.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails.** If a phase's verification fails and the "If verification fails" steps don't fix it, revert that phase (see below), record the failure in the defect inventory, and stop. Report to the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`/`git restore`. The user reviews every change.
- Read the whole phase before you edit anything. Every phase lists the files it touches. Do not edit files that aren't on the list, except to fix an unused import that lint reports in a listed file.
- Line numbers are approximate ("near line N"). Find the code by the quoted text, not by the number.
- **Code blocks are sketches.** Do not paste them. Write the real code from the file you just read, then add an orienting comment. When a sketch and the file disagree, the file wins, and you record the difference in the completion log.

### Behavior Rule (Strict)

The user chose strict preservation:

- Return values, user-facing strings, thrown errors, log messages, log labels, and log context fields must stay identical.
- Keep redundant calls that exist today. Some are named under "Redundant calls to keep" in the phases. Do not "fix" them.
- New helpers may add **new** log lines where the logging rules require them (see Conventions). Never change or remove an existing log line.

### Backup and Revert

Several phases edit the same file, and nothing is committed. So before each phase, copy every file the phase **edits** to a backup folder outside the repo.

Run this from the repo root at the start of a phase. Set `$step` to the phase number and set `$files` to that phase's **Edit** list. The paths in the example are only for phase 1. Replace them on every later phase. Do not leave an earlier phase's list in `$files`.

```powershell
$step = '1'
$files = @('src/shared/standings.ts', 'src/shared/knockoutDialogCopy.ts')
$backup = Join-Path $env:TEMP "aw-consolidation-v8\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
# Then delete every file the phase *added* (listed under "Add" in the phase).
```

---

## Verification Bar

Every phase ends with all three of these, run from the repo root:

```powershell
npm test
npm run build:renderer
npm run check:circular
```

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/**/*.test.js`, and `notices:check`. New `*.test.ts` files under `src/main` or `src/shared` are discovered automatically.
- `npm run check:circular` must report no new cycles compared with the baseline. Never refresh `scripts/circular-deps-baseline.json` or `scripts/renderer-typecheck-baseline.json`.
- To run one test quickly while you work: `npm run build:main`, then `node dist/main/<path>.test.js` (or `dist/shared/...`). That is a shortcut only. The full bar still decides pass or fail.

The final verification also runs `npm run verify:modularization`.

---

## Non-Goals

- Do not change gameplay, AI prompts, IPC channels, SQL, save format, or UI layout.
- Do not merge `tempoBullet` helpers, unify `initDatabase`, import channel constants into preload, or split large files. Those decisions carry over from earlier plans.
- Do not touch these candidates, which the user left out: the game-config JSON readers, the completion-parse helpers, and the dwell-tooltip wiring.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from the workspace rules. Lint enforces some of them.

- **Orienting comments.** Every new function, including private ones, needs a JSDoc block with a one-line summary, then `Purpose:` (or `Contract:` for interfaces), `When to use:`, `Expected outcome:`, and `Exceptions:`. Lint rule `orienting-comments/require-orienting-block` fails the build without it. Copy the style of the nearest existing function in the same file.
- **Logging in `src/main`.**
  - A new **exported** function that changes state logs `logDebug` on entry. A new exported getter or pure builder logs `logTrace`. Tactical modules use `tacticalLogMutate` (debug) and `tacticalLogQuery` (trace) from `tacticalLogging.ts` instead.
  - New **private** helpers add no log lines. The existing log lines they carry move with them unchanged.
  - Every caught exception logs `logError`.
- **No logging in `src/shared` or `src/renderer`.** Shared code must not import `logger.ts`, because that module imports `fs`.
- **Names.** camelCase files and functions, PascalCase types. No `Utils` or `Impl`. Names from this plan (step numbers, the word "v8", candidate labels) must never appear in code, comments, test names, or `doc/`.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID` and similar constants, never `'human'` literals. Lint rule `seat-id-literals/no-seat-id-literals` applies. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. Functions take 6 or fewer named parameters. Use a parameter object when you need more.
- **`readonly`.** Mark parameter arrays `readonly` and object fields `readonly` where the value is not reassigned. Use `const` unless a value is reassigned.
- **Tests.** Test happy paths and essential failures only. Use the style the existing test file already uses: either the `node:test` `test(...)` style or the `run()` and `assert` style. Test files are linted. A new `function` declaration in a test file needs the same orienting block as production code. Arrow callbacks passed to `test(...)` do not.
- **Docs.** If a phase changes a name or path that `doc/` mentions, update that document in the same phase. Each phase says whether a doc change is needed.

---

## Opportunities

| # | Area | Duplication removed |
|---|------|---------------------|
| 1 | Shared copy | Two copies of `ordinal(place)`; two toast line splitters |
| 2 | Order submit | Five duplicate-unit scanners; five keep-valid loops |
| 3 | Save files | Three SQLite file-set deletion loops |
| 4 | Sealift | Strategic and tactical naval-row and stack-state builders |
| 5 | Tactical cargo | Six copies of "embarked land cargo takes its carrier's hex" |
| 6 | Tactical march | Human and opponent march validation walks |
| 7 | Infrastructure rubble | Two rubble tails; three random-feature rubble paths; two tactical ranged rubble event tails |
| 8 | Ready pipeline | Three `CombatUnit` projections; two sea-cargo filters |
| 9 | Briefing map | Strategic and tactical occupancy setup and water-band mapping |
| 10 | Renderer drawing | Five inline polygon paths; two stack count badges; three support-order segment builders |
| 11 | Build popups | Five close rows; three count inputs; two count readers. Hire keeps its own parse |
| 12 | Terrain legend | Four copies of legend row and swatch chrome |

---

## Phase 0 — Baseline

**Intent:** Confirm the tree is green and record numbers that later phases compare against.

**Files:** None edited. Fill in the Phase 0 inventory at the end of this document.

**Steps:**

1. Run `git status --short -- src scripts`. Record the output. `src` should have no changes. If it has changes, stop and report them to the user.
2. Run the verification bar. If anything fails, record the failing step and its first error in the defect inventory, then stop. Do not start Phase 1 on a red baseline.
3. Record the cycle list that `npm run check:circular` prints.
4. Record the line counts of every file listed in the inventory table:

```powershell
$files = @(
  'src/main/gameActions/orderPlanSanitize.ts','src/main/gameActions/submitOrders.ts',
  'src/main/saveGame/saveFileWrite.ts','src/main/saveGame/loadStaging.ts','src/main/saveGame/saveLoadPipeline.ts',
  'src/main/gameActions/sealift.ts','src/main/tacticalBattle/tacticalSealiftStackState.ts','src/main/gameActions/sealiftSlotAssignment.ts',
  'src/main/tacticalBattle/tacticalStrategicOrderPhases.ts','src/main/tacticalBattle/tacticalMovementApply.ts','src/main/tacticalBattle/tacticalPlanStateMovement.ts',
  'src/main/tacticalBattle/tacticalBattleSession.ts','src/main/gameActions/tacticalRangedInfrastructureRubble.ts','src/main/gameActions/airStrikeResolution.ts',
  'src/main/gameActions/readyStrategicResolutionPipeline.ts','src/main/briefing/map/briefingMapSection.ts',
  'src/shared/standings.ts','src/shared/knockoutDialogCopy.ts','src/shared/consolidatedTurnUpdateToast.ts',
  'src/renderer/rendering/terrainRendering.ts','src/renderer/rendering/tacticalBattleTerrainPaint.ts','src/renderer/map/newGameMapPreviewRendering.ts','src/renderer/rendering/homeRegionBorderDrawing.ts',
  'src/renderer/rendering/unitDrawing.ts','src/renderer/rendering/pathDrawing.ts','src/renderer/rendering/orderDrawing.ts',
  'src/renderer/gameplay/buildQueuePopupFormatting.ts','src/renderer/gameplay/buildQueuePopup.ts','src/renderer/gameplay/buildQueueMultiPopup.ts','src/renderer/gameplay/hirePanel.ts','src/renderer/gameplay/buildHirePopup.ts',
  'src/renderer/rendering/terrainVisualStyles.ts','src/renderer/rendering/terrainLegendUrban.ts','src/renderer/rendering/terrainLegendRubble.ts','src/renderer/rendering/terrainLegendFortified.ts'
)
foreach ($f in $files) { if (Test-Path $f) { '{0}  {1}' -f (Get-Content $f).Count, $f } else { "MISSING  $f" } }
```

If any file is `MISSING`, find it with `rg --files -g '<name>'` and correct the path in this plan before you continue.

**Verification:** The bar passes, and the inventory is filled in.

---

## Phase 1 — Shared Place Ordinal and Toast Owner Split

**Intent:** Move the duplicated `ordinal(place)` into one shared module. Fold the two toast line splitters into one private helper.

**Add:** `src/shared/placeOrdinal.ts`, `src/shared/placeOrdinal.test.ts`

**Edit:** `src/shared/standings.ts`, `src/shared/knockoutDialogCopy.ts`, `src/shared/consolidatedTurnUpdateToast.ts`

**Steps:**

1. Create `src/shared/placeOrdinal.ts`. Export `formatPlaceOrdinal(place: number): string`. Copy the body **exactly** from the private `ordinal` near line 553 of `standings.ts`. Write an orienting comment: it turns a 1-based finishing place into English ordinal text, such as `1st`, `12th`, or `22nd`. Do not import `logger`.
2. Create `src/shared/placeOrdinal.test.ts` in the `node:test` style, with one test that asserts these results:
   - `1st`, `2nd`, `3rd`, `4th` for 1–4
   - `11th`, `12th`, `13th` for 11–13
   - `21st`, `22nd`, `23rd` for 21–23
   - `111th` for 111
3. In `standings.ts`, delete the private `ordinal` function and its comment. Import `formatPlaceOrdinal` from `'./placeOrdinal'`, and replace the one call `ordinal(` with `formatPlaceOrdinal(`.
4. Do the same in `knockoutDialogCopy.ts` (the function is near line 174). The file's opening comment says: "The dialog and the standings heading share a place sentence without sharing a module." Reword only that sentence so it says both files take the place ordinal from `formatPlaceOrdinal`. Leave the other labeled lines of that comment in place.
5. In `consolidatedTurnUpdateToast.ts`, add a private helper above `splitMissileStrikeLines` (near line 285):

```ts
function splitToastLinesByOwner<T extends { readonly line: string }>(
  lines: readonly T[] | undefined,
  ownerIdOf: (entry: T) => string | null,
  ownsSection: (ownerId: string) => boolean
): {
  readonly byOwner: ReadonlyMap<string, readonly string[]>;
  readonly updates: readonly string[];
} {
  const byOwner = new Map<string, string[]>();
  const updates: string[] = [];
  for (const entry of lines ?? []) {
    // same trim, skip-blank, and map-update steps as splitMissileStrikeLines
  }
  return { byOwner, updates };
}
```

   - Iterate `lines ?? []`. Both callers pass an array that may be undefined.
   - Copy the trim, the blank-line skip, and the `get` / `push` / `set` steps from `splitMissileStrikeLines`. Replace `entry.controllerId` with `ownerIdOf(entry)`, and replace the seat test with `ownerId !== null && ownsSection(ownerId)`.
6. Replace the bodies of the two existing functions with one return each. Keep their names, signatures, and comments.
   - Missile: `return splitToastLinesByOwner(lines, (entry) => entry.controllerId, (ownerId) => isSeatId(ownerId));`
   - Fortification: `return splitToastLinesByOwner(lines, (entry) => entry.ownerId, (ownerId) => isSeatId(ownerId) || ownerId === NEUTRAL_OWNER_ID);`

**Verification:**

- The verification bar passes. `consolidatedTurnUpdateToast.test.ts`, `standings.test.ts`, and the knockout dialog tests guard the behavior.
- `rg -n "function ordinal\(" src` finds no matches.
- `rg -c "function formatPlaceOrdinal" src` reports 1.
- `splitMissileStrikeLines` and `splitFortificationReportLines` no longer contain `.trim()`. `splitToastLinesByOwner` does. Other `.trim()` calls in that file, including the ones near the toast builder, stay where they are.
- **Docs:** none. No `doc/` file names `ordinal` or these splitters. Confirm with `rg -n "splitMissileStrikeLines|splitFortificationReportLines|ordinal\(" doc`.

**If verification fails:** A type error on the `ownsSection` lambda means `isSeatId` takes a different parameter type. Keep the lambda form and adjust only the type annotation of `ownsSection` to match.

---

## Phase 2 — Order Submit Sanitization

**Intent:** One duplicate-unit scanner and one keep-valid-rows loop, replacing five copies of each.

**Add:** None.

**Edit:** `src/main/gameActions/orderPlanSanitize.ts`, `src/main/gameActions/orderPlanSanitize.test.ts`, `src/main/gameActions/submitOrders.ts`

**Steps:**

1. **Test first.** `orderPlanSanitize.test.ts` uses the `run()` and `assert` style. Import `strategicMissileLaunchDuplicateReason` and add the asserts to the two existing test functions. `run()` already calls those functions. Do not add a third function unless you also call it from `run()`.
   - The existing `label` helper returns `` `U:${unitId}` ``. Use unit id `'m'`, not `'U:m'`.
   - Two rows with unit id `'m'`. The result is `'Duplicate missile launch for U:m.'`, including the period.
   - Two rows with different ids. The result is `null`. Add that assert to the unique-rows test.

   Run `npm run build:main` and then `node dist/main/gameActions/orderPlanSanitize.test.js`. Both new cases must pass **before** you change production code.
2. In `orderPlanSanitize.ts`, add this private helper below the last log helper:

```ts
function firstDuplicateUnitReason(
  rows: readonly { readonly unitId: string }[],
  displayLabelForUnit: (unitId: string) => string,
  reasonFor: (unitLabel: string) => string
): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.unitId)) return reasonFor(displayLabelForUnit(row.unitId));
    seen.add(row.unitId);
  }
  return null;
}
```

   Before you write it, read one existing scanner and confirm that it calls `displayLabelForUnit` only when it finds a duplicate. If it calls the function at another point, match that order instead.
3. Replace each of the five exported scanner bodies (near lines 68–166) with one `return firstDuplicateUnitReason(...)` call. Pass that function's own array parameter: movement names it `orders`, and the other four name it `rows`. Keep each export's name, parameter names, and comment. Use these reason functions:
   - Movement: ``(label) => `Duplicate order for ${label}` ``
   - Ranged: ``(label) => `Duplicate ranged order for ${label}` ``
   - Air: ``(label) => `Duplicate strike order for ${label}` ``
   - Ferry: ``(label) => `Duplicate ferry order for ${label}` ``
   - Missile: `missileLaunchDuplicateReason`, already imported from `../../shared/missileRules`

   Copy each sentence from the current code character for character. Do not add or remove periods.
4. In `submitOrders.ts`, add this private helper above `executeSubmitOrders`:

```ts
function keepValidOrderRows<T extends { readonly unitId: string }>(
  rows: readonly T[],
  orderKind: string,
  validate: (row: T) => { valid: true } | { valid: false; reason: string }
): { readonly kept: T[]; readonly droppedCount: number } {
  const kept: T[] = [];
  let droppedCount = 0;
  for (const row of rows) {
    const result = validate(row);
    if (!result.valid) {
      droppedCount += 1;
      logOrderPlanSanitizeDrop(ORDER_PLAN_SANITIZE_CONTEXT.strategicSubmit, orderKind, {
        unitId: row.unitId,
        reason: result.reason,
      });
      continue;
    }
    kept.push(row);
  }
  return { kept, droppedCount };
}
```

   First confirm that the existing loops pass `ORDER_PLAN_SANITIZE_CONTEXT.strategicSubmit`, through `sanitizeCtx`, and that each drop log has exactly `{ unitId, reason }`. Copy the `orderKind` strings (`'movement'` and so on) from the existing calls.
5. Replace each of the five keep loops (near lines 156–249) with this pattern:

```ts
const movementPass = keepValidOrderRows(orders, 'movement', (order) => deps.validateOrder(order.unitId, order.toH3Index));
droppedInvalidRows += movementPass.droppedCount;
const keptMovements = movementPass.kept;
```

   - Keep the existing `kept…` variable names so later code doesn't change.
   - Keep each duplicate check, and its early `return`, exactly where it is now and in the same order.
   - Use these `orderKind` strings, copied from the current log calls: `'movement'`, `'ranged'`, `'airStrike'`, `'ferry'`, `'missileLaunch'`.
   - Copy each validate call's arguments from the current loop. **The ranged loop passes `allowedPlayer: HUMAN_SEAT_ID`; keep it.** Air, ferry, and missile pass `allowedPlayer: deps.humanPlayerId`. Movement calls `deps.validateOrder(order.unitId, order.toH3Index)` with no player argument.
   - **Ferry.** `strikeUnitIds` is still built after the air rows are kept and before the ferry loop. The ferry validate callback first returns `{ valid: false, reason: \`Air unit ${deps.displayLabelForUnit(f.unitId)} cannot strike and ferry in the same turn\` }` when `strikeUnitIds.has(f.unitId)`, and otherwise returns the existing `validateFerryOrder(...)` result. Copy the sentence from the current code.
6. Remove imports that are now unused, if lint reports any.

**Verification:**

- The verification bar passes. `orderPlanSanitize.test.ts` and `gameActionsMultiSelect.test.ts` guard the behavior.
- `rg -c "logOrderPlanSanitizeDrop\(" src/main/gameActions/submitOrders.ts` reports 1.
- `rg -c "new Set<string>\(\)" src/main/gameActions/orderPlanSanitize.ts` reports 1.
- `rg -n "Duplicate (ranged |strike |ferry )?order for" src/main/gameActions/orderPlanSanitize.ts` finds 4 lines.
- **Docs:** `rg -n "keepValidOrderRows|firstDuplicateUnitReason|orderPlanSanitize" doc`. Update only if a document describes the loop structure. None is expected.

---

## Phase 3 — SQLite File-Set Deletion

**Intent:** One function deletes `<file>-wal`, `<file>-shm`, and `<file>`. The three existing local wrappers keep their names and log messages.

**Add:** `src/main/saveGame/sqliteFileSet.ts`, `src/main/saveGame/sqliteFileSet.test.ts`

**Edit:** `src/main/saveGame/saveFileWrite.ts`, `src/main/saveGame/loadStaging.ts`, `src/main/saveGame/saveLoadPipeline.ts`

**Steps:**

1. Create `sqliteFileSet.ts`:

```ts
export function deleteSqliteFileSet(
  filePath: string,
  options: { readonly quiet: boolean; readonly failureLogMessage: string }
): void {
  logDebug('sqliteFileSet deleteSqliteFileSet', { filePath, quiet: options.quiet });
  for (const suffix of ['-wal', '-shm', ''] as const) {
    const target = `${filePath}${suffix}`;
    try {
      if (fs.existsSync(target)) fs.rmSync(target);
    } catch (err) {
      if (!options.quiet) throw err;
      logError(options.failureLogMessage, { filePath: target, err });
    }
  }
}
```

   - All three current loops call `fs.rmSync(target)` with **no second argument**. Do not pass `{ force: true }`. That option changes what a failed delete throws.
   - Import `fs` the same way `saveFileWrite.ts` does, and import `logDebug` and `logError` from `../logger`.
   - The new entry log is required because this is a new exported function. Do not change the three failure messages below.
   - Write the orienting comment:
     - It deletes the SQLite write-ahead log, the shared-memory file, and the main file, in that order.
     - With `quiet`, a failure is logged with `failureLogMessage` and the remaining files are still attempted.
     - Without `quiet`, the first failure is thrown and nothing is logged.
2. In `saveFileWrite.ts`, replace the body of `deleteStagingSet(filePath, quiet)` with:
   `deleteSqliteFileSet(filePath, { quiet, failureLogMessage: 'saveFileWrite failed to delete a temporary file' });`
   - Delete `deleteIfPresent` and its comment, since it is now unused.
   - **Keep `deleteQuietly`.** It still deletes `partialPath`.
3. In `loadStaging.ts`, replace the body of `deleteStagingFiles(filePath, quiet)` with a call that passes `failureLogMessage: 'loadStaging failed to delete the staging file'`.
4. In `saveLoadPipeline.ts`, replace the body of `deleteQuietly(filePath)` with a call that passes `{ quiet: true, failureLogMessage: 'saveLoadPipeline failed to delete the load staging file' }`.
5. Copy every log message from the code, not from this plan, if they differ. Remove now-unused imports.
6. Create `sqliteFileSet.test.ts` in the `node:test` style, using a directory from `fs.mkdtempSync(path.join(os.tmpdir(), 'aw-sqlite-set-'))`, removed in `finally`. Two tests:
   - Deletes all three files when they exist.
   - Does not throw with `quiet: false` when none of the files exist.

**Verification:**

- The verification bar passes. `saveFileWrite.test.ts`, `loadStaging.test.ts`, and `saveLoadPipeline.test.ts` guard the behavior.
- `rg -n "'-wal', '-shm'" src/main` finds exactly one match, in `sqliteFileSet.ts`.
- **Docs:** `doc/save-files.md` describes the behavior, not the function names. Run `rg -n "deleteStagingSet|deleteIfPresent|deleteStagingFiles" doc`. Expect no matches.

---

## Phase 4 — Sealift Row and Stack-State Builders

**Intent:** Strategic `sealift.ts` and tactical `tacticalSealiftStackState.ts` share one naval-row builder and one stack-state builder.

**Add:** None.

**Edit:** `src/main/gameActions/sealiftSlotAssignment.ts`, `src/main/gameActions/sealiftSlotAssignment.test.ts`, `src/main/gameActions/sealift.ts`, `src/main/tacticalBattle/tacticalSealiftStackState.ts`

**Redundant calls to keep:** `readSealiftStackState` ends up calling `canManualDebarkFromHex(h3Index, HUMAN_SEAT_ID)` twice. Today one call is inside `buildNavalRows` (near line 386) and one assigns `debarkAllowedAtHex` (near line 422). A third call, near line 461, guards an edit and stays untouched. After this phase, `sealift.ts` still contains **4** occurrences of `canManualDebarkFromHex(`: the function definition, the argument to `buildSealiftNavalRows`, the `debarkAllowedAtHex` assignment, and the edit guard. Do not reuse `debarkAllowedAtHex` for the rows.

**Steps:**

1. Read `buildNavalRows` (near line 370 of `sealift.ts`), `readSealiftStackState` (near line 410), and `buildTacticalSealiftStackStateFromSnapshot` (near line 66 of the tactical file). The two sides compute the same seven naval-row fields and the same stack-state fields. If the code has changed and a field now differs, stop and record the difference as a defect.
2. In `sealiftSlotAssignment.ts`, add:
   - Import `logTrace` from `../logger`. The file already imports `logDebug`. The two new builders use `logTrace` because they do not modify state. Do not copy the `logDebug` level from `buildSealiftSlotsByNavalId`.
   - A private `controlsDisabledFor(contextMode: SealiftContextMode): boolean` that returns `contextMode === 'water' || contextMode === 'coastal_no_port'`. Copy the condition from the current code.
   - An exported `buildSealiftNavalRows(args: { readonly navalIds: readonly string[]; readonly slotsByNavalId: …; readonly landTypeById: …; readonly contextMode: SealiftContextMode; readonly debarkAllowed: boolean }): SealiftNavalRow[]`. Take the map types from the current callers. Its body is the current row-building loop. Log with `logTrace('sealiftSlotAssignment buildSealiftNavalRows', { navalCount: args.navalIds.length, contextMode: args.contextMode })`.
   - An exported `buildSealiftStackState(args: { readonly h3Index: string; readonly contextMode: SealiftContextMode; readonly navalRows: readonly SealiftNavalRow[]; readonly landOptions: …; readonly hasEmbarkedUnitsInStack: boolean; readonly debarkAllowedAtHex: boolean }): SealiftStackState`. Use `showSealiftSection = (navalRows.length > 0 && landOptions.length > 0) || hasEmbarkedUnitsInStack`, with every other field copied from the current builders. Log with `logTrace`.
   - `SealiftNavalRow`, `SealiftStackState`, and `SealiftContextMode` live in `src/shared/ipc/sealiftTypes.ts`. Import them with `import type` from there. `SealiftSlotPair` is already in this file.
   - `showSealiftSection` today is `navalIds.length > 0 && landOptions.length > 0 || hasEmbarkedUnitsInStack`. `navalRows.length` equals `navalIds.length`, so use `navalRows.length`.
   - The stack state's own `controlsDisabled` field comes from `controlsDisabledFor(contextMode)`. Do not read it off a naval row. `debarkAllowedAtHex` is the argument, not a fresh `canManualDebarkFromHex` call inside the builder.
   - Run `npm run check:circular` right after this step. `sealiftSlotAssignment.ts` must not import `sealift.ts`.
3. In `sealift.ts`:
   - Delete `buildNavalRows`.
   - At its call site, use `buildSealiftNavalRows({ …, debarkAllowed: canManualDebarkFromHex(h3Index, HUMAN_SEAT_ID) })`.
   - Leave the existing `debarkAllowedAtHex = canManualDebarkFromHex(...)` line unchanged.
   - Build the returned state with `buildSealiftStackState(...)`.
   - Keep every existing log line in `readSealiftStackState`.
4. In `tacticalSealiftStackState.ts`, replace the duplicated row and state code with the same two calls. Keep its single `canManualDebarkFromHex` call and pass that one value to both builders, as the code does today.
5. Add `node:test` tests to `sealiftSlotAssignment.test.ts`:
   - **Armor in slot 1.** Context `'coastal_port'`, `debarkAllowed: true`. The row has `slot2Disabled: true`, `controlsDisabled: false`, and debark slot 1 enabled.
   - **Water.** Context `'water'`, `debarkAllowed: false`. The row has `controlsDisabled: true` and both debark flags false.
   - **Section visibility.** `buildSealiftStackState` with no naval rows and `hasEmbarkedUnitsInStack: true` returns `showSealiftSection: true`.

   Use the real field names from step 1.

**Verification:**

- The verification bar passes. `sealift.test.ts`, `sealiftSlotAssignment.test.ts`, and the tactical snapshot tests guard the behavior.
- `rg -n "function buildNavalRows" src/main` finds no matches.
- `rg -c "canManualDebarkFromHex\(" src/main/gameActions/sealift.ts` reports 4.
- **Docs:** run `rg -n "buildNavalRows|readSealiftStackState|buildTacticalSealiftStackStateFromSnapshot" doc`. Update any section that names `buildNavalRows`.

---

## Phase 5 — Embarked Cargo Hex Sync

**Intent:** One function moves embarked land cargo onto its naval carrier's hex, replacing six copies.

**Add:** `src/main/tacticalBattle/tacticalEmbarkedCargoSync.ts`, `src/main/tacticalBattle/tacticalEmbarkedCargoSync.test.ts`

**Edit:** `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts`, `src/main/tacticalBattle/tacticalMovementApply.ts`, `src/main/tacticalBattle/tacticalPlanStateMovement.ts`

**The six copies:**

- `tacticalStrategicOrderPhases.ts`: the closure `syncCargoToNavalHex` near line 202, in the embark phase.
- `tacticalStrategicOrderPhases.ts`: the same closure near line 744, in the ferry phase.
- `tacticalStrategicOrderPhases.ts`: the loop in exported `tacticalBattleWithSyncedEmbarkCargo`, near line 798.
- `tacticalMovementApply.ts`: index loops near lines 53 and 99.
- `tacticalPlanStateMovement.ts`: the `byId` loop near line 35.

**Steps:**

1. Create `tacticalEmbarkedCargoSync.ts`:

```ts
import { tacticalLogQuery } from './tacticalLogging';

export function syncEmbarkedLandToNavalHex<
  T extends {
    readonly id: string;
    readonly unitType: string;
    readonly h3Index: string;
    readonly embarkedOnSubUnitId?: string | null;
  },
>(units: readonly T[]): T[] {
  tacticalLogQuery('syncEmbarkedLandToNavalHex', { unitCount: units.length });
  const byId = new Map(units.map((u) => [u.id, u] as const));
  return units.map((u) => {
    if (!u.embarkedOnSubUnitId) return u;
    const carrier = byId.get(u.embarkedOnSubUnitId);
    if (!carrier || carrier.unitType !== 'naval') return u;
    return { ...u, h3Index: carrier.h3Index };
  });
}
```

   - Check the `tacticalLogQuery` signature in `tacticalLogging.ts` and match how other callers pass a label and context.
   - Orienting comment:
     - It returns a new array.
     - Rows whose carrier exists and is naval get the carrier's `h3Index`.
     - Every other row keeps its object identity.
     - Carriers are read from the input, not from rows already updated.
     - The input is not mutated.
2. Replace the copies:
   - **Both closures in `tacticalStrategicOrderPhases.ts`.** Delete the closure and replace each call with `sub = syncEmbarkedLandToNavalHex(sub);`. Keep `let sub`.
   - **`tacticalBattleWithSyncedEmbarkCargo`.** Keep the clone. The body becomes `const sub = battle.subUnits.map((u) => ({ ...u }));` followed by returning the battle with `subUnits: syncEmbarkedLandToNavalHex(sub)`. Keep the rest of the current return shape.
   - **Both loops in `tacticalMovementApply.ts`.** `sub` is declared `const`, so do not reassign it. Change each `return { ...battle, subUnits: sub }` to `return { ...battle, subUnits: syncEmbarkedLandToNavalHex(sub) }` and delete the `idToUnit` loop above it. Leave the `byId` map and the order loop alone. **Keep the opponent debark logic** that clears `embarkedOnSubUnitId` inside the order loop. The human function has no debark step.
   - **`tacticalPlanStateMovement.ts`.** Replace lines from `const byId = new Map(` through the loop with `return { ...state, units: syncEmbarkedLandToNavalHex(units) };`. The old loop read carriers from the partly updated map. That gives a different result only when a naval row is itself embarked, which game rules never produce. Record this in the completion log.
3. Create `tacticalEmbarkedCargoSync.test.ts` in the `node:test` style. Build rows as minimal objects. A cast is allowed in tests.
   - Naval `n1` at hex `a`, and infantry `l1` with `embarkedOnSubUnitId: 'n1'` at hex `b`. The result has `l1.h3Index === 'a'`, and the input row still has `'b'`.
   - Cargo whose carrier is missing, and cargo whose carrier is infantry, come back as the same object (`assert.equal(out[i], input[i])`).

**Verification:**

- The verification bar passes. `tacticalMovementApply.test.ts`, `tacticalPlanStateMovement.test.ts`, and the tactical phase tests guard the behavior.
- `rg -n "syncCargoToNavalHex" src` finds no matches.
- `rg -c "h3Index: (n|naval|carrier)\.h3Index" src/main` reports exactly one file, the new module, with count 1.
- **Docs:** `rg -n "syncCargoToNavalHex|tacticalBattleWithSyncedEmbarkCargo" doc`. Update any path or symbol you find.

---

## Phase 6 — Tactical March Validation Walk

**Intent:** The human and opponent march validators share one walk.

**Add:** None.

**Edit:** `src/main/tacticalBattle/tacticalBattleSession.ts`, `src/main/tacticalBattle/tacticalBattleSession.test.ts`

**Steps:**

1. **Test first.** Add `node:test` tests to `tacticalBattleSession.test.ts` that call the exported `validateHumanTacticalMarchOrders`.
   - Set the snapshot with `setActiveTacticalBattleSnapshotRef(...)`, using `as unknown as TacticalBattleSnapshot`. The walk reads `tacticalChildH3Indexes` and `subUnits`. It does not read a field named `footprintH3Indices`.
   - Put `battleId: 'march-validation'` and `tacticalTurnNumber: 1` on the snapshot. The success path logs both.
   - One sub-unit has `id: 'own'` and `player: HUMAN_SEAT_ID`. One has `id: 'other'` and a different player. Import `HUMAN_SEAT_ID`. The outside-footprint destination must be a string that is **absent** from `tacticalChildH3Indexes`, so the walk returns before it checks fortifications or plans a path.
   - Reset the snapshot to `null` in `finally`.
   - Assert these messages exactly:
     - An unknown unit id gives `'One or more selected units are not part of this tactical battle.'`
     - An opponent unit gives `'Only your tactical sub-units can receive march orders here.'`
     - A destination outside the footprint gives `'That destination lies outside the tactical battle footprint.'` Use unit id `'own'` for this order. An unknown id returns the first message instead, because the walk checks the unit before the destination.
     - Empty orders give a success result.
   - Copy the messages from `humanTacticalMarchBlockMessage`, not from this plan, if they differ.
   - Run the test file. The tests must pass before step 2.
2. Add this private helper near `humanTacticalMarchBlockMessage`:

```ts
function firstTacticalMarchValidationFailure(args: {
  readonly cur: TacticalBattleSnapshot;
  readonly orders: readonly { readonly unitId: string; readonly toH3Index: string }[];
  readonly computeOutcome: typeof tacticalComputeHumanMovementOrderOutcome;
  readonly logFailure: typeof tacticalLogQuery;
  readonly logLabel: string;
}): string | null
```

   - Its body is the current walk from `humanTacticalMarchValidationFailure` (near line 356), with the compute call, the log call, and the label taken from `args`.
   - Keep the failure log's context exactly: `{ reason, ...context, unitId, toH3Index }`, in the same key order.
   - If the two compute functions have different types, make `computeOutcome` the union of both `typeof` types, or a function type both satisfy.
3. Replace the bodies of `opponentTacticalMarchValidationFailure` (near line 66) and `humanTacticalMarchValidationFailure` with one call each:
   - Opponent: `tacticalComputeMovementOrderOutcome`, `tacticalLogQuery`, and its current label.
   - Human: `tacticalComputeHumanMovementOrderOutcome`, `tacticalLogMutate`, and its current label.

   Keep both functions' names and comments.

**Verification:**

- The verification bar passes.
- `rg -c "humanTacticalMarchBlockMessage\(" src/main/tacticalBattle/tacticalBattleSession.ts` reports 2. The baseline is 3: the function declaration and two call sites. After this phase the declaration and the one call inside the helper remain.
- `tacticalBattleSession.ts` may grow by at most 20 lines over its baseline. It is already over 600 lines. A larger growth means the second walk was copied instead of replaced.
- **Docs:** none expected. Run `rg -n "MarchValidationFailure" doc`.

---

## Phase 7 — Infrastructure Rubble

**Intent:** Three local consolidations of the code that turns cells to rubble and records the result.

**Add:** None.

**Edit:** `src/main/gameActions/tacticalRangedInfrastructureRubble.ts`, `src/main/gameActions/tacticalRangedInfrastructureRubble.test.ts`, `src/main/gameActions/airStrikeResolution.ts`, `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts`

**Steps:**

1. **Test first.** Add `node:test` tests to `tacticalRangedInfrastructureRubble.test.ts`, inside `withTempGameDb`. Call the existing export `applyTacticalRangedRubbleToCell`. There is no export named `applyTacticalRangedRubbleToRes4Cell`. Copy the temp-database and row-read pattern from the test already in that file.
   - Setup: `const child = tacticalCell(56, 66); const parent = cellToParent(child, 1);`. Call `insertTacticalFeatureOverrideRubbleRow({ h3Index: child, parentH3Index: parent, terrainKind: 'plains' })`. That insert stores `is_rubble = 1` and clears the facility flags.
   - **Facility case.** `updateTacticalFeatureOverrideRow(child, { isRubble: false, isUrban: true })`, then apply with parent as the second argument. It returns `changed: true` and `destroyedAirUnitsCount: 0`. Read the row back the way the existing test does, with `is_rubble AS isRubble` and `is_urban AS isUrban`. Expect `1` and `0`.
   - **Non-facility case.** Update with `{ isRubble: false }` only, then apply. It returns `changed: true`.
   - **Already-rubble case.** Apply the inserted row with no update. It returns `changed: false`.
   - Import `insertTacticalFeatureOverrideRubbleRow` and `updateTacticalFeatureOverrideRow` from `../gameDb`.
   - The tests must pass before step 2.
2. In `tacticalRangedInfrastructureRubble.ts`, add a private helper:

```ts
function rubbleExistingTacticalRow(
  tacticalH3Index: string,
  strategicParentH3Index: string,
  hadAirport: boolean,
  completionLogMessage: string
): { readonly changed: true; readonly destroyedAirUnitsCount: number }
```

   - Its body is the shared tail, in this order:
     1. `updateTacticalFeatureOverrideRow(tacticalH3Index, { isRubble: true, isUrban: false, isAirport: false, isSeaport: false })`
     2. `destroyedAirUnitsCount = hadAirport ? destroyBasedAirUnitsAtHex(strategicParentH3Index).length : 0`
     3. `pruneBuildQueueForInfrastructureState(strategicParentH3Index)`
     4. `logDebug(completionLogMessage, { tacticalH3Index, destroyedAirUnitsCount })`
     5. Return.
   - Confirm each argument against both tails before you write the helper. Use the logging function the file already uses.
   - Replace the facility tail (near line 68) and the non-facility tail (near line 98) with calls that pass the full current log strings:
     - `'tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: facility update complete'`
     - `'tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: non-facility row rubbled'`
   - Copy both strings from the code.
3. In `airStrikeResolution.ts`, inside `applyInfrastructureDestructionEffects`, add a private helper:

```ts
function rubbleRandomFeatureCells(args: {
  readonly h3Index: string;
  readonly feature: 'urban' | 'airport' | 'seaport';
  readonly count: number;
  readonly next: () => number;
  readonly result: {
    destroyedAirUnits: ReturnType<typeof destroyBasedAirUnitsAtHex>;
    changedRubbleCount: number;
    fortificationsStrippedCount: number;
  };
}): void {
  const picked = replaceRandomTacticalFeaturesWithRubble(args.h3Index, args.feature, args.count, args.next);
  args.result.changedRubbleCount = picked.rubbled;
  args.result.fortificationsStrippedCount = picked.fortificationsStripped;
  if (args.result.changedRubbleCount > 0) {
    if (args.feature === 'airport') {
      args.result.destroyedAirUnits = destroyBasedAirUnitsAtHex(args.h3Index);
    }
    pruneBuildQueueForInfrastructureState(args.h3Index);
  }
}
```

   - If `result` is declared with a named type, use that type instead of the inline shape.
   - Replace only these three blocks: the urban-random block (near line 266, after `destroyCount <= 0`), the airport block (near line 276), and the seaport block (near line 287).
   - Do **not** fold in the tactical urban path above them (near line 232). That path updates one known row and keeps that row's airport and seaport flags.
   - Keep each block's availability guard. Keep `return finish()` on the urban-random and airport paths. Seaport falls through to the function's final `return finish();`. Leave that final return in place so any other `targetType` still finishes.
   - Do not rename `applyInfrastructureDestructionEffects`, because `doc/combat-rules-v3.md` names it.
4. In `tacticalStrategicOrderPhases.ts`, inside `applyTacticalAirStrikeThenRangedPhaseOnBattle`, the kill loop (near line 600) and the infrastructure-only loop (near line 655) share the same tail. Add a private helper above the function:

```ts
function recordTacticalRangedRubble(args: {
  readonly workBattle: TacticalBattleSnapshot;
  readonly hex: string;
  readonly tacticalRows: ReadonlyArray<{ h3Index: string; isUrban: boolean; isAirport: boolean; isSeaport: boolean; isRubble: boolean }>;
  readonly events: …; // use the type of the events array the loops push to
}): boolean
```

   - The helper returns `false` early when `tacticalInfrastructureStrikeStaysOnEnclosingHex(...)` or `tacticalHasStrikeableInfrastructure(...)` rejects the hex. Copy both guards and their exact arguments.
   - Next it computes `targetType = tacticalRangedInfraEventTargetTypeBeforeRubble(hex, tacticalRows)` and calls `applyTacticalRangedRubbleToCell(hex, workBattle.enclosingStrategicH3Index, tacticalRangedRubbleApplyOptsForHex(workBattle, hex))`.
   - If the cell changed, it pushes `{ h3Index: workBattle.enclosingStrategicH3Index, targetType, changedRubbleCount: 1, destroyedAirUnitsCount }` and returns `true`.
   - Each loop keeps its own skip checks and its own set:
     - Kill loop: `!footprint.has(hex)` and `rubbledFromCombat.has(hex)`.
     - Infrastructure loop: `rubbledInfraHexes.has(hex)`.
   - When the helper returns `true`, the loop adds the hex to **its own** set and sets `rangedTerrainMutated = true`.
   - Keep the guards, the type computation, and the apply call in the same order as today.
   - The rows argument at both call sites is the existing `tacticalRowsForBattle`. The events array is the existing `infrastructureDestroyedEvents`. Do not create a second events array.

**Verification:**

- The verification bar passes. `gameDb.test.ts` (air-strike parity), `fortificationStrikes.test.ts`, the tactical rubble tests, and the tactical ranged phase tests guard the behavior.
- `rg -c "replaceRandomTacticalFeaturesWithRubble\(" src/main/gameActions/airStrikeResolution.ts` reports 2: the definition and the helper call.
- `rg -c "isRubble: true, isUrban: false, isAirport: false, isSeaport: false" src/main/gameActions/tacticalRangedInfrastructureRubble.ts` reports 1.
- `rg -c "tacticalRangedInfraEventTargetTypeBeforeRubble\(" src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` reports 1.
- `tacticalStrategicOrderPhases.ts` stays under 900 lines. It may grow by at most 20 lines over its baseline, which is the room an orienting comment needs. A larger growth means the two tails were copied instead of replaced.
- **Docs:** `rg -n "applyTacticalRangedRubbleToRes4Cell|applyInfrastructureDestructionEffects|applyTacticalAirStrikeThenRangedPhaseOnBattle" doc`. Names are unchanged, so no edit is expected.

---

## Phase 8 — Ready Pipeline Projection

**Intent:** One `CombatUnit` projection and one sea-cargo filter.

**Add:** None.

**Edit:** `src/main/gameActions/readyStrategicResolutionPipeline.ts`

**Steps:**

1. Add two private helpers.
   - `toCombatUnit(unit: GameStateSnapshot['units'][number]): CombatUnit` returns `{ id, player, unitType, h3Index, displayOrder }`, copied from the projection near line 138. Use `import type { GameStateSnapshot }` from whichever module the file already imports game state from.
   - `withoutEmbarkedLandOnWater<T extends { readonly id: string; readonly unitType: string }>(units: readonly T[]): T[]` keeps every row that is not `infantry` or `armor`. It keeps an infantry or armor row only when `!isEmbarkedLandUnitOnWater(u.id)`. Copy the predicate from near line 269.
2. Replace the three projections (near lines 138, 273, and 435) with `.map(toCombatUnit)`.
3. Replace the two sea-cargo filters with `withoutEmbarkedLandOnWater(...)`.
   - Keep the post-move list's `rangedRemovedSet` filter **before** the cargo filter.
   - Keep the ranged list's weather-penalty map where it is.
   - Keep the `withOriginHitBonus` calls unchanged.
   - Keep the original order of filter, then map.

**Verification:**

- The verification bar passes. The ready-flow tests under `src/main` guard the behavior.
- `rg -c "isEmbarkedLandUnitOnWater\(" src/main/gameActions/readyStrategicResolutionPipeline.ts` reports 1.
- `rg -c "displayOrder:" src/main/gameActions/readyStrategicResolutionPipeline.ts` reports 1, inside `toCombatUnit`. The weather-penalty map must not build its own `{ id, player, unitType, h3Index, displayOrder }` object.
- **Docs:** none expected. These are private helpers.

---

## Phase 9 — Briefing Map Occupancy

**Intent:** The strategic and tactical briefing maps share occupancy setup and the terrain water band.

**Add:** None.

**Edit:** `src/main/briefing/map/briefingMapSection.ts`

**Redundant calls to keep:** `briefingOwnSeatId(state)` logs a trace each time it is called. The file has **5** call sites today: one near line 70, the strategic counting call near line 133, the strategic per-hex call near line 147, the tactical counting call near line 253, and the tactical controller call near line 260. The file also imports the name, so a search for the bare name counts the import too. After this phase there are **4 calls**: the one near line 70, the one inside `readBriefingMapOccupancy`, the per-hex call, and the tactical controller call. `rg -c "briefingOwnSeatId\(" src/main/briefing/map/briefingMapSection.ts` reports 4. The same search reports 5 before the edit.

**Names to keep:** The count maps are named backwards. `aiUnitsByH3` counts units whose player **is** `ownSeat`. `humanUnitsByH3` counts everyone else. The rendered fields `aiUnitCount` and `enemyUnitCount` depend on that. Alias the helper's maps back to those two names. Do not swap them to match the names.

**Steps:**

1. Add two private helpers.
   - `readBriefingMapOccupancy(state)`, typed with the parameter type the two builders use. It returns:
     - `ownSeat`, from one `briefingOwnSeatId(state)` call
     - `fog: state.fogOfWarEnabled === true`
     - `discovered`: the set of visible plus explored hexes
     - `ownUnitsByH3` and `otherUnitsByH3`: the count maps

     Keep the order: discovered, then fog, then the seat call, then counting.
   - `briefingMapTerrainBand(rawTerrain: string): 'land' | 'water'` returns `'water'` for `ocean`, `water`, and `arctic_ocean`, and `'land'` otherwise. Copy the exact list from the code.
2. In `buildStrategicHexGameStateMap` (near line 114) and `buildTacticalHexGameStateMap` (near line 243), replace the duplicated setup with one `readBriefingMapOccupancy(state)` call and read the fields from it. Replace the band mapping with `briefingMapTerrainBand(...)`.
   - Keep each map's loop and output fields unchanged.
   - Keep the original variable names as `const` aliases if that keeps the loop body untouched, for example `const { fog, discovered } = occupancy;`.

**Verification:**

- The verification bar passes. `briefingMapSection.test.ts` guards the behavior.
- `rg -c "arctic_ocean" src/main/briefing/map/briefingMapSection.ts` reports 1.
- `rg -c "briefingOwnSeatId\(" src/main/briefing/map/briefingMapSection.ts` reports 4.
- **Docs:** `rg -n "buildStrategicHexGameStateMap|buildTacticalHexGameStateMap" doc`. No edit expected.

---

## Phase 10 — Renderer Drawing Helpers

**Intent:** Reuse `drawClosedPolygonPath`, share the stack count badge, and share support-order segment building.

**Add:** `src/main/rendererDrawHelpersSourceContracts.test.ts`

**Edit:** `src/renderer/rendering/terrainRendering.ts`, `src/renderer/rendering/tacticalBattleTerrainPaint.ts`, `src/renderer/map/newGameMapPreviewRendering.ts`, `src/renderer/rendering/homeRegionBorderDrawing.ts`, `src/renderer/rendering/unitDrawing.ts`, `src/renderer/rendering/pathDrawing.ts`, `src/renderer/rendering/orderDrawing.ts`, `src/main/rendererDrawConsolidation.test.ts`

The preview file is `src/renderer/map/newGameMapPreviewRendering.ts`.

**Steps:**

1. **Polygon paths.** `drawClosedPolygonPath` in `polygonOutline.ts` already calls `ctx.beginPath()`, draws the points, and calls `ctx.closePath()`. The replacement body is only the helper call. Do not leave `beginPath`, the point loop, or `closePath` in the caller.
   - **`terrainRendering.ts`** has two closures, near lines 170 and 288. Keep each closure, because `fillHexTerrain` calls it. Replace the whole body with `drawClosedPolygonPath(ctx, pts)`.
   - **`tacticalBattleTerrainPaint.ts`** (near line 58): keep the closure. Replace its body with `drawClosedPolygonPath(ctx, pts)`.
   - **`newGameMapPreviewRendering.ts`** (near line 179): keep the closure. Its loop variable is `point`, and the array is `pts`. Pass `pts`.
   - **`homeRegionBorderDrawing.ts`** (near line 92): delete the `drawClosedPath` closure. Call `drawClosedPolygonPath(ctx, pts)` and `drawClosedPolygonPath(ctx, innerPts)` at the two existing call sites.
   - Import it from `./polygonOutline` inside `rendering/`. The preview file is `src/renderer/map/newGameMapPreviewRendering.ts`, so its import is `../rendering/polygonOutline`.
   - `ScreenPoint` is `{ x: number; y: number }`. The local point arrays are assignable. Do not change their type.
2. **Stack badge.** In `unitDrawing.ts`, export:

```ts
export function drawStackCountBadge(ctx: CanvasRenderingContext2D, count: number, x: number, y: number): void {
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

   - Copy the statements from the current block near line 348, in its exact order.
   - In `unitDrawing.ts`, the loop already skips `count < 2` before this block. Replace the badge statements with `drawStackCountBadge(ctx, count, x, y)` and keep that skip.
   - In `pathDrawing.ts` the badge sits inside `if (group.count > 1)`. Keep that `if`. Replace only the font, alignment, stroke, and fill statements with `drawStackCountBadge(ctx, group.count, p.x, p.y)`. Add `drawStackCountBadge` to the existing import from `./unitDrawing`. Do not add a second import. Remove `COUNT_BADGE_OFFSET` from its import if nothing else in the file uses it. Keep `STACK_OFFSET_X` and `STACK_OFFSET_Y`.
   - The renderer has no logging.
3. **Support segments.** In `orderDrawing.ts`, add a private helper:

```ts
function drawPendingSupportOrderLines(
  ctx: CanvasRenderingContext2D,
  mode: …, // the mode type strokeSupportOrderLines accepts
  orders: readonly { readonly unitId: string; readonly targetH3Index: string }[],
  units: …, // the units parameter type the three exports use
  hexList: readonly string[] | undefined
): void
```

   - Body: return when `orders.length === 0 || !hexList`. Otherwise build segments with `units.find`, skip missing units, and call `strokeSupportOrderLines(ctx, mode, segments)`.
   - `drawRangedAttackLines`, `drawAirStrikeLines`, and `drawMissileLaunchLines` each become one call, with modes `'ranged'`, `'airStrike'`, and `'missile'`. Keep their names, signatures, and comments.
   - `drawRangedAttackLines` starts with `void canvasWidth; void canvasHeight;`. Keep both lines, then call the helper.
   - Do not route `drawRangedResolutionShotLines` or `drawPendingFerryLines` through the helper. Ferry still calls `units.find` itself, and the resolution drawer builds segments with `.map`.
4. In `rendererDrawConsolidation.test.ts` (near line 239), change the needle `'ctx.fillText(String(group.count), badgeX, badgeY);'` to `'drawStackCountBadge(ctx, group.count, p.x, p.y);'` and keep the assertion's intent.
5. Create `src/main/rendererDrawHelpersSourceContracts.test.ts` in the `node:test` style, using `readRendererSource` from `./testSupport/rendererSourceAssertions` and a local `occurrenceCount(source, needle)` like the one in `buildQueuePopupSourceContracts.test.ts`. Read rendering files with `readRendererSource('rendering', '<file>.ts')` and the preview with `readRendererSource('map', 'newGameMapPreviewRendering.ts')`. Assert:
   - **Polygon paths.** The four edited files each have 0 occurrences of `if (i === 0) ctx.moveTo(`. `polygonOutline.ts` still has 1, and this test does not assert on it. `drawClosedPolygonPath(ctx, ` occurs 2, 1, 1, and 2 times in `terrainRendering.ts`, `tacticalBattleTerrainPaint.ts`, `newGameMapPreviewRendering.ts`, and `homeRegionBorderDrawing.ts`.
   - **Stack badge.**
     - `unitDrawing.ts` has 1 `function drawStackCountBadge(` and 1 `'bold 13px system-ui, sans-serif'`.
     - `pathDrawing.ts` has 0 of that font string.
   - **Support segments.**
     - `orderDrawing.ts` has 1 `segments.push(`.
     - `orderDrawing.ts` has 3 calls to `drawPendingSupportOrderLines(ctx, `.

   Before you add the test, check the real counts with `rg -c` and fix any wrong expectation in this plan. Do not change the code to fit a wrong number.

**Verification:**

- The verification bar passes. `check:renderer-types` and `build:renderer` cover the renderer.
- **Docs:** `rg -n "drawClosedPath|COUNT_BADGE_OFFSET|drawRangedAttackLines" doc`. Update any section in `doc/ux/` that lists entry points for these files only if it names a removed symbol.

---

## Phase 11 — Build and Hire Popup Chrome

**Intent:** Shared close row, count input, and count reader for the build and hire popups.

**Add:** `src/main/buildPopupChromeSourceContracts.test.ts`

**Edit:** `src/renderer/gameplay/buildQueuePopupFormatting.ts`, `src/renderer/gameplay/buildQueuePopup.ts`, `src/renderer/gameplay/buildQueueMultiPopup.ts`, `src/renderer/gameplay/hirePanel.ts`, `src/renderer/gameplay/buildHirePopup.ts`, `src/main/rendererDrawConsolidation.test.ts`

Confirm each path with `rg --files -g '<name>'`.

**Steps:**

1. Read all five close-row copies and all three count-input copies first:
   - `buildQueuePopup.ts`: close row near line 326, input near line 455, keydown near line 514, `readCurrentCount`.
   - `buildQueueMultiPopup.ts`: close rows near lines 249 and 268, input near line 360, `readCurrentCount`.
   - `hirePanel.ts`: `closeRow(deps)` near line 142, input near line 250.
   - `buildHirePopup.ts`: close row near line 179.

   Write down every attribute, class, style, listener, and tooltip each copy sets. They must match field for field, except for the differences listed below. If any other difference exists, keep that copy unconverted and record it in the completion log.
2. In `buildQueuePopupFormatting.ts`, add three exports with orienting comments:
   - `createBuildPopupCloseRow(onClose: () => void): HTMLDivElement`. It builds the `build-popup-close-row` div with the `unit-select build-close-btn` button, text `×`, and the `buildPopupCloseTooltipText` tooltip, set the same way as today. It wires the click with `() => onClose()`.
   - `createBuildCountInput(tooltipText: string, initialValue: string): HTMLInputElement`. It sets `data-control-tooltip`, `type = 'text'`, `className = 'build-count-input'`, `maxLength = 2`, `inputMode = 'numeric'`, and `value = initialValue`, then adds the keydown filter. Use the two-`if` form from `buildQueuePopup.ts`: allowed keys return, a single digit returns, otherwise `preventDefault`. The multi popup writes those two tests as one `if`. The behavior is the same.
   - It does **not** add input or click listeners. The callers keep those.
   - `readSanitizedBuildCount(input: HTMLInputElement): number`. It matches `readCurrentCount`: it sanitizes with `sanitizeBuildCountInputText`, writes the cleaned value back, and parses it. Copy the exact steps from the code.
3. Replace the copies:
   - Each close row becomes `createBuildPopupCloseRow(...)`. `hideBuildPopup` is `() => void`, so `() => onClose()` matches both the wrapped calls and the multi popup's direct `deps.hideBuildPopup` listener. Pass `hideBuildPopup` from the single-hex popup, and `deps.hideBuildPopup` from the multi popup, hire panel, and hire-failure row. Delete `hirePanel`'s private `closeRow`.
   - The `buildQueuePopup` and `buildQueueMultiPopup` inputs become `createBuildCountInput(...)`, and their `readCurrentCount` calls become `readSanitizedBuildCount(input)`.
   - **`hirePanel`.** Use `createBuildCountInput(tooltip, '1')`. Keep its own input listener, which sanitizes without submitting. Keep its own click handler, which uses `parseInt(sanitize(...))` without writing back. Do not switch it to `readSanitizedBuildCount`.
   - Remove imports that are now unused. `buildQueuePopup.ts` re-exports the sanitizer; keep that re-export.
4. The seam that names the sanitizer is `testMaintainabilityConsolidationSeams` in `src/main/rendererDrawConsolidation.test.ts`, near line 319. It requires `buildQueueMultiPopup.ts` to include both `from './buildQueuePopupFormatting'` and `sanitizeBuildCountInputText`, and to not include `function sanitizeCount`.
   - After this phase the multi popup imports `createBuildCountInput` and `readSanitizedBuildCount` from that module, and it no longer mentions `sanitizeBuildCountInputText`.
   - Change the sanitizer needle to `readSanitizedBuildCount`. Keep the import needle and the `function sanitizeCount` exclusion. Update the assertion message so it names `readSanitizedBuildCount`.
   - There is no such needle in `buildQueuePopupSourceContracts.test.ts`. Do not edit that file unless `npm test` fails there.
5. Create `src/main/buildPopupChromeSourceContracts.test.ts`, in the same style as Phase 10. Assert:
   - **Old chrome gone.** `build-popup-close-row`, `'ArrowLeft'`, and the count-input class string each occur 0 times in the four popup files. Take the class string from the original input code.
   - **Close-row calls.** `createBuildPopupCloseRow(` occurs 1, 2, 1, and 1 times in `buildQueuePopup.ts`, `buildQueueMultiPopup.ts`, `hirePanel.ts`, and `buildHirePopup.ts`.
   - **Count-input calls.** `createBuildCountInput(` occurs once each in `buildQueuePopup.ts`, `buildQueueMultiPopup.ts`, and `hirePanel.ts`.
   - **Formatting module.** `buildQueuePopupFormatting.ts` defines each of the three functions once.

   Check the real counts with `rg -c` before you write the expectations.

**Verification:**

- The verification bar passes. `mapGestureWiring.test.ts` (the commit-edited-template and playback gate contracts) and `buildQueuePopupSourceContracts.test.ts` must stay green.
- **Docs:** `doc/ux/build-popup.md` already lists `buildQueuePopupFormatting.ts`. Do not add it again. `closeRow` and `readCurrentCount` are private. Confirm with `rg -n "function closeRow|readCurrentCount" doc`. Expect no matches, and make no doc edit.

---

## Phase 12 — Terrain Legend Rows

**Intent:** One module owns the legend row layout and swatch chrome.

**Add:** `src/renderer/rendering/terrainLegendRow.ts`, `src/main/terrainLegendRowSourceContracts.test.ts`

**Edit:** `src/renderer/rendering/terrainVisualStyles.ts`, `src/renderer/rendering/terrainLegendUrban.ts`, `src/renderer/rendering/terrainLegendRubble.ts`, `src/renderer/rendering/terrainLegendFortified.ts`, `doc/ux/terrain-legend.md`

**Steps:**

1. Read the four copies:
   - `terrainVisualStyles.ts`, near line 857
   - `terrainLegendUrban.ts`, near line 45
   - `terrainLegendRubble.ts`, near line 36
   - `terrainLegendFortified.ts`, near line 25. Its swatch is a canvas with an 18×12 bitmap.

   List each style property that each copy sets.
2. Create `terrainLegendRow.ts` with two exports and orienting comments:
   - `applyLegendSwatchChrome(el: HTMLElement): void`. It sets only the shared swatch styles: `display = 'inline-block'`, `width = '18px'`, `height = '12px'`, `border = '1px solid #d5deea'`, and `borderRadius = '2px'`. It does **not** set `background`, `backgroundColor`, or `backgroundImage`. It does **not** set a canvas bitmap size (`el.width` / `el.height`). Callers set their own fill after this call.
   - `appendLegendRow(container: HTMLElement, swatch: HTMLElement, labelText: string): void`. It creates the row div with `display = 'flex'`, `alignItems = 'center'`, `gap = '6px'`, and `marginBottom = '2px'`. The label is a `span` whose only assignment is `textContent = labelText`. Append the swatch, then the label, then append the row to `container`. None of the four copies sets a style on the label.
3. Convert each copy to `applyLegendSwatchChrome(swatch)`, then its own fill, then `appendLegendRow(...)`.
   - Kind rows in `terrainVisualStyles.ts` then set `swatch.style.background = terrainSwatchColor(kind)`.
   - Urban then sets `swatch.style.background = color`.
   - Rubble then calls `applyRubbleSwatchPaint`. Chrome comes first, because that paint clears `background` and sets the hatch.
   - Fortified keeps `swatch.width = 18` and `swatch.height = 12` before the chrome call, then draws the ticks. It sets no CSS background.
   - If a copy sets a style that differs from the shared value, keep that override after the shared call and note it in the completion log.
4. Create `src/main/terrainLegendRowSourceContracts.test.ts`:
   - The four legend files have 0 occurrences each of `style.gap = '6px'` and `'1px solid #d5deea'`.
   - Each of the four files calls `appendLegendRow(` once and `applyLegendSwatchChrome(` once.
   - `terrainLegendRow.ts` contains each of the two style strings once.

   Check the counts with `rg -c` first. If `terrainVisualStyles.ts` builds rows in a loop, the call still appears once in the source.
5. In `doc/ux/terrain-legend.md`, add `src/renderer/rendering/terrainLegendRow.ts` to the Code Entry Points list. Describe it the way the neighboring entries are described: shared legend row layout and swatch chrome.

**Verification:**

- The verification bar passes.
- The `doc/ux/terrain-legend.md` diff touches only the Code Entry Points list.

---

## Phase 13 — Recorded Defects and Final Verification

**Intent:** Close out the run.

**Steps:**

1. Review the defect inventory.
   - Fix only defects that a phase caused and that are confined to that phase's files.
   - Leave pre-existing defects recorded, not fixed.
2. Run the full bar plus `npm run verify:modularization`.
3. Check that no plan identifiers leaked:
   - `rg -n "v8|Phase [0-9]|step-[0-9]" src doc --glob '!doc/devleopment-plan-v3.4.md'`. Every match must already exist at baseline.
   - Compare against `git diff --stat` and inspect only the changed files.
4. Check the size limits against the Phase 0 line counts.
   - Every edited or added file is under 1000 lines.
   - A file that was under 600 lines stays under 600.
   - A file that was already over 600 may grow by at most 20 lines. More than that means duplicated code was copied instead of removed.
   - `tacticalStrategicOrderPhases.ts` also stays under 900.
5. Fill in the completion log.

---

## Reliability Checklist

Check every item before you mark a phase complete:

- [ ] The backup for this phase exists before the first edit.
- [ ] Each test-first step passed before production code changed.
- [ ] No existing log message, label, or context field changed. Verify with `git diff` on the phase's files: every removed log line must reappear unchanged in the helper, or be passed in as an argument.
- [ ] Every existing user-facing string is unchanged.
- [ ] The redundant calls named under "Redundant calls to keep" are still present.
- [ ] Every new function has an orienting comment, and lint passes.
- [ ] No new `'human'` or `'opponent'` literals appear in production code.
- [ ] No plan or step identifiers appear in code, comments, test names, or docs.
- [ ] `npm run check:circular` shows no new cycles.
- [ ] Any doc update this phase needs is done.

---

## Success Definition

- All twelve consolidations are in place, or the run stopped at a failed verification and that failure is recorded.
- The verification bar and `npm run verify:modularization` pass.
- Every grep gate in the completed phases passes.
- `doc/ux/terrain-legend.md` lists `terrainLegendRow.ts`. `doc/ux/build-popup.md` already lists `buildQueuePopupFormatting.ts`, so that list does not need a new row. `doc/ux/multi-hex-build-popup.md` lists that same formatting module, because the multi-hex close control and count field are built there. No document names a removed symbol.
- Nothing is committed or pushed.

---

## Locked Decisions

- Behavior preservation is strict, as described above.
- Phases run back to back and stop only on a failed verification.
- Existing exported names stay as thin wrappers where callers or docs use them: the five duplicate scanners, the toast splitters, `tacticalBattleWithSyncedEmbarkCargo`, and the three support-line drawers.
- Phase 5 includes `tacticalPlanStateMovement.ts`. The helper reads carriers from the input rows. The old loop read carriers from rows it had already updated. The two differ only when a naval row is itself embarked, which game rules never produce.
- `hirePanel` keeps its own input listener and its own submit parsing.
- `sealift.ts` keeps 4 occurrences of `canManualDebarkFromHex(`. The read path still calls it twice. The briefing file keeps its per-hex `briefingOwnSeatId` calls, and `aiUnitsByH3` still counts the own seat. Both redundancies are candidates for a later, non-strict cleanup. This run does not remove them.
- SQLite deletes use `fs.rmSync(target)` with no options. The tactical urban rubble path in `airStrikeResolution.ts` stays separate from the random-feature helper. Ferry lines and resolution shot lines stay out of the support-order helper.

---

## Final Verification

```powershell
npm test
npm run build:renderer
npm run check:circular
npm run verify:modularization
git status --short
```

Every command must pass. `git status` must show only the files this plan lists as added or edited.

---

## Phase 0 Inventory

Fill in during Phase 0.

| Item | Value |
|------|-------|
| `git status --short -- src scripts` | Empty before the first edit |
| Baseline `npm test` result | Failed. `rendererStackPopoverContracts.test.ts` asserts a select-glyph assignment that the current `applyStackCalloutSelectionButtonVisibility` does not contain. Those three stack-callout files were not edited |
| Baseline cycle list | Four cycles, and `scripts/circular-deps-baseline.json` is `[]`, so `npm run check:circular` exits 1. The same four cycles remain. No fifth cycle was added |
| `canManualDebarkFromHex(` count in `sealift.ts` | 4 before and after |
| `briefingOwnSeatId(` count in `briefingMapSection.ts` | 5 before, 4 after |
| `humanTacticalMarchBlockMessage(` count in `tacticalBattleSession.ts` | 3 before, 2 after |

| File | Baseline lines | Final lines |
|------|----------------|-------------|
| `airStrikeResolution.ts` (already over 600) | 699 | 713 |
| `tacticalBattleSession.ts` (already over 600) | 723 | 737 |
| `tacticalStrategicOrderPhases.ts` | 811 | 808 |
| `sealift.ts` | 898 | 871 |
| `terrainVisualStyles.ts` | 881 | 867 |
| `buildQueuePopup.ts` | 784 | 765 |
| Every other edited file | under 600 | still under 600 |

---

## Defect Inventory

Record each failure or unexpected difference: which phase, which file, what happened, whether it existed at baseline, and what you did about it.

| Phase | File | Defect | Pre-existing? | Action |
|-------|------|--------|---------------|--------|
| 0 | `scripts/circular-deps-baseline.json` | `check:circular` exits 1 on four existing cycles because the baseline file is empty | Yes | Left recorded. The same four cycles are the only ones after phase 12 |
| 0 | `src/main/rendererStackPopoverContracts.test.ts` | The visibility assertion expects `S.selectedUnitIds.includes(unitId)` inside `applyStackCalloutSelectionButtonVisibility`. The function assigns `selected` instead | Yes | Left recorded. The three stack-callout sources have no diff |
| 7 | `src/main/gameActions/airStrikeResolution.ts` | `replaceRandomTacticalFeaturesWithRubble(` occurs 3 times: the existing comment, the definition, and the helper call. The gate expected 2 | No, the comment was already there | Left the comment. Call sites collapsed from 3 to 1 |
| 7 | `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` | `tacticalRangedInfraEventTargetTypeBeforeRubble(` occurs 2 times: the definition and the one helper call. The gate expected 1 | The definition was already a match | Left it. Both loop bodies now call `recordTacticalRangedRubble` |

---

## Completion Log

| Phase | Status | Notes (deviations, overrides kept, counts adjusted) |
|-------|--------|-----------------------------------------------------|
| 0 | Recorded | Baseline `npm test` and `check:circular` were already red. Later phases were not stopped for those two |
| 1 | Done | `formatPlaceOrdinal` and `splitToastLinesByOwner`. Toast `.trim()` calls outside the two splitters were left in place |
| 2 | Done | Five scanners are one-line wrappers. Missile duplicate text stays `Duplicate missile launch for U:m.` |
| 3 | Done | `fs.rmSync(target)` with no options. Failure log strings stay on the callers |
| 4 | Done | `sealift.ts` still calls `canManualDebarkFromHex(` four times. Stack `controlsDisabled` comes from the context mode |
| 5 | Done | Cargo sync reads carriers from the input array. `tacticalPlanStateMovement` no longer reads a carrier it has already moved. That differs only when a naval row is itself embarked |
| 6 | Done | One walk. Human orders still log at mutate level and opponent orders at query level |
| 7 | Done | The rubble helper is the shared update tail, not a rewrite of the current function. The tactical urban path stays separate. `return finish()` stays |
| 8 | Done | `displayOrder` on the projection argument is optional, matching `listUnitsForSnapshot` |
| 9 | Done | `aiUnitsByH3` still counts the briefing seat. Per-hex `briefingOwnSeatId` calls stay. The tactical fort flag uses that same seat value |
| 10 | Done | Polygon callers no longer begin or close the path. The stack badge was added to the existing `unitDrawing` import |
| 11 | Done | Hire keeps its own input listener and `parseInt(sanitize(...))` click path |
| 12 | Done | Swatch chrome does not set a background or a canvas bitmap size. `doc/ux/terrain-legend.md` lists `terrainLegendRow.ts` |
| 13 | Recorded | Every discovered test passed except `rendererStackPopoverContracts.test.ts`, which failed before these edits. `check:circular` still exits 1 on the same four cycles, so `npm test` and `verify:modularization` cannot exit 0 without changing that baseline or that assertion. Both stay as they were |
