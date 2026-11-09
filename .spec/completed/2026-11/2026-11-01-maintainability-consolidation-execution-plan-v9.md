# Maintainability Consolidation Execution Plan v9

**Audience:** A coding agent that executes this plan from start to finish without asking questions.

**Goal:** Remove ten groups of duplicated code. Each group becomes one helper, or reuses one that already exists, and the callers delegate to it. Behavior stays identical.

**Shape:** Phase 0 records a baseline. Phases 1 through 10 each make one consolidation. Phase 11 runs the final verification and the doc check.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails.** If a phase's verification fails and the "If verification fails" steps don't fix it, revert that phase (see below), record the failure in the defect inventory, and stop. Report to the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`/`git restore`. The user reviews every change.
- Read the whole phase before you edit anything. Every phase lists the files it touches. Do not edit files that aren't on the list, except to fix an unused import that lint reports in a listed file.
- Line numbers are approximate ("near line N"). Find the code by the quoted text, not by the number.
- **Code blocks are sketches.** Do not paste them blindly. Write the real code from the file you just read, then add an orienting comment. When a sketch and the file disagree, the file wins, and you record the difference in the completion log.
- **Tests come first.** Where a phase says "Add tests first", the order depends on what the test calls:
  - **The test calls code that exists today** (for example `hashStringToUint32`, or a prompt builder). Write the test and run it against the *old* code before you edit production code. It must pass before and after the edit. A test that only passes after the edit proves nothing.
  - **The test calls a new helper.** Write the helper and its test, and run the test, before you change any caller. The callers' existing tests are then the characterization tests. They must pass unchanged after the callers switch to the helper.

### Behavior Rule (Strict)

The user chose pure refactors:

- Return values, user-facing strings, thrown errors, SQL text, save format, IPC payloads, and prompt text must stay identical.
- Keep redundant calls that exist today, in the same order. Do not "fix" them.
- Existing log lines stay unchanged, except where a phase explicitly says two duplicated trace lines merge into one. New helpers may add **new** log lines where the logging rules require them (see Conventions).

### Backup and Revert

Several phases edit the same file, and nothing is committed. So before each phase, copy every file the phase **edits** to a backup folder outside the repo.

Run this from the repo root at the start of a phase. Set `$step` to the phase number and set `$files` to that phase's **Edit** list. The paths below are only an example for phase 1. Replace them on every later phase. Do not leave an earlier phase's list in `$files`.

```powershell
$step = '1'
$files = @('src/shared/aiOnlyBattles.ts', 'src/main/tacticalBattle/tacticalMeleeApply.ts')
$backup = Join-Path $env:TEMP "aw-consolidation-v9\step-$step"
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

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes. New `*.test.ts` files under `src/main` or `src/shared` are discovered automatically. Tests under `src/renderer` are **not** run, so every new test in this plan lives under `src/shared` or `src/main`.
- `npm run check:circular` exits 1 today because of four known cycles. It passes for this plan when it prints **exactly** the four cycles recorded in the Phase 0 inventory and no others. A new cycle fails the phase.
- `npm run check:renderer-types` compares renderer type errors with `scripts/renderer-typecheck-baseline.json`. Running `tsc -p tsconfig.renderer.json` by hand shows the baseline errors too, which is expected. Use the npm script.
- Never refresh `scripts/renderer-typecheck-baseline.json` or any other baseline file to make a gate pass.
- To run one test quickly while you work: `npm run build:main`, then `node --test dist/main/<path>.test.js` (or `dist/shared/...`). That is a shortcut only. The full bar still decides pass or fail.

**Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, then rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, and delete the `.locked` file afterward. This is an environment problem, not a phase failure.

---

## Non-Goals

- Do not change gameplay, AI prompts, IPC channels, SQL, save format, or UI layout.
- Do not split large files. The user declined file splits for this plan.
- Do not merge these, which were considered and left out: the tactical beat pipelines, the seeded RNG implementations (`seededRng.ts`, `computeTacticalBattleSnapshot.ts`), match-epoch guards, circle stroke painters, stored-boolean policies, unit label tables, chat usage helpers, playback lists, coaching bullets, `tempoBullet` helpers, and the hash in `humanMarchPreviewDiagnostics.ts` (it uses `hash * 31`, a different algorithm).
- Do not add a JSON-parsing `game_config` reader. The user left that out of an earlier plan. Phases 9 and 10 only wrap the three plain row statements.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from the workspace rules in `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new function, constant, type, and field needs a JSDoc block with a one-line summary, then `Purpose:` (or `Contract:` for interfaces and types), `When to use:`, `Expected outcome:`, and `Exceptions:`. Lint rule `orienting-comments/require-orienting-block` fails the build without it. Copy the style of the nearest existing function in the same file. Write the comment about what the code does and when to call it. Do not write where it came from ("moved from", "consolidated", "shared copy of").
- **Comments that explain a constraint.** Where a phase says "keep the comment", keep or add the stated one-line constraint. Add no other narration.
- **Logging in `src/main`.**
  - A new **exported** function that changes state logs `logDebug` on entry. A new exported getter or pure builder logs `logTrace`. Tactical modules use `tacticalLogMutate` (debug) and `tacticalLogQuery` (trace) from `tacticalLogging.ts` instead.
  - Log context fields carry ids, keys, and counts only. **Never log a `game_config` value.** Some values are API keys or encrypted envelopes.
  - New **private** helpers add no log lines. The existing log lines they carry move with them unchanged.
  - Every caught exception logs `logError`. This plan adds no `try`/`catch`.
- **No logging in `src/shared` or `src/renderer`.** Shared code must not import `logger.ts`, because that module imports `fs`.
- **Names.** camelCase files and functions, PascalCase types, UPPER_SNAKE constants. No `Utils` or `Impl`. Names from this plan (phase numbers, the word "v9", opportunity numbers) must never appear in code, comments, test names, or `doc/`.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID` and similar constants, never `'human'` literals. Lint rule `seat-id-literals/no-seat-id-literals` applies. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. Functions take 6 or fewer named parameters. Use a parameter object when you need more.
- **`readonly`.** Mark parameter arrays `readonly` and object fields `readonly` where the value is not reassigned. Use `const` unless a value is reassigned.
- **Tests.** Test happy paths and essential failures only. When adding to an existing test file, use its style. For a new test file, copy the imports and structure of the nearest sibling test file in the same folder. Test files are linted. A new `function` declaration in a test file needs the same orienting block as production code. Arrow callbacks passed to `test(...)` do not.
- **Docs.** If a phase changes a name or path that `doc/` mentions, update that document in the same phase. Each phase says what to check.

---

## Opportunities

| # | Area | Duplication removed |
|---|------|---------------------|
| 1 | Hashing | Four private copies of 32-bit FNV-1a, replaced by the existing `hashStringToUint32` |
| 2 | Map longitude | Five copies of "shift a longitude within 180° of a reference"; two copies of the Web Mercator latitude limit |
| 3 | Seat order | Six inline `seatOrder` sorts, replaced by the existing `sortSeatsByOrder` |
| 4 | Air-strike and ranged validation | Three copies of the infrastructure-target check; two copies of "enemy holds a fortified hex" |
| 5 | Embark context | Two copies of the three embark-context queries |
| 6 | Tactical turn | Five copies of the tactical combat seed formula; three copies of the march-stop update |
| 7 | Renderer geometry | Four inline hex-ring projections, replaced by the existing `projectHexBoundaryToContainerPoints`; two copies of the projected ring centroid |
| 8 | Prompt examples | Two copies of four envelope example rows |
| 9–10 | Game config | Many inline copies of the three `game_config` row statements |

---

## Phase 0 — Baseline

**Intent:** Confirm the tree is green and record what later phases compare against.

**Files:** None edited. Fill in the Phase 0 inventory at the end of this document.

**Steps:**

1. Run `git status --short -- src scripts`. Record the output. `src` should have no changes. If it has changes, stop and report them to the user. Then run `git status --short` for the whole tree and record that output too. Files that are already changed here, such as `static/renderer.js`, are not part of this plan. Never revert them.
2. Run the verification bar. Record the result of each command. If `npm test` or `npm run build:renderer` fails, record the failing step and its first error in the defect inventory, then stop. Do not start Phase 1 on a red baseline.
3. Record the cycle list that `npm run check:circular` prints. It should be these four:
   - `productionTools` → `gameActions` → … → `envelopeContract` → `callbackVocabularyText` → `orderResponseParsing` → `productionTools`
   - `standingOrders` → … → `envelopeContract` → … → `envelopeOrderRows` → `standingOrders`
   - `openRouterUiHelpers` → `mapToastBody` → `toastInlineMarks` → `unitDrawing` → `mapHelpers` → `worldLeafletMap` → `openRouterUiHelpers`
   - `terrainTooltipStrategicState` → `selection` → … → `controlTooltip` → `terrainTooltipStrategicState`

   If the list differs, record the real list. The real list is the baseline.
4. Confirm that every file this plan edits or relies on exists:

```powershell
$files = @(
  'src/shared/stableHash.ts','src/shared/aiOnlyBattles.ts','src/main/gameActions/fortificationProduction.ts',
  'src/main/tacticalBattle/tacticalMeleeApply.ts','src/main/tacticalBattle/tacticalMovementPlanningCache.ts',
  'src/shared/mapExtent.ts','src/shared/unitFrameBox.ts','src/shared/pathPolylineInterp.ts',
  'src/renderer/map/unitFrameCamera.ts','src/renderer/map/hexGrid.ts',
  'src/shared/seatRoster.ts','src/shared/topBarSides.ts','src/shared/turnLossSections.ts','src/shared/sideLabels.ts',
  'src/shared/standings.ts','src/shared/turnReportLines.ts',
  'src/main/gameActions/airValidation.ts','src/main/gameActions/tacticalHumanAirStrikeValidation.ts',
  'src/main/tacticalBattle/tacticalOpponentOrderValidation.ts','src/main/gameActions/fortificationCombatLedger.ts',
  'src/main/gameActions/strategicOrderValidation.ts','src/main/gameActions/sealift.ts',
  'src/main/tacticalBattle/aiOnlyTacticalBeat.ts','src/main/tacticalBattle/tacticalBattleSession.ts',
  'src/main/tacticalBattle/tacticalCompositeOrdersApply.ts','src/main/tacticalBattle/tacticalMovementApply.ts',
  'src/main/tacticalBattle/tacticalHeadOnContact.ts',
  'src/renderer/rendering/terrainRendering.ts','src/renderer/rendering/fortificationTickDrawing.ts',
  'src/renderer/rendering/tacticalCityOverlays.ts','src/renderer/rendering/inspectionStatusIcons.ts',
  'src/main/openRouter/promptContracts.ts','src/main/openRouter/promptSpec/envelopeContract.ts',
  'src/main/gameDb/gameConfigKv.ts','src/main/gameDb/gameSizeConfig.ts','src/main/gameDb/originBonusConfig.ts',
  'src/main/gameDb/scenarioState.ts','src/main/gameDb/seatApiKeyFlags.ts','src/main/gameDb/aiState.ts',
  'src/main/gameDb/fogState.ts','src/main/gameDb/resetGame.ts',
  'src/main/tacticalBattle/tacticalBattlePersistence.ts','src/main/tacticalBattle/tacticalTransportBaseline.ts',
  'src/main/tacticalBattle/tacticalCallbackStashPersistence.ts','src/main/sightCues/sightCueMemory.ts',
  'src/main/openRouter/openRouter.ts','src/main/openRouter/secretConfig.ts','src/main/gameActions/knockoutConsequences.ts',
  'src/main/gameDb/dbOps.ts','src/main/testSupport/withTempGameDb.ts',
  'src/main/tacticalBattle/tacticalMeleeApply.test.ts','src/main/tacticalBattle/tacticalMovementApply.test.ts',
  'src/main/openRouter/promptSpec/envelopeContract.test.ts','src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts',
  'src/main/gameActions/fortifiedRangedTargetValidation.test.ts','src/main/gameActions/fortificationCombatLedger.test.ts',
  'src/main/gameActions/sealift.test.ts','src/main/tacticalBattle/tacticalEmbarkOrderValidation.test.ts'
)
foreach ($f in $files) { if (Test-Path $f) { '{0}  {1}' -f (Get-Content $f).Count, $f } else { "MISSING  $f" } }
```

If any file is `MISSING`, find it with `rg --files -g '<name>'` and correct the path in this plan before you continue. Record the line counts in the inventory.

**Verification:** `npm test` and `npm run build:renderer` pass, the cycle list is recorded, and the inventory is filled in.

---

## Phase 1 — FNV-1a Hash

**Intent:** Four modules carry their own 32-bit FNV-1a loop. `src/shared/stableHash.ts` already exports `hashStringToUint32(text)`, which computes exactly the same value. Make all four call it.

**Add:** `src/shared/stableHash.test.ts`

**Edit:** `src/shared/stableHash.ts` (comment only), `src/shared/aiOnlyBattles.ts`, `src/main/gameActions/fortificationProduction.ts`, `src/main/tacticalBattle/tacticalMeleeApply.ts`, `src/main/tacticalBattle/tacticalMovementPlanningCache.ts`

**Why it is safe:** Every copy starts at 2166136261 (`0x811c9dc5`), XORs each UTF-16 code unit, multiplies with `Math.imul` by 16777619 (`0x01000193`), and returns `>>> 0`. `tacticalSetMemoTag` starts without `>>> 0`, but 2166136261 is already a non-negative integer, so the result is the same.

**Add tests first.** Create `src/shared/stableHash.test.ts` with these standard FNV-1a vectors:

| Input | Expected |
|-------|----------|
| `''` | `2166136261` |
| `'a'` | `3826002220` |
| `'foobar'` | `3214735720` |
| `'a:x\|b:y'` | `6627761` |

The `\|` in the last row is markdown escaping. The real test string is `a:x|b:y`, seven characters with no backslash.

Run it against the unchanged code. It must pass.

**Edits:**

1. `aiOnlyBattles.ts`:
   - Delete the constants `FNV_OFFSET` (near line 214) and `FNV_PRIME` (near line 224), with their comment blocks.
   - Delete the private function `fnv1a32` (near line 272) and its comment block.
   - At its one call site (near line 377, `const hash = fnv1a32(...)`), call `hashStringToUint32(...)` with the same template string.
   - Import `hashStringToUint32` from `./stableHash`.
2. `fortificationProduction.ts` `fortificationPlacementSeed` (near line 23): keep the `text` template and the `logTrace` line unchanged. Replace the loop and `const seed = hash >>> 0;` with `const seed = hashStringToUint32(text);`. Import from `'../../shared/stableHash'`. Keep the existing comment, which already says "The unsigned FNV-1a hash of …".
3. `tacticalMeleeApply.ts` `tacticalSubUnitLayoutSeed32` (near line 28): keep the signature and comment. The body becomes:

   ```ts
   return hashStringToUint32(
     [...subUnits]
       .map((u) => `${u.id}:${u.h3Index}`)
       .sort()
       .join('|')
   );
   ```

4. `tacticalMovementPlanningCache.ts` `tacticalSetMemoTag` (near line 232): keep the `'F'` early return. Replace the nested loop with one hash of the set's members joined with no separator, in set iteration order:

   ```ts
   return `S${tacticalSet.size}:${hashStringToUint32([...tacticalSet].join(''))}`;
   ```

   This equals the old loop, which hashed every character of every member in order with nothing between members.

5. `stableHash.ts`: widen the `When to use:` line of `hashStringToUint32`'s comment so it also covers the random AI-only battle pick, fortification placement seeds, and plan memo tags. Do not change the function body.

**Doc check:** Run `rg -n "fnv1a32|FNV_OFFSET|FNV_PRIME" doc`. If anything matches, update the text to name `hashStringToUint32`.

**Verification:** The bar. Also confirm `rg -n "16777619|0x01000193" src` matches only `src/shared/stableHash.ts`.

**If verification fails:** A failing `aiOnlyBattles`, `fortificationProduction`, or tactical test means a call site changed the input string. Compare it with the backup character by character.

---

## Phase 2 — Longitude Alignment and the Web Mercator Limit

**Intent:** Five modules shift a longitude by whole turns until it is within 180° of a reference. Two modules define the Web Mercator latitude limit. Move both into one shared module.

**Add:** `src/shared/webMercator.ts`, `src/shared/webMercator.test.ts`

**Edit:** `src/shared/mapExtent.ts`, `src/shared/unitFrameBox.ts`, `src/shared/pathPolylineInterp.ts`, `src/renderer/map/unitFrameCamera.ts`, `src/renderer/map/hexGrid.ts`

**New module.** `src/shared/webMercator.ts` exports:

```ts
export const WEB_MERCATOR_MAX_ABS_LAT = 85.05112877980659;

export function alignLongitudeToReference(lng: number, refLng: number): number {
  let shifted = lng;
  while (shifted - refLng > 180) shifted -= 360;
  while (refLng - shifted > 180) shifted += 360;
  return shifted;
}
```

Both comparisons are strict `> 180`. Keep them strict. A longitude exactly 180° away stays where it is.

**Add tests first.** `src/shared/webMercator.test.ts` checks `alignLongitudeToReference`:

| `lng` | `refLng` | Expected |
|-------|----------|----------|
| 190 | 0 | -170 |
| -190 | 0 | 170 |
| 180 | 0 | 180 |
| -180 | 0 | -180 |
| 730 | 0 | 10 |
| -175 | 170 | 185 |

It also checks that `WEB_MERCATOR_MAX_ABS_LAT === 85.05112877980659`. Write the new module first, because the tests import it, then run the tests before you touch any caller.

**Edits:**

1. `src/shared/mapExtent.ts`:
   - Delete private `alignTo` (near line 243) and its comment. Call `alignLongitudeToReference` at each former call site.
   - Delete `const MERCATOR_LAT = 85.05112877980659;` (near line 107) and its comment. Replace each use of `MERCATOR_LAT` with `WEB_MERCATOR_MAX_ABS_LAT`.
   - Import both from `./webMercator`.
2. `src/shared/unitFrameBox.ts`: delete private `alignTo` (near line 478). Call `alignLongitudeToReference` instead.
3. `src/shared/pathPolylineInterp.ts`: delete private `alignLngToRef` (near line 10). Call `alignLongitudeToReference` instead. **Do not touch** the single `while (lng > 180) lng -= 360;` normalization near line 73. That is a different operation.
4. `src/renderer/map/unitFrameCamera.ts`: delete private `alignTo` (near line 369). Call `alignLongitudeToReference` instead. **Do not touch** `shiftIntoFrame` (near line 302), which shifts a midpoint by a separate `shift` variable. Leave the existing `WEB_MERCATOR_MAX_ABS_LAT` import from `./hexGrid` alone. Step 5 keeps that export working.
5. `src/renderer/map/hexGrid.ts`:
   - Delete `export const WEB_MERCATOR_MAX_ABS_LAT = 85.05112877980659;` (near line 17) and its comment. Add `import { WEB_MERCATOR_MAX_ABS_LAT, alignLongitudeToReference } from '../../shared/webMercator';` with the other imports, because `clampLatForWebMercatorDisplay` in the same file still uses the constant. Then add `export { WEB_MERCATOR_MAX_ABS_LAT };` where the old constant was. Four other renderer files (`unitFrameCamera.ts`, `tacticalMapView.ts`, `worldLeafletMap.ts`, `mapExtent.ts` under `src/renderer/map`) import the constant from `./hexGrid`, so the name must stay exported there. If lint asks for an orienting comment on the re-export, give it one that names `src/shared/webMercator.ts` as the definition.
   - In `alignLngToReference` (near line 41), keep `const reference = mapExtentReferenceLng() ?? refLng;` and the exported signature. Replace the loop with `return alignLongitudeToReference(lng, reference);`.

**Excluded on purpose:** `src/main/briefing/map/longitudeCircle.ts` wraps a difference into `(-180, 180]` with a single loop and different edge behavior. Leave it alone.

**Doc check:** Run `rg -n "MERCATOR_LAT|alignTo\b|alignLngToRef" doc`. If anything names a removed symbol, update it.

**Verification:** The bar. `src/shared/mapExtent.test.ts`, `src/shared/unitFrameBox.test.ts`, and `src/main/pathPolylineInterp.test.ts` already cover the callers and must pass unchanged.

---

## Phase 3 — Seat-Order Sorts

**Intent:** `src/shared/seatRoster.ts` already exports `sortSeatsByOrder(seats)`. It returns a new array sorted by `seatOrder` ascending. Six shared modules repeat that sort inline.

**Add:** None. `sortSeatsByOrder` keeps its comment, which already states the contract.

**Edit:** `src/shared/topBarSides.ts`, `src/shared/turnLossSections.ts`, `src/shared/sideLabels.ts`, `src/shared/standings.ts`, `src/shared/turnReportLines.ts`

**Why it is safe:** `Array.prototype.sort` is stable. `sortSeatsByOrder` copies its input and then sorts with the same comparator, `left.seatOrder - right.seatOrder`. Sorting a fresh array from `filter` or `map`, or sorting a copy of it, gives the same order. `seatRoster.ts` imports only `seatIds`, so these imports add no cycle.

**Edits.** Replace only these single-key sorts:

| File | Near line | Today | After |
|------|-----------|-------|-------|
| `topBarSides.ts` | 228 | `[...seats].sort((left, right) => left.seatOrder - right.seatOrder)` | `sortSeatsByOrder(seats)` |
| `turnLossSections.ts` | 188–193 (`lossSectionOwnerId`) | `seats.filter((seat) => { … }).sort((left, right) => left.seatOrder - right.seatOrder)` | `sortSeatsByOrder(seats.filter((seat) => { … }))` |
| `sideLabels.ts` | 97–100 | `.filter(...).sort(...)` | `sortSeatsByOrder(<chain>.filter(...))` |
| `standings.ts` | 365 | `input.seats.filter((seat) => seat.place === 1).sort(...)` | `sortSeatsByOrder(input.seats.filter((seat) => seat.place === 1))` |
| `turnReportLines.ts` | 378–380 | `.filter((seat) => nameOf(seat) === name).sort(...)` | `sortSeatsByOrder(<chain>.filter(...))` |
| `turnReportLines.ts` | 487–489 | `.filter((seat) => !used.has(seat.seatId) && …).sort(...)` | `sortSeatsByOrder(<chain>.filter(...))` |

Import `sortSeatsByOrder` from `./seatRoster` in each file.

**Do not touch** multi-key sorts. Examples: `standings.ts` near lines 367 and 428, `topBarStats.ts` near line 388, and `turnLossSections.ts` near line 250. Each of these has a second sort key or a `||` tie-break.

If a call site's element type is rejected by `T extends Pick<SeatRecord, 'seatOrder'>`, leave that site unchanged and record it in the completion log.

**Doc check:** None. No names change.

**Verification:** The bar. Existing tests for standings, side labels, turn reports, and the top bar cover the order.

---

## Phase 4 — Air-Strike Infrastructure Check and Enemy-Fortified Predicate

**Intent:** Three validators repeat the same infrastructure-target check with the same three messages. Two modules repeat "an enemy holds a fortification on this hex".

**Add:** `src/shared/airStrikeInfrastructure.ts`, `src/shared/airStrikeInfrastructure.test.ts`

**Edit:** `src/main/gameActions/airValidation.ts`, `src/main/gameActions/tacticalHumanAirStrikeValidation.ts`, `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts`, `src/main/gameActions/fortificationCombatLedger.ts`, `src/main/gameActions/strategicOrderValidation.ts`

### Part A: Infrastructure Gap Reason

New pure function in `src/shared/airStrikeInfrastructure.ts`:

```ts
export function airStrikeInfrastructureGapReason(
  targetType: AirStrikeTargetType,
  counts: { readonly urbanHexCount: number; readonly airportCount: number; readonly seaportCount: number },
): string | null
```

- `'urban'` with `urbanHexCount <= 0` returns `'Target hex has no urban infrastructure'`.
- `'airport'` with `airportCount <= 0` returns `'Target hex has no airport'`.
- `'seaport'` with `seaportCount <= 0` returns `'Target hex has no seaport'`.
- Every other case, including `'units'`, returns `null`.

Import `AirStrikeTargetType` as a type from `./ipc/ordersTypes`. Copy the three strings exactly.

**Add tests first.** The function is new, so write it and its test together, then run the test before you edit any caller. Cover each of the three failures, one passing case per type (count 1), and `'units'` returning `null`.

**Caller edits.** Each site reads infrastructure once, then runs three `if` checks. Keep the infrastructure read where it is. Replace only the three `if` blocks:

1. `airValidation.ts` near line 89:
   ```ts
   const gap = airStrikeInfrastructureGapReason(targetType, targetInfrastructure);
   if (gap !== null) return { valid: false, reason: gap };
   ```
2. `tacticalHumanAirStrikeValidation.ts` near line 70: same shape, returning `{ success: false, reason: `${label}: ${gap}` }`.
3. `tacticalOpponentOrderValidation.ts` near line 95: same shape, returning `tacticalInvalidResult(gap)`.

### Part B: Enemy-Fortified Predicate

`fortificationCombatLedger.ts` (hook body `isEnemyFortifiedHex`, near line 63) and `strategicOrderValidation.ts` (private `isEnemyFortifiedHex`, near line 242) compute the same thing.

1. In `fortificationCombatLedger.ts`, add an exported function:

   ```ts
   export function isEnemyFortifiedStrategicHex(h3Index: string, attackerPlayer: string): boolean {
     const controller = getHexController(h3Index);
     const fortified = controller !== null
       && controller !== attackerPlayer
       && getStrategicInfrastructureForHex(h3Index).fortifiedCount > 0;
     logTrace('fortificationCombatLedger isEnemyFortifiedStrategicHex', { h3Index, attackerPlayer, controller, fortified });
     return fortified;
   }
   ```

   Keep the `&&` short-circuit order exactly. The infrastructure read must not run when the controller is `null` or is the attacker.
2. The hook keeps its property name `isEnemyFortifiedHex`, because `FortificationCombatHooks` defines that name. Its body becomes `return isEnemyFortifiedStrategicHex(h3Index, attackerPlayer);`.
3. In `strategicOrderValidation.ts`, delete the private `isEnemyFortifiedHex` and its comment. Call `isEnemyFortifiedStrategicHex` from `./fortificationCombatLedger` at each former call site. Remove `getHexController` or `getStrategicInfrastructureForHex` from that file's imports only if lint reports them unused.

**Log change (allowed):** The two old trace labels, `fortificationCombatLedger isEnemyFortifiedHex` and `strategicOrderValidation isEnemyFortifiedHex`, become the single label above. Trace lines are not user-visible. Record this in the completion log.

**Tests:** Part B needs no new test. Existing tests already cover both callers, and they must pass unchanged:
- `src/main/gameActions/fortifiedRangedTargetValidation.test.ts` covers `validateRangedAttack` in `strategicOrderValidation.ts`, the only caller of the private function.
- `src/main/gameActions/fortificationCombatLedger.test.ts` and `src/main/gameActions/fortificationSiege.test.ts` cover the hook.

Run all three before and after the edit.

**Cycle risk:** `fortificationCombatLedger.ts` imports only `../gameDb`, `../fortificationCombat`, a shared type, and `../logger`. If `check:circular` reports a new cycle through `strategicOrderValidation`, revert Part B only and record it.

**Doc check:** Run `rg -n "isEnemyFortifiedHex" doc`. Update any match that names the removed private function.

**Verification:** The bar. `airValidation.test.ts` and `tacticalHumanAirStrikeValidation.test.ts` must pass unchanged.

---

## Phase 5 — Hex Embark Facts

**Intent:** `sealift.ts` `getHexEmbarkContext` (near line 219) and `tacticalOpponentOrderValidation.ts` `canPlayerEmbarkFromTacticalHex` (near line 27) run the same three queries.

**Add:** `src/main/hexEmbarkFacts.ts`, `src/main/hexEmbarkFacts.test.ts`

**Edit:** `src/main/gameActions/sealift.ts`, `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts`

**New module.** `src/main/hexEmbarkFacts.ts` imports `dbGetOne` from `./gameDb` and `logTrace` from `./logger`. It must not import `sealift`. It exports:

```ts
export interface HexEmbarkFacts {
  readonly nativeTerrain: string;
  readonly terrainKind: string | undefined;
  readonly seaportCount: number;
  readonly controllerPlayerId: string | null;
}

export function readHexEmbarkFacts(h3Index: string): HexEmbarkFacts | null
```

The body runs the three queries in this order, with the SQL copied **exactly**:

1. `'SELECT terrain, terrain_kind AS terrainKind FROM hexes WHERE h3_index = ?'`. Return `null` when there is no row.
2. `'SELECT seaport_count AS seaportCount FROM res_s_infrastructure WHERE h3_index = ?'`
3. `'SELECT controller_player_id AS controllerPlayerId FROM res_s_control WHERE h3_index = ?'`

It returns `{ nativeTerrain: terrainRow.terrain, terrainKind: terrainRow.terrainKind ?? undefined, seaportCount: infra?.seaportCount ?? 0, controllerPlayerId: control?.controllerPlayerId ?? null }`. Log `logTrace('readHexEmbarkFacts', { h3Index, found })` once.

Add this one-line constraint to the module comment: it must stay free of `sealift` imports so tactical validation can use it without a cycle. The comment on `canPlayerEmbarkFromTacticalHex` already gives that reason.

**Caller edits:**

1. `getHexEmbarkContext` in `sealift.ts`:
   ```ts
   const facts = readHexEmbarkFacts(h3Index);
   if (!facts) return null;
   const normalizedMovementTerrain = normalizeMovementTerrain({ h3Index, terrain: facts.nativeTerrain, terrainKind: facts.terrainKind });
   return { normalizedMovementTerrain, ...facts };
   ```
   Check that `HexEmbarkContext` has exactly these five fields. If it has more, list the fields explicitly instead of spreading `facts`.
2. `canPlayerEmbarkFromTacticalHex`: keep the `logDebug` line and `const strategic = enclosingStrategicH3Index;`. Replace the three queries with `const facts = readHexEmbarkFacts(strategic); if (!facts) return false;`, then call `canEmbarkAtHex` with `facts.nativeTerrain`, `facts.terrainKind`, `facts.seaportCount > 0`, and `facts.controllerPlayerId === playerId`.

Remove `dbGetOne` from either file's imports only if lint reports it unused.

**Tests.** Add `src/main/hexEmbarkFacts.test.ts`. Use `withTempGameDb` from `src/main/testSupport/withTempGameDb.ts`, which opens a temporary database and seeds a new match, so hexes exist:
- **Happy path:** read one seeded hex with `dbGetOne<{ h3_index: string; terrain: string }>('SELECT h3_index, terrain FROM hexes LIMIT 1')`. Assert that `readHexEmbarkFacts(row.h3_index)` is not `null`, that its `nativeTerrain` equals `row.terrain`, and that its `seaportCount` is a number `>= 0`.
- **Essential failure:** an `h3Index` that is not in `hexes` (for example `'not-a-hex'`) returns `null`.

`src/main/gameActions/sealift.test.ts` and `src/main/tacticalBattle/tacticalEmbarkOrderValidation.test.ts` cover both callers. Run them before and after the edit. They must pass unchanged.

**Doc check:** None. `getHexEmbarkContext` stays private, and no documented name changes.

**Verification:** The bar, with no new cycle.

---

## Phase 6 — Tactical Combat Seed and March Stop

**Intent:** Five places compute the tactical combat seed from the same formula. Three places apply the same march stop to a sub-unit.

**Add:** None. Tests go into existing test files.

**Edit:** `src/main/tacticalBattle/tacticalMeleeApply.ts`, `src/main/tacticalBattle/aiOnlyTacticalBeat.ts`, `src/main/tacticalBattle/tacticalBattleSession.ts`, `src/main/tacticalBattle/tacticalCompositeOrdersApply.ts`, `src/main/tacticalBattle/tacticalMovementApply.ts`, `src/main/tacticalBattle/tacticalHeadOnContact.ts`, `src/main/tacticalBattle/tacticalMeleeApply.test.ts`, `src/main/tacticalBattle/tacticalMovementApply.test.ts`

### Part A: Combat Seed

Add to `tacticalMeleeApply.ts`, next to `tacticalSubUnitLayoutSeed32`:

```ts
export function tacticalCombatSeed(args: {
  readonly gameSeed: number;
  readonly strategicTurnNumber: number;
  readonly tacticalTurnNumber: number;
  readonly layoutSubUnits?: readonly { id: string; h3Index: string }[];
}): number {
  const layout = args.layoutSubUnits === undefined ? 0 : tacticalSubUnitLayoutSeed32(args.layoutSubUnits);
  return (args.gameSeed + args.strategicTurnNumber * 7919 + args.tacticalTurnNumber * 104729 + layout) >>> 0;
}
```

The comment must state that omitting `layoutSubUnits` adds nothing, while an **empty array** adds the hash of the empty string (2166136261). The one caller without a layout term must therefore omit the field, not pass `[]`. Log `tacticalLogQuery('tacticalCombatSeed', { hasLayout: args.layoutSubUnits !== undefined })`.

**Add tests first.** `tacticalCombatSeed` is a new helper. Write it first, add these tests to `tacticalMeleeApply.test.ts`, and run them before you change any caller:
- `{ gameSeed: 1, strategicTurnNumber: 2, tacticalTurnNumber: 3 }` returns `330026`.
- `{ gameSeed: 4294967295, strategicTurnNumber: 1, tacticalTurnNumber: 0 }` returns `7918`. This checks the `>>> 0` wrap.
- `{ gameSeed: 1, strategicTurnNumber: 2, tacticalTurnNumber: 3, layoutSubUnits: [{ id: 'b', h3Index: 'y' }, { id: 'a', h3Index: 'x' }] }` returns `6957787`. This checks that the layout input order does not matter.

**Call sites.** Each site calls `getGameSeed()` where it does today, so the read order stays the same:

| File | Near line | Layout |
|------|-----------|--------|
| `aiOnlyTacticalBeat.ts` | 154 | `layoutSubUnits: current.subUnits` |
| `tacticalBattleSession.ts` | 532 | `layoutSubUnits: cur.subUnits` |
| `tacticalMeleeApply.ts` | 96 (inside `createCombatRng(...)`) | `layoutSubUnits: battle.subUnits` |
| `tacticalCompositeOrdersApply.ts` | 115 | `layoutSubUnits: battle.subUnits` |
| `tacticalCompositeOrdersApply.ts` | 55 | **omit** `layoutSubUnits` |

Example: `const seed = tacticalCombatSeed({ gameSeed: getGameSeed(), strategicTurnNumber: current.strategicTurnNumber, tacticalTurnNumber: current.tacticalTurnNumber, layoutSubUnits: current.subUnits });`

In `tacticalMeleeApply.ts`, `combatNext ?? createCombatRng(...)` must still skip the seed computation when `combatNext` is given. Keep the `??` and put the `tacticalCombatSeed(...)` call inside `createCombatRng(...)`.

Remove the `tacticalSubUnitLayoutSeed32` import from any caller where lint reports it unused.

**Do not touch** `readyStrategicResolutionPipeline.ts` near line 269 (strategic seed, no tactical term) or `resetGame.ts` near line 326 (doctrine draw). They use the same primes for different seeds.

### Part B: March Stop

Add to `tacticalMovementApply.ts`:

```ts
export function withTacticalMarchStop(unit: TacticalSubUnitSnapshot, appliedToH3Index: string): TacticalSubUnitSnapshot {
  const debarkedIndependently =
    (unit.unitType === 'infantry' || unit.unitType === 'armor')
    && !!unit.embarkedOnSubUnitId
    && appliedToH3Index !== unit.h3Index;
  return {
    ...unit,
    h3Index: appliedToH3Index,
    ...(debarkedIndependently ? { embarkedOnSubUnitId: undefined } : {}),
  };
}
```

The comment says that land cargo leaves its carrier only when its own order moves it to a new cell. A unit that does not move keeps `embarkedOnSubUnitId`. It is an exported pure builder, so it logs `tacticalLogQuery('withTacticalMarchStop', { unitId: unit.id, appliedToH3Index, debarkedIndependently })` before returning.

**Call sites** (replace the `debarkedIndependently` block and the object literal with one call):

1. `tacticalMovementApply.ts` `projectTacticalSnapshotAfterOpponentMovementOrders`, near lines 46–54: `sub[idx] = withTacticalMarchStop(u, applied);`
2. `tacticalMovementApply.ts` `projectTacticalSnapshotAfterPlayerMovementOrders`, near lines 91–99: `sub[outcome.idx] = withTacticalMarchStop(unit, applied);`
3. `tacticalHeadOnContact.ts` `tacticalSeatMovers`, near lines 109–117: `sub[outcome.idx] = withTacticalMarchStop(unit, applied);`. Keep `stopByUnitId.set(order.unitId, applied);` after it. Import from `./tacticalMovementApply`.

**Do not touch** `projectTacticalSnapshotAfterHumanMovementOrders` (near line 135). It intentionally writes `{ ...u, h3Index: applied }` without the debark rule.

**Add tests first.** `withTacticalMarchStop` is a new helper. Write it first, add these tests to `tacticalMovementApply.test.ts`, and run them before you change any caller. Build the sub-units the way that file already does:
- Embarked infantry that moves to a new cell gets the new `h3Index` and `embarkedOnSubUnitId === undefined`.
- Embarked infantry whose applied cell equals its current cell keeps `embarkedOnSubUnitId`.

Then switch the call sites. All existing tests in `tacticalHeadOnContact.test.ts` and `tacticalMovementApply.test.ts` must pass unchanged.

**Cycle risk:** `tacticalMovementApply.ts` must not import `tacticalHeadOnContact.ts`. If `check:circular` reports a new cycle, revert Part B only and record it.

**Doc check:** Run `rg -n "7919|104729|tacticalSubUnitLayoutSeed32" doc`. If a document gives the seed formula, add `tacticalCombatSeed` as the symbol it comes from and leave the formula text alone.

**Verification:** The bar. The golden values above pin the seed formula. `aiOnlyTacticalBeat.test.ts`, `tacticalBattleSession.test.ts`, `tacticalCompositeOrdersApply.test.ts`, `tacticalMeleeApply.test.ts`, `tacticalMovementApply.test.ts`, and `tacticalHeadOnContact.test.ts` cover the callers and must pass unchanged. If any of them fails, a call site's inputs changed. Compare it with the backup, and revert that part if you can't find the difference.

---

## Phase 7 — Renderer Hex Projection and Ring Centroid

**Intent:** Four renderer loops project a hex boundary inline instead of calling the existing `projectHexBoundaryToContainerPoints` in `src/renderer/map/terrainView.ts`. Two renderer modules carry the same private `projectedCentroid`.

**Add:** `src/shared/projectedRingCentroid.ts`, `src/shared/projectedRingCentroid.test.ts`

**Edit:** `src/renderer/rendering/terrainRendering.ts`, `src/renderer/rendering/fortificationTickDrawing.ts`, `src/renderer/rendering/tacticalCityOverlays.ts`, `src/renderer/rendering/inspectionStatusIcons.ts`

### Part A: Projection Loops

Each site looks like this:

```ts
const boundary = getHexBoundaryLatLngForLeafletOverlay(<h3>);
const pts = boundary.map(([lat, lng]: [number, number]) => {
  const p = map.latLngToContainerPoint(L.latLng(lat, lng));
  return { x: p.x, y: p.y };
});
```

Replace both statements with `const pts = projectHexBoundaryToContainerPoints(<h3>, map, <leaflet>);`. The helper body is the same three lines.

| File | Near line | `<h3>` | `<leaflet>` |
|------|-----------|--------|-------------|
| `terrainRendering.ts` | 162 | `hx.h3Index` | `L` |
| `terrainRendering.ts` | 343 | `h3Index` | `L` |
| `terrainRendering.ts` | 432 | `hx.h3Index` | `L` |
| `fortificationTickDrawing.ts` | 210 | `hex.h3Index` | `leaflet` (keep the variable name `points`) |

Before each replacement, confirm that `boundary` is not used anywhere else in that block. If it is, leave the site unchanged.

`terrainRendering.ts` already imports `projectHexBoundaryToContainerPoints` from `../map/terrainView` and uses it near lines 281, 395, and 469 with the same `L`. Add the import to `fortificationTickDrawing.ts`. It already imports from `../map/terrainView`, so add the name there. Remove `getHexBoundaryLatLngForLeafletOverlay` from an import only if it becomes unused.

**Type gate:** The renderer type baseline records some errors by `file|code|message`. Changing these sites can swap a `TS18048` entry for a `TS2345` entry that is already in the baseline. `npm run check:renderer-types` decides. If it reports a new entry for a site, revert **that site only** and record it. Never edit the baseline.

### Part B: Ring Centroid

New pure function in `src/shared/projectedRingCentroid.ts`:

```ts
export function projectedRingCentroid(points: readonly { readonly x: number; readonly y: number }[]): { x: number; y: number }
```

It returns the arithmetic mean of the points, summed in order, exactly like both copies. The comment says that callers must pass a non-empty ring, and that an empty ring returns `NaN` coordinates. Both callers already skip empty rings.

**Add tests first:** the unit square `(0,0) (2,0) (2,2) (0,2)` returns `{ x: 1, y: 1 }`, and a single point returns itself.

**Callers:** In `tacticalCityOverlays.ts` (near line 79) and `inspectionStatusIcons.ts` (near line 96), delete the private `projectedCentroid` and its comment. Call `projectedRingCentroid` at each former call site. Import from `'../../shared/projectedRingCentroid'`.

**Doc check:** Run `rg -n "projectedCentroid" doc`. If the doc names the old function, update it.

**Verification:** The bar. Do **not** run `npm start`. It also runs `generated:extract` and rebuilds the native module for Electron, and neither belongs in this plan. Instead, add this checklist to your final report for the user to check by hand in the running app: strategic terrain fills, control borders, airport and seaport glyphs, fortification ticks, tactical city labels, and inspection icons all draw as before.

---

## Phase 8 — Envelope Example Rows

**Intent:** `getFinalJsonOrdersExampleBlock` in `promptContracts.ts` (values near lines 309–319) and `buildRepairSchemaText` in `promptSpec/envelopeContract.ts` (near lines 383–398) spell out the same four example rows.

**Add:** `src/main/openRouter/promptSpec/envelopeExampleRows.ts`

**Edit:** `src/main/openRouter/promptContracts.ts`, `src/main/openRouter/promptSpec/envelopeContract.ts`, `src/main/openRouter/promptSpec/envelopeContract.test.ts`

Do not add to `src/main/openRouter/promptContracts.test.ts`. It is already over 600 lines.

**Add tests first.** Prompt bytes must not change. Add **one** test to `envelopeContract.test.ts`. Match that file's existing style. It already imports `buildRepairSchemaText` from `./envelopeContract`. Also import `getFinalJsonOrdersExampleBlock` from `../promptContracts`. Build both outputs with every strategic field turned on:

- `buildRepairSchemaText({ coordinateMode: 'strategic', includeAirActions: true, includeMissileActions: true, includeMemoryUpdates: true, includeProductionOrders: true, includeStandingOrderActions: true, includeExitBattle: false })`
- `getFinalJsonOrdersExampleBlock({ coordinateMode: 'strategic', includeAirActions: true, includeMissileActions: true, includeMemoryUpdates: true, includeProductionOrders: true, includeStandingOrderActions: true })`

`src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts` already builds both outputs with these same flags. Copy them from its `STRATEGIC_ALL_ON` constant and its `testTaughtExamplesFitSchema` function if any field name differs.

Assert that **both** outputs contain each of these exact substrings:

```text
"missileLaunches":[{"unitId":"a1-m1","targetHexCode":"CK"}]
"callbacks":[{"event":"infrastructure_destroyed","params":{"targetType":"airport","hex":"CD"}}]
"memoryUpdates":[{"action":"write","key":"turn_objectives","tier":"persistent","content":"Close with observed enemies; keep air and naval production moving."}]
"productionOrders":[{"action":"set_build_queue","hex":"CF","unitType":"air","count":1}]
```

Run this test against the unchanged code first. It must pass then, and it must pass unchanged after the edit.

**New module.** `envelopeExampleRows.ts` has no imports. It exports four constants, each with an orienting comment:

```ts
export const EXAMPLE_MISSILE_LAUNCHES = [{ unitId: 'a1-m1', targetHexCode: 'CK' }] as const;
export const EXAMPLE_CALLBACKS = [{ event: 'infrastructure_destroyed', params: { targetType: 'airport', hex: 'CD' } }] as const;
export const EXAMPLE_MEMORY_UPDATES = [
  {
    action: 'write',
    key: 'turn_objectives',
    tier: 'persistent',
    content: 'Close with observed enemies; keep air and naval production moving.',
  },
] as const;
export const EXAMPLE_PRODUCTION_ORDERS = [{ action: 'set_build_queue', hex: 'CF', unitType: 'air', count: 1 }] as const;
```

**Keep the property order exactly as written.** `JSON.stringify` writes keys in insertion order, and the prompt bytes depend on it. The comment for the module says that both the final-JSON example and the repair schema embed these rows, so the two stay in sync.

**Caller edits:**

1. `promptContracts.ts`: in the `values` object, set `missileLaunches: EXAMPLE_MISSILE_LAUNCHES`, `callbacks: EXAMPLE_CALLBACKS`, `memoryUpdates: EXAMPLE_MEMORY_UPDATES`, and `productionOrders: EXAMPLE_PRODUCTION_ORDERS`. Leave every other key and value unchanged, in the same position.
2. `envelopeContract.ts`: in the four matching `else if` branches, assign the same constants. Leave the `airStrikes` and `ferryOrders` branches alone, because their values differ from the other file's.

**Cycle risk:** The new module imports nothing, so it adds no cycle. The two existing `envelopeContract` cycles must stay exactly as recorded.

**Doc check:** `doc/ai-commander-prompts/` describes these prompts. The text does not change. Run `rg -n "missileLaunches.*a1-m1|turn_objectives" doc/ai-commander-prompts`. If a document names the builder that holds the example rows, add `envelopeExampleRows.ts` beside it. Otherwise leave the docs alone.

**Verification:** The bar. Every existing prompt snapshot or substring test must pass unchanged.

---

## Phase 9 — Game Config Row Helpers (Database Modules)

**Intent:** Many modules repeat the same three `game_config` statements inline. Add three small row helpers and switch the database modules to them. Phase 10 switches the rest.

**Add:** `src/main/gameDb/gameConfigRows.ts`, `src/main/gameDb/gameConfigRows.test.ts`

**Edit:** `src/main/gameDb/gameConfigKv.ts`, `src/main/gameDb/gameSizeConfig.ts`, `src/main/gameDb/originBonusConfig.ts`, `src/main/gameDb/scenarioState.ts`, `src/main/gameDb/seatApiKeyFlags.ts`, `src/main/gameDb/aiState.ts`, `src/main/gameDb/fogState.ts`, `src/main/gameDb/resetGame.ts`

### The Helpers

`src/main/gameDb/gameConfigRows.ts` has exactly two imports:
- `logDebug` and `logTrace` from `../logger`.
- A **type-only** import of `DbReadOps` and `DbWriteOps` from `./dbOps`. `dbOps.ts` already defines these ops shapes and imports nothing.

It must **not** import `gameConfigKv.ts`, `../gameDb`, `./dbConnection`, or any other module. It declares no new ops types.

```ts
import type { DbReadOps, DbWriteOps } from './dbOps';

export function selectGameConfigValue(ops: Pick<DbReadOps, 'getOne'>, key: string): string | undefined
export function upsertGameConfigValue(ops: Pick<DbWriteOps, 'run'>, key: string, value: string): void
export function deleteGameConfigRow(ops: Pick<DbWriteOps, 'run'>, key: string): void
```

- `selectGameConfigValue` runs `'SELECT value FROM game_config WHERE key = ?'` with `[key]` and returns `row?.value`, **unchanged**. Do not trim it, default it, or coerce it. Log `logTrace('gameConfigRows selectGameConfigValue', { key, found: row !== undefined })`.
- `upsertGameConfigValue` runs `'INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)'` with `[key, value]`. Log `logDebug('gameConfigRows upsertGameConfigValue', { key, length: value.length })`. **Never log `value`.** Some keys hold API key envelopes.
- `deleteGameConfigRow` runs `'DELETE FROM game_config WHERE key = ?'` with `[key]`. Log `logDebug('gameConfigRows deleteGameConfigRow', { key })`.

These names differ from the private `loadGameConfigValue`, `saveGameConfigValue`, and `deleteGameConfigValue` in `openRouter.ts` on purpose, so Phase 10 can import them without a clash.

`GameConfigKvDbOps`, `GuardedDbOps`, `BasicDbOps`, and the `Pick<...>` parameters these modules already use all satisfy these types. Pass the caller's existing `ops` object. When the caller has bare functions (for example `getOne` and `run` imported from `./dbConnection`), pass `{ getOne }` or `{ run }`.

**Add tests first** (`gameConfigRows.test.ts`, using `withTempGameDb` from `src/main/testSupport/withTempGameDb.ts` with the `{ getOne: dbGetOne }` and `{ run: dbRun }` ops from `../gameDb`):
- Upserting a value and then selecting it returns the value. Upserting the same key again replaces it.
- Selecting a missing key returns `undefined`.
- Deleting a key makes the next select return `undefined`.

### Which Statements to Convert

Convert a statement **only** when its SQL text is exactly one of these three, with `?` placeholders. Template literals with the same text count.

- `SELECT value FROM game_config WHERE key = ?`
- `INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)`
- `DELETE FROM game_config WHERE key = ?`

**Never convert:** statements with a literal key in the SQL (`"DELETE FROM game_config WHERE key = 'tactical_battle_snapshot_json_v1'"`), `LIKE` or `IN` statements, plain `INSERT INTO` (for example in `seedGameSeedIfMissingWithOps`), anything using better-sqlite3 `prepare`, and anything in a test file.

### How to Rewrite a Read

The column is `value TEXT NOT NULL` (`src/main/gameDb/schema.ts`), so a found row always has a string value. Rewrite mechanically and keep every existing check:

| Before | After |
|--------|-------|
| `const row = ops.getOne<{ value: string }>('SELECT …', [k]);` | `const value = selectGameConfigValue(ops, k);` |
| `ops.getOne<…>('SELECT …', [k])?.value` | `selectGameConfigValue(ops, k)` |
| `if (!row) …` | `if (value === undefined) …` |
| `row ? f(row.value) : d` | `value !== undefined ? f(value) : d` |
| `row?.value` | `value` |
| `!row?.value` | `!value` |
| `row?.value === '1'` | `value === '1'` |
| `typeof row?.value !== 'string' \|\| row.value.length === 0` | `typeof value !== 'string' \|\| value.length === 0` |

The `\|\|` in the last row is markdown escaping. The real code is `||`, with no backslashes.

If the local name `value` is already taken in that scope, use `stored`. For example, `seatApiKeyFlags.ts` `readSeatApiKeyFlagMap` already names a loop variable `value`. If a site does not fit one of these rows, leave it unchanged and record it.

**Order matters.** `fogState.ts` near line 494 and `aiState.ts` near line 292 read a key and then delete it. Keep the read before the delete.

### Sites in This Phase

| File | Near lines | Statements |
|------|-----------|------------|
| `gameConfigKv.ts` | 86, 89, 110, 113, 189 | 3 reads, 2 upserts |
| `gameSizeConfig.ts` | 32, 46 | 1 upsert, 1 read |
| `originBonusConfig.ts` | 116–117 and following, 140 | the `upsert` string constant and its `ops.run(upsert, …)` calls; the `valueOf` read |
| `scenarioState.ts` | 54, 68 | 1 read, 1 upsert |
| `seatApiKeyFlags.ts` | 34, 61 | 1 read (name the local `stored`), 1 upsert. This file calls bare `getOne`/`run`; pass `{ getOne }` / `{ run }`. |
| `aiState.ts` | 292, 293, 308, 330 | 2 reads, 1 delete, 1 upsert |
| `fogState.ts` | 152, 440, 465, 494, 495 | 2 reads, 1 upsert, 2 deletes |
| `resetGame.ts` | 444, 445, 447, 451, 453, 454, 487 | 6 upserts, 1 delete |

In `originBonusConfig.ts`, delete the local `const upsert = …` string once every `ops.run(upsert, …)` call has been converted. In `resetGame.ts`, `run` is a local function. Pass `{ run }`.

Existing `logDebug` and `logTrace` lines at these sites stay. The helpers add their own lines underneath.

**Doc check:** None. No documented name changes.

**Verification:** The bar. `rg -n "game_config" src/main/gameDb --glob '!*.test.ts'` should now show only `gameConfigRows.ts`, `schema.ts`, the literal-key, `LIKE`, and plain-`INSERT INTO` statements, and any site you recorded as left unchanged.

**If verification fails:** Most failures come from a `row`-to-`value` rewrite that changed a falsy check. Compare each changed condition with the table above.

---

## Phase 10 — Game Config Row Helpers (Other Modules)

**Intent:** Switch the remaining `game_config` call sites outside `src/main/gameDb/` to the Phase 9 helpers.

**Add:** None.

**Edit:** `src/main/tacticalBattle/tacticalBattlePersistence.ts`, `src/main/tacticalBattle/tacticalTransportBaseline.ts`, `src/main/tacticalBattle/tacticalCallbackStashPersistence.ts`, `src/main/sightCues/sightCueMemory.ts`, `src/main/openRouter/openRouter.ts`, `src/main/openRouter/secretConfig.ts`, `src/main/gameActions/knockoutConsequences.ts`

Use the same conversion rules and rewrite table as Phase 9. Callers that use the global database functions pass `{ getOne: dbGetOne }` or `{ run: dbRun }`. Callers with an `ops` object pass it.

| File | Near lines | Notes |
|------|-----------|-------|
| `tacticalBattlePersistence.ts` | 43, 65, 84 | Keep each `try`, `saveDatabase()`, and `logError` exactly where it is. |
| `tacticalTransportBaseline.ts` | 59, 81, 98, 116 | Line 99 becomes `return !!(value && value.trim().length > 0);`. |
| `tacticalCallbackStashPersistence.ts` | 126, 151, 168, 184 | Each multi-line param array becomes separate arguments: `key` for the reads and the delete, and `key, value` for the upsert. Keep the value expression exactly as written. Keep the `try`/`catch`, `saveDatabase()`, and `isDbReady()` guards exactly where they are. |
| `sightCueMemory.ts` | 27, 61 | `raw == null` stays `raw == null`. |
| `openRouter.ts` | 128, 141, 153 | Keep the three private wrappers and their names. Each body delegates: `return selectGameConfigValue({ getOne: dbGetOne }, key) ?? null;`, `upsertGameConfigValue({ run: dbRun }, key, value);`, `deleteGameConfigRow({ run: dbRun }, key);`. |
| `secretConfig.ts` | 52, 150, 153 | This file imports bare `getOne` and `run` from `../gameDb/dbConnection`, so pass `{ getOne }` and `{ run }`. `readConfigRow` keeps `typeof value === 'string' ? value : null`. The upsert keeps `envelopeJson(value)` as the value argument. Keep the `try`/`catch` and its `logError`. |
| `knockoutConsequences.ts` | 84 | One delete. |

**Do not touch** `src/main/saveGame/*`. Those files use better-sqlite3 `prepare` on a staging database, or a literal `'game_over'` read that belongs with the save rules.

**Secrets:** `secretConfig.ts` and `openRouter.ts` carry API key material. Confirm that no new log line in this phase includes a value argument.

**Doc check:** None.

**Verification:** The bar. `src/main/openRouter/commanderKeyMemory.test.ts`, the tactical persistence tests, `sightCueReadyStage.test.ts`, and `knockoutConsequences.test.ts` must pass unchanged. Then run:

```powershell
rg -n "SELECT value FROM game_config WHERE key = \?|INSERT OR REPLACE INTO game_config \(key, value\) VALUES \(\?, \?\)|DELETE FROM game_config WHERE key = \?" src/main --glob '!*.test.ts'
```

The only expected matches are `gameConfigRows.ts`, `src/main/saveGame/*`, and any site recorded as left unchanged.

---

## Phase 11 — Final Verification and Doc Check

**Intent:** Confirm the whole tree is green, and that `doc/` names no removed symbol.

**Steps:**

1. Run the verification bar one more time, then `npm run verify:modularization`.
2. Confirm `npm run check:circular` prints exactly the Phase 0 cycle list.
3. Run this and resolve every match in a maintained document. Skip the historical documents named in `AGENTS.md`.

   ```powershell
   rg -n "fnv1a32|FNV_OFFSET|FNV_PRIME|MERCATOR_LAT\b|alignLngToRef|\balignTo\b|projectedCentroid|strategicOrderValidation isEnemyFortifiedHex" doc
   ```

4. Confirm that no plan identifier leaked: `rg -n -i "phase [0-9]|\bv9\b|opportunit" src` must show no line added by this plan.
5. Run `git status --short` and compare it with the whole-tree output recorded in Phase 0. Ignore build outputs (`static/renderer.js`, anything under `dist/`) and any file that was already changed at Phase 0. Every other changed or added file must appear in some phase's **Edit** or **Add** list. If one does not, restore it from that phase's backup folder (or delete it, if it was added) and record it in the defect inventory. Never use `git checkout` or `git restore`.
6. Record line counts again for the files in the Phase 0 inventory. Every file must be under 1000 lines, and no file that started under 600 may end over 600.
7. Fill in the completion log, and report to the user. Name each new module, every site left unchanged and why, the merged trace label from Phase 4, the docs updated (or that none needed changes), and the Phase 7 visual checklist for the user to run.

---

## Reliability Checklist

Check each item before you mark a phase complete:

- [ ] Tests came first, as defined in How to Use. Tests of existing code passed against the old code. A new helper's tests passed before any caller changed.
- [ ] Every new function, type, and constant has a full orienting comment that describes behavior, not history.
- [ ] No `src/shared` or `src/renderer` file imports `logger.ts`.
- [ ] No log line includes a `game_config` value.
- [ ] Every user-facing string, SQL string, and prompt string is byte-identical to the backup.
- [ ] `npm run check:circular` shows only the baseline cycles.
- [ ] No baseline file was edited.
- [ ] No commit, push, stash, checkout, or restore was run.

## Success Definition

- All ten groups are consolidated, or each skipped site is recorded with its reason.
- The verification bar and `verify:modularization` pass.
- The new tests pass: `stableHash`, `webMercator`, `airStrikeInfrastructure`, `hexEmbarkFacts`, `projectedRingCentroid`, `gameConfigRows`, plus the additions to the tactical and prompt test files.
- No behavior, prompt, IPC, or save-format change.

## Locked Decisions

- Pure refactors only. The user ruled out user-visible, save-format, IPC, and prompt changes.
- No file splits.
- Characterization tests are added where moved code has none.
- `game_config` helpers wrap only the three plain statements. No JSON reader helper.
- Two duplicated trace lines for the enemy-fortified check merge into one new label. No other log line changes.
- `hexGrid.ts` keeps exporting `WEB_MERCATOR_MAX_ABS_LAT` so the four renderer importers need no edits.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short -- src scripts` | Clean. Whole tree: `M static/renderer.js`, untracked plan file. |
| `npm test` | Passed, exit 0, about 18 minutes. |
| `npm run build:renderer` | Passed. |
| `check:circular` cycle list | The four cycles named in Phase 0, exit 1 as expected. |
| Line counts | Every listed file exists. None missing. |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|
| 11 | `npm run verify:modularization` | `check:circular` exits 1 | Not a new cycle. The four cycles match Phase 0, and `scripts/circular-deps-baseline.json` is empty, so the chained script stops before its test manifest. The manifest was run on its own and passed. No baseline file was edited. |

## Completion Log

| Phase | Result | Sites left unchanged (and why) | Sketch differences | Docs updated |
|-------|--------|-------------------------------|--------------------|--------------|
| 0 | Recorded. `src` and `scripts` were clean. Whole tree: `M static/renderer.js` and this untracked plan. `npm test` exit 0. Renderer build passed. Four cycles, exit 1. | — | — | None |
| 1 | Done. Targeted hash tests passed, then the full bar passed. | The hash body is unchanged. `readyStrategicResolutionPipeline.ts` and the doctrine draw in `resetGame.ts` were not part of this consolidation. | Callers now use `hashStringToUint32`. | None. No doc named the removed hash helpers. |
| 2 | Done. Full bar passed. | `pathPolylineInterp.ts` still normalizes with `while (lng > 180)`. `longitudeCircle.ts` and `shiftIntoFrame` in `unitFrameCamera.ts` were not the same helper. `hexGrid.ts` still re-exports `WEB_MERCATOR_MAX_ABS_LAT`. | Strict `> 180` in both directions, as specified. | None |
| 3 | Done. Full bar passed. | Multi-key sorts in `turnLossSections.ts` and `standings.ts`, and `topBarStats.ts`, are not seat-order-only sorts. | `homesInOrder` sorts the mapped and filtered list. | None |
| 4 | Done. Full bar passed. No new cycle. | The hook property stays `isEnemyFortifiedHex` and delegates. | The two trace labels merged into `fortificationCombatLedger isEnemyFortifiedStrategicHex`. Unused `logTrace` import removed from `strategicOrderValidation.ts`. | None |
| 5 | Done. Full bar passed. | — | `HexEmbarkContext` is the normalized terrain plus the four facts, so the spread matches. | None |
| 6 | Done. Targeted tests passed, then the full bar passed. | The human movement projector still copies the unit and sets `h3Index` only. | Golden seeds and the march-stop cases were added to the existing test files. | None |
| 7 | Done. Renderer typecheck stayed at 38 entries. Centroid test passed. Full bar passed. | `tacticalMapView.ts` and `terrainView.ts` still call `getHexBoundaryLatLngForLeafletOverlay` for other uses. | Three pre-existing `TS18048` "'L' is possibly 'undefined'" entries in `terrainRendering.ts` now resolve against the baseline. No site was reverted. | None |
| 8 | Done. The shared-row test passed. Cycles unchanged. Full bar passed. | `airStrikes` and `ferryOrders` stay inline. The two builders do not share those rows. `promptContracts.test.ts` was not extended. | The characterization test was added with the production edit. Its assertions are the old JSON substrings, and the test passed. | None |
| 9 | Done. Helper tests passed before callers changed. Full bar passed. | Literal-key SQL, `LIKE` and `IN` deletes, plain `INSERT INTO` for `game_seed`, test files, and `aiState.ts` `VALUES (?, '1')` (one placeholder, not two). | Read-before-delete order kept. | None |
| 10 | Done. Persistence, sight-cue, commander-key, and knockout tests passed. Full bar passed. | `src/main/saveGame/*` uses a staging database or a literal `game_over` read. | Private OpenRouter wrappers kept their names and delegate. No new log includes a config value. | None |
| 11 | Full bar passed again (`npm test` exit 0, renderer build passed, cycles unchanged). Line counts: every inventory file is under 1000, and none that started under 600 finished over 600. `fogState.ts` is 592. `openRouter.ts` stayed 614. `sealift.ts` is 857. | Working tree matches the phase add and edit lists, plus the pre-existing `static/renderer.js` change and this plan. | `verify:modularization` stops on the pre-existing cycles. Its manifest passed when run directly. | None |
